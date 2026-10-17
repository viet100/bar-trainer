import HoldButton from "@/components/HoldButton";

type BottleProps = {
  name: string;
  color: string;
  pouring: boolean;
  onStart: () => void;
  onStop: () => void;
};

export default function Bottle({ name, color, pouring, onStart, onStop }: BottleProps) {
  return (
    <HoldButton
      label={`Hold to pour ${name}`}
      held={pouring}
      onStart={onStart}
      onStop={onStop}
      className={`group flex flex-col items-center outline-none transition-transform duration-150 ease-out ${
        pouring ? "-translate-y-4 -rotate-12" : "hover:-translate-y-1"
      }`}
    >
      <span className="h-5 w-3 rounded-t-sm bg-stone-700" />
      <span className="h-2 w-5 rounded-t-md bg-stone-600" />
      <span
        className="flex h-20 w-14 items-end justify-center rounded-b-lg rounded-t-2xl border-2 border-white/20 pb-2 group-focus-visible:ring-2 group-focus-visible:ring-amber-300"
        style={{ backgroundColor: color }}
      >
        <span className="mx-0.5 rounded bg-stone-950/80 px-1 py-0.5 text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-stone-100">
          {name}
        </span>
      </span>
    </HoldButton>
  );
}
