import { resolveHeaderSyncStatus } from "../../utils/headerSyncStatus";

describe("resolveHeaderSyncStatus", () => {
  const base = {
    hasSyncError: false,
    networkReachable: true,
    pendingCount: 0,
    sriPendingCount: 0,
    syncState: "synced" as const
    
  };
  it("shows pending when there are SRI documents pending", () => {
  expect(
    resolveHeaderSyncStatus({
      ...base,
      sriPendingCount: 1
    })
  ).toBe("pending");
});

  it("diferencia falta de conexión de un error real", () => {
    expect(resolveHeaderSyncStatus({ ...base, networkReachable: false, hasSyncError: true, syncState: "error" })).toBe("offline");
    expect(resolveHeaderSyncStatus({ ...base, hasSyncError: true })).toBe("error");
  });

  it("representa sincronización activa y pendientes reales", () => {
    expect(resolveHeaderSyncStatus({ ...base, syncState: "syncing" })).toBe("syncing");
    expect(resolveHeaderSyncStatus({ ...base, pendingCount: 3 })).toBe("pending");
    expect(resolveHeaderSyncStatus(base)).toBe("synced");
  });

  it("abandona offline reactivamente al recuperar conectividad", () => {
    expect(resolveHeaderSyncStatus({ ...base, networkReachable: false, pendingCount: 1 })).toBe("offline");
    expect(resolveHeaderSyncStatus({ ...base, networkReachable: true, pendingCount: 1, syncState: "syncing" })).toBe("syncing");
    expect(resolveHeaderSyncStatus({ ...base, networkReachable: true })).toBe("synced");
  });
});
