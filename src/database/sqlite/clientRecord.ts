import type { Client } from "../../types";

const CLIENT_KEYS = new Set([
  "id",
  "name",
  "identification",
  "identificationType",
  "email",
  "phone",
  "address",
  "updatedAt",
]);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export interface CanonicalClientRecord {
  id: string;
  name: string;
  identification: string;
  identificationType: string;
  email: string;
  phone: string;
  address: string;
  updatedAt: string | null;
  compatibility: Record<string, unknown>;
}

export function canonicalClientRecord(
  client: Client,
): CanonicalClientRecord {
  const source = client as Client & Record<string, unknown>;
  const compatibility = Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !CLIENT_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, stableValue(value)]),
  );

  return {
    id: String(client.id),
    name: String(client.name),
    identification: String(client.identification),
    identificationType: String(client.identificationType),
    email: String(client.email),
    phone: String(client.phone),
    address: String(client.address),
    updatedAt: client.updatedAt ? String(client.updatedAt) : null,
    compatibility,
  };
}

export function serializeCanonicalClient(client: Client): string {
  return JSON.stringify(canonicalClientRecord(client));
}

export async function hashClientRecord(client: Client): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } =
    await import("expo-crypto");
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    serializeCanonicalClient(client),
  );
}
