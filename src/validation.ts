import { calculateLineDiscount, calculateTotals, money } from "./sri";
import { AppData, AppLicense, CatalogItemType, Client, Issuer, LicensePlan, LicenseStatus, Product, SaleItem, UserRole } from "./types";
import { isInventoryProduct } from "./utils/catalogItems";
import { canUseEmissionScope } from "./utils/license";
import { parseInputDate } from "./utils/format";
import { normalizeInvoiceStatus, normalizeSaleStatus } from "./utils/invoiceStatus";
import { normalizeTaxRegime } from "./utils/taxRegime";

const validRoles = new Set<UserRole>(["admin", "vendedor", "cajero", "contador"]);
const validLicenseStatuses = new Set<LicenseStatus>(["trial", "active", "expired", "suspended"]);
const validLicensePlans = new Set<LicensePlan>(["trial", "basico_mensual", "basico_anual", "pro_mensual", "pro_anual", "premium_mensual", "premium_anual"]);
export const CONSUMER_FINAL_MAX_INVOICE_TOTAL = 50;

export function normalizeClientIdentification(value: string) {
  return value.trim().replace(/\s+/g, "");
}

export function normalizeProductCode(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function normalizeUserEmail(value: string) {
  return value.trim().toLowerCase();
}

export function findDuplicateClient(clients: Client[], identification: string, currentId = "") {
  const normalized = normalizeClientIdentification(identification);
  return clients.find((client) => client.id !== currentId && normalizeClientIdentification(client.identification) === normalized);
}

export function findDuplicateProductCode(products: Product[], code: string, currentId = "") {
  const normalized = normalizeProductCode(code);
  return products.find((product) => product.id !== currentId && normalizeProductCode(product.code) === normalized);
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidCedula(value: string) {
  if (!/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  const thirdDigit = Number(value[2]);
  if (!((province >= 1 && province <= 24) || province === 30) || thirdDigit >= 6) return false;

  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const total = coefficients.reduce((sum, coefficient, index) => {
    const multiplied = Number(value[index]) * coefficient;
    return sum + (multiplied > 9 ? multiplied - 9 : multiplied);
  }, 0);
  const verifier = total % 10 === 0 ? 0 : 10 - (total % 10);

  return verifier === Number(value[9]);
}

export function isValidRuc(value: string) {
  if (!/^\d{13}$/.test(value) || !value.endsWith("001")) return false;
  const thirdDigit = Number(value[2]);

  if (thirdDigit < 6) return isValidCedula(value.slice(0, 10));
  if (thirdDigit === 6) return validateMod11(value, [3, 2, 7, 6, 5, 4, 3, 2], 8);
  if (thirdDigit === 9) return validateMod11(value, [4, 3, 2, 7, 6, 5, 4, 3, 2], 9);

  return false;
}

export function validateBeforeIssue(data: AppData, client: Client, items: SaleItem[], totals: { subtotal: number; tax: number; total: number }, stockCredits = new Map<string, number>()) {
  const errors: string[] = [];

  validateIssuer(data.issuer, data.backendUrl, errors);
  validateClient(client, errors);
  validateConsumerFinalInvoiceLimit(client, totals.total, errors);
  validateItems(data.products, items, errors, stockCredits);

  const recalculated = calculateTotals(items);
  if (totals.total <= 0 || recalculated.total <= 0) errors.push("El total de la factura debe ser mayor a cero.");
  if (money(totals.subtotal) !== money(recalculated.subtotal) || money(totals.tax) !== money(recalculated.tax) || money(totals.total) !== money(recalculated.total)) {
    errors.push("Los totales no cuadran. Quite y vuelva a agregar los productos.");
  }

  return errors;
}

export function validateBeforeInternalSale(data: AppData, items: SaleItem[], totals: { subtotal: number; tax: number; total: number }, stockCredits = new Map<string, number>()) {
  const errors: string[] = [];

  validateItems(data.products, items, errors, stockCredits);
  const recalculated = calculateTotals(items);
  if (totals.total <= 0 || recalculated.total <= 0) errors.push("El total de la nota de venta debe ser mayor a cero.");
  if (money(totals.subtotal) !== money(recalculated.subtotal) || money(totals.tax) !== money(recalculated.tax) || money(totals.total) !== money(recalculated.total)) {
    errors.push("Los totales no cuadran. Quite y vuelva a agregar los productos.");
  }

  return errors;
}

export function validateBeforeProforma(data: AppData, items: SaleItem[], totals: { subtotal: number; tax: number; total: number }) {
  const errors: string[] = [];

  validateItems(data.products, items, errors, new Map(), false);
  const recalculated = calculateTotals(items);
  if (totals.total <= 0 || recalculated.total <= 0) errors.push("El total de la proforma debe ser mayor a cero.");
  if (money(totals.subtotal) !== money(recalculated.subtotal) || money(totals.tax) !== money(recalculated.tax) || money(totals.total) !== money(recalculated.total)) {
    errors.push("Los totales no cuadran. Quite y vuelva a agregar los productos.");
  }

  return errors;
}

export function validateIssuer(issuer: Issuer, backendUrl: string, errors: string[]) {
  if (!isValidRuc(issuer.ruc)) errors.push("El RUC del emisor no es valido.");
  if (!issuer.businessName.trim()) errors.push("Ingrese la razon social del emisor.");
  if (!issuer.tradeName.trim()) errors.push("Ingrese el nombre comercial del emisor.");
  if (issuer.email?.trim() && !isValidEmail(issuer.email)) errors.push("Ingrese un correo de contacto valido para la empresa.");
  if (!issuer.address.trim()) errors.push("Ingrese la direccion matriz del emisor.");
  if (!/^\d{3}$/.test(issuer.establishment)) errors.push("El establecimiento debe tener 3 digitos.");
  if (!/^\d{3}$/.test(issuer.emissionPoint)) errors.push("El punto de emision debe tener 3 digitos.");
  if (!Number.isInteger(Number(issuer.sequential)) || Number(issuer.sequential) <= 0) errors.push("El secuencial debe ser mayor a cero.");
  if (issuer.specialTaxpayer === "SI" && !issuer.specialTaxpayerResolution.trim()) errors.push("Ingrese la resolucion de contribuyente especial.");
  if (issuer.retentionAgent === "SI" && !issuer.retentionAgentResolution?.trim()) errors.push("Ingrese la resolucion de agente de retencion.");
  if (!isValidUrl(backendUrl)) errors.push("La URL del backend no es valida.");
}

export function validateEmissionPointLicense(data: AppData, documentIssuer: Issuer, errors: string[]) {
  const scopeId = `${documentIssuer.establishment}-${documentIssuer.emissionPoint}`;
  if (!canUseEmissionScope(data.issuer, data.license, scopeId)) {
    errors.push(`Su plan actual no permite usar el punto de emision ${scopeId}. Actualice a Pro o seleccione el punto autorizado.`);
  }
}

export function buildProductionChecklist(issuer: Issuer, backendUrl: string, connectionResult: string) {
  const sequentialOk = Number(issuer.sequential) > 0 && Number(issuer.remissionSequential || 1) > 0 && Number(issuer.creditNoteSequential || 1) > 0;
  const backendProduction = connectionResult.includes("Ambiente backend: production");
  const backendConnected = connectionResult.includes("Backend responde: SI");
  const certOk = connectionResult.includes("Certificado existe: SI") && connectionResult.includes("Clave certificado configurada: SI");
  const sriSendOk = connectionResult.includes("Envio real al SRI: ACTIVO");
  const baseChecks = [
    { label: "RUC emisor valido", ok: isValidRuc(issuer.ruc) },
    { label: "Establecimiento y punto de emision", ok: /^\d{3}$/.test(issuer.establishment) && /^\d{3}$/.test(issuer.emissionPoint) },
    { label: "Secuenciales factura/guia/nota credito", ok: sequentialOk },
    { label: "URL de servidor configurada", ok: Boolean(backendUrl && isValidUrl(backendUrl)) }
  ];
  const connectionChecks = [
    { label: "Servidor probado en esta sesion", ok: backendConnected, pendingLabel: "PENDIENTE" },
    { label: "Certificado y clave detectados", ok: certOk, pendingLabel: "PENDIENTE" }
  ];
  const productionChecks = [
    { label: "Ambiente app en produccion", ok: issuer.environment === "2", pendingLabel: "SOLO PRODUCCION" },
    { label: "Backend en produccion", ok: backendProduction, pendingLabel: "SOLO PRODUCCION" },
    { label: "Envio real SRI activo", ok: sriSendOk, pendingLabel: "SOLO PRODUCCION" }
  ];

  return { baseChecks, connectionChecks, productionChecks };
}

export function validateClient(client: Client, errors: string[]) {
  if (!client.name.trim()) errors.push("Ingrese la razon social o nombre del cliente.");
  if (!client.address.trim()) errors.push("Ingrese la direccion del cliente.");
  if (client.email.trim() && !isValidEmail(client.email)) errors.push("Ingrese un email valido del cliente.");

  const identification = client.identification.trim();
  if (client.identificationType === "07") {
    if (identification !== "9999999999999") errors.push("Consumidor final debe usar identificacion 9999999999999.");
    return;
  }
  if (client.identificationType === "05" && !isValidCedula(identification)) errors.push("La cedula del cliente no es valida.");
  if (client.identificationType === "04" && !isValidRuc(identification)) errors.push("El RUC del cliente no es valido.");
  if (client.identificationType === "06" && identification.length < 4) errors.push("El pasaporte del cliente es muy corto.");
  if (client.identificationType === "08" && identification.length < 4) errors.push("La identificacion exterior del cliente es muy corta.");
}

export function validateConsumerFinalInvoiceLimit(client: Client, total: number, errors: string[]) {
  if (!isConsumerFinalClient(client)) return;
  if (Number(money(total)) <= CONSUMER_FINAL_MAX_INVOICE_TOTAL) return;
  errors.push(`Consumidor final solo puede usarse hasta $${money(CONSUMER_FINAL_MAX_INVOICE_TOTAL)}. Seleccione o cree un cliente con cedula/RUC para emitir esta factura.`);
}

export function normalizeClientForInvoice(client: Client): Client {
  const identification = client.identification.trim();

  if (isValidRuc(identification)) {
    return { ...client, identification, identificationType: "04" };
  }

  if (isValidCedula(identification)) {
    return { ...client, identification, identificationType: "05" };
  }

  return { ...client, identification };
}

export function isConsumerFinalClient(client?: Pick<Client, "id" | "identification" | "identificationType">) {
  return Boolean(
    client &&
    (client.id === "c-final" ||
      client.identificationType === "07" ||
      normalizeClientIdentification(client.identification || "") === "9999999999999")
  );
}

export function canonicalConsumerFinalClient(client?: Partial<Client>): Client {
  return {
    id: client?.id || "c-final",
    name: "Consumidor Final",
    identification: "9999999999999",
    identificationType: "07",
    email: "",
    phone: "",
    address: "Ecuador",
    updatedAt: client?.updatedAt || ""
  };
}

export function validateGuideForm(transporterName: string, transporterIdentification: string, transporterType: "04" | "05" | "06", plate: string, startAddress: string, endAddress: string, route: string, reason: string, startDate: string, endDate: string) {
  const errors: string[] = [];
  const identification = transporterIdentification.trim();
  const start = parseInputDate(startDate, "start");
  const end = parseInputDate(endDate, "end");

  if (!transporterName.trim()) errors.push("Ingrese transportista.");
  if (transporterType === "04" && !isValidRuc(identification)) errors.push("El RUC del transportista no es valido.");
  if (transporterType === "05" && !isValidCedula(identification)) errors.push("La cedula del transportista no es valida.");
  if (transporterType === "06" && identification.length < 4) errors.push("El pasaporte del transportista es muy corto.");
  if (!plate.trim()) errors.push("Ingrese placa.");
  if (!startAddress.trim()) errors.push("Ingrese direccion de partida.");
  if (!endAddress.trim()) errors.push("Ingrese direccion de destino.");
  if (!route.trim()) errors.push("Ingrese ruta.");
  if (!reason.trim()) errors.push("Ingrese motivo de traslado.");
  if (!start) errors.push("Fecha inicio invalida. Use YYYY-MM-DD.");
  if (!end) errors.push("Fecha fin invalida. Use YYYY-MM-DD.");
  if (start && end && end < start) errors.push("La fecha fin no puede ser menor a la fecha inicio.");

  return errors;
}

export function sanitizeAppData(data: AppData): AppData {
  const deletedIds = normalizeDeletedIds(data.deletedIds, data.auditLogs || []);
  const deletedClients = new Set(deletedIds.clients);
  const deletedProducts = new Set(deletedIds.products);
  const deletedUsers = new Set(deletedIds.users);
  const deletedInventoryMovements = new Set(deletedIds.inventoryMovements);
  const seenClients = new Set<string>();
  const clients = data.clients.map((client) => {
    if (isConsumerFinalClient(client)) return canonicalConsumerFinalClient(client);
    return {
      ...client,
      identification: normalizeClientIdentification(client.identification),
      email: client.email.trim(),
      phone: client.phone.trim(),
      updatedAt: client.updatedAt || ""
    };
  }).filter((client) => {
    if (deletedClients.has(client.id)) return false;
    const key = normalizeClientIdentification(client.identification);
    if (!key || seenClients.has(key)) return false;
    seenClients.add(key);
    return true;
  });

  const seenProducts = new Set<string>();
  const products: Product[] = data.products.map((product) => {
    const itemType: CatalogItemType = product.itemType === "service" ? "service" : "product";
    return {
    ...product,
    itemType,
    code: normalizeProductCode(product.code),
    name: product.name.trim(),
    cost: itemType === "service" ? 0 : Number.isFinite(Number(product.cost)) ? Number(product.cost) : 0,
    stock: itemType === "service" ? 0 : Number.isFinite(Number(product.stock)) ? Number(product.stock) : 0,
    minStock: itemType === "service" ? 0 : Number.isFinite(Number(product.minStock)) ? Number(product.minStock) : 5,
    updatedAt: product.updatedAt || ""
    };
  }).filter((product) => {
    if (deletedProducts.has(product.id)) return false;
    const key = normalizeProductCode(product.code);
    if (!key || seenProducts.has(key)) return false;
    seenProducts.add(key);
    return true;
  });

  const seenUsers = new Set<string>();
  const users = data.users.map((user) => ({
    ...user,
    name: user.name.trim(),
    email: normalizeUserEmail(user.email),
    role: validRoles.has(user.role as UserRole) ? user.role : "vendedor"
  })).filter((user) => {
    if (deletedUsers.has(user.id)) return false;
    const key = normalizeUserEmail(user.email);
    if (!key || seenUsers.has(key)) return false;
    seenUsers.add(key);
    return true;
  });

  return {
    ...data,
    issuer: sanitizeIssuer(data.issuer),
    clients,
    products,
    users,
    sales: (data.sales || []).map((sale) => ({ ...sale, status: normalizeSaleStatus(sale) })),
    creditPayments: data.creditPayments || [],
    inventoryMovements: (data.inventoryMovements || []).filter((movement) => !deletedInventoryMovements.has(movement.id)),
    auditLogs: data.auditLogs || [],
    receivedRetentions: data.receivedRetentions || [],
    guides: (data.guides || []).map((guide) => ({ ...guide, status: normalizeInvoiceStatus(guide.status, guide.sriMessage) })),
    cashClosings: data.cashClosings || [],
    pendingSync: data.pendingSync || [],
    deletedIds,
    license: sanitizeLicense(data.license)
  };
}

function validateItems(products: Product[], items: SaleItem[], errors: string[], stockCredits = new Map<string, number>(), checkStock = true) {
  const quantityByProduct = new Map<string, number>();

  items.forEach((item, index) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) errors.push(`Producto ${index + 1}: ya no existe en el catalogo.`);
    if (!item.code.trim()) errors.push(`Producto ${index + 1}: falta codigo principal.`);
    if (!item.name.trim()) errors.push(`Producto ${index + 1}: falta descripcion.`);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) errors.push(`Producto ${index + 1}: cantidad invalida.`);
    if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) errors.push(`Producto ${index + 1}: precio invalido.`);
    if (!Number.isFinite(item.discount || 0) || (item.discount || 0) < 0) errors.push(`Producto ${index + 1}: descuento invalido.`);
    if (calculateLineDiscount(item) > item.quantity * item.unitPrice) errors.push(`Producto ${index + 1}: descuento mayor al subtotal.`);
    if (![0, 0.15].includes(item.ivaRate)) errors.push(`Producto ${index + 1}: IVA no soportado.`);
    quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) || 0) + item.quantity);
  });

  quantityByProduct.forEach((quantity, productId) => {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product || !isInventoryProduct(product)) return;
    const availableStock = product ? product.stock + (stockCredits.get(product.id) || 0) : 0;
    if (checkStock && product && quantity > availableStock) errors.push(`${product.name}: stock insuficiente. Disponible ${availableStock}, solicitado ${quantity}.`);
  });
}

