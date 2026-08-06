const assert = require("node:assert/strict");
const { Client } = require("pg");
const { reconcileSyncShadow } = require("../sync-shadow-reconciler");
const { hashPayload } = require("../sync-change-log");

require("dotenv").config();

async function main() {
  const companyId = "company-phase31";
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/factudarwin_phase31_it";
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const scenarios = [];
  try {
    const baseline = await reconcileSyncShadow(client, companyId);
    assert.equal(baseline.status, "consistent");

    await scenario(client, scenarios, "missing", async () => {
      await client.query("DELETE FROM sync_change_log WHERE company_id=$1 AND entity_id='bulk-0000'", [companyId]);
    }, "MISSING_CHANGE", companyId);
    await scenario(client, scenarios, "orphan", async () => {
      await client.query(
        `INSERT INTO sync_change_log (company_id,module,entity_type,entity_id,action,record_version,payload,payload_hash,origin,occurred_at,transaction_id,is_tombstone)
         VALUES ($1,'products','product','orphan-shadow','UPSERT',1,$2::jsonb,$3,'system_operation',now(),'33333333-3333-4333-8333-333333333333',false)`,
        [companyId, JSON.stringify({ id: "orphan-shadow" }), hashPayload({ id: "orphan-shadow" })]
      );
    }, "ORPHAN_CHANGE", companyId);
    await scenario(client, scenarios, "hash", async () => {
      await client.query("UPDATE sync_change_log SET payload_hash='altered' WHERE company_id=$1 AND entity_id='bulk-0001'", [companyId]);
    }, "PAYLOAD_HASH_MISMATCH", companyId);
    await scenario(client, scenarios, "version", async () => {
      await client.query("UPDATE sync_change_log SET record_version=9 WHERE company_id=$1 AND entity_id='bulk-0002'", [companyId]);
    }, "RECORD_VERSION_GAP", companyId);
    await scenario(client, scenarios, "tombstone", async () => {
      await client.query("UPDATE sync_change_log SET action='DELETE', payload=NULL, payload_hash=$2, is_tombstone=true WHERE company_id=$1 AND entity_id='bulk-0003'", [companyId, hashPayload(null)]);
    }, "LIVE_ENTITY_HAS_TOMBSTONE", companyId);

    const after = await reconcileSyncShadow(client, companyId);
    assert.equal(after.status, "consistent");
    const storage = await client.query(
      `SELECT count(*)::int AS rows,
              pg_total_relation_size('sync_change_log')::bigint AS total_bytes,
              avg(pg_column_size(payload))::numeric(12,2) AS avg_payload_bytes,
              max(pg_column_size(payload))::int AS max_payload_bytes
       FROM sync_change_log`
    );
    console.log(JSON.stringify({ ok: true, baseline: summarize(baseline), scenarios, after: summarize(after), storage: storage.rows[0] }));
  } finally {
    await client.end();
  }
}

async function scenario(client, output, name, corrupt, expectedCode, companyId) {
  await client.query("BEGIN");
  try {
    await corrupt();
    const result = await reconcileSyncShadow(client, companyId);
    assert.ok(result.issues.some((item) => item.code === expectedCode), `${name}: falta ${expectedCode}`);
    output.push({ name, expectedCode, detected: true });
  } finally {
    await client.query("ROLLBACK");
  }
}

function summarize(result) {
  return { status: result.status, changes: result.changeCount, entities: result.entityCount, tombstones: result.tombstones, payloadBytes: result.payloadBytes, durationMs: result.durationMs };
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
