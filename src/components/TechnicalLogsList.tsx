import React from "react";
import { useState } from "react";
import { Alert } from "react-native";
import { TechnicalLog } from "../services/backend";
import { paginateItems } from "../utils/pagination";
import { formatTechnicalLogMeta } from "../utils/support";
import { Empty } from "./common";
import { ListItem } from "./ListItem";
import { PaginationControls } from "./PaginationControls";
import type { AccentCardTone } from "./ThemedAccentCard";

type TechnicalLogsListProps = {
  logs: TechnicalLog[];
};

const TECHNICAL_LOGS_PAGE_SIZE = 8;

function technicalLogAccentTone(log: TechnicalLog): AccentCardTone {
  const level = (log.level || "info").toLowerCase();
  if ((log.statusCode || 0) >= 500 || level === "error" || level === "fatal") return "danger";
  if ((log.statusCode || 0) >= 400 || level === "warn" || level === "warning") return "warning";
  if ((log.statusCode || 0) >= 200 && (log.statusCode || 0) < 300) return "success";
  return "info";
}

export function TechnicalLogsList({ logs }: TechnicalLogsListProps) {
  const [page, setPage] = useState(1);
  const paginatedLogs = paginateItems(logs, page, TECHNICAL_LOGS_PAGE_SIZE);

  return (
    <>
      {logs.length === 0 ? <Empty text="Cargue los logs para revisar eventos tecnicos recientes." /> : null}
      {logs.length > 0 ? <PaginationControls page={paginatedLogs.currentPage} pageSize={TECHNICAL_LOGS_PAGE_SIZE} totalItems={logs.length} onPageChange={setPage} /> : null}
      {paginatedLogs.items.map((log, index) => (
        <ListItem
          key={`${log.time || "log"}-${index}`}
          title={`${(log.level || "info").toUpperCase()} | ${log.event || "evento"}`}
          meta={formatTechnicalLogMeta(log)}
          badge={log.statusCode && log.statusCode >= 500 ? "ERROR" : log.level || "LOG"}
          accentTone={technicalLogAccentTone(log)}
          onOpen={() => Alert.alert("Log tecnico", JSON.stringify(log, null, 2))}
        />
      ))}
    </>
  );
}
