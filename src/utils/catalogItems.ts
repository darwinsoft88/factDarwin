import { CatalogItemType, Product, SaleItem } from "../types";

type CatalogTypedItem = Pick<Product | SaleItem, "itemType"> | undefined | null;

export function getCatalogItemType(item: CatalogTypedItem): CatalogItemType {
  return item?.itemType === "service" ? "service" : "product";
}

export function isServiceItem(item: CatalogTypedItem) {
  return getCatalogItemType(item) === "service";
}

export function isInventoryProduct(item: CatalogTypedItem) {
  return getCatalogItemType(item) === "product";
}

export function catalogItemLabel(item: CatalogTypedItem) {
  return isServiceItem(item) ? "Servicio" : "Producto";
}

export function catalogItemBadge(item: CatalogTypedItem) {
  return isServiceItem(item) ? "SERVICIO" : "PRODUCTO";
}

export function catalogItemIcon(item: CatalogTypedItem) {
  return isServiceItem(item) ? "wrench-outline" : "package-variant-closed";
}

export function catalogItemTone(item: CatalogTypedItem) {
  return isServiceItem(item) ? "service" : "product";
}
