const PDFDocument = require("pdfkit");

const PAGE = { margin: 32, width: 595.28, height: 841.89 };
const COLORS = { text: "#111111", muted: "#4b5563", line: "#111111", fill: "#f3f4f6" };

async function buildRidePdf({ documentType, document, client, issuer, sourceDocument }) {
  const missing = requiredRideData({ documentType, document, client, issuer, sourceDocument });
  if (missing.length) {
    const error = new Error(`Faltan datos para generar el RIDE: ${missing.join(", ")}.`);
    error.code = "RIDE_DATA_INCOMPLETE";
    error.retryable = false;
    throw error;
  }

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin },
    info: {
      Title: `RIDE ${documentType === "nota_credito" ? "Nota de credito" : "Factura"} ${documentNumber(document, issuer)}`,
      Author: issuer.businessName,
      Subject: "Representacion impresa de documento electronico autorizado"
    },
    bufferPages: true
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
  });

  renderRide(doc, { documentType, document, client, issuer, sourceDocument });
  addPageNumbers(doc);
  doc.end();
  return completed;
}

function renderRide(doc, context) {
  const { documentType, document, client, issuer, sourceDocument } = context;
  const left = PAGE.margin;
  const contentWidth = PAGE.width - PAGE.margin * 2;
  const gap = 10;
  const columnWidth = (contentWidth - gap) / 2;
  const topY = PAGE.margin;

  drawIssuerPanel(doc, issuer, left, topY, columnWidth, 174);
  drawAuthorizationPanel(doc, documentType, document, issuer, left + columnWidth + gap, topY, columnWidth, 174);

  let y = topY + 184;
  y = drawBuyerPanel(doc, document, client, left, y, contentWidth);
  if (documentType === "nota_credito") {
    y = drawCreditNoteReference(doc, document, issuer, sourceDocument, left, y + 6, contentWidth);
  }
  y = drawDetails(doc, context, left, y + 7, contentWidth);
  drawBottomPanels(doc, context, left, y + 8, contentWidth);
}

function drawIssuerPanel(doc, issuer, x, y, width, height) {
  const logoHeight = 50;
  const infoY = y + logoHeight + 5;
  const infoHeight = height - logoHeight - 5;
  if (issuer.logoPath) {
    try {
      doc.image(issuer.logoPath, x + 10, y, {
        fit: [width - 20, logoHeight],
        align: "center",
        valign: "center"
      });
    } catch {
      drawLogoPlaceholder(doc, x, y, width, logoHeight);
    }
  } else {
    drawLogoPlaceholder(doc, x, y, width, logoHeight);
  }

  box(doc, x, infoY, width, infoHeight, 0);
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLORS.text)
    .text(clean(issuer.businessName).toUpperCase(), x + 10, infoY + 9, { width: width - 20 });
  if (issuer.tradeName) {
    doc.font("Helvetica-Bold").fontSize(8)
      .text(clean(issuer.tradeName), x + 10, doc.y + 2, { width: width - 20 });
  }
  let rowY = doc.y + 7;
  rowY = labelValue(doc, "DIR. MATRIZ:", issuer.address, x + 10, rowY, width - 20);
  rowY = labelValue(doc, "DIR. SUCURSAL:", issuer.establishmentAddress || issuer.address, x + 10, rowY + 5, width - 20);
  rowY = labelValue(doc, "TIPO CONTRIBUYENTE:", issuer.taxpayerType === "natural" ? "PERSONA NATURAL" : "PERSONA JURIDICA", x + 10, rowY + 5, width - 20);
  if (issuer.specialTaxpayer === "SI" && issuer.specialTaxpayerResolution) {
    rowY = labelValue(doc, "CONTRIBUYENTE ESPECIAL:", issuer.specialTaxpayerResolution, x + 10, rowY + 5, width - 20);
  }
  if (issuer.retentionAgent === "SI" && issuer.retentionAgentResolution) {
    rowY = labelValue(doc, "AGENTE DE RETENCION:", issuer.retentionAgentResolution, x + 10, rowY + 5, width - 20);
  }
  doc.font("Helvetica-Bold").fontSize(7.4)
    .text(`OBLIGADO A LLEVAR CONTABILIDAD: ${clean(issuer.accountingRequired || "NO")}`, x + 10, infoY + infoHeight - 16, { width: width - 20 });
}

