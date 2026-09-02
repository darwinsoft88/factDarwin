import { initialData } from "../../database";
import type { AppData, Product, Sale, User } from "../../types";
import { evaluateOnboarding, isBusinessConfigured, shouldMinimizeForExistingUser } from "../onboardingEvaluator";

const admin: User = { id: "user-a", companyId: "company-a", name: "Admin", email: "a@example.com", role: "admin" };

function data(overrides: Partial<AppData> = {}): AppData {
  return { ...initialData, clients: [...initialData.clients], products: [], sales: [], ...overrides };
}

const product: Product = { id: "product-1", itemType: "product", code: "P-1", name: "Producto", price: 5, cost: 1, ivaRate: 0.15, stock: 2, minStock: 0 };
const service: Product = { ...product, id: "service-1", itemType: "service", code: "S-1", name: "Servicio", stock: 0 };
const sale = { id: "sale-1", documentType: "nota_venta", clientId: "c-final", userId: admin.id, createdAt: new Date().toISOString(), sequence: "1", accessKey: "", subtotal: 5, tax: 0, total: 5, paymentMethod: "01", status: "TICKET_OFFLINE", items: [{ productId: product.id, code: product.code, name: product.name, quantity: 1, unitPrice: 5, discount: 0, ivaRate: 0 }] } as Sale;

describe("onboarding evaluator", () => {
  it("evalúa el negocio con campos operativos y no bloquea por nombre comercial opcional", () => {
    const current = data({ issuer: { ...initialData.issuer, tradeName: "" } });
    expect(isBusinessConfigured(current)).toBe(true);
  });

  it.each([
    ["régimen", { taxRegime: undefined }],
    ["tipo de contribuyente", { taxpayerType: "" }],
    ["obligación contable", { accountingRequired: "" }],
    ["agente de retención", { retentionAgent: undefined }],
  ])("no completa la empresa cuando falta %s", (_label, issuerPatch) => {
    expect(isBusinessConfigured(data({ issuer: { ...initialData.issuer, ...issuerPatch } as AppData["issuer"] }))).toBe(false);
  });

  it("exige resoluciones cuando las condiciones tributarias las declaran", () => {
    expect(isBusinessConfigured(data({ issuer: { ...initialData.issuer, specialTaxpayer: "SI", specialTaxpayerResolution: "" } }))).toBe(false);
    expect(isBusinessConfigured(data({ issuer: { ...initialData.issuer, retentionAgent: "SI", retentionAgentResolution: "" } }))).toBe(false);
  });

  it("exige nombre, dirección y las tres numeraciones del establecimiento activo", () => {
    const active = initialData.issuer.establishments![0]!;
    for (const patch of [
      { name: "" }, { address: "" }, { sequential: 0 }, { creditNoteSequential: 0 }, { remissionSequential: 0 },
    ]) {
      const issuer = { ...initialData.issuer, establishments: [{ ...active, ...patch }] };
      expect(isBusinessConfigured(data({ issuer }))).toBe(false);
    }
  });

  it("excluye Consumidor Final como cliente propio", () => {
    const result = evaluateOnboarding(data(), admin);
    expect(result.steps.find((step) => step.id === "own-client")?.completed).toBe(false);
    const consumer = initialData.clients[0]!;
    const ownClient = { ...consumer, id: "client-2", identification: "0912345678", identificationType: "05" as const, name: "Cliente real" };
    expect(evaluateOnboarding(data({ clients: [consumer, ownClient] }), admin).steps.find((step) => step.id === "own-client")?.completed).toBe(true);
  });

  it("guía en orden empresa, producto, cliente y venta", () => {
    const result = evaluateOnboarding(data(), admin);
    expect(result.steps.map((step) => step.id)).toEqual(["business", "product", "own-client", "first-sale"]);
    expect(result.steps.map((step) => step.title)).toEqual(["Configura tu empresa", "Agrega un producto o servicio", "Agrega tu primer cliente", "Registra tu primera venta"]);
    expect(result.totalRequired).toBe(4);
    expect(result.steps.every((step) => !step.optional)).toBe(true);
  });

  it("habilita cada siguiente paso cuando se completa el anterior", () => {
    const incompleteIssuer = { ...initialData.issuer, address: "" };
    const start = evaluateOnboarding(data({ issuer: incompleteIssuer }), admin);
    expect(start.steps.find((step) => step.id === "business")?.actionable).toBe(true);
    expect(start.steps.find((step) => step.id === "product")?.unavailableReason).toBe("Completa primero el paso anterior.");
    const withProduct = evaluateOnboarding(data({ products: [product] }), admin);
    expect(withProduct.steps.find((step) => step.id === "own-client")?.actionable).toBe(true);
    expect(withProduct.steps.find((step) => step.id === "first-sale")?.actionable).toBe(false);
  });

  it.each([product, service])("reconoce producto o servicio válido", (item) => {
    expect(evaluateOnboarding(data({ products: [item] }), admin).steps.find((step) => step.id === "product")?.completed).toBe(true);
  });

  it("reconoce venta interna pero no proforma ni borrador", () => {
    expect(evaluateOnboarding(data({ sales: [sale] }), admin).steps.find((step) => step.id === "first-sale")?.completed).toBe(true);
    expect(evaluateOnboarding(data({ sales: [{ ...sale, documentType: "proforma", status: "PROFORMA" }] }), admin).steps.find((step) => step.id === "first-sale")?.completed).toBe(false);
  });

  it("mantiene preparación SRI separada y usa certificado vigente", () => {
    expect(evaluateOnboarding(data({ products: [product] }), admin).sri.label).toContain("Modo de prueba");
    const certificate = { needsUpload: false, expirationStatus: "valid" } as never;
    expect(evaluateOnboarding(data({ products: [product] }), admin, certificate).sri.status).toBe("ready-tests");
    const production = data({ issuer: { ...initialData.issuer, environment: "2" } });
    expect(evaluateOnboarding(production, admin, certificate).sri.label).toBe("Facturación real activa");
    expect(production.issuer.environment).toBe("2");
  });

  it("respeta rol y licencia sin ofrecer acciones inaccesibles", () => {
    const accountant: User = { ...admin, role: "contador" };
    const accountantResult = evaluateOnboarding(data(), accountant);
    expect(accountantResult.steps.find((step) => step.id === "product")?.actionable).toBe(false);
    expect(accountantResult.sri.actionable).toBe(false);
    const suspended = data({ license: { ...initialData.license!, status: "suspended" } });
    expect(evaluateOnboarding(suspended, admin).steps.find((step) => step.id === "first-sale")?.actionable).toBe(false);
  });

  it("es un observador puro y reconoce datos locales offline", () => {
    const current = data({ products: [product], sales: [sale], pendingSync: [{ id: "pending-1", title: "offline", createdAt: new Date().toISOString(), attempts: 0, patch: {} }] });
    const before = JSON.stringify(current);
    const result = evaluateOnboarding(current, admin);
    expect(result.canWork).toBe(true);
    expect(JSON.stringify(current)).toBe(before);
    expect(current.pendingSync).toHaveLength(1);
  });

  it("protege al usuario existente y conserva bienvenida para empresa nueva", () => {
    const existing = evaluateOnboarding(data({ products: [product] }), admin);
    expect(shouldMinimizeForExistingUser(existing, false)).toBe(true);
    expect(shouldMinimizeForExistingUser(existing, true)).toBe(false);
    expect(shouldMinimizeForExistingUser(evaluateOnboarding(data(), admin), false)).toBe(false);
  });
});
