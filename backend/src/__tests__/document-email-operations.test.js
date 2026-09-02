const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAutomaticEmailOperation,
  buildManualEmailOperation,
  createAutomaticEmailOperations,
  detectAutomaticEmailTransitions
} = require("../document-email-operations");

function fixture(overrides = {}) {
  const document = {
    id: "sale-1",
    documentType: "factura",
    clientId: "client-1",
    status: "PENDIENTE_SRI",
    sequence: "000000001",
    establishment: "001",
    emissionPoint: "001",
    accessKey: "access-1",
    authorizationNumber: "",
    authorizationDate: "",
    authorizedXml: "",
    items: [{ id: "line-1", code: "P1", name: "Producto", quantity: 1, unitPrice: 10, ivaRate: 0.15 }]
  };
  return {
    users: [],
    clients: [{ id: "client-1", name: "Cliente", email: "cliente@example.com" }],
    products: [],
    sales: [{ ...document, ...(overrides.document || {}) }],
    issuer: {
      ruc: "1790012345001",
      businessName: "Empresa",
      tradeName: "Empresa",
      address: "Quito",
      establishment: "001",
      emissionPoint: "001",
      ...(overrides.issuer || {})
    },
    ...overrides.data
  };
}

function authorized(data, overrides = {}) {
  return {
    ...data,
    sales: data.sales.map((document) => ({
      ...document,
      status: "AUTORIZADA",
      authorizationNumber: "authorization-1",
      authorizationDate: "2026-07-26T12:00:00.000Z",
      authorizedXml: "<autorizacion />",
      ...overrides
    }))
  };
}

test("detecta la transicion usando el estado durable anterior y el documento final fusionado", () => {
  const previous = fixture();
  const finalData = authorized(previous);
  const transitions = detectAutomaticEmailTransitions(previous, finalData);

  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].previous.status, "PENDIENTE_SRI");
  assert.equal(transitions[0].document.status, "AUTORIZADA");
});

test("no crea otra transicion cuando el documento durable ya estaba autorizado", () => {
  const previous = authorized(fixture());
  const finalData = {
    ...previous,
    sales: previous.sales.map((document) => ({ ...document, sriMessage: "Respuesta repetida" }))
  };

  assert.deepEqual(detectAutomaticEmailTransitions(previous, finalData), []);
});

test("ignora proformas, tickets y documentos no autorizados", () => {
  const proforma = fixture({ document: { documentType: "proforma", status: "PROFORMA" } });
  const finalData = authorized(proforma);

  assert.deepEqual(detectAutomaticEmailTransitions(proforma, finalData), []);
});

test("registra como fallida y auditable una autorizacion con datos incompletos", () => {
  const previous = fixture({
    document: { authorizedXml: "" },
    issuer: { businessName: "" },
    data: { clients: [{ id: "client-1", name: "Cliente", email: "" }] }
  });
  const transition = detectAutomaticEmailTransitions(previous, authorized(previous, { authorizedXml: "" }))[0];
  const operation = buildAutomaticEmailOperation("company-1", authorized(previous, { authorizedXml: "" }), transition, "2026-07-26T12:00:00.000Z");

  assert.equal(operation.status, "failed");
  assert.equal(operation.retryable, false);
  assert.equal(operation.lastErrorCode, "RECIPIENT_MISSING");
  assert.match(operation.lastErrorMessage, /XML autorizado/);
  assert.equal(operation.payload.authorizationSnapshot.recipientEmailAtAuthorization, "");
});

test("la clave de operacion separa empresa, tipo y documento", () => {
  const invoiceData = authorized(fixture());
  const invoiceTransition = detectAutomaticEmailTransitions(fixture(), invoiceData)[0];
  const creditPrevious = fixture({ document: { documentType: "nota_credito" } });
  const creditData = authorized(creditPrevious);
  const creditTransition = detectAutomaticEmailTransitions(creditPrevious, creditData)[0];

  const first = buildAutomaticEmailOperation("company-1", invoiceData, invoiceTransition);
  const otherCompany = buildAutomaticEmailOperation("company-2", invoiceData, invoiceTransition);
  const otherType = buildAutomaticEmailOperation("company-1", creditData, creditTransition);

  assert.notEqual(first.id, otherCompany.id);
  assert.notEqual(first.id, otherType.id);
});

test("el reenvio manual construye el mismo snapshot autorizado para el generador backend", () => {
  const data = authorized(fixture());
  const operation = buildManualEmailOperation("company-1", data, {
    documentId: "sale-1",
    documentType: "factura",
    recipientEmail: "NUEVO@EXAMPLE.COM",
    requestId: "manual-request-1"
  }, "2026-07-26T13:00:00.000Z");

  assert.equal(operation.origin, "manual_resend");
  assert.equal(operation.recipientEmail, "nuevo@example.com");
  assert.equal(operation.payload.authorizationSnapshot.document.authorizedXml, "<autorizacion />");
  assert.equal(operation.payload.authorizationSnapshot.client.id, "client-1");
  assert.equal(operation.payload.authorizationSnapshot.issuer.ruc, "1790012345001");
});

test("el reenvio manual rechaza documentos no autorizados", () => {
  assert.throws(
    () => buildManualEmailOperation("company-1", fixture(), {
      documentId: "sale-1",
      documentType: "factura",
      recipientEmail: "cliente@example.com"
    }),
    /Solo se puede enviar un documento autorizado/
  );
});

test("dos inserciones concurrentes conservan una sola operacion automatica", async () => {
  const previous = fixture();
  const finalData = authorized(previous);
  const storedKeys = new Set();
  const fakeClient = {
    async query(_sql, params) {
      await Promise.resolve();
      const key = `${params[1]}:${params[2]}:${params[3]}:${params[5]}`;
      if (storedKeys.has(key)) return { rowCount: 0, rows: [] };
      storedKeys.add(key);
      return { rowCount: 1, rows: [{ id: params[0] }] };
    }
  };

  const [first, second] = await Promise.all([
    createAutomaticEmailOperations(fakeClient, "company-1", previous, finalData),
    createAutomaticEmailOperations(fakeClient, "company-1", previous, finalData)
  ]);

  assert.equal(first.created + second.created, 1);
  assert.equal(storedKeys.size, 1);
});
