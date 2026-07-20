import { useEffect } from "react";
import { AppData, User } from "../types";
import { SyncState } from "../utils/support";

type UseAppRuntimeRefsParams = {
  backendToken: string;
  backendTokenRef: React.MutableRefObject<string>;
  data: AppData;
  dataRef: React.MutableRefObject<AppData>;
  onBackendUrlChange: (value: string) => void;
  session: User | null;
  sessionRef: React.MutableRefObject<User | null>;
  syncState: SyncState;
  syncStateRef: React.MutableRefObject<SyncState>;
};

export function useAppRuntimeRefs({
  backendToken,
  backendTokenRef,
  data,
  dataRef,
  onBackendUrlChange,
  session,
  sessionRef,
  syncState,
  syncStateRef
}: UseAppRuntimeRefsParams) {
  useEffect(() => {
    backendTokenRef.current = backendToken;
  }, [backendToken, backendTokenRef]);

  useEffect(() => {
    dataRef.current = data;
    onBackendUrlChange(data.backendUrl);
  }, [data, dataRef, onBackendUrlChange]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session, sessionRef]);

  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState, syncStateRef]);
}
