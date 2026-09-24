import { Contrast, Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { VerdictPill } from "@/components/VerdictPill";
import { clock, money, seconds } from "@/lib/format";
import type { Decision, Story } from "@/lib/types";

export interface FeedRow {
  decision: Decision;
  story: string;
}

/** Desktop only (and /presenter): what the engine does, next to what the customer sees. */
export function PresenterPanel({
  stories,
  feed,
  running,
  progress,
  onStart,
  sample,
}: {
  stories: Story[];
  feed: FeedRow[];
  running: boolean;
  progress: string;
  onStart: (story: Story) => void;
  sample?: boolean;
}) {
  const [picked, setPicked] = useState(stories[0]?.id);
  const [highContrast, setHighContrast] = useState(() => document.documentElement.dataset.contrast === "high");
  const story = stories.find((s) => s.id === picked) ?? stories[0];

  const toggleContrast = () => {
    const next = !highContrast;
    setHighContrast(next);
    if (next) document.documentElement.dataset.contrast = "high";
    else delete document.documentElement.dataset.contrast;
  };

  return (
    <section className="glass-strong flex h-full w-[440px] flex-col rounded-[32px] p-6">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="font-heading text-[24px] font-medium tracking-[-0.01em]">Presenter</h2>
          <p className="text-[14px] text-muted-foreground">What the engine does, live</p>
        </div>
        {sample && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-medium text-muted-foreground">Sample data</span>}
      </header>

      <div className="mt-5 text-[13px] font-medium text-muted-foreground">Test story</div>
      <div className="mt-2 max-h-[196px] space-y-1.5 overflow-y-auto pr-1">
        {stories.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={running}
            onClick={() => setPicked(s.id)}
            className={`flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left text-[14.5px] transition ${
              s.id === story?.id ? "bg-primary/20 ring-1 ring-primary/60" : "bg-white/[0.04] hover:bg-white/[0.08]"
            }`}
          >
            <span className="font-medium">{s.name}</span>
            <span className="amount text-[12.5px] text-muted-foreground">{s.purchases} purchases</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={running || !story}
        onClick={() => story && onStart(story)}
        className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        <Play className="size-4" fill="currentColor" aria-hidden /> {running ? "Run in progress" : "Start live run"}
      </button>

      <div className="mt-5 flex items-center gap-2 text-[13.5px]">
        <span className={`size-2 rounded-full ${running ? "animate-pulse bg-approve" : "bg-white/30"}`} aria-hidden />
        <span className={running ? "text-foreground" : "text-muted-foreground"}>{progress}</span>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {feed.map(({ decision: d, story: s }) => (
            <motion.div
              key={d.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-3.5 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-[14.5px] font-medium">{d.shop}</div>
                <div className="amount text-[12.5px] text-muted-foreground">
                  {clock(d.at)} · {money(d.amountChf)} · {s}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <VerdictPill verdict={d.verdict} size="sm" />
                <span className="amount text-[12px] text-muted-foreground">in {seconds(d.decidedInMs)}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {feed.length === 0 && <p className="pt-6 text-center text-[14px] text-muted-foreground">Purchases from Viseca appear here as they arrive.</p>}
      </div>

      <button type="button" onClick={toggleContrast} className="mt-4 flex items-center justify-between rounded-2xl bg-white/[0.04] px-3.5 py-3 text-[14px]">
        <span className="flex items-center gap-2">
          <Contrast className="size-4 text-muted-foreground" aria-hidden /> High contrast (projector)
        </span>
        <span className={`relative h-6 w-10 rounded-full transition ${highContrast ? "bg-primary" : "bg-white/15"}`}>
          <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${highContrast ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>
    </section>
  );
}
