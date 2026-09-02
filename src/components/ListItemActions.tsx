import React, { useEffect, useRef, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useAppTheme } from "../theme/AppTheme";

export type ActionHandler = () => void | Promise<void>;
type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type ActionTone = "primary" | "success" | "warning" | "info" | "danger";
export type ListAction = { label: string; onPress: ActionHandler; tone: ActionTone; icon: MaterialIconName };

export function createListAction(label: string, onPress: ActionHandler, tone: ActionTone, icon: MaterialIconName): ListAction {
  return { label, onPress, tone, icon };
}

export function ListItemActions({
  title,
  meta,
  actions,
  onProcessingChange
}: {
  title: string;
  meta: string;
  actions: ListAction[];
  onProcessingChange?: (processing: boolean) => void;
}) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 14 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? MODAL_SAFE_BOTTOM_PADDING + 14 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(280, windowHeight - safeTopPadding - safeBottomPadding);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [processingActionLabel, setProcessingActionLabel] = useState("");
  const mountedRef = useRef(false);
  const compactActions = actions.length > 2;
  const isProcessingAction = Boolean(processingActionLabel);
  const isSendingEmail = processingActionLabel === "Email";
  const actionMeta = compactActionMeta(meta);
  const toneColors = (tone: ActionTone) => {
    if (tone === "primary") return { accent: theme.colors.primary, soft: theme.colors.primarySoft };
    if (tone === "success") return { accent: theme.colors.success, soft: theme.colors.successSoft };
    if (tone === "warning") return { accent: theme.colors.warning, soft: theme.colors.warningSoft };
    if (tone === "danger") return { accent: theme.colors.danger, soft: theme.colors.dangerSoft };
    return { accent: theme.colors.info, soft: theme.colors.infoSoft };
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runAction = async (label: string, action: ActionHandler) => {
    if (isProcessingAction) return;
    setProcessingActionLabel(label);
    onProcessingChange?.(true);
    setActionsVisible(false);
    try {
      await Promise.resolve(action());
    } catch (error) {
      Alert.alert("Accion no completada", error instanceof Error ? error.message : "No se pudo completar la accion.");
    } finally {
      if (mountedRef.current) {
        setProcessingActionLabel("");
        onProcessingChange?.(false);
      }
    }
  };

  if (actions.length === 0) return null;

  if (compactActions) {
    return (
      <View style={styles.actionGroup}>
        <Pressable style={[styles.actionsButton, { backgroundColor: theme.colors.primary }, isProcessingAction && styles.disabledActionButton]} onPress={() => setActionsVisible(true)} disabled={isProcessingAction}>
          <MaterialCommunityIcons name={isProcessingAction ? "progress-clock" : "dots-vertical"} size={17} color={theme.colors.onPrimary} />
          <Text style={[styles.actionsButtonText, { color: theme.colors.onPrimary }]}>{isProcessingAction ? (isSendingEmail ? "Enviando..." : "Procesando...") : "Acciones"}</Text>
        </Pressable>
        <Modal visible={actionsVisible} transparent animationType="fade" onRequestClose={() => setActionsVisible(false)}>
          <View style={[styles.actionModalBackdrop, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]}>
            <Pressable style={styles.actionModalDismiss} onPress={() => setActionsVisible(false)} />
            <View style={[styles.actionSheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
              <Text style={[styles.actionSheetTitle, { color: theme.colors.text }]}>{title}</Text>
              <View style={[styles.actionSheetMetaBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                <Text style={[styles.actionSheetMeta, { color: theme.colors.textMuted }]} numberOfLines={2}>{actionMeta.summary}</Text>
                {actionMeta.reference ? <Text style={[styles.actionSheetReference, { color: theme.colors.textMuted }]} numberOfLines={2}>{actionMeta.reference}</Text> : null}
              </View>
              <ScrollView style={styles.actionList} contentContainerStyle={styles.actionTileGrid} showsVerticalScrollIndicator>
                  {actions.map((action) => {
                    const colors = toneColors(action.tone);
                    return (
                    <Pressable key={action.label} style={[styles.actionTile, { borderColor: colors.accent, backgroundColor: colors.soft }]} onPress={() => { void runAction(action.label, action.onPress); }}>
                      <View style={[styles.actionTileIcon, { backgroundColor: theme.colors.surface }]}>
                        <MaterialCommunityIcons name={action.icon} size={19} color={colors.accent} />
                      </View>
                      <Text style={[styles.actionTileText, { color: action.tone === "danger" ? theme.colors.danger : theme.colors.text }]} numberOfLines={2}>{action.label}</Text>
                    </Pressable>
                    );
                  })}
              </ScrollView>
              <Pressable style={[styles.actionSheetCancel, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={() => setActionsVisible(false)}>
                <Text style={[styles.actionSheetCancelText, { color: theme.colors.primary }]}>Cerrar</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.actionGroup}>
      {actions.map((action) => (
        <Pressable key={action.label} style={[styles.inlineActionButton, { backgroundColor: toneColors(action.tone).soft }, isProcessingAction && styles.disabledActionButton]} onPress={() => { void runAction(action.label, action.onPress); }} disabled={isProcessingAction}>
          <MaterialCommunityIcons name={processingActionLabel === action.label || (isSendingEmail && action.label === "Enviando...") ? "progress-clock" : action.icon} size={15} color={toneColors(action.tone).accent} />
          <Text style={[styles.inlineActionText, { color: toneColors(action.tone).accent }]}>{processingActionLabel === action.label || (isSendingEmail && action.label === "Enviando...") ? (isSendingEmail ? "Enviando..." : "Procesando...") : action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function compactActionMeta(meta: string) {
  const parts = meta
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean);
  const summary = parts.slice(0, 4).join(" | ");
  const reference = parts.slice(4).join(" | ");
  return {
    summary,
    reference: reference.length > 28 && /^[0-9A-Za-z |]+$/.test(reference) ? reference.replace(/(.{24})/g, "$1 ").trim() : reference
  };
}

const styles = StyleSheet.create({
  actionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0
  },
  actionsButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#111827",
    minWidth: 86,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5
  },
  actionsButtonText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 12
  },
  disabledActionButton: {
    opacity: 0.72
  },
  inlineActionButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  inlineActionText: {
    fontWeight: "900",
    fontSize: 12
  },
  actionModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: MODAL_SAFE_BOTTOM_PADDING + 14
  },
  actionModalDismiss: {
    ...StyleSheet.absoluteFillObject
  },
  actionSheet: {
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  actionSheetTitle: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 15,
    lineHeight: 20
  },
  actionSheetMetaBox: {
    marginBottom: 1,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  actionSheetMeta: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1
  },
  actionSheetReference: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 14,
    marginTop: 1,
    flexShrink: 1
  },
  actionTileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  actionList: {
    flexShrink: 1
  },
  actionTile: {
    width: "48.6%",
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: "center",
    gap: 6
  },
  actionTileInfo: {
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff"
  },
  actionTilePrimary: {
    borderColor: "#99f6e4",
    backgroundColor: "#ecfdf5"
  },
  actionTileSuccess: {
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4"
  },
  actionTileWarning: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb"
  },
  actionTileDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fee2e2"
  },
  actionTileIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center"
  },
  actionTileMarkInfo: {
    backgroundColor: "#dbeafe"
  },
  actionTileMarkPrimary: {
    backgroundColor: "#ccfbf1"
  },
  actionTileMarkSuccess: {
    backgroundColor: "#dcfce7"
  },
  actionTileMarkWarning: {
    backgroundColor: "#fef3c7"
  },
  actionTileMarkDanger: {
    backgroundColor: "#fee2e2"
  },
  actionTileText: {
    color: "#0f172a",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900"
  },
  actionSheetDangerText: {
    color: "#991b1b"
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
  },
  rideButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#dbeafe",
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  rideButtonText: {
    color: "#1d4ed8",
    fontWeight: "900",
    fontSize: 12
  },
  emailButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#dcfce7",
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  emailButtonText: {
    color: "#166534",
    fontWeight: "900",
    fontSize: 12
  },
  retryButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fef3c7",
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  retryButtonText: {
    color: "#92400e",
    fontWeight: "900",
    fontSize: 12
  },
  invoiceButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#ccfbf1",
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  invoiceButtonText: {
    color: "#0f766e",
    fontWeight: "900",
    fontSize: 12
  },
  cancelButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fee2e2",
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  cancelButtonText: {
    color: "#991b1b",
    fontWeight: "900",
    fontSize: 12
  }
});
