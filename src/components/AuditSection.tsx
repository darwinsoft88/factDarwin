import React from "react";
import { AuditLog } from "../types";
import { AuditLogList } from "./AuditLogList";

type AuditSectionProps = {
  logs: AuditLog[];
  visibleLogs: AuditLog[];
  onLoadMore: () => void;
};

export function AuditSection({ logs, visibleLogs, onLoadMore }: AuditSectionProps) {
  return <AuditLogList logs={logs} visibleLogs={visibleLogs} onLoadMore={onLoadMore} />;
}
