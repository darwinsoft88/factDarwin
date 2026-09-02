const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  confirmationForSequence,
  executeManualInvoiceResend,
  parseAuthorizationResponse
} = require("../sri/manual-invoice-resend");

const COMPANY = "co-test";
const OLD_TIME = "2026-08-19T07:10:16-05:00";
const NEW_TIME = "2026-08-18T23:56:43-05:00";
const KEY = "1808202601172377209900110020100000003641234567813";

function unsignedXml(total = "1.40") {
  return `<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.1.0"><infoTributaria><ambiente>1</ambiente><ruc>1723772099001</ruc><claveAcceso>${KEY}</claveAcceso><estab>002</estab><ptoEmi>010</ptoEmi><secuencial>000000364</secuencial></infoTributaria><infoFactura><fechaEmision>18/08/2026</fechaEmision><identificacionComprador>9999999999999</identificacionComprador><totalSinImpuestos>1.22</totalSinImpuestos><importeTotal>${total}</importeTotal></infoFactura><detalles><detalle><codigoPrincipal>A</codigoPrincipal><cantidad>1</cantidad><precioUnitario>1.22</precioUnitario><impuestos><impuesto><valor>0.18</valor></impuesto></impuestos></detalle></detalles></factura>`;
}

function signed(xml = unsignedXml(), time = OLD_TIME) {
  return xml.replace("</factura>", `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Object><etsi:QualifyingProperties xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#"><etsi:SigningTime>${time}</etsi:SigningTime></etsi:QualifyingProperties></ds:Object></ds:Signature></factura>`);
}

function sale(overrides = {}) {
  return {
    id: "sale-364",
    companyId: COMPANY,
    sequence: "000000364",
    status: "ERROR_SRI",
    inventoryState: "REVERSED",
    inventoryOperationId: "inventory-364",
    retryHistory: ["attempt-1", "attempt-2", "attempt-3"],
    sriMessage: "Codigo 39 - FIRMA INVALIDA",
    accessKey: KEY,
    signedXml: signed(),
    ...overrides
  };
}

function authorization(status, options = {}) {
  const code = options.code ? `<mensajes><mensaje><identificador>${options.code}</identificador><mensaje>${options.message || "mensaje"}</mensaje></mensaje></mensajes>` : "";
  const comprobante = options.xml ? `<comprobante>${escapeXml(options.xml)}</comprobante>` : "";
  return { ok: true, status: 200, body: `<RespuestaAutorizacionComprobante><numeroComprobantes>1</numeroComprobantes><autorizaciones><autorizacion><estado>${status}</estado><numeroAutorizacion>${options.number || ""}</numeroAutorizacion><fechaAutorizacion>${options.date || ""}</fechaAutorizacion><ambiente>PRUEBAS</ambiente>${comprobante}${code}</autorizacion></autorizaciones></RespuestaAutorizacionComprobante>` };
}

function reception(status = "RECIBIDA") {
  return { ok: true, status: 200, body: `<RespuestaRecepcionComprobante><estado>${status}</estado></RespuestaRecepcionComprobante>` };
}

function dependencies(overrides = {}) {
  const calls = { sign: 0, ask: 0, send: 0, authorized: 0, pending: 0, audit: 0 };
  return {
    calls,
    options: {
      sale: sale(),
      companyId: COMPANY,
      signXml: async (xml) => { calls.sign += 1; return signed(xml, NEW_TIME); },
      askAuthorization: async () => { calls.ask += 1; return authorization("NO AUTORIZADO", { code: "39", message: "FIRMA INVALIDA" }); },
      sendToReception: async () => { calls.send += 1; return reception(); },
      persistAuthorized: async (input) => { calls.authorized += 1; assert.deepEqual(input.sale.retryHistory, ["attempt-1", "attempt-2", "attempt-3"]); assert.equal(input.sale.inventoryState, "REVERSED"); return { ok: true }; },
      persistPending: async (input) => { calls.pending += 1; assert.deepEqual(input.sale.retryHistory, ["attempt-1", "attempt-2", "attempt-3"]); assert.equal(input.sale.inventoryState, "REVERSED"); return { ok: true }; },
      recordAudit: async () => { calls.audit += 1; },
      sleep: async () => {},
      authorizationPollAttempts: 1,
      ...overrides
    }
  };
}

test("simulacion por defecto prevalida pero no consulta, envia ni persiste", async () => {
  const context = dependencies();
  const result = await executeManualInvoiceResend(context.options);
  assert.equal(result.mode, "DRY_RUN");
  assert.equal(result.expectedConfirmation, "RESEND-364-AFTER-PREFLIGHT");
  assert.equal(result.preflight.fiscalContentIdentical, true);
  assert.deepEqual(context.calls, { sign: 1, ask: 0, send: 0, authorized: 0, pending: 0, audit: 0 });
  assert.equal("resignedXml" in result.preflight, false);
});

