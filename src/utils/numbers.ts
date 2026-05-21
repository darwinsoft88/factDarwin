export function parseDecimal(value: string) {
  return Number(value.replace(",", "."));
}

export function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
