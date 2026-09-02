import { authHeaders, backendBaseUrl, fetchWithTimeout, postJson, readJson } from "./http";

export type ProductImageMetadata = {
  ok: true;
  imageVersion: string;
  imageUpdatedAt: string;
  imageMimeType: "image/webp";
};

export async function uploadProductImage(backendUrl: string, productId: string, base64: string, token: string) {
  const response = await postJson(
    `${backendBaseUrl(backendUrl)}/api/products/${encodeURIComponent(productId)}/image`,
    { mimeType: "image/webp", base64 },
    "No hay conexion para subir la imagen del producto.",
    token,
    30000
  );
  const result = await readJson(response) as ProductImageMetadata & { error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo guardar la imagen del producto.");
  return result;
}

export async function deleteProductImage(backendUrl: string, productId: string, token: string) {
  const response = await fetchWithTimeout(
    `${backendBaseUrl(backendUrl)}/api/products/${encodeURIComponent(productId)}/image`,
    { method: "DELETE", headers: authHeaders(token) },
    12000,
    "No hay conexion para eliminar la imagen del producto."
  );
  const result = await readJson(response) as { ok?: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo eliminar la imagen del producto.");
  return result;
}

export async function downloadProductThumbnail(backendUrl: string, productId: string, version: string, token: string) {
  const params = new URLSearchParams({ variant: "thumbnail", encoding: "base64", v: version });
  const response = await fetchWithTimeout(
    `${backendBaseUrl(backendUrl)}/api/products/${encodeURIComponent(productId)}/image?${params}`,
    { headers: authHeaders(token), cache: "force-cache" },
    12000,
    "No hay conexion para cargar la miniatura."
  );
  const result = await readJson(response) as { ok?: boolean; mimeType?: string; base64?: string; error?: string };
  if (!response.ok || !result.ok || !result.base64) throw new Error(result.error || "Miniatura no disponible.");
  return `data:${result.mimeType || "image/webp"};base64,${result.base64}`;
}
