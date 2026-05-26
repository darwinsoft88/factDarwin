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

const app = readJson("app.json").expo || {};
const eas = readJson("eas.json");
const backendEnv = readEnv("backend/.env");

if (!app.android?.package) errors.push("app.json debe definir expo.android.package.");
if (!Number.isInteger(Number(app.android?.versionCode)) || Number(app.android?.versionCode) < 1) {
  errors.push("app.json debe definir expo.android.versionCode numerico.");
}
if (!app.extra?.eas?.projectId) errors.push("app.json debe definir expo.extra.eas.projectId.");

["preview", "previewOptimized", "production"].forEach((profile) => {
  requireHttpsUrl(`eas.json build.${profile}.env.EXPO_PUBLIC_BACKEND_URL`, eas.build?.[profile]?.env?.EXPO_PUBLIC_BACKEND_URL);
});

requireHttpsUrl("backend/.env PUBLIC_BACKEND_URL", backendEnv.PUBLIC_BACKEND_URL);
if (!backendEnv.DATABASE_URL) errors.push("backend/.env debe definir DATABASE_URL para PostgreSQL.");
if (backendEnv.AUTH_REQUIRED === "false") errors.push("backend/.env no debe tener AUTH_REQUIRED=false.");
if (!backendEnv.JWT_SECRET || backendEnv.JWT_SECRET.length < 32 || /CAMBIA|CHANGE/i.test(backendEnv.JWT_SECRET)) {
  errors.push("backend/.env debe definir JWT_SECRET real de al menos 32 caracteres.");
}
if (!backendEnv.ASSET_ENCRYPTION_SECRET || backendEnv.ASSET_ENCRYPTION_SECRET.length < 32 || /CAMBIA|CHANGE/i.test(backendEnv.ASSET_ENCRYPTION_SECRET)) {
  errors.push("backend/.env debe definir ASSET_ENCRYPTION_SECRET estable de al menos 32 caracteres para firmas .p12 y activos.");
}
if (backendEnv.SRI_ALLOW_INSECURE_TLS === "true") errors.push("backend/.env no debe tener SRI_ALLOW_INSECURE_TLS=true.");
if (backendEnv.SRI_ENV === "production" && backendEnv.SRI_ALLOW_SEND !== "true") {
  errors.push("backend/.env debe tener SRI_ALLOW_SEND=true cuando SRI_ENV=production.");
}

if (errors.length > 0) {
  console.error("Produccion no lista:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Produccion lista: configuracion basica verificada.");
