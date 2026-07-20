import { Client, Issuer, RemissionGuide, Sale, SaleItem } from "../types";
import { salePaymentsForDisplay } from "../utils/salePayments";
import { issuerTaxRegimeLabel } from "../utils/taxRegime";

const RECEIPT_CODE_INVOICE = "01";
const RECEIPT_CODE_CREDIT_NOTE = "04";
const RECEIPT_CODE_REMISSION_GUIDE = "06";
const NUMERIC_CODE = "12345678";
const EMISSION_TYPE_NORMAL = "1";

export const sriEndpoints = {
  test: {
    reception: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl",
    authorization: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl"
  },
  production: {
    reception: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl",
    authorization: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl"
  }
};

export function nextSequence(value: number) {
  return String(value).padStart(9, "0");
}

export function createAccessKey(date: Date, issuer: Issuer, sequence: string, documentCode = RECEIPT_CODE_INVOICE) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const datePart = `${dd}${mm}${yyyy}`;
  const base = [
    datePart,
    documentCode,
    issuer.ruc,
    issuer.environment,
    issuer.establishment,
    issuer.emissionPoint,
    sequence,
    NUMERIC_CODE,
    EMISSION_TYPE_NORMAL
  ].join("");

  return `${base}${mod11(base)}`;
}

export function createGuideAccessKey(date: Date, issuer: Issuer, sequence: string) {
  return createAccessKey(date, issuer, sequence, RECEIPT_CODE_REMISSION_GUIDE);
}

export function createCreditNoteAccessKey(date: Date, issuer: Issuer, sequence: string) {
  return createAccessKey(date, issuer, sequence, RECEIPT_CODE_CREDIT_NOTE);
}

