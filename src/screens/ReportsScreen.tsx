import * as FileSystem from "expo-file-system/legacy";
import React from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import { CollapsibleSection, Empty, PrimaryButton, Section, Select } from "../components/common";
import { PaginationControls } from "../components/PaginationControls";
import { ReportStatsGrid } from "../components/ReportStatsGrid";
import { Iva104SummarySection, PaymentSummarySection, TaxSummarySection } from "../components/ReportSummarySections";
import { LIST_BATCH_SIZE } from "../constants/app";
import { monthOptions } from "../constants/options";
import { useReportsState } from "../hooks/useReportsState";
import { AppData, Sale } from "../types";
import { accountingMoney } from "../utils/accounting";
import { documentNumber } from "../utils/documents";
import { showMessage } from "../utils/dialogs";
import { formatShortDate, sanitizeFileName } from "../utils/format";
import { handlePdfDocument, openHtmlViewer, shareGeneratedFile } from "../utils/printFiles";
import { buildMobileReportHtml, buildReportExcelHtml, buildReportHtml, formatIva104Report, formatSalesReport } from "../utils/reportFormats";
import { saleProfitForItemFilter, saleSubtotalForItemFilter, saleTaxForItemFilter, saleTotalForItemFilter } from "../utils/reports";
import { documentTypeLabel } from "../utils/sales";
import { money } from "../sri";
import { useAppTheme } from "../theme/AppTheme";
import type { AccentCardTone } from "../components/ThemedAccentCard";

type ReportsListItemProps = {
  title: string;
  meta: string;
  badge?: string;
  accentTone?: AccentCardTone;
};

function reportDocumentAccentTone(status: string): AccentCardTone {
  if (status === "AUTORIZADA") return "success";
  if (status === "DEVUELTA" || status === "ERROR_SRI") return "danger";
  if (status === "PROFORMA") return "warning";
  if (["FIRMADA", "ENVIADA", "ENVIADA_SRI", "PENDIENTE_SRI", "EN_REVISION_SRI", "TICKET_OFFLINE"].includes(status)) return "info";
  return "primary";
}

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
  const { theme } = useAppTheme();
  const reportsState = useReportsState(data);
  const {
    availableYears,
    documentFilter,
    endDate,
    establishmentFilter,
    establishmentOptions,
    itemFilter,
    month,
    periodType,
    report,
    reportData,
    reportSalePagination,
    reportType,
    semester,
    setDocumentFilter,
    setEndDate,
    setEstablishmentFilter,
    setItemFilter,
    setMonth,
    setPeriodType,
    setReportSalePage,
    setReportType,
    setSemester,
    setStartDate,
    setYear,
    startDate,
    visibleReportSales,
    year
  } = reportsState;

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
        <View style={[styles.infoStrip, { borderColor: theme.colors.info, backgroundColor: theme.colors.infoSoft }]}>
          <Text style={[styles.infoText, { color: theme.colors.info }]}>Tributario para declaraciones. Operativo para revisar movimientos, notas y proformas.</Text>
        </View>
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
          label="Items"
          value={itemFilter}
          onChange={(value) => setItemFilter(value as "all" | "products" | "services")}
          options={[
            { label: "Todos", value: "all" },
            { label: "Solo productos", value: "products" },
            { label: "Solo servicios", value: "services" }
          ]}
        />
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
        <ReportStatsGrid report={report} />
        <CollapsibleSection title="Formas de cobro">
          <PaymentSummarySection report={report} embedded />
        </CollapsibleSection>
        <View style={styles.row}>
          <View style={styles.flex}>
            <PrimaryButton label="Vista contable" onPress={() => onReport(formatSalesReport(report))} />
          </View>
          <View style={styles.flex}>
            <PrimaryButton label="IVA 104" onPress={() => onReport(formatIva104Report(report))} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <PrimaryButton label="PDF" onPress={exportPdf} />
          </View>
          <View style={styles.flex}>
            <PrimaryButton label="Excel" onPress={exportExcel} />
          </View>
        </View>
      </Section>

      <CollapsibleSection title="Resumen tributario">
        <TaxSummarySection report={report} embedded />
      </CollapsibleSection>

      <CollapsibleSection title="Resumen IVA 104">
        <Iva104SummarySection report={report} embedded />
      </CollapsibleSection>

      <Section title="Documentos del periodo">
        {report.sales.length === 0 ? <Empty text="No hay documentos con ese filtro." /> : null}
        {visibleReportSales.map((sale: Sale) => {
          const client = reportData.clients.find((item) => item.id === sale.clientId);
          return (
            <ListItemComponent
              key={sale.id}
              title={`${documentNumber(sale, data.issuer)} - ${client?.name ?? "Cliente"}`}
              meta={`${documentTypeLabel(sale)} | ${formatShortDate(sale.createdAt)} | Base $${accountingMoney(sale, saleSubtotalForItemFilter(sale, itemFilter))} | IVA $${accountingMoney(sale, saleTaxForItemFilter(sale, itemFilter))} | Total $${accountingMoney(sale, saleTotalForItemFilter(sale, itemFilter))} | Util. $${money(saleProfitForItemFilter(sale, reportData.products, itemFilter))}${sale.voidReason ? ` | ${sale.voidReason}` : ""}`}
              badge={sale.status}
              accentTone={reportDocumentAccentTone(sale.status)}
            />
          );
        })}
        <PaginationControls page={reportSalePagination.currentPage} pageSize={LIST_BATCH_SIZE} totalItems={report.sales.length} onPageChange={setReportSalePage} />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  },
  infoStrip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#f0f9ff",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  infoText: {
    color: "#075985",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
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
  }
});
