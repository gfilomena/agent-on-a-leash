import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState } from "react";
import { Toaster } from "sonner";
import { Backdrop } from "@/components/Backdrop";
import { DecisionSheet } from "@/components/DecisionSheet";
import { TabBar, type Tab } from "@/components/TabBar";
import type { Purchase } from "@/lib/types";
import { useCompass } from "@/lib/useCompass";
import { PresenterPanel } from "@/presenter/PresenterPanel";
import { ChatScreen } from "@/screens/ChatScreen";
import { ControlsScreen } from "@/screens/ControlsScreen";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { InboxScreen } from "@/screens/InboxScreen";

export default function App() {
  const presenterOnly = window.location.pathname.startsWith("/presenter");
  const { snap, offline } = useCompass();
  const [tab, setTab] = useState<Tab>("chat");
  const [openId, setOpenId] = useState<string | null>(null);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);

  const purchases = snap?.purchases ?? [];
  const waiting = purchases.filter((p) => p.status === "pending");
  const decided = purchases.filter((p) => p.status !== "pending");
  // Always show the latest version of the open purchase (it may be answered while the sheet is open).
  const open = purchases.find((p) => p.id === openId) ?? null;
  const openSheet = (p: Purchase) => setOpenId(p.id);

  const panel = <PresenterPanel snap={snap} offline={offline} />;

  if (presenterOnly) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center p-6">
        <Backdrop className="opacity-60" />
        <div className="relative h-[min(844px,calc(100dvh-48px))]">{panel}</div>
      </div>
    );
  }

  const screen = {
    chat: <ChatScreen stories={snap?.stories ?? []} />,
    inbox: <InboxScreen items={waiting} windowMs={(snap?.engine.humanWindowSeconds ?? 120) * 1000} onOpen={openSheet} />,
    history: <HistoryScreen items={decided} waiting={waiting.length} onOpen={openSheet} />,
    controls: <ControlsScreen policies={snap?.policies ?? []} approvedShops={snap?.approvedShops ?? []} />,
  }[tab];

  return (
    <MotionConfig reducedMotion="user">
      {/* Desktop: phone frame + "Behind the scenes". Phone: the app fills the screen. */}
      <div className="relative min-h-dvh md:flex md:items-center md:justify-center md:gap-8 md:p-6">
        <Backdrop className="hidden opacity-30 md:block" />

        <div
          ref={setFrame}
          className="relative h-dvh w-full overflow-hidden bg-background [transform:translateZ(0)] md:h-[min(844px,calc(100dvh-48px))] md:w-[390px] md:rounded-[48px] md:border md:border-white/15 md:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]"
        >
          <Backdrop />
          <div aria-hidden className="absolute top-3 left-1/2 z-30 hidden h-[26px] w-[110px] -translate-x-1/2 rounded-full bg-black md:block" />
          {offline && (
            <div className="absolute inset-x-4 top-12 z-40 rounded-2xl bg-block px-4 py-2.5 text-center text-[13.5px] font-semibold text-ink">
              Can't reach Compass right now. Retrying…
            </div>
          )}
          <main className="relative z-10 flex h-full flex-col overflow-y-auto px-5 pt-14 pb-28 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <AnimatePresence mode="wait">
              <motion.div key={tab} className="flex flex-1 flex-col" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                {screen}
              </motion.div>
            </AnimatePresence>
          </main>
          <TabBar tab={tab} onTab={setTab} waiting={waiting.length} />
          <DecisionSheet decision={open} onClose={() => setOpenId(null)} container={frame} />
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
