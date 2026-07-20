import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
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
import { useSriBackupRestore } from "../hooks/useSriBackupRestore";
import { useSriCompanyAssets } from "../hooks/useSriCompanyAssets";
import { useSriConnectionTest } from "../hooks/useSriConnectionTest";
import { useSriEmailTest } from "../hooks/useSriEmailTest";
import { useSriEstablishmentUiState } from "../hooks/useSriEstablishmentUiState";
import { useSriIssuerFormState } from "../hooks/useSriIssuerFormState";
import { useSriIssuerLookup } from "../hooks/useSriIssuerLookup";
import { useTechnicalLogsLoader } from "../hooks/useTechnicalLogsLoader";
import { AppData, Issuer, IssuerEstablishment, User } from "../types";
import { appLicenseStatus, canAccessDeveloperTools, compactLicenseStatusLabel } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import { showMessage } from "../utils/dialogs";
import { activeEstablishment, editableEstablishments, issuerWithEstablishment } from "../utils/establishments";
import { canUseEmissionScope, maxEmissionPointsForLicense } from "../utils/license";
import { buildIssuerAfterEstablishmentDeletion, buildNewEstablishmentForm, countDocumentsForEstablishment, selectedEditableEstablishment, validateDeleteEstablishmentConfirmation, validateDeleteEstablishmentRequest, validateNewEstablishmentDraft, validateSelectedEstablishmentPatch } from "../utils/sriEstablishmentEditor";
import { buildIssuerFromSriForm, validateSriIssuerSave } from "../utils/sriIssuerSave";
import { syncPatchToBackend } from "../utils/sync";
import { buildProductionChecklist } from "../validation";
export function SriScreen({ data, user, backendToken, getBackendToken, persist, onRefreshBackend }: { data: AppData; user: User; backendToken: string; getBackendToken: (backendUrl: string) => Promise<string>; persist: (data: AppData) => Promise<void>; onRefreshBackend: () => void }) {
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
  const establishments = useMemo(() => editableEstablishments(issuer), [issuer]);
  const selectedEstablishment = selectedEditableEstablishment(issuer, establishments);
  const canManageEstablishments = appLicenseStatus(license).active && maxEmissionPointsForLicense(license) > 1;
  const canViewDeveloperTools = canAccessDeveloperTools(user);
  const maxEmissionPoints = maxEmissionPointsForLicense(license);
  const auditLogs = data.auditLogs || [];
  const {
    assetStatus,
    assetStatusTone,
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
  const [pendingEnvironmentIssuer, setPendingEnvironmentIssuer] = useState<Issuer | null>(null);

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
    const nextData = appendAudit({ ...data, backendUrl, autoBackupEnabled, issuer: nextIssuer, license }, user, "SRI_CONFIG_UPDATED", "issuer", issuer.ruc, "Configuracion SRI actualizada", { environment: nextIssuer.environment, establishment: nextIssuer.establishment, emissionPoint: nextIssuer.emissionPoint, sequential, remissionSequential, creditNoteSequential, autoBackupEnabled, removedEstablishments: removedIds, establishmentsUpdatedAt: nextIssuer.establishmentsUpdatedAt });
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
    Alert.alert(
      "Configuracion guardada",
      nextIssuer.environment === "2"
        ? "Produccion activada. Los proximos comprobantes se enviaran al ambiente real del SRI."
        : "Pruebas activadas. Los proximos comprobantes se enviaran al ambiente de pruebas del SRI."
    );
  };

  const handleIssuerTaxChange = (nextIssuer: Issuer) => {
    if (nextIssuer.environment === issuer.environment) {
      setIssuer(nextIssuer);
      return;
    }

    const canChangeSriEnvironment = user.role === "admin" || user.supportAccess;
    if (!canChangeSriEnvironment) {
      Alert.alert("Accion restringida", "Solo el administrador o soporte tecnico puede cambiar el ambiente SRI.");
      return;
    }

    setPendingEnvironmentIssuer(nextIssuer);
  };

  const confirmIssuerEnvironmentChange = () => {
    if (!pendingEnvironmentIssuer) return;
    const environmentLabel = pendingEnvironmentIssuer.environment === "2" ? "PRODUCCION" : "PRUEBAS";
    setIssuer(pendingEnvironmentIssuer);
    setPendingEnvironmentIssuer(null);
    setEstablishmentStatus({
      tone: "info",
      message: `Ambiente ${environmentLabel} seleccionado. Presione Guardar emisor para aplicar el cambio.`
    });
  };

  return (
    <View style={styles.stack}>
      <CollapsibleSection title="Emisor SRI" defaultOpen>
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
        <IssuerTaxSettings issuer={issuer} onChange={handleIssuerTaxChange} />
        <IssuerServerSettings
          backendUrl={backendUrl}
          autoBackupEnabled={autoBackupEnabled}
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
        issuer={issuer}
        onCancelCertificateUpload={cancelCertificateUpload}
        onCertificatePasswordChange={setCertificatePassword}
        onConfirmCertificateUpload={() => { void confirmCertificateUpload(); }}
        onRefreshAssetsStatus={() => { void refreshAssetsStatus(true); }}
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
        visible={Boolean(pendingEnvironmentIssuer)}
        onRequestClose={() => setPendingEnvironmentIssuer(null)}
      >
        <View style={styles.environmentModalOverlay}>
          <View style={styles.environmentModalCard}>
            <Text style={styles.environmentModalTitle}>
              {pendingEnvironmentIssuer?.environment === "2" ? "Cambiar a PRODUCCION" : "Cambiar a PRUEBAS"}
            </Text>
            <Text style={styles.environmentModalText}>
              {pendingEnvironmentIssuer?.environment === "2"
                ? "Los proximos comprobantes se enviaran al ambiente real del SRI. Verifique firma, secuenciales y datos del emisor antes de guardar."
                : "Los proximos comprobantes se enviaran al ambiente de pruebas del SRI. No tendran validez tributaria real."}
            </Text>
            <Text style={styles.environmentModalHint}>Despues de confirmar, presione Guardar emisor.</Text>
            <View style={styles.environmentModalActions}>
              <Pressable style={[styles.environmentModalButton, styles.environmentModalCancel]} onPress={() => setPendingEnvironmentIssuer(null)}>
                <Text style={styles.environmentModalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.environmentModalButton, styles.environmentModalConfirm]} onPress={confirmIssuerEnvironmentChange}>
                <Text style={styles.environmentModalConfirmText}>Confirmar</Text>
              </Pressable>
            </View>
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
    gap: 12,
    maxWidth: 420,
    padding: 18,
    width: "100%"
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
