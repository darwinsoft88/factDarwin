import { CreditNoteInventoryOperationType, CreditNoteInventoryState, InventoryMovement, InventoryMovementType, InventoryOperationType, Product, Sale, SaleInventoryOperationType } from "../types";
import { isInventoryProduct } from "./catalogItems";
import { resolveSaleInventoryState, saleStatusReducesStock } from "./sales";

export type SaleInventoryErrorCode =
  | "SALE_INVENTORY_UNKNOWN"
  | "SALE_INVENTORY_LEGACY_RECONCILIATION_REQUIRED"
  | "SALE_INVENTORY_PARTIAL_OPERATION"
  | "SALE_INVENTORY_INCONSISTENT_MOVEMENTS"
  | "SALE_INVENTORY_OPERATION_MISMATCH"
  | "SALE_INVENTORY_ALREADY_REVERSED"
  | "SALE_INVENTORY_INSUFFICIENT_STOCK";

export class SaleInventoryError extends Error {
  readonly saleId: string;
  readonly operationId: string;
  readonly operationType?: InventoryOperationType;

  constructor(code: SaleInventoryErrorCode, saleId: string, operationId: string, operationType?: InventoryOperationType) {
    super("La operacion de inventario requiere revision antes de continuar.");
    this.name = "SaleInventoryError";
    this.code = code;
    this.saleId = saleId;
    this.operationId = operationId;
    this.operationType = operationType;
  }

  readonly code: SaleInventoryErrorCode;
}

export type CreditNoteInventoryErrorCode =
  | "CREDIT_NOTE_INVENTORY_NOTE_NOT_FOUND"
  | "CREDIT_NOTE_INVENTORY_INVALID_DOCUMENT_TYPE"
  | "CREDIT_NOTE_INVENTORY_LEGACY_RECONCILIATION_REQUIRED"
  | "CREDIT_NOTE_INVENTORY_OPERATION_REQUIRED"
  | "CREDIT_NOTE_INVENTORY_OPERATION_MISMATCH"
  | "CREDIT_NOTE_INVENTORY_PARTIAL_OPERATION"
  | "CREDIT_NOTE_INVENTORY_INCONSISTENT_MOVEMENTS"
  | "CREDIT_NOTE_INVENTORY_PRODUCT_NOT_FOUND"
  | "CREDIT_NOTE_INVENTORY_INSUFFICIENT_STOCK"
  | "CREDIT_NOTE_INVENTORY_INVALID_QUANTITY"
  | "CREDIT_NOTE_INVENTORY_ALREADY_REVERSED";

export class CreditNoteInventoryError extends Error {
  readonly code: CreditNoteInventoryErrorCode;
  readonly noteId: string;
  readonly operationId: string;
  readonly operationType?: CreditNoteInventoryOperationType;

  constructor(code: CreditNoteInventoryErrorCode, noteId: string, operationId: string, operationType?: CreditNoteInventoryOperationType) {
    super("La operacion de inventario de la nota de credito requiere revision antes de continuar.");
    this.name = "CreditNoteInventoryError";
    this.code = code;
    this.noteId = noteId;
    this.operationId = operationId;
    this.operationType = operationType;
  }
}

export type SaleInventoryOperationOptions = {
  products: Product[];
  movements: InventoryMovement[];
  sale: Sale;
  operationId: string;
  userId: string;
  createdAt: string;
  reason: string;
};

export type SaleInventoryOperationResult = {
  products: Product[];
  movements: InventoryMovement[];
  sale: Sale;
  changed: boolean;
};

type ExpectedMovement = {
  id: string;
  productId: string;
  quantity: number;
};

export type CreditNoteInventoryOperationOptions = {
  products: Product[];
  movements: InventoryMovement[];
  note?: Sale;
  userId: string;
  createdAt: string;
  reason: string;
};

export type CreditNoteInventoryOperationResult = {
  products: Product[];
  movements: InventoryMovement[];
  note: Sale;
  changed: boolean;
};

function inventoryMovementOperationId(operationId: string, productId: string, operationType: InventoryOperationType) {
  return `${operationId}:${productId}:${operationType}`;
}

