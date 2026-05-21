import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import { Sale } from "../types";
import { escapeHtml, sanitizeFileName } from "./format";

export function mmToPrintPx(mm: number) {
  return Math.round((mm / 25.4) * 72);
}

export function estimateTicketPageHeightMm(sale: Sale) {
  const itemLines = sale.items.reduce((sum, item) => sum + Math.max(1, Math.ceil(String(item.name || "").length / 24)), 0);
  return Math.min(300, Math.max(120, 102 + itemLines * 8));
}

export async function handlePdfDocument(html: string, dialogTitle: string, documentTitle: string) {
  const file = await Print.printToFileAsync({ html, base64: false });
  const uri = await prepareGeneratedFile(file.uri, documentTitle, "pdf");

  if (Platform.OS === "web") return;

  Alert.alert(`${documentTitle} listo`, "Elija que desea hacer con el PDF.", [
    {
      text: "Ver",
      onPress: () => {
        void openPdfFile(uri, documentTitle);
      }
    },
    {
      text: "Enviar/guardar",
      onPress: () => {
        void shareGeneratedFile(uri, "application/pdf", dialogTitle, documentTitle);
      }
    },
    { text: "Cerrar", style: "cancel" }
  ]);
}

export async function handleTicketDocument(html: string, dialogTitle: string, pageHeightMm: number) {
  if (Platform.OS === "web") return;
  const ticketPrintOptions = {
    html,
    width: mmToPrintPx(TICKET_PRINT_WIDTH_MM),
    height: mmToPrintPx(pageHeightMm),
    margins: { top: 0, right: 0, bottom: 0, left: 0 }
  };

  Alert.alert("Ticket POS listo", "Elija como desea sacar el ticket.", [
    {
      text: "Imprimir 80mm",
      onPress: () => {
        void Print.printAsync(ticketPrintOptions).catch((error) => {
          Alert.alert("No se pudo imprimir", error instanceof Error ? error.message : "Revise la impresora e intente nuevamente.");
        });
      }
    },
    {
      text: "Guardar PDF",
      onPress: async () => {
        try {
          const file = await Print.printToFileAsync({ ...ticketPrintOptions, base64: false });
          const uri = await prepareGeneratedFile(file.uri, "Ticket POS", "pdf");
          await shareGeneratedFile(uri, "application/pdf", dialogTitle, "Ticket POS");
        } catch (error) {
          Alert.alert("No se pudo guardar", error instanceof Error ? error.message : "Intente nuevamente.");
        }
      }
    },
    { text: "Cerrar", style: "cancel" }
  ]);
}

export async function createPdfBase64(html: string) {
  if (Platform.OS === "web") return "";
  const file = await Print.printToFileAsync({ html, base64: true });
  if (file.base64) return file.base64;
  if (file.uri) return FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
  return "";
}

const TICKET_PRINT_WIDTH_MM = 80;

export function openHtmlViewer(html: string, title: string) {
  if (typeof window === "undefined" || !("document" in window)) return;

  const viewerHtml = buildHtmlViewerDocument(html, title);
  const tab = window.open("", "_blank");
  if (!tab) {
    Alert.alert("Ventana bloqueada", "Permita ventanas emergentes para ver el documento.");
    return;
  }

  tab.document.open();
  tab.document.write(viewerHtml);
  tab.document.close();
  tab.focus();
}

export async function prepareGeneratedFile(uri: string, title: string, extension: string) {
  const baseDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDirectory) return uri;

  const namedUri = `${baseDirectory}${sanitizeFileName(title)}-${Date.now()}.${extension}`;
  try {
    await FileSystem.copyAsync({ from: uri, to: namedUri });
    return namedUri;
  } catch {
    return uri;
  }
}

export async function openPdfFile(uri: string, fallbackTitle: string) {
  if (Platform.OS === "android") {
    try {
      const contentUri = await FileSystem.getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1,
        type: "application/pdf"
      });
      return;
    } catch {
      // Fall back to the share sheet when the device has no PDF viewer available.
    }
  }

  await shareGeneratedFile(uri, "application/pdf", fallbackTitle, fallbackTitle);
}

export async function shareGeneratedFile(uri: string, mimeType: string, dialogTitle: string, fallbackTitle: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle
    });
  } else {
    Alert.alert(fallbackTitle, uri);
  }
}

function buildHtmlViewerDocument(html: string, title: string) {
  const safeTitle = escapeHtml(title);
  const htmlPayload = JSON.stringify(html);
  const fileName = `${sanitizeFileName(title)}.html`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; height: 100%; font-family: Arial, sans-serif; background: #e5e7eb; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      background: #0f766e;
      color: #fff;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.2);
    }
    .title { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    button {
      border: 0;
      border-radius: 8px;
      padding: 9px 12px;
      font-weight: 800;
      color: #0f172a;
      background: #fff;
      cursor: pointer;
    }
    iframe { width: 100%; height: calc(100vh - 56px); border: 0; background: #fff; display: block; }
    @media print { .toolbar { display: none; } iframe { height: 100vh; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="title">${safeTitle}</div>
    <div class="actions">
      <button onclick="printDocument()">Imprimir / Guardar PDF</button>
      <button onclick="downloadHtml()">Descargar HTML</button>
    </div>
  </div>
  <iframe id="documentFrame" title="${safeTitle}"></iframe>
  <script>
    const documentHtml = ${htmlPayload};
    const blob = new Blob([documentHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const frame = document.getElementById("documentFrame");
    frame.src = url;
    function printDocument() {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    }
    function downloadHtml() {
      const link = document.createElement("a");
      link.href = url;
      link.download = ${JSON.stringify(fileName)};
      link.click();
    }
    window.addEventListener("beforeunload", () => URL.revokeObjectURL(url));
  </script>
</body>
</html>`;
}
