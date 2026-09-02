const values = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => values.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { values.delete(key); })
}));

import { clearPasskeyAccountHint, loadPasskeyAccountHint, savePasskeyAccountHint } from "../passkeyHintStorage";

const hint = {
  companyId: "company-1",
  userId: "user-1",
  email: "darwin@example.com",
  displayName: "Darwin",
  backendUrl: "https://api.factudarwin.com",
  companyRuc: "1723772099001",
  establishmentId: "est-1"
};

describe("passkeyHintStorage", () => {
  beforeEach(() => values.clear());

  it("guarda solo una referencia publica y no credenciales", async () => {
    await savePasskeyAccountHint(hint);
    expect(await loadPasskeyAccountHint()).toEqual(hint);
    expect([...values.values()].join(" ")).not.toContain("token");
    expect([...values.values()].join(" ")).not.toContain("password");
  });

  it("elimina la referencia local al revocar la Passkey", async () => {
    await savePasskeyAccountHint(hint);
    await clearPasskeyAccountHint();
    expect(await loadPasskeyAccountHint()).toBeNull();
  });
});
