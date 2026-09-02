import type { ProductionChecklistValue } from "../components/ProductionChecklist";
import type { CompanyAssetsStatus } from "../services/backend";

export type RealBillingSummary = {
  company: { ok: boolean; label: string };
  certificate: { ok: boolean; label: string; warning?: string };
  connection: { ok: boolean; label: string };
};

export function realBillingSummary(checklist: ProductionChecklistValue, certificate?: CompanyAssetsStatus["certificate"]): RealBillingSummary {
  const companyChecks = checklist.baseChecks.filter((item) => item.label !== "URL de servidor configurada");
  const serverUrlCheck = checklist.baseChecks.find((item) => item.label === "URL de servidor configurada");
  const companyOk = companyChecks.length > 0 && companyChecks.every((item) => item.ok);
  const connectionOk = [serverUrlCheck, checklist.connectionChecks[0], ...checklist.productionChecks.slice(1)].every((item) => item?.ok === true);
  const expiration = certificate?.expirationStatus;
  const certificateMissing = !certificate?.configured || certificate.needsUpload;
  const certificateInvalid = expiration === "expired" || expiration === "not_yet_valid";
  const certificateWarning = expiration === "warning" || expiration === "critical";
  return {
    company: { ok: companyOk, label: companyOk ? "Empresa lista" : "Completa los datos de tu empresa" },
    certificate: {
      ok: !certificateMissing && !certificateInvalid,
      label: certificateMissing ? "Falta firma electrónica" : expiration === "expired" ? "Firma electrónica vencida" : expiration === "not_yet_valid" ? "Firma electrónica aún no vigente" : "Firma electrónica lista",
      warning: certificateWarning ? `Vence pronto${certificate?.daysRemaining !== undefined ? ` · ${certificate.daysRemaining} día(s)` : ""}` : undefined
    },
    connection: { ok: connectionOk, label: connectionOk ? "Servidor del SRI verificado" : "Falta verificar el servidor del SRI" }
  };
}
