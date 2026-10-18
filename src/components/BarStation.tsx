"use client";

import dynamic from "next/dynamic";
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import PourGauge, { type AssistLevel } from "@/components/PourGauge";
import CustomerPanel from "@/components/sidebar/CustomerPanel";
import GradeCard from "@/components/sidebar/GradeCard";
import LiveReadout from "@/components/sidebar/LiveReadout";
import OrderTicket from "@/components/sidebar/OrderTicket";
import ShiftBar from "@/components/sidebar/ShiftBar";
import ShiftSummary from "@/components/sidebar/ShiftSummary";
import { ICE_CUBE_ML, INITIAL_DRINK, capacityMl, drinkReducer, liquidMl, type VesselId } from "@/game/drink";
import { GLASSES } from "@/game/glassware";
import { fallbackGrade, type Grade } from "@/game/grade";
import { INGREDIENTS, type IngredientId } from "@/game/ingredients";
import { measureDrink, type Measurement } from "@/game/measure";
import { classicOrder, type Order } from "@/game/order";
import { CLASSIC_RECIPES } from "@/game/recipes";
import { scoreDrink, type Score } from "@/game/score";
import { newShift, parSeconds, recordServe, shiftOver, shiftTips, type Shift, type Tip } from "@/game/shift";
import { usePourController } from "@/hooks/usePourController";
import { useTraineeMemory } from "@/hooks/useTraineeMemory";
import { ML_PER_OZ, mlToOz } from "@/lib/pour";

const STIR_STEP = 5;

// WebGL only exists in the browser, so the 3D bar never renders on the server.
const BarScene = dynamic(() => import("@/components/bar3d/BarScene"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-stone-500">Setting up the bar…</div>,
});

// Fixed (no randomness) so server and client render the same first order.
const FIRST_ORDER = classicOrder([], () => 0);

// Never rejects: offline or server errors fall back to the classic menu.
async function fetchOrder(recent: string[], assistantId: string | null): Promise<Order> {
  try {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recent, assistantId }),
    });
    if (!res.ok) throw new Error(`order failed: ${res.status}`);
    return await res.json();
  } catch {
    return classicOrder(recent);
  }
}

// Never rejects: if the grader is unreachable, the rubric's own grade is used.
async function fetchGrade(order: Order, measurement: Measurement, assistantId: string | null): Promise<Grade> {
  try {
    const res = await fetch("/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order, measurement, assistantId }),
    });
    if (!res.ok) throw new Error(`grade failed: ${res.status}`);
    return (await res.json()).grade;
  } catch {
    return fallbackGrade(scoreDrink(measurement));
  }
}

