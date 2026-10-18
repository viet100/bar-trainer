import { GLASSES } from "@/game/glassware";
import { GARNISHES, INGREDIENTS } from "@/game/ingredients";
import type { Measurement } from "@/game/measure";

// Display-only colouring; the real verdict comes from Gemini.
const errorColor = (errorOz: number) => {
  const e = Math.abs(errorOz);
  return e <= 0.125 ? "text-emerald-400" : e <= 0.25 ? "text-amber-300" : "text-red-400";
};

const Mark = ({ ok }: { ok: boolean }) => (
  <span className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
);

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}`;

export default function MeasurementReport({ m }: { m: Measurement }) {
  const t = m.technique;
  const garnishName = (g: keyof typeof GARNISHES | null) => (g ? GARNISHES[g] : "none");

  return (
    <div className="space-y-3 font-mono text-xs tabular-nums sm:text-sm">
      <table className="w-full">
        <thead className="text-stone-500">
          <tr>
            <th className="text-left font-normal">ingredient</th>
            <th className="text-right font-normal">target</th>
            <th className="text-right font-normal">poured</th>
            <th className="text-right font-normal">error</th>
          </tr>
        </thead>
        <tbody>
          {m.ingredients.map((i) => (
            <tr key={i.id}>
              <td>{INGREDIENTS[i.id].name}</td>
              <td className="text-right">{i.expectedOz.toFixed(2)}</td>
              <td className="text-right">{i.actualOz.toFixed(2)}</td>
              <td className={`text-right ${errorColor(i.errorOz)}`}>{signed(i.errorOz)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-1 text-stone-300">
        <li>
          <Mark ok={m.glass.actual === m.glass.expected} /> Glass: {m.glass.actual ? GLASSES[m.glass.actual].name : "none"}{" "}
          <span className="text-stone-500">(want {GLASSES[m.glass.expected].name})</span>
        </li>
        <li>
          <Mark ok={t.actual === t.expected} /> Technique: {t.actual}
          {t.shakeSeconds > 0 && `, ${t.shakeSeconds}s shake`}
          {t.stirSeconds > 0 && `, ${t.stirSeconds}s stir`}
          {t.actual !== "build" && (t.mixedWithIce ? ", with ice" : ", no ice in tin")}{" "}
          <span className="text-stone-500">(want {t.expected})</span>
        </li>
        <li>
          <Mark ok={m.ice.expected === (m.ice.actual > 0)} /> Ice in glass: {m.ice.actual} cubes{" "}
          <span className="text-stone-500">(want {m.ice.expected ? "on the rocks" : "up, no ice"})</span>
        </li>
        <li>
          <Mark ok={m.garnish.actual === m.garnish.expected} /> Garnish: {garnishName(m.garnish.actual)}{" "}
          <span className="text-stone-500">(want {garnishName(m.garnish.expected)})</span>
        </li>
        {m.leftInShakerOz > 0 && (
          <li className="text-red-400">✗ Left {m.leftInShakerOz.toFixed(2)} oz in the shaker (never strained)</li>
        )}
        <li>
          Total error {m.totalErrorOz.toFixed(2)} oz
          {m.spilledOz > 0 && <span className="text-red-400"> · spilled {m.spilledOz.toFixed(2)} oz</span>}
        </li>
      </ul>
    </div>
  );
}
