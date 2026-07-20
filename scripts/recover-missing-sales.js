const fs = require("fs");
const path = require("path");

require(path.join(__dirname, "..", "backend", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", "backend", ".env")
});

const db = require(path.join(__dirname, "..", "backend", "src", "db"));

const companyId = process.argv[2];
const recoveryDir = path.join(__dirname, "..", "backend", "recoveries");
const docs = process.argv.slice(3).map((entry) => {
  const [xmlFile, authorizationDate = ""] = String(entry).split("=");
  return { xmlFile, authorizationDate };
});

if (!companyId || !docs.length) {
  console.error("Uso: node scripts/recover-missing-sales.js <empresa_id> <xmlFile=fechaAutorizacion> [...]");
  console.error("Ejemplo: node scripts/recover-missing-sales.js co-xxx factura-000000183.xml=2026-06-29T09:47:33-05:00");
  process.exit(1);
}

function textBetween(value, start, end) {
  const source = String(value || "");
  const from = source.indexOf(start);
  if (from < 0) return "";
  const until = source.indexOf(end, from + start.length);
  if (until < 0) return "";
  return source.slice(from + start.length, until);
}

function allBetween(value, start, end) {
  const source = String(value || "");
  const out = [];
  let index = 0;
  while (index < source.length) {
    const from = source.indexOf(start, index);
    if (from < 0) break;
    const until = source.indexOf(end, from + start.length);
    if (until < 0) break;
    out.push(source.slice(from + start.length, until));
    index = until + end.length;
  }
  return out;
}

function money(value) {
  const n = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function number(value) {
  const n = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function isoFromSriDate(value) {
  const parts = String(value || "").split("/");
  if (parts.length !== 3) return new Date().toISOString();
  const [day, month, year] = parts;
  return new Date(`${year}-${month}-${day}T12:00:00-05:00`).toISOString();
}

function getAdditionalInfo(xml) {
  return allBetween(xml, "<campoAdicional", "</campoAdicional>").map((raw) => {
    const name = /nombre="([^"]+)"/.exec(raw)?.[1] || "";
    return { name, value: raw.replace(/^.*?>/, "").trim() };
  }).filter((item) => item.name && !/obligado/i.test(item.name));
}

function findOrCreateClient(data, info) {
  const idNumber = textBetween(info, "<identificacionComprador>", "</identificacionComprador>");
  const name = textBetween(info, "<razonSocialComprador>", "</razonSocialComprador>") || "Consumidor Final";
  const address = textBetween(info, "<direccionComprador>", "</direccionComprador>");
  const existing = (data.clients || []).find((client) => String(client.identification || "") === idNumber);
  if (existing) return existing.id;
  const client = {
    id: `recovered-client-${idNumber || Date.now()}`,
    name,
    identification: idNumber,
    type: idNumber === "9999999999999" ? "Consumidor final" : idNumber.length === 13 ? "RUC" : "Cedula",
    email: "",
    phone: "",
    address,
    createdAt: new Date().toISOString()
  };
  data.clients = [client, ...(data.clients || [])];
  return client.id;
}

function findProductId(data, code, name) {
  const products = data.products || [];
  const byCode = products.find((product) => String(product.code || "") === String(code || ""));
  if (byCode) return byCode.id;
  const byName = products.find((product) => String(product.name || "").toLowerCase() === String(name || "").toLowerCase());
  return byName?.id || "";
}

