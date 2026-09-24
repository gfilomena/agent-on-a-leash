import { History } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { DecisionCard } from "@/components/DecisionCard";
import type { Purchase } from "@/lib/types";
import { ScreenHeader } from "./ScreenHeader";

export function HistoryScreen({ items, waiting, onOpen }: { items: Purchase[]; waiting: number; onOpen: (d: Purchase) => void }) {
  const count = (d: Purchase["display"]) => items.filter((p) => p.display === d).length;
  return (
    <div>
      <ScreenHeader title="History" subtitle="Every decision, and why." />
      {items.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2 text-[13px]">
          <Tally dot="bg-approve" n={count("approve")} label="approved" />
          <Tally dot="bg-review" n={waiting} label="waiting" />
          <Tally dot="bg-block" n={count("decline") + count("expired")} label="not bought" />
        </div>
      )}
      {items.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-muted-foreground">
          <div className="glass grid size-16 place-items-center rounded-3xl">
            <History className="size-7" aria-hidden />
          </div>
          <p className="mt-4 max-w-[260px] text-[15px] leading-relaxed">Every purchase your agent tries appears here, with Compass's decision and why.</p>
        </div>
      )}
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
