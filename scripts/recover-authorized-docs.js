const fs = require("fs");
const path = require("path");

require(path.join(__dirname, "..", "backend", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", "backend", ".env")
});

const { askAuthorization } = require(path.join(__dirname, "..", "backend", "src", "sri", "client"));

const accessKeys = process.argv.slice(2);

if (!accessKeys.length) {
  console.error("Uso: node scripts/recover-authorized-docs.js <claveAcceso1> <claveAcceso2>");
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

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function summaryFromXml(xml) {
  return {
    claveAcceso: textBetween(xml, "<claveAcceso>", "</claveAcceso>"),
    estab: textBetween(xml, "<estab>", "</estab>"),
    ptoEmi: textBetween(xml, "<ptoEmi>", "</ptoEmi>"),
    secuencial: textBetween(xml, "<secuencial>", "</secuencial>"),
    fechaEmision: textBetween(xml, "<fechaEmision>", "</fechaEmision>"),
    razonSocialComprador: textBetween(xml, "<razonSocialComprador>", "</razonSocialComprador>"),
    identificacionComprador: textBetween(xml, "<identificacionComprador>", "</identificacionComprador>"),
    totalSinImpuestos: textBetween(xml, "<totalSinImpuestos>", "</totalSinImpuestos>"),
    importeTotal: textBetween(xml, "<importeTotal>", "</importeTotal>")
  };
}

(async () => {
  const recoveryDir = path.join(__dirname, "..", "backend", "recoveries");
  fs.mkdirSync(recoveryDir, { recursive: true });

  for (const accessKey of accessKeys) {
    const response = await askAuthorization(accessKey);
    const body = response.body || "";
    const status = textBetween(body, "<estado>", "</estado>");
    const authorizationNumber = textBetween(body, "<numeroAutorizacion>", "</numeroAutorizacion>");
    const authorizationDate = textBetween(body, "<fechaAutorizacion>", "</fechaAutorizacion>");
    const authorizedXml = decodeXmlEntities(textBetween(body, "<comprobante>", "</comprobante>"));
    const sequence = accessKey.slice(30, 39);

    const out = {
      accessKey,
      status,
      authorizationNumber,
      authorizationDate,
      hasXml: Boolean(authorizedXml),
      summary: summaryFromXml(authorizedXml)
    };
    console.log(JSON.stringify(out, null, 2));

    if (authorizedXml) {
      fs.writeFileSync(path.join(recoveryDir, `factura-${sequence}.xml`), authorizedXml, "utf8");
      fs.writeFileSync(path.join(recoveryDir, `factura-${sequence}.json`), JSON.stringify(out, null, 2), "utf8");
    }
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
