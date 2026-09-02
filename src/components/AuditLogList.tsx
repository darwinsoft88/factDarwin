import React from "react";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { AuditLog } from "../types";
import { AUDIT_LOG_LIMIT } from "../utils/audit";
import { formatAuditDate } from "../utils/support";
import { shortText } from "../utils/format";
import { paginateItems } from "../utils/pagination";
import { Empty } from "./common";
import { ListItem } from "./ListItem";
import { PaginationControls } from "./PaginationControls";
import { useAppTheme } from "../theme/AppTheme";
import type { AccentCardTone } from "./ThemedAccentCard";

type AuditLogListProps = {
  logs: AuditLog[];
};

const AUDIT_PAGE_SIZE = 8;

function auditAccentTone(event: string): AccentCardTone {
  const normalized = event.toUpperCase();
  if (["DELETE", "DELETED", "VOID", "VOIDED", "ANUL", "REVERSE", "REVERSED"].some((value) => normalized.includes(value))) return "danger";
  if (["ERROR", "FAILED", "RETRY", "WARNING", "ENVIRONMENT"].some((value) => normalized.includes(value))) return "warning";
  if (["CREATE", "CREATED", "UPDATE", "UPDATED", "SAVED", "AUTHORIZED"].some((value) => normalized.includes(value))) return "success";
  return "info";
}

export function AuditLogList({ logs }: AuditLogListProps) {
  const { theme } = useAppTheme();
  const [page, setPage] = useState(1);
  const paginatedLogs = paginateItems(logs, page, AUDIT_PAGE_SIZE);

  return (
    <>
      <Text style={[styles.paragraph, { color: theme.colors.textMuted }]}>Se guardan los ultimos {AUDIT_LOG_LIMIT} eventos.</Text>
      {logs.length === 0 ? <Empty text="Aun no hay eventos de auditoria." /> : null}
      {logs.length > 0 ? <PaginationControls page={paginatedLogs.currentPage} pageSize={AUDIT_PAGE_SIZE} totalItems={logs.length} onPageChange={setPage} /> : null}
      {paginatedLogs.items.map((log) => (
        <ListItem
          key={log.id}
          title={log.summary}
          meta={`${formatAuditDate(log.createdAt)} | ${log.userName || "Sistema"} | ${log.event}${log.metadata ? ` | ${shortText(JSON.stringify(log.metadata), 90)}` : ""}`}
          badge={log.entity}
          accentTone={auditAccentTone(log.event)}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  }
});
