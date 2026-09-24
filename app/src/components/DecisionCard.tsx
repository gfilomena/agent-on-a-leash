import { ShieldAlert, UserCheck } from "lucide-react";
import { clock, money } from "@/lib/format";
import type { Purchase } from "@/lib/types";
import { VerdictPill } from "./VerdictPill";

/** One decision, readable in 3 seconds: verdict, one sentence, shop · item · amount. */
export function DecisionCard({ d, onOpen }: { d: Purchase; onOpen?: () => void }) {
  const more = d.items.length > 1 ? ` +${d.items.length - 1}` : "";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass block w-full rounded-3xl p-5 text-left transition hover:border-white/20 focus-visible:outline-2 active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-3">
        <VerdictPill verdict={d.display} />
        <span className="amount text-[13px] text-muted-foreground">{clock(d.at)}</span>
      </div>

      <p className="mt-3.5 text-[18px] font-medium leading-snug text-foreground">{d.sentence}</p>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{d.shop}</div>
          <div className="truncate text-[13.5px] text-muted-foreground">
            {d.items[0]}
            {more}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="amount text-[20px] font-semibold">{money(d.amountChf)}</div>
          {d.original && <div className="amount text-[12.5px] text-muted-foreground">{money(d.original.amount, d.original.currency)}</div>}
        </div>
      </div>

      {(d.ignoredText.length > 0 || d.answeredBy === "you") && (
        <div className="mt-4 flex flex-wrap gap-2">
          {d.ignoredText.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-block/50 px-2.5 py-1 text-[12.5px] font-medium text-block">
              <ShieldAlert className="size-3.5" aria-hidden /> Shop text ignored
            </span>
          )}
          {d.answeredBy === "you" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[12.5px] text-muted-foreground">
              <UserCheck className="size-3.5" aria-hidden /> Answered by you
            </span>
          )}
        </div>
      )}
    </button>
  );
}
