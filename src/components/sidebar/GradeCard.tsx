import MeasurementReport from "@/components/MeasurementReport";
import type { Grade } from "@/game/grade";
import type { Measurement } from "@/game/measure";
import type { Score } from "@/game/score";
import type { Tip } from "@/game/tips";

type GradeCardProps = {
  customerName: string;
  measurement: Measurement;
  score: Score;
  grade: Grade | null; // null while the customer is tasting
  tip: Tip | null;
};

export function Stars({ count, size = "text-2xl" }: { count: number; size?: string }) {
  return (
    <span aria-label={`${count} of 5 stars`} className={`${size} tracking-tight`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= count ? "text-amber-300" : "text-stone-700"}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function GradeCard({ customerName, measurement, score, grade, tip }: GradeCardProps) {
  return (
    <section className="space-y-3 rounded-xl border border-stone-800 bg-stone-950/60 p-3">
      {grade ? (
        <div className="flex items-center justify-between gap-2">
          <Stars count={grade.stars} />
          {grade.sendBack ? (
            <span className="rounded border border-red-800 px-2 py-0.5 text-xs text-red-300">Sent back</span>
          ) : (
            tip && <span className="font-mono text-lg font-semibold text-emerald-300">+${tip.total}</span>
          )}
        </div>
      ) : (
        <p className="animate-pulse text-sm text-stone-400">{customerName} is tasting it…</p>
      )}

      {grade && tip && tip.total > 0 && (
        <p className="text-xs text-stone-500">
          ${tip.base} tip{tip.streak > 0 && ` · +$${tip.streak} streak`}
          {tip.speed > 0 && ` · +$${tip.speed} speed`}
        </p>
      )}

      {grade && (
        <div className="rounded-lg bg-stone-900 p-2.5 text-sm">
          <p className="text-[11px] uppercase tracking-widest text-stone-500">Head bartender</p>
          <p className="mt-0.5 text-stone-200">{grade.coachTip}</p>
        </div>
      )}

      <details className="text-sm text-stone-400">
        <summary className="cursor-pointer select-none text-xs">Measured: {score.points}/100 · details</summary>
        <div className="mt-2">
          <MeasurementReport m={measurement} />
        </div>
      </details>
    </section>
  );
}
