const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");
const { DOMParser } = require("@xmldom/xmldom");

let bwipjs = null;
try {
  // Dependencia recomendada para dibujar Code 128.
  // El RIDE seguirá generándose aunque no esté instalada.
  bwipjs = require("bwip-js");
} catch {
  bwipjs = null;
}

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 22
};

const COLORS = {
  text: "#0a0a0a",
  muted: "#4b5563",
  border: "#202020",
  header: "#e5e7eb",
  soft: "#f8fafc",
  total: "#d1d5db"
};

const FONT = {
  regular: "Helvetica",
  bold: "Helvetica-Bold"
};

/**
 * Genera el RIDE en PDF a partir del XML autorizado.
 *
 * Prioridad de datos:
 * 1. XML autorizado por el SRI.
 * 2. Snapshot durable de la operación.
 *
 * No modifica el XML, la autorización, la cola de correos ni SMTP.
 */
async function buildRidePdf({
  documentType,
  document = {},
  client = {},
  issuer = {},
  sourceDocument = null
}) {
  const context = normalizeRideContextFromAuthorizedXml({
    documentType,
    document,
    client,
    issuer,
    sourceDocument
  });

  const missing = requiredRideData(context);
  if (missing.length) {
    const error = new Error(
      `Faltan datos para generar el RIDE: ${missing.join(", ")}.`
    );
    error.code = "RIDE_DATA_INCOMPLETE";
    error.retryable = false;
    throw error;
  }

  const doc = new PDFDocument({
    size: "A4",
    margins: {
      top: PAGE.margin,
      right: PAGE.margin,
      bottom: PAGE.margin,
      left: PAGE.margin
    },
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: `RIDE ${documentLabel(context.documentType)} ${documentNumber(
        context.document,
        context.issuer
      )}`,
      Author: clean(context.issuer.businessName),
      Subject:
        "Representación impresa de comprobante electrónico autorizado por el SRI",
      Creator: "FactuDarwin"
    }
  });

  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const completed = new Promise((resolve, reject) => {
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
  });

  await renderRide(doc, context);
  addPageNumbers(doc, context);
  doc.end();

  return completed;
}

async function renderRide(doc, context) {
  const x = PAGE.margin;
  const width = PAGE.width - PAGE.margin * 2;

  await drawMainHeader(doc, context, x, PAGE.margin, width);

  let y = 226;
  y = drawCustomerPanel(doc, context, x, y, width);

  if (context.documentType === "nota_credito") {
    y = drawCreditNoteReference(doc, context, x, y + 4, width);
  }

  y = drawDetails(doc, context, x, y + 4, width);
  await drawSummaryArea(doc, context, x, y + 5, width);
}

/* -------------------------------------------------------------------------- */
/* ENCABEZADO                                                                  */
/* -------------------------------------------------------------------------- */

async function drawMainHeader(doc, context, x, y, width) {
  const gap = 4;
  const leftWidth = width * 0.535;
  const rightWidth = width - leftWidth - gap;
  const height = 198;

  drawRoundedBox(doc, x, y, leftWidth, height, 5);
  drawRoundedBox(doc, x + leftWidth + gap, y, rightWidth, height, 5);

  await drawIssuerPanel(doc, context, x, y, leftWidth, height);
  await drawAuthorizationPanel(
    doc,
    context,
    x + leftWidth + gap,
    y,
    rightWidth,
    height
  );
}

async function drawIssuerPanel(doc, context, x, y, width, height) {
  const issuer = context.issuer;
  const logo = resolveLogo(issuer);

  let contentY = y + 8;

  if (logo) {
    try {
      doc.image(logo, x + 8, contentY, {
        fit: [width - 16, 74],
        align: "center",
        valign: "center"
      });
      contentY += 80;
    } catch {
      drawBrandPlaceholder(doc, x + 8, contentY, width - 16, 62);
      contentY += 68;
    }
  } else {
    drawBrandPlaceholder(doc, x + 8, contentY, width - 16, 62);
    contentY += 68;
  }

  doc
    .font(FONT.bold)
    .fontSize(10.8)
    .fillColor(COLORS.text)
    .text(clean(issuer.businessName).toUpperCase(), x + 8, contentY, {
      width: width - 16,
      align: "left",
      lineGap: 1
    });

  contentY = doc.y + 2;

  if (clean(issuer.tradeName)) {
    doc
      .font(FONT.bold)
      .fontSize(9.2)
      .text(clean(issuer.tradeName).toUpperCase(), x + 8, contentY, {
        width: width - 16
      });
    contentY = doc.y + 5;
  } else {
    contentY += 3;
  }

  contentY = drawCompactField(
    doc,
    "Dir. Matriz:",
    issuer.address,
    x + 8,
    contentY,
    width - 16
  );

  if (
    clean(issuer.establishmentAddress) &&
    clean(issuer.establishmentAddress) !== clean(issuer.address)
  ) {
    contentY = drawCompactField(
      doc,
      "Dir. Sucursal:",
      issuer.establishmentAddress,
      x + 8,
      contentY + 2,
      width - 16
    );
  }

  if (clean(issuer.phone)) {
    contentY = drawCompactField(
      doc,
      "Teléfono:",
      issuer.phone,
      x + 8,
      contentY + 2,
      width - 16
    );
  }

  if (clean(issuer.email)) {
    contentY = drawCompactField(
      doc,
      "Email:",
      issuer.email,
      x + 8,
      contentY + 2,
      width - 16
    );
  }

  const footerLines = [];

  if (clean(issuer.specialTaxpayerResolution)) {
    footerLines.push(
      `CONTRIBUYENTE ESPECIAL N.º ${clean(
        issuer.specialTaxpayerResolution
      )}`
    );
  }

  if (clean(issuer.retentionAgentResolution)) {
    footerLines.push(
      `AGENTE DE RETENCIÓN N.º ${clean(
        issuer.retentionAgentResolution
      )}`
    );
  }

  if (clean(issuer.rimpeLabel)) {
    footerLines.push(clean(issuer.rimpeLabel).toUpperCase());
  }

  footerLines.push(
    `OBLIGADO A LLEVAR CONTABILIDAD: ${yesNo(
      issuer.accountingRequired
    )}`
  );

  doc
    .font(FONT.regular)
    .fontSize(6.6)
    .fillColor(COLORS.text)
    .text(footerLines.join("\n"), x + 8, y + height - 37, {
      width: width - 16,
      lineGap: 1.5
    });
}

