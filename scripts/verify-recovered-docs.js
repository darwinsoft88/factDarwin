const path = require("path");

require(path.join(__dirname, "..", "backend", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", "backend", ".env")
});

const { Pool } = require(path.join(__dirname, "..", "backend", "node_modules", "pg"));

const companyId = process.argv[2] || "co-1778704993458-b96dbd40c99b";
const wantedSequences = ["000000183", "000000187", "NV-000000044"];

function summarizeSale(sale) {
  if (!sale) return null;
  return {
    sequence: sale.sequence,
    documentType: sale.documentType || sale.document_type || null,
    status: sale.status || null,
    total: Number(sale.total || 0),
    clientName: sale.clientName || sale.client?.name || null,
    clientId: sale.clientId || sale.client_id || null,
    accessKey: sale.accessKey || sale.access_key || null,
    establishment: sale.establishment || null,
    emissionPoint: sale.emissionPoint || sale.emission_point || null,
    items: Array.isArray(sale.items) ? sale.items.length : null
  };
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const tableResult = await pool.query(
      `select sequence, document_type, status, total, access_key, establishment, emission_point, payload
         from sales
        where company_id = $1
          and sequence = any($2)
        order by sequence`,
      [companyId, wantedSequences]
    );

    const snapshotResult = await pool.query(
      "select data from saas_snapshots where company_id = $1",
      [companyId]
    );

    const snapshotSales = snapshotResult.rows[0]?.data?.sales || [];
    const snapshotHits = snapshotSales
      .filter((sale) => wantedSequences.includes(sale.sequence))
      .map(summarizeSale)
      .sort((a, b) => String(a.sequence).localeCompare(String(b.sequence)));

    const tableHits = tableResult.rows.map((row) => ({
      sequence: row.sequence,
      documentType: row.document_type,
      status: row.status,
      total: Number(row.total || 0),
      accessKey: row.access_key,
      establishment: row.establishment,
      emissionPoint: row.emission_point,
      payload: summarizeSale(row.payload)
    }));

    console.log(JSON.stringify({
      ok: snapshotHits.length === wantedSequences.length,
      companyId,
      expected: wantedSequences,
      tableHits,
      snapshotHits
    }, null, 2));
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
