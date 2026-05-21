import { BackendHealthResponse, BackupSummary, TechnicalLog } from "../services/backend";
import { AppData, User } from "../types";
import { activeEstablishment } from "./establishments";
import { formatShortDate, shortText } from "./format";
import { licenseStatusLabel, roleLabel } from "./appAccess";

export type SyncState = "synced" | "pending" | "syncing" | "error";

export function formatSyncStatus(state: SyncState, data: AppData) {
  if (data.autoBackupEnabled === false) return "Sync manual";
  if ((data.pendingSync || []).length > 0) return `Pendientes por sincronizar: ${(data.pendingSync || []).length}`;
  if (state === "syncing") return "Sincronizando...";
  if (state === "pending") return "Pendiente de subir";
  if (state === "error") return `Sync error${data.autoBackupLastError ? `: ${shortText(data.autoBackupLastError, 70)}` : ""}`;
  return data.autoBackupLastAt ? `Sincronizado ${formatAuditDate(data.autoBackupLastAt)}` : "Sincronizado";
}

export function formatBackendHealth(health: BackendHealthResponse, backendUrl: string, expectedEnv: string, envMatches: boolean) {
  return [
    "DIAGNOSTICO BACKEND SRI",
    `URL: ${backendUrl.replace(/\/$/, "")}`,
    `Servicio: ${health.service || "desconocido"}`,
    `Backend responde: ${health.ok ? "SI" : "NO"}`,
    `Ambiente backend: ${health.sriEnv || "desconocido"}`,
    `Ambiente app esperado: ${expectedEnv}`,
    `Ambientes coinciden: ${envMatches ? "SI" : "NO"}`,
    `Base de datos: ${health.database?.engine || "desconocida"}`,
    `Ruta/host DB: ${health.database?.path || "desconocido"}`,
    `Autenticacion JWT: ${health.authRequired === false ? "INACTIVA" : "ACTIVA"}`,
    `Licencia backend: ${health.license?.active ? "ACTIVA" : "NO ACTIVA"}${health.license?.plan ? ` | ${health.license.plan}` : ""}${health.license?.expiresAt ? ` | vence ${health.license.expiresAt}` : ""}`,
    `Logs tecnicos: ${health.technicalLogs?.enabled === false ? "INACTIVOS" : "ACTIVOS"}${health.technicalLogs?.retentionDays ? ` (${health.technicalLogs.retentionDays} dias)` : ""}`,
    `Envio real al SRI: ${health.allowSriSend ? "ACTIVO" : "DESACTIVADO"}`,
    `TLS flexible SRI: ${health.sriAllowInsecureTls ? "ACTIVO" : "DESACTIVADO"}`,
    `Certificado existe: ${health.certExists ? "SI" : "NO"}`,
    `Clave certificado configurada: ${health.certConfigured ? "SI" : "NO"}`,
    "",
    envMatches
      ? "Listo para firmar/enviar con esta configuracion."
      : "El ambiente de la app no coincide con el backend. Ajuste Ambiente en la app o SRI_ENV en backend/.env."
  ].join("\n");
}

