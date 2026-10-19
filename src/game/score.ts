import { GLASSES } from "./glassware.ts";
import { GARNISHES, INGREDIENTS } from "./ingredients.ts";
import { CHOICE_PENALTY, type ChoiceResult } from "./choice.ts";
import type { Measurement } from "./measure.ts";

// Points per part of the drink, out of 100. Pour accuracy dominates because
// it's the skill the game trains.
export const WEIGHTS = { volume: 60, technique: 15, glass: 10, ice: 10, garnish: 5 } as const;
const SPILL_PENALTY_PER_OZ = 5;
const MAX_SPILL_PENALTY = 10;
const NOTICEABLE_OZ = 0.125; // a pour error smaller than an eighth of an ounce isn't called out

// Shaking is shortened for practice: long enough to teach which drinks get
// shaken, short enough not to be a chore. The shake meter uses these too.
export const SHAKE_READY_S = 3;
export const SHAKE_OVER_S = 8;
export const STIR_READY_S = 2;

export type Stars = 1 | 2 | 3 | 4 | 5;

export type Score = {
  points: number; // 0-100
  stars: Stars;
  mistakes: string[]; // plain-language facts, costliest first
};

export const starsFor = (points: number): Stars =>
  points >= 90 ? 5 : points >= 75 ? 4 : points >= 60 ? 3 : points >= 40 ? 2 : 1;

const oz = (n: number) => `${Math.abs(n).toFixed(2)} oz`;

// Deterministic rubric. Gemini later judges within one star of this, so the
// same drink can't swing from great to bad between runs.
// `choice`: for a bartender's-choice order, whether the drink fits the flavor asked for.
export function scoreDrink(m: Measurement, choice: ChoiceResult | null = null): Score {
  const costed: { cost: number; text: string }[] = [];
  const expectedTotal = m.ingredients.reduce((sum, i) => sum + i.expectedOz, 0);
  const volumeShare = (errOz: number) => (expectedTotal > 0 ? (WEIGHTS.volume * Math.abs(errOz)) / expectedTotal : 0);

  if (m.leftInShakerOz > 0) {
    // Listed first: it explains the "missing" ingredients below.
    costed.push({ cost: Infinity, text: `Left ${oz(m.leftInShakerOz)} in the shaker; it was never strained into the glass` });
  }
  for (const i of m.ingredients) {
    if (Math.abs(i.errorOz) < NOTICEABLE_OZ) continue;
    const name = INGREDIENTS[i.id].name;
    const text =
      i.expectedOz === 0
        ? `Added ${oz(i.actualOz)} of ${name}, which isn't in the recipe`
        : i.actualOz === 0
          ? `Left out the ${name} (${oz(i.expectedOz)})`
          : `${i.errorOz > 0 ? "Over" : "Under"}-poured the ${name} by ${oz(i.errorOz)}`;
    costed.push({ cost: volumeShare(i.errorOz), text });
  }
  const volume = Math.max(0, WEIGHTS.volume * (1 - (expectedTotal > 0 ? m.totalErrorOz / expectedTotal : 1)));

  const t = m.technique;
  let technique = 0;
  if (t.actual === t.expected) {
    // Each slip costs half the technique points: no ice in the tin, or a
    // shake that's too short or too long, or a stir that's too short.
    const half = WEIGHTS.technique / 2;
    const slips: string[] = [];
    if (t.expected !== "build" && !t.mixedWithIce) {
      slips.push(`${t.expected === "shake" ? "Shook" : "Stirred"} without ice in the tin, so it isn't chilled or diluted`);
    }
    if (t.expected === "shake" && t.shakeSeconds < SHAKE_READY_S) {
      slips.push(`Shook for only ${t.shakeSeconds.toFixed(1)} s; shake until the meter reads ready (${SHAKE_READY_S} s)`);
    }
    if (t.expected === "stir" && t.stirSeconds < STIR_READY_S) {
      slips.push(`Stirred for only ${t.stirSeconds.toFixed(1)} s; stir until the meter reads ready (${STIR_READY_S} s)`);
    }
    if (t.expected === "shake" && t.shakeSeconds > SHAKE_OVER_S) {
      slips.push(`Shook for ${t.shakeSeconds.toFixed(1)} s, past ${SHAKE_OVER_S} s: the drink gets watered down`);
    }
    technique = Math.max(0, Math.round(WEIGHTS.technique - half * slips.length));
    for (const text of slips) costed.push({ cost: half, text });
  } else {
    costed.push({ cost: WEIGHTS.technique, text: `Technique was "${t.actual}" but this drink is ${t.expected === "build" ? "built in the glass" : `${t.expected === "shake" ? "shaken" : "stirred"} and strained`}` });
  }

  const glassOk = m.glass.actual === m.glass.expected;
  if (!glassOk) {
    const actual = m.glass.actual ? `a ${GLASSES[m.glass.actual].name} glass` : "no glass";
    costed.push({ cost: WEIGHTS.glass, text: `Served in ${actual}; it goes in a ${GLASSES[m.glass.expected].name} glass` });
  }

  const iceOk = m.ice.expected === (m.ice.actual > 0);
  if (!iceOk) costed.push({ cost: WEIGHTS.ice, text: m.ice.expected ? "Served without ice; it goes on the rocks" : "Served on ice; it's served up, no ice" });

  const garnishOk = m.garnish.actual === m.garnish.expected;
  if (!garnishOk) {
    const want = m.garnish.expected ? GARNISHES[m.garnish.expected] : "no garnish";
    costed.push({ cost: WEIGHTS.garnish, text: `Garnish should be ${want.toLowerCase()}` });
  }

  const spill = Math.min(MAX_SPILL_PENALTY, m.spilledOz * SPILL_PENALTY_PER_OZ);
  if (m.spilledOz > 0) costed.push({ cost: spill, text: `Spilled ${oz(m.spilledOz)}` });

  const missedFlavor = choice !== null && !choice.fits;
  if (choice && missedFlavor) {
    costed.push({
      cost: CHOICE_PENALTY,
      text: choice.made
        ? `They asked for something ${choice.asked}, and a ${choice.made} isn't ${choice.asked}`
        : `They asked for something ${choice.asked}, and this isn't a drink from the menu`,
    });
  }

  const raw =
    volume +
    technique +
    (glassOk ? WEIGHTS.glass : 0) +
    (iceOk ? WEIGHTS.ice : 0) +
    (garnishOk ? WEIGHTS.garnish : 0) -
    spill -
    (missedFlavor ? CHOICE_PENALTY : 0);
  const points = Math.round(Math.min(100, Math.max(0, raw)));

  return {
    points,
    stars: starsFor(points),
    mistakes: costed.sort((a, b) => b.cost - a.cost).map((c) => c.text),
  };
}
