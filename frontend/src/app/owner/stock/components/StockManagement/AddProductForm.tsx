import { useState } from "react";
import api from "@/lib/api/api";
import { StockLocation } from "./dataHooks";

interface AddProductFormProps {
  onClose: () => void;
  onSuccess: () => void;
  locations: StockLocation[];
  businessId: string;
}

export default function AddProductForm({ onClose, onSuccess, locations = [], businessId }: AddProductFormProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [locationName, setLocationName] = useState("");
  const [initialQuantity, setInitialQuantity] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !price || !locationName.trim() || !businessId) return;

    setIsSubmitting(true);
    try {
      const wantedLocation = locationName.trim();
      let stockLocationId: string | undefined;

      const existing = locations.find((l) => l.name.toLowerCase() === wantedLocation.toLowerCase());

      if (existing) {
        stockLocationId = existing.id;
      } else {
        const created = await api.post("/stock-locations", { name: wantedLocation, type: "COUNTER" });
        stockLocationId = created.data?.id;
      }

      const product = await api.post("/products", {
        name: name.trim(),
        sellingPrice: Number(price),
        businessId,
        stockLocationId,
      });

      const qty = Number(initialQuantity);
      if (qty > 0 && product.data?.id) {
        await api.put("/inventory-items/level", { productId: product.data.id, quantity: qty });
      }

      onSuccess();
      onClose();
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to create product";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-md mx-4">
        <h2 className="text-xl font-bold mb-4">Add Product</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tusker 500ml"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (KES)</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              type="number"
              step="0.01"
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Storage Location</label>
            <input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              list="stock-location-options"
              placeholder="e.g. Main Counter"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="stock-location-options">
              {locations.map((l) => <option key={l.id} value={l.name} />)}
            </datalist>
            <p className="text-xs text-gray-500 mt-1">A product belongs to one location. Select existing or type new.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Initial Stock Quantity</label>
            <input
              type="number"
              min="0"
              value={initialQuantity}
              onChange={(e) => setInitialQuantity(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Set the initial number of items in stock for this product.</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !name || !price || !locationName}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Product"}
          </button>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
