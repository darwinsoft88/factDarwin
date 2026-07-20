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
  const additionalInfoLines = (sale.additionalInfo || []).reduce((sum, field) => {
    const text = `${field.name || ""} ${field.value || ""}`.trim();
    return sum + (text ? Math.max(1, Math.ceil(text.length / 34)) : 0);
  }, 0);

  return Math.min(300, Math.max(105, 90 + itemLines * 8 + additionalInfoLines * 4));
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

export async function handleThermalPdfDocument(html: string, dialogTitle: string, documentTitle: string, pageHeightMm: number) {
  if (Platform.OS === "web") return;
  const printOptions = {
    html,
    width: mmToPrintPx(TICKET_PRINT_WIDTH_MM),
    height: mmToPrintPx(pageHeightMm),
    margins: { top: 0, right: 0, bottom: 0, left: 0 }
  };

  try {
    const file = await Print.printToFileAsync({ ...printOptions, base64: false });
    const uri = await prepareGeneratedFile(file.uri, documentTitle, "pdf");
    Alert.alert(`${documentTitle} listo`, "Elija que desea hacer con el comprobante 80mm.", [
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
  } catch (error) {
    Alert.alert("No se pudo generar", error instanceof Error ? error.message : "Intente nuevamente.");
  }
}

export async function createThermalPdfFile(html: string, documentTitle: string, pageHeightMm: number) {
  const file = await Print.printToFileAsync({
    html,
    width: mmToPrintPx(TICKET_PRINT_WIDTH_MM),
    height: mmToPrintPx(pageHeightMm),
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    base64: false
  });
  return prepareGeneratedFile(file.uri, documentTitle, "pdf");
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
  const fileNamePayload = JSON.stringify(fileName);
  const titlePayload = JSON.stringify(title);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; min-height: 100%; font-family: Arial, sans-serif; background: #eef2f7; color: #0f172a; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 10px;
      background: #0f766e;
      color: #fff;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.2);
    }
    .left { display: flex; align-items: center; gap: 8px; min-width: 0; }
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
    .back-button {
      flex: 0 0 auto;
      min-width: 42px;
      color: #fff;
      background: rgba(255,255,255,0.16);
      border: 1px solid rgba(255,255,255,0.35);
    }
    .share-button { color: #065f46; }
    .viewer-scroll {
      width: 100%;
      min-height: calc(100vh - 64px);
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      padding: 12px;
      box-sizing: border-box;
    }
    .frame-wrap {
      position: relative;
      margin: 0 auto;
      transform-origin: top left;
      background: #fff;
      box-shadow: 0 12px 34px rgba(15, 23, 42, 0.12);
      overflow: hidden;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      background: #fff;
      display: block;
      transform-origin: top left;
    }
    @media (max-width: 620px) {
      .toolbar { align-items: flex-start; flex-direction: column; gap: 8px; }
      .left, .actions { width: 100%; }
      .actions { display: grid; grid-template-columns: 1fr 1fr; }
      button { min-height: 40px; padding: 8px 10px; }
      .print-button { grid-column: span 2; }
      .viewer-scroll { min-height: calc(100vh - 136px); padding: 8px; }
    }
    @media print {
      html, body { background: #fff; }
      .toolbar { display: none; }
      .viewer-scroll { padding: 0; overflow: visible; }
      .frame-wrap { margin: 0; transform: none !important; width: 100% !important; height: auto !important; box-shadow: none; }
      iframe { height: 100vh; transform: none !important; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="left">
      <button class="back-button" onclick="goBackToApp()" aria-label="Volver a la app">&larr;</button>
      <div class="title">${safeTitle}</div>
    </div>
    <div class="actions">
      <button class="share-button" onclick="shareDocument()">Compartir WhatsApp</button>
      <button onclick="downloadHtml()">Descargar HTML</button>
      <button class="print-button" onclick="printDocument()">Imprimir / Guardar PDF</button>
    </div>
  </div>
  <main class="viewer-scroll" id="viewerScroll">
    <div class="frame-wrap" id="frameWrap">
      <iframe id="documentFrame" title="${safeTitle}"></iframe>
    </div>
  </main>
  <script>
    const documentHtml = ${htmlPayload};
    const documentTitle = ${titlePayload};
    const documentFileName = ${fileNamePayload};
    const blob = new Blob([documentHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const frame = document.getElementById("documentFrame");
    const frameWrap = document.getElementById("frameWrap");
    const viewerScroll = document.getElementById("viewerScroll");
    const isThermal = /@page\\s*\\{[^}]*80mm|width:\\s*80mm|class=["'](?:ticket|receipt)/i.test(documentHtml);
    const targetWidth = isThermal ? 326 : 794;

    frame.src = url;
    frame.addEventListener("load", resizeDocumentFrame);
    window.addEventListener("resize", resizeDocumentFrame);

    function resizeDocumentFrame() {
      const frameDoc = frame.contentDocument;
      if (!frameDoc || !frameDoc.body) return;
      const body = frameDoc.body;
      const docEl = frameDoc.documentElement;
      const measuredWidth = Math.max(targetWidth, body.scrollWidth || 0, docEl.scrollWidth || 0);
      const width = isThermal ? Math.min(measuredWidth, 360) : Math.max(targetWidth, measuredWidth);
      const available = Math.max(260, viewerScroll.clientWidth - 2);
      const scale = Math.min(1, available / width);
      const height = Math.max(body.scrollHeight || 0, docEl.scrollHeight || 0, 600);
      const scaledWidth = Math.ceil(width * scale);
      const scaledHeight = Math.ceil(height * scale);
      const toolbar = document.querySelector(".toolbar");
      const toolbarHeight = toolbar ? Math.ceil(toolbar.getBoundingClientRect().height) : 64;

      frameWrap.style.width = scaledWidth + "px";
      frameWrap.style.height = scaledHeight + "px";
      frameWrap.style.transform = "none";
      frameWrap.style.marginBottom = "12px";
      frame.style.width = width + "px";
      frame.style.height = height + "px";
      frame.style.transform = "scale(" + scale + ")";
      viewerScroll.style.minHeight = "calc(100vh - " + toolbarHeight + "px)";
      viewerScroll.style.paddingBottom = "calc(18px + env(safe-area-inset-bottom, 0px))";

      Array.from(frameDoc.images || []).forEach((image) => {
        if (!image.complete) image.addEventListener("load", resizeDocumentFrame, { once: true });
      });
    }

    setTimeout(resizeDocumentFrame, 250);
    setTimeout(resizeDocumentFrame, 900);

    function goBackToApp() {
      if (window.opener && !window.opener.closed) {
        window.close();
        return;
      }
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.href = "/";
    }
    function printDocument() {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    }
    function downloadHtml() {
      const link = document.createElement("a");
      link.href = url;
      link.download = documentFileName;
      link.click();
    }
    async function shareDocument() {
      const shareText = documentTitle + "\\nGenerado en FactuDarwin";
      try {
        const file = new File([documentHtml], documentFileName, { type: "text/html" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: documentTitle, text: shareText, files: [file] });
          return;
        }
        if (navigator.share) {
          await navigator.share({ title: documentTitle, text: shareText });
          return;
        }
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
      window.open("https://wa.me/?text=" + encodeURIComponent(shareText), "_blank", "noopener,noreferrer");
    }
    window.addEventListener("beforeunload", () => URL.revokeObjectURL(url));
  </script>
</body>
</html>`;
}
