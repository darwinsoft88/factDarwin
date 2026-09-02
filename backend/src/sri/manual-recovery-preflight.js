const crypto = require("node:crypto");
const { DOMParser } = require("@xmldom/xmldom");

const XMLDSIG_NAMESPACE = "http://www.w3.org/2000/09/xmldsig#";
const ALLOWED_SEQUENCES = new Set(["000000364", "000000366", "000000367", "000000368", "000000369", "000000370"]);
const EXPLICITLY_REJECTED_SEQUENCES = new Set(["000000363", "000000365", "000000371"]);

async function prevalidateManualRecovery({ sale, companyId, signXml, includeResignedXml = false }) {
  assertEligibleSale(sale, companyId);
  if (typeof signXml !== "function") throw recoveryError("RECOVERY_SIGNER_REQUIRED", "Se requiere una funcion de firma aislada.");

  const originalSignedXml = String(sale.signedXml || "");
  if (!originalSignedXml) throw recoveryError("RECOVERY_SIGNED_XML_MISSING", "La venta no contiene signedXml original.");

  const originalSigningTime = xmlText(originalSignedXml, "SigningTime");
  const unsignedOriginalXml = removeXmlDsigSignature(originalSignedXml);
  const original = fiscalSnapshot(unsignedOriginalXml);
  const resignedXml = await signXml(unsignedOriginalXml, companyId);
  const newSigningTime = xmlText(resignedXml, "SigningTime");
  if (!/-05:00$/.test(newSigningTime)) {
    throw recoveryError("RECOVERY_SIGNING_TIME_NOT_ECUADOR", `La nueva firma no usa -05:00: ${newSigningTime || "(vacio)"}.`);
  }

  const resigned = fiscalSnapshot(removeXmlDsigSignature(resignedXml));
  const differences = compareFiscalTrees(original.tree, resigned.tree);
  const fiscalContentIdentical = differences.length === 0 && original.fingerprint === resigned.fingerprint;

  return {
    sequence: normalizeSequence(sale.sequence),
    originalFingerprint: original.fingerprint,
    resignedFingerprint: resigned.fingerprint,
    originalSigningTime,
    newSigningTime,
    fiscalContentIdentical,
    technicallyEligible: fiscalContentIdentical,
    differences,
    invariants: compareNamedFiscalValues(unsignedOriginalXml, resignedXml),
    note: fiscalContentIdentical
      ? "Prevalidacion apta. El XML re-firmado existe solo en memoria y no fue enviado ni persistido."
      : "RECUPERACION BLOQUEADA: el contenido fiscal cambio.",
    ...(includeResignedXml ? { resignedXml } : {})
  };
}

function assertEligibleSale(sale, companyId) {
  const sequence = normalizeSequence(sale?.sequence);
  if (EXPLICITLY_REJECTED_SEQUENCES.has(sequence)) {
    throw recoveryError("RECOVERY_SEQUENCE_EXPLICITLY_REJECTED", `La factura ${Number(sequence)} esta excluida de esta herramienta.`);
  }
  if (!ALLOWED_SEQUENCES.has(sequence)) {
    throw recoveryError("RECOVERY_SEQUENCE_NOT_ALLOWED", `La factura ${sequence || "(sin secuencia)"} no pertenece al alcance 364, 366-370.`);
  }
  if (!companyId || String(sale?.companyId || sale?.company_id || "") !== String(companyId)) {
    throw recoveryError("RECOVERY_COMPANY_MISMATCH", "La venta no pertenece a la empresa solicitada.");
  }
  if (sale.status !== "ERROR_SRI") {
    throw recoveryError("RECOVERY_STATUS_NOT_ALLOWED", `La factura debe estar ERROR_SRI; estado recibido: ${sale.status || "(vacio)"}.`);
  }
  if (sale.inventoryState !== "REVERSED") {
    throw recoveryError("RECOVERY_INVENTORY_NOT_REVERSED", "La prevalidacion exige inventoryState=REVERSED y nunca modifica inventario.");
  }
  if (!/\b39\b|FIRMA\s+INVALIDA/i.test(String(sale.sriMessage || ""))) {
    throw recoveryError("RECOVERY_REJECTION_NOT_SIGNATURE_39", "No existe evidencia de rechazo codigo 39 por firma invalida.");
  }
}

function removeXmlDsigSignature(xml) {
  const document = parseXml(xml);
  const signatures = [];
  walkElements(document.documentElement, (node) => {
    if (node.localName === "Signature" && node.namespaceURI === XMLDSIG_NAMESPACE) signatures.push(node);
  });
  if (signatures.length !== 1) {
    throw recoveryError("RECOVERY_SIGNATURE_COUNT_INVALID", `Se esperaba exactamente una firma XMLDSig; encontradas: ${signatures.length}.`);
  }
  signatures[0].parentNode.removeChild(signatures[0]);
  return serializeFiscalDocument(document);
}