function saleInventoryQuantities(sale: Sale) {
  const quantities = new Map<string, number>();
  sale.items.forEach((item) => {
    if (!isInventoryProduct(item)) return;
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  });
  return quantities;
}

function expectedMovements(sale: Sale, operationId: string, operationType: SaleInventoryOperationType) {
  return Array.from(saleInventoryQuantities(sale), ([productId, quantity]): ExpectedMovement => ({
    id: inventoryMovementOperationId(operationId, productId, operationType),
    productId,
    quantity
  }));
}

function assertOperationCompatible(sale: Sale, operationId: string, operationType: SaleInventoryOperationType) {
  if (sale.inventoryOperationId && sale.inventoryOperationId !== operationId) {
    throw new SaleInventoryError("SALE_INVENTORY_OPERATION_MISMATCH", sale.id, operationId, operationType);
  }
}

function inspectMovementEvidence(movements: InventoryMovement[], expected: ExpectedMovement[], sale: Sale, operationId: string, operationType: SaleInventoryOperationType) {
  const expectedIds = new Set(expected.map((movement) => movement.id));
  const byId = new Map(movements.map((movement) => [movement.id, movement]));
  const related = movements.filter((movement) => movement.inventoryOperationId === operationId && movement.inventoryOperationType === operationType);

  if (related.some((movement) => movement.saleId !== sale.id || !expectedIds.has(movement.id))) {
    throw new SaleInventoryError("SALE_INVENTORY_OPERATION_MISMATCH", sale.id, operationId, operationType);
  }

  let present = 0;
  expected.forEach((item) => {
    const movement = byId.get(item.id);
    if (!movement) return;
    present += 1;
    if (
      movement.productId !== item.productId ||
      movement.type !== (operationType === "APPLY" ? "salida" : "entrada") ||
      movement.quantity !== item.quantity ||
      movement.saleId !== sale.id ||
      movement.inventoryOperationId !== operationId ||
      movement.inventoryOperationType !== operationType
    ) {
      throw new SaleInventoryError("SALE_INVENTORY_INCONSISTENT_MOVEMENTS", sale.id, operationId, operationType);
    }
  });

  if (present > 0 && present < expected.length) {
    throw new SaleInventoryError("SALE_INVENTORY_PARTIAL_OPERATION", sale.id, operationId, operationType);
  }

  return { complete: present === expected.length, present };
}

function requireKnownState(sale: Sale, operationId: string, operationType: SaleInventoryOperationType) {
  const state = resolveSaleInventoryState(sale);
  if (state === "UNKNOWN") {
    throw new SaleInventoryError("SALE_INVENTORY_LEGACY_RECONCILIATION_REQUIRED", sale.id, operationId, operationType);
  }
  return state;
}

export function applySaleInventoryOnce(options: SaleInventoryOperationOptions): SaleInventoryOperationResult {
  const { products, movements, sale, operationId, userId, createdAt, reason } = options;
  const state = requireKnownState(sale, operationId, "APPLY");
  assertOperationCompatible(sale, operationId, "APPLY");
  const expectedApply = expectedMovements(sale, operationId, "APPLY");
  const applyEvidence = inspectMovementEvidence(movements, expectedApply, sale, operationId, "APPLY");
  const reverseEvidence = inspectMovementEvidence(movements, expectedMovements(sale, operationId, "REVERSE"), sale, operationId, "REVERSE");

  if (state === "REVERSED" || reverseEvidence.present > 0) {
    throw new SaleInventoryError("SALE_INVENTORY_ALREADY_REVERSED", sale.id, operationId, "APPLY");
  }
  if (applyEvidence.complete && state === "APPLIED") return { products, movements, sale, changed: false };
  if (state === "APPLIED") {
    throw new SaleInventoryError("SALE_INVENTORY_INCONSISTENT_MOVEMENTS", sale.id, operationId, "APPLY");
  }
  if (applyEvidence.present > 0) {
    throw new SaleInventoryError("SALE_INVENTORY_INCONSISTENT_MOVEMENTS", sale.id, operationId, "APPLY");
  }

  const quantities = saleInventoryQuantities(sale);
  const createdMovements: InventoryMovement[] = [];
  const nextProducts = products.map((product) => {
    if (!isInventoryProduct(product)) return product;
    const quantity = quantities.get(product.id) || 0;
    if (quantity <= 0) return product;
    if (product.stock < quantity) {
      throw new SaleInventoryError("SALE_INVENTORY_INSUFFICIENT_STOCK", sale.id, operationId, "APPLY");
    }
    const stockAfter = product.stock - quantity;
    createdMovements.push({
      id: inventoryMovementOperationId(operationId, product.id, "APPLY"),
      productId: product.id,
      productName: product.name,
      type: "salida",
      quantity,
      stockBefore: product.stock,
      stockAfter,
      reason,
      reference: sale.sequence,
      saleId: sale.id,
      inventoryOperationId: operationId,
      inventoryOperationType: "APPLY",
      userId,
      createdAt
    });
    return { ...product, stock: stockAfter };
  });
  if (createdMovements.length !== expectedApply.length) {
    throw new SaleInventoryError("SALE_INVENTORY_INCONSISTENT_MOVEMENTS", sale.id, operationId, "APPLY");
  }

  return {
    products: nextProducts,
    movements: [...movements, ...createdMovements],
    sale: { ...sale, inventoryState: "APPLIED", inventoryOperationId: operationId },
    changed: true
  };
}

