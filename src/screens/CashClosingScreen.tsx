import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Empty, Input, LoadMoreButton, PrimaryButton, Section } from "../components/common";
import { ReportRow, StatBox } from "../components/metrics";
import { LIST_BATCH_SIZE } from "../constants/app";
import { AppData, CashClosing, User } from "../types";
import { appendAudit } from "../utils/audit";
import { buildCashClosingSummary } from "../utils/cash";
import { closingInActiveScope } from "../utils/documents";
import { showMessage } from "../utils/dialogs";
import { activeEstablishment } from "../utils/establishments";
import { formatShortDate, toInputDate } from "../utils/format";
import { generateId } from "../utils/id";
import { parseDecimal, roundMoney } from "../utils/numbers";
import { paymentLabel } from "../utils/reportFormats";
import { syncPatchToBackend } from "../utils/sync";
import { money } from "../services/sri";

type CashClosingListItemProps = {
  title: string;
  meta: string;
  badge?: string;
};

type CalendarDateInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function CashClosingScreen({
  data,
  user,
  backendToken,
  persist,
  ListItemComponent,
  CalendarDateInputComponent
}: {
  data: AppData;
  user: User;
  backendToken: string;
  persist: (data: AppData) => Promise<void>;
  ListItemComponent: React.ComponentType<CashClosingListItemProps>;
  CalendarDateInputComponent: React.ComponentType<CalendarDateInputProps>;
}) {
  const [closingDate, setClosingDate] = useState(toInputDate(new Date()));
  const [cashCountedText, setCashCountedText] = useState("");
  const [notes, setNotes] = useState("");
  const [visibleClosingCount, setVisibleClosingCount] = useState(LIST_BATCH_SIZE);
  const summary = useMemo(() => buildCashClosingSummary(data, closingDate), [data, closingDate]);
  const cashCounted = roundMoney(parseDecimal(cashCountedText || "0"));
  const difference = roundMoney(cashCounted - summary.cashExpected);
  const currentEstablishment = activeEstablishment(data.issuer);
  const closings = [...(data.cashClosings || [])].filter((closing) => closingInActiveScope(closing, data)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const visibleClosings = closings.slice(0, visibleClosingCount);
  const existingClosing = closings.find((closing) => closing.date === closingDate);

  useEffect(() => {
    setCashCountedText(money(summary.cashExpected));
  }, [closingDate, summary.cashExpected]);

  const saveClosing = async () => {
    if (!Number.isFinite(cashCounted) || cashCounted < 0) {
      showMessage("Efectivo invalido", "Ingrese el efectivo contado en caja.");
      return;
    }

    const closing: CashClosing = {
      id: generateId(),
      establishment: currentEstablishment.establishment,
      emissionPoint: currentEstablishment.emissionPoint,
      establishmentName: currentEstablishment.name,
      date: closingDate,
      startAt: summary.startAt,
      endAt: summary.endAt,
      userId: user.id,
      userName: user.name,
      documentCount: summary.documentCount,
      total: summary.total,
      cashExpected: summary.cashExpected,
      cashCounted,
      difference,
      byPayment: summary.byPayment,
      notes: notes.trim(),
      createdAt: new Date().toISOString()
    };

    const nextData = appendAudit({ ...data, cashClosings: [closing, ...(data.cashClosings || [])] }, user, "CASH_CLOSING_CREATED", "cash_closing", closing.id, `Cierre de caja ${closing.date}: total $${money(closing.total)}, diferencia $${money(closing.difference)}`, { date: closing.date, total: closing.total, difference: closing.difference });
    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, cashClosings: [closing], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cierre pendiente de sincronizar", nextData, persist);
    setNotes("");
    showMessage("Cierre guardado", "El cierre de caja quedo registrado y se sincronizara con la base de datos.");
  };

  return (
    <View style={styles.stack}>
      <Section title="Cierre de caja">
        <Text style={styles.inlineInfo}>Establecimiento: {currentEstablishment.name} {currentEstablishment.establishment}-{currentEstablishment.emissionPoint}</Text>
        <CalendarDateInputComponent label="Fecha de cierre" value={closingDate} onChange={setClosingDate} />
        {existingClosing ? <Text style={styles.inlineInfo}>Ya existe un cierre para esta fecha. Puede guardar otro si necesita dejar una correccion auditada.</Text> : null}
        <View style={styles.statsGrid}>
          <StatBox label="Documentos" value={String(summary.documentCount)} />
          <StatBox label="Total ventas" value={`$${money(summary.total)}`} />
          <StatBox label="Efectivo esperado" value={`$${money(summary.cashExpected)}`} />
          <StatBox label="Efectivo contado" value={`$${money(cashCounted)}`} />
          <StatBox label="Diferencia" value={`$${money(difference)}`} />
          <StatBox label="Pagos" value={String(Object.keys(summary.byPayment).length)} />
        </View>
        <Input label="Efectivo contado" value={cashCountedText} onChangeText={setCashCountedText} keyboardType="decimal-pad" />
        <Input label="Notas del cierre" value={notes} onChangeText={setNotes} multiline />
        <PrimaryButton label="Guardar cierre de caja" onPress={saveClosing} />
      </Section>

      <Section title="Formas de pago del dia">
        {Object.keys(summary.byPayment).length === 0 ? <Empty text="No hay movimientos con valor para esta fecha." /> : null}
        {Object.entries(summary.byPayment).map(([code, total]) => (
          <ReportRow key={code} label={paymentLabel(code)} value={`$${money(total)}`} strong={code === "01"} />
        ))}
      </Section>

      <Section title="Cierres guardados">
        {visibleClosings.length === 0 ? <Empty text="Aun no hay cierres de caja." /> : null}
        {visibleClosings.map((closing) => (
          <ListItemComponent
            key={closing.id}
            title={`${formatShortDate(closing.createdAt)} - ${closing.userName}`}
            meta={`Fecha ${closing.date} | Docs ${closing.documentCount} | Total $${money(closing.total)} | Efectivo $${money(closing.cashCounted)} | Dif. $${money(closing.difference)}${closing.notes ? ` | ${closing.notes}` : ""}`}
            badge={closing.difference === 0 ? "CUADRADO" : "DIFERENCIA"}
          />
        ))}
        {visibleClosings.length < closings.length ? <LoadMoreButton label="Cargar mas cierres" onPress={() => setVisibleClosingCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
});
