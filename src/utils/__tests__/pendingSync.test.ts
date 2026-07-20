import { initialData } from "../../database";
import { PendingSyncItem } from "../../types";
import { appendPendingSync, applyPendingSyncResult, buildPendingSyncItem, clearPendingSyncItems, markPendingSyncAttempt } from "../pendingSync";

describe("pendingSync", () => {
  it("builds pending sync item with compact error", () => {
    const item = buildPendingSyncItem({ baseData: initialData, sales: [] }, "Documento pendiente", "x".repeat(300));

    expect(item.title).toBe("Documento pendiente");
    expect(item.attempts).toBe(0);
    expect(item.lastError || "").toHaveLength(180);
    expect(item.patch).toMatchObject({ sales: [] });
    expect((item.patch as Record<string, unknown>).baseData).toBeUndefined();
  });

  it("adds newest pending first and caps queue at 100", () => {
    const existing = Array.from({ length: 100 }, (_, index) => ({
      id: `old-${index}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      attempts: 0,
      title: "Viejo",
      patch: { baseData: initialData }
    })) as PendingSyncItem[];
    const pending = buildPendingSyncItem({ baseData: initialData }, "Nuevo", "sin conexion");
    const updated = appendPendingSync({ ...initialData, pendingSync: existing }, pending);

    expect(updated.pendingSync).toHaveLength(100);
    expect(updated.pendingSync?.[0]?.id).toBe(pending.id);
    expect(updated.pendingSync?.some((item) => item.id === "old-99")).toBe(false);
  });

  it("marks retry attempts and applies queue result", () => {
    const pending = buildPendingSyncItem({ baseData: initialData }, "Pendiente", "fallo 1");
    const retried = markPendingSyncAttempt(pending, "fallo 2");
    const updated = applyPendingSyncResult(initialData, [retried]);
    const cleared = applyPendingSyncResult(updated, []);

    expect(retried.attempts).toBe(1);
    expect(retried.lastError).toBe("fallo 2");
    expect(updated.autoBackupLastError).toBe("1 cambio(s) pendiente(s) por sincronizar.");
    expect(cleared.pendingSync).toEqual([]);
    expect(cleared.autoBackupLastError).toBe("");
  });

  it("clears only pending items covered by a successful full backup", () => {
    const first = buildPendingSyncItem({ baseData: initialData }, "Factura pendiente", "fallo");
    const second = buildPendingSyncItem({ baseData: initialData }, "Cliente pendiente", "fallo");
    const updated = clearPendingSyncItems({ ...initialData, pendingSync: [first, second] }, [first.id]);

    expect(updated.pendingSync).toHaveLength(1);
    expect(updated.pendingSync?.[0]?.id).toBe(second.id);
    expect(updated.autoBackupLastError).toBe("1 cambio(s) pendiente(s) por sincronizar.");
  });
});
