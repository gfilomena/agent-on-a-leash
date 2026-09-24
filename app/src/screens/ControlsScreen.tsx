import { Store, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { clock } from "@/lib/format";
import type { Policy } from "@/lib/types";
import { ScreenHeader } from "./ScreenHeader";

export function ControlsScreen({ policy, knownShops, onRevoke }: { policy: Policy; knownShops: string[]; onRevoke: () => void }) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const active = policy.status === "active";
  return (
    <div>
      <ScreenHeader title="Controls" subtitle="You decide what your agent may do." />

      <section className="glass rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-[19px] font-medium">Running shoes</h2>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${active ? "bg-approve/15 text-approve" : "bg-white/10 text-muted-foreground"}`}>
            <span className={`size-1.5 rounded-full ${active ? "bg-approve" : "bg-white/50"}`} aria-hidden />
            {active ? "Active" : "Revoked"}
          </span>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">"{policy.instruction}"</p>
        <ul className="mt-4 space-y-2 text-[15px]">
          {policy.rules.map((r) => (
            <li key={r} className="flex gap-2.5">
              <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-white/50" aria-hidden />
              {r}
            </li>
          ))}
          <li className="flex gap-2.5">
            <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-white/50" aria-hidden />
            When unsure: {policy.whenUnsure === "ask" ? "ask me" : "decline"}
          </li>
        </ul>
        <div className="mt-2 text-[12.5px] text-muted-foreground">Confirmed at {clock(policy.confirmedAt)}</div>

        <AnimatePresence mode="wait" initial={false}>
          {!active ? null : confirmRevoke ? (
            <motion.div key="confirm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 rounded-2xl border border-block/40 bg-block/[0.07] p-4">
              <p className="text-[14.5px] font-medium">Revoke this policy? Your agent can't buy anything with it after this.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setConfirmRevoke(false)} className="h-11 rounded-2xl bg-white/[0.08] text-[14.5px] font-semibold">
                  Keep it
                </button>
                <button type="button" onClick={onRevoke} className="h-11 rounded-2xl bg-block text-[14.5px] font-semibold text-ink">
                  Revoke
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" className="h-11 rounded-2xl border border-white/15 bg-white/[0.06] text-[14.5px] font-semibold hover:bg-white/10">
                Tighten
              </button>
              <button type="button" onClick={() => setConfirmRevoke(true)} className="h-11 rounded-2xl border border-block/50 text-[14.5px] font-semibold text-block hover:bg-block/10">
                Revoke
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="glass mt-4 rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-heading text-[19px] font-medium">
            <Wallet className="size-5 text-muted-foreground" aria-hidden /> Spending cap
          </h2>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[12.5px] font-semibold text-muted-foreground">Off</span>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">One limit for all agent spending on this card, across every policy.</p>
        <button type="button" className="mt-4 h-11 w-full rounded-2xl bg-primary text-[14.5px] font-semibold text-white hover:brightness-110">
          Set a cap
        </button>
      </section>

      <section className="glass mt-4 rounded-3xl p-5">
        <h2 className="flex items-center gap-2 font-heading text-[19px] font-medium">
          <Store className="size-5 text-muted-foreground" aria-hidden /> Shops you've approved
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">The first time your agent uses a new shop, Compass asks you once.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {knownShops.map((s) => (
            <span key={s} className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13.5px]">
              {s}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
