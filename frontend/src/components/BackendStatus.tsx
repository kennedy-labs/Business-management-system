"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/api";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Health = {
  status?: string;
  database?: string;
};

/**
 * Shows whether the frontend can actually reach the backend.
 *
 * Without this, a failed API call is indistinguishable from a slow one and
 * pages sit on "Loading..." forever with no explanation.
 */
export default function BackendStatus() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["backendHealth"],
    queryFn: async () => {
      const res = await api.get<Health>("/health");
      return res.data;
    },
    retry: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
  });

  if (isPending) {
    return (
      <div className="mb-4 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Checking backend at {API_BASE}…
      </div>
    );
  }

  if (isError) {
    const detail = axios.isAxiosError(error)
      ? error.response
        ? `HTTP ${error.response.status}`
        : error.message
      : String(error);

    return (
      <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
        <span className="font-semibold">Backend unreachable</span> ({API_BASE}) — {detail}
      </div>
    );
  }

  const healthy = data?.status === "ok" && data?.database === "connected";

  return (
    <div
      className={`mb-4 rounded border px-3 py-2 text-xs ${
        healthy
          ? "border-green-300 bg-green-50 text-green-700"
          : "border-amber-300 bg-amber-50 text-amber-800"
      }`}
    >
      <span className="font-semibold">
        {healthy ? "Backend connected" : "Backend responded, database problem"}
      </span>{" "}
      ({API_BASE}) — status: {data?.status ?? "unknown"}, database:{" "}
      {data?.database ?? "unknown"}
    </div>
  );
}