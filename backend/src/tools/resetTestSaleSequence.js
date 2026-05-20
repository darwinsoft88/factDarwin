const { Pool } = require("pg");
const config = require("../config");

const args = parseArgs(process.argv.slice(2));
const companyId = requiredArg("companyId");
const target = {
  documentType: args.documentType || "factura",
  environment: args.environment || "1",
  establishment: normalizeThreeDigits(requiredArg("establishment")),
  emissionPoint: normalizeThreeDigits(requiredArg("emissionPoint")),
  sequence: normalizeSequence(requiredArg("sequence"))
};
const nextSequential = Number(args.nextSequential || 1);
const apply = Boolean(args.apply);
const removeInventory = Boolean(args.removeInventory);
const allowedStatuses = String(args.allowStatus || "RECHAZADA,ANULADA")
  .split(",")
  .map((status) => status.trim().toUpperCase())
  .filter(Boolean);

if (!config.databaseUrl) {
  fail("Esta herramienta requiere DATABASE_URL/Postgres.");
}
if (!Number.isInteger(nextSequential) || nextSequential <= 0) {
  fail("--next-sequential debe ser un entero mayor a cero.");
}
if (!["factura", "nota_credito"].includes(target.documentType)) {
  fail("--document-type debe ser factura o nota_credito.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
  });
  const client = await pool.connect();
  const now = new Date().toISOString();

  try {
    await client.query("BEGIN");

    const snapshotResult = await client.query(
      "SELECT data FROM saas_snapshots WHERE company_id = $1 FOR UPDATE",
      [companyId]
    );
    if (!snapshotResult.rows[0]?.data) {
      throw new Error("No existe snapshot para la empresa indicada.");
    }

    const data = typeof snapshotResult.rows[0].data === "string"
      ? JSON.parse(snapshotResult.rows[0].data)
      : snapshotResult.rows[0].data;

    const dbSalesResult = await client.query(
      `SELECT id, status
       FROM sales
       WHERE company_id = $1
         AND document_type = $2
         AND environment = $3
         AND establishment = $4
         AND emission_point = $5
         AND sequence = $6`,
      [companyId, target.documentType, target.environment, target.establishment, target.emissionPoint, target.sequence]
    );

    const snapshotSales = Array.isArray(data.sales) ? data.sales.filter(saleMatches) : [];
    const saleIds = Array.from(new Set([
      ...dbSalesResult.rows.map((row) => row.id),
      ...snapshotSales.map((sale) => sale.id)
    ].filter(Boolean)));

    if (!saleIds.length) {
      throw new Error("No se encontro la venta objetivo en tablas ni snapshot.");
    }

    const statuses = Array.from(new Set([
      ...dbSalesResult.rows.map((row) => String(row.status || "").toUpperCase()),
      ...snapshotSales.map((sale) => String(sale.status || "").toUpperCase())
    ].filter(Boolean)));
    const forbiddenStatuses = statuses.filter((status) => !allowedStatuses.includes(status));
    if (forbiddenStatuses.length) {
      throw new Error(`Estado no permitido para reset: ${forbiddenStatuses.join(", ")}. Permitidos: ${allowedStatuses.join(", ")}.`);
    }

    const inventoryMatches = (data.inventoryMovements || []).filter((movement) =>
      saleIds.includes(movement.saleId)
      || saleIds.includes(movement.entityId)
      || String(movement.reference || "") === target.sequence
    );
    if (inventoryMatches.length && !removeInventory) {
      throw new Error(`Hay ${inventoryMatches.length} movimiento(s) de inventario relacionados. Revisa primero o usa --remove-inventory si es una prueba.`);
    }

    const beforeSales = Array.isArray(data.sales) ? data.sales.length : 0;
    const beforeInventory = Array.isArray(data.inventoryMovements) ? data.inventoryMovements.length : 0;
    const sequenceId = `${companyId}:${target.documentType}:${target.environment}:${target.establishment}:${target.emissionPoint}`;

    data.sales = (data.sales || []).filter((sale) => !saleIds.includes(sale.id) && !saleMatches(sale));
    if (removeInventory) {
      data.inventoryMovements = (data.inventoryMovements || []).filter((movement) =>
        !saleIds.includes(movement.saleId)
        && !saleIds.includes(movement.entityId)
        && String(movement.reference || "") !== target.sequence
      );
    }
    resetIssuerSequential(data.issuer, nextSequential);

    const summary = {
      mode: apply ? "apply" : "dry-run",
      companyId,
      target,
      saleIds,
      statuses,
      removedSales: beforeSales - data.sales.length,
      removedInventoryMovements: beforeInventory - (data.inventoryMovements || []).length,
      deletedSequenceId: sequenceId,
      nextSequential
    };

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ ok: true, ...summary, note: "No se aplicaron cambios. Agrega --apply para ejecutar." }, null, 2));
      return;
    }

    await client.query(
      "INSERT INTO saas_snapshot_history (company_id, data, created_at) VALUES ($1, $2::jsonb, $3)",
      [companyId, JSON.stringify(snapshotResult.rows[0].data), now]
    );
    await client.query("DELETE FROM sale_items WHERE sale_id = ANY($1::text[])", [saleIds]);
    await client.query("DELETE FROM sales WHERE id = ANY($1::text[]) AND company_id = $2", [saleIds, companyId]);
    await client.query("DELETE FROM document_sequences WHERE id = $1", [sequenceId]);
    await client.query(
      "UPDATE saas_snapshots SET data = $2::jsonb, updated_at = $3 WHERE company_id = $1",
      [companyId, JSON.stringify(data), now]
    );
    await client.query(
      "INSERT INTO audit_log (event, payload, created_at) VALUES ($1, $2::jsonb, $3)",
      ["TENANT_TEST_SALE_SEQUENCE_RESET", JSON.stringify(summary), now]
    );

    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function saleMatches(sale) {
  return String(sale?.documentType || "factura") === target.documentType
    && String(sale?.environment || target.environment) === target.environment
    && normalizeThreeDigits(sale?.establishment) === target.establishment
    && normalizeThreeDigits(sale?.emissionPoint) === target.emissionPoint
    && String(sale?.sequence || "") === target.sequence;
}

