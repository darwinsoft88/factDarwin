const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { Pool } = require("pg");

const { createDeviceSessionService } = require("../device-session-service");
const db = require("../db-postgres");
const config = require("../config");

test("sesiones biométricas V2 son durables, rotativas, idempotentes y aisladas", async (t) => {
  if (!config.databaseUrl) {
    t.skip("DATABASE_URL no configurada");
    return;
  }

  await db.initialize();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
  });
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const companyA = `device-session-company-a-${suffix}`;
  const companyB = `device-session-company-b-${suffix}`;
  const userA = `device-session-user-a-${suffix}`;
  const userB = `device-session-user-b-${suffix}`;
  const now = new Date().toISOString();
  const service = createDeviceSessionService({
    repository: {
      register: db.registerDeviceSession,
      rotate: db.rotateDeviceSession,
      revoke: db.revokeDeviceSession
    },
    signToken: (user) => `access:${user.companyId}:${user.id}`,
    pepper: `integration-pepper-${suffix}-012345678901234567890123456789`
  });

  try {
    await pool.query(
      `INSERT INTO saas_companies (id, ruc, business_name, trade_name, email, status, created_at, updated_at)
       VALUES ($1, $2, $3, $3, $4, 'active', $5, $5),
              ($6, $7, $8, $8, $9, 'active', $5, $5)`,
      [companyA, `9${suffix.padEnd(12, "0")}`.slice(0, 13), `Empresa A ${suffix}`, `a-${suffix}@example.invalid`, now,
        companyB, `8${suffix.padEnd(12, "0")}`.slice(0, 13), `Empresa B ${suffix}`, `b-${suffix}@example.invalid`]
    );
    await pool.query(
      `INSERT INTO saas_users (id, company_id, name, email, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, 'Usuario A', $3, 'integration-only', 'admin', 'active', $5, $5),
              ($6, $7, 'Usuario B', $4, 'integration-only', 'admin', 'active', $5, $5)`,
      [userA, companyA, `user-a-${suffix}@example.invalid`, `user-b-${suffix}@example.invalid`, now, userB, companyB]
    );

    const registeredA = await service.register({
      user: { companyId: companyA, id: userA },
      device: { deviceId: `android-${suffix}`, platform: "android", deviceLabel: "integration" }
    });
    const registeredB = await service.register({
      user: { companyId: companyB, id: userB },
      device: { deviceId: `android-${suffix}`, platform: "android", deviceLabel: "integration" }
    });

    await assert.rejects(
      pool.query(
        `INSERT INTO auth_device_sessions
           (id, company_id, user_id, device_id, token_family_id, credential_version)
         VALUES ($1, $2, $3, $4, $5, 2)`,
        [crypto.randomUUID(), companyA, userB, `cross-tenant-${suffix}`, crypto.randomUUID()]
      ),
      (error) => error?.code === "23503"
    );

    const stored = await pool.query(
      `SELECT s.company_id, s.user_id, s.status, t.generation, t.token_hash
         FROM auth_device_sessions s
         JOIN auth_device_refresh_tokens t ON t.session_id = s.id
        WHERE s.id = $1`,
      [registeredA.sessionId]
    );
    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].company_id, companyA);
    assert.equal(stored.rows[0].user_id, userA);
    assert.equal(stored.rows[0].status, "active");
    assert.equal(Number(stored.rows[0].generation), 1);
    assert.equal(stored.rows[0].token_hash.length, 64);
    assert.equal(registeredA.refreshToken.includes(stored.rows[0].token_hash), false);

    const firstRequestId = crypto.randomUUID();
    const firstRotation = await service.refresh({
      refreshToken: registeredA.refreshToken,
      requestId: firstRequestId,
      deviceId: `android-${suffix}`
    });
    const repeatedRotation = await service.refresh({
      refreshToken: registeredA.refreshToken,
      requestId: firstRequestId,
      deviceId: `android-${suffix}`
    });
    assert.equal(repeatedRotation.refreshToken, firstRotation.refreshToken);
    assert.equal(repeatedRotation.token, firstRotation.token);

    const concurrentRequestId = crypto.randomUUID();
    const concurrent = await Promise.all([
      service.refresh({ refreshToken: firstRotation.refreshToken, requestId: concurrentRequestId, deviceId: `android-${suffix}` }),
      service.refresh({ refreshToken: firstRotation.refreshToken, requestId: concurrentRequestId, deviceId: `android-${suffix}` })
    ]);
    assert.equal(concurrent[0].refreshToken, concurrent[1].refreshToken);

    const generations = await pool.query(
      "SELECT generation, COUNT(*)::int AS count FROM auth_device_refresh_tokens WHERE session_id = $1 GROUP BY generation ORDER BY generation",
      [registeredA.sessionId]
    );
    assert.deepEqual(generations.rows.map((row) => [Number(row.generation), row.count]), [[1, 1], [2, 1], [3, 1]]);

    await assert.rejects(
      service.refresh({ refreshToken: registeredA.refreshToken, requestId: crypto.randomUUID(), deviceId: `android-${suffix}` }),
      (error) => error?.code === "REFRESH_REPLAY"
    );
    const revoked = await pool.query("SELECT status, revoked_reason FROM auth_device_sessions WHERE id = $1", [registeredA.sessionId]);
    assert.equal(revoked.rows[0].status, "revoked");
    assert.equal(revoked.rows[0].revoked_reason, "refresh_replay_detected");

    await assert.rejects(
      service.revoke({ sessionId: registeredB.sessionId, companyId: companyA, userId: userA }),
      (error) => error?.code === "DEVICE_SESSION_NOT_FOUND"
    );
    const isolated = await pool.query("SELECT status FROM auth_device_sessions WHERE id = $1", [registeredB.sessionId]);
    assert.equal(isolated.rows[0].status, "active");
  } finally {
    await pool.query("DELETE FROM saas_companies WHERE id = ANY($1::text[])", [[companyA, companyB]]).catch(() => undefined);
    await pool.end();
    await db.close();
  }
});
