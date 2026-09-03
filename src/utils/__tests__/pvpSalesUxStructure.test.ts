import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../..");

describe("PVP sales UX structure", () => {
  test("el selector superior explica que aplica a productos futuros", () => {
    const source = fs.readFileSync(path.join(root, "components/SalePriceTierSelector.tsx"), "utf8");
    expect(source).toContain("Lista de precios");
    expect(source).toContain("próximos productos");
    expect(source).toContain("information-outline");
    expect(source).toContain("accessibilityState={{ selected: active }}");
  });

  test("la linea expone chip y selector rapido sin eliminar el editor avanzado", () => {
    const list = fs.readFileSync(path.join(root, "components/SaleItemsList.tsx"), "utf8");
    const editor = fs.readFileSync(path.join(root, "components/SaleLineEditor.tsx"), "utf8");
    const modal = fs.readFileSync(path.join(root, "components/EntityEditModal.tsx"), "utf8");
    expect(list).toContain("priceTierChip");
    expect(list).toContain("quickPriceFloating");
    expect(list).toContain("style={styles.rowTapSurface}");
    expect(list.match(/event\.stopPropagation\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(list).toContain("onChangePriceTier(quickPriceIndex");
    expect(list).toContain("onChangePriceTier");
    expect(list).toContain("Precio manual");
    expect(list).toContain('accessibilityLabel={`Editar ${item.name}`}');
    expect(list).toContain('alignSelf: "stretch"');
    expect(list).toContain('touchAction: "pan-y"');
    expect(list).toContain('Math.abs(gesture.dx) > 5');
    expect(list).toContain("rowWidth * 0.2");
    expect(editor).toContain('title="Editar detalle"');
    expect(editor).toContain("Lista de precio de esta línea");
    expect(modal).toContain('<Modal visible={rendered}');
    expect(modal).not.toContain("AppOverlayPortal");
  });
});
