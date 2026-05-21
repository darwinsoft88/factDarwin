import React from "react";
import { StyleSheet, Text } from "react-native";
import { AuditLog } from "../types";
import { AUDIT_LOG_LIMIT } from "../utils/audit";
import { formatAuditDate } from "../utils/support";
import { shortText } from "../utils/format";
import { Empty, LoadMoreButton } from "./common";
import { ListItem } from "./ListItem";

type AuditLogListProps = {
  logs: AuditLog[];
  visibleLogs: AuditLog[];
  onLoadMore: () => void;
};

export function AuditLogList({ logs, visibleLogs, onLoadMore }: AuditLogListProps) {
  return (
    <>
      <Text style={styles.paragraph}>Se guardan los ultimos {AUDIT_LOG_LIMIT} eventos. Mostrando {visibleLogs.length}/{logs.length}.</Text>
      {logs.length === 0 ? <Empty text="Aun no hay eventos de auditoria." /> : null}
      {visibleLogs.map((log) => (
        <ListItem
          key={log.id}
          title={log.summary}
          meta={`${formatAuditDate(log.createdAt)} | ${log.userName || "Sistema"} | ${log.event}${log.metadata ? ` | ${shortText(JSON.stringify(log.metadata), 90)}` : ""}`}
          badge={log.entity}
        />
      ))}
      {visibleLogs.length < logs.length ? <LoadMoreButton label="Cargar mas auditoria" onPress={onLoadMore} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  }
});
