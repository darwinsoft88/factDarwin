import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Input, Select } from "./common";
import { CatalogItemType } from "../types";
import { sanitizeDecimalInput } from "../utils/numbers";
import { useAppTheme } from "../theme/AppTheme";

export type ProductFormValues = {
  itemType: CatalogItemType;
  code: string;
  name: string;
  price: string;
  price2: string;
  price3: string;
  cost: string;
  stock: string;
  minStock: string;
  ivaRate: string;
};

type ProductFormProps = {
  form: ProductFormValues;
  onChange: React.Dispatch<React.SetStateAction<ProductFormValues>>;
  onOpenScanner: () => void;
};

export function ProductForm({ form, onChange, onOpenScanner }: ProductFormProps) {
  const { theme } = useAppTheme();
  const isService = form.itemType === "service";
  const selectType = (itemType: CatalogItemType) => {
    onChange({
      ...form,
      itemType,
      cost: itemType === "service" ? "0" : form.cost,
      stock: itemType === "service" ? "0" : form.stock,
      minStock: itemType === "service" ? "0" : form.minStock || "5"
    });
  };

  return (
    <>
      <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>Tipo de item</Text>
      <View style={styles.typeGrid}>
        <Pressable style={[styles.typeButton, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }, !isService && [styles.typeButtonProduct, { borderColor: theme.colors.success, backgroundColor: theme.colors.successSoft }]]} onPress={() => selectType("product")}>
          <View style={[styles.typeIcon, { backgroundColor: theme.colors.surfaceMuted }, !isService && [styles.typeIconProduct, { backgroundColor: theme.colors.successSoft }]]}>
            <MaterialCommunityIcons name="package-variant-closed" size={17} color={!isService ? theme.colors.success : theme.colors.textMuted} />
          </View>
          <View style={styles.typeTextBlock}>
            <Text style={[styles.typeTitle, { color: theme.colors.text }, !isService && [styles.typeTitleActive, { color: theme.colors.success }]]}>Producto</Text>
            <Text style={[styles.typeMeta, { color: theme.colors.textMuted }]}>Maneja inventario</Text>
          </View>
          {!isService ? <MaterialCommunityIcons name="check-circle" size={18} color={theme.colors.success} /> : null}
        </Pressable>
        <Pressable style={[styles.typeButton, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }, isService && [styles.typeButtonService, { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft }]]} onPress={() => selectType("service")}>
          <View style={[styles.typeIcon, { backgroundColor: theme.colors.surfaceMuted }, isService && [styles.typeIconService, { backgroundColor: theme.colors.accentSoft }]]}>
            <MaterialCommunityIcons name="wrench-outline" size={17} color={isService ? theme.colors.accent : theme.colors.textMuted} />
          </View>
          <View style={styles.typeTextBlock}>
            <Text style={[styles.typeTitle, { color: theme.colors.text }, isService && [styles.typeTitleService, { color: theme.colors.accent }]]}>Servicio</Text>
            <Text style={[styles.typeMeta, { color: theme.colors.textMuted }]}>No maneja inventario</Text>
          </View>
          {isService ? <MaterialCommunityIcons name="check-circle" size={18} color={theme.colors.accent} /> : null}
        </Pressable>
      </View>
      <View style={[styles.infoBanner, { backgroundColor: theme.colors.successSoft }, isService && [styles.infoBannerService, { backgroundColor: theme.colors.accentSoft }]]}>
        <MaterialCommunityIcons name={isService ? "shield-check-outline" : "cube-outline"} size={14} color={isService ? theme.colors.accent : theme.colors.success} />
        <Text style={[styles.infoText, { color: theme.colors.success }, isService && [styles.infoTextService, { color: theme.colors.accent }]]}>
          {isService ? "Los servicios no afectan el inventario ni el stock." : "Los productos afectan el inventario y stock."}
        </Text>
      </View>

      <Input
        label="Codigo / barras"
        value={form.code}
        onChangeText={(code) => onChange({ ...form, code })}
        autoCapitalize="characters"
        placeholder={isService ? "Codigo interno del servicio" : "Escanee o ingrese el codigo"}
        rightElement={(
          <Pressable accessibilityRole="button" accessibilityLabel="Escanear codigo con camara" style={[styles.scanButton, { backgroundColor: theme.colors.primary }]} onPress={onOpenScanner}>
            <MaterialCommunityIcons name="barcode-scan" size={21} color={theme.colors.onPrimary} />
          </Pressable>
        )}
      />
      <Input label={isService ? "Descripcion del servicio" : "Nombre del item"} value={form.name} onChangeText={(name) => onChange({ ...form, name })} placeholder={isService ? "Ej. Servicio de instalacion" : "Ej. Goma 40g"} />
      <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>Precios de venta</Text>
      <Text style={[styles.priceHelp, { color: theme.colors.textMuted }]}>PVP1 es obligatorio. PVP2 y PVP3 son opcionales para mayoristas u otras tarifas.</Text>
      <View style={styles.priceGrid}>
        <View style={styles.priceField}><Input label="PVP1 · Principal" value={form.price} onChangeText={(price) => onChange({ ...form, price: sanitizeDecimalInput(price) })} keyboardType="decimal-pad" /></View>
        <View style={styles.priceField}><Input label="PVP2 · Opcional" value={form.price2} onChangeText={(price2) => onChange({ ...form, price2: sanitizeDecimalInput(price2) })} keyboardType="decimal-pad" /></View>
        <View style={styles.priceField}><Input label="PVP3 · Opcional" value={form.price3} onChangeText={(price3) => onChange({ ...form, price3: sanitizeDecimalInput(price3) })} keyboardType="decimal-pad" /></View>
      </View>
      {!isService ? (
        <>
          <Input label="Costo promedio" value={form.cost} onChangeText={(cost) => onChange({ ...form, cost: sanitizeDecimalInput(cost) })} keyboardType="decimal-pad" />
          <Input label="Stock actual" value={form.stock} onChangeText={(stock) => onChange({ ...form, stock: sanitizeDecimalInput(stock) })} keyboardType="decimal-pad" />
          <Input label="Stock minimo" value={form.minStock} onChangeText={(minStock) => onChange({ ...form, minStock: sanitizeDecimalInput(minStock) })} keyboardType="decimal-pad" />
        </>
      ) : null}
      <Select label="IVA" value={form.ivaRate} onChange={(ivaRate) => onChange({ ...form, ivaRate })} options={[{ label: "15%", value: "0.15" }, { label: "12%", value: "0.12" }, { label: "8%", value: "0.08" }, { label: "0%", value: "0" }]} />
    </>
  );
}