export function sriAuthorizedReapplyOperationId(sale: Sale) {
  const authorizationIdentity = sale.authorizationNumber || sale.accessKey;
  if (!authorizationIdentity) {
    throw new SaleInventoryError("SALE_INVENTORY_OPERATION_MISMATCH", sale.id, "", "APPLY");
  }
  return `SRI_REAPPLY:v1:${sale.id}:${authorizationIdentity}`;
}

export function acquireSaleRetryLock(activeSaleIds: Set<string>, saleId: string) {
  if (activeSaleIds.has(saleId)) return null;
  activeSaleIds.add(saleId);
  return () => activeSaleIds.delete(saleId);
}

export function reapplyAuthorizedSaleInventoryOnce(
  options: Omit<SaleInventoryOperationOptions, "operationId">
): SaleInventoryOperationResult {
  const { products, movements, sale, userId, createdAt, reason } = options;
  const operationId = sriAuthorizedReapplyOperationId(sale);
  const state = resolveSaleInventoryState(sale);

  if (sale.status !== "AUTORIZADA") {
    throw new SaleInventoryError("SALE_INVENTORY_OPERATION_MISMATCH", sale.id, operationId, "APPLY");
  }

  if (state === "APPLIED") {
    if (sale.inventoryOperationId !== operationId) {
      throw new SaleInventoryError("SALE_INVENTORY_OPERATION_MISMATCH", sale.id, operationId, "APPLY");
    }
    return applySaleInventoryOnce({ products, movements, sale, operationId, userId, createdAt, reason });
  }

  if (state !== "REVERSED" && state !== "RECONCILIATION_PENDING") {
    throw new SaleInventoryError("SALE_INVENTORY_OPERATION_MISMATCH", sale.id, operationId, "APPLY");
  }

  const originalOperationId = sale.inventoryOperationId || sale.id;
  const originalApply = inspectMovementEvidence(movements, expectedMovements(sale, originalOperationId, "APPLY"), sale, originalOperationId, "APPLY");
  const originalReverse = inspectMovementEvidence(movements, expectedMovements(sale, originalOperationId, "REVERSE"), sale, originalOperationId, "REVERSE");
  if (!originalApply.complete || !originalReverse.complete) {
    throw new SaleInventoryError("SALE_INVENTORY_INCONSISTENT_MOVEMENTS", sale.id, originalOperationId, "REVERSE");
  }

  const reapplyEvidence = inspectMovementEvidence(movements, expectedMovements(sale, operationId, "APPLY"), sale, operationId, "APPLY");
  if (reapplyEvidence.complete) {
    return {
      products,
      movements,
      sale: { ...sale, inventoryState: "APPLIED", inventoryOperationId: operationId },
      changed: false
    };
  }

  return applySaleInventoryOnce({
    products,
    movements,
    sale: { ...sale, inventoryState: "NOT_APPLIED", inventoryOperationId: undefined },
    operationId,
    userId,
    createdAt,
    reason
  });
}

