import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Platform,
  SafeAreaView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text
} from "react-native";
import { AppAuthGate } from "./components/AppAuthGate";
import { AppGlobalModals } from "./components/AppGlobalModals";
import { AppMainShell } from "./components/AppMainShell";
import { initialData } from "./database";
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { useAppRuntimeRefs } from "./hooks/useAppRuntimeRefs";
import { useAppShellState } from "./hooks/useAppShellState";
import { useAuthActions } from "./hooks/useAuthActions";
import { useAuthState } from "./hooks/useAuthState";
import { useAvailableTabs } from "./hooks/useAvailableTabs";
import { useEstablishmentSwitcher } from "./hooks/useEstablishmentSwitcher";
import { useKeyboardInset } from "./hooks/useKeyboardInset";
import { useSupportDiagnostics } from "./hooks/useSupportDiagnostics";
import { useSyncAndBackup } from "./hooks/useSyncAndBackup";
import { AppData, User } from "./types";
import { AppTab, appLicenseStatus } from "./utils/appAccess";
import { isSessionTokenExpired } from "./utils/sessionToken";
import { SyncState } from "./utils/support";

type Tab = AppTab;
const LICENSE_WARNING_AUTO_HIDE_MS = 12_000;

export function AppContent() {
  const headerTopPadding = Platform.OS === "android" ? (NativeStatusBar.currentHeight || 0) + 6 : 12;
  const [data, setData] = useState<AppData>(initialData);
  const [session, setSession] = useState<User | null>(null);
  const [backendToken, setBackendToken] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("synced");
  const authState = useAuthState(initialData.backendUrl);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [xmlPreview, setXmlPreview] = useState("");
  const [appMenuVisible, setAppMenuVisible] = useState(false);
  const [licenseVisible, setLicenseVisible] = useState(false);
  const [licenseBannerVisible, setLicenseBannerVisible] = useState(true);
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

  useEffect(() => {
    if (!ready || !session) return undefined;

    const expireSessionIfNeeded = () => {
      const token = backendTokenRef.current || backendToken;
      if (!token || !isSessionTokenExpired(token)) return;
      logout();
      authState.setLoginStatus({ tone: "error", message: "Su sesion expiro. Ingrese nuevamente para continuar trabajando." });
    };

    expireSessionIfNeeded();
    const timer = setInterval(expireSessionIfNeeded, 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") expireSessionIfNeeded();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [authState, backendToken, backendTokenRef, logout, ready, session]);

  useEffect(() => {
    if (ready && !session && data.users.length === 0) {
      authState.setAuthMode("register");
    }
  }, [authState, data.users.length, ready, session]);

  useAppRuntimeRefs({
    backendToken,
    backendTokenRef,
    data,
    dataRef,
    onBackendUrlChange: authState.setAuthBackendUrl,
    session,
    sessionRef,
    syncState,
    syncStateRef
  });

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
    switchableEstablishments
  } = useAppShellState(data, syncState);

  useEffect(() => {
    if (!ready || !session) return undefined;
    const status = appLicenseStatus(data.license);
    const isBlocking = !status.active || status.effectiveStatus === "expired" || status.effectiveStatus === "suspended";
    setLicenseBannerVisible(true);
    if (isBlocking) return undefined;

    const timer = setTimeout(() => setLicenseBannerVisible(false), LICENSE_WARNING_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [data.license, ready, session]);

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
        licenseBannerVisible={licenseBannerVisible}
        session={session}
        syncActionLoading={syncActionLoading}
        syncState={syncState}
        ensureBackendToken={ensureBackendToken}
        onOpenLicense={() => setLicenseVisible(true)}
        onOpenMenu={() => setAppMenuVisible(true)}
        onOpenSupport={supportDiagnostics.open}
        onOpenSyncCenter={openSyncCenter}
        onRefreshBackend={() => refreshFromBackend("manual")}
        onRetryPendingSync={retryPendingSync}
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
        licenseVisible={licenseVisible}
        onOpenAdminSettings={openAdminSettings}
        onOpenSyncCenter={openSyncCenter}
        onRetryPendingSync={retryPendingSync}
        onRunManualSync={runManualSync}
        onSwitchActiveEstablishment={switchActiveEstablishment}
        onTestSyncServer={testSyncServer}
        onboardingVisible={onboardingVisible}
        session={session}
        setAppMenuVisible={setAppMenuVisible}
        setLicenseVisible={setLicenseVisible}
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f7fb"
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f7fb"
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1f2937"
  }
});