function saleFromAuthorizedXml(data, xml, authorizationDate) {
  const infoTributaria = textBetween(xml, "<infoTributaria>", "</infoTributaria>");
  const infoFactura = textBetween(xml, "<infoFactura>", "</infoFactura>");
  const detailsXml = textBetween(xml, "<detalles>", "</detalles>");
  const accessKey = textBetween(infoTributaria, "<claveAcceso>", "</claveAcceso>");
  const sequence = textBetween(infoTributaria, "<secuencial>", "</secuencial>");
  const establishment = textBetween(infoTributaria, "<estab>", "</estab>");
  const emissionPoint = textBetween(infoTributaria, "<ptoEmi>", "</ptoEmi>");
  const fechaEmision = textBetween(infoFactura, "<fechaEmision>", "</fechaEmision>");
  const paymentMethod = textBetween(textBetween(infoFactura, "<pago>", "</pago>"), "<formaPago>", "</formaPago>") || "01";
  const clientId = findOrCreateClient(data, infoFactura);

  const items = allBetween(detailsXml, "<detalle>", "</detalle>").map((detail) => {
    const code = textBetween(detail, "<codigoPrincipal>", "</codigoPrincipal>");
    const name = textBetween(detail, "<descripcion>", "</descripcion>");
    const tax = textBetween(detail, "<impuesto>", "</impuesto>");
    const base = money(textBetween(detail, "<precioTotalSinImpuesto>", "</precioTotalSinImpuesto>"));
    const taxValue = money(textBetween(tax, "<valor>", "</valor>"));
    const quantity = number(textBetween(detail, "<cantidad>", "</cantidad>")) || 1;
    return {
      productId: findProductId(data, code, name),
      code,
      name,
      quantity,
      unitPrice: number(textBetween(detail, "<precioUnitario>", "</precioUnitario>")),
      discount: money(textBetween(detail, "<descuento>", "</descuento>")),
      ivaRate: number(textBetween(tax, "<tarifa>", "</tarifa>")) / 100,
      cost: 0,
      recoveredBase: base,
      recoveredTax: taxValue
    };
  });

  return {
    id: `recovered-${accessKey}`,
    documentType: "factura",
    status: "AUTORIZADA",
    sequence,
    establishment,
    emissionPoint,
    establishmentName: "FacturaCacao",
    environment: textBetween(infoTributaria, "<ambiente>", "</ambiente>") || "1",
    sriEnvironment: "PRUEBAS",
    accessKey,
    authorizationNumber: accessKey,
    authorizationDate: authorizationDate || null,
    authorizedXml: xml,
    signedXml: xml,
    sriMessage: "Recuperada desde autorizacion SRI por soporte.",
    createdAt: isoFromSriDate(fechaEmision),
    userId: "1780929458952-9d70b6105eca98",
    clientId,
    items: items.map(({ recoveredBase: _recoveredBase, recoveredTax: _recoveredTax, ...item }) => item),
    subtotal: money(textBetween(infoFactura, "<totalSinImpuestos>", "</totalSinImpuestos>")),
    discount: money(textBetween(infoFactura, "<totalDescuento>", "</totalDescuento>")),
    tax: money(textBetween(infoFactura, "<valor>", "</valor>")) || items.reduce((sum, item) => sum + item.recoveredTax, 0),
    total: money(textBetween(infoFactura, "<importeTotal>", "</importeTotal>")),
    paymentMethod,
    paymentCondition: "contado",
    creditStatus: "pagado",
    creditBalance: 0,
    additionalInfo: getAdditionalInfo(xml)
  };
}

(async () => {
  const snapshot = await db.getSnapshot(companyId);
  if (!snapshot?.data) throw new Error("No se encontro snapshot de la empresa.");
  const data = snapshot.data;
  data.sales = Array.isArray(data.sales) ? data.sales : [];

  const inserted = [];
  for (const doc of docs) {
    const xmlPath = path.join(recoveryDir, doc.xmlFile);
    const xml = fs.readFileSync(xmlPath, "utf8");
    const sale = saleFromAuthorizedXml(data, xml, doc.authorizationDate);
    const exists = data.sales.some((item) =>
      item.accessKey === sale.accessKey ||
      (item.documentType === "factura" &&
        item.establishment === sale.establishment &&
        item.emissionPoint === sale.emissionPoint &&
        item.sequence === sale.sequence)
    );
    if (!exists) {
      data.sales.unshift(sale);
      inserted.push({
        sequence: sale.sequence,
        total: sale.total,
        clientId: sale.clientId,
        accessKey: sale.accessKey
      });
    }
  }

  if (inserted.length) {
    await db.saveSnapshot(data, companyId);
  }

  console.log(JSON.stringify({ ok: true, inserted, insertedCount: inserted.length }, null, 2));
})();
