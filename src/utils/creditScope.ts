import { AppData } from "../types";
import { documentScopeId } from "./documents";

export type CreditScopeFilter = "active" | "all";

export function scopeCreditData(data: AppData, scopeFilter: CreditScopeFilter, activeScopeId: string): AppData {
  if (scopeFilter === "all") return data;
  const sales = (data.sales || []).filter((sale) => documentScopeId(sale, data.issuer) === activeScopeId);
  const saleIds = new Set(sales.map((sale) => sale.id));
  return {
    ...data,
    sales,
    creditPayments: (data.creditPayments || []).filter((payment) => saleIds.has(payment.saleId))
  };
}
