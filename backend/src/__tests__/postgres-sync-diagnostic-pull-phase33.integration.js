const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { buildPullDiagnosticConfig } = require("../sync-pull-config");
const { decodeCursor, diagnosticPull } = require("../sync-diagnostic-pull");

require("dotenv").config();
const DB = "factudarwin_phase33_it";

function url(name = DB) { const value = new URL(process.env.DATABASE_URL); value.pathname = `/${name}`; return value.toString(); }
async function connect(connectionString = url()) { const client = new Client({ connectionString }); await client.connect(); return client; }

async function main() {
  const admin = await connect(process.env.DATABASE_URL);
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [DB]);
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();
  const client = await connect();
  try {
    await client.query(fs.readFileSync(path.join(__dirname, "..", "migrations", "004-sync-change-log.sql"), "utf8"));
    const company = "phase33-company";
    const other = "phase33-other";
    await insertChanges(client, company, 1250, 0);
    await insertChanges(client, other, 25, 0);
    const repository = repositoryFor(client);
    const config = pullConfig(`${company},${other}`);
    const sequences = [];
    let cursor;
    let repeated;
    let pages = 0;
    do {
      const result = await diagnosticPull(repository, { config, companyId: company, cursor, limit: "100" });
      if (pages === 2) {
        repeated = await diagnosticPull(repository, { config, companyId: company, cursor, limit: "100" });
        assert.deepEqual(repeated.changes, result.changes);
        assert.equal(repeated.nextCursor, result.nextCursor);
        await insertChanges(client, company, 10, 1250);
      }
      sequences.push(...result.changes.map((change) => change.sequence));
      cursor = result.nextCursor;
      pages += 1;
      if (!result.hasMore) break;
    } while (pages < 20);
    assert.equal(sequences.length, 1250);
    assert.equal(new Set(sequences).size, 1250);
    assert(sequences.every((value, index) => index === 0 || value > sequences[index - 1]));
    const empty = await diagnosticPull(repository, { config, companyId: company, cursor, limit: "100" });
    assert.equal(empty.changeCount, 0);
    const fresh = await diagnosticPull(repository, { config, companyId: company, limit: "500" });
    assert.equal(fresh.snapshotRevision > decodeCursor(cursor, { companyId: company, config, maximumSeq: fresh.snapshotRevision }).watermark, true);
    await assert.rejects(diagnosticPull(repository, { config, companyId: other, cursor, limit: "100" }), { code: "SYNC_CURSOR_COMPANY_MISMATCH" });
    await assert.rejects(diagnosticPull(repository, { config, companyId: company, cursor: `${cursor}x`, limit: "100" }), { code: "SYNC_CURSOR_INVALID" });
    await assert.rejects(diagnosticPull(repository, { config: { ...config, minimumAvailableSequence: Number(decodeCursor(cursor, { companyId: company, config, maximumSeq: fresh.snapshotRevision }).lastChangeSeq) + 1 }, companyId: company, cursor }), { code: "SYNC_CURSOR_EXPIRED" });

    const perfCompany = "phase33-performance";
    await insertInterleavedPerformanceChanges(client, perfCompany, "phase33-noise", 100000);
    await client.query("ANALYZE sync_change_log");
    const perfConfig = pullConfig(perfCompany);
    const timings = {};
    for (const limit of [100, 250, 500]) {
      const started = process.hrtime.bigint();
      const result = await diagnosticPull(repository, { config: perfConfig, companyId: perfCompany, limit: String(limit) });
      timings[limit] = { durationMs: Number(process.hrtime.bigint() - started) / 1e6, bytes: Buffer.byteLength(JSON.stringify(result)), changes: result.changeCount };
    }
    const explain = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT change_seq,module,entity_type,entity_id,action,record_version,payload,payload_hash,origin,occurred_at,is_tombstone FROM sync_change_log
       WHERE company_id=$1 AND change_seq>$2 AND change_seq<=$3 ORDER BY change_seq ASC LIMIT 500`,
      [perfCompany, 0, Number(await repository.maximumSequence(perfCompany))]
    );
    const plan = explain.rows[0]["QUERY PLAN"][0];
    const planText = JSON.stringify(plan);
    assert(planText.includes("idx_sync_change_log_company_sequence") || planText.includes("sync_change_log_pkey"));
    console.log(JSON.stringify({ ok: true, continuity: { rows: sequences.length, unique: new Set(sequences).size, pages, repeatedPageStable: true, concurrentRowsDeferred: 10, finalEmpty: true }, isolation: true, tamperingRejected: true, expiredSimulated: true, timings, explain: { executionTimeMs: plan["Execution Time"], plan: plan.Plan["Node Type"], childIndex: plan.Plan.Plans?.[0]?.["Index Name"] } }));
  } finally { await client.end(); }
}

function pullConfig(companies) { return buildPullDiagnosticConfig({ NODE_ENV: "test", INCREMENTAL_SYNC_PULL_DIAGNOSTIC_ENABLED: "true", INCREMENTAL_SYNC_PULL_MODE: "diagnostic", INCREMENTAL_SYNC_PULL_CONFIG_VERSION: "1", INCREMENTAL_SYNC_PULL_COMPANY_IDS: companies, INCREMENTAL_SYNC_PULL_CURSOR_SECRET: "phase33-secret".repeat(4) }, "jwt"); }
function repositoryFor(client) { return {
  maximumSequence: async (companyId) => Number((await client.query("SELECT COALESCE(MAX(change_seq),0)::bigint sequence FROM sync_change_log WHERE company_id=$1", [companyId])).rows[0].sequence),
  listChanges: async ({ companyId, after, watermark, limit }) => (await client.query(`SELECT change_seq "changeSeq",module,entity_type "entityType",entity_id "entityId",action,record_version "recordVersion",payload,payload_hash "payloadHash",origin,occurred_at "occurredAt",is_tombstone "isTombstone" FROM sync_change_log WHERE company_id=$1 AND change_seq>$2 AND change_seq<=$3 ORDER BY change_seq ASC LIMIT $4`, [companyId, after, watermark, limit])).rows
}; }
async function insertChanges(client, companyId, count, offset) { await client.query(`INSERT INTO sync_change_log(company_id,module,entity_type,entity_id,action,record_version,payload,payload_hash,origin,occurred_at,transaction_id,is_tombstone) SELECT $1,'clients','client','entity-'||(value+$3)::text,'UPSERT',1,jsonb_build_object('id','entity-'||(value+$3)::text),repeat('a',64),'incremental_merge',now(),'44444444-4444-4444-8444-444444444444',false FROM generate_series(1,$2) value`, [companyId, count, offset]); }
async function insertInterleavedPerformanceChanges(client, companyId, noiseCompanyId, count) { await client.query(`INSERT INTO sync_change_log(company_id,module,entity_type,entity_id,action,record_version,payload,payload_hash,origin,occurred_at,transaction_id,is_tombstone) SELECT CASE WHEN value%2=0 THEN $1 ELSE $2 END,'clients','client','perf-'||value::text,'UPSERT',1,jsonb_build_object('id','perf-'||value::text),repeat('b',64),'incremental_merge',now(),'55555555-5555-4555-8555-555555555555',false FROM generate_series(1,$3*2) value`, [companyId, noiseCompanyId, count]); }

main().catch((error) => { console.error(error); process.exitCode = 1; });
