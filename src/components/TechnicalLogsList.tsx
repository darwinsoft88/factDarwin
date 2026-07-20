import React from "react";
import { useState } from "react";
import { Alert } from "react-native";
import { TechnicalLog } from "../services/backend";
import { paginateItems } from "../utils/pagination";
import { formatTechnicalLogMeta } from "../utils/support";
import { Empty } from "./common";
import { ListItem } from "./ListItem";
import { PaginationControls } from "./PaginationControls";

type TechnicalLogsListProps = {
  logs: TechnicalLog[];
};

const TECHNICAL_LOGS_PAGE_SIZE = 8;

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
          onOpen={() => Alert.alert("Log tecnico", JSON.stringify(log, null, 2))}
        />
      ))}
    </>
  );
}
