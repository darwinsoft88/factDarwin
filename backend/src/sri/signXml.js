const fs = require("node:fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const { signXml } = require("osodreamer-sri-xml-signer");
const config = require("../config");
const { getTenantCertificate } = require("../tenant-assets");

async function signXmlWithP12(xml, companyId = "") {
  const normalizedXml = ensureComprobanteId(xml);
  const { p12Buffer, password } = resolveCertificateCredentials(companyId);
  const xmlBuffer = Buffer.from(normalizedXml, "utf8");

  try {
    return await signXml({
      p12Buffer,
      password,
      xmlBuffer
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const friendly = new Error(`No se pudo firmar el comprobante. Revise certificado .p12 y contrasena${companyId ? " de la empresa" : " SRI_CERT_PASSWORD"}. Detalle: ${message}`);
    friendly.statusCode = 400;
    throw friendly;
  }
}

function resolveCertificateCredentials(companyId, tenantCertificateLoader = getTenantCertificate) {
  const normalizedCompanyId = String(companyId || "").trim();
  const tenantCertificate = tenantCertificateLoader(normalizedCompanyId);

  if (normalizedCompanyId && !tenantCertificate) {
    const error = new Error("No se encontro el certificado .p12 de la empresa autenticada. Verifique que el usuario pertenezca a la empresa correcta y que esa empresa tenga una firma configurada.");
    error.statusCode = 400;
    error.code = "TENANT_CERTIFICATE_NOT_FOUND";
    throw error;
  }

  if (tenantCertificate) {
    return {
      p12Buffer: tenantCertificate.p12Buffer,
      password: tenantCertificate.password,
      source: "tenant"
    };
  }

  validateCertificateConfig();
  return {
    p12Buffer: fs.readFileSync(config.certPath),
    password: config.certPassword,
    source: "legacy-global"
  };
}

function validateCertificateConfig() {
  if (!config.certPath || !fs.existsSync(config.certPath)) {
    const error = new Error(`No se encontro el certificado .p12 en ${config.certPath}. Revise SRI_CERT_PATH en backend/.env.`);
    error.statusCode = 400;
    throw error;
  }

  if (!config.certPassword) {
    const error = new Error("La contrasena del certificado esta vacia. Configure SRI_CERT_PASSWORD en backend/.env.");
    error.statusCode = 400;
    throw error;
  }
}

function ensureComprobanteId(xml) {
  const document = new DOMParser().parseFromString(xml, "text/xml");
  const root = document.documentElement;

  if (!root) {
    throw new Error("El XML no tiene elemento raiz.");
  }

  if (!["factura", "guiaRemision", "notaCredito"].includes(root.tagName)) {
    throw new Error(`El XML debe ser una factura, nota de credito o guia de remision. Raiz recibida: ${root.tagName}`);
  }

  root.setAttribute("id", root.getAttribute("id") || "comprobante");
  root.setAttribute("version", root.getAttribute("version") || "1.1.0");

  return new XMLSerializer().serializeToString(document);
}

module.exports = { resolveCertificateCredentials, signXmlWithP12 };
