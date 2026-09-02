const assert = require("node:assert/strict");
const test = require("node:test");

function loadInvoicesWithSriClient(clientExports) {
  const clientPath = require.resolve("../sri/client");
  const invoicesPath = require.resolve("../sri/invoices");
  const originalClient = require.cache[clientPath];
  const originalInvoices = require.cache[invoicesPath];
  require.cache[clientPath] = {
    id: clientPath,
    filename: clientPath,
    loaded: true,
    exports: clientExports,
    children: [],
    paths: []
  };
  delete require.cache[invoicesPath];
  const invoices = require("../sri/invoices");
  return {
    invoices,
    restore() {
      if (originalClient) require.cache[clientPath] = originalClient;
      else delete require.cache[clientPath];
      if (originalInvoices) require.cache[invoicesPath] = originalInvoices;
      else delete require.cache[invoicesPath];
    }
  };
}

test("authorization query with numeroComprobantes=0 never calls reception", async () => {
  let receptionCalls = 0;
  const loaded = loadInvoicesWithSriClient({
    askAuthorization: async () => ({ ok: true, body: "<RespuestaAutorizacionComprobante><numeroComprobantes>0</numeroComprobantes></RespuestaAutorizacionComprobante>" }),
    sendToReception: async () => {
      receptionCalls += 1;
      throw new Error("Reception must not be called");
    }
  });

  try {
    const result = await loaded.invoices.queryInvoiceAuthorization("1808202601172377209900110020100000003711234567811", "test");
    assert.equal(receptionCalls, 0);
    assert.equal(result.status, "ENVIADA");
    assert.equal(result.authorizationPending, true);
    assert.equal(result.numberOfDocuments, 0);
  } finally {
    loaded.restore();
  }
});

test("authorization query returns the authorized XML without calling reception", async () => {
  let receptionCalls = 0;
  const loaded = loadInvoicesWithSriClient({
    askAuthorization: async () => ({
      ok: true,
      body: "<RespuestaAutorizacionComprobante><numeroComprobantes>1</numeroComprobantes><autorizaciones><autorizacion><estado>AUTORIZADO</estado><numeroAutorizacion>AUTH-1</numeroAutorizacion><fechaAutorizacion>2026-08-18</fechaAutorizacion><ambiente>PRUEBAS</ambiente><comprobante>&lt;factura&gt;ok&lt;/factura&gt;</comprobante></autorizacion></autorizaciones></RespuestaAutorizacionComprobante>"
    }),
    sendToReception: async () => {
      receptionCalls += 1;
    }
  });

  try {
    const result = await loaded.invoices.queryInvoiceAuthorization("1808202601172377209900110020100000003711234567811", "test");
    assert.equal(receptionCalls, 0);
    assert.equal(result.authorizationStatus, "AUTORIZADO");
    assert.equal(result.authorizationNumber, "AUTH-1");
    assert.equal(result.authorizedXml, "<factura>ok</factura>");
  } finally {
    loaded.restore();
  }
});
