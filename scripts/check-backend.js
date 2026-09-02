const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const backendRoot = path.join(root, "backend");
const srcRoot = path.join(backendRoot, "src");
const errors = [];

function collectJsFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJsFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

function relative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function requireScript(packageJson, scriptName) {
  if (!packageJson.scripts?.[scriptName]) {
    errors.push(`backend/package.json debe definir el script ${scriptName}.`);
  }
}

const packageJsonPath = path.join(backendRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

requireScript(packageJson, "start");
requireScript(packageJson, "backup:postgres");
requireScript(packageJson, "check:production");
requireScript(packageJson, "check:indexes");
requireScript(packageJson, "check:tenant");
requireScript(packageJson, "secrets:generate");
requireScript(packageJson, "support:hash");
requireScript(packageJson, "validate-cert");

const jsFiles = collectJsFiles(srcRoot);
for (const file of jsFiles) {
  try {
    const source = fs.readFileSync(file, "utf8");
    // Parseo equivalente para archivos CommonJS sin ejecutar el modulo.
    new Function("require", "module", "exports", "__filename", "__dirname", source);
  } catch (error) {
    errors.push(`${relative(file)} tiene error de sintaxis:\n${error.message}`);
  }
}

const envExample = fs.readFileSync(path.join(backendRoot, ".env.production.example"), "utf8");
[
  "PUBLIC_BACKEND_URL=https://api.factudarwin.com",
  "DATABASE_URL=",
  "JWT_SECRET=",
  "ASSET_ENCRYPTION_SECRET=",
  "DEVICE_SESSION_TOKEN_PEPPER=",
  "MASTER_ADMIN_KEY=",
  "SUPPORT_ADMIN_PASSWORD_HASH=",
  "SRI_ALLOW_INSECURE_TLS=false"
].forEach((requiredLine) => {
  if (!envExample.includes(requiredLine)) {
    errors.push(`backend/.env.production.example debe incluir ${requiredLine}.`);
  }
});

if (errors.length > 0) {
  console.error("Backend no listo:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Backend listo: ${jsFiles.length} archivo(s) JS verificados.`);
