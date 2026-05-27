import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useCallback, useMemo, useState } from "react";
import { checkBackendHealth, getTechnicalLogs, TechnicalLog } from "../services/backend";
import { AppData, User } from "../types";
import { canAccessSensitiveSupport } from "../utils/appAccess";
import { showMessage } from "../utils/dialogs";
import { buildSupportDiagnostic, SyncState } from "../utils/support";

type UseSupportDiagnosticsParams = {
  backendTokenRef: React.MutableRefObject<string>;
  dataRef: React.MutableRefObject<AppData>;
  sessionRef: React.MutableRefObject<User | null>;
  syncState: SyncState;
  onBeforeOpen?: () => void;
};

export function useSupportDiagnostics({ backendTokenRef, dataRef, sessionRef, syncState, onBeforeOpen }: UseSupportDiagnosticsParams) {
  const [visible, setVisible] = useState(false);
  const [diagnostic, setDiagnostic] = useState("");
  const [loading, setLoading] = useState(false);

  const diagnosticText = useMemo(
    () => diagnostic || buildSupportDiagnostic(dataRef.current, sessionRef.current, syncState),
    [dataRef, diagnostic, sessionRef, syncState]
  );

  const refresh = useCallback(async () => {
    const current = dataRef.current;
    setLoading(true);
    try {
      const health = current.backendUrl ? await checkBackendHealth(current.backendUrl) : undefined;
      let logs: TechnicalLog[] = [];
      if (sessionRef.current && canAccessSensitiveSupport(sessionRef.current.role) && backendTokenRef.current) {
        try {
          logs = await getTechnicalLogs(current.backendUrl, backendTokenRef.current, 8);
        } catch {
          logs = [];
        }
      }
      setDiagnostic(buildSupportDiagnostic(current, sessionRef.current, syncState, health, logs));
    } catch (error) {
      setDiagnostic(buildSupportDiagnostic(current, sessionRef.current, syncState, undefined, [], error instanceof Error ? error.message : "No se pudo probar el servidor."));
    } finally {
      setLoading(false);
    }
  }, [backendTokenRef, dataRef, sessionRef, syncState]);

  const open = useCallback(() => {
    onBeforeOpen?.();
    setVisible(true);
    setDiagnostic(buildSupportDiagnostic(dataRef.current, sessionRef.current, syncState));
    void refresh();
  }, [dataRef, onBeforeOpen, refresh, sessionRef, syncState]);

  const share = useCallback(async () => {
    const text = diagnostic || buildSupportDiagnostic(dataRef.current, sessionRef.current, syncState);
    try {
      const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}factudarwin-soporte.txt`;
      await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "text/plain", dialogTitle: "Compartir diagnostico" });
        return;
      }
      showMessage("Diagnostico", text);
    } catch (error) {
      showMessage("No se pudo compartir", error instanceof Error ? error.message : "Intente nuevamente.");
    }
  }, [dataRef, diagnostic, sessionRef, syncState]);

  return {
    close: () => setVisible(false),
    diagnosticText,
    loading,
    open,
    refresh,
    share,
    visible
  };
}
