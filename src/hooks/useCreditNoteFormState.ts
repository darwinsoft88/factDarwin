import { useState } from "react";

export function useCreditNoteFormState() {
  const [creditNoteSourceId, setCreditNoteSourceId] = useState("");
  const [creditNoteReason, setCreditNoteReason] = useState("Devolucion parcial");
  const [creditNoteQuantities, setCreditNoteQuantities] = useState<Record<string, string>>({});
  const [issuingCreditNote, setIssuingCreditNote] = useState(false);

  return {
    creditNoteQuantities,
    creditNoteReason,
    creditNoteSourceId,
    issuingCreditNote,
    setCreditNoteQuantities,
    setCreditNoteReason,
    setCreditNoteSourceId,
    setIssuingCreditNote
  };
}
