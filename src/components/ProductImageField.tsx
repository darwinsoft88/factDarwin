import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Product } from "../types";
import { showWarning } from "../utils/dialogs";
import { useAppTheme } from "../theme/AppTheme";
import { ProductThumbnail } from "./ProductThumbnail";

export type ProductImageDraft = { uri: string; base64: string } | null;

export function ProductImageField({ product, backendUrl, token, draft, removeCurrent, onChange, onRemove }: {
  product?: Product;
  backendUrl: string;
  token: string;
  draft: ProductImageDraft;
  removeCurrent: boolean;
  onChange: (value: ProductImageDraft) => void;
  onRemove: () => void;
}) {
  const { theme } = useAppTheme();

  const choose = async (camera: boolean) => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const { manipulateAsync, SaveFormat } = await import("expo-image-manipulator");
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { showWarning("Permiso requerido", "Autorice la camara para tomar la foto del producto."); return; }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { showWarning("Permiso requerido", "Autorice el acceso a fotos para elegir la imagen del producto."); return; }
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
      if (result.canceled || !result.assets[0]?.uri) return;
      const actions = Number(result.assets[0].width || 0) > 1600 ? [{ resize: { width: 1600 } }] : [];
      const normalized = await manipulateAsync(result.assets[0].uri, actions, { base64: true, compress: 0.82, format: SaveFormat.WEBP });
      if (!normalized.base64) throw new Error("La imagen no pudo convertirse.");
      onChange({ uri: normalized.uri, base64: normalized.base64 });
    } catch (error) {
      showWarning("Imagen no valida", error instanceof Error ? error.message : "No se pudo preparar la imagen.");
    }
  };

  const hasStored = Boolean(product?.imageVersion) && !removeCurrent;
  return (
    <View style={styles.section}>
      <Text style={[styles.label, { color: theme.colors.text }]}>Imagen del producto</Text>
      <View style={styles.row}>
        <View style={[styles.preview, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
          {draft ? <Image source={{ uri: draft.uri }} resizeMode="cover" style={styles.image} /> : hasStored && product ? <ProductThumbnail product={product} backendUrl={backendUrl} token={token} size={116} /> : <MaterialCommunityIcons name="image-outline" size={38} color={theme.colors.textMuted} />}
        </View>
        <View style={styles.actions}>
          <ImageAction icon="camera-outline" label="Tomar foto" onPress={() => { void choose(true); }} />
          <ImageAction icon="image-multiple-outline" label="Galeria" onPress={() => { void choose(false); }} />
          {(draft || hasStored) ? <ImageAction danger icon="trash-can-outline" label="Eliminar imagen" onPress={onRemove} /> : null}
        </View>
      </View>
      <Text style={[styles.help, { color: theme.colors.textMuted }]}>JPG, PNG o WebP, max. 5 MB. Se optimiza automaticamente a WebP.</Text>
    </View>
  );
}

function ImageAction({ icon, label, danger, onPress }: { icon: any; label: string; danger?: boolean; onPress: () => void }) {
  const { theme } = useAppTheme();
  const color = danger ? theme.colors.danger : theme.colors.primary;
  return <Pressable accessibilityRole="button" style={[styles.action, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} onPress={onPress}><MaterialCommunityIcons name={icon} size={17} color={color} /><Text style={[styles.actionText, { color }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  section: { gap: 7 }, label: { fontSize: 12, fontWeight: "900" }, row: { flexDirection: "row", gap: 10 },
  preview: { width: 118, height: 118, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  image: { width: "100%", height: "100%" }, actions: { flex: 1, gap: 7 },
  action: { minHeight: 34, borderWidth: 1, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10 },
  actionText: { fontSize: 11, fontWeight: "900" }, help: { fontSize: 10, fontWeight: "700" }
});
