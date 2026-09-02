import { fetchDocumentRide } from "./backend";

type RideDocumentType = "factura" | "nota_credito";
type RideResult = Awaited<ReturnType<typeof fetchDocumentRide>>;

const MAX_CACHE_ENTRIES = 12;
const CACHE_TTL_MS = 10 * 60 * 1000;
const documentSyncs = new Map<string, Promise<boolean>>();
const rideCache = new Map<string, { expiresAt: number; promise: Promise<RideResult> }>();

function documentKey(backendUrl: string, documentId: string, documentType: RideDocumentType) {
  return `${backendUrl.replace(/\/$/, "")}::${documentType}::${documentId}`;
}

export function trackDocumentSync(backendUrl: string, documentId: string, documentType: RideDocumentType, sync: Promise<boolean>) {
  const key = documentKey(backendUrl, documentId, documentType);
  documentSyncs.set(key, sync);
  const clear = () => {
    if (documentSyncs.get(key) === sync) documentSyncs.delete(key);
  };
  void sync.then(clear, clear);
  return sync;
}

export async function waitForDocumentSync(backendUrl: string, documentId: string, documentType: RideDocumentType) {
  return documentSyncs.get(documentKey(backendUrl, documentId, documentType)) ?? true;
}

export function getCachedDocumentRide(
  backendUrl: string,
  payload: { documentId: string; documentType: RideDocumentType },
  token: string
) {
  // El token forma parte únicamente de la clave en memoria para impedir que una
  // sesión de otra empresa reutilice un PDF aunque coincidiera el documentId.
  const key = `${documentKey(backendUrl, payload.documentId, payload.documentType)}::${token}`;
  const cached = rideCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  if (cached) rideCache.delete(key);

  const promise = fetchDocumentRide(backendUrl, payload, token).catch((error) => {
    rideCache.delete(key);
    throw error;
  });
  rideCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, promise });
  while (rideCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = rideCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    rideCache.delete(oldestKey);
  }
  return promise;
}

export function prefetchDocumentRide(backendUrl: string, payload: { documentId: string; documentType: RideDocumentType }, token: string) {
  void getCachedDocumentRide(backendUrl, payload, token).catch(() => undefined);
}

export function resetDocumentRideCoordinatorForTests() {
  documentSyncs.clear();
  rideCache.clear();
}
