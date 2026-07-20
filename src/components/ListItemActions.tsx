import React, { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";

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
  const [actionsVisible, setActionsVisible] = useState(false);
  const [processingActionLabel, setProcessingActionLabel] = useState("");
  const compactActions = actions.length > 2;
  const isProcessingAction = Boolean(processingActionLabel);
  const actionMeta = compactActionMeta(meta);

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
      setProcessingActionLabel("");
      onProcessingChange?.(false);
    }
  };

  if (actions.length === 0) return null;

  if (compactActions) {
    return (
      <View style={styles.actionGroup}>
        <Pressable style={[styles.actionsButton, isProcessingAction && styles.disabledActionButton]} onPress={() => setActionsVisible(true)} disabled={isProcessingAction}>
          <MaterialCommunityIcons name={isProcessingAction ? "progress-clock" : "dots-vertical"} size={17} color="#ffffff" />
          <Text style={styles.actionsButtonText}>{isProcessingAction ? "Procesando..." : "Acciones"}</Text>
        </Pressable>
        <Modal visible={actionsVisible} transparent animationType="fade" onRequestClose={() => setActionsVisible(false)}>
          <View style={styles.actionModalBackdrop}>
            <Pressable style={styles.actionModalDismiss} onPress={() => setActionsVisible(false)} />
            <View style={styles.actionSheet}>
              <Text style={styles.actionSheetTitle}>{title}</Text>
              <View style={styles.actionSheetMetaBox}>
                <Text style={styles.actionSheetMeta} numberOfLines={2}>{actionMeta.summary}</Text>
                {actionMeta.reference ? <Text style={styles.actionSheetReference} numberOfLines={2}>{actionMeta.reference}</Text> : null}
              </View>
              <View style={styles.actionTileGrid}>
                {actions.map((action) => (
                  <Pressable key={action.label} style={[styles.actionTile, actionTileStyle(action.tone)]} onPress={() => { void runAction(action.label, action.onPress); }}>
                    <View style={[styles.actionTileIcon, actionTileMarkStyle(action.tone)]}>
                      <MaterialCommunityIcons name={action.icon} size={19} color={actionIconColor(action.tone)} />
                    </View>
                    <Text style={[styles.actionTileText, action.tone === "danger" && styles.actionSheetDangerText]} numberOfLines={2}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.actionSheetCancel} onPress={() => setActionsVisible(false)}>
                <Text style={styles.actionSheetCancelText}>Cerrar</Text>
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
        <Pressable key={action.label} style={[actionButtonStyle(action.tone), isProcessingAction && styles.disabledActionButton]} onPress={() => { void runAction(action.label, action.onPress); }} disabled={isProcessingAction}>
          <MaterialCommunityIcons name={processingActionLabel === action.label ? "progress-clock" : action.icon} size={15} color={actionIconColor(action.tone)} />
          <Text style={actionButtonTextStyle(action.tone)}>{processingActionLabel === action.label ? "Procesando..." : action.label}</Text>
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

function actionIconColor(tone: ActionTone) {
  if (tone === "primary") return "#0f766e";
  if (tone === "success") return "#166534";
  if (tone === "warning") return "#92400e";
  if (tone === "danger") return "#991b1b";
  return "#1d4ed8";
}

function actionButtonStyle(tone: ActionTone) {
  if (tone === "primary") return styles.invoiceButton;
  if (tone === "success") return styles.emailButton;
  if (tone === "warning") return styles.retryButton;
  if (tone === "danger") return styles.cancelButton;
  return styles.rideButton;
}

function actionButtonTextStyle(tone: ActionTone) {
  if (tone === "primary") return styles.invoiceButtonText;
  if (tone === "success") return styles.emailButtonText;
  if (tone === "warning") return styles.retryButtonText;
  if (tone === "danger") return styles.cancelButtonText;
  return styles.rideButtonText;
}

function actionTileStyle(tone: ActionTone) {
  if (tone === "primary") return styles.actionTilePrimary;
  if (tone === "success") return styles.actionTileSuccess;
  if (tone === "warning") return styles.actionTileWarning;
  if (tone === "danger") return styles.actionTileDanger;
  return styles.actionTileInfo;
}

function actionTileMarkStyle(tone: ActionTone) {
  if (tone === "primary") return styles.actionTileMarkPrimary;
  if (tone === "success") return styles.actionTileMarkSuccess;
  if (tone === "warning") return styles.actionTileMarkWarning;
  if (tone === "danger") return styles.actionTileMarkDanger;
  return styles.actionTileMarkInfo;
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
