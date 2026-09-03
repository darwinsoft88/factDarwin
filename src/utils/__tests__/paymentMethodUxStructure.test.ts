import fs from "node:fs";
import path from "node:path";

describe("payment method UX structure", () => {
  it("mantiene el selector de métodos como menú flotante sin expandir la tarjeta", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/SaleFormSection.tsx"), "utf8");
    expect(source).toContain("paymentMethodFloatingMenu");
    expect(source).toContain("paymentMethodBackdrop");
    expect(source).toContain("measureInWindow");
    expect(source).toContain('<Modal transparent animationType="fade" visible');
    expect(source).toContain("accessibilityState={{ selected }}");
    expect(source).toContain("selected && { backgroundColor: theme.colors.primarySoft }");
  });

  it("aplica el mismo patrón flotante a banco y plazo de crédito", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/SaleFormSection.tsx"), "utf8");
    expect(source).toContain("creditTermTriggerRef.current?.measureInWindow");
    expect(source).toContain("triggerRef.current?.measureInWindow");
    expect(source).toContain("TRANSFER_BANK_OPTIONS.map");
    expect(source).toContain("CREDIT_TERM_OPTIONS.map");
    expect(source.match(/paymentMethodFloatingMenu/g)?.length).toBeGreaterThanOrEqual(4);
  });
  it("muestra un aviso visible cuando se intenta vender a crédito a Consumidor Final", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/SaleFormSection.tsx"), "utf8");
    expect(source).toContain('showWarning("Cliente requerido para crédito"');
    expect(source).toContain("Consumidor Final no puede utilizar esta forma de pago.");
  });

  it("selecciona por completo los importes al enfocarlos en la PWA", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/SaleFormSection.tsx"), "utf8");
    expect(source).toContain("selectWholeAmountOnWeb");
    expect(source).toContain("target?.select?.()");
    expect(source).toContain("focusPaymentAmount");
    expect(source).toContain("focusCashTendered");
    expect(source).toContain('/iPad|iPhone|iPod/');
    expect(source).toContain('navigator.platform === "MacIntel"');
    expect(source).toContain("clearPaymentAmountDraft");
    expect(source).not.toContain("const syncedDraft");
  });
});
