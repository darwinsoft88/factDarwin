import { useMemo } from "react";
import { AppData } from "../types";
import { appLicenseStatus } from "../utils/appAccess";
import { activeEstablishment, normalizedEstablishments } from "../utils/establishments";
import { maxEmissionPointsForLicense } from "../utils/license";
import { formatSyncStatus, SyncState } from "../utils/support";

export function useAppShellState(data: AppData, syncState: SyncState) {
  return useMemo(() => {
    const licenseState = appLicenseStatus(data.license);
    const syncNotice = syncState === "synced" && (data.pendingSync || []).length === 0 && data.autoBackupEnabled !== false
      ? ""
      : formatSyncStatus(syncState, data);
    const currentEstablishment = activeEstablishment(data.issuer);
    const connectedCompanyLabel = data.issuer.tradeName || data.issuer.businessName || data.issuer.ruc || "Empresa";
    const currentEstablishmentLabel = `${currentEstablishment.name} ${currentEstablishment.establishment}-${currentEstablishment.emissionPoint}`;
    const switchableEstablishments = normalizedEstablishments(data.issuer)
      .filter((item) => item.active !== false)
      .slice(0, maxEmissionPointsForLicense(data.license));

    return {
      connectedCompanyLabel,
      currentEstablishment,
      currentEstablishmentLabel,
      licenseState,
      switchableEstablishments,
      syncNotice
    };
  }, [data, syncState]);
}
