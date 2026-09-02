const asyncValues = new Map<string, string>();
const secureValues = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => asyncValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { asyncValues.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { asyncValues.delete(key); })
}));

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  getItemAsync: jest.fn(async (key: string) => secureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { secureValues.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { secureValues.delete(key); })
}));

import {
  clearBiometricCredential,
  loadBiometricAccountHint,
  loadBiometricCredential,
  saveBiometricCredential
} from "../biometricCredentialStorage";

const credential = {
  version: 2 as const,
  companyId: "company-1",
  userId: "user-1",
  email: "admin@example.com",
  displayName: "Administrador",
  backendUrl: "https://api.example.com",
  companyRuc: "1790012345001",
  establishmentId: "est-1",
  deviceId: "android-device-1",
  sessionId: "11111111-1111-4111-8111-111111111111",
  refreshToken: "protected-refresh-token",
  user: {
    id: "user-1",
    companyId: "company-1",
    email: "admin@example.com",
    name: "Administrador",
    role: "admin" as const
  }
};

describe("biometricCredentialStorage", () => {
  beforeEach(() => {
    asyncValues.clear();
    secureValues.clear();
  });

  it("stores the refresh token only in authenticated secure storage and exposes a non-secret hint", async () => {
    await saveBiometricCredential(credential);

    expect(await loadBiometricCredential()).toEqual(credential);
    expect(await loadBiometricAccountHint()).toEqual({
      version: 2,
      companyId: credential.companyId,
      userId: credential.userId,
      email: credential.email,
      displayName: credential.displayName,
      backendUrl: credential.backendUrl
    });
    expect([...asyncValues.values()].join(" ")).not.toContain(credential.refreshToken);
    const SecureStore = jest.requireMock("expo-secure-store") as { setItemAsync: jest.Mock };
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^[A-Za-z0-9._-]+$/),
      expect.any(String),
      expect.objectContaining({ requireAuthentication: true })
    );
  });

  it("removes both the protected credential and its login hint", async () => {
    await saveBiometricCredential(credential);
    await clearBiometricCredential();

    expect(await loadBiometricCredential()).toBeNull();
    expect(await loadBiometricAccountHint()).toBeNull();
  });

  it("rejects an incomplete protected credential", async () => {
    await expect(saveBiometricCredential({ ...credential, refreshToken: "" })).rejects.toThrow("incompleta");
  });
});
