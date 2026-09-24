import { AnimatePresence, motion } from "motion/react";
import { DecisionCard } from "@/components/DecisionCard";
import type { Decision } from "@/lib/types";
import { ScreenHeader } from "./ScreenHeader";

export function HistoryScreen({ items, onOpen }: { items: Decision[]; onOpen: (d: Decision) => void }) {
  const count = (v: Decision["verdict"]) => items.filter((d) => d.verdict === v).length;
  return (
    <div>
      <ScreenHeader title="History" subtitle="Every decision, and why." />
      <div className="mb-5 flex gap-2 text-[13px]">
        <Tally dot="bg-approve" n={count("approve")} label="approved" />
        <Tally dot="bg-review" n={count("step_up")} label="waiting" />
        <Tally dot="bg-block" n={count("decline")} label="blocked" />
      </div>
      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {items.map((d) => (
            <motion.div key={d.id} layout initial={{ opacity: 0, y: -16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
              <DecisionCard d={d} onOpen={() => onOpen(d)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Tally({ dot, n, label }: { dot: string; n: number; label: string }) {
  return (
    <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5">
      <span className={`size-2 rounded-full ${dot}`} aria-hidden />
      <span className="amount font-semibold">{n}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
