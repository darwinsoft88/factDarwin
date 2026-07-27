const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config();

const backendRoot = path.resolve(__dirname, "..");
const resolveBackendPath = (value) => path.isAbsolute(value) ? value : path.resolve(backendRoot, value);
const env = process.env.SRI_ENV === "production" ? "production" : "test";
const nodeEnv = process.env.NODE_ENV === "production" ? "production" : "development";
const isProduction = nodeEnv === "production" || env === "production";
const defaultJwtSecret = "CAMBIA_ESTE_SECRETO_JWT_EN_PRODUCCION";
const jwtSecret = process.env.JWT_SECRET || defaultJwtSecret;
const assetEncryptionSecret = process.env.ASSET_ENCRYPTION_SECRET || jwtSecret;
const defaultCorsOrigins = [
  "https://app.factudarwin.com",
  "https://factudarwin-app.pages.dev",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006"
];
const allowedOrigins = (process.env.CORS_ORIGINS || defaultCorsOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const supportAdmin = {
  enabled: process.env.SUPPORT_ADMIN_ENABLED !== "false",
  email: (process.env.SUPPORT_ADMIN_EMAIL || "soporte@factudarwin.com").trim().toLowerCase(),
  name: process.env.SUPPORT_ADMIN_NAME || "Soporte DarwinSoft",
  password: process.env.SUPPORT_ADMIN_PASSWORD || "",
  passwordHash: process.env.SUPPORT_ADMIN_PASSWORD_HASH || ""
};
function resolveAutomaticEmailMode(value) {
  const mode = String(value || "off").trim().toLowerCase();
  return ["off", "simulate", "send"].includes(mode) ? mode : "off";
}

const automaticAuthorizationEmailMode = resolveAutomaticEmailMode(process.env.AUTOMATIC_AUTHORIZATION_EMAIL_MODE);
const emailBuildLimits = {
  maxXmlBytes: boundedPositiveInteger(process.env.EMAIL_MAX_XML_BYTES, 5 * 1024 * 1024),
  maxPdfBytes: boundedPositiveInteger(process.env.EMAIL_MAX_PDF_BYTES, 10 * 1024 * 1024),
  maxTotalAttachmentBytes: boundedPositiveInteger(process.env.EMAIL_MAX_ATTACHMENTS_BYTES, 15 * 1024 * 1024),
  maxHtmlBytes: boundedPositiveInteger(process.env.EMAIL_MAX_HTML_BYTES, 500 * 1024)
};

function boundedPositiveInteger(value, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : maximum;
}

function assertProductionConfig() {
  if (!isProduction) return;

  const errors = [];
  if (!process.env.JWT_SECRET || jwtSecret === defaultJwtSecret || jwtSecret.length < 32 || /CAMBIA|CHANGE/i.test(jwtSecret)) {
    errors.push("JWT_SECRET debe ser un secreto real de al menos 32 caracteres.");
  }
  if (!process.env.ASSET_ENCRYPTION_SECRET || assetEncryptionSecret.length < 32 || /CAMBIA|CHANGE/i.test(assetEncryptionSecret)) {
    errors.push("ASSET_ENCRYPTION_SECRET debe ser un secreto estable de al menos 32 caracteres para cifrar firmas y logos.");
  }
  if (process.env.AUTH_REQUIRED === "false") {
    errors.push("AUTH_REQUIRED no puede estar desactivado en produccion.");
  }
  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL es obligatorio en produccion; use PostgreSQL, no SQLite local.");
  }
  if (process.env.SRI_ALLOW_INSECURE_TLS === "true") {
    errors.push("SRI_ALLOW_INSECURE_TLS no puede estar activo en produccion.");
  }
  if (process.env.SRI_ENV === "production" && process.env.SRI_ALLOW_SEND !== "true") {
    errors.push("SRI_ALLOW_SEND debe estar en true cuando SRI_ENV=production.");
  }
  if (!process.env.PUBLIC_BACKEND_URL || !/^https:\/\//i.test(process.env.PUBLIC_BACKEND_URL)) {
    errors.push("PUBLIC_BACKEND_URL debe ser una URL HTTPS publica en produccion.");
  }
  if (supportAdmin.enabled && !supportAdmin.passwordHash) {
    errors.push("SUPPORT_ADMIN_PASSWORD_HASH es obligatorio en produccion para el acceso tecnico de soporte.");
  }
  if (supportAdmin.enabled && process.env.SUPPORT_ADMIN_PASSWORD) {
    errors.push("SUPPORT_ADMIN_PASSWORD no debe usarse en produccion; genere y configure SUPPORT_ADMIN_PASSWORD_HASH.");
  }
  if (process.env.PG_BACKUP_ENABLED === "false") {
    errors.push("PG_BACKUP_ENABLED no debe estar desactivado en produccion.");
  }
  if (!process.env.PG_BACKUP_DIR) {
    errors.push("PG_BACKUP_DIR debe estar configurado en produccion.");
  }
  if (!process.env.PG_DUMP_PATH) {
    errors.push("PG_DUMP_PATH debe estar configurado en produccion.");
  }
  if (!process.env.PG_RESTORE_PATH) {
    errors.push("PG_RESTORE_PATH debe estar configurado para probar restauracion de backups.");
  }
  if (!process.env.PSQL_PATH) {
    errors.push("PSQL_PATH debe estar configurado para probar restauracion de backups.");
  }
  if (!Number.isFinite(Number(process.env.PG_BACKUP_RETENTION_DAYS)) || Number(process.env.PG_BACKUP_RETENTION_DAYS) < 7) {
    errors.push("PG_BACKUP_RETENTION_DAYS debe ser numerico y minimo 7 dias.");
  }

  if (errors.length > 0) {
    throw new Error(`Configuracion de produccion incompleta:\n- ${errors.join("\n- ")}`);
  }
}

