import { useState, useEffect } from "react";
import api from "@/lib/api/api";

export type Product = {
  id: string;
  name: string;
  sellingPrice: number;
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
  refresh: () => void;
};

type UseInventoryReturn = {
  inventory: InventoryItem[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
};

type UseStockLocationsReturn = {
  locations: StockLocation[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
};

/**
 * Custom hook for fetching products with consistent error handling.
 * Separates data fetching concerns from presentation logic.
 */
export function useProducts(businessId: string) {
  const [products, setProducts] = useState<Product[]>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProducts = async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get("/products", { params: { businessId } });
      setProducts(response.data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [businessId]);

  return {
    products,
    isLoading,
    error,
    refresh: fetchProducts,
  } as UseProductsReturn;
}

/**
 * Custom hook for fetching inventory items.
 */
export function useInventory(businessId: string) {
  const [inventory, setInventory] = useState<InventoryItem[]>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInventory = async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get("/inventory-items");
      setInventory(response.data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [businessId]);

  return {
    inventory,
    isLoading,
    error,
    refresh: fetchInventory,
  } as UseInventoryReturn;
}

/**
 * Custom hook for fetching stock locations.
 */
export function useStockLocations(businessId: string) {
  const [locations, setLocations] = useState<StockLocation[]>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLocations = async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get("/stock-locations");
      setLocations(response.data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, [businessId]);

  return {
    locations,
    isLoading,
    error,
    refresh: fetchLocations,
  } as UseStockLocationsReturn;
}
