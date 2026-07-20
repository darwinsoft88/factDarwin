import { initialData } from "../../database";
import { User } from "../../types";
import { upsertOfflineUser } from "../authOffline";

describe("authOffline", () => {
  it("guarda el usuario remoto con hash para login offline posterior", () => {
    const user: User = {
      id: "remote-user",
      companyId: "company-1",
      name: "Admin",
      email: "ADMIN@EMPRESA.COM",
      role: "admin"
    };

    const nextData = upsertOfflineUser(initialData, user, "hash-123");
    const saved = nextData.users.find((item) => item.id === "remote-user");

    expect(saved).toMatchObject({
      email: "admin@empresa.com",
      passwordHash: "hash-123",
      password: undefined
    });
  });

  it("actualiza el usuario existente sin duplicarlo", () => {
    const data = {
      ...initialData,
      users: [{ id: "u1", name: "Viejo", email: "admin@empresa.com", role: "vendedor" as const }]
    };
    const nextData = upsertOfflineUser(data, { id: "u2", name: "Nuevo", email: "admin@empresa.com", role: "admin" }, "hash");

    expect(nextData.users).toHaveLength(1);
    expect(nextData.users[0]).toMatchObject({ id: "u2", name: "Nuevo", role: "admin", passwordHash: "hash" });
  });
});
