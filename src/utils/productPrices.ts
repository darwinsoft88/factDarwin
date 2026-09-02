import { grossToNetUnitPrice } from "../sri";
import type { Client, Product, SaleItem, SalePriceTier } from "../types";

export const SALE_PRICE_TIERS: ReadonlyArray<{ value: SalePriceTier; label: string }> = [
  { value: "pvp1", label: "PVP1" },
  { value: "pvp2", label: "PVP2" },
  { value: "pvp3", label: "PVP3" }
];

export function normalizeSalePriceTier(value: unknown): SalePriceTier {
  return value === "pvp2" || value === "pvp3" ? value : "pvp1";
}

export function clientSalePriceTier(client?: Client): SalePriceTier {
  return normalizeSalePriceTier(client?.defaultSalePriceTier);
}

export function clientWithLocalSalePricePreference(remote: Client, local?: Client): Client {
  if (remote.defaultSalePriceTier || !local?.defaultSalePriceTier) return remote;
  return { ...remote, defaultSalePriceTier: local.defaultSalePriceTier };
}

export function productPriceForTier(product: Product, tier: SalePriceTier): number {
  const alternate = tier === "pvp2" ? product.price2 : tier === "pvp3" ? product.price3 : product.price;
  return Number.isFinite(Number(alternate)) && Number(alternate) > 0 ? Number(alternate) : product.price;
}

export function availableProductPrices(product: Product) {
  return SALE_PRICE_TIERS.flatMap(({ value, label }) => {
    const configured = value === "pvp1" || (value === "pvp2" ? Number(product.price2) > 0 : Number(product.price3) > 0);
    return configured ? [{ tier: value, label, price: productPriceForTier(product, value) }] : [];
  });
}

export function effectiveProductPriceTier(product: Product, preferred: SalePriceTier): SalePriceTier {
  return availableProductPrices(product).some((item) => item.tier === preferred) ? preferred : "pvp1";
}

export function saleItemWithPriceTier(item: SaleItem, product: Product, requestedTier: SalePriceTier): SaleItem {
  const priceTier = effectiveProductPriceTier(product, requestedTier);
  return {
    ...item,
    unitPrice: grossToNetUnitPrice(productPriceForTier(product, priceTier), item.ivaRate),
    priceTier
  };
}
