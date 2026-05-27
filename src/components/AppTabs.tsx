import React from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { AppTab, tabLabel } from "../utils/appAccess";

type AppTabsProps = {
  availableTabs: AppTab[];
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
};

export function AppTabs({ availableTabs, activeTab, onChange }: AppTabsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent} keyboardShouldPersistTaps="handled">
      {availableTabs.map((item) => (
        <Pressable key={item} style={[styles.tab, activeTab === item && styles.tabActive]} onPress={() => onChange(item)}>
          <Text style={[styles.tabText, activeTab === item && styles.tabTextActive]}>{tabLabel(item)}</Text>
        </Pressable>
      ))}
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
    paddingHorizontal: 4,
    alignItems: "center",
    flexDirection: "row",
    minHeight: 50
  },
  tab: {
    paddingHorizontal: 18,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent"
  },
  tabActive: {
    borderBottomColor: "#0f766e"
  },
  tabText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#526173"
  },
  tabTextActive: {
    color: "#0f766e"
  }
});
