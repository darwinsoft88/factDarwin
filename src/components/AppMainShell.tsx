import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { AppHeader } from "./AppHeader";
import { AppTabs } from "./AppTabs";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { CalendarDateInput } from "./CalendarDateInput";
import { CrudSection } from "./CrudSection";
import { ListItem } from "./ListItem";
import { DashboardScreen } from "../screens/DashboardScreen";
import { ReportsScreen } from "../screens/ReportsScreen";
import { SalesScreen } from "../screens/SalesScreen";
import { SriScreen } from "../screens/SriScreen";
import { CashClosingScreen } from "../screens/CashClosingScreen";
import { ClientsScreen } from "../screens/ClientsScreen";
import { InventoryScreen } from "../screens/InventoryScreen";
import { GuidesScreen } from "../screens/GuidesScreen";
import { ProductsScreen } from "../screens/ProductsScreen";
import { UsersScreen } from "../screens/UsersScreen";
import { AppData, User } from "../types";
import { AppTab } from "../utils/appAccess";

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
  session: User;
  syncError: boolean;
  syncNotice: string;
  ensureBackendToken: (backendUrl: string) => Promise<string>;
  onOpenMenu: () => void;
  onRefreshBackend: () => Promise<void>;
  onTabChange: React.Dispatch<React.SetStateAction<AppTab>>;
  onXml: React.Dispatch<React.SetStateAction<string>>;
  persist: (data: AppData) => Promise<void>;
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
  onOpenMenu,
  onRefreshBackend,
  onTabChange,
  onXml,
  persist,
  session,
  syncError,
  syncNotice,
  ensureBackendToken
}: AppMainShellProps) {
  return (
    <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
      <AppHeader
        backendUrl={data.backendUrl}
        companyLabel={companyLabel}
        establishmentLabel={establishmentLabel}
        headerTopPadding={headerTopPadding}
        license={data.license}
        licenseActive={licenseActive}
        logoUrl={data.issuer.logoUrl}
        syncError={syncError}
        syncNotice={syncNotice}
        onOpenMenu={onOpenMenu}
      />

      <AppTabs availableTabs={availableTabs} activeTab={activeTab} onChange={onTabChange} />

      <ScrollView
        contentContainerStyle={[styles.content, keyboardInset > 0 && { paddingBottom: keyboardInset + 220 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        {activeTab === "dashboard" && <DashboardScreen data={data} user={session} onNavigate={onTabChange} ListItemComponent={ListItem} />}
        {activeTab === "ventas" && <SalesScreen data={data} user={session} backendToken={backendToken} persist={persist} onXml={onXml} />}
        {activeTab === "clientes" && <ClientsScreen data={data} user={session} backendToken={backendToken} getBackendToken={ensureBackendToken} persist={persist} ListItemComponent={ListItem} />}
        {activeTab === "productos" && <ProductsScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} BarcodeScannerModalComponent={BarcodeScannerModal} />}
        {activeTab === "inventario" && <InventoryScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} />}
        {activeTab === "caja" && <CashClosingScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
        {activeTab === "guias" && <GuidesScreen data={data} user={session} backendToken={backendToken} persist={persist} onXml={onXml} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
        {activeTab === "usuarios" && session.role === "admin" && <UsersScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} CrudSectionComponent={CrudSection} />}
        {activeTab === "reportes" && <ReportsScreen data={data} onReport={onXml} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
        {activeTab === "sri" && session.role === "admin" && <SriScreen data={data} user={session} backendToken={backendToken} getBackendToken={ensureBackendToken} persist={persist} onRefreshBackend={() => { void onRefreshBackend(); }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1
  },
  content: {
    padding: 12,
    paddingBottom: 170
  }
});
