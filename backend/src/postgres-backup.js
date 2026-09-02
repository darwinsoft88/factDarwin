const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const config = require("./config");

let lastBackup = null;
let lastRestoreTest = null;
let nextBackupAt = null;
let schedulerTimer = null;
let backupRunning = false;

function getBackupStatus() {
  return {
    enabled: Boolean(config.databaseUrl && config.backups.enabled),
    dir: config.backups.dir,
    time: config.backups.time,
    retentionDays: config.backups.retentionDays,
    lastBackup,
    lastRestoreTest,
    nextBackupAt: nextBackupAt ? nextBackupAt.toISOString() : ""
  };
}

function startBackupScheduler() {
  if (!config.databaseUrl || !config.backups.enabled) return;
  scheduleNextBackup();
}

function stopBackupScheduler() {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  schedulerTimer = null;
  nextBackupAt = null;
}

function scheduleNextBackup() {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  nextBackupAt = calculateNextRun(config.backups.time);
  const delay = Math.max(1000, nextBackupAt.getTime() - Date.now());
  schedulerTimer = setTimeout(async () => {
    try {
      await runPostgresBackup("scheduled");
    } catch (error) {
      console.error("El respaldo PostgreSQL programado fallo:", error.message);
    } finally {
      scheduleNextBackup();
    }
  }, delay);
}

async function runPostgresBackup(reason = "manual") {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL no esta configurado; el respaldo PostgreSQL no aplica.");
  }
  if (backupRunning) {
    throw new Error("Ya hay un respaldo PostgreSQL en ejecucion.");
  }

  backupRunning = true;
  const startedAt = new Date();
  const fileName = `factudarwin-${formatStamp(startedAt)}.dump`;
  const filePath = path.join(config.backups.dir, fileName);
  const temporaryPath = `${filePath}.partial`;
  let releaseProcessLock = null;

  try {
    await fs.mkdir(config.backups.dir, { recursive: true });
    releaseProcessLock = await acquireProcessLock();
    await assertFreeDiskSpace();
    await executePgDump(temporaryPath);
    const restoreTest = await verifyPostgresRestore(temporaryPath);
    await fs.rename(temporaryPath, filePath);
    const stats = await fs.stat(filePath);
    await pruneOldBackups();
    lastBackup = {
      ok: true,
      reason,
      file: filePath,
      sizeBytes: stats.size,
      createdAt: startedAt.toISOString(),
      restoreTest,
      message: "Respaldo PostgreSQL creado correctamente."
    };
    return lastBackup;
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    lastBackup = {
      ok: false,
      reason,
      file: filePath,
      createdAt: startedAt.toISOString(),
      message: error instanceof Error ? error.message : "No se pudo crear el respaldo PostgreSQL."
    };
    throw error;
  } finally {
    if (releaseProcessLock) await releaseProcessLock();
    backupRunning = false;
  }
}

async function acquireProcessLock() {
  const lockPath = path.join(config.backups.dir, ".postgres-backup.lock");
  const create = async () => {
    const handle = await fs.open(lockPath, "wx");
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    await handle.close();
  };
  try {
    await create();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = await readLockOwner(lockPath);
    const recentUnknownOwner = !owner.pid && owner.modifiedAt && Date.now() - owner.modifiedAt < 12 * 60 * 60 * 1000;
    if ((owner.pid && processIsRunning(owner.pid)) || recentUnknownOwner) {
      throw new Error(owner.pid
        ? `Ya hay un respaldo PostgreSQL en ejecucion (PID ${owner.pid}).`
        : "Ya hay un bloqueo reciente de respaldo PostgreSQL; no se eliminara automaticamente.");
    }
    await fs.unlink(lockPath);
    await create();
  }
  return async () => {
    const owner = await readLockOwner(lockPath);
    if (owner.pid === process.pid) await fs.unlink(lockPath).catch(() => {});
  };
}

