import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text
} from "react-native";
import { AppAuthGate } from "./components/AppAuthGate";
import { AppGlobalModals } from "./components/AppGlobalModals";
import { AppMainShell } from "./components/AppMainShell";
import { initialData, saveSession } from "./database";
import { SUPPORT_WHATSAPP_NUMBER } from "./constants/branding";
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { useAppRuntimeRefs } from "./hooks/useAppRuntimeRefs";
import { useAppShellState } from "./hooks/useAppShellState";
import { useAuthActions } from "./hooks/useAuthActions";
import { useAuthState } from "./hooks/useAuthState";
import { useAvailableTabs } from "./hooks/useAvailableTabs";
import { useEstablishmentSwitcher } from "./hooks/useEstablishmentSwitcher";
import { useKeyboardInset } from "./hooks/useKeyboardInset";
import { useControlledCatalogData } from "./hooks/useControlledCatalogData";
import { useControlledSalesHistory } from "./hooks/useControlledSalesHistory";
import { useSQLiteBootstrap } from "./hooks/useSQLiteBootstrap";
import { useSupportDiagnostics } from "./hooks/useSupportDiagnostics";
import { useSyncAndBackup } from "./hooks/useSyncAndBackup";
import { AppData, User } from "./types";
import { AppTab, appLicenseStatus } from "./utils/appAccess";
import { isSessionTokenExpired } from "./utils/sessionToken";
import { SyncState } from "./utils/support";
import { useAppTheme } from "./theme/AppTheme";
import { useBiometricLock } from "./hooks/useBiometricLock";
import { BiometricLockScreen } from "./components/BiometricLockScreen";
import { useBiometricLoginAvailability } from "./hooks/useBiometricLoginAvailability";
import { usePasskeyProfile } from "./hooks/usePasskeyProfile";
import { refreshRegisteredDeviceSession, shouldInvalidateDeviceCredential } from "./services/deviceSessionCoordinator";
import { useOnboardingExperience } from "./onboarding/useOnboardingExperience";
import type { OnboardingCoachMarkId } from "./onboarding/onboardingTypes";
import { evaluateOnboarding, shouldMinimizeForExistingUser } from "./onboarding/onboardingEvaluator";



type Tab = AppTab;
const LICENSE_WARNING_AUTO_HIDE_MS = 12_000;

