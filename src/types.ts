export type Environment = "1" | "2";
export type InvoiceStatus = "BORRADOR" | "TICKET_OFFLINE" | "FIRMADA" | "ENVIADA" | "PENDIENTE_SRI" | "ENVIADA_SRI" | "AUTORIZADA" | "DEVUELTA" | "ERROR_SRI" | "ANULADA" | "PROFORMA";
export type DocumentType = "factura" | "nota_venta" | "proforma" | "nota_credito";
export type UserRole = "admin" | "vendedor" | "cajero" | "contador";
export type LicenseStatus = "trial" | "active" | "expired" | "suspended";
export type LicensePlan = "trial" | "basico_mensual" | "basico_anual" | "pro_mensual" | "pro_anual";
export type TaxRegime = "general" | "rimpe_emprendedor" | "rimpe_negocio_popular";

export type User = {
  id: string;
  companyId?: string;
  name: string;
  email: string;
  password?: string;
  passwordHash?: string;
  mustChangePassword?: boolean;
  role: UserRole;
};

export type Client = {
  id: string;
  name: string;
  identification: string;
  identificationType: "04" | "05" | "06" | "07" | "08";
  email: string;
  phone: string;
  address: string;
  updatedAt?: string;
};

export type Product = {
  id: string;
  code: string;
  name: string;
  price: number;
  cost?: number;
  ivaRate: number;
  stock: number;
  minStock?: number;
  updatedAt?: string;
};

export type InventoryMovementType = "entrada" | "salida" | "ajuste";

export type InventoryMovement = {
  id: string;
  productId: string;
  productName: string;
  type: InventoryMovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  reference?: string;
  userId: string;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  event: string;
  entity: string;
  entityId?: string;
  summary: string;
  userId?: string;
  userName?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type CashClosing = {
  id: string;
  establishment?: string;
  emissionPoint?: string;
  establishmentName?: string;
  date: string;
  startAt: string;
  endAt: string;
  userId: string;
  userName: string;
  documentCount: number;
  total: number;
  cashExpected: number;
  cashCounted: number;
  difference: number;
  byPayment: Record<string, number>;
  notes?: string;
  createdAt: string;
};

export type Issuer = {
  ruc: string;
  businessName: string;
  tradeName: string;
  email?: string;
  logoUrl: string;
  address: string;
  establishment: string;
  emissionPoint: string;
  sequential: number;
  environment: Environment;
  taxRegime?: TaxRegime;
  taxpayerType: "natural" | "juridica";
  accountingRequired: "SI" | "NO";
  specialTaxpayer: "SI" | "NO";
  specialTaxpayerResolution: string;
  retentionAgent?: "SI" | "NO";
  retentionAgentResolution?: string;
  remissionSequential?: number;
  creditNoteSequential?: number;
  activeEstablishmentId?: string;
  establishments?: IssuerEstablishment[];
  establishmentsUpdatedAt?: string;
};

export type IssuerEstablishment = {
  id: string;
  name: string;
  establishment: string;
  emissionPoint: string;
  address?: string;
  sequential: number;
  remissionSequential?: number;
  creditNoteSequential?: number;
  active?: boolean;
  updatedAt?: string;
};

export type SaleItem = {
  productId: string;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  cost?: number;
  discount: number;
  ivaRate: number;
  sourceLineKey?: string;
};

export type PaymentMethod = "01" | "15" | "16" | "17" | "18" | "19" | "20" | "21";

export type Sale = {
  id: string;
  documentType?: DocumentType;
  establishment?: string;
  emissionPoint?: string;
  establishmentName?: string;
  clientId: string;
  userId: string;
  createdAt: string;
  sequence: string;
  accessKey: string;
  authorizationNumber?: string;
  authorizationDate?: string;
  sriEnvironment?: string;
  sriMessage?: string;
  retryHistory?: string[];
  emailHistory?: {
    to: string;
    sentAt: string;
    status: "sent" | "failed";
    error?: string;
  }[];
  sourceSaleId?: string;
  supportDocumentType?: "01";
  supportDocumentNumber?: string;
  supportAuthorizationNumber?: string;
  supportIssueDate?: string;
  creditReason?: string;
  voidReason?: string;
  voidedAt?: string;
  signedXml?: string;
  authorizedXml?: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: InvoiceStatus;
  items: SaleItem[];
};

export type RetentionTaxType = "IVA" | "RENTA";

export type ReceivedRetention = {
  id: string;
  saleId: string;
  clientId: string;
  userId: string;
  createdAt: string;
  receivedAt: string;
  documentNumber: string;
  authorizationNumber?: string;
  taxType: RetentionTaxType;
  code?: string;
  base: number;
  percentage: number;
  amount: number;
  notes?: string;
};

export type RemissionGuide = {
  id: string;
  establishment?: string;
  emissionPoint?: string;
  establishmentName?: string;
  sourceSaleId: string;
  clientId: string;
  userId: string;
  createdAt: string;
  sequence: string;
  accessKey: string;
  authorizationNumber?: string;
  authorizationDate?: string;
  sriEnvironment?: string;
  sriMessage?: string;
  retryHistory?: string[];
  signedXml?: string;
  authorizedXml?: string;
  status: InvoiceStatus;
  transporterName: string;
  transporterIdentification: string;
  transporterIdentificationType: "04" | "05" | "06";
  plate: string;
  startAddress: string;
  endAddress: string;
  route: string;
  reason: string;
  startDate: string;
  endDate: string;
  items: SaleItem[];
};

export type PendingSyncItem = {
  id: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  title: string;
  patch: unknown;
};

export type AppLicense = {
  status: LicenseStatus;
  plan: LicensePlan;
  startsAt: string;
  expiresAt: string;
  maxUsers: number;
  maxDevices: number;
  maxEmissionPoints?: number;
  features: {
    sales: boolean;
    sri: boolean;
    inventory: boolean;
    reports: boolean;
    multiDevice: boolean;
    multiEmissionPoint?: boolean;
  };
  notes?: string;
};

export type AppData = {
  users: User[];
  clients: Client[];
  products: Product[];
  inventoryMovements: InventoryMovement[];
  auditLogs: AuditLog[];
  sales: Sale[];
  receivedRetentions: ReceivedRetention[];
  guides: RemissionGuide[];
  cashClosings: CashClosing[];
  issuer: Issuer;
  backendUrl: string;
  autoBackupEnabled?: boolean;
  autoBackupLastAt?: string;
  autoBackupLastError?: string;
  pendingSync?: PendingSyncItem[];
  deletedIds?: {
    clients?: string[];
    products?: string[];
    users?: string[];
  };
  license?: AppLicense;
  historyPolicy?: {
    mode?: string;
    salesDays?: number;
    salesLimit?: number;
    guideDays?: number;
    guideLimit?: number;
    movementLimit?: number;
    auditLimit?: number;
    cashClosingDays?: number;
    cashClosingLimit?: number;
    compactedAt?: string;
  };
};