function drawLogoPlaceholder(doc, x, y, width, height) {
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.muted)
    .text("NO TIENE LOGO", x + 10, y + height / 2 - 4, { width: width - 20, align: "center" });
}

function drawAuthorizationPanel(doc, documentType, document, issuer, x, y, width, height) {
  box(doc, x, y, width, height, 7);
  doc.font("Helvetica-Bold").fontSize(13)
    .text(`R.U.C.:  ${clean(issuer.ruc)}`, x + 12, y + 12, { width: width - 24 });
  doc.font("Helvetica-Bold").fontSize(15)
    .text(documentType === "nota_credito" ? "NOTA DE CREDITO" : "FACTURA", x + 12, y + 36, { width: width - 24 });
  doc.font("Helvetica-Bold").fontSize(8).text("No.", x + 12, y + 62);
  doc.font("Helvetica").fontSize(9.5).text(documentNumber(document, issuer), x + 35, y + 61);
  doc.font("Helvetica-Bold").fontSize(7.4).text("NUMERO DE AUTORIZACION", x + 12, y + 81);
  doc.font("Helvetica").fontSize(7.2)
    .text(clean(document.authorizationNumber || document.accessKey), x + 12, y + 93, { width: width - 24 });
  doc.font("Helvetica-Bold").fontSize(7.2).text("FECHA Y HORA DE AUTORIZACION:", x + 12, y + 112);
  doc.font("Helvetica").fontSize(7.2)
    .text(formatDateTime(document.authorizationDate), x + 145, y + 112, { width: width - 157 });
  doc.font("Helvetica-Bold").fontSize(7.2).text("AMBIENTE:", x + 12, y + 127);
  doc.font("Helvetica").fontSize(7.2).text(environmentLabel(document, issuer), x + 62, y + 127);
  doc.font("Helvetica-Bold").fontSize(7.2).text("EMISION:", x + 145, y + 127);
  doc.font("Helvetica").fontSize(7.2).text("NORMAL", x + 187, y + 127);
  doc.font("Helvetica-Bold").fontSize(7.2).text("CLAVE DE ACCESO", x + 12, y + 141);
  drawCode128(doc, document.accessKey, x + 12, y + 151, width - 24, 12);
  doc.font("Helvetica").fontSize(5.8)
    .text(groupAccessKey(document.accessKey), x + 12, y + 165, { width: width - 24, align: "center" });
}

function drawBuyerPanel(doc, document, client, x, y, width) {
  const height = 55;
  box(doc, x, y, width, height, 0);
  const first = width * 0.62;
  labelInline(doc, "Razon Social / Nombres:", client.name, x + 8, y + 8, first - 12);
  labelInline(doc, "Identificacion:", client.identification, x + first, y + 8, width - first - 8);
  labelInline(doc, "Fecha Emision:", formatDate(document.createdAt), x + 8, y + 25, 155);
  labelInline(doc, "Direccion:", client.address || "", x + 170, y + 25, width - 178);
  labelInline(doc, "Correo:", client.email || "", x + 8, y + 41, width - 16);
  return y + height;
}

function drawCreditNoteReference(doc, document, issuer, sourceDocument, x, y, width) {
  const height = 52;
  box(doc, x, y, width, height, 0);
  const support = document.supportDocumentNumber || documentNumber(sourceDocument || {}, issuer);
  labelInline(doc, "COMPROBANTE QUE SE MODIFICA:", support, x + 8, y + 8, width * 0.56);
  labelInline(doc, "FECHA:", formatDate(document.supportIssueDate || sourceDocument?.createdAt), x + width * 0.58, y + 8, width * 0.4);
  labelInline(doc, "RAZON DE MODIFICACION:", document.creditReason || "", x + 8, y + 27, width - 16);
  return y + height;
}

