// one summary box: small label on top, big number below (used by History and Report)
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}