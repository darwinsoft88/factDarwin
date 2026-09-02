import { sriPendingSendSummary } from "../utils/sriRetryPolicy";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { AppHeader } from "./AppHeader";
import { AppTabs } from "./AppTabs";
import { BottomAppTabs } from "./BottomAppTabs";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { CalendarDateInput } from "./CalendarDateInput";
import { CommercialSupportButton } from "./CommercialSupportButton";
import { LicenseExpiryBanner } from "./LicenseExpiryBanner";
import { ListItem } from "./ListItem";
import { SyncStatusBanner } from "./SyncStatusBanner";
import { DashboardScreen } from "../screens/DashboardScreen";
import { ReportsScreen } from "../screens/ReportsScreen";
import { SalesScreen } from "../screens/SalesScreen";
import { SriScreen } from "../screens/SriScreen";
import { CashClosingScreen } from "../screens/CashClosingScreen";
import { CreditsScreen } from "../screens/CreditsScreen";
import { ClientsScreen } from "../screens/ClientsScreen";
import { InventoryScreen } from "../screens/InventoryScreen";
import { GuidesScreen } from "../screens/GuidesScreen";
import { ProductsScreen } from "../screens/ProductsScreen";
import { UsersScreen } from "../screens/UsersScreen";
import { KEYBOARD_AVOIDING_BEHAVIOR } from "../constants/layout";
import { FloatingOverlayContext } from "../context/FloatingOverlayContext";
import { AppData, User } from "../types";
import type { PersistMutation } from "../hooks/useSyncAndBackup";
import type { ControlledSalesHistory } from "../hooks/useControlledSalesHistory";
import { AppTab } from "../utils/appAccess";
import { SyncState } from "../utils/support";
import { useAppTheme } from "../theme/AppTheme";
import { getCompanyAssetsStatus } from "../services/backend";
import type { CompanyAssetsStatus } from "../services/backendApi/types";
import { evaluateOnboarding } from "../onboarding/onboardingEvaluator";
import { navigationForOnboardingStep } from "../onboarding/onboardingNavigation";
import type { OnboardingCoachMarkId, OnboardingExperience, OnboardingStepId, OnboardingStepState } from "../onboarding/onboardingTypes";
import { ContextualHelpBanner } from "./ContextualHelpBanner";

const USE_BOTTOM_NAVIGATION = true;


type AppMainShellProps = {
  activeTab: AppTab;
  availableTabs: AppTab[];
  backendToken: string;
  companyLabel: string;
  data: AppData;
  salesHistory: ControlledSalesHistory;
  establishmentLabel: string;
  headerTopPadding: number;
  keyboardInset: number;
  licenseActive: boolean;
  licenseBannerVisible: boolean;
  session: User;
  syncActionLoading: boolean;
  syncState: SyncState;
  networkReachable: boolean | null;
  ensureBackendToken: (backendUrl: string) => Promise<string>;
  onOpenLicense: () => void;
  onOpenMenu: () => void;
  onOpenSupport: () => void;
  onOpenSyncCenter: () => void;
  onRetryPendingSync: () => void;
  onRefreshBackend: () => Promise<void>;
  onTabChange: React.Dispatch<React.SetStateAction<AppTab>>;
  onXml: React.Dispatch<React.SetStateAction<string>>;
  persist: (data: AppData) => Promise<void>;
  persistMutation: PersistMutation;
  onboardingExperience: OnboardingExperience;
  activeCoachMark: OnboardingCoachMarkId | null;
  onSetCenterMinimized: (value: boolean) => void;
  onSkipOptionalStep: (stepId: OnboardingStepId) => void;
  onAcknowledgeOnboarding: () => void;
  onMarkCoachSeen: (coachId: OnboardingCoachMarkId) => void;
  onSetActiveCoachMark: (coachId: OnboardingCoachMarkId | null) => void;
};

