import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LIST_BATCH_SIZE } from "../constants/app";
import { GuideTransporterType } from "../hooks/useGuideFormState";
import { AppData, Client, Sale } from "../types";
import { documentNumber } from "../utils/documents";
import { documentTypeLabel } from "../utils/sales";
import { money } from "../sri";
import { Empty, Input, PrimaryButton, Section, Select } from "./common";
import { PaginationControls } from "./PaginationControls";

type CalendarDateInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
};

type GuideFormSectionProps = {
  CalendarDateInputComponent: React.ComponentType<CalendarDateInputProps>;
  framed?: boolean;
  showIssueButton?: boolean;
  client?: Client;
  clientsById: Map<string, Client>;
  data: AppData;
  documentSearch: string;
  endAddress: string;
  endDate: string;
  filteredMovableDocuments: Sale[];
  issuingGuide: boolean;
  movableDocuments: Sale[];
  plate: string;
  reason: string;
  route: string;
  sourceSale?: Sale;
  sourceSaleId: string;
  startAddress: string;
  startDate: string;
  transporterIdentification: string;
  transporterName: string;
  transporterType: GuideTransporterType;
  onDocumentSearchChange: (value: string) => void;
  onEndAddressChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onIssue: () => void;
  onPlateChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onRouteChange: (value: string) => void;
  onSourceSaleChange: (value: string) => void;
  onStartAddressChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onTransporterIdentificationChange: (value: string) => void;
  onTransporterNameChange: (value: string) => void;
  onTransporterTypeChange: (value: GuideTransporterType) => void;
};