export function applySriRetryInventoryOutcome(options: {
  products: Product[];
  movements: InventoryMovement[];
  previousSale: Sale;
  resultSale: Sale;
  userId: string;
  createdAt: string;
}) {
  const { products, movements, previousSale, resultSale, userId, createdAt } = options;
  if (resolveSaleInventoryState(previousSale) !== "REVERSED" || resultSale.status !== "AUTORIZADA") {
    return {
      products,
      movements,
      sale: resolveSaleInventoryState(previousSale) === "REVERSED"
        ? { ...resultSale, inventoryState: "REVERSED" as const, inventoryOperationId: previousSale.inventoryOperationId }
        : resultSale,
      reconciliationPending: false
    };
  }

  try {
    const reapplied = reapplyAuthorizedSaleInventoryOnce({
      products,
      movements,
      sale: { ...resultSale, inventoryState: "REVERSED", inventoryOperationId: previousSale.inventoryOperationId },
      userId,
      createdAt,
      reason: "Reaplicacion despues de autorizacion SRI"
    });
    return { ...reapplied, reconciliationPending: false };
  } catch (error) {
    if (!(error instanceof SaleInventoryError)) throw error;
    return {
      products,
      movements,
      sale: { ...resultSale, inventoryState: "RECONCILIATION_PENDING" as const, inventoryOperationId: previousSale.inventoryOperationId },
      changed: false,
      reconciliationPending: true
    };
  }
}

export function reverseSaleInventoryOnce(options: SaleInventoryOperationOptions): SaleInventoryOperationResult {
  const { products, movements, sale, operationId, userId, createdAt, reason } = options;
  const state = requireKnownState(sale, operationId, "REVERSE");
  assertOperationCompatible(sale, operationId, "REVERSE");
  const expectedApply = expectedMovements(sale, operationId, "APPLY");
  const expectedReverse = expectedMovements(sale, operationId, "REVERSE");
  const applyEvidence = inspectMovementEvidence(movements, expectedApply, sale, operationId, "APPLY");
  const reverseEvidence = inspectMovementEvidence(movements, expectedReverse, sale, operationId, "REVERSE");

  if (state === "NOT_APPLIED" && applyEvidence.present === 0 && reverseEvidence.present === 0) {
    return { products, movements, sale, changed: false };
  }
  if (!applyEvidence.complete) {
    throw new SaleInventoryError("SALE_INVENTORY_INCONSISTENT_MOVEMENTS", sale.id, operationId, "APPLY");
  }
  if (reverseEvidence.complete && state === "REVERSED") return { products, movements, sale, changed: false };
  if (state === "REVERSED" || reverseEvidence.present > 0) {
    throw new SaleInventoryError("SALE_INVENTORY_INCONSISTENT_MOVEMENTS", sale.id, operationId, "REVERSE");
  }
  if (state !== "APPLIED") {
    throw new SaleInventoryError("SALE_INVENTORY_INCONSISTENT_MOVEMENTS", sale.id, operationId, "REVERSE");
  }

  const quantities = saleInventoryQuantities(sale);
  const createdMovements: InventoryMovement[] = [];
  const nextProducts = products.map((product) => {
    if (!isInventoryProduct(product)) return product;
    const quantity = quantities.get(product.id) || 0;
    if (quantity <= 0) return product;
    const stockAfter = product.stock + quantity;
    createdMovements.push({
      id: inventoryMovementOperationId(operationId, product.id, "REVERSE"),
      productId: product.id,
      productName: product.name,
      type: "entrada",
      quantity,
      stockBefore: product.stock,
      stockAfter,
      reason,
      reference: sale.sequence,
      saleId: sale.id,
      inventoryOperationId: operationId,
      inventoryOperationType: "REVERSE",
      userId,
      createdAt
    });
    return { ...product, stock: stockAfter };
  });
  if (createdMovements.length !== expectedReverse.length) {
    throw new SaleInventoryError("SALE_INVENTORY_INCONSISTENT_MOVEMENTS", sale.id, operationId, "REVERSE");
  }

  return {
    products: nextProducts,
    movements: [...movements, ...createdMovements],
    sale: { ...sale, inventoryState: "REVERSED", inventoryOperationId: operationId },
    changed: true
  };
}

