import React from "react";
import { StyleSheet, View } from "react-native";
import { AppData } from "../types";
import { BackupStatusInfo } from "./BackupStatusInfo";
import { PrimaryButton } from "./common";

type DatabaseSyncSectionProps = {
  data: AppData;
  syncing: boolean;
  onBackup: () => void;
  onRestore: () => void;
  onRefresh: () => void;
};

export function DatabaseSyncSection({ data, syncing, onBackup, onRestore, onRefresh }: DatabaseSyncSectionProps) {
  return (
    <>
      <BackupStatusInfo data={data} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <PrimaryButton label={syncing ? "Procesando..." : "Subir cambios"} onPress={syncing ? () => undefined : onBackup} />
        </View>
        <View style={styles.flex}>
          <PrimaryButton label="Cargar copia" onPress={syncing ? () => undefined : onRestore} />
        </View>
      </View>
      <PrimaryButton label="Actualizar datos" onPress={onRefresh} />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10
  },
  flex: {
    flex: 1,
    minWidth: 130
  }
});
