const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");

const SENSITIVE_KEYS = new Set([
  "password",
  "pass",
  "token",
  "authorization",
  "jwt",
  "certpassword",
  "base64"
]);

function logTechnical(level, event, details = {}) {
  if (!config.technicalLogs.enabled) return;

  try {
    ensureLogDir();
    const entry = {
      time: new Date().toISOString(),
      level,
      event,
      ...sanitizeValue(details)
    };
    fs.appendFileSync(logFilePath(entry.time), `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("No se pudo escribir log tecnico:", error.message);
  }
}

function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const shouldLog = config.technicalLogs.logSuccess || res.statusCode >= 400 || isImportantRoute(req.path);
    if (!shouldLog) return;

    logTechnical(res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info", "http_request", {
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      user: req.user ? {
        id: req.user.sub || req.user.id,
        email: req.user.email,
        role: req.user.role
      } : undefined,
      ip: requestIp(req),
      body: summarizeBody(req.body)
    });
  });

  next();
}

function errorLogger(error, req) {
  logTechnical("error", "backend_error", {
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode: error.statusCode || 500,
    user: req.user ? {
      id: req.user.sub || req.user.id,
      email: req.user.email,
      role: req.user.role
    } : undefined,
    ip: requestIp(req),
    message: error.message,
    stack: config.technicalLogs.includeStack ? error.stack : undefined
  });
}

function listTechnicalLogs(limit = 100) {
  ensureLogDir();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), config.technicalLogs.maxRead);
  const files = fs.readdirSync(config.technicalLogs.dir)
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file))
    .sort()
    .reverse();
  const logs = [];

  for (const file of files) {
    const lines = fs.readFileSync(path.join(config.technicalLogs.dir, file), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .reverse();

    for (const line of lines) {
      try {
        logs.push(JSON.parse(line));
      } catch {
        logs.push({ time: "", level: "warn", event: "invalid_log_line", message: line.slice(0, 300) });
      }
      if (logs.length >= safeLimit) return logs;
    }
  }

  return logs;
}

function cleanupTechnicalLogs() {
  if (!config.technicalLogs.enabled) return;

  try {
    ensureLogDir();
    const retentionMs = Math.max(1, config.technicalLogs.retentionDays) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;
    fs.readdirSync(config.technicalLogs.dir)
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file))
      .forEach((file) => {
        const fullPath = path.join(config.technicalLogs.dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) fs.unlinkSync(fullPath);
      });
  } catch (error) {
    console.error("No se pudo limpiar logs tecnicos:", error.message);
  }
}

function summarizeBody(body) {
  if (!body || typeof body !== "object") return undefined;
  const summary = {};

  Object.entries(body).forEach(([key, value]) => {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      summary[key] = "[redacted]";
      return;
    }
    if (key === "xml" && typeof value === "string") {
      summary.xml = summarizeXml(value);
      return;
    }
    if (key === "html" && typeof value === "string") {
      summary.html = { length: value.length };
      return;
    }
    if ((key === "data" || key === "baseData") && value && typeof value === "object") {
      summary[key] = summarizeAppData(value);
      return;
    }
    summary[key] = sanitizeValue(value);
  });

  return summary;
}

function summarizeXml(xml) {
  const accessKey = /<claveAcceso>([^<]+)<\/claveAcceso>/i.exec(xml)?.[1] || "";
  const root = /<([a-zA-Z_:][\w:.-]*)[\s>]/.exec(xml.replace(/<\?xml[^>]*>/i, ""))?.[1] || "";
  return {
    root,
    accessKey,
    length: xml.length
  };
}

function summarizeAppData(data) {
  return {
    users: Array.isArray(data.users) ? data.users.length : 0,
    clients: Array.isArray(data.clients) ? data.clients.length : 0,
    products: Array.isArray(data.products) ? data.products.length : 0,
    sales: Array.isArray(data.sales) ? data.sales.length : 0,
    guides: Array.isArray(data.guides) ? data.guides.length : 0,
    inventoryMovements: Array.isArray(data.inventoryMovements) ? data.inventoryMovements.length : 0,
    auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs.length : 0
  };
}

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeValue);
  if (!value || typeof value !== "object") return value;

  const safe = {};
  Object.entries(value).forEach(([key, item]) => {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      safe[key] = "[redacted]";
    } else if (typeof item === "string" && item.length > 500) {
      safe[key] = `${item.slice(0, 500)}...`;
    } else {
      safe[key] = sanitizeValue(item);
    }
  });
  return safe;
}

function ensureLogDir() {
  fs.mkdirSync(config.technicalLogs.dir, { recursive: true });
}

function logFilePath(isoDate) {
  return path.join(config.technicalLogs.dir, `${isoDate.slice(0, 10)}.jsonl`);
}

function isImportantRoute(routePath) {
  return /^\/api\/(auth|facturas|guias|email|backups|data)/.test(routePath);
}

function requestIp(req) {
  return req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "";
}

module.exports = {
  cleanupTechnicalLogs,
  errorLogger,
  listTechnicalLogs,
  logTechnical,
  requestLogger,
  summarizeBody
};
