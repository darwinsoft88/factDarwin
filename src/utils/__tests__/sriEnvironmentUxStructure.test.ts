import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

describe("SRI environment UX structure", () => {
  it("mantiene ambiente seguro para datos iniciales locales y empresas SaaS nuevas", () => {
    const local = fs.readFileSync(path.join(root, "src/database/storage.ts"), "utf8");
    const tenant = fs.readFileSync(path.join(root, "backend/src/saas.js"), "utf8");
    expect(local).toContain('environment: "1"');
    expect(tenant).toContain('environment: "1"');
  });

  it("reemplaza el selector trivial por activación guiada y confirmación explícita", () => {
    const taxSettings = fs.readFileSync(path.join(root, "src/components/IssuerTaxSettings.tsx"), "utf8");
    const screen = fs.readFileSync(path.join(root, "src/screens/SriScreen.tsx"), "utf8");
    expect(taxSettings).not.toContain('label="Ambiente"');
    expect(screen).toContain("SriEnvironmentExperienceCard");
    expect(screen).toContain("setPendingEnvironment(target)");
    expect(screen).toContain("changeSriEnvironmentAuthoritatively");
    expect(screen).toContain("Activar facturación real");
  });

  it("mantiene secuenciales disponibles dentro de configuración avanzada", () => {
    const fields = fs.readFileSync(path.join(root, "src/components/IssuerEstablishmentFields.tsx"), "utf8");
    expect(fields).toContain("Configuración avanzada · Secuenciales");
    expect(fields).toContain('label="Siguiente secuencial"');
    expect(fields).toContain('label="Siguiente secuencial guía"');
    expect(fields).toContain('label="Siguiente secuencial nota de crédito"');
  });

  it("presenta solo tres estados y dirige a las secciones existentes", () => {
    const card = fs.readFileSync(path.join(root, "src/components/SriEnvironmentExperienceCard.tsx"), "utf8");
    const presentation = fs.readFileSync(path.join(root, "src/utils/sriEnvironmentPresentation.ts"), "utf8");
    const assets = fs.readFileSync(path.join(root, "src/components/SriAssetsStatusSections.tsx"), "utf8");
    const info = fs.readFileSync(path.join(root, "src/components/IntegrationStatusInfo.tsx"), "utf8");
    expect(card).toContain("Modo de prueba");
    expect(card).toContain("Facturación real activa");
    expect(presentation).toContain("Empresa lista");
    expect(presentation).toContain("Firma electrónica lista");
    expect(presentation).toContain("Servidor del SRI verificado");
    expect(card).toContain("Completar datos de empresa");
    expect(card).toContain("Ir a firma electrónica");
    expect(card).toContain("Paso 1 · Verificar servidor SRI");
    expect(card).toContain("Paso 2 · Activar facturación real");
    expect(card).toContain("Servidor local de pruebas");
    expect(card).toContain("En este equipo no se puede activar facturación real");
    expect(card).toContain("!serverInTestMode");
    expect(card).toContain("Activar facturación real");
    expect(card).not.toContain("Cargar firma electrónica");
    expect(card).not.toContain("uploadCertificate");
    expect(card).not.toContain("Secuenciales factura/guia/nota credito");
    expect(card).not.toContain("Backend en produccion");
    expect(card).not.toContain("diagnosticItems");
    expect(assets).toContain("Configuración avanzada · Diagnóstico técnico");
    expect(card).toContain("onReturnToTests");
    expect(card).toContain("Ambiente real confirmado por el servidor");
    expect(card).toContain("flex: 1");
    expect(info).toContain('"Modo de prueba" : "Facturación real"');
  });

  it("conserva confirmación, fallo seguro y autoridad versionada", () => {
    const screen = fs.readFileSync(path.join(root, "src/screens/SriScreen.tsx"), "utf8");
    const authority = fs.readFileSync(path.join(root, "src/utils/sriEnvironmentActivation.ts"), "utf8");
    expect(screen).toContain('onActivate={() => requestEnvironmentChange("2")}');
    expect(screen).toContain("pendingEnvironment");
    expect(screen).toContain("checkConnectionForSummary");
    expect(screen).toContain("La configuración local se conservó sin cambios");
    expect(authority).toContain("current.environmentVersion");
  });
});
