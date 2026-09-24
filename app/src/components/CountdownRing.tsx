import { useEffect, useState } from "react";

/** Seconds left to answer, as a ring that empties. */
export function CountdownRing({ until, totalMs = 120_000 }: { until: number; totalMs?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, until - now);
  const r = 17;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative grid size-11 place-items-center" aria-label={`${Math.ceil(left / 1000)} seconds left to answer`}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="var(--verdict-review)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - left / totalMs)}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <span className="amount text-[12.5px] font-semibold">{Math.ceil(left / 1000)}</span>
    </div>
  );
}