function drawBrandPlaceholder(doc, x, y, width, height) {
  doc
    .save()
    .roundedRect(x, y, width, height, 5)
    .fill(COLORS.soft)
    .restore();

  doc
    .font(FONT.bold)
    .fontSize(21)
    .fillColor(COLORS.text)
    .text("FactuDarwin", x, y + 16, {
      width,
      align: "center"
    });

  doc
    .font(FONT.regular)
    .fontSize(7)
    .fillColor(COLORS.muted)
    .text("FACTURACIÓN ELECTRÓNICA", x, y + 42, {
      width,
      align: "center"
    });
}

async function drawAuthorizationPanel(
  doc,
  context,
  x,
  y,
  width,
  height
) {
  const { document, issuer, documentType } = context;

  doc
    .font(FONT.bold)
    .fontSize(12)
    .fillColor(COLORS.text)
    .text(`R.U.C.: ${clean(issuer.ruc)}`, x + 8, y + 10, {
      width: width - 16,
      align: "center"
    });

  doc
    .font(FONT.bold)
    .fontSize(13)
    .text(documentLabel(documentType), x + 8, y + 33, {
      width: width - 16
    });

  doc
    .font(FONT.bold)
    .fontSize(8)
    .text("No.", x + 8, y + 55);

  doc
    .font(FONT.regular)
    .fontSize(9)
    .text(documentNumber(document, issuer), x + 28, y + 54, {
      width: width - 36
    });

  doc
    .font(FONT.bold)
    .fontSize(7.5)
    .text("NÚMERO DE AUTORIZACIÓN", x + 8, y + 72, {
      width: width - 16
    });

  doc
    .font(FONT.regular)
    .fontSize(6.7)
    .text(
      clean(document.authorizationNumber || document.accessKey),
      x + 8,
      y + 84,
      {
        width: width - 16,
        characterSpacing: 0.05
      }
    );

  drawAuthRow(
    doc,
    "FECHA Y HORA DE AUTORIZACIÓN:",
    formatAuthorizationDate(document.authorizationDate),
    x + 8,
    y + 101,
    width - 16
  );

  drawAuthRow(
    doc,
    "AMBIENTE:",
    environmentLabel(document, issuer),
    x + 8,
    y + 115,
    width * 0.52
  );

  drawAuthRow(
    doc,
    "EMISIÓN:",
    emissionLabel(document),
    x + width * 0.54,
    y + 115,
    width * 0.42
  );

  doc
    .font(FONT.bold)
    .fontSize(8)
    .text("CLAVE DE ACCESO", x + 8, y + 132, {
      width: width - 16
    });

  const barcodeBuffer = await buildBarcode(document.accessKey);

  if (barcodeBuffer) {
    try {
      doc.image(barcodeBuffer, x + 8, y + 143, {
        fit: [width - 16, 34],
        align: "center"
      });
    } catch {
      drawBarcodeFallback(doc, document.accessKey, x + 8, y + 143, width - 16, 31);
    }
  } else {
    drawBarcodeFallback(doc, document.accessKey, x + 8, y + 143, width - 16, 31);
  }

  doc
    .font(FONT.regular)
    .fontSize(5.4)
    .fillColor(COLORS.text)
    .text(groupAccessKey(document.accessKey, 7), x + 6, y + 180, {
      width: width - 12,
      align: "center",
      characterSpacing: -0.05
    });
}

function drawAuthRow(doc, label, value, x, y, width) {
  const labelWidth = Math.min(width * 0.63, 124);

  doc
    .font(FONT.bold)
    .fontSize(6.4)
    .fillColor(COLORS.text)
    .text(label, x, y, {
      width: labelWidth
    });

  doc
    .font(FONT.regular)
    .fontSize(6.4)
    .text(clean(value), x + labelWidth, y, {
      width: width - labelWidth
    });
}

/* -------------------------------------------------------------------------- */
/* COMPRADOR Y NOTA DE CRÉDITO                                                 */
/* -------------------------------------------------------------------------- */

function drawCustomerPanel(doc, context, x, y, width) {
  const { client, document } = context;
  const height = 58;
  drawRoundedBox(doc, x, y, width, height, 3);

  const firstRowY = y + 7;
  const secondRowY = y + 24;
  const thirdRowY = y + 41;

  drawInlineField(
    doc,
    "Razón Social / Nombres:",
    client.name,
    x + 8,
    firstRowY,
    width * 0.56
  );

  drawInlineField(
    doc,
    "RUC / CI:",
    client.identification,
    x + width * 0.58,
    firstRowY,
    width * 0.26
  );

  drawInlineField(
    doc,
    "Teléfono:",
    client.phone,
    x + width * 0.84,
    firstRowY,
    width * 0.15
  );

  drawInlineField(
    doc,
    "Fecha de emisión:",
    formatDate(document.createdAt),
    x + 8,
    secondRowY,
    width * 0.34
  );

  drawInlineField(
    doc,
    "Correo:",
    client.email,
    x + width * 0.36,
    secondRowY,
    width * 0.63
  );

  drawInlineField(
    doc,
    "Dirección:",
    client.address,
    x + 8,
    thirdRowY,
    width - 16
  );

  return y + height;
}

function drawCreditNoteReference(doc, context, x, y, width) {
  const { document, issuer, sourceDocument } = context;
  const height = 50;
  drawRoundedBox(doc, x, y, width, height, 3);

  drawInlineField(
    doc,
    "COMPROBANTE QUE SE MODIFICA:",
    document.supportDocumentNumber ||
      documentNumber(sourceDocument || {}, issuer),
    x + 8,
    y + 8,
    width * 0.62
  );

  drawInlineField(
    doc,
    "FECHA:",
    formatDate(
      document.supportIssueDate ||
        sourceDocument?.createdAt
    ),
    x + width * 0.64,
    y + 8,
    width * 0.34
  );

  drawInlineField(
    doc,
    "RAZÓN DE MODIFICACIÓN:",
    document.creditReason,
    x + 8,
    y + 28,
    width - 16
  );

  return y + height;
}

/* -------------------------------------------------------------------------- */
/* DETALLE                                                                     */
/* -------------------------------------------------------------------------- */

