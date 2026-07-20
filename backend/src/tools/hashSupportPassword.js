const { hashPassword } = require("../auth");

const password = process.argv.slice(2).join(" ");

if (!password || password.length < 12) {
  console.error("Uso: npm run support:hash -- \"CLAVE_SEGURA_DE_12_O_MAS_CARACTERES\"");
  console.error("La clave de soporte debe tener al menos 12 caracteres.");
  process.exit(1);
}

console.log(hashPassword(password));
