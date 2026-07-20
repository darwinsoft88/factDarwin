const fs = require("node:fs");
const path = require("node:path");

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Uso: node scripts/make-simple-pdf.js entrada.md salida.pdf");
  process.exit(1);
}

const source = fs.readFileSync(path.resolve(inputPath), "utf8");
const output = path.resolve(outputPath);

const pageWidth = 612;
const pageHeight = 792;
const marginX = 54;
const marginTop = 54;
const marginBottom = 54;
const normalSize = 10;
const headingSize = 15;
const titleSize = 19;
const lineGap = 14;
const codeIndent = 14;
const usableChars = 88;

function normalize(line) {
  return line.replace(/\t/g, "  ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-");
}

function wrapLine(line, maxChars) {
  if (!line.trim()) return [""];
  if (line.length <= maxChars) return [line];
  const parts = [];
  let current = "";
  for (const word of line.split(/\s+/)) {
    if (!current) {
      current = word;
      continue;
    }
    if ((current + " " + word).length > maxChars) {
      parts.push(current);
      current = word;
    } else {
      current += " " + word;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function escapePdfText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const logicalLines = [];
let inCode = false;

for (const rawLine of source.split(/\r?\n/)) {
  const line = normalize(rawLine);
  if (line.startsWith("```")) {
    inCode = !inCode;
    logicalLines.push({ text: "", size: normalSize, font: "F1", indent: 0 });
    continue;
  }

  if (inCode) {
    logicalLines.push({ text: line || " ", size: 9, font: "F2", indent: codeIndent });
    continue;
  }

  if (line.startsWith("# ")) {
    logicalLines.push({ text: line.replace(/^#\s+/, ""), size: titleSize, font: "F1", indent: 0, gapBefore: 8, gapAfter: 4 });
    continue;
  }

  if (line.startsWith("## ")) {
    logicalLines.push({ text: line.replace(/^##\s+/, ""), size: headingSize, font: "F1", indent: 0, gapBefore: 10, gapAfter: 2 });
    continue;
  }

  if (line.startsWith("- ")) {
    for (const wrapped of wrapLine(line.replace(/^- /, "- "), usableChars - 4)) {
      logicalLines.push({ text: wrapped, size: normalSize, font: "F1", indent: 10 });
    }
    continue;
  }

  const numbered = line.match(/^(\d+)\.\s+(.*)$/);
  if (numbered) {
    for (const wrapped of wrapLine(line, usableChars - 4)) {
      logicalLines.push({ text: wrapped, size: normalSize, font: "F1", indent: 10 });
    }
    continue;
  }

  for (const wrapped of wrapLine(line, usableChars)) {
    logicalLines.push({ text: wrapped, size: normalSize, font: "F1", indent: 0 });
  }
}

const pages = [];
let current = [];
let y = pageHeight - marginTop;

function newPage() {
  pages.push(current);
  current = [];
  y = pageHeight - marginTop;
}

for (const line of logicalLines) {
  const before = line.gapBefore || 0;
  const after = line.gapAfter || 0;
  const needed = before + lineGap + after;
  if (y - needed < marginBottom) newPage();
  y -= before;
  current.push({ ...line, y });
  y -= lineGap + after;
}
if (current.length) pages.push(current);

const objects = [];
function addObject(body) {
  objects.push(body);
  return objects.length;
}

const fontRegular = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const fontMono = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
const pageObjectIds = [];
const contentObjectIds = [];

for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
  const commands = ["BT"];
  for (const line of pages[pageIndex]) {
    const x = marginX + line.indent;
    commands.push(`/${line.font} ${line.size} Tf`);
    commands.push(`${x} ${line.y} Td (${escapePdfText(line.text)}) Tj`);
    commands.push(`${-x} ${-line.y} Td`);
  }
  commands.push("ET");
  commands.push("BT /F1 8 Tf");
  commands.push(`${pageWidth - marginX - 50} 28 Td (${pageIndex + 1}/${pages.length}) Tj`);
  commands.push("ET");
  const stream = commands.join("\n");
  const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
  contentObjectIds.push(contentId);
  pageObjectIds.push(addObject(""));
}

const pagesId = addObject("");
const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

for (let i = 0; i < pageObjectIds.length; i += 1) {
  objects[pageObjectIds[i] - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontMono} 0 R >> >> /Contents ${contentObjectIds[i]} 0 R >>`;
}

objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

let pdf = "%PDF-1.4\n";
const offsets = [0];
for (let i = 0; i < objects.length; i += 1) {
  offsets.push(Buffer.byteLength(pdf, "utf8"));
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
}
const xrefOffset = Buffer.byteLength(pdf, "utf8");
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (let i = 1; i < offsets.length; i += 1) {
  pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, pdf, "binary");
console.log(`PDF generado: ${output}`);
