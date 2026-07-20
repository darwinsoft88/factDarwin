import { Client } from "../../types";
import { validateConsumerFinalInvoiceLimit } from "../../validation";

const consumerFinal: Client = {
  id: "c-final",
  name: "Consumidor Final",
  identification: "9999999999999",
  identificationType: "07",
  email: "",
  phone: "",
  address: "Ecuador"
};

const identifiedClient: Client = {
  id: "client-1",
  name: "Cliente Real",
  identification: "0920953742",
  identificationType: "05",
  email: "",
  phone: "",
  address: "Ecuador"
};

describe("validateConsumerFinalInvoiceLimit", () => {
  it("allows consumer final invoices up to 50 dollars", () => {
    const errors: string[] = [];

    validateConsumerFinalInvoiceLimit(consumerFinal, 50, errors);

    expect(errors).toEqual([]);
  });

  it("requires an identified client when consumer final is over 50 dollars", () => {
    const errors: string[] = [];

    validateConsumerFinalInvoiceLimit(consumerFinal, 50.01, errors);

    expect(errors).toEqual([
      "Consumidor final solo puede usarse hasta $50.00. Seleccione o cree un cliente con cedula/RUC para emitir esta factura."
    ]);
  });

  it("allows identified clients over 50 dollars", () => {
    const errors: string[] = [];

    validateConsumerFinalInvoiceLimit(identifiedClient, 120, errors);

    expect(errors).toEqual([]);
  });
});