function drawDetails(doc, context, x, y, width) {
  const columns = detailColumns(width);
  const headerHeight = 24;
  let currentY = y;

  drawDetailsHeader(doc, columns, x, currentY, headerHeight);
  currentY += headerHeight;

  context.document.items.forEach((item, index) => {
    const rowHeight = detailRowHeight(doc, item, columns);

    if (currentY + rowHeight > PAGE.height - 150) {
      doc.addPage();
      currentY = PAGE.margin + 22;
      drawContinuationHeader(doc, context, x, PAGE.margin, width);
      drawDetailsHeader(doc, columns, x, currentY, headerHeight);
      currentY += headerHeight;
    }

    drawDetailRow(doc, columns, item, index, x, currentY, rowHeight);
    currentY += rowHeight;
  });

  return currentY;
}

function detailColumns(width) {
  const fixed = {
    code: 58,
    auxiliary: 48,
    quantity: 42,
    unit: 30,
    price: 51,
    discount: 48,
    total: 55
  };

  return [
    { key: "code", label: "CÓDIGO\nPRINCIPAL", width: fixed.code, align: "left" },
    { key: "auxiliaryCode", label: "CÓDIGO\nAUXILIAR", width: fixed.auxiliary, align: "left" },
    {
      key: "name",
      label: "DESCRIPCIÓN",
      width:
        width -
        fixed.code -
        fixed.auxiliary -
        fixed.quantity -
        fixed.unit -
        fixed.price -
        fixed.discount -
        fixed.total,
      align: "left"
    },
    { key: "quantity", label: "CANT.", width: fixed.quantity, align: "right" },
    { key: "unit", label: "U.", width: fixed.unit, align: "center" },
    { key: "unitPrice", label: "P. UNIT.", width: fixed.price, align: "right" },
    { key: "discountAmount", label: "DESC.", width: fixed.discount, align: "right" },
    { key: "subtotal", label: "SUBTOTAL", width: fixed.total, align: "right" }
  ];
}

function drawDetailsHeader(doc, columns, x, y, height) {
  let currentX = x;

  columns.forEach((column) => {
    doc
      .save()
      .rect(currentX, y, column.width, height)
      .fillAndStroke(COLORS.header, COLORS.border)
      .restore();

    doc
      .font(FONT.bold)
      .fontSize(5.6)
      .fillColor(COLORS.text)
      .text(column.label, currentX + 2, y + 6, {
        width: column.width - 4,
        height: height - 6,
        align: "center",
        lineGap: 0
      });

    currentX += column.width;
  });
}

function detailRowHeight(doc, item, columns) {
  const descriptionColumn = columns.find((column) => column.key === "name");
  const detailsText = itemDescription(item);

  doc.font(FONT.regular).fontSize(6.3);
  const textHeight = doc.heightOfString(detailsText, {
    width: descriptionColumn.width - 6,
    lineGap: 1
  });

  return Math.max(22, Math.min(52, textHeight + 9));
}

function drawDetailRow(doc, columns, item, index, x, y, height) {
  const values = {
    code: clean(item.code),
    auxiliaryCode: clean(item.auxiliaryCode),
    name: itemDescription(item),
    quantity: quantity(item.quantity),
    unit: clean(item.unit || item.unitName || "Un"),
    unitPrice: money(item.unitPrice),
    discountAmount: money(lineDiscount(item)),
    subtotal: money(lineSubtotal(item))
  };

  let currentX = x;

  columns.forEach((column) => {
    doc
      .save()
      .rect(currentX, y, column.width, height)
      .stroke(COLORS.border)
      .restore();

    doc
      .font(FONT.regular)
      .fontSize(6.3)
      .fillColor(COLORS.text)
      .text(values[column.key], currentX + 3, y + 6, {
        width: column.width - 6,
        height: height - 8,
        align: column.align,
        ellipsis: height >= 52
      });

    currentX += column.width;
  });
}

function itemDescription(item) {
  const lines = [clean(item.name)];

  if (Array.isArray(item.additionalDetails)) {
    for (const detail of item.additionalDetails) {
      const name = clean(detail.name || detail.label);
      const value = clean(detail.value);
      if (name && value) lines.push(`${name}: ${value}`);
    }
  }

  return lines.filter(Boolean).join("\n");
}

/* -------------------------------------------------------------------------- */
/* RESUMEN, INFORMACIÓN ADICIONAL Y PAGOS                                      */
/* -------------------------------------------------------------------------- */

async function drawSummaryArea(doc, context, x, y, width) {
  const estimatedHeight = estimateSummaryHeight(context);

  if (y + estimatedHeight > PAGE.height - PAGE.margin - 12) {
    doc.addPage();
    drawContinuationHeader(doc, context, x, PAGE.margin, width);
    y = PAGE.margin + 25;
  }

  const gap = 5;
  const leftWidth = width * 0.59;
  const rightWidth = width - leftWidth - gap;
  const rightX = x + leftWidth + gap;

  const totalsHeight = drawTotalsPanel(
    doc,
    context,
    rightX,
    y,
    rightWidth
  );

  const additionalHeight = Math.max(88, totalsHeight - 1);
  drawAdditionalInformation(
    doc,
    context,
    x,
    y,
    leftWidth,
    additionalHeight
  );

  const paymentY = y + Math.max(totalsHeight, additionalHeight) + 5;
  const paymentHeight = drawPaymentsPanel(
    doc,
    context.document,
    x,
    paymentY,
    width
  );

  const footerY = paymentY + paymentHeight + 6;

  doc
    .font(FONT.regular)
    .fontSize(5.9)
    .fillColor(COLORS.muted)
    .text(
      "RIDE: representación impresa del comprobante electrónico. Los datos de este documento provienen del XML autorizado por el SRI.",
      x,
      footerY,
      {
        width,
        align: "left"
      }
    );
}

function estimateSummaryHeight(context) {
  const taxRows = taxSubtotals(context.document).length;
  const paymentRows = paymentsFor(context.document).length;
  return Math.max(116, 54 + taxRows * 15) + 30 + paymentRows * 16;
}

