import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Input, Select } from "./common";
import { CatalogItemType } from "../types";
import { sanitizeDecimalInput } from "../utils/numbers";

export type ProductFormValues = {
  itemType: CatalogItemType;
  code: string;
  name: string;
  price: string;
  cost: string;
  stock: string;
  minStock: string;
  ivaRate: string;
};

type ProductFormProps = {
  form: ProductFormValues;
  onChange: React.Dispatch<React.SetStateAction<ProductFormValues>>;
  onOpenScanner: () => void;
  onVerifyCode: () => void;
};

export function ProductForm({ form, onChange, onOpenScanner, onVerifyCode }: ProductFormProps) {
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
      <Text style={styles.sectionLabel}>Tipo de item</Text>
      <View style={styles.typeGrid}>
        <Pressable style={[styles.typeButton, !isService && styles.typeButtonProduct]} onPress={() => selectType("product")}>
          <View style={[styles.typeIcon, !isService && styles.typeIconProduct]}>
            <MaterialCommunityIcons name="package-variant-closed" size={17} color={!isService ? "#047857" : "#64748b"} />
          </View>
          <View style={styles.typeTextBlock}>
            <Text style={[styles.typeTitle, !isService && styles.typeTitleActive]}>Producto</Text>
            <Text style={styles.typeMeta}>Maneja inventario</Text>
          </View>
          {!isService ? <MaterialCommunityIcons name="check-circle" size={18} color="#0f766e" /> : null}
        </Pressable>
        <Pressable style={[styles.typeButton, isService && styles.typeButtonService]} onPress={() => selectType("service")}>
          <View style={[styles.typeIcon, isService && styles.typeIconService]}>
            <MaterialCommunityIcons name="wrench-outline" size={17} color={isService ? "#6d5bd0" : "#64748b"} />
          </View>
          <View style={styles.typeTextBlock}>
            <Text style={[styles.typeTitle, isService && styles.typeTitleService]}>Servicio</Text>
            <Text style={styles.typeMeta}>No maneja inventario</Text>
          </View>
          {isService ? <MaterialCommunityIcons name="check-circle" size={18} color="#6d5bd0" /> : null}
        </Pressable>
      </View>
      <View style={[styles.infoBanner, isService && styles.infoBannerService]}>
        <MaterialCommunityIcons name={isService ? "shield-check-outline" : "cube-outline"} size={14} color={isService ? "#6d5bd0" : "#047857"} />
        <Text style={[styles.infoText, isService && styles.infoTextService]}>
          {isService ? "Los servicios no afectan el inventario ni el stock." : "Los productos afectan el inventario y stock."}
        </Text>
      </View>

      <Input label="Codigo / barras" value={form.code} onChangeText={(code) => onChange({ ...form, code })} autoCapitalize="characters" placeholder={isService ? "Codigo interno del servicio" : "Escanee o ingrese el codigo"} onSubmitEditing={onVerifyCode} />
      <View style={styles.actionGroup}>
        <Pressable style={styles.smallButton} onPress={onVerifyCode}>
          <Text style={styles.smallButtonText}>Verificar codigo</Text>
        </Pressable>
        <Pressable style={styles.scanButton} onPress={onOpenScanner}>
          <Text style={styles.scanButtonText}>Escanear con camara</Text>
        </Pressable>
      </View>
      <Text style={styles.inlineInfo}>{isService ? "Use un codigo interno para buscar rapido el servicio en ventas." : "Puede escanear con lector Bluetooth/USB; el codigo se guarda como codigo principal del producto."}</Text>
      <Input label={isService ? "Descripcion del servicio" : "Nombre del item"} value={form.name} onChangeText={(name) => onChange({ ...form, name })} placeholder={isService ? "Ej. Servicio de instalacion" : "Ej. Goma 40g"} />
      <Input label="Precio publico" value={form.price} onChangeText={(price) => onChange({ ...form, price: sanitizeDecimalInput(price) })} keyboardType="decimal-pad" />
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
  actionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
    flexShrink: 0
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  scanButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  scanButtonText: {
    color: "#ffffff",
    fontWeight: "900",
    textAlign: "center"
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  }
});
