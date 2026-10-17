import { INGREDIENTS, type IngredientId } from "./ingredients.ts";
import type { Measurement } from "./measure.ts";
import type { Recipe } from "./recipes.ts";
import type { Stars } from "./score.ts";

export const SHIFT_LENGTH = 5;
export const TIP_BY_STARS = [0, 0, 1, 3, 5, 8] as const; // dollars, indexed by stars
export const STREAK_START = 3; // the streak bonus starts on the 3rd 4-star-or-better drink in a row
export const STREAK_BONUS = 2;
export const SPEED_BONUS = 2; // served at or under par with at least 3 stars
const NOTICEABLE_OZ = 0.125;

// Seconds a working bartender would take: base, per ingredient, mixing, garnish.
export const parSeconds = (r: Recipe) =>
  30 + 10 * r.ingredients.length + (r.technique === "build" ? 0 : 20) + (r.garnish ? 5 : 0);

export type Tip = { base: number; streak: number; speed: number; total: number };

export type Served = {
  drink: string;
  stars: Stars;
  sendBack: boolean;
  seconds: number;
  par: number;
  tip: Tip;
  pourErrors: { id: IngredientId; errorOz: number }[]; // poured, but a noticeable amount off
  leftOut: number; // recipe ingredients never poured: a memory slip, not a pour habit
};

export type Shift = { number: number; served: Served[]; streak: number; bestStreak: number };

export const newShift = (number = 1): Shift => ({ number, served: [], streak: 0, bestStreak: 0 });

type ServeInput = { drink: string; stars: Stars; sendBack: boolean; seconds: number; par: number; measurement: Measurement };

export function recordServe(shift: Shift, s: ServeInput): Shift {
  const kept = !s.sendBack;
  const streak = kept && s.stars >= 4 ? shift.streak + 1 : 0;
  const base = kept ? TIP_BY_STARS[s.stars] : 0;
  const streakBonus = streak >= STREAK_START ? STREAK_BONUS : 0;
  const speed = kept && s.stars >= 3 && s.seconds <= s.par ? SPEED_BONUS : 0;
  const inRecipe = s.measurement.ingredients.filter((i) => i.expectedOz > 0);
  const pourErrors = inRecipe
    .filter((i) => i.actualOz > 0 && Math.abs(i.errorOz) >= NOTICEABLE_OZ)
    .map(({ id, errorOz }) => ({ id, errorOz }));
  const leftOut = inRecipe.filter((i) => i.actualOz === 0).length;

  return {
    ...shift,
    streak,
    bestStreak: Math.max(shift.bestStreak, streak),
    served: [
      ...shift.served,
      {
        drink: s.drink,
        stars: s.stars,
        sendBack: s.sendBack,
        seconds: s.seconds,
        par: s.par,
        tip: { base, streak: streakBonus, speed, total: base + streakBonus + speed },
        pourErrors,
        leftOut,
      },
    ],
  };
}

export const shiftTips = (shift: Shift) => shift.served.reduce((sum, s) => sum + s.tip.total, 0);
export const shiftOver = (shift: Shift) => shift.served.length >= SHIFT_LENGTH;

export type ShiftSummary = {
  tips: number;
  avgStars: number;
  bestStreak: number;
  sentBack: number;
  underPar: number;
  focus: string | null; // the pour habit to work on next
};

export function summarize(shift: Shift): ShiftSummary {
  const n = shift.served.length;
  const byIngredient = new Map<IngredientId, { sum: number; count: number }>();
  for (const e of shift.served.flatMap((s) => s.pourErrors)) {
    const agg = byIngredient.get(e.id) ?? { sum: 0, count: 0 };
    byIngredient.set(e.id, { sum: agg.sum + e.errorOz, count: agg.count + 1 });
  }
  // Worst average miss, so one wild pour doesn't outrank a steady habit of the same size.
  let focus: string | null = null;
  let worst = 0;
  for (const [id, { sum, count }] of byIngredient) {
    const avg = sum / count;
    if (Math.abs(avg) > worst) {
      worst = Math.abs(avg);
      const how = `${avg > 0 ? "over" : "under"}-poured ${INGREDIENTS[id].name}`;
      const by = Math.abs(avg).toFixed(2);
      focus = count === 1 ? `You ${how} by ${by} oz.` : `You ${how} ${count} times, by ${by} oz on average.`;
    }
  }
  const drinksMissingSomething = shift.served.filter((s) => s.leftOut > 0).length;
  if (!focus && drinksMissingSomething) {
    focus = `${drinksMissingSomething} of ${n} drinks were missing an ingredient. Check the ticket before you serve.`;
  }

  return {
    tips: shiftTips(shift),
    avgStars: n ? Math.round((shift.served.reduce((sum, s) => sum + s.stars, 0) / n) * 10) / 10 : 0,
    bestStreak: shift.bestStreak,
    sentBack: shift.served.filter((s) => s.sendBack).length,
    // A fast drink that came back doesn't count as fast service.
    underPar: shift.served.filter((s) => !s.sendBack && s.seconds <= s.par).length,
    focus,
  };
}
