import { useState } from "react";
import { LIST_BATCH_SIZE } from "../constants/app";
import { money } from "../sri";
import { AdditionalInfoField, AppData, Client, DocumentType, PaymentCondition, PaymentMethod, Product, SaleItem, SalePaymentSplit } from "../types";

export function useSaleFormState(data: AppData) {
  const [clientId, setClientId] = useState(data.clients[0]?.id ?? "");
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [unitGrossPrice, setUnitGrossPrice] = useState(data.products[0] ? money(data.products[0].price) : "");
  const [grossDiscount, setGrossDiscount] = useState("0");
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [documentType, setDocumentType] = useState<DocumentType>("factura");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("01");
  const [salePayments, setSalePayments] = useState<SalePaymentSplit[]>([]);
  const [paymentCondition, setPaymentCondition] = useState<PaymentCondition>("contado");
  const [creditDueDate, setCreditDueDate] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState<AdditionalInfoField[]>([]);
  const [additionalInfoVisible, setAdditionalInfoVisible] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [editingSaleId, setEditingSaleId] = useState("");
  const [sourceTicketId, setSourceTicketId] = useState("");
  const [sourceProformaId, setSourceProformaId] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [retryingSaleId, setRetryingSaleId] = useState("");
  const [notice, setNotice] = useState("");
  const [issueNotice, setIssueNotice] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [saleScannerVisible, setSaleScannerVisible] = useState(false);
  const [visibleClientCount, setVisibleClientCount] = useState(LIST_BATCH_SIZE);
  const [visibleProductCount, setVisibleProductCount] = useState(LIST_BATCH_SIZE);
  const [remoteClientResults, setRemoteClientResults] = useState<{ items: Client[]; total: number } | null>(null);
  const [remoteProductResults, setRemoteProductResults] = useState<{ items: Product[]; total: number } | null>(null);
  const [selectedRemoteClient, setSelectedRemoteClient] = useState<Client | null>(null);
  const [processingMessage, setProcessingMessage] = useState("");

  const resetSaleInputs = () => {
    setQuantity("1");
    setGrossDiscount("0");
    setDiscountMode("amount");
    setPaymentMethod("01");
    setSalePayments([]);
    setPaymentCondition("contado");
    setCreditDueDate("");
    setAdditionalInfo([]);
    setAdditionalInfoVisible(false);
    setProductSearch("");
    setClientSearch("");
    setVisibleClientCount(LIST_BATCH_SIZE);
    setVisibleProductCount(LIST_BATCH_SIZE);
  };

  return {
    additionalInfo,
    additionalInfoVisible,
    clientId,
    clientSearch,
    discountMode,
    documentType,
    editingSaleId,
    grossDiscount,
    issueNotice,
    issuing,
    items,
    notice,
    paymentMethod,
    salePayments,
    paymentCondition,
    processingMessage,
    creditDueDate,
    productId,
    productSearch,
    quantity,
    remoteClientResults,
    remoteProductResults,
    resetSaleInputs,
    retryingSaleId,
    saleScannerVisible,
    selectedRemoteClient,
    sourceProformaId,
    sourceTicketId,
    unitGrossPrice,
    visibleClientCount,
    visibleProductCount,
    setAdditionalInfo,
    setAdditionalInfoVisible,
    setClientId,
    setClientSearch,
    setDiscountMode,
    setDocumentType,
    setEditingSaleId,
    setGrossDiscount,
    setIssueNotice,
    setIssuing,
    setItems,
    setNotice,
    setPaymentMethod,
    setSalePayments,
    setPaymentCondition,
    setProcessingMessage,
    setCreditDueDate,
    setProductId,
    setProductSearch,
    setQuantity,
    setRemoteClientResults,
    setRemoteProductResults,
    setRetryingSaleId,
    setSaleScannerVisible,
    setSelectedRemoteClient,
    setSourceProformaId,
    setSourceTicketId,
    setUnitGrossPrice,
    setVisibleClientCount,
    setVisibleProductCount
  };
}
