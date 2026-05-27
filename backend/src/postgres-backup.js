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

function scheduleNextBackup() {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  nextBackupAt = calculateNextRun(config.backups.time);
  const delay = Math.max(1000, nextBackupAt.getTime() - Date.now());
  schedulerTimer = setTimeout(async () => {
    await runPostgresBackup("scheduled");
    scheduleNextBackup();
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

  try {
    await fs.mkdir(config.backups.dir, { recursive: true });
    await executePgDump(filePath);
    const restoreTest = await verifyPostgresRestore(filePath);
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
    lastBackup = {
      ok: false,
      reason,
      file: filePath,
      createdAt: startedAt.toISOString(),
      message: error instanceof Error ? error.message : "No se pudo crear el respaldo PostgreSQL."
    };
    throw error;
  } finally {
    backupRunning = false;
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
  startBackupScheduler
};