function drawAdditionalInformation(doc, context, x, y, width, height) {
  drawRoundedBox(doc, x, y, width, height, 3);

  doc
    .font(FONT.bold)
    .fontSize(7.4)
    .fillColor(COLORS.text)
    .text("INFORMACIÓN ADICIONAL", x + 7, y + 7, {
      width: width - 14
    });

  const fields = deduplicateAdditionalFields([
    ["Teléfono", context.client.phone],
    ["Email", context.client.email],
    ...(Array.isArray(context.document.additionalInfo)
      ? context.document.additionalInfo.map((field) => [
          field.name || field.label,
          field.value
        ])
      : [])
  ]);

  if (!fields.length) {
    doc
      .font(FONT.regular)
      .fontSize(6.5)
      .fillColor(COLORS.muted)
      .text("Sin información adicional", x + 7, y + 23, {
        width: width - 14
      });
    return;
  }

  let currentY = y + 23;

  for (const [name, value] of fields.slice(0, 12)) {
    const line = `${clean(name)}: ${clean(value)}`;
    const lineHeight = Math.max(
      10,
      doc.heightOfString(line, {
        width: width - 14,
        lineGap: 1
      })
    );

    if (currentY + lineHeight > y + height - 6) break;

    doc
      .font(FONT.regular)
      .fontSize(6.4)
      .fillColor(COLORS.text)
      .text(line, x + 7, currentY, {
        width: width - 14,
        lineGap: 1
      });

    currentY += lineHeight + 1;
  }
}

function drawTotalsPanel(doc, context, x, y, width) {
  const { document, documentType } = context;
  const taxRows = taxSubtotals(document);

  const rows = [];

  rows.push(["SUBTOTAL SIN IMPUESTOS", money(document.subtotal)]);

  for (const row of taxRows) {
    rows.push([`SUBTOTAL ${row.label}`, money(row.base)]);
  }

  const noTaxBase = baseByTaxCategory(document, "NO_OBJETO");
  if (noTaxBase > 0) rows.push(["SUBTOTAL NO OBJETO IVA", money(noTaxBase)]);

  const exemptBase = baseByTaxCategory(document, "EXENTO");
  if (exemptBase > 0) rows.push(["SUBTOTAL EXENTO IVA", money(exemptBase)]);

  rows.push(["TOTAL DESCUENTO", money(totalDiscount(document))]);

  if (number(document.ice) > 0) {
    rows.push(["ICE", money(document.ice)]);
  }

  for (const row of taxRows.filter((item) => number(item.tax) > 0)) {
    rows.push([`IVA ${row.label}`, money(row.tax)]);
  }

  if (number(document.tip) > 0) {
    rows.push(["PROPINA", money(document.tip)]);
  }

  rows.push([
    documentType === "nota_credito"
      ? "VALOR MODIFICACIÓN"
      : "VALOR TOTAL",
    money(document.total)
  ]);

  const rowHeight = 15;
  const height = rows.length * rowHeight;

  drawRoundedBox(doc, x, y, width, height, 2);

  rows.forEach(([label, value], index) => {
    const rowY = y + index * rowHeight;
    const isLast = index === rows.length - 1;

    if (isLast) {
      doc
        .save()
        .rect(x, rowY, width, rowHeight)
        .fill(COLORS.total)
        .restore();
    }

    if (index > 0) {
      doc
        .save()
        .moveTo(x, rowY)
        .lineTo(x + width, rowY)
        .stroke(COLORS.border)
        .restore();
    }

    const dividerX = x + width * 0.66;

    doc
      .save()
      .moveTo(dividerX, rowY)
      .lineTo(dividerX, rowY + rowHeight)
      .stroke(COLORS.border)
      .restore();

    doc
      .font(isLast ? FONT.bold : FONT.regular)
      .fontSize(isLast ? 7.1 : 6.4)
      .fillColor(COLORS.text)
      .text(label, x + 4, rowY + 4.5, {
        width: dividerX - x - 8
      });

    doc
      .font(isLast ? FONT.bold : FONT.regular)
      .fontSize(isLast ? 7.4 : 6.6)
      .text(`$${value}`, dividerX + 4, rowY + 4.2, {
        width: x + width - dividerX - 8,
        align: "right"
      });
  });

  return height;
}

function drawPaymentsPanel(doc, document, x, y, width) {
  const payments = paymentsFor(document);
  const columns = [
    { label: "FORMA DE PAGO", width: width * 0.62, align: "left" },
    { label: "VALOR", width: width * 0.15, align: "right" },
    { label: "PLAZO", width: width * 0.11, align: "right" },
    { label: "UNIDAD", width: width * 0.12, align: "center" }
  ];

  const rowHeight = 16;
  const height = rowHeight * (payments.length + 1);

  drawRoundedBox(doc, x, y, width, height, 2);

  let currentX = x;
  for (const column of columns) {
    doc
      .save()
      .rect(currentX, y, column.width, rowHeight)
      .fillAndStroke(COLORS.header, COLORS.border)
      .restore();

    doc
      .font(FONT.bold)
      .fontSize(6.2)
      .fillColor(COLORS.text)
      .text(column.label, currentX + 3, y + 5, {
        width: column.width - 6,
        align: column.align
      });

    currentX += column.width;
  }

  payments.forEach((payment, index) => {
    const rowY = y + rowHeight * (index + 1);
    const values = [
      paymentLabel(payment.paymentMethod),
      `$${money(payment.amount)}`,
      payment.term ? clean(payment.term) : "",
      payment.timeUnit ? paymentTimeUnitLabel(payment.timeUnit) : ""
    ];

    let cellX = x;

    columns.forEach((column, columnIndex) => {
      doc
        .save()
        .rect(cellX, rowY, column.width, rowHeight)
        .stroke(COLORS.border)
        .restore();

      doc
        .font(FONT.regular)
        .fontSize(6.2)
        .fillColor(COLORS.text)
        .text(values[columnIndex], cellX + 3, rowY + 5, {
          width: column.width - 6,
          align: column.align
        });

      cellX += column.width;
    });
  });

  return height;
}

/* -------------------------------------------------------------------------- */
/* CONTINUACIÓN Y NUMERACIÓN                                                   */
/* -------------------------------------------------------------------------- */

function drawContinuationHeader(doc, context, x, y, width) {
  doc
    .font(FONT.bold)
    .fontSize(8.2)
    .fillColor(COLORS.text)
    .text(
      `${documentLabel(context.documentType)} ${documentNumber(
        context.document,
        context.issuer
      )} — CONTINUACIÓN`,
      x,
      y,
      {
        width
      }
    );

  doc
    .font(FONT.regular)
    .fontSize(5.8)
    .fillColor(COLORS.muted)
    .text(
      `Clave de acceso: ${clean(context.document.accessKey)}`,
      x,
      y + 11,
      {
        width
      }
    );
}

