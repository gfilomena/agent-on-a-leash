import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { Backdrop } from "@/components/Backdrop";
import { DecisionSheet } from "@/components/DecisionSheet";
import { TabBar, type Tab } from "@/components/TabBar";
import { money } from "@/lib/format";
import { sampleHistory, sampleInbox, samplePolicy, sampleStories } from "@/lib/sample";
import type { Decision, Policy, Story } from "@/lib/types";
import { PresenterPanel, type FeedRow } from "@/presenter/PresenterPanel";
import { ChatScreen } from "@/screens/ChatScreen";
import { ControlsScreen } from "@/screens/ControlsScreen";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { InboxScreen } from "@/screens/InboxScreen";

// Design preview (plan step 4): sample data only. Steps 10–13 replace it with the engine's data.
export default function App() {
  const presenterOnly = window.location.pathname.startsWith("/presenter");
  const [tab, setTab] = useState<Tab>("chat");
  const [history, setHistory] = useState<Decision[]>(sampleHistory.slice(2));
  const [inbox, setInbox] = useState<Decision[]>([]);
  const [policy, setPolicy] = useState<Policy>(samplePolicy);
  const [open, setOpen] = useState<Decision | null>(null);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("No run yet");
  const timers = useRef<number[]>([]);

  // Preview only: replays sample decisions so both sides can be seen moving.
  const startRun = (story: Story) => {
    const queue = [...sampleHistory.slice(0, 2).reverse(), ...sampleInbox()];
    setRunning(true);
    setProgress(`Live · ${story.name} · 0 of ${queue.length}`);
    queue.forEach((d, i) => {
      const t = window.setTimeout(() => {
        const arrived = { ...d, id: `${d.id}-${Date.now()}`, at: new Date().toISOString(), waitingUntil: d.verdict === "step_up" ? Date.now() + 120_000 : undefined };
        setFeed((f) => [{ decision: arrived, story: story.name }, ...f]);
        if (arrived.verdict === "step_up") {
          setInbox((x) => [arrived, ...x]);
          toast("Your agent wants to buy something", { description: `${arrived.shop} · ${money(arrived.amountChf)} needs your OK` });
        } else setHistory((h) => [arrived, ...h]);
        setProgress(i === queue.length - 1 ? `Done · ${story.name} · ${queue.length} of ${queue.length}` : `Live · ${story.name} · ${i + 1} of ${queue.length}`);
        if (i === queue.length - 1) setRunning(false);
      }, 900 + i * 1600);
      timers.current.push(t);
    });
  };

  const answer = (d: Decision, approve: boolean) => {
    setInbox((x) => x.filter((i) => i.id !== d.id));
    const done: Decision = {
      ...d,
      verdict: approve ? "approve" : "decline",
      sentence: `${approve ? "Approved" : "Declined"} by you: ${d.items[0]} from ${d.shop}, ${money(d.amountChf)}.`,
      answeredBy: "you",
      waitingUntil: undefined,
    };
    setHistory((h) => [done, ...h]);
    toast(approve ? "Approved. Your agent can go ahead." : "Declined. Your agent won't buy it.");
  };

  const panel = (
    <PresenterPanel stories={sampleStories} feed={feed} running={running} progress={progress} onStart={startRun} sample />
  );

  if (presenterOnly) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center p-6">
        <Backdrop className="opacity-60" />
        <div className="relative h-[min(844px,calc(100dvh-48px))]">{panel}</div>
      </div>
    );
  }

  const screen = {
    chat: <ChatScreen onConfirmed={() => toast("Policy active", { description: "Your agent can start shopping." })} />,
    inbox: <InboxScreen items={inbox} onAnswer={answer} onOpen={setOpen} />,
    history: <HistoryScreen items={history} onOpen={setOpen} />,
    controls: (
      <ControlsScreen
        policy={policy}
        knownShops={["Alpine Basket", "PixelHarbor", "Milano Weave", "Summit Thread"]}
        onRevoke={() => {
          setPolicy((p) => ({ ...p, status: "revoked" }));
          toast("Policy revoked", { description: "Your agent can't buy anything with it any more." });
        }}
      />
    ),
  }[tab];

  return (
    <MotionConfig reducedMotion="user">
      {/* Desktop: phone frame + presenter panel. Phone: the app fills the screen. */}
      <div className="relative min-h-dvh md:flex md:items-center md:justify-center md:gap-8 md:p-6">
        <Backdrop className="hidden opacity-30 md:block" />

        <div
          ref={setFrame}
          className="relative h-dvh w-full overflow-hidden bg-background [transform:translateZ(0)] md:h-[min(844px,calc(100dvh-48px))] md:w-[390px] md:rounded-[48px] md:border md:border-white/15 md:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]"
        >
          <Backdrop />
          <div aria-hidden className="absolute top-3 left-1/2 z-30 hidden h-[26px] w-[110px] -translate-x-1/2 rounded-full bg-black md:block" />
          <main className="relative z-10 flex h-full flex-col overflow-y-auto px-5 pt-14 pb-28 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <AnimatePresence mode="wait">
              <motion.div key={tab} className="flex flex-1 flex-col" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                {screen}
              </motion.div>
            </AnimatePresence>
          </main>
          <TabBar tab={tab} onTab={setTab} waiting={inbox.length} />
          <DecisionSheet decision={open} onClose={() => setOpen(null)} container={frame} />
          <Toaster
            position="top-center"
            theme="dark"
            offset={56}
            toastOptions={{
              style: {
                background: "var(--glass-fill-strong)",
                border: "1px solid var(--glass-border)",
                backdropFilter: "blur(var(--glass-blur))",
                WebkitBackdropFilter: "blur(var(--glass-blur))",
                color: "var(--foreground)",
                borderRadius: "18px",
                fontSize: "14.5px",
              },
              classNames: { description: "!text-[color:var(--muted-foreground)] !text-[13.5px]" },
            }}
          />
        </div>

        <aside className="relative hidden h-[min(844px,calc(100dvh-48px))] min-[1100px]:block">{panel}</aside>
      </div>
    </MotionConfig>
  );
}
