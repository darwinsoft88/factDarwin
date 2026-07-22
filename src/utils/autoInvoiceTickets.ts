import { authorizeInvoice, reserveDocumentSequence } from "../services/backend";
import { buildInvoiceXml } from "../sri";
import type { AppDataMutation } from "../database/storage";
import { AppData, Sale, User } from "../types";
import { appendAudit } from "./audit";
import { isAccessKeyUsed, resolveInvoiceStatus } from "./documents";
import { issuerForSale, updateIssuerEstablishmentSequence } from "./establishments";
import { generateId } from "./id";
import { buildStockCredits } from "./inventory";
import { isTicketOffline } from "./invoiceStatus";
import { isConvertedSale, resolveSaleInventoryState } from "./sales";
import { statusForAuthorizationFailure } from "./sriRetryPolicy";
import { sriUserMessage, userFriendlyActionError } from "./sriMessages";
import { normalizeClientForInvoice, validateBeforeIssue, validateEmissionPointLicense } from "../validation";

type DurableAppDataMutation = (
  mutation: AppDataMutation,
  options?: { skipAutoBackup?: boolean; syncState?: "pending" }
) => Promise<AppData>;

type AutoInvoiceParams = {
  backendToken: string;
  initialData: AppData;
  getCurrentData: () => AppData;
  maxTickets?: number;
  persistMutation: DurableAppDataMutation;
  user: User;
};

export type AutoInvoiceResult = {
  attempted: number;
  processed: number;
  authorized: number;
  failed: number;
};

const durableMutationOptions = { skipAutoBackup: true, syncState: "pending" as const };

export function isAutoInvoiceTicket(sale: Sale, sales: Sale[]) {
  return sale.documentType === "nota_venta"
    && isTicketOffline(sale.status)
    && sale.autoInvoiceOnSync === true
    && !isConvertedSale(sale)
    && !sales.some((item) => item.documentType === "factura" && item.sourceSaleId === sale.id);
}

export function pendingAutoInvoiceTickets(data: AppData, maxTickets = 3) {
  return data.sales
    .filter((sale) => isAutoInvoiceTicket(sale, data.sales))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, maxTickets);
}

function ticketFingerprint(ticket: Sale): string {
  return JSON.stringify({
    additionalInfo: ticket.additionalInfo,
    clientId: ticket.clientId,
    creditDueDate: ticket.creditDueDate,
    inventoryOperationId: ticket.inventoryOperationId,
    inventoryState: ticket.inventoryState,
    items: ticket.items,
    paymentCondition: ticket.paymentCondition,
    paymentMethod: ticket.paymentMethod,
    sequence: ticket.sequence,
    status: ticket.status,
    subtotal: ticket.subtotal,
    tax: ticket.tax,
    total: ticket.total
  });
}

function invoiceFingerprint(invoice: Sale): string {
  return JSON.stringify({
    accessKey: invoice.accessKey,
    clientId: invoice.clientId,
    inventoryOperationId: invoice.inventoryOperationId,
    inventoryState: invoice.inventoryState,
    items: invoice.items,
    sequence: invoice.sequence,
    sourceSaleId: invoice.sourceSaleId,
    status: invoice.status
  });
}

function issuerFingerprint(data: AppData, ticket: Sale): string {
  const issuer = issuerForSale(data.issuer, ticket);
  return JSON.stringify({
    accountingRequired: issuer.accountingRequired,
    address: issuer.address,
    emissionPoint: issuer.emissionPoint,
    environment: issuer.environment,
    establishment: issuer.establishment,
    ruc: issuer.ruc
  });
}

async function persistTicketFailure(
  ticketId: string,
  expectedFingerprint: string,
  attemptedAt: string,
  message: string,
  persistMutation: DurableAppDataMutation,
  user: User
) {
  let changed = false;
  await persistMutation((current) => {
    const currentTicket = current.sales.find((sale) => sale.id === ticketId);
    if (!currentTicket || ticketFingerprint(currentTicket) !== expectedFingerprint || !isAutoInvoiceTicket(currentTicket, current.sales)) return current;
    changed = true;
    const updatedTicket: Sale = { ...currentTicket, autoInvoiceAttemptedAt: attemptedAt, autoInvoiceLastError: message };
    return appendAudit(
      { ...current, sales: current.sales.map((sale) => sale.id === ticketId ? updatedTicket : sale) },
      user,
      "AUTO_INVOICE_TICKET_FAILED",
      "sale",
      ticketId,
      `Autofacturacion fallida de ticket ${currentTicket.sequence}`,
      { error: message }
    );
  }, durableMutationOptions);
  return changed;
}

