import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { CollapsibleSection } from "../components/common";
import { DeleteEstablishmentModal } from "../components/DeleteEstablishmentModal";
import { EstablishmentActions } from "../components/EstablishmentActions";
import { IssuerEstablishmentFields } from "../components/IssuerEstablishmentFields";
import { IssuerIdentityFields } from "../components/IssuerIdentityFields";
import { IssuerServerSettings } from "../components/IssuerServerSettings";
import { IssuerTaxSettings } from "../components/IssuerTaxSettings";
import { NewEstablishmentModal } from "../components/NewEstablishmentModal";
import { PlanLimitCard } from "../components/PlanLimitCard";
import { PlanUpgradeModal } from "../components/PlanUpgradeModal";
import { SriAssetsStatusSections } from "../components/SriAssetsStatusSections";
import { SriDeveloperToolsSection } from "../components/SriDeveloperToolsSection";
import { SriEnvironmentExperienceCard } from "../components/SriEnvironmentExperienceCard";
import { useSriBackupRestore } from "../hooks/useSriBackupRestore";
import { useSriCompanyAssets } from "../hooks/useSriCompanyAssets";
import { useSriConnectionTest } from "../hooks/useSriConnectionTest";
import { useSriEmailTest } from "../hooks/useSriEmailTest";
import { useSriEstablishmentUiState } from "../hooks/useSriEstablishmentUiState";
import { useSriIssuerFormState } from "../hooks/useSriIssuerFormState";
import { useSriIssuerLookup } from "../hooks/useSriIssuerLookup";
import { useTechnicalLogsLoader } from "../hooks/useTechnicalLogsLoader";
import { getCompanySriEnvironment, updateCompanySriEnvironment } from "../services/backend";
import { AppData, Issuer, IssuerEstablishment, User } from "../types";
import { appLicenseStatus, canAccessDeveloperTools, compactLicenseStatusLabel } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import { showError, showMessage, showSuccess, showWarning } from "../utils/dialogs";
import { activeEstablishment, editableEstablishments, issuerWithEstablishment } from "../utils/establishments";
import { canUseEmissionScope, maxEmissionPointsForLicense } from "../utils/license";
import { buildIssuerAfterEstablishmentDeletion, buildNewEstablishmentForm, countDocumentsForEstablishment, selectedEditableEstablishment, validateDeleteEstablishmentConfirmation, validateDeleteEstablishmentRequest, validateNewEstablishmentDraft, validateSelectedEstablishmentPatch } from "../utils/sriEstablishmentEditor";
import { buildIssuerFromSriForm, validateSriIssuerSave } from "../utils/sriIssuerSave";
import { canActivateRealBilling, changeSriEnvironmentAuthoritatively } from "../utils/sriEnvironmentActivation";
import { syncPatchToBackend, syncPatchToBackendResult } from "../utils/sync";
import { buildProductionChecklist } from "../validation";
import { useAppTheme } from "../theme/AppTheme";
export function SriScreen({ data, user, backendToken, getBackendToken, persist, onRefreshBackend }: { data: AppData; user: User; backendToken: string; getBackendToken: (backendUrl: string) => Promise<string>; persist: (data: AppData) => Promise<void>; onRefreshBackend: () => void }) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 20 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 20 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveModalMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);
  const {
    autoBackupEnabled,
    backendUrl,
    creditNoteSequentialText,
    emissionPointText,
    establishmentCodeText,
    establishmentNameText,
    issuer,
    license,
    remissionSequentialText,
    sequentialText,
    setAutoBackupEnabled,
    setBackendUrl,
    setCreditNoteSequentialText,
    setEmissionPointText,
    setEstablishmentCodeText,
    setEstablishmentNameText,
    setIssuer,
    setLicense,
    setRemissionSequentialText,
    setSequentialText
  } = useSriIssuerFormState(data);
  const {
    deleteEstablishmentConfirmText,
    deleteEstablishmentModalVisible,
    deletingEstablishment,
    establishmentForm,
    establishmentModalVisible,
    establishmentStatus,
    planUpgradeMessage,
    proEstablishmentModalVisible,
    setDeleteEstablishmentConfirmText,
    setDeleteEstablishmentModalVisible,
    setDeletingEstablishment,
    setEstablishmentForm,
    setEstablishmentModalVisible,
    setEstablishmentStatus,
    setPlanUpgradeMessage,
    setProEstablishmentModalVisible
  } = useSriEstablishmentUiState();
  const { checkingConnection, connectionResult, testConnection } = useSriConnectionTest({ backendUrl, issuer });
  const { loadingTechnicalLogs, loadTechnicalLogs, technicalLogs } = useTechnicalLogsLoader({ backendToken, backendUrl });
  const { testingEmail, testCompanyEmail } = useSriEmailTest({ backendToken, backendUrl, issuer });
  const { lookingUpIssuer, lookupIssuerRuc } = useSriIssuerLookup({
    backendToken,
    backendUrl,
    data,
    getBackendToken,
    issuer,
    setCreditNoteSequentialText,
    setEstablishmentStatus,
    setIssuer,
    setRemissionSequentialText,
    setSequentialText
  });
  const productionChecklist = useMemo(() => buildProductionChecklist({ ...issuer, sequential: Number(sequentialText), remissionSequential: Number(remissionSequentialText), creditNoteSequential: Number(creditNoteSequentialText) }, backendUrl, connectionResult), [backendUrl, connectionResult, creditNoteSequentialText, issuer, remissionSequentialText, sequentialText]);
  const serverInTestMode = connectionResult.includes("Ambiente backend por defecto: test") && connectionResult.includes("Envio real al SRI: DESACTIVADO");
  const establishments = useMemo(() => editableEstablishments(issuer), [issuer]);
  const selectedEstablishment = selectedEditableEstablishment(issuer, establishments);
  const canManageEstablishments = appLicenseStatus(license).active && maxEmissionPointsForLicense(license) > 1;
  const canViewDeveloperTools = canAccessDeveloperTools(user);
  const maxEmissionPoints = maxEmissionPointsForLicense(license);
  const auditLogs = data.auditLogs || [];
  const {
    assetStatus,
    assetStatusTone,
    assetsStatus,
    cancelCertificateUpload,
    certificatePassword,
    certificateUploadModalVisible,
    checkingAssetStatus,
    confirmCertificateUpload,
    pendingCertificateFile,
    refreshAssetsStatus,
    setCertificatePassword,
    uploadCertificateFromWeb,
    uploadLogoFromWeb,
    uploadingAsset
  } = useSriCompanyAssets({
    autoBackupEnabled,
    backendToken,
    backendUrl,
    creditNoteSequentialText,
    data,
    issuer,
    remissionSequentialText,
    sequentialText,
    setIssuer,
    persist,
    user
  });
  const [pendingEnvironment, setPendingEnvironment] = useState<"1" | "2" | null>(null);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [issuerOpen, setIssuerOpen] = useState(true);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [changingEnvironment, setChangingEnvironment] = useState(false);
  const [savingIssuer, setSavingIssuer] = useState(false);
  const savingIssuerRef = useRef(false);

  const openPlanUpgradeModal = (message?: string) => {
    setPlanUpgradeMessage(message || `Su plan actual permite ${maxEmissionPoints} punto(s) de emision. Active Pro para manejar sucursales, puntos adicionales y operacion multi punto.`);
    setProEstablishmentModalVisible(true);
  };

  useEffect(() => {
    setEstablishmentNameText(selectedEstablishment.name);
    setEstablishmentCodeText(selectedEstablishment.establishment);
    setEmissionPointText(selectedEstablishment.emissionPoint);
  }, [selectedEstablishment.emissionPoint, selectedEstablishment.establishment, selectedEstablishment.id, selectedEstablishment.name, setEmissionPointText, setEstablishmentCodeText, setEstablishmentNameText]);

  const issuerFromForm = () => {
    return buildIssuerFromSriForm({
      establishments,
      form: {
        establishmentName: establishmentNameText,
        establishmentCode: establishmentCodeText,
        emissionPoint: emissionPointText,
        sequential: sequentialText,
        remissionSequential: remissionSequentialText,
        creditNoteSequential: creditNoteSequentialText
      },
      issuer,
      selectedEstablishment
    });
  };

  const { backupData, restoreData, syncing } = useSriBackupRestore({
    autoBackupEnabled,
    backendToken,
    backendUrl,
    buildIssuerFromForm: issuerFromForm,
    creditNoteSequentialText,
    data,
    issuer,
    license,
    remissionSequentialText,
    sequentialText,
    persist,
    setAutoBackupEnabled,
    setBackendUrl,
    setCreditNoteSequentialText,
    setIssuer,
    setLicense,
    setRemissionSequentialText,
    setSequentialText,
    user
  });

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
    setEstablishmentForm(buildNewEstablishmentForm(establishments, issuer.address));
    setEstablishmentModalVisible(true);
  };

  const saveNewEstablishment = async () => {
    const validation = validateNewEstablishmentDraft({
      canManage: canManageEstablishments,
      establishments,
      form: establishmentForm,
      issuerAddress: issuer.address,
      maxEmissionPoints
    });
    if (!validation.ok) {
      const statusMessage = validation.code === "duplicate" ? `Ya existe el establecimiento ${validation.message.match(/\d{3}-\d{3}/)?.[0] || ""}.`.trim() : validation.message;
      setEstablishmentStatus({ tone: "error", message: statusMessage });
      if (validation.code === "plan_required" || validation.code === "limit_reached") {
        openPlanUpgradeModal(validation.message);
        return;
      }
      Alert.alert(validation.title, validation.message);
      return;
    }
    const { id, name, establishment, emissionPoint, address, sequential, remissionSequential, creditNoteSequential } = validation.value;
    const next: IssuerEstablishment = {
      id,
      name,
      establishment,
      emissionPoint,
      address,
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
    const validation = validateSelectedEstablishmentPatch({
      documentCount: selectedEstablishmentDocumentCount,
      establishments,
      patch,
      selectedEstablishment
    });
    if (!validation.ok) {
      setEstablishmentStatus({ tone: "error", message: validation.message });
      if (validation.code === "protected") Alert.alert(validation.title, validation.message);
      return;
    }
    const { baseId, nextEstablishment, nextEmissionPoint, nextId } = validation.value;
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
    return countDocumentsForEstablishment(data, selectedEstablishment.id);
  }, [data, selectedEstablishment.id]);

  const requestDeleteSelectedEstablishment = () => {
    const validation = validateDeleteEstablishmentRequest({
      documentCount: selectedEstablishmentDocumentCount,
      establishments,
      selectedEstablishment
    });
    if (!validation.ok) {
      setEstablishmentStatus({ tone: "error", message: validation.message });
      if (validation.code === "protected") Alert.alert(validation.title, validation.message);
      return;
    }
    setDeleteEstablishmentConfirmText("");
    setDeleteEstablishmentModalVisible(true);
  };

  const confirmDeleteSelectedEstablishment = async () => {
    if (deletingEstablishment) return;
    const validation = validateDeleteEstablishmentConfirmation({
      confirmText: deleteEstablishmentConfirmText,
      documentCount: selectedEstablishmentDocumentCount,
      selectedEstablishment
    });
    if (!validation.ok) {
      setEstablishmentStatus({ tone: "error", message: validation.message });
      if (validation.code === "protected") Alert.alert(validation.title, validation.message);
      return;
    }

    const now = new Date().toISOString();
    const { deleted, next, nextIssuer } = buildIssuerAfterEstablishmentDeletion({ establishments, issuer, now, selectedEstablishment });
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
    const nextIssuer = issuerFromForm();
    const validation = validateSriIssuerSave({
      backendUrl,
      currentIssuer: data.issuer,
      documentCount: selectedEstablishmentDocumentCount,
      form: {
        establishmentName: establishmentNameText,
        establishmentCode: establishmentCodeText,
        emissionPoint: emissionPointText,
        sequential: sequentialText,
        remissionSequential: remissionSequentialText,
        creditNoteSequential: creditNoteSequentialText
      },
      license,
      nextIssuer,
      selectedEstablishment
    });
    if (!validation.ok) {
      if (validation.code === "issuer_invalid" || validation.code === "name_required" || validation.code === "point_invalid" || validation.code === "sequential_invalid" || validation.code === "remission_sequential_invalid" || validation.code === "credit_note_sequential_invalid") {
        showMessage(validation.title, validation.message);
        return;
      }
      setEstablishmentStatus({ tone: "error", message: validation.message });
      if (validation.code === "license_limit" || validation.code === "license_scope") {
        openPlanUpgradeModal(validation.message);
        return;
      }
      if (validation.code === "point_protected" || validation.code === "new_point_blocked") Alert.alert(validation.title, validation.message);
      return;
    }
    const { creditNoteSequential, remissionSequential, removedIds, sequential } = validation.value;
    if (savingIssuerRef.current) return;
    savingIssuerRef.current = true;
    setSavingIssuer(true);
    try {
      let canonicalEnvironment = await getCompanySriEnvironment(data.backendUrl, backendToken);
      if (nextIssuer.environment !== data.issuer.environment) {
        canonicalEnvironment = await updateCompanySriEnvironment(data.backendUrl, nextIssuer.environment, canonicalEnvironment.environmentVersion, backendToken);
      }
      const confirmedIssuer: Issuer = { ...nextIssuer, environment: canonicalEnvironment.environment, environmentVersion: canonicalEnvironment.environmentVersion };
      const nextData = appendAudit({ ...data, backendUrl, autoBackupEnabled, issuer: confirmedIssuer, license }, user, "SRI_CONFIG_UPDATED", "issuer", issuer.ruc, "Configuracion SRI actualizada", { environment: confirmedIssuer.environment, environmentVersion: confirmedIssuer.environmentVersion, establishment: confirmedIssuer.establishment, emissionPoint: confirmedIssuer.emissionPoint, sequential, remissionSequential, creditNoteSequential, autoBackupEnabled, removedEstablishments: removedIds, establishmentsUpdatedAt: confirmedIssuer.establishmentsUpdatedAt });
      await persist(nextData);
      const syncResult = await syncPatchToBackendResult(data.backendUrl, backendToken, { baseData: data, issuer: confirmedIssuer, auditLogs: nextData.auditLogs.slice(0, 1) }, "Configuracion SRI pendiente de sincronizar");
      setIssuer(confirmedIssuer);
      setSequentialText(String(sequential));
      setRemissionSequentialText(String(remissionSequential));
      setCreditNoteSequentialText(String(creditNoteSequential));
      setEstablishmentNameText(activeEstablishment(confirmedIssuer).name);
      setEstablishmentCodeText(confirmedIssuer.establishment);
      setEmissionPointText(confirmedIssuer.emissionPoint);

      const environmentMessage = confirmedIssuer.environment === "2"
        ? "Produccion activada. Los proximos comprobantes se enviaran al ambiente real del SRI."
        : "Pruebas activadas. Los proximos comprobantes se enviaran al ambiente de pruebas del SRI.";
      if (syncResult.confirmed && !syncResult.localCleanupPending) {
        setEstablishmentStatus({ tone: "success", message: environmentMessage });
        showSuccess("Configuracion guardada", environmentMessage);
      } else {
        const pendingMessage = syncResult.confirmed
          ? `${environmentMessage} La limpieza local quedo pendiente y se completara al sincronizar.`
          : `${environmentMessage} La configuracion complementaria quedo pendiente de sincronizar.${syncResult.errorMessage ? ` ${syncResult.errorMessage}` : ""}`;
        setEstablishmentStatus({ tone: "info", message: pendingMessage });
        showWarning("Configuracion guardada", pendingMessage);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible guardar la configuracion del emisor.";
      setEstablishmentStatus({ tone: "error", message });
      showError("No se pudo guardar el emisor", message);
    } finally {
      savingIssuerRef.current = false;
      setSavingIssuer(false);
    }
  };

  const requestEnvironmentChange = (target: "1" | "2", checkedChecklist = productionChecklist) => {
    if (user.role !== "admin" && !user.supportAccess) {
      Alert.alert("Acción restringida", "Solo el administrador o soporte técnico puede cambiar la facturación electrónica.");
      return;
    }
    if (target === "2" && !canActivateRealBilling(checkedChecklist)) {
      showWarning("Aún no puedes activar la facturación real", "Completa los requisitos indicados: datos tributarios, firma electrónica y comprobación de conexión.");
      return;
    }
    setPendingEnvironment(target);
  };

  const checkConnectionForSummary = async () => {
    const checked = await testConnection({ showAlert: false });
    if (!checked.ok) showWarning("No se pudo verificar el servidor", "Revisa tu conexión a internet e inténtalo nuevamente. La facturación real no se activó ni se cambió ninguna configuración.");
  };

  const confirmIssuerEnvironmentChange = async () => {
    if (!pendingEnvironment || changingEnvironment) return;
    const target = pendingEnvironment;
    setChangingEnvironment(true);
    try {
      await changeSriEnvironmentAuthoritatively({
        data,
        target,
        backendToken,
        commit: async (canonicalData, canonical) => {
          const summary = target === "2" ? "Facturación real activada" : "Modo de prueba activado";
          const audited = appendAudit(canonicalData, user, "SRI_ENVIRONMENT_CHANGED", "issuer", data.issuer.ruc, summary, { environment: canonical.environment, environmentVersion: canonical.environmentVersion });
          await persist(audited);
          await syncPatchToBackendResult(data.backendUrl, backendToken, { baseData: data, issuer: canonicalData.issuer, auditLogs: audited.auditLogs.slice(0, 1) }, `${summary} pendiente de sincronizar`);
          setIssuer(canonicalData.issuer);
        }
      });
      const message = target === "2"
        ? "Facturación real activada. Los próximos comprobantes electrónicos podrán enviarse oficialmente al SRI."
        : "Modo de prueba activado. Los próximos comprobantes se enviarán al ambiente de pruebas y no tendrán validez tributaria real.";
      setEstablishmentStatus({ tone: "success", message });
      showSuccess(target === "2" ? "Facturación real activa" : "Modo de prueba activo", message);
      setPendingEnvironment(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible confirmar el cambio con el servidor.";
      setEstablishmentStatus({ tone: "error", message });
      showError("No se cambió el ambiente", `${message} La configuración local se conservó sin cambios.`);
    } finally {
      setChangingEnvironment(false);
    }
  };

  return (
    <View style={styles.stack}>
      <SriEnvironmentExperienceCard
        issuer={issuer}
        checklist={productionChecklist}
        certificate={assetsStatus?.certificate}
        changing={changingEnvironment}
        checking={checkingConnection}
        serverInTestMode={serverInTestMode}
        onActivate={() => requestEnvironmentChange("2")}
        onCheckConnection={() => { void checkConnectionForSummary(); }}
        onOpenCertificate={() => setAssetsOpen(true)}
        onOpenIssuer={() => setIssuerOpen(true)}
      />
      <CollapsibleSection title="Emisor SRI" open={issuerOpen} onOpenChange={setIssuerOpen}>
        <IssuerIdentityFields issuer={issuer} lookingUpIssuer={lookingUpIssuer} onChange={setIssuer} onLookupRuc={() => { void lookupIssuerRuc(); }} />
        <IssuerTaxSettings issuer={issuer} onChange={setIssuer} />
        <View style={[styles.establishmentCard, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}>
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
        </View>
        <IssuerServerSettings
          backendUrl={backendUrl}
          autoBackupEnabled={autoBackupEnabled}
          savingIssuer={savingIssuer}
          checkingConnection={checkingConnection}
          testingEmail={testingEmail}
          connectionResult={connectionResult}
          showAdvancedServerSettings={canViewDeveloperTools}
          onBackendUrlChange={setBackendUrl}
          onAutoBackupChange={setAutoBackupEnabled}
          onSave={save}
          onTestConnection={testConnection}
          onTestEmail={testCompanyEmail}
        />
      </CollapsibleSection>
      <SriAssetsStatusSections
        assetStatus={assetStatus}
        assetStatusTone={assetStatusTone}
        certificateModalVisible={certificateUploadModalVisible}
        certificatePassword={certificatePassword}
        checkingAssetStatus={checkingAssetStatus}
        checklist={productionChecklist}
        changingEnvironment={changingEnvironment}
        diagnosticOpen={diagnosticOpen}
        assetsOpen={assetsOpen}
        issuer={issuer}
        onCancelCertificateUpload={cancelCertificateUpload}
        onCertificatePasswordChange={setCertificatePassword}
        onConfirmCertificateUpload={() => { void confirmCertificateUpload(); }}
        onRefreshAssetsStatus={() => { void refreshAssetsStatus(true); }}
        onReturnToTests={() => requestEnvironmentChange("1")}
        onDiagnosticOpenChange={setDiagnosticOpen}
        onAssetsOpenChange={setAssetsOpen}
        onUploadCertificate={uploadCertificateFromWeb}
        onUploadLogo={uploadLogoFromWeb}
        pendingCertificateName={pendingCertificateFile?.fileName || ""}
        uploadingAsset={uploadingAsset}
      />
      <SriDeveloperToolsSection
        auditLogs={auditLogs}
        canView={canViewDeveloperTools}
        data={data}
        issuer={issuer}
        loadingTechnicalLogs={loadingTechnicalLogs}
        onBackup={backupData}
        onLoadTechnicalLogs={loadTechnicalLogs}
        onRefreshBackend={onRefreshBackend}
        onRestore={restoreData}
        syncing={syncing}
        technicalLogs={technicalLogs}
      />
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
      <Modal
        animationType="fade"
        transparent
        visible={Boolean(pendingEnvironment)}
        onRequestClose={() => { if (!changingEnvironment) setPendingEnvironment(null); }}
      >
        <View style={[styles.environmentModalOverlay, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]}>
          <View style={[styles.environmentModalCard, { backgroundColor: theme.colors.surface }, Platform.OS !== "web" && { maxHeight: adaptiveModalMaxHeight, flexShrink: 1 }]}>
            <ScrollView contentContainerStyle={styles.environmentModalContent}>
            <Text style={[styles.environmentModalTitle, { color: theme.colors.text }]}>
              {pendingEnvironment === "2" ? "Activar facturación real" : "Volver al modo de prueba"}
            </Text>
            <Text style={[styles.environmentModalText, { color: theme.colors.textMuted }]}>
              {pendingEnvironment === "2"
                ? `Desde este momento los comprobantes electrónicos que emitas podrán enviarse oficialmente al SRI. Empresa: ${issuer.businessName}. RUC: ${issuer.ruc}. Establecimiento ${issuer.establishment}, punto de emisión ${issuer.emissionPoint}.`
                : "Los próximos comprobantes se enviarán al ambiente de pruebas del SRI y no tendrán validez tributaria real. Los documentos ya emitidos no se modifican."}
            </Text>
            <Text style={[styles.environmentModalHint, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.borderStrong, color: theme.colors.primary }]}>{pendingEnvironment === "2" ? "Este cambio requiere conexión y confirmación del servidor." : "Acción avanzada: confirma únicamente si necesitas volver al ambiente de pruebas."}</Text>
            <View style={styles.environmentModalActions}>
              <Pressable disabled={changingEnvironment} style={[styles.environmentModalButton, styles.environmentModalCancel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong }]} onPress={() => setPendingEnvironment(null)}>
                <Text style={[styles.environmentModalCancelText, { color: theme.colors.text }]}>Cancelar</Text>
              </Pressable>
              <Pressable disabled={changingEnvironment} style={[styles.environmentModalButton, styles.environmentModalConfirm, { backgroundColor: theme.colors.primary }, changingEnvironment && { opacity: 0.55 }]} onPress={() => { void confirmIssuerEnvironmentChange(); }}>
                <Text style={[styles.environmentModalConfirmText, { color: theme.colors.onPrimary }]}>{changingEnvironment ? "Confirmando..." : pendingEnvironment === "2" ? "Activar facturación real" : "Volver a modo de prueba"}</Text>
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  },
  establishmentCard: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  environmentModalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    flex: 1,
    justifyContent: "center",
    padding: 20
  },
  environmentModalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    maxWidth: 420,
    overflow: "hidden",
    width: "100%"
  },
  environmentModalContent: {
    gap: 12,
    padding: 18
  },
  environmentModalTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "900"
  },
  environmentModalText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  environmentModalHint: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 12,
    borderWidth: 1,
    color: "#047857",
    fontSize: 13,
    fontWeight: "900",
    padding: 10
  },
  environmentModalActions: {
    flexDirection: "row",
    gap: 10
  },
  environmentModalButton: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 12
  },
  environmentModalCancel: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderWidth: 1
  },
  environmentModalConfirm: {
    backgroundColor: "#0f766e"
  },
  environmentModalCancelText: {
    color: "#334155",
    fontWeight: "900"
  },
  environmentModalConfirmText: {
    color: "#ffffff",
    fontWeight: "900"
  }
});