function drawDetails(doc, context, x, y, width) {
  const columns = [
    { label: "Cod.\nPrincipal", width: 75, align: "center" },
    { label: "Cantidad", width: 44, align: "right" },
    { label: "Descripcion", width: width - 75 - 44 - 62 - 54 - 62, align: "left" },
    { label: "Precio\nUnitario", width: 62, align: "right" },
    { label: "Descuento", width: 54, align: "right" },
    { label: "Precio Total", width: 62, align: "right" }
  ];

  const headerHeight = 26;
  const minimumRowHeight = 22;
  let currentY = y;

  drawTableHeader(doc, columns, x, currentY, headerHeight);
  currentY += headerHeight;

  context.document.items.forEach((item) => {
    const values = [
      clean(item.code),
      quantity(item.quantity),
      clean(item.name),
      money(item.unitPrice),
      money(lineDiscount(item)),
      money(lineSubtotal(item))
    ];

    /*
     * Calculamos la altura necesaria para cada celda.
     * De esta forma, tanto el código como la descripción pueden
     * continuar en una segunda línea sin cortarse.
     */
    const cellHeights = values.map((value, index) => {
      const column = columns[index];

      doc.font("Helvetica").fontSize(index === 0 ? 6.5 : 7);

      return doc.heightOfString(value, {
        width: column.width - 6,
        align: column.align,
        lineGap: 1
      });
    });

    /*
     * La fila utiliza la altura de la celda que necesite más espacio.
     * Se agregan 10 puntos para los márgenes superior e inferior.
     */
    const rowHeight = Math.max(
      minimumRowHeight,
      Math.ceil(Math.max(...cellHeights) + 10)
    );

    /*
     * Si la fila no cabe completa en la página actual,
     * se genera una nueva página antes de dibujarla.
     */
    if (currentY + rowHeight > PAGE.height - PAGE.margin - 155) {
      doc.addPage();

      currentY = PAGE.margin;

      drawContinuationTitle(doc, context, x, currentY, width);
      currentY += 28;

      drawTableHeader(doc, columns, x, currentY, headerHeight);
      currentY += headerHeight;
    }

    drawTableRow(doc, columns, values, x, currentY, rowHeight);
    currentY += rowHeight;
  });

  return currentY;
}

function drawBottomPanels(doc, context, x, y, width) {
  const required = 235;
  let currentY = y;
  if (currentY + required > PAGE.height - PAGE.margin) {
    doc.addPage();
    currentY = PAGE.margin;
    drawContinuationTitle(doc, context, x, currentY, width);
    currentY += 32;
  }
  const leftWidth = width * 0.58;
  const gap = 8;
  const rightX = x + leftWidth + gap;
  const rightWidth = width - leftWidth - gap;

  drawAdditionalInfo(doc, context, x, currentY, leftWidth);
  const totalsHeight = drawTotals(doc, context.documentType, context.document, rightX, currentY, rightWidth);
  drawPayments(doc, context.document, x, currentY + 82, leftWidth);
  doc.font("Helvetica").fontSize(6.8).fillColor(COLORS.muted)
    .text(
      "Representacion impresa de documento electronico autorizado. La clave de acceso corresponde al numero de autorizacion.",
      x,
      currentY + Math.max(140, totalsHeight + 8),
      { width }
    );
}

function drawAdditionalInfo(doc, context, x, y, width) {
  box(doc, x, y, width, 74, 4);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.text)
    .text("INFORMACION ADICIONAL", x + 7, y + 7);
  const fields = [
    ["Telefono", context.client.phone],
    ["Email", context.client.email],
    ...(Array.isArray(context.document.additionalInfo)
      ? context.document.additionalInfo.map((field) => [field.name || field.label, field.value])
      : [])
  ].filter((field) => clean(field[1]));
  if (!fields.length) {
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted).text("Sin informacion adicional", x + 7, y + 23);
    return;
  }
  doc.font("Helvetica").fontSize(7).fillColor(COLORS.text)
    .text(fields.slice(0, 6).map(([name, value]) => `${clean(name)}: ${clean(value)}`).join("\n"), x + 7, y + 22, { width: width - 14, lineGap: 2 });
}

