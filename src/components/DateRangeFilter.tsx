import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarDateInput } from "./CalendarDateInput";

type DateRangeFilterProps = {
  title: string;
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onToday: () => void;
  onMonth: () => void;
  onClear: () => void;
};

export function DateRangeFilter({
  title,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  onToday,
  onMonth,
  onClear
}: DateRangeFilterProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <CalendarDateInput label="Desde" value={startValue} onChange={onStartChange} allowClear />
        </View>
        <View style={styles.flex}>
          <CalendarDateInput label="Hasta" value={endValue} onChange={onEndChange} allowClear />
        </View>
      </View>
      <View style={styles.actionGroup}>
        <Pressable style={styles.smallButton} onPress={onToday}>
          <Text style={styles.smallButtonText}>Hoy</Text>
        </Pressable>
        <Pressable style={styles.smallButton} onPress={onMonth}>
          <Text style={styles.smallButtonText}>Este mes</Text>
        </Pressable>
        <Pressable style={styles.smallButton} onPress={onClear}>
          <Text style={styles.smallButtonText}>Limpiar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  title: {
    color: "#1f2937",
    fontWeight: "800"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  flex: {
    flex: 1,
    minWidth: 118
  },
  actionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  }
});
