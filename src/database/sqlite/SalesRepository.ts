import type { Sale } from "../../types";
import {
  CatalogValidationReceiptRepository,
} from "./CatalogValidationReceiptRepository";
import {
  canonicalSaleRecord,
  hashSaleRecord,
  saleFromCanonicalRecord,
  saleFinancialMetrics,
  type CanonicalAdditionalInfo,
  type CanonicalEmailHistory,
  type CanonicalSaleItem,
  type CanonicalSalePayment,
  type CanonicalSaleRecord,
  type SalesFinancialMetrics,
} from "./saleRecord";
import {
  TenantRepository,
  type TenantRepositoryContext,
} from "./repository";
import type { CatalogMirrorReceiptInput } from "./ClientsRepository";
import type { SQLiteConnection } from "./types";

type DatabaseRow = Record<string, string | number | null>;

export interface SalesParityResult {
  equal: boolean;
  jsonCount: number;
  sqliteCount: number;
  comparedHashes: number;
  metrics: SalesFinancialMetrics;
  differences: string[];
}

export interface SalesMigrationResult extends SalesParityResult {
  durationMs: number;
  snapshotHash: string;
}

export interface SalesLightweightIntegrityResult {
  valid: boolean;
  rowCount: number;
  metrics: SalesFinancialMetrics;
  differences: string[];
}

interface PreparedSale {
  record: CanonicalSaleRecord;
  hash: string;
  sourceIndex: number;
}

function parseCompatibility(
  value: string | number | null | undefined,
): Record<string, unknown> {
  return typeof value === "string" && value
    ? JSON.parse(value) as Record<string, unknown>
    : {};
}

function nullableString(
  value: string | number | null | undefined,
): string | null {
  return value === null || value === undefined ? null : String(value);
}

function sumMetrics(records: CanonicalSaleRecord[]): SalesFinancialMetrics {
  return records.reduce<SalesFinancialMetrics>((total, record) => {
    const metrics = saleFinancialMetrics(record);
    return {
      subtotalMicros: total.subtotalMicros + metrics.subtotalMicros,
      taxMicros: total.taxMicros + metrics.taxMicros,
      discountMicros: total.discountMicros + metrics.discountMicros,
      totalMicros: total.totalMicros + metrics.totalMicros,
      creditBalanceMicros:
        total.creditBalanceMicros + metrics.creditBalanceMicros,
      lineCount: total.lineCount + metrics.lineCount,
      paymentCount: total.paymentCount + metrics.paymentCount,
      signedXmlCount: total.signedXmlCount + metrics.signedXmlCount,
      authorizedXmlCount:
        total.authorizedXmlCount + metrics.authorizedXmlCount,
    };
  }, {
    subtotalMicros: 0,
    taxMicros: 0,
    discountMicros: 0,
    totalMicros: 0,
    creditBalanceMicros: 0,
    lineCount: 0,
    paymentCount: 0,
    signedXmlCount: 0,
    authorizedXmlCount: 0,
  });
}

function metricsEqual(
  expected: SalesFinancialMetrics,
  actual: SalesFinancialMetrics,
): string[] {
  return (Object.keys(expected) as Array<keyof SalesFinancialMetrics>)
    .filter((key) => expected[key] !== actual[key])
    .map((key) => `FINANCIAL_MISMATCH:${key}`);
}

export class SalesRepository extends TenantRepository {
  constructor(context: TenantRepositoryContext) {
    super(context);
  }

  private async prepare(sales: Sale[]): Promise<PreparedSale[]> {
    return Promise.all(sales.map(async (sale, sourceIndex) => ({
      record: canonicalSaleRecord(sale),
      hash: await hashSaleRecord(sale),
      sourceIndex,
    })));
  }

