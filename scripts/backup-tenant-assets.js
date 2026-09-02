"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");

async function createTenantAssetsBackup(options = {}) {
  const sourceDir = path.resolve(options.sourceDir || path.join(__dirname, "..", "backend", "uploads", "companies"));
  const backupDir = path.resolve(options.backupDir || path.join(__dirname, "..", "backend", "backups", "tenant-assets"));
  const retentionDays = Math.max(1, Number(options.retentionDays || process.env.TENANT_ASSETS_BACKUP_RETENTION_DAYS || 30));
  const minFreeBytes = Math.max(1, Number(options.minFreeBytes || process.env.TENANT_ASSETS_BACKUP_MIN_FREE_BYTES || 268435456));
  const tarCommand = options.tarCommand || process.env.TAR_PATH || "tar";
  await assertDirectory(sourceDir);
  await fsp.mkdir(backupDir, { recursive: true });
  await assertFreeSpace(backupDir, minFreeBytes);
  const releaseLock = await acquireLock(backupDir);
  const stamp = utcStamp(new Date());
  const baseName = `tenant-assets-${stamp}`;
  const temporaryArchive = path.join(backupDir, `${baseName}.tar.gz.partial`);
  const finalArchive = path.join(backupDir, `${baseName}.tar.gz`);
  const temporaryManifest = `${finalArchive}.manifest.json.partial`;
  const finalManifest = `${finalArchive}.manifest.json`;
  const verifyDir = path.join(backupDir, `.verify-${baseName}-${crypto.randomBytes(4).toString("hex")}`);
  try {
    const files = await inventory(sourceDir);
    await run(tarCommand, ["-czf", temporaryArchive, "-C", path.dirname(sourceDir), path.basename(sourceDir)]);
    await fsp.mkdir(verifyDir, { recursive: false });
    await run(tarCommand, ["-xzf", temporaryArchive, "-C", verifyDir]);
    const restoredRoot = path.join(verifyDir, path.basename(sourceDir));
    const restoredFiles = await inventory(restoredRoot);
    assertSameInventory(files, restoredFiles);
    const archiveStats = await fsp.stat(temporaryArchive);
    const manifest = {
      format: "factudarwin-tenant-assets-backup-v2",
      createdAt: new Date().toISOString(),
      sourceLayout: "companies/<company_id>/...",
      archive: path.basename(finalArchive),
      archiveSha256: await sha256File(temporaryArchive),
      sizeBytes: archiveStats.size,
      fileCount: files.length,
      restoreVerified: true,
      files
    };
    await fsp.writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fsp.rename(temporaryArchive, finalArchive);
    await fsp.rename(temporaryManifest, finalManifest);
    await prune(backupDir, retentionDays, new Set([finalArchive, finalManifest]));
    return { ...manifest, archive: finalArchive, manifest: finalManifest };
  } catch (error) {
    await Promise.all([temporaryArchive, temporaryManifest].map((item) => fsp.rm(item, { force: true }).catch(() => {})));
    throw error;
  } finally {
    await fsp.rm(verifyDir, { recursive: true, force: true }).catch(() => {});
    await releaseLock();
  }
}

async function inventory(root) {
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  const result = [];
  async function visit(directory) {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.resolve(directory, entry.name);
      if (!fullPath.startsWith(rootPrefix)) throw new Error(`Activo fuera de la ruta permitida: ${fullPath}`);
      if (entry.isSymbolicLink()) throw new Error(`No se permiten enlaces simbolicos en activos: ${fullPath}`);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile()) {
        const stats = await fsp.stat(fullPath);
        result.push({ path: path.relative(root, fullPath).split(path.sep).join("/"), sizeBytes: stats.size, sha256: await sha256File(fullPath) });
      }
    }
  }
  await visit(root);
  return result;
}

function assertSameInventory(expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("La restauracion de prueba de activos no coincide con el origen.");
}

async function acquireLock(backupDir) {
  const lock = path.join(backupDir, ".tenant-assets-backup.lock");
  let handle;
  try { handle = await fsp.open(lock, "wx"); }
  catch (error) { if (error.code === "EEXIST") throw new Error("Ya hay un respaldo de activos en ejecucion."); throw error; }
  await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  await handle.close();
  return async () => fsp.rm(lock, { force: true }).catch(() => {});
}

async function assertFreeSpace(directory, requiredBytes) {
  if (typeof fsp.statfs !== "function") return;
  const stats = await fsp.statfs(directory);
  const available = Number(stats.bavail) * Number(stats.bsize);
  if (!Number.isFinite(available) || available < requiredBytes) throw new Error(`Espacio insuficiente para activos: ${available} bytes libres.`);
}

async function prune(directory, retentionDays, protectedPaths) {
  const cutoff = Date.now() - retentionDays * 86400000;
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^tenant-assets-.*\.tar\.gz(\.manifest\.json)?$/.test(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (protectedPaths.has(fullPath)) continue;
    const stats = await fsp.stat(fullPath);
    if (stats.mtimeMs < cutoff) await fsp.unlink(fullPath);
  }
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest("hex").toUpperCase();
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => reject(new Error(`No se pudo ejecutar ${command}: ${error.message}`)));
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} termino con codigo ${code}: ${stderr.trim()}`)));
  });
}

async function assertDirectory(directory) {
  const stats = await fsp.stat(directory).catch(() => null);
  if (!stats?.isDirectory()) throw new Error(`No existe la carpeta de activos: ${directory}`);
}

function utcStamp(date) { return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }

if (require.main === module) {
  createTenantAssetsBackup().then((result) => {
    console.log(`Backup de activos verificado: ${result.archive}`);
    console.log(`Archivos: ${result.fileCount}; SHA-256: ${result.archiveSha256}`);
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { assertSameInventory, createTenantAssetsBackup, inventory, utcStamp };
