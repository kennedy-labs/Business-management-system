"use client";

/**
 * The expense and stock-change tiles of the active period, split out of
 * ActiveScreen so each file stays phone-screen sized.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Shift } from "@/lib/api/worker";
import { getInventoryItems, recordExpense, setInventoryLevel } from "@/lib/api/worker";
import { useAuthStore } from "@/store/useAuthStore";
import { BigButton, Card, ErrorNote, MoneyInput } from "@/components/worker/ui";

// ---------------------------------------------------------------------------
// Expenses: amount + a one-line story.
// ---------------------------------------------------------------------------

export function ExpenseCard({ shift }: { shift: Shift }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const record = useMutation({
    mutationFn: () => {
      if (!amount.trim() || Number(amount) <= 0)
        throw new Error("Enter the amount you spent.");
      return recordExpense({
        amount: Number(amount),
        description: description.trim() || undefined,
        branchId: shift.branchId,
        createdById: (user?.id as string) ?? undefined,
      });
    },
    onSuccess: () => {
      setAmount("");
      setDescription("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Card title="💵 Expense">
      <ErrorNote message={error} />
      <div className="grid grid-cols-2 gap-2">
        <MoneyInput label="Amount" value={amount} onChange={setAmount} placeholder="0" />
        <label className="block space-y-1">
          <span className="text-sm font-bold text-slate-700">What for?</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. airtime, soap"
            className="w-full rounded-xl border border-slate-300 px-3 py-3.5"
          />
        </label>
      </div>
      <BigButton onClick={() => record.mutate()} pending={record.isPending}>
        Record expense
      </BigButton>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stock changes: deliveries in, damage out. Written as the authoritative level
// so the ledger always explains the jump (an ADJUSTMENT movement).
// ---------------------------------------------------------------------------

export function StockCard({ shift }: { shift: Shift }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["inventoryItems"],
    queryFn: getInventoryItems,
  });
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);

  const record = useMutation({
    mutationFn: () => {
      if (!productId) throw new Error("Choose the product.");
      if (quantity.trim() === "" || Number(quantity) < 0)
        throw new Error("Enter the new total for this product.");
      return setInventoryLevel({
        productId,
        quantity: Number(quantity),
        branchId: shift.branchId,
      });
    },
    onSuccess: () => {
      setQuantity("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["inventoryItems"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Card title="📦 Stock change">
      <ErrorNote message={error} />
      <p className="text-xs text-slate-500">
        Delivery arrived or something broke? Enter the product&apos;s new total
        quantity — every change is written to the audit ledger.
      </p>
      <select
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
      >
        <option value="">Choose product…</option>
        {(data ?? []).map((i) => (
          <option key={i.id} value={i.productId}>
            {i.product.name} (now {i.quantity})
          </option>
        ))}
      </select>
      <MoneyInput
        label="New total quantity"
        value={quantity}
        onChange={setQuantity}
        placeholder="e.g. 24"
      />
      <BigButton onClick={() => record.mutate()} pending={record.isPending}>
        Save stock level
      </BigButton>
    </Card>
  );
}
