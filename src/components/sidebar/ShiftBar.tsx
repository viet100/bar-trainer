import { SHIFT_LENGTH } from "@/game/shift";

type ShiftBarProps = {
  shiftNumber: number;
  customer: number; // 1-based position in the shift
  tips: number;
  streak: number;
  seconds: number;
  par: number;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function ShiftBar({ shiftNumber, customer, tips, streak, seconds, par }: ShiftBarProps) {
  const late = seconds > par;
  return (
    <div className="grid grid-cols-4 gap-2 rounded-xl border border-stone-800 bg-stone-950/60 p-2 text-center text-[11px] text-stone-500">
      <Stat label={`Shift ${shiftNumber}`} value={`${Math.min(customer, SHIFT_LENGTH)}/${SHIFT_LENGTH}`} />
      <Stat label="Tips" value={`$${tips}`} accent="text-emerald-300" />
      <Stat label="Streak" value={String(streak)} accent={streak >= 2 ? "text-amber-200" : undefined} />
      <Stat label={`Par ${clock(par)}`} value={clock(seconds)} accent={late ? "text-red-400" : "text-stone-100"} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className={`font-mono text-base font-semibold tabular-nums ${accent ?? "text-stone-100"}`}>{value}</p>
      <p className="uppercase tracking-wider">{label}</p>
    </div>
  );
}
