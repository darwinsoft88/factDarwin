export function resolveCompanyLogoUrl(logoUrl: string, backendUrl: string) {
  const value = String(logoUrl || "").trim();
  const base = String(backendUrl || "").trim().replace(/\/$/, "");
  if (!value) return "";
  if (value.startsWith("/")) return base ? `${base}${value}` : value;
  if (/^https?:\/\//i.test(value) && value.includes("/api/company/logo") && base) {
    try {
      const parsed = new URL(value);
      return `${base}${parsed.pathname}${parsed.search}`;
    } catch {
      return value;
    }
  }
  return value;
}
