"use client";

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import Bottle from "@/components/Bottle";
import Glass from "@/components/Glass";
import HoldButton from "@/components/HoldButton";
import PourGauge, { type AssistLevel } from "@/components/PourGauge";
import CustomerPanel from "@/components/sidebar/CustomerPanel";
import GradeCard from "@/components/sidebar/GradeCard";
import LiveReadout from "@/components/sidebar/LiveReadout";
import OrderTicket from "@/components/sidebar/OrderTicket";
import ShiftBar from "@/components/sidebar/ShiftBar";
import ShiftSummary from "@/components/sidebar/ShiftSummary";
import { INITIAL_DRINK, capacityMl, drinkReducer, liquidMl, type VesselId } from "@/game/drink";
import { GLASSES, GLASS_IDS } from "@/game/glassware";
import { fallbackGrade, type Grade } from "@/game/grade";
import { GARNISHES, INGREDIENTS, INGREDIENT_IDS, type GarnishId, type IngredientId } from "@/game/ingredients";
import { measureDrink, type Measurement } from "@/game/measure";
import { classicOrder, type Order } from "@/game/order";
import { CLASSIC_RECIPES } from "@/game/recipes";
import { scoreDrink, type Score } from "@/game/score";
import { newShift, parSeconds, recordServe, shiftOver, shiftTips, type Shift, type Tip } from "@/game/shift";
import { usePourController } from "@/hooks/usePourController";
import { ML_PER_OZ, mlToOz } from "@/lib/pour";

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

// Never rejects: if the grader is unreachable, the rubric's own grade is used.
async function fetchGrade(order: Order, measurement: Measurement): Promise<Grade> {
  try {
    const res = await fetch("/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order, measurement }),
    });
    if (!res.ok) throw new Error(`grade failed: ${res.status}`);
    return (await res.json()).grade;
  } catch {
    return fallbackGrade(scoreDrink(measurement));
  }
}

