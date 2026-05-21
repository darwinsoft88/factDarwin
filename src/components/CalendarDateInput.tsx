import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { monthOptions } from "../constants/options";
import { buildCalendarDays, parseInputDate, toInputDate } from "../utils/format";

export function CalendarDateInput({ label, value, onChange, allowClear = false }: { label: string; value: string; onChange: (value: string) => void; allowClear?: boolean }) {
  const parsedValue = parseInputDate(value, "start");
  const [visible, setVisible] = useState(false);
  const [cursorDate, setCursorDate] = useState(parsedValue || new Date());
  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();
  const days = buildCalendarDays(year, month);
  const monthLabel = `${monthOptions[month]?.label || ""} ${year}`;

  useEffect(() => {
    if (!visible) return;
    setCursorDate(parsedValue || new Date());
  }, [parsedValue?.getTime(), visible]);

  const moveMonth = (amount: number) => {
    setCursorDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  const selectDate = (date: Date) => {
    onChange(toInputDate(date));
    setVisible(false);
  };

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.dateField} onPress={() => setVisible(true)}>
        <Text style={[styles.dateFieldText, !value && styles.dateFieldPlaceholder]}>{value || "Seleccionar fecha"}</Text>
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.calendarBackdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.calendarSheet}>
            <View style={styles.calendarHeader}>
              <Pressable style={styles.calendarNavButton} onPress={() => moveMonth(-1)}>
                <Text style={styles.calendarNavText}>{"<"}</Text>
              </Pressable>
              <Text style={styles.calendarTitle}>{monthLabel}</Text>
              <Pressable style={styles.calendarNavButton} onPress={() => moveMonth(1)}>
                <Text style={styles.calendarNavText}>{">"}</Text>
              </Pressable>
            </View>
            <View style={styles.calendarWeekRow}>
              {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((day) => (
                <Text key={day} style={styles.calendarWeekText}>{day}</Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {days.map((date, index) => {
                const isCurrentMonth = date.getMonth() === month;
                const dateValue = toInputDate(date);
                const selected = value === dateValue;
                const today = dateValue === toInputDate(new Date());
                return (
                  <Pressable key={`${dateValue}-${index}`} style={[styles.calendarDay, selected && styles.calendarDaySelected, today && !selected && styles.calendarDayToday]} onPress={() => selectDate(date)}>
                    <Text style={[styles.calendarDayText, !isCurrentMonth && styles.calendarDayMuted, selected && styles.calendarDaySelectedText]}>{date.getDate()}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.calendarActions}>
              {allowClear ? (
                <Pressable style={styles.actionSheetCancel} onPress={() => { onChange(""); setVisible(false); }}>
                  <Text style={styles.actionSheetCancelText}>Limpiar</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.actionSheetButton} onPress={() => selectDate(new Date())}>
                <Text style={styles.actionSheetButtonText}>Hoy</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inputGroup: {
    gap: 5
  },
  label: {
    color: "#4b5563",
    fontSize: 12,
    fontWeight: "700"
  },
  dateField: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fbfdff",
    justifyContent: "center"
  },
  dateFieldText: {
    color: "#111827",
    fontWeight: "800"
  },
  dateFieldPlaceholder: {
    color: "#7d8796",
    fontWeight: "600"
  },
  calendarBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    justifyContent: "flex-end",
    padding: 14
  },
  calendarSheet: {
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 10
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  calendarTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
    textTransform: "capitalize"
  },
  calendarNavButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center"
  },
  calendarNavText: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 24
  },
  calendarWeekRow: {
    flexDirection: "row",
    gap: 6
  },
  calendarWeekText: {
    flex: 1,
    textAlign: "center",
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900"
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  calendarDay: {
    width: "13.33%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center"
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: "#0f766e"
  },
  calendarDaySelected: {
    backgroundColor: "#0f766e"
  },
  calendarDayText: {
    color: "#111827",
    fontWeight: "900"
  },
  calendarDayMuted: {
    color: "#94a3b8"
  },
  calendarDaySelectedText: {
    color: "#ffffff"
  },
  calendarActions: {
    flexDirection: "row",
    gap: 8
  },
  actionSheetButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  actionSheetButtonText: {
    color: "#0f172a",
    fontWeight: "900",
    textAlign: "center"
  },
  actionSheetCancel: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  actionSheetCancelText: {
    color: "#0f5f59",
    fontWeight: "900",
    textAlign: "center"
  }
});
