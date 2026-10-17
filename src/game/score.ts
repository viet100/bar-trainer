import { GLASSES } from "./glassware.ts";
import { GARNISHES, INGREDIENTS } from "./ingredients.ts";
import type { Measurement } from "./measure.ts";

// Points per part of the drink, out of 100. Pour accuracy dominates because
// it's the skill the game trains.
export const WEIGHTS = { volume: 60, technique: 15, glass: 10, ice: 10, garnish: 5 } as const;
const SPILL_PENALTY_PER_OZ = 5;
const MAX_SPILL_PENALTY = 10;
const NOTICEABLE_OZ = 0.125; // a pour error smaller than an eighth of an ounce isn't called out

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
export function scoreDrink(m: Measurement): Score {
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
    const needsIce = t.expected !== "build";
    technique = !needsIce || t.mixedWithIce ? WEIGHTS.technique : Math.round(WEIGHTS.technique / 2);
    if (needsIce && !t.mixedWithIce) {
      costed.push({ cost: WEIGHTS.technique / 2, text: `${t.expected === "shake" ? "Shook" : "Stirred"} without ice in the tin, so it isn't chilled or diluted` });
    }
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

  const raw =
    volume +
    technique +
    (glassOk ? WEIGHTS.glass : 0) +
    (iceOk ? WEIGHTS.ice : 0) +
    (garnishOk ? WEIGHTS.garnish : 0) -
    spill;
  const points = Math.round(Math.min(100, Math.max(0, raw)));

  return {
    points,
    stars: starsFor(points),
    mistakes: costed.sort((a, b) => b.cost - a.cost).map((c) => c.text),
  };
}
