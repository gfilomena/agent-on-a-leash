import { Ban, Check, Hourglass } from "lucide-react";
import { motion } from "motion/react";
import type { Verdict } from "@/lib/types";

const VERDICT = {
  approve: { label: "Approved", Icon: Check, className: "bg-approve" },
  step_up: { label: "Needs review", Icon: Hourglass, className: "bg-review" },
  decline: { label: "Blocked", Icon: Ban, className: "bg-block" },
} as const;

export const verdictLabel = (v: Verdict) => VERDICT[v].label;

/** Solid (never glass) verdict pill: colour + icon + word, readable in 3 seconds and without colour. */
export function VerdictPill({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" }) {
  const { label, Icon, className } = VERDICT[verdict];
  const sizing = size === "sm" ? "gap-1 px-2 py-0.5 text-[12px]" : "gap-1.5 px-3 py-1 text-[13.5px]";
  return (
    <motion.span
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      className={`inline-flex shrink-0 items-center rounded-full font-semibold text-ink ${sizing} ${className}`}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.75} aria-hidden />
      {label}
    </motion.span>
  );
}