  private async canonicalRows(
    database: SQLiteConnection = this.database,
    options: {
      saleId?: string;
      includeCollections?: boolean;
      includeXml?: boolean;
    } = {},
  ): Promise<Array<{ record: CanonicalSaleRecord; hash: string }>> {
    const saleFilter = options.saleId ? " AND id = ?" : "";
    const childFilter = options.saleId ? " AND sale_id = ?" : "";
    const params = options.saleId
      ? [this.tenantId, options.saleId]
      : [this.tenantId];
    const includeCollections = options.includeCollections !== false;
    const includeXml = options.includeXml !== false;
    const [sales, xml, items, payments, additional, retries, emails] =
      await Promise.all([
        database.getAllAsync<DatabaseRow>(
          `SELECT * FROM sales WHERE tenant_id = ?${saleFilter}
           ORDER BY source_index ASC, id ASC`,
          ...params,
        ),
        includeXml
          ? database.getAllAsync<DatabaseRow>(
            `SELECT * FROM sale_xml_documents
             WHERE tenant_id = ?${childFilter}`,
            ...params,
          )
          : Promise.resolve([]),
        includeCollections
          ? database.getAllAsync<DatabaseRow>(
            `SELECT * FROM sale_items WHERE tenant_id = ?${childFilter}
           ORDER BY sale_id ASC, line_index ASC`,
            ...params,
          )
          : Promise.resolve([]),
        includeCollections
          ? database.getAllAsync<DatabaseRow>(
            `SELECT * FROM sale_payment_splits
             WHERE tenant_id = ?${childFilter}
           ORDER BY sale_id ASC, payment_index ASC`,
            ...params,
          )
          : Promise.resolve([]),
        includeCollections
          ? database.getAllAsync<DatabaseRow>(
            `SELECT * FROM sale_additional_info
             WHERE tenant_id = ?${childFilter}
           ORDER BY sale_id ASC, field_index ASC`,
            ...params,
          )
          : Promise.resolve([]),
        includeCollections
          ? database.getAllAsync<DatabaseRow>(
            `SELECT * FROM sale_retry_history
             WHERE tenant_id = ?${childFilter}
           ORDER BY sale_id ASC, retry_index ASC`,
            ...params,
          )
          : Promise.resolve([]),
        includeCollections
          ? database.getAllAsync<DatabaseRow>(
            `SELECT * FROM sale_email_history
             WHERE tenant_id = ?${childFilter}
           ORDER BY sale_id ASC, history_index ASC`,
            ...params,
          )
          : Promise.resolve([]),
      ]);
    const group = (rows: DatabaseRow[]) => {
      const result = new Map<string, DatabaseRow[]>();
      for (const row of rows) {
        const saleId = String(row.sale_id);
        result.set(saleId, [...(result.get(saleId) ?? []), row]);
      }
      return result;
    };
    const xmlBySale = new Map(xml.map((row) => [String(row.sale_id), row]));
    const itemGroups = group(items);
    const paymentGroups = group(payments);
    const additionalGroups = group(additional);
    const retryGroups = group(retries);
    const emailGroups = group(emails);

    return sales.map((row) => {
      const id = String(row.id);
      const xmlRow = xmlBySale.get(id);
      const canonicalItems: CanonicalSaleItem[] =
        (itemGroups.get(id) ?? []).map((item) => ({
          productId: String(item.product_id),
          itemType: nullableString(item.item_type),
          code: String(item.code),
          name: String(item.name),
          quantityMicros: Number(item.quantity_micros),
          unitPriceMicros: Number(item.unit_price_micros),
          costMicros: item.cost_micros === null
            ? null
            : Number(item.cost_micros),
          discountMicros: Number(item.discount_micros),
          ivaRateMicros: Number(item.iva_rate_micros),
          sourceLineKey: nullableString(item.source_line_key),
          compatibility: parseCompatibility(item.compatibility_json),
        }));
      const canonicalPayments: CanonicalSalePayment[] =
        (paymentGroups.get(id) ?? []).map((payment) => ({
          id: nullableString(payment.payment_id),
          paymentMethod: String(payment.payment_method),
          amountMicros: Number(payment.amount_micros),
          bank: nullableString(payment.bank),
          reference: nullableString(payment.reference),
          compatibility: parseCompatibility(payment.compatibility_json),
        }));
      const canonicalAdditional: CanonicalAdditionalInfo[] =
        (additionalGroups.get(id) ?? []).map((field) => ({
          id: nullableString(field.field_id),
          name: String(field.name),
          value: String(field.value),
          compatibility: parseCompatibility(field.compatibility_json),
        }));
      const canonicalEmails: CanonicalEmailHistory[] =
        (emailGroups.get(id) ?? []).map((email) => ({
          to: String(email.recipient),
          sentAt: String(email.sent_at),
          status: String(email.status),
          error: nullableString(email.error),
          compatibility: parseCompatibility(email.compatibility_json),
        }));
      return {
        hash: String(row.record_hash),
        record: {
          id,
          documentType: nullableString(row.document_type),
          establishment: nullableString(row.establishment),
          emissionPoint: nullableString(row.emission_point),
          establishmentName: nullableString(row.establishment_name),
          clientId: String(row.client_id),
          userId: String(row.user_id),
          createdAt: String(row.created_at),
          sequence: String(row.sequence),
          accessKey: String(row.access_key),
          authorizationNumber: nullableString(row.authorization_number),
          authorizationDate: nullableString(row.authorization_date),
          sriEnvironment: nullableString(row.sri_environment),
          sriMessage: nullableString(row.sri_message),
          sourceSaleId: nullableString(row.source_sale_id),
          inventoryState: nullableString(row.inventory_state),
          inventoryOperationId: nullableString(row.inventory_operation_id),
          creditNoteInventoryState:
            nullableString(row.credit_note_inventory_state),
          creditNoteInventoryOperationId:
            nullableString(row.credit_note_inventory_operation_id),
          autoInvoiceOnSync: row.auto_invoice_on_sync === null
            ? null
            : Number(row.auto_invoice_on_sync) === 1,
          autoInvoiceAttemptedAt:
            nullableString(row.auto_invoice_attempted_at),
          autoInvoiceLastError: nullableString(row.auto_invoice_last_error),
          convertedAt: nullableString(row.converted_at),
          convertedToSaleId: nullableString(row.converted_to_sale_id),
          convertedToSequence: nullableString(row.converted_to_sequence),
          supportDocumentType: nullableString(row.support_document_type),
          supportDocumentNumber: nullableString(row.support_document_number),
          supportAuthorizationNumber:
            nullableString(row.support_authorization_number),
          supportIssueDate: nullableString(row.support_issue_date),
          creditReason: nullableString(row.credit_reason),
          voidReason: nullableString(row.void_reason),
          voidedAt: nullableString(row.voided_at),
          subtotalMicros: Number(row.subtotal_micros),
          taxMicros: Number(row.tax_micros),
          totalMicros: Number(row.total_micros),
          paymentMethod: String(row.payment_method),
          paymentCondition: nullableString(row.payment_condition),
          creditDueDate: nullableString(row.credit_due_date),
          creditBalanceMicros: row.credit_balance_micros === null
            ? null
            : Number(row.credit_balance_micros),
          creditStatus: nullableString(row.credit_status),
          status: String(row.status),
          paymentsPresent: Number(row.payments_present) === 1,
          additionalInfoPresent:
            Number(row.additional_info_present) === 1,
          retryHistoryPresent: Number(row.retry_history_present) === 1,
          emailHistoryPresent: Number(row.email_history_present) === 1,
          signedXml: nullableString(xmlRow?.signed_xml ?? null),
          authorizedXml: nullableString(xmlRow?.authorized_xml ?? null),
          retryHistory: (retryGroups.get(id) ?? [])
            .map((retry) => String(retry.attempted_at)),
          emailHistory: canonicalEmails,
          items: canonicalItems,
          payments: canonicalPayments,
          additionalInfo: canonicalAdditional,
          compatibility: parseCompatibility(row.compatibility_json),
        },
      };
    });
  }

