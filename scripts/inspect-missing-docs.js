const path = require("path");

require(path.join(__dirname, "..", "backend", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", "backend", ".env")
});

const { Pool } = require(path.join(__dirname, "..", "backend", "node_modules", "pg"));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const needles = ["000000183", "000000187", "000000044", "00000044", "NV-000000044", "44"];

function safeText(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "";
  }
}

function saleSummary(sale) {
  return {
    id: sale.id,
    documentType: sale.documentType || sale.document_type || sale.type,
    sequence: sale.sequence,
    number: sale.number || sale.documentNumber || sale.document_number,
    status: sale.status,
    establishment: sale.establishment,
    emissionPoint: sale.emissionPoint || sale.emission_point,
    total: sale.total,
    clientName: sale.clientName || sale.client?.name,
    accessKey: sale.accessKey || sale.access_key,
    createdAt: sale.createdAt || sale.created_at
  };
}

(async () => {
  const companies = await pool.query(
    "select id, ruc, business_name as \"businessName\", trade_name as \"tradeName\" from saas_companies order by created_at desc"
  );
  console.log("EMPRESAS");
  for (const row of companies.rows) {
    console.log(`${row.id} | ${row.ruc} | ${row.businessName} | ${row.tradeName}`);
  }

  const targetCompany =
    companies.rows.find((row) => String(row.ruc || "") === "1723772099001") ||
    companies.rows.find((row) => String(row.id || "").includes("1778704993458")) ||
    companies.rows[0];

  if (!targetCompany) {
    console.log("No hay empresas.");
    return;
  }

  console.log(`\nEMPRESA OBJETIVO: ${targetCompany.id} | ${targetCompany.ruc}`);

  const tableHits = await pool.query(
    `select id, company_id, document_type, environment, establishment, emission_point, sequence, status, total, access_key, created_at, payload
       from sales
      where company_id = $1
        and (
          sequence in ('000000183', '000000187', '000000044', '00000044', '44')
          or access_key like '%000000183%'
          or access_key like '%000000187%'
          or access_key like '%000000044%'
          or access_key like '%00000044%'
          or payload::text like '%NV-000000044%'
          or payload::text like '%000000044%'
        )
      order by created_at desc`,
    [targetCompany.id]
  );

  console.log("\nHITS TABLA sales");
  console.log(JSON.stringify(tableHits.rows.map((row) => ({ ...row, payload: saleSummary(row.payload) })), null, 2));

  const snapshotResult = await pool.query("select data from saas_snapshots where company_id = $1", [targetCompany.id]);
  const snapshot = snapshotResult.rows[0]?.data || {};
  const sales = Array.isArray(snapshot.sales) ? snapshot.sales : [];
  const snapshotHits = sales.filter((sale) => {
    const text = safeText(sale);
    return needles.some((needle) => text.includes(needle));
  });
  console.log("\nHITS SNAPSHOT sales");
  console.log(JSON.stringify(snapshotHits.map(saleSummary), null, 2));

  console.log("\nRESUMEN");
  console.log(`sales tabla: ${tableHits.rowCount}`);
  console.log(`sales snapshot: ${snapshotHits.length}`);
  console.log(`total snapshot sales: ${sales.length}`);
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
