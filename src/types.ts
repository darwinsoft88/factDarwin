export type Environment = "1" | "2";
export type InvoiceStatus = "BORRADOR" | "TICKET_OFFLINE" | "FIRMADA" | "ENVIADA" | "PENDIENTE_SRI" | "ENVIADA_SRI" | "AUTORIZADA" | "DEVUELTA" | "ERROR_SRI" | "ANULADA" | "PROFORMA" | "CONVERTIDA";
export type DocumentType = "factura" | "nota_venta" | "proforma" | "nota_credito";
export type UserRole = "admin" | "vendedor" | "cajero" | "contador";
export type LicenseStatus = "trial" | "active" | "expired" | "suspended";
export type LicensePlan = "trial" | "basico_mensual" | "basico_anual" | "pro_mensual" | "pro_anual" | "premium_mensual" | "premium_anual";
export type TaxRegime = "general" | "rimpe_emprendedor" | "rimpe_negocio_popular";
export type CatalogItemType = "product" | "service";

export type User = {
  id: string;
  companyId?: string;
  name: string;
  email: string;
  password?: string;
  passwordHash?: string;
  mustChangePassword?: boolean;
  role: UserRole;
  supportAccess?: boolean;
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
  itemType?: CatalogItemType;
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
export type SaleInventoryOperationType = "APPLY" | "REVERSE";
export type CreditNoteInventoryOperationType = "CREDIT_NOTE_RETURN" | "CREDIT_NOTE_RETURN_REVERSE";
export type InventoryOperationType = SaleInventoryOperationType | CreditNoteInventoryOperationType;
export type SaleInventoryState = "UNKNOWN" | "NOT_APPLIED" | "APPLIED" | "REVERSED" | "RECONCILIATION_PENDING";
export type CreditNoteInventoryState = "UNKNOWN" | "NOT_APPLIED" | "APPLIED" | "REVERSED";

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
  saleId?: string;
  inventoryOperationId?: string;
  inventoryOperationType?: InventoryOperationType;
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

export type CreditPayment = {
  id: string;
  /** Identidad durable de creación. Es obligatoria para pagos modernos y ausente en registros legacy. */
  operationId?: string;
  /** Identidad durable de la intención de lote. Solo existe en cobros múltiples modernos. */
  batchId?: string;
  /** Identidad durable de la operación de lote compartida por todos sus pagos. */
  batchOperationId?: string;
  batchSize?: number;
  /** Identidad durable de una anulación moderna, independiente de operationId. */
  voidOperationId?: string;
  saleId: string;
  clientId: string;
  establishment?: string;
  emissionPoint?: string;
  establishmentName?: string;
  userId: string;
  userName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  note?: string;
  createdAt: string;
  voidedAt?: string;
  voidedByUserId?: string;
  voidedByUserName?: string;
  voidReason?: string;
};

export type CreditAdjustmentType = "CREDIT_NOTE";
export type CreditAdjustmentState = "UNKNOWN" | "APPLIED" | "REVERSED";

export type CreditAdjustment = {
  id: string;
  operationId?: string;
  reverseOperationId?: string;
  type: CreditAdjustmentType;
  sourceCreditNoteId: string;
  sourceSaleId: string;
  clientId: string;
  amount: number;
  state: CreditAdjustmentState;
  appliedAt?: string;
  reversedAt?: string;
  userId: string;
  reason?: string;
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
  /** Version monotonica asignada exclusivamente por el backend. */
  environmentVersion?: number;
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
  itemType?: CatalogItemType;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  cost?: number;
  discount: number;
  ivaRate: number;
  sourceLineKey?: string;
};

export type AdditionalInfoField = {
  id: string;
  name: string;
  value: string;
};

export type PaymentMethod = "01" | "15" | "16" | "17" | "18" | "19" | "20" | "21";
export type PaymentCondition = "contado" | "credito";
export type CreditStatus = "pendiente" | "pagado";

export type SalePaymentSplit = {
  id: string;
  paymentMethod: PaymentMethod;
  amount: number;
  bank?: string;
  reference?: string;
};

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
  inventoryState?: SaleInventoryState;
  inventoryOperationId?: string;
  creditNoteInventoryState?: CreditNoteInventoryState;
  creditNoteInventoryOperationId?: string;
  autoInvoiceOnSync?: boolean;
  autoInvoiceAttemptedAt?: string;
  autoInvoiceLastError?: string;
  convertedAt?: string;
  convertedToSaleId?: string;
  convertedToSequence?: string;
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
  payments?: SalePaymentSplit[];
  paymentCondition?: PaymentCondition;
  creditDueDate?: string;
  creditBalance?: number;
  creditStatus?: CreditStatus;
  additionalInfo?: AdditionalInfoField[];
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

export type PendingSyncPatch = {
  /** Identifica de forma durable una unidad lógica de sincronización y se conserva en todos sus reintentos. */
  requestId?: string;
  [key: string]: unknown;
};

export type PendingSyncItem = {
  id: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  title: string;
  /** Payload persistido; los registros nuevos usan PendingSyncPatch y los legacy se validan al cargar. */
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
  creditPayments: CreditPayment[];
  creditAdjustments?: CreditAdjustment[];
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
    sales?: string[];
    inventoryMovements?: string[];
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
