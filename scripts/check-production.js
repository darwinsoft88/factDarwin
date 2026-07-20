const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const errors = [];

function readJson(relativePath) {
  const filePath = path.join(root, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readEnv(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")];
      })
  );
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function isPlaceholderUrl(value) {
  return !value
    || /tudominio|example|localhost|127\.0\.0\.1/i.test(value)
    || /trycloudflare\.com|loca\.lt/i.test(value);
}

function requireHttpsUrl(label, value) {
  if (!value || !/^https:\/\//i.test(value)) {
    errors.push(`${label} debe ser una URL HTTPS.`);
    return;
  }
  if (isPlaceholderUrl(value)) {
    errors.push(`${label} no debe ser localhost, tunel temporal ni dominio de ejemplo.`);
  }
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

const app = readJson("app.json").expo || {};
const eas = readJson("eas.json");
const packageJson = readJson("package.json");
const branding = fs.readFileSync(path.join(root, "src/constants/branding.ts"), "utf8");
const backendEnv = readEnv("backend/.env");

if (!app.android?.package) errors.push("app.json debe definir expo.android.package.");
if (!/^com\.[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(String(app.android?.package || ""))) {
  errors.push("app.json expo.android.package debe tener formato valido tipo com.empresa.app.");
}
if (!Number.isInteger(Number(app.android?.versionCode)) || Number(app.android?.versionCode) < 1) {
  errors.push("app.json debe definir expo.android.versionCode numerico.");
}
if (!/^\d+\.\d+\.\d+$/.test(String(app.version || ""))) {
  errors.push("app.json expo.version debe usar formato semantico, ejemplo 1.0.2.");
}
if (!app.extra?.eas?.projectId) errors.push("app.json debe definir expo.extra.eas.projectId.");
if (!app.name || app.name.length < 3) errors.push("app.json debe definir expo.name con el nombre comercial.");
if (!app.slug || app.slug.length < 3) errors.push("app.json debe definir expo.slug.");
if (!app.scheme || /facturasri/i.test(app.scheme)) errors.push("app.json expo.scheme debe usar la marca actual, ejemplo factudarwin.");
if (!app.icon || !fileExists(app.icon.replace(/^\.\//, ""))) errors.push("app.json expo.icon debe apuntar a un archivo existente.");
if (!app.splash?.image || !fileExists(app.splash.image.replace(/^\.\//, ""))) errors.push("app.json expo.splash.image debe apuntar a un archivo existente.");
if (!app.android?.adaptiveIcon?.foregroundImage || !fileExists(app.android.adaptiveIcon.foregroundImage.replace(/^\.\//, ""))) {
  errors.push("app.json expo.android.adaptiveIcon.foregroundImage debe apuntar a un archivo existente.");
}
if (!app.plugins || !JSON.stringify(app.plugins).includes("FactuDarwin usa la camara")) {
  errors.push("app.json debe declarar permiso de camara con texto comercial de FactuDarwin.");
}
if (!fileExists("docs/privacy-policy-template.md")) errors.push("Debe existir docs/privacy-policy-template.md como base para la politica de privacidad.");
if (!fileExists("docs/play-store-listing.md")) errors.push("Debe existir docs/play-store-listing.md con textos para Play Store.");
if (!packageJson.scripts?.["release:preflight"]) errors.push("package.json debe definir release:preflight como compuerta unica de produccion.");
if (packageJson.scripts?.["release:android:check"] !== "npm run release:preflight") {
  errors.push("release:android:check debe ejecutar npm run release:preflight para evitar builds sin validacion completa.");
}
const brandingVersion = branding.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];
if (!brandingVersion) {
  errors.push("src/constants/branding.ts debe definir APP_VERSION.");
} else if (brandingVersion !== app.version) {
  errors.push(`APP_VERSION (${brandingVersion}) debe coincidir con app.json expo.version (${app.version}).`);
}

const profileBackendUrls = ["preview", "previewOptimized", "production"].map((profile) => {
  const value = eas.build?.[profile]?.env?.EXPO_PUBLIC_BACKEND_URL;
  requireHttpsUrl(`eas.json build.${profile}.env.EXPO_PUBLIC_BACKEND_URL`, value);
  return normalizeUrl(value);
});
if (new Set(profileBackendUrls.filter(Boolean)).size > 1) {
  errors.push("eas.json debe usar el mismo EXPO_PUBLIC_BACKEND_URL oficial en preview, previewOptimized y production.");
}
if (eas.build?.production?.android?.buildType && eas.build.production.android.buildType !== "app-bundle") {
  errors.push("eas.json build.production.android.buildType debe ser app-bundle o no definirse.");
}
if (eas.build?.previewOptimized?.android?.buildType !== "app-bundle") {
  errors.push("eas.json build.previewOptimized.android.buildType debe ser app-bundle para probar formato Play Store.");
}

requireHttpsUrl("backend/.env PUBLIC_BACKEND_URL", backendEnv.PUBLIC_BACKEND_URL);
if (backendEnv.PUBLIC_BACKEND_URL && profileBackendUrls.includes(normalizeUrl(backendEnv.PUBLIC_BACKEND_URL)) === false) {
  errors.push("backend/.env PUBLIC_BACKEND_URL debe coincidir con EXPO_PUBLIC_BACKEND_URL de eas.json.");
}
if (!backendEnv.DATABASE_URL) errors.push("backend/.env debe definir DATABASE_URL para PostgreSQL.");
if (backendEnv.AUTH_REQUIRED === "false") errors.push("backend/.env no debe tener AUTH_REQUIRED=false.");
if (!backendEnv.JWT_SECRET || backendEnv.JWT_SECRET.length < 32 || /CAMBIA|CHANGE/i.test(backendEnv.JWT_SECRET)) {
  errors.push("backend/.env debe definir JWT_SECRET real de al menos 32 caracteres.");
}
if (!backendEnv.ASSET_ENCRYPTION_SECRET || backendEnv.ASSET_ENCRYPTION_SECRET.length < 32 || /CAMBIA|CHANGE/i.test(backendEnv.ASSET_ENCRYPTION_SECRET)) {
  errors.push("backend/.env debe definir ASSET_ENCRYPTION_SECRET estable de al menos 32 caracteres para firmas .p12 y activos.");
}
if (!backendEnv.MASTER_ADMIN_KEY || backendEnv.MASTER_ADMIN_KEY.length < 32 || /CAMBIA|CHANGE/i.test(backendEnv.MASTER_ADMIN_KEY)) {
  errors.push("backend/.env debe definir MASTER_ADMIN_KEY real de al menos 32 caracteres.");
}
if (backendEnv.SUPPORT_ADMIN_ENABLED === "true" && (!backendEnv.SUPPORT_ADMIN_PASSWORD_HASH || /GENERA|CAMBIA|CHANGE/i.test(backendEnv.SUPPORT_ADMIN_PASSWORD_HASH))) {
  errors.push("backend/.env debe definir SUPPORT_ADMIN_PASSWORD_HASH generado con npm run support:hash si SUPPORT_ADMIN_ENABLED=true.");
}
if (backendEnv.SRI_ALLOW_INSECURE_TLS === "true") errors.push("backend/.env no debe tener SRI_ALLOW_INSECURE_TLS=true.");
if (backendEnv.SRI_ENV === "production" && backendEnv.SRI_ALLOW_SEND !== "true") {
  errors.push("backend/.env debe tener SRI_ALLOW_SEND=true cuando SRI_ENV=production.");
}
if (backendEnv.PG_BACKUP_ENABLED === "false") errors.push("backend/.env no debe desactivar PG_BACKUP_ENABLED en produccion.");
if (!backendEnv.PG_BACKUP_DIR) errors.push("backend/.env debe definir PG_BACKUP_DIR para respaldos PostgreSQL.");
if (!backendEnv.PG_DUMP_PATH) errors.push("backend/.env debe definir PG_DUMP_PATH.");
if (!backendEnv.PG_RESTORE_PATH) errors.push("backend/.env debe definir PG_RESTORE_PATH para prueba real de restauracion.");
if (!backendEnv.PSQL_PATH) errors.push("backend/.env debe definir PSQL_PATH para prueba real de restauracion.");
if (!Number.isFinite(Number(backendEnv.PG_BACKUP_RETENTION_DAYS)) || Number(backendEnv.PG_BACKUP_RETENTION_DAYS) < 7) {
  errors.push("backend/.env debe definir PG_BACKUP_RETENTION_DAYS con minimo 7 dias.");
}

if (errors.length > 0) {
  console.error("Produccion no lista:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Produccion lista: configuracion basica verificada.");
