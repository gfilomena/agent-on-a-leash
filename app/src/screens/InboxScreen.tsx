import { Inbox, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CountdownRing } from "@/components/CountdownRing";
import { VerdictPill } from "@/components/VerdictPill";
import { money } from "@/lib/format";
import type { Decision } from "@/lib/types";
import { ScreenHeader } from "./ScreenHeader";

export function InboxScreen({
  items,
  onAnswer,
  onOpen,
}: {
  items: Decision[];
  onAnswer: (d: Decision, approve: boolean) => void;
  onOpen: (d: Decision) => void;
}) {
  const waiting = items.filter((d) => !d.expired).length;
  return (
    <div>
      <ScreenHeader
        title="Inbox"
        subtitle={waiting ? `${waiting} purchase${waiting > 1 ? "s" : ""} need${waiting > 1 ? "" : "s"} your OK` : "Nothing is waiting for you."}
      />
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
              animate={{ opacity: d.expired ? 0.55 : 1, y: 0 }}
              exit={{ opacity: 0, x: 60, transition: { duration: 0.25 } }}
              className="glass rounded-3xl p-5"
            >
              <button type="button" onClick={() => onOpen(d)} className="block w-full text-left">
                <div className="flex items-center justify-between">
                  {d.expired ? (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[13.5px] font-semibold text-muted-foreground">Expired</span>
                  ) : (
                    <VerdictPill verdict="step_up" />
                  )}
                  {!d.expired && d.waitingUntil && <CountdownRing until={d.waitingUntil} />}
                </div>
                <p className="mt-3 text-[18px] font-medium leading-snug">
                  {d.expired ? "Expired: you didn't answer in time." : d.sentence}
                </p>
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium">{d.shop}</div>
                    <div className="truncate text-[13.5px] text-muted-foreground">{d.items[0]}</div>
                  </div>
                  <div className="amount shrink-0 text-[20px] font-semibold">{money(d.amountChf)}</div>
                </div>
                {d.ignoredText && (
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-block/50 px-2.5 py-1 text-[12.5px] font-medium text-block">
                    <ShieldAlert className="size-3.5" aria-hidden /> Shop text ignored
                  </span>
                )}
              </button>

              {!d.expired && (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onAnswer(d, false)}
                    className="h-12 rounded-2xl border border-white/15 bg-white/[0.06] text-[15px] font-semibold transition hover:bg-white/10 active:scale-[0.98]"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => onAnswer(d, true)}
                    className="h-12 rounded-2xl bg-primary text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
                  >
                    Approve
                  </button>
                </div>
              )}
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
