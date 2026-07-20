import { useEffect, useState } from "react";
import { Client, RemissionGuide, Sale } from "../types";
import { toInputDate } from "../utils/format";

export type GuideTransporterType = "04" | "05" | "06";

type UseGuideFormStateParams = {
  client?: Client;
  issuerAddress: string;
  movableDocuments: Sale[];
  setSourceSaleId: (value: string) => void;
};

export function useGuideFormState({ client, issuerAddress, movableDocuments, setSourceSaleId }: UseGuideFormStateParams) {
  const [transporterName, setTransporterName] = useState("");
  const [transporterIdentification, setTransporterIdentification] = useState("");
  const [transporterType, setTransporterType] = useState<GuideTransporterType>("05");
  const [plate, setPlate] = useState("");
  const [startAddress, setStartAddress] = useState(issuerAddress);
  const [endAddress, setEndAddress] = useState(client?.address || "");
  const [route, setRoute] = useState("");
  const [reason, setReason] = useState("Venta de mercaderia");
  const [startDate, setStartDate] = useState(toInputDate(new Date()));
  const [endDate, setEndDate] = useState(toInputDate(new Date()));
  const [issuingGuide, setIssuingGuide] = useState(false);
  const [retryingGuideId, setRetryingGuideId] = useState("");
  const [processingMessage, setProcessingMessage] = useState("");

  useEffect(() => {
    if (client?.address) setEndAddress(client.address);
  }, [client?.address]);

  const resetGuideForm = () => {
    setSourceSaleId(movableDocuments[0]?.id || "");
    setTransporterName("");
    setTransporterIdentification("");
    setTransporterType("05");
    setPlate("");
    setStartAddress(issuerAddress);
    setEndAddress(client?.address || "");
    setRoute("");
    setReason("Venta de mercaderia");
    setStartDate(toInputDate(new Date()));
    setEndDate(toInputDate(new Date()));
  };

  const buildGuideDraftFields = (): Pick<RemissionGuide, "transporterName" | "transporterIdentification" | "transporterIdentificationType" | "plate" | "startAddress" | "endAddress" | "route" | "reason" | "startDate" | "endDate"> => ({
    transporterName: transporterName.trim(),
    transporterIdentification: transporterIdentification.trim(),
    transporterIdentificationType: transporterType,
    plate: plate.trim().toUpperCase(),
    startAddress: startAddress.trim(),
    endAddress: endAddress.trim(),
    route: route.trim(),
    reason: reason.trim(),
    startDate,
    endDate
  });

  return {
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
  };
}
