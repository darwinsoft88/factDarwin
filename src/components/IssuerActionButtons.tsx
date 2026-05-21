import React from "react";
import { StyleSheet, View } from "react-native";
import { PrimaryButton } from "./common";

type IssuerActionButtonsProps = {
  checkingConnection: boolean;
  testingEmail: boolean;
  onSave: () => void;
  onTestConnection: () => void;
  onTestEmail: () => void;
};

export function IssuerActionButtons({ checkingConnection, testingEmail, onSave, onTestConnection, onTestEmail }: IssuerActionButtonsProps) {
  return (
    <>
      <View style={styles.row}>
        <View style={styles.flex}>
          <PrimaryButton label="Guardar emisor" onPress={onSave} />
        </View>
        <View style={styles.flex}>
          <PrimaryButton label={checkingConnection ? "Probando..." : "Probar conexion"} onPress={checkingConnection ? () => undefined : onTestConnection} />
        </View>
      </View>
      <PrimaryButton label={testingEmail ? "Enviando prueba..." : "Probar correo"} onPress={testingEmail ? () => undefined : onTestEmail} />
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
