import { buildCreditNoteXml, buildInvoiceXml } from "../sri";
import { initialData } from "../../database";
import { buildRideHtml } from "../../sri/ride";
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

    expect(xml).toContain("Contribuyente Negocio Popular - Regimen RIMPE");
  });

  it("marks credit invoices as SRI payment 20 with additional credit info", () => {
    const xml = buildInvoiceXml(
      {
        ...sale,
        paymentMethod: "20",
        paymentCondition: "credito",
        creditDueDate: "2026-07-15",
        creditBalance: 10,
        creditStatus: "pendiente"
      },
      client,
      initialData.issuer
    );

    expect(xml).toContain("<formaPago>20</formaPago>");
    expect(xml).toContain("Condicion de pago");
    expect(xml).toContain("Credito");
    expect(xml).toContain("Fecha de vencimiento");
    expect(xml).toContain("2026-07-15");
  });

  it("adds RIMPE emprendedor legend to credit notes", () => {
    const xml = buildCreditNoteXml(
      { ...sale, supportDocumentNumber: "001-001-000000001", supportIssueDate: "26/05/2026" },
      client,
      { ...initialData.issuer, taxRegime: "rimpe_emprendedor" }
    );

    expect(xml).toContain("Contribuyente Regimen RIMPE");
  });

  it("adds sale custom additional info to invoice XML and RIDE", () => {
    const saleWithInfo: Sale = {
      ...sale,
      additionalInfo: [{ id: "info-1", name: "Orden de compra", value: "OC-2026-001" }]
    };

    const xml = buildInvoiceXml(saleWithInfo, client, initialData.issuer);
    const ride = buildRideHtml(saleWithInfo, client, initialData.issuer);

    expect(xml).toContain('campoAdicional nombre="Orden de compra"');
    expect(xml).toContain("OC-2026-001");
    expect(ride).toContain("Orden de compra");
    expect(ride).toContain("OC-2026-001");
  });
});
