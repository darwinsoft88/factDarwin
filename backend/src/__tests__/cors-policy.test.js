const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const cors = require("cors");
const express = require("express");
const { createCorsOptions, isCorsOriginAllowed, requestOrigin } = require("../cors-policy");

function request(host = "api.factudarwin.com", protocol = "https", forwardedProto = "") {
  return {
    protocol,
    headers: {
      host,
      ...(forwardedProto ? { "x-forwarded-proto": forwardedProto } : {})
    }
  };
}

const production = {
  isProduction: true,
  publicUrl: "https://api.factudarwin.com",
  allowedOrigins: ["https://app.factudarwin.com"]
};

test("permite solicitudes sin Origin como clientes nativos", () => {
  assert.equal(isCorsOriginAllowed(undefined, request(), production), true);
});

test("permite el origen oficial configurado", () => {
  assert.equal(isCorsOriginAllowed("https://app.factudarwin.com", request(), production), true);
});

test("permite el mismo origen que sirve el panel maestro", () => {
  assert.equal(isCorsOriginAllowed(
    "http://localhost:4000",
    request("localhost:4000", "http"),
    production
  ), true);
});

test("permite Expo web en cualquier puerto cuando la API solicitada tambien es local", () => {
  assert.equal(isCorsOriginAllowed(
    "http://localhost:8082",
    request("localhost:4000", "http"),
    production
  ), true);
  assert.equal(isCorsOriginAllowed(
    "http://127.0.0.1:19007",
    request("127.0.0.1:4000", "http"),
    production
  ), true);
});

test("no permite que un origen localhost acceda a la API publica", () => {
  assert.equal(isCorsOriginAllowed(
    "http://localhost:8082",
    request("api.factudarwin.com", "https"),
    production
  ), false);
});

test("respeta el protocolo reenviado por el proxy", () => {
  const req = request("api.factudarwin.com", "http", "https");
  assert.equal(requestOrigin(req), "https://api.factudarwin.com");
  assert.equal(isCorsOriginAllowed("https://api.factudarwin.com", req, production), true);
});

test("mantiene permitidos los previews oficiales de Pages", () => {
  assert.equal(isCorsOriginAllowed(
    "https://revision.factudarwin-app.pages.dev",
    request(),
    production
  ), true);
});

test("rechaza un origen externo en producción", () => {
  assert.equal(isCorsOriginAllowed("https://malicioso.example", request(), production), false);
});

test("no confunde un dominio parecido con el preview oficial", () => {
  assert.equal(isCorsOriginAllowed(
    "https://factudarwin-app.pages.dev.malicioso.example",
    request(),
    production
  ), false);
});

test("el middleware permite /master same-origin y rechaza un origen externo", async () => {
  const app = express();
  app.use((req, res, next) => cors(createCorsOptions(req, production))(req, res, next));
  app.get("/master", (_req, res) => res.status(200).send("ok"));
  app.use((error, _req, res, _next) => res.status(403).json({ error: error.message }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const sameOrigin = await fetch(`${origin}/master`, { headers: { Origin: origin } });
    assert.equal(sameOrigin.status, 200);
    assert.equal(sameOrigin.headers.get("access-control-allow-origin"), origin);

    const rejected = await fetch(`${origin}/master`, {
      headers: { Origin: "https://malicioso.example" }
    });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