  private comparePrepared(
    prepared: PreparedSale[],
    actualRows: Array<{ record: CanonicalSaleRecord; hash: string }>,
  ): SalesParityResult {
    const expected = new Map(
      prepared.map(({ record, hash }) => [record.id, { record, hash }]),
    );
    const differences: string[] = [];
    if (expected.size !== prepared.length) differences.push("DUPLICATE_JSON_IDS");
    if (actualRows.length !== prepared.length) differences.push("COUNT_MISMATCH");
    let comparedHashes = 0;
    for (const actual of actualRows) {
      const source = expected.get(actual.record.id);
      if (!source) {
        differences.push(`UNEXPECTED_ID:${actual.record.id}`);
        continue;
      }
      if (actual.hash !== source.hash) {
        differences.push(`HASH_MISMATCH:${actual.record.id}`);
      }
      if (JSON.stringify(actual.record) !== JSON.stringify(source.record)) {
        differences.push(`RECORD_MISMATCH:${actual.record.id}`);
      }
      for (const financialDifference of metricsEqual(
        saleFinancialMetrics(source.record),
        saleFinancialMetrics(actual.record),
      )) {
        differences.push(`${financialDifference}:${actual.record.id}`);
      }
      comparedHashes += 1;
      expected.delete(actual.record.id);
    }
    for (const missingId of expected.keys()) {
      differences.push(`MISSING_ID:${missingId}`);
    }
    const expectedMetrics = sumMetrics(prepared.map(({ record }) => record));
    const actualMetrics = sumMetrics(actualRows.map(({ record }) => record));
    differences.push(...metricsEqual(expectedMetrics, actualMetrics));
    return {
      equal: differences.length === 0,
      jsonCount: prepared.length,
      sqliteCount: actualRows.length,
      comparedHashes,
      metrics: actualMetrics,
      differences,
    };
  }