function resetIssuerSequential(issuer = {}, value) {
  issuer.establishments = (issuer.establishments || []).map((establishment) => {
    if (normalizeThreeDigits(establishment.establishment) === target.establishment
      && normalizeThreeDigits(establishment.emissionPoint) === target.emissionPoint) {
      return { ...establishment, sequential: value };
    }
    return establishment;
  });

  if (normalizeThreeDigits(issuer.establishment) === target.establishment
    && normalizeThreeDigits(issuer.emissionPoint) === target.emissionPoint) {
    issuer.sequential = value;
  }
}

function parseArgs(values) {
  return values.reduce((result, item) => {
    if (!item.startsWith("--")) return result;
    const [rawKey, rawValue] = item.slice(2).split("=");
    const key = rawKey.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    result[key] = rawValue === undefined ? true : rawValue;
    return result;
  }, {});
}

function requiredArg(name) {
  const key = name.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
  const value = args[key];
  if (!value) fail(`Falta --${name}=...`);
  return String(value);
}

function normalizeThreeDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return (digits || "1").padStart(3, "0").slice(-3);
}

function normalizeSequence(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.padStart(9, "0").slice(-9);
}

function fail(message) {
  console.error(message);
  console.error("Uso:");
  console.error("  node src/tools/resetTestSaleSequence.js --company-id=co_x --establishment=001 --emission-point=001 --sequence=6");
  console.error("  node src/tools/resetTestSaleSequence.js --company-id=co_x --establishment=001 --emission-point=001 --sequence=6 --apply");
  process.exit(1);
}
