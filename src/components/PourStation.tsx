"use client";

import Bottle from "@/components/Bottle";
import Glass from "@/components/Glass";
import { usePourController } from "@/hooks/usePourController";
import { FLOW_RATE_ML_PER_S, mlToOz } from "@/lib/pour";

// Placeholder bottles until orders drive the bar setup.
const BOTTLES = [
  { id: "tequila", name: "Tequila", color: "#e9d38c" },
  { id: "triple-sec", name: "Triple Sec", color: "#f2a65a" },
  { id: "lime", name: "Lime Juice", color: "#a3cf5b" },
];

const GLASS_CAPACITY_ML = 300; // ~10 oz rocks glass

const colorOf = (id: string) => BOTTLES.find((b) => b.id === id)?.color ?? "#888";
const nameOf = (id: string) => BOTTLES.find((b) => b.id === id)?.name ?? id;
const oz = (ml: number) => mlToOz(ml).toFixed(2);

export default function PourStation() {
  const pour = usePourController(GLASS_CAPACITY_ML);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 bg-stone-950 px-4 py-12 font-sans text-stone-100">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Make a Drink</h1>
        <p className="mt-1 text-sm text-stone-400">
          Hold a bottle to pour. Count it: 3 seconds = 1.5 oz.
        </p>
      </header>

      <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-end sm:gap-14">
        <Glass
          contents={pour.contents}
          totalMl={pour.totalMl}
          capacityMl={GLASS_CAPACITY_ML}
          colorOf={colorOf}
          streamColor={pour.activeId ? colorOf(pour.activeId) : null}
        />

        <section className="w-56 font-mono text-sm tabular-nums" aria-live="polite">
          <p className="text-4xl font-semibold">
            {oz(pour.totalMl)}
            <span className="ml-1 text-base text-stone-400">oz</span>
          </p>
          <p className="text-stone-400">
            {pour.totalMl.toFixed(0)} / {GLASS_CAPACITY_ML} ml
          </p>

          <p className="mt-4 text-stone-300">
            {pour.activeId ? "Pouring" : "Last pour"}: {oz(pour.currentPourMl)} oz (
            {(pour.currentPourMl / FLOW_RATE_ML_PER_S).toFixed(1)} s)
          </p>

          <ul className="mt-4 space-y-1">
            {Object.entries(pour.contents).map(([id, ml]) => (
              <li key={id} className="flex justify-between">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: colorOf(id) }} />
                  {nameOf(id)}
                </span>
                <span>{oz(ml)} oz</span>
              </li>
            ))}
          </ul>

          {pour.spilledMl > 0 && (
            <p className="mt-4 font-semibold text-red-400">Spilled {oz(pour.spilledMl)} oz</p>
          )}

          <button
            type="button"
            onClick={pour.reset}
            className="mt-6 rounded-md border border-stone-700 px-3 py-1.5 font-sans text-stone-300 transition-colors hover:border-stone-500 hover:text-white"
          >
            Dump glass
          </button>
        </section>
      </div>

      <div className="flex items-end gap-3 sm:gap-6">
        {BOTTLES.map((b) => (
          <Bottle
            key={b.id}
            name={b.name}
            color={b.color}
            pouring={pour.activeId === b.id}
            onStart={() => pour.startPour(b.id)}
            onStop={pour.stopPour}
          />
        ))}
      </div>
    </main>
  );
}
