const crypto = require("node:crypto");

function secret(bytes = 48) {
  return crypto.randomBytes(bytes).toString("base64url");
}

const jwtSecret = secret();
const assetEncryptionSecret = secret();
const deviceSessionTokenPepper = secret();
const masterAdminKey = secret();

console.log("# Copie estos valores en backend/.env de produccion.");
console.log("# No los suba a Git ni los comparta por capturas.");
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`ASSET_ENCRYPTION_SECRET=${assetEncryptionSecret}`);
console.log(`DEVICE_SESSION_TOKEN_PEPPER=${deviceSessionTokenPepper}`);
console.log(`MASTER_ADMIN_KEY=${masterAdminKey}`);