function validateMod11(value: string, coefficients: number[], verifierIndex: number) {
  const total = coefficients.reduce((sum, coefficient, index) => sum + Number(value[index]) * coefficient, 0);
  const remainder = total % 11;
  const verifier = remainder === 0 ? 0 : 11 - remainder;

  return verifier === Number(value[verifierIndex]);
}

function normalizeDeletedIds(deletedIds: AppData["deletedIds"], auditLogs: AppData["auditLogs"]) {
  const result = {
    clients: new Set<string>(deletedIds?.clients || []),
    products: new Set<string>(deletedIds?.products || []),
    users: new Set<string>(deletedIds?.users || []),
    inventoryMovements: new Set<string>(deletedIds?.inventoryMovements || [])
  };
  (auditLogs || []).forEach((log) => {
    if (!log.entityId) return;
    if (log.event === "CLIENT_DELETED") result.clients.add(log.entityId);
    if (log.event === "PRODUCT_DELETED") result.products.add(log.entityId);
    if (log.event === "USER_DELETED") result.users.add(log.entityId);
  });
  return {
    clients: Array.from(result.clients),
    products: Array.from(result.products),
    users: Array.from(result.users),
    inventoryMovements: Array.from(result.inventoryMovements)
  };
}

function sanitizeIssuer(issuer: Issuer): Issuer {
  const source = issuer || ({} as Issuer);
  const ruc = source.ruc === "1790012345001" ? "1790012344001" : source.ruc;
  const fallbackId = `${String(source.establishment || "001").padStart(3, "0")}-${String(source.emissionPoint || "001").padStart(3, "0")}`;
  const rawEstablishments = Array.isArray(source.establishments) && source.establishments.length > 0
    ? source.establishments
    : [{
      id: fallbackId,
      name: "Matriz",
      establishment: source.establishment || "001",
      emissionPoint: source.emissionPoint || "001",
      address: source.address || "",
      sequential: source.sequential || 1,
      remissionSequential: source.remissionSequential || 1,
      creditNoteSequential: source.creditNoteSequential || 1,
      active: true
    }];
  const seen = new Set<string>();
  const establishments = normalizeEstablishmentNames(rawEstablishments.map((item) => {
    const establishment = String(item.establishment || "001").replace(/\D/g, "").padStart(3, "0").slice(-3);
    const emissionPoint = String(item.emissionPoint || "001").replace(/\D/g, "").padStart(3, "0").slice(-3);
    const id = `${establishment}-${emissionPoint}`;
    return {
      id,
      name: String(item.name || `Establecimiento ${id}`).trim(),
      establishment,
      emissionPoint,
      address: String(item.address || source.address || "").trim(),
      sequential: positiveInteger(item.sequential, 1),
      remissionSequential: positiveInteger(item.remissionSequential || 1, 1),
      creditNoteSequential: positiveInteger(item.creditNoteSequential || 1, 1),
      active: item.active !== false
  };
  })).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const active = establishments.find((item) => item.id === source.activeEstablishmentId && item.active) || establishments.find((item) => item.active) || establishments[0] || {
    id: "001-001",
    name: "Matriz",
    establishment: "001",
    emissionPoint: "001",
    address: source.address || "",
    sequential: source.sequential || 1,
    remissionSequential: source.remissionSequential || 1,
    creditNoteSequential: source.creditNoteSequential || 1,
    active: true
  };

  return {
    ...source,
    ruc,
    email: normalizeUserEmail(source.email || ""),
    taxRegime: normalizeTaxRegime(source.taxRegime),
    retentionAgent: source.retentionAgent === "SI" ? "SI" : "NO",
    retentionAgentResolution: source.retentionAgent === "SI" ? String(source.retentionAgentResolution || "").trim() : "",
    activeEstablishmentId: active.id,
    establishmentsUpdatedAt: source.establishmentsUpdatedAt || "",
    establishments,
    establishment: active.establishment,
    emissionPoint: active.emissionPoint,
    address: active.address || source.address || "",
    sequential: active.sequential,
    remissionSequential: active.remissionSequential || 1,
    creditNoteSequential: active.creditNoteSequential || 1
  };
}

