const assert = require("node:assert/strict");
const test = require("node:test");

test("signInvoice propagates the authenticated companyId to the XML signer", async () => {
  const signerPath = require.resolve("../sri/signXml");
  const invoicesPath = require.resolve("../sri/invoices");
  const originalSigner = require.cache[signerPath];
  const originalInvoices = require.cache[invoicesPath];
  let receivedCompanyId = "";

  require.cache[signerPath] = {
    id: signerPath,
    filename: signerPath,
    loaded: true,
    exports: {
      signXmlWithP12: async (xml, companyId) => {
        receivedCompanyId = companyId;
        return xml;
      }
    },
    children: [],
    paths: []
  };
  delete require.cache[invoicesPath];

  try {
    const { signInvoice } = require("../sri/invoices");
    await signInvoice("<factura><claveAcceso>123</claveAcceso></factura>", "co-expected", "test");
    assert.equal(receivedCompanyId, "co-expected");
  } finally {
    if (originalSigner) require.cache[signerPath] = originalSigner;
    else delete require.cache[signerPath];
    if (originalInvoices) require.cache[invoicesPath] = originalInvoices;
    else delete require.cache[invoicesPath];
  }
});
