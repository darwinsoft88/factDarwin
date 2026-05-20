import { paymentOptions } from "../constants/options";
import { calculateTotalDiscount, money } from "../services/sri";
import { AppData } from "../types";
import { accountingMoney } from "./accounting";
import { documentNumber } from "./documents";
import { escapeHtml, formatShortDate, shortText } from "./format";
import { buildSalesReport, subtotalByRate } from "./reports";
import { documentTypeLabel, isCreditNoteSale } from "./sales";

type SalesReport = ReturnType<typeof buildSalesReport>;

export function formatSalesReport(report: SalesReport) {
  const paymentLines = Object.entries(report.byPayment).map(([code, total]) => `${paymentLabel(code)}: $${money(total)}`);
  const invoiceLines = report.sales.map((sale) => `${sale.sequence} | ${sale.status} | ${formatShortDate(sale.createdAt)} | Base contable $${accountingMoney(sale, sale.subtotal)} | Desc. $${accountingMoney(sale, calculateTotalDiscount(sale.items))} | IVA $${accountingMoney(sale, sale.tax)} | Total contable $${accountingMoney(sale, sale.total)} | ${sale.authorizationNumber || sale.accessKey}${sale.voidReason ? ` | ${sale.voidReason}` : ""}${sale.sriMessage ? ` | ${shortText(sale.sriMessage, 120)}` : ""}`);

  return [
    "REPORTE CONTABLE DE VENTAS",
    `Periodo: ${report.label}`,
    `Tipo: ${report.reportType === "tax" ? "Tributario" : "Operativo"}`,
    `Documentos del periodo: ${report.sales.length}`,
    `Documentos con valor: ${report.effectiveCount}`,
    `Facturas autorizadas: ${report.authorizedCount}`,
    `Notas de credito: ${report.creditNoteCount}`,
    `Notas de venta: ${report.internalCount}`,
    `Proformas: ${report.proformaCount}`,
    `Anuladas: ${report.voidedCount}`,
    `Rechazadas: ${report.rejectedCount}`,
    "",
    "RESUMEN TRIBUTARIO",
    `Subtotal gravado 15%: $${money(report.subtotal15)}`,
    `Subtotal tarifa 0%: $${money(report.subtotal0)}`,
    `Total descuentos: $${money(report.discount)}`,
    "Subtotal no objeto de IVA: $0.00",
    "Subtotal exento de IVA: $0.00",
    `Total sin impuestos: $${money(report.subtotal)}`,
    `IVA causado: $${money(report.iva15)}`,
    `Total facturado: $${money(report.total)}`,
    `Retenciones IVA recibidas: $${money(report.retentionIva)}`,
    `Retenciones fuente recibidas: $${money(report.retentionRenta)}`,
    `Total retenciones recibidas: $${money(report.retentionTotal)}`,
    `Neto despues de retenciones: $${money(report.netCollected)}`,
    "",
    "RESUMEN IVA / FORMULARIO 104",
    `Ventas gravadas tarifa diferente de cero - bruto: $${money(report.iva104.salesVatGross)}`,
    `Notas de credito gravadas tarifa diferente de cero: $${money(report.iva104.creditVat)}`,
    `Ventas gravadas tarifa diferente de cero - neto: $${money(report.iva104.salesVatNet)}`,
    `Ventas tarifa 0% - bruto: $${money(report.iva104.salesZeroGross)}`,
    `Notas de credito tarifa 0%: $${money(report.iva104.creditZero)}`,
    `Ventas tarifa 0% - neto: $${money(report.iva104.salesZeroNet)}`,
    `IVA generado neto: $${money(report.iva104.ivaGeneratedNet)}`,
    `Retenciones IVA recibidas: $${money(report.iva104.retentionIva)}`,
    `IVA estimado a pagar sin compras/credito tributario: $${money(report.iva104.estimatedIvaPayable)}`,
    "Nota: no incluye compras, credito tributario anterior, activos fijos, importaciones, ajustes, intereses ni multas.",
    "",
    "FORMAS DE PAGO",
    ...(paymentLines.length ? paymentLines : ["Sin movimientos"]),
    "",
    "FACTURAS",
    ...(invoiceLines.length ? invoiceLines : ["Sin facturas en el periodo."])
  ].join("\n");
}

