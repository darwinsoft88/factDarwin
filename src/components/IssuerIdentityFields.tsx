import React from "react";
import { Issuer } from "../types";
import { Input } from "./common";
import { InlineInputButton } from "./inputActions";

type IssuerIdentityFieldsProps = {
  issuer: Issuer;
  lookingUpIssuer: boolean;
  onChange: (issuer: Issuer) => void;
  onLookupRuc: () => void;
};

export function IssuerIdentityFields({ issuer, lookingUpIssuer, onChange, onLookupRuc }: IssuerIdentityFieldsProps) {
  return (
    <>
      <Input
        label="RUC"
        value={issuer.ruc}
        onChangeText={(ruc) => onChange({ ...issuer, ruc })}
        keyboardType="number-pad"
        rightElement={<InlineInputButton label={lookingUpIssuer ? "..." : "Consultar"} onPress={onLookupRuc} />}
      />
      <Input label="Razon social" value={issuer.businessName} onChangeText={(businessName) => onChange({ ...issuer, businessName })} />
      <Input label="Nombre comercial" value={issuer.tradeName} onChangeText={(tradeName) => onChange({ ...issuer, tradeName })} />
      <Input label="Correo de contacto" value={issuer.email || ""} onChangeText={(email) => onChange({ ...issuer, email })} autoCapitalize="none" />
      <Input label="URL logo RIDE" value={issuer.logoUrl} onChangeText={(logoUrl) => onChange({ ...issuer, logoUrl })} autoCapitalize="none" />
      <Input label="Direccion matriz" value={issuer.address} onChangeText={(address) => onChange({ ...issuer, address })} />
    </>
  );
}
