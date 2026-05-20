const fs = require("node:fs");
const forge = require("node-forge");
const config = require("../config");

function loadP12Credentials() {
  if (!config.certPassword) {
    throw new Error("Falta SRI_CERT_PASSWORD en backend/.env");
  }

  if (!fs.existsSync(config.certPath)) {
    throw new Error(`No se encontro la firma .p12 en ${config.certPath}`);
  }

  const p12Buffer = fs.readFileSync(config.certPath);
  const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, config.certPassword);

  const keyBag = findFirstBag(p12, forge.pki.oids.pkcs8ShroudedKeyBag) || findFirstBag(p12, forge.pki.oids.keyBag);
  const certBag = findFirstBag(p12, forge.pki.oids.certBag);

  if (!keyBag?.key) {
    throw new Error("No se pudo leer la clave privada del archivo .p12. Revise la contrasena.");
  }

  if (!certBag?.cert) {
    throw new Error("No se pudo leer el certificado publico del archivo .p12.");
  }

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  const certificatePem = forge.pki.certificateToPem(certBag.cert);
  const certificateBody = certificatePem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\r?\n|\r/g, "");

  return { privateKeyPem, certificatePem, certificateBody };
}

function findFirstBag(p12, oid) {
  const bags = p12.getBags({ bagType: oid })[oid];
  return bags && bags.length > 0 ? bags[0] : null;
}

module.exports = { loadP12Credentials };