export function formatIva104Report(report: SalesReport) {
  return [
    "RESUMEN IVA / FORMULARIO 104",
    `Periodo: ${report.label}`,
    "",
    "VENTAS Y NOTAS DE CREDITO",
    `Ventas tarifa diferente de cero - valor bruto: $${money(report.iva104.salesVatGross)}`,
    `Notas de credito tarifa diferente de cero: $${money(report.iva104.creditVat)}`,
    `Ventas tarifa diferente de cero - valor neto: $${money(report.iva104.salesVatNet)}`,
    `Impuesto generado bruto: $${money(report.iva104.ivaGeneratedGross)}`,
    `IVA notas de credito: $${money(report.iva104.ivaCreditNotes)}`,
    `Impuesto generado neto: $${money(report.iva104.ivaGeneratedNet)}`,
    "",
    `Ventas tarifa 0% - valor bruto: $${money(report.iva104.salesZeroGross)}`,
    `Notas de credito tarifa 0%: $${money(report.iva104.creditZero)}`,
    `Ventas tarifa 0% - valor neto: $${money(report.iva104.salesZeroNet)}`,
    "",
    "RETENCIONES Y LIQUIDACION ESTIMADA",
    `Retenciones IVA recibidas: $${money(report.iva104.retentionIva)}`,
    `IVA estimado a pagar: $${money(report.iva104.estimatedIvaPayable)}`,
    `Total ventas netas con IVA incluido: $${money(report.iva104.totalNet)}`,
    "",
    "PENDIENTE PARA 104 FINAL",
    "No incluye compras/adquisiciones, credito tributario anterior, activos fijos, importaciones, ajustes, intereses ni multas."
  ].join("\n");
}

