import { UserRole } from "../types";

export const documentTypeOptions = [
  { label: "Factura", value: "factura" },
  { label: "Nota de venta", value: "nota_venta" },
  { label: "Proforma", value: "proforma" }
];

export const paymentOptions = [
  { label: "01 - sin sistema financiero", value: "01" },
  { label: "20 - otros sistema financiero", value: "20" },
  { label: "16 - Tarjeta debito", value: "16" },
  { label: "19 - Tarjeta credito", value: "19" },
  { label: "15 - Compensacion de deudas", value: "15" },
  { label: "17 - Dinero electronico", value: "17" },
  { label: "18 - Tarjeta prepago", value: "18" },
  { label: "21 - Endoso de titulos", value: "21" }
];

export const roleOptions: { label: string; value: UserRole }[] = [
  { label: "Administrador", value: "admin" },
  { label: "Vendedor", value: "vendedor" },
  { label: "Cajero", value: "cajero" },
  { label: "Contador", value: "contador" }
];

export const licensePlanOptions = [
  { label: "Demo", value: "trial" },
  { label: "Basico mensual", value: "basico_mensual" },
  { label: "Basico anual", value: "basico_anual" },
  { label: "Pro mensual", value: "pro_mensual" },
  { label: "Pro anual", value: "pro_anual" }
];

export const retentionTaxOptions = [
  { label: "IVA", value: "IVA" },
  { label: "Fuente / renta", value: "RENTA" }
];

export const monthOptions = [
  { label: "Enero", value: "1" },
  { label: "Febrero", value: "2" },
  { label: "Marzo", value: "3" },
  { label: "Abril", value: "4" },
  { label: "Mayo", value: "5" },
  { label: "Junio", value: "6" },
  { label: "Julio", value: "7" },
  { label: "Agosto", value: "8" },
  { label: "Septiembre", value: "9" },
  { label: "Octubre", value: "10" },
  { label: "Noviembre", value: "11" },
  { label: "Diciembre", value: "12" }
];
