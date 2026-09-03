const cors = require("cors");
const crypto = require("node:crypto");
const express = require("express");
const fs = require("node:fs");
const config = require("./config");
const db = require("./db");
const {
  authenticateCompanyUser,
  authenticateSupportUser,
  changeCompanyUserPassword,
  createCompanyAccount,
  createTenantSubscriptionPayment,
  exportTenantSnapshot,
  findDocumentByAccessKey,
  getAudit,
  getCompanySriEnvironment,
  getIncrementalPilotBootstrap,
  getSnapshot,
  getSnapshotMetadata,
  getTenantSubscriptionPayment,
  listGuidesHistory,
  listDocumentHistoryPage,
  listDiagnosticSyncChanges,
  listSalesHistory,
  listTenantAccounts,
  listTenantAccountsPage,
  listTenantSubscriptionPayments,
  markTenantSubscriptionPaymentLicenseApplied,
  markTenantSubscriptionPaymentLicenseReversed,
  permanentlyDeleteEmptyTenant,
  isIncrementalPilotDeviceTrusted,
  mergeSnapshotPatch,
  maximumSyncChangeSequence,
  maximumDocumentHistorySequence,
  reserveDocumentSequence,
  resetCompanyUserPassword,
  restoreTenantSnapshot,
  saveSnapshot,
  searchClients,
  searchProducts,
  setTenantLifecycleStatus,
  updateCompanySriEnvironment,
  updateTenantSubscriptionPaymentStatus
} = db;
const { authenticateUser, hashPassword, requireAuth, signToken } = require("./auth");
const { createDeviceSessionService } = require("./device-session-service");
const { sendInvoiceEmail, sendPasswordResetEmail, sendTestEmail } = require("./email");
const { licenseStatus, normalizeLicense, requireActiveLicense, requireLicenseFeatures } = require("./license");
const { normalizePaymentRenewal, normalizePaymentRenewalReversal } = require("./saas-payment-policy");
const { preserveAuthoritativeLicense, removeClientLicensePatch } = require("./license-authority");
const { renderMasterPanel } = require("./master-panel");
const { createMasterKeyMiddleware } = require("./master-auth");
const { registerMasterPaymentRoutes } = require("./master-payment-routes");
const { createMasterPaymentService } = require("./master-payment-service");
const { createMasterLicenseService } = require("./master-license-service");
const { registerMasterLicenseRoutes } = require("./master-license-routes");
const { createMasterTenantService } = require("./master-tenant-service");
const { registerMasterTenantRoutes } = require("./master-tenant-routes");
const { createMasterTenantBackupService } = require("./master-tenant-backup-service");
const { registerMasterTenantBackupRoutes } = require("./master-tenant-backup-routes");
const { createMasterTenantLifecycleService } = require("./master-tenant-lifecycle-service");
const { registerMasterTenantLifecycleRoutes } = require("./master-tenant-lifecycle-routes");
const { getBackupStatus, runPostgresBackup, startBackupScheduler, stopBackupScheduler } = require("./postgres-backup");
const { lookupIdentification } = require("./datos-service");
const { createAccessKey, nextSequence } = require("./sri/access-key");
const { authorizeInvoice, queryInvoiceAuthorization, signInvoice } = require("./sri/invoices");
const { getTenantAssetStatus, getTenantLogo, getTenantProductImage, removeTenantAssets, removeTenantProductImage, saveTenantCertificate, saveTenantLogo, saveTenantProductImage } = require("./tenant-assets");
const { tenantDeletionAssessment } = require("./tenant-lifecycle-policy");
const { cleanupTechnicalLogs, errorLogger, listTechnicalLogs, logTechnical, requestLogger } = require("./technical-logs");
const { hashSyncPayload, resolveSyncRequestId, stripSyncTransportFields } = require("./db-utils");
const { createDocumentEmailWorker } = require("./document-email-worker");
const { createDocumentEmailQueueRepository } = require("./document-email-queue");
const { buildDocumentEmail, buildDocumentRide } = require("./document-email-builder");
const { buildManualEmailOperation, buildManualRideOperation } = require("./document-email-operations");
const { deterministicMessageId, sendDocumentEmail } = require("./document-email-sender");
const { createCorsOptions } = require("./cors-policy");
const { diagnosticPull, encodeCursor, initialCursor } = require("./sync-diagnostic-pull");
const { evaluateIncrementalPilotAccess } = require("./sync-pilot-config");
const { evaluateDocumentHistoryAccess } = require("./document-history-config");
const { historicalDocumentsPage } = require("./document-history");
const {
  authenticationOptions: createPasskeyAuthenticationOptions,
  registrationOptions: createPasskeyRegistrationOptions,
  verifyAuthentication: verifyPasskeyAuthentication,
  verifyRegistration: verifyPasskeyRegistration
} = require("./webauthn-service");

const app = express();
let documentEmailWorker = null;
let documentEmailRepository = null;
let shutdownPromise = null;
const sriAuthorizationLocks = new Map();
const sriAuthorizationCache = new Map();
const SRI_AUTHORIZATION_CACHE_TTL_MS = 10 * 60 * 1000;
const diagnosticPullRate = new Map();
const historicalDocumentsRate = new Map();
const passkeyRate = new Map();
const deviceSessionRate = new Map();
const loginRate = new Map();
const requireMasterKey = createMasterKeyMiddleware({ getKey: () => config.masterAdminKey });
const deviceSessionService = db.registerDeviceSession && db.rotateDeviceSession && db.revokeDeviceSession
  ? createDeviceSessionService({
    repository: {
      register: db.registerDeviceSession,
      rotate: db.rotateDeviceSession,
      revoke: db.revokeDeviceSession
    },
    signToken,
    pepper: config.deviceSessionTokenPepper
  })
  : null;

config.assertProductionConfig();

if (config.requireHttps) {
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const protocol = forwardedProto || req.protocol;
    const host = String(req.headers.host || "");
    const isLocalhost = /^localhost(?::\d+)?$/.test(host) || /^127\.0\.0\.1(?::\d+)?$/.test(host);

    if (protocol !== "https" && !isLocalhost) {
      res.status(403).json({ error: "HTTPS requerido para este entorno." });
      return;
    }

    next();
  });
}

app.use((req, res, next) => cors(createCorsOptions(req, {
  allowedOrigins: config.allowedOrigins,
  publicUrl: config.publicUrl,
  isProduction: config.isProduction
}))(req, res, next));

app.set("etag", false);
app.use(express.json({ limit: "8mb" }));
app.use(requestLogger);

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

const requireSalesLicense = requireActiveLicense(getSnapshot, "sales");
const requireSriLicense = requireActiveLicense(getSnapshot, "sri");
const requireClientsLicense = requireActiveLicense(getSnapshot, "clients");
const requireProductsLicense = requireActiveLicense(getSnapshot, "products");
const requireGuidesLicense = requireActiveLicense(getSnapshot, "guides");
const requireSyncModuleAccess = requireLicenseFeatures(getSnapshot, (req) => syncPatchFeatures(req.body || {}));

app.get("/health", async (_req, res, next) => {
  try {
    if (db.initialize) await db.initialize();
    const snapshot = await getSnapshot();
    res.json({
      ok: true,
      service: "factura-sri-backend",
      sriEnv: config.sriEnv,
      allowSriSend: config.allowSriSend,
      sriAllowInsecureTls: config.sriAllowInsecureTls,
      authRequired: config.authRequired,
      database: {
        engine: db.engine || (config.databaseUrl ? "postgres" : "better-sqlite3"),
        path: config.databaseUrl ? "DATABASE_URL" : config.dbPath
      },
      backups: getBackupStatus(),
      technicalLogs: {
        enabled: config.technicalLogs.enabled,
        retentionDays: config.technicalLogs.retentionDays
      },
      license: licenseStatus(snapshot?.data || {}),
      certConfigured: Boolean(config.certPassword),
      certExists: fs.existsSync(config.certPath),
      supportedDocuments: ["factura", "notaCredito", "guiaRemision"]
    });
  } catch (error) {
    next(error);
  }
});

app.get("/master", (_req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  res.type("html").send(renderMasterPanel());
});

app.get("/api/app/version-policy", (_req, res) => {
  res.json(config.appVersionPolicy);
});

