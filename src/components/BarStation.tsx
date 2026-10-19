"use client";

import dynamic from "next/dynamic";
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import PourGauge from "@/components/PourGauge";
import CustomerPanel from "@/components/sidebar/CustomerPanel";
import GradeCard from "@/components/sidebar/GradeCard";
import LiveReadout from "@/components/sidebar/LiveReadout";
import OrderTicket from "@/components/sidebar/OrderTicket";
import StatsBar from "@/components/sidebar/StatsBar";
import { gradeTarget, pouredIds, rollPro } from "@/game/choice";
import { ICE_CUBE_ML, INITIAL_DRINK, capacityMl, drinkReducer, liquidMl, type VesselId } from "@/game/drink";
import { GLASSES } from "@/game/glassware";
import { fallbackGrade, type Grade } from "@/game/grade";
import { INGREDIENTS, type IngredientId } from "@/game/ingredients";
import { measureDrink, type Measurement } from "@/game/measure";
import { classicOrder, type Order } from "@/game/order";
import { CLASSIC_RECIPES, type Recipe } from "@/game/recipes";
import { scoreDrink, type Score } from "@/game/score";
import { newTab, parSeconds, recordServe, type Tab, type Tip } from "@/game/tips";
import { usePourController } from "@/hooks/usePourController";
import { useTraineeMemory } from "@/hooks/useTraineeMemory";
import { ML_PER_OZ, mlToOz } from "@/lib/pour";


// WebGL only exists in the browser, so the 3D bar never renders on the server.
const BarScene = dynamic(() => import("@/components/bar3d/BarScene"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-stone-500">Setting up the bar…</div>,
});

// Fixed (no randomness) so server and client render the same first order.
const FIRST_ORDER = classicOrder([], () => 0);

// Never rejects: offline or server errors fall back to the classic menu.
// pro: professional mode, where some customers ask for a flavor or forget their drink's name.
async function fetchOrder(recent: string[], assistantId: string | null, pro: boolean): Promise<Order> {
  try {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recent, assistantId, pro }),
    });
    if (!res.ok) throw new Error(`order failed: ${res.status}`);
    return await res.json();
  } catch {
    return classicOrder(recent, Math.random, rollPro(pro));
  }
}

// Never rejects: if the grader is unreachable, the rubric's own grade (from `score`) is used.
async function fetchGrade(order: Order, measurement: Measurement, assistantId: string | null, score: Score): Promise<Grade> {
  try {
    const res = await fetch("/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order, measurement, assistantId }),
    });
    if (!res.ok) throw new Error(`grade failed: ${res.status}`);
    return (await res.json()).grade;
  } catch {
    return fallbackGrade(score);
  }
}

// recipe: what the drink was graded against (for bartender's choice, the classic the player made).
type Served = { recipe: Recipe; measurement: Measurement; score: Score; grade: Grade | null; tip: Tip | null };

