import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppTab } from "../utils/appAccess";
import { SyncState } from "../utils/support";
import { MenuAction } from "./MenuAction";
import { useAppTheme } from "../theme/AppTheme";

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type AppMenuModalProps = {
  visible: boolean;
  userLabel: string;
  licenseLabel: string;
  establishmentLabel: string;
  activeTab: AppTab;
  syncState: SyncState;
  pendingCount: number;
  canSwitchEstablishment: boolean;
  availableTabs: AppTab[];
  onNavigate: (tab: AppTab) => void;
  onClose: () => void;
  onSync: () => void;
  onOpenSyncCenter: () => void;
  onSwitchEstablishment: () => void;
  onOpenSettings: () => void;
  onOpenLicense: () => void;
  onOpenProfile: () => void;
  onOpenSupport: () => void;
  onLogout: () => void;
};

export function ModernAppMenuModal({
  visible,
  userLabel,
  licenseLabel,
  establishmentLabel,
  activeTab,
  canSwitchEstablishment,
  availableTabs,
  onNavigate,
  onClose,
  onSwitchEstablishment,
  onOpenSettings,
  onOpenLicense,
  onOpenProfile,
  onOpenSupport,
  onLogout
}: AppMenuModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(390, Math.max(280, width * 0.76));
  const navigateTo = (tab: AppTab) => {
    onClose();
    onNavigate(tab);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.backdrop }]} onPress={onClose}>
        <Pressable style={[styles.drawer, {
          width: drawerWidth,
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: theme.colors.surface,
          shadowColor: theme.colors.shadow
        }]}>
        <View style={[styles.menuHeader, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir mi perfil"
            style={({ pressed }) => [styles.profileSummary, pressed && styles.pressed]}
            onPress={onOpenProfile}
          >
          <View style={[styles.profileIcon, { backgroundColor: theme.colors.primarySoft }]}>
            <MaterialCommunityIcons name="account-circle" size={30} color={theme.colors.primary} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>MENÚ PRINCIPAL</Text>
            <Text numberOfLines={1} style={[styles.title, { color: theme.colors.text }]}>{userLabel}</Text>
            <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.textMuted }]}>{licenseLabel}</Text>
            <Text numberOfLines={1} style={[styles.establishment, { color: theme.colors.primary }]}>{establishmentLabel}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSubtle} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar menú"
            style={({ pressed }) => [styles.closeButton, { backgroundColor: theme.colors.surfaceMuted }, pressed && styles.pressed]}
            onPress={onClose}
          >
            <MaterialCommunityIcons name="close" size={24} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.menuScroll}
          contentContainerStyle={styles.menuContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>OPERACIÓN</Text>

          {availableTabs.includes("clientes") ? (
            <MenuAction selected={activeTab === "clientes"} icon={<MaterialCommunityIcons name="account-group-outline" size={20} color={theme.colors.primary} />} label="Clientes" onPress={() => navigateTo("clientes")} />
          ) : null}
          {availableTabs.includes("productos") ? (
            <MenuAction selected={activeTab === "productos"} icon={<MaterialCommunityIcons name="package-variant-closed" size={20} color={theme.colors.primary} />} label="Productos" onPress={() => navigateTo("productos")} />
          ) : null}
          {availableTabs.includes("inventario") ? (
            <MenuAction selected={activeTab === "inventario"} icon={<MaterialCommunityIcons name="warehouse" size={20} color={theme.colors.primary} />} label="Inventario" onPress={() => navigateTo("inventario")} />
          ) : null}
          {availableTabs.includes("guias") ? (
            <MenuAction selected={activeTab === "guias"} icon={<MaterialCommunityIcons name="truck-delivery-outline" size={20} color={theme.colors.primary} />} label="Guías" onPress={() => navigateTo("guias")} />
          ) : null}

          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>FINANZAS</Text>

          {availableTabs.includes("caja") ? (
            <MenuAction selected={activeTab === "caja"} icon={<MaterialCommunityIcons name="cash-register" size={20} color={theme.colors.primary} />} label="Caja" onPress={() => navigateTo("caja")} />
          ) : null}
          {availableTabs.includes("creditos") ? (
            <MenuAction selected={activeTab === "creditos"} icon={<MaterialCommunityIcons name="account-cash-outline" size={20} color={theme.colors.primary} />} label="Créditos" onPress={() => navigateTo("creditos")} />
          ) : null}
          {availableTabs.includes("reportes") ? (
            <MenuAction selected={activeTab === "reportes"} icon={<MaterialCommunityIcons name="chart-box-outline" size={20} color={theme.colors.primary} />} label="Reportes" onPress={() => navigateTo("reportes")} />
          ) : null}

          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>SISTEMA</Text>

          {availableTabs.includes("usuarios") ? (
            <MenuAction selected={activeTab === "usuarios"} icon={<MaterialCommunityIcons name="account-cog-outline" size={20} color={theme.colors.primary} />} label="Usuarios" onPress={() => navigateTo("usuarios")} />
          ) : null}
          {canSwitchEstablishment ? (
            <MenuAction icon={<MenuGlyph name="switch" />} label="Cambiar establecimiento" onPress={onSwitchEstablishment} />
          ) : null}
          <MenuAction selected={activeTab === "sri"} icon={<MenuGlyph name="settings" />} label="Configuración" onPress={onOpenSettings} />
          <MenuAction icon={<MenuGlyph name="license" />} label="Licencia" onPress={onOpenLicense} />
          <MenuAction icon={<MenuGlyph name="support" />} label="Soporte" onPress={onOpenSupport} />
        </ScrollView>

        <View style={[styles.menuFooter, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
          <MenuAction icon={<MenuGlyph name="logout" tone="danger" />} label="Cerrar sesión" tone="danger" onPress={onLogout} />
        </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuGlyph({ name, tone = "default" }: {
  name: "switch" | "settings" | "license" | "support" | "logout";
  tone?: "default" | "danger";
}) {
  const { theme } = useAppTheme();
  const color = tone === "danger" ? theme.colors.danger : theme.colors.primary;
  const icons: Record<typeof name, MaterialIconName> = {
    switch: "swap-horizontal",
    settings: "cog-outline",
    license: "shield-check-outline",
    support: "lifebuoy",
    logout: "logout"
  };
  return <MaterialCommunityIcons name={icons[name]} size={20} color={color} />;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.52)"
  },
  drawer: {
    height: "100%",
    backgroundColor: "#ffffff",
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    overflow: "hidden",
    shadowColor: "#020617",
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 8, height: 0 },
    elevation: 18
  },
  menuHeader: {
    minHeight: 78,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0"
  },
  profileIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ecfdf5"
  },
  profileSummary: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  eyebrow: {
    marginBottom: 3,
    color: "#0f766e",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  title: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900"
  },
  meta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  establishment: {
    marginTop: 3,
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "800"
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9"
  },
  pressed: {
    opacity: 0.7
  },
  menuScroll: {
    flex: 1
  },
  menuContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12
  },
  sectionTitle: {
    marginTop: 10,
    marginBottom: 3,
    paddingHorizontal: 4,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  menuFooter: {
    paddingHorizontal: 12,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#ffffff"
  }
});