export function AppContent() {
  const { theme } = useAppTheme();
  const headerTopPadding = Platform.OS === "android" ? (NativeStatusBar.currentHeight || 0) + 6 : 12;
  const [data, setData] = useState<AppData>(initialData);
  const [session, setSession] = useState<User | null>(null);
  const [backendToken, setBackendToken] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("synced");
  const [networkReachable, setNetworkReachable] = useState<boolean | null>(null);
  const authState = useAuthState(initialData.backendUrl);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [xmlPreview, setXmlPreview] = useState("");
  const [appMenuVisible, setAppMenuVisible] = useState(false);
  const [licenseVisible, setLicenseVisible] = useState(false);
  const [licenseBannerVisible, setLicenseBannerVisible] = useState(true);
  const [syncCenterVisible, setSyncCenterVisible] = useState(false);
  const [syncActionLoading, setSyncActionLoading] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [activeCoachMark, setActiveCoachMark] = useState<OnboardingCoachMarkId | null>(null);
  const keyboardInset = useKeyboardInset();
  const backendTokenRef = useRef("");
  const dataRef = useRef<AppData>(initialData);
  const sessionRef = useRef<User | null>(null);
  const syncStateRef = useRef<SyncState>("synced");
  const tokenRenewalRunningRef = useRef(false);
  const supportDiagnostics = useSupportDiagnostics({
    backendTokenRef,
    dataRef,
    sessionRef,
    syncState,
    onBeforeOpen: () => setAppMenuVisible(false)
  });

  const { login, loginWithBiometrics, registerTenant, recoverPassword, chooseLoginEstablishment, submitNewPassword, logout } = useAuthActions({
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
  const biometricLock = useBiometricLock(session ? {
    companyId: session.companyId || data.issuer.ruc,
    userId: session.id,
    backendUrl: data.backendUrl,
    companyRuc: data.issuer.ruc,
    establishmentId: data.issuer.activeEstablishmentId || "",
    token: backendToken,
    user: session
  } : null);
  const passkeyProfile = usePasskeyProfile(session ? {
    companyId: session.companyId || data.issuer.ruc,
    userId: session.id,
    backendUrl: data.backendUrl,
    companyRuc: data.issuer.ruc,
    establishmentId: data.issuer.activeEstablishmentId || "",
    token: backendToken,
    user: session
  } : null);
  const profileSecurity = Platform.OS === "web" ? passkeyProfile : biometricLock;
  const onboardingCompanyId = session?.companyId || data.issuer.ruc || "";
  const onboarding = useOnboardingExperience(session?.id || "", onboardingCompanyId);
  const secureLogout = useCallback(() => logout(), [logout]);

  useEffect(() => {
    setActiveCoachMark(null);
  }, [onboardingCompanyId, session?.id]);

  useEffect(() => {
    if (!session || !onboarding.ready || onboarding.experience.welcomeSeen) return;
    const evaluation = evaluateOnboarding(data, session);
    if (!shouldMinimizeForExistingUser(evaluation, onboardingVisible)) return;
    onboarding.markWelcomeSeen();
    onboarding.setCenterMinimized(true);
  }, [data, onboarding, onboardingVisible, session]);

  const { ready, recoveryError, retryBootstrap, retrying, status: bootstrapStatus } = useAppBootstrap({
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
  const biometricLogin = useBiometricLoginAvailability(ready && !session);
  const sqliteCatalogDiagnostic = useSQLiteBootstrap(
    ready && Boolean(session),
    data,
    session
  );
  const readableData = useControlledCatalogData(
    ready,
    data,
    session,
    sqliteCatalogDiagnostic
  );
  const salesHistory = useControlledSalesHistory(
    ready && tab === "documentos",
    data,
    session
  );

  const contactRecoverySupport = () => {
    const phone = SUPPORT_WHATSAPP_NUMBER.replace(/\D/g, "");
    if (!phone) return;
    const message = recoveryError
      ? `Necesito soporte para recuperar los datos locales de FactuDarwin. Codigo: ${recoveryError.code}. Etapa: ${recoveryError.stage}. Intento: ${recoveryError.attemptedAt}.`
      : "Necesito soporte para recuperar los datos locales de FactuDarwin.";
    void Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
  };

  useEffect(() => {
    if (!ready || !session) return undefined;

    const expireSessionIfNeeded = async () => {
      const token = backendTokenRef.current || backendToken;
      if (!token || !isSessionTokenExpired(token) || tokenRenewalRunningRef.current) return;
      if (Platform.OS === "web") {
        secureLogout();
        authState.setLoginStatus({ tone: "error", message: "Su sesión expiró. Ingrese nuevamente para continuar trabajando." });
        return;
      }
      tokenRenewalRunningRef.current = true;
      try {
        const renewed = await refreshRegisteredDeviceSession();
        setBackendToken(renewed.token);
        backendTokenRef.current = renewed.token;
        if (sessionRef.current) {
          await saveSession(sessionRef.current, renewed.token, "", dataRef.current.issuer.ruc);
        }
      } catch (error) {
        setBackendToken("");
        backendTokenRef.current = "";
        if (shouldInvalidateDeviceCredential(error)) {
          secureLogout();
          authState.setLoginStatus({ tone: "error", message: "Este dispositivo ya no tiene una sesión segura válida. Ingrese con su contraseña." });
        } else {
          authState.setLoginStatus({ tone: "info", message: "Sin conexión para renovar la sesión. Puede continuar con los datos locales." });
        }
      } finally {
        tokenRenewalRunningRef.current = false;
      }
    };

    void expireSessionIfNeeded();
    const timer = setInterval(() => { void expireSessionIfNeeded(); }, 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void expireSessionIfNeeded();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [authState, backendToken, backendTokenRef, ready, secureLogout, session]);

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
    persistMutation,
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
    setNetworkReachable,
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



  if (bootstrapStatus === "recovery-error") {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>No se pudieron cargar los datos locales</Text>
        <Text style={[styles.recoveryDescription, { color: theme.colors.textMuted }]}>Tus datos originales fueron conservados. No continues facturando hasta recuperarlos.</Text>
        <Pressable style={[styles.recoveryPrimaryButton, retrying && styles.recoveryButtonDisabled]} onPress={() => { void retryBootstrap(); }} disabled={retrying}>
          <Text style={styles.recoveryPrimaryText}>{retrying ? "Reintentando..." : "Reintentar"}</Text>
        </Pressable>
        <Pressable style={styles.recoverySecondaryButton} onPress={contactRecoverySupport} disabled={retrying}>
          <Text style={styles.recoverySecondaryText}>Contactar soporte</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Cargando...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <AppAuthGate
        authState={authState}
        chooseLoginEstablishment={chooseLoginEstablishment}
        login={login}
        biometricAccount={biometricLogin.hint}
        biometricButtonLabel={biometricLogin.buttonLabel}
        biometricLoading={biometricLogin.loading || authState.loggingIn}
        loginWithBiometrics={loginWithBiometrics}
        recoverPassword={recoverPassword}
        registerTenant={registerTenant}
      />
    );
  }

  if (biometricLock.loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Protegiendo sesión...</Text>
      </SafeAreaView>
    );
  }

  if (biometricLock.locked) {
    return (
      <BiometricLockScreen
        authenticating={biometricLock.authenticating}
        error={biometricLock.error}
        onUnlock={() => { void biometricLock.unlock(); }}
        onUsePassword={secureLogout}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ExpoStatusBar style={theme.dark ? "light" : "dark"} />
      <AppMainShell
        activeTab={tab}
        availableTabs={availableTabs}
        backendToken={backendToken}
        companyLabel={connectedCompanyLabel}
        data={readableData}
        salesHistory={salesHistory}
        establishmentLabel={currentEstablishmentLabel}
        headerTopPadding={headerTopPadding}
        keyboardInset={keyboardInset}
        licenseActive={licenseState.active}
        licenseBannerVisible={licenseBannerVisible}
        session={session}
        syncActionLoading={syncActionLoading}
        syncState={syncState}
        networkReachable={networkReachable}
        ensureBackendToken={ensureBackendToken}
        onOpenLicense={() => setLicenseVisible(true)}
        onOpenMenu={() => setAppMenuVisible(true)}
        onOpenSupport={supportDiagnostics.open}
        onOpenSyncCenter={openSyncCenter}
        onRetryPendingSync={() => { void retryPendingSync(); }}
        onRefreshBackend={() => refreshFromBackend("manual")}
        onTabChange={setTab}
        onXml={setXmlPreview}
        persist={persist}
        persistMutation={persistMutation}
        onboardingExperience={onboarding.experience}
        activeCoachMark={activeCoachMark}
        onSetCenterMinimized={onboarding.setCenterMinimized}
        onSkipOptionalStep={onboarding.skipOptionalStep}
        onAcknowledgeOnboarding={onboarding.acknowledgeCompletion}
        onMarkCoachSeen={onboarding.markCoachSeen}
        onSetActiveCoachMark={setActiveCoachMark}
      />

      <AppGlobalModals
        appMenuVisible={appMenuVisible}
        activeTab={tab}
        availableTabs={availableTabs}
        authState={authState}
        chooseLoginEstablishment={chooseLoginEstablishment}
        currentEstablishment={currentEstablishment}
        data={data}
        logout={secureLogout}
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
        biometricAvailable={profileSecurity.available}
        biometricEnabled={profileSecurity.enabled}
        biometricLoading={profileSecurity.loading || profileSecurity.authenticating}
        biometricError={profileSecurity.error}
        onToggleBiometric={() => {
          if (profileSecurity.enabled) void profileSecurity.disable();
          else void profileSecurity.enable();
        }}
        onWelcomeComplete={onboarding.markWelcomeSeen}
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
  },
  recoveryDescription: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 360,
    paddingHorizontal: 24,
    textAlign: "center"
  },
  recoveryPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#0b6f68",
    borderRadius: 8,
    marginTop: 18,
    minWidth: 220,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  recoveryButtonDisabled: {
    opacity: 0.55
  },
  recoveryPrimaryText: {
    color: "#ffffff",
    fontWeight: "900"
  },
  recoverySecondaryButton: {
    alignItems: "center",
    borderColor: "#0b6f68",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    minWidth: 220,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  recoverySecondaryText: {
    color: "#0b6f68",
    fontWeight: "900"
  }
});
