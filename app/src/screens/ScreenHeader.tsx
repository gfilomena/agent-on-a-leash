export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-heading text-[32px] font-medium leading-tight tracking-[-0.02em]">{title}</h1>
      {subtitle && <p className="mt-1 text-[15px] text-muted-foreground">{subtitle}</p>}
    </header>
  );
}