function addPageNumbers(doc, context) {
  const range = doc.bufferedPageRange();

  for (
    let pageIndex = range.start;
    pageIndex < range.start + range.count;
    pageIndex += 1
  ) {
    doc.switchToPage(pageIndex);

    doc
      .font(FONT.regular)
      .fontSize(5.8)
      .fillColor(COLORS.muted)
      .text(
        `FactuDarwin · ${documentLabel(
          context.documentType
        )} ${documentNumber(
          context.document,
          context.issuer
        )} · Página ${pageIndex + 1} de ${range.count}`,
        PAGE.margin,
        PAGE.height - 16,
        {
          width: PAGE.width - PAGE.margin * 2,
          align: "right",
          lineBreak: false
        }
      );
  }
}

/* -------------------------------------------------------------------------- */
/* PARSEO DEL XML AUTORIZADO                                                   */
/* -------------------------------------------------------------------------- */

function normalizeRideContextFromAuthorizedXml(context) {
  const authorizedXml = String(
    context.document?.authorizedXml || ""
  ).trim();

  if (!authorizedXml) return context;

  try {
    const envelope = parseXml(authorizedXml);
    const authorizationNode = firstByTag(envelope, "autorizacion");
    const voucherNode = firstByTag(envelope, "comprobante");
    const embeddedVoucher = voucherNode
      ? decodeXmlEntities(nodeText(voucherNode))
      : "";

    const voucherXml =
      embeddedVoucher && embeddedVoucher.includes("<")
        ? embeddedVoucher
        : authorizedXml;

    const voucher = parseXml(voucherXml);

    const rootName = voucher.documentElement?.nodeName || "";
    const inferredType =
      rootName === "notaCredito"
        ? "nota_credito"
        : rootName === "factura"
          ? "factura"
          : context.documentType;

    const infoTributaria = firstByTag(voucher, "infoTributaria");
    const infoDocument = firstByTag(
      voucher,
      inferredType === "nota_credito"
        ? "infoNotaCredito"
        : "infoFactura"
    );

    const parsedDetails = parseDetails(voucher);
    const parsedPayments = parsePayments(infoDocument);
    const parsedAdditional = parseAdditionalInfo(voucher);
    const parsedTaxSubtotals = parseTaxSubtotals(infoDocument);

    const xmlDocument = {
      ...context.document,
      authorizedXml,
      accessKey:
        valueOf(infoTributaria, "claveAcceso") ||
        context.document.accessKey,
      authorizationNumber:
        valueOf(authorizationNode, "numeroAutorizacion") ||
        valueOf(infoTributaria, "claveAcceso") ||
        context.document.authorizationNumber,
      authorizationDate:
        valueOf(authorizationNode, "fechaAutorizacion") ||
        context.document.authorizationDate,
      sriEnvironment:
        valueOf(authorizationNode, "ambiente") ||
        valueOf(infoTributaria, "ambiente") ||
        context.document.sriEnvironment,
      emissionType:
        valueOf(infoTributaria, "tipoEmision") ||
        context.document.emissionType,
      establishment:
        valueOf(infoTributaria, "estab") ||
        context.document.establishment,
      emissionPoint:
        valueOf(infoTributaria, "ptoEmi") ||
        context.document.emissionPoint,
      sequence:
        valueOf(infoTributaria, "secuencial") ||
        context.document.sequence,
      createdAt:
        parseSriDate(valueOf(infoDocument, "fechaEmision")) ||
        context.document.createdAt,
      subtotal:
        decimal(valueOf(infoDocument, "totalSinImpuestos")) ??
        context.document.subtotal,
      total:
        decimal(
          valueOf(
            infoDocument,
            inferredType === "nota_credito"
              ? "valorModificacion"
              : "importeTotal"
          )
        ) ?? context.document.total,
      tax:
        sumTaxValues(parsedTaxSubtotals) ??
        context.document.tax,
      tip:
        decimal(valueOf(infoDocument, "propina")) ??
        context.document.tip,
      currency:
        valueOf(infoDocument, "moneda") ||
        context.document.currency,
      creditReason:
        valueOf(infoDocument, "motivo") ||
        context.document.creditReason,
      supportDocumentNumber:
        valueOf(infoDocument, "numDocModificado") ||
        context.document.supportDocumentNumber,
      supportIssueDate:
        parseSriDate(
          valueOf(infoDocument, "fechaEmisionDocSustento")
        ) || context.document.supportIssueDate,
      items:
        parsedDetails.length > 0
          ? parsedDetails
          : context.document.items,
      payments:
        parsedPayments.length > 0
          ? parsedPayments
          : context.document.payments,
      additionalInfo:
        parsedAdditional.length > 0
          ? parsedAdditional
          : context.document.additionalInfo,
      xmlTaxSubtotals: parsedTaxSubtotals
    };

    const additionalMap = new Map(
      parsedAdditional.map((field) => [
        normalizeKey(field.name),
        field.value
      ])
    );

    const xmlIssuer = {
      ...context.issuer,
      businessName:
        valueOf(infoTributaria, "razonSocial") ||
        context.issuer.businessName,
      tradeName:
        valueOf(infoTributaria, "nombreComercial") ||
        context.issuer.tradeName,
      ruc:
        valueOf(infoTributaria, "ruc") ||
        context.issuer.ruc,
      address:
        valueOf(infoTributaria, "dirMatriz") ||
        context.issuer.address,
      establishmentAddress:
        valueOf(infoDocument, "dirEstablecimiento") ||
        context.issuer.establishmentAddress,
      accountingRequired:
        valueOf(infoDocument, "obligadoContabilidad") ||
        context.issuer.accountingRequired,
      specialTaxpayerResolution:
        valueOf(infoDocument, "contribuyenteEspecial") ||
        context.issuer.specialTaxpayerResolution,
      specialTaxpayer:
        valueOf(infoDocument, "contribuyenteEspecial")
          ? "SI"
          : context.issuer.specialTaxpayer,
      environment:
        valueOf(infoTributaria, "ambiente") ||
        context.issuer.environment,
      phone:
        context.issuer.phone ||
        findAdditional(additionalMap, [
          "telefonoemisor",
          "telefonocontribuyente"
        ]),
      email:
        context.issuer.email ||
        findAdditional(additionalMap, [
          "emailemisor",
          "correoelectronicoemisor"
        ]),
      rimpeLabel:
        valueOf(infoTributaria, "contribuyenteRimpe") ||
        context.issuer.rimpeLabel
    };

    const xmlClient = {
      ...context.client,
      name:
        valueOf(infoDocument, "razonSocialComprador") ||
        context.client.name,
      identification:
        valueOf(infoDocument, "identificacionComprador") ||
        context.client.identification,
      address:
        valueOf(infoDocument, "direccionComprador") ||
        context.client.address,
      email:
        findAdditional(additionalMap, [
          "email",
          "correo",
          "correoelectronico",
          "emailcliente"
        ]) || context.client.email,
      phone:
        findAdditional(additionalMap, [
          "telefono",
          "celular",
          "telefonocliente"
        ]) || context.client.phone
    };

    return {
      ...context,
      documentType: inferredType,
      document: xmlDocument,
      issuer: xmlIssuer,
      client: xmlClient
    };
  } catch {
    // El snapshot sigue siendo un respaldo seguro si existe una variante
    // inesperada del XML autorizado.
    return context;
  }
}

