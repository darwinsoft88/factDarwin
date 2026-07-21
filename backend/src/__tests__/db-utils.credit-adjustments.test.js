const assert = require("node:assert/strict");
const test = require("node:test");
const {
  applySnapshotPatch,
  compactSnapshotForStorage,
  reconcileCreditBalancesFromPayments,
  summarizeSnapshot,
  validateSnapshot
} = require("../db-utils");

function sale(overrides = {}) {
  return {
    id: "sale-1",
    clientId: "client-1",
    userId: "user-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    sequence: "000000001",
    accessKey: "access-key-1",
    subtotal: 100,
    tax: 0,
    total: 100,
    paymentMethod: "20",
    paymentCondition: "credito",
    creditBalance: 100,
    creditStatus: "pendiente",
    status: "AUTORIZADA",
    documentType: "factura",
    items: [],
    ...overrides
  };
}

function creditNote(overrides = {}) {
  return sale({
    id: "note-1",
    sequence: "000000002",
    accessKey: "access-key-note-1",
    documentType: "nota_credito",
    paymentCondition: undefined,
    creditBalance: undefined,
    creditStatus: undefined,
    sourceSaleId: "sale-1",
    status: "AUTORIZADA",
    ...overrides
  });
}

function baseData(overrides = {}) {
  return {
    users: [],
    clients: [],
    products: [],
    sales: [sale(), creditNote()],
    creditPayments: [],
    creditAdjustments: [],
    inventoryMovements: [],
    auditLogs: [],
    guides: [],
    cashClosings: [],
    receivedRetentions: [],
    issuer: {
      environment: "1",
      establishment: "001",
      emissionPoint: "001",
      sequential: 1,
      establishments: []
    },
    ...overrides
  };
}

function adjustment(id, amount, state = "APPLIED", overrides = {}) {
  return {
    id,
    operationId: `credit-note-account-adjustment:${id}`,
    type: "CREDIT_NOTE",
    sourceCreditNoteId: "note-1",
    sourceSaleId: "sale-1",
    clientId: "client-1",
    amount,
    state,
    appliedAt: "2026-07-02T00:00:00.000Z",
    userId: "user-1",
    ...overrides
  };
}

