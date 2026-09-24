import { Check, CircleHelp, ShieldAlert, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { clock, money, seconds } from "@/lib/format";
import type { CheckResult, Decision } from "@/lib/types";
import { VerdictPill } from "./VerdictPill";

const RESULT: Record<CheckResult, { Icon: typeof Check; className: string; label: string }> = {
  pass: { Icon: Check, className: "bg-approve text-ink", label: "passed" },
  fail: { Icon: X, className: "bg-block text-ink", label: "failed" },
  unknown: { Icon: CircleHelp, className: "bg-review text-ink", label: "unknown" },
};

/** The facts behind a decision, in a bottom sheet that opens inside the phone. */
export function DecisionSheet({
  decision: d,
  onClose,
  container,
}: {
  decision: Decision | null;
  onClose: () => void;
  container: HTMLElement | null;
}) {
  return (
    <Drawer open={!!d} onOpenChange={(open) => !open && onClose()} container={container}>
      <DrawerContent className="glass-strong !max-h-[85%] rounded-t-[28px] border-x-0 border-b-0 text-foreground">
        {d && (
          <div className="overflow-y-auto px-5 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <DrawerHeader className="px-0 pt-4 !text-left">
              <div className="flex items-center justify-between">
                <VerdictPill verdict={d.verdict} />
                <span className="text-[13px] text-muted-foreground">
                  {clock(d.at)} · decided in {seconds(d.decidedInMs)}
                </span>
              </div>
              <DrawerTitle className="mt-3 !text-left font-sans text-[20px] font-medium leading-snug">{d.sentence}</DrawerTitle>
              <DrawerDescription className="sr-only">What Compass checked for this purchase</DrawerDescription>
            </DrawerHeader>

            <div className="rounded-2xl bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium">{d.shop}</div>
                  {d.items.map((item) => (
                    <div key={item} className="text-[13.5px] text-muted-foreground">
                      {item}
                    </div>
                  ))}
                </div>
                <div className="text-right">
                  <div className="amount text-[20px] font-semibold">{money(d.amountChf)}</div>
                  {d.original && <div className="amount text-[12.5px] text-muted-foreground">charged as {money(d.original.amount, d.original.currency)}</div>}
                </div>
              </div>
            </div>

            <h3 className="mt-6 mb-3 font-heading text-[15px] font-medium text-muted-foreground">What Compass checked</h3>
            <ul className="space-y-2.5">
              {d.checks.map((c) => {
                const { Icon, className, label } = RESULT[c.result];
                return (
                  <li key={c.label} className="flex items-start gap-3">
                    <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${className}`} title={label}>
                      <Icon className="size-3.5" strokeWidth={3} aria-label={label} />
                    </span>
                    <div>
                      <div className="text-[15px] font-medium">{c.label}</div>
                      {c.detail && <div className="text-[13.5px] text-muted-foreground">{c.detail}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>

            {d.ignoredText && (
              <div className="mt-6 rounded-2xl border border-block/40 bg-block/[0.07] p-4">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-block">
                  <ShieldAlert className="size-4" aria-hidden /> Ignored: the shop's text tried to give instructions
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground line-through decoration-block/70">"{d.ignoredText}"</p>
                <p className="mt-2 text-[13px] text-foreground/80">Compass never follows text from shops. Your rules stay as you set them.</p>
              </div>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