export function GuideFormSection({
  CalendarDateInputComponent,
  framed = true,
  showIssueButton = true,
  client,
  clientsById,
  data,
  documentSearch,
  endAddress,
  endDate,
  filteredMovableDocuments,
  issuingGuide,
  movableDocuments,
  plate,
  reason,
  route,
  sourceSale,
  sourceSaleId,
  startAddress,
  startDate,
  transporterIdentification,
  transporterName,
  transporterType,
  onDocumentSearchChange,
  onEndAddressChange,
  onEndDateChange,
  onIssue,
  onPlateChange,
  onReasonChange,
  onRouteChange,
  onSourceSaleChange,
  onStartAddressChange,
  onStartDateChange,
  onTransporterIdentificationChange,
  onTransporterNameChange,
  onTransporterTypeChange
}: GuideFormSectionProps) {
  const [documentPickerVisible, setDocumentPickerVisible] = React.useState(false);
  const [documentPage, setDocumentPage] = React.useState(1);
  const documentTotalPages = Math.max(1, Math.ceil(filteredMovableDocuments.length / LIST_BATCH_SIZE));
  const currentDocumentPage = Math.min(documentPage, documentTotalPages);
  const pageStart = (currentDocumentPage - 1) * LIST_BATCH_SIZE;
  const pageDocuments = filteredMovableDocuments.slice(pageStart, pageStart + LIST_BATCH_SIZE);

  React.useEffect(() => {
    setDocumentPage(1);
  }, [documentSearch]);

  React.useEffect(() => {
    if (documentPickerVisible) setDocumentPage(1);
  }, [documentPickerVisible]);

  const selectDocument = (saleId: string) => {
    onSourceSaleChange(saleId);
    setDocumentPickerVisible(false);
  };

  const content = (
    <>
      <Text style={styles.paragraph}>Comprobante SRI tipo 06 para traslado de mercaderia. No mueve inventario; documenta transporte.</Text>
      {movableDocuments.length === 0 ? <Empty text="No hay facturas, notas o proformas disponibles para trasladar." /> : null}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Documento origen</Text>
        <Pressable style={styles.documentSelectButton} onPress={() => setDocumentPickerVisible(true)}>
          <View style={styles.documentIcon}>
            <MaterialCommunityIcons name="file-document-outline" size={16} color="#047857" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.documentSelectTitle} numberOfLines={1}>
              {sourceSale ? `${documentTypeLabel(sourceSale)} ${documentNumber(sourceSale, data.issuer)}` : "Buscar documento origen"}
            </Text>
            <Text style={styles.documentSelectMeta} numberOfLines={1}>
              {sourceSale && client ? `${client.name} | ${sourceSale.items.length} producto(s) | $${money(sourceSale.total)}` : "Factura, nota o proforma disponible"}
            </Text>
          </View>
          <MaterialCommunityIcons name="magnify" size={20} color="#0f766e" />
        </Pressable>
      </View>
      {sourceSale && client ? <Text style={styles.inlineInfo}>Destino: {client.name} | Productos: {sourceSale.items.length}</Text> : null}
      <Input label="Transportista / razon social" value={transporterName} onChangeText={onTransporterNameChange} />
      <Select label="Tipo identificacion transportista" value={transporterType} onChange={(value) => onTransporterTypeChange(value as GuideTransporterType)} options={[{ label: "Cedula", value: "05" }, { label: "RUC", value: "04" }, { label: "Pasaporte", value: "06" }]} />
      <Input label="Identificacion transportista" value={transporterIdentification} onChangeText={onTransporterIdentificationChange} keyboardType="number-pad" />
      <Input label="Placa" value={plate} onChangeText={onPlateChange} autoCapitalize="characters" />
      <Input label="Direccion partida" value={startAddress} onChangeText={onStartAddressChange} />
      <Input label="Direccion destino" value={endAddress} onChangeText={onEndAddressChange} />
      <Input label="Ruta" value={route} onChangeText={onRouteChange} placeholder="Ej. La Concordia - Quito" />
      <Input label="Motivo traslado" value={reason} onChangeText={onReasonChange} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <CalendarDateInputComponent label="Fecha inicio" value={startDate} onChange={onStartDateChange} />
        </View>
        <View style={styles.flex}>
          <CalendarDateInputComponent label="Fecha fin" value={endDate} onChange={onEndDateChange} />
        </View>
      </View>
      {showIssueButton ? <PrimaryButton label={issuingGuide ? "Procesando..." : "Emitir guia"} onPress={issuingGuide ? () => undefined : onIssue} /> : null}
      <Modal visible={documentPickerVisible} transparent animationType="fade" onRequestClose={() => setDocumentPickerVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDocumentPickerVisible(false)}>
          <Pressable style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.flex}>
                <Text style={styles.modalTitle}>Buscar documento origen</Text>
                <Text style={styles.modalMeta}>Seleccione el documento que se va a trasladar</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setDocumentPickerVisible(false)}>
                <Text style={styles.closeButtonText}>Cerrar</Text>
              </Pressable>
            </View>
            <Input label="" value={documentSearch} onChangeText={onDocumentSearchChange} placeholder="Cliente, cedula/RUC, numero o clave" autoCapitalize="none" />
            <View style={styles.resultHeader}>
              <Text style={styles.resultLabel}>Documentos encontrados</Text>
              <Text style={styles.resultCount}>{filteredMovableDocuments.length} registro(s)</Text>
            </View>
            <ScrollView style={styles.resultsBox} contentContainerStyle={styles.resultsContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {pageDocuments.map((sale) => {
                const saleClient = clientsById.get(sale.clientId);
                const selected = sale.id === sourceSaleId;
                return (
                  <Pressable key={sale.id} style={[styles.documentRow, selected && styles.documentRowSelected]} onPress={() => selectDocument(sale.id)}>
                    <View style={styles.flex}>
                      <Text style={[styles.documentName, selected && styles.documentNameSelected]} numberOfLines={1}>{documentTypeLabel(sale)} {documentNumber(sale, data.issuer)} - {saleClient?.name || "Cliente"}</Text>
                      <Text style={styles.documentMeta} numberOfLines={1}>{sale.status} | {sale.items.length} producto(s) | ${money(sale.total)}</Text>
                    </View>
                    {selected ? <MaterialCommunityIcons name="check-circle" size={22} color="#047857" /> : <MaterialCommunityIcons name="chevron-right" size={22} color="#64748b" />}
                  </Pressable>
                );
              })}
            </ScrollView>
            {movableDocuments.length > 0 && filteredMovableDocuments.length === 0 ? <Empty text="No hay documentos con esa busqueda." /> : null}
            <PaginationControls page={currentDocumentPage} pageSize={LIST_BATCH_SIZE} totalItems={filteredMovableDocuments.length} onPageChange={setDocumentPage} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  if (!framed) return content;

  return (
    <Section title="Nueva guia de remision">
      {content}
    </Section>
  );
}

const styles = StyleSheet.create({
  inputGroup: {
    gap: 5
  },
  label: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  documentSelectButton: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#9de8c0",
    backgroundColor: "#ecfdf5",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  documentIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d1fae5"
  },
  documentSelectTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  documentSelectMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    justifyContent: "flex-end",
    padding: 12
  },
  modalSheet: {
    maxHeight: "86%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    gap: 10
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  modalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  modalMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  closeButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  closeButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  resultLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  resultCount: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900"
  },
  resultsBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    maxHeight: 320
  },
  resultsContent: {
    gap: 7,
    padding: 8
  },
  documentRow: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  documentRowSelected: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4"
  },
  documentName: {
    color: "#111827",
    fontWeight: "900"
  },
  documentNameSelected: {
    color: "#047857"
  },
  documentMeta: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2
  },
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
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
