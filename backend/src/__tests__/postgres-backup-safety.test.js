"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "postgres-backup.js"), "utf8");

test("el programador agenda el siguiente ciclo incluso si el respaldo falla", () => {
  assert.match(source, /try\s*\{\s*await runPostgresBackup\("scheduled"\)/s);
  assert.match(source, /finally\s*\{\s*scheduleNextBackup\(\)/s);
});

test("el dump se verifica como parcial y solo entonces se publica atomicamente", () => {
  const dump = source.indexOf("executePgDump(temporaryPath)");
  const verify = source.indexOf("verifyPostgresRestore(temporaryPath)");
  const publish = source.indexOf("fs.rename(temporaryPath, filePath)");
  assert.ok(dump >= 0 && dump < verify && verify < publish);
  assert.match(source, /fs\.rm\(temporaryPath, \{ force: true \}\)/);
});

test("excluye amcheck para que la restauracion sea verificable sin superusuario", () => {
  assert.match(source, /"--exclude-extension=amcheck"/);
  assert.match(source, /"--no-owner"/);
  assert.match(source, /"--no-privileges"/);
});

test("usa bloqueo entre procesos y comprueba espacio antes de pg_dump", () => {
  const lock = source.indexOf("acquireProcessLock()");
  const disk = source.indexOf("assertFreeDiskSpace()");
  const dump = source.indexOf("executePgDump(temporaryPath)");
  assert.ok(lock >= 0 && lock < disk && disk < dump);
  assert.match(source, /fs\.open\(lockPath, "wx"\)/);
  assert.match(source, /fs\.statfs\(config\.backups\.dir\)/);
});