export async function autoInvoiceOfflineTickets({
  backendToken,
  initialData,
  getCurrentData,
  maxTickets = 3,
  persistMutation,
  user
}: AutoInvoiceParams): Promise<AutoInvoiceResult> {
  let attempted = 0;
  let processed = 0;
  let authorized = 0;
  let failed = 0;
  const candidateIds = pendingAutoInvoiceTickets(initialData, maxTickets).map((ticket) => ticket.id);

  for (const ticketId of candidateIds) {
    const latest = getCurrentData();
    const ticket = latest.sales.find((sale) => sale.id === ticketId);
    if (!ticket || !isAutoInvoiceTicket(ticket, latest.sales)) continue;
    const expectedTicketFingerprint = ticketFingerprint(ticket);
    const attemptedAt = new Date().toISOString();
    if (resolveSaleInventoryState(ticket) !== "APPLIED") {
      const changed = await persistTicketFailure(ticketId, expectedTicketFingerprint, attemptedAt, "El inventario del ticket requiere reconciliacion antes de facturarlo.", persistMutation, user);
      if (changed) processed += 1;
      failed += 1;
      continue;
    }

    const client = latest.clients.find((item) => item.id === ticket.clientId);
    if (!client) {
      const changed = await persistTicketFailure(ticketId, expectedTicketFingerprint, attemptedAt, "No se encontro el cliente del ticket offline.", persistMutation, user);
      if (changed) processed += 1;
      failed += 1;
      continue;
    }
    const documentIssuer = issuerForSale(latest.issuer, ticket);
    const expectedIssuerFingerprint = issuerFingerprint(latest, ticket);
    const invoiceClient = normalizeClientForInvoice(client);
    const validationErrors = validateBeforeIssue({ ...latest, issuer: documentIssuer }, invoiceClient, ticket.items, {
      subtotal: ticket.subtotal,
      tax: ticket.tax,
      total: ticket.total
    }, buildStockCredits(ticket));
    validateEmissionPointLicense(latest, documentIssuer, validationErrors);
    if (validationErrors.length > 0) {
      const changed = await persistTicketFailure(ticketId, expectedTicketFingerprint, attemptedAt, validationErrors.join(" "), persistMutation, user);
      if (changed) processed += 1;
      failed += 1;
      continue;
    }

    const invoiceId = generateId();
    attempted += 1;
    let reserved: Awaited<ReturnType<typeof reserveDocumentSequence>>;
    try {
      reserved = await reserveDocumentSequence(latest.backendUrl, { documentType: "factura", issuer: documentIssuer, createdAt: attemptedAt }, backendToken);
      if (!reserved.sequence || !reserved.accessKey) throw new Error("El servidor no devolvio secuencial o clave de acceso.");
    } catch (error) {
      const message = userFriendlyActionError(error, "reserve-sequence");
      const changed = await persistTicketFailure(ticketId, expectedTicketFingerprint, attemptedAt, message, persistMutation, user);
      if (changed) processed += 1;
      failed += 1;
      continue;
    }
    const reservedSequence = reserved.sequence;
    const reservedAccessKey = reserved.accessKey;

    let draftCreated = false;
    const persistedDraft = await persistMutation((current) => {
      const currentTicket = current.sales.find((sale) => sale.id === ticketId);
      if (!currentTicket || ticketFingerprint(currentTicket) !== expectedTicketFingerprint || !isAutoInvoiceTicket(currentTicket, current.sales)) return current;
      if (resolveSaleInventoryState(currentTicket) !== "APPLIED") return current;
      if (issuerFingerprint(current, currentTicket) !== expectedIssuerFingerprint) return current;
      if (current.sales.some((sale) => sale.documentType === "factura" && sale.sourceSaleId === ticketId)) return current;
      if (isAccessKeyUsed(current, reservedAccessKey)) return current;
      const currentClient = current.clients.find((item) => item.id === currentTicket.clientId);
      if (!currentClient) return current;
      const currentIssuer = issuerForSale(current.issuer, currentTicket);
      const scopeId = `${currentIssuer.establishment}-${currentIssuer.emissionPoint}`;
      const invoice: Sale = {
        id: invoiceId,
        documentType: "factura",
        establishment: currentIssuer.establishment,
        emissionPoint: currentIssuer.emissionPoint,
        establishmentName: currentTicket.establishmentName,
        clientId: currentTicket.clientId,
        userId: currentTicket.userId || user.id,
        createdAt: attemptedAt,
        sequence: reservedSequence,
        accessKey: reservedAccessKey,
        subtotal: currentTicket.subtotal,
        tax: currentTicket.tax,
        total: currentTicket.total,
        paymentMethod: currentTicket.paymentMethod || "01",
        paymentCondition: currentTicket.paymentCondition,
        creditDueDate: currentTicket.creditDueDate,
        creditBalance: currentTicket.paymentCondition === "credito" ? currentTicket.total : 0,
        creditStatus: currentTicket.paymentCondition === "credito" ? "pendiente" : "pagado",
        additionalInfo: (currentTicket.additionalInfo || []).map((field) => ({ ...field })),
        status: "PENDIENTE_SRI",
        items: currentTicket.items.map((item) => ({ ...item })),
        sourceSaleId: ticketId,
        inventoryState: "NOT_APPLIED",
        inventoryOperationId: undefined
      };
      draftCreated = true;
      return appendAudit({
        ...current,
        issuer: updateIssuerEstablishmentSequence(current.issuer, scopeId, "sequential", Math.max(currentIssuer.sequential + 1, Number(reservedSequence) + 1)),
        sales: [invoice, ...current.sales]
      }, user, "AUTO_INVOICE_TICKET_PENDING", "sale", ticketId, `Autofacturacion pendiente de ticket ${currentTicket.sequence}: ${invoice.sequence}`, { invoiceId, sequence: invoice.sequence, status: invoice.status });
    }, durableMutationOptions);

    if (!draftCreated) continue;
    processed += 1;
    const draft = persistedDraft.sales.find((sale) => sale.id === invoiceId);
    const durableTicket = persistedDraft.sales.find((sale) => sale.id === ticketId);
    const durableClient = draft ? persistedDraft.clients.find((item) => item.id === draft.clientId) : undefined;
    if (!draft || !durableTicket || !durableClient) {
      failed += 1;
      continue;
    }
    const draftFingerprint = invoiceFingerprint(draft);
    const persistDraftFailure = async (message: string) => {
      await persistMutation((current) => {
        const currentDraft = current.sales.find((sale) => sale.id === invoiceId);
        const currentTicket = current.sales.find((sale) => sale.id === ticketId);
        if (!currentDraft || !currentTicket || invoiceFingerprint(currentDraft) !== draftFingerprint) return current;
        const failedStatus = statusForAuthorizationFailure(message);
        const updatedDraft: Sale = { ...currentDraft, status: failedStatus, sriMessage: message };
        const updatedTicket: Sale = { ...currentTicket, autoInvoiceAttemptedAt: attemptedAt, autoInvoiceLastError: message };
        return appendAudit({ ...current, sales: current.sales.map((sale) => sale.id === invoiceId ? updatedDraft : sale.id === ticketId ? updatedTicket : sale) }, user, "AUTO_INVOICE_TICKET_FAILED", "sale", ticketId, `Autofacturacion fallida de ticket ${currentTicket.sequence}`, { error: message, invoiceId });
      }, durableMutationOptions);
    };
    let unsignedXml: string;
    try {
      unsignedXml = buildInvoiceXml(draft, normalizeClientForInvoice(durableClient), issuerForSale(persistedDraft.issuer, draft));
    } catch (error) {
      const message = userFriendlyActionError(error, "authorize-invoice");
      await persistDraftFailure(message);
      failed += 1;
      continue;
    }

    let sriResult: Awaited<ReturnType<typeof authorizeInvoice>>;
    try {
      sriResult = await authorizeInvoice(persistedDraft.backendUrl, unsignedXml, backendToken);
    } catch (error) {
      const message = userFriendlyActionError(error, "authorize-invoice");
      await persistDraftFailure(message);
      failed += 1;
      continue;
    }

    let transitionApplied = false;
    let wasAuthorized = false;
    await persistMutation((current) => {
      const currentDraft = current.sales.find((sale) => sale.id === invoiceId);
      const currentTicket = current.sales.find((sale) => sale.id === ticketId);
      if (!currentDraft || !currentTicket || invoiceFingerprint(currentDraft) !== draftFingerprint) return current;
      if (currentDraft.inventoryState !== "NOT_APPLIED" || currentDraft.inventoryOperationId !== undefined || resolveSaleInventoryState(currentTicket) !== "APPLIED") return current;
      const finalInvoice: Sale = {
        ...currentDraft,
        accessKey: sriResult.accessKey || currentDraft.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult),
        inventoryState: "NOT_APPLIED",
        inventoryOperationId: undefined
      };
      const convertedAt = new Date().toISOString();
      const updatedTicket: Sale = finalInvoice.status === "AUTORIZADA"
        ? {
            ...currentTicket,
            status: "CONVERTIDA",
            autoInvoiceOnSync: false,
            autoInvoiceAttemptedAt: attemptedAt,
            autoInvoiceLastError: "",
            voidReason: `Convertida automaticamente a factura ${finalInvoice.sequence}`,
            voidedAt: currentTicket.voidedAt || convertedAt,
            convertedAt: currentTicket.convertedAt || convertedAt,
            convertedToSaleId: finalInvoice.id,
            convertedToSequence: finalInvoice.sequence,
            sriMessage: `Convertida automaticamente a factura ${finalInvoice.sequence}`
          }
        : {
            ...currentTicket,
            autoInvoiceAttemptedAt: attemptedAt,
            autoInvoiceLastError: sriUserMessage(sriResult) || `Factura generada con estado ${finalInvoice.status}`
          };
      transitionApplied = true;
      wasAuthorized = finalInvoice.status === "AUTORIZADA";
      return appendAudit({ ...current, sales: current.sales.map((sale) => sale.id === invoiceId ? finalInvoice : sale.id === ticketId ? updatedTicket : sale) }, user, "AUTO_INVOICE_TICKET", "sale", ticketId, `Autofacturacion de ticket ${currentTicket.sequence}: ${finalInvoice.status}`, { invoiceId, sequence: finalInvoice.sequence, status: finalInvoice.status });
    }, durableMutationOptions);
    if (!transitionApplied) continue;
    if (wasAuthorized) authorized += 1;
    else failed += 1;
  }

  return { attempted, processed, authorized, failed };
}
