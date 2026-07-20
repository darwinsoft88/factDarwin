const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const webDir = path.join(root, "web");
const assetsDir = path.join(root, "assets");
const distAssetsDir = path.join(distDir, "assets");
const indexPath = path.join(distDir, "index.html");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function copyFile(source, target) {
  if (!fs.existsSync(source)) fail(`No existe: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

if (!fs.existsSync(distDir)) {
  fail("No existe dist. Ejecute primero: npx expo export --platform web");
}

copyFile(path.join(webDir, "manifest.json"), path.join(distDir, "manifest.json"));
copyFile(path.join(assetsDir, "icon.png"), path.join(distAssetsDir, "icon.png"));
copyFile(path.join(assetsDir, "adaptive-icon.png"), path.join(distAssetsDir, "adaptive-icon.png"));
copyFile(path.join(assetsDir, "splash-icon.png"), path.join(distAssetsDir, "splash-icon.png"));

let html = fs.readFileSync(indexPath, "utf8");

const tags = [
  '<meta name="theme-color" content="#0b6f68">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="FactuDarwin">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<link rel="manifest" href="/manifest.json">',
  '<link rel="apple-touch-icon" href="/assets/icon.png">',
];

for (const tag of tags) {
  const marker = tag.replace(/\s+/g, " ").trim();
  if (!html.replace(/\s+/g, " ").includes(marker)) {
    html = html.replace("</head>", `${tag}\n</head>`);
  }
}

const iosPwaStyle = `<style id="factudarwin-pwa-ios-fixes">
  html,
  body,
  #root {
    width: 100%;
    max-width: 100%;
    min-height: 100%;
    margin: 0;
    overflow-x: hidden;
    overscroll-behavior-x: none;
    -webkit-text-size-adjust: 100%;
    touch-action: manipulation;
    background: #f5f7fb;
  }

  * {
    box-sizing: border-box;
  }

  input,
  textarea,
  select,
  [contenteditable="true"] {
    font-size: 16px !important;
  }

  #root > div {
    width: 100%;
    max-width: 100vw;
    overflow-x: hidden;
  }
</style>`;

if (!html.includes('id="factudarwin-pwa-ios-fixes"')) {
  html = html.replace("</head>", `${iosPwaStyle}\n</head>`);
}

html = html.replace(
  '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />'
);
html = html.replace(
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />'
);
html = html.replace("You need to enable JavaScript to run this app.", "Se necesita JavaScript para ejecutar esta aplicacion.");

fs.writeFileSync(indexPath, html);
console.log("PWA listo en dist: manifest, iconos y metadatos iOS configurados.");
