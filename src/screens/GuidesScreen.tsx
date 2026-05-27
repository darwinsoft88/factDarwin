import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Empty, Input, LoadMoreButton, PrimaryButton, Section, Select } from "../components/common";
import { ProcessingOverlay } from "../components/ProcessingOverlay";
import { LIST_BATCH_SIZE } from "../constants/app";
import { authorizeRemissionGuide, reserveDocumentSequence } from "../services/backend";
import { buildRemissionGuideXml, createGuideAccessKey, nextSequence } from "../services/sri";
import { AppData, Client, RemissionGuide, Sale, User } from "../types";
import { canAccessSensitiveSupport, canRetryDocuments } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import { buildGuideRideHtml, formatGuideDetail } from "../utils/documentHtml";
import { documentNumber, getRetryInfo, guideInActiveScope, guideNumber, isAccessKeyUsed, MAX_DAILY_RETRIES, resolveInvoiceStatus, saleInActiveScope } from "../utils/documents";
import { showMessage } from "../utils/dialogs";
import { activeEstablishment, activeIssuer, issuerForGuide, updateIssuerEstablishmentSequence } from "../utils/establishments";
import { parseInputDate, toInputDate } from "../utils/format";
import { generateId } from "../utils/id";
import { canRetrySriStatus, isTicketOffline } from "../utils/invoiceStatus";
import { handlePdfDocument, openHtmlViewer } from "../utils/printFiles";
import { documentTypeLabel } from "../utils/sales";
import { explainSriResult, sriUserMessage } from "../utils/sriMessages";
import { syncSalePatchToBackend } from "../utils/sync";
import { validateEmissionPointLicense, validateGuideForm } from "../validation";

type GuidesListItemProps = {
  title: string;
  meta: string;
  badge?: string;
  onOpen?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  retryLabel?: string;
  onRetry?: () => void;
};

type CalendarDateInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
};

