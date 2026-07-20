const path = require("path");

require(path.join(__dirname, "..", "backend", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", "backend", ".env")
});

const { Pool } = require(path.join(__dirname, "..", "backend", "node_modules", "pg"));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const companyId = "co-1778704993458-b96dbd40c99b";
  const result = await pool.query("select data from saas_snapshots where company_id = $1", [companyId]);
  const sales = result.rows[0]?.data?.sales || [];
  for (const seq of ["000000184", "000000186", "NV-000000044"]) {
    const sale = sales.find((item) => item.sequence === seq);
    console.log(`\n--- ${seq} ---`);
    console.log(JSON.stringify(sale, null, 2));
  }
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
