import { AppData } from "../types";
import { documentInEnvironment, documentScopeId } from "./documents";

export type CreditScopeFilter = "active" | "all";

export function scopeCreditData(data: AppData, scopeFilter: CreditScopeFilter, activeScopeId: string): AppData {
  const sales = (data.sales || []).filter((sale) => documentInEnvironment(sale, data.issuer.environment) && (scopeFilter === "all" || documentScopeId(sale, data.issuer) === activeScopeId));
  const saleIds = new Set(sales.map((sale) => sale.id));
  return {
    ...data,
    sales,
    creditPayments: (data.creditPayments || []).filter((payment) => saleIds.has(payment.saleId))
  };
}
