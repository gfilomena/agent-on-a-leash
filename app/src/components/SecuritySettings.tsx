import { Globe, ShieldCheck, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Period, Region, Settings, SettingsChange } from "@/lib/types";

const PERIODS: { value: Period; label: string; per: string }[] = [
  { value: "day", label: "Daily", per: "per day" },
  { value: "week", label: "Weekly", per: "per week" },
  { value: "month", label: "Monthly", per: "per month" },
];
const REGIONS: { value: Region; label: string; hint: string }[] = [
  { value: "switzerland", label: "Switzerland", hint: "Only shops in Switzerland and Liechtenstein." },
  { value: "europe", label: "Europe", hint: "Shops in Europe, including Switzerland and the UK." },
  { value: "global", label: "Global", hint: "Shops in any country." },
];
const per = (p: Period) => PERIODS.find((x) => x.value === p)!.per;

type Limit = Settings["spendingLimit"];
/** How much a limit lets the agent spend per day: higher = looser. Off = no limit. */
const dailyRate = (l: Limit) => (l.on ? l.amount / { day: 1, week: 7, month: 30 }[l.period] : Infinity);
const REGION_ORDER: Region[] = ["switzerland", "europe", "global"];

type Confirm = { title: string; body: string; action: string; change: SettingsChange };

