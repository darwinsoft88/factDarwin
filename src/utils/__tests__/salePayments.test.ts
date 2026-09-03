import { cashPaymentAppliedAmount } from "../salePayments";

describe("sale split payments", () => {
  const payments = [
    { id: "cash", paymentMethod: "01" as const, amount: 101.75 }
  ];

  it("convierte un efectivo entregado menor en importe aplicado para habilitar otro pago", () => {
    expect(cashPaymentAppliedAmount(101.75, payments, "cash", "50")).toBe(50);
  });

  it("no aplica mas que el saldo disponible y conserva el excedente como cambio", () => {
    expect(cashPaymentAppliedAmount(101.75, payments, "cash", "150")).toBe(101.75);
  });

  it("respeta lo ya asignado a otros metodos", () => {
    const split = [...payments, { id: "card", paymentMethod: "16" as const, amount: 40 }];
    expect(cashPaymentAppliedAmount(101.75, split, "cash", "80")).toBe(61.75);
  });
});
