import { AppData, Issuer, IssuerEstablishment } from "../types";
import { activeEstablishment, issuerWithEstablishment, normalizeThreeDigits } from "./establishments";

export type EstablishmentFormValues = {
  name: string;
  establishment: string;
  emissionPoint: string;
  address: string;
  sequential: string;
  remissionSequential: string;
  creditNoteSequential: string;
};

export type ParsedNewEstablishment = {
  id: string;
  name: string;
  establishment: string;
  emissionPoint: string;
  address: string;
  sequential: number;
  remissionSequential: number;
  creditNoteSequential: number;
};

export type NewEstablishmentValidation =
  | { ok: true; value: ParsedNewEstablishment }
  | { ok: false; code: "plan_required" | "limit_reached" | "duplicate" | "invalid_sequences"; title: string; message: string };

export type EstablishmentPatchValidation =
  | { ok: true; value: { baseId: string; nextId: string; nextEstablishment: string; nextEmissionPoint: string } }
  | { ok: false; code: "protected" | "duplicate"; title: string; message: string };

export type EstablishmentDeleteValidation =
  | { ok: true }
  | { ok: false; code: "last_establishment" | "protected" | "confirm_mismatch"; title: string; message: string };

export function selectedEditableEstablishment(issuer: Issuer, establishments: IssuerEstablishment[]) {
  return establishments.find((item) => item.id === issuer.activeEstablishmentId && item.active)
    || establishments.find((item) => item.active)
    || establishments[0]
    || activeEstablishment(issuer);
}

export function countDocumentsForEstablishment(data: AppData, establishmentId: string) {
  return data.sales.filter((sale) => `${sale.establishment || ""}-${sale.emissionPoint || ""}` === establishmentId).length
    + (data.guides || []).filter((guide) => `${guide.establishment || ""}-${guide.emissionPoint || ""}` === establishmentId).length;
}

export function buildNewEstablishmentForm(establishments: IssuerEstablishment[], issuerAddress: string) {
  const nextNumber = String(establishments.length + 1).padStart(3, "0");
  return {
    name: `Sucursal ${establishments.length + 1}`,
    establishment: normalizeThreeDigits(nextNumber),
    emissionPoint: "001",
    address: issuerAddress || "Ecuador",
    sequential: "1",
    remissionSequential: "1",
    creditNoteSequential: "1"
  };
}

export function validateNewEstablishmentDraft({
  canManage,
  establishments,
  form,
  issuerAddress,
  maxEmissionPoints
}: {
  canManage: boolean;
  establishments: IssuerEstablishment[];
  form: EstablishmentFormValues;
  issuerAddress: string;
  maxEmissionPoints: number;
}): NewEstablishmentValidation {
  if (!canManage) {
    return {
      ok: false,
      code: "plan_required",
      title: "Plan requerido",
      message: "Agregar puntos de emision requiere plan Pro activo."
    };
  }

  if (establishments.filter((item) => item.active !== false).length >= maxEmissionPoints) {
    return {
      ok: false,
      code: "limit_reached",
      title: "Limite de puntos",
      message: `Su plan actual permite hasta ${maxEmissionPoints} punto(s) de emision.`
    };
  }

  const establishment = normalizeThreeDigits(form.establishment);
  const emissionPoint = normalizeThreeDigits(form.emissionPoint);
  const id = `${establishment}-${emissionPoint}`;
  if (establishments.some((item) => item.id === id)) {
    return {
      ok: false,
      code: "duplicate",
      title: "Establecimiento existente",
      message: `Ya existe ${id}. Use otro establecimiento o punto de emision.`
    };
  }

  const sequential = Number(form.sequential);
  const remissionSequential = Number(form.remissionSequential);
  const creditNoteSequential = Number(form.creditNoteSequential);
  if (![sequential, remissionSequential, creditNoteSequential].every((value) => Number.isInteger(value) && value > 0)) {
    return {
      ok: false,
      code: "invalid_sequences",
      title: "Secuenciales invalidos",
      message: "Ingrese secuenciales enteros mayores a cero."
    };
  }

  return {
    ok: true,
    value: {
      id,
      name: form.name.trim() || `Establecimiento ${id}`,
      establishment,
      emissionPoint,
      address: form.address.trim() || issuerAddress,
      sequential,
      remissionSequential,
      creditNoteSequential
    }
  };
}

