"use client";

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import Bottle from "@/components/Bottle";
import Glass from "@/components/Glass";
import HoldButton from "@/components/HoldButton";
import MeasurementReport from "@/components/MeasurementReport";
import CustomerPanel from "@/components/sidebar/CustomerPanel";
import LiveReadout from "@/components/sidebar/LiveReadout";
import OrderTicket from "@/components/sidebar/OrderTicket";
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

// Never rejects: offline or server errors fall back to the classic menu.
async function fetchOrder(recent: string[]): Promise<Order> {
  try {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recent }),
    });
    if (!res.ok) throw new Error(`order failed: ${res.status}`);
    return await res.json();
  } catch {
    return classicOrder(recent);
  }
}

// Owns the game state and splits the screen: the bar on the left (2D placeholder
// for the 3D scene), and the customer and order column on the right.
export default function BarStation() {
  const [drink, dispatch] = useReducer(drinkReducer, INITIAL_DRINK);
  const [target, setTarget] = useState<VesselId>("glass");
  const [order, setOrder] = useState<Order>(FIRST_ORDER);
  const [arrival, setArrival] = useState(1);
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
  const glassName = drink.glass ? `${GLASSES[drink.glass].name} glass` : "no glass";

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

  // The next customer is fetched while you make the current drink, so Gemini's
  // 2-20 s latency is hidden behind gameplay instead of a loading screen.
  const upcoming = useRef<Promise<Order> | null>(null);
  useEffect(() => {
    upcoming.current ??= fetchOrder([FIRST_ORDER.recipe.name]);
  }, []);

  const takeOrder = (next: Order) => {
    pour.stopPour();
    dispatch({ type: "reset" });
    setOrder(next);
    setArrival((n) => n + 1);
    const nextRecent = [...recent, next.recipe.name].slice(-5);
    setRecent(nextRecent);
    setReport(null);
    setTarget("glass");
    upcoming.current = fetchOrder(nextRecent);
  };

  const nextCustomer = async () => {
    setLoadingCustomer(true);
    const next = await (upcoming.current ?? fetchOrder(recent));
    setLoadingCustomer(false);
    takeOrder(next);
  };

  const practiceClassic = (index: number) => {
    const r = CLASSIC_RECIPES[index];
    takeOrder({ ...order, recipe: r, line: `Could I get a ${r.name}, please?`, source: "classic" });
  };

  return (
    <main className="flex flex-1 flex-col bg-stone-950 font-sans text-stone-100 md:h-dvh md:flex-row">
      {/* ── Bar (left 70%) ── */}
      <section
        aria-label="Bar"
        className="flex flex-col gap-4 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#2a2018,#0c0a09_70%)] p-4 md:w-[70%]"
      >
        {/* Back bar */}
        <div>
          <div className="flex flex-wrap items-end justify-center gap-x-2 gap-y-4">
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
          </div>
          <div className="mt-1 h-2 rounded-full bg-gradient-to-b from-amber-900 to-amber-950 shadow-md shadow-black/60" />
          <p className="mt-2 text-center text-xs text-stone-500">Hold a bottle to pour. Count it: 3 seconds = 1.5 oz.</p>
        </div>

        {/* Working area */}
        <div className="flex flex-1 flex-wrap items-start justify-center gap-10">
          <VesselCard
            title={glassName}
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
                <div className="grid h-full place-items-center rounded-b-[2rem] border-2 border-dashed border-stone-700 px-2 text-center text-xs text-stone-500">
                  Pick a glass below
                </div>
              )
            }
          >
            <ToolButton onClick={() => dispatch({ type: "addIce", into: "glass", cubes: ICE_SCOOP })}>+ Ice</ToolButton>
            <ToolButton onClick={() => dispatch({ type: "dump", vessel: "glass" })}>Dump</ToolButton>
          </VesselCard>

          <VesselCard
            title="shaker tin"
            targeted={target === "shaker"}
            onTarget={() => setTarget("shaker")}
            volume={`${oz(liquidMl(drink.inShaker))} oz`}
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
            <ToolButton onClick={() => dispatch({ type: "addIce", into: "shaker", cubes: ICE_SCOOP })}>+ Ice</ToolButton>
            <HoldButton label="Hold to shake" held={shaking} onStart={startShake} onStop={stopShake} className={toolBtn}>
              Hold: shake
            </HoldButton>
            <ToolButton onClick={() => dispatch({ type: "stir", turns: STIR_STEP })}>Stir +{STIR_STEP}</ToolButton>
            <ToolButton onClick={() => dispatch({ type: "strain" })}>Strain → glass</ToolButton>
            <ToolButton onClick={() => dispatch({ type: "dump", vessel: "shaker" })}>Dump</ToolButton>
          </VesselCard>
        </div>

        {/* Bar rail: glasses and garnish tray */}
        <div className="rounded-xl border border-stone-800 bg-stone-900/70 p-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs uppercase tracking-widest text-stone-500">Glasses</span>
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
          <p className="mt-1 min-h-8 text-center text-xs text-stone-500">
            {drink.glass ? GLASSES[drink.glass].why : "Each glass exists for a reason. Pick the one this drink needs."}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs uppercase tracking-widest text-stone-500">Garnish</span>
            {(Object.keys(GARNISHES) as GarnishId[]).map((g) => (
              <ToolButton key={g} active={drink.garnish === g} onClick={() => dispatch({ type: "garnish", garnish: g })}>
                {GARNISHES[g]}
              </ToolButton>
            ))}
          </div>
        </div>
      </section>

      {/* ── Customer + order column (right 30%) ── */}
      <aside className="flex flex-col gap-4 overflow-y-auto border-stone-800 bg-stone-900 p-4 md:w-[30%] md:min-w-80 md:border-l">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight">Make a Drink</h1>
          <button
            type="button"
            onClick={nextCustomer}
            disabled={loadingCustomer}
            className="text-xs text-stone-400 underline-offset-2 hover:text-stone-200 hover:underline disabled:opacity-40"
          >
            Skip customer
          </button>
        </header>

        <CustomerPanel order={order} arrival={arrival} loading={loadingCustomer} />
        {loadingCustomer && <p className="-mt-2 text-sm text-amber-200">Someone&apos;s walking up…</p>}

        <OrderTicket recipe={recipe} ticketNo={arrival} hidden={memoryMode && !report} />

        <LiveReadout
          pouringName={pour.activeId ? INGREDIENTS[pour.activeId].name : null}
          targetName={target === "glass" ? glassName : "shaker tin"}
          currentPourOz={mlToOz(pour.currentPourMl)}
          glassOz={mlToOz(liquidMl(drink.inGlass))}
          glassCapacityOz={mlToOz(capacityMl(drink, "glass"))}
          shakerOz={mlToOz(liquidMl(drink.inShaker))}
          shakeSeconds={drink.shakerMix.shakeMs / 1000}
          stirTurns={drink.shakerMix.stirTurns}
          spilledOz={mlToOz(drink.spilledMl)}
        />

        {report ? (
          <section className="space-y-3 rounded-xl border border-stone-800 bg-stone-950/60 p-3">
            <MeasurementReport m={report} />
            <PrimaryButton onClick={nextCustomer} disabled={loadingCustomer}>
              {loadingCustomer ? "Someone's walking up…" : "Next customer"}
            </PrimaryButton>
          </section>
        ) : (
          <PrimaryButton onClick={() => setReport(measureDrink(drink, recipe))}>Serve</PrimaryButton>
        )}

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-stone-800 pt-3 text-sm text-stone-400">
          <select
            aria-label="Practice a classic"
            value=""
            onChange={(e) => practiceClassic(Number(e.target.value))}
            className="rounded-md border border-stone-700 bg-stone-900 px-2 py-1"
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
            Memory mode
          </label>
        </footer>
      </aside>
    </main>
  );
}