const masterLicenseService = createMasterLicenseService({ getSnapshot, saveSnapshot, normalizeLicense, licenseStatus, logTechnical });
registerMasterLicenseRoutes(app, { requireMasterKey, service: masterLicenseService });
const masterTenantService = createMasterTenantService({ listTenantAccounts, listTenantAccountsPage, licenseStatus });
registerMasterTenantRoutes(app, { requireMasterKey, service: masterTenantService });

const masterPaymentService = createMasterPaymentService({
  listPayments: listTenantSubscriptionPayments,
  createPayment: createTenantSubscriptionPayment,
  updatePaymentStatus: updateTenantSubscriptionPaymentStatus,
  getPayment: getTenantSubscriptionPayment,
  markLicenseApplied: markTenantSubscriptionPaymentLicenseApplied,
  markLicenseReversed: markTenantSubscriptionPaymentLicenseReversed,
  licenseService: masterLicenseService,
  normalizePaymentRenewal,
  normalizePaymentRenewalReversal,
  logTechnical
});
registerMasterPaymentRoutes(app, { requireMasterKey, service: masterPaymentService });

const masterTenantBackupService = createMasterTenantBackupService({ exportTenantSnapshot, restoreTenantSnapshot, runPostgresBackup, logTechnical });
registerMasterTenantBackupRoutes(app, { requireMasterKey, service: masterTenantBackupService });