  async compareWithFileSales(sales: Sale[]): Promise<SalesParityResult> {
    return this.comparePrepared(
      await this.prepare(sales),
      await this.canonicalRows(),
    );
  }

  async listAll(): Promise<Sale[]> {
    return (await this.canonicalRows()).map(({ record }) =>
      saleFromCanonicalRecord(record)
    );
  }

  async listSummaries(): Promise<Sale[]> {
    return (await this.canonicalRows(this.database, {
      includeCollections: false,
      includeXml: false,
    })).map(({ record }) => saleFromCanonicalRecord(record));
  }

  async loadDetailById(saleId: string): Promise<Sale | null> {
    const row = (await this.canonicalRows(this.database, {
      saleId,
      includeCollections: true,
      includeXml: false,
    }))[0];
    return row ? saleFromCanonicalRecord(row.record) : null;
  }

  async loadXmlById(saleId: string): Promise<{
    signedXml?: string;
    authorizedXml?: string;
  } | null> {
    const row = await this.database.getFirstAsync<{
      signed_xml: string | null;
      authorized_xml: string | null;
    }>(
      `SELECT signed_xml, authorized_xml
       FROM sale_xml_documents
       WHERE tenant_id = ? AND sale_id = ?`,
      this.tenantId,
      saleId,
    );
    if (!row) return null;
    return {
      ...(row.signed_xml === null ? {} : { signedXml: row.signed_xml }),
      ...(row.authorized_xml === null
        ? {}
        : { authorizedXml: row.authorized_xml }),
    };
  }

