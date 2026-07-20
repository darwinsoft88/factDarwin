import { AppLicense, Issuer, IssuerEstablishment } from "../types";
import { validateIssuer } from "../validation";
import { addedEstablishmentIds } from "./dataMerge";
import { activeEstablishment, issuerWithEstablishment, normalizedEstablishments, normalizeThreeDigits } from "./establishments";
import { canUseEmissionScope, maxEmissionPointsForLicense } from "./license";

export type SriIssuerFormValues = {
  establishmentName: string;
  establishmentCode: string;
  emissionPoint: string;
  sequential: string;
  remissionSequential: string;
  creditNoteSequential: string;
};

export type SriIssuerSaveValidation =
  | { ok: true; value: { addedIds: string[]; nextIssuer: Issuer; removedIds: string[]; sequential: number; remissionSequential: number; creditNoteSequential: number } }
  | {
    ok: false;
    code:
      | "issuer_invalid"
      | "name_required"
      | "point_invalid"
      | "point_protected"
      | "sequential_invalid"
      | "remission_sequential_invalid"
      | "credit_note_sequential_invalid"
      | "new_point_blocked"
      | "license_limit"
      | "license_scope"
      | "duplicate_points";
    title: string;
    message: string;
  };

export function buildIssuerFromSriForm({
  establishments,
  form,
  issuer,
  selectedEstablishment
}: {
  establishments: IssuerEstablishment[];
  form: SriIssuerFormValues;
  issuer: Issuer;
  selectedEstablishment: IssuerEstablishment;
}) {
  const sequential = Number(form.sequential);
  const remissionSequential = Number(form.remissionSequential);
  const creditNoteSequential = Number(form.creditNoteSequential);
  const activeId = selectedEstablishment.id;
  const nextEstablishmentCode = normalizeThreeDigits(form.establishmentCode);
  const nextEmissionPointCode = normalizeThreeDigits(form.emissionPoint);
  const nextActiveId = `${nextEstablishmentCode}-${nextEmissionPointCode}`;
  const nextEstablishments = establishments.map((item) => item.id === activeId ? {
    ...item,
    name: form.establishmentName.trim(),
    address: issuer.address,
    establishment: nextEstablishmentCode,
    emissionPoint: nextEmissionPointCode,
    id: nextActiveId,
    sequential,
    remissionSequential,
    creditNoteSequential
  } : item);
  const active = nextEstablishments.find((item) => item.id === nextActiveId) || nextEstablishments.find((item) => item.id === activeId) || activeEstablishment(issuer);
  return issuerWithEstablishment(
    {
      ...issuer,
      establishments: nextEstablishments,
      activeEstablishmentId: active.id,
      establishmentsUpdatedAt: active.id !== activeId ? new Date().toISOString() : issuer.establishmentsUpdatedAt
    },
    active
  );
}

