import React from "react";
import {
  Text,
  View,
  StyleSheet
} from "react-native";
import Toast, {
  ToastConfig,
  ToastConfigParams
} from "react-native-toast-message";

type ToastVariant = "success" | "error" | "info" | "warning";

type CustomToastProps = ToastConfigParams<unknown> & {
  variant: ToastVariant;
};

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
              numberOfLines={3}
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

export function AppToast() {
  return (
    <Toast
      config={toastConfig}
      topOffset={18}
    />
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    paddingHorizontal: 16
  },

  container: {
    width: "100%",
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderLeftWidth: 6,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 8
  },

  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    fontWeight: "800"
  },

  message: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3
  }
});