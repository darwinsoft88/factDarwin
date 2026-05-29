import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  SafeAreaView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text
} from "react-native";
import { AppGlobalModals } from "./src/components/AppGlobalModals";
import { AppMainShell } from "./src/components/AppMainShell";
import { AppAuthGate } from "./src/components/AppAuthGate";
import { useAuthActions } from "./src/hooks/useAuthActions";
import { useAuthState } from "./src/hooks/useAuthState";
import { useAppBootstrap } from "./src/hooks/useAppBootstrap";
import { useAppShellState } from "./src/hooks/useAppShellState";
import { useAvailableTabs } from "./src/hooks/useAvailableTabs";
import { useEstablishmentSwitcher } from "./src/hooks/useEstablishmentSwitcher";
import { useKeyboardInset } from "./src/hooks/useKeyboardInset";
import { useSyncAndBackup } from "./src/hooks/useSyncAndBackup";
import { useSupportDiagnostics } from "./src/hooks/useSupportDiagnostics";
import { StartupErrorBoundary } from "./src/components/StartupErrorBoundary";
import { initialData } from "./src/storage";
import { AppData, User } from "./src/types";
import { AppTab } from "./src/utils/appAccess";
import { SyncState } from "./src/utils/support";

type Tab = AppTab;

// Solo para pruebas iniciales. En producción, se debe crear al menos un usuario administrador desde el registro o la configuración inicial.
function AppContent() {
  const headerTopPadding = Platform.OS === "android" ? (NativeStatusBar.currentHeight || 0) + 6 : 12;
  const [data, setData] = useState<AppData>(initialData);
  const [session, setSession] = useState<User | null>(null);
  const [backendToken, setBackendToken] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("synced");
  const authState = useAuthState(initialData.backendUrl);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [xmlPreview, setXmlPreview] = useState("");
  const [appMenuVisible, setAppMenuVisible] = useState(false);
  const [syncCenterVisible, setSyncCenterVisible] = useState(false);
  const [syncActionLoading, setSyncActionLoading] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const keyboardInset = useKeyboardInset();
  const backendTokenRef = useRef("");
  const dataRef = useRef<AppData>(initialData);
  const sessionRef = useRef<User | null>(null);
  const syncStateRef = useRef<SyncState>("synced");
  const supportDiagnostics = useSupportDiagnostics({
    backendTokenRef,
    dataRef,
    sessionRef,
    syncState,
    onBeforeOpen: () => setAppMenuVisible(false)
  });

  const { login, registerTenant, recoverPassword, chooseLoginEstablishment, submitNewPassword, logout } = useAuthActions({
    authState,
    dataRef,
    sessionRef,
    backendTokenRef,
    setData,
    setSession,
    setBackendToken,
    setSyncState,
    setAppMenuVisible,
    setEstablishmentSwitcherVisible: authState.setEstablishmentSwitcherVisible,
    setTab,
    setOnboardingVisible
  });

  const ready = useAppBootstrap({
    backendTokenRef,
    dataRef,
    sessionRef,
    setBackendToken,
    setData,
    setEmail: authState.setEmail,
    setPasswordChangeStatus: authState.setPasswordChangeStatus,
    setPasswordChangeVisible: authState.setPasswordChangeVisible,
    setSession
  });

// Para desarrollo, se puede cargar una sesión de prueba automáticamente. En producción, se debe iniciar sin sesión para mostrar la pantalla de login o registro.
  useEffect(() => {
    if (ready && !session && data.users.length === 0) {
      authState.setAuthMode("register");
    }
  }, [authState, data.users.length, ready, session]);

  useEffect(() => {
    backendTokenRef.current = backendToken;
  }, [backendToken]);

  useEffect(() => {
    dataRef.current = data;
    authState.setAuthBackendUrl(data.backendUrl);
  }, [authState, data]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  const availableTabs = useAvailableTabs({ activeTab: tab, license: data.license, session, onTabChange: setTab });

  const {
    ensureBackendToken,
    openSyncCenter,
    persist,
    refreshFromBackend,
    retryPendingSync,
    runManualSync,
    testSyncServer
  } = useSyncAndBackup({
    backendTokenRef,
    data,
    dataRef,
    email: authState.email,
    password: authState.password,
    ready,
    session,
    sessionRef,
    setAppMenuVisible,
    setBackendToken,
    setData,
    setSyncActionLoading,
    setSyncCenterVisible,
    setSyncState,
    syncState,
    syncStateRef
  });

  const { openAdminSettings, switchActiveEstablishment } = useEstablishmentSwitcher({
    availableTabs,
    backendToken,
    backendTokenRef,
    dataRef,
    persist,
    session,
    setAppMenuVisible,
    setData,
    setEstablishmentSwitcherVisible: authState.setEstablishmentSwitcherVisible,
    setTab
  });

  const {
    connectedCompanyLabel,
    currentEstablishment,
    currentEstablishmentLabel,
    licenseState,
    switchableEstablishments,
    syncNotice
  } = useAppShellState(data, syncState);

  if (!ready) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>Cargando...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <AppAuthGate
        authState={authState}
        chooseLoginEstablishment={chooseLoginEstablishment}
        login={login}
        recoverPassword={recoverPassword}
        registerTenant={registerTenant}
      />
      );
    }

  return (
    <SafeAreaView style={styles.screen}>
      <ExpoStatusBar style="dark" />
      <AppMainShell
        activeTab={tab}
        availableTabs={availableTabs}
        backendToken={backendToken}
        companyLabel={connectedCompanyLabel}
        data={data}
        establishmentLabel={currentEstablishmentLabel}
        headerTopPadding={headerTopPadding}
        keyboardInset={keyboardInset}
        licenseActive={licenseState.active}
        session={session}
        syncError={syncState === "error"}
        syncNotice={syncNotice}
        ensureBackendToken={ensureBackendToken}
        onOpenMenu={() => setAppMenuVisible(true)}
        onRefreshBackend={() => refreshFromBackend("manual")}
        onTabChange={setTab}
        onXml={setXmlPreview}
        persist={persist}
      />

      <AppGlobalModals
        appMenuVisible={appMenuVisible}
        authState={authState}
        chooseLoginEstablishment={chooseLoginEstablishment}
        currentEstablishment={currentEstablishment}
        data={data}
        logout={logout}
        onOpenAdminSettings={openAdminSettings}
        onOpenSyncCenter={openSyncCenter}
        onRetryPendingSync={retryPendingSync}
        onRunManualSync={runManualSync}
        onSwitchActiveEstablishment={switchActiveEstablishment}
        onTestSyncServer={testSyncServer}
        onboardingVisible={onboardingVisible}
        session={session}
        setAppMenuVisible={setAppMenuVisible}
        setOnboardingVisible={setOnboardingVisible}
        setSyncCenterVisible={setSyncCenterVisible}
        setTab={setTab}
        setXmlPreview={setXmlPreview}
        submitNewPassword={submitNewPassword}
        supportDiagnostics={supportDiagnostics}
        switchableEstablishments={switchableEstablishments}
        syncActionLoading={syncActionLoading}
        syncCenterVisible={syncCenterVisible}
        syncState={syncState}
        xmlPreview={xmlPreview}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <StartupErrorBoundary>
      <AppContent />
    </StartupErrorBoundary>
  );
}

