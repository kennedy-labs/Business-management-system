import { useCallback, useMemo, useState } from "react";
import { Pencil, Package, Hash, DollarSign, X, Check } from "lucide-react";
import { InventoryItem, Product } from "./dataHooks";

interface SetLevelModalProps {
  product: Product;
  currentLevel: number | null;
  isUpdating: boolean;
  onClose: () => void;
  onSave: (productId: string, quantity: number) => void | Promise<void>;
}

function SetLevelModal({
  product,
  currentLevel,
  isUpdating,
  onClose,
  onSave,
}: SetLevelModalProps) {
  const [value, setValue] = useState(currentLevel === null ? "" : String(currentLevel));
  const [isSaving, setIsSaving] = useState(false);

  const trimmed = value.trim();
  const parsed = Number(trimmed);
  const isEmpty = trimmed === "";
  const isNegative = !isEmpty && parsed < 0;
  const isValid = !isEmpty && Number.isInteger(parsed) && parsed >= 0;

  const isBusy = isUpdating || isSaving;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Set Stock Level</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          Product: <span className="font-semibold text-white">{product.name}</span>
          <br />
          Current on hand:{" "}
          <span className="font-semibold text-indigo-400">
            {currentLevel === null ? "0" : currentLevel.toLocaleString()} units
          </span>
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Counted Quantity *
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
              placeholder="0"
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold transition-all"
            />
            {isNegative && (
              <p className="text-xs text-rose-400 mt-1">Inventory level cannot be negative.</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="flex-1 py-2 px-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isBusy}
              className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
            >
              {isBusy ? "Updating..." : "Save Count"}
            </button>
          </div>
        </form>
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

export default function ProductsTable({
  products,
  inventory,
  isLoading,
  onUpdateLevel,
  updatingProducts,
}: ProductsTableProps) {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const inventoryByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of inventory) {
      map.set(item.productId, item.quantity);
    }
    return map;
  }, [inventory]);

  const getCurrentLevel = useCallback(
    (productId: string): number | null => {
      return inventoryByProduct.get(productId) ?? null;
    },
    [inventoryByProduct]
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-slate-900 border border-slate-800/80 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 text-slate-400">
        <Package className="w-10 h-10 mx-auto mb-3 text-slate-600" />
        <p className="font-medium text-white">No products found</p>
        <p className="text-xs text-slate-400 mt-1">
          Click &quot;+ Add Product&quot; to add drinks, beverages, and set starting quantities.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
        <table className="min-w-full divide-y divide-slate-800 text-left">
          <thead className="bg-slate-900 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-6 py-4">Product Name</th>
              <th className="px-6 py-4">Selling Price</th>
              <th className="px-6 py-4">Stock Location</th>
              <th className="px-6 py-4">Current Stock</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-sm text-slate-200">
            {products.map((product) => {
              const currentLevel = getCurrentLevel(product.id);
              const isUpdating = updatingProducts.has(product.id);
              return (
                <tr key={product.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-white">{product.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-emerald-400">
                      KES {product.sellingPrice?.toLocaleString() ?? "0"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60">
                      {product.stockLocation?.name || "Counter"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold ${
                          (currentLevel ?? 0) === 0 ? "text-amber-400" : "text-white"
                        }`}
                      >
                        {currentLevel === null ? 0 : currentLevel.toLocaleString()} units
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setEditingProduct(product)}
                      disabled={isUpdating}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit Count</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingProduct && (
        <SetLevelModal
          product={editingProduct}
          currentLevel={getCurrentLevel(editingProduct.id)}
          isUpdating={updatingProducts.has(editingProduct.id)}
          onClose={() => setEditingProduct(null)}
          onSave={onUpdateLevel}
        />
      )}
    </>
  );
}