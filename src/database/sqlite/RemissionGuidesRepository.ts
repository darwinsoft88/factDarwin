import type { Client, RemissionGuide, Sale } from "../../types";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import {
  canonicalRemissionGuide,
  hashRemissionGuide,
} from "./remissionGuideRecord";
import {
  TenantRepository,
  type TenantRepositoryContext,
} from "./repository";

interface ReceiptInput {
  snapshotGeneration: string;
  sourceHash: string;
  schemaVersion: number;
  confirmCanonical: () => Promise<boolean>;
}

export interface RemissionGuideMetrics {
  guideCount: number;
  lineCount: number;
  quantityMicros: number;
  missingSaleCount: number;
  missingClientCount: number;
  signedXmlCount: number;
  authorizedXmlCount: number;
  byStatus: Record<string, number>;
}

export class RemissionGuidesRepository extends TenantRepository {
  constructor(context: TenantRepositoryContext) {
    super(context);
  }

  async count(): Promise<number> {
    const row = await this.database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM remission_guides WHERE tenant_id = ?",
      this.tenantId,
    );
    return Number(row?.count ?? 0);
  }

  async list(): Promise<RemissionGuide[]> {
    const guides = await this.database.getAllAsync<Record<string, unknown>>(
      `SELECT g.*, x.signed_xml, x.authorized_xml
       FROM remission_guides g
       LEFT JOIN remission_guide_xml_documents x
         ON x.tenant_id = g.tenant_id AND x.guide_id = g.id
       WHERE g.tenant_id = ?
       ORDER BY g.source_index ASC`,
      this.tenantId,
    );
    const items = await this.database.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM remission_guide_items
       WHERE tenant_id = ?
       ORDER BY guide_id ASC, line_index ASC`,
      this.tenantId,
    );
    const itemsByGuide = new Map<string, Record<string, unknown>[]>();
    items.forEach((item) => {
      const guideId = String(item.guide_id);
      const current = itemsByGuide.get(guideId) ?? [];
      current.push(item);
      itemsByGuide.set(guideId, current);
    });
    return guides.map((row) => ({
      ...(JSON.parse(String(row.compatibility_json || "{}")) as
        Record<string, unknown>),
      id: String(row.id),
      ...(row.establishment === null
        ? {} : { establishment: String(row.establishment) }),
      ...(row.emission_point === null
        ? {} : { emissionPoint: String(row.emission_point) }),
      ...(row.establishment_name === null
        ? {} : { establishmentName: String(row.establishment_name) }),
      sourceSaleId: String(row.source_sale_id),
      clientId: String(row.client_id),
      userId: String(row.user_id),
      createdAt: String(row.created_at),
      sequence: String(row.sequence),
      accessKey: String(row.access_key),
      ...(row.authorization_number === null
        ? {} : { authorizationNumber: String(row.authorization_number) }),
      ...(row.authorization_date === null
        ? {} : { authorizationDate: String(row.authorization_date) }),
      ...(row.sri_environment === null
        ? {} : { sriEnvironment: String(row.sri_environment) }),
      ...(row.sri_message === null
        ? {} : { sriMessage: String(row.sri_message) }),
      retryHistory: JSON.parse(String(row.retry_history_json || "[]")),
      ...(row.signed_xml === null
        ? {} : { signedXml: String(row.signed_xml) }),
      ...(row.authorized_xml === null
        ? {} : { authorizedXml: String(row.authorized_xml) }),
      status: String(row.status) as RemissionGuide["status"],
      transporterName: String(row.transporter_name),
      transporterIdentification: String(row.transporter_identification),
      transporterIdentificationType: String(
        row.transporter_identification_type,
      ) as RemissionGuide["transporterIdentificationType"],
      plate: String(row.plate),
      startAddress: String(row.start_address),
      endAddress: String(row.end_address),
      route: String(row.route),
      reason: String(row.reason),
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      items: (itemsByGuide.get(String(row.id)) ?? []).map((item) => ({
        ...(JSON.parse(String(item.compatibility_json || "{}")) as
          Record<string, unknown>),
        productId: String(item.product_id),
        ...(item.item_type === null
          ? {} : { itemType: String(item.item_type) }),
        code: String(item.code),
        name: String(item.name),
        quantity: Number(item.quantity_micros) / 1_000_000,
        unitPrice: Number(item.unit_price_micros) / 1_000_000,
        ...(item.cost_micros === null
          ? {} : { cost: Number(item.cost_micros) / 1_000_000 }),
        discount: Number(item.discount_micros) / 1_000_000,
        ivaRate: Number(item.iva_rate_micros) / 1_000_000,
        ...(item.source_line_key === null
          ? {} : { sourceLineKey: String(item.source_line_key) }),
      })),
    } as RemissionGuide));
  }

  async migrateMirror(
    guides: RemissionGuide[],
    sales: Sale[],
    clients: Client[],
    receipt: ReceiptInput,
  ) {
    const startedAt = Date.now();
    const saleIds = new Set(sales.map(({ id }) => id));
    const clientIds = new Set(clients.map(({ id }) => id));
    const prepared = await Promise.all(guides.map(async (guide, index) => ({
      index,
      value: canonicalRemissionGuide(guide),
      hash: await hashRemissionGuide(guide),
    })));
    const metrics: RemissionGuideMetrics = {
      guideCount: guides.length,
      lineCount: 0,
      quantityMicros: 0,
      missingSaleCount: 0,
      missingClientCount: 0,
      signedXmlCount: 0,
      authorizedXmlCount: 0,
      byStatus: {},
    };
    prepared.forEach(({ value }) => {
      if (!value.id || !value.accessKey || !value.sequence) {
        throw new Error("REMISSION_GUIDE_INVALID_MODELED_DATA");
      }
      metrics.lineCount += value.items.length;
      metrics.quantityMicros += value.items.reduce(
        (sum, item) => sum + (item.quantityMicros ?? 0), 0,
      );
      if (!saleIds.has(value.sourceSaleId)) metrics.missingSaleCount += 1;
      if (!clientIds.has(value.clientId)) metrics.missingClientCount += 1;
      if (value.signedXml) metrics.signedXmlCount += 1;
      if (value.authorizedXml) metrics.authorizedXmlCount += 1;
      metrics.byStatus[value.status] =
        (metrics.byStatus[value.status] ?? 0) + 1;
      value.items.forEach((item) => {
        if (
          item.quantityMicros === null ||
          item.unitPriceMicros === null ||
          item.discountMicros === null ||
          item.ivaRateMicros === null
        ) throw new Error("REMISSION_GUIDE_ITEM_INVALID_MODELED_DATA");
      });
    });
    let comparedHashes = 0;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        "DELETE FROM remission_guides WHERE tenant_id = ?",
        this.tenantId,
      );
      for (const item of prepared) {
        const value = item.value;
        await transaction.runAsync(
          `INSERT INTO remission_guides (
            tenant_id, id, source_index, establishment, emission_point,
            establishment_name, source_sale_id, client_id, user_id, created_at,
            sequence, access_key, authorization_number, authorization_date,
            sri_environment, sri_message, status, transporter_name,
            transporter_identification, transporter_identification_type,
            plate, start_address, end_address, route, reason, start_date,
            end_date, retry_history_json, compatibility_json, record_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          this.tenantId, value.id, item.index, value.establishment,
          value.emissionPoint, value.establishmentName, value.sourceSaleId,
          value.clientId, value.userId, value.createdAt, value.sequence,
          value.accessKey, value.authorizationNumber, value.authorizationDate,
          value.sriEnvironment, value.sriMessage, value.status,
          value.transporterName, value.transporterIdentification,
          value.transporterIdentificationType, value.plate, value.startAddress,
          value.endAddress, value.route, value.reason, value.startDate,
          value.endDate, JSON.stringify(value.retryHistory),
          JSON.stringify(value.compatibility), item.hash,
        );
        await transaction.runAsync(
          `INSERT INTO remission_guide_xml_documents (
            tenant_id, guide_id, signed_xml, authorized_xml
          ) VALUES (?, ?, ?, ?)`,
          this.tenantId, value.id, value.signedXml, value.authorizedXml,
        );
        for (const [lineIndex, line] of value.items.entries()) {
          await transaction.runAsync(
            `INSERT INTO remission_guide_items (
              tenant_id, guide_id, line_index, product_id, item_type, code,
              name, quantity_micros, unit_price_micros, cost_micros,
              discount_micros, iva_rate_micros, source_line_key,
              compatibility_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            this.tenantId, value.id, lineIndex, line.productId, line.itemType,
            line.code, line.name, line.quantityMicros, line.unitPriceMicros,
            line.costMicros, line.discountMicros, line.ivaRateMicros,
            line.sourceLineKey, JSON.stringify(line.compatibility),
          );
        }
      }
      const hashes = await transaction.getAllAsync<{
        id: string; source_index: number; record_hash: string;
      }>(
        `SELECT id, source_index, record_hash FROM remission_guides
         WHERE tenant_id = ? ORDER BY source_index ASC`,
        this.tenantId,
      );
      const aggregate = await transaction.getFirstAsync<{
        guide_count: number; line_count: number; quantity_micros: number;
      }>(
        `SELECT
          (SELECT COUNT(*) FROM remission_guides WHERE tenant_id = ?)
            AS guide_count,
          COUNT(*) AS line_count,
          COALESCE(SUM(quantity_micros), 0) AS quantity_micros
         FROM remission_guide_items WHERE tenant_id = ?`,
        this.tenantId, this.tenantId,
      );
      if (
        hashes.length !== prepared.length ||
        Number(aggregate?.guide_count ?? 0) !== metrics.guideCount ||
        Number(aggregate?.line_count ?? 0) !== metrics.lineCount ||
        Number(aggregate?.quantity_micros ?? 0) !== metrics.quantityMicros
      ) throw new Error("REMISSION_GUIDE_AGGREGATE_MISMATCH");
      prepared.forEach((expected, index) => {
        const actual = hashes[index];
        if (
          !actual || actual.id !== expected.value.id ||
          Number(actual.source_index) !== index ||
          actual.record_hash !== expected.hash
        ) throw new Error(`REMISSION_GUIDE_HASH_OR_ORDER_MISMATCH:${index}`);
        comparedHashes += 1;
      });
      if (!(await receipt.confirmCanonical())) {
        throw new Error("STALE_SNAPSHOT_GENERATION");
      }
      await new CatalogValidationReceiptRepository({
        database: transaction,
        tenantId: this.tenantId,
      }).saveValidatedWithinTransaction(transaction, {
        catalogType: "remission_guides",
        snapshotGeneration: receipt.snapshotGeneration,
        sourceHash: receipt.sourceHash,
        rowCount: guides.length,
        schemaVersion: receipt.schemaVersion,
        validationDetails: { ...metrics },
      });
    });
    return {
      equal: true as const,
      rowCount: guides.length,
      comparedHashes,
      metrics,
      durationMs: Date.now() - startedAt,
    };
  }
}