export function GuidesScreen({
  data,
  user,
  backendToken,
  persist,
  onXml,
  ListItemComponent,
  CalendarDateInputComponent
}: {
  data: AppData;
  user: User;
  backendToken: string;
  persist: (data: AppData) => Promise<void>;
  onXml: (value: string) => void;
  ListItemComponent: React.ComponentType<GuidesListItemProps>;
  CalendarDateInputComponent: React.ComponentType<CalendarDateInputProps>;
}) {
  const scopedSales = useMemo(() => data.sales.filter((sale) => saleInActiveScope(sale, data)), [data]);
  const scopedGuides = useMemo(() => (data.guides || []).filter((guide) => guideInActiveScope(guide, data)), [data]);
  const movableDocuments = useMemo(
    () => scopedSales.filter((sale) => sale.status === "AUTORIZADA" || isTicketOffline(sale.status) || sale.status === "PROFORMA"),
    [scopedSales]
  );
  const [sourceSaleId, setSourceSaleId] = useState(movableDocuments[0]?.id || "");
  const [documentSearch, setDocumentSearch] = useState("");
  const [guideSearch, setGuideSearch] = useState("");
  const [visibleDocumentCount, setVisibleDocumentCount] = useState(LIST_BATCH_SIZE);
  const [visibleGuideCount, setVisibleGuideCount] = useState(LIST_BATCH_SIZE);
  const clientsById = useMemo(() => new Map(data.clients.map((item) => [item.id, item])), [data.clients]);
  const filteredMovableDocuments = useMemo(() => {
    const search = documentSearch.trim().toLowerCase();
    if (!search) return movableDocuments;

    return movableDocuments.filter((sale) => {
      const saleClient = clientsById.get(sale.clientId);
      return [
        documentTypeLabel(sale),
        sale.sequence,
        documentNumber(sale, data.issuer),
        sale.accessKey,
        sale.authorizationNumber || "",
        saleClient?.name || "",
        saleClient?.identification || ""
      ].some((value) => value.toLowerCase().includes(search));
    });
  }, [clientsById, data.issuer, documentSearch, movableDocuments]);
  const visibleMovableDocuments = filteredMovableDocuments.slice(0, visibleDocumentCount);
  const filteredGuides = useMemo(() => {
    const search = guideSearch.trim().toLowerCase();
    const guides = scopedGuides;
    if (!search) return guides;
    return guides.filter((guide) => {
      const guideClient = clientsById.get(guide.clientId);
      const source = data.sales.find((sale) => sale.id === guide.sourceSaleId);
      return [
        guide.sequence,
        guide.accessKey,
        guide.authorizationNumber || "",
        guide.status,
        guide.plate,
        guide.route,
        guide.transporterName,
        guide.transporterIdentification,
        guideClient?.name || "",
        guideClient?.identification || "",
        source?.sequence || ""
      ].some((value) => value.toLowerCase().includes(search));
    });
  }, [clientsById, data.sales, guideSearch, scopedGuides]);
  const visibleGuides = filteredGuides.slice(0, visibleGuideCount);
  const sourceSale = data.sales.find((sale) => sale.id === sourceSaleId);
  const client = sourceSale ? data.clients.find((item) => item.id === sourceSale.clientId) : undefined;
  const [transporterName, setTransporterName] = useState("");
  const [transporterIdentification, setTransporterIdentification] = useState("");
  const [transporterType, setTransporterType] = useState<"04" | "05" | "06">("05");
  const [plate, setPlate] = useState("");
  const [startAddress, setStartAddress] = useState(data.issuer.address);
  const [endAddress, setEndAddress] = useState(client?.address || "");
  const [route, setRoute] = useState("");
  const [reason, setReason] = useState("Venta de mercaderia");
  const [startDate, setStartDate] = useState(toInputDate(new Date()));
  const [endDate, setEndDate] = useState(toInputDate(new Date()));
  const [issuingGuide, setIssuingGuide] = useState(false);
  const [retryingGuideId, setRetryingGuideId] = useState("");
  const [processingMessage, setProcessingMessage] = useState("");

  useEffect(() => {
    setVisibleDocumentCount(LIST_BATCH_SIZE);
  }, [documentSearch]);

  useEffect(() => {
    setVisibleGuideCount(LIST_BATCH_SIZE);
  }, [guideSearch]);

  useEffect(() => {
    if (sourceSaleId && movableDocuments.some((sale) => sale.id === sourceSaleId)) return;
    setSourceSaleId(movableDocuments[0]?.id || "");
  }, [movableDocuments, sourceSaleId]);

  useEffect(() => {
    if (filteredMovableDocuments.length === 0) return;
    if (filteredMovableDocuments.some((sale) => sale.id === sourceSaleId)) return;
    setSourceSaleId(filteredMovableDocuments[0]?.id || "");
  }, [filteredMovableDocuments, sourceSaleId]);

  useEffect(() => {
    if (client?.address) setEndAddress(client.address);
  }, [client?.address]);

  const issueGuide = async () => {
    if (issuingGuide) return;

    if (!sourceSale || !client) {
      Alert.alert("Documento requerido", "Seleccione una factura, ticket o proforma para trasladar.");
      return;
    }
    const errors = validateGuideForm(transporterName, transporterIdentification, transporterType, plate, startAddress, endAddress, route, reason, startDate, endDate);
    if (errors.length > 0) {
      Alert.alert("Revise la guia", errors.map((error) => `- ${error}`).join("\n"));
      return;
    }

    setIssuingGuide(true);
    setProcessingMessage("Firmando y autorizando guia de remision...");
    let guide: RemissionGuide | null = null;
    let draftData: AppData | null = null;
    let xml = "";

    try {
      const createdAt = new Date().toISOString();
      const accessKeyDate = parseInputDate(startDate, "start") || new Date(createdAt);
      const documentIssuer = activeIssuer(data);
      const documentEstablishment = activeEstablishment(data.issuer);
      const licenseErrors: string[] = [];
      validateEmissionPointLicense(data, documentIssuer, licenseErrors);
      if (licenseErrors.length > 0) {
        Alert.alert("Plan requerido", licenseErrors.map((error) => `- ${error}`).join("\n"));
        return;
      }
      let sequence = nextSequence(documentIssuer.remissionSequential || 1);
      let accessKey = createGuideAccessKey(accessKeyDate, documentIssuer, sequence);
      try {
        setProcessingMessage("Preparando numero de guia...");
        const reserved = await reserveDocumentSequence(data.backendUrl, { documentType: "guia_remision", issuer: documentIssuer, createdAt: accessKeyDate.toISOString() }, backendToken);
        if (Number(reserved.sequence) < Number(sequence)) {
          throw new Error(`El servidor devolvio el secuencial ${reserved.sequence}, menor al configurado ${sequence}. Guarde SRI y sincronice antes de emitir.`);
        }
        sequence = reserved.sequence || sequence;
        accessKey = reserved.accessKey || accessKey;
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo preparar el numero de guia.";
        Alert.alert("Numero no preparado", message);
        return;
      }
      guide = {
        id: generateId(),
        establishment: documentIssuer.establishment,
        emissionPoint: documentIssuer.emissionPoint,
        establishmentName: documentEstablishment.name,
        sourceSaleId: sourceSale.id,
        clientId: client.id,
        userId: user.id,
        createdAt,
        sequence,
        accessKey,
        status: "BORRADOR",
        transporterName: transporterName.trim(),
        transporterIdentification: transporterIdentification.trim(),
        transporterIdentificationType: transporterType,
        plate: plate.trim().toUpperCase(),
        startAddress: startAddress.trim(),
        endAddress: endAddress.trim(),
        route: route.trim(),
        reason: reason.trim(),
        startDate,
        endDate,
        items: sourceSale.items
      };
      if (isAccessKeyUsed(data, guide.accessKey)) {
        throw new Error(`La clave de acceso ${guide.accessKey} ya existe en otro comprobante. Revise el secuencial de guias antes de emitir.`);
      }
      xml = buildRemissionGuideXml(guide, client, documentIssuer, sourceSale);
      draftData = {
        ...data,
        issuer: updateIssuerEstablishmentSequence(data.issuer, documentEstablishment.id, "remissionSequential", Math.max((documentIssuer.remissionSequential || 1) + 1, Number(sequence) + 1)),
        guides: [guide, ...(data.guides || [])]
      };
      await persist(draftData);

      const sriResult = await authorizeRemissionGuide(data.backendUrl, xml, backendToken);
      const finalGuide: RemissionGuide = {
        ...guide,
        accessKey: sriResult.accessKey || guide.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult)
      };
      const finalData = appendAudit({
        ...draftData,
        guides: draftData.guides.map((item) => (item.id === finalGuide.id ? finalGuide : item))
      }, user, "GUIDE_CREATED", "guide", finalGuide.id, `Guia ${finalGuide.sequence} guardada con estado ${finalGuide.status}`, { status: finalGuide.status, accessKey: finalGuide.accessKey });
      await persist(finalData);
      await syncSalePatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        issuer: finalData.issuer,
        guides: [finalGuide],
        auditLogs: finalData.auditLogs.slice(0, 1)
      }, finalData, persist);
      Alert.alert(explainSriResult(sriResult).title, finalGuide.status === "AUTORIZADA" ? "Guia autorizada por el SRI." : sriUserMessage(sriResult));
      showMessage("Guia guardada", finalGuide.status === "AUTORIZADA" ? "Guia autorizada y guardada con exito." : sriUserMessage(sriResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo autorizar la guia.";
      if (draftData && guide) {
        const rejectedGuide: RemissionGuide = { ...guide, status: "ERROR_SRI", sriMessage: message };
        const finalData = appendAudit({
          ...draftData,
          guides: draftData.guides.map((item) => (item.id === rejectedGuide.id ? rejectedGuide : item))
        }, user, "GUIDE_FAILED", "guide", rejectedGuide.id, `Guia ${rejectedGuide.sequence} rechazada`, { error: message });
        await persist(finalData);
        await syncSalePatchToBackend(data.backendUrl, backendToken, {
          baseData: data,
          issuer: finalData.issuer,
          guides: [rejectedGuide],
          auditLogs: finalData.auditLogs.slice(0, 1)
        }, finalData, persist);
      }
      Alert.alert("Guia no autorizada", message);
    } finally {
      setIssuingGuide(false);
      setProcessingMessage("");
    }
  };

  const printGuide = async (guide: RemissionGuide, guideClient: Client, source?: Sale) => {
    if (guide.status !== "AUTORIZADA") {
      Alert.alert("PDF no disponible", "La guia debe estar autorizada para generar el RIDE.");
      return;
    }

    const html = buildGuideRideHtml(guide, guideClient, issuerForGuide(data.issuer, guide), source);

    if (typeof window !== "undefined" && "document" in window) {
      openHtmlViewer(html, `Guia ${guide.sequence}`);
      return;
    }

    await handlePdfDocument(html, `Guia ${guide.sequence}`, "Guia de remision");
  };

  const retryGuide = async (guide: RemissionGuide, guideClient: Client | undefined, source?: Sale) => {
    if (retryingGuideId) return;
    if (!guideClient) {
      Alert.alert("Cliente no encontrado", "No se pudo reconstruir la guia porque falta el destinatario.");
      return;
    }
    if (guide.status === "AUTORIZADA" || guide.status === "ANULADA") {
      Alert.alert("Reintento no disponible", "Solo se pueden reintentar guias no autorizadas y no anuladas.");
      return;
    }
    const retryInfo = getRetryInfo(guide);
    if (retryInfo.today >= MAX_DAILY_RETRIES) {
      const message = `Esta guia ya tiene ${retryInfo.today} reintento(s) hoy. Revise el detalle antes de volver a intentar manana.`;
      Alert.alert("Limite diario de reintentos", message);
      return;
    }

    setRetryingGuideId(guide.id);
    setProcessingMessage("Reintentando guia de remision...");
    const retryAt = new Date().toISOString();
    const guideIssuer = issuerForGuide(data.issuer, guide);
    const correctedGuide: RemissionGuide = {
      ...guide,
      accessKey: createGuideAccessKey(parseInputDate(guide.startDate, "start") || new Date(guide.createdAt), guideIssuer, guide.sequence),
      authorizationNumber: undefined,
      authorizationDate: undefined,
      sriEnvironment: undefined,
      signedXml: undefined,
      authorizedXml: undefined
    };
    const unsignedXml = buildRemissionGuideXml(correctedGuide, guideClient, guideIssuer, source);

    try {
      const sriResult = await authorizeRemissionGuide(data.backendUrl, unsignedXml, backendToken);
      const updatedGuide: RemissionGuide = {
        ...correctedGuide,
        accessKey: sriResult.accessKey || guide.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult),
        retryHistory: [...(guide.retryHistory || []), retryAt]
      };

      await persist(appendAudit({
        ...data,
        guides: (data.guides || []).map((item) => (item.id === guide.id ? updatedGuide : item))
      }, user, "GUIDE_RETRIED", "guide", guide.id, `Reenvio de guia ${guide.sequence}: ${updatedGuide.status}`, { status: updatedGuide.status, accessKey: updatedGuide.accessKey }));
      Alert.alert(explainSriResult(sriResult).title, updatedGuide.status === "AUTORIZADA" ? "Guia autorizada por el SRI." : sriUserMessage(sriResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo reintentar la guia.";
      await persist(appendAudit({
        ...data,
        guides: (data.guides || []).map((item) => (item.id === guide.id ? { ...correctedGuide, status: "ERROR_SRI", sriMessage: message, retryHistory: [...(guide.retryHistory || []), retryAt] } : item))
      }, user, "GUIDE_RETRY_FAILED", "guide", guide.id, `Reenvio fallido de guia ${guide.sequence}`, { error: message }));
      Alert.alert("No se pudo reintentar", message);
    } finally {
      setRetryingGuideId("");
      setProcessingMessage("");
    }
  };

  return (
    <View style={styles.stack}>
      <Section title="Nueva guia de remision">
        <Text style={styles.paragraph}>Comprobante SRI tipo 06 para traslado de mercaderia. No mueve inventario; documenta transporte.</Text>
        <Input label="Buscar factura origen" value={documentSearch} onChangeText={setDocumentSearch} placeholder="Cliente, cedula/RUC, numero o clave" autoCapitalize="none" />
        {movableDocuments.length === 0 ? <Empty text="No hay facturas, notas o proformas disponibles para trasladar." /> : null}
        {movableDocuments.length > 0 && filteredMovableDocuments.length === 0 ? <Empty text="No hay documentos con esa busqueda." /> : null}
        <Select
          label={`Documento origen (${visibleMovableDocuments.length}/${filteredMovableDocuments.length})`}
          value={sourceSaleId}
          onChange={setSourceSaleId}
          options={visibleMovableDocuments.map((sale) => {
            const saleClient = clientsById.get(sale.clientId);
            return { label: `${documentTypeLabel(sale)} ${documentNumber(sale, data.issuer)} - ${saleClient?.name || "Cliente"}`, value: sale.id };
          })}
        />
        {visibleMovableDocuments.length < filteredMovableDocuments.length ? <LoadMoreButton label="Cargar mas documentos" onPress={() => setVisibleDocumentCount((count) => count + LIST_BATCH_SIZE)} /> : null}
        {sourceSale && client ? <Text style={styles.inlineInfo}>Destino: {client.name} | Productos: {sourceSale.items.length}</Text> : null}
        <Input label="Transportista / razon social" value={transporterName} onChangeText={setTransporterName} />
        <Select label="Tipo identificacion transportista" value={transporterType} onChange={(value) => setTransporterType(value as "04" | "05" | "06")} options={[{ label: "Cedula", value: "05" }, { label: "RUC", value: "04" }, { label: "Pasaporte", value: "06" }]} />
        <Input label="Identificacion transportista" value={transporterIdentification} onChangeText={setTransporterIdentification} keyboardType="number-pad" />
        <Input label="Placa" value={plate} onChangeText={setPlate} autoCapitalize="characters" />
        <Input label="Direccion partida" value={startAddress} onChangeText={setStartAddress} />
        <Input label="Direccion destino" value={endAddress} onChangeText={setEndAddress} />
        <Input label="Ruta" value={route} onChangeText={setRoute} placeholder="Ej. La Concordia - Quito" />
        <Input label="Motivo traslado" value={reason} onChangeText={setReason} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <CalendarDateInputComponent label="Fecha inicio" value={startDate} onChange={setStartDate} />
          </View>
          <View style={styles.flex}>
            <CalendarDateInputComponent label="Fecha fin" value={endDate} onChange={setEndDate} />
          </View>
        </View>
        <PrimaryButton label={issuingGuide ? "Procesando..." : "Emitir guia"} onPress={issuingGuide ? () => undefined : issueGuide} />
      </Section>

      <Section title="Guias emitidas">
        <Input label="Buscar guias emitidas" value={guideSearch} onChangeText={setGuideSearch} placeholder="Cliente, placa, ruta, secuencial o clave" autoCapitalize="none" />
        {(data.guides || []).length === 0 ? <Empty text="Aun no hay guias de remision." /> : null}
        {(data.guides || []).length > 0 && filteredGuides.length === 0 ? <Empty text="No hay guias con esa busqueda." /> : null}
        {visibleGuides.map((guide) => {
          const guideClient = data.clients.find((item) => item.id === guide.clientId);
          const source = data.sales.find((item) => item.id === guide.sourceSaleId);
          return (
            <ListItemComponent
              key={guide.id}
              title={`${guideNumber(guide, data.issuer)} - ${guideClient?.name || "Destinatario"}`}
              meta={`${guide.status} | ${guide.plate} | ${guide.route} | ${guide.accessKey}`}
              badge={guide.status}
              onOpen={canAccessSensitiveSupport(user.role) ? () => onXml(formatGuideDetail(guide, guideClient, issuerForGuide(data.issuer, guide), source)) : undefined}
              secondaryLabel={guide.status === "AUTORIZADA" ? "PDF guia" : undefined}
              onSecondary={() => guideClient && printGuide(guide, guideClient, source)}
              retryLabel={canRetryDocuments(user.role) && canRetrySriStatus(guide.status) ? (retryingGuideId === guide.id ? "..." : `Reintentar ${getRetryInfo(guide).today}/${MAX_DAILY_RETRIES}`) : undefined}
              onRetry={() => retryGuide(guide, guideClient, source)}
            />
          );
        })}
        {visibleGuides.length < filteredGuides.length ? <LoadMoreButton label="Cargar mas guias" onPress={() => setVisibleGuideCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
      <ProcessingOverlay visible={Boolean(processingMessage)} message={processingMessage} />
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
