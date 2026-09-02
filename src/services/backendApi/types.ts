export type AuthorizationResponse = {
  ok: boolean;
  sent?: boolean;
  status?: string;
  message?: string;
  accessKey?: string;
  authorizationStatus?: string;
  authorizationNumber?: string;
  authorizationDate?: string;
  sriEnvironment?: string;
  sriMessage?: string;
  authorizedXml?: string;
  signedXml?: string;
  reception?: unknown;
  authorization?: unknown;
  authorizationPending?: boolean;
  numberOfDocuments?: number;
  error?: string;
};

export type BackendHealthResponse = {
  ok?: boolean;
  service?: string;
  sriEnv?: "test" | "production" | string;
  allowSriSend?: boolean;
  sriAllowInsecureTls?: boolean;
  database?: {
    engine?: string;
    path?: string;
  };
  technicalLogs?: {
    enabled?: boolean;
    retentionDays?: number;
  };
  certConfigured?: boolean;
  certExists?: boolean;
  authRequired?: boolean;
  license?: BackendLicenseStatus;
  error?: string;
};

export type BackendLoginResponse = {
  ok?: boolean;
  requiresCompanySelection?: boolean;
  token?: string;
  user?: {
    id: string;
    companyId?: string;
    name: string;
    email: string;
    role: string;
    mustChangePassword?: boolean;
    supportAccess?: boolean;
  };
  company?: BackendCompanyOption;
  companyOptions?: BackendCompanyOption[];
  license?: BackendLicenseStatus;
  error?: string;
};

export type BackendCompanyOption = {
  id: string;
  ruc: string;
  businessName?: string;
  tradeName?: string;
  role?: string;
  status?: string;
};

export type BackendRegisterPayload = {
  company: {
    ruc: string;
    businessName: string;
    tradeName?: string;
    phone?: string;
    address?: string;
  };
  admin: {
    name: string;
    email: string;
    password: string;
  };
  device?: {
    deviceId?: string;
    deviceLabel?: string;
    platform?: string;
  };
};

export type BackendRegisterResponse<T> = BackendLoginResponse & {
  company?: {
    id: string;
    ruc: string;
    businessName: string;
    tradeName?: string;
    status?: string;
  };
  snapshot?: {
    data: T;
    updatedAt: string;
    summary?: BackupSummary | null;
  };
};

export type BackendLicenseStatus = {
  status?: string;
  plan?: string;
  effectiveStatus?: string;
  active?: boolean;
  startsAt?: string;
  expiresAt?: string;
  daysLeft?: number;
  maxUsers?: number;
  maxDevices?: number;
  maxEmissionPoints?: number;
  features?: Record<string, boolean>;
  notes?: string;
};

export type TechnicalLog = {
  time?: string;
  level?: "info" | "warn" | "error" | string;
  event?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  message?: string;
  user?: {
    email?: string;
    role?: string;
  };
  body?: unknown;
};

export type ReservedSequenceResponse = {
  ok?: boolean;
  documentType?: "factura" | "nota_credito" | "guia_remision";
  sequence?: string;
  accessKey?: string;
  environment?: "1" | "2";
  environmentVersion?: number;
  error?: string;
};

export type SriEnvironmentResponse = {
  ok: boolean;
  environment: "1" | "2";
  environmentVersion: number;
  changed?: boolean;
  error?: string;
  canonical?: { environment: "1" | "2"; environmentVersion: number };
};

export type CompanyAssetsStatus = {
  ok?: boolean;
  logo?: {
    configured?: boolean;
    url?: string;
  };
  certificate?: {
    configured?: boolean;
    needsUpload?: boolean;
    uploadedAt?: string;
    fileName?: string;
      size?: number;
      validFrom?: string;
      expiresAt?: string;
      daysRemaining?: number;
      expirationStatus?: "valid" | "warning" | "critical" | "expired" | "not_yet_valid";
      error?: string;
  };
  error?: string;
};

export type IdentityLookupResponse = {
  ok?: boolean;
  type?: "cedula" | "ruc";
  identificationType?: "04" | "05";
  identification?: string;
  name?: string;
  businessName?: string;
  tradeName?: string;
  address?: string;
  status?: string;
  taxpayerType?: "natural" | "juridica";
  accountingRequired?: "SI" | "NO";
  specialTaxpayer?: "SI" | "NO";
  establishments?: Array<{
    tradeName?: string;
    establishment?: string;
    address?: string;
    status?: string;
    matriz?: string;
  }>;
  error?: string;
};

export type HistoryQuery = {
  limit?: number;
  offset?: number;
  clientId?: string;
  status?: string;
  documentType?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

export type HistoryResponse<T> = {
  ok?: boolean;
  items?: T[];
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  error?: string;
};

export type CatalogQuery = {
  search?: string;
  limit?: number;
  offset?: number;
};

export type CatalogResponse<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type BackupSummary = {
  users: number;
  clients: number;
  products: number;
  sales: number;
  guides: number;
  receivedRetentions: number;
  inventoryMovements: number;
  auditLogs: number;
  cashClosings?: number;
  pendingSync?: number;
  historyCount?: number;
  prunedHistory?: number;
};