function normalizeEstablishmentNames<T extends { id: string; name: string; establishment: string; emissionPoint: string }>(establishments: T[]) {
  const matrizCandidates = establishments.filter((item) => item.name.trim().toLowerCase() === "matriz");
  const matrizId = matrizCandidates.find((item) => item.id === "001-001")?.id || matrizCandidates[0]?.id || "";
  const seenNames = new Set<string>();

  return establishments.map((item) => {
    let name = item.name.trim();
    if (name.toLowerCase() === "matriz" && item.id !== matrizId) {
      name = `Sucursal ${item.establishment}-${item.emissionPoint}`;
    }
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      name = `${name} ${item.establishment}-${item.emissionPoint}`;
    }
    seenNames.add(name.toLowerCase());
    return { ...item, name };
  });
}

function sanitizeLicense(license?: AppLicense): AppLicense {
  const today = new Date();
  const expires = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  const fallback: AppLicense = {
    status: "trial",
    plan: "trial",
    startsAt: today.toISOString().slice(0, 10),
    expiresAt: expires.toISOString().slice(0, 10),
    maxUsers: 3,
    maxDevices: 3,
    maxEmissionPoints: 3,
    features: {
      sales: true,
      sri: true,
      inventory: true,
      reports: true,
      multiDevice: true,
      multiEmissionPoint: true
    },
    notes: "Prueba gratuita tipo Pro por 3 meses"
  };
  const source = license || fallback;

  const plan = normalizeLicensePlan(source.plan);
  const openAllModules = plan === "trial";
  const proPlan = isProLicensePlan(plan);
  const premiumPlan = String(plan).startsWith("premium_");
  const features = {
    ...fallback.features,
    ...(source.features || {})
  };
  const multiEmissionPoint = openAllModules || proPlan || premiumPlan;

  return {
    ...fallback,
    ...source,
    status: validLicenseStatuses.has(source.status) ? source.status : fallback.status,
    plan,
    startsAt: normalizeDate(source.startsAt) || fallback.startsAt,
    expiresAt: normalizeDate(source.expiresAt) || fallback.expiresAt,
    maxUsers: positiveInteger(source.maxUsers, fallback.maxUsers),
    maxDevices: positiveInteger(source.maxDevices, fallback.maxDevices),
    maxEmissionPoints: multiEmissionPoint ? positiveInteger(source.maxEmissionPoints || 0, openAllModules ? 3 : 999) : 1,
    features: {
      ...features,
      sales: openAllModules || features.sales !== false,
      sri: openAllModules || features.sri !== false,
      inventory: openAllModules || features.inventory !== false,
      reports: openAllModules || features.reports !== false,
      multiDevice: openAllModules || features.multiDevice !== false,
      multiEmissionPoint
    },
    notes: String(source.notes || "")
  };
}

function normalizeLicensePlan(plan: unknown): LicensePlan {
  if (plan === "mensual") return "basico_mensual";
  if (plan === "anual") return "basico_anual";
  if (plan === "pro") return "pro_anual";
  return validLicensePlans.has(plan as LicensePlan) ? plan as LicensePlan : "trial";
}

function isProLicensePlan(plan: LicensePlan) {
  return plan === "pro_mensual" || plan === "pro_anual";
}

function normalizeDate(value: string) {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

function positiveInteger(value: number, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
