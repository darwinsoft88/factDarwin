import type {
  Client,
  CreditAdjustment,
  CreditPayment,
  InventoryMovement,
  Product,
  PendingSyncItem,
  ReceivedRetention,
  RemissionGuide,
  Sale,
} from "../types";

export interface CatalogSnapshotHashes {
  clients: string;
  products: string;
  sales: string;
  inventoryMovements: string;
  creditPayments?: string;
  creditAdjustments?: string;
  receivedRetentions?: string;
  guides?: string;
  pendingSync?: string;
}

async function sha256(value: unknown): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } =
    await import("expo-crypto");
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify(value),
  );
}

export async function calculateCatalogSnapshotHashes(
  payload: unknown,
): Promise<CatalogSnapshotHashes> {
  const snapshot = payload as {
    clients?: Client[];
    products?: Product[];
    sales?: Sale[];
    inventoryMovements?: InventoryMovement[];
    creditPayments?: CreditPayment[];
    creditAdjustments?: CreditAdjustment[];
    receivedRetentions?: ReceivedRetention[];
    guides?: RemissionGuide[];
    pendingSync?: PendingSyncItem[];
  };
  const sales = snapshot?.sales === undefined ? [] : snapshot.sales;
  const inventoryMovements = snapshot?.inventoryMovements === undefined
    ? []
    : snapshot.inventoryMovements;
  const creditPayments = snapshot?.creditPayments === undefined
    ? []
    : snapshot.creditPayments;
  const creditAdjustments = snapshot?.creditAdjustments === undefined
    ? []
    : snapshot.creditAdjustments;
  const receivedRetentions = snapshot?.receivedRetentions === undefined
    ? []
    : snapshot.receivedRetentions;
  const guides = snapshot?.guides === undefined ? [] : snapshot.guides;
  const pendingSync = snapshot?.pendingSync === undefined
    ? []
    : snapshot.pendingSync;
  if (
    !Array.isArray(snapshot?.clients) ||
    !Array.isArray(snapshot?.products) ||
    !Array.isArray(sales) ||
    !Array.isArray(inventoryMovements) ||
    !Array.isArray(creditPayments) ||
    !Array.isArray(creditAdjustments) ||
    !Array.isArray(receivedRetentions) ||
    !Array.isArray(guides) ||
    !Array.isArray(pendingSync)
  ) {
    throw new Error("El snapshot no contiene los catálogos requeridos.");
  }
  // Sequential hashing keeps only one serialized catalog in memory at a time.
  // The snapshot writer already provides deterministic JSON key ordering.
  const clients = await sha256(snapshot.clients);
  const products = await sha256(snapshot.products);
  const salesHash = await sha256(sales);
  const inventoryMovementsHash = await sha256(inventoryMovements);
  const creditPaymentsHash = await sha256(creditPayments);
  const creditAdjustmentsHash = await sha256(creditAdjustments);
  const receivedRetentionsHash = await sha256(receivedRetentions);
  const guidesHash = await sha256(guides);
  const pendingSyncHash = await sha256(pendingSync);
  return {
    clients,
    products,
    sales: salesHash,
    inventoryMovements: inventoryMovementsHash,
    creditPayments: creditPaymentsHash,
    creditAdjustments: creditAdjustmentsHash,
    receivedRetentions: receivedRetentionsHash,
    guides: guidesHash,
    pendingSync: pendingSyncHash,
  };
}
