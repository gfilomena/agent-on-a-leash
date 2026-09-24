import { SlidersHorizontal, Store } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { SecuritySettings } from "@/components/SecuritySettings";
import { api } from "@/lib/api";
import { clock } from "@/lib/format";
import type { Policy, Settings } from "@/lib/types";
import { ScreenHeader } from "./ScreenHeader";

export function ControlsScreen({ policies, approvedShops, settings, container }: { policies: Policy[]; approvedShops: string[]; settings?: Settings; container: HTMLElement | null }) {
  const active = policies.filter((p) => p.status === "active");
  const revoked = policies.filter((p) => p.status === "revoked");
  return (
    <div>
      <ScreenHeader title="Controls" subtitle="You decide what your agent may do." />
      {settings && <SecuritySettings settings={settings} container={container} />}
      {policies.length === 0 && (
        <div className="mt-12 flex flex-col items-center text-center text-muted-foreground">
          <div className="glass grid size-16 place-items-center rounded-3xl">
            <SlidersHorizontal className="size-7" aria-hidden />
          </div>
          <p className="mt-4 max-w-[260px] text-[15px] leading-relaxed">No policy yet. Tell me what your agent may buy in Chat.</p>
        </div>
      )}
      <div className="space-y-4">
        {active.map((p) => (
          <PolicyCard key={p.id} p={p} />
        ))}
      </div>

      {approvedShops.length > 0 && (
        <section className="glass mt-4 rounded-3xl p-5">
          <h2 className="flex items-center gap-2 font-heading text-[19px] font-medium">
            <Store className="size-5 text-muted-foreground" aria-hidden /> Shops you've approved
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">The first time your agent uses a new shop, Compass asks you once.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {approvedShops.map((s) => (
              <span key={s} className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13.5px]">
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {revoked.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 font-heading text-[15px] font-medium text-muted-foreground">Revoked</h2>
          <div className="space-y-4">
            {revoked.map((p) => (
              <PolicyCard key={p.id} p={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PolicyCard({ p }: { p: Policy }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = p.status === "active";

  const revoke = async () => {
    setBusy(true);
    try {
      await api.revoke(p.id);
      toast("Policy revoked", { description: "Your agent can't buy anything with it any more." });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section className={`glass rounded-3xl p-5 ${active ? "" : "opacity-70"}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-[19px] font-medium">{p.title}</h2>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${active ? "bg-approve/15 text-approve" : "bg-white/10 text-muted-foreground"}`}>
          <span className={`size-1.5 rounded-full ${active ? "bg-approve" : "bg-white/50"}`} aria-hidden />
          {active ? "Active" : "Revoked"}
        </span>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">"{p.instruction}"</p>
      <ul className="mt-4 space-y-2 text-[15px]">
        {[...p.rules, `When unsure: ${p.whenUnsure === "ask" ? "ask me" : "decline"}`, ...(p.watchSession ? ["Pause if someone else seems to be using your agent"] : [])].map((r, i) => (
          <li key={`${r}-${i}`} className="flex gap-2.5">
            <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-white/50" aria-hidden />
            {r}
          </li>
        ))}
      </ul>
      <div className="mt-3 text-[12.5px] text-muted-foreground">
        {active ? `Confirmed at ${clock(p.confirmedAt!)}` : `Revoked at ${clock(p.revokedAt!)}`}
        {p.story ? ` · ${p.story.received} of ${p.story.total} purchases so far` : ""}
      </div>

      {active && (
        <AnimatePresence mode="wait" initial={false}>
          {confirming ? (
            <motion.div key="confirm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 rounded-2xl border border-block/40 bg-block/[0.07] p-4">
              <p className="text-[14.5px] font-medium">Revoke this policy? Your agent can't buy anything with it after this.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setConfirming(false)} className="h-11 rounded-2xl bg-white/[0.08] text-[14.5px] font-semibold">
                  Keep it
                </button>
                <button type="button" disabled={busy} onClick={revoke} className="h-11 rounded-2xl bg-block text-[14.5px] font-semibold text-ink disabled:opacity-60">
                  {busy ? "Revoking…" : "Revoke"}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-5">
              <button type="button" onClick={() => setConfirming(true)} className="h-11 w-full rounded-2xl border border-block/50 text-[14.5px] font-semibold text-block hover:bg-block/10">
                Revoke
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </section>
  );
}
