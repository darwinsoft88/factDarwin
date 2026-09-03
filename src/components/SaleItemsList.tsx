import React, { useCallback, useEffect, useRef } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Animated, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { money, calculateLineDiscount, calculateLineTotal } from "../sri";
import { Product, SaleItem, SalePriceTier } from "../types";
import { catalogItemIcon, isServiceItem } from "../utils/catalogItems";
import { calculateGrossUnitPrice, formatQuantity } from "../utils/sales";
import { useAppTheme } from "../theme/AppTheme";
import { availableProductPrices } from "../utils/productPrices";
import { ProductThumbnail } from "./ProductThumbnail";

type SaleItemsListProps = {
  backendUrl: string;
  backendToken: string;
  items: SaleItem[];
  products: Product[];
  onAdjustQuantity: (index: number, amount: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onChangePriceTier: (index: number, tier: SalePriceTier) => boolean;
};

export function SaleItemsList({ items, products, backendUrl, backendToken, onAdjustQuantity, onEdit, onDelete, onChangePriceTier }: SaleItemsListProps) {
  const { theme } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [quickPriceIndex, setQuickPriceIndex] = React.useState<number | null>(null);
  const [quickPriceAnchor, setQuickPriceAnchor] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
  const quickItem = quickPriceIndex !== null ? items[quickPriceIndex] : undefined;
  const quickProduct = quickItem ? products.find((product) => product.id === quickItem.productId) : undefined;
  const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (items.length === 0) {
    return (
      <View style={[styles.cartBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <View style={[styles.header, { backgroundColor: theme.colors.surfaceMuted, borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Detalle de venta</Text>
          <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>0 lineas | 0 unid.</Text>
        </View>
        <View style={[styles.emptyState, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>Aun no hay productos o servicios. Busca uno arriba para agregarlo.</Text>
        </View>
      </View>
    );
  }

  return (
    <>
    <View style={[styles.cartBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surfaceMuted, borderBottomColor: theme.colors.border }]}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Detalle de venta</Text>
        <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>{items.length} linea{items.length === 1 ? "" : "s"} | {formatQuantity(totalUnits)} unid.</Text>
      </View>
      <View style={[styles.gestureHint, { backgroundColor: theme.colors.primarySoft }]}>
        <MaterialCommunityIcons name="gesture-swipe-left" size={14} color={theme.colors.primary} />
        <Text style={[styles.gestureHintText, { color: theme.colors.primary }]}>Toque un item para editar. Deslice a la izquierda para eliminar.</Text>
      </View>
      {items.map((item, index) => {
        const rowKey = `${item.sourceLineKey || item.productId}-${item.code}-${index}`;
        return (
          <SaleItemRow
            key={rowKey}
            item={item}
            product={products.find((product) => product.id === item.productId)}
            backendUrl={backendUrl}
            backendToken={backendToken}
            index={index}
            isLast={index === items.length - 1}
            onAdjustQuantity={onAdjustQuantity}
            onEdit={onEdit}
            onDelete={onDelete}
            quickPriceOpen={quickPriceIndex === index}
            onToggleQuickPrice={(anchor) => {
              setQuickPriceAnchor(anchor);
              setQuickPriceIndex((current) => current === index ? null : index);
            }}
          />
        );
      })}
    </View>
    <Modal transparent visible={quickPriceIndex !== null} animationType="fade" onRequestClose={() => setQuickPriceIndex(null)}>
      <Pressable style={styles.quickPriceBackdrop} onPress={() => setQuickPriceIndex(null)}>
        <Pressable style={[styles.quickPriceFloating, { left: Math.max(8, Math.min(quickPriceAnchor.x + quickPriceAnchor.width - 168, windowWidth - 176)), top: quickPriceAnchor.y + quickPriceAnchor.height + 4, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]} onPress={(event) => event.stopPropagation()}>
          <Text style={[styles.quickPriceTitle, { color: theme.colors.text }]} numberOfLines={1}>{quickItem?.name || "Producto"}</Text>
          {(quickProduct ? availableProductPrices(quickProduct) : []).map((option) => {
            const active = option.tier === quickItem?.priceTier;
            return <Pressable key={option.tier} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.floatingPriceOption, { borderBottomColor: theme.colors.border }, active && { backgroundColor: theme.colors.primarySoft }]} onPress={() => {
              if (quickPriceIndex !== null && onChangePriceTier(quickPriceIndex, option.tier)) setQuickPriceIndex(null);
            }}><Text style={[styles.inlinePriceLabel, { color: active ? theme.colors.primary : theme.colors.text }]}>{active ? "✓ " : ""}{option.label}</Text><Text style={[styles.inlinePriceValue, { color: theme.colors.textMuted }]}>${money(option.price)}</Text></Pressable>;
          })}
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

type SwipeSaleItemRowProps = {
  item: SaleItem;
  product?: Product;
  backendUrl: string;
  backendToken: string;
  index: number;
  isLast: boolean;
  onAdjustQuantity: (index: number, amount: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  quickPriceOpen: boolean;
  onToggleQuickPrice: (anchor: { x: number; y: number; width: number; height: number }) => void;
};

function SaleItemRow(props: SwipeSaleItemRowProps) {
  return <SwipeSaleItemRow {...props} />;
}

function SwipeSaleItemRow({ item, product, backendUrl, backendToken, index, isLast, onAdjustQuantity, onEdit, onDelete, quickPriceOpen, onToggleQuickPrice }: SwipeSaleItemRowProps) {
  const { theme } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const compactLayout = windowWidth < 360;
  const translateX = useRef(new Animated.Value(0)).current;
  const rowWidthRef = useRef(0);
  const priceChipRef = useRef<View | null>(null);

  const closeRow = useCallback((animated = true) => {
    if (animated) {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8, tension: 80 }).start();
      return;
    }
    translateX.setValue(0);
  }, [translateX]);

  useEffect(() => {
    closeRow(false);
  }, [closeRow, item.productId, item.code, item.quantity]);

  const deleteWithSlide = () => {
    const rowWidth = Math.max(rowWidthRef.current, 320);
    Animated.timing(translateX, { toValue: -rowWidth, duration: 180, useNativeDriver: true }).start(() => {
      translateX.setValue(0);
      onDelete(index);
    });
  };
// para que funcione el gesto de deslizar para eliminar, se utiliza un PanResponder que detecta el movimiento horizontal del dedo sobre la fila del item. Si el desplazamiento horizontal es suficiente (más del 35% del ancho de la fila), se llama a la función deleteWithSlide para eliminar el item. Si no, se cierra la fila volviendo a su posición original.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) => {
        if (Platform.OS === "web") {
          return Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
        }
        return Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_event, gesture) => {
        const rowWidth = Math.max(rowWidthRef.current, 320);
        const nextValue = Math.max(-rowWidth, Math.min(0, gesture.dx));
        translateX.setValue(nextValue);
      },
      onPanResponderRelease: (_event, gesture) => {
        const rowWidth = Math.max(rowWidthRef.current, 320);
        const shouldDelete = Platform.OS === "web"
          ? gesture.dx <= -(rowWidth * 0.2) && Math.abs(gesture.dx) > 10
          : gesture.dx <= -(rowWidth * 0.25) && Math.abs(gesture.dx) > 15;
        if (shouldDelete) deleteWithSlide();
        else closeRow();
      },
      onPanResponderTerminate: () => closeRow()
    })
  ).current;
  const isService = isServiceItem(item);
  const discount = calculateLineDiscount(item);
  const baseBeforeDiscount = Math.max(0, item.quantity * item.unitPrice);
  const discountPercentage = baseBeforeDiscount > 0 ? Math.min(100, (discount / baseBeforeDiscount) * 100) : 0;
  const displayedDiscountPercentage = Number(discountPercentage.toFixed(2));

  return (
    <View style={[styles.swipeRow, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.danger }, isLast && styles.lastRow]} onLayout={(event) => { rowWidthRef.current = event.nativeEvent.layout.width; }}>
      <View style={styles.deleteReveal} pointerEvents="none">
        <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.onPrimary} />
        <Text style={styles.deleteRevealText}>Eliminar</Text>
      </View>
      <Animated.View style={[styles.row, Platform.OS === "web" && ({ touchAction: "pan-y" } as any), { backgroundColor: theme.colors.surface, transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${item.name}`} style={styles.rowTapSurface} onPress={() => onEdit(index)}>
          <View style={styles.itemTapArea}>
            {product ? <ProductThumbnail product={product} backendUrl={backendUrl} token={backendToken} size={34} /> : <View style={[styles.itemIcon, { backgroundColor: isService ? theme.colors.accentSoft : theme.colors.successSoft }]}><MaterialCommunityIcons name={catalogItemIcon(item)} size={14} color={isService ? theme.colors.accent : theme.colors.success} /></View>}
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.itemMeta, { color: theme.colors.textMuted }, compactLayout && styles.itemMetaCompact]} numberOfLines={1}>${money(calculateGrossUnitPrice(item))} · IVA {formatQuantity(item.ivaRate * 100)}%</Text>
              {discount > 0 ? <Text style={[styles.itemDiscount, { color: theme.colors.success }, compactLayout && styles.itemDiscountCompact]} numberOfLines={1}>Desc. {formatQuantity(displayedDiscountPercentage)}%</Text> : null}
            </View>
            <Text style={[styles.itemTotal, { color: theme.colors.text }]}>${money(calculateLineTotal(item))}</Text>
          </View>
          <View style={styles.itemFooter}>
            {item.priceTier ? <Pressable ref={priceChipRef} accessibilityRole="button" accessibilityLabel={`Cambiar ${item.priceTier.toUpperCase()} de ${item.name}`} style={[styles.priceTierChip, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} onPress={(event) => { event.stopPropagation(); priceChipRef.current?.measureInWindow((x, y, width, height) => onToggleQuickPrice({ x, y, width, height })); }}><Text style={[styles.priceTierChipText, { color: theme.colors.primary }]}>{item.priceTier.toUpperCase()}</Text><MaterialCommunityIcons name={quickPriceOpen ? "chevron-up" : "chevron-down"} size={13} color={theme.colors.primary} /></Pressable> : <Text style={[styles.manualPriceText, { color: theme.colors.textMuted }]}>Precio manual</Text>}
            <View style={[styles.quantityControls, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }] }>
              <Pressable accessibilityLabel="Disminuir cantidad" style={[styles.qtyButton, { backgroundColor: theme.colors.primarySoft }]} onPress={(event) => { event.stopPropagation(); onAdjustQuantity(index, -1); }}><MaterialCommunityIcons name="minus" size={15} color={theme.colors.success} /></Pressable>
              <Text style={[styles.qtyText, { color: theme.colors.text }]}>{item.quantity}</Text>
              <Pressable accessibilityLabel="Aumentar cantidad" style={[styles.qtyButton, { backgroundColor: theme.colors.primarySoft }]} onPress={(event) => { event.stopPropagation(); onAdjustQuantity(index, 1); }}><MaterialCommunityIcons name="plus" size={15} color={theme.colors.success} /></Pressable>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  cartBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  header: {
    minHeight: 32,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  headerTitle: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  headerCount: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800"
  },
  gestureHint: {
    marginHorizontal: 8,
    marginTop: 8,
    marginBottom: 3,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  gestureHintText: {
    flex: 1,
    color: "#0f766e",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 12
  },
  emptyState: {
    marginHorizontal: 10,
    marginVertical: 12,
    minHeight: 74,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 18
  },
  emptyText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    textAlign: "center"
  },
  swipeRow: {
    position: "relative",
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7",
    backgroundColor: "#dc2626"
  },
  row: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "stretch",
    gap: 7
  },
  simpleRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7"
  },
  lastRow: {
    borderBottomWidth: 0
  },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center"
  },
  serviceItemIcon: {
    backgroundColor: "#f5f3ff"
  },
  itemInfo: {
    flex: 1,
    minWidth: 0
  },
  itemTapArea: {
    alignSelf: "stretch",
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  rowTapSurface: {
    alignSelf: "stretch",
    width: "100%",
    gap: 7
  },
  itemFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 35
  },
  itemTitle: {
    color: "#111827",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14
  },
  itemMeta: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14
  },
  itemMetaCompact: {
    fontSize: 9,
    lineHeight: 12
  },
  itemDiscount: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14
  },
  itemDiscountCompact: {
    fontSize: 10,
    lineHeight: 13
  },
  priceTierChip: { minHeight: 30, borderWidth: 1, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 8 },
  priceTierChipText: { fontSize: 10, fontWeight: "900" },
  manualPriceText: { fontSize: 9, fontWeight: "800" },
  quickPriceBackdrop: { flex: 1, backgroundColor: "transparent" },
  quickPriceFloating: { position: "absolute", width: 168, borderWidth: 1, borderRadius: 10, overflow: "hidden", shadowColor: "#000000", shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  quickPriceTitle: { fontSize: 12, fontWeight: "900", paddingHorizontal: 12, paddingVertical: 10 },
  floatingPriceOption: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 12, borderTopWidth: 1 },
  inlinePriceLabel: { fontSize: 11, fontWeight: "800" },
  inlinePriceValue: { fontSize: 11, fontWeight: "700" },
  quantityControls: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 3
  },
  simpleActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4
  },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center"
  },
  qtyText: {
    minWidth: 22,
    color: "#111827",
    textAlign: "center",
    fontSize: 13,
    fontWeight: "900"
  },
  deleteReveal: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingLeft: "82%"
  },
  deleteRevealText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900"
  },
  webDeleteReveal: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingLeft: "82%"
  },
  webDeleteButton: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center"
  },
  itemTotal: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  }
});