async function readLockOwner(lockPath) {
  try {
    const [raw, stats] = await Promise.all([fs.readFile(lockPath, "utf8"), fs.stat(lockPath)]);
    const value = JSON.parse(raw);
    return { pid: Number(value.pid || 0), startedAt: value.startedAt || "", modifiedAt: stats.mtimeMs };
  } catch {
    const stats = await fs.stat(lockPath).catch(() => null);
    return { pid: 0, startedAt: "", modifiedAt: stats?.mtimeMs || 0 };
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function assertFreeDiskSpace() {
  if (typeof fs.statfs !== "function") return;
  const stats = await fs.statfs(config.backups.dir);
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  const requiredBytes = Math.max(1, Number(config.backups.minFreeBytes || 536870912));
  if (!Number.isFinite(freeBytes) || freeBytes < requiredBytes) {
    throw new Error(`Espacio insuficiente para el respaldo: libres ${freeBytes} bytes, minimo ${requiredBytes} bytes.`);
  }
}

async function executePgDump(filePath) {
  const databaseUrl = new URL(config.databaseUrl);
  const args = [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    filePath,
    "--dbname",
    sanitizeDatabaseUrlForPgDump(databaseUrl)
  ];

  await new Promise((resolve, reject) => {
    const child = spawn(config.backups.pgDumpPath, args, {
      env: {
        ...process.env,
        PGPASSWORD: decodeURIComponent(databaseUrl.password || "")
      },
      windowsHide: true
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(new Error(`No se pudo ejecutar pg_dump. Configure PG_DUMP_PATH si no esta en PATH. Detalle: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`pg_dump termino con codigo ${code}. ${stderr.trim()}`.trim()));
    });
  });
}

async function verifyPostgresRestore(filePath) {
  const startedAt = new Date();
  const sourceUrl = new URL(config.databaseUrl);
  const maintenanceUrl = maintenanceDatabaseUrl(sourceUrl);
  const databaseName = `factudarwin_restore_${formatStamp(startedAt)}_${Math.random().toString(16).slice(2, 8)}`;
  const restoredUrl = databaseUrlForName(sourceUrl, databaseName);

  try {
    await executePsql(maintenanceUrl, `CREATE DATABASE ${pgIdentifier(databaseName)} TEMPLATE template0`);
    await executePgRestore(filePath, restoredUrl);
    const stdout = await executePsql(
      restoredUrl,
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('saas_companies', 'saas_snapshots', 'sales', 'products', 'inventory_movements')",
      { captureStdout: true }
    );
    const tableCount = Number(String(stdout).trim());
    if (!Number.isFinite(tableCount) || tableCount < 5) {
      throw new Error(`Restauracion incompleta: solo se encontraron ${tableCount} tabla(s) critica(s).`);
    }

    lastRestoreTest = {
      ok: true,
      database: databaseName,
      checkedTables: tableCount,
      createdAt: startedAt.toISOString(),
      message: "Prueba de restauracion PostgreSQL completada correctamente."
    };
    return lastRestoreTest;
  } catch (error) {
    lastRestoreTest = {
      ok: false,
      database: databaseName,
      createdAt: startedAt.toISOString(),
      message: error instanceof Error ? error.message : "No se pudo probar la restauracion PostgreSQL."
    };
    throw error;
  } finally {
    await dropRestoreTestDatabase(maintenanceUrl, databaseName);
  }
}

async function executePgRestore(filePath, databaseUrl) {
  const args = [
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
    "--dbname",
    sanitizeDatabaseUrlForPgDump(databaseUrl),
    filePath
  ];

  await executeCommand(config.backups.pgRestorePath, args, databaseUrl, "pg_restore");
}

async function executePsql(databaseUrl, sql, options = {}) {
  const args = [
    "--dbname",
    sanitizeDatabaseUrlForPgDump(databaseUrl),
    "--no-password",
    "--tuples-only",
    "--no-align",
    "--set",
    "ON_ERROR_STOP=1",
    "--command",
    sql
  ];

  return executeCommand(config.backups.psqlPath, args, databaseUrl, "psql", options);
}

async function executeCommand(command, args, databaseUrl, label, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        PGPASSWORD: decodeURIComponent(databaseUrl.password || "")
      },
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(new Error(`No se pudo ejecutar ${label}. Configure ${toolPathEnvName(label)} si no esta en PATH. Detalle: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(options.captureStdout ? stdout : undefined);
        return;
      }
      reject(new Error(`${label} termino con codigo ${code}. ${stderr.trim()}`.trim()));
    });
  });
}

async function dropRestoreTestDatabase(maintenanceUrl, databaseName) {
  try {
    await executePsql(maintenanceUrl, `DROP DATABASE IF EXISTS ${pgIdentifier(databaseName)} WITH (FORCE)`);
  } catch {
    try {
      await executePsql(maintenanceUrl, `DROP DATABASE IF EXISTS ${pgIdentifier(databaseName)}`);
    } catch {
      // La prueba ya fallo o termino; no ocultamos el resultado principal por una limpieza tardia.
    }
  }
}

function sanitizeDatabaseUrlForPgDump(databaseUrl) {
  const clean = new URL(databaseUrl.toString());
  clean.password = "";
  return clean.toString();
}

function maintenanceDatabaseUrl(databaseUrl) {
  return databaseUrlForName(databaseUrl, "postgres");
}

function databaseUrlForName(databaseUrl, databaseName) {
  const next = new URL(databaseUrl.toString());
  next.pathname = `/${encodeURIComponent(databaseName)}`;
  return next;
}

function pgIdentifier(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

function toolPathEnvName(label) {
  if (label === "pg_restore") return "PG_RESTORE_PATH";
  if (label === "psql") return "PSQL_PATH";
  return "PG_DUMP_PATH";
}

async function pruneOldBackups() {
  const retentionMs = Math.max(1, config.backups.retentionDays) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;
  const entries = await fs.readdir(config.backups.dir, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".dump"))
    .map(async (entry) => {
      const filePath = path.join(config.backups.dir, entry.name);
      const stats = await fs.stat(filePath);
      if (stats.mtime.getTime() < cutoff) {
        await fs.unlink(filePath);
      }
    }));
}

function calculateNextRun(timeText) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeText);
  const hour = match ? Math.min(23, Number(match[1])) : 23;
  const minute = match ? Math.min(59, Number(match[2])) : 30;
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function formatStamp(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");
}

module.exports = {
  getBackupStatus,
  runPostgresBackup,
  startBackupScheduler,
  stopBackupScheduler
};
