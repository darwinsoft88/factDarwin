import React from "react";
import { AuditSection } from "./AuditSection";
import { CollapsibleSection } from "./common";
import { DatabaseSyncSection } from "./DatabaseSyncSection";
import { IntegrationStatusInfo } from "./IntegrationStatusInfo";
import { TechnicalLogsSection } from "./TechnicalLogsSection";
import { TechnicalLog } from "../services/backend";
import { AppData, AuditLog, Issuer } from "../types";

type SriDeveloperToolsSectionProps = {
  auditLogs: AuditLog[];
  canView: boolean;
  data: AppData;
  issuer: Issuer;
  loadingTechnicalLogs: boolean;
  onBackup: () => void;
  onLoadTechnicalLogs: () => void;
  onRefreshBackend: () => void;
  onRestore: () => void;
  syncing: boolean;
  technicalLogs: TechnicalLog[];
};

export function SriDeveloperToolsSection({
  auditLogs,
  canView,
  data,
  issuer,
  loadingTechnicalLogs,
  onBackup,
  onLoadTechnicalLogs,
  onRefreshBackend,
  onRestore,
  syncing,
  technicalLogs
}: SriDeveloperToolsSectionProps) {
  if (!canView) return null;

  return (
    <>
      <CollapsibleSection title="Base de datos">
        <DatabaseSyncSection data={data} syncing={syncing} onBackup={onBackup} onRestore={onRestore} onRefresh={onRefreshBackend} />
      </CollapsibleSection>
      <CollapsibleSection title="Estado de integracion">
        <IntegrationStatusInfo issuer={issuer} />
      </CollapsibleSection>
      <CollapsibleSection title="Logs tecnicos">
        <TechnicalLogsSection logs={technicalLogs} loading={loadingTechnicalLogs} onLoad={onLoadTechnicalLogs} />
      </CollapsibleSection>
      <CollapsibleSection title="Auditoria">
        <AuditSection logs={auditLogs} />
      </CollapsibleSection>
    </>
  );
}
