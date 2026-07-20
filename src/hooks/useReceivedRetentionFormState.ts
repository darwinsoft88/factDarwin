import { useState } from "react";
import { RetentionTaxType } from "../types";
import { toInputDate } from "../utils/format";

export function useReceivedRetentionFormState() {
  const [retentionSaleId, setRetentionSaleId] = useState("");
  const [retentionTaxType, setRetentionTaxType] = useState<RetentionTaxType>("IVA");
  const [retentionBase, setRetentionBase] = useState("");
  const [retentionPercentage, setRetentionPercentage] = useState("");
  const [retentionAmount, setRetentionAmount] = useState("");
  const [retentionDocumentNumber, setRetentionDocumentNumber] = useState("");
  const [retentionAuthorizationNumber, setRetentionAuthorizationNumber] = useState("");
  const [retentionReceivedAt, setRetentionReceivedAt] = useState(toInputDate(new Date()));
  const [retentionNotes, setRetentionNotes] = useState("");

  return {
    retentionAmount,
    retentionAuthorizationNumber,
    retentionBase,
    retentionDocumentNumber,
    retentionNotes,
    retentionPercentage,
    retentionReceivedAt,
    retentionSaleId,
    retentionTaxType,
    setRetentionAmount,
    setRetentionAuthorizationNumber,
    setRetentionBase,
    setRetentionDocumentNumber,
    setRetentionNotes,
    setRetentionPercentage,
    setRetentionReceivedAt,
    setRetentionSaleId,
    setRetentionTaxType
  };
}
