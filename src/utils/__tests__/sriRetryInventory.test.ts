import { InventoryMovement, Product, Sale } from "../../types";
import {
  acquireSaleRetryLock,
  applySaleInventoryOnce,
  applySriRetryInventoryOutcome,
  reverseSaleInventoryOnce,
  sriAuthorizedReapplyOperationId
} from "../inventory";

const product: Product = {
  id: "product-1",
  itemType: "product",
  code: "P-1",
  name: "Producto",
  price: 1.15,
  ivaRate: 15,
  stock: 10
};

const sale = {
  id: "sale-1",
  documentType: "factura",
  clientId: "client-1",
  userId: "user-1",
  createdAt: "2026-08-01T10:00:00.000Z",
  sequence: "000000001",
  accessKey: "access-key-1",
  subtotal: 1,
  tax: 0.15,
  total: 1.15,
  paymentMethod: "01",
  status: "PENDIENTE_SRI",
  inventoryState: "NOT_APPLIED",
  items: [{ productId: product.id, itemType: "product", code: product.code, name: product.name, quantity: 2, unitPrice: 1, discount: 0, ivaRate: 15 }]
} as Sale;

function reversedFixture() {
  const applied = applySaleInventoryOnce({
    products: [product],
    movements: [],
    sale,
    operationId: "original-operation",
    userId: "user-1",
    createdAt: sale.createdAt,
    reason: "Venta pendiente"
  });
  return reverseSaleInventoryOnce({
    products: applied.products,
    movements: applied.movements,
    sale: applied.sale,
    operationId: "original-operation",
    userId: "user-1",
    createdAt: "2026-08-01T10:01:00.000Z",
    reason: "Error SRI"
  });
}

function authorizedResult(previousSale: Sale): Sale {
  return {
    ...previousSale,
    status: "AUTORIZADA",
    authorizationNumber: "authorization-1",
    authorizedXml: "<autorizacion />"
  };
}

describe("reaplicacion de inventario despues de reintento SRI", () => {
  it("bloquea inmediatamente una segunda pulsacion para la misma factura", () => {
    const active = new Set<string>();
    const release = acquireSaleRetryLock(active, sale.id);

    expect(release).not.toBeNull();
    expect(acquireSaleRetryLock(active, sale.id)).toBeNull();
    release?.();
    expect(acquireSaleRetryLock(active, sale.id)).not.toBeNull();
  });

  it("reaplica una factura REVERSED solamente despues de AUTORIZADA", () => {
    const reversed = reversedFixture();
    const result = applySriRetryInventoryOutcome({
      products: reversed.products,
      movements: reversed.movements,
      previousSale: reversed.sale,
      resultSale: authorizedResult(reversed.sale),
      userId: "user-1",
      createdAt: "2026-08-01T10:02:00.000Z"
    });

    expect(result.sale.inventoryState).toBe("APPLIED");
    expect(result.sale.inventoryOperationId).toBe(sriAuthorizedReapplyOperationId(result.sale));
    expect(result.products[0]?.stock).toBe(8);
    expect(result.movements).toHaveLength(3);
  });

  it.each(["ERROR_SRI", "DEVUELTA", "PENDIENTE_SRI"] as const)("mantiene REVERSED y no toca stock cuando el resultado es %s", (status) => {
    const reversed = reversedFixture();
    const result = applySriRetryInventoryOutcome({
      products: reversed.products,
      movements: reversed.movements,
      previousSale: reversed.sale,
      resultSale: { ...reversed.sale, status },
      userId: "user-1",
      createdAt: "2026-08-01T10:02:00.000Z"
    });

    expect(result.sale.inventoryState).toBe("REVERSED");
    expect(result.products).toEqual(reversed.products);
    expect(result.movements).toEqual(reversed.movements);
  });

  it("es idempotente al aplicar nuevamente la misma autorizacion", () => {
    const reversed = reversedFixture();
    const first = applySriRetryInventoryOutcome({
      products: reversed.products,
      movements: reversed.movements,
      previousSale: reversed.sale,
      resultSale: authorizedResult(reversed.sale),
      userId: "user-1",
      createdAt: "2026-08-01T10:02:00.000Z"
    });
    const second = applySriRetryInventoryOutcome({
      products: first.products,
      movements: first.movements,
      previousSale: first.sale,
      resultSale: first.sale,
      userId: "user-1",
      createdAt: "2026-08-01T10:03:00.000Z"
    });

    expect(second.products).toEqual(first.products);
    expect(second.movements).toEqual(first.movements);
    expect(second.sale.inventoryState).toBe("APPLIED");
  });

  it("deja reconciliacion pendiente si la autorizacion no puede reaplicar stock", () => {
    const reversed = reversedFixture();
    const result = applySriRetryInventoryOutcome({
      products: reversed.products.map((item) => ({ ...item, stock: 0 })),
      movements: reversed.movements,
      previousSale: reversed.sale,
      resultSale: authorizedResult(reversed.sale),
      userId: "user-1",
      createdAt: "2026-08-01T10:02:00.000Z"
    });

    expect(result.sale.status).toBe("AUTORIZADA");
    expect(result.sale.inventoryState).toBe("RECONCILIATION_PENDING");
    expect(result.reconciliationPending).toBe(true);
    expect(result.movements).toEqual(reversed.movements as InventoryMovement[]);
  });
});
