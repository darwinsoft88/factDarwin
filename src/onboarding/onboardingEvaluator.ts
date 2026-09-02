import type { CompanyAssetsStatus } from "../services/backendApi/types";
import type { AppData, User } from "../types";
import { tabsForRole, filterTabsByLicense } from "../utils/appAccess";
import { isConsumerFinalClient, isIssuerBusinessConfigured, isValidUrl } from "../validation";
import { onboardingDefinition } from "./onboardingDefinition";
import type { OnboardingEvaluation, OnboardingStepId, SriOnboardingState } from "./onboardingTypes";

type CertificateStatus = CompanyAssetsStatus["certificate"] | undefined;

export function evaluateOnboarding(data: AppData, user: User, certificate?: CertificateStatus): OnboardingEvaluation {
  const availableTabs = filterTabsByLicense(tabsForRole(user.role), data.license, user.role);
  const canNavigate = (tab: "sri" | "productos" | "ventas" | "clientes") => availableTabs.includes(tab);
  const completion: Record<OnboardingStepId, boolean> = {
    business: isBusinessConfigured(data),
    product: data.products.some(isValidCatalogItem),
    "first-sale": data.sales.some(isCompletedFirstSale),
    "own-client": data.clients.some((client) => !isConsumerFinalClient(client) && Boolean(client.name.trim() && client.identification.trim()))
  };
  const routes: Record<OnboardingStepId, "sri" | "productos" | "ventas" | "clientes"> = {
    business: "sri",
    product: "productos",
    "first-sale": "ventas",
    "own-client": "clientes"
  };

  const steps = onboardingDefinition.map((definition, index) => {
    const route = routes[definition.id];
    const previousStepsComplete = onboardingDefinition.slice(0, index).every((step) => completion[step.id]);
    const routeAvailable = canNavigate(route);
    const actionable = routeAvailable && previousStepsComplete;
    return {
      ...definition,
      completed: completion[definition.id],
      actionable,
      route: actionable ? route : undefined,
      unavailableReason: actionable ? undefined : !previousStepsComplete ? "Completa primero el paso anterior." : "Esta tarea requiere permisos o un módulo habilitado."
    };
  });
  const required = steps.filter((step) => !step.optional);
  const completedRequired = required.filter((step) => step.completed).length;

  return {
    steps,
    completedRequired,
    totalRequired: required.length,
    canWork: completion.business && completion.product,
    hasPriorActivity: data.products.length > 0 || data.sales.length > 0 || data.clients.some((client) => !isConsumerFinalClient(client)),
    sri: evaluateSriReadiness(data, user, certificate)
  };
}

export function isBusinessConfigured(data: AppData): boolean {
  return isIssuerBusinessConfigured(data.issuer);
}

export function shouldMinimizeForExistingUser(evaluation: OnboardingEvaluation, welcomeRequested: boolean): boolean {
  return evaluation.hasPriorActivity && !welcomeRequested;
}

function isValidCatalogItem(item: AppData["products"][number]): boolean {
  return Boolean(item.id && item.code.trim() && item.name.trim() && Number.isFinite(item.price) && item.price > 0);
}

function isCompletedFirstSale(sale: AppData["sales"][number]): boolean {
  return sale.documentType !== "proforma" && !["BORRADOR", "PROFORMA"].includes(sale.status) && sale.items.length > 0 && sale.total > 0;
}

function evaluateSriReadiness(data: AppData, user: User, certificate?: CertificateStatus): SriOnboardingState {
  if (user.role !== "admin") {
    return { status: data.issuer.environment === "2" ? "ready-production" : "pending", label: data.issuer.environment === "2" ? "Facturación real activa" : "Modo de prueba · Pendiente por un administrador", detail: "La configuración tributaria solo está disponible para administradores.", actionable: false };
  }
  const issuer = data.issuer;
  const baseReady = isIssuerBusinessConfigured(issuer) && isValidUrl(data.backendUrl);
  const certificateReady = Boolean(certificate && !certificate.needsUpload && certificate.expirationStatus === "valid");
  if (issuer.environment === "2") {
    return { status: "ready-production", label: "Facturación real activa", detail: certificateReady ? "Ambiente real confirmado; revisa la conexión SRI antes de emitir." : "Ambiente real activo, pero la firma electrónica requiere atención.", actionable: true };
  }
  if (!baseReady || !certificateReady) {
    const detail = !certificateReady ? "Firma electrónica pendiente o no vigente." : "Revisa los datos tributarios y el punto de emisión.";
    return { status: "pending", label: "Modo de prueba", detail, actionable: true };
  }
  return { status: "ready-tests", label: "Modo de prueba · Preparado", detail: "Datos y firma listos. Activa la facturación real desde Configuración cuando decidas comenzar.", actionable: true };
}
