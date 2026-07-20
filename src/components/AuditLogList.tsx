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

type AuditLogListProps = {
  logs: AuditLog[];
};

const AUDIT_PAGE_SIZE = 8;

export function AuditLogList({ logs }: AuditLogListProps) {
  const [page, setPage] = useState(1);
  const paginatedLogs = paginateItems(logs, page, AUDIT_PAGE_SIZE);

  return (
    <>
      <Text style={styles.paragraph}>Se guardan los ultimos {AUDIT_LOG_LIMIT} eventos.</Text>
      {logs.length === 0 ? <Empty text="Aun no hay eventos de auditoria." /> : null}
      {logs.length > 0 ? <PaginationControls page={paginatedLogs.currentPage} pageSize={AUDIT_PAGE_SIZE} totalItems={logs.length} onPageChange={setPage} /> : null}
      {paginatedLogs.items.map((log) => (
        <ListItem
          key={log.id}
          title={log.summary}
          meta={`${formatAuditDate(log.createdAt)} | ${log.userName || "Sistema"} | ${log.event}${log.metadata ? ` | ${shortText(JSON.stringify(log.metadata), 90)}` : ""}`}
          badge={log.entity}
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
