import { AppData, AuditLog, User } from "../types";

export const AUDIT_LOG_LIMIT = 500;

const auditId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function appendAudit(data: AppData, user: User | undefined, event: string, entity: string, entityId: string | undefined, summary: string, metadata?: Record<string, unknown>): AppData {
  const log: AuditLog = {
    id: auditId(),
    event,
    entity,
    entityId,
    summary,
    userId: user?.id,
    userName: user?.name,
    createdAt: new Date().toISOString(),
    metadata
  };

  return {
    ...data,
    auditLogs: [log, ...(data.auditLogs || [])].slice(0, AUDIT_LOG_LIMIT)
  };
}
