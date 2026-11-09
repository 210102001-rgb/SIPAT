type StatCardTone = "green" | "yellow" | "orange" | "red" | "cyan" | "slate";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: StatCardTone;
}

const TONE_VALUE: Record<StatCardTone, string> = {
  green: "text-ok",
  yellow: "text-warn",
  orange: "text-alert",
  red: "text-danger",
  cyan: "text-accent",
  slate: "text-ink",
};

const TONE_BAR: Record<StatCardTone, string> = {
  green: "bg-ok",
  yellow: "bg-warn",
  orange: "bg-alert",
  red: "bg-danger",
  cyan: "bg-accent",
  slate: "bg-slate-500",
};

export function StatCard({ label, value, sub, tone = "slate" }: StatCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className={`h-1 w-full ${TONE_BAR[tone]}`} />
      <div className="p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          {label}
        </p>
        <p className={`mt-2 font-mono text-3xl font-bold tabular-nums ${TONE_VALUE[tone]}`}>
          {value}
        </p>
        {sub ? <p className="mt-1 text-xs leading-snug text-muted">{sub}</p> : null}
      </div>
    </div>
  );
}