export function validateSelectedEstablishmentPatch({
  documentCount,
  establishments,
  patch,
  selectedEstablishment
}: {
  documentCount: number;
  establishments: IssuerEstablishment[];
  patch: Partial<IssuerEstablishment>;
  selectedEstablishment: IssuerEstablishment;
}): EstablishmentPatchValidation {
  const changesDocumentCode = patch.establishment !== undefined || patch.emissionPoint !== undefined;
  if (changesDocumentCode && documentCount > 0) {
    return {
      ok: false,
      code: "protected",
      title: "Punto protegido",
      message: `No se puede cambiar el codigo ${selectedEstablishment.id} porque tiene ${documentCount} documento(s).`
    };
  }

  const baseId = selectedEstablishment.id;
  const nextEstablishment = patch.establishment !== undefined ? normalizeThreeDigits(patch.establishment) : selectedEstablishment.establishment;
  const nextEmissionPoint = patch.emissionPoint !== undefined ? normalizeThreeDigits(patch.emissionPoint) : selectedEstablishment.emissionPoint;
  const nextId = `${nextEstablishment}-${nextEmissionPoint}`;
  if (nextId !== baseId && establishments.some((item) => item.id === nextId)) {
    return {
      ok: false,
      code: "duplicate",
      title: "Establecimiento existente",
      message: `Ya existe el establecimiento ${nextId}. Use otro codigo.`
    };
  }

  return {
    ok: true,
    value: {
      baseId,
      nextId,
      nextEstablishment,
      nextEmissionPoint
    }
  };
}

export function validateDeleteEstablishmentRequest({
  documentCount,
  establishments,
  selectedEstablishment
}: {
  documentCount: number;
  establishments: IssuerEstablishment[];
  selectedEstablishment: IssuerEstablishment;
}): EstablishmentDeleteValidation {
  if (establishments.length <= 1) {
    return {
      ok: false,
      code: "last_establishment",
      title: "Establecimiento requerido",
      message: "Debe existir al menos un establecimiento para facturar."
    };
  }
  if (documentCount > 0) {
    return {
      ok: false,
      code: "protected",
      title: "Establecimiento protegido",
      message: `No se puede eliminar ${selectedEstablishment.id} porque tiene ${documentCount} documento(s). Se conserva para proteger secuenciales, reportes y auditoria.`
    };
  }
  return { ok: true };
}

export function validateDeleteEstablishmentConfirmation({
  confirmText,
  documentCount,
  selectedEstablishment
}: {
  confirmText: string;
  documentCount: number;
  selectedEstablishment: IssuerEstablishment;
}): EstablishmentDeleteValidation {
  if (confirmText.trim() !== selectedEstablishment.id) {
    return {
      ok: false,
      code: "confirm_mismatch",
      title: "Confirmacion requerida",
      message: `Para eliminar escriba exactamente ${selectedEstablishment.id}.`
    };
  }
  if (documentCount > 0) {
    return {
      ok: false,
      code: "protected",
      title: "Establecimiento protegido",
      message: `No se puede eliminar ${selectedEstablishment.id} porque ya tiene ${documentCount} documento(s).`
    };
  }
  return { ok: true };
}

export function buildIssuerAfterEstablishmentDeletion({
  establishments,
  issuer,
  now,
  selectedEstablishment
}: {
  establishments: IssuerEstablishment[];
  issuer: Issuer;
  now: string;
  selectedEstablishment: IssuerEstablishment;
}) {
  const nextEstablishments = establishments
    .filter((item) => item.id !== selectedEstablishment.id)
    .map((item) => ({ ...item, updatedAt: item.updatedAt || now }));
  const next = nextEstablishments.find((item) => item.active !== false) || activeEstablishment(issuer);
  const nextIssuer = issuerWithEstablishment({ ...issuer, establishments: nextEstablishments, activeEstablishmentId: next.id, establishmentsUpdatedAt: now }, next);
  return {
    deleted: selectedEstablishment,
    next,
    nextEstablishments,
    nextIssuer
  };
}
