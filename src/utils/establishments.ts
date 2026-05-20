import { AppData, Issuer, IssuerEstablishment, RemissionGuide, Sale } from "../types";

export function activeIssuer(data: AppData): Issuer {
  return issuerWithEstablishment(data.issuer, activeEstablishment(data.issuer));
}

export function activeEstablishment(issuer: Issuer): IssuerEstablishment {
  const establishments = normalizedEstablishments(issuer);
  return establishments.find((item) => item.id === issuer.activeEstablishmentId && item.active)
    || establishments.find((item) => item.active)
    || establishments[0]
    || {
      id: "001-001",
      name: "Matriz",
      establishment: "001",
      emissionPoint: "001",
      address: issuer.address || "",
      sequential: issuer.sequential || 1,
      remissionSequential: issuer.remissionSequential || 1,
      creditNoteSequential: issuer.creditNoteSequential || 1,
      active: true
    };
}

export function issuerWithEstablishment(issuer: Issuer, establishment: IssuerEstablishment): Issuer {
  return {
    ...issuer,
    activeEstablishmentId: establishment.id,
    establishment: establishment.establishment,
    emissionPoint: establishment.emissionPoint,
    address: establishment.address || issuer.address,
    sequential: establishment.sequential,
    remissionSequential: establishment.remissionSequential || 1,
    creditNoteSequential: establishment.creditNoteSequential || 1
  };
}

export function normalizedEstablishments(issuer: Issuer): IssuerEstablishment[] {
  const fallback: IssuerEstablishment = {
    id: `${issuer.establishment || "001"}-${issuer.emissionPoint || "001"}`,
    name: "Matriz",
    establishment: issuer.establishment || "001",
    emissionPoint: issuer.emissionPoint || "001",
    address: issuer.address || "",
    sequential: issuer.sequential || 1,
    remissionSequential: issuer.remissionSequential || 1,
    creditNoteSequential: issuer.creditNoteSequential || 1,
    active: true
  };
  const source = Array.isArray(issuer.establishments) && issuer.establishments.length > 0 ? issuer.establishments : [fallback];
  const normalized = source.map((item) => {
    const establishment = normalizeThreeDigits(item.establishment);
    const emissionPoint = normalizeThreeDigits(item.emissionPoint);
    return {
      ...item,
      id: `${establishment}-${emissionPoint}`,
      name: String(item.name || `Establecimiento ${establishment}-${emissionPoint}`).trim(),
      establishment,
      emissionPoint,
      address: String(item.address || issuer.address || "").trim(),
      sequential: Math.max(1, Number(item.sequential || 1)),
      remissionSequential: Math.max(1, Number(item.remissionSequential || 1)),
      creditNoteSequential: Math.max(1, Number(item.creditNoteSequential || 1)),
      active: item.active !== false,
      updatedAt: item.updatedAt || ""
    };
  });
  return normalizeEstablishmentNames(normalized);
}

export function editableEstablishments(issuer: Issuer): IssuerEstablishment[] {
  const source = Array.isArray(issuer.establishments) && issuer.establishments.length > 0 ? issuer.establishments : normalizedEstablishments(issuer);
  return source.map((item) => {
    const establishment = normalizeThreeDigits(item.establishment);
    const emissionPoint = normalizeThreeDigits(item.emissionPoint);
    return {
      ...item,
      id: `${establishment}-${emissionPoint}`,
      name: String(item.name ?? ""),
      establishment,
      emissionPoint,
      address: String(item.address || issuer.address || ""),
      sequential: Math.max(1, Number(item.sequential || 1)),
      remissionSequential: Math.max(1, Number(item.remissionSequential || 1)),
      creditNoteSequential: Math.max(1, Number(item.creditNoteSequential || 1)),
      active: item.active !== false,
      updatedAt: item.updatedAt || ""
    };
  });
}

export function normalizeThreeDigits(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return (digits || "1").padStart(3, "0").slice(-3);
}

export function updateIssuerEstablishmentSequence(issuer: Issuer, establishmentId: string, field: "sequential" | "remissionSequential" | "creditNoteSequential", nextValue: number): Issuer {
  const establishments = normalizedEstablishments(issuer).map((item) => item.id === establishmentId ? { ...item, [field]: nextValue } : item);
  const active = establishments.find((item) => item.id === establishmentId) || activeEstablishment({ ...issuer, establishments });
  return {
    ...issuerWithEstablishment({ ...issuer, establishments, activeEstablishmentId: active.id }, active),
    establishments
  };
}

export function issuerForSale(issuer: Issuer, sale: Pick<Sale, "establishment" | "emissionPoint" | "establishmentName">): Issuer {
  if (!sale.establishment || !sale.emissionPoint) return issuer;
  const establishment = normalizedEstablishments(issuer).find((item) => item.establishment === sale.establishment && item.emissionPoint === sale.emissionPoint) || {
    ...activeEstablishment(issuer),
    id: `${sale.establishment}-${sale.emissionPoint}`,
    name: sale.establishmentName || `${sale.establishment}-${sale.emissionPoint}`,
    establishment: sale.establishment,
    emissionPoint: sale.emissionPoint
  };
  return issuerWithEstablishment(issuer, establishment);
}

export function issuerForGuide(issuer: Issuer, guide: Pick<RemissionGuide, "establishment" | "emissionPoint" | "establishmentName">): Issuer {
  return issuerForSale(issuer, guide);
}

function normalizeEstablishmentNames(establishments: IssuerEstablishment[]) {
  const matrizCandidates = establishments.filter((item) => item.name.trim().toLowerCase() === "matriz");
  const matrizId = matrizCandidates.find((item) => item.id === "001-001")?.id || matrizCandidates[0]?.id || "";
  const seenNames = new Set<string>();

  return establishments.map((item) => {
    let name = item.name.trim();
    if (name.toLowerCase() === "matriz" && item.id !== matrizId) {
      name = `Sucursal ${item.establishment}-${item.emissionPoint}`;
    }
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      name = `${name} ${item.establishment}-${item.emissionPoint}`;
    }
    seenNames.add(name.toLowerCase());
    return { ...item, name };
  });
}