const SAFE_LEGACY_CREDIT_NOTE_NOT_APPLIED_STATUSES = new Set<Sale["status"]>([
  "BORRADOR",
  "FIRMADA",
  "ENVIADA",
  "PENDIENTE_SRI",
  "ENVIADA_SRI",
  "DEVUELTA"
]);

export function resolveCreditNoteInventoryState(note: Sale): CreditNoteInventoryState {
  if (note.creditNoteInventoryState) return note.creditNoteInventoryState;
  if (note.documentType !== "nota_credito") return "UNKNOWN";
  return SAFE_LEGACY_CREDIT_NOTE_NOT_APPLIED_STATUSES.has(note.status) ? "NOT_APPLIED" : "UNKNOWN";
}

function requireCreditNote(options: CreditNoteInventoryOperationOptions, operationType: CreditNoteInventoryOperationType) {
  const note = options.note;
  if (!note) {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_NOTE_NOT_FOUND", "", "", operationType);
  }
  if (note.documentType !== "nota_credito") {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_INVALID_DOCUMENT_TYPE", note.id, note.creditNoteInventoryOperationId || "", operationType);
  }
  const operationId = note.creditNoteInventoryOperationId;
  if (!operationId) {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_OPERATION_REQUIRED", note.id, "", operationType);
  }
  const state = resolveCreditNoteInventoryState(note);
  if (state === "UNKNOWN") {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_LEGACY_RECONCILIATION_REQUIRED", note.id, operationId, operationType);
  }
  return { note, operationId, state };
}

function creditNoteInventoryQuantities(note: Sale, operationId: string, operationType: CreditNoteInventoryOperationType) {
  const quantities = new Map<string, number>();
  note.items.forEach((item) => {
    if (!isInventoryProduct(item)) return;
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_INVALID_QUANTITY", note.id, operationId, operationType);
    }
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  });
  return quantities;
}

function expectedCreditNoteMovements(note: Sale, operationId: string, operationType: CreditNoteInventoryOperationType) {
  return Array.from(creditNoteInventoryQuantities(note, operationId, operationType), ([productId, quantity]): ExpectedMovement => ({
    id: inventoryMovementOperationId(operationId, productId, operationType),
    productId,
    quantity
  }));
}

function inspectCreditNoteMovementEvidence(movements: InventoryMovement[], expected: ExpectedMovement[], note: Sale, operationId: string, operationType: CreditNoteInventoryOperationType) {
  const expectedIds = new Set(expected.map((movement) => movement.id));
  const byId = new Map(movements.map((movement) => [movement.id, movement]));
  const related = movements.filter((movement) => movement.inventoryOperationId === operationId && movement.inventoryOperationType === operationType);

  if (related.some((movement) => movement.saleId !== note.id || !expectedIds.has(movement.id))) {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_OPERATION_MISMATCH", note.id, operationId, operationType);
  }

  let present = 0;
  expected.forEach((item) => {
    const movement = byId.get(item.id);
    if (!movement) return;
    present += 1;
    const expectedMovementType = operationType === "CREDIT_NOTE_RETURN" ? "entrada" : "salida";
    if (
      movement.productId !== item.productId ||
      movement.type !== expectedMovementType ||
      movement.quantity !== item.quantity ||
      movement.saleId !== note.id ||
      movement.inventoryOperationId !== operationId ||
      movement.inventoryOperationType !== operationType
    ) {
      throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_INCONSISTENT_MOVEMENTS", note.id, operationId, operationType);
    }
  });

  if (present > 0 && present < expected.length) {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_PARTIAL_OPERATION", note.id, operationId, operationType);
  }

  return { complete: present === expected.length, present };
}

function validateCreditNoteProducts(products: Product[], expected: ExpectedMovement[], note: Sale, operationId: string, operationType: CreditNoteInventoryOperationType) {
  const productIds = new Set(products.filter(isInventoryProduct).map((product) => product.id));
  if (expected.some((movement) => !productIds.has(movement.productId))) {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_PRODUCT_NOT_FOUND", note.id, operationId, operationType);
  }
}