type Served = { measurement: Measurement; score: Score; grade: Grade | null; tip: Tip | null };

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
  const [served, setServed] = useState<Served | null>(null);
  const [shift, setShift] = useState<Shift>(() => newShift());
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Service clock: starts when the customer arrives, stops at Serve.
  const [arrivedAt, setArrivedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [shaking, setShaking] = useState(false);
  // A ref, not state: pointerup and lostpointercapture fire back to back and must not both count.
  const shakeStart = useRef<number | null>(null);

  const recipe = order.recipe;
  const pour = usePourController<IngredientId>((ingredient, ml) =>
    dispatch({ type: "pour", into: target, ingredient, ml }),
  );
  const stream = (vessel: VesselId) => (pour.activeId && target === vessel ? colorOf(pour.activeId) : null);
  const glassName = drink.glass ? `${GLASSES[drink.glass].name} glass` : "no glass";

  // Pouring with no glass used to spill straight onto the bar; now the bottle
  // refuses and the empty spot says why. Goes away with drag-to-pour in 3D.
  const [nudge, setNudge] = useState(false);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPouring = (id: IngredientId) => {
    if (target === "glass" && !drink.glass) {
      setNudge(true);
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
      nudgeTimer.current = setTimeout(() => setNudge(false), 2500);
      return;
    }
    pour.startPour(id);
  };

  // Pour assist: only for the vessel being poured into, and only while pouring.
  const [assist, setAssist] = useState<AssistLevel>("learn");
  const vesselOf = (v: VesselId) => (v === "glass" ? drink.inGlass : drink.inShaker);
  const recipeOz = (id: IngredientId) => recipe.ingredients.find((i) => i.id === id)?.oz ?? null;
  const gaugeFor = (v: VesselId) => {
    if (!pour.activeId || target !== v) return null;
    const inVessel = vesselOf(v).contents[pour.activeId] ?? 0;
    return <PourGauge level={assist} oz={mlToOz(inVessel)} targetOz={recipeOz(pour.activeId)} />;
  };
  // Where the liquid should stand once this ingredient reaches its recipe amount.
  const targetLineMl = (v: VesselId) => {
    if (assist !== "learn" || !pour.activeId || target !== v) return null;
    const wantOz = recipeOz(pour.activeId);
    if (wantOz === null) return null;
    const vessel = vesselOf(v);
    return liquidMl(vessel) - (vessel.contents[pour.activeId] ?? 0) + wantOz * ML_PER_OZ;
  };

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
    pour.reset();
    dispatch({ type: "reset" });
    setOrder(next);
    setArrival((n) => n + 1);
    const nextRecent = [...recent, next.recipe.name].slice(-5);
    setRecent(nextRecent);
    setServed(null);
    setTarget("glass");
    setArrivedAt(Date.now());
    setNow(Date.now());
    upcoming.current = fetchOrder(nextRecent);
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
    pour.stopPour();
    const measurement = measureDrink(drink, recipe);
    const servedSeconds = arrivedAt ? (Date.now() - arrivedAt) / 1000 : 0;
    setNow(Date.now());
    setServed({ measurement, score: scoreDrink(measurement), grade: null, tip: null });

    const grade = await fetchGrade(order, measurement);
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
                onStart={() => startPouring(id)}
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
            gauge={gaugeFor("glass")}
            vessel={
              drink.glass ? (
                <Glass
                  contents={drink.inGlass.contents}
                  ice={drink.inGlass.ice}
                  capacityMl={capacityMl(drink, "glass")}
                  colorOf={colorOf}
                  streamColor={stream("glass")}
                  targetMl={targetLineMl("glass")}
                />
              ) : (
                <div
                  className={`grid h-full place-items-center rounded-b-[2rem] border-2 border-dashed px-2 text-center text-xs transition-colors ${
                    nudge ? "animate-shake border-red-400 text-red-300" : "border-stone-700 text-stone-500"
                  }`}
                >
                  {nudge ? "Pick a glass first, or pour into the tin" : "Pick a glass below"}
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
            gauge={gaugeFor("shaker")}
            vessel={
              <Glass
                contents={drink.inShaker.contents}
                ice={drink.inShaker.ice}
                capacityMl={capacityMl(drink, "shaker")}
                colorOf={colorOf}
                streamColor={stream("shaker")}
                targetMl={targetLineMl("shaker")}
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
          <ShiftSummary shift={shift} onNextShift={startNextShift} />
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
                  targetName={target === "glass" ? glassName : "shaker tin"}
                  currentPourOz={mlToOz(pour.currentPourMl)}
                  glassOz={mlToOz(liquidMl(drink.inGlass))}
                  glassCapacityOz={mlToOz(capacityMl(drink, "glass"))}
                  shakerOz={mlToOz(liquidMl(drink.inShaker))}
                  shakeSeconds={drink.shakerMix.shakeMs / 1000}
                  stirTurns={drink.shakerMix.stirTurns}
                  spilledOz={mlToOz(drink.spilledMl)}
                />
                <PrimaryButton onClick={serveDrink}>Serve</PrimaryButton>
              </>
            )}

            <OrderTicket recipe={recipe} ticketNo={arrival} hidden={memoryMode && !served} />
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

type VesselCardProps = {
  title: string;
  targeted: boolean;
  onTarget: () => void;
  volume: string;
  vessel: ReactNode;
  gauge?: ReactNode;
  shaking?: boolean;
  children: ReactNode;
};

function VesselCard({ title, targeted, onTarget, volume, vessel, gauge, shaking, children }: VesselCardProps) {
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
      <div
        className={`relative mt-12 h-36 w-28 transition-[filter] duration-200 ${shaking ? "animate-shake" : ""} ${
          targeted ? "drop-shadow-[0_0_14px_rgba(252,211,77,0.45)]" : "opacity-80"
        }`}
      >
        {vessel}
        {gauge}
      </div>
      <p className="font-mono text-[11px] tabular-nums text-stone-400">{volume}</p>
      <div className="flex flex-wrap justify-center gap-1.5">{children}</div>
    </div>
  );
}
