import React, { useCallback, useEffect, useRef, useState } from "react";
import { IssuerEstablishment } from "../types";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useAppTheme } from "../theme/AppTheme";

type EstablishmentPickerModalProps = {
  visible: boolean;
  title: string;
  subtitle: string;
  establishments: IssuerEstablishment[];
  activeId?: string;
  cancelLabel: string;
  cancelVariant?: "secondary" | "cancel";
  onSelect: (id: string) => Promise<void> | void;
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
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 24 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 24 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);
  const selectingRef = useRef(false);
  const [selectingId, setSelectingId] = useState("");
  const cancelStyle = cancelVariant === "cancel" ? styles.actionSheetCancel : styles.secondaryActionButton;
  const cancelTextStyle = cancelVariant === "cancel" ? styles.actionSheetCancelText : styles.secondaryActionText;

  useEffect(() => {
    if (visible) return;
    selectingRef.current = false;
    setSelectingId("");
  }, [visible]);

  const selectEstablishment = useCallback(async (id: string) => {
    if (selectingRef.current) return;
    selectingRef.current = true;
    setSelectingId(id);
    try {
      await onSelect(id);
    } finally {
      selectingRef.current = false;
      setSelectingId("");
    }
  }, [onSelect]);

  return (
    <Modal
  visible={visible}
  transparent
  animationType="none"
  presentationStyle="overFullScreen"
  statusBarTranslucent
  onRequestClose={onCancel}
>
      <View style={[styles.smallNoticeBackdrop, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]}>
        <View style={[styles.establishmentPickerModal, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
          <Text style={[styles.smallNoticeTitle, { color: theme.colors.text }]}>{title}</Text>
          <Text style={[styles.smallNoticeText, { color: theme.colors.textMuted }]}>{subtitle}</Text>
          <ScrollView
            style={styles.establishmentList}
            contentContainerStyle={styles.establishmentListContent}
            showsVerticalScrollIndicator
            persistentScrollbar
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            overScrollMode="always"
          >
            {establishments.map((item) => {
              const active = item.id === activeId;
              const selecting = item.id === selectingId;

              return (
                <Pressable
                  key={item.id}
                  style={[
                    styles.establishmentPickerOption,
                    { borderColor: active ? theme.colors.primary : theme.colors.borderStrong, backgroundColor: active ? theme.colors.primarySoft : theme.colors.surfaceMuted },
                    Boolean(selectingId) && styles.establishmentPickerOptionDisabled
                  ]}
                  disabled={Boolean(selectingId)}
                  onPress={() => { void selectEstablishment(item.id); }}
                >
                  <Text style={[styles.companyChoiceTitle, { color: theme.colors.text }]}>{item.name}</Text>

                  <Text style={[styles.companyChoiceMeta, { color: theme.colors.textMuted }]}>
                    {selecting
                      ? "Ingresando..."
                      : `${item.establishment}-${item.emissionPoint} | Sec. factura ${item.sequential}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            style={[cancelStyle, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }, Boolean(selectingId) && styles.establishmentPickerOptionDisabled]}
            disabled={Boolean(selectingId)}
            onPress={onCancel}
          >
            <Text style={[cancelTextStyle, { color: theme.colors.primary }]}>{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  smallNoticeBackdrop: {
  flex: 1,
  width: "100%",
  backgroundColor: "rgba(15, 23, 42, 0.35)",
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: 24,
  paddingVertical: 24
},
  establishmentPickerModal: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 340,
    maxHeight: "85%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 10,
    transform: Platform.OS === "web"
  ? [{ translateX: -8 }]
  : undefined
  },
  establishmentList: {
    flexShrink: 1,
    minHeight: 80,
    maxHeight: 420
  },

  establishmentListContent: {
    gap: 10,
    paddingBottom: 12
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
  establishmentPickerOptionDisabled: {
    opacity: 0.6
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
