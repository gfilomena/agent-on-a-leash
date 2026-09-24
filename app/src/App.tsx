import { useEffect, useState } from "react";

type EngineStatus = "checking" | "ok" | "down";

const STATUS_LABEL: Record<EngineStatus, string> = {
  checking: "Checking engine…",
  ok: "Engine connected",
  down: "Engine not reachable",
};

const STATUS_DOT: Record<EngineStatus, string> = {
  checking: "bg-white/40",
  ok: "bg-emerald-400",
  down: "bg-red-400",
};

export default function App() {
  const [engine, setEngine] = useState<EngineStatus>("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? setEngine("ok") : setEngine("down")))
      .catch(() => setEngine("down"));
  }, []);

  return (
    // Desktop: the app sits in a phone frame. Phone: it fills the screen.
    <div className="min-h-dvh bg-bg text-white antialiased md:flex md:items-center md:justify-center md:p-8">
      <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 overflow-hidden md:h-[844px] md:min-h-0 md:w-[390px] md:rounded-[48px] md:border md:border-white/10 md:shadow-2xl md:shadow-black">
        <h1 className="text-4xl font-semibold tracking-tight">Compass</h1>
        <p className="flex items-center gap-2 text-sm text-white/70">
          <span className={`size-2 rounded-full ${STATUS_DOT[engine]}`} />
          {STATUS_LABEL[engine]}
        </p>
      </main>
    </div>
  );
}
