import { useCallback, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import DataTable, { ColumnDef } from "../Table/DataTable";
import { InventoryItem, Product } from "./dataHooks";

interface SetLevelModalProps {
  product: Product;
  currentLevel: number;
  isUpdating: boolean;
  onClose: () => void;
  onSave: (productId: string, quantity: number) => void | Promise<void>;
}

/**
 * Modal for setting the inventory level of a single product.
 * Hidden behind the edit icon in the products table so the table stays clean.
 * Quantities below zero are rejected on the client and again by the API.
 */
function SetLevelModal({
  product,
  currentLevel,
  isUpdating,
  onClose,
  onSave,
}: SetLevelModalProps) {
  const [value, setValue] = useState(String(currentLevel));
  const [isSaving, setIsSaving] = useState(false);

  const trimmed = value.trim();
  const parsed = Number(trimmed);
  const isEmpty = trimmed === "";
  const isNegative = !isEmpty && parsed < 0;
  const isValid = !isEmpty && Number.isInteger(parsed) && parsed >= 0;

  const isBusy = isUpdating || isSaving;

  const handleSave = async () => {
    if (!isValid || isBusy) return;
    setIsSaving(true);
    try {
      await onSave(product.id, parsed);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-sm mx-4">
        <h2 className="text-xl font-bold mb-1">Set Inventory Level</h2>
        <p className="text-sm text-gray-600 mb-4">
          <span className="font-medium text-gray-900">{product.name}</span>
          {" — current level: "}
          {currentLevel.toLocaleString()}
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          New Level
        </label>
        <input
          type="number"
          min="0"
          step="1"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "-" || e.key === "e") e.preventDefault();
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {isNegative ? (
          <p className="text-xs text-red-600 mt-1">
            Inventory level cannot be negative.
          </p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">
            Enter the counted quantity. It cannot go below 0.
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={!isValid || isBusy}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isBusy ? "Saving..." : "Save Level"}
          </button>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProductsTableProps {
  products: Product[];
  inventory: InventoryItem[];
  isLoading: boolean;
  onUpdateLevel: (productId: string, quantity: number) => void | Promise<void>;
  updatingProducts: Set<string>;
}

/**
 * Products table showing the stored inventory level per product.
 * Inventory is the source of truth, so the stored quantity is shown as-is.
 * "Set Inventory Level" is kept out of sight behind a pencil icon in the row.
 */
export default function ProductsTable({
  products,
  inventory,
  isLoading,
  onUpdateLevel,
  updatingProducts,
}: ProductsTableProps) {
  const levelByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of inventory ?? []) {
      map.set(item.productId, item.quantity);
    }
    return map;
  }, [inventory]);

  const [editingProduct, setEditingProduct] = useState<{
    product: Product;
    level: number;
  } | null>(null);

  const handleEditClick = useCallback(
    (product: Product) => {
      const level = levelByProduct.get(product.id) ?? 0;
      setEditingProduct({ product, level });
    },
    [levelByProduct]
  );

  const handleSave = useCallback(
    (productId: string, quantity: number) => {
      if (quantity < 0) return;
      return onUpdateLevel(productId, quantity);
    },
    [onUpdateLevel]
  );

  const columns: ColumnDef<Product>[] = [
    {
      key: "product",
      header: "Product",
      cell: (product: Product) => (
        <div>
          <div className="font-medium text-gray-900">{product.name}</div>
          <div className="text-sm text-gray-500">
            KES {Number(product.sellingPrice).toLocaleString()}
          </div>
        </div>
      ),
    },
    {
      key: "location",
      header: "Location",
      cell: (product: Product) => (
        <span className="text-gray-600">
          {product.stockLocation?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "level",
      header: "Level",
      cell: (product: Product) => {
        const level = levelByProduct.get(product.id) ?? 0;
        return (
          <span
            className={
              level <= 0 ? "font-semibold text-red-600" : "font-semibold text-gray-900"
            }
          >
            {level.toLocaleString()}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      className: "w-12 text-right",
      cell: (product: Product) => {
        const isUpdating = updatingProducts.has(product.id);
        return (
          <button
            type="button"
            onClick={() => handleEditClick(product)}
            disabled={isUpdating}
            title="Set inventory level"
            aria-label={"Set inventory level for " + product.name}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
        );
      },
    },
  ];

  return (
    <div>
      <DataTable
        columns={columns}
        data={products ?? []}
        isLoading={isLoading}
        rowKey={(product) => product.id}
        emptyMessage="No products found."
      />

      {editingProduct && (
        <SetLevelModal
          product={editingProduct.product}
          currentLevel={editingProduct.level}
          isUpdating={updatingProducts.has(editingProduct.product.id)}
          onClose={() => setEditingProduct(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}