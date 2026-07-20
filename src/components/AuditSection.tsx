import React from "react";
import { AuditLog } from "../types";
import { AuditLogList } from "./AuditLogList";

type AuditSectionProps = {
  logs: AuditLog[];
};

export function AuditSection({ logs }: AuditSectionProps) {
  return <AuditLogList logs={logs} />;
}