function fiscalSnapshot(xml) {
  const document = parseXml(xml);
  const tree = canonicalNode(document.documentElement);
  const canonical = JSON.stringify(tree);
  return { tree, canonical, fingerprint: crypto.createHash("sha256").update(canonical).digest("hex") };
}

function canonicalNode(node) {
  const attributes = [];
  for (let index = 0; index < node.attributes.length; index += 1) {
    const attribute = node.attributes.item(index);
    attributes.push([attribute.namespaceURI || "", attribute.localName || attribute.name, attribute.value]);
  }
  attributes.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const children = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) children.push(canonicalNode(child));
    else if ((child.nodeType === 3 || child.nodeType === 4) && child.data.trim() !== "") children.push(["#text", child.data]);
  }
  return [node.namespaceURI || "", node.localName || node.nodeName, attributes, children];
}

function compareFiscalTrees(left, right, path = "/", differences = []) {
  if (JSON.stringify(left) === JSON.stringify(right)) return differences;
  if (!Array.isArray(left) || !Array.isArray(right)) {
    differences.push({ path, original: left, resigned: right });
    return differences;
  }
  const name = String(left[1] || right[1] || "node");
  if (left[0] !== right[0] || left[1] !== right[1]) differences.push({ path, original: left.slice(0, 2), resigned: right.slice(0, 2) });
  if (JSON.stringify(left[2]) !== JSON.stringify(right[2])) differences.push({ path: `${path}${name}/@attributes`, original: left[2], resigned: right[2] });
  const leftChildren = left[3] || [];
  const rightChildren = right[3] || [];
  if (leftChildren.length !== rightChildren.length) differences.push({ path: `${path}${name}`, originalChildren: leftChildren.length, resignedChildren: rightChildren.length });
  for (let index = 0; index < Math.max(leftChildren.length, rightChildren.length); index += 1) {
    if (leftChildren[index] === undefined || rightChildren[index] === undefined) continue;
    if (leftChildren[index][0] === "#text" || rightChildren[index][0] === "#text") {
      if (JSON.stringify(leftChildren[index]) !== JSON.stringify(rightChildren[index])) differences.push({ path: `${path}${name}/text()[${index}]`, original: leftChildren[index], resigned: rightChildren[index] });
    } else compareFiscalTrees(leftChildren[index], rightChildren[index], `${path}${name}[${index}]/`, differences);
  }
  return differences.slice(0, 100);
}

function compareNamedFiscalValues(originalXml, resignedXml) {
  const fields = ["claveAcceso", "fechaEmision", "secuencial", "ruc", "ambiente", "estab", "ptoEmi", "identificacionComprador", "totalSinImpuestos", "importeTotal"];
  return Object.fromEntries(fields.map((field) => {
    const original = xmlText(originalXml, field);
    const resigned = xmlText(resignedXml, field);
    return [field, { original, resigned, identical: original === resigned }];
  }));
}

function parseXml(xml) {
  const errors = [];
  const document = new DOMParser({ errorHandler: { warning() {}, error: (message) => errors.push(message), fatalError: (message) => errors.push(message) } }).parseFromString(String(xml || ""), "text/xml");
  if (!document.documentElement || errors.length || document.getElementsByTagName("parsererror").length) {
    throw recoveryError("RECOVERY_XML_INVALID", `XML invalido: ${errors.join(" | ") || "parsererror"}.`);
  }
  return document;
}

function serializeFiscalDocument(document) {
  function serialize(node) {
    if (node.nodeType === 1) {
      const attrs = [];
      for (let index = 0; index < node.attributes.length; index += 1) {
        const attribute = node.attributes.item(index);
        attrs.push(` ${attribute.name}="${escapeAttribute(attribute.value)}"`);
      }
      const children = [];
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) children.push(serialize(child));
        else if (child.nodeType === 3) children.push(escapeText(child.data));
        else if (child.nodeType === 4) children.push(`<![CDATA[${child.data}]]>`);
      }
      return `<${node.nodeName}${attrs.join("")}>${children.join("")}</${node.nodeName}>`;
    }
    return "";
  }
  return `<?xml version="1.0" encoding="UTF-8"?>${serialize(document.documentElement)}`;
}

function walkElements(node, callback) {
  if (!node) return;
  callback(node);
  for (let child = node.firstChild; child; child = child.nextSibling) if (child.nodeType === 1) walkElements(child, callback);
}

function xmlText(xml, localName) {
  const document = parseXml(xml);
  const nodes = document.getElementsByTagNameNS("*", localName);
  return nodes.length ? String(nodes.item(0).textContent || "").trim() : "";
}

function normalizeSequence(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.padStart(9, "0").slice(-9) : "";
}

function escapeText(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escapeAttribute(value) { return escapeText(value).replace(/"/g, "&quot;"); }
function recoveryError(code, message) { const error = new Error(message); error.code = code; return error; }

module.exports = {
  ALLOWED_SEQUENCES,
  EXPLICITLY_REJECTED_SEQUENCES,
  assertEligibleSale,
  compareFiscalTrees,
  fiscalSnapshot,
  prevalidateManualRecovery,
  removeXmlDsigSignature
};
