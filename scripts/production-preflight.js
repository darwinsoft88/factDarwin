const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const steps = [
  { label: "TypeScript app", command: "npm", args: ["run", "typecheck"], cwd: root },
  { label: "Lint app", command: "npm", args: ["run", "lint"], cwd: root },
  { label: "Tests app", command: "npm", args: ["test"], cwd: root },
  { label: "Backend syntax", command: "npm", args: ["run", "check:backend"], cwd: root },
  { label: "App production config", command: "npm", args: ["run", "check:production"], cwd: root },
  { label: "Backend production config", command: "npm", args: ["run", "check:production"], cwd: path.join(root, "backend") },
  { label: "Backend tenant isolation", command: "npm", args: ["run", "check:tenant"], cwd: path.join(root, "backend") },
  { label: "Backend production indexes", command: "npm", args: ["run", "check:indexes"], cwd: path.join(root, "backend") },
  { label: "Release status", command: "npm", args: ["run", "release:status"], cwd: root }
];

for (const step of steps) {
  console.log(`\n== ${step.label} ==`);
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    shell: true,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    console.error(`\nPreflight detenido en: ${step.label}`);
    process.exit(result.status || 1);
  }
}

console.log("\nPreflight produccion OK. Puede generar APK/AAB con mas confianza.");
