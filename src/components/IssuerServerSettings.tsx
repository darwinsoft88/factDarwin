import React from "react";
import { AutoBackupToggle } from "./AutoBackupToggle";
import { ConnectionResultText } from "./ConnectionResultText";
import { Input } from "./common";
import { IssuerActionButtons } from "./IssuerActionButtons";

type IssuerServerSettingsProps = {
  backendUrl: string;
  autoBackupEnabled: boolean;
  checkingConnection: boolean;
  testingEmail: boolean;
  connectionResult: string;
  onBackendUrlChange: (value: string) => void;
  onAutoBackupChange: (value: boolean) => void;
  onSave: () => void;
  onTestConnection: () => void;
  onTestEmail: () => void;
};

export function IssuerServerSettings({
  backendUrl,
  autoBackupEnabled,
  checkingConnection,
  testingEmail,
  connectionResult,
  onBackendUrlChange,
  onAutoBackupChange,
  onSave,
  onTestConnection,
  onTestEmail
}: IssuerServerSettingsProps) {
  return (
    <>
      <Input label="URL del servidor" value={backendUrl} onChangeText={onBackendUrlChange} autoCapitalize="none" />
      <AutoBackupToggle enabled={autoBackupEnabled} onChange={onAutoBackupChange} />
      <IssuerActionButtons
        checkingConnection={checkingConnection}
        testingEmail={testingEmail}
        onSave={onSave}
        onTestConnection={onTestConnection}
        onTestEmail={onTestEmail}
      />
      <ConnectionResultText value={connectionResult} />
    </>
  );
}
