import { initialData } from "../../database/storage";
import { AppData, User } from "../../types";
import { useSyncAndBackup } from "../useSyncAndBackup";
import { backupAppData, mergeBackendData } from "../../services/backend";
import { migrateStoredPendingSyncRequestIds } from "../../database/storage";

let mockStoredData: AppData;

jest.mock("react", () => ({
  __esModule: true,
  default: {},
  useCallback: (callback: unknown) => callback,
  useEffect: () => undefined,
  useRef: (value: unknown) => ({ current: value })
}));
jest.mock("react-native", () => ({ Platform: { OS: "native" }, AppState: { addEventListener: jest.fn() } }));
jest.mock("expo-network", () => ({ addNetworkStateListener: jest.fn(), getNetworkStateAsync: jest.fn() }));
jest.mock("../../utils/dialogs", () => ({ showMessage: jest.fn(), showWarning: jest.fn() }));
jest.mock("../../utils/sessionToken", () => ({ isSessionTokenExpired: jest.fn(() => false) }));
jest.mock("../../services/security", () => ({ hashPassword: jest.fn(async () => "hash") }));
jest.mock("../../utils/autoRetrySriDocuments", () => ({ autoRetrySriDocuments: jest.fn(async () => ({ attempted: 0 })) }));
jest.mock("../../utils/autoInvoiceTickets", () => ({ autoInvoiceOfflineTickets: jest.fn(async () => undefined) }));
jest.mock("../../database", () => ({ loadSession: jest.fn(), saveData: jest.fn(), saveSession: jest.fn() }));
jest.mock("../../database/storage", () => {
  const actual = jest.requireActual("../../database/storage");
  return {
    ...actual,
    migrateStoredPendingSyncRequestIds: jest.fn(),
    updateStoredData: jest.fn(async (mutation: (data: AppData) => AppData | Promise<AppData>) => {
      mockStoredData = await mutation(mockStoredData);
      return mockStoredData;
    })
  };
});
jest.mock("../../services/backend", () => ({
  backupAppData: jest.fn(async () => ({ ok: true, updatedAt: "2026-07-01T00:00:00.000Z" })),
  checkBackendHealth: jest.fn(),
  loginBackend: jest.fn(),
  mergeBackendData: jest.fn(async () => ({ ok: true })),
  restoreAppData: jest.fn(async () => null)
}));

const mergeMock = mergeBackendData as jest.MockedFunction<typeof mergeBackendData>;
const backupMock = backupAppData as jest.MockedFunction<typeof backupAppData>;
const migrateMock = migrateStoredPendingSyncRequestIds as jest.MockedFunction<typeof migrateStoredPendingSyncRequestIds>;

function pendingData(patch: Record<string, unknown>): AppData {
  return {
    ...initialData,
    backendUrl: "https://backend.test",
    autoBackupEnabled: true,
    pendingSync: [{ id: "pending-1", createdAt: "2026-07-01T00:00:00.000Z", attempts: 0, title: "Pendiente", patch }]
  };
}

function useTestHook(data: AppData) {
  const session = { ...data.users[0], id: "user-1", companyId: "company-1" } as User;
  const dataRef = { current: data };
  return {
    dataRef,
    hook: useSyncAndBackup({
      backendTokenRef: { current: "token" }, data, dataRef, email: "", password: "", ready: false,
      session, sessionRef: { current: session }, setAppMenuVisible: jest.fn(), setBackendToken: jest.fn(),
      setData: jest.fn(), setSyncActionLoading: jest.fn(), setSyncCenterVisible: jest.fn(), setSyncState: jest.fn(),
      syncState: "pending", syncStateRef: { current: "pending" }
    })
  };
}

describe("useSyncAndBackup pending replay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    backupMock.mockResolvedValue({ ok: true, updatedAt: "2026-07-01T00:00:00.000Z" });
    mergeMock.mockResolvedValue({ ok: true });
  });

  it("sends item.patch directly and removes the successful pending", async () => {
    const patch = { requestId: "sync_hook", clients: [{ id: "durable" }] };
    mockStoredData = pendingData(patch);
    const { hook } = useTestHook(mockStoredData);
    await hook.runManualSync();
    expect(mergeMock).toHaveBeenCalledWith("https://backend.test", patch, "token");
    expect(migrateMock).not.toHaveBeenCalled();
    expect(mockStoredData.pendingSync).toEqual([]);
  });

  it("awaits storage migration and uses the returned durable queue", async () => {
    mockStoredData = pendingData({ clients: [{ id: "legacy-live" }] });
    const migratedPatch = { requestId: "sync_migrated", clients: [{ id: "durable" }] };
    const migrated = pendingData(migratedPatch);
    migrateMock.mockImplementation(async () => {
      mockStoredData = migrated;
      return migrated;
    });
    const { hook } = useTestHook(mockStoredData);
    await hook.runManualSync();
    expect(migrateMock).toHaveBeenCalledTimes(1);
    expect(mergeMock).toHaveBeenCalledWith("https://backend.test", migratedPatch, "token");
  });

  it("does not send when migration fails", async () => {
    mockStoredData = pendingData({ clients: [] });
    migrateMock.mockRejectedValue(new Error("migration failed"));
    backupMock.mockRejectedValue(new Error("offline"));
    const { hook } = useTestHook(mockStoredData);
    await hook.runManualSync();
    expect(mergeMock).not.toHaveBeenCalled();
  });

  it("keeps the pending after network and backup errors", async () => {
    const patch = { requestId: "sync_offline", clients: [] };
    mockStoredData = pendingData(patch);
    mergeMock.mockRejectedValue(new Error("offline"));
    backupMock.mockRejectedValue(new Error("offline"));
    const { hook } = useTestHook(mockStoredData);
    await hook.runManualSync();
    expect(mockStoredData.pendingSync).toHaveLength(1);
    expect((mockStoredData.pendingSync?.[0]?.patch as { requestId: string }).requestId).toBe("sync_offline");
  });
});