// Owns the game state and splits the screen: the 3D bar on the left, and the
// customer and order column on the right.
export default function BarStation() {
  const [drink, dispatch] = useReducer(drinkReducer, INITIAL_DRINK);
  const memoryId = useTraineeMemory(); // Backboard memory; null until ready or if switched off
  const [order, setOrder] = useState<Order>(FIRST_ORDER);
  const [arrival, setArrival] = useState(1);
  const [recent, setRecent] = useState<string[]>([FIRST_ORDER.recipe.name]);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [memoryMode, setMemoryMode] = useState(false);
  const [proMode, setProMode] = useState(false);
  const [served, setServed] = useState<Served | null>(null);
  const [tab, setTab] = useState<Tab>(newTab); // endless: drinks served, tips and streak keep adding up
  // Service clock: starts when the customer arrives, stops at Serve.
  const [arrivedAt, setArrivedAt] = useState(0);
  const [now, setNow] = useState(0);

  const recipe = order.recipe;
  // Where the bottle is aimed. A ref so the pour loop sees a new aim on the
  // very next frame, not after React re-renders.
  const pourInto = useRef<VesselId>("glass");
  const [pouringInto, setPouringInto] = useState<VesselId | null>(null);
  const pour = usePourController<IngredientId>((ingredient, ml) =>
    dispatch({ type: "pour", into: pourInto.current, ingredient, ml }),
  );
  const startPouring = (id: IngredientId, into: VesselId) => {
    pourInto.current = into;
    setPouringInto(into);
    pour.startPour(id);
  };
  const stopPouring = () => {
    pour.stopPour();
    setPouringInto(null);
  };
  const glassName = drink.glass ? `${GLASSES[drink.glass].name} glass` : "no glass";

  // Short hints over the bar ("Drag a glass onto the mat first").
  const [nudge, setNudge] = useState<string | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNudge = (message: string) => {
    setNudge(message);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudge(null), 2500);
  };

  // Pour assist: only for the vessel being poured into, and only while pouring.
  const gaugeAnchor = useRef<HTMLDivElement>(null);
  const vesselOf = (v: VesselId) => (v === "glass" ? drink.inGlass : drink.inShaker);
  // No target amounts when the drink is hidden (bartender's choice, forgot the name): they'd give it away.
  const recipeOz = (id: IngredientId) =>
    order.choice || order.mystery ? null : (recipe.ingredients.find((i) => i.id === id)?.oz ?? null);
  // Fill level (as the scene draws it) once this ingredient reaches its recipe amount.
  const targetFill = (v: VesselId) => {
    if (!pour.activeId || pouringInto !== v) return null;
    const wantOz = recipeOz(pour.activeId);
    const capacity = capacityMl(drink, v);
    if (wantOz === null || capacity === 0) return null;
    const vessel = vesselOf(v);
    const liquid = liquidMl(vessel) - (vessel.contents[pour.activeId] ?? 0) + wantOz * ML_PER_OZ;
    return (liquid + Math.min(vessel.ice * ICE_CUBE_ML, liquid)) / capacity;
  };

  // The next customer is fetched while you make the current drink, so Gemini's
  // 2-20 s latency is hidden behind gameplay instead of a loading screen.
  const upcoming = useRef<Promise<Order> | null>(null);
  // The first prefetch starts before the memory id has loaded. If it arrives
  // while we're still on the first customer, fetch that next one again with
  // memory, so it's already targeted at the player's weak spots.
  const prefetchedWith = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (arrival !== 1 || prefetchedWith.current === memoryId) return;
    prefetchedWith.current = memoryId;
    upcoming.current = fetchOrder([FIRST_ORDER.recipe.name], memoryId, proMode);
  }, [arrival, memoryId, proMode]);

  const takeOrder = (next: Order) => {
    pour.reset();
    dispatch({ type: "reset" });
    setOrder(next);
    setArrival((n) => n + 1);
    const nextRecent = [...recent, next.recipe.name].slice(-5);
    setRecent(nextRecent);
    setServed(null);
    setPouringInto(null);
    setArrivedAt(Date.now());
    setNow(Date.now());
    upcoming.current = fetchOrder(nextRecent, memoryId, proMode);
  };

  // Tick the service clock once a second until the drink is served.
  useEffect(() => {
    if (served) return;
    const id = setInterval(() => {
      const t = Date.now();
      setArrivedAt((a) => a || t); // the first customer is on screen before the clock exists
      setNow(t);
    }, 1000);
    return () => clearInterval(id);
  }, [served]);
  const seconds = arrivedAt ? Math.max(0, (now - arrivedAt) / 1000) : 0;

  const serveDrink = async () => {
    stopPouring();
    // Bartender's choice: grade against the classic the player actually made.
    const target = gradeTarget(order, pouredIds(drink.inGlass.contents));
    const measurement = measureDrink(drink, target.recipe);
    const score = scoreDrink(measurement, target.choice);
    const servedSeconds = arrivedAt ? (Date.now() - arrivedAt) / 1000 : 0;
    setNow(Date.now());
    setServed({ recipe: target.recipe, measurement, score, grade: null, tip: null });

    const grade = await fetchGrade(order, measurement, memoryId, score);
    const { tab: nextTab, tip } = recordServe(tab, {
      stars: grade.stars,
      sendBack: grade.sendBack,
      seconds: servedSeconds,
      par: parSeconds(target.recipe),
    });
    setTab(nextTab);
    setServed((s) => s && { ...s, grade, tip });
  };

  const nextCustomer = async () => {
    setLoadingCustomer(true);
    const next = await (upcoming.current ?? fetchOrder(recent, memoryId, proMode));
    setLoadingCustomer(false);
    takeOrder(next);
  };

  const practiceClassic = (index: number) => {
    const r = CLASSIC_RECIPES[index];
    takeOrder({ ...order, recipe: r, line: `Could I get a ${r.name}, please?`, source: "classic", special: [], choice: undefined });
  };

  return (
    <main className="flex flex-1 flex-col bg-stone-950 font-sans text-stone-100 md:h-dvh md:flex-row">
      {/* ── Bar (left 70%) ── */}
      {/* The bar gets all the width the sidebar doesn't need */}
      <section aria-label="Bar" className="flex h-[60vh] min-w-0 flex-col md:h-auto md:flex-1">
        {/* How to play, the glass's purpose, and tools: a strip above the 3D view, never over it */}
        <div className="flex flex-col gap-2 bg-[#140e0a] px-3 pt-3 pb-1">
          <p className="text-center text-xs text-stone-400">
            Bring a bottle toward the glass or tin and it tips to pour · drag glasses, ice and garnish onto the glass · cap the big tin with the small one to shake, or circle the bar spoon in the open tin to stir · drop the open tin on the glass to strain
          </p>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="max-w-md text-xs text-stone-400">
              {drink.glass ? (
                <>
                  <span className="font-semibold text-stone-200">{GLASSES[drink.glass].name}:</span> {GLASSES[drink.glass].why}
                </>
              ) : (
                "Each glass exists for a reason. Drag the one this drink needs onto the mat."
              )}
            </p>
            <div className="flex gap-1.5">
              <ToolButton onClick={() => dispatch({ type: "dump", vessel: "shaker" })}>Dump tin</ToolButton>
              <ToolButton onClick={() => dispatch({ type: "dump", vessel: "glass" })}>Dump glass</ToolButton>
            </div>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          <BarScene
            drink={drink}
            pouringId={pour.activeId}
            pouringInto={pouringInto}
            targetFill={{ glass: targetFill("glass"), shaker: targetFill("shaker") }}
            onPour={startPouring}
            onPourStop={stopPouring}
            onAction={dispatch}
            onNudge={showNudge}
            gaugeAnchor={gaugeAnchor}
            overlay={
              <>
                {/* Pinned beside the vessel being poured into by the scene, every frame. */}
                <div ref={gaugeAnchor} className="pointer-events-none absolute left-0 top-0">
                  {pour.activeId && pouringInto && (
                    <div className="relative -translate-y-1/2">
                      <PourGauge oz={mlToOz(vesselOf(pouringInto).contents[pour.activeId] ?? 0)} targetOz={recipeOz(pour.activeId)} />
                    </div>
                  )}
                </div>

                {nudge && (
                  <p className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit animate-bubble-in rounded-full bg-red-500/90 px-4 py-1.5 text-sm font-semibold text-white">
                    {nudge}
                  </p>
                )}

              </>
            }
          />
        </div>
      </section>

      {/* ── Customer + order column (right 30%) ── */}
      <aside className="flex flex-col gap-4 overflow-y-auto border-stone-800 bg-stone-900 p-4 md:w-[clamp(20rem,24vw,25rem)] md:shrink-0 md:border-l">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight">Make a Drink</h1>
          <button
            type="button"
            onClick={nextCustomer}
            disabled={loadingCustomer || (!!served && !served.grade)}
            className="text-xs text-stone-400 underline-offset-2 hover:text-stone-200 hover:underline disabled:opacity-40"
          >
            Skip customer
          </button>
        </header>

        <StatsBar
          served={tab.served}
          tips={tab.tips}
          streak={tab.streak}
          seconds={seconds}
          par={parSeconds(recipe)}
        />

          <CustomerPanel order={order} arrival={arrival} loading={loadingCustomer} reaction={served?.grade?.reaction} />
          {loadingCustomer && <p className="-mt-2 text-sm text-amber-200">Someone&apos;s walking up…</p>}

          {served ? (
            <>
              <GradeCard
                customerName={order.customer.name}
                measurement={served.measurement}
                score={served.score}
                grade={served.grade}
                tip={served.tip}
              />
              <PrimaryButton onClick={nextCustomer} disabled={loadingCustomer || !served.grade}>
                {loadingCustomer ? "Someone's walking up…" : "Next customer"}
              </PrimaryButton>
            </>
          ) : (
            <>
              <LiveReadout
                pouringName={pour.activeId ? INGREDIENTS[pour.activeId].name : null}
                targetName={pouringInto === "shaker" ? "shaker tin" : glassName}
                currentPourOz={mlToOz(pour.currentPourMl)}
                glassOz={mlToOz(liquidMl(drink.inGlass))}
                glassCapacityOz={mlToOz(capacityMl(drink, "glass"))}
                shakerOz={mlToOz(liquidMl(drink.inShaker))}
                shakeSeconds={drink.shakerMix.shakeMs / 1000}
                stirSeconds={drink.shakerMix.stirMs / 1000}
                capped={drink.shakerCapped}
                spilledOz={mlToOz(drink.spilledMl)}
              />
              <PrimaryButton onClick={serveDrink}>Serve</PrimaryButton>
            </>
          )}

          <OrderTicket
            recipe={served?.recipe ?? recipe}
            special={order.special ?? []}
            choice={order.choice}
            mystery={order.mystery}
            ticketNo={arrival}
            hidden={(memoryMode || !!order.choice || !!order.mystery) && !served}
          />
          {order.targeting && order.targeting.length > 0 && (
            <section className="rounded-xl border border-sky-800/60 bg-sky-950/40 p-3 text-sm">
              <p className="text-[11px] uppercase tracking-widest text-sky-300">Targeting your weak spots</p>
              <p className="mt-0.5 text-xs text-stone-400">This order was picked from your Backboard practice memory:</p>
              <ul className="mt-1.5 space-y-0.5 text-stone-200">
                {order.targeting.map((t) => (
                  <li key={t}>· {t}</li>
                ))}
              </ul>
            </section>
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
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={proMode}
              onChange={(e) => {
                setProMode(e.target.checked);
                // The next customer was already fetched under the old setting.
                upcoming.current = fetchOrder(recent, memoryId, e.target.checked);
              }}
            />
            Professional mode
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