export function AppMainShell({
  activeTab,
  availableTabs,
  backendToken,
  companyLabel,
  data,
  salesHistory,
  establishmentLabel,
  headerTopPadding,
  keyboardInset,
  licenseActive,
  licenseBannerVisible,
  onOpenLicense,
  onOpenMenu,
  onOpenSupport,
  onRefreshBackend,
  onTabChange,
  onXml,
  persist,
  persistMutation,
  session,
  syncActionLoading,
  syncState,
  networkReachable,
  onOpenSyncCenter,
  onRetryPendingSync,
  ensureBackendToken
  ,onboardingExperience
  ,activeCoachMark
  ,onSetCenterMinimized
  ,onSkipOptionalStep
  ,onAcknowledgeOnboarding
  ,onMarkCoachSeen
  ,onSetActiveCoachMark
}: AppMainShellProps) {
  const { theme } = useAppTheme();
  const [floatingOverlay, setFloatingOverlay] = useState<React.ReactNode>(null);
  const [bottomNavigationHeight, setBottomNavigationHeight] = useState(70);
  const [certificateStatus, setCertificateStatus] = useState<CompanyAssetsStatus["certificate"]>();
  const hasSalesOverlay = activeTab === "ventas" && Boolean(floatingOverlay);
  const showCommercialSupport = activeTab !== "ventas";
  const sriPendingCount = sriPendingSendSummary(data).pendingCount;
  const onboardingEvaluation = evaluateOnboarding(data, session, certificateStatus);
  const openOnboardingStep = (step: OnboardingStepState) => {
    const navigation = navigationForOnboardingStep(step);
    if (!navigation) return;
    if (navigation.coachMark && !onboardingExperience.seenCoachMarks.includes(navigation.coachMark)) {
      onMarkCoachSeen(navigation.coachMark);
      onSetActiveCoachMark(navigation.coachMark);
    }
    if (navigation.tab === "sri" && !onboardingExperience.seenCoachMarks.includes("certificate-upload")) {
      onMarkCoachSeen("certificate-upload");
      onSetActiveCoachMark("certificate-upload");
    }
    onTabChange(navigation.tab);
  };

  useEffect(() => {
    let active = true;
    if (!backendToken || !data.backendUrl) {
      setCertificateStatus(undefined);
      return () => { active = false; };
    }
    void getCompanyAssetsStatus(data.backendUrl, backendToken)
      .then((status) => { if (active) setCertificateStatus(status.certificate); })
      .catch(() => { if (active) setCertificateStatus(undefined); });
    return () => { active = false; };
  }, [backendToken, data.backendUrl]);

  return (
    // se usa KeyboardAvoidingView para que el teclado no tape los inputs en iOS, y se usa ScrollView para que la pantalla sea scrollable en Android
    <KeyboardAvoidingView style={[styles.keyboardAvoiding, { backgroundColor: theme.colors.background }]} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
      <FloatingOverlayContext.Provider value={{ setOverlay: setFloatingOverlay }}>
        <AppHeader
          backendUrl={data.backendUrl}
          companyLabel={companyLabel}
          establishmentLabel={establishmentLabel}
          headerTopPadding={headerTopPadding}
          license={data.license}
          licenseActive={licenseActive}
          logoUrl={data.issuer.logoUrl}
          networkReachable={networkReachable}
          onOpenMenu={onOpenMenu}
          onOpenSyncCenter={onOpenSyncCenter}
          pendingCount={(data.pendingSync || []).length}
          sriPendingCount={sriPendingCount}
          syncState={syncState}
          hasSyncError={Boolean(data.autoBackupLastError)}

        />

        <SyncStatusBanner
          data={data}
          syncState={syncState}
          retrying={syncActionLoading}
          onOpen={onOpenSyncCenter}
          onRetry={onRetryPendingSync}
          onView={() => onTabChange("documentos")}
        />

        <LicenseExpiryBanner license={data.license} onOpenLicense={onOpenLicense} visible={licenseBannerVisible} />

        {/* <AppTabs availableTabs={availableTabs} activeTab={activeTab} onChange={onTabChange} /> */}

        {!USE_BOTTOM_NAVIGATION ? (
          <AppTabs
            availableTabs={availableTabs}
            activeTab={activeTab}
            onChange={onTabChange}
          />
        ) : null}

        <ScrollView
          style={{ backgroundColor: theme.colors.background }}
          contentContainerStyle={[
            styles.content,
            hasSalesOverlay && styles.contentWithCheckout,
            keyboardInset > 0 && styles.contentWithKeyboard,
            keyboardInset > 0 && { paddingBottom: keyboardInset + (hasSalesOverlay ? 240 : 150) }
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          {activeTab === "dashboard" && <DashboardScreen data={data} user={session} availableTabs={availableTabs} certificateStatus={certificateStatus} onNavigate={onTabChange} ListItemComponent={ListItem} onboardingEvaluation={onboardingEvaluation} onboardingExperience={onboardingExperience} onOpenOnboardingStep={openOnboardingStep} onMinimizeOnboarding={() => onSetCenterMinimized(true)} onExpandOnboarding={() => onSetCenterMinimized(false)} onSkipOnboardingStep={(step) => onSkipOptionalStep(step.id)} onAcknowledgeOnboarding={onAcknowledgeOnboarding} />}
          {activeTab === "productos" && activeCoachMark === "product-create" ? <ContextualHelpBanner title="Crea tu primer producto o servicio" text="Usa el botón Agregar y completa código, nombre y precio. Este paso también funciona sin conexión." onDismiss={() => onSetActiveCoachMark(null)} /> : null}
          {activeTab === "ventas" && activeCoachMark === "sale-create" ? <ContextualHelpBanner title="Realiza tu primera venta" text="Selecciona un cliente, agrega un producto o servicio y guarda la venta con el flujo habitual." onDismiss={() => onSetActiveCoachMark(null)} /> : null}
          {activeTab === "sri" && activeCoachMark === "certificate-upload" ? <ContextualHelpBanner title="Prepara la firma electrónica" text="Cuando decidas facturar electrónicamente, carga aquí tu archivo .p12 y valida su contraseña." onDismiss={() => onSetActiveCoachMark(null)} /> : null}
          {(activeTab === "ventas" || activeTab === "documentos") && (
            <SalesScreen
              mode={activeTab === "ventas" ? "sale" : "documents"}
              data={data}
              salesHistory={salesHistory}
              user={session}
              backendToken={backendToken}
              persist={persist}
              persistMutation={persistMutation}
              onXml={onXml}
              onOpenSale={() => onTabChange("ventas")}
            />
          )}
          {activeTab === "clientes" && <ClientsScreen data={data} user={session} backendToken={backendToken} getBackendToken={ensureBackendToken} persistMutation={persistMutation} ListItemComponent={ListItem} />}
          {activeTab === "productos" && <ProductsScreen data={data} user={session} backendToken={backendToken} persistMutation={persistMutation} ListItemComponent={ListItem} BarcodeScannerModalComponent={BarcodeScannerModal} />}
          {activeTab === "inventario" && <InventoryScreen data={data} user={session} backendToken={backendToken} persistMutation={persistMutation} ListItemComponent={ListItem} />}
          {activeTab === "caja" && <CashClosingScreen data={data} user={session} backendToken={backendToken} persistMutation={persistMutation} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
          {activeTab === "creditos" && <CreditsScreen data={data} user={session} backendToken={backendToken} persistMutation={persistMutation} ListItemComponent={ListItem} />}
          {activeTab === "guias" && <GuidesScreen data={data} user={session} backendToken={backendToken} persist={persist} onXml={onXml} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
          {activeTab === "usuarios" && session.role === "admin" && <UsersScreen data={data} user={session} backendToken={backendToken} persistMutation={persistMutation} ListItemComponent={ListItem} />}
          {activeTab === "reportes" && <ReportsScreen data={data} onReport={onXml} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
          {activeTab === "sri" && session.role === "admin" && <SriScreen data={data} user={session} backendToken={backendToken} getBackendToken={ensureBackendToken} persist={persist} onRefreshBackend={() => { void onRefreshBackend(); }} />}
        </ScrollView>

        {hasSalesOverlay ? floatingOverlay : null}

        {showCommercialSupport ? (
          <CommercialSupportButton
            data={data}
            user={session}
            bottomInset={keyboardInset}
            navigationHeight={bottomNavigationHeight}
            onOpenDiagnostics={onOpenSupport}
          />
        ) : null}

        {USE_BOTTOM_NAVIGATION ? (
          <BottomAppTabs
            availableTabs={availableTabs}
            activeTab={activeTab}
            onChange={onTabChange}
            onOpenMore={onOpenMenu}
            onHeightChange={setBottomNavigationHeight}
          />
        ) : null}
      </FloatingOverlayContext.Provider>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1
  },
  content: {
    padding: 12,
    paddingBottom: 92
  },
  contentWithCheckout: {
    paddingBottom: 168
  },
  contentWithKeyboard: {
    paddingBottom: 180
  }
});
