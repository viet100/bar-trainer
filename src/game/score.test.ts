import assert from "node:assert/strict";
import { test } from "node:test";
import { ML_PER_OZ } from "../lib/pour.ts";
import { INITIAL_DRINK, drinkReducer, type DrinkAction } from "./drink.ts";
import { measureDrink } from "./measure.ts";
import { CLASSIC_RECIPES } from "./recipes.ts";
import { scoreDrink, starsFor } from "./score.ts";

const oz = (n: number) => n * ML_PER_OZ;
const margarita = CLASSIC_RECIPES.find((r) => r.name === "Margarita")!;
const score = (actions: DrinkAction[]) => scoreDrink(measureDrink(actions.reduce(drinkReducer, INITIAL_DRINK), margarita));

const shakeMargarita = (tequilaOz = 2): DrinkAction[] => [
  { type: "selectGlass", glass: "rocks" },
  { type: "addIce", into: "glass", cubes: 3 },
  { type: "pour", into: "shaker", ingredient: "tequila", ml: oz(tequilaOz) },
  { type: "pour", into: "shaker", ingredient: "triple-sec", ml: oz(1) },
  { type: "pour", into: "shaker", ingredient: "lime-juice", ml: oz(1) },
  { type: "addIce", into: "shaker", cubes: 6 },
  { type: "shake", ms: 10000 },
];
const finish: DrinkAction[] = [{ type: "strain" }, { type: "garnish", garnish: "lime-wedge" }];

test("a perfect drink scores 100 and 5 stars with no mistakes", () => {
  const s = score([...shakeMargarita(), ...finish]);
  assert.deepEqual(s, { points: 100, stars: 5, mistakes: [] });
});

test("an over-pour costs points in proportion and is named", () => {
  const s = score([...shakeMargarita(2.5), ...finish]);
  // 0.5 oz off a 4 oz spec = 12.5% of the 60 volume points
  assert.equal(s.points, 93);
  assert.deepEqual(s.mistakes, ["Over-poured the Tequila by 0.50 oz"]);
});

test("errors under an eighth of an ounce aren't called out", () => {
  const s = score([...shakeMargarita(2.1), ...finish]);
  assert.deepEqual(s.mistakes, []);
});

test("forgetting to strain is the first mistake listed", () => {
  const s = score([...shakeMargarita(), { type: "garnish", garnish: "lime-wedge" }]);
  assert.match(s.mistakes[0], /Left 4.00 oz in the shaker/);
  assert.ok(s.stars <= 2);
});

test("wrong glass, no ice and shaking without ice are each named", () => {
  const s = score([
    { type: "selectGlass", glass: "highball" },
    { type: "pour", into: "shaker", ingredient: "tequila", ml: oz(2) },
    { type: "pour", into: "shaker", ingredient: "triple-sec", ml: oz(1) },
    { type: "pour", into: "shaker", ingredient: "lime-juice", ml: oz(1) },
    { type: "shake", ms: 10000 },
    ...finish,
  ]);
  assert.equal(s.points, 100 - 10 - 10 - 7); // half of 15 technique points rounds to 8 kept
  assert.equal(s.mistakes.length, 3);
  assert.ok(s.mistakes.some((m) => /Rocks glass/.test(m)));
  assert.ok(s.mistakes.some((m) => /without ice in the tin/.test(m)));
  assert.ok(s.mistakes.some((m) => /goes on the rocks/.test(m)));
});

test("star thresholds", () => {
  assert.deepEqual([100, 90, 89, 75, 74, 60, 59, 40, 39, 0].map(starsFor), [5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
});
