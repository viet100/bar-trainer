type BottleProps = {
  name: string;
  color: string;
  pouring: boolean;
  onStart: () => void;
  onStop: () => void;
};

const isPourKey = (key: string) => key === " " || key === "Enter";

export default function Bottle({ name, color, pouring, onStart, onStop }: BottleProps) {
  return (
    <button
      type="button"
      aria-label={`Hold to pour ${name}`}
      aria-pressed={pouring}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Capture keeps pointerup coming to us even if the cursor drifts off the bottle.
        e.currentTarget.setPointerCapture(e.pointerId);
        onStart();
      }}
      onPointerUp={onStop}
      onPointerCancel={onStop}
      onLostPointerCapture={onStop}
      onKeyDown={(e) => {
        if (!isPourKey(e.key)) return;
        e.preventDefault();
        if (!e.repeat) onStart();
      }}
      onKeyUp={(e) => isPourKey(e.key) && onStop()}
      onBlur={onStop}
      onContextMenu={(e) => e.preventDefault()}
      className={`group flex touch-none select-none flex-col items-center outline-none transition-transform duration-150 ease-out ${
        pouring ? "-translate-y-4 -rotate-12" : "hover:-translate-y-1"
      }`}
    >
      <span className="h-8 w-4 rounded-t-sm bg-stone-700" />
      <span className="h-3 w-7 rounded-t-md bg-stone-600" />
      <span
        className="flex h-24 w-16 items-end sm:h-28 sm:w-20 justify-center rounded-b-xl rounded-t-3xl border-2 border-white/20 pb-3 group-focus-visible:ring-2 group-focus-visible:ring-amber-300"
        style={{ backgroundColor: color }}
      >
        <span className="rounded bg-stone-950/80 px-1 py-0.5 text-[9px] sm:px-1.5 sm:text-[10px] font-semibold uppercase tracking-wide text-stone-100">
          {name}
        </span>
      </span>
    </button>
  );
}
