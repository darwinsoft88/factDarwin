const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildDocumentEmail,
  buildDocumentRide,
  normalizeRecipient,
  sha256,
  simulationResult
} = require("../document-email-builder");
const { buildRidePdf } = require("../ride-pdf");

const ACCESS_KEY = "2607202601179001234500110010010000001231234567813";
const LIMITS = {
  maxXmlBytes: 5 * 1024 * 1024,
  maxPdfBytes: 10 * 1024 * 1024,
  maxTotalAttachmentBytes: 15 * 1024 * 1024,
  maxHtmlBytes: 500 * 1024
};

function operation(documentType = "factura", overrides = {}) {
  const document = {
    id: "document-1",
    documentType,
    status: "AUTORIZADA",
    accessKey: ACCESS_KEY,
    authorizationNumber: ACCESS_KEY,
    authorizationDate: "2026-07-26T12:00:00.000Z",
    authorizedXml: `<factura><infoTributaria><codDoc>${documentType === "nota_credito" ? "04" : "01"}</codDoc><claveAcceso>${ACCESS_KEY}</claveAcceso></infoTributaria></factura>`,
    establishment: "001",
    emissionPoint: "001",
    sequence: documentType === "nota_credito" ? "000000010" : "000000123",
    createdAt: "2026-07-26T10:00:00.000Z",
    subtotal: 10,
    tax: 1.5,
    total: 11.5,
    paymentMethod: "01",
    creditReason: documentType === "nota_credito" ? "Devolución" : undefined,
    supportDocumentNumber: documentType === "nota_credito" ? "001-001-000000001" : undefined,
    supportIssueDate: documentType === "nota_credito" ? "2026-07-20T10:00:00.000Z" : undefined,
    items: [{ id: "line-1", code: "P1", name: "Producto", quantity: 1, unitPrice: 10, discount: 0, ivaRate: 0.15 }],
    ...(overrides.document || {})
  };
  return {
    id: "operation-1",
    companyId: "company-1",
    documentType,
    documentId: document.id,
    recipientEmail: " Cliente@Example.com ",
    attempts: 1,
    maxAttempts: 5,
    payload: {
      delivery: { recipientEmail: " Cliente@Example.com " },
      authorizationSnapshot: {
        document,
        client: {
          id: "client-1",
          name: "Cliente",
          identification: "1712345678",
          address: "Quito",
          ...(overrides.client || {})
        },
        issuer: {
          ruc: "1790012345001",
          businessName: "Empresa XYZ",
          tradeName: "",
          address: "Quito",
          environment: "1",
          establishment: "001",
          emissionPoint: "001",
          ...(overrides.issuer || {})
        },
        sourceDocument: overrides.sourceDocument || null
      }
    },
    ...overrides.operation
  };
}

test("construye asunto deterministico de factura", async () => {
  const result = await buildDocumentEmail(operation(), { limits: LIMITS });
  assert.equal(result.subject, "Factura 001-001-000000123 - Empresa XYZ");
  assert.equal(result.recipient, "cliente@example.com");
});

test("construye asunto deterministico de nota de credito", async () => {
  const result = await buildDocumentEmail(operation("nota_credito"), { limits: LIMITS });
  assert.equal(result.subject, "Nota de crédito 001-001-000000010 - Empresa XYZ");
});

test("escapa cliente y empresa en HTML", async () => {
  const result = await buildDocumentEmail(operation("factura", {
    client: { name: "<script>alert('cliente')</script>" },
    issuer: { businessName: "<b>Empresa</b>" }
  }), { limits: LIMITS });
  assert(!result.html.includes("<script>"));
  assert(!result.html.includes("<b>Empresa</b>"));
  assert(result.html.includes("&lt;script&gt;"));
  assert(result.html.includes("&lt;b&gt;Empresa&lt;/b&gt;"));
});

test("rechaza destinatario vacio, invalido, multiple e inyeccion de encabezado", () => {
  assert.throws(() => normalizeRecipient(""), (error) => error.code === "RECIPIENT_MISSING");
  assert.throws(() => normalizeRecipient("invalido"), (error) => error.code === "RECIPIENT_INVALID");
  assert.throws(() => normalizeRecipient("a@example.com,b@example.com"), (error) => error.code === "RECIPIENT_INVALID");
  assert.throws(() => normalizeRecipient("a@example.com\r\nBcc:otro@example.com"), (error) => error.code === "RECIPIENT_HEADER_INJECTION");
});

