import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { CatalogItemType, Product } from "../types";
import { money } from "../sri";
import { Empty, Input } from "./common";
import { PaginationControls } from "./PaginationControls";
import { catalogItemBadge, catalogItemIcon, isServiceItem } from "../utils/catalogItems";

const MODAL_PRODUCT_PAGE_SIZE = 10;

type SaleProductPickerProps = {
  search: string;
  selectedProductId: string;
  visibleProducts: Product[];
  filteredProductCount: number;
  canLoadMore: boolean;
  onSearchChange: (value: string) => void;
  onProductChange: (value: string) => void;
  onSearchSubmit: () => void;
  onOpenScanner: () => void;
  onLoadMore: () => void;
  onAddProduct: (productId: string) => void;
};

export function SaleProductPicker({
  search,
  selectedProductId,
  visibleProducts,
  filteredProductCount,
  canLoadMore,
  onSearchChange,
  onProductChange,
  onSearchSubmit,
  onOpenScanner,
  onLoadMore,
  onAddProduct
}: SaleProductPickerProps) {
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [activeType, setActiveType] = React.useState<CatalogItemType>("product");
  const [page, setPage] = React.useState(1);
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

  const selectProduct = (id: string) => {
    onProductChange(id);
  };
  const addProduct = (id: string) => {
    onAddProduct(id);
    setPickerVisible(false);
  };
  const openPicker = () => {
    if (searchText && serviceMatches.length > 0 && productMatches.length === 0) {
      setActiveType("service");
    } else if (searchText && productMatches.length > 0 && serviceMatches.length === 0) {
      setActiveType("product");
    }
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
        <Text style={styles.compactTitle} numberOfLines={1}>Productos/Servicios</Text>
        <View style={styles.productActions}>
          <View style={styles.searchBarButton}>
            <MaterialCommunityIcons
              name="magnify"
              size={17}
              color="#64748b"
            />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={onSearchChange}
              placeholder="Buscar producto o servicio"
              placeholderTextColor="#64748b"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={onSearchSubmit}
            />
            <Pressable style={styles.searchSubmitPill} onPress={openPicker}>
              <Text style={styles.searchSubmitText}>Buscar</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Escanear producto con camara" style={styles.cameraButton} onPress={onOpenScanner}>
            <MaterialCommunityIcons name="barcode-scan" size={21} color="#ffffff" />
          </Pressable>
        </View>
      </View>
      {searchText ? (
        previewProduct ? (
          <View style={styles.previewCard}>
            <View style={styles.previewIcon}>
              <MaterialCommunityIcons name={catalogItemIcon(previewProduct)} size={14} color={isServiceItem(previewProduct) ? "#6d28d9" : "#047857"} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.previewTitle} numberOfLines={1}>{previewProduct.code} - {previewProduct.name}</Text>
              <Text style={styles.previewMeta} numberOfLines={1}>
                {isServiceItem(previewProduct)
                  ? `${catalogItemBadge(previewProduct)} | Precio $ ${money(previewProduct.price)} | IVA ${money(previewProduct.ivaRate * 100)}%`
                  : `${catalogItemBadge(previewProduct)} | Exist. ${previewProduct.stock} | Precio $ ${money(previewProduct.price)} | IVA ${money(previewProduct.ivaRate * 100)}%`}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Agregar ${previewProduct.name} al detalle`} style={styles.previewAddButton} onPress={() => onAddProduct(previewProduct.id)}>
              <MaterialCommunityIcons name="plus" size={20} color="#047857" />
            </Pressable>
          </View>
        ) : (
          <View style={styles.emptyPreview}>
            <MaterialCommunityIcons name="magnify-close" size={16} color="#92400e" />
                  <Text style={styles.emptyPreviewText} numberOfLines={1}>Sin coincidencias para {searchText}</Text>
          </View>
        )
      ) : null}
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
          <Pressable style={styles.modalBackdrop} onPress={() => setPickerVisible(false)}>
            <Pressable style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View style={styles.flex}>
                  <Text style={styles.modalTitle}>Agregar item</Text>
                </View>
                <Pressable style={styles.closeButton} onPress={() => setPickerVisible(false)}>
                  <Text style={styles.closeButtonText}>Cerrar</Text>
                </Pressable>
              </View>
              <View style={styles.typeTabs}>
                <Pressable style={[styles.typeTab, activeType === "product" && styles.typeTabActive]} onPress={() => setActiveType("product")}>
                  <MaterialCommunityIcons name="package-variant-closed" size={15} color={activeType === "product" ? "#047857" : "#64748b"} />
                  <Text style={[styles.typeTabText, activeType === "product" && styles.typeTabTextActive]}>Productos</Text>
                </Pressable>
                <Pressable style={[styles.typeTab, activeType === "service" && styles.typeTabServiceActive]} onPress={() => setActiveType("service")}>
                  <MaterialCommunityIcons name="wrench-outline" size={15} color={activeType === "service" ? "#6d28d9" : "#64748b"} />
                  <Text style={[styles.typeTabText, activeType === "service" && styles.typeTabServiceTextActive]}>Servicios</Text>
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
                  <Pressable accessibilityRole="button" accessibilityLabel="Escanear codigo con camara" style={styles.inputCameraButton} onPress={onOpenScanner}>
                    <MaterialCommunityIcons name="barcode-scan" size={21} color="#ffffff" />
                  </Pressable>
                )}
              />
              <View style={styles.resultHeader}>
                <Text style={styles.resultLabel}>{activeType === "service" ? "Servicios encontrados" : "Productos encontrados"}</Text>
                <Text style={styles.resultCount}>{typedProductCount}/{filteredProductCount} registro(s)</Text>
              </View>
              <ScrollView style={styles.resultsBox} contentContainerStyle={styles.resultsContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {pageProducts.map((product) => {
                  const selected = product.id === selectedProductId;
                  return (
                    <Pressable key={product.id} style={[styles.productRow, selected && styles.productRowSelected]} onPress={() => selectProduct(product.id)}>
                      <View style={styles.flex}>
                        <Text style={[styles.productName, selected && styles.productNameSelected]} numberOfLines={1}>{product.code} - {product.name}</Text>
                        <Text style={styles.productMeta} numberOfLines={1}>
                          {isServiceItem(product)
                            ? `${catalogItemBadge(product)} | Precio $ ${money(product.price)} | IVA ${money(product.ivaRate * 100)}%`
                            : `${catalogItemBadge(product)} | Cant. ${product.stock} | Precio $ ${money(product.price)} | IVA ${money(product.ivaRate * 100)}%`}
                        </Text>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Agregar ${product.name} al detalle`} style={styles.addProductButton} onPress={() => addProduct(product.id)}>
                        <MaterialCommunityIcons name="plus" size={21} color="#047857" />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {typedProductCount === 0 ? <Empty text={`No hay ${activeType === "service" ? "servicios" : "productos"} con esa busqueda.`} /> : null}
              <PaginationControls page={currentPage} pageSize={MODAL_PRODUCT_PAGE_SIZE} totalItems={typedProductCount} onPageChange={changePage} />
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
  compactTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    alignSelf: "flex-start"
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
    maxHeight: 260,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    backgroundColor: "#ffffff"
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
  }
});
