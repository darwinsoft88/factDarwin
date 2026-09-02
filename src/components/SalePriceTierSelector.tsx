import React from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { SalePriceTier } from "../types";
import { SALE_PRICE_TIERS } from "../utils/productPrices";
import { useAppTheme } from "../theme/AppTheme";

const tierNames: Record<SalePriceTier, string> = {
  pvp1: "Precio principal",
  pvp2: "Mayorista",
  pvp3: "Tarifa especial"
};

export function SalePriceTierSelector({ value, onChange }: { value: SalePriceTier; onChange: (tier: SalePriceTier) => void }) {
  const { theme } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const triggerRef = React.useRef<View | null>(null);
  const infoRef = React.useRef<View | null>(null);
  const [visible, setVisible] = React.useState(false);
  const [infoVisible, setInfoVisible] = React.useState(false);
  const [anchor, setAnchor] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
  const [infoAnchor, setInfoAnchor] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
  const menuWidth = Math.min(210, windowWidth - 16);

  const open = () => triggerRef.current?.measureInWindow((x, y, width, height) => {
    setAnchor({ x, y, width, height });
    setVisible(true);
  });
  const openInfo = () => infoRef.current?.measureInWindow((x, y, width, height) => {
    setInfoAnchor({ x, y, width, height });
    setInfoVisible(true);
  });

  return (
    <View style={styles.container}>
      <Pressable ref={triggerRef} accessibilityRole="button" accessibilityLabel="Cambiar tarifa para los próximos productos" style={[styles.trigger, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} onPress={open}>
        <Text style={[styles.triggerText, { color: theme.colors.primary }]} numberOfLines={1}> {value.toUpperCase()} · {tierNames[value]}</Text>
        <MaterialCommunityIcons name={visible ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.primary} />
      </Pressable>
      <Pressable ref={infoRef} accessibilityRole="button" accessibilityLabel="Información sobre lista de precios" style={[styles.infoButton, { backgroundColor: theme.colors.primarySoft }]} onPress={openInfo}>
        <MaterialCommunityIcons name="information-outline" size={17} color={theme.colors.primary} />
      </Pressable>
      <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={[styles.menu, { width: menuWidth, left: Math.max(8, Math.min(anchor.x, windowWidth - menuWidth - 8)), top: anchor.y + anchor.height + 4, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]} onPress={(event) => event.stopPropagation()}>
            {SALE_PRICE_TIERS.map((option) => {
              const active = option.value === value;
              return (
                <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.option, { borderBottomColor: theme.colors.border }, active && { backgroundColor: theme.colors.primarySoft }]} onPress={() => { onChange(option.value); setVisible(false); }}>
                  <View>
                    <Text style={[styles.optionTitle, { color: active ? theme.colors.primary : theme.colors.text }]}>{option.label}</Text>
                    <Text style={[styles.optionDetail, { color: theme.colors.textMuted }]}>{tierNames[option.value]}</Text>
                  </View>
                  {active ? <MaterialCommunityIcons name="check" size={17} color={theme.colors.primary} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal transparent visible={infoVisible} animationType="fade" onRequestClose={() => setInfoVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setInfoVisible(false)}>
          <Pressable style={[styles.infoPopover, { width: menuWidth, left: Math.max(8, Math.min(infoAnchor.x + infoAnchor.width - menuWidth, windowWidth - menuWidth - 8)), top: infoAnchor.y + infoAnchor.height + 4, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.infoHeading}>
              <MaterialCommunityIcons name="information-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.infoTitle, { color: theme.colors.text }]}>Lista de precios</Text>
            </View>
            <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>Se aplicará a los próximos productos que agregues. Después puedes cambiar el PVP de cada producto individualmente.</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 5 },
  trigger: { alignItems: "center", borderRadius: 8, borderWidth: 1, flexDirection: "row", flexShrink: 1, gap: 4, minHeight: 34, paddingHorizontal: 9 },
  triggerText: { flexShrink: 1, fontSize: 10, fontWeight: "900" },
  infoButton: { alignItems: "center", borderRadius: 17, height: 34, justifyContent: "center", width: 34 },
  backdrop: { backgroundColor: "transparent", flex: 1 },
  menu: { borderRadius: 10, borderWidth: 1, elevation: 8, overflow: "hidden", position: "absolute", shadowColor: "#000000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 10 },
  option: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 48, paddingHorizontal: 12 },
  optionTitle: { fontSize: 11, fontWeight: "900" },
  optionDetail: { fontSize: 10, fontWeight: "700", marginTop: 1 },
  infoPopover: { borderRadius: 10, borderWidth: 1, elevation: 8, padding: 12, position: "absolute", shadowColor: "#000000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 10 },
  infoHeading: { alignItems: "center", flexDirection: "row", gap: 6 },
  infoTitle: { fontSize: 12, fontWeight: "900" },
  infoText: { fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: 6 }
});
