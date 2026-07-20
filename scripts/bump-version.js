const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const nextVersion = process.argv[2];
const dryRun = process.argv.includes("check") || process.argv.includes("--check") || process.env.npm_config_dry_run === "true";

function fail(message) {
  console.error(`Error: ${message}`);
  console.error("Uso: npm run version:bump -- 1.0.2");
  console.error("Prueba sin escribir: npm run version:bump -- 1.0.2 check");
  process.exit(1);
}

if (!nextVersion || !/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  fail("Ingrese una version semantica valida, ejemplo 1.0.2.");
}

const appJsonPath = path.join(root, "app.json");
const brandingPath = path.join(root, "src/constants/branding.ts");
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const expo = appJson.expo || {};
const currentVersion = String(expo.version || "");
const currentVersionCode = Number(expo.android?.versionCode || 0);
const currentBuildNumber = Number(expo.ios?.buildNumber || 0);

if (nextVersion === currentVersion) {
  fail(`La version ${nextVersion} ya esta configurada. Use una version nueva para publicar.`);
}

if (!expo.android) expo.android = {};
if (!expo.ios) expo.ios = {};
expo.version = nextVersion;
expo.android.versionCode = Number.isInteger(currentVersionCode) && currentVersionCode > 0 ? currentVersionCode + 1 : 1;
expo.ios.buildNumber = String(Number.isInteger(currentBuildNumber) && currentBuildNumber > 0 ? currentBuildNumber + 1 : 1);

const branding = fs.readFileSync(brandingPath, "utf8");
if (!/APP_VERSION\s*=\s*"[^"]+"/.test(branding)) {
  fail("No se encontro APP_VERSION en src/constants/branding.ts.");
}
const nextBranding = branding.replace(/APP_VERSION\s*=\s*"[^"]+"/, `APP_VERSION = "${nextVersion}"`);

console.log(`Version app: ${currentVersion || "sin version"} -> ${nextVersion}`);
console.log(`Android versionCode: ${currentVersionCode || 0} -> ${expo.android.versionCode}`);
console.log(`iOS buildNumber: ${currentBuildNumber || 0} -> ${expo.ios.buildNumber}`);

if (dryRun) {
  console.log("Simulacion: no se escribieron cambios.");
  process.exit(0);
}

fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
fs.writeFileSync(brandingPath, nextBranding);
console.log("Version actualizada. Ejecute npm run release:android:check antes de generar AAB.");
