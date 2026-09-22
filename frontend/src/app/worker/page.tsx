"use client";

/**
 * The worker's app: one route, one state machine.
 *
 * There is deliberately nothing to navigate. The shift state — derived from
 * the backend, never from local memory — decides which screen is on the
 * phone, which is what makes the blueprint's rule ("transitions must never be
 * skipped") a property of the UI rather than a hope.
 *
 *   no period          → OpenShiftScreen  ("what were you given?")
 *   active period      → ActiveScreen     ("record what happens")
 *   stock handed back  → DeclareScreen    ("declare the money")
 *   money declared     → ResultScreen     ("here is the truth")
 *
 * `step` is a local override used *within* the active phase only, for the
 * closing-count ritual; everything else is derived.
 */
import { useState } from "react";
import { useShift } from "@/hooks/useShift";
import OpenShiftScreen from "@/components/worker/screens/OpenShiftScreen";
import ActiveScreen from "@/components/worker/screens/ActiveScreen";
import ClosingScreen from "@/components/worker/screens/ClosingScreen";
import DeclareScreen from "@/components/worker/screens/DeclareScreen";
import ResultScreen from "@/components/worker/screens/ResultScreen";
import { Card, WorkerShell } from "@/components/worker/ui";

export const dynamic = "force-dynamic";

type Step = "derived" | "closing-count";

export default function WorkerPage() {
  const state = useShift();
  const [step, setStep] = useState<Step>("derived");

  if (state.phase === "loading") {
    return (
      <WorkerShell title="Your period">
        <p className="text-slate-500">Loading…</p>
      </WorkerShell>
    );
  }

  if (state.phase === "no-period") return <OpenShiftScreen />;

  if (state.phase === "active") {
    if (step === "closing-count" && state.shift) {
      return (
        <ClosingScreen
          shift={state.shift}
          items={state.items}
          products={state.products}
        />
      );
    }
    if (!state.shift) return <OpenShiftScreen />;
    return (
      <WorkerShell
        title="Period in progress"
        subtitle="Record what happens as it happens"
      >
        <ActiveScreen
          shift={state.shift}
          items={state.items}
          balances={state.balances}
          onCloseRequest={() => setStep("closing-count")}
        />
      </WorkerShell>
    );
  }

  if (state.phase === "closing-pending" && state.shift) {
    return <DeclareScreen shift={state.shift} view={state.view} />;
  }

  if (state.phase === "submitted" && state.view) {
    return (
      <WorkerShell title="Period summary">
        <ResultScreen view={state.view} />
      </WorkerShell>
    );
  }

  // Transitional frames (period just closed, view still loading).
  return (
    <WorkerShell title="Your period">
      <Card>
        <p className="text-slate-500">Updating…</p>
      </Card>
    </WorkerShell>
  );
}
