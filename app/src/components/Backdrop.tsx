/** Soft colour glows + a dot grid fading toward the edges. Purely decorative: no text sits on it directly. */
export function Backdrop({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="backdrop-glows absolute -inset-[10%]" />
      <div className="backdrop-dots absolute inset-0" />
    </div>
  );
}