module.exports = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || "",
  dbPath: resolveBackendPath(process.env.DB_PATH || "./data/factura-sri-main.db"),
  uploadsDir: resolveBackendPath(process.env.UPLOADS_DIR || "./uploads"),
  publicUrl: process.env.PUBLIC_BACKEND_URL || "",
  // Fase 2: solo off/simulate. El valor send se bloquea deliberadamente.
  automaticAuthorizationEmailMode,
  emailBuildLimits,
  allowedOrigins,
  requireHttps: process.env.REQUIRE_HTTPS === "true" || isProduction,
  sriEnv: env,
  allowSriSend: process.env.SRI_ALLOW_SEND === "true",
  sriAllowInsecureTls: process.env.SRI_ALLOW_INSECURE_TLS === "true",
  authRequired: process.env.AUTH_REQUIRED !== "false",
  jwtSecret,
  assetEncryptionSecret,
  jwtExpiresInHours: Number(process.env.JWT_EXPIRES_HOURS || 12),
  masterAdminKey: process.env.MASTER_ADMIN_KEY || "",
  supportAdmin,
  resolveAutomaticEmailMode,
  assertProductionConfig,
  certPath: resolveBackendPath(process.env.SRI_CERT_PATH || "./certs/firma.p12"),
  certPassword: process.env.SRI_CERT_PASSWORD || "",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
    connectionTimeoutMs: boundedPositiveInteger(process.env.SMTP_CONNECTION_TIMEOUT_MS, 30 * 1000),
    greetingTimeoutMs: boundedPositiveInteger(process.env.SMTP_GREETING_TIMEOUT_MS, 30 * 1000),
    socketTimeoutMs: boundedPositiveInteger(process.env.SMTP_SOCKET_TIMEOUT_MS, 60 * 1000)
  },
  datosApi: {
    url: (process.env.DATOS_API_URL || "https://webservices.ec").replace(/\/$/, ""),
    token: process.env.DATOS_API_TOKEN || ""
  },
  backups: {
    enabled: process.env.PG_BACKUP_ENABLED !== "false",
    dir: resolveBackendPath(process.env.PG_BACKUP_DIR || "./backups/postgres"),
    time: process.env.PG_BACKUP_TIME || "23:30",
    retentionDays: Number(process.env.PG_BACKUP_RETENTION_DAYS || 30),
    pgDumpPath: process.env.PG_DUMP_PATH || "pg_dump",
    pgRestorePath: process.env.PG_RESTORE_PATH || "pg_restore",
    psqlPath: process.env.PSQL_PATH || "psql"
  },
  technicalLogs: {
    enabled: process.env.TECHNICAL_LOGS_ENABLED !== "false",
    dir: resolveBackendPath(process.env.TECHNICAL_LOGS_DIR || "./logs"),
    retentionDays: Number(process.env.TECHNICAL_LOGS_RETENTION_DAYS || 30),
    maxRead: Number(process.env.TECHNICAL_LOGS_MAX_READ || 300),
    logSuccess: process.env.TECHNICAL_LOGS_SUCCESS === "true",
    includeStack: process.env.TECHNICAL_LOGS_INCLUDE_STACK === "true"
  }
};