function parseXml(xml) {
  const parseErrors = [];

  const parsed = new DOMParser({
    errorHandler: {
      warning: (message) => parseErrors.push(message),
      error: (message) => parseErrors.push(message),
      fatalError: (message) => parseErrors.push(message)
    }
  }).parseFromString(String(xml || ""), "application/xml");

  if (
    parseErrors.length ||
    !parsed?.documentElement ||
    parsed.documentElement.nodeName === "parsererror"
  ) {
    throw new Error("XML autorizado inválido");
  }

  return parsed;
}

function parseDetails(voucher) {
  const detailsContainer = firstByTag(voucher, "detalles");
  if (!detailsContainer) return [];

  return directChildren(detailsContainer, "detalle").map((detail) => {
    const taxNode = firstByTag(
      firstByTag(detail, "impuestos"),
      "impuesto"
    );

    const additionalDetailsContainer = firstByTag(
      detail,
      "detallesAdicionales"
    );

    const additionalDetails = additionalDetailsContainer
      ? directChildren(
          additionalDetailsContainer,
          "detAdicional"
        ).map((node) => ({
          name: clean(node.getAttribute("nombre")),
          value: clean(node.getAttribute("valor"))
        }))
      : [];

    return {
      code: valueOf(detail, "codigoPrincipal"),
      auxiliaryCode: valueOf(detail, "codigoAuxiliar"),
      name: valueOf(detail, "descripcion"),
      quantity: decimal(valueOf(detail, "cantidad")) || 0,
      unitPrice:
        decimal(valueOf(detail, "precioUnitario")) || 0,
      discountAmount:
        decimal(valueOf(detail, "descuento")) || 0,
      subtotal:
        decimal(valueOf(detail, "precioTotalSinImpuesto")) || 0,
      ivaRate: taxRatePercent(taxNode),
      taxCode: valueOf(taxNode, "codigo"),
      taxPercentageCode: valueOf(
        taxNode,
        "codigoPorcentaje"
      ),
      taxBase:
        decimal(valueOf(taxNode, "baseImponible")) || 0,
      taxAmount:
        decimal(valueOf(taxNode, "valor")) || 0,
      additionalDetails
    };
  });
}

function parsePayments(infoDocument) {
  const paymentsContainer = firstByTag(infoDocument, "pagos");
  if (!paymentsContainer) return [];

  return directChildren(paymentsContainer, "pago").map(
    (payment) => ({
      paymentMethod: valueOf(payment, "formaPago"),
      amount:
        decimal(valueOf(payment, "total")) || 0,
      term:
        decimal(valueOf(payment, "plazo")),
      timeUnit: valueOf(payment, "unidadTiempo")
    })
  );
}

function parseAdditionalInfo(voucher) {
  const container = firstByTag(voucher, "infoAdicional");
  if (!container) return [];

  return directChildren(container, "campoAdicional").map(
    (field) => ({
      name: clean(field.getAttribute("nombre")),
      value: clean(nodeText(field))
    })
  );
}

function parseTaxSubtotals(infoDocument) {
  const container = firstByTag(
    infoDocument,
    "totalConImpuestos"
  );

  if (!container) return [];

  return directChildren(container, "totalImpuesto").map(
    (tax) => {
      const percentageCode = valueOf(
        tax,
        "codigoPorcentaje"
      );

      return {
        code: valueOf(tax, "codigo"),
        percentageCode,
        rate: taxRatePercent(tax),
        label: taxLabel(tax),
        base:
          decimal(valueOf(tax, "baseImponible")) || 0,
        tax:
          decimal(valueOf(tax, "valor")) || 0,
        category: taxCategory(percentageCode)
      };
    }
  );
}

/* -------------------------------------------------------------------------- */
/* CÓDIGO DE BARRAS                                                            */
/* -------------------------------------------------------------------------- */

async function buildBarcode(accessKey) {
  const value = clean(accessKey);
  if (!value || !bwipjs) return null;

  try {
    return await bwipjs.toBuffer({
      bcid: "code128",
      text: value,
      scale: 2,
      height: 8,
      includetext: false,
      paddingwidth: 0,
      paddingheight: 0,
      backgroundcolor: "FFFFFF"
    });
  } catch {
    return null;
  }
}

function drawBarcodeFallback(doc, value, x, y, width, height) {
  const key = clean(value);
  if (!key) return;

  // Fallback visual: patrón determinista para no bloquear el envío.
  // Cuando bwip-js está instalado se genera Code 128 real.
  const digest = Array.from(key)
    .map((character) => Number(character) || 0)
    .flatMap((digit, index) => [
      1 + ((digit + index) % 3),
      1,
      1 + ((digit * 2 + index) % 2),
      1
    ]);

  const totalUnits = digest.reduce((sum, unit) => sum + unit, 0);
  const unitWidth = width / totalUnits;
  let currentX = x;

  doc.save().fillColor(COLORS.text);

  digest.forEach((unit, index) => {
    const barWidth = unit * unitWidth;
    if (index % 2 === 0) {
      doc.rect(currentX, y, Math.max(0.45, barWidth), height).fill();
    }
    currentX += barWidth;
  });

  doc.restore();
}

/* -------------------------------------------------------------------------- */
/* UTILIDADES DEL RIDE                                                         */
/* -------------------------------------------------------------------------- */

