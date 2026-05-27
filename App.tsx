import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text,
  View
} from "react-native";
import { Empty, LoadMoreButton, Section } from "./src/components/common";
import { AppHeader } from "./src/components/AppHeader";
import { ActivePlanInfo } from "./src/components/ActivePlanInfo";
import { AppMenuModal } from "./src/components/AppMenuModal";
import { AppTabs } from "./src/components/AppTabs";
import { AuditSection } from "./src/components/AuditSection";
import { BarcodeScannerModal } from "./src/components/BarcodeScannerModal";
import { CalendarDateInput } from "./src/components/CalendarDateInput";
import { CompanyAssetsSection } from "./src/components/CompanyAssetsSection";
import { CrudSection } from "./src/components/CrudSection";
import { CreditNoteModal } from "./src/components/CreditNoteModal";
import { DatabaseSyncSection } from "./src/components/DatabaseSyncSection";
import { DeleteEstablishmentModal } from "./src/components/DeleteEstablishmentModal";
import { DismissibleNotice } from "./src/components/DismissibleNotice";
import { DocumentTypeSelector } from "./src/components/DocumentTypeSelector";
import { EstablishmentActions } from "./src/components/EstablishmentActions";
import { EstablishmentPickerModal } from "./src/components/EstablishmentPickerModal";
import { ListItem } from "./src/components/ListItem";
import { AuthScreen } from "./src/components/AuthScreen";
import { useAuthActions } from "./src/hooks/useAuthActions";
import { useAuthState } from "./src/hooks/useAuthState";
import { useAppBootstrap } from "./src/hooks/useAppBootstrap";
import { useAvailableTabs } from "./src/hooks/useAvailableTabs";
import { useKeyboardInset } from "./src/hooks/useKeyboardInset";
import { useSyncAndBackup } from "./src/hooks/useSyncAndBackup";
import { useSupportDiagnostics } from "./src/hooks/useSupportDiagnostics";
import { NewEstablishmentModal } from "./src/components/NewEstablishmentModal";
import { OnboardingModal } from "./src/components/OnboardingModal";
import { PasswordChangeModal } from "./src/components/PasswordChangeModal";
import { PaymentMethodPicker } from "./src/components/PaymentMethodPicker";
import { PlanLimitCard } from "./src/components/PlanLimitCard";
import { PlanUpgradeModal } from "./src/components/PlanUpgradeModal";
import { ProcessingOverlay } from "./src/components/ProcessingOverlay";
import { ProductionStatusSection } from "./src/components/ProductionStatusSection";
import { QuickClientEditor } from "./src/components/QuickClientEditor";
import { ReceivedRetentionModal } from "./src/components/ReceivedRetentionModal";
import { ReceivedRetentionsList } from "./src/components/ReceivedRetentionsList";
import { SaleClientPicker } from "./src/components/SaleClientPicker";
import { SaleEditNotice } from "./src/components/SaleEditNotice";
import { SaleItemsList } from "./src/components/SaleItemsList";
import { SaleLineEditor } from "./src/components/SaleLineEditor";
import { SaleProductControls } from "./src/components/SaleProductControls";
import { SaleProductPicker } from "./src/components/SaleProductPicker";
import { SaleSubmitButton } from "./src/components/SaleSubmitButton";
import { SaleTotalsBox } from "./src/components/SaleTotalsBox";
import { SalesFilters } from "./src/components/SalesFilters";
import { StartupErrorBoundary } from "./src/components/StartupErrorBoundary";
import { SupportModal } from "./src/components/SupportModal";
import { SyncCenterModal } from "./src/components/SyncCenterModal";
import { TechnicalLogsSection } from "./src/components/TechnicalLogsSection";
import { XmlPreviewModal } from "./src/components/XmlPreviewModal";
import { IntegrationStatusInfo } from "./src/components/IntegrationStatusInfo";
import { InvoiceStatsGrid } from "./src/components/InvoiceStatsGrid";
import { IssuerEstablishmentFields } from "./src/components/IssuerEstablishmentFields";
import { IssuerIdentityFields } from "./src/components/IssuerIdentityFields";
import { IssuerServerSettings } from "./src/components/IssuerServerSettings";
import { IssuerTaxSettings } from "./src/components/IssuerTaxSettings";
import { LIST_BATCH_SIZE } from "./src/constants/app";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { ReportsScreen } from "./src/screens/ReportsScreen";
import { CashClosingScreen } from "./src/screens/CashClosingScreen";
import { ClientsScreen } from "./src/screens/ClientsScreen";
import { InventoryScreen } from "./src/screens/InventoryScreen";
import { GuidesScreen } from "./src/screens/GuidesScreen";
import { ProductsScreen } from "./src/screens/ProductsScreen";
import { UsersScreen } from "./src/screens/UsersScreen";
import { TechnicalLog, authorizeInvoice, backupAppData, checkBackendHealth, getCompanyAssetsStatus, getTechnicalLogs, lookupIdentityData, reserveDocumentSequence, restoreAppData, searchBackendClients, searchBackendProducts, sendInvoiceEmail, sendTestEmail, uploadCompanyCertificate, uploadCompanyLogo } from "./src/services/backend";
import { buildRideHtml } from "./src/services/ride";
import { buildCreditNoteXml, buildInvoiceXml, calculateLineTotal, calculateTotalDiscount, calculateTotals, createAccessKey, createCreditNoteAccessKey, grossToNetUnitPrice, money, nextSequence } from "./src/services/sri";
import { initialData } from "./src/storage";
import { AppData, AppLicense, Client, DocumentType, InventoryMovement, IssuerEstablishment, PaymentMethod, Product, ReceivedRetention, RetentionTaxType, Sale, SaleItem, User } from "./src/types";
import { productCost, productMinStock } from "./src/utils/accounting";
import { AppTab, appLicenseStatus, canAccessSensitiveSupport, canIssueFromInternalDocuments, canManageFiscalAdjustments, canRetryDocuments, canVoidDocuments, compactLicenseStatusLabel, roleLabel } from "./src/utils/appAccess";
import { appendAudit } from "./src/utils/audit";
import { resolveCompanyLogoUrl } from "./src/utils/assets";
import { addedEstablishmentIds } from "./src/utils/dataMerge";
import { formatSaleDetail } from "./src/utils/documentDetails";
import { buildCreditNoteRideHtml, buildInternalTicketHtml, buildProformaHtml } from "./src/utils/documentHtml";
import { compareSalesNewestFirst, getRetryInfo, isAccessKeyUsed, MAX_DAILY_RETRIES, resolveInvoiceStatus, saleInActiveScope } from "./src/utils/documents";
import { getLocalVoidReason, showMessage } from "./src/utils/dialogs";
import { activeEstablishment, activeIssuer, applyIdentityToIssuer, editableEstablishments, issuerForSale, issuerWithEstablishment, normalizedEstablishments, normalizeThreeDigits, updateIssuerEstablishmentSequence } from "./src/utils/establishments";
import { pickWebFile, readWebFileBase64 } from "./src/utils/files";
import { formatShortDate, formatSriDate, parseInputDate, shortText, toInputDate } from "./src/utils/format";
import { generateId } from "./src/utils/id";
import { buildStockCredits, buildStockMovements, getAvailableStockForSale, restoreSaleStock } from "./src/utils/inventory";
import { canRetrySriStatus, displayInvoiceStatus, isSriRejected, isTicketOffline } from "./src/utils/invoiceStatus";
import { canUseEmissionScope, maxEmissionPointsForLicense } from "./src/utils/license";
import { createPdfBase64, estimateTicketPageHeightMm, handlePdfDocument, handleTicketDocument, openHtmlViewer } from "./src/utils/printFiles";
import { parseDecimal, roundMoney } from "./src/utils/numbers";
import { buildCreditNoteItemsFromQuantities, calculateGrossUnitPrice, calculateLineGrossDiscount, canEditSale, canIssueCreditNoteForSale, documentTypeLabel, formatQuantity, getCreditLineAvailable, getCreditLineKey, hasCreditNoteBalance, isCreditNoteSale, isFinalConsumerClient, isInvoiceSale, nextInternalSequence, nextProformaSequence, saleNeedsStockDiscount, saleStatusReducesStock, validateCreditNoteQuantities } from "./src/utils/sales";
import { explainSriResult, sriUserMessage, userFriendlyActionError } from "./src/utils/sriMessages";
import { formatBackendHealth, formatBackupSummary, formatSyncStatus, summarizeAppData, SyncState } from "./src/utils/support";
import { syncPatchToBackend, syncSalePatchToBackend } from "./src/utils/sync";
import { buildProductionChecklist, canonicalConsumerFinalClient, findDuplicateClient, isConsumerFinalClient, normalizeClientForInvoice, normalizeClientIdentification, normalizeProductCode, sanitizeAppData, validateBeforeInternalSale, validateBeforeIssue, validateBeforeProforma, validateEmissionPointLicense, validateIssuer } from "./src/validation";

type Tab = AppTab;

const uid = generateId;

function issuerForDocument(data: AppData, sale: Sale) {
  const issuer = issuerForSale(data.issuer, sale);
  return {
    ...issuer,
    logoUrl: resolveCompanyLogoUrl(issuer.logoUrl, data.backendUrl)
  };
}

// Solo para pruebas iniciales. En producción, se debe crear al menos un usuario administrador desde el registro o la configuración inicial.
function AppContent() {
  const headerTopPadding = Platform.OS === "android" ? (NativeStatusBar.currentHeight || 0) + 6 : 12;
  const [data, setData] = useState<AppData>(initialData);
  const [session, setSession] = useState<User | null>(null);
  const [backendToken, setBackendToken] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("synced");
  const {
    authMode,
    setAuthMode,
    registering,
    setRegistering,
    registerStatus,
    setRegisterStatus,
    recoveringPassword,
    setRecoveringPassword,
    recoverStatus,
    setRecoverStatus,
    loginStatus,
    setLoginStatus,
    loginErrorModalMessage,
    setLoginErrorModalMessage,
    passwordChangeVisible,
    setPasswordChangeVisible,
    newPasswordForm,
    setNewPasswordForm,
    newPasswordVisible,
    setNewPasswordVisible,
    changingPassword,
    setChangingPassword,
    passwordChangeStatus,
    setPasswordChangeStatus,
    companyOptions,
    setCompanyOptions,
    establishmentOptionsVisible,
    setEstablishmentOptionsVisible,
    establishmentSwitcherVisible,
    setEstablishmentSwitcherVisible,
    pendingLogin,
    setPendingLogin,
    email,
    setEmail,
    password,
    setPassword,
    showLoginPassword,
    setShowLoginPassword,
    recoveryIdentifier,
    setRecoveryIdentifier,
    authBackendUrl,
    setAuthBackendUrl,
    registerForm,
    setRegisterForm,
    emptyRegisterForm
  } = useAuthState(initialData.backendUrl);
  const authState = {
    authMode,
    setAuthMode,
    registering,
    setRegistering,
    registerStatus,
    setRegisterStatus,
    recoveringPassword,
    setRecoveringPassword,
    recoverStatus,
    setRecoverStatus,
    loginStatus,
    setLoginStatus,
    loginErrorModalMessage,
    setLoginErrorModalMessage,
    passwordChangeVisible,
    setPasswordChangeVisible,
    newPasswordForm,
    setNewPasswordForm,
    newPasswordVisible,
    setNewPasswordVisible,
    changingPassword,
    setChangingPassword,
    passwordChangeStatus,
    setPasswordChangeStatus,
    companyOptions,
    setCompanyOptions,
    establishmentOptionsVisible,
    setEstablishmentOptionsVisible,
    establishmentSwitcherVisible,
    setEstablishmentSwitcherVisible,
    pendingLogin,
    setPendingLogin,
    email,
    setEmail,
    password,
    setPassword,
    showLoginPassword,
    setShowLoginPassword,
    recoveryIdentifier,
    setRecoveryIdentifier,
    authBackendUrl,
    setAuthBackendUrl,
    registerForm,
    setRegisterForm,
    emptyRegisterForm
  };
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
    setEstablishmentSwitcherVisible,
    setTab,
    setOnboardingVisible
  });

  const ready = useAppBootstrap({
    backendTokenRef,
    dataRef,
    sessionRef,
    setBackendToken,
    setData,
    setEmail,
    setPasswordChangeStatus,
    setPasswordChangeVisible,
    setSession
  });