/** Security settings: a spending limit and allowed regions, on top of every policy. Loosening asks first. */
export function SecuritySettings({ settings, container }: { settings: Settings; container: HTMLElement | null }) {
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [countries, setCountries] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (change: SettingsChange) => {
    setBusy(true);
    try {
      await api.saveSettings(change);
      toast("Saved", { description: "Applies from your agent's next purchase." });
      return true;
    } catch (err) {
      toast((err as Error).message);
      return false;
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  /** Stricter settings save at once; looser ones ask first, like a bank does. */
  const saveLimit = (next: Limit) => {
    const cur = settings.spendingLimit;
    if (dailyRate(next) <= dailyRate(cur)) return save({ spendingLimit: next });
    setConfirm(
      !next.on
        ? { title: "Turn off the spending limit?", body: "Your agent could then spend up to each policy's own limits.", action: "Turn off", change: { spendingLimit: { on: false } } }
        : {
            title: next.period === cur.period ? `Raise your limit to ${money(next.amount)} ${per(next.period)}?` : `Change your limit to ${money(next.amount)} ${per(next.period)}?`,
            body: "Your agent could then spend more, across every policy.",
            action: next.period === cur.period ? "Raise limit" : "Change limit",
            change: { spendingLimit: next },
          },
    );
    return Promise.resolve(false);
  };

  const pickRegion = (region: Region) => {
    if (region === settings.region) return;
    if (REGION_ORDER.indexOf(region) < REGION_ORDER.indexOf(settings.region)) return void save({ region });
    setConfirm(
      region === "global"
        ? { title: "Allow shops worldwide?", body: "Your agent could then buy from shops in any country, for every policy.", action: "Allow worldwide", change: { region } }
        : { title: "Allow shops in Europe?", body: "Your agent could then buy from shops across Europe, not only in Switzerland, for every policy.", action: "Allow Europe", change: { region } },
    );
  };

  return (
    <section className="glass mb-4 rounded-3xl p-5">
      <h2 className="flex items-center gap-2 font-heading text-[19px] font-medium">
        <ShieldCheck className="size-5 text-muted-foreground" aria-hidden /> Security settings
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">Apply to every policy, whatever you ask in Chat.</p>

      <LimitRow limit={settings.spendingLimit} usage={settings.usage} busy={busy} onSave={saveLimit} />

      <div className="mt-5 border-t border-white/10 pt-5">
        <RowTitle Icon={Globe} title="Allowed regions" />
        <Segmented options={REGIONS} value={settings.region} onChange={pickRegion} disabled={busy} label="Allowed regions" />
        <p className="mt-2.5 text-[13.5px] leading-snug text-muted-foreground">
          {REGIONS.find((r) => r.value === settings.region)!.hint}{" "}
          {settings.region === "europe" && (
            <button type="button" onClick={() => setCountries(true)} className="font-medium text-[#b3a1ff] hover:text-white">
              See countries
            </button>
          )}
        </p>
      </div>

      <Drawer open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} container={container}>
        <DrawerContent className="glass-strong rounded-t-[28px] border-x-0 border-b-0 text-foreground">
          {confirm && (
            <div className="px-5 pb-8">
              <DrawerHeader className="px-0 pt-4 !text-left">
                <DrawerTitle className="!text-left font-heading text-[21px] font-medium">{confirm.title}</DrawerTitle>
                <DrawerDescription className="!text-left text-[14.5px] leading-relaxed text-muted-foreground">{confirm.body}</DrawerDescription>
              </DrawerHeader>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setConfirm(null)} className="h-12 rounded-2xl bg-white/[0.08] text-[15px] font-semibold">
                  Cancel
                </button>
                <button type="button" disabled={busy} onClick={() => save(confirm.change)} className="h-12 rounded-2xl bg-primary text-[15px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
                  {busy ? "Saving…" : confirm.action}
                </button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <Drawer open={countries} onOpenChange={setCountries} container={container}>
        <DrawerContent className="glass-strong !max-h-[85%] rounded-t-[28px] border-x-0 border-b-0 text-foreground">
          <div className="overflow-y-auto px-5 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <DrawerHeader className="px-0 pt-4 !text-left">
              <DrawerTitle className="!text-left font-heading text-[21px] font-medium">Countries in Europe</DrawerTitle>
              <DrawerDescription className="!text-left text-[14px] text-muted-foreground">Your agent may buy from shops in these {settings.countries.europe.length} countries.</DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-wrap gap-2">
              {settings.countries.europe.map((c) => (
                <span key={c} className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13.5px]">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}

function LimitRow({ limit, usage, busy, onSave }: { limit: Limit; usage: Settings["usage"]; busy: boolean; onSave: (next: Limit) => Promise<boolean> }) {
  const [amount, setAmount] = useState(String(limit.amount));
  const [period, setPeriod] = useState<Period>(limit.period);
  // Follow the saved values (e.g. after a save or a change elsewhere).
  useEffect(() => {
    setAmount(String(limit.amount));
    setPeriod(limit.period);
  }, [limit.amount, limit.period]);

  const typed = Number(amount.replace(/[’',\s]/g, ""));
  const valid = Number.isFinite(typed) && typed > 0 && typed <= 100_000;
  const dirty = limit.on && (typed !== limit.amount || period !== limit.period);
  const pct = usage ? Math.min(100, Math.round((usage.spentChf / Math.max(usage.limitChf, 1)) * 100)) : 0;

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <RowTitle Icon={Wallet} title="Spending limit" />
          <div className="mt-0.5 pl-7 text-[13.5px] text-muted-foreground">{limit.on ? `${money(limit.amount)} ${per(limit.period)}` : "Off"}</div>
        </div>
        <Switch checked={limit.on} disabled={busy} label="Spending limit" onChange={(on) => onSave({ ...limit, on })} />
      </div>

      <AnimatePresence initial={false}>
        {limit.on && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: "easeOut" }} className="overflow-hidden">
            <div className="space-y-3 pt-4">
              <div className="flex h-12 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-4 focus-within:border-primary">
                <span className="text-[15px] font-medium text-muted-foreground">CHF</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  aria-label="Spending limit amount in CHF"
                  className="amount min-w-0 flex-1 bg-transparent text-[17px] font-semibold outline-none"
                />
              </div>
              <Segmented options={PERIODS} value={period} onChange={setPeriod} disabled={busy} label="Limit period" className="" />

              {usage && !dirty && (
                <div className="pt-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Spending used">
                    <motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: "easeOut" }} />
                  </div>
                  <p className="mt-2 text-[13.5px]">
                    <span className="amount font-semibold">{money(usage.spentChf)}</span>
                    <span className="text-muted-foreground"> of {money(usage.limitChf)} used {usage.period}</span>
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{usage.resets.charAt(0).toUpperCase() + usage.resets.slice(1)}</p>
                </div>
              )}

              <AnimatePresence initial={false}>
                {dirty && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAmount(String(limit.amount));
                        setPeriod(limit.period);
                      }}
                      className="h-11 rounded-2xl bg-white/[0.08] text-[14.5px] font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!valid || busy}
                      onClick={() => onSave({ on: true, amount: Math.round(typed * 100) / 100, period })}
                      className="h-11 rounded-2xl bg-primary text-[14.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      Save limit
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RowTitle({ Icon, title }: { Icon: typeof Globe; title: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[15.5px] font-medium">
      <Icon className="size-[18px] text-muted-foreground" aria-hidden />
      {title}
    </div>
  );
}

/** Same pill selector as "Ask me | Decline" in Chat. */
function Segmented<T extends string>({ options, value, onChange, disabled, label, className = "mt-3" }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={`${className} grid gap-1 rounded-full bg-white/[0.06] p-1`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`h-10 rounded-full text-[14px] font-medium transition disabled:opacity-60 ${value === o.value ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${checked ? "bg-primary" : "bg-white/15"}`}
    >
      <motion.span className="absolute top-[3px] left-[3px] size-6 rounded-full bg-white shadow" animate={{ x: checked ? 20 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 32 }} />
    </button>
  );
}
