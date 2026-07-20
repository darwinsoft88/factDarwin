import { AppLicense, Issuer, IssuerEstablishment } from "../../types";
import { buildIssuerFromSriForm, SriIssuerFormValues, validateSriIssuerSave } from "../sriIssuerSave";

const license: AppLicense = {
  status: "trial",
  plan: "trial",
  startsAt: "2026-01-01",
  expiresAt: "2026-12-31",
  maxUsers: 3,
  maxDevices: 3,
  maxEmissionPoints: 999,
  features: {
    sales: true,
    sri: true,
    inventory: true,
    reports: true,
    multiDevice: true,
    multiEmissionPoint: true
  }
};

const establishments: IssuerEstablishment[] = [
  { id: "001-001", name: "Matriz", establishment: "001", emissionPoint: "001", address: "Ecuador", sequential: 1, remissionSequential: 1, creditNoteSequential: 1, active: true },
  { id: "002-003", name: "Sucursal", establishment: "002", emissionPoint: "003", address: "Ecuador", sequential: 20, remissionSequential: 2, creditNoteSequential: 3, active: true }
];
const selectedEstablishment = establishments[1] as IssuerEstablishment;

const issuer: Issuer = {
  ruc: "1723772099001",
  businessName: "Darwinsoft",
  tradeName: "Darwinsoft",
  logoUrl: "",
  address: "Ecuador",
  establishment: "002",
  emissionPoint: "003",
  sequential: 20,
  environment: "1",
  taxpayerType: "natural",
  accountingRequired: "NO",
  specialTaxpayer: "NO",
  specialTaxpayerResolution: "",
  activeEstablishmentId: "002-003",
  establishments
};

const form: SriIssuerFormValues = {
  establishmentName: "Sucursal actualizada",
  establishmentCode: "002",
  emissionPoint: "003",
  sequential: "21",
  remissionSequential: "4",
  creditNoteSequential: "5"
};

describe("sriIssuerSave", () => {
  it("builds the issuer from SRI form without creating a new point", () => {
    const nextIssuer = buildIssuerFromSriForm({
      establishments,
      form,
      issuer,
      selectedEstablishment
    });

    expect(nextIssuer.activeEstablishmentId).toBe("002-003");
    expect(nextIssuer.sequential).toBe(21);
    expect(nextIssuer.remissionSequential).toBe(4);
    expect(nextIssuer.creditNoteSequential).toBe(5);
    expect(nextIssuer.establishments?.find((item) => item.id === "002-003")?.name).toBe("Sucursal actualizada");
  });

  it("validates a normal issuer save", () => {
    const nextIssuer = buildIssuerFromSriForm({
      establishments,
      form,
      issuer,
      selectedEstablishment
    });

    const result = validateSriIssuerSave({
      backendUrl: "http://localhost:4000",
      currentIssuer: issuer,
      documentCount: 0,
      form,
      license,
      nextIssuer,
      selectedEstablishment
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        removedIds: [],
        sequential: 21,
        remissionSequential: 4,
        creditNoteSequential: 5
      }
    });
  });

  it("blocks changing the point code when documents already exist", () => {
    const changedForm = { ...form, establishmentCode: "005" };
    const nextIssuer = buildIssuerFromSriForm({
      establishments,
      form: changedForm,
      issuer,
      selectedEstablishment
    });

    const result = validateSriIssuerSave({
      backendUrl: "http://localhost:4000",
      currentIssuer: issuer,
      documentCount: 2,
      form: changedForm,
      license,
      nextIssuer,
      selectedEstablishment
    });

    expect(result).toMatchObject({
      ok: false,
      code: "point_protected"
    });
  });

  it("allows replacing the active point code only when it has no documents", () => {
    const changedForm = { ...form, establishmentCode: "005", emissionPoint: "001" };
    const nextIssuer = buildIssuerFromSriForm({
      establishments,
      form: changedForm,
      issuer,
      selectedEstablishment
    });

    const result = validateSriIssuerSave({
      backendUrl: "http://localhost:4000",
      currentIssuer: issuer,
      documentCount: 0,
      form: changedForm,
      license,
      nextIssuer,
      selectedEstablishment
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        addedIds: ["005-001"],
        removedIds: ["002-003"]
      }
    });
  });

  it("blocks invalid sequence values", () => {
    const invalidForm = { ...form, sequential: "0" };
    const nextIssuer = buildIssuerFromSriForm({
      establishments,
      form: invalidForm,
      issuer,
      selectedEstablishment
    });

    const result = validateSriIssuerSave({
      backendUrl: "http://localhost:4000",
      currentIssuer: issuer,
      documentCount: 0,
      form: invalidForm,
      license,
      nextIssuer,
      selectedEstablishment
    });

    expect(result).toMatchObject({
      ok: false,
      code: "issuer_invalid"
    });
  });
});
