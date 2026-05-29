import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import { Section } from "../components/common";
import { ActivePlanInfo } from "../components/ActivePlanInfo";
import { AuditSection } from "../components/AuditSection";
import { CompanyAssetsSection } from "../components/CompanyAssetsSection";
import { DatabaseSyncSection } from "../components/DatabaseSyncSection";
import { DeleteEstablishmentModal } from "../components/DeleteEstablishmentModal";
import { EstablishmentActions } from "../components/EstablishmentActions";
import { IntegrationStatusInfo } from "../components/IntegrationStatusInfo";
import { IssuerEstablishmentFields } from "../components/IssuerEstablishmentFields";
import { IssuerIdentityFields } from "../components/IssuerIdentityFields";
import { IssuerServerSettings } from "../components/IssuerServerSettings";
import { IssuerTaxSettings } from "../components/IssuerTaxSettings";
import { NewEstablishmentModal } from "../components/NewEstablishmentModal";
import { PlanLimitCard } from "../components/PlanLimitCard";
import { PlanUpgradeModal } from "../components/PlanUpgradeModal";
import { ProductionStatusSection } from "../components/ProductionStatusSection";
import { TechnicalLogsSection } from "../components/TechnicalLogsSection";
import { TechnicalLog, backupAppData, checkBackendHealth, getCompanyAssetsStatus, getTechnicalLogs, lookupIdentityData, restoreAppData, sendTestEmail, uploadCompanyCertificate, uploadCompanyLogo } from "../services/backend";
import { LIST_BATCH_SIZE } from "../constants/app";
import { initialData } from "../storage";
import { AppData, AppLicense, IssuerEstablishment, User } from "../types";
import { appLicenseStatus, compactLicenseStatusLabel } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import { addedEstablishmentIds } from "../utils/dataMerge";
import { showMessage } from "../utils/dialogs";
import { activeEstablishment, applyIdentityToIssuer, editableEstablishments, issuerWithEstablishment, normalizedEstablishments, normalizeThreeDigits } from "../utils/establishments";
import { pickWebFile, readWebFileBase64 } from "../utils/files";
import { formatShortDate } from "../utils/format";
import { canUseEmissionScope, maxEmissionPointsForLicense } from "../utils/license";
import { formatBackendHealth, formatBackupSummary, summarizeAppData } from "../utils/support";
import { syncPatchToBackend } from "../utils/sync";
import { buildProductionChecklist, sanitizeAppData, validateIssuer } from "../validation";
export function SriScreen({ data, user, backendToken, getBackendToken, persist, onRefreshBackend }: { data: AppData; user: User; backendToken: string; getBackendToken: (backendUrl: string) => Promise<string>; persist: (data: AppData) => Promise<void>; onRefreshBackend: () => void }) {
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

const styles = StyleSheet.create({
  stack: {
    gap: 12
  }
});
