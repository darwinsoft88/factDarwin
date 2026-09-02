import { AppLicense } from "../../types";
import { filterTabsByLicense, tabsForRole } from "../appAccess";

const license: AppLicense = {
  status: "active",
  plan: "pro_anual",
  startsAt: "2026-01-01",
  expiresAt: "2099-12-31",
  maxUsers: 5,
  maxDevices: 5,
  features: {
    sales: true,
    documents: false,
    clients: false,
    products: true,
    sri: false,
    inventory: true,
    cash: false,
    credits: true,
    guides: true,
    users: false,
    reports: true,
    multiDevice: true
  }
};

test("respeta los modulos desactivados tambien para el administrador de la empresa", () => {
  const tabs = filterTabsByLicense(tabsForRole("admin"), license, "admin");
  expect(tabs).not.toContain("documentos");
  expect(tabs).not.toContain("clientes");
  expect(tabs).not.toContain("caja");
  expect(tabs).not.toContain("usuarios");
  expect(tabs).not.toContain("sri");
  expect(tabs).toContain("ventas");
  expect(tabs).toContain("productos");
});

test("guias exige que ventas, SRI y el propio modulo esten habilitados", () => {
  const tabs = filterTabsByLicense(tabsForRole("vendedor"), license, "vendedor");
  expect(tabs).not.toContain("guias");
});

