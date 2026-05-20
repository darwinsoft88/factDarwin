const { runPostgresBackup } = require("../postgres-backup");

runPostgresBackup("manual-cli")
  .then((result) => {
    console.log(`Backup PostgreSQL OK: ${result.file}`);
    console.log(`Tamano: ${result.sizeBytes} bytes`);
  })
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