function requiredRideData({
  documentType,
  document = {},
  client = {},
  issuer = {},
  sourceDocument
}) {
  const missing = [];

  if (!clean(issuer.businessName)) missing.push("razón social del emisor");
  if (!clean(issuer.ruc)) missing.push("RUC del emisor");
  if (!clean(issuer.address)) missing.push("dirección matriz");
  if (!clean(document.accessKey)) missing.push("clave de acceso");
  if (!clean(document.authorizationNumber)) {
    missing.push("número de autorización");
  }
  if (!clean(document.authorizationDate)) {
    missing.push("fecha de autorización");
  }
  if (!clean(document.sequence)) missing.push("secuencial");
  if (!clean(document.createdAt)) missing.push("fecha de emisión");
  if (!clean(client.name)) missing.push("cliente");
  if (!clean(client.identification)) {
    missing.push("identificación del cliente");
  }
  if (
    !Array.isArray(document.items) ||
    document.items.length === 0
  ) {
    missing.push("detalle del comprobante");
  }

  if (documentType === "nota_credito") {
    if (
      !clean(document.supportDocumentNumber) &&
      !sourceDocument
    ) {
      missing.push("comprobante modificado");
    }
    if (!clean(document.creditReason)) {
      missing.push("motivo de modificación");
    }
  }

  return missing;
}

function resolveLogo(issuer) {
  const candidates = [
    issuer.logoPath,
    issuer.logo,
    issuer.logoFile,
    issuer.logoUrl
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (Buffer.isBuffer(candidate)) return candidate;

    const raw = String(candidate).trim();

    if (raw.startsWith("data:image/")) {
      const base64 = raw.split(",")[1];
      if (base64) {
        try {
          return Buffer.from(base64, "base64");
        } catch {
          continue;
        }
      }
    }

    if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.length > 200) {
      try {
        return Buffer.from(raw.replace(/\s+/g, ""), "base64");
      } catch {
        continue;
      }
    }

    const possiblePaths = [
      raw,
      path.resolve(raw),
      path.resolve(process.cwd(), raw)
    ];

    for (const possiblePath of possiblePaths) {
      try {
        if (fs.existsSync(possiblePath)) {
          return possiblePath;
        }
      } catch {
        // Continúa al siguiente candidato.
      }
    }
  }

  return null;
}

function drawCompactField(doc, label, value, x, y, width) {
  const cleanValue = clean(value);
  if (!cleanValue) return y;

  const labelWidth = Math.min(width * 0.28, 64);

  doc
    .font(FONT.bold)
    .fontSize(6.7)
    .fillColor(COLORS.text)
    .text(label, x, y, {
      width: labelWidth
    });

  doc
    .font(FONT.regular)
    .fontSize(6.7)
    .text(cleanValue, x + labelWidth, y, {
      width: width - labelWidth
    });

  return Math.max(doc.y, y + 9);
}

function drawInlineField(doc, label, value, x, y, width) {
  const labelWidth = Math.min(width * 0.43, 112);

  doc
    .font(FONT.bold)
    .fontSize(6.6)
    .fillColor(COLORS.text)
    .text(label, x, y, {
      width: labelWidth
    });

  doc
    .font(FONT.regular)
    .fontSize(6.6)
    .text(clean(value), x + labelWidth, y, {
      width: width - labelWidth,
      ellipsis: true
    });
}

function drawRoundedBox(doc, x, y, width, height, radius = 0) {
  doc.save().lineWidth(0.75).strokeColor(COLORS.border);

  if (radius > 0) {
    doc.roundedRect(x, y, width, height, radius).stroke();
  } else {
    doc.rect(x, y, width, height).stroke();
  }

  doc.restore();
}

function documentLabel(documentType) {
  return documentType === "nota_credito"
    ? "NOTA DE CRÉDITO"
    : "FACTURA";
}

function documentNumber(document, issuer) {
  const establishment = padDigits(
    document.establishment || issuer.establishment,
    3
  );
  const emissionPoint = padDigits(
    document.emissionPoint || issuer.emissionPoint,
    3
  );
  const sequence = padDigits(document.sequence, 9);

  return [establishment, emissionPoint, sequence]
    .filter(Boolean)
    .join("-");
}

function environmentLabel(document, issuer) {
  const value = String(
    document.sriEnvironment || issuer.environment || ""
  )
    .trim()
    .toUpperCase();

  return ["1", "PRUEBAS", "TEST", "PRUEBA"].includes(value)
    ? "PRUEBAS"
    : "PRODUCCIÓN";
}

function emissionLabel(document) {
  const value = String(document.emissionType || "").trim();
  return value === "1" || !value ? "NORMAL" : value;
}

function taxSubtotals(document) {
  if (
    Array.isArray(document.xmlTaxSubtotals) &&
    document.xmlTaxSubtotals.length
  ) {
    return document.xmlTaxSubtotals
      .filter((row) => row.category === "IVA")
      .sort((a, b) => number(b.rate) - number(a.rate));
  }

  const grouped = new Map();

  for (const item of document.items || []) {
    const rawRate = number(item.ivaRate);
    const rate =
      rawRate > 0 && rawRate < 1 ? rawRate * 100 : rawRate;
    const key = String(rate);
    const current = grouped.get(key) || {
      rate,
      label: `${formatRate(rate)}%`,
      base: 0,
      tax: 0,
      category: "IVA"
    };

    current.base += lineSubtotal(item);
    current.tax += number(item.taxAmount);
    grouped.set(key, current);
  }

  return [...grouped.values()].sort(
    (a, b) => number(b.rate) - number(a.rate)
  );
}

function baseByTaxCategory(document, category) {
  return (document.xmlTaxSubtotals || [])
    .filter((row) => row.category === category)
    .reduce((sum, row) => sum + number(row.base), 0);
}

function totalDiscount(document) {
  return (document.items || []).reduce(
    (sum, item) => sum + lineDiscount(item),
    0
  );
}

function lineDiscount(item) {
  if (Number.isFinite(Number(item.discountAmount))) {
    return Number(item.discountAmount);
  }

  return (
    number(item.quantity) *
    number(item.unitPrice) *
    (number(item.discount) / 100)
  );
}

function lineSubtotal(item) {
  if (Number.isFinite(Number(item.subtotal))) {
    return Number(item.subtotal);
  }

  return (
    number(item.quantity) * number(item.unitPrice) -
    lineDiscount(item)
  );
}