export function mod11(value: string) {
  let factor = 2;
  let total = 0;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    total += Number(value[index]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const result = 11 - (total % 11);
  if (result === 11) return 0;
  if (result === 10) return 1;
  return result;
}

export function calculateTotals(items: SaleItem[]) {
  const subtotal = round2(items.reduce((sum, item) => sum + calculateLineSubtotal(item), 0));
  const total = round2(items.reduce((sum, item) => sum + calculateLineTotal(item), 0));
  return { subtotal, tax: round2(total - subtotal), total };
}

export function grossToNetUnitPrice(grossUnitPrice: number, ivaRate: number) {
  if (ivaRate <= 0) return round6(grossUnitPrice);
  return round6(grossUnitPrice / (1 + ivaRate));
}

export function calculateLineSubtotal(item: SaleItem) {
  return round2(lineNetBeforeTax(item));
}

export function calculateLineDiscount(item: SaleItem) {
  return round2(item.discount || 0);
}

export function calculateLineTax(item: SaleItem) {
  return round2(calculateLineTotal(item) - calculateLineSubtotal(item));
}

export function calculateLineTotal(item: SaleItem) {
  return round2(lineNetBeforeTax(item) * (1 + item.ivaRate));
}

export function calculateTotalDiscount(items: SaleItem[]) {
  return round2(items.reduce((sum, item) => sum + calculateLineDiscount(item), 0));
}

function lineNetBeforeTax(item: SaleItem) {
  return Math.max(0, item.quantity * item.unitPrice - calculateLineDiscount(item));
}

export function buildInvoiceXml(sale: Sale, client: Client, issuer: Issuer) {
  const issueDate = formatDate(new Date(sale.createdAt));
  const details = sale.items.map(buildDetailXml).join("");
  const taxes = buildTotalsTaxesXml(sale.items);
  const paymentsXml = salePaymentsForDisplay(sale)
    .map(
      (payment) => `      <pago>
        <formaPago>${payment.paymentMethod}</formaPago>
        <total>${money(payment.amount)}</total>
      </pago>`
    )
    .join("\n");
  const additionalInfo = buildAdditionalInfoXml([
    ...buildDocumentAdditionalInfo(client, issuer),
    ...buildSaleAdditionalInfo(sale),
    sale.paymentCondition === "credito" ? ["Condicion de pago", "Credito"] : null,
    sale.paymentCondition === "credito" && sale.creditDueDate ? ["Fecha de vencimiento", sale.creditDueDate] : null
  ]);

  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${issuer.environment}</ambiente>
    <tipoEmision>${EMISSION_TYPE_NORMAL}</tipoEmision>
    <razonSocial>${escapeXml(issuer.businessName)}</razonSocial>
    <nombreComercial>${escapeXml(issuer.tradeName)}</nombreComercial>
    <ruc>${issuer.ruc}</ruc>
    <claveAcceso>${sale.accessKey}</claveAcceso>
    <codDoc>${RECEIPT_CODE_INVOICE}</codDoc>
    <estab>${issuer.establishment}</estab>
    <ptoEmi>${issuer.emissionPoint}</ptoEmi>
    <secuencial>${sale.sequence}</secuencial>
    <dirMatriz>${escapeXml(issuer.address)}</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${issueDate}</fechaEmision>
    <dirEstablecimiento>${escapeXml(issuer.address)}</dirEstablecimiento>
    ${issuer.specialTaxpayer === "SI" && issuer.specialTaxpayerResolution ? `<contribuyenteEspecial>${escapeXml(issuer.specialTaxpayerResolution)}</contribuyenteEspecial>` : ""}
    <obligadoContabilidad>${issuer.accountingRequired}</obligadoContabilidad>
    <tipoIdentificacionComprador>${client.identificationType}</tipoIdentificacionComprador>
    <razonSocialComprador>${escapeXml(client.name)}</razonSocialComprador>
    <identificacionComprador>${client.identification}</identificacionComprador>
    <direccionComprador>${escapeXml(client.address)}</direccionComprador>
    <totalSinImpuestos>${money(sale.subtotal)}</totalSinImpuestos>
    <totalDescuento>${money(calculateTotalDiscount(sale.items))}</totalDescuento>
    <totalConImpuestos>${taxes}</totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>${money(sale.total)}</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
${paymentsXml}
    </pagos>
  </infoFactura>
  <detalles>${details}</detalles>
  ${additionalInfo}
</factura>`;
}

export function buildCreditNoteXml(sale: Sale, client: Client, issuer: Issuer) {
  const issueDate = formatDate(new Date(sale.createdAt));
  const details = sale.items.map(buildCreditNoteDetailXml).join("");
  const taxes = buildTotalsTaxesXml(sale.items);
  const additionalInfo = buildAdditionalInfoXml([
    ["DocumentoModificado", sale.supportDocumentNumber || ""],
    sale.supportAuthorizationNumber ? ["AutorizacionSustento", sale.supportAuthorizationNumber] : null,
    ...buildDocumentAdditionalInfo(client, issuer),
    ...buildSaleAdditionalInfo(sale)
  ]);

  return `<?xml version="1.0" encoding="UTF-8"?>
<notaCredito id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${issuer.environment}</ambiente>
    <tipoEmision>${EMISSION_TYPE_NORMAL}</tipoEmision>
    <razonSocial>${escapeXml(issuer.businessName)}</razonSocial>
    <nombreComercial>${escapeXml(issuer.tradeName)}</nombreComercial>
    <ruc>${issuer.ruc}</ruc>
    <claveAcceso>${sale.accessKey}</claveAcceso>
    <codDoc>${RECEIPT_CODE_CREDIT_NOTE}</codDoc>
    <estab>${issuer.establishment}</estab>
    <ptoEmi>${issuer.emissionPoint}</ptoEmi>
    <secuencial>${sale.sequence}</secuencial>
    <dirMatriz>${escapeXml(issuer.address)}</dirMatriz>
  </infoTributaria>
  <infoNotaCredito>
    <fechaEmision>${issueDate}</fechaEmision>
    <dirEstablecimiento>${escapeXml(issuer.address)}</dirEstablecimiento>
    ${issuer.specialTaxpayer === "SI" && issuer.specialTaxpayerResolution ? `<contribuyenteEspecial>${escapeXml(issuer.specialTaxpayerResolution)}</contribuyenteEspecial>` : ""}
    <tipoIdentificacionComprador>${client.identificationType}</tipoIdentificacionComprador>
    <razonSocialComprador>${escapeXml(client.name)}</razonSocialComprador>
    <identificacionComprador>${client.identification}</identificacionComprador>
    <obligadoContabilidad>${issuer.accountingRequired}</obligadoContabilidad>
    <codDocModificado>${sale.supportDocumentType || "01"}</codDocModificado>
    <numDocModificado>${escapeXml(sale.supportDocumentNumber || "")}</numDocModificado>
    <fechaEmisionDocSustento>${escapeXml(sale.supportIssueDate || "")}</fechaEmisionDocSustento>
    <totalSinImpuestos>${money(sale.subtotal)}</totalSinImpuestos>
    <valorModificacion>${money(sale.total)}</valorModificacion>
    <moneda>DOLAR</moneda>
    <totalConImpuestos>${taxes}</totalConImpuestos>
    <motivo>${escapeXml(sale.creditReason || "Anulacion total de factura")}</motivo>
  </infoNotaCredito>
  <detalles>${details}</detalles>
  ${additionalInfo}
</notaCredito>`;
}

export function buildRemissionGuideXml(guide: RemissionGuide, client: Client, issuer: Issuer, sourceSale?: Sale) {
  const details = guide.items
    .map(
      (item) => `
          <detalle>
            <codigoInterno>${escapeXml(item.code)}</codigoInterno>
            <descripcion>${escapeXml(item.name)}</descripcion>
            <cantidad>${money(item.quantity)}</cantidad>
          </detalle>`
    )
    .join("");
  const supportXml = sourceSale && sourceSale.status === "AUTORIZADA" && sourceSale.authorizationNumber
    ? `
        <codDocSustento>01</codDocSustento>
        <numDocSustento>${issuer.establishment}-${issuer.emissionPoint}-${sourceSale.sequence}</numDocSustento>
        <numAutDocSustento>${sourceSale.authorizationNumber}</numAutDocSustento>
        <fechaEmisionDocSustento>${formatDate(new Date(sourceSale.createdAt))}</fechaEmisionDocSustento>`
    : "";
  const additionalInfo = buildAdditionalInfoXml(buildDocumentAdditionalInfo(client, issuer));

  return `<?xml version="1.0" encoding="UTF-8"?>
<guiaRemision id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${issuer.environment}</ambiente>
    <tipoEmision>${EMISSION_TYPE_NORMAL}</tipoEmision>
    <razonSocial>${escapeXml(issuer.businessName)}</razonSocial>
    <nombreComercial>${escapeXml(issuer.tradeName)}</nombreComercial>
    <ruc>${issuer.ruc}</ruc>
    <claveAcceso>${guide.accessKey}</claveAcceso>
    <codDoc>${RECEIPT_CODE_REMISSION_GUIDE}</codDoc>
    <estab>${issuer.establishment}</estab>
    <ptoEmi>${issuer.emissionPoint}</ptoEmi>
    <secuencial>${guide.sequence}</secuencial>
    <dirMatriz>${escapeXml(issuer.address)}</dirMatriz>
  </infoTributaria>
  <infoGuiaRemision>
    <dirEstablecimiento>${escapeXml(issuer.address)}</dirEstablecimiento>
    <dirPartida>${escapeXml(guide.startAddress)}</dirPartida>
    <razonSocialTransportista>${escapeXml(guide.transporterName)}</razonSocialTransportista>
    <tipoIdentificacionTransportista>${guide.transporterIdentificationType}</tipoIdentificacionTransportista>
    <rucTransportista>${guide.transporterIdentification}</rucTransportista>
    <obligadoContabilidad>${issuer.accountingRequired}</obligadoContabilidad>
    <fechaIniTransporte>${formatDate(parseDocumentDate(guide.startDate))}</fechaIniTransporte>
    <fechaFinTransporte>${formatDate(parseDocumentDate(guide.endDate))}</fechaFinTransporte>
    <placa>${escapeXml(guide.plate.toUpperCase())}</placa>
  </infoGuiaRemision>
  <destinatarios>
    <destinatario>
      <identificacionDestinatario>${client.identification}</identificacionDestinatario>
      <razonSocialDestinatario>${escapeXml(client.name)}</razonSocialDestinatario>
      <dirDestinatario>${escapeXml(guide.endAddress)}</dirDestinatario>
      <motivoTraslado>${escapeXml(guide.reason)}</motivoTraslado>
      <ruta>${escapeXml(guide.route)}</ruta>${supportXml}
      <detalles>${details}
      </detalles>
    </destinatario>
  </destinatarios>
  ${additionalInfo}
</guiaRemision>`;
}

export function buildDocumentAdditionalInfo(client: Client | null | undefined, issuer: Issuer) {
  const taxRegimeLegend = issuerTaxRegimeLabel(issuer);
  return [
    client?.email?.trim() ? ["Email", client.email.trim()] : null,
    taxRegimeLegend ? ["Regimen", taxRegimeLegend] : null,
    issuer.specialTaxpayer === "SI" && issuer.specialTaxpayerResolution.trim()
      ? ["Contribuyente especial", issuer.specialTaxpayerResolution.trim()]
      : null,
    issuer.retentionAgent === "SI" && issuer.retentionAgentResolution?.trim()
      ? ["Agente de retencion", issuer.retentionAgentResolution.trim()]
      : null,
    issuer.accountingRequired ? ["Obligado a llevar contabilidad", issuer.accountingRequired] : null
  ] as ([string, string] | null)[];
}

export function buildSaleAdditionalInfo(sale: Sale) {
  return (sale.additionalInfo || [])
    .map((field) => [String(field.name || "").trim(), String(field.value || "").trim()] as [string, string])
    .filter((field) => field[0] && field[1]);
}

function buildAdditionalInfoXml(fields: ([string, string] | null)[]) {
  const rows = fields
    .filter((field): field is [string, string] => Boolean(field && field[1].trim()))
    .map(([name, value]) => `    <campoAdicional nombre="${escapeXml(name)}">${escapeXml(limitAdditionalInfoValue(value))}</campoAdicional>`)
    .join("\n");

  return rows ? `<infoAdicional>\n${rows}\n  </infoAdicional>` : "";
}

function limitAdditionalInfoValue(value: string) {
  return value.trim().slice(0, 300);
}

function buildDetailXml(item: SaleItem) {
  const subtotal = calculateLineSubtotal(item);
  const tax = calculateLineTax(item);
  const taxCode = ivaCode(item.ivaRate);
  const discount = calculateLineDiscount(item);

  return `
    <detalle>
      <codigoPrincipal>${escapeXml(item.code)}</codigoPrincipal>
      <descripcion>${escapeXml(item.name)}</descripcion>
      <cantidad>${money(item.quantity)}</cantidad>
      <precioUnitario>${decimal(item.unitPrice, 6)}</precioUnitario>
      <descuento>${money(discount)}</descuento>
      <precioTotalSinImpuesto>${money(subtotal)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${taxCode}</codigoPorcentaje>
          <tarifa>${money(item.ivaRate * 100)}</tarifa>
          <baseImponible>${money(subtotal)}</baseImponible>
          <valor>${money(tax)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`;
}

function buildCreditNoteDetailXml(item: SaleItem) {
  const subtotal = calculateLineSubtotal(item);
  const tax = calculateLineTax(item);
  const taxCode = ivaCode(item.ivaRate);
  const discount = calculateLineDiscount(item);

  return `
    <detalle>
      <codigoInterno>${escapeXml(item.code)}</codigoInterno>
      <descripcion>${escapeXml(item.name)}</descripcion>
      <cantidad>${money(item.quantity)}</cantidad>
      <precioUnitario>${decimal(item.unitPrice, 6)}</precioUnitario>
      <descuento>${money(discount)}</descuento>
      <precioTotalSinImpuesto>${money(subtotal)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${taxCode}</codigoPorcentaje>
          <tarifa>${money(item.ivaRate * 100)}</tarifa>
          <baseImponible>${money(subtotal)}</baseImponible>
          <valor>${money(tax)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`;
}

function buildTotalsTaxesXml(items: SaleItem[]) {
  const grouped = new Map<number, { base: number; value: number }>();

  for (const item of items) {
    const subtotal = calculateLineSubtotal(item);
    const tax = calculateLineTax(item);
    const current = grouped.get(item.ivaRate) || { base: 0, value: 0 };

    grouped.set(item.ivaRate, {
      base: round2(current.base + subtotal),
      value: round2(current.value + tax)
    });
  }

  return Array.from(grouped.entries())
    .map(([rate, total]) => `
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>${ivaCode(rate)}</codigoPorcentaje>
        <baseImponible>${money(total.base)}</baseImponible>
        <valor>${money(total.value)}</valor>
      </totalImpuesto>`)
    .join("");
}

function ivaCode(rate: number) {
  if (rate === 0) return "0";
  if (rate === 0.15) return "4";
  return "4";
}

function formatDate(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function parseDocumentDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function money(value: number) {
  return round2(value).toFixed(2);
}

export function decimal(value: number, digits: number) {
  return Number(value.toFixed(digits)).toFixed(digits);
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}
