import { RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { VerdictPill } from "@/components/VerdictPill";
import { clock, clockSeconds, money, seconds } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

/** Desktop only (and /presenter): what the engine does, next to what the customer sees. */
export function PresenterPanel({ snap, offline }: { snap: Snapshot | null; offline: boolean }) {
  const running = snap?.policies.filter((p) => p.status === "active" && p.story && !p.story.finished) ?? [];
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
          <div className="flex items-center justify-between gap-3 text-[14px]">
            <div className="min-w-0">
              <div className="truncate font-medium">{p.story!.title ?? p.title}</div>
              <div className="truncate text-[12.5px] text-muted-foreground">Viseca test: {p.story!.name}</div>
            </div>
            <span className="amount text-muted-foreground">
              {p.story!.received} of {p.story!.total}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${(100 * p.story!.received) / p.story!.total}%` }} />
          </div>
        </div>
      ))}

      {snap?.viseca && <VisecaLog log={snap.viseca} />}

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

      {snap?.settings && (
        <button
          type="button"
          onClick={() =>
            api
              .resetSpending()
              .then(() => toast("Spending reset", { description: "The spending limit counts from now. History is unchanged." }))
              .catch((err: Error) => toast(err.message))
          }
          className="mt-4 flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3.5 py-3 text-left text-[14px] hover:bg-white/[0.07]"
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

/** Every call to Viseca's API as it happens: plain words, then the real endpoint, status and time (proof nothing is canned). */
function VisecaLog({ log }: { log: NonNullable<Snapshot["viseca"]> }) {
  return (
    <div className="mt-4 rounded-2xl bg-white/[0.04] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium">Viseca API · live</span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          {log.listening && <span className="size-1.5 animate-pulse rounded-full bg-approve" aria-hidden />}
          {log.listening ? "Waiting for Viseca's next purchase" : log.lastContactAt ? `Last call at ${clockSeconds(log.lastContactAt)}` : "No calls yet"}
        </span>
      </div>
      <div className="mt-2 max-h-[156px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
        <AnimatePresence initial={false}>
          {log.calls.map((c) => (
            <motion.div key={`${c.at}-${c.method}-${c.path}`} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <div className={`truncate text-[13px] ${c.ok ? "" : "text-block"}`}>{c.label}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                {clockSeconds(c.at)} {c.method} {c.path} → {c.status || "no answer"}
                {c.ms !== null ? ` · ${seconds(c.ms)}` : ""}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
