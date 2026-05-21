import React from "react";
import { Issuer } from "../types";
import { Input, Select } from "./common";

type IssuerTaxSettingsProps = {
  issuer: Issuer;
  onChange: (issuer: Issuer) => void;
};

export function IssuerTaxSettings({ issuer, onChange }: IssuerTaxSettingsProps) {
  return (
    <>
      <Select label="Ambiente" value={issuer.environment} onChange={(environment) => onChange({ ...issuer, environment: environment as "1" | "2" })} options={[{ label: "Pruebas", value: "1" }, { label: "Produccion", value: "2" }]} />
      <Select
        label="Tipo contribuyente"
        value={issuer.taxpayerType}
        onChange={(taxpayerType) => onChange({ ...issuer, taxpayerType: taxpayerType as "natural" | "juridica" })}
        options={[
          { label: "Persona natural", value: "natural" },
          { label: "Persona juridica", value: "juridica" }
        ]}
      />
      <Select
        label="Obligado a contabilidad"
        value={issuer.accountingRequired}
        onChange={(accountingRequired) => onChange({ ...issuer, accountingRequired: accountingRequired as "SI" | "NO" })}
        options={[
          { label: "No", value: "NO" },
          { label: "Si", value: "SI" }
        ]}
      />
      <Select
        label="Contribuyente especial"
        value={issuer.specialTaxpayer}
        onChange={(specialTaxpayer) => onChange({ ...issuer, specialTaxpayer: specialTaxpayer as "SI" | "NO" })}
        options={[
          { label: "No", value: "NO" },
          { label: "Si", value: "SI" }
        ]}
      />
      {issuer.specialTaxpayer === "SI" ? (
        <Input label="Resolucion contribuyente especial" value={issuer.specialTaxpayerResolution} onChangeText={(specialTaxpayerResolution) => onChange({ ...issuer, specialTaxpayerResolution })} keyboardType="number-pad" />
      ) : null}
    </>
  );
}
