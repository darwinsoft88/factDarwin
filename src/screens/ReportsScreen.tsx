import * as FileSystem from "expo-file-system/legacy";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import { Empty, LoadMoreButton, PrimaryButton, Section, Select } from "../components/common";
import { ReportRow, StatBox } from "../components/metrics";
import { LIST_BATCH_SIZE } from "../constants/app";
import { monthOptions } from "../constants/options";
import { AppData, Sale } from "../types";
import { accountingMoney, saleProfitValue } from "../utils/accounting";
import { activeScopeId, documentNumber, scopedReportData } from "../utils/documents";
import { showMessage } from "../utils/dialogs";
import { normalizedEstablishments } from "../utils/establishments";
import { formatShortDate, sanitizeFileName, toInputDate } from "../utils/format";
import { handlePdfDocument, openHtmlViewer, shareGeneratedFile } from "../utils/printFiles";
import { buildMobileReportHtml, buildReportExcelHtml, buildReportHtml, formatIva104Report, formatSalesReport } from "../utils/reportFormats";
import { buildSalesReport } from "../utils/reports";
import { documentTypeLabel } from "../utils/sales";
import { money } from "../services/sri";

type ReportsListItemProps = {
  title: string;
  meta: string;
  badge?: string;
};

type CalendarDateInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function ReportsScreen({
  data,
  onReport,
  ListItemComponent,
  CalendarDateInputComponent
}: {
  data: AppData;
  onReport: (value: string) => void;
  ListItemComponent: React.ComponentType<ReportsListItemProps>;
  CalendarDateInputComponent: React.ComponentType<CalendarDateInputProps>;
}) {
  const now = new Date();
  const establishmentOptions = normalizedEstablishments(data.issuer);
  const [establishmentFilter, setEstablishmentFilter] = useState(activeScopeId(data));
  const reportData = useMemo(() => establishmentFilter === "all" ? data : scopedReportData(data, establishmentFilter), [data, establishmentFilter]);
  const currentYear = String(new Date().getFullYear());
  const availableYears = Array.from(new Set([
    currentYear,
    ...reportData.sales.map((sale) => String(new Date(sale.createdAt).getFullYear())),
    ...(reportData.receivedRetentions || []).map((retention) => String(new Date(retention.receivedAt).getFullYear()))
  ])).sort((a, b) => Number(b) - Number(a));
  const [periodType, setPeriodType] = useState("monthly");
  const [year, setYear] = useState(availableYears[0] || currentYear);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [semester, setSemester] = useState("1");
  const [startDate, setStartDate] = useState(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [endDate, setEndDate] = useState(toInputDate(now));
  const [reportType, setReportType] = useState("tax");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [visibleReportSaleCount, setVisibleReportSaleCount] = useState(LIST_BATCH_SIZE);

  const report = useMemo(() => buildSalesReport(reportData, periodType, year, month, semester, startDate, endDate, reportType, documentFilter), [reportData, periodType, year, month, semester, startDate, endDate, reportType, documentFilter]);
  const visibleReportSales = report.sales.slice(0, visibleReportSaleCount);

  useEffect(() => {
    setVisibleReportSaleCount(LIST_BATCH_SIZE);
  }, [documentFilter, endDate, month, periodType, reportType, semester, startDate, year]);

  const exportPdf = async () => {
    const html = buildReportHtml(report, reportData);
    if (Platform.OS === "web") {
      openHtmlViewer(html, `Reporte ${report.label}`);
      return;
    }

    await handlePdfDocument(html, `Reporte ${report.label}`, "Reporte PDF");
  };

  const exportExcel = async () => {
    const excelHtml = buildReportExcelHtml(report, reportData);
    const fileName = `reporte-ventas-${sanitizeFileName(report.label)}.xls`;

    if (Platform.OS === "web") {
      const blob = new Blob([`\uFEFF${excelHtml}`], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      showMessage("Excel generado", "El archivo Excel se descargo con exito.");
      return;
    }

    const htmlFileName = fileName.replace(/\.xls$/i, ".html");
    const html = buildMobileReportHtml(report, reportData);
    const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${htmlFileName}`;
    await FileSystem.writeAsStringAsync(uri, html, { encoding: FileSystem.EncodingType.UTF8 });
    Alert.alert("Reporte listo", "En movil se genera una vista HTML con tablas para revisar y compartir mejor.", [
      {
        text: "Ver resumen",
        onPress: () => onReport(formatSalesReport(report))
      },
      {
        text: "Enviar/guardar",
        onPress: () => {
          void shareGeneratedFile(uri, "text/html", "Exportar reporte", "Reporte generado");
        }
      },
      { text: "Cerrar", style: "cancel" }
    ]);
  };

  return (
    <View style={styles.stack}>
      <Section title="Reporte contable">
        <Text style={styles.paragraph}>El reporte tributario es para declaraciones: solo facturas autorizadas. El reporte operativo permite revisar todos los documentos, solo facturas o solo notas de venta.</Text>
        <Select
          label="Establecimiento"
          value={establishmentFilter}
          onChange={setEstablishmentFilter}
          options={[
            { label: "Toda la empresa", value: "all" },
            ...establishmentOptions.map((item) => ({ label: `${item.name} ${item.establishment}-${item.emissionPoint}`, value: item.id }))
          ]}
        />
        <Select
          label="Tipo de reporte"
          value={reportType}
          onChange={setReportType}
          options={[
            { label: "Tributario / contador", value: "tax" },
            { label: "Operativo / todos los movimientos", value: "operational" }
          ]}
        />
        {reportType === "operational" ? (
          <Select
            label="Documentos"
            value={documentFilter}
            onChange={setDocumentFilter}
            options={[
              { label: "Todos", value: "all" },
              { label: "Solo facturas", value: "factura" },
              { label: "Solo notas credito", value: "nota_credito" },
              { label: "Solo notas de venta", value: "nota_venta" },
              { label: "Solo proformas", value: "proforma" }
            ]}
          />
        ) : null}
        <Select
          label="Periodo"
          value={periodType}
          onChange={setPeriodType}
          options={[
            { label: "Mensual", value: "monthly" },
            { label: "Semestral", value: "semester" },
            { label: "Anual", value: "annual" },
            { label: "Rango fechas", value: "custom" }
          ]}
        />
        {periodType !== "custom" ? <Select label="Anio" value={year} onChange={setYear} options={availableYears.map((item) => ({ label: item, value: item }))} /> : null}
        {periodType === "monthly" ? <Select label="Mes" value={month} onChange={setMonth} options={monthOptions} /> : null}
        {periodType === "semester" ? (
          <Select
            label="Semestre"
            value={semester}
            onChange={setSemester}
            options={[
              { label: "Enero - Junio", value: "1" },
              { label: "Julio - Diciembre", value: "2" }
            ]}
          />
        ) : null}
        {periodType === "custom" ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <CalendarDateInputComponent label="Fecha inicio" value={startDate} onChange={setStartDate} />
            </View>
            <View style={styles.flex}>
              <CalendarDateInputComponent label="Fecha fin" value={endDate} onChange={setEndDate} />
            </View>
          </View>
        ) : null}
        <View style={styles.statsGrid}>
          <StatBox label="Documentos" value={String(report.sales.length)} />
          <StatBox label="Con valor" value={String(report.effectiveCount)} />
          <StatBox label="Autorizadas" value={String(report.authorizedCount)} />
          <StatBox label="Notas credito" value={String(report.creditNoteCount)} />
          <StatBox label="Notas venta" value={String(report.internalCount)} />
          <StatBox label="Proformas" value={String(report.proformaCount)} />
          <StatBox label="Anuladas" value={String(report.voidedCount)} />
          <StatBox label="Rechazadas" value={String(report.rejectedCount)} />
          <StatBox label="Subtotal 15%" value={`$${money(report.subtotal15)}`} />
          <StatBox label="Subtotal 0%" value={`$${money(report.subtotal0)}`} />
          <StatBox label="Descuentos" value={`$${money(report.discount)}`} />
          <StatBox label="IVA 15%" value={`$${money(report.iva15)}`} />
          <StatBox label="Subtotal" value={`$${money(report.subtotal)}`} />
          <StatBox label="Costo" value={`$${money(report.cost)}`} />
          <StatBox label="Utilidad" value={`$${money(report.profit)}`} />
          <StatBox label="Total ventas" value={`$${money(report.total)}`} />
          <StatBox label="Ret. IVA" value={`$${money(report.retentionIva)}`} />
          <StatBox label="Ret. fuente" value={`$${money(report.retentionRenta)}`} />
          <StatBox label="Neto ret." value={`$${money(report.netCollected)}`} />
          <StatBox label="104 gravado" value={`$${money(report.iva104.salesVatNet)}`} />
          <StatBox label="104 IVA neto" value={`$${money(report.iva104.ivaGeneratedNet)}`} />
          <StatBox label="104 a pagar" value={`$${money(report.iva104.estimatedIvaPayable)}`} />
        </View>
        <PrimaryButton label="Vista contable" onPress={() => onReport(formatSalesReport(report))} />
        <PrimaryButton label="Vista IVA 104" onPress={() => onReport(formatIva104Report(report))} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <PrimaryButton label="Ver PDF" onPress={exportPdf} />
          </View>
          <View style={styles.flex}>
            <PrimaryButton label="Excel / guardar" onPress={exportExcel} />
          </View>
        </View>
      </Section>

      <Section title="Resumen tributario">
        <ReportRow label="Periodo" value={report.label} />
        <ReportRow label="Tipo de reporte" value={report.reportType === "tax" ? "Tributario / contador" : "Operativo"} />
        <ReportRow label="Documentos del periodo" value={String(report.sales.length)} />
        <ReportRow label="Documentos con valor" value={String(report.effectiveCount)} />
        <ReportRow label="Facturas autorizadas" value={String(report.authorizedCount)} />
        <ReportRow label="Notas de credito" value={String(report.creditNoteCount)} />
        <ReportRow label="Notas de venta" value={String(report.internalCount)} />
        <ReportRow label="Proformas" value={String(report.proformaCount)} />
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
      </Section>

      <Section title="Resumen IVA / Formulario 104">
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
      </Section>

      <Section title="Facturas del periodo">
        {report.sales.length === 0 ? <Empty text="No hay facturas en este periodo." /> : null}
        {visibleReportSales.map((sale: Sale) => {
          const client = reportData.clients.find((item) => item.id === sale.clientId);
          return (
            <ListItemComponent
              key={sale.id}
              title={`${documentNumber(sale, data.issuer)} - ${client?.name ?? "Cliente"}`}
              meta={`${documentTypeLabel(sale)} | ${formatShortDate(sale.createdAt)} | Base $${accountingMoney(sale, sale.subtotal)} | IVA $${accountingMoney(sale, sale.tax)} | Total $${accountingMoney(sale, sale.total)} | Util. $${money(saleProfitValue(sale, reportData.products))}${sale.voidReason ? ` | ${sale.voidReason}` : ""}`}
              badge={sale.status}
            />
          );
        })}
        {visibleReportSales.length < report.sales.length ? <LoadMoreButton label="Cargar mas facturas" onPress={() => setVisibleReportSaleCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  },
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
});