export function applyCreditNoteInventoryOnce(options: CreditNoteInventoryOperationOptions): CreditNoteInventoryOperationResult {
  const { products, movements, userId, createdAt, reason } = options;
  const { note, operationId, state } = requireCreditNote(options, "CREDIT_NOTE_RETURN");
  const expectedReturn = expectedCreditNoteMovements(note, operationId, "CREDIT_NOTE_RETURN");
  const returnEvidence = inspectCreditNoteMovementEvidence(movements, expectedReturn, note, operationId, "CREDIT_NOTE_RETURN");
  const reverseEvidence = inspectCreditNoteMovementEvidence(movements, expectedCreditNoteMovements(note, operationId, "CREDIT_NOTE_RETURN_REVERSE"), note, operationId, "CREDIT_NOTE_RETURN_REVERSE");

  if (state === "REVERSED" || reverseEvidence.present > 0) {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_ALREADY_REVERSED", note.id, operationId, "CREDIT_NOTE_RETURN");
  }
  if (returnEvidence.complete && state === "APPLIED") return { products, movements, note, changed: false };
  if (state !== "NOT_APPLIED" || returnEvidence.present > 0) {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_INCONSISTENT_MOVEMENTS", note.id, operationId, "CREDIT_NOTE_RETURN");
  }

  validateCreditNoteProducts(products, expectedReturn, note, operationId, "CREDIT_NOTE_RETURN");
  const quantities = creditNoteInventoryQuantities(note, operationId, "CREDIT_NOTE_RETURN");
  const createdMovements: InventoryMovement[] = [];
  const nextProducts = products.map((product) => {
    if (!isInventoryProduct(product)) return product;
    const quantity = quantities.get(product.id) || 0;
    if (quantity <= 0) return product;
    const stockAfter = product.stock + quantity;
    createdMovements.push({
      id: inventoryMovementOperationId(operationId, product.id, "CREDIT_NOTE_RETURN"),
      productId: product.id,
      productName: product.name,
      type: "entrada",
      quantity,
      stockBefore: product.stock,
      stockAfter,
      reason,
      reference: note.sequence,
      saleId: note.id,
      inventoryOperationId: operationId,
      inventoryOperationType: "CREDIT_NOTE_RETURN",
      userId,
      createdAt
    });
    return { ...product, stock: stockAfter };
  });

  return {
    products: nextProducts,
    movements: [...movements, ...createdMovements],
    note: { ...note, creditNoteInventoryState: "APPLIED", creditNoteInventoryOperationId: operationId },
    changed: true
  };
}

export function reverseCreditNoteInventoryOnce(options: CreditNoteInventoryOperationOptions): CreditNoteInventoryOperationResult {
  const { products, movements, userId, createdAt, reason } = options;
  const { note, operationId, state } = requireCreditNote(options, "CREDIT_NOTE_RETURN_REVERSE");
  const expectedReturn = expectedCreditNoteMovements(note, operationId, "CREDIT_NOTE_RETURN");
  const expectedReverse = expectedCreditNoteMovements(note, operationId, "CREDIT_NOTE_RETURN_REVERSE");
  const returnEvidence = inspectCreditNoteMovementEvidence(movements, expectedReturn, note, operationId, "CREDIT_NOTE_RETURN");
  const reverseEvidence = inspectCreditNoteMovementEvidence(movements, expectedReverse, note, operationId, "CREDIT_NOTE_RETURN_REVERSE");

  if (state === "NOT_APPLIED" && returnEvidence.present === 0 && reverseEvidence.present === 0) {
    return { products, movements, note, changed: false };
  }
  if (!returnEvidence.complete) {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_INCONSISTENT_MOVEMENTS", note.id, operationId, "CREDIT_NOTE_RETURN");
  }
  if (reverseEvidence.complete && state === "REVERSED") return { products, movements, note, changed: false };
  if (state !== "APPLIED" || reverseEvidence.present > 0) {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_INCONSISTENT_MOVEMENTS", note.id, operationId, "CREDIT_NOTE_RETURN_REVERSE");
  }

  validateCreditNoteProducts(products, expectedReverse, note, operationId, "CREDIT_NOTE_RETURN_REVERSE");
  const quantities = creditNoteInventoryQuantities(note, operationId, "CREDIT_NOTE_RETURN_REVERSE");
  const insufficientStock = products.some((product) => isInventoryProduct(product) && product.stock < (quantities.get(product.id) || 0));
  if (insufficientStock) {
    throw new CreditNoteInventoryError("CREDIT_NOTE_INVENTORY_INSUFFICIENT_STOCK", note.id, operationId, "CREDIT_NOTE_RETURN_REVERSE");
  }

  const createdMovements: InventoryMovement[] = [];
  const nextProducts = products.map((product) => {
    if (!isInventoryProduct(product)) return product;
    const quantity = quantities.get(product.id) || 0;
    if (quantity <= 0) return product;
    const stockAfter = product.stock - quantity;
    createdMovements.push({
      id: inventoryMovementOperationId(operationId, product.id, "CREDIT_NOTE_RETURN_REVERSE"),
      productId: product.id,
      productName: product.name,
      type: "salida",
      quantity,
      stockBefore: product.stock,
      stockAfter,
      reason,
      reference: note.sequence,
      saleId: note.id,
      inventoryOperationId: operationId,
      inventoryOperationType: "CREDIT_NOTE_RETURN_REVERSE",
      userId,
      createdAt
    });
    return { ...product, stock: stockAfter };
  });

  return {
    products: nextProducts,
    movements: [...movements, ...createdMovements],
    note: { ...note, creditNoteInventoryState: "REVERSED", creditNoteInventoryOperationId: operationId },
    changed: true
  };
}

