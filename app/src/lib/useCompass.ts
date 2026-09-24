import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "./api";
import { money } from "./format";
import type { Snapshot } from "./types";

/** Live view of the engine: refreshed every second; announces purchases that need the customer. */
export function useCompass() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const s = await api.snapshot();
        if (stop) return;
        setOffline(false);
        setSnap((prev) => (prev && prev.version === s.version && prev.engine.worker === s.engine.worker ? prev : s));
        // New purchases waiting for the customer get a pop-up (not the ones already there at start).
        const waiting = s.purchases.filter((p) => p.status === "pending");
        if (seen.current) {
          for (const p of waiting) {
            if (!seen.current.has(p.id)) toast("Your agent wants to buy something", { description: `${p.shop} · ${money(p.amountChf)} needs your OK` });
          }
        }
        seen.current = new Set(s.purchases.map((p) => p.id));
      } catch {
        if (!stop) setOffline(true);
      }
    };
    void tick();
    const t = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  return { snap, offline };
}
