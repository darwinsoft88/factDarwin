import { initialData } from "../../database";
import { Sale } from "../../types";
import { accountingMoney } from "../accounting";
import { buildSalesReport } from "../reports";

const saleBase = {
  clientId: "client-1",
  userId: "user-1",
  createdAt: "2026-06-01T12:00:00.000Z",
  accessKey: "",
  authorizationNumber: "",
  subtotal: 100,
  tax: 15,
  total: 115,
  paymentMethod: "01",
  items: []
} as unknown as Sale;

function sale(overrides: Partial<Sale>): Sale {
  return {
    ...saleBase,
    id: overrides.id || "sale",
    sequence: overrides.sequence || "000000001",
    documentType: overrides.documentType || "factura",
    status: overrides.status || "AUTORIZADA",
    ...overrides
  };
}

describe("reports", () => {
  it("no suma tickets convertidos ni anulados, pero los conserva como historial operativo", () => {
    const authorizedInvoice = sale({ id: "invoice", sequence: "000000010", status: "AUTORIZADA", total: 115 });
    const activeTicket = sale({ id: "ticket", sequence: "NV-000000001", documentType: "nota_venta", status: "TICKET_OFFLINE", total: 50, subtotal: 50, tax: 0 });
    const convertedTicket = sale({ id: "converted", sequence: "NV-000000002", documentType: "nota_venta", status: "CONVERTIDA", total: 50, subtotal: 50, tax: 0, voidReason: "Convertida a factura 000000010" });
    const voidedTicket = sale({ id: "voided", sequence: "NV-000000003", documentType: "nota_venta", status: "ANULADA", total: 80, subtotal: 80, tax: 0 });

    const report = buildSalesReport({
      ...initialData,
      sales: [authorizedInvoice, activeTicket, convertedTicket, voidedTicket]
    }, "monthly", "2026", "6", "1", "", "", "operational", "all");

    expect(report.sales.map((item) => item.id)).toEqual(["invoice", "ticket", "converted", "voided"]);
    expect(report.effectiveCount).toBe(2);
    expect(report.convertedCount).toBe(1);
    expect(report.voidedCount).toBe(1);
    expect(report.total).toBe(165);
    expect(accountingMoney(convertedTicket, convertedTicket.total)).toBe("0.00");
    expect(accountingMoney(voidedTicket, voidedTicket.total)).toBe("0.00");
  });

  it("en reporte tributario solo cuenta documentos autorizados SRI", () => {
    const report = buildSalesReport({
      ...initialData,
      sales: [
        sale({ id: "invoice", status: "AUTORIZADA", total: 115 }),
        sale({ id: "ticket", documentType: "nota_venta", status: "TICKET_OFFLINE", total: 50 }),
        sale({ id: "converted", documentType: "nota_venta", status: "CONVERTIDA", total: 50 })
      ]
    }, "monthly", "2026", "6", "1", "", "", "tax", "all");

    expect(report.sales.map((item) => item.id)).toEqual(["invoice"]);
    expect(report.total).toBe(115);
    expect(report.convertedCount).toBe(1);
  });

  it("separa ventas a credito como cuentas por cobrar", () => {
    const report = buildSalesReport({
      ...initialData,
      sales: [
        sale({ id: "cash", total: 10, subtotal: 10, tax: 0, paymentMethod: "01" }),
        sale({ id: "credit", total: 25, subtotal: 25, tax: 0, paymentMethod: "20", paymentCondition: "credito", creditBalance: 25, creditStatus: "pendiente" })
      ]
    }, "monthly", "2026", "6", "1", "", "", "operational", "all");

    expect(report.byPayment["01"]).toBe(10);
    expect(report.byPayment.CREDITO).toBe(25);
    expect(report.byPayment["20"]).toBeUndefined();
  });

  it("separa abono inicial y saldo pendiente en ventas a credito", () => {
    const report = buildSalesReport({
      ...initialData,
      sales: [
        sale({
          id: "mixed-credit",
          total: 100,
          subtotal: 100,
          tax: 0,
          paymentMethod: "20",
          paymentCondition: "credito",
          creditBalance: 50,
          creditStatus: "pendiente",
          payments: [{ id: "pay-1", paymentMethod: "01", amount: 50 }]
        })
      ]
    }, "monthly", "2026", "6", "1", "", "", "operational", "all");

    expect(report.byPayment["01"]).toBe(50);
    expect(report.byPayment.CREDITO).toBe(50);
    expect(report.byPayment["20"]).toBeUndefined();
  });

  it("separa productos y servicios en los totales del reporte", () => {
    const mixedSale = sale({
      id: "mixed",
      subtotal: 120,
      tax: 18,
      total: 138,
      items: [
        {
          productId: "product-1",
          itemType: "product",
          code: "P1",
          name: "Producto",
          quantity: 1,
          unitPrice: 100,
          discount: 0,
          ivaRate: 0.15
        },
        {
          productId: "service-1",
          itemType: "service",
          code: "S1",
          name: "Servicio",
          quantity: 1,
          unitPrice: 20,
          discount: 0,
          ivaRate: 0.15
        }
      ]
    });

    const productsReport = buildSalesReport({
      ...initialData,
      sales: [mixedSale]
    }, "monthly", "2026", "6", "1", "", "", "tax", "all", "products");
    const servicesReport = buildSalesReport({
      ...initialData,
      sales: [mixedSale]
    }, "monthly", "2026", "6", "1", "", "", "tax", "all", "services");

    expect(productsReport.sales.map((item) => item.id)).toEqual(["mixed"]);
    expect(productsReport.subtotal).toBe(100);
    expect(productsReport.iva15).toBe(15);
    expect(productsReport.total).toBe(115);
    expect(servicesReport.sales.map((item) => item.id)).toEqual(["mixed"]);
    expect(servicesReport.subtotal).toBe(20);
    expect(servicesReport.iva15).toBe(3);
    expect(servicesReport.total).toBe(23);
  });
});
