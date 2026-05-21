import React from "react";
import { Select } from "./common";

type AutoBackupToggleProps = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export function AutoBackupToggle({ enabled, onChange }: AutoBackupToggleProps) {
  return (
    <Select
      label="Respaldo automatico"
      value={enabled ? "SI" : "NO"}
      onChange={(value) => onChange(value === "SI")}
      options={[
        { label: "Activo", value: "SI" },
        { label: "Inactivo", value: "NO" }
      ]}
    />
  );
}
