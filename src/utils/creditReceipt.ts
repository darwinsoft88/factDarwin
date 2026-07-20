import { Client, CreditPayment, Issuer, Sale } from "../types";
import { calculateLineDiscount, calculateLineTotal, calculateTotalDiscount, money } from "../sri";
import { creditBalance } from "./credit";
import { documentNumber } from "./documents";
import { escapeHtml, formatShortDate } from "./format";
import { paymentLabel } from "./reportFormats";

export function buildCreditPaymentReceiptHtml({
  client,
  issuer,
  payment,
  sale
}: {
  client: Client;
  issuer: Issuer;
  payment: CreditPayment;
  sale: Sale;
}) {
  const balance = creditBalance(sale);
  const paidTotal = Math.max(0, sale.total - balance);
  const receiptNumber = `REC-${payment.createdAt.slice(0, 10).replace(/-/g, "")}-${payment.id.slice(-6).toUpperCase()}`;
  const note = payment.note?.trim();

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Recibo de abono ${escapeHtml(receiptNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; width: 80mm; background: #fff; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; line-height: 1.3; }
    .receipt { width: 80mm; padding: 4mm 4mm 5mm; background: #fff; }
    .center { text-align: center; }
    .company { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; }
    .muted { color: #475569; font-size: 10px; overflow-wrap: anywhere; }
    .title { margin-top: 7px; padding: 6px 0; border-top: 1px dashed #94a3b8; border-bottom: 1px dashed #94a3b8; text-align: center; }
    .title h1 { margin: 0 0 3px; font-size: 13px; color: #0f766e; }
    .title .number { font-size: 10px; font-weight: 800; color: #111827; overflow-wrap: anywhere; }
    .section { padding: 7px 0; border-bottom: 1px dashed #cbd5e1; }
    .label { color: #334155; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    .value { margin-top: 2px; font-size: 11px; font-weight: 800; overflow-wrap: anywhere; }
    .row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
    .row span:first-child { color: #475569; }
    .row strong, .row span:last-child { text-align: right; }
    .paid { color: #0f766e; font-weight: 900; }
    .balance { color: ${balance > 0 ? "#b45309" : "#15803d"}; font-size: 14px; font-weight: 900; }
    .concept { padding: 6px 0; }
    .total-row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-top: 1px solid #e5e7eb; }
    .total-row:first-child { border-top: 0; }
    .footer { padding-top: 8px; color: #64748b; font-size: 9px; text-align: center; }
    @media screen { body { background: #f8fafc; padding: 10px; width: auto; } .receipt { margin: 0 auto; border: 1px solid #d8e1ec; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <div class="company">${escapeHtml(issuer.tradeName || issuer.businessName)}</div>
      <div class="muted">${escapeHtml(issuer.businessName)}</div>
      <div class="muted">RUC ${escapeHtml(issuer.ruc)}</div>
      <div class="muted">${escapeHtml(issuer.address || "")}</div>
    </div>
    <div class="title">
      <h1>RECIBO DE ABONO</h1>
      <div class="number">${escapeHtml(receiptNumber)}</div>
      <div class="muted">Fecha: ${escapeHtml(formatShortDate(payment.createdAt))}</div>
    </div>

    <div class="section">
      <div class="label">Cliente</div>
      <div class="value">${escapeHtml(client.name)}</div>
      <div class="muted">${escapeHtml(client.identification)}${client.email ? ` | ${escapeHtml(client.email)}` : ""}</div>
      <div class="muted">${escapeHtml(client.address || "")}</div>
    </div>

    <div class="section">
      <div class="row"><span>Documento</span><strong>${escapeHtml(documentNumber(sale, issuer))}</strong></div>
      <div class="row"><span>Tipo</span><strong>${escapeHtml(sale.documentType === "nota_venta" ? "Nota de venta" : "Factura")}</strong></div>
      <div class="row"><span>Vence</span><strong>${escapeHtml(sale.creditDueDate ? formatShortDate(sale.creditDueDate) : "Sin fecha")}</strong></div>
    </div>

    <div class="section">
      <div class="concept">
        <div class="label">Concepto</div>
        <div class="value">Abono a credito</div>
      </div>
      <div class="row"><span>Forma de cobro</span><strong>${escapeHtml(paymentLabel(payment.paymentMethod))}</strong></div>
      <div class="row"><span>Valor abonado</span><strong class="paid">$${money(payment.amount)}</strong></div>
    </div>

    <div class="section">
      <div class="total-row"><span>Total documento</span><strong>$${money(sale.total)}</strong></div>
      <div class="total-row"><span>Total abonado</span><strong>$${money(paidTotal)}</strong></div>
      <div class="total-row"><span>Saldo pendiente</span><span class="balance">$${money(balance)}</span></div>
    </div>

    <div class="section">
      <div class="label">Observacion</div>
      <div class="value">${escapeHtml(note || "Abono registrado correctamente.")}</div>
      <div class="muted">Registrado por ${escapeHtml(payment.userName || "Usuario")}</div>
    </div>

    <div class="footer">
      Este recibo respalda el abono registrado en FactuDarwin. No reemplaza un comprobante tributario autorizado por el SRI.
    </div>
  </div>
</body>
</html>`;
}

export function estimateCreditPaymentReceiptHeightMm({
  client,
  payment
}: {
  client: Client;
  payment: CreditPayment;
}) {
  const clientLines = estimateWrappedLines(`${client.name} ${client.identification} ${client.email || ""} ${client.address || ""}`, 34);
  const noteLines = estimateWrappedLines(payment.note || "", 34);
  return clampReceiptHeight(145 + clientLines * 4 + noteLines * 4, 135, 260);
}

export function buildCreditSaleDetailTicketHtml({
  client,
  issuer,
  sale
}: {
  client: Client;
  issuer: Issuer;
  sale: Sale;
}) {
  const balance = creditBalance(sale);
  const paidTotal = Math.max(0, sale.total - balance);
  const rows = sale.items.map((item) => `
    <div class="item">
      <div class="item-main">
        <strong>${escapeHtml(item.name)}</strong>
        <strong>$${money(calculateLineTotal(item))}</strong>
      </div>
      <div class="muted">${escapeHtml(item.code)} | Cant. ${money(item.quantity)} x $${money(item.unitPrice)}</div>
      ${calculateLineDiscount(item) > 0 ? `<div class="muted">Desc. $${money(calculateLineDiscount(item))}</div>` : ""}
    </div>`
  ).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Detalle credito ${escapeHtml(documentNumber(sale, issuer))}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; width: 80mm; background: #fff; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; line-height: 1.3; }
    .receipt { width: 80mm; padding: 4mm 4mm 5mm; background: #fff; }
    .center { text-align: center; }
    .company { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; }
    .muted { color: #475569; font-size: 10px; overflow-wrap: anywhere; }
    .title { margin-top: 7px; padding: 6px 0; border-top: 1px dashed #94a3b8; border-bottom: 1px dashed #94a3b8; text-align: center; }
    .title h1 { margin: 0 0 3px; font-size: 13px; color: #0f766e; }
    .number { font-size: 10px; font-weight: 800; color: #111827; overflow-wrap: anywhere; }
    .section { padding: 7px 0; border-bottom: 1px dashed #cbd5e1; }
    .label { color: #334155; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    .value { margin-top: 2px; font-size: 11px; font-weight: 800; overflow-wrap: anywhere; }
    .row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
    .row span:first-child { color: #475569; }
    .row strong, .row span:last-child { text-align: right; }
    .item { padding: 5px 0; border-top: 1px solid #e5e7eb; }
    .item:first-child { border-top: 0; }
    .item-main { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
    .item-main strong:first-child { max-width: 48mm; overflow-wrap: anywhere; }
    .item-main strong:last-child { white-space: nowrap; text-align: right; }
    .total { color: #0f766e; font-size: 15px; font-weight: 900; }
    .balance { color: ${balance > 0 ? "#b45309" : "#15803d"}; font-size: 14px; font-weight: 900; }
    .footer { padding-top: 8px; color: #64748b; font-size: 9px; text-align: center; }
    @media screen { body { background: #f8fafc; padding: 10px; width: auto; } .receipt { margin: 0 auto; border: 1px solid #d8e1ec; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <div class="company">${escapeHtml(issuer.tradeName || issuer.businessName)}</div>
      <div class="muted">${escapeHtml(issuer.businessName)}</div>
      <div class="muted">RUC ${escapeHtml(issuer.ruc)}</div>
      <div class="muted">${escapeHtml(issuer.address || "")}</div>
    </div>
    <div class="title">
      <h1>DETALLE DE CREDITO</h1>
      <div class="number">${escapeHtml(documentNumber(sale, issuer))}</div>
      <div class="muted">Fecha: ${escapeHtml(formatShortDate(sale.createdAt))}</div>
    </div>

    <div class="section">
      <div class="label">Cliente</div>
      <div class="value">${escapeHtml(client.name)}</div>
      <div class="muted">${escapeHtml(client.identification)}${client.email ? ` | ${escapeHtml(client.email)}` : ""}</div>
      <div class="muted">${escapeHtml(client.address || "")}</div>
    </div>

    <div class="section">
      <div class="row"><span>Documento</span><strong>${escapeHtml(documentNumber(sale, issuer))}</strong></div>
      <div class="row"><span>Tipo</span><strong>${escapeHtml(sale.documentType === "nota_venta" ? "Nota de venta" : "Factura")}</strong></div>
      <div class="row"><span>Vence</span><strong>${escapeHtml(sale.creditDueDate ? formatShortDate(sale.creditDueDate) : "Sin fecha")}</strong></div>
    </div>

    <div class="section">
      <div class="label">Productos / servicios</div>
      ${rows}
    </div>

    <div class="section">
      <div class="row"><span>Subtotal</span><strong>$${money(sale.subtotal)}</strong></div>
      ${calculateTotalDiscount(sale.items) > 0 ? `<div class="row"><span>Descuento</span><strong>$${money(calculateTotalDiscount(sale.items))}</strong></div>` : ""}
      <div class="row"><span>IVA</span><strong>$${money(sale.tax)}</strong></div>
      <div class="row"><span class="total">Total documento</span><strong class="total">$${money(sale.total)}</strong></div>
      <div class="row"><span>Total abonado</span><strong>$${money(paidTotal)}</strong></div>
      <div class="row"><span>Saldo pendiente</span><span class="balance">$${money(balance)}</span></div>
    </div>

    <div class="footer">
      Detalle informativo de la cuenta por cobrar. Para comprobante tributario use el RIDE autorizado por el SRI.
    </div>
  </div>
</body>
</html>`;
}

export function estimateCreditSaleDetailHeightMm({
  client,
  sale
}: {
  client: Client;
  sale: Sale;
}) {
  const clientLines = estimateWrappedLines(`${client.name} ${client.identification} ${client.email || ""} ${client.address || ""}`, 34);
  const itemLines = sale.items.reduce((sum, item) => sum + Math.max(1, Math.ceil(String(item.name || "").length / 24)), 0);
  return clampReceiptHeight(142 + clientLines * 4 + itemLines * 10, 145, 520);
}

export function buildCreditPaymentsReceiptHtml({
  client,
  issuer,
  payments,
  sales
}: {
  client: Client;
  issuer: Issuer;
  payments: CreditPayment[];
  sales: Sale[];
}) {
  const firstPayment = payments[0];
  const receiptNumber = firstPayment ? `COB-${firstPayment.createdAt.slice(0, 10).replace(/-/g, "")}-${firstPayment.id.slice(-6).toUpperCase()}` : "COB-SIN-ID";
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const paymentMethod = firstPayment ? paymentLabel(firstPayment.paymentMethod) : "";
  const note = firstPayment?.note?.trim();
  const salesById = new Map(sales.map((sale) => [sale.id, sale]));
  const balance = Array.from(new Set(payments.map((payment) => payment.saleId))).reduce((sum, saleId) => {
    const sale = salesById.get(saleId);
    return sum + (sale ? creditBalance(sale) : 0);
  }, 0);
  const rows = payments.map((payment) => {
    const sale = salesById.get(payment.saleId);
    return `<div class="invoice-row">
      <div>
        <div class="value">${escapeHtml(sale ? documentNumber(sale, issuer) : "Documento")}</div>
        <div class="muted">${escapeHtml(sale?.creditDueDate ? `Vence ${formatShortDate(sale.creditDueDate)}` : sale ? `Emitida ${formatShortDate(sale.createdAt)}` : "")}</div>
      </div>
      <strong>$${money(payment.amount)}</strong>
    </div>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Comprobante de cobro ${escapeHtml(receiptNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; width: 80mm; background: #fff; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; line-height: 1.3; }
    .receipt { width: 80mm; padding: 4mm 4mm 5mm; background: #fff; }
    .center { text-align: center; }
    .company { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; }
    .muted { color: #475569; font-size: 10px; overflow-wrap: anywhere; }
    .title { margin-top: 7px; padding: 6px 0; border-top: 1px dashed #94a3b8; border-bottom: 1px dashed #94a3b8; text-align: center; }
    .title h1 { margin: 0 0 3px; font-size: 13px; color: #0f766e; }
    .number { font-size: 10px; font-weight: 800; color: #111827; overflow-wrap: anywhere; }
    .section { padding: 7px 0; border-bottom: 1px dashed #cbd5e1; }
    .label { color: #334155; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    .value { margin-top: 2px; font-size: 11px; font-weight: 800; overflow-wrap: anywhere; }
    .row, .invoice-row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
    .row span:first-child { color: #475569; }
    .row strong, .row span:last-child, .invoice-row strong { text-align: right; }
    .invoice-row { border-top: 1px solid #e5e7eb; align-items: flex-start; }
    .invoice-row:first-child { border-top: 0; }
    .paid { color: #0f766e; font-size: 15px; font-weight: 900; }
    .footer { padding-top: 8px; color: #64748b; font-size: 9px; text-align: center; }
    @media screen { body { background: #f8fafc; padding: 10px; width: auto; } .receipt { margin: 0 auto; border: 1px solid #d8e1ec; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <div class="company">${escapeHtml(issuer.tradeName || issuer.businessName)}</div>
      <div class="muted">${escapeHtml(issuer.businessName)}</div>
      <div class="muted">RUC ${escapeHtml(issuer.ruc)}</div>
      <div class="muted">${escapeHtml(issuer.address || "")}</div>
    </div>
    <div class="title">
      <h1>COMPROBANTE DE COBRO</h1>
      <div class="number">${escapeHtml(receiptNumber)}</div>
      <div class="muted">Fecha: ${escapeHtml(firstPayment ? formatShortDate(firstPayment.createdAt) : "")}</div>
    </div>

    <div class="section">
      <div class="label">Cliente</div>
      <div class="value">${escapeHtml(client.name)}</div>
      <div class="muted">${escapeHtml(client.identification)}${client.email ? ` | ${escapeHtml(client.email)}` : ""}</div>
      <div class="muted">${escapeHtml(client.address || "")}</div>
    </div>

    <div class="section">
      <div class="row"><span>Forma de cobro</span><strong>${escapeHtml(paymentMethod)}</strong></div>
      <div class="row"><span>Documentos</span><strong>${payments.length}</strong></div>
    </div>

    <div class="section">
      <div class="label">Facturas cobradas</div>
      ${rows}
    </div>

    <div class="section">
      <div class="row"><span>Total cobrado</span><strong class="paid">$${money(totalPaid)}</strong></div>
      <div class="row"><span>Saldo pendiente</span><strong class="balance">$${money(balance)}</strong></div>
    </div>

    <div class="section">
      <div class="label">Observacion</div>
      <div class="value">${escapeHtml(note || "Cobro multiple registrado correctamente.")}</div>
      <div class="muted">Registrado por ${escapeHtml(firstPayment?.userName || "Usuario")}</div>
    </div>

    <div class="footer">
      Este comprobante respalda el cobro registrado en FactuDarwin. No reemplaza un comprobante tributario autorizado por el SRI.
    </div>
  </div>
</body>
</html>`;
}

export function estimateCreditPaymentsReceiptHeightMm({
  client,
  payments
}: {
  client: Client;
  payments: CreditPayment[];
}) {
  const firstPayment = payments[0];
  const clientLines = estimateWrappedLines(`${client.name} ${client.identification} ${client.email || ""} ${client.address || ""}`, 34);
  const noteLines = estimateWrappedLines(firstPayment?.note || "", 34);
  return clampReceiptHeight(142 + payments.length * 12 + clientLines * 4 + noteLines * 4, 150, 520);
}

function estimateWrappedLines(text: string, charsPerLine: number) {
  const clean = text.trim();
  if (!clean) return 0;
  return Math.max(1, Math.ceil(clean.length / charsPerLine));
}

function clampReceiptHeight(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.ceil(value)));
}
