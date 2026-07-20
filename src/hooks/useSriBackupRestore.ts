import { Dispatch, SetStateAction, useState } from "react";
import { Alert } from "react-native";
import { backupAppData, restoreAppData } from "../services/backend";
import { initialData } from "../database";
import { AppData, AppLicense, Issuer, User } from "../types";
import { appendAudit } from "../utils/audit";
import { addedEstablishmentIds } from "../utils/dataMerge";
import { showMessage } from "../utils/dialogs";
import { formatBackupSummary, summarizeAppData } from "../utils/support";
import { sanitizeAppData, validateIssuer } from "../validation";

type UseSriBackupRestoreParams = {
  autoBackupEnabled: boolean;
  backendToken: string;
  backendUrl: string;
  buildIssuerFromForm: () => Issuer;
  creditNoteSequentialText: string;
  data: AppData;
  issuer: Issuer;
  license: AppLicense;
  remissionSequentialText: string;
  sequentialText: string;
  persist: (data: AppData) => Promise<void>;
  setAutoBackupEnabled: Dispatch<SetStateAction<boolean>>;
  setBackendUrl: Dispatch<SetStateAction<string>>;
  setCreditNoteSequentialText: Dispatch<SetStateAction<string>>;
  setIssuer: Dispatch<SetStateAction<Issuer>>;
  setLicense: Dispatch<SetStateAction<AppLicense>>;
  setRemissionSequentialText: Dispatch<SetStateAction<string>>;
  setSequentialText: Dispatch<SetStateAction<string>>;
  user: User;
};

export function useSriBackupRestore({
  autoBackupEnabled,
  backendToken,
  backendUrl,
  buildIssuerFromForm,
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
}: UseSriBackupRestoreParams) {
  const [syncing, setSyncing] = useState(false);

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
      const nextIssuer = buildIssuerFromForm();
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

  return {
    backupData,
    restoreData,
    syncing
  };
}
