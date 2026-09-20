"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";

export const dynamic = "force-dynamic";

type VerificationItemDto = {
  productId: string;
  openingQuantity: number;
};

export default function OpeningStockVerification() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId as string | undefined;
  const userId = user?.id as string | undefined;

  const { data, isLoading: isInventoryLoading, isError } = useQuery({
    queryKey: ["openingStock", businessId],
    queryFn: async () => {
      const response = await api.get("/inventory-items", {
        params: { businessId },
      });
      return response.data as Array<{
        id: string;
        quantity: number;
        product: {
          id: string;
          productId?: string;
          name: string;
        };
      }>;
    },
    enabled: typeof window !== "undefined" && !!businessId,
  });

  // Load branches so we can send branchId with the shift-open payload
  const { data: branches } = useQuery({
    queryKey: ["branches", businessId],
    queryFn: async () => {
      const response = await api.get("/branches", {
        // /branches scopes by this header, not by the query string.
        headers: { "x-business-id": businessId ?? "" },
      });
      return response.data as Array<{ id: string; name: string }>;
    },
    enabled: typeof window !== "undefined" && !!businessId,
  });

  const [counts, setCounts] = useState<Record<string, number>>({});

  const startShiftMutation = useMutation({
    mutationFn: async () => {
      const verificationData: VerificationItemDto[] = Object.entries(counts)
        .filter(([, quantity]) => String(quantity).trim() !== "")
        .map(([itemId, quantity]) => {
          // Find the corresponding inventory item to extract its productId
          const inventoryItem = data?.find((item) => item.id === itemId);
          const productId = inventoryItem?.product.productId || inventoryItem?.product.id;
          return {
            productId: productId || itemId,
            openingQuantity: Number(quantity),
          };
        });

      if (verificationData.length === 0) {
        throw new Error("Please enter at least one item count.");
      }

      const payload = {
        branchId: branches?.[0]?.id ?? businessId, // fallback to businessId if no branch mapping
        userId,
        items: verificationData,
      };

      return await api.post("/shifts/open", payload);
    },
    onSuccess: () => {
      router.push("/worker/shift/active");
    },
    onError: (error: any) => {
      alert(error?.response?.data?.message || "Failed to start shift.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startShiftMutation.mutate();
  };

  if (isError)
    return (
      <div className="text-red-700">
        Could not load opening inventory. Check that the backend is reachable.
      </div>
    );

  if (isInventoryLoading || !data) return <div>Loading opening inventory...</div>;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold mb-4">Opening Stock Verification</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {(Array.isArray(data) ? data : []).map((item) => (
          <div
            key={item.id}
            className="flex justify-between items-center p-2 border rounded"
          >
            <span>
              {item.product.name} (Expected: {item.quantity})
            </span>
            <input
              type="number"
              placeholder="Counted"
              value={counts[item.id] ?? ""}
              onChange={(e) =>
                setCounts({ ...counts, [item.id]: Number(e.target.value) })
              }
              className="border p-1 w-20"
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={startShiftMutation.isPending}
          className={`text-white p-2 rounded w-full ${
            startShiftMutation.isPending
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {startShiftMutation.isPending
            ? "Starting Shift..."
            : "Verify and Start Shift"}
        </button>
      </form>
    </section>
  );
}
