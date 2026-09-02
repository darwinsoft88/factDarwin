"use strict";
const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { runPostgresBackup } = require("../backend/src/postgres-backup");
const { createTenantAssetsBackup } = require("./backup-tenant-assets");
const { createOffsiteBackup } = require("./create-offsite-backup");
const { businessTimeMetadata } = require("./backup-business-time");

async function runBackupCycle(options = {}, dependencies = {}) {
  const runPostgres = dependencies.runPostgresBackup || runPostgresBackup;
  const runAssets = dependencies.createTenantAssetsBackup || createTenantAssetsBackup;
  const runOffsite = dependencies.createOffsiteBackup || createOffsiteBackup;
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, ".."));
  const destinationRoot = path.resolve(options.destinationRoot || process.env.FACTUDARWIN_LOCAL_OFFSITE_DIR || path.join(rootDir, "backend", "backups", "offsite-staging"));
  const lockDir = path.resolve(options.lockDir || path.join(rootDir, "backend", "backups"));
  const cycleTime = businessTimeMetadata(options.now || new Date());
  const cycleId = options.cycleId || createCycleId(options.now || new Date(), options.randomSuffix);
  const release = await acquireCycleLock(lockDir, cycleId);
  try {
    const postgres = await runPostgres("offsite-cycle");
    if (!postgres?.file) throw new Error("PostgreSQL no devolvio el archivo exacto verificado.");
    const assets = await runAssets(options.assetsOptions || {});
    if (!assets?.archive || !assets?.manifest) throw new Error("El backup de activos no devolvio archivo y manifiesto exactos.");
    const offsite = await runOffsite({ postgresFile: postgres.file, assetsFile: assets.archive, assetsManifest: assets.manifest, destinationRoot, cycleId, timeMetadata: cycleTime });
    return { cycleId, timeMetadata: cycleTime, postgres, assets, offsite };
  } finally { await release(); }
}

function createCycleId(date, randomSuffix = crypto.randomBytes(6).toString("hex")) {
  const suffix = String(randomSuffix);
  if (!/^[a-f0-9]{8,32}$/.test(suffix)) throw new Error("Sufijo aleatorio de ciclo invalido.");
  return `${businessTimeMetadata(date).cyclePrefix}-${suffix}`;
}

async function acquireCycleLock(lockDir, cycleId) {
  await fsp.mkdir(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, ".backup-cycle.lock");
  async function create() {
    const handle = await fsp.open(lockPath, "wx");
    try { await handle.writeFile(JSON.stringify({ pid: process.pid, cycleId, startedAt: new Date().toISOString() })); }
    finally { await handle.close(); }
  }
  try { await create(); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = await readOwner(lockPath);
    if (owner.pid ? processIsRunning(owner.pid) : Date.now() - owner.modifiedAt < 12 * 60 * 60 * 1000) throw new Error("Ya existe un ciclo de backup activo.");
    await fsp.unlink(lockPath);
    await create();
  }
  return async () => {
    const owner = await readOwner(lockPath);
    if (owner.pid === process.pid && owner.cycleId === cycleId) await fsp.rm(lockPath, { force: true });
  };
}

async function readOwner(lockPath) {
  try {
    const [raw, stats] = await Promise.all([fsp.readFile(lockPath, "utf8"), fsp.stat(lockPath)]);
    const parsed = JSON.parse(raw);
    return { ...parsed, pid: Number(parsed.pid || 0), modifiedAt: stats.mtimeMs };
  } catch { const stats = await fsp.stat(lockPath).catch(() => null); return { pid: 0, cycleId: "", modifiedAt: stats?.mtimeMs || Date.now() }; }
}
function processIsRunning(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; } }

if (require.main === module) runBackupCycle().then((result) => {
  console.log(`Ciclo local cifrado OK: ${result.cycleId}`);
  console.log(`Directorio: ${result.offsite.directory}`);
}).catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { acquireCycleLock, createCycleId, runBackupCycle };
