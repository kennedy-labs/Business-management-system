import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/api";

export type Product = {
  id: string;
  name: string;
  sellingPrice: number;
  costPrice?: number;
  stockLocation?: { id: string; name: string } | null;
};

export type InventoryItem = {
  id: string;
  quantity: number;
  productId: string;
  product: { id: string; name: string };
  stockLocation?: { id: string; name: string } | null;
};

export type StockLocation = {
  id: string;
  name: string;
  type: "COUNTER" | "STORAGE";
};

type UseProductsReturn = {
  products: Product[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<any>;
};

type UseInventoryReturn = {
  inventory: InventoryItem[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<any>;
};

type UseStockLocationsReturn = {
  locations: StockLocation[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<any>;
};

/**
 * Custom hook for fetching products with TanStack Query caching for instant transitions.
 */
export function useProducts(businessId: string): UseProductsReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["products", businessId],
    queryFn: async () => {
      const response = await api.get("/products", { params: { businessId } });
      return response.data as Product[];
    },
    enabled: !!businessId,
  });

  return {
    products: data,
    isLoading,
    error: error as Error | null,
    refresh: refetch,
  };
}

/**
 * Custom hook for fetching inventory items with TanStack Query caching.
 */
export function useInventory(businessId: string): UseInventoryReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["inventory", businessId],
    queryFn: async () => {
      const response = await api.get("/inventory-items");
      return response.data as InventoryItem[];
    },
    enabled: !!businessId,
  });

  return {
    inventory: data,
    isLoading,
    error: error as Error | null,
    refresh: refetch,
  };
}

/**
 * Custom hook for fetching stock locations with TanStack Query caching.
 */
export function useStockLocations(businessId: string): UseStockLocationsReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stockLocations", businessId],
    queryFn: async () => {
      const response = await api.get("/stock-locations");
      return response.data as StockLocation[];
    },
    enabled: !!businessId,
  });

  return {
    locations: data,
    isLoading,
    error: error as Error | null,
    refresh: refetch,
  };
}