function drawPayments(doc, document, x, y, width) {
  const payments = paymentsFor(document);
  const rowHeight = 16;
  const height = rowHeight * (payments.length + 1);
  box(doc, x, y, width, height, 0);
  doc.rect(x, y, width, rowHeight).fill(COLORS.fill).stroke(COLORS.line);
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(7)
    .text("FORMA DE PAGO", x + 5, y + 5, { width: width - 75 });
  doc.text("VALOR", x + width - 68, y + 5, { width: 62, align: "right" });
  payments.forEach((payment, index) => {
    const rowY = y + rowHeight * (index + 1);
    doc.moveTo(x, rowY).lineTo(x + width, rowY).stroke(COLORS.line);
    doc.font("Helvetica").fontSize(7)
      .text(paymentLabel(payment.paymentMethod), x + 5, rowY + 5, { width: width - 75 });
    doc.text(money(payment.amount), x + width - 68, rowY + 5, { width: 62, align: "right" });
  });
}
/*********************************************************************
//funcion para dibujar los totales de la factura o nota de crédito
***********************************************************************/
function drawTotals(doc, documentType, document, x, y, width) {
  const rates = taxSubtotals(document);
  const positiveRates = rates.filter((rate) => rate.rate > 0);
  const zeroRateBase = rates.find((rate) => rate.rate === 0)?.base || 0;
  const rows = [
    ...positiveRates.map((rate) => [`SUBTOTAL ${rate.label}`, money(rate.base)]),
    ["SUBTOTAL 0%", money(zeroRateBase)],
    ["SUBTOTAL NO OBJETO DE IVA", money(document.nonTaxableSubtotal)],
    ["SUBTOTAL EXENTO DE IVA", money(document.exemptSubtotal)],
    ["SUBTOTAL SIN IMPUESTOS", money(document.subtotal)],
    ["TOTAL DESCUENTO", money(totalDiscount(document))],
    ["ICE", money(document.ice)],
    [positiveRates.length === 1 ? `IVA ${positiveRates[0].label}` : "IVA", money(document.tax)],
    ["IRBPNR", money(document.irbpnr)],
    ["PROPINA", money(document.tip)],
    [documentType === "nota_credito" ? "VALOR MODIFICACION" : "VALOR TOTAL", money(document.total)]
  ];
  const rowHeight = 17;
  box(doc, x, y, width, rows.length * rowHeight, 0);
  rows.forEach(([label, value], index) => {
    const rowY = y + index * rowHeight;
    if (index > 0) doc.moveTo(x, rowY).lineTo(x + width, rowY).stroke(COLORS.line);
    const bold = index === rows.length - 1;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 8.2 : 7)
      .fillColor(COLORS.text).text(label, x + 5, rowY + 5, { width: width - 67 });
    doc.text(value, x + width - 60, rowY + 5, { width: 55, align: "right" });
  });
  return rows.length * rowHeight;
}

function drawContinuationTitle(doc, context, x, y, width) {
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.text)
    .text(`${context.documentType === "nota_credito" ? "NOTA DE CREDITO" : "FACTURA"} ${documentNumber(context.document, context.issuer)} - CONTINUACION`, x, y, { width });
}

function drawTableHeader(doc, columns, x, y, height) {
  let currentX = x;
  columns.forEach((column) => {
    doc.rect(currentX, y, column.width, height).fillAndStroke(COLORS.fill, COLORS.line);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(6.8)
      .text(column.label, currentX + 3, y + 8, { width: column.width - 6, align: "center" });
    currentX += column.width;
  });
}

function drawTableRow(doc, columns, values, x, y, height) {
  let currentX = x;

  columns.forEach((column, index) => {
    doc.rect(currentX, y, column.width, height).stroke(COLORS.line);

    /*
     * El código usa una fuente ligeramente más pequeña
     * para que códigos largos entren con mayor facilidad.
     */
    const fontSize = index === 0 ? 6.5 : 7;

    const options = {
      width: column.width - 6,
      align: column.align,
      lineGap: 1
    };

    // Solo las columnas numéricas permanecen en una sola línea
    if (index >= 3) {
      options.lineBreak = false;
    }

    doc
      .fillColor(COLORS.text)
      .font("Helvetica")
      .fontSize(fontSize)
      .text(
        values[index],
        currentX + 3,
        y + 6.5,
        options
      );

    currentX += column.width;
  });
}

function addPageNumbers(doc) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.font("Helvetica").fontSize(6.5).fillColor(COLORS.muted)
      .text(`Pagina ${index + 1} de ${range.count}`, PAGE.margin, PAGE.height - PAGE.margin - 9, {
        width: PAGE.width - PAGE.margin * 2,
        align: "right",
        lineBreak: false
      });
  }
}

function labelValue(doc, label, value, x, y, width) {
  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.text);
  const labelWidth = Math.min(Math.max(doc.widthOfString(label) + 7, 54), width * 0.46);
  doc.text(label, x, y, {
    width: labelWidth,
    lineBreak: false
  });
  doc.font("Helvetica").fontSize(7).text(clean(value), x + labelWidth, y, {
    width: width - labelWidth,
    lineBreak: false,
    ellipsis: true
  });
  const textHeight = doc.heightOfString(clean(value), {
    width: width - labelWidth
});

