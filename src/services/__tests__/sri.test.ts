import { buildCreditNoteXml, buildInvoiceXml } from "../sri";
import { initialData } from "../../storage";
import { Client, Sale } from "../../types";

const client: Client = {
  id: "c1",
  name: "Cliente Prueba",
  identification: "9999999999999",
  identificationType: "07",
  email: "",
  phone: "",
  address: "Ecuador"
};

const sale: Sale = {
  id: "s1",
  clientId: client.id,
  userId: "u1",
  createdAt: "2026-05-26T12:00:00.000Z",
  sequence: "000000001",
  accessKey: "260520260117900123440011001001000000001123456781",
  subtotal: 10,
  tax: 0,
  total: 10,
  paymentMethod: "01",
  status: "BORRADOR",
  items: [{ productId: "p1", code: "P1", name: "Producto", quantity: 1, unitPrice: 10, discount: 0, ivaRate: 0 }]
};

describe("SRI XML tax regime legends", () => {
  it("adds RIMPE negocio popular legend to invoice additional info", () => {
    const xml = buildInvoiceXml(sale, client, { ...initialData.issuer, taxRegime: "rimpe_negocio_popular" });

    expect(xml).toContain("Contribuyente Negocio Popular - Régimen RIMPE");
  });

  it("adds RIMPE emprendedor legend to credit notes", () => {
    const xml = buildCreditNoteXml(
      { ...sale, supportDocumentNumber: "001-001-000000001", supportIssueDate: "26/05/2026" },
      client,
      { ...initialData.issuer, taxRegime: "rimpe_emprendedor" }
    );

    expect(xml).toContain("Contribuyente Régimen RIMPE");
  });
});
