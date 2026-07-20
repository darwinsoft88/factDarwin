import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Empty, Section } from "./common";
import { ReportRow } from "./metrics";
import { useReportsState } from "../hooks/useReportsState";
import { money } from "../sri";
import { paymentLabel } from "../utils/reportFormats";
import { reportItemFilterLabel } from "../utils/reports";

type SalesReportSummary = ReturnType<typeof useReportsState>["report"];

export function TaxSummarySection({ report, embedded = false }: { report: SalesReportSummary; embedded?: boolean }) {
  const content = (
    <>
      <ReportRow label="Periodo" value={report.label} />
      <ReportRow label="Tipo de reporte" value={report.reportType === "tax" ? "Tributario / contador" : "Operativo"} />
      <ReportRow label="Items" value={reportItemFilterLabel(report.itemFilter)} />
      <ReportRow label="Documentos del periodo" value={String(report.sales.length)} />
      <ReportRow label="Documentos con valor" value={String(report.effectiveCount)} />
      <ReportRow label="Facturas autorizadas" value={String(report.authorizedCount)} />
      <ReportRow label="Notas de credito" value={String(report.creditNoteCount)} />
      <ReportRow label="Notas de venta" value={String(report.internalCount)} />
      <ReportRow label="Proformas" value={String(report.proformaCount)} />
      <ReportRow label="Convertidas / saldo cero" value={String(report.convertedCount)} />
      <ReportRow label="Anuladas / sin efecto tributario" value={String(report.voidedCount)} />
      <ReportRow label="Rechazadas" value={String(report.rejectedCount)} />
      <ReportRow label="Subtotal gravado 15%" value={`$${money(report.subtotal15)}`} />
      <ReportRow label="Subtotal tarifa 0%" value={`$${money(report.subtotal0)}`} />
      <ReportRow label="Total descuentos" value={`$${money(report.discount)}`} />
      <ReportRow label="Subtotal no objeto de IVA" value="$0.00" />
      <ReportRow label="Subtotal exento de IVA" value="$0.00" />
      <ReportRow label="Total sin impuestos" value={`$${money(report.subtotal)}`} />
      <ReportRow label="IVA causado" value={`$${money(report.iva15)}`} />
      <ReportRow label="Total facturado" value={`$${money(report.total)}`} />
      <ReportRow label="Retenciones IVA recibidas" value={`$${money(report.retentionIva)}`} />
      <ReportRow label="Retenciones fuente recibidas" value={`$${money(report.retentionRenta)}`} />
      <ReportRow label="Neto despues de retenciones" value={`$${money(report.netCollected)}`} strong />
    </>
  );

  if (embedded) return <View style={styles.embedded}>{content}</View>;
  return (
    <Section title="Resumen tributario">
      {content}
    </Section>
  );
}

export function Iva104SummarySection({ report, embedded = false }: { report: SalesReportSummary; embedded?: boolean }) {
  const content = (
    <>
      <ReportRow label="Ventas tarifa diferente de cero - bruto" value={`$${money(report.iva104.salesVatGross)}`} />
      <ReportRow label="Notas de credito tarifa diferente de cero" value={`$${money(report.iva104.creditVat)}`} />
      <ReportRow label="Ventas tarifa diferente de cero - neto" value={`$${money(report.iva104.salesVatNet)}`} />
      <ReportRow label="Ventas tarifa 0% - bruto" value={`$${money(report.iva104.salesZeroGross)}`} />
      <ReportRow label="Notas de credito tarifa 0%" value={`$${money(report.iva104.creditZero)}`} />
      <ReportRow label="Ventas tarifa 0% - neto" value={`$${money(report.iva104.salesZeroNet)}`} />
      <ReportRow label="IVA generado bruto" value={`$${money(report.iva104.ivaGeneratedGross)}`} />
      <ReportRow label="IVA notas de credito" value={`$${money(report.iva104.ivaCreditNotes)}`} />
      <ReportRow label="IVA generado neto" value={`$${money(report.iva104.ivaGeneratedNet)}`} />
      <ReportRow label="Retenciones IVA recibidas" value={`$${money(report.iva104.retentionIva)}`} />
      <ReportRow label="IVA estimado a pagar" value={`$${money(report.iva104.estimatedIvaPayable)}`} strong />
      <Text style={styles.paragraph}>Resumen preparado con ventas, notas de credito y retenciones recibidas. No incluye compras, credito tributario anterior, activos fijos, importaciones, ajustes, intereses ni multas.</Text>
    </>
  );

  if (embedded) return <View style={styles.embedded}>{content}</View>;
  return (
    <Section title="Resumen IVA / Formulario 104">
      {content}
    </Section>
  );
}

export function PaymentSummarySection({ report, embedded = false }: { report: SalesReportSummary; embedded?: boolean }) {
  const collectedEntries = Object.entries(report.byPayment).filter(([code]) => code !== "CREDITO");
  const collectedTotal = collectedEntries.reduce((sum, [, total]) => sum + total, 0);
  const creditTotal = report.byPayment.CREDITO || 0;

  const content = (
    <>
      <ReportRow label="Dinero cobrado" value={`$${money(collectedTotal)}`} strong />
      {collectedEntries.length === 0 ? <Empty text="No hay cobros por forma de pago en este periodo." /> : null}
      {collectedEntries.map(([code, total]) => (
        <ReportRow key={code} label={paymentLabel(code)} value={`$${money(total)}`} />
      ))}
      {creditTotal > 0 ? <ReportRow label="Credito generado / cuentas por cobrar" value={`$${money(creditTotal)}`} strong /> : null}
    </>
  );

  if (embedded) return <View style={styles.embedded}>{content}</View>;
  return (
    <Section title="Formas de cobro">
      {content}
    </Section>
  );
}

const styles = StyleSheet.create({
  embedded: {
    gap: 0
  },
  paragraph: {
    color: "#4b5563",
    fontSize: 12,
    lineHeight: 20
  }
});
