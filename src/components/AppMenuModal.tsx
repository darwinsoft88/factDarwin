import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Platform, Pressable, StatusBar as NativeStatusBar, StyleSheet, Text, View } from "react-native";
import { MenuAction } from "./MenuAction";

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type AppMenuModalProps = {
  visible: boolean;
  userLabel: string;
  licenseLabel: string;
  canSwitchEstablishment: boolean;
  onClose: () => void;
  onSync: () => void;
  onOpenSyncCenter: () => void;
  onSwitchEstablishment: () => void;
  onOpenSettings: () => void;
  onOpenLicense: () => void;
  onOpenSupport: () => void;
  onLogout: () => void;
};

export function AppMenuModal({
  visible,
  userLabel,
  licenseLabel,
  canSwitchEstablishment,
  onClose,
  onSync,
  onOpenSyncCenter,
  onSwitchEstablishment,
  onOpenSettings,
  onOpenLicense,
  onOpenSupport,
  onLogout
}: AppMenuModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <Pressable style={styles.appMenu}>
          <View style={styles.appMenuHeader}>
            <Text style={styles.appMenuTitle}>{userLabel}</Text>
            <Text style={styles.appMenuMeta}>{licenseLabel}</Text>
          </View>
          <MenuAction icon={<MenuGlyph name="sync" />} label="Sincronizar" onPress={onSync} />
          <MenuAction icon={<MenuGlyph name="pending" />} label="Pendientes" onPress={onOpenSyncCenter} />
          {canSwitchEstablishment ? <MenuAction icon={<MenuGlyph name="switch" />} label="Cambiar establecimiento" onPress={onSwitchEstablishment} /> : null}
          <MenuAction icon={<MenuGlyph name="settings" />} label="Configuracion" onPress={onOpenSettings} />
          <MenuAction icon={<MenuGlyph name="license" />} label="Licencia" onPress={onOpenLicense} />
          <MenuAction icon={<MenuGlyph name="support" />} label="Soporte" onPress={onOpenSupport} />
          <View style={styles.appMenuDivider} />
          <MenuAction icon={<MenuGlyph name="logout" tone="danger" />} label="Salir" tone="danger" onPress={onLogout} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuGlyph({ name, tone = "default" }: { name: "sync" | "pending" | "switch" | "settings" | "license" | "support" | "logout"; tone?: "default" | "danger" }) {
  const color = tone === "danger" ? "#b91c1c" : "#0f766e";
  const icons: Record<"sync" | "pending" | "switch" | "settings" | "license" | "support" | "logout", MaterialIconName> = {
    sync: "sync",
    pending: "cloud-sync-outline",
    switch: "swap-horizontal",
    settings: "cog-outline",
    license: "shield-check-outline",
    support: "lifebuoy",
    logout: "logout"
  };
  const icon = icons[name];
  return <MaterialCommunityIcons name={icon} size={18} color={color} />;
}
const styles = StyleSheet.create({
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.16)",
    alignItems: "flex-end",
    paddingTop: Platform.OS === "android" ? (NativeStatusBar.currentHeight || 0) + 50 : 58,
    paddingHorizontal: 12
  },
  appMenu: {
    width: 252,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  appMenuHeader: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10
  },
  appMenuTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  appMenuMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  },
  appMenuDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 6
  },
  menuGlyph: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
    textAlign: "center"
  }
});