test("bloquea antes de SRI si cambia un solo valor fiscal", async () => {
  const context = dependencies({ signXml: async (xml) => { context.calls.sign += 1; return signed(xml.replace("<importeTotal>1.40</importeTotal>", "<importeTotal>1.41</importeTotal>"), NEW_TIME); } });
  await assert.rejects(executeManualInvoiceResend({ ...context.options, apply: true, confirmation: "RESEND-364-AFTER-PREFLIGHT" }), { code: "MANUAL_RESEND_FISCAL_DIFFERENCE" });
  assert.equal(context.calls.ask, 0);
  assert.equal(context.calls.send, 0);
});

test("bloquea si no es codigo 39, no esta REVERSED o ya esta AUTORIZADA", async () => {
  for (const changed of [
    { sriMessage: "Codigo 58" },
    { inventoryState: "APPLIED" },
    { status: "AUTORIZADA" }
  ]) {
    const context = dependencies({ sale: sale(changed) });
    await assert.rejects(executeManualInvoiceResend({ ...context.options, apply: true, confirmation: "RESEND-364-AFTER-PREFLIGHT" }));
    assert.equal(context.calls.ask, 0);
    assert.equal(context.calls.send, 0);
  }
});

test("si consulta previa ya esta AUTORIZADA recupera sin recepcion", async () => {
  const authorizedXml = signed(unsignedXml(), NEW_TIME);
  const context = dependencies({ askAuthorization: async () => { context.calls.ask += 1; return authorization("AUTORIZADO", { number: "AUTH-364", date: "2026-08-19T00:00:00-05:00", xml: authorizedXml }); } });
  const result = await executeManualInvoiceResend({ ...context.options, apply: true, confirmation: "RESEND-364-AFTER-PREFLIGHT" });
  assert.equal(result.status, "AUTORIZADA");
  assert.equal(result.sentToReception, false);
  assert.equal(context.calls.send, 0);
  assert.equal(context.calls.authorized, 1);
});

test("NO AUTORIZADO codigo 39 permite exactamente una recepcion y luego autorizacion", async () => {
  const responses = [
    authorization("NO AUTORIZADO", { code: "39", message: "FIRMA INVALIDA" }),
    authorization("AUTORIZADO", { number: "AUTH-364", date: "2026-08-19T00:00:00-05:00", xml: signed(unsignedXml(), NEW_TIME) })
  ];
  const context = dependencies({ askAuthorization: async () => { context.calls.ask += 1; return responses.shift(); } });
  const result = await executeManualInvoiceResend({ ...context.options, apply: true, confirmation: "RESEND-364-AFTER-PREFLIGHT" });
  assert.equal(result.status, "AUTORIZADA");
  assert.equal(result.receptionCalls, 1);
  assert.equal(context.calls.send, 1);
  assert.equal(context.calls.ask, 2);
  assert.equal(context.calls.authorized, 1);
});

test("codigo 70, estado distinto y confirmacion incorrecta nunca llegan a recepcion", async () => {
  for (const response of [
    authorization("PROCESAMIENTO", { code: "70" }),
    authorization("NO AUTORIZADO", { code: "58" })
  ]) {
    const context = dependencies({ askAuthorization: async () => { context.calls.ask += 1; return response; } });
    await assert.rejects(executeManualInvoiceResend({ ...context.options, apply: true, confirmation: "RESEND-364-AFTER-PREFLIGHT" }));
    assert.equal(context.calls.send, 0);
  }
  const wrong = dependencies();
  await assert.rejects(executeManualInvoiceResend({ ...wrong.options, apply: true, confirmation: "SI" }), { code: "MANUAL_RESEND_CONFIRMATION_REQUIRED" });
  assert.equal(wrong.calls.ask, 0);
  assert.equal(wrong.calls.send, 0);
});

test("un intento manual previo bloquea toda nueva recepcion", async () => {
  const context = dependencies({ sale: sale({ manualResendHistory: [{ sentToReception: true }] }) });
  await assert.rejects(executeManualInvoiceResend({ ...context.options, apply: true, confirmation: "RESEND-364-AFTER-PREFLIGHT" }), { code: "MANUAL_RESEND_ALREADY_ATTEMPTED" });
  assert.deepEqual(context.calls, { sign: 0, ask: 0, send: 0, authorized: 0, pending: 0, audit: 0 });
});

test("parser conserva autorizacion, codigo y XML autorizado", () => {
  const xml = signed(unsignedXml(), NEW_TIME);
  const parsed = parseAuthorizationResponse(authorization("AUTORIZADO", { code: "39", number: "AUTH", xml }));
  assert.equal(parsed.status, "AUTORIZADO");
  assert.equal(parsed.authorizationNumber, "AUTH");
  assert.deepEqual(parsed.codes, ["39"]);
  assert.equal(parsed.authorizedXml, xml);
});

test("CLI no usa authorizeInvoice ni operaciones de inventario o secuenciales", () => {
  const source = fs.readFileSync(path.join(__dirname, "../tools/resendManualInvoiceAfterPreflight.js"), "utf8");
  for (const forbidden of ["authorizeInvoice", "applySaleInventory", "reverseSaleInventory", "reserveDocumentSequence", "retryHistory: []"]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.equal(confirmationForSequence("000000370"), "RESEND-370-AFTER-PREFLIGHT");
});

function escapeXml(value) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
