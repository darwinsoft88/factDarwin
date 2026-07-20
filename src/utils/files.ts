export function pickWebFile(accept: string): Promise<File | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let resolved = false;
    const finish = (file: File | null) => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener("focus", handleFocus);
      resolve(file);
    };
    const handleFocus = () => {
      window.setTimeout(() => {
        finish(input.files?.[0] || null);
      }, 300);
    };
    input.type = "file";
    input.accept = accept;
    input.onchange = () => finish(input.files?.[0] || null);
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
