"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Writable } = require("node:stream");
const { businessTimeMetadata } = require("./backup-business-time");
const MAGIC = Buffer.from("FDBACKUP1", "ascii");
const SALT_BYTES = 16, IV_BYTES = 12, TAG_BYTES = 16;
const INFO = Buffer.from("factudarwin-offsite-backup-v1", "utf8");

async function createOffsiteBackup(options = {}) {
  const cycleId = validateCycleId(options.cycleId);
  const timeMetadata = options.timeMetadata || businessTimeMetadata(new Date());
  if (!cycleId.startsWith(`${timeMetadata.cyclePrefix}-`)) throw new Error("cycleId no corresponde a createdAtEcuador.");
  const destinationRoot = path.resolve(String(options.destinationRoot || ""));
  if (!options.destinationRoot) throw new Error("Falta el destino local cifrado.");
  const secret = options.secret || loadEncryptionSecret();
  if (typeof secret !== "string" || secret.length < 32) throw new Error("ASSET_ENCRYPTION_SECRET no esta disponible o no cumple la longitud minima.");
  const postgres = await exactFile(options.postgresFile, ".dump");
  const assets = await exactFile(options.assetsFile, [".tar.gz", ".zip"]);
  const assetsManifest = await verifyAssetsManifest(assets, options.assetsManifest);
  const encryptFile = options.encryptFile || encryptAndVerify;
  await fsp.mkdir(destinationRoot, { recursive: true });
  const temporaryDir = path.join(destinationRoot, `.uploading-${cycleId}`);
  const finalDir = path.join(destinationRoot, `FactuDarwin-${cycleId}`);
  await fsp.mkdir(temporaryDir, { recursive: false });
  try {
    const postgresRecord = await encryptFile(postgres, path.join(temporaryDir, `${postgres.name}.fdbackup`), secret);
    const assetsRecord = await encryptFile(assets, path.join(temporaryDir, `${assets.name}.fdbackup`), secret);
    const manifest = {
      format: "factudarwin-offsite-manifest-v2", cycleId,
      businessTimeZone: timeMetadata.businessTimeZone,
      createdAtEcuador: timeMetadata.createdAtEcuador,
      createdAtUtc: timeMetadata.createdAtUtc,
      futureRemoteDatePath: timeMetadata.futureRemoteDatePath,
      encryption: "AES-256-GCM/HKDF-SHA256", keySource: "ASSET_ENCRYPTION_SECRET (no incluido)",
      postgres: postgresRecord, assets: { ...assetsRecord, restoreVerified: assetsManifest.restoreVerified === true },
      files: [postgresRecord, { ...assetsRecord, restoreVerified: true }]
    };
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
    if (serialized.includes(secret)) throw new Error("El manifiesto intento incluir material secreto.");
    await fsp.writeFile(path.join(temporaryDir, "manifest.json"), serialized, { encoding: "utf8", flag: "wx" });
    await fsp.rename(temporaryDir, finalDir);
    return { directory: finalDir, manifest, cycleId };
  } catch (error) {
    await fsp.rm(temporaryDir, { recursive: true, force: true });
    throw error;
  }
}

async function exactFile(filePath, extensions) {
  const accepted = Array.isArray(extensions) ? extensions : [extensions];
  const fullPath = path.resolve(String(filePath || ""));
  if (!filePath || !accepted.some((extension) => fullPath.endsWith(extension))) throw new Error(`Archivo de ciclo invalido; se esperaba ${accepted.join("/")}.`);
  const stats = await fsp.stat(fullPath).catch(() => null);
  if (!stats?.isFile()) throw new Error(`No existe el archivo exacto del ciclo: ${fullPath}`);
  return { fullPath, name: path.basename(fullPath), size: stats.size };
}

async function verifyAssetsManifest(asset, manifestPath) {
  const exactManifestPath = path.resolve(String(manifestPath || ""));
  if (!manifestPath) throw new Error("Falta el manifiesto exacto de activos del ciclo.");
  const manifest = JSON.parse(await fsp.readFile(exactManifestPath, "utf8"));
  if (!manifest.restoreVerified || !manifest.archiveSha256) throw new Error("El manifiesto de activos no acredita restauracion verificada.");
  if (manifest.archive && manifest.archive !== asset.name) throw new Error("El manifiesto de activos pertenece a otro archivo.");
  if (await sha256File(asset.fullPath) !== String(manifest.archiveSha256).toUpperCase()) throw new Error("El SHA-256 del respaldo de activos no coincide con su manifiesto.");
  return manifest;
}

async function encryptAndVerify(source, destination, secret) {
  const salt = crypto.randomBytes(SALT_BYTES), iv = crypto.randomBytes(IV_BYTES);
  const key = Buffer.from(crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), salt, INFO, 32));
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  await fsp.writeFile(destination, Buffer.concat([MAGIC, salt, iv]), { flag: "wx" });
  await pipeline(fs.createReadStream(source.fullPath), cipher, fs.createWriteStream(destination, { flags: "a" }));
  await fsp.appendFile(destination, cipher.getAuthTag());
  const sourceHash = await sha256File(source.fullPath), restored = await verifyEncryptedFile(destination, secret);
  if (restored.sha256 !== sourceHash || restored.sizeBytes !== source.size) throw new Error(`La verificacion de descifrado fallo para ${source.name}`);
  const encryptedStats = await fsp.stat(destination);
  return { sourceName: source.name, sourceSizeBytes: source.size, sourceSha256: sourceHash, encryptedName: path.basename(destination), encryptedSizeBytes: encryptedStats.size, encryptedSha256: await sha256File(destination), decryptVerified: true };
}

async function verifyEncryptedFile(filePath, secret) {
  const handle = await fsp.open(filePath, "r");
  try {
    const stats = await handle.stat(), headerSize = MAGIC.length + SALT_BYTES + IV_BYTES;
    if (stats.size <= headerSize + TAG_BYTES) throw new Error("Respaldo cifrado truncado.");
    const header = Buffer.alloc(headerSize); await handle.read(header, 0, header.length, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Formato de respaldo cifrado invalido.");
    const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_BYTES), iv = header.subarray(MAGIC.length + SALT_BYTES, headerSize);
    const tag = Buffer.alloc(TAG_BYTES); await handle.read(tag, 0, TAG_BYTES, stats.size - TAG_BYTES);
    const key = Buffer.from(crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), salt, INFO, 32));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(tag);
    const hash = crypto.createHash("sha256"); let sizeBytes = 0;
    const sink = new Writable({ write(chunk, _encoding, callback) { hash.update(chunk); sizeBytes += chunk.length; callback(); } });
    await pipeline(fs.createReadStream(filePath, { start: headerSize, end: stats.size - TAG_BYTES - 1 }), decipher, sink);
    return { sha256: hash.digest("hex").toUpperCase(), sizeBytes };
  } finally { await handle.close(); }
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(filePath), new Writable({ write(chunk, _encoding, callback) { hash.update(chunk); callback(); } }));
  return hash.digest("hex").toUpperCase();
}
function validateCycleId(value) { const id = String(value || ""); if (!/^EC-\d{8}-\d{6}-[a-f0-9]{8,32}$/.test(id)) throw new Error("cycleId invalido."); return id; }
function loadEncryptionSecret() { return require(path.join(__dirname, "..", "backend", "src", "config")).assetEncryptionSecret; }
if (require.main === module) { console.error("Use run-backup-cycle.js; el flujo oficial exige rutas exactas."); process.exitCode = 1; }
module.exports = { createOffsiteBackup, encryptAndVerify, sha256File, validateCycleId, verifyAssetsManifest, verifyEncryptedFile };