// eslint-disable-next-line complexity
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f7fb"
  },
  keyboardAvoiding: {
    flex: 1
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f7fb"
  },
  loginPanel: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f7f9fc"
  },
  loginBrandRow: {
    marginBottom: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  loginBrandMark: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  loginBrandMarkText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  loginBrand: {
    color: "#0f2f66",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900"
  },
  authCard: {
    borderRadius: 14,
    padding: 26,
    gap: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edf1f7",
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  authTitle: {
    marginBottom: 10,
    color: "#1f2937",
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "900",
    textAlign: "center"
  },
  authSubtitle: {
    marginTop: -10,
    marginBottom: 2,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  authLinkButton: {
    marginTop: 22,
    alignItems: "center"
  },
  authLinkText: {
    color: "#2f6f96",
    fontSize: 14,
    fontWeight: "800"
  },
  authMutedLink: {
    marginTop: 20,
    color: "#2f6f96",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center"
  },
  authActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2
  },
  authActionPrimary: {
    flex: 1.35,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  authActionSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  authActionSecondaryText: {
    color: "#0f5f59",
    fontSize: 13,
    fontWeight: "900"
  },
  authInlineFooter: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  },
  authInlineText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700"
  },
  authInlineLink: {
    color: "#2f6f96",
    fontSize: 14,
    fontWeight: "900"
  },
  authFeedback: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    textAlign: "center"
  },
  authFeedbackError: {
    color: "#b91c1c"
  },
  authFeedbackSuccess: {
    color: "#047857"
  },
  companyChoiceList: {
    gap: 10
  },
  companyChoice: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#f8fafc"
  },
  companyChoiceTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  companyChoiceMeta: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  content: {
    padding: 12,
    paddingBottom: 170
  },
  stack: {
    gap: 12
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e7f0",
    gap: 9,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1f2937"
  },
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  saleGroup: {
    borderWidth: 1,
    borderColor: "#e2e7f0",
    borderRadius: 8,
    padding: 12,
    gap: 10,
    backgroundColor: "#fbfdff"
  },
  saleGroupCompact: {
    borderWidth: 1,
    borderColor: "#e2e7f0",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#ffffff"
  },
  groupTitle: {
    color: "#0f766e",
    fontWeight: "900",
    fontSize: 13,
    textTransform: "uppercase"
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  },
  iconButton: {
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  iconButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  errorText: {
    color: "#b91c1c"
  },
  successText: {
    color: "#047857"
  },
  inputGroup: {
    gap: 6
  },
  label: {
    fontSize: 12,
    color: "#4b5563",
    fontWeight: "700"
  },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    color: "#111827",
    backgroundColor: "#fbfdff"
  },
  inputShell: {
    position: "relative",
    justifyContent: "center"
  },
  inputWithRightElement: {
    paddingRight: 96
  },
  inputRightElement: {
    position: "absolute",
    right: 6,
    top: 6,
    bottom: 6,
    justifyContent: "center"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  buttonRowButton: {
    flexGrow: 1,
    flexBasis: "45%"
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  selectRow: {
    flexDirection: "row",
    gap: 8
  },
  choice: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fbfdff"
  },
  choiceActive: {
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb"
  },
  choiceText: {
    color: "#4b5563",
    fontWeight: "700"
  },
  choiceTextActive: {
    color: "#0f766e"
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  disabledButton: {
    backgroundColor: "#94a3b8"
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  actionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0
  },
  actionSheetCancel: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  actionSheetCancelText: {
    color: "#0f5f59",
    fontWeight: "900",
    textAlign: "center"
  },
  creditModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
    padding: 12
  },
  creditModal: {
    maxHeight: "92%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  quickClientModal: {
    maxHeight: "92%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  diagnosticModal: {
    maxHeight: "94%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  smallNoticeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  smallNoticeModal: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12
  },
  smallNoticeTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center"
  },
  smallNoticeText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  creditModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  creditModalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  creditModalMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3
  },
  creditModalContent: {
    padding: 14,
    gap: 10
  },
  sectionMiniTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  operationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  hint: {
    color: "#6b7280",
    textAlign: "center",
    marginTop: 8
  }
});
