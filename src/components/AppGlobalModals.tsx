import React, { useState } from "react";
import { initialData } from "../database";
import { AppData, IssuerEstablishment, User } from "../types";
import { AppTab, canAccessDeveloperTools, compactLicenseStatusLabel, roleLabel } from "../utils/appAccess";
import { normalizedEstablishments } from "../utils/establishments";
import { SyncState } from "../utils/support";
import { AuthState } from "../hooks/useAuthState";
import { ModernAppMenuModal } from "./ModernAppMenuModal";
import { EstablishmentPickerModal } from "./EstablishmentPickerModal";
import { LicenseModal } from "./LicenseModal";
import { OnboardingModal } from "./OnboardingModal";
import { PasswordChangeModal } from "./PasswordChangeModal";
import { ProfileModal } from "./ProfileModal";
import { SupportModal } from "./SupportModal";
import { SyncCenterModal } from "./SyncCenterModal";
import { XmlPreviewModal } from "./XmlPreviewModal";

type SupportDiagnosticsState = {
  diagnosticText: string;
  loading: boolean;
  visible: boolean;
  close: () => void;
  open: () => void;
  refresh: () => Promise<void>;
  share: () => Promise<void>;
};

type AppGlobalModalsProps = {
  appMenuVisible: boolean;
  activeTab: AppTab;
  authState: AuthState;
  currentEstablishment: IssuerEstablishment;
  data: AppData;
  onboardingVisible: boolean;
  availableTabs: AppTab[];

  session: User;
  supportDiagnostics: SupportDiagnosticsState;
  licenseVisible: boolean;
  switchableEstablishments: IssuerEstablishment[];
  syncActionLoading: boolean;
  syncCenterVisible: boolean;
  syncState: SyncState;
  xmlPreview: string;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  biometricLoading: boolean;
  biometricError: string;
  chooseLoginEstablishment: (establishmentId: string) => Promise<void>;
  logout: () => void;
  onOpenAdminSettings: (focus: "configuracion" | "licencia") => void;
  onOpenSyncCenter: () => void;
  onRetryPendingSync: () => Promise<void>;
  onRunManualSync: () => Promise<void>;
  onSwitchActiveEstablishment: (establishmentId: string) => Promise<void>;
  onTestSyncServer: () => Promise<void>;
  setAppMenuVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setLicenseVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setOnboardingVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setSyncCenterVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setTab: React.Dispatch<React.SetStateAction<AppTab>>;
  setXmlPreview: React.Dispatch<React.SetStateAction<string>>;
  submitNewPassword: () => Promise<void>;
  onToggleBiometric: () => void;
  onWelcomeComplete: () => void;
};