  async checkLightweightIntegrity(
    expectedRowCount: number,
    expectedMetrics: SalesFinancialMetrics,
  ): Promise<SalesLightweightIntegrityResult> {
    const [header, item, payment, xml] = await Promise.all([
      this.database.getFirstAsync<{
        row_count: number;
        distinct_source_count: number;
        missing_hash_count: number;
        subtotal_micros: number;
        tax_micros: number;
        total_micros: number;
        credit_balance_micros: number;
      }>(
        `SELECT
          COUNT(*) AS row_count,
          COUNT(DISTINCT source_index) AS distinct_source_count,
          COALESCE(SUM(CASE WHEN record_hash = '' THEN 1 ELSE 0 END), 0)
            AS missing_hash_count,
          COALESCE(SUM(subtotal_micros), 0) AS subtotal_micros,
          COALESCE(SUM(tax_micros), 0) AS tax_micros,
          COALESCE(SUM(total_micros), 0) AS total_micros,
          COALESCE(SUM(COALESCE(credit_balance_micros, 0)), 0)
            AS credit_balance_micros
        FROM sales WHERE tenant_id = ?`,
        this.tenantId,
      ),
      this.database.getFirstAsync<{
        line_count: number;
        discount_micros: number;
      }>(
        `SELECT COUNT(*) AS line_count,
          COALESCE(SUM(discount_micros), 0) AS discount_micros
         FROM sale_items WHERE tenant_id = ?`,
        this.tenantId,
      ),
      this.database.getFirstAsync<{ payment_count: number }>(
        `SELECT COUNT(*) AS payment_count
         FROM sale_payment_splits WHERE tenant_id = ?`,
        this.tenantId,
      ),
      this.database.getFirstAsync<{
        signed_xml_count: number;
        authorized_xml_count: number;
      }>(
        `SELECT
          COALESCE(SUM(CASE WHEN signed_xml IS NOT NULL THEN 1 ELSE 0 END), 0)
            AS signed_xml_count,
          COALESCE(SUM(CASE WHEN authorized_xml IS NOT NULL THEN 1 ELSE 0 END), 0)
            AS authorized_xml_count
         FROM sale_xml_documents WHERE tenant_id = ?`,
        this.tenantId,
      ),
    ]);
    const rowCount = Number(header?.row_count ?? 0);
    const metrics: SalesFinancialMetrics = {
      subtotalMicros: Number(header?.subtotal_micros ?? 0),
      taxMicros: Number(header?.tax_micros ?? 0),
      discountMicros: Number(item?.discount_micros ?? 0),
      totalMicros: Number(header?.total_micros ?? 0),
      creditBalanceMicros: Number(header?.credit_balance_micros ?? 0),
      lineCount: Number(item?.line_count ?? 0),
      paymentCount: Number(payment?.payment_count ?? 0),
      signedXmlCount: Number(xml?.signed_xml_count ?? 0),
      authorizedXmlCount: Number(xml?.authorized_xml_count ?? 0),
    };
    const differences = metricsEqual(expectedMetrics, metrics);
    if (rowCount !== expectedRowCount) differences.push("COUNT_MISMATCH");
    if (Number(header?.distinct_source_count ?? 0) !== rowCount) {
      differences.push("SOURCE_ORDER_INTEGRITY_FAILED");
    }
    if (Number(header?.missing_hash_count ?? 0) > 0) {
      differences.push("MISSING_RECORD_HASH");
    }
    return {
      valid: differences.length === 0,
      rowCount,
      metrics,
      differences,
    };
  }

