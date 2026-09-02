const asyncValues = new Map<string, string>();
const refreshDeviceSession = jest.fn();
const loadBiometricCredential = jest.fn();
const saveBiometricCredential = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => asyncValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { asyncValues.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { asyncValues.delete(key); })
}));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "33333333-3333-4333-8333-333333333333") }));
jest.mock("../backend", () => ({
  refreshDeviceSession: (...args: unknown[]) => refreshDeviceSession(...args),
  registerDeviceSession: jest.fn()
}));
jest.mock("../biometricCredentialStorage", () => ({
  loadBiometricCredential: (...args: unknown[]) => loadBiometricCredential(...args),
  saveBiometricCredential: (...args: unknown[]) => saveBiometricCredential(...args),
  completeLegacyBiometricMigration: jest.fn()
}));
jest.mock("../incrementalDeviceIdentity", () => ({ getIncrementalDeviceId: jest.fn() }));

import { refreshRegisteredDeviceSession, shouldInvalidateDeviceCredential } from "../deviceSessionCoordinator";

const credential = {
  version: 2 as const,
  companyId: "company-1",
  userId: "user-1",
  email: "d@example.com",
  displayName: "Darwin",
  backendUrl: "https://api.example.com",
  companyRuc: "1790012345001",
  establishmentId: "est-1",
  deviceId: "android-1",
  sessionId: "11111111-1111-4111-8111-111111111111",
  refreshToken: "old-refresh",
  user: { id: "user-1", companyId: "company-1", name: "Darwin", email: "d@example.com", role: "admin" as const }
};

describe("deviceSessionCoordinator", () => {
  beforeEach(() => {
    asyncValues.clear();
    jest.clearAllMocks();
    loadBiometricCredential.mockResolvedValue(credential);
  });

  it("serializes concurrent refresh calls into one backend request", async () => {
    refreshDeviceSession.mockResolvedValue({
      token: "access-2", refreshToken: "refresh-2", sessionId: credential.sessionId,
      user: credential.user
    });
    const [first, second] = await Promise.all([
      refreshRegisteredDeviceSession(),
      refreshRegisteredDeviceSession()
    ]);
    expect(refreshDeviceSession).toHaveBeenCalledTimes(1);
    expect(first.token).toBe("access-2");
    expect(second.token).toBe("access-2");
    expect(saveBiometricCredential).toHaveBeenCalledTimes(1);
  });

  it("reuses the same requestId after a network failure", async () => {
    refreshDeviceSession
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ token: "access-2", refreshToken: "refresh-2", sessionId: credential.sessionId, user: credential.user });
    await expect(refreshRegisteredDeviceSession()).rejects.toThrow("timeout");
    await refreshRegisteredDeviceSession();
    expect(refreshDeviceSession.mock.calls[0][1].requestId).toBe(refreshDeviceSession.mock.calls[1][1].requestId);
  });

  it("invalidates only explicit security outcomes", () => {
    expect(shouldInvalidateDeviceCredential({ code: "DEVICE_SESSION_REVOKED" })).toBe(true);
    expect(shouldInvalidateDeviceCredential({ code: "DEVICE_SESSION_CREDENTIAL_INVALID" })).toBe(true);
    expect(shouldInvalidateDeviceCredential({ code: "REFRESH_REPLAY" })).toBe(true);
    expect(shouldInvalidateDeviceCredential(new Error("timeout"))).toBe(false);
    expect(shouldInvalidateDeviceCredential({ code: "HTTP_500" })).toBe(false);
  });
});
