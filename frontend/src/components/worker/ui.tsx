"use client";

/**
 * The worker UI's building blocks.
 *
 * Deliberately phone-first and dependency-free: a worker counts stock with one
 * thumb, often in a loud room. Every target is large, every screen has exactly
 * one primary action, and money is always rendered as formatted KES.
 */
import { useMemo } from "react";

export const money = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

export function fmt(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : money.format(n);
}

export function timeOf(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" }) : "—";
}

import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import Link from "next/link";

/** Phone-width shell with a sticky status header and a sticky action footer. */
export function WorkerShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, business, logout } = useAuthStore();
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-slate-100 flex justify-center">
      <div className="w-full max-w-md flex flex-col min-h-dvh">
        <header className="sticky top-0 z-20 bg-slate-900 text-white px-4 py-3 shadow">
          <div className="flex items-center justify-between">
            <div className="text-xs text-indigo-400 font-semibold truncate max-w-[200px]">
              {business?.name || user?.businessName || "Bar Ops"} &bull; {user?.name || "Worker"}
            </div>
            <div className="flex items-center gap-2">
              {user?.role === "OWNER" && (
                <Link
                  href="/owner/dashboard"
                  className="text-[11px] text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800"
                >
                  Owner
                </Link>
              )}
              <button
                onClick={() => {
                  logout();
                  router.replace("/login");
                }}
                className="text-[11px] text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded hover:bg-slate-800"
              >
                Sign Out
              </button>
            </div>
          </div>
          <h1 className="text-lg font-bold leading-tight mt-1">{title}</h1>
          {subtitle ? (
            <div className="text-xs text-slate-300 mt-0.5">{subtitle}</div>
          ) : null}
        </header>
        <main className="flex-1 p-4 pb-32 space-y-4">{children}</main>
        {footer ? (
          <footer className="sticky bottom-0 z-20 bg-white border-t border-slate-200 p-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function BigButton({
  children,
  onClick,
  disabled,
  tone = "primary",
  pending,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger";
  pending?: boolean;
}) {
  const tones = {
    primary: "bg-emerald-600 hover:bg-emerald-700",
    danger: "bg-rose-600 hover:bg-rose-700",
  } as const;
  return (
    <button
      onClick={onClick}
      disabled={disabled || pending}
      className={`w-full rounded-xl px-4 py-4 text-base font-bold text-white shadow transition
        ${tones[tone]} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function Card({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
      {title ? (
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">
      {message}
    </p>
  );
}

/**
 * One row of a physical count. The expected quantity is prefilled so the
 * common case ("it matches") is zero typing, and a mismatch is one edit.
 */
export function CountRow({
  name,
  expected,
  value,
  onChange,
  unit,
  disabled,
}: {
  name: string;
  expected: number;
  value: string;
  onChange: (next: string) => void;
  unit?: string;
  disabled?: boolean;
}) {
  const mismatch = useMemo(
    () => value !== "" && Number(value) !== expected,
    [value, expected],
  );
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 ${
        mismatch ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="min-w-0">
        <div className="font-semibold text-slate-800 truncate">{name}</div>
        <div className="text-xs text-slate-500">
          Expected: {expected}
          {unit ? ` ${unit}` : ""}
          {mismatch ? " · mismatch" : ""}
        </div>
      </div>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-24 rounded-lg border px-3 py-2 text-right text-lg font-bold tabular-nums
          ${mismatch ? "border-amber-400" : "border-slate-300"} focus:outline-none focus:ring-2 focus:ring-emerald-500`}
      />
    </div>
  );
}

/** A big tappable money entry — the only input a worker trusts with cash. */
export function MoneyInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        type="number"
        min={0}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-4 text-2xl font-bold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "good" | "bad" | "neutral";
}) {
  const tones = {
    good: "text-emerald-700",
    bad: "text-rose-700",
    neutral: "text-slate-800",
  } as const;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${tones[tone ?? "neutral"]}`}>
        {value}
      </div>
    </div>
  );
}
