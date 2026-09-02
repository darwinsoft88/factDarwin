const RECEIPT_CODES = {
  factura: "01",
  nota_credito: "04",
  guia_remision: "06"
};

const NUMERIC_CODE = "12345678";
const EMISSION_TYPE_NORMAL = "1";

function nextSequence(value) {
  return String(value).padStart(9, "0");
}

function createAccessKey(date, issuer, sequence, documentType = "factura") {
  const { day: dd, month: mm, year: yyyy } = ecuadorDateParts(date);
  const documentCode = RECEIPT_CODES[documentType] || RECEIPT_CODES.factura;
  const base = [
    `${dd}${mm}${yyyy}`,
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

function ecuadorDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return { day: value("day"), month: value("month"), year: value("year") };
}

function mod11(value) {
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

module.exports = {
  createAccessKey,
  nextSequence
};
