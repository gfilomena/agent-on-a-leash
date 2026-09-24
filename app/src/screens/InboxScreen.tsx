import { Inbox, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { CountdownRing } from "@/components/CountdownRing";
import { VerdictPill } from "@/components/VerdictPill";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Purchase } from "@/lib/types";
import { ScreenHeader } from "./ScreenHeader";

/** Purchases waiting for the customer's answer. Only a real tap here is ever sent as their answer. */
export function InboxScreen({ items, windowMs, onOpen }: { items: Purchase[]; windowMs: number; onOpen: (d: Purchase) => void }) {
  const [sending, setSending] = useState<string | null>(null);

  const answer = async (d: Purchase, approve: boolean) => {
    setSending(d.id);
    try {
      const r = await api.answerPurchase(d.id, approve);
      toast(r.message);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setSending(null);
    }
  };

  return (
    <div>
      <ScreenHeader title="Inbox" subtitle={items.length ? `${items.length} purchase${items.length > 1 ? "s" : ""} need${items.length > 1 ? "" : "s"} your OK` : "Nothing is waiting for you."} />
      {items.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-muted-foreground">
          <div className="glass grid size-16 place-items-center rounded-3xl">
            <Inbox className="size-7" aria-hidden />
          </div>
          <p className="mt-4 max-w-[260px] text-[15px] leading-relaxed">When Compass isn't sure about a purchase, it asks you here.</p>
        </div>
      )}
      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {items.map((d) => (
            <motion.article
              key={d.id}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 60, transition: { duration: 0.25 } }}
              className="glass rounded-3xl p-5"
            >
              <button type="button" onClick={() => onOpen(d)} className="block w-full text-left">
                <div className="flex items-center justify-between">
                  <VerdictPill verdict="step_up" />
                  {d.waitingUntil && <CountdownRing until={d.waitingUntil} totalMs={windowMs} />}
                </div>
                <p className="mt-3 text-[18px] font-medium leading-snug">{d.sentence}</p>
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium">{d.shop}</div>
                    <div className="truncate text-[13.5px] text-muted-foreground">
                      {d.items[0]}
                      {d.items.length > 1 ? ` +${d.items.length - 1}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="amount text-[20px] font-semibold">{money(d.amountChf)}</div>
                    {d.original && <div className="amount text-[12.5px] text-muted-foreground">{money(d.original.amount, d.original.currency)}</div>}
                  </div>
                </div>
                {d.ignoredText.length > 0 && (
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-block/50 px-2.5 py-1 text-[12.5px] font-medium text-block">
                    <ShieldAlert className="size-3.5" aria-hidden /> Shop text ignored
                  </span>
                )}
              </button>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={sending === d.id}
                  onClick={() => answer(d, false)}
                  className="h-12 rounded-2xl border border-white/15 bg-white/[0.06] text-[15px] font-semibold transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={sending === d.id}
                  onClick={() => answer(d, true)}
                  className="h-12 rounded-2xl bg-primary text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                >
                  Approve
                </button>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
