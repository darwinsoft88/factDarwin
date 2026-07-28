const cors = require("cors");
const crypto = require("node:crypto");
const express = require("express");
const fs = require("node:fs");
const config = require("./config");
const db = require("./db");
const { authenticateCompanyUser, authenticateSupportUser, changeCompanyUserPassword, createCompanyAccount, exportTenantSnapshot, findDocumentByAccessKey, getAudit, getSnapshot, listGuidesHistory, listSalesHistory, listTenantAccounts, mergeSnapshotPatch, reserveDocumentSequence, resetCompanyUserPassword, restoreTenantSnapshot, saveSnapshot, searchClients, searchProducts } = db;
const { authenticateUser, hashPassword, requireAuth, signToken } = require("./auth");
const { sendInvoiceEmail, sendPasswordResetEmail, sendTestEmail } = require("./email");
const { licenseStatus, normalizeLicense, requireActiveLicense } = require("./license");
const { renderMasterPanel } = require("./master-panel");
const { getBackupStatus, runPostgresBackup, startBackupScheduler, stopBackupScheduler } = require("./postgres-backup");
const { lookupIdentification } = require("./datos-service");
const { createAccessKey, nextSequence } = require("./sri/access-key");
const { authorizeInvoice, signInvoice } = require("./sri/invoices");
const { getTenantAssetStatus, getTenantLogo, saveTenantCertificate, saveTenantLogo } = require("./tenant-assets");
const { cleanupTechnicalLogs, errorLogger, listTechnicalLogs, logTechnical, requestLogger } = require("./technical-logs");
const { hashSyncPayload, resolveSyncRequestId, stripSyncTransportFields } = require("./db-utils");
const { createDocumentEmailWorker } = require("./document-email-worker");
const { createCorsOptions } = require("./cors-policy");

const app = express();
let documentEmailWorker = null;
let shutdownPromise = null;
const sriAuthorizationLocks = new Map();
const sriAuthorizationCache = new Map();
const SRI_AUTHORIZATION_CACHE_TTL_MS = 10 * 60 * 1000;

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
  res.type("html").send(renderMasterPanel());
});