const styles = StyleSheet.create({
  priceHelp: { fontSize: 11, fontWeight: "700", marginTop: -2 },
  priceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  priceField: { flex: 1, minWidth: 105 },
  sectionLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  typeGrid: {
    flexDirection: "row",
    gap: 8
  },
  typeButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 8
  },
  typeButtonProduct: {
    borderColor: "#34d399",
    backgroundColor: "#ecfdf5"
  },
  typeButtonService: {
    borderColor: "#a78bfa",
    backgroundColor: "#f5f3ff"
  },
  typeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center"
  },
  typeIconProduct: {
    backgroundColor: "#d1fae5"
  },
  typeIconService: {
    backgroundColor: "#ede9fe"
  },
  typeTextBlock: {
    flex: 1,
    minWidth: 0
  },
  typeTitle: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "900"
  },
  typeTitleActive: {
    color: "#065f46"
  },
  typeTitleService: {
    color: "#5b4bc4"
  },
  typeMeta: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800"
  },
  infoBanner: {
    minHeight: 34,
    borderRadius: 7,
    backgroundColor: "#ecfdf5",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  infoBannerService: {
    backgroundColor: "#f5f3ff"
  },
  infoText: {
    color: "#047857",
    flex: 1,
    fontSize: 12,
    fontWeight: "800"
  },
  infoTextService: {
    color: "#5b4bc4"
  },
  scanButton: {
    width: 42,
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center"
  }
});