export function buildSupportDiagnostic(data: AppData, user: User | null, state: SyncState, health?: BackendHealthResponse, logs: TechnicalLog[] = [], connectionError = "") {
  const current = activeEstablishment(data.issuer);
  const summary = summarizeAppData(data);
  const pending = data.pendingSync || [];
  const logLines = logs.slice(0, 5).map((log) => {
    const pieces = [
      log.time ? formatAuditDate(log.time) : "",
      log.level ? String(log.level).toUpperCase() : "",
      log.method && log.path ? `${log.method} ${log.path}` : log.event || "",
      log.statusCode ? `HTTP ${log.statusCode}` : "",
      log.message || ""
    ].filter(Boolean);
    return `- ${shortText(pieces.join(" | "), 180)}`;
  });

  return [
    "DIAGNOSTICO FACTUDARWIN",
    `Fecha: ${formatAuditDate(new Date().toISOString())}`,
    `Usuario: ${user?.name || "sin sesion"}${user?.role ? ` | ${roleLabel(user.role)}` : ""}`,
    `Empresa: ${data.issuer.businessName || data.issuer.tradeName || "sin nombre"}`,
    `RUC: ${data.issuer.ruc || "sin RUC"}`,
    `Punto activo: ${current.name} ${current.establishment}-${current.emissionPoint}`,
    `Licencia: ${licenseStatusLabel(data.license)}`,
    "",
    "SINCRONIZACION",
    `Estado: ${formatSyncStatus(state, data)}`,
    `Pendientes: ${pending.length}`,
    `Respaldo automatico: ${data.autoBackupEnabled === false ? "NO" : "SI"}`,
    `Ultima subida: ${data.autoBackupLastAt ? formatAuditDate(data.autoBackupLastAt) : "sin registro"}`,
    `Ultimo error: ${data.autoBackupLastError || "sin error"}`,
    `Servidor: ${data.backendUrl || "sin URL"}`,
    "",
    "RESUMEN LOCAL",
    formatBackupSummary(summary),
    data.historyPolicy?.mode ? `Politica historial local: ${data.historyPolicy.mode}${data.historyPolicy.compactedAt ? ` | compactado ${formatAuditDate(data.historyPolicy.compactedAt)}` : ""}` : "",
    "",
    "BACKEND",
    connectionError ? `Conexion: ERROR | ${connectionError}` : health ? `Conexion: OK | ${health.service || "servicio"} | DB ${health.database?.engine || "desconocida"}` : "Conexion: no probada",
    health?.license ? `Licencia backend: ${health.license.active ? "ACTIVA" : "NO ACTIVA"}${health.license.plan ? ` | ${health.license.plan}` : ""}` : "",
    health?.technicalLogs ? `Logs tecnicos: ${health.technicalLogs.enabled === false ? "INACTIVOS" : "ACTIVOS"}` : "",
    "",
    "PENDIENTES DETALLE",
    pending.length ? pending.slice(0, 10).map((item) => `- ${item.title} | ${formatAuditDate(item.createdAt)} | intentos ${item.attempts}${item.lastError ? ` | ${shortText(item.lastError, 120)}` : ""}`).join("\n") : "Sin pendientes.",
    "",
    "LOGS RECIENTES",
    logLines.length ? logLines.join("\n") : "Sin logs cargados desde soporte."
  ].filter((line) => line !== "").join("\n");
}

export function summarizeAppData(data: AppData): BackupSummary {
  return {
    users: data.users.length,
    clients: data.clients.length,
    products: data.products.length,
    sales: data.sales.length,
    guides: (data.guides || []).length,
    receivedRetentions: (data.receivedRetentions || []).length,
    inventoryMovements: (data.inventoryMovements || []).length,
    auditLogs: (data.auditLogs || []).length,
    cashClosings: (data.cashClosings || []).length,
    pendingSync: (data.pendingSync || []).length
  };
}

export function formatBackupSummary(summary: BackupSummary | undefined) {
  if (!summary) return "Sin resumen disponible.";

  return [
    `Usuarios: ${summary.users}`,
    `Clientes: ${summary.clients}`,
    `Productos: ${summary.products}`,
    `Ventas/documentos: ${summary.sales}`,
    `Guias: ${summary.guides}`,
    `Retenciones recibidas: ${summary.receivedRetentions}`,
    `Movimientos inventario: ${summary.inventoryMovements}`,
    `Cierres caja: ${summary.cashClosings || 0}`,
    `Auditoria app: ${summary.auditLogs}`,
    summary.pendingSync ? `Pendientes sync: ${summary.pendingSync}` : "",
    summary.historyCount !== undefined ? `Historial backend: ${summary.historyCount} respaldo(s)` : "",
    summary.prunedHistory ? `Eliminados por antiguedad: ${summary.prunedHistory}` : ""
  ].filter((line) => line !== "").join("\n");
}

export function formatAuditDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${formatShortDate(value)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatTechnicalLogMeta(log: TechnicalLog) {
  return [
    log.time ? formatAuditDate(log.time) : "",
    log.method && log.path ? `${log.method} ${log.path}` : "",
    log.statusCode ? `HTTP ${log.statusCode}` : "",
    log.durationMs !== undefined ? `${log.durationMs}ms` : "",
    log.user?.email ? `${log.user.email} (${log.user.role || "rol"})` : "",
    log.message ? shortText(log.message, 120) : "",
    log.body ? shortText(JSON.stringify(log.body), 160) : ""
  ].filter(Boolean).join(" | ");
}
