import { GLASSES, type GlassId } from "./glassware.ts";
import { GARNISHES, INGREDIENTS, type GarnishId, type IngredientId } from "./ingredients.ts";
import type { ActualTechnique, Measurement } from "./measure.ts";
import { dialogueProblem, has, isObject, TECHNIQUES } from "./order.ts";
import type { Recipe } from "./recipes.ts";
import { starsFor, type Score, type Stars } from "./score.ts";

export type Grade = {
  stars: Stars;
  sendBack: boolean; // the customer hands it back
  reaction: string; // what the customer says, in character
  coachTip: string; // one concrete tip from the head bartender
  source: "gemini" | "fallback";
};

// Gemini may judge one star above or below the rubric (a picky or generous
// customer), never further, so the same drink can't swing from great to bad.
export const STAR_LEEWAY = 1;
const MAX_TEXT = 240;

const ACTUAL_TECHNIQUES: ActualTechnique[] = [...TECHNIQUES, "shake+stir", "strained unmixed"];
const num = (v: unknown, max = 1000): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
const round2 = (n: number) => Math.round(n * 100) / 100;

// A measurement sent back by the browser is untrusted. Keep only numbers and
// known ids, and recompute everything derived from the (already checked) recipe.
export function parseMeasurement(raw: unknown, recipe: Recipe): Measurement | null {
  if (!isObject(raw) || !Array.isArray(raw.ingredients)) return null;
  const { glass, technique: t, ice, garnish } = raw;
  if (!isObject(glass) || !isObject(t) || !isObject(ice) || !isObject(garnish)) return null;

  const poured = new Map<IngredientId, number>();
  for (const i of raw.ingredients) {
    if (!isObject(i) || !has(INGREDIENTS, i.id) || !num(i.actualOz)) return null;
    poured.set(i.id, i.actualOz);
  }
  const expected = new Map(recipe.ingredients.map((i) => [i.id, i.oz]));
  const ids = [...new Set([...expected.keys(), ...poured.keys()])];
  const ingredients = ids.map((id) => {
    const expectedOz = expected.get(id) ?? 0;
    const actualOz = poured.get(id) ?? 0;
    return { id, expectedOz, actualOz, errorOz: round2(actualOz - expectedOz) };
  });

  const actualGlass = glass.actual === null ? null : has(GLASSES, glass.actual) ? (glass.actual as GlassId) : undefined;
  const actualGarnish = garnish.actual === null ? null : has(GARNISHES, garnish.actual) ? (garnish.actual as GarnishId) : undefined;
  if (actualGlass === undefined || actualGarnish === undefined) return null;
  if (!ACTUAL_TECHNIQUES.includes(t.actual as ActualTechnique)) return null;
  if (!num(t.shakeSeconds, 3600) || !num(t.stirTurns, 10_000) || typeof t.mixedWithIce !== "boolean") return null;
  if (!num(ice.actual, 100) || !num(raw.spilledOz) || !num(raw.leftInShakerOz)) return null;

  return {
    recipe: recipe.name,
    glass: { expected: recipe.glass, actual: actualGlass },
    ingredients,
    technique: {
      expected: recipe.technique,
      actual: t.actual as ActualTechnique,
      shakeSeconds: t.shakeSeconds,
      stirTurns: t.stirTurns,
      mixedWithIce: t.mixedWithIce,
    },
    ice: { expected: recipe.ice, actual: ice.actual },
    garnish: { expected: recipe.garnish, actual: actualGarnish },
    totalErrorOz: round2(ingredients.reduce((sum, i) => sum + Math.abs(i.errorOz), 0)),
    spilledOz: raw.spilledOz,
    leftInShakerOz: raw.leftInShakerOz,
  };
}

export type GradeResult = { ok: true; grade: Grade } | { ok: false; reason: string };

export function parseGrade(raw: unknown, score: Score): GradeResult {
  if (!isObject(raw)) return { ok: false, reason: "grade is not an object" };
  if (typeof raw.stars !== "number" || !Number.isInteger(raw.stars)) return { ok: false, reason: "stars is not a whole number" };

  const lo = Math.max(1, score.stars - STAR_LEEWAY);
  const hi = Math.min(5, score.stars + STAR_LEEWAY);
  const stars = Math.min(hi, Math.max(lo, raw.stars)) as Stars;

  for (const field of ["reaction", "coachTip"] as const) {
    const v = raw[field];
    if (typeof v !== "string" || !v.trim()) return { ok: false, reason: `${field} is missing` };
    if (v.length > MAX_TEXT) return { ok: false, reason: `${field} is too long` };
    const problem = dialogueProblem(v);
    if (problem) return { ok: false, reason: `${field}: ${problem}` };
  }

  return {
    ok: true,
    grade: {
      stars,
      // Kept consistent with the stars: nobody sends back a 4-star drink or keeps a 1-star one.
      sendBack: stars <= 2 ? true : stars >= 4 ? false : raw.sendBack === true,
      reaction: (raw.reaction as string).trim(),
      coachTip: (raw.coachTip as string).trim(),
      source: "gemini",
    },
  };
}

const CANNED_REACTIONS: Record<Stars, string> = {
  5: "That's exactly right. Thank you!",
  4: "Really good, thanks!",
  3: "It's fine, thanks.",
  2: "Hmm, this isn't quite right. Could you remake it?",
  1: "Sorry, this isn't what I ordered.",
};

// Used when Gemini is unavailable or its grade fails the checks.
export function fallbackGrade(score: Score): Grade {
  const stars = starsFor(score.points);
  return {
    stars,
    sendBack: stars <= 2,
    reaction: CANNED_REACTIONS[stars],
    coachTip: score.mistakes[0] ? `${score.mistakes[0]}.` : "Clean, accurate build. Keep that count steady.",
    source: "fallback",
  };
}