// Para desarrollo, se puede cargar una sesión de prueba automáticamente. En producción, se debe iniciar sin sesión para mostrar la pantalla de login o registro.
  useEffect(() => {
    if (ready && !session && data.users.length === 0) {
      setAuthMode("register");
    }
  }, [data.users.length, ready, session, setAuthMode]);

  useEffect(() => {
    backendTokenRef.current = backendToken;
  }, [backendToken]);

  useEffect(() => {
    dataRef.current = data;
    setAuthBackendUrl(data.backendUrl);
  }, [data, setAuthBackendUrl]);

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
    email,
    password,
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

  const switchActiveEstablishment = async (establishmentId: string) => {
    const currentData = dataRef.current;
    const establishments = normalizedEstablishments(currentData.issuer);
    const allowed = establishments.filter((item) => item.active !== false).slice(0, maxEmissionPointsForLicense(currentData.license));
    const next = allowed.find((item) => item.id === establishmentId);
    if (!next) {
      Alert.alert("Establecimiento no disponible", "Ese punto de emision no esta activo o no esta permitido por la licencia.");
      return;
    }

    const changedAt = new Date().toISOString();
    const nextIssuer = issuerWithEstablishment({
      ...currentData.issuer,
      establishments: establishments.map((item) => item.id === next.id ? { ...item, updatedAt: changedAt } : item),
      activeEstablishmentId: next.id,
      establishmentsUpdatedAt: changedAt
    }, { ...next, updatedAt: changedAt });
    const nextData = appendAudit(
      { ...currentData, issuer: nextIssuer },
      session || undefined,
      "ACTIVE_ESTABLISHMENT_CHANGED",
      "issuer",
      currentData.issuer.ruc,
      `Establecimiento activo cambiado a ${next.name} ${next.establishment}-${next.emissionPoint}`,
      { establishment: next.establishment, emissionPoint: next.emissionPoint }
    );

    setEstablishmentSwitcherVisible(false);
    setAppMenuVisible(false);
    setData(nextData);
    dataRef.current = nextData;
    await persist(nextData);
    await syncPatchToBackend(currentData.backendUrl, backendTokenRef.current || backendToken, { baseData: currentData, issuer: nextIssuer, auditLogs: nextData.auditLogs.slice(0, 1) }, "Establecimiento pendiente de sincronizar", nextData, persist);
    showMessage("Establecimiento cambiado", `Ahora factura con ${next.name} ${next.establishment}-${next.emissionPoint}.`);
  };

  const openAdminSettings = (focus: "configuracion" | "licencia") => {
    setAppMenuVisible(false);
    if (availableTabs.includes("sri")) {
      setTab("sri");
      return;
    }
    Alert.alert(focus === "licencia" ? "Licencia" : "Configuracion", "Esta seccion esta disponible para usuarios administradores.");
  };

  if (!ready) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>Cargando...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <AuthScreen
          authMode={authMode}
          authBackendUrl={authBackendUrl}
          setAuthBackendUrl={setAuthBackendUrl}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          showLoginPassword={showLoginPassword}
          setShowLoginPassword={setShowLoginPassword}
          login={login}
          loginStatus={loginStatus}
          loginErrorModalMessage={loginErrorModalMessage}
          setLoginErrorModalMessage={setLoginErrorModalMessage}
          companyOptions={companyOptions}
          registerForm={registerForm}
          setRegisterForm={setRegisterForm}
          registering={registering}
          registerStatus={registerStatus}
          registerTenant={registerTenant}
          recoveryIdentifier={recoveryIdentifier}
          setRecoveryIdentifier={setRecoveryIdentifier}
          recoverPassword={recoverPassword}
          recoverStatus={recoverStatus}
          recoveringPassword={recoveringPassword}
          onOpenRegister={() => setAuthMode("register")}
          onOpenForgot={() => {
            setRecoveryIdentifier(email);
            setRecoverStatus(null);
            setAuthMode("forgot");
          }}
          onCancelRegister={() => {
            setAuthMode("login");
            setRegisterStatus(null);
            setRegistering(false);
          }}
          onCancelForgot={() => {
            setAuthMode("login");
            setRecoverStatus(null);
            setRecoveringPassword(false);
          }}
          establishments={pendingLogin ? normalizedEstablishments(pendingLogin.data.issuer).filter((item) => item.active !== false) : []}
          establishmentOptionsVisible={establishmentOptionsVisible}
          chooseLoginEstablishment={chooseLoginEstablishment}
          onCancelEstablishmentSelection={() => {
            setPendingLogin(null);
            setEstablishmentOptionsVisible(false);
            setCompanyOptions([]);
            setLoginStatus(null);
            setLoginErrorModalMessage("");
          }}
        />
      );
    }

    const licenseState = appLicenseStatus(data.license);
  const syncNotice = syncState === "synced" && (data.pendingSync || []).length === 0 && data.autoBackupEnabled !== false ? "" : formatSyncStatus(syncState, data);
  const currentEstablishment = activeEstablishment(data.issuer);
  const connectedCompanyLabel = data.issuer.tradeName || data.issuer.businessName || data.issuer.ruc || "Empresa";
  const currentEstablishmentLabel = `${currentEstablishment.name} ${currentEstablishment.establishment}-${currentEstablishment.emissionPoint}`;
  const switchableEstablishments = normalizedEstablishments(data.issuer).filter((item) => item.active !== false).slice(0, maxEmissionPointsForLicense(data.license));

  return (
    <SafeAreaView style={styles.screen}>
      <ExpoStatusBar style="dark" />
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <AppHeader
          backendUrl={data.backendUrl}
          companyLabel={connectedCompanyLabel}
          establishmentLabel={currentEstablishmentLabel}
          headerTopPadding={headerTopPadding}
          license={data.license}
          licenseActive={licenseState.active}
          logoUrl={data.issuer.logoUrl}
          syncError={syncState === "error"}
          syncNotice={syncNotice}
          onOpenMenu={() => setAppMenuVisible(true)}
        />

        <AppTabs availableTabs={availableTabs} activeTab={tab} onChange={setTab} />

        <ScrollView
          contentContainerStyle={[styles.content, keyboardInset > 0 && { paddingBottom: keyboardInset + 220 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          {tab === "dashboard" && <DashboardScreen data={data} user={session} onNavigate={setTab} ListItemComponent={ListItem} />}
          {tab === "ventas" && <SalesView data={data} user={session} backendToken={backendToken} persist={persist} onXml={setXmlPreview} />}
          {tab === "clientes" && <ClientsScreen data={data} user={session} backendToken={backendToken} getBackendToken={ensureBackendToken} persist={persist} ListItemComponent={ListItem} />}
          {tab === "productos" && <ProductsScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} BarcodeScannerModalComponent={BarcodeScannerModal} />}
          {tab === "inventario" && <InventoryScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} />}
          {tab === "caja" && <CashClosingScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
          {tab === "guias" && <GuidesScreen data={data} user={session} backendToken={backendToken} persist={persist} onXml={setXmlPreview} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
          {tab === "usuarios" && session.role === "admin" && <UsersScreen data={data} user={session} backendToken={backendToken} persist={persist} ListItemComponent={ListItem} CrudSectionComponent={CrudSection} />}
          {tab === "reportes" && <ReportsScreen data={data} onReport={setXmlPreview} ListItemComponent={ListItem} CalendarDateInputComponent={CalendarDateInput} />}
          {tab === "sri" && session.role === "admin" && <SriView data={data} user={session} backendToken={backendToken} getBackendToken={ensureBackendToken} persist={persist} onRefreshBackend={() => refreshFromBackend("manual")} />}
        </ScrollView>
      </KeyboardAvoidingView>

      <AppMenuModal
        visible={appMenuVisible}
        userLabel={session.name || roleLabel(session.role)}
        licenseLabel={compactLicenseStatusLabel(data.license)}
        canSwitchEstablishment={switchableEstablishments.length > 1}
        onClose={() => setAppMenuVisible(false)}
        onSync={() => { void runManualSync(); }}
        onOpenSyncCenter={openSyncCenter}
        onSwitchEstablishment={() => setEstablishmentSwitcherVisible(true)}
        onOpenSettings={() => openAdminSettings("configuracion")}
        onOpenLicense={() => openAdminSettings("licencia")}
        onOpenSupport={supportDiagnostics.open}
        onLogout={logout}
      />

      <SyncCenterModal
        visible={syncCenterVisible}
        data={data}
        syncState={syncState}
        syncActionLoading={syncActionLoading}
        onClose={() => setSyncCenterVisible(false)}
        onRetryPending={() => { void retryPendingSync(); }}
        onTestServer={() => { void testSyncServer(); }}
      />

      <SupportModal
        visible={supportDiagnostics.visible}
        loading={supportDiagnostics.loading}
        diagnosticText={supportDiagnostics.diagnosticText}
        onClose={supportDiagnostics.close}
        onRefresh={() => { void supportDiagnostics.refresh(); }}
        onShare={() => { void supportDiagnostics.share(); }}
      />

      <EstablishmentPickerModal
        visible={establishmentSwitcherVisible}
        title="Cambiar establecimiento"
        subtitle="Los proximos documentos usaran el punto seleccionado."
        establishments={switchableEstablishments}
        activeId={currentEstablishment.id}
        cancelLabel="Cerrar"
        cancelVariant="cancel"
        onSelect={(id: string) => { void switchActiveEstablishment(id); }}
        onCancel={() => setEstablishmentSwitcherVisible(false)}
      />

      <OnboardingModal
        visible={onboardingVisible}
        onConfigure={() => { setOnboardingVisible(false); setTab("sri"); }}
        onClose={() => setOnboardingVisible(false)}
      />

      <EstablishmentPickerModal
        visible={establishmentOptionsVisible}
        title="Elija establecimiento"
        subtitle="Seleccione con que sucursal o punto de emision va a trabajar."
        establishments={pendingLogin ? normalizedEstablishments(pendingLogin.data.issuer).filter((item) => item.active !== false) : []}
        cancelLabel="Cancelar"
        onSelect={(id: string) => { void chooseLoginEstablishment(id); }}
        onCancel={() => { setPendingLogin(null); setEstablishmentOptionsVisible(false); }}
      />

      <PasswordChangeModal
        visible={passwordChangeVisible}
        password={newPasswordForm.password}
        confirm={newPasswordForm.confirm}
        passwordVisible={newPasswordVisible}
        status={passwordChangeStatus}
        saving={changingPassword}
        onPasswordChange={(value) => setNewPasswordForm({ ...newPasswordForm, password: value })}
        onConfirmChange={(value) => setNewPasswordForm({ ...newPasswordForm, confirm: value })}
        onToggleVisible={() => setNewPasswordVisible((visible) => !visible)}
        onSubmit={() => { void submitNewPassword(); }}
      />

      <XmlPreviewModal value={xmlPreview} onClose={() => setXmlPreview("")} />
    </SafeAreaView>
  );
}
// eslint-disable-next-line complexity
function SalesView({ data, user, backendToken, persist, onXml }: { data: AppData; user: User; backendToken: string; persist: (data: AppData) => Promise<void>; onXml: (xml: string) => void }) {
  const [clientId, setClientId] = useState(data.clients[0]?.id ?? "");
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [unitGrossPrice, setUnitGrossPrice] = useState(data.products[0] ? money(data.products[0].price) : "");
  const [grossDiscount, setGrossDiscount] = useState("0");
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [documentType, setDocumentType] = useState<DocumentType>("factura");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("01");
  const [items, setItems] = useState<SaleItem[]>([]);
  const [editingSaleId, setEditingSaleId] = useState("");
  const [sourceTicketId, setSourceTicketId] = useState("");
  const [sourceProformaId, setSourceProformaId] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [retryingSaleId, setRetryingSaleId] = useState("");
  const [notice, setNotice] = useState("");
  const [issueNotice, setIssueNotice] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [saleScannerVisible, setSaleScannerVisible] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [lineEditForm, setLineEditForm] = useState({
    quantity: "1",
    unitGrossPrice: "0",
    grossDiscount: "0",
    discountMode: "amount" as "amount" | "percent"
  });
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODAS");
  const [saleStartDate, setSaleStartDate] = useState("");
  const [saleEndDate, setSaleEndDate] = useState("");
  const [visibleClientCount, setVisibleClientCount] = useState(LIST_BATCH_SIZE);
  const [visibleProductCount, setVisibleProductCount] = useState(LIST_BATCH_SIZE);
  const [visibleSaleCount, setVisibleSaleCount] = useState(LIST_BATCH_SIZE);
  const [remoteClientResults, setRemoteClientResults] = useState<{ items: Client[]; total: number } | null>(null);
  const [remoteProductResults, setRemoteProductResults] = useState<{ items: Product[]; total: number } | null>(null);
  const [selectedRemoteClient, setSelectedRemoteClient] = useState<Client | null>(null);
  const [creditNoteSourceId, setCreditNoteSourceId] = useState("");
  const [creditNoteReason, setCreditNoteReason] = useState("Devolucion parcial");
  const [creditNoteQuantities, setCreditNoteQuantities] = useState<Record<string, string>>({});
  const [issuingCreditNote, setIssuingCreditNote] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [retentionSaleId, setRetentionSaleId] = useState("");
  const [retentionTaxType, setRetentionTaxType] = useState<RetentionTaxType>("IVA");
  const [retentionBase, setRetentionBase] = useState("");
  const [retentionPercentage, setRetentionPercentage] = useState("");
  const [retentionAmount, setRetentionAmount] = useState("");
  const [retentionDocumentNumber, setRetentionDocumentNumber] = useState("");
  const [retentionAuthorizationNumber, setRetentionAuthorizationNumber] = useState("");
  const [retentionReceivedAt, setRetentionReceivedAt] = useState(toInputDate(new Date()));
  const [retentionNotes, setRetentionNotes] = useState("");
  const [quickClientVisible, setQuickClientVisible] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState({
    name: "",
    identification: "",
    email: "",
    phone: "",
    address: "",
    identificationType: "05" as Client["identificationType"]
  });

  const totals = useMemo(() => calculateTotals(items), [items]);
  const saleSummaryTotals = useMemo(() => ({
    ...calculateTotals(items),
    discount: calculateTotalDiscount(items)
  }), [items]);
  const editingSale = useMemo(() => data.sales.find((sale) => sale.id === editingSaleId), [data.sales, editingSaleId]);
  const sourceTicket = useMemo(() => data.sales.find((sale) => sale.id === sourceTicketId), [data.sales, sourceTicketId]);
  const sourceProforma = useMemo(() => data.sales.find((sale) => sale.id === sourceProformaId), [data.sales, sourceProformaId]);
  const creditNoteSource = useMemo(() => data.sales.find((sale) => sale.id === creditNoteSourceId), [creditNoteSourceId, data.sales]);
  const creditNoteClient = useMemo(() => data.clients.find((client) => client.id === creditNoteSource?.clientId), [creditNoteSource, data.clients]);
  const retentionSale = useMemo(() => data.sales.find((sale) => sale.id === retentionSaleId), [data.sales, retentionSaleId]);
  const retentionClient = useMemo(() => data.clients.find((client) => client.id === retentionSale?.clientId), [retentionSale, data.clients]);
  const selectedProduct = useMemo(() => data.products.find((item) => item.id === productId), [data.products, productId]);
  const clientsForSale = useMemo(() => data.clients.map((client) => isConsumerFinalClient(client) ? canonicalConsumerFinalClient(client) : client), [data.clients]);
  const selectedClient = useMemo(() => {
    if (selectedRemoteClient?.id === clientId) return selectedRemoteClient;
    const remoteClient = remoteClientResults?.items.find((item) => item.id === clientId);
    if (remoteClient) return remoteClient;
    const localClient = clientsForSale.find((item) => item.id === clientId);
    if (localClient) return localClient;
    return undefined;
  }, [clientId, clientsForSale, remoteClientResults, selectedRemoteClient]);
  const localFilteredClientsForSale = useMemo(() => {
    const search = clientSearch.trim().toLowerCase();
    if (!search) return clientsForSale;
    return clientsForSale.filter((client) => client.name.toLowerCase().includes(search) || client.identification.includes(search));
  }, [clientSearch, clientsForSale]);
  const localFilteredProductsForSale = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return data.products;
    return data.products.filter((product) => product.name.toLowerCase().includes(search) || product.code.toLowerCase().includes(search));
  }, [data.products, productSearch]);
  const filteredClientsForSale = remoteClientResults?.items ?? localFilteredClientsForSale;
  const filteredProductsForSale = remoteProductResults?.items ?? localFilteredProductsForSale;
  const filteredClientCount = remoteClientResults?.total ?? localFilteredClientsForSale.length;
  const filteredProductCount = remoteProductResults?.total ?? localFilteredProductsForSale.length;
  const visibleClientsForSale = filteredClientsForSale.slice(0, visibleClientCount);
  const visibleProductsForSale = filteredProductsForSale.slice(0, visibleProductCount);

  useEffect(() => {
    setUnitGrossPrice(selectedProduct ? money(selectedProduct.price) : "");
    setGrossDiscount("0");
    setDiscountMode("amount");
  }, [productId, selectedProduct]);

  useEffect(() => {
    setVisibleClientCount(LIST_BATCH_SIZE);
  }, [clientSearch]);

  useEffect(() => {
    setVisibleProductCount(LIST_BATCH_SIZE);
  }, [productSearch]);

  useEffect(() => {
    const search = clientSearch.trim();
    if (!backendToken || !data.backendUrl || search.length < 2) {
      setRemoteClientResults(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      searchBackendClients<Client>(data.backendUrl, backendToken, { search, limit: visibleClientCount, offset: 0 })
        .then((result) => {
          const normalizedSearch = search.toLowerCase();
          const items = result.items
            .map((client) => isConsumerFinalClient(client) ? canonicalConsumerFinalClient(client) : client)
            .filter((client) => client.name.toLowerCase().includes(normalizedSearch) || client.identification.includes(normalizedSearch));
          const total = items.length < result.items.length ? items.length : result.total;
          if (!cancelled) setRemoteClientResults({ items, total });
        })
        .catch(() => {
          if (!cancelled) setRemoteClientResults(null);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [backendToken, clientSearch, data.backendUrl, visibleClientCount]);

  useEffect(() => {
    const search = productSearch.trim();
    if (!backendToken || !data.backendUrl || search.length < 2) {
      setRemoteProductResults(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      searchBackendProducts<Product>(data.backendUrl, backendToken, { search, limit: visibleProductCount, offset: 0 })
        .then((result) => {
          if (!cancelled) setRemoteProductResults({ items: result.items, total: result.total });
        })
        .catch(() => {
          if (!cancelled) setRemoteProductResults(null);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [backendToken, data.backendUrl, productSearch, visibleProductCount]);

  useEffect(() => {
    if (filteredClientsForSale.length === 0) return;
    if (filteredClientsForSale.some((client) => client.id === clientId)) return;
    const nextClient = filteredClientsForSale[0];
    setClientId(nextClient?.id || "");
    setSelectedRemoteClient(nextClient || null);
  }, [clientId, filteredClientsForSale]);

  useEffect(() => {
    if (filteredProductsForSale.length === 0) return;
    if (filteredProductsForSale.some((product) => product.id === productId)) return;
    setProductId(filteredProductsForSale[0]?.id || "");
  }, [filteredProductsForSale, productId]);

  const scopedSales = useMemo(() => data.sales.filter((sale) => saleInActiveScope(sale, data)), [data]);
  const filteredSales = useMemo(() => {
    const search = invoiceSearch.trim().toLowerCase();
    const startBoundary = saleStartDate.trim() ? parseInputDate(saleStartDate, "start") : null;
    const endBoundary = saleEndDate.trim() ? parseInputDate(saleEndDate, "end") : null;

    return scopedSales.filter((sale) => {
      const client = data.clients.find((item) => item.id === sale.clientId);
      const convertedDocument = sale.status === "ANULADA" && Boolean(sale.voidReason?.toLowerCase().includes("convertida a"));
      const matchesStatus =
        statusFilter === "TODAS" ||
        sale.status === statusFilter ||
        (statusFilter === "FIRMADA" && sale.status === "PENDIENTE_SRI") ||
        (statusFilter === "ENVIADA" && sale.status === "ENVIADA_SRI") ||
        (statusFilter === "NOTA_CREDITO" && isCreditNoteSale(sale));
      const saleDate = new Date(sale.createdAt);
      const matchesStartDate = !saleStartDate.trim() || (startBoundary && !Number.isNaN(saleDate.getTime()) && saleDate >= startBoundary);
      const matchesEndDate = !saleEndDate.trim() || (endBoundary && !Number.isNaN(saleDate.getTime()) && saleDate <= endBoundary);
      const documentLabel = documentTypeLabel(sale);
      const matchesSearch =
        !search ||
        sale.sequence.toLowerCase().includes(search) ||
        sale.accessKey.toLowerCase().includes(search) ||
        sale.authorizationNumber?.toLowerCase().includes(search) ||
        documentLabel.toLowerCase().includes(search) ||
        client?.name.toLowerCase().includes(search) ||
        client?.identification.toLowerCase().includes(search);

      const hiddenConvertedInNormalView = statusFilter === "TODAS" && !search && convertedDocument;
      return !hiddenConvertedInNormalView && matchesStatus && matchesStartDate && matchesEndDate && matchesSearch;
    }).sort(compareSalesNewestFirst);
  }, [data.clients, invoiceSearch, saleEndDate, saleStartDate, scopedSales, statusFilter]);
  const visibleSales = filteredSales.slice(0, visibleSaleCount);

  useEffect(() => {
    setVisibleSaleCount(LIST_BATCH_SIZE);
  }, [invoiceSearch, saleEndDate, saleStartDate, statusFilter]);

  const setSalesDateRangeToday = () => {
    const today = toInputDate(new Date());
    setSaleStartDate(today);
    setSaleEndDate(today);
  };

  const setSalesDateRangeMonth = () => {
    const now = new Date();
    setSaleStartDate(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setSaleEndDate(toInputDate(now));
  };

  const clearSalesDateRange = () => {
    setSaleStartDate("");
    setSaleEndDate("");
  };

  const invoiceStats = useMemo(() => {
    const authorized = scopedSales.filter((sale) => isInvoiceSale(sale) && sale.status === "AUTORIZADA");
    const rejected = scopedSales.filter((sale) => isSriRejected(sale.status));
    const internal = scopedSales.filter((sale) => sale.documentType === "nota_venta");
    const creditNotes = scopedSales.filter((sale) => sale.documentType === "nota_credito" && sale.status === "AUTORIZADA");
    const proformas = scopedSales.filter((sale) => sale.documentType === "proforma" && sale.status === "PROFORMA");
    const totalAuthorized = authorized.reduce((sum, sale) => sum + sale.total, 0) - creditNotes.reduce((sum, sale) => sum + sale.total, 0);
    const retentionTotal = (data.receivedRetentions || []).reduce((sum, retention) => sum + retention.amount, 0);

    return {
      count: scopedSales.length,
      authorized: authorized.length,
      internal: internal.length,
      creditNotes: creditNotes.length,
      proformas: proformas.length,
      rejected: rejected.length,
      totalAuthorized,
      retentionTotal
    };
  }, [data.receivedRetentions, scopedSales]);
  const creditNotePreviewItems = useMemo(() => {
    if (!creditNoteSource) return [];
    return buildCreditNoteItemsFromQuantities(creditNoteSource, data.sales, creditNoteQuantities);
  }, [creditNoteQuantities, creditNoteSource, data.sales]);
  const creditNotePreviewTotals = useMemo(() => calculateTotals(creditNotePreviewItems), [creditNotePreviewItems]);
  const selectedProductProjectedStock = selectedProduct ? selectedProduct.stock - Math.max(0, parseDecimal(quantity) || 0) : 0;
  const selectedProductLowStock = Boolean(selectedProduct && selectedProductProjectedStock <= productMinStock(selectedProduct));

  const selectProductForSale = (nextProductId: string) => {
    const nextProduct = data.products.find((item) => item.id === nextProductId);
    setProductId(nextProductId);
    setUnitGrossPrice(nextProduct ? money(nextProduct.price) : "");
    setGrossDiscount("0");
    setDiscountMode("amount");
    setQuantity("1");
    setIssueNotice("");
  };

  const selectClientForSale = (nextClientId: string, nextClient?: Client) => {
    const resolvedClient = nextClient || filteredClientsForSale.find((client) => client.id === nextClientId) || clientsForSale.find((client) => client.id === nextClientId);
    setClientId(nextClientId);
    setSelectedRemoteClient(resolvedClient ? (isConsumerFinalClient(resolvedClient) ? canonicalConsumerFinalClient(resolvedClient) : resolvedClient) : null);
    setIssueNotice("");
  };

  const addProductToSale = (product: Product | undefined, qty: number, grossPrice: number, discountValue: number, mode: "amount" | "percent") => {
    setIssueNotice("");
    if (!product || !qty || qty <= 0 || !grossPrice || grossPrice <= 0) {
      Alert.alert("Producto requerido", "Seleccione un producto, cantidad valida y precio publico mayor a cero.");
      return;
    }
    if (mode === "percent" && discountValue > 100) {
      Alert.alert("Descuento invalido", "El porcentaje de descuento no puede ser mayor a 100%.");
      return;
    }
    const discountGrossValue = mode === "percent" ? grossPrice * qty * discountValue / 100 : discountValue;
    const activeDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
    if (activeDocumentType !== "proforma") {
      const quantityInCart = items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
      const availableStock = getAvailableStockForSale(product, editingSale || sourceTicket);
      if (availableStock < quantityInCart + qty) {
        Alert.alert("Stock insuficiente", `Disponible: ${availableStock}. En esta venta ya tiene ${quantityInCart}.`);
        return;
      }
    }
    const unitPrice = grossToNetUnitPrice(grossPrice, product.ivaRate);
    const discount = grossToNetUnitPrice(discountGrossValue, product.ivaRate);
    const lineBaseBeforeDiscount = qty * unitPrice;
    if (discount > lineBaseBeforeDiscount) {
      Alert.alert("Descuento invalido", "El descuento no puede ser mayor al valor del producto.");
      return;
    }
    setItems((current) => [
      ...current,
      {
        productId: product.id,
        code: product.code,
        name: product.name,
        quantity: qty,
        unitPrice,
        cost: productCost(product),
        discount,
        ivaRate: product.ivaRate
      }
    ]);
    setQuantity("1");
    setGrossDiscount("0");
    setDiscountMode("amount");
    setUnitGrossPrice(money(product.price));
    setProductSearch("");
    setIssueNotice(`Agregado: ${product.name} x${formatQuantity(qty)} | Total $${money(calculateLineTotal({ productId: product.id, code: product.code, name: product.name, quantity: qty, unitPrice, cost: productCost(product), discount, ivaRate: product.ivaRate }))}. Listo para escanear el siguiente producto.`);
  };

  const addItem = () => {
    const product = data.products.find((item) => item.id === productId);
    addProductToSale(product, parseDecimal(quantity), parseDecimal(unitGrossPrice), Math.max(0, parseDecimal(grossDiscount) || 0), discountMode);
  };

  const addScannedCodeToSale = (rawCode: string) => {
    const code = normalizeProductCode(rawCode);
    if (!code) {
      Alert.alert("Codigo requerido", "Escanee o ingrese el codigo de barras.");
      return;
    }
    const product = data.products.find((item) => normalizeProductCode(item.code) === code);
    if (!product) {
      Alert.alert("Producto no encontrado", `No existe producto con codigo ${code}. Primero guardelo en Productos.`);
      return;
    }
    setProductId(product.id);
    setProductSearch("");
    addProductToSale(product, 1, product.price, 0, "amount");
  };

  const addProductSearchSubmit = () => {
    const raw = productSearch.trim();
    if (!raw) {
      Alert.alert("Producto requerido", "Escriba o escanee un codigo, o busque por descripcion.");
      return;
    }
    const exactProduct = data.products.find((item) => normalizeProductCode(item.code) === normalizeProductCode(raw));
    if (exactProduct) {
      addScannedCodeToSale(raw);
      return;
    }
    if (selectedProduct) {
      addItem();
      return;
    }
    Alert.alert("Producto no encontrado", "No se encontro un producto con ese codigo o descripcion.");
  };

  const openQuickClientEditor = () => {
    if (!selectedClient) {
      Alert.alert("Cliente requerido", "Seleccione un cliente para editarlo.");
      return;
    }
    if (isConsumerFinalClient(selectedClient)) {
      Alert.alert("Consumidor Final protegido", "Este cliente fiscal no se edita. Seleccione o cree el cliente real con su cedula/RUC.");
      return;
    }
    setQuickClientForm({
      name: selectedClient.name,
      identification: selectedClient.identification,
      email: selectedClient.email,
      phone: selectedClient.phone || "",
      address: selectedClient.address,
      identificationType: selectedClient.identificationType
    });
    setQuickClientVisible(true);
  };

  const saveQuickClient = async () => {
    if (!selectedClient) return;
    if (isConsumerFinalClient(selectedClient)) {
      Alert.alert("Consumidor Final protegido", "Este cliente fiscal no se puede modificar.");
      return;
    }
    const clientData = {
      ...quickClientForm,
      name: quickClientForm.name.trim(),
      identification: normalizeClientIdentification(quickClientForm.identification),
      email: quickClientForm.email.trim(),
      phone: quickClientForm.phone.trim(),
      address: quickClientForm.address.trim(),
      updatedAt: new Date().toISOString()
    };
    if (!clientData.name || !clientData.identification) {
      Alert.alert("Datos incompletos", "Ingrese nombre e identificacion del cliente.");
      return;
    }// Verificar duplicados por identificacion, ignorando el cliente que se esta editando
    const duplicate = findDuplicateClient(data.clients, clientData.identification, selectedClient.id);
    if (duplicate) {
      Alert.alert("Cliente duplicado", `Ya existe un cliente con esa identificacion: ${duplicate.name}.`);
      return;
    }
    const updatedClient = { ...selectedClient, ...clientData };
    const existingClient = data.clients.some((client) => client.id === selectedClient.id);
    const nextClients = existingClient
      ? data.clients.map((client) => client.id === selectedClient.id ? updatedClient : client)
      : [updatedClient, ...data.clients];
    const nextData = appendAudit({
      ...data,
      clients: nextClients
    }, user, "CLIENT_UPDATED_FROM_SALE", "client", selectedClient.id, `Cliente actualizado desde venta: ${updatedClient.name}`);

    setClientId(updatedClient.id);
    setSelectedRemoteClient(updatedClient);
    setRemoteClientResults((current) => current ? {
      ...current,
      items: current.items.some((client) => client.id === updatedClient.id)
        ? current.items.map((client) => client.id === updatedClient.id ? updatedClient : client)
        : [updatedClient, ...current.items]
    } : current);
    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, clients: [updatedClient], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente pendiente de sincronizar", nextData, persist);
    setQuickClientVisible(false);
    setIssueNotice("Cliente actualizado. Puede continuar con la venta.");
    showMessage("Cliente actualizado", "Datos corregidos. Puede continuar sin perder el detalle de la venta.");
  };

  const openLineEditor = (index: number) => {
    const item = items[index];
    if (!item) return;
    setEditingLineIndex(index);
    setLineEditForm({
      quantity: formatQuantity(item.quantity),
      unitGrossPrice: money(calculateGrossUnitPrice(item)),
      grossDiscount: money(calculateLineGrossDiscount(item)),
      discountMode: "amount"
    });
  };

  const closeLineEditor = () => {
    setEditingLineIndex(null);
    setLineEditForm({ quantity: "1", unitGrossPrice: "0", grossDiscount: "0", discountMode: "amount" });
  };

  const saveLineEdit = (draft = lineEditForm) => {
    if (editingLineIndex === null) return;
    const currentItem = items[editingLineIndex];
    if (!currentItem) return;
    const product = data.products.find((item) => item.id === currentItem.productId);
    const qty = parseDecimal(draft.quantity);
    const grossPrice = parseDecimal(draft.unitGrossPrice);
    const discountValue = Math.max(0, parseDecimal(draft.grossDiscount) || 0);
    if (!product || !qty || qty <= 0 || !grossPrice || grossPrice <= 0) {
      Alert.alert("Linea incompleta", "Ingrese cantidad y precio validos.");
      return;
    }
    if (draft.discountMode === "percent" && discountValue > 100) {
      Alert.alert("Descuento invalido", "El porcentaje de descuento no puede ser mayor a 100%.");
      return;
    }
    const activeDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
    if (activeDocumentType !== "proforma") {
      const quantityInOtherLines = items.reduce((sum, item, index) => index !== editingLineIndex && item.productId === product.id ? sum + item.quantity : sum, 0);
      const availableStock = getAvailableStockForSale(product, editingSale || sourceTicket);
      if (availableStock < quantityInOtherLines + qty) {
        Alert.alert("Stock insuficiente", `Disponible: ${availableStock}. En otras lineas ya tiene ${quantityInOtherLines}.`);
        return;
      }
    }
    const discountGrossValue = draft.discountMode === "percent" ? grossPrice * qty * discountValue / 100 : discountValue;
    const unitPrice = grossToNetUnitPrice(grossPrice, currentItem.ivaRate);
    const discount = grossToNetUnitPrice(discountGrossValue, currentItem.ivaRate);
    if (discount > qty * unitPrice) {
      Alert.alert("Descuento invalido", "El descuento no puede ser mayor al valor del producto.");
      return;
    }
    setItems((current) => current.map((item, index) => index === editingLineIndex ? { ...item, quantity: qty, unitPrice, discount } : item));
    closeLineEditor();
    setIssueNotice("Detalle actualizado.");
  };

  const adjustSaleLineQuantity = (index: number, amount: number) => {
    const item = items[index];
    if (!item) return;
    const nextQuantity = Math.max(1, item.quantity + amount);
    if (nextQuantity === item.quantity) return;

    const activeDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
    if (amount > 0 && activeDocumentType !== "proforma") {
      const product = data.products.find((productItem) => productItem.id === item.productId);
      const quantityInOtherLines = items.reduce((sum, currentItem, itemIndex) => itemIndex !== index && currentItem.productId === item.productId ? sum + currentItem.quantity : sum, 0);
      const availableStock = product ? getAvailableStockForSale(product, editingSale || sourceTicket) : 0;
      if (availableStock < quantityInOtherLines + nextQuantity) {
        Alert.alert("Stock insuficiente", `Disponible: ${availableStock}. En otras lineas ya tiene ${quantityInOtherLines}.`);
        return;
      }
    }

    const ratio = item.quantity > 0 ? nextQuantity / item.quantity : 1;
    const nextDiscount = roundMoney((item.discount || 0) * ratio);
    setItems((current) => current.map((currentItem, itemIndex) => itemIndex === index ? { ...currentItem, quantity: nextQuantity, discount: nextDiscount } : currentItem));
  };

  const saveInternalSaleFromCurrentForm = async (options?: { offlineFallback?: boolean }) => {
    const createdAt = editingSale?.createdAt || new Date().toISOString();
    const savedAt = new Date().toISOString();
    const documentIssuer = activeIssuer(data);
    const documentEstablishment = activeEstablishment(data.issuer);
    const legacyScopeId = normalizedEstablishments(data.issuer)[0]?.id || documentEstablishment.id;
    const sequence = editingSale?.sequence || nextInternalSequence(data.sales, documentEstablishment.id, legacyScopeId);
    const sale: Sale = {
      id: editingSale?.id || uid(),
      documentType: "nota_venta",
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint,
      establishmentName: documentEstablishment.name,
      clientId,
      userId: editingSale?.userId || user.id,
      createdAt,
      sequence,
      accessKey: "",
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      paymentMethod,
      status: "TICKET_OFFLINE",
      items
    };
    const restoredProducts = editingSale && saleStatusReducesStock(editingSale.status) ? restoreSaleStock(data.products, editingSale) : data.products;
    const restoreMovements = editingSale && saleStatusReducesStock(editingSale.status) ? buildStockMovements(data.products, editingSale, "entrada", "Reverso por correccion de nota de venta", user.id, savedAt, uid) : [];
    const saleMovements: InventoryMovement[] = [];
    const saleStockChanges = new Map<string, number>();
    items.forEach((item) => {
      saleStockChanges.set(item.productId, (saleStockChanges.get(item.productId) || 0) + item.quantity);
    });
    const nextProducts = restoredProducts.map((product) => {
      const quantity = saleStockChanges.get(product.id) || 0;
      if (quantity <= 0) return product;
      const stockAfter = product.stock - quantity;
      saleMovements.push({
        id: uid(),
        productId: product.id,
        productName: product.name,
        type: "salida",
        quantity,
        stockBefore: product.stock,
        stockAfter,
        reason: options?.offlineFallback ? "Ticket guardado sin internet" : editingSale ? "Nota de venta corregida" : "Nota de venta interna",
        reference: sequence,
        userId: user.id,
        createdAt: savedAt
      });
      return { ...product, stock: stockAfter, updatedAt: createdAt };
    });

    const nextSales = editingSale
      ? data.sales.map((item) => (item.id === editingSale.id ? sale : item))
      : sourceProforma
        ? [sale, ...data.sales.map((item) => item.id === sourceProforma.id ? { ...item, status: "ANULADA" as const, voidReason: `Convertida a ticket ${sale.sequence}`, voidedAt: savedAt, sriMessage: `Convertida a ticket ${sale.sequence}` } : item)]
        : [sale, ...data.sales];
    const nextData = appendAudit({
      ...data,
      products: nextProducts,
      inventoryMovements: [...restoreMovements, ...saleMovements, ...(data.inventoryMovements || [])],
      sales: nextSales
    }, user, editingSale ? "INTERNAL_SALE_UPDATED" : "INTERNAL_SALE_CREATED", "sale", sale.id, `${options?.offlineFallback ? "Ticket offline creado" : editingSale ? "Nota de venta actualizada" : "Nota de venta creada"}: ${sale.sequence}`, { total: sale.total });

    await persist(nextData);
    await syncSalePatchToBackend(data.backendUrl, backendToken, {
      baseData: data,
      sales: nextSales.filter((item) => [sale.id, sourceProforma?.id].filter(Boolean).includes(item.id)),
      products: nextProducts.filter((product) => saleStockChanges.has(product.id)),
      inventoryMovements: [...restoreMovements, ...saleMovements],
      auditLogs: nextData.auditLogs.slice(0, 1)
    }, nextData, persist);
    setItems([]);
    setEditingSaleId("");
    setSourceTicketId("");
    setSourceProformaId("");
    setDocumentType("factura");
    const message = options?.offlineFallback
      ? "Se guardo como ticket interno. Cuando vuelva internet, abra el ticket y use Facturar."
      : "La nota de venta se registro como movimiento interno.";
    setIssueNotice(message);
    showMessage(options?.offlineFallback ? "Venta guardada sin internet" : "Nota guardada", message);
  };

  const issue = async () => {
    setIssueNotice("");
    const client = selectedClient;
    if (!client || items.length === 0) {
      showMessage("Documento incompleto", "Seleccione cliente y agregue al menos un producto.");
      return;
    }
    const currentDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
    const stockCredits = buildStockCredits(editingSale || sourceTicket);

    if (currentDocumentType === "proforma") {
      const validationErrors = validateBeforeProforma(data, items, totals);
      if (validationErrors.length > 0) {
        const message = validationErrors.map((error) => `- ${error}`).join("\n");
        setIssueNotice(message);
        showMessage("Revise antes de guardar", message);
        return;
      }

      const createdAt = editingSale?.createdAt || new Date().toISOString();
      const documentIssuer = activeIssuer(data);
      const documentEstablishment = activeEstablishment(data.issuer);
      const legacyScopeId = normalizedEstablishments(data.issuer)[0]?.id || documentEstablishment.id;
      const sequence = editingSale?.sequence || nextProformaSequence(data.sales, documentEstablishment.id, legacyScopeId);
      const sale: Sale = {
        id: editingSale?.id || uid(),
        documentType: "proforma",
        establishment: documentIssuer.establishment,
        emissionPoint: documentIssuer.emissionPoint,
        establishmentName: documentEstablishment.name,
        clientId,
        userId: editingSale?.userId || user.id,
        createdAt,
        sequence,
        accessKey: "",
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        paymentMethod,
        status: "PROFORMA",
        items
      };

      await persist(appendAudit({
        ...data,
        sales: editingSale ? data.sales.map((item) => (item.id === editingSale.id ? sale : item)) : [sale, ...data.sales]
      }, user, editingSale ? "PROFORMA_UPDATED" : "PROFORMA_CREATED", "sale", sale.id, `${editingSale ? "Proforma actualizada" : "Proforma creada"}: ${sale.sequence}`, { total: sale.total }));
      setItems([]);
      setEditingSaleId("");
      setSourceTicketId("");
      setSourceProformaId("");
      setDocumentType("factura");
      setIssueNotice("Proforma guardada. No descuenta inventario hasta convertirse.");
      showMessage("Proforma guardada", "La proforma quedo registrada como cotizacion.");
      return;
    }

    if (currentDocumentType === "nota_venta") {
      const validationErrors = validateBeforeInternalSale(data, items, totals, stockCredits);
      if (validationErrors.length > 0) {
        const message = validationErrors.map((error) => `- ${error}`).join("\n");
        setIssueNotice(message);
        showMessage("Revise antes de guardar", message);
        return;
      }

      await saveInternalSaleFromCurrentForm();
      return;
    }

    const invoiceClient = normalizeClientForInvoice(client);
    if (editingSale && getRetryInfo(editingSale).today >= MAX_DAILY_RETRIES) {
      const message = `Esta factura ya tiene ${MAX_DAILY_RETRIES} reintento(s) hoy. Corrija y vuelva a intentar manana.`;
      setIssueNotice(message);
      showMessage("Limite diario de reintentos", message);
      return;
    }

    const documentIssuer = activeIssuer(data);
    const documentEstablishment = activeEstablishment(data.issuer);
    const dataForDocument = { ...data, issuer: documentIssuer };
    const validationErrors = validateBeforeIssue(dataForDocument, invoiceClient, items, totals, stockCredits);
    validateEmissionPointLicense(data, documentIssuer, validationErrors);
    if (validationErrors.length > 0) {
      const message = validationErrors.map((error) => `- ${error}`).join("\n");
      setIssueNotice(message);
      showMessage("Revise antes de emitir", message);
      return;
    }
    const createdAt = editingSale?.createdAt || new Date().toISOString();
    let sequence = editingSale?.sequence || nextSequence(documentIssuer.sequential);
    let accessKey = editingSale?.accessKey || createAccessKey(new Date(createdAt), documentIssuer, sequence);
    let reservedByBackend = false;
    if (!editingSale) {
      try {
        setProcessingMessage("Preparando numero de factura...");
        const reserved = await reserveDocumentSequence(data.backendUrl, { documentType: "factura", issuer: documentIssuer, createdAt }, backendToken);
        if (Number(reserved.sequence) < Number(sequence)) {
          throw new Error(`El servidor devolvio el secuencial ${reserved.sequence}, menor al configurado ${sequence}. Guarde SRI y sincronice antes de emitir.`);
        }
        sequence = reserved.sequence || sequence;
        accessKey = reserved.accessKey || accessKey;
        reservedByBackend = true;
      } catch (error) {
        const message = userFriendlyActionError(error, "reserve-sequence");
        setIssueNotice(message);
        Alert.alert("Factura electronica requiere internet", `${message}\n\nPara emitir una factura electronica debe tener conexion a internet. Puede guardar esta venta como ticket interno y facturarla cuando vuelva la conexion.`, [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Guardar ticket",
            onPress: () => {
              void saveInternalSaleFromCurrentForm({ offlineFallback: true });
            }
          }
        ]);
        setProcessingMessage("");
        return;
      }
    }
    const retryAt = new Date().toISOString();
    const sale: Sale = {
      id: editingSale?.id || uid(),
      documentType: "factura",
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint,
      establishmentName: documentEstablishment.name,
      clientId,
      userId: editingSale?.userId || user.id,
      createdAt,
      sequence,
      accessKey,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      paymentMethod,
      status: "BORRADOR" as const,
      items,
      retryHistory: editingSale ? [...(editingSale.retryHistory || []), retryAt] : undefined
    };
    const saleForRetry: Sale = { ...sale, paymentMethod: sale.paymentMethod || "01" };
    if (!editingSale && isAccessKeyUsed(data, saleForRetry.accessKey)) {
      const message = `La clave de acceso ${saleForRetry.accessKey} ya existe en otro comprobante. Revise el secuencial antes de emitir.`;
      setIssueNotice(message);
      showMessage("Clave duplicada", message);
      return;
    }
    const unsignedXml = buildInvoiceXml(saleForRetry, invoiceClient, documentIssuer);
    setIssuing(true);
    setProcessingMessage(sourceTicket ? "Emitiendo factura desde ticket..." : sourceProforma ? "Emitiendo factura desde proforma..." : editingSale ? "Guardando correccion y reintentando emision..." : "Emitiendo factura...");
    setIssueNotice(sourceTicket ? "Emitiendo factura desde ticket..." : sourceProforma ? "Emitiendo factura desde proforma..." : editingSale ? "Guardando correccion y reintentando emision..." : "Guardando y emitiendo factura...");
    const restoredProducts = editingSale && saleStatusReducesStock(editingSale.status) ? restoreSaleStock(data.products, editingSale) : data.products;
    const restoreMovements = editingSale && saleStatusReducesStock(editingSale.status) ? buildStockMovements(data.products, editingSale, "entrada", "Reverso por correccion de factura", user.id, retryAt, uid) : [];
    const savedDraftData: AppData = {
      ...data,
      issuer: editingSale ? data.issuer : updateIssuerEstablishmentSequence(data.issuer, documentEstablishment.id, "sequential", Math.max(documentIssuer.sequential + 1, Number(sequence) + 1)),
      products: restoredProducts,
      inventoryMovements: [...restoreMovements, ...(data.inventoryMovements || [])],
      sales: editingSale ? data.sales.map((item) => (item.id === editingSale.id ? saleForRetry : item)) : [saleForRetry, ...data.sales]
    };
    await persist(savedDraftData);

    let finalSale: Sale = saleForRetry;

    try {
      const sriResult = await authorizeInvoice(data.backendUrl, unsignedXml, backendToken);
      finalSale = {
        ...saleForRetry,
        accessKey: sriResult.accessKey || sale.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult)
      };
      if (finalSale.status !== "AUTORIZADA") {
        const message = sriUserMessage(sriResult) || "El SRI recibio el comprobante, pero aun no devolvio autorizacion. Revise el documento y use Reintentar si queda pendiente.";
        setIssueNotice(message);
        showMessage("Factura no autorizada", message);
      }
    } catch (error) {
      const message = userFriendlyActionError(error, "authorize-invoice");
      finalSale = {
        ...sale,
        status: "ERROR_SRI",
        sriMessage: message
      };
      setIssueNotice(message);
      showMessage("No se pudo firmar", message);
    }

    const shouldMoveStock = !sourceTicket && !isSriRejected(finalSale.status) && finalSale.status !== "ANULADA";
    const saleStockChanges = new Map<string, number>();
    if (shouldMoveStock) {
      items.forEach((item) => {
        saleStockChanges.set(item.productId, (saleStockChanges.get(item.productId) || 0) + item.quantity);
      });
    }
    const stockChangedProductIds = new Set<string>([
      ...Array.from(saleStockChanges.keys()),
      ...(editingSale?.items || []).map((item) => item.productId)
    ]);
    const saleMovements: InventoryMovement[] = [];
    const nextProducts = savedDraftData.products.map((product) => {
      const quantity = saleStockChanges.get(product.id) || 0;
      if (quantity <= 0) return product;
      const stockAfter = product.stock - quantity;
      saleMovements.push({
        id: uid(),
        productId: product.id,
        productName: product.name,
        type: "salida",
        quantity,
        stockBefore: product.stock,
        stockAfter,
        reason: editingSale ? "Venta corregida y facturada" : "Venta facturada",
        reference: sale.sequence,
        userId: user.id,
        createdAt
      });
      return { ...product, stock: stockAfter, updatedAt: retryAt };
    });

    const finalSales = savedDraftData.sales.map((item) => {
      if (item.id === finalSale.id) return finalSale;
      if (sourceTicket && finalSale.status === "AUTORIZADA" && item.id === sourceTicket.id) {
        return {
          ...item,
          status: "ANULADA" as const,
          voidReason: `Convertida a factura ${finalSale.sequence}`,
          voidedAt: new Date().toISOString(),
          sriMessage: `Convertida a factura ${finalSale.sequence}`
        };
      }
      if (sourceProforma && finalSale.status === "AUTORIZADA" && item.id === sourceProforma.id) {
        return {
          ...item,
          status: "ANULADA" as const,
          voidReason: `Convertida a factura ${finalSale.sequence}`,
          voidedAt: new Date().toISOString(),
          sriMessage: `Convertida a factura ${finalSale.sequence}`
        };
      }
      return item;
    });
    const finalData = appendAudit({
      ...savedDraftData,
      products: nextProducts,
      inventoryMovements: [...saleMovements, ...(savedDraftData.inventoryMovements || [])],
      sales: finalSales
    }, user, editingSale ? "INVOICE_REISSUED" : "INVOICE_CREATED", "sale", finalSale.id, `Factura ${finalSale.sequence} guardada con estado ${finalSale.status}`, { total: finalSale.total, status: finalSale.status, accessKey: finalSale.accessKey, sequenceSource: reservedByBackend ? "servidor" : "local" });
    await persist(finalData);
    await syncSalePatchToBackend(data.backendUrl, backendToken, {
      baseData: data,
      issuer: finalData.issuer,
      sales: finalSales.filter((item) => [finalSale.id, sourceTicket?.id, sourceProforma?.id].filter(Boolean).includes(item.id)),
      products: finalData.products.filter((product) => stockChangedProductIds.has(product.id)),
      inventoryMovements: [...restoreMovements, ...saleMovements],
      auditLogs: finalData.auditLogs.slice(0, 1)
    }, finalData, persist);
    setItems([]);
    setEditingSaleId("");
    setSourceTicketId("");
    setSourceProformaId("");
    setIssuing(false);
    setProcessingMessage("");
    setIssueNotice(finalSale.status === "AUTORIZADA" ? "Factura autorizada y guardada." : `Factura guardada con estado ${finalSale.status}.`);
    showMessage("Factura guardada", finalSale.status === "AUTORIZADA" ? "Factura autorizada y guardada correctamente." : `Factura guardada con estado ${finalSale.status}.`);
  };

  const createRide = async (sale: Sale, client: Client) => {
    if (sale.status !== "AUTORIZADA") {
      Alert.alert("RIDE no disponible", "El RIDE se genera cuando la factura esta autorizada.");
      return;
    }

    const html = buildRideHtml(sale, client, issuerForDocument(data, sale));

    if (typeof window !== "undefined" && "document" in window) {
      openHtmlViewer(html, `RIDE ${sale.sequence}`);
      return;
    }

    await handlePdfDocument(html, `RIDE ${sale.sequence}`, "RIDE factura");
  };

  const createTicket = async (sale: Sale, client: Client) => {
    const pageHeightMm = estimateTicketPageHeightMm(sale);
    const html = buildInternalTicketHtml(sale, client, issuerForDocument(data, sale), pageHeightMm);

    if (typeof window !== "undefined" && "document" in window) {
      openHtmlViewer(html, `Ticket ${sale.sequence}`);
      return;
    }

    await handleTicketDocument(html, `Ticket ${sale.sequence}`, pageHeightMm);
  };

  const createProforma = async (sale: Sale, client: Client) => {
    const html = buildProformaHtml(sale, client, issuerForDocument(data, sale));

    if (typeof window !== "undefined" && "document" in window) {
      openHtmlViewer(html, `Proforma ${sale.sequence}`);
      return;
    }

    await handlePdfDocument(html, `Proforma ${sale.sequence}`, "Proforma");
  };

  const createCreditNoteRide = async (sale: Sale, client: Client, source?: Sale) => {
    if (sale.status !== "AUTORIZADA") {
      Alert.alert("RIDE no disponible", "La nota de credito debe estar autorizada.");
      return;
    }

    const html = buildCreditNoteRideHtml(sale, client, issuerForDocument(data, sale), source);
    if (Platform.OS === "web") {
      openHtmlViewer(html, `Nota credito ${sale.sequence}`);
      return;
    }

    await handlePdfDocument(html, `Nota credito ${sale.sequence}`, "Nota de credito");
  };

  const sendSaleEmail = async (sale: Sale, client: Client, source?: Sale, showAlerts = true) => {
    if (sale.status !== "AUTORIZADA") {
      if (showAlerts) Alert.alert("Correo no disponible", "Solo se envia cuando el documento esta autorizado.");
      return false;
    }

    if (!client.email) {
      if (showAlerts) Alert.alert("Cliente sin email", "Agregue un correo al cliente.");
      return false;
    }

    const isCreditNote = isCreditNoteSale(sale);
    const documentLabel = isCreditNote ? "nota de credito" : "factura";
    const documentTitle = isCreditNote ? "Nota de credito" : "Factura";
    const saleIssuer = issuerForDocument(data, sale);
    const documentNumber = `${saleIssuer.establishment}-${saleIssuer.emissionPoint}-${sale.sequence}`;

    try {
      setProcessingMessage(`Enviando ${documentLabel} al correo del cliente...`);
      const rideHtml = isCreditNote ? buildCreditNoteRideHtml(sale, client, saleIssuer, source) : buildRideHtml(sale, client, saleIssuer);
      const pdfBase64 = await createPdfBase64(rideHtml);
      await sendInvoiceEmail(data.backendUrl, {
        to: client.email,
        subject: `${documentTitle} ${documentNumber}`,
        html: rideHtml,
        pdfBase64,
        xml: sale.authorizedXml || sale.signedXml || (isCreditNote ? buildCreditNoteXml(sale, client, saleIssuer) : buildInvoiceXml(sale, client, saleIssuer)),
        documentType: isCreditNote ? "nota_credito" : "factura",
        documentNumber
      }, backendToken);
      const message = `La ${documentLabel} ${documentNumber} fue enviada a ${client.email} con sus documentos autorizados.`;
      await recordSaleEmailAttempt(sale, client.email, "sent");
      setNotice(message);
      if (showAlerts) {
        if (Platform.OS === "web") {
          window.alert(message);
        } else {
          Alert.alert(`${documentTitle} enviada`, message);
        }
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar el correo.";
      await recordSaleEmailAttempt(sale, client.email, "failed", message);
      if (showAlerts) Alert.alert("Correo no enviado", message);
      return false;
    } finally {
      setProcessingMessage("");
    }
  };

  const emailSale = async (sale: Sale, client: Client) => {
    await sendSaleEmail(sale, client, data.sales.find((item) => item.id === sale.sourceSaleId));
  };

  const recordSaleEmailAttempt = async (sale: Sale, to: string, status: "sent" | "failed", error = "") => {
    if (!data.sales.some((item) => item.id === sale.id)) return;
    const sentAt = new Date().toISOString();
    const updatedSale: Sale = {
      ...sale,
      emailHistory: [{ to, sentAt, status, error: error || undefined }, ...(sale.emailHistory || [])].slice(0, 20)
    };
    const nextData = appendAudit({
      ...data,
      sales: data.sales.map((item) => (item.id === sale.id ? updatedSale : item))
    }, user, status === "sent" ? "EMAIL_SENT" : "EMAIL_FAILED", "sale", sale.id, status === "sent" ? `Correo enviado a ${to}` : `Correo fallido a ${to}`, { to, error });
    await persist(nextData);
    await syncSalePatchToBackend(data.backendUrl, backendToken, {
      baseData: data,
      sales: [updatedSale],
      auditLogs: nextData.auditLogs.slice(0, 1)
    }, nextData, persist);
  };

  const whatsappSale = async (sale: Sale, client: Client) => {
    if (!client.phone) {
      Alert.alert("Cliente sin telefono", "Agregue el numero de telefono del cliente.");
      return;
    }

    const saleIssuer = issuerForDocument(data, sale);
    const html = buildRideHtml(sale, client, saleIssuer);

    if (Platform.OS === "web") {
      openHtmlViewer(html, `RIDE ${sale.sequence}`);
      return;
    }

    const file = await Print.printToFileAsync({ html, base64: false });

    if (!(await Sharing.isAvailableAsync())) {
      const phone = client.phone.replace(/\D/g, "");
      const message = [
        `Hola ${client.name},`,
        `Su factura ${saleIssuer.establishment}-${saleIssuer.emissionPoint}-${sale.sequence} fue autorizada por el SRI.`,
        `Total: $${money(sale.total)}`,
        `Autorizacion: ${sale.authorizationNumber || sale.accessKey}`
      ].join("\n");
      await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
      return;
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: "application/pdf",
      dialogTitle: "Enviar RIDE por WhatsApp",
      UTI: "com.adobe.pdf"
    });
  };

  const openCreditNoteForm = (sourceSale: Sale) => {
    const sourceClient = data.clients.find((client) => client.id === sourceSale.clientId);
    if (!isInvoiceSale(sourceSale) || sourceSale.status !== "AUTORIZADA") {
      Alert.alert("Nota de credito no disponible", "Solo se puede emitir nota de credito sobre facturas autorizadas.");
      return;
    }
    if (!sourceClient || isFinalConsumerClient(sourceClient)) {
      Alert.alert("Nota de credito no disponible", "No se puede emitir nota de credito para facturas a consumidor final. La factura debe tener datos de cliente con cedula, RUC, pasaporte o identificacion exterior.");
      return;
    }
    if (!hasCreditNoteBalance(data.sales, sourceSale)) {
      Alert.alert("Factura compensada", "Esta factura ya no tiene cantidades disponibles para nota de credito.");
      return;
    }

    const nextQuantities: Record<string, string> = {};
    sourceSale.items.forEach((item, index) => {
      nextQuantities[getCreditLineKey(item, index)] = "0";
    });
    setCreditNoteSourceId(sourceSale.id);
    setCreditNoteReason("Devolucion parcial");
    setCreditNoteQuantities(nextQuantities);
  };

  const fillCreditNoteTotal = () => {
    if (!creditNoteSource) return;
    const nextQuantities: Record<string, string> = {};
    creditNoteSource.items.forEach((item, index) => {
      const available = getCreditLineAvailable(data.sales, creditNoteSource, item, index);
      nextQuantities[getCreditLineKey(item, index)] = available > 0 ? formatQuantity(available) : "0";
    });
    setCreditNoteQuantities(nextQuantities);
  };

  const closeCreditNoteForm = () => {
    if (issuingCreditNote) return;
    setCreditNoteSourceId("");
    setCreditNoteReason("Devolucion parcial");
    setCreditNoteQuantities({});
  };

  const openRetentionForm = (sale: Sale) => {
    if (!isInvoiceSale(sale) || sale.status !== "AUTORIZADA") {
      Alert.alert("Retencion no disponible", "Solo se registran retenciones sobre facturas autorizadas.");
      return;
    }

    setRetentionSaleId(sale.id);
    setRetentionTaxType("IVA");
    setRetentionBase(money(sale.tax));
    setRetentionPercentage("");
    setRetentionAmount("");
    setRetentionDocumentNumber("");
    setRetentionAuthorizationNumber("");
    setRetentionReceivedAt(toInputDate(new Date()));
    setRetentionNotes("");
  };

  const closeRetentionForm = () => {
    setRetentionSaleId("");
  };

  const saveReceivedRetention = async () => {
    if (!retentionSale || !retentionClient) {
      Alert.alert("Retencion no disponible", "No se encontro la factura o el cliente.");
      return;
    }

    const base = roundMoney(parseDecimal(retentionBase || "0"));
    const percentage = roundMoney(parseDecimal(retentionPercentage || "0"));
    const calculatedAmount = roundMoney(base * (percentage / 100));
    const amount = roundMoney(parseDecimal(retentionAmount || String(calculatedAmount)));
    const receivedDate = parseInputDate(retentionReceivedAt, "start");

    if (!retentionDocumentNumber.trim()) {
      Alert.alert("Comprobante requerido", "Ingrese el numero del comprobante de retencion recibido.");
      return;
    }
    if (!receivedDate) {
      Alert.alert("Fecha invalida", "Ingrese la fecha en formato YYYY-MM-DD.");
      return;
    }
    if (base <= 0 || percentage <= 0 || amount <= 0) {
      Alert.alert("Valores invalidos", "Base, porcentaje y valor retenido deben ser mayores a cero.");
      return;
    }

    const retention: ReceivedRetention = {
      id: uid(),
      saleId: retentionSale.id,
      clientId: retentionClient.id,
      userId: user.id,
      createdAt: new Date().toISOString(),
      receivedAt: receivedDate.toISOString(),
      documentNumber: retentionDocumentNumber.trim(),
      authorizationNumber: retentionAuthorizationNumber.trim(),
      taxType: retentionTaxType,
      base,
      percentage,
      amount,
      notes: retentionNotes.trim()
    };

    const nextData = appendAudit({
      ...data,
      receivedRetentions: [retention, ...(data.receivedRetentions || [])]
    }, user, "RETENTION_RECEIVED_CREATED", "retention", retention.id, `Retencion recibida ${retention.taxType} $${money(retention.amount)} para factura ${retentionSale.sequence}`, { saleId: retentionSale.id, documentNumber: retention.documentNumber });
    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, {
      baseData: data,
      receivedRetentions: [retention],
      auditLogs: nextData.auditLogs.slice(0, 1)
    }, "Retencion pendiente de sincronizar", nextData, persist);

    closeRetentionForm();
    showMessage("Retencion guardada", `Se registro una retencion de ${retention.taxType} por $${money(retention.amount)}.`);
  };

  const issueCreditNote = async () => {
    const sourceSale = creditNoteSource;
    const client = creditNoteClient;
    if (!sourceSale || !client) {
      Alert.alert("Nota de credito no disponible", "No se encontro la factura o el cliente de origen.");
      return;
    }
    if (!isInvoiceSale(sourceSale) || sourceSale.status !== "AUTORIZADA") {
      Alert.alert("Nota de credito no disponible", "Solo se puede emitir nota de credito sobre facturas autorizadas.");
      return;
    }
    if (isFinalConsumerClient(client)) {
      Alert.alert("Nota de credito no disponible", "No se puede emitir nota de credito para facturas a consumidor final. La factura debe tener datos de cliente con cedula, RUC, pasaporte o identificacion exterior.");
      return;
    }

    const reason = creditNoteReason.trim();
    if (!reason) {
      Alert.alert("Motivo requerido", "Ingrese el motivo de la nota de credito.");
      return;
    }

    const validationErrors = validateCreditNoteQuantities(sourceSale, data.sales, creditNoteQuantities);
    if (validationErrors.length > 0) {
      Alert.alert("Revise cantidades", validationErrors.join("\n"));
      return;
    }

    const creditItems = buildCreditNoteItemsFromQuantities(sourceSale, data.sales, creditNoteQuantities);
    if (creditItems.length === 0) {
      Alert.alert("Seleccione productos", "Ingrese una cantidad mayor a cero en al menos un producto o servicio.");
      return;
    }

    const creditTotals = calculateTotals(creditItems);

    const createdAt = new Date().toISOString();
    const documentIssuer = issuerForSale(data.issuer, sourceSale);
    const documentEstablishment = {
      ...activeEstablishment(data.issuer),
      id: `${documentIssuer.establishment}-${documentIssuer.emissionPoint}`,
      name: sourceSale.establishmentName || `${documentIssuer.establishment}-${documentIssuer.emissionPoint}`,
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint
    };
    const licenseErrors: string[] = [];
    validateEmissionPointLicense(data, documentIssuer, licenseErrors);
    if (licenseErrors.length > 0) {
      const message = licenseErrors.join("\n");
      showMessage("Plan requerido", message);
      return;
    }
    let sequence = nextSequence(documentIssuer.creditNoteSequential || 1);
    let accessKey = createCreditNoteAccessKey(new Date(createdAt), documentIssuer, sequence);
    try {
      setProcessingMessage("Preparando numero de nota de credito...");
      const reserved = await reserveDocumentSequence(data.backendUrl, { documentType: "nota_credito", issuer: documentIssuer, createdAt }, backendToken);
      if (Number(reserved.sequence) < Number(sequence)) {
        throw new Error(`El servidor devolvio el secuencial ${reserved.sequence}, menor al configurado ${sequence}. Guarde SRI y sincronice antes de emitir.`);
      }
      sequence = reserved.sequence || sequence;
      accessKey = reserved.accessKey || accessKey;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo preparar el numero de nota de credito.";
      Alert.alert("Numero no preparado", message);
      setProcessingMessage("");
      return;
    }
    const supportDocumentNumber = `${documentIssuer.establishment}-${documentIssuer.emissionPoint}-${sourceSale.sequence}`;
    const creditNote: Sale = {
      id: uid(),
      documentType: "nota_credito",
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint,
      establishmentName: documentEstablishment.name,
      sourceSaleId: sourceSale.id,
      clientId: sourceSale.clientId,
      userId: user.id,
      createdAt,
      sequence,
      accessKey,
      subtotal: creditTotals.subtotal,
      tax: creditTotals.tax,
      total: creditTotals.total,
      paymentMethod: sourceSale.paymentMethod || "01",
      status: "BORRADOR",
      items: creditItems,
      supportDocumentType: "01",
      supportDocumentNumber,
      supportAuthorizationNumber: sourceSale.authorizationNumber || sourceSale.accessKey,
      supportIssueDate: formatSriDate(new Date(sourceSale.createdAt)),
      creditReason: reason
    };

    if (isAccessKeyUsed(data, creditNote.accessKey)) {
      Alert.alert("Clave duplicada", `La clave de acceso ${creditNote.accessKey} ya existe. Revise el secuencial de notas de credito.`);
      return;
    }

    const xml = buildCreditNoteXml(creditNote, client, documentIssuer);
    setRetryingSaleId(sourceSale.id);
    setIssuingCreditNote(true);
    setProcessingMessage("Emitiendo nota de credito...");
    const draftData: AppData = {
      ...data,
      issuer: updateIssuerEstablishmentSequence(data.issuer, documentEstablishment.id, "creditNoteSequential", Math.max((documentIssuer.creditNoteSequential || 1) + 1, Number(sequence) + 1)),
      sales: [creditNote, ...data.sales]
    };
    await persist(draftData);

    try {
      const sriResult = await authorizeInvoice(data.backendUrl, xml, backendToken);
      const finalCreditNote: Sale = {
        ...creditNote,
        accessKey: sriResult.accessKey || creditNote.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult)
      };
      const stockMovements: InventoryMovement[] = [];
      const nextProducts = finalCreditNote.status === "AUTORIZADA"
        ? data.products.map((product) => {
            const returnedQuantity = finalCreditNote.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
            if (returnedQuantity <= 0) return product;
            const stockAfter = product.stock + returnedQuantity;
            stockMovements.push({
              id: uid(),
              productId: product.id,
              productName: product.name,
              type: "entrada",
              quantity: returnedQuantity,
              stockBefore: product.stock,
              stockAfter,
              reason: `Nota de credito ${finalCreditNote.sequence}`,
              reference: sourceSale.sequence,
              userId: user.id,
              createdAt
            });
            return { ...product, stock: stockAfter, updatedAt: createdAt };
          })
        : data.products;
      const finalSales = draftData.sales.map((sale) => (sale.id === finalCreditNote.id ? finalCreditNote : sale));
      const fullyCredited = finalCreditNote.status === "AUTORIZADA" && !hasCreditNoteBalance(finalSales, sourceSale);

      const patchedSales = finalSales.map((sale) => {
        if (sale.id === finalCreditNote.id) return finalCreditNote;
        if (sale.id === sourceSale.id && fullyCredited) {
          return { ...sale, voidReason: `Compensada con nota de credito ${finalCreditNote.sequence}: ${reason}`, voidedAt: createdAt };
        }
        return sale;
      });
      const finalData = appendAudit({
        ...draftData,
        products: nextProducts,
        inventoryMovements: [...stockMovements, ...(draftData.inventoryMovements || [])],
        sales: patchedSales
      }, user, "CREDIT_NOTE_CREATED", "sale", finalCreditNote.id, `Nota de credito ${finalCreditNote.sequence} para factura ${sourceSale.sequence}: ${finalCreditNote.status}`, { sourceSaleId: sourceSale.id, total: finalCreditNote.total, status: finalCreditNote.status });
      await persist(finalData);
      await syncSalePatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        issuer: finalData.issuer,
        sales: patchedSales.filter((sale) => [finalCreditNote.id, sourceSale.id].includes(sale.id)),
        products: finalData.products.filter((product) => stockMovements.some((movement) => movement.productId === product.id)),
        inventoryMovements: stockMovements,
        auditLogs: finalData.auditLogs.slice(0, 1)
      }, finalData, persist);
      let creditNoteEmailSent = false;
      if (finalCreditNote.status === "AUTORIZADA") {
        creditNoteEmailSent = await sendSaleEmail(finalCreditNote, client, sourceSale, false);
        setCreditNoteSourceId("");
        setCreditNoteReason("Devolucion parcial");
        setCreditNoteQuantities({});
      }
      Alert.alert(explainSriResult(sriResult).title, finalCreditNote.status === "AUTORIZADA" ? `Nota de credito autorizada, stock devuelto${creditNoteEmailSent ? " y enviada al correo del cliente" : ""}.` : sriUserMessage(sriResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo emitir la nota de credito.";
      await persist(appendAudit({
        ...draftData,
        sales: draftData.sales.map((sale) => (sale.id === creditNote.id ? { ...creditNote, status: "ERROR_SRI", sriMessage: message, signedXml: xml } : sale))
      }, user, "CREDIT_NOTE_FAILED", "sale", creditNote.id, `Nota de credito ${creditNote.sequence} rechazada`, { error: message }));
      Alert.alert("Nota de credito rechazada", message);
    } finally {
      setRetryingSaleId("");
      setIssuingCreditNote(false);
      setProcessingMessage("");
    }
  };

  const retrySale = async (sale: Sale, client: Client) => {
    if (!isInvoiceSale(sale) && !isCreditNoteSale(sale)) {
      Alert.alert("Documento interno", "Este documento no se envia al SRI.");
      return;
    }
    if (sale.status === "ANULADA") {
      Alert.alert("Documento anulado", "Este documento ya fue anulado localmente y no se puede reintentar.");
      return;
    }
    const retryInfo = getRetryInfo(sale);
    if (retryInfo.today >= MAX_DAILY_RETRIES) {
      const message = `Esta factura ya tiene ${retryInfo.today} reintento(s) hoy. Revise el detalle del documento antes de volver a intentar manana.`;
      setNotice(message);
      Alert.alert("Limite diario de reintentos", message);
      return;
    }
    setRetryingSaleId(sale.id);
    setProcessingMessage(`Reintentando ${documentTypeLabel(sale).toLowerCase()}...`);
    const saleIssuer = issuerForSale(data.issuer, sale);
    const unsignedXml = isCreditNoteSale(sale) ? buildCreditNoteXml(sale, client, saleIssuer) : buildInvoiceXml(sale, client, saleIssuer);
    const retryAt = new Date().toISOString();

    try {
      const sriResult = await authorizeInvoice(data.backendUrl, unsignedXml, backendToken);
      const updatedSale: Sale = {
        ...sale,
        accessKey: sriResult.accessKey || sale.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult),
        retryHistory: [...(sale.retryHistory || []), retryAt]
      };
      const stockMovements: InventoryMovement[] = [];
      const shouldDiscountStock = isInvoiceSale(sale) && saleNeedsStockDiscount(sale.status) && !isSriRejected(updatedSale.status) && updatedSale.status !== "ANULADA";
      const shouldRestoreCreditStock = isCreditNoteSale(sale) && sale.status !== "AUTORIZADA" && updatedSale.status === "AUTORIZADA";
      const stockSourceSale = shouldRestoreCreditStock ? data.sales.find((item) => item.id === sale.sourceSaleId) : undefined;
      const nextProducts = shouldDiscountStock
        ? data.products.map((product) => {
            const soldQuantity = sale.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
            if (soldQuantity <= 0) return product;
            const stockAfter = product.stock - soldQuantity;
            stockMovements.push({
              id: uid(),
              productId: product.id,
              productName: product.name,
              type: "salida",
              quantity: soldQuantity,
              stockBefore: product.stock,
              stockAfter,
              reason: "Reenvio autorizado",
              reference: sale.sequence,
              userId: user.id,
              createdAt: retryAt
            });
            return { ...product, stock: stockAfter, updatedAt: retryAt };
          })
        : shouldRestoreCreditStock
          ? data.products.map((product) => {
              const returnedQuantity = sale.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
              if (returnedQuantity <= 0) return product;
              const stockAfter = product.stock + returnedQuantity;
              stockMovements.push({
                id: uid(),
                productId: product.id,
                productName: product.name,
                type: "entrada",
                quantity: returnedQuantity,
                stockBefore: product.stock,
                stockAfter,
                reason: `Reenvio nota de credito ${sale.sequence}`,
                reference: stockSourceSale?.sequence || sale.sequence,
                userId: user.id,
                createdAt: retryAt
              });
              return { ...product, stock: stockAfter, updatedAt: retryAt };
            })
        : data.products;

      await persist(appendAudit({
        ...data,
        products: nextProducts,
        inventoryMovements: [...stockMovements, ...(data.inventoryMovements || [])],
        sales: data.sales.map((item) => (item.id === sale.id ? updatedSale : item))
      }, user, isCreditNoteSale(sale) ? "CREDIT_NOTE_RETRIED" : "INVOICE_RETRIED", "sale", sale.id, `Reenvio de ${documentTypeLabel(sale)} ${sale.sequence}: ${updatedSale.status}`, { status: updatedSale.status, accessKey: updatedSale.accessKey }));
      Alert.alert(explainSriResult(sriResult).title, updatedSale.status === "AUTORIZADA" ? `${documentTypeLabel(sale)} autorizada.` : sriUserMessage(sriResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo reintentar el documento.";
      await persist(appendAudit({
        ...data,
        sales: data.sales.map((item) => (item.id === sale.id ? { ...item, status: "ERROR_SRI", sriMessage: message, retryHistory: [...(sale.retryHistory || []), retryAt] } : item))
      }, user, isCreditNoteSale(sale) ? "CREDIT_NOTE_RETRY_FAILED" : "INVOICE_RETRY_FAILED", "sale", sale.id, `Reenvio fallido de ${documentTypeLabel(sale)} ${sale.sequence}`, { error: message }));
      Alert.alert("No se pudo reintentar", message);
    } finally {
      setRetryingSaleId("");
      setProcessingMessage("");
    }
  };

  const editSale = (sale: Sale) => {
    if (!canEditSale(sale)) {
      Alert.alert("Factura no editable", "Solo se pueden editar facturas no autorizadas y no anuladas.");
      return;
    }

    setEditingSaleId(sale.id);
    setSourceTicketId("");
    setDocumentType(sale.documentType || "factura");
    setClientId(sale.clientId);
    setPaymentMethod(sale.paymentMethod || "01");
    setItems(sale.items.map((item) => ({ ...item })));
    setIssueNotice(`Corrigiendo factura ${sale.sequence}. Se reintentara con la misma autorizacion.`);
    setNotice("");
    showMessage("Documento cargado", `${documentTypeLabel(sale)} ${sale.sequence} listo para editar.`);
  };

  const invoiceFromTicket = (sale: Sale) => {
    if (sale.documentType !== "nota_venta" || !isTicketOffline(sale.status)) {
      Alert.alert("Ticket no disponible", "Solo se pueden facturar tickets internos activos.");
      return;
    }

    setEditingSaleId("");
    setSourceTicketId(sale.id);
    setDocumentType("factura");
    setClientId(sale.clientId);
    setPaymentMethod(sale.paymentMethod || "01");
    setItems(sale.items.map((item) => ({ ...item })));
    setIssueNotice(`Facturando ticket ${sale.sequence}. Se usara el siguiente numero disponible.`);
    setNotice("");
    showMessage("Ticket cargado", `Ticket ${sale.sequence} listo para facturar.`);
  };

  const convertProforma = (sale: Sale, target: DocumentType) => {
    if (sale.documentType !== "proforma" || sale.status !== "PROFORMA") {
      Alert.alert("Proforma no disponible", "Solo se pueden convertir proformas activas.");
      return;
    }

    setEditingSaleId("");
    setSourceTicketId("");
    setSourceProformaId(sale.id);
    setDocumentType(target);
    setClientId(sale.clientId);
    setPaymentMethod(sale.paymentMethod || "01");
    setItems(sale.items.map((item) => ({ ...item })));
    setIssueNotice(target === "factura" ? `Facturando proforma ${sale.sequence}. Se usara el siguiente numero disponible.` : `Convirtiendo proforma ${sale.sequence} a ticket interno.`);
    setNotice("");
    showMessage("Proforma cargada", target === "factura" ? `Proforma ${sale.sequence} lista para facturar.` : `Proforma ${sale.sequence} lista para convertir a ticket.`);
  };

  const cancelEdit = () => {
    setEditingSaleId("");
    setSourceTicketId("");
    setSourceProformaId("");
    setItems([]);
    setIssueNotice("");
    setPaymentMethod("01");
    setDocumentType("factura");
    showMessage("Accion cancelada", "Se limpio el formulario y no se guardaron cambios.");
  };

  const voidSale = async (sale: Sale) => {
    if (sale.status === "AUTORIZADA") {
      Alert.alert("No se puede anular aqui", "Una factura autorizada requiere otro proceso. Use nota de credito o el flujo que corresponda.");
      return;
    }
    if (sale.status === "ANULADA") {
      Alert.alert("Factura anulada", "Esta factura ya esta anulada localmente.");
      return;
    }

    const voidedAt = new Date().toISOString();
    const defaultReason = isInvoiceSale(sale) ? "Anulada localmente antes de autorizacion" : sale.documentType === "proforma" ? "Proforma anulada localmente" : isCreditNoteSale(sale) ? "Nota de credito anulada localmente" : "Nota de venta anulada localmente";
    const reason = getLocalVoidReason(defaultReason);
    if (!reason) return;
    const restoreStock = saleStatusReducesStock(sale.status);
    const stockMovements: InventoryMovement[] = [];
    const nextProducts = restoreStock
      ? data.products.map((product) => {
          const soldQuantity = sale.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
          if (soldQuantity <= 0) return product;
          const stockAfter = product.stock + soldQuantity;
          stockMovements.push({
            id: uid(),
            productId: product.id,
            productName: product.name,
            type: "entrada",
            quantity: soldQuantity,
            stockBefore: product.stock,
            stockAfter,
            reason,
            reference: sale.sequence,
            userId: user.id,
            createdAt: voidedAt
          });
          return { ...product, stock: stockAfter, updatedAt: voidedAt };
        })
      : data.products;

    await persist(appendAudit({
      ...data,
      products: nextProducts,
      inventoryMovements: [...stockMovements, ...(data.inventoryMovements || [])],
      sales: data.sales.map((item) =>
        item.id === sale.id
          ? {
              ...item,
              status: "ANULADA",
              voidReason: reason,
              voidedAt,
              sriMessage: item.sriMessage || reason
            }
          : item
      )
    }, user, "DOCUMENT_VOIDED", "sale", sale.id, `Documento anulado: ${documentTypeLabel(sale)} ${sale.sequence}`, { reason, restoredStock: restoreStock }));
    const message = restoreStock ? "Documento anulado localmente y stock devuelto." : "Documento anulado localmente.";
    setNotice(message);
    Alert.alert("Documento anulado", message);
  };

  return (
    <View style={styles.stack}>
      <Section title={sourceTicket ? `Facturando ticket ${sourceTicket.sequence}` : sourceProforma ? `Convirtiendo proforma ${sourceProforma.sequence}` : editingSale ? `Corrigiendo ${documentTypeLabel(editingSale)} ${editingSale.sequence}` : "Nueva venta"}>
        <SaleEditNotice sourceTicket={sourceTicket} sourceProforma={sourceProforma} editingSale={editingSale} onCancel={cancelEdit} />
        <View style={styles.saleGroupCompact}>
          <DocumentTypeSelector
            value={documentType}
            editingSale={editingSale}
            sourceTicket={sourceTicket}
            sourceProforma={sourceProforma}
            onChange={setDocumentType}
          />
        </View>
        <View style={styles.saleGroup}>
          <SaleClientPicker
            search={clientSearch}
            selectedClientId={clientId}
            visibleClients={visibleClientsForSale}
            filteredClientCount={filteredClientCount}
            selectedClient={selectedClient}
            canLoadMore={visibleClientsForSale.length < filteredClientCount}
            onSearchChange={setClientSearch}
            onClientChange={selectClientForSale}
            onLoadMore={() => setVisibleClientCount((count) => count + LIST_BATCH_SIZE)}
            onEditClient={openQuickClientEditor}
          />
        </View>

        <View style={styles.saleGroup}>
          <SaleProductPicker
            search={productSearch}
            selectedProductId={productId}
            visibleProducts={visibleProductsForSale}
            filteredProductCount={filteredProductCount}
            selectedProduct={selectedProduct}
            canLoadMore={visibleProductsForSale.length < filteredProductCount}
            onSearchChange={setProductSearch}
            onProductChange={selectProductForSale}
            onSearchSubmit={addProductSearchSubmit}
            onOpenScanner={() => setSaleScannerVisible(true)}
            onLoadMore={() => setVisibleProductCount((count) => count + LIST_BATCH_SIZE)}
            onAddSelected={addItem}
          />
          <SaleProductControls
            product={selectedProduct}
            lowStock={selectedProductLowStock}
            projectedStock={selectedProductProjectedStock}
          />
        </View>

        <SaleItemsList
          items={items}
          onAdjustQuantity={adjustSaleLineQuantity}
          onEdit={openLineEditor}
          onDelete={(index) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
        />
        <View style={styles.saleGroupCompact}>
          <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
        </View>
        <SaleTotalsBox
          key={`${items.length}-${saleSummaryTotals.subtotal}-${saleSummaryTotals.discount}-${saleSummaryTotals.tax}-${saleSummaryTotals.total}`}
          subtotal={saleSummaryTotals.subtotal}
          discount={saleSummaryTotals.discount}
          tax={saleSummaryTotals.tax}
          total={saleSummaryTotals.total}
        />
        <DismissibleNotice message={issueNotice} onDismiss={() => setIssueNotice("")} />
        <SaleSubmitButton issuing={issuing} documentType={documentType} editingSale={editingSale} sourceTicket={sourceTicket} sourceProforma={sourceProforma} onSubmit={issue} />
      </Section>

      <Section title="Facturas">
        <DismissibleNotice message={notice} tone="success" title="Factura enviada" onDismiss={() => setNotice("")} />
        <InvoiceStatsGrid stats={invoiceStats} />
        <SalesFilters
          search={invoiceSearch}
          startDate={saleStartDate}
          endDate={saleEndDate}
          status={statusFilter}
          onSearchChange={setInvoiceSearch}
          onStartDateChange={setSaleStartDate}
          onEndDateChange={setSaleEndDate}
          onToday={setSalesDateRangeToday}
          onMonth={setSalesDateRangeMonth}
          onClearDates={clearSalesDateRange}
          onStatusChange={setStatusFilter}
        />
        {data.sales.length === 0 ? <Empty text="Aun no hay ventas." /> : null}
        {data.sales.length > 0 && filteredSales.length === 0 ? <Empty text="No hay documentos con ese filtro." /> : null}
        {visibleSales.map((sale) => {
          const client = data.clients.find((item) => item.id === sale.clientId);
          return (
            <ListItem
              key={sale.id}
              title={`${sale.sequence} - ${client?.name ?? "Cliente"}`}
              meta={`${formatShortDate(sale.createdAt)} | ${documentTypeLabel(sale)} | ${displayInvoiceStatus(sale.status)} | $${money(sale.total)} | ${sale.authorizationNumber || sale.accessKey || "Interno"}${sale.sriMessage ? ` | ${shortText(sale.sriMessage, 90)}` : ""}`}
              badge={sale.status}
              onOpen={canAccessSensitiveSupport(user.role) ? () => client && onXml(formatSaleDetail(sale, client, data.issuer)) : undefined}
              secondaryLabel={(isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA" ? "Ver RIDE" : sale.documentType === "nota_venta" && isTicketOffline(sale.status) ? "Ver nota" : sale.documentType === "proforma" && sale.status === "PROFORMA" ? "Ver proforma" : undefined}
              onSecondary={() => {
                if (!client) return;
                if (isCreditNoteSale(sale)) return createCreditNoteRide(sale, client, data.sales.find((item) => item.id === sale.sourceSaleId));
                return isInvoiceSale(sale) ? createRide(sale, client) : sale.documentType === "proforma" ? createProforma(sale, client) : createTicket(sale, client);
              }}
              invoiceLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "nota_venta" && isTicketOffline(sale.status) ? "Facturar" : undefined}
              onInvoice={() => invoiceFromTicket(sale)}
              ticketLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "proforma" && sale.status === "PROFORMA" ? "Convertir a nota interna" : undefined}
              onTicket={() => convertProforma(sale, "nota_venta")}
              proformaInvoiceLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "proforma" && sale.status === "PROFORMA" ? "Convertir a factura" : undefined}
              onProformaInvoice={() => convertProforma(sale, "factura")}
              emailLabel={(isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA" ? "Email" : undefined}
              onEmail={() => client && emailSale(sale, client)}
              whatsappLabel={isInvoiceSale(sale) && sale.status === "AUTORIZADA" ? "WhatsApp" : undefined}
              onWhatsapp={() => client && whatsappSale(sale, client)}
              supportLabel={canAccessSensitiveSupport(user.role) && isInvoiceSale(sale) && sale.status !== "AUTORIZADA" ? "Soporte" : undefined}
              onSupport={() => client && onXml(formatSaleDetail(sale, client, data.issuer))}
              creditNoteLabel={canManageFiscalAdjustments(user.role) && client && canIssueCreditNoteForSale(data.sales, sale, client) ? "Nota credito" : undefined}
              onCreditNote={() => client && openCreditNoteForm(sale)}
              retentionLabel={canManageFiscalAdjustments(user.role) && isInvoiceSale(sale) && sale.status === "AUTORIZADA" ? "Retencion" : undefined}
              onRetention={() => openRetentionForm(sale)}
              editLabel={canIssueFromInternalDocuments(user.role) && canEditSale(sale) ? "Editar" : undefined}
              onEdit={() => editSale(sale)}
              retryLabel={canRetryDocuments(user.role) && (isInvoiceSale(sale) || isCreditNoteSale(sale)) && canRetrySriStatus(sale.status) ? (retryingSaleId === sale.id ? "..." : `Reintentar ${getRetryInfo(sale).today}/${MAX_DAILY_RETRIES}`) : undefined}
              onRetry={() => client && retrySale(sale, client)}
              cancelLabel={canVoidDocuments(user.role) && sale.status !== "AUTORIZADA" && sale.status !== "ANULADA" ? "Anular" : undefined}
              onCancel={() => voidSale(sale)}
            />
          );
        })}
        {visibleSales.length < filteredSales.length ? <LoadMoreButton label="Cargar mas documentos" onPress={() => setVisibleSaleCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>

      <Section title="Retenciones recibidas">
        <ReceivedRetentionsList
          retentions={data.receivedRetentions || []}
          sales={data.sales}
          clients={data.clients}
          issuer={data.issuer}
          visibleCount={LIST_BATCH_SIZE}
          canOpenDetail={canAccessSensitiveSupport(user.role)}
          onOpenDetail={onXml}
        />
      </Section>

      <CreditNoteModal
        source={creditNoteSource}
        issuer={data.issuer}
        sales={data.sales}
        reason={creditNoteReason}
        quantities={creditNoteQuantities}
        totals={creditNotePreviewTotals}
        issuing={issuingCreditNote}
        onReasonChange={setCreditNoteReason}
        onQuantityChange={(lineKey, value) => setCreditNoteQuantities((current) => ({ ...current, [lineKey]: value }))}
        onSelectAll={fillCreditNoteTotal}
        onClose={closeCreditNoteForm}
        onIssue={issueCreditNote}
      />

      <ReceivedRetentionModal
        sale={retentionSale}
        clientName={retentionClient?.name}
        issuer={data.issuer}
        taxType={retentionTaxType}
        documentNumberText={retentionDocumentNumber}
        authorizationNumber={retentionAuthorizationNumber}
        receivedAt={retentionReceivedAt}
        base={retentionBase}
        percentage={retentionPercentage}
        amount={retentionAmount}
        notes={retentionNotes}
        CalendarDateInputComponent={CalendarDateInput}
        onTaxTypeChange={(nextType) => {
          setRetentionTaxType(nextType);
          if (retentionSale) setRetentionBase(money(nextType === "IVA" ? retentionSale.tax : retentionSale.subtotal));
        }}
        onDocumentNumberChange={setRetentionDocumentNumber}
        onAuthorizationNumberChange={setRetentionAuthorizationNumber}
        onReceivedAtChange={setRetentionReceivedAt}
        onBaseChange={setRetentionBase}
        onPercentageChange={setRetentionPercentage}
        onAmountChange={setRetentionAmount}
        onNotesChange={setRetentionNotes}
        onClose={closeRetentionForm}
        onSave={saveReceivedRetention}
      />
      <QuickClientEditor
        visible={quickClientVisible}
        form={quickClientForm}
        onChange={setQuickClientForm}
        onSave={saveQuickClient}
        onClose={() => setQuickClientVisible(false)}
      />
      <SaleLineEditor
        visible={editingLineIndex !== null}
        item={editingLineIndex !== null ? items[editingLineIndex] : undefined}
        form={lineEditForm}
        onChange={setLineEditForm}
        onSave={saveLineEdit}
        onClose={closeLineEditor}
      />
      <BarcodeScannerModal
        visible={saleScannerVisible}
        title="Escanear producto"
        onClose={() => setSaleScannerVisible(false)}
        onScan={(code) => {
          setSaleScannerVisible(false);
          setProductSearch(code);
          addScannedCodeToSale(code);
        }}
      />
      <ProcessingOverlay visible={Boolean(processingMessage)} message={processingMessage} />
    </View>
  );
}

function SriView({ data, user, backendToken, getBackendToken, persist, onRefreshBackend }: { data: AppData; user: User; backendToken: string; getBackendToken: (backendUrl: string) => Promise<string>; persist: (data: AppData) => Promise<void>; onRefreshBackend: () => void }) {
  const [issuer, setIssuer] = useState(data.issuer);
  const [license, setLicense] = useState<AppLicense>(data.license || initialData.license!);
  const [sequentialText, setSequentialText] = useState(String(data.issuer.sequential));
  const [remissionSequentialText, setRemissionSequentialText] = useState(String(data.issuer.remissionSequential || 1));
  const [creditNoteSequentialText, setCreditNoteSequentialText] = useState(String(data.issuer.creditNoteSequential || 1));
  const [establishmentNameText, setEstablishmentNameText] = useState("");
  const [establishmentCodeText, setEstablishmentCodeText] = useState(data.issuer.establishment || "001");
  const [emissionPointText, setEmissionPointText] = useState(data.issuer.emissionPoint || "001");
  const [backendUrl, setBackendUrl] = useState(data.backendUrl);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(data.autoBackupEnabled !== false);
  const [syncing, setSyncing] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [lookingUpIssuer, setLookingUpIssuer] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [connectionResult, setConnectionResult] = useState("");
  const [loadingTechnicalLogs, setLoadingTechnicalLogs] = useState(false);
  const [technicalLogs, setTechnicalLogs] = useState<TechnicalLog[]>([]);
  const [assetStatus, setAssetStatus] = useState("");
  const [assetStatusTone, setAssetStatusTone] = useState<"info" | "success" | "error">("info");
  const [establishmentStatus, setEstablishmentStatus] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
  const [establishmentModalVisible, setEstablishmentModalVisible] = useState(false);
  const [deleteEstablishmentModalVisible, setDeleteEstablishmentModalVisible] = useState(false);
  const [proEstablishmentModalVisible, setProEstablishmentModalVisible] = useState(false);
  const [planUpgradeMessage, setPlanUpgradeMessage] = useState("");
  const [deleteEstablishmentConfirmText, setDeleteEstablishmentConfirmText] = useState("");
  const [deletingEstablishment, setDeletingEstablishment] = useState(false);
  const [establishmentForm, setEstablishmentForm] = useState({
    name: "",
    establishment: "",
    emissionPoint: "001",
    address: "",
    sequential: "1",
    remissionSequential: "1",
    creditNoteSequential: "1"
  });
  const [certificatePassword, setCertificatePassword] = useState("");
  const [certificateUploadModalVisible, setCertificateUploadModalVisible] = useState(false);
  const [pendingCertificateFile, setPendingCertificateFile] = useState<{ fileName: string; base64: string } | null>(null);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [checkingAssetStatus, setCheckingAssetStatus] = useState(false);
  const productionChecklist = useMemo(() => buildProductionChecklist({ ...issuer, sequential: Number(sequentialText), remissionSequential: Number(remissionSequentialText), creditNoteSequential: Number(creditNoteSequentialText) }, backendUrl, connectionResult), [backendUrl, connectionResult, creditNoteSequentialText, issuer, remissionSequentialText, sequentialText]);
  const establishments = useMemo(() => editableEstablishments(issuer), [issuer]);
  const selectedEstablishment = establishments.find((item) => item.id === issuer.activeEstablishmentId && item.active)
    || establishments.find((item) => item.active)
    || establishments[0]
    || activeEstablishment(issuer);
  const canManageEstablishments = appLicenseStatus(license).active && maxEmissionPointsForLicense(license) > 1;
  const maxEmissionPoints = maxEmissionPointsForLicense(license);
  const [visibleAuditCount, setVisibleAuditCount] = useState(LIST_BATCH_SIZE);
  const auditLogs = data.auditLogs || [];
  const visibleAuditLogs = auditLogs.slice(0, visibleAuditCount);

  const openPlanUpgradeModal = (message?: string) => {
    setPlanUpgradeMessage(message || `Su plan actual permite ${maxEmissionPoints} punto(s) de emision. Active Pro para manejar sucursales, puntos adicionales y operacion multi punto.`);
    setProEstablishmentModalVisible(true);
  };

  const refreshAssetsStatus = useCallback(async (showAlert = true) => {
    if (showAlert) {
      setCheckingAssetStatus(true);
      setAssetStatus("Consultando logo y firma en el servidor...");
      setAssetStatusTone("info");
    }
    try {
      const status = await getCompanyAssetsStatus(backendUrl, backendToken);
      const logoText = status.logo?.configured ? "Logo configurado" : "Logo pendiente";
      const certText = status.certificate?.configured
        ? `Certificado cargado${status.certificate.uploadedAt ? ` el ${formatShortDate(status.certificate.uploadedAt)}` : ""}`
        : status.certificate?.needsUpload
          ? status.certificate.error || "Certificado requiere volver a subirse"
          : "Certificado pendiente";
      setAssetStatus(`${logoText} | ${certText}`);
      setAssetStatusTone(status.certificate?.needsUpload ? "error" : "info");
      if (showAlert) Alert.alert("Activos de empresa", `${logoText}\n${certText}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo consultar logo/certificado.";
      setAssetStatus(message);
      setAssetStatusTone("error");
      if (showAlert) Alert.alert("Activos no disponibles", message);
    } finally {
      if (showAlert) setCheckingAssetStatus(false);
    }
  }, [backendToken, backendUrl]);

  useEffect(() => {
    if (!backendToken) return;
    void refreshAssetsStatus(false);
  }, [backendToken, backendUrl, refreshAssetsStatus]);

  useEffect(() => {
    setEstablishmentNameText(selectedEstablishment.name);
    setEstablishmentCodeText(selectedEstablishment.establishment);
    setEmissionPointText(selectedEstablishment.emissionPoint);
  }, [selectedEstablishment.emissionPoint, selectedEstablishment.establishment, selectedEstablishment.id, selectedEstablishment.name]);

  const issuerFromForm = () => {
    const sequential = Number(sequentialText);
    const remissionSequential = Number(remissionSequentialText);
    const creditNoteSequential = Number(creditNoteSequentialText);
    const activeId = selectedEstablishment.id;
    const nextEstablishmentCode = normalizeThreeDigits(establishmentCodeText);
    const nextEmissionPointCode = normalizeThreeDigits(emissionPointText);
    const nextActiveId = `${nextEstablishmentCode}-${nextEmissionPointCode}`;
    const nextEstablishments = establishments.map((item) => item.id === activeId ? {
      ...item,
      name: establishmentNameText.trim(),
      address: issuer.address,
      establishment: nextEstablishmentCode,
      emissionPoint: nextEmissionPointCode,
      id: nextActiveId,
      sequential,
      remissionSequential,
      creditNoteSequential
    } : item);
    const active = nextEstablishments.find((item) => item.id === nextActiveId) || nextEstablishments.find((item) => item.id === activeId) || activeEstablishment(issuer);
    return issuerWithEstablishment({ ...issuer, establishments: nextEstablishments, activeEstablishmentId: active.id, establishmentsUpdatedAt: active.id !== activeId ? new Date().toISOString() : issuer.establishmentsUpdatedAt }, active);
  };

  const selectEstablishment = (id: string) => {
    const next = establishments.find((item) => item.id === id);
    if (!next) return;
    if (!canUseEmissionScope(issuer, license, id)) {
      const message = `Su plan actual permite ${maxEmissionPoints} punto(s) de emision. Actualice a Pro para usar ${id}.`;
      setEstablishmentStatus({ tone: "error", message });
      openPlanUpgradeModal(message);
      return;
    }
    const nextIssuer = issuerWithEstablishment({ ...issuer, establishments, activeEstablishmentId: next.id }, next);
    setIssuer(nextIssuer);
    setSequentialText(String(next.sequential));
    setRemissionSequentialText(String(next.remissionSequential || 1));
    setCreditNoteSequentialText(String(next.creditNoteSequential || 1));
    setEstablishmentNameText(next.name);
    setEstablishmentCodeText(next.establishment);
    setEmissionPointText(next.emissionPoint);
    setEstablishmentStatus({ tone: "info", message: `Editando ${next.name} ${next.establishment}-${next.emissionPoint}.` });
  };

  const openEstablishmentModal = () => {
    if (!canManageEstablishments) {
      openPlanUpgradeModal();
      return;
    }
    const nextNumber = String(establishments.length + 1).padStart(3, "0");
    setEstablishmentForm({
      name: `Sucursal ${establishments.length + 1}`,
      establishment: normalizeThreeDigits(nextNumber),
      emissionPoint: "001",
      address: issuer.address || "Ecuador",
      sequential: "1",
      remissionSequential: "1",
      creditNoteSequential: "1"
    });
    setEstablishmentModalVisible(true);
  };

  const saveNewEstablishment = async () => {
    if (!canManageEstablishments) {
      const message = "Agregar puntos de emision requiere plan Pro activo.";
      setEstablishmentStatus({ tone: "error", message });
      openPlanUpgradeModal(message);
      return;
    }
    if (establishments.filter((item) => item.active !== false).length >= maxEmissionPoints) {
      const message = `Su plan actual permite hasta ${maxEmissionPoints} punto(s) de emision.`;
      setEstablishmentStatus({ tone: "error", message });
      openPlanUpgradeModal(message);
      return;
    }
    const establishment = normalizeThreeDigits(establishmentForm.establishment);
    const emissionPoint = normalizeThreeDigits(establishmentForm.emissionPoint);
    const id = `${establishment}-${emissionPoint}`;
    if (establishments.some((item) => item.id === id)) {
      setEstablishmentStatus({ tone: "error", message: `Ya existe el establecimiento ${id}.` });
      Alert.alert("Establecimiento existente", `Ya existe ${id}. Use otro establecimiento o punto de emision.`);
      return;
    }
    const sequential = Number(establishmentForm.sequential);
    const remissionSequential = Number(establishmentForm.remissionSequential);
    const creditNoteSequential = Number(establishmentForm.creditNoteSequential);
    if (![sequential, remissionSequential, creditNoteSequential].every((value) => Number.isInteger(value) && value > 0)) {
      Alert.alert("Secuenciales invalidos", "Ingrese secuenciales enteros mayores a cero.");
      return;
    }
    const next: IssuerEstablishment = {
      id,
      name: establishmentForm.name.trim() || `Establecimiento ${id}`,
      establishment,
      emissionPoint,
      address: establishmentForm.address.trim() || issuer.address,
      sequential,
      remissionSequential,
      creditNoteSequential,
      active: true
    };
    const nextIssuer = issuerWithEstablishment({ ...issuer, establishments: [...establishments, next], activeEstablishmentId: id, establishmentsUpdatedAt: new Date().toISOString() }, next);
    await persist(appendAudit({ ...data, backendUrl, autoBackupEnabled, issuer: nextIssuer, license }, user, "ESTABLISHMENT_CREATED", "issuer", issuer.ruc, `Establecimiento ${id} creado`, { establishment, emissionPoint }));
    setIssuer(nextIssuer);
    setSequentialText(String(sequential));
    setRemissionSequentialText(String(remissionSequential));
    setCreditNoteSequentialText(String(creditNoteSequential));
    setEstablishmentModalVisible(false);
    setEstablishmentStatus({ tone: "success", message: `Establecimiento ${next.name} ${id} guardado correctamente.` });
    Alert.alert("Establecimiento guardado", `${next.name} ${id} quedo disponible para facturar.`);
  };

  const updateSelectedEstablishment = (patch: Partial<IssuerEstablishment>) => {
    if ((patch.establishment !== undefined || patch.emissionPoint !== undefined) && selectedEstablishmentDocumentCount > 0) {
      const message = `No se puede cambiar el codigo ${selectedEstablishment.id} porque tiene ${selectedEstablishmentDocumentCount} documento(s).`;
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("Punto protegido", message);
      return;
    }
    const baseId = selectedEstablishment.id;
    const nextEstablishment = patch.establishment !== undefined ? normalizeThreeDigits(patch.establishment) : selectedEstablishment.establishment;
    const nextEmissionPoint = patch.emissionPoint !== undefined ? normalizeThreeDigits(patch.emissionPoint) : selectedEstablishment.emissionPoint;
    const nextId = `${nextEstablishment}-${nextEmissionPoint}`;
    if (nextId !== baseId && establishments.some((item) => item.id === nextId)) {
      setEstablishmentStatus({ tone: "error", message: `Ya existe el establecimiento ${nextId}. Use otro codigo.` });
      return;
    }
    const nextEstablishments = establishments.map((item) => {
      if (item.id !== baseId) return item;
      return {
        ...item,
        ...patch,
        name: patch.name !== undefined ? patch.name : item.name,
        establishment: nextEstablishment,
        emissionPoint: nextEmissionPoint,
        id: nextId
      };
    });
    const nextActive = nextEstablishments.find((item) => item.id === nextId)
      || nextEstablishments.find((item) => item.id === baseId)
      || activeEstablishment(issuer);
    const nextIssuer = issuerWithEstablishment({ ...issuer, establishments: nextEstablishments, activeEstablishmentId: nextActive.id, establishmentsUpdatedAt: new Date().toISOString() }, nextActive);
    setIssuer(nextIssuer);
    setEstablishmentStatus({ tone: "info", message: "Cambios pendientes. Presione Guardar emisor para conservarlos." });
  };

  const selectedEstablishmentDocumentCount = useMemo(() => {
    const id = selectedEstablishment.id;
    return data.sales.filter((sale) => `${sale.establishment || ""}-${sale.emissionPoint || ""}` === id).length
      + (data.guides || []).filter((guide) => `${guide.establishment || ""}-${guide.emissionPoint || ""}` === id).length;
  }, [data.guides, data.sales, selectedEstablishment.id]);

  const requestDeleteSelectedEstablishment = () => {
    if (establishments.length <= 1) {
      setEstablishmentStatus({ tone: "error", message: "Debe existir al menos un establecimiento para facturar." });
      return;
    }
    if (selectedEstablishmentDocumentCount > 0) {
      const message = `No se puede eliminar ${selectedEstablishment.id} porque tiene ${selectedEstablishmentDocumentCount} documento(s). Se conserva para proteger secuenciales, reportes y auditoria.`;
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("Establecimiento protegido", message);
      return;
    }
    setDeleteEstablishmentConfirmText("");
    setDeleteEstablishmentModalVisible(true);
  };

  const confirmDeleteSelectedEstablishment = async () => {
    if (deletingEstablishment) return;
    if (deleteEstablishmentConfirmText.trim() !== selectedEstablishment.id) {
      setEstablishmentStatus({ tone: "error", message: `Para eliminar escriba exactamente ${selectedEstablishment.id}.` });
      return;
    }
    if (selectedEstablishmentDocumentCount > 0) {
      const message = `No se puede eliminar ${selectedEstablishment.id} porque ya tiene ${selectedEstablishmentDocumentCount} documento(s).`;
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("Establecimiento protegido", message);
      return;
    }

    const deleted = selectedEstablishment;
    const now = new Date().toISOString();
    const nextEstablishments = establishments
      .filter((item) => item.id !== selectedEstablishment.id)
      .map((item) => ({ ...item, updatedAt: item.updatedAt || now }));
    const next = nextEstablishments.find((item) => item.active !== false) || activeEstablishment(issuer);
    const nextIssuer = issuerWithEstablishment({ ...issuer, establishments: nextEstablishments, activeEstablishmentId: next.id, establishmentsUpdatedAt: now }, next);
    const nextData = appendAudit(
      { ...data, backendUrl, autoBackupEnabled, issuer: nextIssuer, license },
      user,
      "ESTABLISHMENT_DELETED",
      "issuer",
      deleted.id,
      `Establecimiento eliminado: ${deleted.name} ${deleted.id}`,
      { removedEstablishments: [deleted.id], establishmentsUpdatedAt: now }
    );

    setDeletingEstablishment(true);
    setEstablishmentStatus({ tone: "info", message: `Eliminando ${deleted.name} ${deleted.id}...` });
    try {
      await persist(nextData);
      await syncPatchToBackend(backendUrl, backendToken, { baseData: data, issuer: nextIssuer, auditLogs: nextData.auditLogs.slice(0, 1) }, "Eliminacion de establecimiento pendiente de sincronizar", nextData, persist);
      setIssuer(nextIssuer);
      setSequentialText(String(next.sequential));
      setRemissionSequentialText(String(next.remissionSequential || 1));
      setCreditNoteSequentialText(String(next.creditNoteSequential || 1));
      setDeleteEstablishmentModalVisible(false);
      setDeleteEstablishmentConfirmText("");
      const message = `${deleted.name} ${deleted.id} fue eliminado correctamente.`;
      setEstablishmentStatus({ tone: "success", message });
      Alert.alert("Establecimiento eliminado", message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar el establecimiento.";
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("No se pudo eliminar", message);
    } finally {
      setDeletingEstablishment(false);
    }
  };

  const save = async () => {
    const sequential = Number(sequentialText);
    const remissionSequential = Number(remissionSequentialText);
    const creditNoteSequential = Number(creditNoteSequentialText);
    const errors: string[] = [];
    const formEstablishment = normalizeThreeDigits(establishmentCodeText);
    const formEmissionPoint = normalizeThreeDigits(emissionPointText);
    validateIssuer({ ...issuer, establishment: formEstablishment, emissionPoint: formEmissionPoint, sequential, remissionSequential, creditNoteSequential }, backendUrl, errors);
    if (errors.length > 0) {
      showMessage("Revise configuracion SRI", errors.join("\n"));
      return;
    }
    if (!establishmentNameText.trim()) {
      showMessage("Nombre requerido", "Ingrese el nombre del establecimiento antes de guardar.");
      return;
    }
    if (!/^\d{1,3}$/.test(establishmentCodeText) || !/^\d{1,3}$/.test(emissionPointText)) {
      showMessage("Punto invalido", "Estab. y Pto. emi. deben tener entre 1 y 3 digitos.");
      return;
    }
    if (selectedEstablishmentDocumentCount > 0 && (formEstablishment !== selectedEstablishment.establishment || formEmissionPoint !== selectedEstablishment.emissionPoint)) {
      const message = `No se puede cambiar el codigo ${selectedEstablishment.id} porque tiene ${selectedEstablishmentDocumentCount} documento(s).`;
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("Punto protegido", message);
      return;
    }
    if (!Number.isInteger(sequential) || sequential <= 0) {
      showMessage("Secuencial invalido", "Ingrese el siguiente secuencial como numero entero mayor a cero.");
      return;
    }
    if (!Number.isInteger(remissionSequential) || remissionSequential <= 0) {
      showMessage("Secuencial guia invalido", "Ingrese el siguiente secuencial de guia como numero entero mayor a cero.");
      return;
    }
    if (!Number.isInteger(creditNoteSequential) || creditNoteSequential <= 0) {
      showMessage("Secuencial nota credito invalido", "Ingrese el siguiente secuencial de nota de credito como numero entero mayor a cero.");
      return;
    }
    const nextIssuer = issuerFromForm();
    const addedIds = addedEstablishmentIds(data.issuer, nextIssuer);
    const previousIdsForGuard = new Set(normalizedEstablishments(data.issuer).map((item) => item.id));
    const nextIdsForGuard = new Set(normalizedEstablishments(nextIssuer).map((item) => item.id));
    const removedIdsForGuard = Array.from(previousIdsForGuard).filter((id) => !nextIdsForGuard.has(id));
    const isActiveCodeReplacement = addedIds.length === 1 && removedIdsForGuard.length === 1 && removedIdsForGuard[0] === selectedEstablishment.id && selectedEstablishmentDocumentCount === 0;
    if (addedIds.length > 0 && !isActiveCodeReplacement) {
      const message = `Guardar emisor no puede crear puntos nuevos (${addedIds.join(", ")}). Use Agregar establecimiento para crear sucursales.`;
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("Creacion de punto bloqueada", message);
      return;
    }
    const activeEstablishmentCount = normalizedEstablishments(nextIssuer).filter((item) => item.active !== false).length;
    if (activeEstablishmentCount > maxEmissionPointsForLicense(license)) {
      const message = `Su plan actual permite ${maxEmissionPointsForLicense(license)} punto(s) de emision. Desactive puntos extra o actualice a Pro.`;
      setEstablishmentStatus({ tone: "error", message });
      openPlanUpgradeModal(message);
      return;
    }
    if (!canUseEmissionScope(nextIssuer, license, activeEstablishment(nextIssuer).id)) {
      const message = "El punto de emision activo no esta incluido en su plan actual.";
      setEstablishmentStatus({ tone: "error", message });
      openPlanUpgradeModal(message);
      return;
    }
    const ids = normalizedEstablishments(nextIssuer).map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      setEstablishmentStatus({ tone: "error", message: "Hay establecimientos duplicados. Revise estab. y punto de emision." });
      return;
    }
    const removedIds = removedIdsForGuard;
    const nextData = appendAudit({ ...data, backendUrl, autoBackupEnabled, issuer: nextIssuer, license }, user, "SRI_CONFIG_UPDATED", "issuer", issuer.ruc, "Configuracion SRI actualizada", { environment: issuer.environment, establishment: nextIssuer.establishment, emissionPoint: nextIssuer.emissionPoint, sequential, remissionSequential, creditNoteSequential, autoBackupEnabled, removedEstablishments: removedIds, establishmentsUpdatedAt: nextIssuer.establishmentsUpdatedAt });
    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, issuer: nextIssuer, auditLogs: nextData.auditLogs.slice(0, 1) }, "Configuracion SRI pendiente de sincronizar", nextData, persist);
    setIssuer(nextIssuer);
    setSequentialText(String(sequential));
    setRemissionSequentialText(String(remissionSequential));
    setCreditNoteSequentialText(String(creditNoteSequential));
    setEstablishmentNameText(activeEstablishment(nextIssuer).name);
    setEstablishmentCodeText(nextIssuer.establishment);
    setEmissionPointText(nextIssuer.emissionPoint);
    if (removedIds.length > 0) {
      const message = `Establecimiento${removedIds.length > 1 ? "s" : ""} ${removedIds.join(", ")} eliminado${removedIds.length > 1 ? "s" : ""} correctamente.`;
      setEstablishmentStatus({ tone: "success", message });
      Alert.alert("Establecimiento eliminado", message);
      return;
    }
    setEstablishmentStatus({ tone: "success", message: `${selectedEstablishment.name} ${nextIssuer.establishment}-${nextIssuer.emissionPoint} guardado correctamente.` });
    Alert.alert("Configuracion guardada", "Los proximos comprobantes usaran estos datos.");
  };

  const backupData = async () => {
    setSyncing(true);
    try {
      const sequential = Number(sequentialText);
      const remissionSequential = Number(remissionSequentialText);
      const creditNoteSequential = Number(creditNoteSequentialText);
      const errors: string[] = [];
      validateIssuer({ ...issuer, sequential, remissionSequential, creditNoteSequential }, backendUrl, errors);
      if (errors.length > 0) {
        showMessage("Revise configuracion SRI", errors.join("\n"));
        return;
      }
      if (!Number.isInteger(sequential) || sequential <= 0) {
        showMessage("Secuencial invalido", "Ingrese el siguiente secuencial como numero entero mayor a cero.");
        return;
      }
      if (!Number.isInteger(remissionSequential) || remissionSequential <= 0) {
        showMessage("Secuencial guia invalido", "Ingrese el siguiente secuencial de guia como numero entero mayor a cero.");
        return;
      }
      if (!Number.isInteger(creditNoteSequential) || creditNoteSequential <= 0) {
        showMessage("Secuencial nota credito invalido", "Ingrese el siguiente secuencial de nota de credito como numero entero mayor a cero.");
        return;
      }
      const nextIssuer = issuerFromForm();
      const addedIds = addedEstablishmentIds(data.issuer, nextIssuer);
      if (addedIds.length > 0) {
        Alert.alert("Creacion de punto bloqueada", `Subir cambios no puede crear puntos nuevos (${addedIds.join(", ")}). Use Agregar establecimiento.`);
        return;
      }
      const nextData = { ...data, backendUrl, autoBackupEnabled, issuer: nextIssuer, license };
      const result = await backupAppData(backendUrl, nextData, backendToken);
      await persist(appendAudit(nextData, user, "BACKUP_CREATED", "backup", undefined, "Base respaldada en servidor"));
      Alert.alert("Respaldo guardado", [`Guardado: ${result.updatedAt}`, "", formatBackupSummary(result.summary || summarizeAppData(nextData))].join("\n"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo respaldar.";
      Alert.alert("Error de respaldo", message);
    } finally {
      setSyncing(false);
    }
  };

  const restoreData = async () => {
    setSyncing(true);
    try {
      const snapshot = await restoreAppData<AppData>(backendUrl, backendToken);
      if (!snapshot) {
        Alert.alert("Sin respaldo", "Todavia no hay datos guardados en el servidor.");
        return;
      }
      const restoreSummary = snapshot.summary || summarizeAppData(snapshot.data);
      const restoredData = sanitizeAppData({ ...snapshot.data, backendUrl, autoBackupEnabled });

      await persist(appendAudit(restoredData, user, "BACKUP_RESTORED", "backup", undefined, `Base restaurada desde ${snapshot.updatedAt}`));
      setIssuer(restoredData.issuer);
      setLicense(restoredData.license || initialData.license!);
      setSequentialText(String(restoredData.issuer.sequential));
      setRemissionSequentialText(String(restoredData.issuer.remissionSequential || 1));
      setCreditNoteSequentialText(String(restoredData.issuer.creditNoteSequential || 1));
      setBackendUrl(restoredData.backendUrl);
      setAutoBackupEnabled(restoredData.autoBackupEnabled !== false);
      Alert.alert("Base restaurada", [`Restaurado desde: ${snapshot.updatedAt}`, "", formatBackupSummary(restoreSummary)].join("\n"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo restaurar.";
      Alert.alert("Error de restauracion", message);
    } finally {
      setSyncing(false);
    }
  };

  const testConnection = async () => {
    setCheckingConnection(true);
    setConnectionResult("");

    try {
      const health = await checkBackendHealth(backendUrl);
      const expectedEnv = issuer.environment === "1" ? "test" : "production";
      const backendEnv = health.sriEnv || "desconocido";
      const envMatches = backendEnv === expectedEnv;
      const lines = formatBackendHealth(health, backendUrl, expectedEnv, envMatches);

      setConnectionResult(lines);
      Alert.alert(envMatches ? "Conexion OK" : "Revise ambiente", lines);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo probar la conexion.";
      setConnectionResult(`ERROR DE CONEXION\n${message}`);
      Alert.alert("Servidor no disponible", message);
    } finally {
      setCheckingConnection(false);
    }
  };

  const lookupIssuerRuc = async () => {
    const ruc = issuer.ruc.replace(/\D/g, "");
    if (!/^\d{13}$/.test(ruc)) {
      Alert.alert("RUC requerido", "Ingrese un RUC de 13 digitos para consultar.");
      return;
    }
    const savedRuc = data.issuer.ruc.replace(/\D/g, "");
    if (savedRuc && ruc === savedRuc) {
      const current = activeEstablishment(data.issuer);
      setIssuer(data.issuer);
      setSequentialText(String(data.issuer.sequential));
      setRemissionSequentialText(String(data.issuer.remissionSequential || 1));
      setCreditNoteSequentialText(String(data.issuer.creditNoteSequential || 1));
      setEstablishmentStatus({
        tone: "info",
        message: `Este RUC ya esta configurado para ${data.issuer.businessName}. No se consulto WebServices ni se creo otro establecimiento.`
      });
      Alert.alert("RUC ya configurado", `${data.issuer.businessName}\nEstablecimiento activo: ${current.establishment}-${current.emissionPoint}`);
      return;
    }
    setLookingUpIssuer(true);
    try {
      const token = backendToken || await getBackendToken(backendUrl);
      if (!token) {
        Alert.alert("Sesion requerida", "Inicie sesion con conexion al servidor para consultar datos del RUC.");
        return;
      }
      const result = await lookupIdentityData(backendUrl, ruc, token);
      const nextIssuer = applyIdentityToIssuer(issuer, result);
      setIssuer(nextIssuer);
      setEstablishmentStatus({
        tone: "success",
        message: `Datos encontrados: ${result.businessName || result.name || ruc}${result.status ? ` (${result.status})` : ""}.`
      });
      Alert.alert("RUC encontrado", `${result.businessName || result.name || ruc}\n${result.status ? `Estado: ${result.status}` : ""}`.trim());
    } catch (error) {
      setEstablishmentStatus({ tone: "error", message: error instanceof Error ? error.message : "No se pudo consultar el RUC." });
      Alert.alert("No se pudo consultar", error instanceof Error ? error.message : "Intente nuevamente.");
    } finally {
      setLookingUpIssuer(false);
    }
  };

  const testCompanyEmail = async () => {
    if (!issuer.email?.trim()) {
      Alert.alert("Correo requerido", "Ingrese y guarde un correo de contacto para la empresa.");
      return;
    }
    setTestingEmail(true);
    try {
      const result = await sendTestEmail(backendUrl, { to: issuer.email.trim() }, backendToken);
      Alert.alert("Correo probado", `Se envio una prueba a ${result.to || issuer.email}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar el correo de prueba.";
      Alert.alert("Correo no disponible", message);
    } finally {
      setTestingEmail(false);
    }
  };

  const loadTechnicalLogs = async () => {
    setLoadingTechnicalLogs(true);
    try {
      const logs = await getTechnicalLogs(backendUrl, backendToken, 80);
      setTechnicalLogs(logs);
      if (logs.length === 0) {
        Alert.alert("Sin logs tecnicos", "Aun no hay eventos tecnicos registrados en el backend.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los logs tecnicos.";
      Alert.alert("Logs no disponibles", message);
    } finally {
      setLoadingTechnicalLogs(false);
    }
  };

  const uploadLogoFromWeb = async () => {
    if (Platform.OS !== "web") {
      Alert.alert("Selector pendiente", "En movil agregaremos selector nativo de archivos. Por ahora use la version web para subir logo.");
      return;
    }
    let uploaded = false;
    try {
      setUploadingAsset(true);
      const file = await pickWebFile("image/png,image/jpeg,image/webp");
      if (!file) return;
      const base64 = await readWebFileBase64(file);
      const result = await uploadCompanyLogo(backendUrl, { fileName: file.name, mimeType: file.type || "image/png", base64 }, backendToken);
      uploaded = true;
      const nextIssuer = { ...issuer, logoUrl: result.logoUrl || "" };
      setIssuer(nextIssuer);
      await persist(appendAudit({ ...data, backendUrl, autoBackupEnabled, issuer: { ...nextIssuer, sequential: Number(sequentialText), remissionSequential: Number(remissionSequentialText), creditNoteSequential: Number(creditNoteSequentialText) } }, user, "COMPANY_LOGO_UPDATED", "issuer", issuer.ruc, "Logo RIDE actualizado"));
      setAssetStatus("Logo cargado y guardado para RIDE.");
      setAssetStatusTone("success");
      Alert.alert("Logo cargado", "El logo quedo guardado para los proximos RIDE.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revise el archivo e intente nuevamente.";
      setAssetStatus(`Error al subir logo: ${message}`);
      setAssetStatusTone("error");
      Alert.alert("No se pudo subir logo", message);
    } finally {
      setUploadingAsset(false);
      if (uploaded) void refreshAssetsStatus(false);
    }
  };

  const uploadCertificateFromWeb = async () => {
    if (Platform.OS !== "web") {
      Alert.alert("Selector pendiente", "En movil agregaremos selector nativo de archivos. Por ahora use la version web para subir .p12.");
      return;
    }
    try {
      setUploadingAsset(true);
      const file = await pickWebFile(".p12,application/x-pkcs12");
      if (!file) return;
      const base64 = await readWebFileBase64(file);
      setPendingCertificateFile({ fileName: file.name, base64 });
      setCertificatePassword("");
      setCertificateUploadModalVisible(true);
      setAssetStatus(`Firma seleccionada: ${file.name}. Ingrese la contrasena para validarla.`);
      setAssetStatusTone("info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revise el .p12 e intente nuevamente.";
      setAssetStatus(`Error al seleccionar certificado: ${message}`);
      setAssetStatusTone("error");
      Alert.alert("No se pudo seleccionar certificado", message);
    } finally {
      setUploadingAsset(false);
    }
  };

  const cancelCertificateUpload = () => {
    if (uploadingAsset) return;
    setCertificateUploadModalVisible(false);
    setPendingCertificateFile(null);
    setCertificatePassword("");
  };

  const confirmCertificateUpload = async () => {
    if (!pendingCertificateFile) {
      Alert.alert("Seleccione la firma", "Primero seleccione el archivo .p12.");
      return;
    }
    if (!certificatePassword.trim()) {
      Alert.alert("Clave requerida", "Ingrese la contrasena del certificado .p12.");
      return;
    }
    let uploaded = false;
    try {
      setUploadingAsset(true);
      await uploadCompanyCertificate(backendUrl, { fileName: pendingCertificateFile.fileName, password: certificatePassword, base64: pendingCertificateFile.base64 }, backendToken);
      uploaded = true;
      setPendingCertificateFile(null);
      setCertificatePassword("");
      setCertificateUploadModalVisible(false);
      setAssetStatus("Certificado cargado y validado.");
      setAssetStatusTone("success");
      Alert.alert("Certificado listo", "El servidor valido el .p12. Las proximas emisiones usaran el certificado de esta empresa.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revise el .p12 y la contrasena.";
      setAssetStatus(`Error al subir certificado: ${message}`);
      setAssetStatusTone("error");
      Alert.alert("No se pudo subir certificado", message);
    } finally {
      setUploadingAsset(false);
      if (uploaded) void refreshAssetsStatus(false);
    }
  };

  return (
    <View style={styles.stack}>
      <Section title="Emisor SRI">
        <IssuerIdentityFields issuer={issuer} lookingUpIssuer={lookingUpIssuer} onChange={setIssuer} onLookupRuc={() => { void lookupIssuerRuc(); }} />
        <IssuerEstablishmentFields
          issuer={issuer}
          establishments={establishments}
          selectedEstablishment={selectedEstablishment}
          establishmentNameText={establishmentNameText}
          establishmentCodeText={establishmentCodeText}
          emissionPointText={emissionPointText}
          sequentialText={sequentialText}
          remissionSequentialText={remissionSequentialText}
          creditNoteSequentialText={creditNoteSequentialText}
          onSelectEstablishment={selectEstablishment}
          onEstablishmentNameChange={setEstablishmentNameText}
          onEstablishmentCodeChange={setEstablishmentCodeText}
          onEmissionPointChange={setEmissionPointText}
          onEstablishmentPatch={updateSelectedEstablishment}
          onSequentialChange={setSequentialText}
          onRemissionSequentialChange={setRemissionSequentialText}
          onCreditNoteSequentialChange={setCreditNoteSequentialText}
        />
        {!canManageEstablishments ? <PlanLimitCard licenseLabel={compactLicenseStatusLabel(license)} /> : null}
        <EstablishmentActions
          canManage={canManageEstablishments}
          documentCount={selectedEstablishmentDocumentCount}
          status={establishmentStatus}
          onAdd={openEstablishmentModal}
          onDelete={requestDeleteSelectedEstablishment}
        />
        <IssuerTaxSettings issuer={issuer} onChange={setIssuer} />
        <IssuerServerSettings
          backendUrl={backendUrl}
          autoBackupEnabled={autoBackupEnabled}
          checkingConnection={checkingConnection}
          testingEmail={testingEmail}
          connectionResult={connectionResult}
          onBackendUrlChange={setBackendUrl}
          onAutoBackupChange={setAutoBackupEnabled}
          onSave={save}
          onTestConnection={testConnection}
          onTestEmail={testCompanyEmail}
        />
      </Section>
      <Section title="Logo y firma electronica">
        <CompanyAssetsSection
          assetStatus={assetStatus}
          assetStatusTone={assetStatusTone}
          uploading={uploadingAsset}
          checkingStatus={checkingAssetStatus}
          certificatePassword={certificatePassword}
          certificateModalVisible={certificateUploadModalVisible}
          pendingCertificateName={pendingCertificateFile?.fileName || ""}
          onCertificatePasswordChange={setCertificatePassword}
          onUploadLogo={uploadLogoFromWeb}
          onRefreshStatus={() => { void refreshAssetsStatus(true); }}
          onUploadCertificate={uploadCertificateFromWeb}
          onConfirmCertificateUpload={() => { void confirmCertificateUpload(); }}
          onCancelCertificateUpload={cancelCertificateUpload}
        />
      </Section>
      <Section title="Estado de configuracion">
        <ProductionStatusSection issuer={issuer} checklist={productionChecklist} />
      </Section>
      <Section title="Plan activo">
        <ActivePlanInfo license={license} />
      </Section>
      <Section title="Base de datos">
        <DatabaseSyncSection data={data} syncing={syncing} onBackup={backupData} onRestore={restoreData} onRefresh={onRefreshBackend} />
      </Section>
      <Section title="Estado de integracion">
        <IntegrationStatusInfo issuer={issuer} />
      </Section>
      <Section title="Logs tecnicos">
        <TechnicalLogsSection logs={technicalLogs} loading={loadingTechnicalLogs} onLoad={loadTechnicalLogs} />
      </Section>
      <Section title="Auditoria">
        <AuditSection logs={auditLogs} visibleLogs={visibleAuditLogs} onLoadMore={() => setVisibleAuditCount((count) => count + LIST_BATCH_SIZE)} />
      </Section>
      <NewEstablishmentModal
        visible={establishmentModalVisible}
        form={establishmentForm}
        onChange={setEstablishmentForm}
        onClose={() => setEstablishmentModalVisible(false)}
        onSave={() => { void saveNewEstablishment(); }}
      />
      <DeleteEstablishmentModal
        visible={deleteEstablishmentModalVisible}
        establishment={selectedEstablishment}
        confirmText={deleteEstablishmentConfirmText}
        deleting={deletingEstablishment}
        onConfirmTextChange={setDeleteEstablishmentConfirmText}
        onClose={() => setDeleteEstablishmentModalVisible(false)}
        onConfirm={confirmDeleteSelectedEstablishment}
      />
      <PlanUpgradeModal
        visible={proEstablishmentModalVisible}
        message={planUpgradeMessage}
        onClose={() => setProEstablishmentModalVisible(false)}
      />
    </View>
  );
}

export default function App() {
  return (
    <StartupErrorBoundary>
      <AppContent />
    </StartupErrorBoundary>
  );
}

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
