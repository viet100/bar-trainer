import { Stars } from "@/components/sidebar/GradeCard";
import { summarize, type Shift } from "@/game/shift";

export default function ShiftSummary({ shift, onNextShift }: { shift: Shift; onNextShift: () => void }) {
  const sum = summarize(shift);

  return (
    <section className="animate-bubble-in space-y-4 rounded-xl border border-amber-300/30 bg-stone-950/70 p-4">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-stone-500">Shift {shift.number} done</p>
        <p className="font-mono text-4xl font-semibold text-emerald-300">${sum.tips}</p>
        <p className="text-xs text-stone-500">in tips</p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Fact label="Avg rating" value={`${sum.avgStars} ★`} />
        <Fact label="Best streak" value={String(sum.bestStreak)} />
        <Fact label="Under par" value={`${sum.underPar} of ${shift.served.length}`} />
        <Fact label="Sent back" value={String(sum.sentBack)} />
      </dl>

      <div className="rounded-lg bg-stone-900 p-2.5 text-sm">
        <p className="text-[11px] uppercase tracking-widest text-stone-500">Work on next</p>
        <p className="mt-0.5 text-stone-200">{sum.focus ?? "No steady pour errors this shift. Clean work."}</p>
      </div>

      <ol className="space-y-1 text-sm">
        {shift.served.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span className="truncate text-stone-300">{s.drink}</span>
            <span className="flex shrink-0 items-center gap-2">
              <Stars count={s.stars} size="text-sm" />
              <span className="w-8 text-right font-mono text-stone-400">${s.tip.total}</span>
            </span>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onNextShift}
        className="w-full rounded-lg bg-amber-300 py-2.5 font-semibold text-stone-950 transition-colors hover:bg-amber-200"
      >
        Start shift {shift.number + 1}
      </button>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-900 px-2.5 py-1.5">
      <dt className="text-[11px] uppercase tracking-wider text-stone-500">{label}</dt>
      <dd className="font-mono text-stone-100">{value}</dd>
    </div>
  );
}
