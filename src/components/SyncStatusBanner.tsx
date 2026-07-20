import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, DimensionValue, Pressable, StyleSheet, Text, View } from "react-native";
import { AppData } from "../types";
import { shortText } from "../utils/format";
import { sriPendingSendSummary } from "../utils/sriRetryPolicy";
import { SyncState } from "../utils/support";

type SyncStatusBannerProps = {
  data: AppData;
  loading: boolean;
  syncState: SyncState;
  onOpen: () => void;
  onRetry: () => void;
};

export function SyncStatusBanner({ data, loading, syncState, onOpen, onRetry }: SyncStatusBannerProps) {
  const pulse = useRef(new Animated.Value(1)).current;
  const pendingCount = data.pendingSync?.length || 0;
  const sriSummary = sriPendingSendSummary(data);
  const sriPendingCount = sriSummary.pendingCount;
  const staleSriCount = sriSummary.staleCount;
  const hasError = syncState === "error" || Boolean(data.autoBackupLastError);
  const visible = sriPendingCount > 0 || pendingCount > 0 || hasError || syncState === "syncing" || syncState === "pending";

  useEffect(() => {
    if (!visible || !hasError) {
      pulse.setValue(1);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [hasError, pulse, visible]);

  const content = useMemo(() => {
    if (staleSriCount > 0) {
      return {
        title: "Documentos SRI fuera de fecha",
        detail: `${staleSriCount} documento(s) ya no pueden enviarse al SRI. Revise y emita un nuevo comprobante con fecha actual.`,
        tone: "danger" as const
      };
    }

    if (syncState === "syncing") {
      return {
        title: "Sincronizando con el servidor",
        detail: sriPendingCount
          ? `SRI: ${sriPendingCount} documento(s) pendiente(s). Cola local: ${pendingCount}.`
          : pendingCount ? `Cola de envio: ${pendingCount} pendiente(s)` : "Subiendo cambios y actualizando datos.",
        tone: "info" as const
      };
    }

    if (hasError) {
      return {
        title: "Sin conexion al servidor",
        detail: sriPendingCount
          ? `SRI: ${sriPendingCount} documento(s) sin enviar/autorizar. Reintente cuando vuelva la conexion.`
          : pendingCount
            ? `Cola de envio: ${pendingCount} pendiente(s). Reintente cuando vuelva la conexion.`
          : shortText(data.autoBackupLastError || "Revise la conexion del servidor.", 92),
        tone: "danger" as const
      };
    }

    if (sriPendingCount > 0) {
      return {
        title: "Documentos sin enviar al SRI",
        detail: `${sriPendingCount} documento(s) pendiente(s) de envio o autorizacion SRI. Deben procesarse dentro del dia.`,
        tone: "warning" as const
      };
    }

    return {
      title: pendingCount ? "Documentos pendientes de subir" : "Sincronizacion pendiente",
      detail: pendingCount ? `Cola de envio: ${pendingCount} pendiente(s).` : "Hay cambios locales pendientes.",
      tone: "warning" as const
    };
  }, [data.autoBackupLastError, hasError, pendingCount, sriPendingCount, staleSriCount, syncState]);

  if (!visible || data.autoBackupEnabled === false) return null;

  const alertCount = staleSriCount || sriPendingCount || pendingCount;
  const progressWidth = (alertCount ? `${Math.min(100, Math.max(18, alertCount * 28))}%` : "42%") as DimensionValue;
  const isDanger = content.tone === "danger";

  return (
    <View style={[styles.wrap, isDanger ? styles.wrapDanger : content.tone === "info" ? styles.wrapInfo : styles.wrapWarning]}>
      <Pressable style={styles.topRow} onPress={onOpen}>
        <View style={styles.titleWrap}>
          <Animated.View style={[styles.dot, isDanger ? styles.dotDanger : styles.dotWarning, { opacity: isDanger ? pulse : 1 }]} />
          <Text style={[styles.title, isDanger && styles.titleDanger]} numberOfLines={1}>{content.title}</Text>
        </View>
        {alertCount > 0 ? <Text style={[styles.badge, isDanger && styles.badgeDanger]}>{alertCount} pendiente{alertCount === 1 ? "" : "s"}</Text> : null}
      </Pressable>

      <View style={styles.bottomRow}>
        <View style={styles.detailBlock}>
          <Text style={[styles.detail, isDanger && styles.detailDanger]} numberOfLines={2}>{content.detail}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, isDanger && styles.progressFillDanger, { width: progressWidth }]} />
          </View>
        </View>
        <Pressable style={[styles.retryButton, loading && styles.disabled]} onPress={onRetry} disabled={loading}>
          <MaterialCommunityIcons name={loading ? "sync" : "reload"} size={14} color={isDanger ? "#991b1b" : "#0f766e"} />
          <Text style={[styles.retryText, isDanger && styles.retryTextDanger]}>{loading ? "Subiendo" : "Reintentar"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1
  },
  wrapDanger: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca"
  },
  wrapInfo: {
    backgroundColor: "#ecfeff",
    borderColor: "#bae6fd"
  },
  wrapWarning: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa"
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999
  },
  dotDanger: {
    backgroundColor: "#ef4444"
  },
  dotWarning: {
    backgroundColor: "#f59e0b"
  },
  title: {
    flex: 1,
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16
  },
  titleDanger: {
    color: "#991b1b"
  },
  badge: {
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 3,
    color: "#0f766e",
    backgroundColor: "#ccfbf1",
    fontSize: 11,
    fontWeight: "900"
  },
  badgeDanger: {
    color: "#ffffff",
    backgroundColor: "#b91c1c"
  },
  bottomRow: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  detailBlock: {
    flex: 1,
    minWidth: 0
  },
  detail: {
    color: "#115e59",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  detailDanger: {
    color: "#991b1b"
  },
  progressTrack: {
    marginTop: 6,
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(15, 118, 110, 0.16)"
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#0f766e"
  },
  progressFillDanger: {
    backgroundColor: "#ef4444"
  },
  retryButton: {
    minHeight: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fca5a5",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#fff7f7"
  },
  retryText: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "900"
  },
  retryTextDanger: {
    color: "#991b1b"
  },
  disabled: {
    opacity: 0.65
  }
});
