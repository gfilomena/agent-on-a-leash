import { ArrowUp, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { samplePolicy, sampleSuggestions } from "@/lib/sample";

type Phase = "home" | "reading" | "review" | "active";

/** Chat: request → "Here's what I understood" → confirm. Sample content until step 9 and 11. */
export function ChatScreen({ onConfirmed }: { onConfirmed: () => void }) {
  const [phase, setPhase] = useState<Phase>("home");
  const [draft, setDraft] = useState("");
  const [request, setRequest] = useState("");
  const [whenUnsure, setWhenUnsure] = useState<"ask" | "decline">("ask");

  const send = (text: string) => {
    if (!text.trim()) return;
    setRequest(text.trim());
    setDraft("");
    setPhase("reading");
    setTimeout(() => setPhase("review"), 900);
  };

  if (phase === "home") {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center pb-10 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="font-heading text-[40px] font-medium leading-none tracking-[-0.02em]"
          >
            How can I help?
          </motion.h1>
          <p className="mt-4 max-w-[280px] text-[15px] leading-relaxed text-muted-foreground">
            Tell me what your agent may buy. I'll turn it into rules you confirm.
          </p>
        </div>

        <div className="space-y-2.5">
          {sampleSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="glass line-clamp-2 w-full rounded-2xl px-4 py-3 text-left text-[14px] leading-snug text-foreground/90 transition hover:border-white/20"
            >
              {s}
            </button>
          ))}
          <Composer value={draft} onChange={setDraft} onSend={() => send(draft)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pt-2">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="ml-10 self-end rounded-3xl rounded-br-lg bg-primary px-4 py-3 text-[15px] leading-snug text-white"
      >
        {request}
      </motion.div>

      <AnimatePresence mode="wait">
        {phase === "reading" ? (
          <motion.div key="reading" exit={{ opacity: 0 }} className="flex items-center gap-2 px-1 text-[14px] text-muted-foreground">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="size-1.5 rounded-full bg-white/60"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </span>
            Reading your request
          </motion.div>
        ) : (
          <motion.div key="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass mr-4 rounded-3xl rounded-bl-lg p-5">
            <h2 className="font-heading text-[19px] font-medium">Here's what I understood</h2>
            <ol className="mt-4 space-y-3">
              {samplePolicy.rules.map((rule, i) => (
                <li key={rule} className="flex gap-3 text-[15px] leading-snug">
                  <span className="amount grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-[12px] font-semibold">{i + 1}</span>
                  {rule}
                </li>
              ))}
            </ol>

            <div className="mt-5">
              <div className="text-[13.5px] text-muted-foreground">When something is unclear</div>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-full bg-white/[0.06] p-1">
                {(["ask", "decline"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={phase === "active"}
                    onClick={() => setWhenUnsure(v)}
                    className={`h-10 rounded-full text-[14px] font-medium transition ${whenUnsure === v ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {v === "ask" ? "Ask me" : "Decline"}
                  </button>
                ))}
              </div>
            </div>

            {phase === "active" ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/[0.06] text-[15px] font-medium">
                <Check className="size-4 text-approve" strokeWidth={3} aria-hidden /> Policy active
              </motion.div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPhase("active");
                  onConfirmed();
                }}
                className="mt-5 h-12 w-full rounded-2xl bg-primary text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.99]"
              >
                Confirm and activate
              </button>
            )}
            <p className="mt-3 text-center text-[12.5px] text-muted-foreground">Your words are kept exactly as you wrote them.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Composer({ value, onChange, onSend }: { value: string; onChange: (v: string) => void; onSend: () => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="glass-strong flex h-14 items-center gap-2 rounded-full pr-2 pl-5"
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe what your agent may buy…"
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
      />
      <button type="submit" disabled={!value.trim()} aria-label="Send" className="grid size-10 place-items-center rounded-full bg-primary text-white transition disabled:opacity-40">
        <ArrowUp className="size-5" strokeWidth={2.5} />
      </button>
    </form>
  );
}
