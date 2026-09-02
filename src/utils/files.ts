export function pickWebFile(accept: string): Promise<File | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let resolved = false;
    let focusTimer: number | undefined;
    const finish = (file: File | null) => {
      if (resolved) return;
      resolved = true;
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
      window.removeEventListener("focus", handleFocus);
      input.remove();
      resolve(file);
    };
    const handleFocus = () => {
      // Safari/iOS puede devolver el foco antes de publicar input.files.
      // onchange/oncancel son la autoridad; este temporizador es solo respaldo.
      focusTimer = window.setTimeout(() => {
        finish(input.files?.[0] || null);
      }, 1500);
    };
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.onchange = () => finish(input.files?.[0] || null);
    input.oncancel = () => finish(null);
    document.body.appendChild(input);
    window.addEventListener("focus", handleFocus);
    input.click();
  });
}

export function readWebFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() || "" : result);
    };
    reader.readAsDataURL(file);
  });
}