export function AppGlobalModals({
  appMenuVisible,
  activeTab,
  authState,
  chooseLoginEstablishment,
  currentEstablishment,
  data,
  availableTabs,
  logout,
  licenseVisible,
  onOpenAdminSettings,
  onOpenSyncCenter,
  onRetryPendingSync,
  onRunManualSync,
  onSwitchActiveEstablishment,
  onTestSyncServer,
  onboardingVisible,
  session,
  setAppMenuVisible,
  setLicenseVisible,
  setOnboardingVisible,
  setSyncCenterVisible,
  setTab,
  setXmlPreview,
  submitNewPassword,
  supportDiagnostics,
  switchableEstablishments,
  syncActionLoading,
  syncCenterVisible,
  syncState,
  xmlPreview
  ,biometricAvailable
  ,biometricEnabled
  ,biometricLoading
  ,biometricError
  ,onToggleBiometric
  ,onWelcomeComplete
}: AppGlobalModalsProps) {
  const [profileVisible, setProfileVisible] = useState(false);
  const closeProfileAnd = (action: () => void) => {
    setProfileVisible(false);
    action();
  };

  return (
    <>
      <ModernAppMenuModal
        visible={appMenuVisible}
        activeTab={activeTab}
        userLabel={session.name || roleLabel(session.role)}
        licenseLabel={compactLicenseStatusLabel(data.license)}
        establishmentLabel={`${currentEstablishment.name} ${currentEstablishment.establishment}-${currentEstablishment.emissionPoint}`}
        syncState={syncState}
        pendingCount={(data.pendingSync || []).length}
        canSwitchEstablishment={switchableEstablishments.length > 1}
        availableTabs={availableTabs}
        onNavigate={setTab}
        onClose={() => setAppMenuVisible(false)}
        onSync={() => { void onRunManualSync(); }}
        onOpenSyncCenter={onOpenSyncCenter}
        onSwitchEstablishment={() => authState.setEstablishmentSwitcherVisible(true)}
        onOpenSettings={() => onOpenAdminSettings("configuracion")}
        onOpenLicense={() => {
          setAppMenuVisible(false);
          setLicenseVisible(true);
        }}
        onOpenProfile={() => {
          setAppMenuVisible(false);
          setProfileVisible(true);
        }}
        onOpenSupport={supportDiagnostics.open}
        onLogout={logout}
      />

      <ProfileModal
        visible={profileVisible}
        user={session}
        issuer={data.issuer}
        establishment={currentEstablishment}
        license={data.license || initialData.license!}
        canSwitchEstablishment={switchableEstablishments.length > 1}
        biometricAvailable={biometricAvailable}
        biometricEnabled={biometricEnabled}
        biometricLoading={biometricLoading}
        biometricError={biometricError}
        onClose={() => setProfileVisible(false)}
        onChangePassword={() => closeProfileAnd(() => {
          authState.setNewPasswordForm({ password: "", confirm: "" });
          authState.setPasswordChangeStatus(null);
          authState.setNewPasswordVisible(false);
          authState.setPasswordChangeVisible(true);
        })}
        onSwitchEstablishment={() => closeProfileAnd(() => authState.setEstablishmentSwitcherVisible(true))}
        onOpenLicense={() => closeProfileAnd(() => setLicenseVisible(true))}
        onOpenSupport={() => closeProfileAnd(supportDiagnostics.open)}
        onToggleBiometric={onToggleBiometric}
      />

      <LicenseModal
        visible={licenseVisible}
        license={data.license || initialData.license!}
        issuer={data.issuer}
        onClose={() => setLicenseVisible(false)}
      />

      <SyncCenterModal
        visible={syncCenterVisible}
        data={data}
        syncState={syncState}
        syncActionLoading={syncActionLoading}
        onClose={() => setSyncCenterVisible(false)}
        onRetryPending={() => { void onRetryPendingSync(); }}
        onReviewDocuments={() => {
          setSyncCenterVisible(false);
          setTab("documentos");
        }}
        onTestServer={() => { void onTestSyncServer(); }}
      />

      <SupportModal
        visible={supportDiagnostics.visible}
        loading={supportDiagnostics.loading}
        diagnosticText={supportDiagnostics.diagnosticText}
        showTechnicalDetails={canAccessDeveloperTools(session)}
        onClose={supportDiagnostics.close}
        onRefresh={() => { void supportDiagnostics.refresh(); }}
        onShare={() => { void supportDiagnostics.share(); }}
      />

      <EstablishmentPickerModal
        visible={authState.establishmentSwitcherVisible}
        title="Cambiar establecimiento"
        subtitle="Los proximos documentos usaran el punto seleccionado."
        establishments={switchableEstablishments}
        activeId={currentEstablishment.id}
        cancelLabel="Cerrar"
        cancelVariant="cancel"
        onSelect={(id: string) => { void onSwitchActiveEstablishment(id); }}
        onCancel={() => authState.setEstablishmentSwitcherVisible(false)}
      />

      <OnboardingModal
        visible={onboardingVisible}
        onConfigure={() => { onWelcomeComplete(); setOnboardingVisible(false); setTab("dashboard"); }}
        onClose={() => { onWelcomeComplete(); setOnboardingVisible(false); setTab("dashboard"); }}
      />

      <EstablishmentPickerModal
        visible={authState.establishmentOptionsVisible}
        title="Elija establecimiento"
        subtitle="Seleccione con que sucursal o punto de emision va a trabajar."
        establishments={authState.pendingLogin ? normalizedEstablishments(authState.pendingLogin.data.issuer).filter((item) => item.active !== false) : []}
        cancelLabel="Cancelar"
        onSelect={(id: string) => { void chooseLoginEstablishment(id); }}
        onCancel={() => {
          authState.setPendingLogin(null);
          authState.setEstablishmentOptionsVisible(false);
        }}
      />

      <PasswordChangeModal
        visible={authState.passwordChangeVisible}
        password={authState.newPasswordForm.password}
        confirm={authState.newPasswordForm.confirm}
        passwordVisible={authState.newPasswordVisible}
        status={authState.passwordChangeStatus}
        saving={authState.changingPassword}
        onPasswordChange={(value) => authState.setNewPasswordForm({ ...authState.newPasswordForm, password: value })}
        onConfirmChange={(value) => authState.setNewPasswordForm({ ...authState.newPasswordForm, confirm: value })}
        onToggleVisible={() => authState.setNewPasswordVisible((visible) => !visible)}
        onSubmit={() => { void submitNewPassword(); }}
        required={session.mustChangePassword === true}
        onClose={() => {
          authState.setPasswordChangeVisible(false);
          authState.setPasswordChangeStatus(null);
          authState.setNewPasswordForm({ password: "", confirm: "" });
        }}
      />

      <XmlPreviewModal value={xmlPreview} onClose={() => setXmlPreview("")} />
    </>
  );
}
