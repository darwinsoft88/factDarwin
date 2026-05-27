import { buildRemissionGuideXml, calculateLineDiscount, calculateLineSubtotal, calculateLineTax, calculateLineTotal, money } from "../services/sri";
import { Client, Issuer, RemissionGuide, Sale } from "../types";
import { documentNumber } from "./documents";
import { escapeHtml, formatGuideDate, formatShortDate } from "./format";
import { estimateTicketPageHeightMm } from "./printFiles";
import { issuerTaxRegimeLabel } from "./taxRegime";

export function buildInternalTicketHtml(sale: Sale, client: Client, issuer: Issuer, pageHeightMm = estimateTicketPageHeightMm(sale)) {
  const taxRegimeLegend = issuerTaxRegimeLabel(issuer);
  const rows = sale.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td class="right">${money(item.quantity)}</td>
          <td class="right">${money(calculateLineTotal(item) / item.quantity)}</td>
          <td class="right">${money(calculateLineTotal(item))}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 80mm ${pageHeightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 80mm; min-height: ${pageHeightMm}mm; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; margin: 0; padding: 3mm; background: #e5e7eb; }
    .ticket { width: 74mm; margin: 0 auto; padding: 4mm 3mm; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; }
    h1 { font-size: 15px; text-align: center; margin: 0 0 4px; }
    .center { text-align: center; }
    .muted { color: #64748b; font-size: 10px; }
    .line { border-top: 1px dashed #94a3b8; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { padding: 4px 0; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    th { text-align: left; font-size: 10px; }
    th:nth-child(2), th:nth-child(3), th:nth-child(4) { width: 17mm; }
    td { overflow-wrap: anywhere; }
    .right { text-align: right; }
    .total { font-size: 15px; font-weight: 800; }
    .meta { line-height: 1.35; overflow-wrap: anywhere; }
    @media screen { .ticket { box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); } }
    @media print {
      html, body { width: 80mm; min-height: ${pageHeightMm}mm; }
      body { padding: 0; background: #ffffff; }
      .ticket { width: 74mm; margin: 0 auto; padding: 3mm; border: 0; border-radius: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <h1>${escapeHtml(issuer.tradeName || issuer.businessName)}</h1>
    <div class="center muted">${escapeHtml(issuer.businessName)}</div>
    <div class="center muted">RUC ${escapeHtml(issuer.ruc)}</div>
    ${taxRegimeLegend ? `<div class="center muted">${escapeHtml(taxRegimeLegend)}</div>` : ""}
    <div class="center muted">${escapeHtml(issuer.address)}</div>
    <div class="line"></div>
    <div class="meta"><strong>TICKET OFFLINE</strong></div>
    <div class="meta">No. ${escapeHtml(documentNumber(sale, issuer))}</div>
    <div class="meta">Fecha: ${escapeHtml(formatShortDate(sale.createdAt))}</div>
    <div class="meta">Cliente: ${escapeHtml(client.name)}</div>
    <div class="meta">Identificacion: ${escapeHtml(client.identification)}</div>
    <div class="line"></div>
    <table>
      <thead><tr><th>Producto</th><th class="right">Cant.</th><th class="right">P.Unit</th><th class="right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="line"></div>
    <table>
      <tr><td>Subtotal</td><td class="right">${money(sale.subtotal)}</td></tr>
      <tr><td>IVA ref.</td><td class="right">${money(sale.tax)}</td></tr>
      <tr><td class="total">TOTAL</td><td class="right total">${money(sale.total)}</td></tr>
    </table>
    <div class="line"></div>
    <div class="center muted">Documento interno no tributario</div>
  </div>
</body>
</html>`;
}

export function buildProformaHtml(sale: Sale, client: Client, issuer: Issuer) {
  const taxRegimeLegend = issuerTaxRegimeLabel(issuer);
  const rows = sale.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="right">${money(item.quantity)}</td>
          <td class="right">${money(calculateLineSubtotal(item) / item.quantity)}</td>
          <td class="right">${money(calculateLineDiscount(item))}</td>
          <td class="right">${money(calculateLineTax(item))}</td>
          <td class="right">${money(calculateLineTotal(item))}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; margin: 0; padding: 12px; background: #e5e7eb; }
    .sheet { width: min(196mm, calc(100vw - 24px)); min-height: 276mm; margin: 0 auto; padding: 6mm; background: #ffffff; overflow: hidden; }
    h1 { font-size: 22px; margin: 0 0 6px; color: #0f766e; letter-spacing: 0; }
    .top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(62mm, 82mm); gap: 10px; border-bottom: 2px solid #0f766e; padding-bottom: 10px; align-items: start; }
    .muted { color: #64748b; overflow-wrap: anywhere; }
    .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 9px; margin-top: 10px; overflow-wrap: anywhere; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #f1f5f9; text-align: left; font-size: 10px; }
    th:nth-child(1) { width: 24mm; }
    th:nth-child(3) { width: 18mm; }
    th:nth-child(4), th:nth-child(5), th:nth-child(6), th:nth-child(7) { width: 22mm; }
    .right { text-align: right; }
    .total { font-size: 18px; font-weight: 800; }
    .note { margin-top: 14px; color: #64748b; font-size: 11px; }
    @media screen { .sheet { box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); } }
    @media (max-width: 760px) {
      body { padding: 8px; }
      .sheet { width: calc(100vw - 16px); padding: 12px; min-height: auto; }
      .top, .grid { grid-template-columns: 1fr; }
      h1 { font-size: 20px; }
      table { font-size: 10px; }
      th, td { padding: 5px; }
      th:nth-child(1) { width: 62px; }
      th:nth-child(3) { width: 52px; }
      th:nth-child(4), th:nth-child(5), th:nth-child(6), th:nth-child(7) { width: 58px; }
    }
    @media print {
      body { padding: 0; background: #ffffff; }
      .sheet { width: 100%; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
  <div class="top">
    <div>
      <h1>PROFORMA</h1>
      <div class="muted">No. ${escapeHtml(documentNumber(sale, issuer))}</div>
      <div class="muted">Fecha: ${escapeHtml(formatShortDate(sale.createdAt))}</div>
    </div>
    <div class="right">
      <strong>${escapeHtml(issuer.businessName)}</strong><br/>
      RUC ${escapeHtml(issuer.ruc)}<br/>
      ${taxRegimeLegend ? `${escapeHtml(taxRegimeLegend)}<br/>` : ""}
      ${escapeHtml(issuer.address)}
    </div>
  </div>
  <div class="grid">
    <div class="box">
      <strong>Cliente</strong><br/>
      ${escapeHtml(client.name)}<br/>
      ${escapeHtml(client.identification)}<br/>
      ${escapeHtml(client.address)}
    </div>
    <div class="box">
      <strong>Resumen</strong><br/>
      Subtotal: $${money(sale.subtotal)}<br/>
      IVA referencial: $${money(sale.tax)}<br/>
      <span class="total">Total: $${money(sale.total)}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>Codigo</th><th>Descripcion</th><th class="right">Cant.</th><th class="right">P.Unit</th><th class="right">Desc.</th><th class="right">IVA</th><th class="right">Total</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="note">Documento comercial no tributario. No descuenta inventario y no reemplaza factura autorizada.</div>
  </div>
</body>
</html>`;
}

export function buildCreditNoteRideHtml(sale: Sale, client: Client, issuer: Issuer, source?: Sale) {
  const taxRegimeLegend = issuerTaxRegimeLabel(issuer);
  const creditNoteNumber = `${issuer.establishment}-${issuer.emissionPoint}-${sale.sequence}`;
  const authorization = sale.authorizationNumber || sale.accessKey;
  const supportNumber = sale.supportDocumentNumber || (source ? documentNumber(source, issuer) : "");
  const supportAuthorization = sale.supportAuthorizationNumber || source?.authorizationNumber || "";
  const rows = sale.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="right">${money(item.quantity)}</td>
          <td class="right">${money(item.unitPrice)}</td>
          <td class="right">${money(calculateLineDiscount(item))}</td>
          <td class="right">${money(calculateLineTax(item))}</td>
          <td class="right">${money(calculateLineTotal(item))}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; margin: 0; padding: 12px; background: #e5e7eb; }
    .sheet { width: min(196mm, calc(100vw - 24px)); min-height: 276mm; margin: 0 auto; padding: 6mm; background: #ffffff; overflow: hidden; }
    h1 { font-size: 22px; margin: 0 0 6px; color: #1d4ed8; letter-spacing: 0; }
    .top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(72mm, 88mm); gap: 10px; align-items: stretch; }
    .issuer { border: 1.5px solid #1d4ed8; border-radius: 6px; padding: 10px; min-height: 42mm; }
    .doc { border: 1.5px solid #1d4ed8; border-radius: 6px; padding: 10px; min-height: 42mm; }
    .company { font-size: 15px; font-weight: 800; margin-bottom: 6px; text-transform: uppercase; }
    .issuer-line { margin-top: 4px; }
    .issuer-label { color: #475569; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .issuer-value { color: #111827; font-weight: 700; overflow-wrap: anywhere; }
    .label { color: #475569; font-size: 10px; font-weight: 700; margin-top: 5px; }
    .value { color: #111827; font-weight: 700; overflow-wrap: anywhere; word-break: break-word; }
    .auth { font-size: 9px; line-height: 1.25; }
    .muted { color: #64748b; }
    .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 9px; margin-top: 10px; min-height: 25mm; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
    th { background: #eff6ff; text-align: left; }
    th:nth-child(1) { width: 24mm; }
    th:nth-child(3), th:nth-child(4), th:nth-child(5), th:nth-child(6), th:nth-child(7) { width: 22mm; }
    .right { text-align: right; }
    .totalPanel { margin-top: 10px; margin-left: auto; width: 70mm; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; }
    .totalRow { display: flex; justify-content: space-between; padding: 7px 9px; border-bottom: 1px solid #e5e7eb; }
    .totalRow:last-child { border-bottom: 0; background: #eff6ff; color: #1d4ed8; font-size: 15px; font-weight: 900; }
    .note { margin-top: 12px; color: #64748b; font-size: 10px; }
    @media screen { .sheet { box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); } }
    @media print {
      body { padding: 0; background: #ffffff; }
      .sheet { width: 100%; min-height: auto; padding: 0; box-shadow: none; }
    }
    @media (max-width: 760px) {
      body { padding: 8px; }
      .sheet { width: calc(100vw - 16px); padding: 12px; }
      .top, .grid { grid-template-columns: 1fr; }
      .totalPanel { width: 100%; }
      table { font-size: 10px; }
      th, td { padding: 5px; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="issuer">
        <div class="company">${escapeHtml(issuer.businessName)}</div>
        ${issuer.tradeName ? `<div class="issuer-line"><span class="issuer-label">Nombre comercial:</span> <span class="issuer-value">${escapeHtml(issuer.tradeName)}</span></div>` : ""}
        <div class="issuer-line"><span class="issuer-label">RUC:</span> <span class="issuer-value">${escapeHtml(issuer.ruc)}</span></div>
        <div class="issuer-line"><span class="issuer-label">Dir. Matriz:</span> <span class="issuer-value">${escapeHtml(issuer.address)}</span></div>
        <div class="issuer-line"><span class="issuer-label">Dir. Sucursal:</span> <span class="issuer-value">${escapeHtml(issuer.address)}</span></div>
        <div class="issuer-line"><span class="issuer-label">Obligado a llevar contabilidad:</span> <span class="issuer-value">${issuer.accountingRequired}</span></div>
        ${issuer.specialTaxpayer === "SI" && issuer.specialTaxpayerResolution ? `<div class="issuer-line"><span class="issuer-label">Contribuyente especial:</span> <span class="issuer-value">${escapeHtml(issuer.specialTaxpayerResolution)}</span></div>` : ""}
        ${issuer.retentionAgent === "SI" && issuer.retentionAgentResolution ? `<div class="issuer-line"><span class="issuer-label">Agente de retencion Resolucion No.:</span> <span class="issuer-value">${escapeHtml(issuer.retentionAgentResolution)}</span></div>` : ""}
        ${taxRegimeLegend ? `<div class="issuer-line"><span class="issuer-label">Regimen:</span> <span class="issuer-value">${escapeHtml(taxRegimeLegend)}</span></div>` : ""}
      </div>
      <div class="doc">
        <h1>NOTA DE CREDITO</h1>
        <div class="label">No.</div>
        <div class="value">${escapeHtml(creditNoteNumber)}</div>
        <div class="label">Numero de autorizacion</div>
        <div class="value auth">${escapeHtml(authorization)}</div>
        <div class="label">Fecha autorizacion</div>
        <div class="value">${escapeHtml(formatShortDate(sale.authorizationDate || sale.createdAt))}</div>
        <div class="label">Clave de acceso</div>
        <div class="value auth">${escapeHtml(sale.accessKey)}</div>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <strong>Cliente</strong><br/>
        ${escapeHtml(client.name)}<br/>
        Identificacion: ${escapeHtml(client.identification)}<br/>
        Direccion: ${escapeHtml(client.address)}
      </div>
      <div class="box">
        <strong>Factura modificada</strong><br/>
        Documento: ${escapeHtml(supportNumber)}<br/>
        Autorizacion: <span class="auth">${escapeHtml(supportAuthorization)}</span><br/>
        Motivo: ${escapeHtml(sale.creditReason || "Anulacion total de factura")}
      </div>
    </div>

    <table>
      <thead>
        <tr><th>Codigo</th><th>Descripcion</th><th class="right">Cant.</th><th class="right">P.Unit</th><th class="right">Desc.</th><th class="right">IVA</th><th class="right">Total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totalPanel">
      <div class="totalRow"><span>Subtotal</span><strong>$${money(sale.subtotal)}</strong></div>
      <div class="totalRow"><span>IVA</span><strong>$${money(sale.tax)}</strong></div>
      <div class="totalRow"><span>Valor modificacion</span><strong>$${money(sale.total)}</strong></div>
    </div>
    <div class="note">Documento tributario electronico que modifica total o parcialmente una factura autorizada.</div>
  </div>
</body>
</html>`;
}

export function formatGuideDetail(guide: RemissionGuide, client: Client | undefined, issuer: Issuer, source?: Sale) {
  return [
    "GUIA DE REMISION",
    `Estado: ${guide.status}`,
    `Destinatario: ${client?.name || "Cliente"}`,
    `Secuencial: ${issuer.establishment}-${issuer.emissionPoint}-${guide.sequence}`,
    `Clave de acceso: ${guide.accessKey}`,
    guide.authorizationNumber ? `Numero autorizacion: ${guide.authorizationNumber}` : "",
    guide.authorizationDate ? `Fecha autorizacion: ${guide.authorizationDate}` : "",
    guide.sriEnvironment ? `Ambiente SRI: ${guide.sriEnvironment}` : "",
    guide.sriMessage ? `Mensaje SRI: ${guide.sriMessage}` : "",
    `Transportista: ${guide.transporterName}`,
    `Identificacion transportista: ${guide.transporterIdentification}`,
    `Placa: ${guide.plate}`,
    `Ruta: ${guide.route}`,
    `Motivo: ${guide.reason}`,
    "",
    guide.authorizedXml ? "XML AUTORIZADO" : guide.signedXml ? "XML FIRMADO" : "XML GENERADO",
    guide.authorizedXml || guide.signedXml || (client ? buildRemissionGuideXml(guide, client, issuer, source) : "")
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildGuideRideHtml(guide: RemissionGuide, client: Client, issuer: Issuer, source?: Sale) {
  const taxRegimeLegend = issuerTaxRegimeLabel(issuer);
  const guideNumber = `${issuer.establishment}-${issuer.emissionPoint}-${guide.sequence}`;
  const environment = guide.sriEnvironment || (issuer.environment === "1" ? "PRUEBAS" : "PRODUCCION");
  const authorization = guide.authorizationNumber || guide.accessKey;
  const sourceNumber = source ? documentNumber(source, issuer) : "Sin sustento";
  const rows = guide.items
    .map(
      (item) => `
        <tr>
          <td class="center">${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="right">${money(item.quantity)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 9mm; }
    body { font-family: Arial, sans-serif; color: #000; font-size: 10.5px; margin: 0; background: #fff; }
    .sheet { width: 194mm; min-height: 279mm; margin: 0 auto; box-sizing: border-box; }
    .top { display: grid; grid-template-columns: 1fr 1.05fr; gap: 6mm; align-items: stretch; }
    .left-head { min-height: 68mm; display: flex; flex-direction: column; }
    .logo { height: 25mm; display: flex; align-items: center; justify-content: center; color: #dc2626; font-size: 24px; font-weight: 900; margin-bottom: 4mm; }
    .logo-img { max-width: 58mm; max-height: 22mm; object-fit: contain; }
    .box { border: 1.4px solid #000; border-radius: 5px; padding: 8px; box-sizing: border-box; }
    .issuer { flex: 1; min-height: 0; }
    .issuer-info { line-height: 1.24; }
    .issuer-line { margin-top: 3px; }
    .company { font-weight: 800; margin-bottom: 8px; font-size: 11px; text-transform: uppercase; }
    .doc { min-height: 68mm; }
    .ruc { font-size: 15px; font-weight: 900; margin-bottom: 8px; }
    .title { font-size: 14px; font-weight: 800; margin-bottom: 8px; }
    .label { font-size: 8.5px; font-weight: 800; margin-top: 7px; text-transform: uppercase; }
    .value { margin-top: 3px; word-break: break-word; }
    .auth { font-size: 8.5px; line-height: 1.35; font-weight: 700; }
    .section { margin-top: 7px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 7px; }
    .kv { display: grid; grid-template-columns: 42mm 1fr; gap: 4px 7px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #000; padding: 5px 4px; vertical-align: top; }
    th { text-align: center; font-weight: 800; background: #f8fafc; }
    .right { text-align: right; }
    .center { text-align: center; }
    .small { font-size: 9px; }
    .footer { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; }
    .signature { border-top: 1px solid #000; text-align: center; padding-top: 5px; margin-top: 18mm; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="left-head">
        <div class="logo">${issuer.logoUrl ? `<img class="logo-img" src="${escapeHtml(issuer.logoUrl)}" />` : "NO TIENE LOGO"}</div>
        <div class="box issuer">
        <div class="issuer-info">
          <div class="company">${escapeHtml(issuer.businessName)}</div>
          <div class="issuer-line"><b>Nombre Comercial:</b> ${escapeHtml(issuer.tradeName)}</div>
          <div class="issuer-line"><b>Dir. Matriz:</b> ${escapeHtml(issuer.address)}</div>
          <div class="issuer-line"><b>Dir. Sucursal:</b> ${escapeHtml(issuer.address)}</div>
          <div class="issuer-line"><b>OBLIGADO A LLEVAR CONTABILIDAD:</b> ${issuer.accountingRequired}</div>
          ${issuer.specialTaxpayer === "SI" && issuer.specialTaxpayerResolution ? `<div class="issuer-line"><b>Contribuyente especial:</b> ${escapeHtml(issuer.specialTaxpayerResolution)}</div>` : ""}
          ${issuer.retentionAgent === "SI" && issuer.retentionAgentResolution ? `<div class="issuer-line"><b>Agente de retencion Resolucion No.:</b> ${escapeHtml(issuer.retentionAgentResolution)}</div>` : ""}
          ${taxRegimeLegend ? `<div class="issuer-line"><b>Regimen:</b> ${escapeHtml(taxRegimeLegend)}</div>` : ""}
        </div>
        </div>
      </div>
      <div class="box doc">
        <div class="ruc">R.U.C.: ${escapeHtml(issuer.ruc)}</div>
        <div class="title">GUIA DE REMISION</div>
        <div class="label">No.</div>
        <div class="value">${escapeHtml(guideNumber)}</div>
        <div class="label">Numero de autorizacion</div>
        <div class="value auth">${escapeHtml(authorization)}</div>
        <div class="label">Fecha y hora de autorizacion</div>
        <div class="value">${escapeHtml(guide.authorizationDate || "")}</div>
        <div class="label">Ambiente</div>
        <div class="value">${escapeHtml(environment)}</div>
        <div class="label">Emision</div>
        <div class="value">NORMAL</div>
        <div class="label">Clave de acceso</div>
        <div class="value auth">${escapeHtml(guide.accessKey)}</div>
      </div>
    </div>

    <div class="box section">
      <div class="kv">
        <b>Identificacion transportista:</b><span>${escapeHtml(guide.transporterIdentification)}</span>
        <b>Razon social transportista:</b><span>${escapeHtml(guide.transporterName)}</span>
        <b>Placa:</b><span>${escapeHtml(guide.plate)}</span>
        <b>Punto de partida:</b><span>${escapeHtml(guide.startAddress)}</span>
        <b>Fecha inicio transporte:</b><span>${escapeHtml(formatGuideDate(guide.startDate))}</span>
        <b>Fecha fin transporte:</b><span>${escapeHtml(formatGuideDate(guide.endDate))}</span>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <b>Destinatario</b><br/>
        ${escapeHtml(client.name)}<br/>
        Identificacion: ${escapeHtml(client.identification)}<br/>
        Direccion: ${escapeHtml(guide.endAddress)}
      </div>
      <div class="box">
        <b>Traslado</b><br/>
        Motivo: ${escapeHtml(guide.reason)}<br/>
        Ruta: ${escapeHtml(guide.route)}<br/>
        Documento sustento: ${escapeHtml(sourceNumber)}
      </div>
    </div>

    <table>
      <thead><tr><th>Codigo</th><th>Descripcion</th><th class="right">Cantidad</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="footer">
      <div class="small">
        <b>Informacion adicional</b><br/>
        Destinatario: ${escapeHtml(client.name)}<br/>
        Transportista: ${escapeHtml(guide.transporterName)}<br/>
        ${taxRegimeLegend ? `Regimen: ${escapeHtml(taxRegimeLegend)}<br/>` : ""}
        Clave: ${escapeHtml(guide.accessKey)}
      </div>
      <div class="signature">Recibi conforme</div>
    </div>
  </div>
</body>
</html>`;
}
