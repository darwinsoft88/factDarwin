"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const configPath = path.join(__dirname, "..", "config.js");

function loadConfigCapturingDotenv(skipValue) {
  const originalLoad = Module._load;
  const originalCwd = process.cwd();
  const originalSkip = process.env.FACTUDARWIN_SKIP_DOTENV;
  const calls = [];
  try {
    if (skipValue === undefined) delete process.env.FACTUDARWIN_SKIP_DOTENV;
    else process.env.FACTUDARWIN_SKIP_DOTENV = skipValue;
    process.chdir(os.tmpdir());
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === "dotenv") return { config: (options) => { calls.push(options); return {}; } };
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve(configPath)];
    require(configPath);
    return calls;
  } finally {
    delete require.cache[require.resolve(configPath)];
    Module._load = originalLoad;
    process.chdir(originalCwd);
    if (originalSkip === undefined) delete process.env.FACTUDARWIN_SKIP_DOTENV;
    else process.env.FACTUDARWIN_SKIP_DOTENV = originalSkip;
  }
}

test("carga backend/.env explicitamente aunque process.cwd sea otro directorio", () => {
  const calls = loadConfigCapturingDotenv(undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, path.resolve(__dirname, "..", "..", ".env"));
});

test("FACTUDARWIN_SKIP_DOTENV=true conserva exactamente la omision existente", () => {
  assert.deepEqual(loadConfigCapturingDotenv("true"), []);
});
