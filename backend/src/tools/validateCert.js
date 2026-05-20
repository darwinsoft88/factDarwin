const { loadP12Credentials } = require("../sri/p12");

try {
  const credentials = loadP12Credentials();

  console.log("Firma .p12 leida correctamente.");
  console.log(`Certificado publico cargado: ${credentials.certificateBody.length > 0 ? "SI" : "NO"}`);
  console.log(`Clave privada cargada: ${credentials.privateKeyPem.length > 0 ? "SI" : "NO"}`);
  console.log("No se imprimio la clave privada ni la contrasena.");
} catch (error) {
  console.error("No se pudo leer la firma .p12.");
  console.error(error.message);
  process.exit(1);
}