app.get("/api/master/license", requireMasterKey, async (_req, res, next) => {
  try {
    const snapshot = await getSnapshot();
    res.json({
      ok: true,
      license: licenseStatus(snapshot?.data || {}),
      summary: snapshot?.summary || null,
      updatedAt: snapshot?.updatedAt || ""
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/master/license", requireMasterKey, async (req, res, next) => {
  try {
    const snapshot = await getSnapshot();
    if (!snapshot?.data) {
      res.status(409).json({ error: "Primero suba una copia desde la app para crear la base inicial del cliente." });
      return;
    }

    const license = normalizeLicense(req.body?.license);
    const result = await saveSnapshot({ ...snapshot.data, license });
    logTechnical("info", "master_license_updated", { license: licenseStatus({ license }), summary: result.summary });
    res.json({ ok: true, license: licenseStatus({ license }), updatedAt: result.updatedAt, summary: result.summary });
  } catch (error) {
    next(error);
  }
});

app.get("/api/master/tenants", requireMasterKey, async (_req, res, next) => {
  try {
    if (!listTenantAccounts) {
      res.json({ ok: true, tenants: [] });
      return;
    }
    const tenants = await listTenantAccounts();
    res.json({
      ok: true,
      tenants: tenants.map((tenant) => ({
        ...tenant,
        license: licenseStatus({ license: tenant.license })
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/master/tenants/:companyId", requireMasterKey, async (req, res, next) => {
  try {
    const snapshot = await getSnapshot(req.params.companyId);
    if (!snapshot?.data) {
      res.status(404).json({ error: "Empresa no encontrada." });
      return;
    }
    res.json({
      ok: true,
      companyId: req.params.companyId,
      license: licenseStatus(snapshot.data),
      summary: snapshot.summary || null,
      updatedAt: snapshot.updatedAt || ""
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/master/tenants/:companyId/export", requireMasterKey, async (req, res, next) => {
  try {
    if (!exportTenantSnapshot) {
      res.status(501).json({ error: "Exportacion por empresa solo disponible en PostgreSQL." });
      return;
    }
    const backup = await exportTenantSnapshot(req.params.companyId);
    logTechnical("info", "tenant_exported", { companyId: req.params.companyId, summary: backup.snapshot?.summary || null });
    res.setHeader("Content-Disposition", `attachment; filename="${tenantBackupFilename(backup)}"`);
    res.json({ ok: true, backup });
  } catch (error) {
    next(error);
  }
});

app.post("/api/master/tenants/:companyId/restore", requireMasterKey, async (req, res, next) => {
  try {
    if (!restoreTenantSnapshot) {
      res.status(501).json({ error: "Restauracion por empresa solo disponible en PostgreSQL." });
      return;
    }
    const backup = req.body?.backup;
    const confirmRuc = String(req.body?.confirmRuc || "").trim();
    if (!backup || typeof backup !== "object") {
      res.status(400).json({ error: "Debe enviar el backup JSON de la empresa." });
      return;
    }
    if (!confirmRuc) {
      res.status(400).json({ error: "Debe confirmar el RUC antes de restaurar." });
      return;
    }
    const preBackup = await runPostgresBackup("pre-tenant-restore");
    const restore = await restoreTenantSnapshot(req.params.companyId, backup, { expectedRuc: confirmRuc });
    logTechnical("warn", "tenant_restored", { companyId: req.params.companyId, summary: restore.summary, preBackup });
    res.json({ ok: true, restore, preBackup });
  } catch (error) {
    next(error);
  }
});

app.put("/api/master/tenants/:companyId/license", requireMasterKey, async (req, res, next) => {
  try {
    const snapshot = await getSnapshot(req.params.companyId);
    if (!snapshot?.data) {
      res.status(404).json({ error: "Empresa no encontrada." });
      return;
    }

    const license = normalizeLicense(req.body?.license);
    const result = await saveSnapshot({ ...snapshot.data, license }, req.params.companyId);
    logTechnical("info", "tenant_license_updated", { companyId: req.params.companyId, license: licenseStatus({ license }), summary: result.summary });
    res.json({ ok: true, companyId: req.params.companyId, license: licenseStatus({ license }), updatedAt: result.updatedAt, summary: result.summary });
  } catch (error) {
    next(error);
  }
});

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
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password, device = {}, companyId = "" } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: "Debe enviar email y password." });
      return;
    }

    let saasUser = authenticateSupportUser ? await authenticateSupportUser(email, String(password || ""), device, companyId) : null;
    try {
      saasUser = saasUser || (authenticateCompanyUser ? await authenticateCompanyUser(email, String(password || ""), device, companyId) : null);
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
    res.json({ ok: true, documentType, sequence, accessKey });
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
    const { to, subject, html, xml, pdfBase64, documentType, documentNumber } = req.body || {};
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

app.get("/api/history/guides", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
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

app.get("/api/catalog/clients", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
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

app.get("/api/catalog/products", requireAuth(["admin", "vendedor", "cajero", "contador"]), async (req, res, next) => {
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

    res.json(await saveSnapshot(data, req.user?.companyId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/sync/merge", requireAuth(["admin", "vendedor", "cajero"]), async (req, res, next) => {
  try {
    if (!mergeSnapshotPatch) {
      res.status(500).json({ error: "El motor de base de datos no soporta sincronizacion incremental." });
      return;
    }

    const rawPatch = req.body || {};
    const bodyPresent = Object.prototype.hasOwnProperty.call(rawPatch, "requestId");
    const requestId = resolveSyncRequestId(req.get("Idempotency-Key"), rawPatch.requestId, bodyPresent);
    const patch = stripSyncTransportFields(rawPatch);
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
    } : null);
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

app.use((error, req, res, _next) => {
  errorLogger(error, req);
  console.error(error);
  const statusCode = error.statusCode || 500;
  const payload = {
    error: publicErrorMessage(error, statusCode)
  };
  if (Array.isArray(error.companyOptions)) {
    payload.companyOptions = error.companyOptions;
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

function tenantBackupFilename(backup = {}) {
  const ruc = String(backup.company?.ruc || backup.company?.id || "empresa").replace(/[^a-zA-Z0-9_-]/g, "");
  const date = new Date().toISOString().slice(0, 10);
  return `factudarwin-${ruc || "empresa"}-${date}.json`;
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
  if (!isValidEcuadorRuc(ruc)) errors.push("Ingrese un RUC ecuatoriano valido de 13 digitos para la empresa.");
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

function requireMasterKey(req, res, next) {
  const key = config.masterAdminKey;
  if (!key) {
    res.status(503).json({ error: "Panel maestro inactivo. Configure MASTER_ADMIN_KEY en backend/.env." });
    return;
  }
  if (req.headers["x-master-key"] !== key) {
    res.status(401).json({ error: "Clave maestra invalida." });
    return;
  }
  next();
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
      documentEmailWorker = createDocumentEmailWorker({ connectionString: config.databaseUrl });
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

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
if (process.send) {
  process.once("message", (message) => {
    if (message === "shutdown") void shutdown("IPC");
  });
}
