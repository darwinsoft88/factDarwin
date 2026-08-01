import type { RemissionGuide, SaleItem } from "../../types";

export const GUIDE_DECIMAL_SCALE = 1_000_000;

const GUIDE_KEYS = new Set([
  "id", "establishment", "emissionPoint", "establishmentName",
  "sourceSaleId", "clientId", "userId", "createdAt", "sequence",
  "accessKey", "authorizationNumber", "authorizationDate", "sriEnvironment",
  "sriMessage", "retryHistory", "signedXml", "authorizedXml", "status",
  "transporterName", "transporterIdentification",
  "transporterIdentificationType", "plate", "startAddress", "endAddress",
  "route", "reason", "startDate", "endDate", "items",
]);

const ITEM_KEYS = new Set([
  "productId", "itemType", "code", "name", "quantity", "unitPrice", "cost",
  "discount", "ivaRate", "sourceLineKey",
]);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stable(nested)]),
    );
  }
  return value;
}

function extras(
  source: Record<string, unknown>,
  modeled: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !modeled.has(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, stable(value)]),
  );
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function micros(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.round(numeric * GUIDE_DECIMAL_SCALE)
    : null;
}

export function canonicalGuideItem(item: SaleItem) {
  const source = item as unknown as Record<string, unknown>;
  return {
    productId: String(source.productId ?? ""),
    itemType: text(source.itemType),
    code: String(source.code ?? ""),
    name: String(source.name ?? ""),
    quantityMicros: micros(source.quantity),
    unitPriceMicros: micros(source.unitPrice),
    costMicros: source.cost === undefined ? null : micros(source.cost),
    discountMicros: micros(source.discount),
    ivaRateMicros: micros(source.ivaRate),
    sourceLineKey: text(source.sourceLineKey),
    compatibility: extras(source, ITEM_KEYS),
  };
}

export function canonicalRemissionGuide(guide: RemissionGuide) {
  const source = guide as unknown as Record<string, unknown>;
  return {
    id: String(source.id ?? ""),
    establishment: text(source.establishment),
    emissionPoint: text(source.emissionPoint),
    establishmentName: text(source.establishmentName),
    sourceSaleId: String(source.sourceSaleId ?? ""),
    clientId: String(source.clientId ?? ""),
    userId: String(source.userId ?? ""),
    createdAt: String(source.createdAt ?? ""),
    sequence: String(source.sequence ?? ""),
    accessKey: String(source.accessKey ?? ""),
    authorizationNumber: text(source.authorizationNumber),
    authorizationDate: text(source.authorizationDate),
    sriEnvironment: text(source.sriEnvironment),
    sriMessage: text(source.sriMessage),
    retryHistory: Array.isArray(source.retryHistory)
      ? source.retryHistory.map(String)
      : [],
    signedXml: text(source.signedXml),
    authorizedXml: text(source.authorizedXml),
    status: String(source.status ?? ""),
    transporterName: String(source.transporterName ?? ""),
    transporterIdentification: String(
      source.transporterIdentification ?? "",
    ),
    transporterIdentificationType: String(
      source.transporterIdentificationType ?? "",
    ),
    plate: String(source.plate ?? ""),
    startAddress: String(source.startAddress ?? ""),
    endAddress: String(source.endAddress ?? ""),
    route: String(source.route ?? ""),
    reason: String(source.reason ?? ""),
    startDate: String(source.startDate ?? ""),
    endDate: String(source.endDate ?? ""),
    items: Array.isArray(source.items)
      ? (source.items as SaleItem[]).map(canonicalGuideItem)
      : [],
    compatibility: extras(source, GUIDE_KEYS),
  };
}

export async function hashRemissionGuide(
  guide: RemissionGuide,
): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } =
    await import("expo-crypto");
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify(canonicalRemissionGuide(guide)),
  );
}
