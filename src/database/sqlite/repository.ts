import type { SQLiteConnection } from "./types";

export interface TenantRepositoryContext {
  database: SQLiteConnection;
  tenantId: string;
}

export abstract class TenantRepository {
  protected readonly database: SQLiteConnection;
  protected readonly tenantId: string;

  protected constructor(context: TenantRepositoryContext) {
    const tenantId = context.tenantId.trim();
    if (!tenantId) {
      throw new Error("El repositorio SQLite requiere un tenant_id válido.");
    }

    this.database = context.database;
    this.tenantId = tenantId;
  }
}
