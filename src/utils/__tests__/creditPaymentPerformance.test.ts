import fs from "node:fs";
import path from "node:path";

describe("credit payment synchronization architecture", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/screens/CreditsScreen.tsx"), "utf8");

  it("does not download the complete company snapshot before every payment", () => {
    expect(source).not.toContain("restoreAppData");
    expect(source).not.toContain("refreshCreditDataFromBackend");
  });

  it("publishes the durable local result before waiting for remote synchronization", () => {
    const singleResult = source.indexOf('title: "Abono registrado"');
    const singleSync = source.indexOf('await syncPatchToBackend(persisted.backendUrl, backendToken, patch, "Abono pendiente');
    const bulkResult = source.indexOf('title: "Cobro registrado"');
    const bulkSync = source.indexOf('await syncPatchToBackend(persisted.backendUrl, backendToken, patch, "Cobro multiple pendiente');

    expect(singleResult).toBeGreaterThan(-1);
    expect(singleResult).toBeLessThan(singleSync);
    expect(bulkResult).toBeGreaterThan(-1);
    expect(bulkResult).toBeLessThan(bulkSync);
  });

  it("uses the canonical receivables list for visible payable documents and modal selection", () => {
    expect(source).toContain("const pendingCreditSales = receivables;");
    expect(source).toContain("const selectedSale = paymentSaleId");
    expect(source).toContain("receivables.find((sale) => sale.id === paymentSaleId)");
    expect(source).not.toContain("sale.id === paymentSaleId || sale.id === selectedSaleId");
  });
});
