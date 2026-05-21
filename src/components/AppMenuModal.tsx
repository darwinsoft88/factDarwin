import React from "react";
import { Modal, Platform, Pressable, StatusBar as NativeStatusBar, StyleSheet, Text, View } from "react-native";
import { MenuAction } from "./MenuAction";

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
          <MenuAction icon="S" label="Sincronizar" onPress={onSync} />
          <MenuAction icon="P" label="Pendientes sync" onPress={onOpenSyncCenter} />
          {canSwitchEstablishment ? <MenuAction icon="E" label="Cambiar establecimiento" onPress={onSwitchEstablishment} /> : null}
          <MenuAction icon="C" label="Configuracion" onPress={onOpenSettings} />
          <MenuAction icon="L" label="Licencia" onPress={onOpenLicense} />
          <MenuAction icon="?" label="Soporte" onPress={onOpenSupport} />
          <View style={styles.appMenuDivider} />
          <MenuAction icon=">" label="Salir" tone="danger" onPress={onLogout} />
        </Pressable>
      </Pressable>
    </Modal>
  );
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
    width: 238,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  appMenuHeader: {
    paddingHorizontal: 10,
    paddingVertical: 8
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
  }
});
