import { attemptLogin, fetchSnapshot, registerTenantBackend, requestPasswordResetBackend, changePasswordBackend } from "../authService";

jest.mock("../backend", () => ({
  loginBackend: jest.fn(async (backendUrl: string, identifier: string, password: string, _companyId = "") => ({
    ok: true,
    token: "abc123",
    user: { id: "u1", name: "Test User", email: identifier, role: "admin" }
  })),
  restoreAppData: jest.fn(async () => ({ data: { backendUrl: "https://api.test" }, updatedAt: "2026-05-22T00:00:00.000Z" })),
  registerBackend: jest.fn(async (backendUrl: string, _payload: unknown) => ({
    ok: true,
    token: "abc123",
    user: { id: "u1", name: "Test User", email: "test@example.com", role: "admin" },
    snapshot: { data: { backendUrl }, updatedAt: "2026-05-22T00:00:00.000Z" }
  })),
  requestPasswordReset: jest.fn(async () => ({ ok: true, message: "Email enviado" })),
  changeBackendPassword: jest.fn(async () => ({ ok: true, token: "newtoken", user: { id: "u1", name: "Test User", email: "test@example.com", role: "admin" } }))
}));

describe("authService", () => {
  it("attemptLogin calls backend login and returns token", async () => {
    const result = await attemptLogin("https://backend.test", "user@example.com", "secret", "company-1");

    expect(result).toHaveProperty("token", "abc123");
    expect(result).toHaveProperty("user");
  });

  it("fetchSnapshot returns snapshot data", async () => {
    const snapshot = await fetchSnapshot<{ backendUrl: string }>("https://backend.test", "abc123");

    expect(snapshot).toMatchObject({ data: { backendUrl: "https://api.test" } });
  });

  it("registerTenantBackend calls backend register", async () => {
    const result = await registerTenantBackend("https://backend.test", {
      company: { ruc: "123", businessName: "Test" },
      admin: { name: "Admin", email: "test@example.com", password: "password" }
    });

    expect(result).toHaveProperty("token", "abc123");
  });

  it("requestPasswordResetBackend sends reset request", async () => {
    const result = await requestPasswordResetBackend("https://backend.test", "user@example.com");

    expect(result).toHaveProperty("message", "Email enviado");
  });

  it("changePasswordBackend changes password and returns new token", async () => {
    const result = await changePasswordBackend("https://backend.test", "new-password", "token-123");

    expect(result).toHaveProperty("token", "newtoken");
  });
});
