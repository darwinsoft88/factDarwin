import React from "react";
import { CollapsibleSection } from "./common";
import { CompanyAssetsSection } from "./CompanyAssetsSection";
import { ProductionStatusSection } from "./ProductionStatusSection";
import { Issuer } from "../types";
import { buildProductionChecklist } from "../validation";

type SriAssetsStatusSectionsProps = {
  assetStatus: string;
  assetStatusTone: "info" | "success" | "error";
  certificateModalVisible: boolean;
  certificatePassword: string;
  checkingAssetStatus: boolean;
  checklist: ReturnType<typeof buildProductionChecklist>;
  changingEnvironment: boolean;
  diagnosticOpen: boolean;
  assetsOpen: boolean;
  issuer: Issuer;
  onCancelCertificateUpload: () => void;
  onCertificatePasswordChange: (value: string) => void;
  onConfirmCertificateUpload: () => void;
  onRefreshAssetsStatus: () => void;
  onReturnToTests: () => void;
  onDiagnosticOpenChange: (open: boolean) => void;
  onAssetsOpenChange: (open: boolean) => void;
  onUploadCertificate: () => void;
  onUploadLogo: () => void;
  pendingCertificateName: string;
  uploadingAsset: boolean;
};

export function SriAssetsStatusSections({
  assetStatus,
  assetStatusTone,
  certificateModalVisible,
  certificatePassword,
  checkingAssetStatus,
  checklist,
  changingEnvironment,
  diagnosticOpen,
  assetsOpen,
  issuer,
  onCancelCertificateUpload,
  onCertificatePasswordChange,
  onConfirmCertificateUpload,
  onRefreshAssetsStatus,
  onReturnToTests,
  onDiagnosticOpenChange,
  onAssetsOpenChange,
  onUploadCertificate,
  onUploadLogo,
  pendingCertificateName,
  uploadingAsset
}: SriAssetsStatusSectionsProps) {
  return (
    <>
      <CollapsibleSection title="Logo y firma electronica" open={assetsOpen} onOpenChange={onAssetsOpenChange}>
        <CompanyAssetsSection
          assetStatus={assetStatus}
          assetStatusTone={assetStatusTone}
          logoUrl={issuer.logoUrl || ""}
          uploading={uploadingAsset}
          checkingStatus={checkingAssetStatus}
          certificatePassword={certificatePassword}
          certificateModalVisible={certificateModalVisible}
          pendingCertificateName={pendingCertificateName}
          onCertificatePasswordChange={onCertificatePasswordChange}
          onUploadLogo={onUploadLogo}
          onRefreshStatus={onRefreshAssetsStatus}
          onUploadCertificate={onUploadCertificate}
          onConfirmCertificateUpload={onConfirmCertificateUpload}
          onCancelCertificateUpload={onCancelCertificateUpload}
        />
      </CollapsibleSection>
      <CollapsibleSection title="Configuración avanzada · Diagnóstico técnico" open={diagnosticOpen} onOpenChange={onDiagnosticOpenChange}>
        <ProductionStatusSection issuer={issuer} checklist={checklist} changingEnvironment={changingEnvironment} onReturnToTests={onReturnToTests} />
      </CollapsibleSection>
    </>
  );
}
