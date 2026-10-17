import assert from "node:assert/strict";
import { test } from "node:test";
import { ML_PER_OZ } from "../lib/pour.ts";
import { ICE_CUBE_ML, INITIAL_DRINK, drinkReducer, liquidMl, type DrinkAction, type DrinkState } from "./drink.ts";
import { GLASSES } from "./glassware.ts";
import { measureDrink } from "./measure.ts";
import { CLASSIC_RECIPES } from "./recipes.ts";

const run = (actions: DrinkAction[], from: DrinkState = INITIAL_DRINK) => actions.reduce(drinkReducer, from);
const oz = (n: number) => n * ML_PER_OZ;
const recipe = (name: string) => CLASSIC_RECIPES.find((r) => r.name === name)!;

const perfectMargarita: DrinkAction[] = [
  { type: "selectGlass", glass: "rocks" },
  { type: "addIce", into: "glass", cubes: 4 },
  { type: "pour", into: "shaker", ingredient: "tequila", ml: oz(2) },
  { type: "pour", into: "shaker", ingredient: "triple-sec", ml: oz(1) },
  { type: "pour", into: "shaker", ingredient: "lime-juice", ml: oz(1) },
  { type: "addIce", into: "shaker", cubes: 6 },
  { type: "shake", ms: 12000 },
  { type: "strain" },
  { type: "garnish", garnish: "lime-wedge" },
];

test("pouring into a full glass spills the overflow", () => {
  const s = run([
    { type: "selectGlass", glass: "shot" },
    { type: "pour", into: "glass", ingredient: "tequila", ml: oz(3) },
  ]);
  assert.ok(Math.abs(liquidMl(s.inGlass) - GLASSES.shot.capacityMl) < 1e-9);
  assert.ok(Math.abs(s.spilledMl - oz(1)) < 1e-9);
});

test("pouring with no glass picked lands on the bar", () => {
  const s = run([{ type: "pour", into: "glass", ingredient: "vodka", ml: 30 }]);
  assert.equal(liquidMl(s.inGlass), 0);
  assert.equal(s.spilledMl, 30);
});

test("ice takes up room in the glass", () => {
  const s = run([
    { type: "selectGlass", glass: "rocks" },
    { type: "addIce", into: "glass", cubes: 5 },
    { type: "pour", into: "glass", ingredient: "gin", ml: 1000 },
  ]);
  assert.ok(Math.abs(liquidMl(s.inGlass) - (GLASSES.rocks.capacityMl - 5 * ICE_CUBE_ML)) < 1e-9);
});

test("ice is capped by the room left in the vessel", () => {
  const s = run([
    { type: "selectGlass", glass: "shot" },
    { type: "addIce", into: "glass", cubes: 50 },
  ]);
  assert.equal(s.inGlass.ice, Math.floor(GLASSES.shot.capacityMl / ICE_CUBE_ML));
});

test("can't swap glasses once the glass has something in it", () => {
  const s = run([
    { type: "selectGlass", glass: "rocks" },
    { type: "addIce", into: "glass", cubes: 1 },
    { type: "selectGlass", glass: "coupe" },
  ]);
  assert.equal(s.glass, "rocks");
});

test("straining moves liquid to the glass and leaves the ice in the tin", () => {
  const s = run(perfectMargarita);
  assert.equal(liquidMl(s.inShaker), 0);
  assert.equal(s.inShaker.ice, 0);
  assert.equal(s.inGlass.ice, 4);
  assert.ok(Math.abs(liquidMl(s.inGlass) - oz(4)) < 1e-9);
  assert.deepEqual(s.strainedMix, { shakeMs: 12000, stirTurns: 0, withIce: true });
});

test("shaking an empty tin does nothing", () => {
  assert.equal(run([{ type: "shake", ms: 5000 }]), INITIAL_DRINK);
});

test("a perfect margarita measures with zero error", () => {
  const m = measureDrink(run(perfectMargarita), recipe("Margarita"));
  assert.equal(m.totalErrorOz, 0);
  assert.equal(m.glass.actual, "rocks");
  assert.equal(m.technique.actual, "shake");
  assert.equal(m.technique.shakeSeconds, 12);
  assert.equal(m.technique.mixedWithIce, true);
  assert.equal(m.garnish.actual, "lime-wedge");
  assert.equal(m.spilledOz, 0);
});

test("over-pours, extras and misses show up as signed errors", () => {
  const s = run([
    { type: "selectGlass", glass: "coupe" },
    { type: "pour", into: "shaker", ingredient: "white-rum", ml: oz(2.3) },
    { type: "pour", into: "shaker", ingredient: "lemon-juice", ml: oz(1) },
    { type: "stir", turns: 20 },
    { type: "strain" },
  ]);
  const m = measureDrink(s, recipe("Daiquiri"));
  const err = Object.fromEntries(m.ingredients.map((i) => [i.id, i.errorOz]));
  assert.deepEqual(err, { "white-rum": 0.3, "lime-juice": -1, "simple-syrup": -0.75, "lemon-juice": 1 });
  assert.equal(m.totalErrorOz, 3.05);
  assert.equal(m.technique.actual, "stir");
  assert.equal(m.technique.mixedWithIce, false);
});

test("built drinks never touch the shaker", () => {
  const s = run([
    { type: "selectGlass", glass: "highball" },
    { type: "addIce", into: "glass", cubes: 6 },
    { type: "pour", into: "glass", ingredient: "gin", ml: oz(2) },
    { type: "pour", into: "glass", ingredient: "tonic", ml: oz(4) },
  ]);
  const m = measureDrink(s, recipe("Gin & Tonic"));
  assert.equal(m.technique.actual, "build");
  assert.equal(m.totalErrorOz, 0);
  assert.equal(m.ice.actual, 6);
});
