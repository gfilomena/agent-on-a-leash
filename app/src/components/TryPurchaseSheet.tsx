import { ChevronDown, FlaskConical, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { api } from "@/lib/api";
import { seconds } from "@/lib/format";
import type { Purchase, TryCatalogue, TryProposal } from "@/lib/types";
import { DecisionCard } from "./DecisionCard";
import { DecisionFacts } from "./DecisionSheet";

type Stage = "looking" | "form" | "buying" | "result";
type Draft = Omit<TryProposal, "price"> & { price: string };

const newId = () => Math.random().toString(36).slice(2, 10);
const emptyDraft = (): Draft => ({ id: newId(), productId: "", shopId: "", price: "", shopText: "" });

/**
 * "Try a purchase" (step 14b): a clearly labelled simulated agent proposes a real product from a real
 * shop in Viseca's data; the customer can change anything; the real engine decides. Nothing goes to Viseca.
 */
export function TryPurchaseSheet({ open, onClose, policyId, whenUnsure, container }: { open: boolean; onClose: () => void; policyId: string; whenUnsure: "ask" | "decline"; container: HTMLElement | null }) {
  const [catalogue, setCatalogue] = useState<TryCatalogue | null>(null);
  const [stage, setStage] = useState<Stage>("looking");
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [result, setResult] = useState<Purchase | null>(null);
  const [proposed, setProposed] = useState<string[]>([]);

  useEffect(() => {
    if (open && !catalogue) api.tryCatalogue().then(setCatalogue).catch(() => toast("Couldn't load the test shops. Please try again."));
  }, [open, catalogue]);

  const product = catalogue?.products.find((p) => p.id === draft.productId);
  const shop = catalogue?.shops.find((s) => s.id === draft.shopId);

  const findOne = async (avoid: string[]) => {
    setStage("looking");
    setResult(null);
    setNotice(null);
    try {
      const r = await api.tryPropose(policyId, avoid);
      if (r.found && r.proposal) {
        const p = r.proposal;
        setDraft({ ...p, price: String(p.price) });
        const names = catalogue && `${catalogue.products.find((x) => x.id === p.productId)?.name} at ${catalogue.shops.find((x) => x.id === p.shopId)?.name}`;
        if (names) setProposed((xs) => [...xs, names]);
      } else {
        setNotice(r.message ?? "I couldn't find this in the test shops. Pick a product yourself.");
        setDraft(emptyDraft());
      }
    } catch (err) {
      setNotice((err as Error).message);
      setDraft(emptyDraft());
    }
    setStage("form");
  };

  // A fresh proposal each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setProposed([]);
    void findOne([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, policyId]);

  const buy = async () => {
    setStage("buying");
    try {
      setResult(await api.tryBuy(policyId, { ...draft, price: Number(draft.price.replace(",", ".")) }, whenUnsure));
      setStage("result");
    } catch (err) {
      toast((err as Error).message);
      setStage("form");
    }
  };

  const productGroups = useMemo(() => {
    const groups = new Map<string, TryCatalogue["products"]>();
    for (const p of catalogue?.products ?? []) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
    return [...groups.entries()];
  }, [catalogue]);

  const ready = !!product && !!shop && Number(draft.price.replace(",", ".")) > 0;

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} container={container}>
      <DrawerContent className="glass-strong !max-h-[90%] rounded-t-[28px] border-x-0 border-b-0 text-foreground">
        <div className="overflow-y-auto px-5 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <DrawerHeader className="px-0 pt-4 !text-left">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-review/50 bg-review/10 px-2.5 py-1 text-[12px] font-semibold text-review">
              <FlaskConical className="size-3.5" aria-hidden /> Simulated agent · test only
            </span>
            <DrawerTitle className="mt-2 !text-left font-heading text-[21px] font-medium">Try a purchase</DrawerTitle>
            <DrawerDescription className="!text-left text-[13.5px] text-muted-foreground">Nothing is bought and nothing is sent to Viseca.</DrawerDescription>
          </DrawerHeader>

          {stage === "looking" && (
            <div className="flex items-center gap-2 py-6 text-[14.5px] text-muted-foreground">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="size-1.5 rounded-full bg-white/60" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
                ))}
              </span>
              Your agent is looking…
            </div>
          )}

          {(stage === "form" || stage === "buying") && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {notice ? (
                <p className="rounded-2xl border border-review/40 bg-review/[0.07] p-3.5 text-[14px]">{notice}</p>
              ) : (
                <p className="text-[14.5px] font-medium">Your agent found this. Change anything, then let it buy.</p>
              )}

              <Field label="Product">
                <Select value={draft.productId} onChange={(v) => setDraft({ ...draft, productId: v })} placeholder="Choose a product">
                  {productGroups.map(([category, items]) => (
                    <optgroup key={category} label={category.charAt(0).toUpperCase() + category.slice(1)}>
                      {items.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>

              <Field label="Shop" hint={shop ? `${shop.category.charAt(0).toUpperCase()}${shop.category.slice(1)} · ${shop.city}, ${shop.country}` : undefined}>
                <Select value={draft.shopId} onChange={(v) => setDraft({ ...draft, shopId: v })} placeholder="Choose a shop">
                  {catalogue?.shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.city}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Price, delivery included">
                <div className="flex h-12 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-4 focus-within:border-primary">
                  <span className="text-[15px] font-medium text-muted-foreground">{shop?.currency ?? "CHF"}</span>
                  <input
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                    inputMode="decimal"
                    aria-label="Price, delivery included"
                    className="amount min-w-0 flex-1 bg-transparent text-[15px] outline-none"
                  />
                </div>
              </Field>

              <Field label="Shop's product text" hint="Written by the shop. Compass reads facts from it (size, returns) and ignores any instructions.">
                <textarea
                  value={draft.shopText}
                  onChange={(e) => setDraft({ ...draft, shopText: e.target.value })}
                  rows={3}
                  maxLength={1000}
                  aria-label="Shop's product text"
                  className="w-full resize-none rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-[14.5px] leading-snug outline-none focus:border-primary"
                />
              </Field>

              <button
                type="button"
                disabled={!ready || stage === "buying"}
                onClick={buy}
                className="h-12 w-full rounded-2xl bg-primary text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
              >
                {stage === "buying" ? "Deciding…" : "Let the agent buy"}
              </button>
              <button type="button" disabled={stage === "buying"} onClick={() => findOne(proposed)} className="mx-auto flex items-center gap-1.5 text-[14px] font-medium text-[#b3a1ff] hover:text-white disabled:opacity-50">
                <RefreshCw className="size-4" aria-hidden /> Try another
              </button>
            </motion.div>
          )}

          {stage === "result" && result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <DecisionCard d={result} />
              <p className="mt-2 text-center text-[12.5px] text-muted-foreground">Compass decided in {result.decidedInMs < 10 ? "under 0.01 s" : seconds(result.decidedInMs)}</p>
              {result.display === "step_up" && <p className="mt-3 rounded-2xl bg-white/[0.04] p-3.5 text-[14px]">In real life, this would wait in your Inbox.</p>}
              <DecisionFacts d={result} />
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setStage("form")} className="h-12 rounded-2xl border border-white/15 bg-white/[0.04] text-[15px] font-medium transition hover:bg-white/10">
                  Change and retry
                </button>
                <button type="button" onClick={() => findOne(proposed)} className="h-12 rounded-2xl bg-primary text-[15px] font-semibold text-white transition hover:brightness-110">
                  Try another
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13.5px] font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12.5px] leading-snug text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Select({ value, onChange, placeholder, children }: { value: string; onChange: (v: string) => void; placeholder: string; children: ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full appearance-none rounded-2xl border border-white/15 bg-white/[0.06] pr-10 pl-4 text-[15px] outline-none focus:border-primary [&_optgroup]:bg-[#16161c] [&_option]:bg-[#16161c]"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
}