export function buildStockCredits(sale?: Sale) {
  const credits = new Map<string, number>();
  if (!sale || !saleStatusReducesStock(sale.status)) return credits;

  sale.items.forEach((item) => {
    if (!isInventoryProduct(item)) return;
    credits.set(item.productId, (credits.get(item.productId) || 0) + item.quantity);
  });

  return credits;
}

export function getAvailableStockForSale(product: Product, editingSale?: Sale) {
  if (!isInventoryProduct(product)) return Number.POSITIVE_INFINITY;
  return product.stock + (buildStockCredits(editingSale).get(product.id) || 0);
}

export function restoreSaleStock(products: Product[], sale: Sale) {
  const credits = buildStockCredits(sale);

  return products.map((product) => {
    if (!isInventoryProduct(product)) return product;
    const quantity = credits.get(product.id) || 0;
    return quantity > 0 ? { ...product, stock: product.stock + quantity } : product;
  });
}

export function createInventoryMovement(product: Product, type: InventoryMovementType, quantity: number, stockAfter: number, reason: string, userId: string, stockBefore = product.stock, reference?: string): InventoryMovement {
  return {
    id: inventoryMovementId(),
    productId: product.id,
    productName: product.name,
    type,
    quantity,
    stockBefore,
    stockAfter,
    reason,
    reference,
    userId,
    createdAt: new Date().toISOString()
  };
}

export function buildStockMovements(products: Product[], sale: Sale, type: InventoryMovementType, reason: string, userId: string, createdAt: string, createId: () => string) {
  const quantities = new Map<string, number>();
  sale.items.forEach((item) => {
    if (!isInventoryProduct(item)) return;
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  });

  return products.flatMap((product) => {
    if (!isInventoryProduct(product)) return [];
    const quantity = quantities.get(product.id) || 0;
    if (quantity <= 0) return [];
    const stockAfter = type === "entrada" ? product.stock + quantity : product.stock - quantity;

    return [{
      id: createId(),
      productId: product.id,
      productName: product.name,
      type,
      quantity,
      stockBefore: product.stock,
      stockAfter,
      reason,
      reference: sale.sequence,
      userId,
      createdAt
    }];
  });
}

export function movementReason(type: InventoryMovementType) {
  if (type === "entrada") return "Compra o ingreso de mercaderia";
  if (type === "salida") return "Merma, uso interno o salida manual";
  return "Correccion de stock";
}

export function movementTypeLabel(type: InventoryMovementType) {
  if (type === "entrada") return "Entrada";
  if (type === "salida") return "Salida";
  return "Ajuste";
}

const inventoryMovementId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
