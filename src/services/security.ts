import * as Crypto from "expo-crypto";

export async function hashPassword(password: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `factura-sri:${password}`);
}