function paymentsFor(document) {
  if (
    Array.isArray(document.payments) &&
    document.payments.length
  ) {
    return document.payments.map((payment) => ({
      paymentMethod:
        payment.paymentMethod ||
        payment.method ||
        payment.code ||
        "",
      amount:
        payment.amount ??
        payment.total ??
        document.total,
      term:
        payment.term ??
        payment.plazo ??
        null,
      timeUnit:
        payment.timeUnit ||
        payment.unidadTiempo ||
        ""
    }));
  }

  if (document.paymentCondition === "credito") {
    return [
      {
        paymentMethod: "20",
        amount: document.total,
        term: document.creditDays || null,
        timeUnit: document.creditDays ? "dias" : ""
      }
    ];
  }

  return [
    {
      paymentMethod: document.paymentMethod || "01",
      amount: document.total,
      term: null,
      timeUnit: ""
    }
  ];
}

function paymentLabel(code) {
  const labels = {
    "01": "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO",
    "15": "COMPENSACIÓN DE DEUDAS",
    "16": "TARJETA DE DÉBITO",
    "17": "DINERO ELECTRÓNICO",
    "18": "TARJETA PREPAGO",
    "19": "TARJETA DE CRÉDITO",
    "20": "OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO",
    "21": "ENDOSO DE TÍTULOS"
  };

  return labels[String(code || "")] || clean(code) || "NO ESPECIFICADA";
}

function paymentTimeUnitLabel(value) {
  const normalized = normalizeKey(value);
  const labels = {
    dias: "DÍAS",
    dia: "DÍAS",
    meses: "MESES",
    mes: "MESES",
    anos: "AÑOS",
    ano: "AÑOS"
  };

  return labels[normalized] || clean(value).toUpperCase();
}

function taxRatePercent(taxNode) {
  const explicit = decimal(valueOf(taxNode, "tarifa"));
  if (explicit !== null) return explicit;

  const code = valueOf(taxNode, "codigoPorcentaje");

  return (
    {
      "0": 0,
      "2": 12,
      "3": 14,
      "4": 15,
      "5": 5,
      "6": 0,
      "7": 0,
      "8": 8,
      "10": 13
    }[code] ?? 0
  );
}

function taxLabel(taxNode) {
  const rate = taxRatePercent(taxNode);
  return `${formatRate(rate)}%`;
}

function taxCategory(percentageCode) {
  if (percentageCode === "6") return "NO_OBJETO";
  if (percentageCode === "7") return "EXENTO";
  return "IVA";
}

function formatRate(value) {
  const numeric = number(value);
  return Number.isInteger(numeric)
    ? String(numeric)
    : numeric.toFixed(2).replace(/\.?0+$/, "");
}

function sumTaxValues(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.reduce((sum, row) => sum + number(row.tax), 0);
}

function deduplicateAdditionalFields(fields) {
  const seen = new Set();
  const result = [];

  for (const [name, value] of fields) {
    const cleanedName = clean(name);
    const cleanedValue = clean(value);
    if (!cleanedName || !cleanedValue) continue;

    const key = `${normalizeKey(cleanedName)}:${normalizeKey(
      cleanedValue
    )}`;

    if (seen.has(key)) continue;
    seen.add(key);
    result.push([cleanedName, cleanedValue]);
  }

  return result;
}

function findAdditional(map, keys) {
  for (const key of keys) {
    const value = map.get(normalizeKey(key));
    if (clean(value)) return clean(value);
  }

  return "";
}

function firstByTag(node, tagName) {
  if (!node?.getElementsByTagName) return null;
  const nodes = node.getElementsByTagName(tagName);
  return nodes.length ? nodes.item(0) : null;
}

function directChildren(node, tagName) {
  const result = [];

  for (
    let child = node?.firstChild;
    child;
    child = child.nextSibling
  ) {
    if (
      child.nodeType === 1 &&
      (!tagName || child.nodeName === tagName)
    ) {
      result.push(child);
    }
  }

  return result;
}

function valueOf(node, tagName) {
  return clean(nodeText(firstByTag(node, tagName)));
}

function nodeText(node) {
  return String(node?.textContent || "").trim();
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseSriDate(value) {
  const raw = clean(value);
  if (!raw) return "";

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return raw;

  return `${match[3]}-${match[2]}-${match[1]}T00:00:00`;
}

function formatDate(value) {
  if (!value) return "";

  const date = parseDateValue(value);
  if (!date) return clean(value);

  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1
  ).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatAuthorizationDate(value) {
  if (!value) return "";

  const raw = clean(value);
  const normalized = raw.replace(
    /([+-]\d{2}):?(\d{2})$/,
    "$1:$2"
  );

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return `${formatDate(date)} ${String(date.getHours()).padStart(
    2,
    "0"
  )}:${String(date.getMinutes()).padStart(2, "0")}:${String(
    date.getSeconds()
  ).padStart(2, "0")}`;
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const raw = clean(value);
  if (!raw) return null;

  const sriMatch = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/
  );

  if (sriMatch) {
    return new Date(
      Number(sriMatch[3]),
      Number(sriMatch[2]) - 1,
      Number(sriMatch[1]),
      Number(sriMatch[4] || 0),
      Number(sriMatch[5] || 0),
      Number(sriMatch[6] || 0)
    );
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function groupAccessKey(value, size = 7) {
  const key = clean(value).replace(/\s+/g, "");
  if (!key) return "";

  const groups = [];
  for (let index = 0; index < key.length; index += size) {
    groups.push(key.slice(index, index + size));
  }

  return groups.join(" ");
}

function padDigits(value, size) {
  const raw = clean(value);
  if (!raw) return "";
  return raw.replace(/\D+/g, "").padStart(size, "0").slice(-size);
}

function quantity(value) {
  const numeric = number(value);
  return numeric
    .toFixed(6)
    .replace(/\.?0+$/, "") || "0";
}

function money(value) {
  return number(value).toFixed(2);
}

function decimal(value) {
  const raw = clean(value);
  if (!raw) return null;

  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clean(value) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function yesNo(value) {
  const normalized = normalizeKey(value);

  if (["si", "s", "true", "1"].includes(normalized)) {
    return "SÍ";
  }

  return "NO";
}

module.exports = {
  buildRidePdf,
  requiredRideData,
  normalizeRideContextFromAuthorizedXml
};
