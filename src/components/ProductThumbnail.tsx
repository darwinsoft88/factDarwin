import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import type { Product } from "../types";
import { downloadProductThumbnail } from "../services/backend";
import { catalogItemIcon, isServiceItem } from "../utils/catalogItems";
import { useAppTheme } from "../theme/AppTheme";

const thumbnailCache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const CACHE_LIMIT = 150;

function fallbackIcon(product: Product) {
  const text = `${product.code} ${product.name}`.toLowerCase();
  if (/bebida|agua|leche|jugo|cola|cerveza/.test(text)) return "bottle-soda-outline";
  if (/comida|cacao|arroz|aceite|pan|goma|dulce|snack/.test(text)) return "food-apple-outline";
  if (/limpia|jabon|detergente|lava|cloro/.test(text)) return "spray-bottle";
  if (/ropa|camisa|pantalon|zapato/.test(text)) return "tshirt-crew-outline";
  return catalogItemIcon(product);
}

export function ProductThumbnail({ product, backendUrl, token, size = 44, style }: {
  product: Product;
  backendUrl: string;
  token: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useAppTheme();
  const version = product.imageVersion || "";
  const key = version && token ? `${backendUrl}|${token}|${product.id}|${version}` : "";
  const [uri, setUri] = React.useState(key ? thumbnailCache.get(key) || "" : "");

  React.useEffect(() => {
    let active = true;
    if (!key || !token) { setUri(""); return () => { active = false; }; }
    const cached = thumbnailCache.get(key);
    if (cached) { setUri(cached); return () => { active = false; }; }
    let request = pending.get(key);
    if (!request) {
      request = downloadProductThumbnail(backendUrl, product.id, version, token);
      pending.set(key, request);
    }
    request.then((value) => {
      if (thumbnailCache.size >= CACHE_LIMIT) thumbnailCache.delete(thumbnailCache.keys().next().value as string);
      thumbnailCache.set(key, value);
      if (active) setUri(value);
    }).catch(() => { if (active) setUri(""); }).finally(() => pending.delete(key));
    return () => { active = false; };
  }, [backendUrl, key, product.id, token, version]);

  const service = isServiceItem(product);
  return (
    <View style={[styles.box, { width: size, height: size, borderColor: theme.colors.border, backgroundColor: service ? theme.colors.accentSoft : theme.colors.successSoft }, style]}>
      {uri ? <Image source={{ uri }} resizeMode="cover" style={styles.image} /> : <MaterialCommunityIcons name={fallbackIcon(product) as any} size={Math.round(size * 0.48)} color={service ? theme.colors.accent : theme.colors.success} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  image: { width: "100%", height: "100%" }
});
