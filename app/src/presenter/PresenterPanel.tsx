import { Contrast, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { VerdictPill } from "@/components/VerdictPill";
import { clock, money, seconds } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

/** Desktop only (and /presenter): what the engine does, next to what the customer sees. */
export function PresenterPanel({ snap, offline }: { snap: Snapshot | null; offline: boolean }) {
  const [highContrast, setHighContrast] = useState(() => document.documentElement.dataset.contrast === "high");
  const toggleContrast = () => {
    const next = !highContrast;
    setHighContrast(next);
    if (next) document.documentElement.dataset.contrast = "high";
    else delete document.documentElement.dataset.contrast;
  };
  const running = snap?.policies.filter((p) => p.status === "active" && p.story && p.story.received < p.story.total) ?? [];
  const feed = snap?.purchases.slice(0, 40) ?? [];

  return (
    <section className="glass-strong flex h-full w-[440px] flex-col rounded-[32px] p-6">
      <header>
        <h2 className="font-heading text-[24px] font-medium tracking-[-0.01em]">Behind the scenes</h2>
        <p className="text-[14px] text-muted-foreground">Viseca's simulator plays the shopping agent. This is what Compass decides, live.</p>
      </header>

      <div className="mt-4 flex items-center gap-2 text-[13.5px]">
        <span className={`size-2 rounded-full ${offline ? "bg-block" : snap?.engine.worker ? "animate-pulse bg-approve" : "bg-white/30"}`} aria-hidden />
        <span className="text-muted-foreground">
          {offline ? "Engine not reachable" : snap?.engine.worker ? "Engine connected to Viseca, answering purchases" : "Engine running without Viseca connection"}
        </span>
      </div>

      {running.map((p) => (
        <div key={p.id} className="mt-3 rounded-2xl bg-white/[0.04] px-3.5 py-3">
          <div className="flex items-center justify-between text-[14px]">
            <span className="font-medium">{p.story!.name}</span>
            <span className="amount text-muted-foreground">
              {p.story!.received} of {p.story!.total}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${(100 * p.story!.received) / p.story!.total}%` }} />
          </div>
        </div>
      ))}

      <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
        <AnimatePresence initial={false}>
          {feed.map((d) => (
            <motion.div key={d.id} layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-3.5 py-3">
              <div className="min-w-0">
                <div className="truncate text-[14.5px] font-medium">{d.shop}</div>
                <div className="amount truncate text-[12.5px] text-muted-foreground">
                  {clock(d.at)} · {money(d.amountChf)}
                  {d.story ? ` · ${d.story}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <VerdictPill verdict={d.display} size="sm" />
                <span className="amount text-[12px] text-muted-foreground">answered in {seconds(d.answerMs)}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {feed.length === 0 && <p className="pt-6 text-center text-[14px] text-muted-foreground">Confirm one of Viseca's test requests in the chat, and its purchases appear here as they arrive.</p>}
      </div>

      <button type="button" onClick={toggleContrast} className="mt-4 flex items-center justify-between rounded-2xl bg-white/[0.04] px-3.5 py-3 text-[14px]">
        <span className="flex items-center gap-2">
          <Contrast className="size-4 text-muted-foreground" aria-hidden /> High contrast (projector)
        </span>
        <span className={`relative h-6 w-10 rounded-full transition ${highContrast ? "bg-primary" : "bg-white/15"}`}>
          <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${highContrast ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>
      {snap?.settings && (
        <button
          type="button"
          onClick={() =>
            api
              .resetSpending()
              .then(() => toast("Spending reset", { description: "The spending limit counts from now. History is unchanged." }))
              .catch((err: Error) => toast(err.message))
          }
          className="mt-2 flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3.5 py-3 text-left text-[14px] hover:bg-white/[0.07]"
        >
          <RotateCcw className="size-4 text-muted-foreground" aria-hidden />
          <span>
            Reset spending <span className="text-muted-foreground">· Viseca's stories replay the same dates</span>
          </span>
        </button>
      )}
    </section>
  );
}
