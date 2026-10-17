"use client";

import { useReducer, useRef, useState, type ReactNode } from "react";
import Bottle from "@/components/Bottle";
import Glass from "@/components/Glass";
import HoldButton from "@/components/HoldButton";
import MeasurementReport from "@/components/MeasurementReport";
import { INITIAL_DRINK, capacityMl, drinkReducer, liquidMl, type VesselId } from "@/game/drink";
import { GLASSES, GLASS_IDS } from "@/game/glassware";
import { GARNISHES, INGREDIENTS, INGREDIENT_IDS, type GarnishId, type IngredientId } from "@/game/ingredients";
import { measureDrink, type Measurement } from "@/game/measure";
import { classicOrder, type Order } from "@/game/order";
import { CLASSIC_RECIPES } from "@/game/recipes";
import { usePourController } from "@/hooks/usePourController";
import { mlToOz } from "@/lib/pour";

const ICE_SCOOP = 3;
const STIR_STEP = 5;

const colorOf = (id: string) => INGREDIENTS[id as IngredientId]?.color ?? "#888";
const oz = (ml: number) => mlToOz(ml).toFixed(2);

// Fixed (no randomness) so server and client render the same first order.
const FIRST_ORDER = classicOrder([], () => 0);

// 2D placeholder for the bar. Every interaction goes through drinkReducer,
// so the 3D scene can replace this view without touching game rules.
export default function BarStation() {
  const [drink, dispatch] = useReducer(drinkReducer, INITIAL_DRINK);
  const [target, setTarget] = useState<VesselId>("glass");
  const [order, setOrder] = useState<Order>(FIRST_ORDER);
  const [recent, setRecent] = useState<string[]>([FIRST_ORDER.recipe.name]);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [memoryMode, setMemoryMode] = useState(false);
  const [report, setReport] = useState<Measurement | null>(null);
  const [shaking, setShaking] = useState(false);
  // A ref, not state: pointerup and lostpointercapture fire back to back and must not both count.
  const shakeStart = useRef<number | null>(null);

  const recipe = order.recipe;
  const pour = usePourController<IngredientId>((ingredient, ml) =>
    dispatch({ type: "pour", into: target, ingredient, ml }),
  );
  const stream = (vessel: VesselId) => (pour.activeId && target === vessel ? colorOf(pour.activeId) : null);

  const startShake = () => {
    shakeStart.current = performance.now();
    setShaking(true);
  };
  const stopShake = () => {
    if (shakeStart.current === null) return;
    dispatch({ type: "shake", ms: performance.now() - shakeStart.current });
    shakeStart.current = null;
    setShaking(false);
  };

  const takeOrder = (next: Order) => {
    pour.stopPour();
    dispatch({ type: "reset" });
    setOrder(next);
    setRecent((r) => [...r, next.recipe.name].slice(-5));
    setReport(null);
    setTarget("glass");
  };

  const nextCustomer = async () => {
    setLoadingCustomer(true);
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recent }),
      });
      if (!res.ok) throw new Error(`order failed: ${res.status}`);
      takeOrder(await res.json());
    } catch {
      takeOrder(classicOrder(recent)); // offline or server down: keep the bar moving
    } finally {
      setLoadingCustomer(false);
    }
  };

  const practiceClassic = (index: number) => {
    const r = CLASSIC_RECIPES[index];
    takeOrder({ ...order, recipe: r, line: `Could I get a ${r.name}, please?`, source: "classic" });
  };

  return (
    <main className="flex flex-1 flex-col items-center gap-6 bg-stone-950 px-4 py-8 font-sans text-stone-100">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Make a Drink</h1>
        <p className="mt-1 text-sm text-stone-400">Hold a bottle to pour. Count it: 3 seconds = 1.5 oz.</p>
      </header>

      {/* Order */}
      <Panel className="w-full max-w-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={nextCustomer}
            disabled={loadingCustomer}
            className="rounded-md bg-amber-300 px-3 py-1.5 text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-200 disabled:opacity-50"
          >
            {loadingCustomer ? "Someone's walking up…" : "Next customer"}
          </button>
          <div className="flex items-center gap-3 text-sm text-stone-400">
            <select
              aria-label="Practice a classic"
              value=""
              onChange={(e) => practiceClassic(Number(e.target.value))}
              className="max-w-36 rounded-md border border-stone-700 bg-stone-900 px-2 py-1"
            >
              <option value="" disabled>
                Practice a classic
              </option>
              {CLASSIC_RECIPES.map((r, i) => (
                <option key={r.name} value={i}>
                  {r.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={memoryMode} onChange={(e) => setMemoryMode(e.target.checked)} />
              Memory
            </label>
          </div>
        </div>

        <div className={`mt-4 transition-opacity ${loadingCustomer ? "opacity-40" : ""}`}>
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-stone-100">{order.customer.name}</span>
            <span className="text-stone-500">{order.customer.vibe}</span>
            <span className="rounded border border-emerald-700/60 px-1.5 text-[11px] text-emerald-300">
              ID checked · {order.customer.age}
            </span>
            {order.source === "classic" && <span className="text-[11px] text-stone-500">classic menu</span>}
          </p>
          <p className="mt-1 text-lg leading-snug text-stone-100">“{order.line}”</p>
        </div>

        {report ? (
          <div className="mt-4 space-y-4">
            <MeasurementReport m={report} />
          </div>
        ) : memoryMode ? (
          <p className="mt-3 text-sm text-stone-500">{recipe.name}: spec hidden. Make it from memory.</p>
        ) : (
          <div className="mt-3 text-sm">
            <p className="font-semibold text-amber-200">{recipe.name}</p>
            <p className="text-stone-300">
              {GLASSES[recipe.glass].name} glass · {recipe.technique} · {recipe.ice ? "on the rocks" : "up"} ·{" "}
              {recipe.garnish ? GARNISHES[recipe.garnish] : "no garnish"}
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono tabular-nums text-stone-400">
              {recipe.ingredients.map((i) => (
                <li key={i.id}>
                  {i.oz} oz {INGREDIENTS[i.id].name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {/* Glass shelf */}
      <section className="w-full max-w-xl">
        <div className="flex flex-wrap justify-center gap-2">
          {GLASS_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => dispatch({ type: "selectGlass", glass: id })}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                drink.glass === id
                  ? "border-amber-300 bg-amber-300/10 text-amber-200"
                  : "border-stone-700 text-stone-300 hover:border-stone-500"
              }`}
            >
              {GLASSES[id].name}
            </button>
          ))}
        </div>
        <p className="mt-2 min-h-10 text-center text-xs text-stone-500">
          {drink.glass ? GLASSES[drink.glass].why : "Pick a glass first. Each one exists for a reason."}
        </p>
      </section>

      {/* Vessels */}
      <section className="flex flex-wrap items-start justify-center gap-6">
        <VesselCard
          title={drink.glass ? `${GLASSES[drink.glass].name} glass` : "No glass"}
          targeted={target === "glass"}
          onTarget={() => setTarget("glass")}
          volume={`${oz(liquidMl(drink.inGlass))} / ${oz(capacityMl(drink, "glass"))} oz`}
          vessel={
            drink.glass ? (
              <Glass
                contents={drink.inGlass.contents}
                ice={drink.inGlass.ice}
                capacityMl={capacityMl(drink, "glass")}
                colorOf={colorOf}
                streamColor={stream("glass")}
              />
            ) : (
              <div className="h-full rounded-b-[2rem] border-2 border-dashed border-stone-700" />
            )
          }
        >
          <button type="button" className={btn} onClick={() => dispatch({ type: "addIce", into: "glass", cubes: ICE_SCOOP })}>
            + Ice
          </button>
          <button type="button" className={btn} onClick={() => dispatch({ type: "dump", vessel: "glass" })}>
            Dump
          </button>
        </VesselCard>

        <VesselCard
          title="Shaker tin"
          targeted={target === "shaker"}
          onTarget={() => setTarget("shaker")}
          volume={`${oz(liquidMl(drink.inShaker))} oz · ${(drink.shakerMix.shakeMs / 1000).toFixed(1)}s shaken · ${drink.shakerMix.stirTurns} stirs`}
          shaking={shaking}
          vessel={
            <Glass
              contents={drink.inShaker.contents}
              ice={drink.inShaker.ice}
              capacityMl={capacityMl(drink, "shaker")}
              colorOf={colorOf}
              streamColor={stream("shaker")}
            />
          }
        >
          <button type="button" className={btn} onClick={() => dispatch({ type: "addIce", into: "shaker", cubes: ICE_SCOOP })}>
            + Ice
          </button>
          <HoldButton label="Hold to shake" held={shaking} onStart={startShake} onStop={stopShake} className={btn}>
            Hold: shake
          </HoldButton>
          <button type="button" className={btn} onClick={() => dispatch({ type: "stir", turns: STIR_STEP })}>
            Stir +{STIR_STEP}
          </button>
          <button type="button" className={btn} onClick={() => dispatch({ type: "strain" })}>
            Strain → glass
          </button>
          <button type="button" className={btn} onClick={() => dispatch({ type: "dump", vessel: "shaker" })}>
            Dump
          </button>
        </VesselCard>
      </section>

      {/* Bottles */}
      <section className="flex max-w-2xl flex-wrap items-end justify-center gap-3">
        {INGREDIENT_IDS.map((id) => (
          <Bottle
            key={id}
            name={INGREDIENTS[id].name}
            color={INGREDIENTS[id].color}
            pouring={pour.activeId === id}
            onStart={() => pour.startPour(id)}
            onStop={pour.stopPour}
          />
        ))}
      </section>
      <p className="font-mono text-sm tabular-nums text-stone-400">
        {pour.activeId ? "Pouring" : "Last pour"}: {oz(pour.currentPourMl)} oz
        {drink.spilledMl > 0 && <span className="text-red-400"> · spilled {oz(drink.spilledMl)} oz</span>}
      </p>

      {/* Garnish + serve */}
      <section className="flex flex-wrap items-center justify-center gap-2">
        {(Object.keys(GARNISHES) as GarnishId[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => dispatch({ type: "garnish", garnish: g })}
            className={`${btn} ${drink.garnish === g ? "border-amber-300 text-amber-200" : ""}`}
          >
            {GARNISHES[g]}
          </button>
        ))}
        <button
          type="button"
          disabled={!!report}
          onClick={() => setReport(measureDrink(drink, recipe))}
          className="rounded-md bg-amber-300 px-4 py-1.5 font-semibold text-stone-950 transition-opacity hover:bg-amber-200 disabled:opacity-40"
        >
          Serve
        </button>
      </section>
    </main>
  );
}

const btn =
  "rounded-md border border-stone-700 px-2.5 py-1 text-sm text-stone-300 transition-colors hover:border-stone-500 hover:text-white";

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-xl border border-stone-800 bg-stone-900/60 p-4 ${className ?? ""}`}>{children}</section>;
}

type VesselCardProps = {
  title: string;
  targeted: boolean;
  onTarget: () => void;
  volume: string;
  vessel: ReactNode;
  shaking?: boolean;
  children: ReactNode;
};

function VesselCard({ title, targeted, onTarget, volume, vessel, shaking, children }: VesselCardProps) {
  return (
    <div className="flex w-40 flex-col items-center gap-2">
      <button
        type="button"
        onClick={onTarget}
        aria-pressed={targeted}
        className={`w-full rounded-lg border px-2 py-1 text-sm transition-colors ${
          targeted ? "border-amber-300 text-amber-200" : "border-stone-800 text-stone-400 hover:border-stone-600"
        }`}
      >
        {targeted ? `Pouring into: ${title}` : `Pour into ${title}`}
      </button>
      <div className={`mt-16 h-40 w-28 ${shaking ? "animate-shake" : ""}`}>{vessel}</div>
      <p className="text-center font-mono text-[11px] tabular-nums text-stone-400">{volume}</p>
      <div className="flex flex-wrap justify-center gap-1.5">{children}</div>
    </div>
  );
}
