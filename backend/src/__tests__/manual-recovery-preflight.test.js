const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  fiscalSnapshot,
  prevalidateManualRecovery,
  removeXmlDsigSignature
} = require("../sri/manual-recovery-preflight");

const COMPANY = "co-test";
const ORIGINAL_TIME = "2026-08-19T07:10:16-05:00";
const NEW_TIME = "2026-08-18T22:30:00-05:00";

function fiscalXml(overrides = {}) {
  const sequence = overrides.sequence || "000000364";
  const total = overrides.total || "12.34";
  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria><ambiente>1</ambiente><ruc>1723772099001</ruc><claveAcceso>1808202601172377209900110020100000003641234567813</claveAcceso><estab>002</estab><ptoEmi>010</ptoEmi><secuencial>${sequence}</secuencial></infoTributaria>
  <infoFactura><fechaEmision>18/08/2026</fechaEmision><identificacionComprador>9999999999999</identificacionComprador><totalSinImpuestos>10.73</totalSinImpuestos><importeTotal>${total}</importeTotal></infoFactura>
  <detalles><detalle><codigoPrincipal>A1</codigoPrincipal><descripcion>Producto</descripcion><cantidad>2</cantidad><precioUnitario>5.365</precioUnitario><descuento>0</descuento><impuestos><impuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><tarifa>15</tarifa><baseImponible>10.73</baseImponible><valor>1.61</valor></impuesto></impuestos></detalle></detalles>
  <infoAdicional><campoAdicional nombre="Observacion">Conservar exactamente</campoAdicional></infoAdicional>
</factura>`;
}

function addSignature(xml, signingTime = ORIGINAL_TIME) {
  return xml.replace("</factura>", `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Object><etsi:QualifyingProperties xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#"><etsi:SignedProperties><etsi:SignedSignatureProperties><etsi:SigningTime>${signingTime}</etsi:SigningTime></etsi:SignedSignatureProperties></etsi:SignedProperties></etsi:QualifyingProperties></ds:Object></ds:Signature></factura>`);
}

function sale(sequence = "000000364") {
  return {
    id: `sale-${sequence}`,
    companyId: COMPANY,
    sequence,
    status: "ERROR_SRI",
    inventoryState: "REVERSED",
    inventoryOperationId: "inventory-original",
    retryHistory: ["2026-08-18T22:18:50.359Z"],
    sriMessage: "Codigo 39 - FIRMA INVALIDA",
    signedXml: addSignature(fiscalXml({ sequence }))
  };
}

test("elimina exclusivamente XMLDSig y conserva el fingerprint fiscal", () => {
  const original = fiscalXml();
  const stripped = removeXmlDsigSignature(addSignature(original));
  assert.equal(fiscalSnapshot(stripped).fingerprint, fiscalSnapshot(original).fingerprint);
  assert(!stripped.includes("Signature"));
  assert(stripped.includes("Conservar exactamente"));
});

test("re-firma en memoria con -05:00 sin alterar clave, fecha, secuencial, cliente, items ni totales", async () => {
  const input = sale();
  const retryBefore = [...input.retryHistory];
  const inventoryBefore = { state: input.inventoryState, operation: input.inventoryOperationId };
  const report = await prevalidateManualRecovery({
    sale: input,
    companyId: COMPANY,
    signXml: async (xml) => addSignature(xml, NEW_TIME)
  });

  assert.equal(report.originalSigningTime, ORIGINAL_TIME);
  assert.equal(report.newSigningTime, NEW_TIME);
  assert.equal(report.originalFingerprint, report.resignedFingerprint);
  assert.equal(report.fiscalContentIdentical, true);
  assert.equal(report.technicallyEligible, true);
  for (const field of ["claveAcceso", "fechaEmision", "secuencial", "ruc", "ambiente", "estab", "ptoEmi", "identificacionComprador", "totalSinImpuestos", "importeTotal"]) {
    assert.equal(report.invariants[field].identical, true, field);
  }
  assert.deepEqual(input.retryHistory, retryBefore);
  assert.deepEqual({ state: input.inventoryState, operation: input.inventoryOperationId }, inventoryBefore);
});

test("cualquier diferencia fiscal bloquea la recuperacion", async () => {
  const report = await prevalidateManualRecovery({
    sale: sale(),
    companyId: COMPANY,
    signXml: async (xml) => addSignature(xml.replace("<importeTotal>12.34</importeTotal>", "<importeTotal>99.99</importeTotal>"), NEW_TIME)
  });
  assert.equal(report.fiscalContentIdentical, false);
  assert.equal(report.technicallyEligible, false);
  assert(report.differences.length > 0);
  assert.match(report.note, /BLOQUEADA/);
});

test("rechaza expresamente 363, 365 y 371", async () => {
  for (const sequence of ["000000363", "000000365", "000000371"]) {
    await assert.rejects(
      prevalidateManualRecovery({ sale: sale(sequence), companyId: COMPANY, signXml: async (xml) => addSignature(xml, NEW_TIME) }),
      (error) => error.code === "RECOVERY_SEQUENCE_EXPLICITLY_REJECTED"
    );
  }
});

test("rechaza estados, inventario o rechazo SRI fuera del incidente", async () => {
  await assert.rejects(prevalidateManualRecovery({ sale: { ...sale(), status: "AUTORIZADA" }, companyId: COMPANY, signXml: async () => "" }), { code: "RECOVERY_STATUS_NOT_ALLOWED" });
  await assert.rejects(prevalidateManualRecovery({ sale: { ...sale(), inventoryState: "APPLIED" }, companyId: COMPANY, signXml: async () => "" }), { code: "RECOVERY_INVENTORY_NOT_REVERSED" });
  await assert.rejects(prevalidateManualRecovery({ sale: { ...sale(), sriMessage: "otro error" }, companyId: COMPANY, signXml: async () => "" }), { code: "RECOVERY_REJECTION_NOT_SIGNATURE_39" });
});

test("el modulo y la CLI no contienen llamadas de recepcion o autorizacion completa", () => {
  for (const relative of ["../sri/manual-recovery-preflight.js", "../tools/prevalidateManualInvoiceRecovery.js"]) {
    const source = fs.readFileSync(path.join(__dirname, relative), "utf8");
    assert.equal(source.includes("sendToReception"), false);
    assert.equal(source.includes("authorizeInvoice"), false);
    assert.equal(source.includes("askAuthorization"), false);
  }
});
