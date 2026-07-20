import { initialData } from "../../database";
import { CreditPayment, Sale } from "../../types";
import { buildCreditPaymentReceiptHtml, buildCreditPaymentsReceiptHtml, estimateCreditPaymentReceiptHeightMm, estimateCreditPaymentsReceiptHeightMm } from "../creditReceipt";

const sale: Sale = {
  id: "sale-credit",
  clientId: "c-final",
  userId: "u-admin",
  createdAt: "2026-06-04T12:00:00.000Z",
  sequence: "000000001",
  accessKey: "access-key",
  subtotal: 100,
  tax: 15,
  total: 115,
  paymentMethod: "20",
  paymentCondition: "credito",
  creditBalance: 75,
  creditStatus: "pendiente",
  status: "AUTORIZADA",
  documentType: "factura",
  items: []
};

const payment: CreditPayment = {
  id: "pay-abcdef",
  saleId: sale.id,
  clientId: sale.clientId,
  userId: "u-admin",
  userName: "DARWIN",
  amount: 40,
  paymentMethod: "01",
  note: "Transferencia banco",
  createdAt: "2026-06-05T10:00:00.000Z"
};

describe("credit payment receipt", () => {
  it("builds a receipt with payment and balance information", () => {
    const html = buildCreditPaymentReceiptHtml({
      client: initialData.clients[0]!,
      issuer: initialData.issuer,
      payment,
      sale
    });

    expect(html).toContain("RECIBO DE ABONO");
    expect(html).toContain("001-001-000000001");
    expect(html).toContain("$40.00");
    expect(html).toContain("$75.00");
    expect(html).toContain("Transferencia banco");
  });

  it("estimates a compact thermal height for one payment receipt", () => {
    const height = estimateCreditPaymentReceiptHeightMm({
      client: initialData.clients[0]!,
      payment
    });

    expect(height).toBeGreaterThanOrEqual(135);
    expect(height).toBeLessThan(260);
  });

  it("builds a grouped receipt for multiple credit payments", () => {
    const secondSale: Sale = {
      ...sale,
      id: "sale-credit-2",
      sequence: "000000002",
      total: 60,
      creditBalance: 0
    };
    const secondPayment: CreditPayment = {
      ...payment,
      id: "pay-ghijkl",
      saleId: secondSale.id,
      amount: 60
    };

    const html = buildCreditPaymentsReceiptHtml({
      client: initialData.clients[0]!,
      issuer: initialData.issuer,
      payments: [payment, secondPayment],
      sales: [sale, secondSale]
    });

    expect(html).toContain("COMPROBANTE DE COBRO");
    expect(html).toContain("001-001-000000001");
    expect(html).toContain("001-001-000000002");
    expect(html).toContain("$100.00");
    expect(html).toContain("Saldo pendiente");
    expect(html).toContain("$75.00");
  });

  it("grows thermal height for grouped payment receipts", () => {
    const onePaymentHeight = estimateCreditPaymentsReceiptHeightMm({
      client: initialData.clients[0]!,
      payments: [payment]
    });
    const multiplePaymentsHeight = estimateCreditPaymentsReceiptHeightMm({
      client: initialData.clients[0]!,
      payments: [payment, { ...payment, id: "pay-2" }, { ...payment, id: "pay-3" }]
    });

    expect(multiplePaymentsHeight).toBeGreaterThan(onePaymentHeight);
    expect(multiplePaymentsHeight).toBeLessThan(520);
  });
});
