import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppTab } from "../utils/appAccess";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MaterialIconName = React.ComponentProps<
    typeof MaterialCommunityIcons
>["name"];

type BottomAppTabsProps = {
    availableTabs: AppTab[];
    activeTab: AppTab;
    onChange: (tab: AppTab) => void;
    onOpenMore: () => void;
};

type PrimaryTab = "dashboard" | "ventas" | "documentos";

const primaryTabs: {
    tab: PrimaryTab;
    label: string;
    icon: MaterialIconName;
    selectedIcon: MaterialIconName;
}[] = [
        {
            tab: "dashboard",
            label: "Inicio",
            icon: "home-outline",
            selectedIcon: "home"
        },
        {
            tab: "ventas",
            label: "Ventas",
            icon: "cart-outline",
            selectedIcon: "cart"
        },
        {
            tab: "documentos",
            label: "Documentos",
            icon: "file-document-multiple-outline",
            selectedIcon: "file-document-multiple"
        }
    ];

export function BottomAppTabs({
    availableTabs,
    activeTab,
    onChange,
    onOpenMore
}: BottomAppTabsProps) {
    const insets = useSafeAreaInsets();
    const visiblePrimaryTabs = primaryTabs.filter(({ tab }) =>
        availableTabs.includes(tab)
    );

    const primaryTabNames = visiblePrimaryTabs.map(({ tab }) => tab);
    const moreSelected = !primaryTabNames.includes(activeTab as PrimaryTab);

    return (
        <View
            style={[
                styles.navigation,
                {
                    paddingBottom: Math.max(insets.bottom, 8)
                }
            ]} >

            {visiblePrimaryTabs.map(({ tab, label, icon, selectedIcon }) => {
                const selected = activeTab === tab;
                const color = selected ? "#0f766e" : "#64748b";

                return (
                    <Pressable
                        key={tab}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Ir a ${label}`}
                        style={({ pressed }) => [
                            styles.item,
                            selected && styles.itemSelected,
                            pressed && styles.itemPressed
                        ]}
                        onPress={() => onChange(tab)}
                    >
                        <View style={[styles.iconBox, selected && styles.iconBoxSelected]}>
                            <MaterialCommunityIcons
                                name={selected ? selectedIcon : icon}
                                size={22}
                                color={color}
                            />
                        </View>

                        <Text
                            numberOfLines={1}
                            style={[styles.label, selected && styles.labelSelected]}
                        >
                            {label}
                        </Text>

                        {selected ? <View style={styles.activeIndicator} /> : null}
                    </Pressable>
                );
            })}

            <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: moreSelected }}
                accessibilityLabel="Abrir más opciones"
                style={({ pressed }) => [
                    styles.item,
                    moreSelected && styles.itemSelected,
                    pressed && styles.itemPressed
                ]}
                onPress={onOpenMore}
            >
                <View
                    style={[styles.iconBox, moreSelected && styles.iconBoxSelected]}
                >
                    <MaterialCommunityIcons
                        name={moreSelected ? "menu-open" : "menu-open"}
                        size={24}
                        color={moreSelected ? "#0f766e" : "#64748b"}
                    />
                </View>

                <Text
                    style={[styles.label, moreSelected && styles.labelSelected]}
                >
                    Menú
                </Text>

                {moreSelected ? <View style={styles.activeIndicator} /> : null}
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    navigation: {
        minHeight: 70,
        flexDirection: "row",
        alignItems: "stretch",
        backgroundColor: "#ffffff",
        borderTopWidth: 1,
        borderTopColor: "#dbe4ee",
        paddingHorizontal: 6,
        paddingTop: 5,
        paddingBottom: 0,
        shadowColor: "#0f172a",
        shadowOpacity: 0.1,
        shadowRadius: 12,
        shadowOffset: {
            width: 0,
            height: -4
        },
        elevation: 12
    },

    item: {
        flex: 1,
        minWidth: 0,
        minHeight: 58,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 4,
        position: "relative"
    },

    itemSelected: {
        backgroundColor: "#ecfdf5"
    },

    itemPressed: {
        opacity: 0.72
    },

    iconBox: {
        width: 32,
        height: 28,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center"
    },

    iconBoxSelected: {
        backgroundColor: "#d1fae5"
    },

    label: {
        marginTop: 2,
        color: "#64748b",
        fontSize: 10,
        fontWeight: "800",
        textAlign: "center"
    },

    labelSelected: {
        color: "#0f766e",
        fontWeight: "900"
    },

    activeIndicator: {
        position: "absolute",
        bottom: 1,
        width: 22,
        height: 3,
        borderRadius: 999,
        backgroundColor: "#0f766e"
    }
});
