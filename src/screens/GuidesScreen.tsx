import React from "react";
import { Alert, StyleSheet, View } from "react-native";
import { EntityEditModal } from "../components/EntityEditModal";
import { GuideFormSection } from "../components/GuideFormSection";
import { GuideListSection } from "../components/GuideListSection";
import { ProcessingOverlay } from "../components/ProcessingOverlay";
import { useGuideDocumentFilters } from "../hooks/useGuideDocumentFilters";
import { useGuideFormState } from "../hooks/useGuideFormState";
import { useControlledRemissionGuides } from
  "../hooks/useControlledRemissionGuides";
import { authorizeRemissionGuide, reserveDocumentSequence } from "../services/backend";
import { buildRemissionGuideXml, createGuideAccessKey, nextSequence } from "../sri";
import { AppData, Client, RemissionGuide, Sale, User } from "../types";
import { canAccessDeveloperTools, canRetryDocuments } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import { resolveCompanyLogoUrl } from "../utils/assets";
import { buildGuideRideHtml, formatGuideDetail } from "../utils/documentHtml";
import { getRetryInfo, isAccessKeyUsed, MAX_DAILY_RETRIES, resolveInvoiceStatus } from "../utils/documents";
import { showError, showSuccess, showWarning } from "../utils/dialogs";
import { activeEstablishment, activeIssuer, issuerForGuide, updateIssuerEstablishmentSequence } from "../utils/establishments";
import { parseInputDate } from "../utils/format";
import { generateId } from "../utils/id";
import { handlePdfDocument, openHtmlViewer } from "../utils/printFiles";
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
  const controlledGuides = useControlledRemissionGuides(data, user);
  const guideReadData = React.useMemo(
    () => ({ ...data, guides: controlledGuides }),
    [controlledGuides, data],
  );
  const {
    client,
    clientsById,
    documentSearch,
    filteredGuides,
    filteredMovableDocuments,
    guidePagination,
    guideSearch,
    movableDocuments,
    setDocumentSearch,
    setGuidePage,
    setGuideSearch,
    setSourceSaleId,
    sourceSale,
    sourceSaleId,
    visibleGuides
  } = useGuideDocumentFilters(guideReadData);
  const issuerForGuideDocument = (guide: RemissionGuide) => {
    const guideIssuer = issuerForGuide(data.issuer, guide);
    return {
      ...guideIssuer,
      logoUrl: resolveCompanyLogoUrl(guideIssuer.logoUrl, data.backendUrl)
    };
  };
  const {
    buildGuideDraftFields,
    endAddress,
    endDate,
    issuingGuide,
    plate,
    processingMessage,
    reason,
    resetGuideForm,
    retryingGuideId,
    route,
    startAddress,
    startDate,
    transporterIdentification,
    transporterName,
    transporterType,
    setEndAddress,
    setEndDate,
    setIssuingGuide,
    setPlate,
    setProcessingMessage,
    setReason,
    setRetryingGuideId,
    setRoute,
    setStartAddress,
    setStartDate,
    setTransporterIdentification,
    setTransporterName,
    setTransporterType
  } = useGuideFormState({
    client,
    issuerAddress: data.issuer.address,
    movableDocuments,
    setSourceSaleId
  });
  const [guideModalVisible, setGuideModalVisible] = React.useState(false);

  const issueGuide = async () => {
    if (issuingGuide) return;

    if (!sourceSale || !client) {
      showWarning(
        "Documento requerido",
        "Seleccione una factura, ticket o proforma para trasladar."
      );
      return;
    }
    const errors = validateGuideForm(transporterName, transporterIdentification, transporterType, plate, startAddress, endAddress, route, reason, startDate, endDate);
    if (errors.length > 0) {
      showWarning(
        "Revise la guía",
        `${errors[0]}${errors.length > 1 ? ` Después revise ${errors.length === 2 ? "otro campo pendiente" : `los otros ${errors.length - 1} campos pendientes`}.` : ""}`
      );
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
        ...buildGuideDraftFields(),
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
      if (finalGuide.status === "AUTORIZADA") {
        showSuccess(
          "Guía guardada",
          "Guía autorizada y guardada con éxito."
        );
      } else if (finalGuide.status === "PENDIENTE_SRI") {
        showWarning(
          "Guía pendiente",
          sriUserMessage(sriResult)
        );
      } else {
        showError(
          "Guía rechazada",
          sriUserMessage(sriResult)
        );
      }
      resetGuideForm();
      setGuideModalVisible(false);
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

    const html = buildGuideRideHtml(guide, guideClient, issuerForGuideDocument(guide), source);

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
      if (updatedGuide.status === "AUTORIZADA") {
        showSuccess(
          "Guía autorizada",
          "La guía fue autorizada por el SRI."
        );
      } else if (updatedGuide.status === "PENDIENTE_SRI") {
        showWarning(
          "Guía pendiente",
          sriUserMessage(sriResult)
        );
      } else {
        showError(
          "Guía rechazada",
          sriUserMessage(sriResult)
        );
      }
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
      <GuideListSection
        canOpenSensitive={canAccessDeveloperTools(user)}
        canRetry={canRetryDocuments(user.role)}
        data={data}
        filteredGuides={filteredGuides}
        guidePage={guidePagination.currentPage}
        guideSearch={guideSearch}
        ListItemComponent={ListItemComponent}
        visibleGuides={visibleGuides}
        onGuideDetail={(guide, guideClient, source) => onXml(formatGuideDetail(guide, guideClient, issuerForGuideDocument(guide), source))}
        onGuidePdf={printGuide}
        onGuideRetry={retryGuide}
        onGuideSearchChange={setGuideSearch}
        onCreate={() => setGuideModalVisible(true)}
        onPageChange={setGuidePage}
        retryingGuideId={retryingGuideId}
      />
      <EntityEditModal
        visible={guideModalVisible}
        title="Nueva guia de remision"
        subtitle={sourceSale && client ? `${client.name} | ${sourceSale.items.length} producto(s)` : "Seleccione documento origen y transportista"}
        confirmLabel={issuingGuide ? "Procesando..." : "Emitir guia"}
        confirming={issuingGuide}
        onClose={() => setGuideModalVisible(false)}
        onConfirm={() => { if (!issuingGuide) void issueGuide(); }}
      >
        <GuideFormSection
          CalendarDateInputComponent={CalendarDateInputComponent}
          framed={false}
          showIssueButton={false}
          client={client}
          clientsById={clientsById}
          data={data}
          documentSearch={documentSearch}
          endAddress={endAddress}
          endDate={endDate}
          filteredMovableDocuments={filteredMovableDocuments}
          issuingGuide={issuingGuide}
          movableDocuments={movableDocuments}
          plate={plate}
          reason={reason}
          route={route}
          sourceSale={sourceSale}
          sourceSaleId={sourceSaleId}
          startAddress={startAddress}
          startDate={startDate}
          transporterIdentification={transporterIdentification}
          transporterName={transporterName}
          transporterType={transporterType}
          onDocumentSearchChange={setDocumentSearch}
          onEndAddressChange={setEndAddress}
          onEndDateChange={setEndDate}
          onIssue={issueGuide}
          onPlateChange={setPlate}
          onReasonChange={setReason}
          onRouteChange={setRoute}
          onSourceSaleChange={setSourceSaleId}
          onStartAddressChange={setStartAddress}
          onStartDateChange={setStartDate}
          onTransporterIdentificationChange={setTransporterIdentification}
          onTransporterNameChange={setTransporterName}
          onTransporterTypeChange={setTransporterType}
        />
      </EntityEditModal>
      <ProcessingOverlay visible={Boolean(processingMessage)} message={processingMessage} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  }
});
