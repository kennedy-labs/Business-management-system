"use client";

import { useState, useCallback } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import api from "@/lib/api/api";
import { PlusCircle } from "lucide-react";

import SectionHeader from "@/app/owner/stock/components/Layout/SectionHeader";
import AddProductForm from "@/app/owner/stock/components/StockManagement/AddProductForm";
import ProductsTable from "@/app/owner/stock/components/StockManagement/ProductsTable";
import { useProducts, useInventory, useStockLocations } from "@/app/owner/stock/components/StockManagement/dataHooks";

export default function StockTab() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId as string | undefined;
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [updatingProducts, setUpdatingProducts] = useState<Set<string>>(new Set());
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const {
    products,
    isLoading: productsLoading,
    refresh: refreshProducts,
  } = useProducts(businessId ?? "");

  const {
    inventory,
    isLoading: inventoryLoading,
    refresh: refreshInventory,
  } = useInventory(businessId ?? "");

  const {
    locations,
    refresh: refreshLocations,
  } = useStockLocations(businessId ?? "");

  const handleUpdateLevel = useCallback(
    async (productId: string, quantity: number) => {
      setUpdatingProducts((prev) => new Set(prev).add(productId));
      setErrorBanner(null);
      try {
        await api.put("/inventory-items/level", {
          productId,
          quantity,
          businessId,
        });
        await Promise.all([refreshInventory(), refreshProducts()]);
      } catch (e: any) {
        const message =
          e?.response?.data?.message ||
          e?.response?.data?.error ||
          e?.message ||
          "Failed to update inventory level";
        setErrorBanner(message);
      } finally {
        setUpdatingProducts((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    [businessId, refreshInventory, refreshProducts]
  );

  const handleProductCreated = () => {
    refreshProducts();
    refreshLocations();
    refreshInventory();
  };

  if (!businessId) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
        <span>Loading stock management...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-100">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <SectionHeader
          title="Stock & Inventory Register"
          subtitle="Add products, set price points, and update counted quantities."
        />
        <button
          onClick={() => setShowAddProduct(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Add New Product</span>
        </button>
      </div>

      {errorBanner && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          {errorBanner}
        </div>
      )}

      {showAddProduct && (
        <AddProductForm
          onClose={() => setShowAddProduct(false)}
          onSuccess={handleProductCreated}
          locations={locations ?? []}
          businessId={businessId}
        />
      )}

      <section>
        <ProductsTable
          products={products ?? []}
          inventory={inventory ?? []}
          isLoading={productsLoading || inventoryLoading}
          onUpdateLevel={handleUpdateLevel}
          updatingProducts={updatingProducts}
        />
      </section>
    </div>
  );
}
