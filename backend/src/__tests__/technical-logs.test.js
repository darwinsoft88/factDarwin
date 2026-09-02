const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeBody } = require("../technical-logs");

test("los logs tecnicos nunca incluyen el contenido base64 de una imagen", () => {
  const content = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE";
  const summary = summarizeBody({ base64: content, filename: "producto.png" });

  assert.equal(summary.base64, "[redacted]");
  assert.equal(summary.filename, "producto.png");
  assert.equal(JSON.stringify(summary).includes("iVBOR"), false);
});

test("la proteccion base64 tambien se aplica dentro de objetos anidados", () => {
  const summary = summarizeBody({ image: { base64: "contenido-privado" } });

  assert.equal(summary.image.base64, "[redacted]");
});
