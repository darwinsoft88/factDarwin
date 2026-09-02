const crypto = require("node:crypto");
const { normalizePaymentStatus, normalizeSubscriptionPayment } = require("./saas-payment-policy");

function createSubscriptionPaymentsRepository({ pool, ensureSchema, insertAudit }) {
  async function list(companyId, options = {}) {
    await ensureSchema();
    const limit = Math.min(200, Math.max(1, Number(options.limit || 100)));
    const result = await pool.query(
      `SELECT id, company_id AS "companyId", amount::float8 AS amount, currency,
              paid_at::text AS "paidAt", period_start::text AS "periodStart", period_end::text AS "periodEnd",
              payment_method AS "paymentMethod", reference, status, notes,
              created_at AS "createdAt", updated_at AS "updatedAt",
              license_applied_at AS "licenseAppliedAt", license_plan AS "licensePlan",
              license_expires_at::text AS "licenseExpiresAt", license_applied_by AS "licenseAppliedBy",
              license_previous AS "licensePrevious", license_reversed_at AS "licenseReversedAt",
              license_reversed_by AS "licenseReversedBy", license_reversal_reason AS "licenseReversalReason"
         FROM saas_subscription_payments
        WHERE company_id = $1
        ORDER BY paid_at DESC, created_at DESC
        LIMIT $2`,
      [String(companyId || ""), limit]
    );
    return result.rows.map(mapRow);
  }

  async function get(companyId, paymentId) {
    await ensureSchema();
    const result = await pool.query(
      `SELECT id, company_id AS "companyId", amount::float8 AS amount, currency,
              paid_at::text AS "paidAt", period_start::text AS "periodStart", period_end::text AS "periodEnd",
              payment_method AS "paymentMethod", reference, status, notes,
              created_at AS "createdAt", updated_at AS "updatedAt",
              license_applied_at AS "licenseAppliedAt", license_plan AS "licensePlan",
              license_expires_at::text AS "licenseExpiresAt", license_applied_by AS "licenseAppliedBy",
              license_previous AS "licensePrevious", license_reversed_at AS "licenseReversedAt",
              license_reversed_by AS "licenseReversedBy", license_reversal_reason AS "licenseReversalReason"
         FROM saas_subscription_payments WHERE company_id = $1 AND id = $2`,
      [companyId, paymentId]
    );
    if (!result.rows.length) throw httpError(404, "Pago no encontrado.");
    return mapRow(result.rows[0]);
  }

  async function create(companyId, payload) {
    await ensureSchema();
    const payment = normalizeSubscriptionPayment(payload);
    const client = await pool.connect();
    const id = `pay-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    try {
      await client.query("BEGIN");
      const company = await client.query("SELECT id FROM saas_companies WHERE id = $1 FOR UPDATE", [companyId]);
      if (!company.rows.length) throw httpError(404, "Empresa no encontrada.");
      const result = await client.query(
        `INSERT INTO saas_subscription_payments
          (id, company_id, amount, currency, paid_at, period_start, period_end, payment_method, reference, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::date, $8, $9, $10, $11, $12, $12)
         RETURNING id, company_id AS "companyId", amount::float8 AS amount, currency,
                   paid_at::text AS "paidAt", period_start::text AS "periodStart", period_end::text AS "periodEnd",
                   payment_method AS "paymentMethod", reference, status, notes,
                   created_at AS "createdAt", updated_at AS "updatedAt",
                   license_applied_at AS "licenseAppliedAt", license_plan AS "licensePlan",
                   license_expires_at::text AS "licenseExpiresAt", license_applied_by AS "licenseAppliedBy",
                   license_previous AS "licensePrevious", license_reversed_at AS "licenseReversedAt",
                   license_reversed_by AS "licenseReversedBy", license_reversal_reason AS "licenseReversalReason"`,
        [id, companyId, payment.amount, payment.currency, payment.paidAt, payment.periodStart, payment.periodEnd,
          payment.paymentMethod, payment.reference || null, payment.status, payment.notes || null, now]
      );
      await insertAudit(client, "TENANT_SUBSCRIPTION_PAYMENT_CREATED", {
        companyId, paymentId: id, amount: payment.amount, currency: payment.currency, status: payment.status, paidAt: payment.paidAt
      });
      await client.query("COMMIT");
      return mapRow(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function updateStatus(companyId, paymentId, payload) {
    await ensureSchema();
    const update = normalizePaymentStatus(payload);
    const client = await pool.connect();
    const now = new Date().toISOString();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT status, license_applied_at AS \"licenseAppliedAt\", license_reversed_at AS \"licenseReversedAt\" FROM saas_subscription_payments WHERE company_id = $1 AND id = $2 FOR UPDATE",
        [companyId, paymentId]
      );
      if (!current.rows.length) throw httpError(404, "Pago no encontrado.");
      if (current.rows[0].licenseAppliedAt && !current.rows[0].licenseReversedAt && update.status !== "confirmed") {
        throw httpError(409, "No se puede anular o reembolsar un pago que ya renovo una licencia. Primero debe gestionarse la reversion de la licencia.");
      }
      const result = await client.query(
        `UPDATE saas_subscription_payments
            SET status = $1, notes = CASE WHEN $2 = '' THEN notes ELSE $2 END, updated_at = $3
          WHERE company_id = $4 AND id = $5
          RETURNING id, company_id AS "companyId", amount::float8 AS amount, currency,
                    paid_at::text AS "paidAt", period_start::text AS "periodStart", period_end::text AS "periodEnd",
                    payment_method AS "paymentMethod", reference, status, notes,
                    created_at AS "createdAt", updated_at AS "updatedAt",
                    license_applied_at AS "licenseAppliedAt", license_plan AS "licensePlan",
                    license_expires_at::text AS "licenseExpiresAt", license_applied_by AS "licenseAppliedBy",
                    license_previous AS "licensePrevious", license_reversed_at AS "licenseReversedAt",
                    license_reversed_by AS "licenseReversedBy", license_reversal_reason AS "licenseReversalReason"`,
        [update.status, update.notes, now, companyId, paymentId]
      );
      if (!result.rows.length) throw httpError(404, "Pago no encontrado.");
      await insertAudit(client, "TENANT_SUBSCRIPTION_PAYMENT_STATUS_CHANGED", {
        companyId, paymentId, status: update.status, notes: update.notes
      });
      await client.query("COMMIT");
      return mapRow(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }


  async function markLicenseApplied(companyId, paymentId, application) {
    await ensureSchema();
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE saas_subscription_payments
          SET license_applied_at = $1, license_plan = $2, license_expires_at = $3::date,
              license_applied_by = $4, license_previous = $5::jsonb, updated_at = $1
        WHERE company_id = $6 AND id = $7 AND license_applied_at IS NULL
        RETURNING id, company_id AS "companyId", amount::float8 AS amount, currency,
                  paid_at::text AS "paidAt", period_start::text AS "periodStart", period_end::text AS "periodEnd",
                  payment_method AS "paymentMethod", reference, status, notes,
                  created_at AS "createdAt", updated_at AS "updatedAt",
                  license_applied_at AS "licenseAppliedAt", license_plan AS "licensePlan",
                  license_expires_at::text AS "licenseExpiresAt", license_applied_by AS "licenseAppliedBy",
                  license_previous AS "licensePrevious", license_reversed_at AS "licenseReversedAt",
                  license_reversed_by AS "licenseReversedBy", license_reversal_reason AS "licenseReversalReason"`,
      [now, application.plan, application.expiresAt, application.userId || null, JSON.stringify(application.previousLicense), companyId, paymentId]
    );
    if (!result.rows.length) throw httpError(409, "Este pago ya fue aplicado a una licencia.");
    await insertAudit(pool, "TENANT_SUBSCRIPTION_PAYMENT_LICENSE_APPLIED", {
      companyId, paymentId, plan: application.plan, expiresAt: application.expiresAt, userId: application.userId || null
    });
    return mapRow(result.rows[0]);
  }


  async function markLicenseReversed(companyId, paymentId, reversal) {
    await ensureSchema();
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE saas_subscription_payments
          SET license_reversed_at = $1, license_reversed_by = $2,
              license_reversal_reason = $3, updated_at = $1
        WHERE company_id = $4 AND id = $5
          AND license_applied_at IS NOT NULL AND license_reversed_at IS NULL
        RETURNING id, company_id AS "companyId", amount::float8 AS amount, currency,
                  paid_at::text AS "paidAt", period_start::text AS "periodStart", period_end::text AS "periodEnd",
                  payment_method AS "paymentMethod", reference, status, notes,
                  created_at AS "createdAt", updated_at AS "updatedAt",
                  license_applied_at AS "licenseAppliedAt", license_plan AS "licensePlan",
                  license_expires_at::text AS "licenseExpiresAt", license_applied_by AS "licenseAppliedBy",
                  license_previous AS "licensePrevious", license_reversed_at AS "licenseReversedAt",
                  license_reversed_by AS "licenseReversedBy", license_reversal_reason AS "licenseReversalReason"`,
      [now, reversal.userId || null, reversal.reason, companyId, paymentId]
    );
    if (!result.rows.length) throw httpError(409, "La renovacion no existe o ya fue revertida.");
    await insertAudit(pool, "TENANT_SUBSCRIPTION_PAYMENT_LICENSE_REVERSED", {
      companyId, paymentId, reason: reversal.reason, userId: reversal.userId || null
    });
    return mapRow(result.rows[0]);
  }

  return { create, get, list, markLicenseApplied, markLicenseReversed, updateStatus };
}

function mapRow(row) {
  return {
    ...row,
    amount: Number(row.amount || 0),
    periodStart: row.periodStart || "",
    periodEnd: row.periodEnd || "",
    reference: row.reference || "",
    notes: row.notes || "",
    licenseAppliedAt: row.licenseAppliedAt ? new Date(row.licenseAppliedAt).toISOString() : "",
    licensePlan: row.licensePlan || "",
    licenseExpiresAt: row.licenseExpiresAt || "",
    licenseAppliedBy: row.licenseAppliedBy || "",
    licensePrevious: row.licensePrevious && typeof row.licensePrevious === "object" ? row.licensePrevious : null,
    licenseReversedAt: row.licenseReversedAt ? new Date(row.licenseReversedAt).toISOString() : "",
    licenseReversedBy: row.licenseReversedBy || "",
    licenseReversalReason: row.licenseReversalReason || "",
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : ""
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { createSubscriptionPaymentsRepository };
