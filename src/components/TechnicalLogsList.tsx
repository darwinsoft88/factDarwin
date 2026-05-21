import React from "react";
import { Alert } from "react-native";
import { TechnicalLog } from "../services/backend";
import { formatTechnicalLogMeta } from "../utils/support";
import { Empty } from "./common";
import { ListItem } from "./ListItem";

type TechnicalLogsListProps = {
  logs: TechnicalLog[];
};

export function TechnicalLogsList({ logs }: TechnicalLogsListProps) {
  return (
    <>
      {logs.length === 0 ? <Empty text="Cargue los logs para revisar eventos tecnicos recientes." /> : null}
      {logs.map((log, index) => (
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