export function buildReportHtml(report: SalesReport, data: AppData) {
  const rows = report.sales
    .map((sale) => {
      const client = data.clients.find((item) => item.id === sale.clientId);
      return `
        <tr>
          <td>${escapeHtml(formatShortDate(sale.createdAt))}</td>
          <td>${escapeHtml(documentTypeLabel(sale))}</td>
          <td>${escapeHtml(documentNumber(sale, data.issuer))}</td>
          <td>${escapeHtml(client?.name || "Cliente")}</td>
          <td>${escapeHtml(sale.status)}</td>
          <td>${escapeHtml(sale.authorizationNumber || sale.accessKey)}</td>
          <td class="right">${accountingMoney(sale, sale.subtotal)}</td>
          <td class="right">${accountingMoney(sale, calculateTotalDiscount(sale.items))}</td>
          <td class="right">${accountingMoney(sale, sale.tax)}</td>
          <td class="right">${accountingMoney(sale, sale.total)}</td>
          <td>${escapeHtml(sale.voidReason || shortText(sale.sriMessage || "", 100))}</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 18px 0 8px; }
    .muted { color: #4b5563; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }
    .box { border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; }
    .label { color: #64748b; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .value { font-size: 15px; font-weight: 800; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; }
    .right { text-align: right; }
  </style>
</head>
<body>
  <h1>Reporte contable de ventas</h1>
  <div class="muted">${escapeHtml(data.issuer.businessName)} | ${escapeHtml(report.label)}</div>
  <div class="grid">
    <div class="box"><div class="label">Tipo reporte</div><div class="value">${report.reportType === "tax" ? "Tributario" : "Operativo"}</div></div>
    <div class="box"><div class="label">Documentos</div><div class="value">${report.sales.length}</div></div>
    <div class="box"><div class="label">Con valor</div><div class="value">${report.effectiveCount}</div></div>
    <div class="box"><div class="label">Autorizadas</div><div class="value">${report.authorizedCount}</div></div>
    <div class="box"><div class="label">Anuladas</div><div class="value">${report.voidedCount}</div></div>
    <div class="box"><div class="label">Subtotal 15%</div><div class="value">$${money(report.subtotal15)}</div></div>
    <div class="box"><div class="label">Subtotal 0%</div><div class="value">$${money(report.subtotal0)}</div></div>
    <div class="box"><div class="label">Descuentos</div><div class="value">$${money(report.discount)}</div></div>
    <div class="box"><div class="label">IVA 15%</div><div class="value">$${money(report.iva15)}</div></div>
    <div class="box"><div class="label">Total sin impuestos</div><div class="value">$${money(report.subtotal)}</div></div>
    <div class="box"><div class="label">Total facturado</div><div class="value">$${money(report.total)}</div></div>
    <div class="box"><div class="label">Ret. IVA recibida</div><div class="value">$${money(report.retentionIva)}</div></div>
    <div class="box"><div class="label">Ret. fuente recibida</div><div class="value">$${money(report.retentionRenta)}</div></div>
    <div class="box"><div class="label">Neto estimado</div><div class="value">$${money(report.netCollected)}</div></div>
    <div class="box"><div class="label">104 gravado neto</div><div class="value">$${money(report.iva104.salesVatNet)}</div></div>
    <div class="box"><div class="label">104 IVA neto</div><div class="value">$${money(report.iva104.ivaGeneratedNet)}</div></div>
    <div class="box"><div class="label">104 IVA a pagar est.</div><div class="value">$${money(report.iva104.estimatedIvaPayable)}</div></div>
  </div>
  <h2>Secuencias del periodo</h2>
  <table>
    <thead>
      <tr><th>Fecha</th><th>Tipo</th><th>Documento</th><th>Cliente</th><th>Estado</th><th>Autorizacion / clave</th><th>Base</th><th>Descuento</th><th>IVA</th><th>Total</th><th>Observacion</th></tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="11">Sin documentos en el periodo.</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

export function buildMobileReportHtml(report: SalesReport, data: AppData) {
  const paymentRows = Object.entries(report.byPayment)
    .map(([code, total]) => `<tr><td>${escapeHtml(paymentLabel(code))}</td><td class="right">$${money(total)}</td></tr>`)
    .join("");
  const documentRows = report.sales.map((sale) => {
    const client = data.clients.find((item) => item.id === sale.clientId);
    return `
      <tr>
        <td>${escapeHtml(formatShortDate(sale.createdAt))}</td>
        <td>${escapeHtml(documentTypeLabel(sale))}</td>
        <td>${escapeHtml(documentNumber(sale, data.issuer))}</td>
        <td>${escapeHtml(client?.name || "")}</td>
        <td>${escapeHtml(sale.status)}</td>
        <td class="right">${accountingMoney(sale, sale.subtotal)}</td>
        <td class="right">${accountingMoney(sale, sale.tax)}</td>
        <td class="right">${accountingMoney(sale, sale.total)}</td>
      </tr>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; background: #f5f7fb; color: #111827; font-family: Arial, sans-serif; font-size: 13px; }
    header { position: sticky; top: 0; background: #0f766e; color: white; padding: 14px 16px; z-index: 2; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { opacity: .9; font-size: 12px; }
    main { padding: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .card { background: white; border: 1px solid #dbe4ee; border-radius: 8px; padding: 10px; }
    .label { color: #64748b; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .value { color: #0f172a; font-size: 17px; font-weight: 900; margin-top: 4px; }
    h2 { font-size: 14px; margin: 18px 0 8px; }
    .table-wrap { overflow-x: auto; background: white; border: 1px solid #dbe4ee; border-radius: 8px; }
    table { min-width: 760px; width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e5edf5; padding: 8px; white-space: nowrap; text-align: left; }
    th { background: #eef6f5; color: #0f766e; font-size: 11px; text-transform: uppercase; }
    .right { text-align: right; }
    .note { color: #475569; font-size: 12px; margin-top: 10px; line-height: 1.4; }
  </style>
</head>
<body>
  <header>
    <h1>Reporte contable de ventas</h1>
    <div class="meta">${escapeHtml(data.issuer.businessName)} | ${escapeHtml(report.label)} | ${report.reportType === "tax" ? "Tributario" : "Operativo"}</div>
  </header>
  <main>
    <section class="grid">
      <div class="card"><div class="label">Documentos</div><div class="value">${report.sales.length}</div></div>
      <div class="card"><div class="label">Con valor</div><div class="value">${report.effectiveCount}</div></div>
      <div class="card"><div class="label">Subtotal</div><div class="value">$${money(report.subtotal)}</div></div>
      <div class="card"><div class="label">IVA</div><div class="value">$${money(report.iva15)}</div></div>
      <div class="card"><div class="label">Total</div><div class="value">$${money(report.total)}</div></div>
      <div class="card"><div class="label">Utilidad</div><div class="value">$${money(report.profit)}</div></div>
      <div class="card"><div class="label">Retenciones</div><div class="value">$${money(report.retentionTotal)}</div></div>
      <div class="card"><div class="label">Neto ret.</div><div class="value">$${money(report.netCollected)}</div></div>
    </section>
    <h2>Formas de pago</h2>
    <div class="table-wrap"><table><thead><tr><th>Forma</th><th class="right">Total</th></tr></thead><tbody>${paymentRows || `<tr><td colspan="2">Sin movimientos</td></tr>`}</tbody></table></div>
    <h2>Documentos del periodo</h2>
    <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Documento</th><th>Cliente</th><th>Estado</th><th class="right">Base</th><th class="right">IVA</th><th class="right">Total</th></tr></thead><tbody>${documentRows || `<tr><td colspan="8">Sin documentos.</td></tr>`}</tbody></table></div>
    <p class="note">Vista optimizada para movil. Para trabajo contable en PC use la descarga Excel desde web.</p>
  </main>
</body>
</html>`;
}

export function buildReportExcelHtml(report: SalesReport, data: AppData) {
  const invoiceRows = report.sales
    .map((sale) => {
      const client = data.clients.find((item) => item.id === sale.clientId);
      const observation = [
        isCreditNoteSale(sale) ? "Nota de credito: valores negativos para reversar ventas/IVA" : "",
        sale.voidReason || shortText(sale.sriMessage || "", 140)
      ].filter(Boolean).join(" | ");
      return `
        <tr>
          <td>${escapeHtml(formatShortDate(sale.createdAt))}</td>
          <td>${escapeHtml(documentTypeLabel(sale))}</td>
          <td>${escapeHtml(documentNumber(sale, data.issuer))}</td>
          <td>${escapeHtml(client?.name || "")}</td>
          <td style="mso-number-format:'\\@';">${escapeHtml(client?.identification || "")}</td>
          <td>${escapeHtml(sale.status)}</td>
          <td style="mso-number-format:'\\@';">${escapeHtml(sale.authorizationNumber || sale.accessKey || "Interno")}</td>
          <td class="number">${accountingMoney(sale, subtotalByRate(sale, 0.15))}</td>
          <td class="number">${accountingMoney(sale, subtotalByRate(sale, 0))}</td>
          <td class="number">${accountingMoney(sale, calculateTotalDiscount(sale.items))}</td>
          <td class="number">${accountingMoney(sale, sale.subtotal)}</td>
          <td class="number">${accountingMoney(sale, sale.tax)}</td>
          <td class="number total">${accountingMoney(sale, sale.total)}</td>
          <td>${escapeHtml(paymentLabel(sale.paymentMethod || "20"))}</td>
          <td>${escapeHtml(observation)}</td>
        </tr>`;
    })
    .join("");
  const paymentRows = Object.entries(report.byPayment)
    .map(
      ([code, total]) => `
        <tr>
          <td colspan="3">${escapeHtml(paymentLabel(code))}</td>
          <td class="number total">${money(total)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #111827; }
    table { border-collapse: collapse; width: 100%; }
    .title { font-size: 22px; font-weight: 800; color: #0f766e; }
    .subtitle { color: #475569; font-size: 12px; }
    .spacer td { height: 10px; border: none; }
    th { background: #0f766e; color: #ffffff; font-weight: 700; text-align: center; }
    td, th { border: 1px solid #cbd5e1; padding: 6px; font-size: 11px; vertical-align: middle; }
    .summary-label { background: #f1f5f9; font-weight: 700; }
    .summary-value { font-weight: 800; text-align: right; }
    .section { background: #e0f2fe; color: #075985; font-weight: 800; font-size: 13px; }
    .number { text-align: right; mso-number-format:"0.00"; }
    .total { font-weight: 800; }
  </style>
</head>
<body>
  <table>
    <tr><td colspan="15" class="title">Reporte contable de ventas</td></tr>
    <tr><td colspan="15" class="subtitle">${escapeHtml(data.issuer.businessName)} | RUC ${escapeHtml(data.issuer.ruc)} | ${escapeHtml(report.label)} | ${report.reportType === "tax" ? "Tributario" : "Operativo"}</td></tr>
    <tr class="spacer"><td colspan="15"></td></tr>
    <tr><td colspan="15" class="section">Resumen</td></tr>
    <tr>
      <td class="summary-label">Documentos periodo</td><td class="summary-value">${report.sales.length}</td>
      <td class="summary-label">Con valor</td><td class="summary-value">${report.effectiveCount}</td>
      <td class="summary-label">Facturas autorizadas</td><td class="summary-value">${report.authorizedCount}</td>
      <td class="summary-label">Notas venta</td><td class="summary-value">${report.internalCount}</td>
      <td class="summary-label">Proformas</td><td class="summary-value">${report.proformaCount}</td>
    </tr>
    <tr>
      <td class="summary-label">Anuladas</td><td class="summary-value">${report.voidedCount}</td>
      <td class="summary-label">Rechazadas</td><td class="summary-value">${report.rejectedCount}</td>
      <td class="summary-label">Subtotal 15%</td><td class="summary-value">${money(report.subtotal15)}</td>
      <td class="summary-label">Subtotal 0%</td><td class="summary-value">${money(report.subtotal0)}</td>
      <td class="summary-label">Descuentos</td><td class="summary-value">${money(report.discount)}</td>
    </tr>
    <tr>
      <td class="summary-label">Subtotal</td><td class="summary-value">${money(report.subtotal)}</td>
      <td class="summary-value">IVA ${money(report.iva15)} | Total ${money(report.total)}</td>
      <td class="summary-label">Ret. IVA</td><td class="summary-value">${money(report.retentionIva)}</td>
      <td class="summary-label">Ret. fuente</td><td class="summary-value">${money(report.retentionRenta)}</td>
      <td class="summary-label">Neto</td><td class="summary-value">${money(report.netCollected)}</td>
    </tr>
    <tr>
      <td class="summary-label">104 ventas gravadas netas</td><td class="summary-value">${money(report.iva104.salesVatNet)}</td>
      <td class="summary-label">104 ventas 0% netas</td><td class="summary-value">${money(report.iva104.salesZeroNet)}</td>
      <td class="summary-label">104 IVA generado neto</td><td class="summary-value">${money(report.iva104.ivaGeneratedNet)}</td>
      <td class="summary-label">104 IVA a pagar est.</td><td class="summary-value">${money(report.iva104.estimatedIvaPayable)}</td>
    </tr>
    <tr class="spacer"><td colspan="15"></td></tr>
    <tr><td colspan="15" class="section">Documentos del periodo</td></tr>
    <tr>
      <th>Fecha</th>
      <th>Tipo</th>
      <th>Documento</th>
      <th>Cliente</th>
      <th>Identificacion</th>
      <th>Estado</th>
      <th>Autorizacion</th>
      <th>Subtotal 15%</th>
      <th>Subtotal 0%</th>
      <th>Descuento</th>
      <th>Subtotal</th>
      <th>IVA</th>
      <th>Total</th>
      <th>Forma pago</th>
      <th>Observacion</th>
    </tr>
    ${invoiceRows || `<tr><td colspan="15">Sin documentos en el periodo.</td></tr>`}
    <tr class="spacer"><td colspan="15"></td></tr>
    <tr><td colspan="4" class="section">Formas de pago con valor</td><td colspan="11"></td></tr>
    <tr><th colspan="3">Forma de pago</th><th>Total</th><td colspan="11"></td></tr>
    ${paymentRows || `<tr><td colspan="4">Sin movimientos</td><td colspan="11"></td></tr>`}
  </table>
</body>
</html>`;
}

export function buildReportCsv(report: SalesReport, data: AppData) {
  const rows = [
    ["Reporte contable de ventas"],
    [data.issuer.businessName, `RUC ${data.issuer.ruc}`, report.label, report.reportType === "tax" ? "Tributario" : "Operativo"],
    [],
    ["Resumen"],
    ["Documentos periodo", report.sales.length],
    ["Con valor", report.effectiveCount],
    ["Facturas autorizadas", report.authorizedCount],
    ["Notas credito", report.creditNoteCount],
    ["Notas venta", report.internalCount],
    ["Proformas", report.proformaCount],
    ["Anuladas", report.voidedCount],
    ["Rechazadas", report.rejectedCount],
    ["Subtotal 15%", money(report.subtotal15)],
    ["Subtotal 0%", money(report.subtotal0)],
    ["Descuentos", money(report.discount)],
    ["Subtotal", money(report.subtotal)],
    ["IVA", money(report.iva15)],
    ["Total", money(report.total)],
    ["Ret. IVA", money(report.retentionIva)],
    ["Ret. fuente", money(report.retentionRenta)],
    ["Neto", money(report.netCollected)],
    ["104 ventas gravadas netas", money(report.iva104.salesVatNet)],
    ["104 ventas 0% netas", money(report.iva104.salesZeroNet)],
    ["104 IVA generado neto", money(report.iva104.ivaGeneratedNet)],
    ["104 IVA a pagar est.", money(report.iva104.estimatedIvaPayable)],
    [],
    ["Documentos del periodo"],
    ["Fecha", "Tipo", "Documento", "Cliente", "Identificacion", "Estado", "Autorizacion", "Subtotal 15%", "Subtotal 0%", "Descuento", "Subtotal", "IVA", "Total", "Forma pago", "Observacion"],
    ...report.sales.map((sale) => {
      const client = data.clients.find((item) => item.id === sale.clientId);
      const observation = [
        isCreditNoteSale(sale) ? "Nota de credito: valores negativos para reversar ventas/IVA" : "",
        sale.voidReason || shortText(sale.sriMessage || "", 140)
      ].filter(Boolean).join(" | ");

      return [
        formatShortDate(sale.createdAt),
        documentTypeLabel(sale),
        documentNumber(sale, data.issuer),
        client?.name || "",
        client?.identification || "",
        sale.status,
        sale.authorizationNumber || sale.accessKey || "Interno",
        accountingMoney(sale, subtotalByRate(sale, 0.15)),
        accountingMoney(sale, subtotalByRate(sale, 0)),
        accountingMoney(sale, calculateTotalDiscount(sale.items)),
        accountingMoney(sale, sale.subtotal),
        accountingMoney(sale, sale.tax),
        accountingMoney(sale, sale.total),
        paymentLabel(sale.paymentMethod || "20"),
        observation
      ];
    }),
    [],
    ["Formas de pago con valor"],
    ["Forma de pago", "Total"],
    ...Object.entries(report.byPayment).map(([code, total]) => [paymentLabel(code), money(total)])
  ];

  return rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export function paymentLabel(value: string) {
  return paymentOptions.find((option) => option.value === value)?.label || value;
}
