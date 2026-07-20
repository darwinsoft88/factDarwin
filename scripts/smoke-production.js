const https = require("node:https");
const http = require("node:http");

const inputUrl = process.argv[2] || process.env.EXPO_PUBLIC_BACKEND_URL || "https://api.factudarwin.com";
const baseUrl = inputUrl.replace(/\/+$/, "");
const healthUrl = `${baseUrl}/health`;
const errors = [];

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    const request = client.get(url, { timeout: 15000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve({
            body: body ? JSON.parse(body) : null,
            statusCode: response.statusCode || 0
          });
        } catch (error) {
          reject(new Error(`Respuesta no es JSON valido: ${error.message}`));
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("Timeout consultando backend."));
    });
    request.on("error", reject);
  });
}

function expect(label, condition) {
  if (!condition) errors.push(label);
}

(async () => {
  expect("La URL de produccion debe usar HTTPS.", healthUrl.startsWith("https://"));
  const { body, statusCode } = await requestJson(healthUrl);
  expect("/health debe responder HTTP 200.", statusCode === 200);
  expect("/health debe responder ok=true.", body?.ok === true);
  expect("El servicio debe identificarse como factura-sri-backend.", body?.service === "factura-sri-backend");
  expect("El backend debe tener AUTH_REQUIRED activo.", body?.authRequired === true);
  expect("El backend no debe permitir TLS inseguro SRI.", body?.sriAllowInsecureTls === false);
  expect("La base de datos debe ser PostgreSQL.", body?.database?.engine === "postgres");
  expect("Los backups PostgreSQL deben estar activos.", body?.backups?.enabled === true);
  expect("Debe existir estado de licencia en /health.", Boolean(body?.license?.status));
  expect("Debe existir estado de logs tecnicos en /health.", typeof body?.technicalLogs?.enabled === "boolean");

  if (errors.length > 0) {
    console.error(`Smoke test fallido para ${healthUrl}:`);
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log(`Smoke test OK: ${healthUrl}`);
  console.log(`SRI: ${body.sriEnv} | DB: ${body.database.engine} | Auth: ${body.authRequired ? "activo" : "inactivo"} | Licencia: ${body.license.status}`);
})().catch((error) => {
  console.error(`Smoke test fallido para ${healthUrl}:`);
  console.error(`- ${error.message}`);
  process.exit(1);
});
