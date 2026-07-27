function buildRidePdf({ documentType, document, client, issuer, sourceDocument }) {
  const missing = requiredRideData({ documentType, document, client, issuer, sourceDocument });
  if (missing.length) {
    const error = new Error(`Faltan datos para generar el RIDE: ${missing.join(", ")}.`);
    error.code = "RIDE_DATA_INCOMPLETE";
    error.retryable = false;
    throw error;
  }

  const lines = documentType === "nota_credito"
    ? creditNoteLines(document, client, issuer, sourceDocument)
    : invoiceLines(document, client, issuer);
  return renderTextPdf(lines);
}

function requiredRideData({ documentType, document = {}, client = {}, issuer = {}, sourceDocument }) {
  const missing = [];
  if (!issuer.businessName) missing.push("empresa");
  if (!issuer.ruc) missing.push("RUC");
  if (!issuer.address) missing.push("direccion del emisor");
  if (!document.accessKey) missing.push("clave de acceso");
  if (!document.authorizationNumber) missing.push("numero de autorizacion");
  if (!document.authorizationDate) missing.push("fecha de autorizacion");
  if (!document.sequence) missing.push("secuencial");
  if (!document.createdAt) missing.push("fecha de emision");
  if (!client.name) missing.push("cliente");
  if (!client.identification) missing.push("identificacion del cliente");
  if (!Array.isArray(document.items) || document.items.length === 0) missing.push("detalle");
  if (documentType === "nota_credito") {
    if (!document.supportDocumentNumber && !sourceDocument) missing.push("documento modificado");
    if (!document.creditReason) missing.push("motivo");
  }
  return missing;
}

function invoiceLines(document, client, issuer) {
  return [
    issuer.businessName,
    `RUC: ${issuer.ruc}`,
    `Direccion matriz: ${issuer.address}`,
    `FACTURA: ${documentNumber(document, issuer)}`,
    `Ambiente: ${environmentLabel(document, issuer)} | Emision: NORMAL`,
    `Clave de acceso: ${document.accessKey}`,
    `Autorizacion: ${document.authorizationNumber}`,
    `Fecha autorizacion: ${document.authorizationDate}`,
    "",
    `Cliente: ${client.name}`,
    `Identificacion: ${client.identification}`,
    `Fecha emision: ${formatDate(document.createdAt)}`,
    `Direccion: ${client.address || ""}`,
    "",
    ...detailLines(document),
    "",
    ...totalsLines(document),
    ...paymentLines(document),
    ...additionalInfoLines(document)
  ];
}

function creditNoteLines(document, client, issuer, sourceDocument) {
  const supportNumber = document.supportDocumentNumber || (sourceDocument ? documentNumber(sourceDocument, issuer) : "");
  const supportDate = document.supportIssueDate || sourceDocument?.createdAt || "";
  return [
    issuer.businessName,
    `RUC: ${issuer.ruc}`,
    `Direccion matriz: ${issuer.address}`,
    `NOTA DE CREDITO: ${documentNumber(document, issuer)}`,
    `Ambiente: ${environmentLabel(document, issuer)} | Emision: NORMAL`,
    `Clave de acceso: ${document.accessKey}`,
    `Autorizacion: ${document.authorizationNumber}`,
    `Fecha autorizacion: ${document.authorizationDate}`,
    "",
    `Cliente: ${client.name}`,
    `Identificacion: ${client.identification}`,
    `Fecha emision: ${formatDate(document.createdAt)}`,
    `Direccion: ${client.address || ""}`,
    "",
    `Documento modificado: ${supportNumber}`,
    `Fecha comprobante modificado: ${formatDate(supportDate)}`,
    `Motivo: ${document.creditReason}`,
    "",
    ...detailLines(document),
    "",
    ...totalsLines(document),
    ...additionalInfoLines(document)
  ];
}

function detailLines(document) {
  return [
    "DETALLE",
    ...document.items.flatMap((item, index) => [
      `${index + 1}. ${item.code || ""} - ${item.name || ""}`,
      `   Cantidad: ${number(item.quantity)}  P.Unit: ${money(item.unitPrice)}  Descuento: ${money(lineDiscount(item))}  IVA: ${money(lineTax(item))}  Total: ${money(lineTotal(item))}`
    ])
  ];
}

function totalsLines(document) {
  return [
    `Subtotal sin impuestos: ${money(document.subtotal)}`,
    `IVA: ${money(document.tax)}`,
    `TOTAL: ${money(document.total)}`
  ];
}

function paymentLines(document) {
  const payments = document.paymentCondition === "credito"
    ? [{ paymentMethod: "20", amount: document.total }]
    : Array.isArray(document.payments) && document.payments.length
      ? document.payments
      : [{ paymentMethod: document.paymentMethod || "", amount: document.total }];
  return [
    "",
    "FORMAS DE PAGO",
    ...payments.map((payment) => `${payment.paymentMethod || "No especificada"}: ${money(payment.amount)}`)
  ];
}

function additionalInfoLines(document) {
  const fields = Array.isArray(document.additionalInfo) ? document.additionalInfo : [];
  if (!fields.length) return [];
  return [
    "",
    "INFORMACION ADICIONAL",
    ...fields.map((field) => `${field.name || field.label || ""}: ${field.value || ""}`)
  ];
}

function renderTextPdf(lines) {
  const safeLines = lines.flatMap((line) => wrapLine(ascii(line), 92));
  const pageLines = [];
  for (let index = 0; index < safeLines.length; index += 48) {
    pageLines.push(safeLines.slice(index, index + 48));
  }
  if (!pageLines.length) pageLines.push(["RIDE"]);

  const fontId = 3;
  const objects = new Map();
  const pageIds = pageLines.map((_page, index) => 4 + index * 2);
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  objects.set(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  pageLines.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = [
      "BT",
      "/F1 9 Tf",
      "42 800 Td",
      "14 TL",
      ...page.map((line) => `(${escapePdfText(line)}) Tj T*`),
      "ET"
    ].join("\n");
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`);
  });

  const maxId = Math.max(...objects.keys());
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "binary");
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}

function documentNumber(document, issuer) {
  return [
    document.establishment || issuer.establishment,
    document.emissionPoint || issuer.emissionPoint,
    document.sequence
  ].filter(Boolean).join("-");
}

function environmentLabel(document, issuer) {
  const value = String(document.sriEnvironment || issuer.environment || "");
  return value === "1" || value === "PRUEBAS" ? "PRUEBAS" : "PRODUCCION";
}

function lineDiscount(item) {
  if (Number.isFinite(Number(item.discountAmount))) return Number(item.discountAmount);
  return number(item.quantity) * number(item.unitPrice) * number(item.discount) / 100;
}

function lineTax(item) {
  return (number(item.quantity) * number(item.unitPrice) - lineDiscount(item)) * number(item.ivaRate);
}

function lineTotal(item) {
  return number(item.quantity) * number(item.unitPrice) - lineDiscount(item) + lineTax(item);
}

function number(value) {
  return Number(value || 0);
}

function money(value) {
  return number(value).toFixed(2);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function ascii(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
}

function wrapLine(value, width) {
  if (!value) return [""];
  const lines = [];
  let remaining = value;
  while (remaining.length > width) {
    let splitAt = remaining.lastIndexOf(" ", width);
    if (splitAt < Math.floor(width / 2)) splitAt = width;
    lines.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  lines.push(remaining);
  return lines;
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

module.exports = {
  buildRidePdf,
  renderTextPdf,
  requiredRideData
};
