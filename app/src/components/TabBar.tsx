import { History, Inbox, MessageCircle, SlidersHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export type Tab = "chat" | "inbox" | "history" | "controls";

const TABS: { id: Tab; label: string; Icon: typeof Inbox }[] = [
  { id: "chat", label: "Chat", Icon: MessageCircle },
  { id: "inbox", label: "Inbox", Icon: Inbox },
  { id: "history", label: "History", Icon: History },
  { id: "controls", label: "Controls", Icon: SlidersHorizontal },
];

export function TabBar({ tab, onTab, waiting }: { tab: Tab; onTab: (t: Tab) => void; waiting: number }) {
  return (
    <nav className="glass-strong absolute inset-x-3 bottom-3 z-20 flex h-[68px] items-center justify-around rounded-[26px] px-2">
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-[54px] w-[72px] flex-col items-center justify-center gap-1 rounded-2xl text-[11.5px] font-medium transition-colors ${
              active ? "text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {active && <motion.span layoutId="tab-active" className="absolute inset-0 rounded-2xl bg-primary/25 ring-1 ring-primary/50" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            <span className="relative">
              <Icon className={`size-[22px] ${active ? "text-[#b3a1ff]" : ""}`} strokeWidth={2} aria-hidden />
              <AnimatePresence>
                {id === "inbox" && waiting > 0 && (
                  <motion.span
                    key={waiting}
                    initial={{ scale: 0.4 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="amount absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-review px-1 text-[11px] font-bold text-ink"
                    aria-label={`${waiting} waiting`}
                  >
                    {waiting}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
