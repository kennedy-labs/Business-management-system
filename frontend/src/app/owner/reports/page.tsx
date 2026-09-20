"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import api from "@/lib/api/api";
import { useAuthStore } from "@/store/useAuthStore";
import { SummaryRefreshBus } from "@/components/reports/SummaryRefreshBus";

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return `HTTP ${error.response.status} — ${JSON.stringify(error.response.data)}`;
    }
    return `Network error — ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export default function OwnerReports() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId;
  const [tab, setTab] = useState("summary");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["businessSummary", businessId],
    queryFn: async () => {
      const res = await api.get("/reports/summary", {
        params: { businessId },
      });
      return res.data as SummaryPayload;
    },
    enabled: !!businessId,
  });

  SummaryRefreshBus.useRefreshOnShiftClose(refetch);

  if (isError)
    return (
      <main className="p-6">
        <div className="rounded border border-red-300 bg-red-50 p-4 text-red-700">
          <p className="font-semibold">Could not load reports</p>
          <p className="text-sm mt-1 break-all">{describeError(error)}</p>
        </div>
      </main>
    );

  if (isLoading || !data) return <div className="p-6">Loading reports…</div>;

  const { revenue = 0, expenses = 0, net = 0, shiftsClosed = 0, mpesaReceived = 0, discrepancies = 0 } = data;

  return (
    <>
      <main className="p-6">
        <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <Tile label="Today's Revenue" value={`KES ${revenue.toLocaleString()}`} />
          <Tile label="Today's Expenses" value={`KES ${expenses.toLocaleString()}`} />
          <Tile label="Net Profit" value={`KES ${net.toLocaleString()}`} className={net >= 0 ? "text-green-600" : "text-red-600"} />
          <Tile label="Shifts Closed" value={shiftsClosed} />
          <Tile label="Mpesa Received" value={`KES ${mpesaReceived.toLocaleString()}`} />
          <Tile label="Discrepancies" value={discrepancies} />
        </section>

        <section className="bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-3">Recent Shifts</h2>
          <p className="text-sm text-gray-500">(Shift history detail — coming soon)</p>
        </section>
      </main>
    </>
  );
}

function Tile({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="bg-white p-4 rounded shadow text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className={`text-sm ${className || "text-gray-600"}`}>{label}</div>
    </div>
  );
}

type SummaryPayload = {
  revenue?: number;
  expenses?: number;
  net?: number;
  shiftsClosed?: number;
  mpesaReceived?: number;
  discrepancies?: number;
};