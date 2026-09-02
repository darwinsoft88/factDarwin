import AsyncStorage from "@react-native-async-storage/async-storage";
import { biometricLockKey, loadBiometricLockEnabled, saveBiometricLockEnabled } from "../biometricLockStorage";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
}));

describe("biometricLockStorage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("aísla la preferencia por empresa y usuario", () => {
    expect(biometricLockKey("empresa-a", "usuario-1")).not.toBe(biometricLockKey("empresa-b", "usuario-1"));
    expect(biometricLockKey("empresa-a", "usuario-1")).not.toBe(biometricLockKey("empresa-a", "usuario-2"));
  });

  it("guarda y verifica la activación", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("enabled");
    await saveBiometricLockEnabled("empresa-a", "usuario-1", true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(biometricLockKey("empresa-a", "usuario-1"), "enabled");
  });

  it("elimina la autorización local al desactivar", async () => {
    await saveBiometricLockEnabled("empresa-a", "usuario-1", false);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(biometricLockKey("empresa-a", "usuario-1"));
  });

  it("no habilita cuentas incompletas", async () => {
    await expect(loadBiometricLockEnabled("", "usuario-1")).resolves.toBe(false);
    await expect(saveBiometricLockEnabled("", "usuario-1", true)).rejects.toThrow("identificar la cuenta");
  });
});
