import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";

import Toast from "react-native-toast-message";
import type {
  ToastConfig,
  ToastConfigParams
} from "react-native-toast-message";
import {
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";

type ToastVariant = "success" | "error" | "info" | "warning";

type CustomToastProps = ToastConfigParams<unknown> & {
  variant: ToastVariant;
};

type OverlayPortalContextValue = {
  remove: (key: symbol) => void;
  render: (key: symbol, node: React.ReactNode) => void;
};

const OverlayPortalContext = createContext<OverlayPortalContextValue | null>(null);

export function AppOverlayProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Map<symbol, React.ReactNode>>(() => new Map());
  const render = useCallback((key: symbol, node: React.ReactNode) => {
    setEntries((current) => {
      const next = new Map(current);
      next.set(key, node);
      return next;
    });
  }, []);
  const remove = useCallback((key: symbol) => {
    setEntries((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);
  const contextValue = useMemo(() => ({ remove, render }), [remove, render]);

  return (
    <OverlayPortalContext.Provider value={contextValue}>
      {children}
      <View pointerEvents="box-none" style={styles.overlayHost}>
        {Array.from(entries, ([key, node]) => <React.Fragment key={String(key)}>{node}</React.Fragment>)}
      </View>
    </OverlayPortalContext.Provider>
  );
}

export function AppOverlayPortal({ children }: { children: React.ReactNode }) {
  const context = useContext(OverlayPortalContext);
  const key = useRef(Symbol("app-overlay"));

  if (!context) throw new Error("AppOverlayPortal requiere AppOverlayProvider.");

  useLayoutEffect(() => {
    context.render(key.current, children);
  }, [children, context]);

  useLayoutEffect(() => () => {
    context.remove(key.current);
  }, [context]);

  return null;
}

const variantConfig = {
  success: {
    icon: "✓",
    accent: "#16a34a",
    iconBackground: "#dcfce7"
  },
  error: {
    icon: "×",
    accent: "#dc2626",
    iconBackground: "#fee2e2"
  },
  info: {
    icon: "i",
    accent: "#2563eb",
    iconBackground: "#dbeafe"
  },
  warning: {
    icon: "!",
    accent: "#d97706",
    iconBackground: "#fef3c7"
  }
} as const;

function CustomToast({
  text1,
  text2,
  variant
}: CustomToastProps) {
  const config = variantConfig[variant];

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.container,
          {
            borderLeftColor: config.accent
          }
        ]}
      >
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: config.iconBackground
            }
          ]}
        >
          <Text
            style={[
              styles.icon,
              {
                color: config.accent
              }
            ]}
          >
            {config.icon}
          </Text>
        </View>

        <View style={styles.content}>
          {!!text1 && (
            <Text
              numberOfLines={2}
              style={styles.title}
            >
              {text1}
            </Text>
          )}

          {!!text2 && (
            <Text
              numberOfLines={5}
              style={styles.message}
            >
              {text2}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const toastConfig: ToastConfig = {
  success: (props) => (
    <CustomToast
      {...props}
      variant="success"
    />
  ),

  error: (props) => (
    <CustomToast
      {...props}
      variant="error"
    />
  ),

  info: (props) => (
    <CustomToast
      {...props}
      variant="info"
    />
  ),

  warning: (props) => (
    <CustomToast
      {...props}
      variant="warning"
    />
  )
};

function isIosPwa() {
  if (Platform.OS !== "web" || typeof window === "undefined" || typeof navigator === "undefined") return false;

  const webNavigator = navigator as Navigator & { standalone?: boolean };
  const isIosDevice =
    /iPad|iPhone|iPod/.test(webNavigator.userAgent) ||
    (webNavigator.platform === "MacIntel" && webNavigator.maxTouchPoints > 1);
  const isStandalone =
    webNavigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true;

  return isIosDevice && isStandalone;
}

export function AppToast({ global = false }: { global?: boolean }) {
  if (!global) return null;

  const topOffset =
    Platform.OS === "web"
      ? (isIosPwa() ? 58 : 20)
      : Platform.OS === "ios"
        ? 58
        : (StatusBar.currentHeight ?? 24) + 16;

  return (
    <View pointerEvents="box-none" style={styles.toastHost}>
      <Toast
        config={toastConfig}
        topOffset={topOffset}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlayHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100000,
    elevation: 100000
  },

  toastHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200000,
    elevation: 200000,
    overflow: "visible"
  },

  wrapper: {
    width: "100%",
    paddingHorizontal: 16
  },

  container: {
    width: "100%",
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderLeftWidth: 6,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8
  },

  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12
  },

  icon: {
    fontSize: 21,
    fontWeight: "900"
  },

  content: {
    flex: 1
  },

  title: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },

  message: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3
  }
});
