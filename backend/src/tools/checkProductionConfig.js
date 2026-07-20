process.env.NODE_ENV = process.env.NODE_ENV || "production";

const config = require("../config");

try {
  config.assertProductionConfig();
  console.log("Backend produccion listo:");
  console.log(`- URL publica: ${config.publicUrl}`);
  console.log(`- Base de datos: ${config.databaseUrl ? "PostgreSQL" : "sin DATABASE_URL"}`);
  console.log(`- SRI ambiente: ${config.sriEnv}`);
  console.log(`- SRI envio: ${config.allowSriSend ? "activo" : "inactivo"}`);
  console.log(`- TLS inseguro SRI: ${config.sriAllowInsecureTls ? "activo" : "inactivo"}`);
  console.log(`- Auth requerido: ${config.authRequired ? "si" : "no"}`);
  console.log(`- Soporte tecnico: ${config.supportAdmin.enabled ? "activo" : "inactivo"}`);
  console.log(`- Backups: ${config.backups.enabled ? "activos" : "inactivos"} | ${config.backups.dir}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
