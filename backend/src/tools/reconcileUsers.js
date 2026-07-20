const db = require("../db");

(async () => {
  if (db.initialize) await db.initialize();
  if (!db.reconcileSaasUsersFromSnapshots) {
    throw new Error("El motor de base de datos no expone reconciliacion de usuarios.");
  }

  const result = await db.reconcileSaasUsersFromSnapshots();
  console.log(`Usuarios reconciliados OK: ${result.companies} empresa(s), ${result.syncedUsers} usuario(s).`);
  if (db.close) await db.close();
})().catch(async (error) => {
  console.error(error.message || error);
  if (db.close) await db.close();
  process.exitCode = 1;
});
