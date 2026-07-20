import { useState } from "react";
import { initialData } from "../database";
import { AppData, AppLicense } from "../types";

export function useSriIssuerFormState(data: AppData) {
  const [issuer, setIssuer] = useState(data.issuer);
  const [license, setLicense] = useState<AppLicense>(data.license || initialData.license!);
  const [sequentialText, setSequentialText] = useState(String(data.issuer.sequential));
  const [remissionSequentialText, setRemissionSequentialText] = useState(String(data.issuer.remissionSequential || 1));
  const [creditNoteSequentialText, setCreditNoteSequentialText] = useState(String(data.issuer.creditNoteSequential || 1));
  const [establishmentNameText, setEstablishmentNameText] = useState("");
  const [establishmentCodeText, setEstablishmentCodeText] = useState(data.issuer.establishment || "001");
  const [emissionPointText, setEmissionPointText] = useState(data.issuer.emissionPoint || "001");
  const [backendUrl, setBackendUrl] = useState(data.backendUrl);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(data.autoBackupEnabled !== false);

  return {
    autoBackupEnabled,
    backendUrl,
    creditNoteSequentialText,
    emissionPointText,
    establishmentCodeText,
    establishmentNameText,
    issuer,
    license,
    remissionSequentialText,
    sequentialText,
    setAutoBackupEnabled,
    setBackendUrl,
    setCreditNoteSequentialText,
    setEmissionPointText,
    setEstablishmentCodeText,
    setEstablishmentNameText,
    setIssuer,
    setLicense,
    setRemissionSequentialText,
    setSequentialText
  };
}
