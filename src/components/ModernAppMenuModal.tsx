import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Platform, Pressable, ScrollView, StatusBar as NativeStatusBar, StyleSheet, Text, View } from "react-native";
import { MenuAction } from "./MenuAction";
import { AppToast } from "./AppToast";
import { AppTab } from "../utils/appAccess";

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type AppMenuModalProps = {
    visible: boolean;
    userLabel: string;
    licenseLabel: string;
    canSwitchEstablishment: boolean;
    availableTabs: AppTab[];
    onNavigate: (tab: AppTab) => void;
    onClose: () => void;
    onSync: () => void;
    onOpenSyncCenter: () => void;
    onSwitchEstablishment: () => void;
    onOpenSettings: () => void;
    onOpenLicense: () => void;
    onOpenSupport: () => void;
    onLogout: () => void;
};

export function ModernAppMenuModal({
    visible,
    userLabel,
    licenseLabel,
    canSwitchEstablishment,
    availableTabs,
    onNavigate,
    onClose,
    onSync,
    onOpenSyncCenter,
    onSwitchEstablishment,
    onOpenSettings,
    onOpenLicense,
    onOpenSupport,
    onLogout
}: AppMenuModalProps) {
    const navigateTo = (tab: AppTab) => {
        onClose();
        onNavigate(tab);
    };
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.menuBackdrop} onPress={onClose}>
                <Pressable style={styles.appMenu}>
                    <View style={styles.appMenuHeader}>
                        <View style={styles.appMenuHeaderText}>
                            <Text style={styles.appMenuTitle}>{userLabel}</Text>
                            <Text style={styles.appMenuMeta}>{licenseLabel}</Text>
                        </View>

                        <Pressable style={styles.closeButton} onPress={onClose}>
                            <MaterialCommunityIcons name="close" size={20} color="#64748b" />
                        </Pressable>
                    </View>

                    <ScrollView
                        style={styles.menuScroll}
                        contentContainerStyle={styles.menuScrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={styles.sectionTitle}>OPERACIÓN</Text>

                        {availableTabs.includes("clientes") ? (
                            <MenuAction
                                icon={<MaterialCommunityIcons name="account-group-outline" size={18} color="#0f766e" />}
                                label="Clientes"
                                onPress={() => navigateTo("clientes")}
                            />
                        ) : null}

                        {availableTabs.includes("productos") ? (
                            <MenuAction
                                icon={<MaterialCommunityIcons name="package-variant-closed" size={18} color="#0f766e" />}
                                label="Productos"
                                onPress={() => navigateTo("productos")}
                            />
                        ) : null}

                        {availableTabs.includes("inventario") ? (
                            <MenuAction
                                icon={<MaterialCommunityIcons name="warehouse" size={18} color="#0f766e" />}
                                label="Inventario"
                                onPress={() => navigateTo("inventario")}
                            />
                        ) : null}

                        {availableTabs.includes("guias") ? (
                            <MenuAction
                                icon={<MaterialCommunityIcons name="truck-delivery-outline" size={18} color="#0f766e" />}
                                label="Guías"
                                onPress={() => navigateTo("guias")}
                            />
                        ) : null}

                        <Text style={styles.sectionTitle}>FINANZAS</Text>

                        {availableTabs.includes("caja") ? (
                            <MenuAction
                                icon={<MaterialCommunityIcons name="cash-register" size={18} color="#0f766e" />}
                                label="Caja"
                                onPress={() => navigateTo("caja")}
                            />
                        ) : null}

                        {availableTabs.includes("creditos") ? (
                            <MenuAction
                                icon={<MaterialCommunityIcons name="account-cash-outline" size={18} color="#0f766e" />}
                                label="Créditos"
                                onPress={() => navigateTo("creditos")}
                            />
                        ) : null}

                        {availableTabs.includes("reportes") ? (
                            <MenuAction
                                icon={<MaterialCommunityIcons name="chart-box-outline" size={18} color="#0f766e" />}
                                label="Reportes"
                                onPress={() => navigateTo("reportes")}
                            />
                        ) : null}

                        <Text style={styles.sectionTitle}>SISTEMA</Text>

                        {availableTabs.includes("usuarios") ? (
                            <MenuAction
                                icon={<MaterialCommunityIcons name="account-cog-outline" size={18} color="#0f766e" />}
                                label="Usuarios"
                                onPress={() => navigateTo("usuarios")}
                            />
                        ) : null}

                        <MenuAction
                            icon={<MenuGlyph name="sync" />}
                            label="Sincronizar"
                            onPress={onSync}
                        />

                        <MenuAction
                            icon={<MenuGlyph name="pending" />}
                            label="Pendientes"
                            onPress={onOpenSyncCenter}
                        />

                        {canSwitchEstablishment ? (
                            <MenuAction
                                icon={<MenuGlyph name="switch" />}
                                label="Cambiar establecimiento"
                                onPress={onSwitchEstablishment}
                            />
                        ) : null}

                        <MenuAction
                            icon={<MenuGlyph name="settings" />}
                            label="Configuracion"
                            onPress={onOpenSettings}
                        />

                        <MenuAction
                            icon={<MenuGlyph name="license" />}
                            label="Licencia"
                            onPress={onOpenLicense}
                        />

                        <MenuAction
                            icon={<MenuGlyph name="support" />}
                            label="Soporte"
                            onPress={onOpenSupport}
                        />

                        <View style={styles.appMenuDivider} />

                        <MenuAction
                            icon={<MenuGlyph name="logout" tone="danger" />}
                            label="Cerrar sesión 1"
                            tone="danger"
                            onPress={onLogout}
                        />
                    </ScrollView>


                </Pressable>
            </Pressable>
            <AppToast />
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
        width: 270,
        maxHeight: "92%",
        borderRadius: 16,
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
        paddingTop: 4,
        paddingBottom: 6,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8
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
        marginVertical: 4
    },
    menuGlyph: {
        fontSize: 16,
        lineHeight: 20,
        fontWeight: "900",
        textAlign: "center"
    },

    menuScroll: {
        flexGrow: 0
    },

    menuScrollContent: {
        paddingBottom: 2
    },

    sectionTitle: {
        marginTop: 7,
        marginBottom: 3,
        paddingHorizontal: 10,
        color: "#64748b",
        fontSize: 10,
        fontWeight: "900",
        letterSpacing: 0.7
    },


    appMenuHeaderText: {
        flex: 1,
        minWidth: 0
    },

    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f1f5f9"
    },
});