  private async insertSale(
    transaction: SQLiteConnection,
    prepared: PreparedSale,
  ): Promise<void> {
    const { record, hash } = prepared;
    await transaction.runAsync(
      `INSERT INTO sales (
        tenant_id, id, source_index, document_type, establishment, emission_point,
        establishment_name, client_id, user_id, created_at, sequence,
        access_key, authorization_number, authorization_date,
        sri_environment, sri_message, source_sale_id, inventory_state,
        inventory_operation_id, credit_note_inventory_state,
        credit_note_inventory_operation_id, auto_invoice_on_sync,
        auto_invoice_attempted_at, auto_invoice_last_error, converted_at,
        converted_to_sale_id, converted_to_sequence, support_document_type,
        support_document_number, support_authorization_number,
        support_issue_date, credit_reason, void_reason, voided_at,
        subtotal_micros, tax_micros, total_micros, payment_method,
        payment_condition, credit_due_date, credit_balance_micros,
        credit_status, status, payments_present, additional_info_present,
        retry_history_present, email_history_present, compatibility_json,
        record_hash
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )`,
      this.tenantId, record.id, prepared.sourceIndex, record.documentType, record.establishment,
      record.emissionPoint, record.establishmentName, record.clientId,
      record.userId, record.createdAt, record.sequence, record.accessKey,
      record.authorizationNumber, record.authorizationDate,
      record.sriEnvironment, record.sriMessage, record.sourceSaleId,
      record.inventoryState, record.inventoryOperationId,
      record.creditNoteInventoryState,
      record.creditNoteInventoryOperationId,
      record.autoInvoiceOnSync === null
        ? null
        : record.autoInvoiceOnSync ? 1 : 0,
      record.autoInvoiceAttemptedAt, record.autoInvoiceLastError,
      record.convertedAt, record.convertedToSaleId,
      record.convertedToSequence, record.supportDocumentType,
      record.supportDocumentNumber, record.supportAuthorizationNumber,
      record.supportIssueDate, record.creditReason, record.voidReason,
      record.voidedAt, record.subtotalMicros, record.taxMicros,
      record.totalMicros, record.paymentMethod, record.paymentCondition,
      record.creditDueDate, record.creditBalanceMicros, record.creditStatus,
      record.status, record.paymentsPresent ? 1 : 0,
      record.additionalInfoPresent ? 1 : 0,
      record.retryHistoryPresent ? 1 : 0,
      record.emailHistoryPresent ? 1 : 0,
      JSON.stringify(record.compatibility), hash,
    );
    if (record.signedXml !== null || record.authorizedXml !== null) {
      await transaction.runAsync(
        `INSERT INTO sale_xml_documents (
          tenant_id, sale_id, signed_xml, authorized_xml
        ) VALUES (?, ?, ?, ?)`,
        this.tenantId,
        record.id,
        record.signedXml,
        record.authorizedXml,
      );
    }
    for (const [index, item] of record.items.entries()) {
      await transaction.runAsync(
        `INSERT INTO sale_items (
          tenant_id, sale_id, line_index, product_id, item_type, code, name,
          quantity_micros, unit_price_micros, cost_micros, discount_micros,
          iva_rate_micros, source_line_key, compatibility_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        this.tenantId, record.id, index, item.productId, item.itemType,
        item.code, item.name, item.quantityMicros, item.unitPriceMicros,
        item.costMicros, item.discountMicros, item.ivaRateMicros,
        item.sourceLineKey, JSON.stringify(item.compatibility),
      );
    }
    for (const [index, payment] of record.payments.entries()) {
      await transaction.runAsync(
        `INSERT INTO sale_payment_splits (
          tenant_id, sale_id, payment_index, payment_id, payment_method,
          amount_micros, bank, reference, compatibility_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        this.tenantId, record.id, index, payment.id, payment.paymentMethod,
        payment.amountMicros, payment.bank, payment.reference,
        JSON.stringify(payment.compatibility),
      );
    }
    for (const [index, field] of record.additionalInfo.entries()) {
      await transaction.runAsync(
        `INSERT INTO sale_additional_info (
          tenant_id, sale_id, field_index, field_id, name, value,
          compatibility_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        this.tenantId, record.id, index, field.id, field.name, field.value,
        JSON.stringify(field.compatibility),
      );
    }
    for (const [index, attemptedAt] of record.retryHistory.entries()) {
      await transaction.runAsync(
        `INSERT INTO sale_retry_history (
          tenant_id, sale_id, retry_index, attempted_at
        ) VALUES (?, ?, ?, ?)`,
        this.tenantId, record.id, index, attemptedAt,
      );
    }
    for (const [index, email] of record.emailHistory.entries()) {
      await transaction.runAsync(
        `INSERT INTO sale_email_history (
          tenant_id, sale_id, history_index, recipient, sent_at, status,
          error, compatibility_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        this.tenantId, record.id, index, email.to, email.sentAt,
        email.status, email.error, JSON.stringify(email.compatibility),
      );
    }
  }

  async migrateMirror(
    sales: Sale[],
    receipt: CatalogMirrorReceiptInput,
  ): Promise<SalesMigrationResult> {
    const startedAt = Date.now();
    const prepared = await this.prepare(sales);
    let parity: SalesParityResult | null = null;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        "DELETE FROM sales WHERE tenant_id = ?",
        this.tenantId,
      );
      for (const sale of prepared) {
        await this.insertSale(transaction, sale);
      }
      parity = this.comparePrepared(
        prepared,
        await this.canonicalRows(transaction),
      );
      if (!parity.equal) {
        throw new Error(
          `La migración de ventas no alcanzó paridad: ${
            parity.differences.join(", ")
          }`,
        );
      }
      if (!(await receipt.confirmCanonical())) {
        throw new Error("STALE_SNAPSHOT_GENERATION");
      }
      await new CatalogValidationReceiptRepository({
        database: transaction,
        tenantId: this.tenantId,
      }).saveValidatedWithinTransaction(transaction, {
        catalogType: "sales",
        snapshotGeneration: receipt.snapshotGeneration,
        sourceHash: receipt.sourceHash,
        rowCount: sales.length,
        schemaVersion: receipt.schemaVersion,
        validationDetails: { ...parity.metrics },
      });
    });
    const result = parity as SalesParityResult | null;
    if (!result) throw new Error("No se validó el espejo de ventas.");
    return {
      ...result,
      durationMs: Date.now() - startedAt,
      snapshotHash: receipt.sourceHash,
    };
  }
}
