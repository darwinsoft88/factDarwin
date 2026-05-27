export function parseDecimal(value: string) {
  return Number(value.replace(",", "."));
}

export function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function sanitizeDecimalInput(value: string): string {
  const normalized = String(value || "").replace(",", ".");
  const parts = normalized.replace(/[^\d.]/g, "").split(".");
  const whole = parts[0] || "";
  if (parts.length === 1) return whole;
  return `${whole}.${parts.slice(1).join("")}`;
}

export function sanitizeIntegerInput(value: string): string {
  return String(value || "").replace(/\D/g, "");
}
