import { ArrowUp, Check, CircleAlert, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Policy, Story } from "@/lib/types";

type Phase = "home" | "reading" | "review" | "confirming" | "active";

/** Chat: request → "Here's what I understood" (AI + code checks) → one-tap answers → confirm. */
export function ChatScreen({ stories }: { stories: Story[] }) {
  const [phase, setPhase] = useState<Phase>("home");
  const [draftText, setDraftText] = useState("");
  const [request, setRequest] = useState("");
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [whenUnsure, setWhenUnsure] = useState<"ask" | "decline">("ask");
  const [answering, setAnswering] = useState<string | null>(null);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setRequest(text.trim());
    setDraftText("");
    setPhase("reading");
    try {
      const p = await api.draft(text.trim());
      setPolicy(p);
      setWhenUnsure(p.whenUnsure);
      setPhase("review");
    } catch (err) {
      toast((err as Error).message);
      setPhase("home");
    }
  };

  const answer = async (question: string, option: string) => {
    if (!policy) return;
    setAnswering(question);
    try {
      setPolicy(await api.answer(policy.id, question, option));
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setAnswering(null);
    }
  };

  const confirm = async () => {
    if (!policy) return;
    setPhase("confirming");
    try {
      const p = await api.confirm(policy.id, whenUnsure);
      setPolicy(p);
      setPhase("active");
      toast("Policy active", { description: p.story ? "Your agent is starting to shop." : "Your agent can start shopping." });
    } catch (err) {
      toast((err as Error).message);
      setPhase("review");
    }
  };

  const reset = () => {
    setPhase("home");
    setPolicy(null);
    setRequest("");
  };

  if (phase === "home") {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center pb-8 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-[300px] font-heading text-[38px] font-medium leading-[1.08] tracking-[-0.02em]"
          >
            What do you need today?
          </motion.h1>
          <p className="mt-4 max-w-[280px] text-[15px] leading-relaxed text-muted-foreground">Tell me what your agent may buy. I'll turn it into rules you confirm.</p>
        </div>

        {stories.length > 0 && (
          <div className="mb-3">
            <div className="mb-2 px-1 text-[12.5px] font-medium text-muted-foreground">Try one of Viseca's test requests</div>
            <div className="-mx-5 flex snap-x gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {stories.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => send(s.instruction)}
                  className="glass w-[250px] shrink-0 snap-start rounded-2xl px-4 py-3 text-left transition hover:border-white/20"
                >
                  <div className="text-[12.5px] font-semibold text-[#b3a1ff]">{s.name}</div>
                  <span className="mt-1 line-clamp-3 text-[13.5px] leading-snug text-foreground/90">{s.instruction}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Composer value={draftText} onChange={setDraftText} onSend={() => send(draftText)} />
      </div>
    );
  }

  const openQuestions = policy?.questions ?? [];
  return (
    <div className="flex flex-1 flex-col gap-4 pt-2">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-10 self-end rounded-3xl rounded-br-lg bg-primary px-4 py-3 text-[15px] leading-snug text-white">
        {request}
      </motion.div>

      <AnimatePresence mode="wait">
        {phase === "reading" || !policy ? (
          <motion.div key="reading" exit={{ opacity: 0 }} className="flex items-center gap-2 px-1 text-[14px] text-muted-foreground">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="size-1.5 rounded-full bg-white/60" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </span>
            Reading your request
          </motion.div>
        ) : (
          <motion.div key="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass mr-2 rounded-3xl rounded-bl-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-heading text-[19px] font-medium">Here's what I understood</h2>
              <span className="mt-0.5 shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">{policy.title}</span>
            </div>
            <ol className="mt-4 space-y-3">
              {policy.rules.map((rule, i) => (
                <li key={`${rule}-${i}`} className="flex gap-3 text-[15px] leading-snug">
                  <span className="amount grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-[12px] font-semibold">{i + 1}</span>
                  {rule}
                </li>
              ))}
            </ol>

            {policy.guidance.length > 0 && (
              <div className="mt-4 text-[13.5px] text-muted-foreground">
                <div className="font-medium text-foreground/80">Also noted</div>
                <ul className="mt-1 space-y-1">
                  {policy.guidance.map((g) => (
                    <li key={g}>• {g}</li>
                  ))}
                </ul>
              </div>
            )}

            {policy.notUnderstood.length > 0 && (
              <div className="mt-4 rounded-2xl border border-review/40 bg-review/[0.07] p-3.5 text-[13.5px]">
                <div className="flex items-center gap-2 font-semibold text-review">
                  <CircleAlert className="size-4" aria-hidden /> I may not have understood
                </div>
                <ul className="mt-1.5 space-y-1 text-foreground/85">
                  {policy.notUnderstood.map((n) => (
                    <li key={n}>“{n}”</li>
                  ))}
                </ul>
              </div>
            )}

            {phase !== "active" &&
              openQuestions.map((q) => (
                <div key={q.text} className="mt-5">
                  <div className="text-[14.5px] font-medium">{q.text}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.options.map((o) => (
                      <button
                        key={o}
                        type="button"
                        disabled={answering !== null}
                        onClick={() => answer(q.text, o)}
                        className="rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-2 text-[14px] font-medium transition hover:bg-white/10 disabled:opacity-50"
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 space-y-3">
                <div className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/[0.06] text-[15px] font-medium">
                  <Check className="size-4 text-approve" strokeWidth={3} aria-hidden /> Policy active
                </div>
                <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
                  {policy.story
                    ? "Your agent is shopping now. New purchases appear in Inbox and History."
                    : "Your agent is ready. In Viseca's test sandbox, purchases only exist for the test requests."}
                </p>
              </motion.div>
            ) : (
              <button
                type="button"
                disabled={phase === "confirming" || openQuestions.length > 0}
                onClick={confirm}
                className="mt-5 h-12 w-full rounded-2xl bg-primary text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
              >
                {phase === "confirming" ? "Confirming…" : openQuestions.length ? "Answer the question above first" : "Confirm and activate"}
              </button>
            )}
            <p className="mt-3 text-center text-[12.5px] text-muted-foreground">Your words are kept exactly as you wrote them.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {(phase === "active" || phase === "review") && (
        <button type="button" onClick={reset} className="mx-auto mt-1 inline-flex items-center gap-1.5 text-[14px] font-medium text-[#b3a1ff] hover:text-white">
          <RotateCcw className="size-4" aria-hidden /> New request
        </button>
      )}
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
