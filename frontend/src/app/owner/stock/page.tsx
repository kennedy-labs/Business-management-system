"use client";

import { useState, useCallback } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import api from "@/lib/api/api";

import SectionHeader from "./components/Layout/SectionHeader";
import AddProductForm from "./components/StockManagement/AddProductForm";
import ProductsTable from "./components/StockManagement/ProductsTable";
import { useProducts, useInventory, useStockLocations } from "./components/StockManagement/dataHooks";

export const dynamic = "force-dynamic";

/**
 * Owner Stock Management Page
 * 
 * Clean interface for managing products and inventory levels.
 * Inventory levels are stored as the source of truth via direct API updates.
 */
export default function OwnerStockPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId as string | undefined;
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [updatingProducts, setUpdatingProducts] = useState<Set<string>>(new Set());

  // Data fetching hooks
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

  // Handle inventory level updates
  const handleUpdateLevel = useCallback(
    async (productId: string, quantity: number) => {
      setUpdatingProducts((prev) => new Set(prev).add(productId));
      try {
        await api.put("/inventory-items/level", {
          productId,
          quantity,
        });
        
        // Refresh all related data
        await Promise.all([refreshInventory(), refreshProducts()]);
      } catch (e: unknown) {
        const message =
          (e as { response?: { data?: { message?: string } } })?.response?.data
            ?.message || "Failed to update inventory level";
        alert(message);
      } finally {
        setUpdatingProducts((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    [refreshInventory, refreshProducts]
  );

  // Handle product creation success
  const handleProductCreated = () => {
    refreshProducts();
    refreshLocations();
  };

  if (!businessId) {
    return (
      <main className="p-6">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <SectionHeader 
          title="Stock Management" 
          subtitle="Manage products and inventory levels"
        />
        <button
          onClick={() => setShowAddProduct(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          + Add Product
        </button>
      </div>

      {/* Add Product Modal */}
      {showAddProduct && (
        <AddProductForm
          onClose={() => setShowAddProduct(false)}
          onSuccess={handleProductCreated}
          locations={locations ?? []}
          businessId={businessId}
        />
      )}

      {/* Products Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Products</h2>
        
        {!products?.length && !productsLoading ? (
          <p className="text-gray-500">No products yet. Add your first product to get started.</p>
        ) : (
          <ProductsTable
            products={products ?? []}
            inventory={inventory ?? []}
            isLoading={productsLoading || inventoryLoading}
            onUpdateLevel={handleUpdateLevel}
            updatingProducts={updatingProducts}
          />
        )}
      </section>
    </main>
  );
}

