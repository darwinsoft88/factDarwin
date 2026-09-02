const crypto = require("node:crypto");

const TARGET_SEQUENCE = "000000363";
const REQUIRED_CONFIRMATION = "RESTORE-363-ANULADA-AFTER-REVIEW";

function prepareInvoice363Restoration({ sale, companyId, confirmation, now = new Date().toISOString(), auditId = crypto.randomUUID() }) {
  if (String(sale?.sequence || "").padStart(9, "0") !== TARGET_SEQUENCE) throw adminError("RESTORE_363_WRONG_SEQUENCE", "Esta accion acepta exclusivamente la factura 363.");
  if (!companyId || String(sale.companyId || sale.company_id || "") !== String(companyId)) throw adminError("RESTORE_363_COMPANY_MISMATCH", "La factura no pertenece a la empresa indicada.");
  if (sale.status !== "ERROR_SRI") throw adminError("RESTORE_363_STATUS_INVALID", "La factura 363 debe estar ERROR_SRI antes de restaurar su estado terminal.");
  if (sale.inventoryState !== "REVERSED") throw adminError("RESTORE_363_INVENTORY_INVALID", "La factura 363 debe conservar inventoryState=REVERSED.");
  if (confirmation !== REQUIRED_CONFIRMATION) throw adminError("RESTORE_363_CONFIRMATION_REQUIRED", `Se requiere confirmacion exacta: ${REQUIRED_CONFIRMATION}`);

  const restoredSale = {
    ...sale,
    status: "ANULADA",
    inventoryState: "REVERSED",
    retryHistory: Array.isArray(sale.retryHistory) ? [...sale.retryHistory] : [],
    voidedAt: sale.voidedAt || now,
    voidReason: "Restauracion administrativa del estado local terminal perdido por el bug historico de merge; comprobante SRI NO AUTORIZADO codigo 39. No reenviar.",
    sriMessage: sale.sriMessage,
    updatedAt: now
  };
  const audit = {
    id: auditId,
    companyId,
    event: "INVOICE_363_TERMINAL_STATUS_RESTORED",
    entity: "sale",
    entityId: sale.id,
    summary: "Factura 000000363 restaurada a ANULADA por estado local terminal perdido en merge historico; sin envio SRI.",
    createdAt: now,
    metadata: {
      previousStatus: sale.status,
      status: "ANULADA",
      inventoryState: "REVERSED",
      retryHistoryPreserved: true,
      sriOperation: "NONE"
    }
  };
  return { restoredSale, audit };
}

function adminError(code, message) { const error = new Error(message); error.code = code; return error; }

module.exports = { REQUIRED_CONFIRMATION, TARGET_SEQUENCE, prepareInvoice363Restoration };
