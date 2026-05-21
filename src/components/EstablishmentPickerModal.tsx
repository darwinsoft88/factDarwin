import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { IssuerEstablishment } from "../types";

type EstablishmentPickerModalProps = {
  visible: boolean;
  title: string;
  subtitle: string;
  establishments: IssuerEstablishment[];
  activeId?: string;
  cancelLabel: string;
  cancelVariant?: "secondary" | "cancel";
  onSelect: (id: string) => void;
  onCancel: () => void;
};

export function EstablishmentPickerModal({
  visible,
  title,
  subtitle,
  establishments,
  activeId,
  cancelLabel,
  cancelVariant = "secondary",
  onSelect,
  onCancel
}: EstablishmentPickerModalProps) {
  const cancelStyle = cancelVariant === "cancel" ? styles.actionSheetCancel : styles.secondaryActionButton;
  const cancelTextStyle = cancelVariant === "cancel" ? styles.actionSheetCancelText : styles.secondaryActionText;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.smallNoticeBackdrop}>
        <View style={styles.establishmentPickerModal}>
          <Text style={styles.smallNoticeTitle}>{title}</Text>
          <Text style={styles.smallNoticeText}>{subtitle}</Text>
          {establishments.map((item) => {
            const active = item.id === activeId;
            return (
              <Pressable key={item.id} style={[styles.establishmentPickerOption, active && styles.establishmentPickerOptionActive]} onPress={() => onSelect(item.id)}>
                <Text style={styles.companyChoiceTitle}>{item.name}</Text>
                <Text style={styles.companyChoiceMeta}>{item.establishment}-{item.emissionPoint} | Sec. factura {item.sequential}</Text>
              </Pressable>
            );
          })}
          <Pressable style={cancelStyle} onPress={onCancel}>
            <Text style={cancelTextStyle}>{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  smallNoticeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  establishmentPickerModal: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 10
  },
  smallNoticeTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center"
  },
  smallNoticeText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  establishmentPickerOption: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#f0fdfa",
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  establishmentPickerOptionActive: {
    borderColor: "#0f766e",
    backgroundColor: "#ccfbf1"
  },
  companyChoiceTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  companyChoiceMeta: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  secondaryActionButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  secondaryActionText: {
    color: "#0f5f59",
    fontSize: 12,
    fontWeight: "900"
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
