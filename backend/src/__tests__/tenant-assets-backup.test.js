"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { assertSameInventory, createTenantAssetsBackup, inventory } = require("../../../scripts/backup-tenant-assets");

test("inventario es determinista y detecta contenido restaurado distinto", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fd-assets-inventory-"));
  try {
    await fs.mkdir(path.join(root, "company-a"));
    await fs.writeFile(path.join(root, "company-a", "logo.png"), "logo");
    const first = await inventory(root);
    const second = await inventory(root);
    assert.deepEqual(second, first);
    assert.throws(() => assertSameInventory(first, [{ ...first[0], sha256: "BAD" }]));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("crea tar.gz, manifiesto y verifica una restauracion real", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fd-assets-backup-"));
  const source = path.join(root, "companies");
  const destination = path.join(root, "backups");
  try {
    await fs.mkdir(path.join(source, "company-a"), { recursive: true });
    await fs.writeFile(path.join(source, "company-a", "firma.p12.enc"), "encrypted-test-data");
    const result = await createTenantAssetsBackup({ sourceDir: source, backupDir: destination, minFreeBytes: 1 });
    assert.equal(result.restoreVerified, true);
    assert.equal(result.fileCount, 1);
    assert.equal((await fs.stat(result.archive)).isFile(), true);
    const manifest = JSON.parse(await fs.readFile(result.manifest, "utf8"));
    assert.equal(manifest.archiveSha256, result.archiveSha256);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("incluye originales, miniaturas y metadata de productos en el respaldo de assets", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fd-product-assets-backup-"));
  const source = path.join(root, "companies");
  const destination = path.join(root, "backups");
  try {
    const productDir = path.join(source, "company-a", "products", "product-1");
    await fs.mkdir(productDir, { recursive: true });
    await fs.writeFile(path.join(productDir, "image.webp"), "main");
    await fs.writeFile(path.join(productDir, "thumbnail.webp"), "thumb");
    await fs.writeFile(path.join(productDir, "image.meta.json"), "{}");
    const result = await createTenantAssetsBackup({ sourceDir: source, backupDir: destination, minFreeBytes: 1 });
    assert.equal(result.restoreVerified, true);
    assert.equal(result.fileCount, 3);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
