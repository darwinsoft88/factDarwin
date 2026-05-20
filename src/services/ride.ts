import { Client, Issuer, Sale } from "../types";
import { calculateLineDiscount, calculateLineSubtotal, calculateTotalDiscount, money } from "./sri";

export function buildRideHtml(sale: Sale, client: Client, issuer: Issuer) {
  const invoiceNumber = `${issuer.establishment}-${issuer.emissionPoint}-${sale.sequence}`;
  const environment = sale.sriEnvironment || (issuer.environment === "1" ? "PRUEBAS" : "PRODUCCION");
  const accessKey = sale.authorizationNumber || sale.accessKey;
  const readableAccessKey = groupAccessKey(accessKey);
  const barcodeSvg = buildCode128Svg(accessKey);
  const logo = issuer.logoUrl
    ? `<img class="logo-img" src="${escapeHtml(issuer.logoUrl)}" />`
    : `NO&nbsp;&nbsp;TIENE&nbsp;&nbsp;LOGO`;
  const subtotal15 = subtotalByRate(sale, 0.15);
  const subtotal0 = subtotalByRate(sale, 0);
  const rows = sale.items
    .map(
      (item) => `
        <tr>
          <td class="center">${escapeHtml(item.code)}</td>
          <td></td>
          <td class="right">${money(item.quantity)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td></td>
          <td class="right">${money(item.unitPrice)}</td>
          <td class="right">${money(calculateLineDiscount(item))}</td>
          <td class="right">${money(calculateLineSubtotal(item))}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 7mm; }
    body { font-family: Arial, sans-serif; color: #000; margin: 0; font-size: 11px; background: #fff; }
    .sheet { width: 196mm; min-height: 282mm; margin: 0 auto; padding: 4mm; box-sizing: border-box; background: #fff; }
    .top { display: grid; grid-template-columns: 1fr 1.02fr; gap: 6mm; align-items: end; }
    .logo { height: 26mm; display: flex; align-items: center; justify-content: center; color: #e11d1d; font-size: 31px; font-weight: 900; letter-spacing: 1px; white-space: nowrap; }
    .logo-img { max-width: 72mm; max-height: 24mm; object-fit: contain; }
    .box { border: 1.5px solid #000; border-radius: 5px; padding: 8px; box-sizing: border-box; }
    .issuer-box { min-height: 44mm; height: auto; margin-top: 3mm; padding-bottom: 8px; }
    .right-box { min-height: 0; height: auto; padding: 9px 11px 11px; }
    .ruc { font-size: 16px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 8px; }
    .doc-title { font-size: 15px; margin-bottom: 12px; }
    .small-label { font-size: 9px; font-weight: 700; margin-top: 9px; text-transform: uppercase; }
    .small-value { font-size: 9px; margin-top: 4px; word-break: break-word; }
    .auth-number { font-size: 8.5px; line-height: 1.25; font-weight: 700; letter-spacing: 0.2px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1.3fr; gap: 5px 12px; align-items: center; }
    .line { margin: 4px 0; }
    .company { font-weight: 700; margin-bottom: 10px; }
    .kv { display: grid; grid-template-columns: 42px 1fr; gap: 3px 10px; margin: 9px 0; }
    .accounting { display: flex; justify-content: space-between; margin-top: 14px; font-weight: 700; }
    .barcode { margin-top: 4px; text-align: center; }
    .bars { width: 98%; max-width: 92mm; margin: 0 auto; overflow: hidden; }
    .bars svg { height: 42px; display: block; margin: 0 auto; }
    .bar-text { font-size: 6.5px; margin-top: 2px; line-height: 1.1; word-break: normal; font-weight: 700; letter-spacing: 0; }
    .buyer { margin-top: 2mm; border: 1.5px solid #000; padding: 7px; display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 5px 16px; min-height: 19mm; }
    .buyer .wide { grid-column: span 2; }
    table { width: 100%; border-collapse: collapse; }
    .details { margin-top: 2px; }
    th, td { border: 1px solid #000; padding: 5px 4px; font-size: 8.5px; vertical-align: middle; }
    th { font-weight: 700; text-align: center; }
    .right { text-align: right; }
    .center { text-align: center; }
    .bottom { display: grid; grid-template-columns: 1.18fr 0.82fr; gap: 5mm; margin-top: 2px; align-items: start; }
    .info-table th { padding: 4px; }
    .totals td { height: 16px; }
    .totals td:first-child { font-weight: 700; }
    .payment { width: 76%; margin-top: 2px; }
    .muted { font-size: 7px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        <div class="logo">${logo}</div>
        <div class="box issuer-box">
          <div class="company">${escapeHtml(issuer.businessName)}</div>
          <div class="line">${escapeHtml(issuer.tradeName)}</div>
          <div class="kv">
            <b>Direccion Matriz:</b><span>${escapeHtml(issuer.address)}</span>
            <b>Direccion Sucursal:</b><span>${escapeHtml(issuer.address)}</span>
          </div>
          <div class="line"><b>Tipo contribuyente:</b> ${issuer.taxpayerType === "natural" ? "PERSONA NATURAL" : "PERSONA JURIDICA"}</div>
          <div class="line"><b>Contribuyente especial:</b> ${issuer.specialTaxpayer}${issuer.specialTaxpayerResolution ? ` - ${escapeHtml(issuer.specialTaxpayerResolution)}` : ""}</div>
          <div class="accounting"><span>OBLIGADO A LLEVAR CONTABILIDAD</span><span>${issuer.accountingRequired}</span></div>
        </div>
      </div>
      <div class="box right-box">
        <div class="ruc">R.U.C.: &nbsp;&nbsp;&nbsp;&nbsp; ${escapeHtml(issuer.ruc)}</div>
        <div class="doc-title">FACTURA</div>
        <div class="small-label">No.</div>
        <div class="small-value">${invoiceNumber}</div>
        <div class="small-label">NUMERO DE AUTORIZACION</div>
        <div class="small-value auth-number">${escapeHtml(readableAccessKey)}</div>
        <div class="grid2">
          <div class="small-label">FECHA Y HORA DE AUTORIZACION:</div>
          <div class="small-value">${escapeHtml(sale.authorizationDate || "")}</div>
          <div class="small-label">AMBIENTE:</div>
          <div class="small-value">${escapeHtml(environment)}</div>
          <div class="small-label">EMISION:</div>
          <div class="small-value">NORMAL</div>
        </div>
        <div class="small-label">CLAVE DE ACCESO</div>
        <div class="barcode">
          <div class="bars">${barcodeSvg}</div>
          <div class="bar-text">${escapeHtml(readableAccessKey)}</div>
        </div>
      </div>
    </div>

    <div class="buyer">
      <div><b>Razon Social / Nombres y Apellidos:</b></div>
      <div class="wide">${escapeHtml(client.name)}</div>
      <div><b>Identificacion</b><br />${escapeHtml(client.identification)}</div>
      <div><b>Fecha</b><br />${formatDisplayDate(sale.createdAt)}</div>
      <div><b>Placa / Matricula:</b></div>
      <div><b>Guia</b></div>
      <div class="wide"><b>Direccion:</b> ${escapeHtml(client.address)}</div>
    </div>

    <table class="details">
      <thead>
        <tr>
          <th>Cod.<br />Principal</th>
          <th>Cod.<br />Auxiliar</th>
          <th>Cantidad</th>
          <th>Descripcion</th>
          <th>Detalle Adicional</th>
          <th>Precio Unitario</th>
          <th>Descuento</th>
          <th>Precio Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="bottom">
      <div>
        <table class="info-table">
          <tr><th>Informacion Adicional</th></tr>
          <tr><td>${client.email.trim() ? `<b>Email:</b> ${escapeHtml(client.email)}` : "Consumidor final / sin email"}</td></tr>
        </table>
        <table class="payment">
          <tr><th>Forma de pago</th><th>Valor</th></tr>
          <tr><td>${escapeHtml(paymentMethodLabel(sale.paymentMethod || "01"))}</td><td class="right">${money(sale.total)}</td></tr>
        </table>
      </div>
      <table class="totals">
        <tr><td>SUBTOTAL 15%</td><td class="right">${money(subtotal15)}</td></tr>
        <tr><td>SUBTOTAL 0%</td><td class="right">${money(subtotal0)}</td></tr>
        <tr><td>SUBTOTAL NO OBJETO DE IVA</td><td class="right">0.00</td></tr>
        <tr><td>SUBTOTAL EXENTO DE IVA</td><td class="right">0.00</td></tr>
        <tr><td>SUBTOTAL SIN IMPUESTOS</td><td class="right">${money(sale.subtotal)}</td></tr>
        <tr><td>TOTAL DESCUENTO</td><td class="right">${money(calculateTotalDiscount(sale.items))}</td></tr>
        <tr><td>ICE</td><td class="right">0.00</td></tr>
        <tr><td>IVA 15%</td><td class="right">${money(sale.tax)}</td></tr>
        <tr><td>IRBPNR</td><td class="right">0.00</td></tr>
        <tr><td>PROPINA</td><td class="right">0.00</td></tr>
        <tr><td>VALOR TOTAL</td><td class="right">${money(sale.total)}</td></tr>
      </table>
    </div>
  </div>
</body>
</html>`;
}

function formatDisplayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function groupAccessKey(value: string) {
  return value.replace(/(.{7})/g, "$1 ").trim();
}

function subtotalByRate(sale: Sale, rate: number) {
  return sale.items
    .filter((item) => item.ivaRate === rate)
    .reduce((sum, item) => sum + calculateLineSubtotal(item), 0);
}

function buildCode128Svg(value: string) {
  const codes = [104, ...value.split("").map((char) => char.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + code * (index === 0 ? 1 : index), 0) % 103;
  const patterns = [...codes, checksum, 106].map((code) => CODE128_PATTERNS[code]).join("");
  const moduleWidth = 1;
  const height = 44;
  let x = 0;
  let bars = "";

  for (let index = 0; index < patterns.length; index += 1) {
    const width = Number(patterns[index]) * moduleWidth;
    if (index % 2 === 0) {
      bars += `<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000"/>`;
    }
    x += width;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height}" viewBox="0 0 ${x} ${height}">${bars}</svg>`;
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

function paymentMethodLabel(value: string) {
  const labels: Record<string, string> = {
    "01": "01 - SIN UTILIZACION DEL SISTEMA FINANCIERO",
    "15": "15 - COMPENSACION DE DEUDAS",
    "16": "16 - TARJETA DE DEBITO",
    "17": "17 - DINERO ELECTRONICO",
    "18": "18 - TARJETA PREPAGO",
    "19": "19 - TARJETA DE CREDITO",
    "20": "20 - OTROS CON UTILIZACION DEL SISTEMA FINANCIERO",
    "21": "21 - ENDOSO DE TITULOS"
  };

  return labels[value] || value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
