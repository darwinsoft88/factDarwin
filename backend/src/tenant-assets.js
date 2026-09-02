const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const forge = require("node-forge");
const sharp = require("sharp");
const config = require("./config");

const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_CERT_BYTES = 3 * 1024 * 1024;
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PRODUCT_IMAGE_PIXELS = 24 * 1000 * 1000;
const ENCRYPTION_PREFIX = "FDENC1";
const ALLOWED_LOGO_TYPES = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"]
]);

async function saveTenantProductImage(companyId, productId, payload) {
  assertCompanyId(companyId);
  assertProductId(productId);
  const mimeType = String(payload?.mimeType || "").toLowerCase();
  if (!ALLOWED_LOGO_TYPES.has(mimeType)) badRequest("Imagen invalida. Use PNG, JPG o WebP.");
  const source = decodeBase64File(payload?.base64, MAX_PRODUCT_IMAGE_BYTES, "La imagen del producto supera 5 MB.");
  let image;
  let metadata;
  try {
    image = sharp(source, { failOn: "error", limitInputPixels: MAX_PRODUCT_IMAGE_PIXELS }).rotate();
    metadata = await image.metadata();
  } catch {
    badRequest("El archivo no contiene una imagen valida.");
  }
  if (!metadata.width || !metadata.height) badRequest("No se pudo leer la imagen del producto.");
  const main = await image.clone().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const thumbnail = await image.clone().resize({ width: 192, height: 192, fit: "cover", position: "centre", withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
  const version = crypto.createHash("sha256").update(main).update(thumbnail).digest("hex").slice(0, 16);
  const updatedAt = new Date().toISOString();
  const dir = productImageDir(companyId, productId);
  fs.mkdirSync(dir, { recursive: true });
  const versionsDir = path.join(dir, "versions");
  const finalVersionDir = path.join(versionsDir, version);
  const temporaryVersionDir = path.join(versionsDir, `.tmp-${version}-${crypto.randomBytes(6).toString("hex")}`);
  const temporaryMeta = path.join(dir, `.image.meta.tmp-${crypto.randomBytes(6).toString("hex")}`);
  const finalMeta = path.join(dir, "image.meta.json");
  try {
    fs.mkdirSync(versionsDir, { recursive: true });
    if (!fs.existsSync(finalVersionDir)) {
      fs.mkdirSync(temporaryVersionDir);
      fs.writeFileSync(path.join(temporaryVersionDir, "image.webp"), main, { flag: "wx" });
      fs.writeFileSync(path.join(temporaryVersionDir, "thumbnail.webp"), thumbnail, { flag: "wx" });
      fs.renameSync(temporaryVersionDir, finalVersionDir);
    }
    fs.writeFileSync(temporaryMeta, JSON.stringify({ version, updatedAt, mimeType: "image/webp", sourceMimeType: mimeType, width: metadata.width, height: metadata.height }), { flag: "wx" });
    fs.renameSync(temporaryMeta, finalMeta);
  } catch (error) {
    fs.rmSync(temporaryVersionDir, { recursive: true, force: true });
    fs.rmSync(temporaryMeta, { force: true });
    throw error;
  }
  return { ok: true, imageVersion: version, imageUpdatedAt: updatedAt, imageMimeType: "image/webp", size: main.length, thumbnailSize: thumbnail.length };
}

function getTenantProductImage(companyId, productId, variant = "image", requestedVersion = "") {
  assertCompanyId(companyId);
  assertProductId(productId);
  const dir = productImageDir(companyId, productId);
  let version = String(requestedVersion || "");
  if (!version) {
    try { version = String(JSON.parse(fs.readFileSync(path.join(dir, "image.meta.json"), "utf8")).version || ""); } catch { return null; }
  }
  if (!/^[a-f0-9]{16}$/.test(version)) return null;
  const fileName = variant === "thumbnail" ? "thumbnail.webp" : "image.webp";
  const filePath = path.join(dir, "versions", version, fileName);
  if (!fs.existsSync(filePath)) return null;
  return { filePath, mimeType: "image/webp", buffer: () => fs.readFileSync(filePath) };
}

function removeTenantProductImage(companyId, productId) {
  assertCompanyId(companyId);
  assertProductId(productId);
  const metaPath = path.join(productImageDir(companyId, productId), "image.meta.json");
  if (!fs.existsSync(metaPath)) return { ok: true, removed: false };
  fs.rmSync(metaPath, { force: true });
  return { ok: true, removed: true };
}

function saveTenantLogo(companyId, payload) {
  assertCompanyId(companyId);
  const mimeType = String(payload?.mimeType || "").toLowerCase();
  const extension = ALLOWED_LOGO_TYPES.get(mimeType);
  if (!extension) badRequest("Logo invalido. Use PNG, JPG o WebP.");
  const buffer = decodeBase64File(payload?.base64, MAX_LOGO_BYTES, "El logo supera 1 MB.");
  const dir = tenantDir(companyId);
  fs.mkdirSync(dir, { recursive: true });
  removeExistingLogo(dir);
  const fileName = `logo${extension}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return {
    ok: true,
    logoUrl: `/api/company/logo?companyId=${encodeURIComponent(companyId)}`,
    mimeType,
    size: buffer.length
  };
}

function getTenantLogo(companyId) {
  assertCompanyId(companyId);
  const dir = tenantDir(companyId);
  for (const extension of ALLOWED_LOGO_TYPES.values()) {
    const filePath = path.join(dir, `logo${extension}`);
    if (fs.existsSync(filePath)) {
      return {
        filePath,
        mimeType: extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg"
      };
    }
  }
  return null;
}

function saveTenantCertificate(companyId, payload) {
  assertCompanyId(companyId);
  const password = String(payload?.password || "");
  if (!password) badRequest("Ingrese la contrasena del certificado.");
  const buffer = decodeBase64File(payload?.base64, MAX_CERT_BYTES, "El certificado supera 3 MB.");
  const certificateValidity = inspectP12(buffer, password);
  if (certificateValidity.expirationStatus === "expired") {
    badRequest("El certificado .p12 esta vencido. Suba una firma electronica vigente.");
  }

  const dir = tenantDir(companyId);
  fs.mkdirSync(dir, { recursive: true });
  const encryptedP12 = encryptBuffer(buffer);
  const encryptedPassword = encryptText(password);
  fs.writeFileSync(path.join(dir, "firma.p12.enc"), encryptedP12);
  fs.writeFileSync(path.join(dir, "firma.meta.json"), JSON.stringify({
    fileName: sanitizeFileName(payload?.fileName || "firma.p12"),
    uploadedAt: new Date().toISOString(),
    size: buffer.length,
    validFrom: certificateValidity.validFrom,
    expiresAt: certificateValidity.expiresAt,
    password: encryptedPassword.toString("base64")
  }, null, 2));
  return { ok: true, uploadedAt: new Date().toISOString(), size: buffer.length };
}

function getTenantCertificate(companyId) {
  if (!companyId) return null;
  assertCompanyId(companyId);
  const dir = tenantDir(companyId);
  const certPath = path.join(dir, "firma.p12.enc");
  const metaPath = path.join(dir, "firma.meta.json");
  if (!fs.existsSync(certPath) || !fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  return {
    p12Buffer: decryptBuffer(fs.readFileSync(certPath)),
    password: decryptText(Buffer.from(String(meta.password || ""), "base64")),
    uploadedAt: meta.uploadedAt || "",
    fileName: meta.fileName || "firma.p12",
    size: Number(meta.size || 0)
  };
}

function getTenantAssetStatus(companyId) {
  assertCompanyId(companyId);
  const logo = getTenantLogo(companyId);
  const cert = getTenantCertificateStatus(companyId);
  return {
    ok: true,
    logo: logo ? { configured: true, url: `/api/company/logo?companyId=${encodeURIComponent(companyId)}` } : { configured: false },
    certificate: cert
  };
}

function removeTenantAssets(companyId) {
  assertCompanyId(companyId);
  const dir = tenantDir(companyId);
  if (!fs.existsSync(dir)) return { removed: false };
  fs.rmSync(dir, { recursive: true, force: true });
  return { removed: true };
}

function getTenantCertificateStatus(companyId) {
  const dir = tenantDir(companyId);
  const certPath = path.join(dir, "firma.p12.enc");
  const metaPath = path.join(dir, "firma.meta.json");
  if (!fs.existsSync(certPath) || !fs.existsSync(metaPath)) return { configured: false };

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const p12Buffer = decryptBuffer(fs.readFileSync(certPath));
    const password = decryptText(Buffer.from(String(meta.password || ""), "base64"));
    const validity = inspectP12(p12Buffer, password);
    return {
      configured: true,
      uploadedAt: meta.uploadedAt || "",
      fileName: meta.fileName || "firma.p12",
      size: Number(meta.size || 0),
      ...validity
    };
  } catch {
    return {
      configured: false,
      needsUpload: true,
      error: "El certificado guardado no se puede leer con la llave actual. Configure ASSET_ENCRYPTION_SECRET anterior o vuelva a subir el .p12."
    };
  }
}

function inspectP12(buffer, password, now = new Date()) {
  try {
    const p12Asn1 = forge.asn1.fromDer(buffer.toString("binary"));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
    const keyBag = findFirstBag(p12, forge.pki.oids.pkcs8ShroudedKeyBag) || findFirstBag(p12, forge.pki.oids.keyBag);
    const certBag = findFirstBag(p12, forge.pki.oids.certBag);
    if (!keyBag?.key || !certBag?.cert) badRequest("El .p12 no contiene clave privada y certificado validos.");
    return certificateValidity(certBag.cert, now);
  } catch (error) {
    if (error.statusCode) throw error;
    badRequest("No se pudo leer el .p12. Revise el archivo y la contrasena.");
  }
}

function certificateValidity(certificate, now = new Date()) {
  const validFromDate = new Date(certificate?.validity?.notBefore);
  const expiresAtDate = new Date(certificate?.validity?.notAfter);
  if (!Number.isFinite(validFromDate.getTime()) || !Number.isFinite(expiresAtDate.getTime())) {
    badRequest("El certificado .p12 no contiene fechas de vigencia validas.");
  }
  const remainingMs = expiresAtDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / 86400000));
  const expirationStatus = now < validFromDate
    ? "not_yet_valid"
    : remainingMs <= 0
      ? "expired"
      : daysRemaining <= 7
        ? "critical"
        : daysRemaining <= 30
          ? "warning"
          : "valid";
  return {
    validFrom: validFromDate.toISOString(),
    expiresAt: expiresAtDate.toISOString(),
    daysRemaining,
    expirationStatus
  };
}

function findFirstBag(p12, oid) {
  const bags = p12.getBags({ bagType: oid })[oid];
  return bags && bags.length > 0 ? bags[0] : null;
}

function decodeBase64File(value, maxBytes, maxMessage) {
  const clean = String(value || "").replace(/^data:[^;]+;base64,/, "");
  if (!clean) badRequest("Archivo requerido.");
  const buffer = Buffer.from(clean, "base64");
  if (!buffer.length) badRequest("Archivo vacio o invalido.");
  if (buffer.length > maxBytes) badRequest(maxMessage);
  return buffer;
}

function tenantDir(companyId) {
  return path.join(config.uploadsDir, "companies", companyId);
}

function productImageDir(companyId, productId) {
  return path.join(tenantDir(companyId), "products", productId);
}

function removeExistingLogo(dir) {
  for (const extension of ALLOWED_LOGO_TYPES.values()) {
    const filePath = path.join(dir, `logo${extension}`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

function encryptBuffer(buffer) {
  const key = encryptionKey(config.assetEncryptionSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(ENCRYPTION_PREFIX), iv, tag, encrypted]);
}

function decryptBuffer(buffer) {
  const prefix = buffer.subarray(0, 6).toString();
  if (prefix !== ENCRYPTION_PREFIX) throw new Error("Archivo cifrado invalido.");
  const errors = [];
  for (const secret of encryptionSecrets()) {
    try {
      return decryptBufferWithSecret(buffer, secret);
    } catch (error) {
      errors.push(error);
    }
  }
  const error = new Error("No se pudo descifrar el archivo. Revise ASSET_ENCRYPTION_SECRET o vuelva a subir el .p12.");
  error.cause = errors[0];
  throw error;
}

function decryptBufferWithSecret(buffer, secret) {
  const iv = buffer.subarray(6, 18);
  const tag = buffer.subarray(18, 34);
  const encrypted = buffer.subarray(34);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function encryptText(value) {
  return encryptBuffer(Buffer.from(String(value), "utf8"));
}

function decryptText(buffer) {
  return decryptBuffer(buffer).toString("utf8");
}

function encryptionSecrets() {
  return Array.from(new Set([config.assetEncryptionSecret, config.jwtSecret].filter(Boolean)));
}

function encryptionKey(secret) {
  return crypto.createHash("sha256").update(`tenant-assets:${secret}`).digest();
}

function assertCompanyId(companyId) {
  if (!/^[a-z0-9_-]+$/i.test(String(companyId || ""))) badRequest("Empresa invalida.");
}

function assertProductId(productId) {
  if (!/^[a-z0-9:_-]+$/i.test(String(productId || ""))) badRequest("Producto invalido.");
}

function sanitizeFileName(value) {
  return String(value || "archivo").replace(/[^\w.\- ]+/g, "").slice(0, 80);
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

module.exports = {
  certificateValidity,
  getTenantAssetStatus,
  getTenantCertificate,
  getTenantLogo,
  getTenantProductImage,
  removeTenantAssets,
  removeTenantProductImage,
  saveTenantCertificate,
  saveTenantLogo,
  saveTenantProductImage
};
