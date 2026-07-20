const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const checks = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
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

function add(label, ok, detail = "") {
  checks.push({ label, ok: Boolean(ok), detail });
}

function isRealSecret(value) {
  return Boolean(value && value.length >= 32 && !/CAMBIA|CHANGE|GENERA/i.test(value));
}

const app = readJson("app.json").expo || {};
const eas = readJson("eas.json");
const packageJson = readJson("package.json");
const backendPackageJson = readJson("backend/package.json");
const backendEnv = readEnv("backend/.env");
const branding = fs.readFileSync(path.join(root, "src/constants/branding.ts"), "utf8");
const brandingVersion = branding.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1] || "";

add("App version sincronizada", app.version === brandingVersion, `${app.version || "sin app.json"} / ${brandingVersion || "sin branding"}`);
add("Android package definido", /^com\.[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(String(app.android?.package || "")), app.android?.package || "");
add("Iconos y splash existen", ["assets/icon.png", "assets/adaptive-icon.png", "assets/splash-icon.png"].every(fileExists));
add("EAS backend oficial", ["preview", "previewOptimized", "production"].every((profile) => eas.build?.[profile]?.env?.EXPO_PUBLIC_BACKEND_URL === "https://api.factudarwin.com"));
add("Perfil AAB Play Store", !eas.build?.production?.android?.buildType || eas.build.production.android.buildType === "app-bundle");
add("Scripts release app", ["release:android:check", "build:android:aab", "submit:android", "version:bump", "smoke:production"].every((script) => packageJson.scripts?.[script]));
add("Scripts backend", ["check:production", "check:indexes", "backup:postgres", "secrets:generate", "support:hash"].every((script) => backendPackageJson.scripts?.[script]));
add("Docs Play Store", ["docs/store-release.md", "docs/privacy-policy-template.md", "docs/play-store-listing.md"].every(fileExists));
add("Backend URL HTTPS real", /^https:\/\/api\.factudarwin\.com$/i.test(backendEnv.PUBLIC_BACKEND_URL || ""), backendEnv.PUBLIC_BACKEND_URL || "sin PUBLIC_BACKEND_URL");
add("Backend PostgreSQL", Boolean(backendEnv.DATABASE_URL), backendEnv.DATABASE_URL ? "DATABASE_URL definido" : "sin DATABASE_URL");
add("Secretos backend reales", [backendEnv.JWT_SECRET, backendEnv.ASSET_ENCRYPTION_SECRET, backendEnv.MASTER_ADMIN_KEY].every(isRealSecret));
add("Soporte admin hash", backendEnv.SUPPORT_ADMIN_ENABLED !== "true" || Boolean(backendEnv.SUPPORT_ADMIN_PASSWORD_HASH && !/GENERA|CAMBIA|CHANGE/i.test(backendEnv.SUPPORT_ADMIN_PASSWORD_HASH)));
add("TLS SRI seguro", backendEnv.SRI_ALLOW_INSECURE_TLS === "false", `SRI_ALLOW_INSECURE_TLS=${backendEnv.SRI_ALLOW_INSECURE_TLS || "sin definir"}`);
add("Backups restaurables configurados", ["PG_BACKUP_DIR", "PG_DUMP_PATH", "PG_RESTORE_PATH", "PSQL_PATH"].every((key) => Boolean(backendEnv[key])) && Number(backendEnv.PG_BACKUP_RETENTION_DAYS || 0) >= 7);

const okCount = checks.filter((check) => check.ok).length;
const pending = checks.filter((check) => !check.ok);

console.log("Estado final FactuDarwin");
console.log(`OK: ${okCount}/${checks.length}`);
console.log("");
checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FALTA"} - ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
});

if (pending.length > 0) {
  console.log("");
  console.log("Pendiente antes de decir 100%:");
  pending.forEach((check) => console.log(`- ${check.label}`));
  process.exitCode = 1;
}
