export function installWebDomGuards() {
  if (typeof document === "undefined") return;

  const markAsNotranslate = (element?: Element | null) => {
    if (!element) return;
    element.setAttribute("translate", "no");
    element.classList.add("notranslate");
  };

  const markDocument = () => {
    document.documentElement.setAttribute("lang", "es");
    markAsNotranslate(document.documentElement);
    markAsNotranslate(document.body);

    document
      .querySelectorAll("#root, #main, [data-reactroot], [data-testid='root']")
      .forEach(markAsNotranslate);
  };

  let googleMeta = document.querySelector<HTMLMetaElement>('meta[name="google"]');
  if (!googleMeta) {
    googleMeta = document.createElement("meta");
    googleMeta.name = "google";
    document.head.appendChild(googleMeta);
  }
  googleMeta.content = "notranslate";

  markDocument();

  if (typeof window !== "undefined") {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(markDocument);
    }
    window.setTimeout(markDocument, 250);
  }
}
