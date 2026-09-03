import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { CatalogItemType, Product, SalePriceTier } from "../types";
import { money } from "../sri";
import { Empty, Input } from "./common";
import { PaginationControls } from "./PaginationControls";
import { useAppTheme } from "../theme/AppTheme";
import { isServiceItem } from "../utils/catalogItems";
import { SalePriceTierSelector } from "./SalePriceTierSelector";
import { ProductThumbnail } from "./ProductThumbnail";

const MODAL_PRODUCT_PAGE_SIZE = 10;

type SaleProductPickerProps = {
  backendUrl: string;
  backendToken: string;
  search: string;
  selectedProductId: string;
  visibleProducts: Product[];
  filteredProductCount: number;
  canLoadMore: boolean;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onOpenScanner: () => void;
  onLoadMore: () => void;
  onAddProduct: (productId: string) => boolean;
  priceTier: SalePriceTier;
  onPriceTierChange: (tier: SalePriceTier) => void;
};

export function SaleProductPicker({
  backendUrl,
  backendToken,
  search,
  selectedProductId,
  visibleProducts,
  filteredProductCount,
  canLoadMore,
  onSearchChange,
  onSearchSubmit,
  onOpenScanner,
  onLoadMore,
  onAddProduct,
  priceTier,
  onPriceTierChange
}: SaleProductPickerProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;
  const safeTopPadding = Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);
  const useFullScreenPicker = windowWidth <= 600;
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [activeType, setActiveType] = React.useState<CatalogItemType>("product");
  const [page, setPage] = React.useState(1);
  const [selectedProductIds, setSelectedProductIds] = React.useState<string[]>([]);
  const productMatches = React.useMemo(() => visibleProducts.filter((product) => !isServiceItem(product)), [visibleProducts]);
  const serviceMatches = React.useMemo(() => visibleProducts.filter(isServiceItem), [visibleProducts]);
  const typedProducts = React.useMemo(
    () => activeType === "service" ? serviceMatches : productMatches,
    [activeType, productMatches, serviceMatches]
  );
  const typedProductCount = typedProducts.length;
  const totalPages = Math.max(1, Math.ceil(typedProductCount / MODAL_PRODUCT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * MODAL_PRODUCT_PAGE_SIZE;
  const pageProducts = typedProducts.slice(pageStart, pageStart + MODAL_PRODUCT_PAGE_SIZE);
  const searchText = search.trim();
  const previewProduct = visibleProducts.find((product) => product.id === selectedProductId) || visibleProducts[0];
  const activeTypeLabel = activeType === "service" ? "servicio" : "producto";
  const onLoadMoreRef = React.useRef(onLoadMore);
  const lastAutoLoadSizeRef = React.useRef(0);

  React.useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  React.useEffect(() => {
    setPage(1);
    lastAutoLoadSizeRef.current = 0;
  }, [search, activeType]);

  React.useEffect(() => {
    if (pickerVisible) {
      setPage(1);
      lastAutoLoadSizeRef.current = 0;
    }
  }, [pickerVisible]);

  React.useEffect(() => {
    if (!pickerVisible || !canLoadMore) return;
    const requiredCount = currentPage * MODAL_PRODUCT_PAGE_SIZE;
    if (typedProductCount >= requiredCount) return;
    if (visibleProducts.length <= lastAutoLoadSizeRef.current) return;
    lastAutoLoadSizeRef.current = visibleProducts.length;
    onLoadMoreRef.current();
  }, [canLoadMore, currentPage, pickerVisible, typedProductCount, visibleProducts.length]);

  const toggleProduct = (id: string) => {
    setSelectedProductIds((current) => current.includes(id)
      ? current.filter((productId) => productId !== id)
      : [...current, id]);
  };
  const addSelectedProducts = () => {
    const addedCount = selectedProductIds.reduce((count, id) => onAddProduct(id) ? count + 1 : count, 0);
    if (addedCount > 0) {
      setSelectedProductIds([]);
      setPickerVisible(false);
    }
  };
  const openPicker = () => {
    if (searchText && serviceMatches.length > 0 && productMatches.length === 0) {
      setActiveType("service");
    } else if (searchText && productMatches.length > 0 && serviceMatches.length === 0) {
      setActiveType("product");
    }
    setSelectedProductIds([]);
    setPickerVisible(true);
  };
  const changePage = (nextPage: number) => {
    const requiredCount = nextPage * MODAL_PRODUCT_PAGE_SIZE;
    if (requiredCount > typedProducts.length && canLoadMore) {
      onLoadMore();
    }
    setPage(nextPage);
  };

  return (
    <>
      <View style={styles.compactHeader}>
        <View style={styles.titleRow}>
          <Text style={[styles.compactTitle, { color: theme.colors.text }]} numberOfLines={1}>Productos/Servicios</Text>
          <SalePriceTierSelector value={priceTier} onChange={onPriceTierChange} />
        </View>
        <View style={styles.productActions}>
          <View style={[styles.searchBarButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <MaterialCommunityIcons
              name="magnify"
              size={17}
              color={theme.colors.textMuted}
            />
            <TextInput
              style={[styles.searchInput, { color: theme.colors.text }]}
              value={search}
              onChangeText={onSearchChange}
              placeholder="Buscar producto o servicio"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={onSearchSubmit}
            />
            <Pressable style={[styles.searchSubmitPill, { backgroundColor: theme.colors.primary }]} onPress={openPicker}>
              <Text style={[styles.searchSubmitText, { color: theme.colors.onPrimary }]}>Buscar</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Escanear producto con camara" style={[styles.cameraButton, { backgroundColor: theme.colors.primary }]} onPress={onOpenScanner}>
            <MaterialCommunityIcons name="barcode-scan" size={21} color={theme.colors.onPrimary} />
          </Pressable>
        </View>
      </View>
      {searchText ? (
        previewProduct ? (
          <View style={[styles.previewCard, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.primarySoft }]}>
            <ProductThumbnail product={previewProduct} backendUrl={backendUrl} token={backendToken} size={38} />
            <View style={styles.flex}>
              <Text style={[styles.previewTitle, { color: theme.colors.text }]} numberOfLines={1}>{previewProduct.code} - {previewProduct.name}</Text>
              <Text style={[styles.previewMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {isServiceItem(previewProduct)
                  ? `Precio $ ${money(previewProduct.price)} | IVA ${money(previewProduct.ivaRate * 100)}%`
                  : `Exist. ${previewProduct.stock} | Precio $ ${money(previewProduct.price)} | IVA ${money(previewProduct.ivaRate * 100)}%`}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Agregar ${previewProduct.name} al detalle`} style={[styles.previewAddButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} onPress={() => onAddProduct(previewProduct.id)}>
              <MaterialCommunityIcons name="plus" size={20} color={theme.colors.success} />
            </Pressable>
          </View>
        ) : (
          <View style={[styles.emptyPreview, { borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft }]}>
            <MaterialCommunityIcons name="magnify-close" size={16} color={theme.colors.warning} />
                  <Text style={[styles.emptyPreviewText, { color: theme.colors.warning }]} numberOfLines={1}>Sin coincidencias para {searchText}</Text>
          </View>
        )
      ) : null}
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
          <Pressable style={[styles.modalBackdrop, { backgroundColor: theme.colors.backdrop, paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }, useFullScreenPicker && styles.fullScreenBackdrop, useFullScreenPicker && { paddingTop: safeTopPadding, paddingBottom: Math.max(safeBottomPadding, androidKeyboardInset) }]} onPress={() => setPickerVisible(false)}>
            <Pressable style={[styles.modalSheet, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }, useFullScreenPicker && styles.fullScreenSheet]}>
              <View style={styles.modalHeader}>
                <View style={styles.flex}>
                  <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Agregar item</Text>
                </View>
                <Pressable style={[styles.closeButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} onPress={() => setPickerVisible(false)}>
                  <Text style={[styles.closeButtonText, { color: theme.colors.primary }]}>Cerrar</Text>
                </Pressable>
              </View>
              <View style={[styles.typeTabs, { backgroundColor: theme.colors.surfaceMuted }]}>
                <Pressable style={[styles.typeTab, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, activeType === "product" && { borderColor: theme.colors.success, backgroundColor: theme.colors.successSoft }]} onPress={() => setActiveType("product")}>
                  <MaterialCommunityIcons name="package-variant-closed" size={15} color={activeType === "product" ? theme.colors.success : theme.colors.textMuted} />
                  <Text style={[styles.typeTabText, { color: activeType === "product" ? theme.colors.success : theme.colors.textMuted }]}>Productos</Text>
                </Pressable>
                <Pressable style={[styles.typeTab, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, activeType === "service" && { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft }]} onPress={() => setActiveType("service")}>
                  <MaterialCommunityIcons name="wrench-outline" size={15} color={activeType === "service" ? theme.colors.accent : theme.colors.textMuted} />
                  <Text style={[styles.typeTabText, { color: activeType === "service" ? theme.colors.accent : theme.colors.textMuted }]}>Servicios</Text>
                </Pressable>
              </View>
              <Input
                label=""
                value={search}
                onChangeText={onSearchChange}
                placeholder={`Buscar ${activeTypeLabel}`}
                autoCapitalize="characters"
                onSubmitEditing={onSearchSubmit}
                rightElement={(
                  <Pressable accessibilityRole="button" accessibilityLabel="Escanear codigo con camara" style={[styles.inputCameraButton, { backgroundColor: theme.colors.primary }]} onPress={onOpenScanner}>
                    <MaterialCommunityIcons name="barcode-scan" size={21} color={theme.colors.onPrimary} />
                  </Pressable>
                )}
              />
              <View style={styles.resultHeader}>
                <Text style={[styles.resultLabel, { color: theme.colors.text }]}>{activeType === "service" ? "Servicios encontrados" : "Productos encontrados"}</Text>
                <Text style={[styles.resultCount, { color: theme.colors.textMuted }]}>{typedProductCount}/{filteredProductCount} registro(s)</Text>
              </View>
              <ScrollView style={[styles.resultsBox, !useFullScreenPicker && styles.boundedResults, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }, useFullScreenPicker && styles.fullScreenResults]} contentContainerStyle={styles.resultsContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {pageProducts.map((product) => {
                  const selected = selectedProductIds.includes(product.id);
                  return (
                    <Pressable key={product.id} style={[styles.productRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, selected && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={() => toggleProduct(product.id)}>
                      <ProductThumbnail product={product} backendUrl={backendUrl} token={backendToken} size={44} />
                      <View style={styles.flex}>
                        <Text style={[styles.productName, { color: selected ? theme.colors.primary : theme.colors.text }]} numberOfLines={1}>{product.code} - {product.name}</Text>
                        <Text style={[styles.productMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                          {isServiceItem(product)
                            ? `Precio $ ${money(product.price)} | IVA ${money(product.ivaRate * 100)}%`
                            : `Cant. ${product.stock} | Precio $ ${money(product.price)} | IVA ${money(product.ivaRate * 100)}%`}
                        </Text>
                      </View>
                      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${selected ? "Quitar" : "Seleccionar"} ${product.name}`} style={[styles.addProductButton, { borderColor: theme.colors.primary, backgroundColor: selected ? theme.colors.primary : theme.colors.surface }]} onPress={() => toggleProduct(product.id)}>
                        <MaterialCommunityIcons name={selected ? "check" : "plus"} size={21} color={selected ? theme.colors.onPrimary : theme.colors.success} />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {typedProductCount === 0 ? <Empty text={`No hay ${activeType === "service" ? "servicios" : "productos"} con esa busqueda.`} /> : null}
              <PaginationControls page={currentPage} pageSize={MODAL_PRODUCT_PAGE_SIZE} totalItems={typedProductCount} onPageChange={changePage} />
              {selectedProductIds.length > 0 ? (
                <Pressable accessibilityRole="button" style={[styles.addSelectedButton, { backgroundColor: theme.colors.primary }]} onPress={addSelectedProducts}>
                  <MaterialCommunityIcons name="cart-plus" size={19} color={theme.colors.onPrimary} />
                  <Text style={[styles.addSelectedText, { color: theme.colors.onPrimary }]}>Agregar {selectedProductIds.length} {selectedProductIds.length === 1 ? "item" : "items"}</Text>
                </Pressable>
              ) : null}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1
  },
  compactHeader: {
    gap: 7
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between"
  },
  compactTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    flexShrink: 0
  },
  productActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: "space-between",
    minWidth: 0
  },
  searchBarButton: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 10,
    paddingRight: 4,
    flexDirection: "row",
    gap: 7,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: "100%",
    minWidth: 0
  },
  searchInput: {
    minHeight: 34,
    color: "#111827",
    fontSize: 12,
    fontWeight: "800",
    flex: 1,
    minWidth: 0,
    paddingVertical: 0
  },
  searchSubmitPill: {
    minHeight: 28,
    borderRadius: 7,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  searchSubmitText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900"
  },
  cameraButton: {
    flexShrink: 0,
    width: 36,
    minHeight: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  previewCard: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  previewIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center"
  },
  previewTitle: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  previewMeta: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2
  },
  previewAddButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center"
  },
  emptyPreview: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 8,
    backgroundColor: "#fffbeb",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  emptyPreviewText: {
    color: "#92400e",
    fontSize: 12,
    fontWeight: "800",
    flex: 1
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    justifyContent: "flex-end",
    paddingHorizontal: MODAL_EDGE_PADDING,
    paddingTop: MODAL_EDGE_PADDING,
    paddingBottom: MODAL_SAFE_BOTTOM_PADDING
  },
  modalSheet: {
    maxHeight: "86%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10
  },
  fullScreenBackdrop: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0
  },
  fullScreenSheet: {
    flex: 1,
    width: "100%",
    maxHeight: "100%",
    borderRadius: 0,
    borderWidth: 0,
    paddingTop: 14,
    paddingBottom: 10
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  typeTabs: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  typeTab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8
  },
  typeTabActive: {
    borderColor: "#10b981",
    backgroundColor: "#ecfdf5"
  },
  typeTabServiceActive: {
    borderColor: "#8b5cf6",
    backgroundColor: "#f5f3ff"
  },
  typeTabText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900"
  },
  typeTabTextActive: {
    color: "#047857"
  },
  typeTabServiceTextActive: {
    color: "#6d28d9"
  },
  flex: {
    flex: 1,
    minWidth: 0
  },
  modalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  closeButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  closeButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  inputCameraButton: {
    width: 42,
    minHeight: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  resultLabel: {
    color: "#4b5563",
    fontSize: 12,
    fontWeight: "800"
  },
  resultCount: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
  },
  resultsBox: {
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    backgroundColor: "#ffffff"
  },
  boundedResults: {
    maxHeight: 260
  },
  fullScreenResults: {
    flex: 1,
    flexGrow: 1,
    minHeight: 0
  },
  resultsContent: {
    gap: 6,
    padding: 8
  },
  productRow: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#f8fafc"
  },
  productRowSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb"
  },
  productName: {
    color: "#111827",
    fontWeight: "900"
  },
  productNameSelected: {
    color: "#0f766e"
  },
  productMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  addProductButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center"
  },
  addSelectedButton: {
    minHeight: 46,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16
  },
  addSelectedText: {
    fontSize: 14,
    fontWeight: "900"
  }
});
