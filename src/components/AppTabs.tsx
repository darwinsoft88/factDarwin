import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { AppTab, tabLabel } from "../utils/appAccess";

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type AppTabsProps = {
  availableTabs: AppTab[];
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
};

const tabIcons: Record<AppTab, MaterialIconName> = {
  dashboard: "home-outline",
  ventas: "cart-outline",
  documentos: "file-document-multiple-outline",
  clientes: "account-group-outline",
  productos: "package-variant-closed",
  inventario: "warehouse",
  caja: "cash-register",
  creditos: "account-cash-outline",
  guias: "truck-delivery-outline",
  reportes: "chart-box-outline",
  usuarios: "account-cog-outline",
  sri: "file-certificate-outline"
};

export function AppTabs({ availableTabs, activeTab, onChange }: AppTabsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent} keyboardShouldPersistTaps="handled">
      {availableTabs.map((item) => {
        const selected = activeTab === item;
        const color = selected ? "#0f766e" : "#64748b";
        return (
          <Pressable key={item} style={[styles.tab, selected && styles.tabActive]} onPress={() => onChange(item)}>
            <MaterialCommunityIcons name={tabIcons[item]} size={16} color={color} />
            <Text style={[styles.tabText, selected && styles.tabTextActive]}>{tabLabel(item)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabs: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#e2e7f0",
    minHeight: 50,
    flexGrow: 0
  },
  tabsContent: {
    paddingHorizontal: 6,
    alignItems: "center",
    flexDirection: "row",
    minHeight: 50
  },
  tab: {
    paddingHorizontal: 10,
    minHeight: 44,
    marginHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
    borderRadius: 12,
    borderBottomWidth: 3,
    borderBottomColor: "transparent"
  },
  tabActive: {
    backgroundColor: "#ecfdf5",
    borderBottomColor: "#0f766e"
  },
  tabText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#64748b"
  },
  tabTextActive: {
    color: "#0f766e"
  }
});
