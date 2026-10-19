import { FREE_POUR_OZ, FREE_POUR_SECONDS } from "@/lib/pour";

// One count = one second of pour. Bartenders count instead of watching a number.
export const OZ_PER_BEAT = FREE_POUR_OZ / FREE_POUR_SECONDS;

type PourGaugeProps = {
  oz: number; // this pour so far
  targetOz: number | null; // what the order wants of this ingredient, null if it isn't in the order
};

// Floats beside the vessel being poured into, so your eyes stay on the bar:
// ounces, one dot per count, and the target for this ingredient.
export default function PourGauge({ oz, targetOz }: PourGaugeProps) {
  const beats = Math.floor(oz / OZ_PER_BEAT + 1e-9);
  const shown = Math.max(3, beats + 1, targetOz ? Math.ceil(targetOz / OZ_PER_BEAT) : 0);

  return (
    <div className="pointer-events-none absolute left-full top-2 ml-3 w-24 rounded-lg bg-stone-950/85 px-2 py-1.5 shadow-lg shadow-black/50">
      <p className="font-mono text-lg font-semibold tabular-nums leading-none text-amber-200">
        {oz.toFixed(2)}
        <span className="ml-0.5 text-[10px] text-stone-400">oz</span>
      </p>
      <div className="mt-1 flex flex-wrap gap-1" aria-label={`${beats} counts`}>
        {Array.from({ length: shown }, (_, i) => {
          const done = i < beats;
          const isTarget = targetOz !== null && i < Math.round(targetOz / OZ_PER_BEAT);
          return (
            <span
              key={done ? `d${i}` : `p${i}`} // remount on fill so each new count pulses
              className={`size-2.5 rounded-full ${done ? "animate-bubble-in bg-amber-300" : isTarget ? "border border-amber-300/60" : "border border-stone-600"}`}
            />
          );
        })}
      </div>
      <p className="mt-1 text-[10px] leading-tight text-stone-400">
        {targetOz === null ? <span className="text-red-400">Not in this order</span> : `target ${targetOz} oz`}
      </p>
    </div>
  );
}
