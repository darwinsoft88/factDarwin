import { AppData, IssuerEstablishment } from "../../types";
import { buildIssuerAfterEstablishmentDeletion, buildNewEstablishmentForm, countDocumentsForEstablishment, selectedEditableEstablishment, validateDeleteEstablishmentConfirmation, validateDeleteEstablishmentRequest, validateNewEstablishmentDraft, validateSelectedEstablishmentPatch } from "../sriEstablishmentEditor";

const establishments: IssuerEstablishment[] = [
  { id: "001-001", name: "Matriz", establishment: "001", emissionPoint: "001", sequential: 1, active: true },
  { id: "002-003", name: "Sucursal", establishment: "002", emissionPoint: "003", sequential: 5, active: true }
];

describe("sriEstablishmentEditor", () => {
  it("selects the active editable establishment", () => {
    const selected = selectedEditableEstablishment(
      {
        ruc: "0999999999001",
        businessName: "Empresa",
        tradeName: "Empresa",
        logoUrl: "",
        address: "Ecuador",
        establishment: "001",
        emissionPoint: "001",
        sequential: 1,
        environment: "1",
        taxpayerType: "natural",
        accountingRequired: "NO",
        specialTaxpayer: "NO",
        specialTaxpayerResolution: "",
        activeEstablishmentId: "002-003",
        establishments
      },
      establishments
    );

    expect(selected.id).toBe("002-003");
  });

  it("counts sales and guides for one establishment only", () => {
    const data = {
      sales: [
        { establishment: "002", emissionPoint: "003" },
        { establishment: "002", emissionPoint: "003" },
        { establishment: "001", emissionPoint: "001" }
      ],
      guides: [
        { establishment: "002", emissionPoint: "003" },
        { establishment: "003", emissionPoint: "001" }
      ]
    } as AppData;

    expect(countDocumentsForEstablishment(data, "002-003")).toBe(3);
  });

  it("builds the next establishment form with normalized codes", () => {
    expect(buildNewEstablishmentForm(establishments, "")).toEqual({
      name: "Sucursal 3",
      establishment: "003",
      emissionPoint: "001",
      address: "Ecuador",
      sequential: "1",
      remissionSequential: "1",
      creditNoteSequential: "1"
    });
  });

  it("validates a new establishment draft", () => {
    const result = validateNewEstablishmentDraft({
      canManage: true,
      establishments,
      form: {
        name: "Sucursal nueva",
        establishment: "3",
        emissionPoint: "2",
        address: "",
        sequential: "10",
        remissionSequential: "11",
        creditNoteSequential: "12"
      },
      issuerAddress: "Ecuador",
      maxEmissionPoints: 5
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: "003-002",
        name: "Sucursal nueva",
        establishment: "003",
        emissionPoint: "002",
        address: "Ecuador",
        sequential: 10,
        remissionSequential: 11,
        creditNoteSequential: 12
      }
    });
  });

  it("blocks duplicate new establishment drafts", () => {
    const result = validateNewEstablishmentDraft({
      canManage: true,
      establishments,
      form: {
        name: "Duplicado",
        establishment: "002",
        emissionPoint: "003",
        address: "Ecuador",
        sequential: "1",
        remissionSequential: "1",
        creditNoteSequential: "1"
      },
      issuerAddress: "Ecuador",
      maxEmissionPoints: 5
    });

    expect(result).toMatchObject({
      ok: false,
      code: "duplicate",
      title: "Establecimiento existente"
    });
  });

  it("blocks invalid new establishment sequences", () => {
    const result = validateNewEstablishmentDraft({
      canManage: true,
      establishments,
      form: {
        name: "Sucursal",
        establishment: "003",
        emissionPoint: "001",
        address: "Ecuador",
        sequential: "0",
        remissionSequential: "1",
        creditNoteSequential: "1"
      },
      issuerAddress: "Ecuador",
      maxEmissionPoints: 5
    });

    expect(result).toMatchObject({
      ok: false,
      code: "invalid_sequences"
    });
  });

  it("blocks code changes when selected establishment has documents", () => {
    const result = validateSelectedEstablishmentPatch({
      documentCount: 2,
      establishments,
      patch: { establishment: "003" },
      selectedEstablishment: establishments[1]!
    });

    expect(result).toEqual({
      ok: false,
      code: "protected",
      title: "Punto protegido",
      message: "No se puede cambiar el codigo 002-003 porque tiene 2 documento(s)."
    });
  });

  it("blocks editing selected establishment into an existing code", () => {
    const result = validateSelectedEstablishmentPatch({
      documentCount: 0,
      establishments,
      patch: { establishment: "001", emissionPoint: "001" },
      selectedEstablishment: establishments[1]!
    });

    expect(result).toEqual({
      ok: false,
      code: "duplicate",
      title: "Establecimiento existente",
      message: "Ya existe el establecimiento 001-001. Use otro codigo."
    });
  });

  it("normalizes valid selected establishment patches", () => {
    const result = validateSelectedEstablishmentPatch({
      documentCount: 0,
      establishments,
      patch: { establishment: "4", emissionPoint: "5" },
      selectedEstablishment: establishments[1]!
    });

    expect(result).toEqual({
      ok: true,
      value: {
        baseId: "002-003",
        nextId: "004-005",
        nextEstablishment: "004",
        nextEmissionPoint: "005"
      }
    });
  });

  it("blocks deleting the last establishment", () => {
    const result = validateDeleteEstablishmentRequest({
      documentCount: 0,
      establishments: [establishments[0]!],
      selectedEstablishment: establishments[0]!
    });

    expect(result).toEqual({
      ok: false,
      code: "last_establishment",
      title: "Establecimiento requerido",
      message: "Debe existir al menos un establecimiento para facturar."
    });
  });

  it("blocks deleting an establishment with documents", () => {
    const result = validateDeleteEstablishmentRequest({
      documentCount: 3,
      establishments,
      selectedEstablishment: establishments[1]!
    });

    expect(result).toEqual({
      ok: false,
      code: "protected",
      title: "Establecimiento protegido",
      message: "No se puede eliminar 002-003 porque tiene 3 documento(s). Se conserva para proteger secuenciales, reportes y auditoria."
    });
  });

  it("requires exact confirmation before deleting an establishment", () => {
    const result = validateDeleteEstablishmentConfirmation({
      confirmText: "002",
      documentCount: 0,
      selectedEstablishment: establishments[1]!
    });

    expect(result).toEqual({
      ok: false,
      code: "confirm_mismatch",
      title: "Confirmacion requerida",
      message: "Para eliminar escriba exactamente 002-003."
    });
  });

  it("builds issuer data after deleting an establishment", () => {
    const result = buildIssuerAfterEstablishmentDeletion({
      establishments,
      issuer: {
        ruc: "0999999999001",
        businessName: "Empresa",
        tradeName: "Empresa",
        logoUrl: "",
        address: "Ecuador",
        establishment: "002",
        emissionPoint: "003",
        sequential: 5,
        environment: "1",
        taxpayerType: "natural",
        accountingRequired: "NO",
        specialTaxpayer: "NO",
        specialTaxpayerResolution: "",
        activeEstablishmentId: "002-003",
        establishments
      },
      now: "2026-06-02T00:00:00.000Z",
      selectedEstablishment: establishments[1]!
    });

    expect(result.deleted.id).toBe("002-003");
    expect(result.next.id).toBe("001-001");
    expect(result.nextEstablishments).toHaveLength(1);
    expect(result.nextIssuer).toMatchObject({
      activeEstablishmentId: "001-001",
      establishment: "001",
      emissionPoint: "001",
      establishmentsUpdatedAt: "2026-06-02T00:00:00.000Z"
    });
  });
});
