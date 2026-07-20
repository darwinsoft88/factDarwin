import { authorizeInvoice, reserveDocumentSequence } from "../services/backend";
import { buildInvoiceXml } from "../sri";
import { AppData, Sale, User } from "../types";
import { appendAudit } from "./audit";
import { isAccessKeyUsed, resolveInvoiceStatus } from "./documents";
import { issuerForSale, updateIssuerEstablishmentSequence } from "./establishments";
import { generateId } from "./id";
import { buildStockCredits } from "./inventory";
import { isTicketOffline } from "./invoiceStatus";
import { isConvertedSale } from "./sales";
import { sriUserMessage, userFriendlyActionError } from "./sriMessages";
import { normalizeClientForInvoice, validateBeforeIssue, validateEmissionPointLicense } from "../validation";

type AutoInvoiceParams = {
  backendToken: string;
  data: AppData;
  maxTickets?: number;
  user: User;
};

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

export async function autoInvoiceOfflineTickets({ backendToken, data, maxTickets = 3, user }: AutoInvoiceParams) {
  let nextData = data;
  let processed = 0;
  let authorized = 0;
  let failed = 0;

  for (const ticket of pendingAutoInvoiceTickets(nextData, maxTickets)) {
    processed += 1;
    const result = await autoInvoiceOneTicket(nextData, ticket, backendToken, user);
    nextData = result.data;
    if (result.authorized) authorized += 1;
    if (result.failed) failed += 1;
  }

  return { data: nextData, processed, authorized, failed };
}

async function autoInvoiceOneTicket(data: AppData, ticket: Sale, backendToken: string, user: User) {
  const attemptedAt = new Date().toISOString();
  const client = data.clients.find((item) => item.id === ticket.clientId);
  const documentIssuer = issuerForSale(data.issuer, ticket);
  const scopeId = `${documentIssuer.establishment}-${documentIssuer.emissionPoint}`;

  try {
    if (!client) throw new Error("No se encontro el cliente del ticket offline.");
    const invoiceClient = normalizeClientForInvoice(client);
    const validationErrors = validateBeforeIssue({ ...data, issuer: documentIssuer }, invoiceClient, ticket.items, {
      subtotal: ticket.subtotal,
      tax: ticket.tax,
      total: ticket.total
    }, buildStockCredits(ticket));
    validateEmissionPointLicense(data, documentIssuer, validationErrors);
    if (validationErrors.length > 0) throw new Error(validationErrors.join(" "));

    const reserved = await reserveDocumentSequence(data.backendUrl, { documentType: "factura", issuer: documentIssuer, createdAt: attemptedAt }, backendToken);
    const sequence = reserved.sequence;
    const accessKey = reserved.accessKey;
    if (!sequence || !accessKey) throw new Error("El servidor no devolvio secuencial o clave de acceso.");
    if (isAccessKeyUsed(data, accessKey)) throw new Error(`La clave de acceso ${accessKey} ya existe en otro comprobante.`);

    const invoice: Sale = {
      id: generateId(),
      documentType: "factura",
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint,
      establishmentName: ticket.establishmentName,
      clientId: ticket.clientId,
      userId: ticket.userId || user.id,
      createdAt: attemptedAt,
      sequence,
      accessKey,
      subtotal: ticket.subtotal,
      tax: ticket.tax,
      total: ticket.total,
      paymentMethod: ticket.paymentMethod || "01",
      paymentCondition: ticket.paymentCondition,
      creditDueDate: ticket.creditDueDate,
      creditBalance: ticket.paymentCondition === "credito" ? ticket.total : 0,
      creditStatus: ticket.paymentCondition === "credito" ? "pendiente" : "pagado",
      additionalInfo: (ticket.additionalInfo || []).map((field) => ({ ...field })),
      status: "BORRADOR",
      items: ticket.items.map((item) => ({ ...item })),
      sourceSaleId: ticket.id
    };
    const unsignedXml = buildInvoiceXml(invoice, invoiceClient, documentIssuer);
    const sriResult = await authorizeInvoice(data.backendUrl, unsignedXml, backendToken);
    const finalInvoice: Sale = {
      ...invoice,
      accessKey: sriResult.accessKey || invoice.accessKey,
      authorizationNumber: sriResult.authorizationNumber,
      authorizationDate: sriResult.authorizationDate,
      sriEnvironment: sriResult.sriEnvironment,
      sriMessage: sriResult.sriMessage,
      signedXml: sriResult.signedXml,
      authorizedXml: sriResult.authorizedXml,
      status: resolveInvoiceStatus(sriResult)
    };

    const convertedAt = new Date().toISOString();
    const sales = finalInvoice.status === "AUTORIZADA"
      ? [
          finalInvoice,
          ...data.sales.map((sale) => sale.id === ticket.id
            ? {
                ...sale,
                status: "CONVERTIDA" as const,
                autoInvoiceOnSync: false,
                autoInvoiceAttemptedAt: attemptedAt,
                autoInvoiceLastError: "",
                voidReason: `Convertida automaticamente a factura ${finalInvoice.sequence}`,
                voidedAt: convertedAt,
                convertedAt,
                convertedToSaleId: finalInvoice.id,
                convertedToSequence: finalInvoice.sequence,
                sriMessage: `Convertida automaticamente a factura ${finalInvoice.sequence}`
              }
            : sale)
        ]
      : [
          finalInvoice,
          ...data.sales.map((sale) => sale.id === ticket.id
            ? { ...sale, autoInvoiceAttemptedAt: attemptedAt, autoInvoiceLastError: sriUserMessage(sriResult) || `Factura generada con estado ${finalInvoice.status}` }
            : sale)
        ];
    const nextData = appendAudit({
      ...data,
      issuer: updateIssuerEstablishmentSequence(data.issuer, scopeId, "sequential", Math.max(documentIssuer.sequential + 1, Number(sequence) + 1)),
      sales
    }, user, "AUTO_INVOICE_TICKET", "sale", ticket.id, `Autofacturacion de ticket ${ticket.sequence}: ${finalInvoice.status}`, { invoiceId: finalInvoice.id, sequence: finalInvoice.sequence, status: finalInvoice.status });

    return { data: nextData, authorized: finalInvoice.status === "AUTORIZADA", failed: finalInvoice.status !== "AUTORIZADA" };
  } catch (error) {
    const message = userFriendlyActionError(error, "authorize-invoice");
    const nextData = appendAudit({
      ...data,
      sales: data.sales.map((sale) => sale.id === ticket.id
        ? { ...sale, autoInvoiceAttemptedAt: attemptedAt, autoInvoiceLastError: message }
        : sale)
    }, user, "AUTO_INVOICE_TICKET_FAILED", "sale", ticket.id, `Autofacturacion fallida de ticket ${ticket.sequence}`, { error: message });
    return { data: nextData, authorized: false, failed: true };
  }
}
