import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarDateInput } from "./CalendarDateInput";
import { useAppTheme } from "../theme/AppTheme";

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
  const { theme } = useAppTheme();
  const actionStyle = [styles.smallButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }];
  const actionTextStyle = [styles.smallButtonText, { color: theme.colors.primaryStrong }];
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <CalendarDateInput label="Desde" value={startValue} onChange={onStartChange} allowClear />
        </View>
        <View style={styles.flex}>
          <CalendarDateInput label="Hasta" value={endValue} onChange={onEndChange} allowClear />
        </View>
      </View>
      <View style={styles.actionGroup}>
        <Pressable style={actionStyle} onPress={onToday}>
          <MaterialCommunityIcons name="calendar-today" size={14} color={theme.colors.primaryStrong} />
          <Text style={actionTextStyle}>Hoy</Text>
        </Pressable>
        <Pressable style={actionStyle} onPress={onMonth}>
          <MaterialCommunityIcons name="calendar-month-outline" size={14} color={theme.colors.primaryStrong} />
          <Text style={actionTextStyle}>Este mes</Text>
        </Pressable>
        <Pressable style={actionStyle} onPress={onClear}>
          <MaterialCommunityIcons name="filter-remove-outline" size={14} color={theme.colors.primaryStrong} />
          <Text style={actionTextStyle}>Limpiar</Text>
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
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  }
});
