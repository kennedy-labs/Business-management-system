"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import api from "@/lib/api/api";

export const dynamic = "force-dynamic";

// Default business ID when running without auth
const DEFAULT_BUSINESS_ID = "joypub";

type Summary = {
  revenue?: number;
  expenses?: number;
  net?: number;
  totalRevenue?: number;
  totalCost?: number;
  totalExpenses?: number;
  netProfit?: number;
  totalUnitsSold?: number;
  totalMpesaReceived?: number;
  openDiscrepancies?: number;
  activeShifts?: number;
};

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const payload = error.response?.data;
    if (status) {
      const detail =
        typeof payload === "string" ? payload : JSON.stringify(payload);
      return `HTTP ${status} — ${detail ?? "no response body"}`;
    }
    return `Network error — ${error.message} (is the backend running and CORS allowing this origin?)`;
  }
  return error instanceof Error ? error.message : String(error);
}

export default function OwnerDashboard() {
  const businessId = DEFAULT_BUSINESS_ID;

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["businessSummary", businessId],
    queryFn: async () => {
      const response = await api.get<Summary>("/reports/summary", {
        params: { businessId },
      });
      return response.data;
    },
    // Only fetch in the browser: avoids a server-side fetch during render.
    enabled: typeof window !== "undefined" && !!businessId,
  });

  if (isPending) return <div>Loading dashboard...</div>;

  if (isError) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">Business Overview</h1>
        <div className="p-4 bg-red-100 text-red-800 rounded">
          <p className="font-semibold">Could not load the dashboard</p>
          <p className="text-sm mt-1 break-all">{describeError(error)}</p>
        </div>
      </section>
    );
  }

  const summary: Summary = data ?? {};

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Business Overview</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-blue-100 rounded">
          <h2 className="font-bold">Total Revenue</h2>
          <p className="text-xl">KES {summary.revenue ?? 0}</p>
        </div>
        <div className="p-4 bg-red-100 rounded">
          <h2 className="font-bold">Total Expenses</h2>
          <p className="text-xl">KES {summary.expenses ?? 0}</p>
        </div>
        <div className="p-4 bg-green-100 rounded">
          <h2 className="font-bold">Net Profit</h2>
          <p className="text-xl">KES {summary.net ?? 0}</p>
        </div>
      </div>
    </section>
  );
}
