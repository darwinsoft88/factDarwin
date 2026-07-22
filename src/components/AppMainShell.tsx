import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { AppHeader } from "./AppHeader";
import { AppTabs } from "./AppTabs";
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
import { AppTab } from "../utils/appAccess";
import { SyncState } from "../utils/support";

type AppMainShellProps = {
  activeTab: AppTab;
  availableTabs: AppTab[];
  backendToken: string;
  companyLabel: string;
  data: AppData;
  establishmentLabel: string;
  headerTopPadding: number;
  keyboardInset: number;
  licenseActive: boolean;
  licenseBannerVisible: boolean;
  session: User;
  syncActionLoading: boolean;
  syncState: SyncState;
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
};

export function AppMainShell({
  activeTab,
  availableTabs,
  backendToken,
  companyLabel,
  data,
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
  onOpenSyncCenter,
  onRetryPendingSync,
  ensureBackendToken
}: AppMainShellProps) {
  const [floatingOverlay, setFloatingOverlay] = useState<React.ReactNode>(null);
  const hasSalesOverlay = activeTab === "ventas" && Boolean(floatingOverlay);
  const showCommercialSupport = activeTab !== "ventas";

  return (
    <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
      <FloatingOverlayContext.Provider value={{ setOverlay: setFloatingOverlay }}>
        <AppHeader
          backendUrl={data.backendUrl}
          companyLabel={companyLabel}
          establishmentLabel={establishmentLabel}
          headerTopPadding={headerTopPadding}
          license={data.license}
          licenseActive={licenseActive}
          logoUrl={data.issuer.logoUrl}
          onOpenMenu={onOpenMenu}
        />

        <SyncStatusBanner
          data={data}
          syncState={syncState}
          onOpen={onOpenSyncCenter}
        />

        <LicenseExpiryBanner license={data.license} onOpenLicense={onOpenLicense} visible={licenseBannerVisible} />

        <AppTabs availableTabs={availableTabs} activeTab={activeTab} onChange={onTabChange} />

        <ScrollView
          contentContainerStyle={[
            styles.content,
            hasSalesOverlay && styles.contentWithCheckout,
            keyboardInset > 0 && styles.contentWithKeyboard,
            keyboardInset > 0 && { paddingBottom: keyboardInset + (hasSalesOverlay ? 240 : 150) }
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          {activeTab === "dashboard" && <DashboardScreen data={data} user={session} onNavigate={onTabChange} ListItemComponent={ListItem} />}
          {(activeTab === "ventas" || activeTab === "documentos") && (
            <SalesScreen
              mode={activeTab === "ventas" ? "sale" : "documents"}
              data={data}
              user={session}
              backendToken={backendToken}
              persist={persist}
              persistMutation={persistMutation}
              onXml={onXml}
              onOpenSale={() => onTabChange("ventas")}
            />
          )}
          {activeTab === "clientes" && <ClientsScreen data={data} user={session} backendToken={backendToken} getBackendToken={ensureBackendToken} persist={persist} ListItemComponent={ListItem} />}
          {activeTab === "productos" && <ProductsScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} BarcodeScannerModalComponent={BarcodeScannerModal} />}
          {activeTab === "inventario" && <InventoryScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} />}
          {activeTab === "caja" && <CashClosingScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
          {activeTab === "creditos" && <CreditsScreen data={data} user={session} backendToken={backendToken} persistMutation={persistMutation} ListItemComponent={ListItem} />}
          {activeTab === "guias" && <GuidesScreen data={data} user={session} backendToken={backendToken} persist={persist} onXml={onXml} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
          {activeTab === "usuarios" && session.role === "admin" && <UsersScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} />}
          {activeTab === "reportes" && <ReportsScreen data={data} onReport={onXml} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
          {activeTab === "sri" && session.role === "admin" && <SriScreen data={data} user={session} backendToken={backendToken} getBackendToken={ensureBackendToken} persist={persist} onRefreshBackend={() => { void onRefreshBackend(); }} />}
        </ScrollView>

        {hasSalesOverlay ? floatingOverlay : null}

        {showCommercialSupport ? <CommercialSupportButton data={data} user={session} bottomInset={keyboardInset} onOpenDiagnostics={onOpenSupport} /> : null}
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
