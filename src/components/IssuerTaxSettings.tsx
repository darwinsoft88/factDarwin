import React from "react";
import { Issuer } from "../types";
import { Input, Select } from "./common";
import { sanitizeIntegerInput } from "../utils/numbers";
import { normalizeTaxRegime } from "../utils/taxRegime";

type IssuerTaxSettingsProps = {
  issuer: Issuer;
  onChange: (issuer: Issuer) => void;
};

function normalizeResolutionInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
}

export function IssuerTaxSettings({ issuer, onChange }: IssuerTaxSettingsProps) {
  return (
    <>
      <Select label="Ambiente" value={issuer.environment} onChange={(environment) => onChange({ ...issuer, environment: environment as "1" | "2" })} options={[{ label: "Pruebas", value: "1" }, { label: "Produccion", value: "2" }]} />
      <Select
        label="Regimen tributario"
        value={normalizeTaxRegime(issuer.taxRegime)}
        onChange={(taxRegime) => onChange({ ...issuer, taxRegime: normalizeTaxRegime(taxRegime) })}
        options={[
          { label: "General", value: "general" },
          { label: "RIMPE emprendedor", value: "rimpe_emprendedor" },
          { label: "RIMPE negocio popular", value: "rimpe_negocio_popular" }
        ]}
      />
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
        <Input label="Resolucion contribuyente especial" value={issuer.specialTaxpayerResolution} onChangeText={(specialTaxpayerResolution) => onChange({ ...issuer, specialTaxpayerResolution: sanitizeIntegerInput(specialTaxpayerResolution) })} keyboardType="number-pad" />
      ) : null}
      <Select
        label="Agente de retencion"
        value={issuer.retentionAgent || "NO"}
        onChange={(retentionAgent) => onChange({
          ...issuer,
          retentionAgent: retentionAgent as "SI" | "NO",
          retentionAgentResolution: retentionAgent === "SI" ? issuer.retentionAgentResolution || "" : ""
        })}
        options={[
          { label: "No", value: "NO" },
          { label: "Si", value: "SI" }
        ]}
      />
      {issuer.retentionAgent === "SI" ? (
        <Input
          label="Resolucion agente de retencion"
          value={issuer.retentionAgentResolution || ""}
          onChangeText={(retentionAgentResolution) => onChange({ ...issuer, retentionAgentResolution: normalizeResolutionInput(retentionAgentResolution) })}
          placeholder="Ej. NAC-DNCRASC20-00000001"
          autoCapitalize="characters"
        />
      ) : null}
    </>
  );
}
