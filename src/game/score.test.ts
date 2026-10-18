import assert from "node:assert/strict";
import { test } from "node:test";
import { ML_PER_OZ } from "../lib/pour.ts";
import { INITIAL_DRINK, drinkReducer, type DrinkAction } from "./drink.ts";
import { measureDrink } from "./measure.ts";
import { CLASSIC_RECIPES } from "./recipes.ts";
import { scoreDrink, SHAKE_OVER_S, SHAKE_READY_S, STIR_READY_S, starsFor } from "./score.ts";

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
  { type: "capShaker" },
  { type: "shake", ms: 5000 },
];
const finish: DrinkAction[] = [{ type: "uncapShaker" }, { type: "strain" }, { type: "garnish", garnish: "lime-wedge" }];

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
    { type: "capShaker" },
    { type: "shake", ms: 5000 },
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

test("a shake counts once it reaches ready, and costs half the technique points if too short or too long", () => {
  const shakeFor = (ms: number) =>
    score([
      ...shakeMargarita().filter((a) => a.type !== "shake"),
      { type: "shake", ms },
      ...finish,
    ]);
  assert.equal(shakeFor(SHAKE_READY_S * 1000).points, 100);
  const short = shakeFor(1000);
  assert.equal(short.points, 100 - 7); // half of 15 technique points rounds to 8 kept
  assert.match(short.mistakes[0], /Shook for only 1\.0 s/);
  const long = shakeFor((SHAKE_OVER_S + 2) * 1000);
  assert.equal(long.points, 93);
  assert.match(long.mistakes[0], /watered down/);
});

test("a stir counts once it reaches ready, and costs half the technique points if too short", () => {
  const negroni = CLASSIC_RECIPES.find((r) => r.name === "Negroni")!;
  const stirFor = (ms: number) =>
    scoreDrink(
      measureDrink(
        ([
          { type: "selectGlass", glass: "rocks" },
          { type: "addIce", into: "glass", cubes: 3 },
          { type: "pour", into: "shaker", ingredient: "gin", ml: oz(1) },
          { type: "pour", into: "shaker", ingredient: "campari", ml: oz(1) },
          { type: "pour", into: "shaker", ingredient: "sweet-vermouth", ml: oz(1) },
          { type: "addIce", into: "shaker", cubes: 6 },
          { type: "stir", ms },
          { type: "strain" },
          { type: "garnish", garnish: "orange-peel" },
        ] as DrinkAction[]).reduce(drinkReducer, INITIAL_DRINK),
        negroni,
      ),
    );
  assert.equal(stirFor(STIR_READY_S * 1000).points, 100);
  const short = stirFor(500);
  assert.equal(short.points, 93);
  assert.match(short.mistakes[0], /Stirred for only 0\.5 s/);
});