export function validateSriIssuerSave({
  backendUrl,
  currentIssuer,
  documentCount,
  form,
  license,
  nextIssuer,
  selectedEstablishment
}: {
  backendUrl: string;
  currentIssuer: Issuer;
  documentCount: number;
  form: SriIssuerFormValues;
  license: AppLicense;
  nextIssuer: Issuer;
  selectedEstablishment: IssuerEstablishment;
}): SriIssuerSaveValidation {
  const sequential = Number(form.sequential);
  const remissionSequential = Number(form.remissionSequential);
  const creditNoteSequential = Number(form.creditNoteSequential);
  const formEstablishment = normalizeThreeDigits(form.establishmentCode);
  const formEmissionPoint = normalizeThreeDigits(form.emissionPoint);
  const errors: string[] = [];

  validateIssuer({ ...currentIssuer, establishment: formEstablishment, emissionPoint: formEmissionPoint, sequential, remissionSequential, creditNoteSequential }, backendUrl, errors);
  if (errors.length > 0) {
    return {
      ok: false,
      code: "issuer_invalid",
      title: "Revise configuracion SRI",
      message: errors.join("\n")
    };
  }

  if (!form.establishmentName.trim()) {
    return {
      ok: false,
      code: "name_required",
      title: "Nombre requerido",
      message: "Ingrese el nombre del establecimiento antes de guardar."
    };
  }

  if (!/^\d{1,3}$/.test(form.establishmentCode) || !/^\d{1,3}$/.test(form.emissionPoint)) {
    return {
      ok: false,
      code: "point_invalid",
      title: "Punto invalido",
      message: "Estab. y Pto. emi. deben tener entre 1 y 3 digitos."
    };
  }

  if (documentCount > 0 && (formEstablishment !== selectedEstablishment.establishment || formEmissionPoint !== selectedEstablishment.emissionPoint)) {
    return {
      ok: false,
      code: "point_protected",
      title: "Punto protegido",
      message: `No se puede cambiar el codigo ${selectedEstablishment.id} porque tiene ${documentCount} documento(s).`
    };
  }

  if (!Number.isInteger(sequential) || sequential <= 0) {
    return {
      ok: false,
      code: "sequential_invalid",
      title: "Secuencial invalido",
      message: "Ingrese el siguiente secuencial como numero entero mayor a cero."
    };
  }

  if (!Number.isInteger(remissionSequential) || remissionSequential <= 0) {
    return {
      ok: false,
      code: "remission_sequential_invalid",
      title: "Secuencial guia invalido",
      message: "Ingrese el siguiente secuencial de guia como numero entero mayor a cero."
    };
  }

  if (!Number.isInteger(creditNoteSequential) || creditNoteSequential <= 0) {
    return {
      ok: false,
      code: "credit_note_sequential_invalid",
      title: "Secuencial nota credito invalido",
      message: "Ingrese el siguiente secuencial de nota de credito como numero entero mayor a cero."
    };
  }

  const addedIds = addedEstablishmentIds(currentIssuer, nextIssuer);
  const previousIdsForGuard = new Set(normalizedEstablishments(currentIssuer).map((item) => item.id));
  const nextIdsForGuard = new Set(normalizedEstablishments(nextIssuer).map((item) => item.id));
  const removedIds = Array.from(previousIdsForGuard).filter((id) => !nextIdsForGuard.has(id));
  const isActiveCodeReplacement = addedIds.length === 1 && removedIds.length === 1 && removedIds[0] === selectedEstablishment.id && documentCount === 0;
  if (addedIds.length > 0 && !isActiveCodeReplacement) {
    return {
      ok: false,
      code: "new_point_blocked",
      title: "Creacion de punto bloqueada",
      message: `Guardar emisor no puede crear puntos nuevos (${addedIds.join(", ")}). Use Agregar establecimiento para crear sucursales.`
    };
  }

  const activeEstablishmentCount = normalizedEstablishments(nextIssuer).filter((item) => item.active !== false).length;
  const maxEmissionPoints = maxEmissionPointsForLicense(license);
  if (activeEstablishmentCount > maxEmissionPoints) {
    return {
      ok: false,
      code: "license_limit",
      title: "Plan requerido",
      message: `Su plan actual permite ${maxEmissionPoints} punto(s) de emision. Desactive puntos extra o actualice a Pro.`
    };
  }

  if (!canUseEmissionScope(nextIssuer, license, activeEstablishment(nextIssuer).id)) {
    return {
      ok: false,
      code: "license_scope",
      title: "Punto fuera del plan",
      message: "El punto de emision activo no esta incluido en su plan actual."
    };
  }

  const ids = normalizedEstablishments(nextIssuer).map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    return {
      ok: false,
      code: "duplicate_points",
      title: "Establecimientos duplicados",
      message: "Hay establecimientos duplicados. Revise estab. y punto de emision."
    };
  }

  return {
    ok: true,
    value: {
      addedIds,
      nextIssuer,
      removedIds,
      sequential,
      remissionSequential,
      creditNoteSequential
    }
  };
}
