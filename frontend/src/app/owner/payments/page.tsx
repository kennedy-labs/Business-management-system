"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/api";
import { useAuthStore } from "@/store/useAuthStore";

export const dynamic = "force-dynamic";

type MpesaBalance = {
  id: string;
  kind: "OPENING" | "CLOSING";
  balance: number | string;
  recordedAt: string;
};

type ShiftRow = {
  id: string;
  periodType: string;
  openedAt: string;
  closedAt: string | null;
};

export default function OwnerPayments() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId as string | undefined;
  const enabled = !!businessId;

  // M-Pesa is not a list of individual transactions. Each period records
  // an opening and closing balance snapshot, and the difference is what the
  // worker handled. We fetch the most recent periods and their snapshots.
  const { data: shifts, isLoading: ls } = useQuery({
    queryKey: ["shifts", businessId],
    queryFn: async () =>
      (await api.get("/shifts", { params: { businessId } })).data as ShiftRow[],
    enabled,
  });

  const recentShifts = (shifts ?? []).slice(0, 10);
  const balancesByShift = useQuery({
    queryKey: ["mpesaBalances", businessId, recentShifts.map((s) => s.id).join(",")],
    queryFn: async () => {
      const results: Record<string, MpesaBalance[]> = {};
      await Promise.all(
        recentShifts.map(async (s) => {
          results[s.id] = (
            (await api.get(`/shifts/${s.id}/mpesa-balances`)).data
          ) as MpesaBalance[];
        }),
      );
      return results;
    },
    enabled: enabled && recentShifts.length > 0,
  });

  const periodDelta = (id: string): number | null => {
    const bals = balancesByShift.data?.[id];
    if (!bals) return null;
    const opening = bals.find((b) => b.kind === "OPENING");
    const closing = bals.find((b) => b.kind === "CLOSING");
    if (!opening || !closing) return null;
    return Number(closing.balance) - Number(opening.balance);
  };

  if (!businessId)
    return <main className="p-6"><p>Loading...</p></main>;

  return (
    <>
      <main className="p-6">
        <h1 className="text-3xl font-bold mb-6">Payments</h1>

        <section className="mb-10">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-semibold">M-Pesa by Period</h2>
            <p className="text-sm text-gray-500">Closing balance − opening balance per period</p>
          </div>
          {ls ? <p>Loading periods...</p> : !recentShifts.length ? (
            <p className="text-gray-500">No periods recorded yet.</p>
          ) : (
            <table className="min-w-full bg-white rounded shadow">
              <thead><tr className="bg-gray-100"><th className="p-3 text-left">Opened</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Closed</th><th className="p-3 text-right">M-Pesa Handled</th></tr></thead>
              <tbody>
                {recentShifts.map((s) => {
                  const delta = periodDelta(s.id);
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="p-3 text-sm">{new Date(s.openedAt).toLocaleString()}</td>
                      <td className="p-3 text-sm capitalize">{s.periodType.toLowerCase()}</td>
                      <td className="p-3 text-sm">{s.closedAt ? new Date(s.closedAt).toLocaleString() : "Open"}</td>
                      <td className="p-3 text-right font-semibold">
                        {delta === null ? <span className="text-gray-400">—</span> : `KES ${delta.toLocaleString()}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="text-xs text-gray-500 mt-2">
            The amount is derived from the M-Pesa balance snapshots taken when the period opened and closed — no individual transactions are recorded.
          </p>
        </section>
      </main>
    </>
  );
}