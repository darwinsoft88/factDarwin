import type { Client, Product } from "../../types";
import { calculateLineTax, calculateLineTotal } from "../../sri";
import type { SaleItem } from "../../types";
import { availableProductPrices, clientSalePriceTier, clientWithLocalSalePricePreference, effectiveProductPriceTier, productPriceForTier, saleItemWithPriceTier } from "../productPrices";

const product: Product = { id: "p1", code: "001", name: "Cacao", price: 10, price2: 9.5, price3: 8.75, ivaRate: 0.15, stock: 5 };

describe("productPrices", () => {
  test("mantiene PVP1 como precio compatible y expone los adicionales", () => {
    expect(availableProductPrices(product)).toEqual([
      { tier: "pvp1", label: "PVP1", price: 10 },
      { tier: "pvp2", label: "PVP2", price: 9.5 },
      { tier: "pvp3", label: "PVP3", price: 8.75 }
    ]);
  });

  test("usa PVP1 si el precio preferido no esta configurado", () => {
    const legacy = { ...product, price2: undefined, price3: undefined };
    expect(effectiveProductPriceTier(legacy, "pvp3")).toBe("pvp1");
    expect(productPriceForTier(legacy, "pvp3")).toBe(10);
  });

  test("lee el precio predeterminado del cliente y protege clientes antiguos", () => {
    expect(clientSalePriceTier({ defaultSalePriceTier: "pvp2" } as Client)).toBe("pvp2");
    expect(clientSalePriceTier({} as Client)).toBe("pvp1");
  });

  test("conserva el PVP local si una busqueda remota antigua no lo incluye", () => {
    const local = { id: "c1", defaultSalePriceTier: "pvp2" } as Client;
    const remote = { id: "c1", name: "Mayorista" } as Client;
    expect(clientWithLocalSalePricePreference(remote, local).defaultSalePriceTier).toBe("pvp2");
    expect(clientWithLocalSalePricePreference({ ...remote, defaultSalePriceTier: "pvp3" }, local).defaultSalePriceTier).toBe("pvp3");
  });

  test("cambiar PVP de una linea conserva cantidad, descuento e IVA", () => {
    const original: SaleItem = { productId: product.id, code: product.code, name: product.name, quantity: 3, unitPrice: 10 / 1.15, discount: 1, ivaRate: 0.15, priceTier: "pvp1" };
    const changed = saleItemWithPriceTier(original, product, "pvp3");
    expect(changed).toMatchObject({ quantity: 3, discount: 1, ivaRate: 0.15, priceTier: "pvp3" });
    expect(changed.unitPrice).toBeCloseTo(8.75 / 1.15, 6);
    expect(calculateLineTax(changed)).toBeGreaterThan(0);
    expect(calculateLineTotal(changed)).toBeLessThan(calculateLineTotal(original));
  });

  test("repreciar no duplica ni cambia identidad de la linea", () => {
    const original: SaleItem = { productId: product.id, code: product.code, name: product.name, quantity: 1, unitPrice: 10 / 1.15, discount: 0, ivaRate: 0.15, priceTier: "pvp1" };
    const changed = saleItemWithPriceTier(original, product, "pvp2");
    expect(changed.productId).toBe(original.productId);
    expect(changed.code).toBe(original.code);
    expect(changed.priceTier).toBe("pvp2");
  });

  test("cambiar una linea no modifica otra linea del carrito", () => {
    const first: SaleItem = { productId: product.id, code: product.code, name: product.name, quantity: 2, unitPrice: 10 / 1.15, discount: 0, ivaRate: 0.15, priceTier: "pvp1" };
    const second: SaleItem = { ...first, productId: "p2", code: "002", name: "Otro" };
    const items = [first, second];
    const changed = items.map((item, index) => index === 0 ? saleItemWithPriceTier(item, product, "pvp3") : item);
    expect(changed[0]).not.toBe(first);
    expect(changed[0]!.priceTier).toBe("pvp3");
    expect(changed[1]).toBe(second);
  });
});
