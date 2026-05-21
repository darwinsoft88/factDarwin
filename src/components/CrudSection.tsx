import React from "react";
import { StyleSheet, View } from "react-native";
import { PrimaryButton, Section } from "./common";

export function CrudSection({ title, onSave, children }: { title: string; onSave: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.stack}>
      <Section title={`Nuevo ${title.toLowerCase()}`}>
        {children}
        <PrimaryButton label="Guardar" onPress={onSave} />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  }
});
