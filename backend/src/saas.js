const crypto = require("node:crypto");
const { defaultLicense } = require("./license");

function buildInitialTenantData({ company, adminUser }) {
  const today = new Date().toISOString();
  const ruc = company.ruc || "";
  const tradeName = company.tradeName || company.businessName || "Mi Empresa";

  return {
    backendUrl: "",
    issuer: {
      ruc: /^\d{13}$/.test(ruc) ? ruc : "9999999999999",
      businessName: company.businessName || tradeName,
      tradeName,
      email: adminUser.email || "",
      logoUrl: "",
      address: company.address || "Ecuador",
      establishment: "001",
      emissionPoint: "001",
      sequential: 1,
      environment: "1",
      taxpayerType: "natural",
      accountingRequired: "NO",
      specialTaxpayer: "NO",
      specialTaxpayerResolution: "",
      remissionSequential: 1,
      creditNoteSequential: 1,
      activeEstablishmentId: "001-001",
      establishments: [
        {
          id: "001-001",
          name: "Matriz",
          establishment: "001",
          emissionPoint: "001",
          address: company.address || "Ecuador",
          sequential: 1,
          remissionSequential: 1,
          creditNoteSequential: 1,
          active: true
        }
      ]
    },
    users: [adminUser],
    clients: [
      {
        id: "c-final",
        name: "Consumidor Final",
        identification: "9999999999999",
        identificationType: "07",
        email: "",
        phone: "",
        address: "Ecuador",
        updatedAt: today
      }
    ],
    products: [],
    inventoryMovements: [],
    auditLogs: [],
    sales: [],
    receivedRetentions: [],
    guides: [],
    cashClosings: [],
    autoBackupEnabled: true,
    autoBackupLastAt: "",
    autoBackupLastError: "",
    pendingSync: [],
    license: {
      ...defaultLicense(),
      notes: "Trial SaaS generado al registrar la empresa"
    }
  };
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

module.exports = {
  buildInitialTenantData,
  uid
};
