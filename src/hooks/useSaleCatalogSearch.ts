import { useEffect, useMemo } from "react";
import { LIST_BATCH_SIZE } from "../constants/app";
import { searchBackendClients, searchBackendProducts } from "../services/backend";
import { AppData, Client, Product } from "../types";
import { canonicalConsumerFinalClient, isConsumerFinalClient } from "../validation";
import { clientWithLocalSalePricePreference } from "../utils/productPrices";

type RemoteResults<T> = { items: T[]; total: number } | null;

type UseSaleCatalogSearchParams = {
  backendToken: string;
  clientId: string;
  clientSearch: string;
  data: AppData;
  productId: string;
  productSearch: string;
  remoteClientResults: RemoteResults<Client>;
  remoteProductResults: RemoteResults<Product>;
  selectedRemoteClient: Client | null;
  visibleClientCount: number;
  visibleProductCount: number;
  setClientId: React.Dispatch<React.SetStateAction<string>>;
  setRemoteClientResults: React.Dispatch<React.SetStateAction<RemoteResults<Client>>>;
  setRemoteProductResults: React.Dispatch<React.SetStateAction<RemoteResults<Product>>>;
  setSelectedRemoteClient: React.Dispatch<React.SetStateAction<Client | null>>;
  setProductId: React.Dispatch<React.SetStateAction<string>>;
  setVisibleClientCount: React.Dispatch<React.SetStateAction<number>>;
  setVisibleProductCount: React.Dispatch<React.SetStateAction<number>>;
};

export function useSaleCatalogSearch({
  backendToken,
  clientId,
  clientSearch,
  data,
  productId,
  productSearch,
  remoteClientResults,
  remoteProductResults,
  selectedRemoteClient,
  setClientId,
  setProductId,
  setRemoteClientResults,
  setRemoteProductResults,
  setSelectedRemoteClient,
  setVisibleClientCount,
  setVisibleProductCount,
  visibleClientCount,
  visibleProductCount
}: UseSaleCatalogSearchParams) {
  const selectedProduct = useMemo(() => data.products.find((item) => item.id === productId), [data.products, productId]);
  const clientsForSale = useMemo(() => data.clients.map((client) => isConsumerFinalClient(client) ? canonicalConsumerFinalClient(client) : client), [data.clients]);
  const selectedClient = useMemo(() => {
    if (selectedRemoteClient?.id === clientId) return selectedRemoteClient;
    const remoteClient = remoteClientResults?.items.find((item) => item.id === clientId);
    if (remoteClient) return remoteClient;
    const localClient = clientsForSale.find((item) => item.id === clientId);
    if (localClient) return localClient;
    return undefined;
  }, [clientId, clientsForSale, remoteClientResults, selectedRemoteClient]);
  const localFilteredClientsForSale = useMemo(() => {
    const search = clientSearch.trim().toLowerCase();
    if (!search) return clientsForSale;
    return clientsForSale.filter((client) => client.name.toLowerCase().includes(search) || client.identification.includes(search));
  }, [clientSearch, clientsForSale]);
  const localFilteredProductsForSale = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return data.products;
    return data.products.filter((product) => product.name.toLowerCase().includes(search) || product.code.toLowerCase().includes(search));
  }, [data.products, productSearch]);
  const filteredClientsForSale = remoteClientResults?.items ?? localFilteredClientsForSale;
  const filteredProductsForSale = remoteProductResults?.items ?? localFilteredProductsForSale;
  const filteredClientCount = remoteClientResults?.total ?? localFilteredClientsForSale.length;
  const filteredProductCount = remoteProductResults?.total ?? localFilteredProductsForSale.length;
  const visibleClientsForSale = filteredClientsForSale.slice(0, visibleClientCount);
  const visibleProductsForSale = filteredProductsForSale.slice(0, visibleProductCount);

  useEffect(() => {
    setVisibleClientCount(LIST_BATCH_SIZE);
  }, [clientSearch, setVisibleClientCount]);

  useEffect(() => {
    setVisibleProductCount(LIST_BATCH_SIZE);
  }, [productSearch, setVisibleProductCount]);

  useEffect(() => {
    const search = clientSearch.trim();
    if (!backendToken || !data.backendUrl || search.length < 2) {
      setRemoteClientResults(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      searchBackendClients<Client>(data.backendUrl, backendToken, { search, limit: visibleClientCount, offset: 0 })
        .then((result) => {
          const normalizedSearch = search.toLowerCase();
          const items = result.items
            .map((client) => clientWithLocalSalePricePreference(client, clientsForSale.find((local) => local.id === client.id)))
            .map((client) => isConsumerFinalClient(client) ? canonicalConsumerFinalClient(client) : client)
            .filter((client) => client.name.toLowerCase().includes(normalizedSearch) || client.identification.includes(normalizedSearch));
          const total = items.length < result.items.length ? items.length : result.total;
          if (!cancelled) setRemoteClientResults({ items, total });
        })
        .catch(() => {
          if (!cancelled) setRemoteClientResults(null);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [backendToken, clientSearch, clientsForSale, data.backendUrl, setRemoteClientResults, visibleClientCount]);

  useEffect(() => {
    const search = productSearch.trim();
    if (!backendToken || !data.backendUrl || search.length < 2) {
      setRemoteProductResults(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      searchBackendProducts<Product>(data.backendUrl, backendToken, { search, limit: visibleProductCount, offset: 0 })
        .then((result) => {
          if (!cancelled) setRemoteProductResults({ items: result.items, total: result.total });
        })
        .catch(() => {
          if (!cancelled) setRemoteProductResults(null);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [backendToken, data.backendUrl, productSearch, setRemoteProductResults, visibleProductCount]);

  useEffect(() => {
    if (filteredClientsForSale.length === 0) return;
    if (filteredClientsForSale.some((client) => client.id === clientId)) return;
    const nextClient = filteredClientsForSale[0];
    setClientId(nextClient?.id || "");
    setSelectedRemoteClient(nextClient || null);
  }, [clientId, filteredClientsForSale, setClientId, setSelectedRemoteClient]);

  useEffect(() => {
    if (filteredProductsForSale.length === 0) return;
    if (filteredProductsForSale.some((product) => product.id === productId)) return;
    setProductId(filteredProductsForSale[0]?.id || "");
  }, [filteredProductsForSale, productId, setProductId]);

  return {
    clientsForSale,
    filteredClientCount,
    filteredClientsForSale,
    filteredProductCount,
    filteredProductsForSale,
    selectedClient,
    selectedProduct,
    visibleClientsForSale,
    visibleProductsForSale
  };
}