test("detecta XML ausente, invalido y clave diferente", async () => {
  await assert.rejects(
    buildDocumentEmail(operation("factura", { document: { authorizedXml: "" } }), { limits: LIMITS }),
    (error) => error.code === "AUTHORIZED_XML_MISSING" && error.retryable === false
  );
  await assert.rejects(
    buildDocumentEmail(operation("factura", { document: { authorizedXml: "<factura>" } }), { limits: LIMITS }),
    (error) => error.code === "AUTHORIZED_XML_INVALID"
  );
  await assert.rejects(
    buildDocumentEmail(operation("factura", { document: { authorizedXml: "<factura><claveAcceso>otra</claveAcceso></factura>" } }), { limits: LIMITS }),
    (error) => error.code === "ACCESS_KEY_MISMATCH"
  );
});

test("genera RIDE como Buffer PDF valido", async () => {
  const current = operation();
  const snapshot = current.payload.authorizationSnapshot;
  const pdf = await buildRidePdf({
    documentType: current.documentType,
    document: snapshot.document,
    client: snapshot.client,
    issuer: snapshot.issuer,
    sourceDocument: snapshot.sourceDocument
  });
  assert(Buffer.isBuffer(pdf));
  assert(pdf.length > 0);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
});

test("Ver RIDE reutiliza el mismo constructor PDF sin depender del correo", async () => {
  const current = operation("factura", { operation: { recipientEmail: "" } });
  const ride = await buildDocumentRide(current, { limits: LIMITS });

  assert.equal(ride.contentType, "application/pdf");
  assert.match(ride.filename, /\.pdf$/);
  assert.equal(ride.content.subarray(0, 4).toString("ascii"), "%PDF");
  assert.equal(ride.size, ride.content.length);
});

test("genera un RIDE multipagina sin perder el formato PDF", async () => {
  const current = operation("factura", {
    document: {
      items: Array.from({ length: 32 }, (_value, index) => ({
        id: `line-${index + 1}`,
        code: `P${index + 1}`,
        name: `Producto de prueba ${index + 1}`,
        quantity: 1,
        unitPrice: 10,
        discount: 0,
        ivaRate: 0.15
      }))
    }
  });
  const snapshot = current.payload.authorizationSnapshot;
  const pdf = await buildRidePdf({
    documentType: current.documentType,
    document: snapshot.document,
    client: snapshot.client,
    issuer: snapshot.issuer,
    sourceDocument: snapshot.sourceDocument
  });

  assert.equal(Buffer.isBuffer(pdf), true);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length > 1);
});

test("genera RIDE con informacion adicional extensa sin desbordar el resumen", async () => {
  const current = operation("factura", {
    document: {
      additionalInfo: Array.from({ length: 12 }, (_value, index) => ({
        name: `Campo adicional ${index + 1}`,
        value: `Informacion extensa ${index + 1} ${"detalle ".repeat(12)}`
      }))
    },
    client: {
      phone: "0999999999",
      email: "cliente@example.com"
    }
  });
  const snapshot = current.payload.authorizationSnapshot;
  const pdf = await buildRidePdf({
    documentType: current.documentType,
    document: snapshot.document,
    client: snapshot.client,
    issuer: snapshot.issuer,
    sourceDocument: snapshot.sourceDocument
  });

  assert.equal(Buffer.isBuffer(pdf), true);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length > 1);
});

test("rechaza adjuntos por encima del limite", async () => {
  await assert.rejects(
    buildDocumentEmail(operation(), { limits: { ...LIMITS, maxXmlBytes: 10 } }),
    (error) => error.code === "ATTACHMENT_TOO_LARGE"
  );
  await assert.rejects(
    buildDocumentEmail(operation(), { limits: { ...LIMITS, maxPdfBytes: 10 } }),
    (error) => error.code === "ATTACHMENT_TOO_LARGE"
  );
});

test("calcula SHA-256 deterministico", () => {
  assert.equal(sha256(Buffer.from("factudarwin")), sha256(Buffer.from("factudarwin")));
  assert.equal(sha256(Buffer.from("factudarwin")).length, 64);
});

test("simulation_result no contiene cuerpos ni destinatario completo", async () => {
  const built = await buildDocumentEmail(operation(), { limits: LIMITS });
  const safe = simulationResult(built);
  const serialized = JSON.stringify(safe);
  assert.equal(safe.resultCode, "EMAIL_BUILD_VALIDATED");
  assert(!serialized.includes("cliente@example.com"));
  assert(!serialized.includes("<factura>"));
  assert(!serialized.includes("%PDF-"));
  assert(!Object.prototype.hasOwnProperty.call(safe, "html"));
  assert(!Object.prototype.hasOwnProperty.call(safe, "text"));
  assert(safe.attachments.every((item) => !Object.prototype.hasOwnProperty.call(item, "content")));
});
