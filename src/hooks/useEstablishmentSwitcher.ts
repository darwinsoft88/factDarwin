import React, { useCallback } from "react";
import { Alert } from "react-native";
import { syncPatchToBackend } from "../utils/sync";
import { AppData, User } from "../types";
import { AppTab } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import { showMessage } from "../utils/dialogs";
import { issuerWithEstablishment, normalizedEstablishments } from "../utils/establishments";
import { maxEmissionPointsForLicense } from "../utils/license";

type UseEstablishmentSwitcherParams = {
  availableTabs: AppTab[];
  backendToken: string;
  backendTokenRef: React.MutableRefObject<string>;
  dataRef: React.MutableRefObject<AppData>;
  persist: (data: AppData) => Promise<void>;
  session: User | null;
  setAppMenuVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  setEstablishmentSwitcherVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setTab: React.Dispatch<React.SetStateAction<AppTab>>;
};

export function useEstablishmentSwitcher({
  availableTabs,
  backendToken,
  backendTokenRef,
  dataRef,
  persist,
  session,
  setAppMenuVisible,
  setData,
  setEstablishmentSwitcherVisible,
  setTab
}: UseEstablishmentSwitcherParams) {
  const switchActiveEstablishment = useCallback(async (establishmentId: string) => {
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
  }, [backendToken, backendTokenRef, dataRef, persist, session, setAppMenuVisible, setData, setEstablishmentSwitcherVisible]);

  const openAdminSettings = useCallback((focus: "configuracion" | "licencia") => {
    setAppMenuVisible(false);
    if (availableTabs.includes("sri")) {
      setTab("sri");
      return;
    }
    Alert.alert(focus === "licencia" ? "Licencia" : "Configuracion", "Esta seccion esta disponible para usuarios administradores.");
  }, [availableTabs, setAppMenuVisible, setTab]);

  return {
    openAdminSettings,
    switchActiveEstablishment
  };
}
