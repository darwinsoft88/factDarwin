"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createOffsiteBackup, sha256File } = require("../../../scripts/create-offsite-backup");
const { acquireCycleLock, createCycleId, runBackupCycle } = require("../../../scripts/run-backup-cycle");
const { businessTimeMetadata } = require("../../../scripts/backup-business-time");
const ECUADOR_INSTANT = new Date("2026-08-31T04:30:00.000Z");
const CYCLE_ID = "EC-20260830-233000-aabbccdd";

test("orquestador transporta exactamente las rutas retornadas y el mismo cycleId", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fd-cycle-flow-"));
  const calls = [];
  try {
    const result = await runBackupCycle({ rootDir: root, lockDir: root, destinationRoot: path.join(root, "out"), now: ECUADOR_INSTANT, cycleId: CYCLE_ID }, {
      runPostgresBackup: async (reason) => { calls.push(["postgres", reason]); return { file: path.join(root, "exact.dump") }; },
      createTenantAssetsBackup: async () => { calls.push(["assets"]); return { archive: path.join(root, "exact.tar.gz"), manifest: path.join(root, "exact.manifest.json") }; },
      createOffsiteBackup: async (input) => { calls.push(["offsite", input]); return { directory: "done" }; }
    });
    assert.equal(calls[2][1].postgresFile, path.join(root, "exact.dump"));
    assert.equal(calls[2][1].assetsFile, path.join(root, "exact.tar.gz"));
    assert.equal(calls[2][1].assetsManifest, path.join(root, "exact.manifest.json"));
    assert.equal(calls[2][1].cycleId, result.cycleId);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("fallo PostgreSQL detiene assets y fallo assets detiene offsite", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fd-cycle-stop-"));
  try {
    let assetsCalled = false;
    await assert.rejects(runBackupCycle({ rootDir: root, lockDir: root }, { runPostgresBackup: async () => { throw new Error("pg"); }, createTenantAssetsBackup: async () => { assetsCalled = true; } }));
    assert.equal(assetsCalled, false);
    let offsiteCalled = false;
    await assert.rejects(runBackupCycle({ rootDir: root, lockDir: root }, { runPostgresBackup: async () => ({ file: "exact.dump" }), createTenantAssetsBackup: async () => { throw new Error("assets"); }, createOffsiteBackup: async () => { offsiteCalled = true; } }));
    assert.equal(offsiteCalled, false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("lock de ciclo impide concurrencia y se libera por propietario", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fd-cycle-lock-"));
  try {
    const release = await acquireCycleLock(root, CYCLE_ID);
    await assert.rejects(acquireCycleLock(root, "EC-20260830-233001-aabbccde"), /ciclo de backup activo/);
    await release();
    const releaseAgain = await acquireCycleLock(root, "EC-20260830-233002-aabbccdf");
    await releaseAgain();
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("offsite cifra exactamente ambos artefactos, verifica y no expone secreto", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fd-offsite-"));
  const pg = path.join(root, "cycle.dump"), assets = path.join(root, "cycle.tar.gz"), assetManifest = `${assets}.manifest.json`, destination = path.join(root, "staging");
  const secret = "s".repeat(48);
  try {
    await fs.writeFile(pg, "postgres exacto"); await fs.writeFile(assets, "assets exactos");
    await fs.writeFile(assetManifest, JSON.stringify({ archive: path.basename(assets), archiveSha256: await sha256File(assets), restoreVerified: true }));
    const result = await createOffsiteBackup({ postgresFile: pg, assetsFile: assets, assetsManifest: assetManifest, destinationRoot: destination, cycleId: CYCLE_ID, timeMetadata: businessTimeMetadata(ECUADOR_INSTANT), secret });
    assert.equal(result.manifest.postgres.sourceName, path.basename(pg));
    assert.equal(result.manifest.assets.sourceName, path.basename(assets));
    assert.equal(result.manifest.postgres.decryptVerified, true);
    assert.equal(result.manifest.assets.restoreVerified, true);
    assert.equal(result.manifest.businessTimeZone, "America/Guayaquil");
    assert.equal(result.manifest.createdAtEcuador, "2026-08-30T23:30:00-05:00");
    assert.equal(result.manifest.createdAtUtc, "2026-08-31T04:30:00.000Z");
    assert.equal(result.manifest.futureRemoteDatePath, "2026/08/30/");
    assert.equal(path.basename(result.directory), `FactuDarwin-${CYCLE_ID}`);
    assert.equal(JSON.stringify(result.manifest).includes(secret), false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("fallo de cifrado limpia solo staging y conserva fuentes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fd-offsite-fail-"));
  const pg = path.join(root, "cycle.dump"), assets = path.join(root, "cycle.tar.gz"), assetManifest = `${assets}.manifest.json`, destination = path.join(root, "staging");
  try {
    await fs.writeFile(pg, "pg"); await fs.writeFile(assets, "assets");
    await fs.writeFile(assetManifest, JSON.stringify({ archive: path.basename(assets), archiveSha256: await sha256File(assets), restoreVerified: true }));
    await assert.rejects(createOffsiteBackup({ postgresFile: pg, assetsFile: assets, assetsManifest: assetManifest, destinationRoot: destination, cycleId: CYCLE_ID, timeMetadata: businessTimeMetadata(ECUADOR_INSTANT), secret: "s".repeat(48), encryptFile: async () => { throw new Error("cipher"); } }));
    assert.equal((await fs.stat(pg)).isFile(), true); assert.equal((await fs.stat(assets)).isFile(), true);
    const entries = await fs.readdir(destination); assert.deepEqual(entries, []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("hora Ecuador y cycleId son independientes de process.env.TZ", () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    const utcHost = businessTimeMetadata(ECUADOR_INSTANT);
    const utcCycle = createCycleId(ECUADOR_INSTANT, "aabbccdd");
    process.env.TZ = "Asia/Tokyo";
    const otherHost = businessTimeMetadata(ECUADOR_INSTANT);
    const otherCycle = createCycleId(ECUADOR_INSTANT, "aabbccdd");
    assert.deepEqual(otherHost, utcHost);
    assert.equal(otherCycle, utcCycle);
    assert.equal(utcHost.createdAtEcuador, "2026-08-30T23:30:00-05:00");
    assert.match(utcHost.createdAtUtc, /Z$/);
    assert.match(utcHost.createdAtEcuador, /-05:00$/);
    assert.equal(utcCycle, CYCLE_ID);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("shell deriva root desde scripts y no contiene /opt hardcodeado ni seleccion por mtime", async () => {
  const shell = await fs.readFile(path.join(__dirname, "..", "..", "..", "scripts", "run-backup-cycle.sh"), "utf8");
  assert.match(shell, /BASH_SOURCE\[0\]/); assert.doesNotMatch(shell, /\/opt\/factudarwin/); assert.match(shell, /run-backup-cycle\.js/);
  const orchestrator = await fs.readFile(path.join(__dirname, "..", "..", "..", "scripts", "run-backup-cycle.js"), "utf8");
  assert.doesNotMatch(orchestrator, /newestFile|readdir.*\.dump|sort\([^)]*modifiedAt/);
});