return y + Math.max(10, textHeight + 2);
}

function labelInline(doc, label, value, x, y, width) {
  doc.font("Helvetica-Bold").fontSize(7.2).fillColor(COLORS.text);
  const labelWidth = Math.min(doc.widthOfString(label) + 6, width * 0.5);
  doc.text(label, x, y, { width: labelWidth, lineBreak: false });
  doc.font("Helvetica").fontSize(7.2).text(clean(value), x + labelWidth, y, { width: width - labelWidth });
}

function box(doc, x, y, width, height, radius) {
  doc.lineWidth(0.8).strokeColor(COLORS.line);
  if (radius) doc.roundedRect(x, y, width, height, radius).stroke();
  else doc.rect(x, y, width, height).stroke();
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

function documentNumber(document, issuer) {
  return [
    document.establishment || issuer.establishment,
    document.emissionPoint || issuer.emissionPoint,
    document.sequence
  ].filter(Boolean).join("-");
}

function environmentLabel(document, issuer) {
  const value = String(document.sriEnvironment || issuer.environment || "").toUpperCase();
  return value === "1" || value === "PRUEBAS" || value === "TEST" ? "PRUEBAS" : "PRODUCCION";
}

function taxSubtotals(document) {
  const rates = new Map();
  for (const item of document.items || []) {
    const rate = Number(item.ivaRate || 0);
    rates.set(rate, (rates.get(rate) || 0) + lineSubtotal(item));
  }
  return [...rates.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rate, base]) => ({ rate, label: rate > 0 ? `${Math.round(rate * 100)}%` : "0%", base }));
}

function totalDiscount(document) {
  return (document.items || []).reduce((sum, item) => sum + lineDiscount(item), 0);
}

function lineDiscount(item) {
  if (Number.isFinite(Number(item.discountAmount))) return Number(item.discountAmount);
  return number(item.quantity) * number(item.unitPrice) * number(item.discount) / 100;
}

function lineSubtotal(item) {
  return number(item.quantity) * number(item.unitPrice) - lineDiscount(item);
}

function paymentsFor(document) {
  if (document.paymentCondition === "credito") return [{ paymentMethod: "20", amount: document.total }];
  if (Array.isArray(document.payments) && document.payments.length) return document.payments;
  return [{ paymentMethod: document.paymentMethod || "", amount: document.total }];
}

function paymentLabel(code) {
  const labels = {
    "01": "SIN UTILIZACION DEL SISTEMA FINANCIERO",
    "15": "COMPENSACION DE DEUDAS",
    "16": "TARJETA DE DEBITO",
    "17": "DINERO ELECTRONICO",
    "18": "TARJETA PREPAGO",
    "19": "TARJETA DE CREDITO",
    "20": "OTROS CON UTILIZACION DEL SISTEMA FINANCIERO",
    "21": "ENDOSO DE TITULOS"
  };
  return labels[String(code || "")] || clean(code) || "NO ESPECIFICADA";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return `${formatDate(value)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function groupAccessKey(value) {
  return clean(value).replace(/(.{7})/g, "$1 ").trim();
}

function drawCode128(doc, value, x, y, width, height) {
  const text = clean(value);
  if (!text || [...text].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) > 126)) return;
  const codes = [104, ...[...text].map((character) => character.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + code * (index === 0 ? 1 : index), 0) % 103;
  const pattern = [...codes, checksum, 106].map((code) => CODE128_PATTERNS[code]).join("");
  const modules = [...pattern].reduce((sum, digit) => sum + Number(digit), 0);
  const moduleWidth = width / modules;
  let cursor = x;
  [...pattern].forEach((digit, index) => {
    const barWidth = Number(digit) * moduleWidth;
    if (index % 2 === 0) doc.rect(cursor, y, barWidth, height).fill(COLORS.text);
    cursor += barWidth;
  });
}

function quantity(value) {
  return number(value).toFixed(2);
}

function money(value) {
  return number(value).toFixed(2);
}

function number(value) {
  return Number(value || 0);
}

function clean(value) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

module.exports = {
  buildRidePdf,
  requiredRideData
};