app.post("/api/auth/register", async (req, res, next) => {
  try {
    if (!createCompanyAccount) {
      res.status(503).json({ error: "Registro SaaS no disponible en este motor de base de datos." });
      return;
    }
    const { company = {}, admin = {}, device = {} } = req.body || {};
    const errors = validateRegistration(company, admin);
    if (errors.length) {
      res.status(400).json({ error: errors.join(" ") });
      return;
    }

    const result = await createCompanyAccount({
      company: {
        ruc: String(company.ruc || ""),
        businessName: String(company.businessName || ""),
        tradeName: String(company.tradeName || company.businessName || ""),
        phone: String(company.phone || ""),
        address: String(company.address || "Ecuador")
      },
      admin: {
        name: String(admin.name || ""),
        email: String(admin.email || "")
      },
      passwordHash: hashPassword(String(admin.password || "")),
      device
    });
    const license = licenseStatus(result.data);
    logTechnical("info", "tenant_registered", { company: result.company, user: { id: result.user.id, email: result.user.email } });
    res.status(201).json({
      ok: true,
      token: signToken(result.user),
      user: result.user,
      company: result.company,
      license,
      snapshot: { data: result.data, updatedAt: result.updatedAt, summary: result.data ? null : null }
    });
  } catch (error) {
    next(error);
  }
});
app.post("/api/auth/login", requireLoginRateLimit, async (req, res, next) => {
  try {
    const {
      email,
      identifier = email,
      username = "",
      password,
      device = {},
      companyId = ""
    } = req.body || {};
    if (!identifier || !password) {
      res.status(400).json({
        error: "Debe enviar el identificador y la contraseña."
      });
      return;
    }

    let saasUser = authenticateSupportUser
      ? await authenticateSupportUser(
        identifier,
        String(password || ""),
        device,
        companyId
      )
      : null;
    try {
      saasUser = saasUser || (authenticateCompanyUser ? await authenticateCompanyUser(
        identifier,
        String(password || ""),
        device,
        companyId,
        String(username || "").trim()
      ) : null);
    } catch (error) {
      if (error.statusCode === 409 && Array.isArray(error.companyOptions)) {
        res.json({
          ok: false,
          requiresCompanySelection: true,
          error: error.message || "Elija la empresa con la que desea trabajar.",
          companyOptions: error.companyOptions
        });
        return;
      }
      throw error;
    }
    if (saasUser) {
      const snapshot = await getSnapshot(saasUser.companyId);
      logTechnical("info", "tenant_auth_success", { companyId: saasUser.companyId, user: { id: saasUser.id, email: saasUser.email, role: saasUser.role } });
      res.json({ ok: true, token: signToken(saasUser), user: saasUser, company: saasUser.company, license: licenseStatus(snapshot?.data || {}) });
      return;
    }

    const snapshot = await getSnapshot();
    const user = authenticateUser(snapshot, email, password);
    if (!user) {
      logTechnical("warn", "auth_failed", { email, ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "" });
      const identifier = String(email || "").trim();
      res.status(401).json({ error: /^\d{13}$/.test(identifier) ? "No encontramos una empresa activa con ese RUC o la clave no coincide." : "No encontramos una cuenta activa con ese correo o RUC." });
      return;
    }

    logTechnical("info", "auth_success", { user: { id: user.id, email: user.email, role: user.role } });
    res.json({ ok: true, token: signToken(user), user, license: licenseStatus(snapshot?.data || {}) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/passkeys/capabilities", (req, res) => {
  const origin = String(req.get("Origin") || "");
  const originAllowed = !origin || config.passkeys.origins.includes(origin);
  res.json({
    ok: true,
    enabled: Boolean(config.passkeys.enabled && originAllowed && db.createWebauthnChallenge),
    rpId: config.passkeys.enabled ? config.passkeys.rpId : ""
  });
});

const masterTenantLifecycleService = createMasterTenantLifecycleService({
  listTenantAccounts,
  setTenantLifecycleStatus,
  permanentlyDeleteEmptyTenant,
  getTenantAssetStatus,
  removeTenantAssets,
  tenantDeletionAssessment,
  runPostgresBackup,
  logTechnical
});
registerMasterTenantLifecycleRoutes(app, { requireMasterKey, service: masterTenantLifecycleService });

app.post("/api/auth/device-sessions/register", requireDeviceSessionRateLimit, requireAuth(["admin", "vendedor", "cajero", "contador"]), requireRecentAuthentication, async (req, res, next) => {
  try {
    if (!deviceSessionService) throw deviceSessionUnavailable();
    const user = { ...req.user, id: req.user.sub || req.user.id || "" };
    const result = await deviceSessionService.register({
      user,
      device: {
        deviceId: String(req.body?.deviceId || "").trim(),
        deviceLabel: String(req.body?.deviceLabel || "").trim(),
        platform: String(req.body?.platform || "").trim().toLowerCase(),
        appVersion: String(req.body?.appVersion || "").trim()
      }
    });
    logTechnical("info", "device_session_registered", {
      companyId: user.companyId,
      userId: user.id,
      sessionId: result.sessionId,
      platform: String(req.body?.platform || "").trim().toLowerCase()
    });
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/device-sessions/refresh", requireDeviceSessionRateLimit, async (req, res, next) => {
  try {
    if (!deviceSessionService) throw deviceSessionUnavailable();
    const result = await deviceSessionService.refresh({
      refreshToken: String(req.body?.refreshToken || ""),
      requestId: String(req.body?.requestId || ""),
      deviceId: String(req.body?.deviceId || "").trim()
    });
    logTechnical("info", "device_session_refreshed", {
      companyId: result.user.companyId,
      userId: result.user.id,
      sessionId: result.sessionId,
      idempotentReplay: result.idempotentReplay
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (["REFRESH_REPLAY", "DEVICE_SESSION_REVOKED", "ACCOUNT_DISABLED", "TENANT_MISMATCH"].includes(error.code)) {
      logTechnical("warn", "device_session_rejected", { code: error.code });
    }
    next(error);
  }
});

app.post("/api/auth/device-sessions/:sessionId/revoke", requireDeviceSessionRateLimit, requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
  try {
    if (!deviceSessionService) throw deviceSessionUnavailable();
    const userId = req.user.sub || req.user.id || "";
    const result = await deviceSessionService.revoke({
      sessionId: String(req.params.sessionId || ""),
      companyId: String(req.user.companyId || ""),
      userId: String(userId),
      reason: "user_revoked"
    });
    logTechnical("info", "device_session_revoked", {
      companyId: req.user.companyId,
      userId,
      sessionId: String(req.params.sessionId || "")
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/passkeys/authentication/options", requirePasskeyRateLimit, async (_req, res, next) => {
  try {
    const result = await createPasskeyAuthenticationOptions({ config: config.passkeys, db });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/passkeys/authentication/verify", requirePasskeyRateLimit, async (req, res, next) => {
  try {
    const user = await verifyPasskeyAuthentication({
      config: config.passkeys,
      db,
      challengeId: String(req.body?.challengeId || ""),
      response: req.body?.response
    });
    const snapshot = await getSnapshot(user.companyId);
    logTechnical("info", "passkey_auth_success", { companyId: user.companyId, user: { id: user.id, email: user.email } });
    res.json({ ok: true, token: signToken(user), user, license: licenseStatus(snapshot?.data || {}) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/passkeys/status", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
  try {
    if (!config.passkeys.enabled || !db.listUserPasskeys) {
      res.json({ ok: true, enabled: false, count: 0 });
      return;
    }
    const passkeys = await db.listUserPasskeys(req.user.companyId || "", req.user.sub || req.user.id || "");
    res.json({ ok: true, enabled: passkeys.length > 0, count: passkeys.length });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/passkeys/registration/options", requirePasskeyRateLimit, requireAuth(["admin", "vendedor", "cajero", "contador"]), requireRecentAuthentication, async (req, res, next) => {
  try {
    const user = { ...req.user, id: req.user.sub || req.user.id || "" };
    const result = await createPasskeyRegistrationOptions({ config: config.passkeys, db, user });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/passkeys/registration/verify", requirePasskeyRateLimit, requireAuth(["admin", "vendedor", "cajero", "contador"]), requireRecentAuthentication, async (req, res, next) => {
  try {
    const user = { ...req.user, id: req.user.sub || req.user.id || "" };
    await verifyPasskeyRegistration({
      config: config.passkeys,
      db,
      user,
      challengeId: String(req.body?.challengeId || ""),
      response: req.body?.response
    });
    logTechnical("info", "passkey_registered", { companyId: user.companyId, user: { id: user.id, email: user.email } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/auth/passkeys", requireAuth(["admin", "vendedor", "cajero", "contador"]), requireRecentAuthentication, async (req, res, next) => {
  try {
    if (!db.deleteUserPasskeys) {
      res.status(503).json({ error: "Passkeys no estan disponibles en este backend." });
      return;
    }
    const removed = await db.deleteUserPasskeys(req.user.companyId || "", req.user.sub || req.user.id || "");
    logTechnical("info", "passkeys_revoked", { companyId: req.user.companyId || "", user: { id: req.user.sub || req.user.id || "" }, removed });
    res.json({ ok: true, removed });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-reset", async (req, res, next) => {
  try {
    if (!resetCompanyUserPassword) {
      res.status(503).json({ error: "Recuperacion de contrasena no disponible en este motor de base de datos." });
      return;
    }

    const identifier = String(req.body?.identifier || "").trim();
    if (!identifier) {
      res.status(400).json({ error: "Ingrese el correo o RUC de la cuenta." });
      return;
    }

    const temporaryPassword = generateTemporaryPassword();
    const result = await resetCompanyUserPassword({ identifier, passwordHash: hashPassword(temporaryPassword) });
    if (!result?.user?.email) {
      logTechnical("warn", "password_reset_not_found", { identifier });
      res.status(404).json({ error: "No encontramos una cuenta activa con ese correo o RUC." });
      return;
    }

    await sendPasswordResetEmail({
      to: result.user.email,
      name: result.user.name,
      temporaryPassword,
      companyName: result.company?.tradeName || result.company?.businessName || "FactuDarwin"
    });
    logTechnical("info", "password_reset_sent", { companyId: result.user.companyId, user: { id: result.user.id, email: result.user.email } });
    res.json({ ok: true, email: maskEmail(result.user.email), message: "Enviamos una clave temporal al correo registrado." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/change-password", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
  try {
    if (!changeCompanyUserPassword) {
      res.status(503).json({ error: "Cambio de contrasena no disponible en este motor de base de datos." });
      return;
    }
    const password = String(req.body?.password || "");
    if (password.length < 8) {
      res.status(400).json({ error: "La nueva contrasena debe tener al menos 8 caracteres." });
      return;
    }
    const user = await changeCompanyUserPassword({
      companyId: req.user?.companyId || "",
      userId: req.user?.sub || req.user?.id || "",
      passwordHash: hashPassword(password)
    });
    const token = signToken(user);
    logTechnical("info", "password_changed", { companyId: user.companyId, user: { id: user.id, email: user.email } });
    res.json({ ok: true, token, user });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sri/environment", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
  try {
    const canonical = await getCompanySriEnvironment?.(req.user?.companyId || "");
    if (!canonical) { res.status(404).json({ ok: false, error: "No existe configuracion SRI empresarial." }); return; }
    res.json({ ok: true, ...canonical });
  } catch (error) { next(error); }
});

app.put("/api/sri/environment", requireAuth(["admin"]), async (req, res, next) => {
  try {
    const { environment, expectedVersion } = req.body || {};
    const result = await updateCompanySriEnvironment(req.user?.companyId || "", String(environment || ""), Number(expectedVersion));
    res.json({ ok: true, ...result });
  } catch (error) {
    if (String(error.code || "").startsWith("SRI_ENVIRONMENT_")) {
      res.status(error.statusCode || 400).json({ ok: false, error: error.code, canonical: error.canonical });
      return;
    }
    next(error);
  }
});

app.post("/api/facturas/firmar", requireAuth(["admin", "vendedor", "cajero"]), requireSriLicense, async (req, res, next) => {
  try {
    const { xml } = req.body || {};
    if (!xml || typeof xml !== "string") {
      res.status(400).json({ error: "Debe enviar el campo xml como texto." });
      return;
    }

    const result = await signInvoice(xml, req.user?.companyId || "");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/facturas/autorizar", requireAuth(["admin", "vendedor", "cajero"]), requireSriLicense, async (req, res, next) => {
  try {
    const { xml } = req.body || {};
    if (!xml || typeof xml !== "string") {
      res.status(400).json({ error: "Debe enviar el campo xml como texto." });
      return;
    }

    const companyId = req.user?.companyId || "";
    const result = await authorizeSriDocumentOnce(companyId, xml, () => authorizeInvoice(xml, companyId));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/secuenciales/reservar", requireAuth(["admin", "vendedor", "cajero"]), requireSalesLicense, async (req, res, next) => {
  try {
    const { documentType = "factura", issuer, createdAt } = req.body || {};
    if (!reserveDocumentSequence) {
      res.status(500).json({ error: "El motor de base de datos no soporta reserva de secuenciales." });
      return;
    }
    if (!["factura", "nota_credito", "guia_remision"].includes(documentType)) {
      res.status(400).json({ error: "Tipo de documento no soportado para secuencial." });
      return;
    }
    if (documentType === "guia_remision" && !["admin", "vendedor"].includes(req.user?.role)) {
      res.status(403).json({ error: "No tiene permiso para reservar secuencial de guia." });
      return;
    }
    const issuerErrors = validateIssuerForSequence(issuer);
    if (issuerErrors.length > 0) {
      res.status(400).json({ error: issuerErrors.join(" ") });
      return;
    }
    const canonicalEnvironment = await getCompanySriEnvironment?.(req.user?.companyId || "");
    if (!canonicalEnvironment || String(issuer.environment) !== canonicalEnvironment.environment || Number(issuer.environmentVersion || 0) !== canonicalEnvironment.environmentVersion) {
      res.status(409).json({
        error: "No se pudo confirmar el ambiente SRI vigente. Actualice la configuracion empresarial e intente nuevamente.",
        code: "SRI_ENVIRONMENT_STALE",
        canonical: canonicalEnvironment || undefined
      });
      return;
    }
    const scopeError = await validateEmissionPointAllowed(req.user?.companyId || "", issuer);
    if (scopeError) {
      res.status(402).json({ error: scopeError });
      return;
    }

    const sequenceNumber = await reserveDocumentSequence({ documentType, issuer, createdAt, companyId: req.user?.companyId || "" });
    const sequence = nextSequence(sequenceNumber);
    const accessKey = createAccessKey(createdAt ? new Date(createdAt) : new Date(), issuer, sequence, documentType);
    logTechnical("info", "sequence_reserved", {
      companyId: req.user?.companyId || "",
      userId: req.user?.id || "",
      documentType,
      environment: issuer.environment,
      establishment: issuer.establishment,
      emissionPoint: issuer.emissionPoint,
      sequence
    });
    res.json({ ok: true, documentType, sequence, accessKey, ...canonicalEnvironment });
  } catch (error) {
    next(error);
  }
});

app.get("/api/datos/identificacion/:identifier", requireAuth(["admin", "vendedor", "cajero"]), async (req, res, next) => {
  try {
    const result = await lookupIdentification(req.params.identifier);
    logTechnical("info", "datos_lookup_success", { companyId: req.user?.companyId || "", type: result.type, identification: result.identification });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/guias/autorizar", requireAuth(["admin", "vendedor"]), requireSriLicense, async (req, res, next) => {
  try {
    const { xml } = req.body || {};
    if (!xml || typeof xml !== "string") {
      res.status(400).json({ error: "Debe enviar el campo xml como texto." });
      return;
    }

    const companyId = req.user?.companyId || "";
    const result = await authorizeSriDocumentOnce(companyId, xml, () => authorizeInvoice(xml, companyId));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/email/invoice", requireAuth(["admin", "vendedor", "cajero"]), requireSalesLicense, async (req, res, next) => {
  try {
    const { to, subject, html, xml, pdfBase64, documentType, documentNumber, documentId, requestId } = req.body || {};
    if (documentId) {
      const companyId = req.user?.companyId || "";
      const snapshot = await getSnapshot(companyId);
      if (!snapshot?.data) {
        res.status(404).json({ error: "No se encontro la informacion de la empresa." });
        return;
      }
      const operation = buildManualEmailOperation(companyId, snapshot.data, {
        documentId,
        documentType,
        recipientEmail: to,
        requestId
      });
      const built = await buildDocumentEmail(operation);
      const result = await sendDocumentEmail({
        operation,
        built,
        messageId: deterministicMessageId(operation)
      });
      logTechnical("info", "email_invoice_sent", {
        companyId,
        documentType: operation.documentType,
        documentId: operation.documentId,
        origin: operation.origin,
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected
      });
      res.json({ ok: true, ...result });
      return;
    }
    if (!to || !subject || !html) {
      res.status(400).json({ error: "Debe enviar to, subject y html." });
      return;
    }

    const emailContext = await getCompanyEmailContext(req.user);
    const result = await sendInvoiceEmail({ to, subject, html, xml, pdfBase64, documentType, documentNumber, ...emailContext });
    logTechnical("info", "email_invoice_sent", {
      companyId: req.user?.companyId || "",
      to,
      documentType,
      documentNumber,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/email/test", requireAuth(["admin"]), async (req, res, next) => {
  try {
    const { to } = req.body || {};
    const emailContext = await getCompanyEmailContext(req.user);
    const target = String(to || emailContext.replyTo || req.user?.email || "").trim();
    if (!target) {
      res.status(400).json({ error: "Configure un correo de contacto para enviar la prueba." });
      return;
    }
    const result = await sendTestEmail({ to: target, ...emailContext });
    logTechnical("info", "email_test_sent", {
      companyId: req.user?.companyId || "",
      to: target,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected
    });
    res.json({ ...result, to: target });
  } catch (error) {
    next(error);
  }
});

app.get("/api/company/assets/status", requireAuth(["admin"]), async (req, res, next) => {
  try {
    if (!req.user?.companyId) {
      res.json({
        ok: true,
        logo: { configured: false },
        certificate: {
          configured: Boolean(config.certPassword) && fs.existsSync(config.certPath),
          fileName: config.certPath.split(/[\\/]/).pop() || "firma.p12"
        },
        mode: "legacy"
      });
      return;
    }
    res.json(getTenantAssetStatus(req.user.companyId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/company/logo", requireAuth(["admin"]), async (req, res, next) => {
  try {
    if (!req.user?.companyId) {
      res.status(400).json({ error: "Esta funcion requiere una empresa SaaS." });
      return;
    }
    res.json(saveTenantLogo(req.user.companyId, req.body || {}));
  } catch (error) {
    next(error);
  }
});

app.get("/api/company/logo", async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId || "");
    const logo = getTenantLogo(companyId);
    if (!logo) {
      res.status(404).send("Logo no configurado.");
      return;
    }
    res.type(logo.mimeType).sendFile(logo.filePath);
  } catch (error) {
    next(error);
  }
});

app.post("/api/company/certificate", requireAuth(["admin"]), async (req, res, next) => {
  try {
    if (!req.user?.companyId) {
      res.status(400).json({ error: "Esta funcion requiere una empresa SaaS." });
      return;
    }
    const result = saveTenantCertificate(req.user.companyId, req.body || {});
    logTechnical("info", "tenant_certificate_uploaded", { companyId: req.user.companyId, size: result.size });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/sync/version",
  requireAuth(["admin", "vendedor", "cajero", "contador"]),
  async (req, res, next) => {
    try {
      const metadata = await getSnapshotMetadata(req.user?.companyId);

      res.json({
        ok: true,
        updatedAt: metadata?.updatedAt ?? null
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get("/api/data", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (_req, res, next) => {
  try {
    const snapshot = await getSnapshot(_req.user?.companyId);
    res.json({ ok: true, snapshot });
  } catch (error) {
    next(error);
  }
});



app.get("/api/history/sales", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
  try {
    if (!listSalesHistory) {
      res.status(501).json({ error: "El motor de base de datos no soporta historial paginado." });
      return;
    }
    const result = await listSalesHistory(req.user?.companyId || "", req.query || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.get("/api/history/guides", requireAuth(["admin", "vendedor", "cajero", "contador"]), requireGuidesLicense, async (req, res, next) => {
  try {
    if (!listGuidesHistory) {
      res.status(501).json({ error: "El motor de base de datos no soporta historial paginado." });
      return;
    }
    const result = await listGuidesHistory(req.user?.companyId || "", req.query || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.get("/api/catalog/clients", requireAuth(["admin", "vendedor", "cajero", "contador"]), requireClientsLicense, async (req, res, next) => {
  try {
    if (!searchClients) {
      res.status(501).json({ error: "El motor de base de datos no soporta busqueda paginada de clientes." });
      return;
    }
    const result = await searchClients(req.user?.companyId || "", req.query || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.get("/api/catalog/products", requireAuth(["admin", "vendedor", "cajero", "contador"]), requireProductsLicense, async (req, res, next) => {
  try {
    if (!searchProducts) {
      res.status(501).json({ error: "El motor de base de datos no soporta busqueda paginada de productos." });
      return;
    }
    const result = await searchProducts(req.user?.companyId || "", req.query || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.post("/api/data", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
  try {
    const { data } = req.body || {};
    if (!data || typeof data !== "object") {
      res.status(400).json({ error: "Debe enviar data como objeto." });
      return;
    }

    const currentSnapshot = await getSnapshot(req.user?.companyId);
    const authoritativeData = preserveAuthoritativeLicense(data, currentSnapshot?.data);
    res.json(await saveSnapshot(authoritativeData, req.user?.companyId, {
      origin: "legacy_snapshot",
      userId: req.user?.sub || req.user?.id || null
    }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/sync/merge", requireAuth(["admin", "vendedor", "cajero"]), requireSyncModuleAccess, async (req, res, next) => {
  try {
    if (!mergeSnapshotPatch) {
      res.status(500).json({ error: "El motor de base de datos no soporta sincronizacion incremental." });
      return;
    }

    const rawPatch = req.body || {};
    const bodyPresent = Object.prototype.hasOwnProperty.call(rawPatch, "requestId");
    const requestId = resolveSyncRequestId(req.get("Idempotency-Key"), rawPatch.requestId, bodyPresent);
    const clientPatch = removeClientLicensePatch(stripSyncTransportFields(rawPatch));
    const patch = clientPatch.patch;
    if (clientPatch.attempted) {
      logTechnical("warn", "client_license_update_ignored", {
        companyId: req.user?.companyId || "",
        userId: req.user?.id || ""
      });
    }
    const hasChanges = ["sales", "products", "inventoryMovements", "auditLogs", "guides", "cashClosings", "creditPayments", "creditAdjustments", "clients", "users", "receivedRetentions"].some((field) => Array.isArray(patch[field]) && patch[field].length > 0);
    const hasDeletions = Object.values(patch.deletions || {}).some((ids) => Array.isArray(ids) && ids.length > 0);
    if (!hasChanges && !hasDeletions && !patch.issuer && !patch.license) {
      res.status(400).json({ error: "Debe enviar al menos un cambio incremental." });
      return;
    }

    const result = await mergeSnapshotPatch(patch, req.user?.companyId, requestId ? {
      requestId,
      payloadHash: hashSyncPayload(patch),
      operationType: "SYNC_MERGE",
      operationId: null
    } : null, {
      userId: req.user?.sub || req.user?.id || null
    });
    logTechnical("info", "sync_merge_applied", {
      companyId: req.user?.companyId || "",
      userId: req.user?.id || "",
      sales: patch.sales?.length || 0,
      guides: patch.guides?.length || 0,
      creditPayments: patch.creditPayments?.length || 0,
      creditAdjustments: patch.creditAdjustments?.length || 0,
      receivedRetentions: patch.receivedRetentions?.length || 0,
      cashClosings: patch.cashClosings?.length || 0,
      legacySync: !requestId,
      summary: result.summary || null
    });
    if (result.automaticEmailOperations?.created > 0) documentEmailWorker?.wake();
    res.json(result);
  } catch (error) {
    if (error?.code === "SYNC_REQUEST_ID_INVALID" || error?.code === "SYNC_REQUEST_ID_CONFLICT") {
      res.status(400).json({ error: error.message, code: error.code });
      return;
    }
    if (error?.code === "SYNC_OPERATION_MISMATCH") {
      res.status(409).json({ error: error.message, code: error.code, requestId: error.requestId });
      return;
    }
    if (["INVALID_DOMAIN_OPERATION_ID", "INVALID_DOMAIN_OPERATION_TYPE", "INVALID_BATCH_OPERATION_ID"].includes(error?.code)) {
      res.status(400).json({
        error: error.message,
        message: error.message,
        code: error.code,
        operationType: error.operationType,
        operationId: error.operationId,
        entityId: error.entityId
      });
      return;
    }
    if (["DOMAIN_OPERATION_MISMATCH", "DOMAIN_ENTITY_OPERATION_CONFLICT"].includes(error?.code)) {
      res.status(409).json({
        error: error.message,
        message: error.message,
        code: error.code,
        operationType: error.operationType,
        operationId: error.operationId,
        entityId: error.entityId
      });
      return;
    }
    next(error);
  }
});

app.get("/api/audit", requireAuth(["admin"]), async (_req, res, next) => {
  try {
    res.json({ ok: true, audit: await getAudit() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/backups/postgres", requireAuth(["admin"]), async (_req, res, next) => {
  try {
    res.json({ ok: true, backups: getBackupStatus() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/backups/postgres", requireAuth(["admin"]), async (_req, res, next) => {
  try {
    res.json({ ok: true, backup: await runPostgresBackup("manual-api") });
  } catch (error) {
    next(error);
  }
});

app.get("/api/support/logs", requireAuth(["admin"]), async (req, res, next) => {
  try {
    res.json({ ok: true, logs: listTechnicalLogs(req.query.limit) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/products/:productId/image", requireAuth(["admin", "vendedor"]), requireProductsLicense, async (req, res, next) => {
  try {
    const companyId = req.user?.companyId || "";
    if (!companyId) return res.status(400).json({ error: "Esta funcion requiere una empresa SaaS." });
    const snapshot = await getSnapshot(companyId);
    const productId = String(req.params.productId || "");
    if (!snapshot?.data?.products?.some((product) => product.id === productId)) return res.status(404).json({ error: "Producto no encontrado en esta empresa." });
    const result = await saveTenantProductImage(companyId, productId, req.body || {});
    logTechnical("info", "tenant_product_image_uploaded", { companyId, productId, size: result.size, thumbnailSize: result.thumbnailSize });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/products/:productId/image", requireAuth(["admin", "vendedor", "cajero", "contador"]), requireProductsLicense, async (req, res, next) => {
  try {
    const companyId = req.user?.companyId || "";
    if (!companyId) return res.status(400).json({ error: "Esta funcion requiere una empresa SaaS." });
    const productId = String(req.params.productId || "");
    const image = getTenantProductImage(companyId, productId, String(req.query.variant || "image"), String(req.query.v || ""));
    if (!image) return res.status(404).send("Imagen no configurada.");
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    if (String(req.query.encoding || "") === "base64") {
      return res.json({ ok: true, mimeType: image.mimeType, base64: image.buffer().toString("base64") });
    }
    res.type(image.mimeType).sendFile(image.filePath);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/products/:productId/image", requireAuth(["admin", "vendedor"]), requireProductsLicense, async (req, res, next) => {
  try {
    const companyId = req.user?.companyId || "";
    if (!companyId) return res.status(400).json({ error: "Esta funcion requiere una empresa SaaS." });
    const snapshot = await getSnapshot(companyId);
    const productId = String(req.params.productId || "");
    if (!snapshot?.data?.products?.some((product) => product.id === productId)) return res.status(404).json({ error: "Producto no encontrado en esta empresa." });
    res.json(removeTenantProductImage(companyId, productId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/facturas/consultar-autorizacion", requireAuth(["admin", "vendedor", "cajero", "contador"]), requireSriLicense, async (req, res, next) => {
  try {
    const accessKey = String(req.body?.accessKey || "").trim();
    if (!/^\d{49}$/.test(accessKey)) {
      res.status(400).json({ error: "La clave de acceso debe contener exactamente 49 digitos." });
      return;
    }

    const companyId = req.user?.companyId || "";
    const storedDocument = await findDocumentByAccessKey(companyId, accessKey);
    if (!storedDocument || storedDocument.type !== "sale" || !storedDocument.payload) {
      res.status(404).json({ error: "No existe un comprobante de esta empresa con la clave indicada." });
      return;
    }
    const document = storedDocument.payload;
    if (document.status === "AUTORIZADA") {
      res.json({
        ok: true,
        sent: true,
        status: "AUTORIZADO",
        accessKey,
        authorizationStatus: "AUTORIZADO",
        authorizationNumber: document.authorizationNumber || accessKey,
        authorizationDate: document.authorizationDate,
        sriEnvironment: document.sriEnvironment,
        sriMessage: document.sriMessage,
        authorizedXml: document.authorizedXml
      });
      return;
    }
    if (!["ENVIADA", "ENVIADA_SRI"].includes(document.status)) {
      res.status(409).json({ error: "El comprobante aun no consta como enviado a recepcion SRI." });
      return;
    }

    const canonical = await getCompanySriEnvironment?.(companyId);
    const keyEnvironment = accessKey[23];
    if (!canonical || canonical.environment !== keyEnvironment) {
      res.status(409).json({ error: "El ambiente de la clave no coincide con el ambiente SRI vigente de la empresa." });
      return;
    }
    const sriEnv = keyEnvironment === "2" ? "production" : "test";
    const result = await queryInvoiceAuthorization(accessKey, sriEnv);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/documents/ride", requireAuth(["admin", "vendedor", "cajero"]), requireSalesLicense, async (req, res, next) => {
  try {
    const companyId = req.user?.companyId || "";
    const snapshot = await getSnapshot(companyId);
    if (!snapshot?.data) {
      res.status(404).json({ error: "No se encontro la informacion de la empresa." });
      return;
    }
    const operation = buildManualRideOperation(companyId, snapshot.data, req.body || {});
    const ride = await buildDocumentRide(operation);
    logTechnical("info", "document_ride_generated", {
      companyId,
      documentType: operation.documentType,
      documentId: operation.documentId,
      size: ride.size
    });
    res.json({
      ok: true,
      filename: ride.filename,
      mimeType: ride.contentType,
      pdfBase64: ride.content.toString("base64")
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/documents/history", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
  const companyId = String(req.user?.companyId || "");
  try {
    const access = await historicalDocumentAccessForRequest(req);
    if (!access.enabled || !maximumDocumentHistorySequence || !listDocumentHistoryPage) {
      logTechnical("info", "historical_documents_page_failed", { companyId, result: access.reason || "REPOSITORY_UNAVAILABLE" });
      res.status(404).json({
        ok: false,
        error: {
          code: historicalDocumentAccessError(access.reason),
          reason: access.reason || "REPOSITORY_UNAVAILABLE"
        }
      });
      return;
    }
    enforceRateLimit(
      historicalDocumentsRate,
      `${companyId}:${req.user?.sub || req.user?.id || ""}:${String(req.get("X-Device-Id") || "").toLowerCase()}`,
      config.historicalDocumentPagination.rateLimitPerMinute,
      "HISTORICAL_DOCUMENTS_RATE_LIMITED"
    );
    logTechnical("info", "historical_documents_page_requested", { companyId, result: "started" });
    const snapshot = await getSnapshot(companyId);
    const result = await historicalDocumentsPage({
      maximumSequence: maximumDocumentHistorySequence,
      listPage: listDocumentHistoryPage
    }, {
      companyId,
      defaultEnvironment: String(snapshot?.data?.issuer?.environment || "1"),
      config: config.historicalDocumentPagination,
      query: req.query || {}
    });
    res.json(result);
  } catch (error) {
    if (String(error.code || "").startsWith("HISTORICAL_DOCUMENTS_")) {
      logTechnical("warn", historyMetricForError(error.code), { companyId, result: error.code });
      res.status(error.statusCode || 400).json({ ok: false, error: { code: error.code, ...error.details } });
      return;
    }
    next(error);
  }
});

app.get("/api/sync/diagnostic/pull", requireAuth(["admin"]), async (req, res, next) => {
  const companyId = String(req.user?.companyId || "");
  const userId = String(req.user?.sub || req.user?.id || "");
  try {
    enforceDiagnosticPullRateLimit(`${companyId}:${userId}`, config.incrementalSyncPullDiagnostic.rateLimitPerMinute);
    if (!maximumSyncChangeSequence || !listDiagnosticSyncChanges) {
      const error = new Error("SYNC_PULL_DISABLED"); error.code = "SYNC_PULL_DISABLED"; error.statusCode = 404; throw error;
    }
    const result = await diagnosticPull({
      maximumSequence: maximumSyncChangeSequence,
      listChanges: listDiagnosticSyncChanges
    }, {
      config: config.incrementalSyncPullDiagnostic,
      companyId,
      cursor: req.query.cursor,
      limit: req.query.limit,
      modules: req.query.modules
    });
    res.json(result);
  } catch (error) {
    if (String(error.code || "").startsWith("SYNC_")) {
      const diagnosticEvent = error.code === "SYNC_PULL_RATE_LIMITED"
        ? "sync_diagnostic_rate_limited_total"
        : error.code === "SYNC_CURSOR_EXPIRED"
          ? "sync_diagnostic_cursor_expired_total"
          : error.code?.startsWith("SYNC_CURSOR_")
            ? "sync_diagnostic_cursor_invalid_total"
            : error.details?.reason === "COMPANY_REJECTED"
              ? "sync_diagnostic_company_rejected_total"
              : "sync_diagnostic_pull_failed_total";
      logTechnical("warn", diagnosticEvent, {
        companyId, result: error.code, environment: config.incrementalSyncPullDiagnostic.environment
      });
      res.status(error.statusCode || 400).json({ ok: false, error: { code: error.code, ...error.details }, requiresFullSnapshot: error.code === "SYNC_CURSOR_EXPIRED" });
      return;
    }
    next(error);
  }
});

app.get("/api/sync/capabilities", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
  try {
    const access = await incrementalPilotAccessForRequest(req);
    logTechnical("info", "sync_incremental_pilot_capability", { companyId: req.user?.companyId || "", result: access.reason, platform: access.platform });
    res.json({ ok: true, syncProtocolVersion: access.protocolVersion, incrementalSyncEnabled: access.enabled, modules: access.modules, snapshotFallbackAvailable: true, configVersion: config.incrementalSyncPilot.configVersion || null, reason: access.reason });
  } catch (error) { next(error); }
});

app.get("/api/sync/bootstrap", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
  try {
    enforceDiagnosticPullRateLimit(`pilot-bootstrap:${req.user?.companyId}:${req.user?.sub || req.user?.id}`, config.incrementalSyncPilot.rateLimitPerMinute);
    const access = await incrementalPilotAccessForRequest(req);
    if (!access.enabled || !getIncrementalPilotBootstrap) {
      res.status(404).json({ ok: false, error: { code: "SYNC_PULL_DISABLED", reason: access.reason } }); return;
    }
    const entityTypes = [access.modules.clients ? "client" : null, access.modules.products ? "product" : null, access.modules.guides ? "remission_guide" : null].filter(Boolean);
    const bootstrap = await getIncrementalPilotBootstrap(req.user.companyId, entityTypes);
    if (!bootstrap) { res.status(404).json({ ok: false, error: { code: "SYNC_SNAPSHOT_NOT_FOUND" } }); return; }
    const cursorData = { ...initialCursor(req.user.companyId, bootstrap.watermark, config.incrementalSyncPilot, access.protocolVersion), lastChangeSeq: bootstrap.watermark };
    res.json({ ok: true, protocolVersion: access.protocolVersion, mode: "pilot", snapshot: { data: bootstrap.data, updatedAt: bootstrap.updatedAt }, snapshotRevision: bootstrap.watermark, cursor: encodeCursor(cursorData, config.incrementalSyncPilot.cursorSecret), versions: bootstrap.versions, modules: access.modules });
  } catch (error) { next(error); }
});

app.get("/api/sync/pull", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
  try {
    enforceDiagnosticPullRateLimit(`pilot-pull:${req.user?.companyId}:${req.user?.sub || req.user?.id}`, config.incrementalSyncPilot.rateLimitPerMinute);
    const access = await incrementalPilotAccessForRequest(req);
    if (!access.enabled) { res.status(404).json({ ok: false, error: { code: "SYNC_PULL_DISABLED", reason: access.reason } }); return; }
    if (!req.query.cursor) { res.status(409).json({ ok: false, error: { code: "SYNC_BOOTSTRAP_REQUIRED" }, requiresFullSnapshot: true }); return; }
    const entityTypes = [access.modules.clients ? "client" : null, access.modules.products ? "product" : null, access.modules.guides ? "remission_guide" : null].filter(Boolean);
    const result = await diagnosticPull({ maximumSequence: maximumSyncChangeSequence, listChanges: listDiagnosticSyncChanges }, {
      config: config.incrementalSyncPilot, companyId: req.user.companyId, cursor: req.query.cursor,
      limit: req.query.limit, accessGranted: true, mode: "pilot", entityTypes,
      rollingWatermark: true, advanceToWatermarkWhenExhausted: true, protocolVersion: access.protocolVersion
    });
    res.json({ ...result, modules: access.modules });
  } catch (error) {
    if (String(error.code || "").startsWith("SYNC_")) { res.status(error.statusCode || 400).json({ ok: false, error: { code: error.code, ...error.details }, requiresFullSnapshot: ["SYNC_CURSOR_EXPIRED", "SYNC_CURSOR_INVALID", "SYNC_CURSOR_PROTOCOL_UNSUPPORTED"].includes(error.code) }); return; }
    next(error);
  }
});

app.get("/api/admin/email-operations", requireAuth(["admin"]), async (req, res, next) => {
  try {
    if (!documentEmailRepository) {
      res.status(503).json({ error: "La cola durable de correos requiere PostgreSQL." });
      return;
    }
    const status = String(req.query.status || "").trim().toLowerCase();
    if (status && !["pending", "processing", "accepted", "failed", "uncertain"].includes(status)) {
      res.status(400).json({ error: "El estado de la operacion de correo no es valido." });
      return;
    }
    const operations = await documentEmailRepository.listOperations(req.user?.companyId || "", {
      status,
      limit: req.query.limit
    });
    res.json({ ok: true, operations });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/email-operations/:operationId/retry", requireAuth(["admin"]), async (req, res, next) => {
  try {
    if (!documentEmailRepository) {
      res.status(503).json({ error: "La cola durable de correos requiere PostgreSQL." });
      return;
    }
    const operation = await documentEmailRepository.retryOperation(
      req.user?.companyId || "",
      req.params.operationId,
      req.user?.id || req.user?.email || "admin"
    );
    documentEmailWorker?.wake();
    res.json({
      ok: true,
      operation: {
        id: operation.id,
        documentType: operation.documentType,
        documentId: operation.documentId,
        origin: operation.origin,
        status: operation.status,
        attempts: operation.attempts,
        smtpMessageId: operation.smtpMessageId
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, _next) => {
  errorLogger(error, req);
  console.error(error);
  const statusCode = error.statusCode || 500;
  const payload = {
    error: publicErrorMessage(error, statusCode),
    ...(error.code ? { code: error.code } : {})
  };
  if (Array.isArray(error.companyOptions)) {
    payload.companyOptions = error.companyOptions;
  }
  if (error.assessment && typeof error.assessment === "object") {
    payload.assessment = error.assessment;
  }
  res.status(statusCode).json(payload);
});

function publicErrorMessage(error, statusCode) {
  const message = String(error?.message || "");
  if (statusCode < 500) return message || "Solicitud invalida.";

  const normalized = message.toLowerCase();
  const databaseAuthError =
    normalized.includes("postgres") ||
    normalized.includes("password authentication") ||
    (normalized.includes("password") && normalized.includes("fall")) ||
    (normalized.includes("autent") && normalized.includes("fall"));

  if (databaseAuthError) {
    return "El servidor no pudo conectar con la base de datos configurada. Revise DATABASE_URL y reinicie el backend.";
  }

  return "Error interno del backend. Revise los logs tecnicos para soporte.";
}

async function authorizeSriDocumentOnce(companyId = "", xml = "", runAuthorization) {
  const accessKey = extractAccessKeyFromXml(xml);
  if (!accessKey) return runAuthorization();

  const lockKey = `${companyId || "legacy"}:${accessKey}`;
  const storedResult = await storedAuthorizationResponse(companyId, accessKey);
  if (storedResult) return storedResult;

  const cachedResult = cachedAuthorizationResponse(lockKey);
  if (cachedResult) return cachedResult;

  if (sriAuthorizationLocks.has(lockKey)) {
    const error = new Error("Este comprobante ya se esta enviando al SRI. Espere unos segundos y consulte el estado antes de reintentar.");
    error.statusCode = 409;
    throw error;
  }

  sriAuthorizationLocks.set(lockKey, Date.now());
  try {
    const result = await runAuthorization();
    cacheAuthorizedResult(lockKey, result);
    return result;
  } finally {
    sriAuthorizationLocks.delete(lockKey);
  }
}

async function storedAuthorizationResponse(companyId, accessKey) {
  if (typeof findDocumentByAccessKey !== "function") return null;
  const stored = await findDocumentByAccessKey(companyId, accessKey);
  const document = stored?.payload || null;
  if (!document || document.status !== "AUTORIZADA") return null;

  return {
    ok: true,
    sent: false,
    status: "AUTORIZADA_LOCAL",
    accessKey,
    signedXml: document.signedXml || "",
    authorizationStatus: "AUTORIZADO",
    authorizationNumber: document.authorizationNumber || accessKey,
    authorizationDate: document.authorizationDate || "",
    sriEnvironment: document.sriEnvironment || "",
    authorizedXml: document.authorizedXml || "",
    sriMessage: "Comprobante ya autorizado en la base de datos. No se reenvio al SRI."
  };
}

function cachedAuthorizationResponse(lockKey) {
  const cached = sriAuthorizationCache.get(lockKey);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > SRI_AUTHORIZATION_CACHE_TTL_MS) {
    sriAuthorizationCache.delete(lockKey);
    return null;
  }
  return {
    ...cached.result,
    sent: false,
    status: cached.result.status || "AUTORIZADA_CACHE",
    sriMessage: [cached.result.sriMessage, "Respuesta reutilizada temporalmente. No se reenvio al SRI."].filter(Boolean).join(" | ")
  };
}

function cacheAuthorizedResult(lockKey, result) {
  const authorized = result?.authorizationStatus === "AUTORIZADO" || String(result?.authorizedXml || "").includes("<estado>AUTORIZADO</estado>");
  if (!authorized) return;
  sriAuthorizationCache.set(lockKey, {
    createdAt: Date.now(),
    result: { ...result }
  });
}

function extractAccessKeyFromXml(xml) {
  const match = String(xml || "").match(/<claveAcceso>([^<]+)<\/claveAcceso>/);
  return match ? match[1].trim() : "";
}

function validateIssuerForSequence(issuer) {
  const errors = [];
  if (!issuer || typeof issuer !== "object") errors.push("Debe enviar issuer.");
  if (!/^\d{13}$/.test(String(issuer?.ruc || ""))) errors.push("RUC emisor invalido.");
  if (!/^\d{3}$/.test(String(issuer?.establishment || ""))) errors.push("Establecimiento invalido.");
  if (!/^\d{3}$/.test(String(issuer?.emissionPoint || ""))) errors.push("Punto de emision invalido.");
  if (!["1", "2"].includes(String(issuer?.environment || ""))) errors.push("Ambiente invalido.");
  return errors;
}

async function validateEmissionPointAllowed(companyId, issuer) {
  const snapshot = await getSnapshot(companyId);
  const status = licenseStatus(snapshot?.data || {});
  const limit = maxEmissionPointsForLicense(status);
  const requested = `${String(issuer?.environment || "1")}-${String(issuer?.establishment || "")}-${String(issuer?.emissionPoint || "")}`;
  const allowed = allowedEmissionScopes(snapshot?.data?.issuer || {}, limit);
  if (allowed.has(requested)) return "";
  return `Su plan actual permite ${limit} punto(s) de emision. Actualice a Pro para usar ${issuer?.establishment}-${issuer?.emissionPoint}.`;
}

function allowedEmissionScopes(issuer, limit) {
  const scopes = [];
  const establishments = Array.isArray(issuer?.establishments) && issuer.establishments.length > 0
    ? issuer.establishments
    : [{ establishment: issuer?.establishment || "001", emissionPoint: issuer?.emissionPoint || "001", active: true }];
  for (const item of establishments) {
    if (item?.active === false) continue;
    scopes.push(`${String(issuer?.environment || "1")}-${String(item?.establishment || "")}-${String(item?.emissionPoint || "")}`);
  }
  return new Set(scopes.slice(0, limit));
}

function maxEmissionPointsForLicense(license = {}) {
  if (license?.plan === "trial" || String(license?.plan || "").startsWith("pro_") || String(license?.plan || "").startsWith("premium_") || license?.plan === "pro") {
    return Math.max(1, Number(license?.maxEmissionPoints || (license?.plan === "trial" ? 3 : 999)));
  }
  return 1;
}

function validateRegistration(company, admin) {
  const errors = [];
  const ruc = normalizeDigits(company?.ruc);
  const businessName = String(company?.businessName || "").trim();
  const email = String(admin?.email || "").trim().toLowerCase();
  const password = String(admin?.password || "");
  const name = String(admin?.name || "").trim();
  if (!/^\d{13}$/.test(ruc) || !ruc.endsWith("001")) errors.push("Ingrese un RUC de 13 digitos terminado en 001 para la empresa.");
  if (businessName.length < 3) errors.push("Ingrese el nombre de la empresa.");
  if (name.length < 2) errors.push("Ingrese el nombre del administrador.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Ingrese un correo valido.");
  if (password.length < 8) errors.push("La contrasena debe tener al menos 8 caracteres.");
  return errors;
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidEcuadorCedula(value) {
  if (!/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  const thirdDigit = Number(value[2]);
  if (!((province >= 1 && province <= 24) || province === 30) || thirdDigit >= 6) return false;

  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const total = coefficients.reduce((sum, coefficient, index) => {
    const multiplied = Number(value[index]) * coefficient;
    return sum + (multiplied > 9 ? multiplied - 9 : multiplied);
  }, 0);
  const verifier = total % 10 === 0 ? 0 : 10 - (total % 10);
  return verifier === Number(value[9]);
}

function isValidEcuadorRuc(value) {
  if (!/^\d{13}$/.test(value) || !value.endsWith("001")) return false;
  const thirdDigit = Number(value[2]);

  if (thirdDigit < 6) return isValidEcuadorCedula(value.slice(0, 10));
  if (thirdDigit === 6) return validateMod11(value, [3, 2, 7, 6, 5, 4, 3, 2], 8);
  if (thirdDigit === 9) return validateMod11(value, [4, 3, 2, 7, 6, 5, 4, 3, 2], 9);

  return false;
}

function validateMod11(value, coefficients, verifierIndex) {
  const total = coefficients.reduce((sum, coefficient, index) => sum + Number(value[index]) * coefficient, 0);
  const remainder = total % 11;
  const verifier = remainder === 0 ? 0 : 11 - remainder;
  return verifier === Number(value[verifierIndex]);
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, 2)}***@${domain}`;
}

async function getCompanyEmailContext(user = {}) {
  const snapshot = await getSnapshot(user.companyId || "");
  const issuer = snapshot?.data?.issuer || {};
  const users = Array.isArray(snapshot?.data?.users) ? snapshot.data.users : [];
  const admin = users.find((item) => item?.role === "admin" && item?.email) || users.find((item) => item?.email);
  return {
    senderName: issuer.tradeName || issuer.businessName || user.name || "Facturacion electronica",
    replyTo: issuer.email || admin?.email || user.email || ""
  };
}

const httpServer = app.listen(config.port, async () => {
  console.log(`Backend SRI listo en http://localhost:${config.port}`);
  cleanupTechnicalLogs();
  startBackupScheduler();
  try {
    if (db.initialize) await db.initialize();
    if (db.engine === "postgres") {
      documentEmailRepository = createDocumentEmailQueueRepository({ connectionString: config.databaseUrl });
      documentEmailWorker = createDocumentEmailWorker({ repository: documentEmailRepository });
      documentEmailWorker.start();
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "email_queue_failed",
      errorCode: "WORKER_START_FAILED",
      message: String(error?.message || error || "No se pudo iniciar el trabajador.")
    }));
  }
});

function shutdown(signal) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    console.log(JSON.stringify({ event: "backend_shutdown", signal }));
    stopBackupScheduler();
    if (documentEmailWorker) await documentEmailWorker.stop();
    await new Promise((resolve) => httpServer.close(resolve));
    if (db.close) await db.close();
  })().catch((error) => {
    console.error(JSON.stringify({ event: "backend_shutdown_failed", message: String(error?.message || error) }));
    process.exitCode = 1;
  });
  return shutdownPromise;
}

function syncPatchFeatures(patch = {}) {
  const featureByCollection = {
    sales: "sales",
    products: "products",
    inventoryMovements: "inventory",
    guides: "guides",
    cashClosings: "cash",
    creditPayments: "credits",
    creditAdjustments: "credits",
    clients: "clients",
    users: "users",
    receivedRetentions: "documents"
  };
  const features = [];
  for (const [collection, feature] of Object.entries(featureByCollection)) {
    if (Array.isArray(patch[collection]) && patch[collection].length > 0) features.push(feature);
    if (Array.isArray(patch.deletions?.[collection]) && patch.deletions[collection].length > 0) features.push(feature);
  }
  if (patch.issuer) features.push("sri");
  return features;
}

function enforceDiagnosticPullRateLimit(key, limit) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const current = diagnosticPullRate.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    diagnosticPullRate.set(key, { startedAt: now, count: 1 });
    return;
  }
  if (current.count >= limit) {
    const error = new Error("SYNC_PULL_RATE_LIMITED");
    error.code = "SYNC_PULL_RATE_LIMITED";
    error.statusCode = 429;
    throw error;
  }
  current.count += 1;
}

async function incrementalPilotAccessForRequest(req) {
  const companyId = String(req.user?.companyId || "").toLowerCase();
  const userId = String(req.user?.sub || req.user?.id || "").toLowerCase();
  const deviceId = String(req.get("X-Device-Id") || "").trim().toLowerCase();
  const context = {
    companyId,
    userId,
    deviceId,
    platform: String(req.get("X-Platform") || "").trim().toLowerCase(),
    appVersion: String(req.get("X-App-Version") || "").trim(),
    protocolVersion: Number(req.get("X-Sync-Protocol-Version") || 0),
    deviceTrusted: isIncrementalPilotDeviceTrusted
      ? await isIncrementalPilotDeviceTrusted({ companyId, userId, deviceId })
      : false
  };
  const access = evaluateIncrementalPilotAccess(config.incrementalSyncPilot, context);
  return { ...access, platform: context.platform };
}

async function historicalDocumentAccessForRequest(req) {
  const companyId = String(req.user?.companyId || "").toLowerCase();
  const userId = String(req.user?.sub || req.user?.id || "").toLowerCase();
  const deviceId = String(req.get("X-Device-Id") || "").trim().toLowerCase();
  const context = {
    companyId,
    userId,
    deviceId,
    platform: String(req.get("X-Platform") || "").trim().toLowerCase(),
    appVersion: String(req.get("X-App-Version") || "").trim(),
    protocolVersion: Number(req.get("X-Historical-Documents-Protocol-Version") || 0),
    deviceTrusted: isIncrementalPilotDeviceTrusted
      ? await isIncrementalPilotDeviceTrusted({ companyId, userId, deviceId })
      : false
  };
  return evaluateDocumentHistoryAccess(config.historicalDocumentPagination, context);
}

function enforceRateLimit(store, key, limit, code) {
  const now = Date.now();
  const current = store.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    store.set(key, { startedAt: now, count: 1 });
    return;
  }
  if (current.count >= limit) {
    const error = new Error(code);
    error.code = code;
    error.statusCode = 429;
    throw error;
  }
  current.count += 1;
}

function requirePasskeyRateLimit(req, _res, next) {
  try {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const key = forwarded || req.socket?.remoteAddress || "unknown";
    enforceRateLimit(passkeyRate, key, 20, "PASSKEY_RATE_LIMITED");
    next();
  } catch (error) {
    next(error);
  }
}

function requireDeviceSessionRateLimit(req, _res, next) {
  try {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const key = forwarded || req.socket?.remoteAddress || "unknown";
    enforceRateLimit(deviceSessionRate, key, 30, "DEVICE_SESSION_RATE_LIMITED");
    next();
  } catch (error) {
    next(error);
  }
}

function requireLoginRateLimit(req, _res, next) {
  try {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ip = forwarded || req.socket?.remoteAddress || "unknown";
    const identifier = String(req.body?.identifier || req.body?.email || "").trim().toLowerCase();
    enforceRateLimit(loginRate, `${ip}:${identifier}`, 15, "LOGIN_RATE_LIMITED");
    next();
  } catch (error) {
    next(error);
  }
}

function deviceSessionUnavailable() {
  const error = new Error("DEVICE_SESSIONS_UNAVAILABLE");
  error.code = "DEVICE_SESSIONS_UNAVAILABLE";
  error.statusCode = 503;
  return error;
}

function requireRecentAuthentication(req, _res, next) {
  const issuedAt = Number(req.user?.iat || 0);
  const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
  if (!issuedAt || ageSeconds < 0 || ageSeconds > 15 * 60) {
    const error = new Error("Por seguridad, cierre sesion e ingrese nuevamente antes de cambiar Face ID.");
    error.statusCode = 401;
    next(error);
    return;
  }
  next();
}

function historyMetricForError(code) {
  if (code === "HISTORICAL_DOCUMENTS_CURSOR_INVALID") return "historical_documents_cursor_invalid";
  if (code === "HISTORICAL_DOCUMENTS_CURSOR_EXPIRED") return "historical_documents_cursor_expired";
  if (code === "HISTORICAL_DOCUMENTS_QUERY_TIMEOUT") return "historical_documents_query_timeout";
  return "historical_documents_page_failed";
}

function historicalDocumentAccessError(reason) {
  const errors = {
    GLOBAL_DISABLED: "FEATURE_DISABLED",
    INVALID_MODE: "FEATURE_DISABLED",
    INVALID_CONFIG_VERSION: "FEATURE_DISABLED",
    ENVIRONMENT_REJECTED: "FEATURE_DISABLED",
    COMPANY_REJECTED: "COMPANY_NOT_ALLOWED",
    PLATFORM_REJECTED: "PLATFORM_NOT_ALLOWED",
    PROTOCOL_REJECTED: "PROTOCOL_UNSUPPORTED",
    APP_VERSION_REJECTED: "APP_VERSION_NOT_ALLOWED",
    DEVICE_UNTRUSTED: "DEVICE_NOT_ALLOWED",
    DEVICE_REJECTED: "DEVICE_NOT_ALLOWED",
    USER_REJECTED: "USER_NOT_ALLOWED"
  };
  return errors[reason] || "FEATURE_DISABLED";
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
if (process.send) {
  process.once("message", (message) => {
    if (message === "shutdown") void shutdown("IPC");
  });
}