type Served = { measurement: Measurement; score: Score; grade: Grade | null; tip: Tip | null };

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
  const [served, setServed] = useState<Served | null>(null);
  const [shift, setShift] = useState<Shift>(() => newShift());
  const [summaryOpen, setSummaryOpen] = useState(false);
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
  const [assist, setAssist] = useState<AssistLevel>("learn");
  const gaugeAnchor = useRef<HTMLDivElement>(null);
  const vesselOf = (v: VesselId) => (v === "glass" ? drink.inGlass : drink.inShaker);
  const recipeOz = (id: IngredientId) => recipe.ingredients.find((i) => i.id === id)?.oz ?? null;
  // Fill level (as the scene draws it) once this ingredient reaches its recipe amount.
  const targetFill = (v: VesselId) => {
    if (assist !== "learn" || !pour.activeId || pouringInto !== v) return null;
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
    upcoming.current = fetchOrder([FIRST_ORDER.recipe.name], memoryId);
  }, [arrival, memoryId]);

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
    upcoming.current = fetchOrder(nextRecent, memoryId);
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
    const measurement = measureDrink(drink, recipe);
    const servedSeconds = arrivedAt ? (Date.now() - arrivedAt) / 1000 : 0;
    setNow(Date.now());
    setServed({ measurement, score: scoreDrink(measurement), grade: null, tip: null });

    const grade = await fetchGrade(order, measurement, memoryId);
    const nextShift = recordServe(shift, {
      drink: recipe.name,
      stars: grade.stars,
      sendBack: grade.sendBack,
      seconds: servedSeconds,
      par: parSeconds(recipe),
      measurement,
    });
    setShift(nextShift);
    setServed((s) => s && { ...s, grade, tip: nextShift.served.at(-1)!.tip });
  };

  const startNextShift = () => {
    setShift((s) => newShift(s.number + 1));
    setSummaryOpen(false);
    void nextCustomer();
  };

  const nextCustomer = async () => {
    if (shiftOver(shift) && !summaryOpen) {
      setSummaryOpen(true);
      return;
    }
    setLoadingCustomer(true);
    const next = await (upcoming.current ?? fetchOrder(recent, memoryId));
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
      {/* The bar gets all the width the sidebar doesn't need */}
      <section aria-label="Bar" className="relative h-[60vh] min-w-0 md:h-auto md:flex-1">
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
                    <PourGauge level={assist} oz={mlToOz(vesselOf(pouringInto).contents[pour.activeId] ?? 0)} targetOz={recipeOz(pour.activeId)} />
                  </div>
                )}
              </div>

              {nudge && (
                <p className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit animate-bubble-in rounded-full bg-red-500/90 px-4 py-1.5 text-sm font-semibold text-white">
                  {nudge}
                </p>
              )}

              {/* Top of the bar area, clear of the speed rail labels: how to play, the glass's purpose, and tools */}
              <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-col gap-2">
                <p className="text-center text-xs text-stone-400">
                  Bring a bottle toward the glass or tin and it tips to pour · drag glasses, ice and garnish onto the glass · cap the big tin with the small one to shake, uncap it and drop it on the glass to strain
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
                  <div className="pointer-events-auto flex gap-1.5">
                    <ToolButton onClick={() => dispatch({ type: "stir", turns: STIR_STEP })}>Stir tin +{STIR_STEP}</ToolButton>
                    <ToolButton onClick={() => dispatch({ type: "dump", vessel: "shaker" })}>Dump tin</ToolButton>
                    <ToolButton onClick={() => dispatch({ type: "dump", vessel: "glass" })}>Dump glass</ToolButton>
                  </div>
                </div>
              </div>
            </>
          }
        />
      </section>

      {/* ── Customer + order column (right 30%) ── */}
      <aside className="flex flex-col gap-4 overflow-y-auto border-stone-800 bg-stone-900 p-4 md:w-[clamp(20rem,24vw,25rem)] md:shrink-0 md:border-l">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight">Make a Drink</h1>
          <button
            type="button"
            onClick={nextCustomer}
            disabled={loadingCustomer || summaryOpen || (!!served && !served.grade)}
            className="text-xs text-stone-400 underline-offset-2 hover:text-stone-200 hover:underline disabled:opacity-40"
          >
            Skip customer
          </button>
        </header>

        <ShiftBar
          shiftNumber={shift.number}
          customer={shift.served.length + (served ? 0 : 1)}
          tips={shiftTips(shift)}
          streak={shift.streak}
          seconds={seconds}
          par={parSeconds(recipe)}
        />

        {summaryOpen ? (
          <ShiftSummary shift={shift} onNextShift={startNextShift} remembered={!!memoryId} />
        ) : (
          <>
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
                  {loadingCustomer
                    ? "Someone's walking up…"
                    : shiftOver(shift)
                      ? "End of shift"
                      : "Next customer"}
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
                  stirTurns={drink.shakerMix.stirTurns}
                  capped={drink.shakerCapped}
                  spilledOz={mlToOz(drink.spilledMl)}
                />
                <PrimaryButton onClick={serveDrink}>Serve</PrimaryButton>
              </>
            )}

            <OrderTicket recipe={recipe} ticketNo={arrival} hidden={memoryMode && !served} />
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
          </>
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
          <div className="flex w-full items-center justify-between gap-2">
            <span>Pour assist</span>
            <span className="flex overflow-hidden rounded-md border border-stone-700">
              {(["learn", "practice", "pro"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setAssist(level)}
                  aria-pressed={assist === level}
                  title={ASSIST_HELP[level]}
                  className={`px-2.5 py-1 capitalize transition-colors ${
                    assist === level ? "bg-amber-300 font-semibold text-stone-950" : "hover:bg-stone-800"
                  }`}
                >
                  {level}
                </button>
              ))}
            </span>
          </div>
        </footer>
      </aside>
    </main>
  );
}

const ASSIST_HELP: Record<AssistLevel, string> = {
  learn: "Ounces, counts and a target line at the glass",
  practice: "Counts only: one dot per second, 0.5 oz each",
  pro: "No help, like a real bar",
};

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
