"use client";

/**
 * Declare money: the two numbers the worker owns.
 *
 * Stock has been handed back; now the cash (and any trusted customer tabs) are
 * declared. Expected cash is shown so variance is visible before submitting —
 * but the system trusts only what the worker declares and recomputes the rest.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReconciliationView, Shift } from "@/lib/api/worker";
import { submitReconciliation } from "@/lib/api/worker";
import {
  BigButton,
  Card,
  ErrorNote,
  MoneyInput,
  Stat,
  WorkerShell,
  fmt,
} from "@/components/worker/ui";

export default function DeclareScreen({
  shift,
  view,
}: {
  shift: Shift;
  view: ReconciliationView | null;
}) {
  const qc = useQueryClient();
  const [cash, setCash] = useState("");
  const [credit, setCredit] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => {
      if (cash.trim() === "" || Number(cash) < 0)
        throw new Error("Enter the cash you are handing over.");
      return submitReconciliation(shift.id, {
        declaredCash: Number(cash),
        declaredCredit: credit.trim() === "" ? undefined : Number(credit),
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift"] });
      qc.invalidateQueries({ queryKey: ["reconciliation", shift.id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <WorkerShell
      title="Declare the money"
      subtitle="The last step — then the owner reviews"
    >
      <ErrorNote message={error} />

      {view ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Expected cash" value={fmt(view.expectedCash)} />
          <Stat label="M-Pesa recorded" value={fmt(view.declaredMpesa)} />
        </div>
      ) : null}

      <Card>
        <MoneyInput
          label="Cash in hand"
          value={cash}
          onChange={setCash}
          placeholder="e.g. 4500"
          hint="Count the drawer before typing."
        />
        <MoneyInput
          label="Customer credit (optional)"
          value={credit}
          onChange={setCredit}
          placeholder="0"
          hint="Sales on a trusted tab."
        />
        <label className="block space-y-1">
          <span className="text-sm font-bold text-slate-700">
            Anything the owner should know?
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. broke 2 bottles"
            className="w-full rounded-xl border border-slate-300 px-3 py-3"
          />
        </label>
      </Card>

      <BigButton onClick={() => submit.mutate()} pending={submit.isPending}>
        Submit for review
      </BigButton>
    </WorkerShell>
  );
}