const toolBtn =
  "rounded-md border border-stone-700 bg-stone-900/80 px-2.5 py-1 text-sm text-stone-300 transition-colors hover:border-stone-500 hover:text-white";

function ToolButton({ onClick, active, children }: { onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`${toolBtn} ${active ? "border-amber-300 text-amber-200" : ""}`}>
      {children}
    </button>
  );
}

function PrimaryButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-lg bg-amber-300 py-2.5 font-semibold text-stone-950 transition-colors hover:bg-amber-200 disabled:opacity-50"
    >
      {children}
    </button>
  );
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
    <div className="flex w-56 flex-col items-center gap-2">
      <button
        type="button"
        onClick={onTarget}
        aria-pressed={targeted}
        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
          targeted ? "border-amber-300 bg-amber-300/10 text-amber-200" : "border-stone-700 text-stone-400 hover:border-stone-500"
        }`}
      >
        {targeted ? `▼ Pouring into ${title}` : `Pour into ${title}`}
      </button>
      <div className={`mt-12 h-36 w-28 ${shaking ? "animate-shake" : ""}`}>{vessel}</div>
      <p className="font-mono text-[11px] tabular-nums text-stone-400">{volume}</p>
      <div className="flex flex-wrap justify-center gap-1.5">{children}</div>
    </div>
  );
}