function payment(id, amount, overrides = {}) {
  return {
    id,
    operationId: `operation-${id}`,
    saleId: "sale-1",
    clientId: "client-1",
    userId: "user-1",
    userName: "User",
    amount,
    paymentMethod: "01",
    createdAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}

test("merges a patch containing only creditAdjustments", () => {
  const merged = applySnapshotPatch(baseData(), { creditAdjustments: [adjustment("adjustment-1", 30)] });
  assert.equal(merged.creditAdjustments.length, 1);
  assert.equal(merged.sales[0].creditBalance, 70);
  assert.equal(summarizeSnapshot(merged).creditAdjustments, 1);
  assert.doesNotThrow(() => validateSnapshot(merged));
});

test("merges payments and applied adjustments into one canonical balance", () => {
  const merged = applySnapshotPatch(baseData(), {
    creditPayments: [payment("payment-1", 20)],
    creditAdjustments: [adjustment("adjustment-1", 30)]
  });
  assert.equal(merged.sales[0].creditBalance, 50);
});

test("applies an authorized credit-note adjustment", () => {
  const reconciled = reconcileCreditBalancesFromPayments({
    ...baseData(),
    creditAdjustments: [adjustment("adjustment-1", 25)]
  });
  assert.equal(reconciled.sales[0].creditBalance, 75);
});

test("ignores a reversed credit-note adjustment", () => {
  const reconciled = reconcileCreditBalancesFromPayments({
    ...baseData(),
    creditAdjustments: [adjustment("adjustment-1", 25, "REVERSED")]
  });
  assert.equal(reconciled.sales[0].creditBalance, 100);
});

test("subtracts initial issue payments from original credit", () => {
  const reconciled = reconcileCreditBalancesFromPayments(baseData({
    sales: [sale({ payments: [{ id: "initial-1", paymentMethod: "01", amount: 20 }] })]
  }));
  assert.equal(reconciled.sales[0].creditBalance, 80);
});

test("combines initial payments and an applied credit note", () => {
  const reconciled = reconcileCreditBalancesFromPayments(baseData({
    sales: [sale({ payments: [{ id: "initial-1", paymentMethod: "01", amount: 20 }] })],
    creditAdjustments: [adjustment("adjustment-1", 30)]
  }));
  assert.equal(reconciled.sales[0].creditBalance, 50);
});

test("applies multiple credit notes and excludes voided payments", () => {
  const reconciled = reconcileCreditBalancesFromPayments(baseData({
    creditPayments: [payment("payment-1", 10), payment("payment-voided", 40, { voidedAt: "2026-07-03T00:00:00.000Z" })],
    creditAdjustments: [adjustment("adjustment-1", 15), adjustment("adjustment-2", 20)]
  }));
  assert.equal(reconciled.sales[0].creditBalance, 55);
  assert.equal(reconciled.sales[0].creditStatus, "pendiente");
});

test("marks a fully reconciled credit as paid and never returns a negative balance", () => {
  const reconciled = reconcileCreditBalancesFromPayments(baseData({
    creditPayments: [payment("payment-1", 80)],
    creditAdjustments: [adjustment("adjustment-1", 30)]
  }));
  assert.equal(reconciled.sales[0].creditBalance, 0);
  assert.equal(reconciled.sales[0].creditStatus, "pagado");
});

test("rejects a real overpayment against original economic credit", () => {
  const data = baseData({
    sales: [sale({ payments: [{ id: "initial-1", paymentMethod: "01", amount: 20 }] })],
    creditPayments: [payment("payment-1", 80.01)]
  });
  assert.throws(() => validateSnapshot(data), /supera el saldo real/);
});

test("does not classify applied credit-note excess as a payment overpayment", () => {
  const data = baseData({
    sales: [sale({ payments: [{ id: "initial-1", paymentMethod: "01", amount: 20 }] })],
    creditPayments: [payment("payment-1", 80)],
    creditAdjustments: [adjustment("adjustment-1", 30)]
  });
  assert.doesNotThrow(() => validateSnapshot(data));
  assert.equal(reconcileCreditBalancesFromPayments(data).sales[0].creditBalance, 0);
});

test("merges credit adjustments by id", () => {
  const current = baseData({ creditAdjustments: [adjustment("adjustment-1", 30)] });
  const merged = applySnapshotPatch(current, {
    creditAdjustments: [adjustment("adjustment-1", 30, "REVERSED", { reversedAt: "2026-07-04T00:00:00.000Z" })]
  });
  assert.equal(merged.creditAdjustments.length, 1);
  assert.equal(merged.creditAdjustments[0].state, "REVERSED");
  assert.equal(merged.sales[0].creditBalance, 100);
});

test("keeps legacy snapshots without creditAdjustments compatible", () => {
  const legacy = baseData();
  delete legacy.creditAdjustments;
  const merged = applySnapshotPatch(legacy, {});
  assert.deepEqual(merged.creditAdjustments, []);
  assert.doesNotThrow(() => validateSnapshot(merged));
});

test("rejects null, undefined, non-object, missing and empty adjustment ids before merge", () => {
  for (const invalid of [null, undefined, "invalid", adjustment("", 10), adjustment("   ", 10), { ...adjustment("adjustment-1", 10), id: undefined }]) {
    assert.throws(
      () => applySnapshotPatch(baseData(), { creditAdjustments: [invalid] }),
      /Ajuste de cartera invalido/
    );
  }
});

test("rejects invalid credit-adjustment amounts", () => {
  for (const amount of [-10, 0, "abc", Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => applySnapshotPatch(baseData(), { creditAdjustments: [adjustment("invalid-adjustment", amount)] }),
      /Ajuste de cartera invalido: el importe debe ser mayor que cero/
    );
  }
});

test("rejects a non-array creditAdjustments value in a combined patch", () => {
  assert.throws(
    () => applySnapshotPatch(baseData(), { sales: [sale()], creditAdjustments: { id: "invalid" } }),
    /creditAdjustments debe ser una lista/
  );
});

test("rejects invalid credit-payment amounts", () => {
  for (const amount of [-10, "abc", Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]) {
    assert.throws(
      () => applySnapshotPatch(baseData(), { creditPayments: [payment("invalid-payment", amount)] }),
      /Abono invalido: el importe debe ser numerico, finito y mayor que cero/
    );
  }
});

test("rejects invalid initial-payment amounts", () => {
  for (const amount of [-10, 0, "abc", Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const invalidSale = sale({ payments: [{ id: "initial-1", paymentMethod: "01", amount }] });
    assert.throws(
      () => applySnapshotPatch(baseData(), { sales: [invalidSale] }),
      /Pago inicial invalido.*importe debe ser numerico, finito y mayor que cero/
    );
  }
});

test("rejects a new adjustment whose source sale does not exist", () => {
  assert.throws(
    () => applySnapshotPatch(baseData(), {
      creditAdjustments: [adjustment("adjustment-1", 10, "APPLIED", { sourceSaleId: "missing-sale" })]
    }),
    /no existe la venta a credito missing-sale/
  );
});

test("rejects a new adjustment whose source credit note does not exist", () => {
  assert.throws(
    () => applySnapshotPatch(baseData(), {
      creditAdjustments: [adjustment("adjustment-1", 10, "APPLIED", { sourceCreditNoteId: "missing-note" })]
    }),
    /no existe la nota de credito missing-note/
  );
});

test("rejects a credit note associated with another sale", () => {
  const otherSale = sale({ id: "sale-2", sequence: "000000003", accessKey: "access-key-3" });
  const wrongNote = creditNote({ sourceSaleId: otherSale.id });
  assert.throws(
    () => applySnapshotPatch(baseData({ sales: [sale(), otherSale, wrongNote] }), {
      creditAdjustments: [adjustment("adjustment-1", 10)]
    }),
    /nota de credito no pertenece a la venta indicada/
  );
});

test("accepts case A: 100 total, 30 initial and 70 subsequent", () => {
  const merged = applySnapshotPatch(baseData({
    sales: [sale({ payments: [{ id: "initial-1", paymentMethod: "01", amount: 30 }] }), creditNote()]
  }), { creditPayments: [payment("payment-1", 70)] });
  assert.equal(merged.sales.find((item) => item.id === "sale-1").creditBalance, 0);
});

test("rejects case B: 100 total, 30 initial and 71 subsequent", () => {
  assert.throws(
    () => applySnapshotPatch(baseData({
      sales: [sale({ payments: [{ id: "initial-1", paymentMethod: "01", amount: 30 }] }), creditNote()]
    }), { creditPayments: [payment("payment-1", 71)] }),
    /supera el saldo real/
  );
});

test("accepts case C: a valid payment remains valid after a later adjustment", () => {
  const merged = applySnapshotPatch(baseData(), {
    creditPayments: [payment("payment-1", 70)],
    creditAdjustments: [adjustment("adjustment-1", 40)]
  });
  assert.equal(merged.sales.find((item) => item.id === "sale-1").creditBalance, 0);
});

test("accepts case D: an adjustment greater than the balance clamps it to zero", () => {
  const merged = applySnapshotPatch(baseData(), {
    creditAdjustments: [adjustment("adjustment-1", 120)]
  });
  assert.equal(merged.sales.find((item) => item.id === "sale-1").creditBalance, 0);
});

test("rejects case E: a subsequent payment when initial payment covered the total", () => {
  assert.throws(
    () => applySnapshotPatch(baseData({
      sales: [sale({ payments: [{ id: "initial-1", paymentMethod: "01", amount: 100 }] }), creditNote()]
    }), { creditPayments: [payment("payment-1", 1)] }),
    /supera el saldo real/
  );
});

test("preserves an untouched legacy orphan adjustment during an unrelated merge", () => {
  const orphan = adjustment("legacy-orphan", 10, "APPLIED", {
    sourceSaleId: "missing-sale",
    sourceCreditNoteId: "missing-note"
  });
  const merged = applySnapshotPatch(baseData({ creditAdjustments: [orphan] }), { auditLogs: [] });
  assert.deepEqual(merged.creditAdjustments, [orphan]);
});

test("rejects a new orphan adjustment and modification of a legacy orphan", () => {
  const orphan = adjustment("legacy-orphan", 10, "APPLIED", {
    sourceSaleId: "missing-sale",
    sourceCreditNoteId: "missing-note"
  });
  assert.throws(
    () => applySnapshotPatch(baseData(), { creditAdjustments: [orphan] }),
    /no existe la venta a credito missing-sale/
  );
  assert.throws(
    () => applySnapshotPatch(baseData({ creditAdjustments: [orphan] }), {
      creditAdjustments: [{ ...orphan, amount: 11 }]
    }),
    /no existe la venta a credito missing-sale/
  );
});

test("accepts a related sale, note and adjustment arriving in the same patch", () => {
  const empty = baseData({ sales: [], creditAdjustments: [] });
  const merged = applySnapshotPatch(empty, {
    sales: [sale(), creditNote()],
    creditAdjustments: [adjustment("adjustment-1", 20)]
  });
  assert.equal(merged.creditAdjustments.length, 1);
  assert.equal(merged.sales.find((item) => item.id === "sale-1").creditBalance, 80);
});

test("compactSnapshotForStorage preserves referenced sale, note and adjustment", () => {
  const recentSales = Array.from({ length: 100 }, (_, index) => sale({
    id: `recent-${index}`,
    sequence: String(index + 10),
    accessKey: `recent-key-${index}`,
    createdAt: "2026-07-20T00:00:00.000Z"
  }));
  const referencedSale = sale({ createdAt: "2000-01-01T00:00:00.000Z" });
  const referencedNote = creditNote({ createdAt: "2000-01-01T00:00:00.000Z" });
  const unreferenced = sale({
    id: "unreferenced-old",
    sequence: "999999999",
    accessKey: "unreferenced-key",
    createdAt: "2000-01-01T00:00:00.000Z"
  });
  const data = baseData({
    sales: [...recentSales, referencedSale, referencedNote, unreferenced],
    creditAdjustments: [adjustment("adjustment-1", 20)]
  });
  const compacted = compactSnapshotForStorage(data, { salesDays: 30, salesLimit: 100 });
  const ids = new Set(compacted.sales.map((item) => item.id));
  assert.equal(ids.has("sale-1"), true);
  assert.equal(ids.has("note-1"), true);
  assert.equal(ids.has("unreferenced-old"), false);
  assert.equal(compacted.creditAdjustments.length, 1);
});
