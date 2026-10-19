import assert from "node:assert/strict";
import { test } from "node:test";
import { ML_PER_OZ } from "../lib/pour.ts";
import { asChoice, CHOICE_PENALTY, CHOICE_RATE, FLAVOR_DRINKS, gradeTarget, identifyClassic, pouredInMeasurement, rollChoice } from "./choice.ts";
import { INITIAL_DRINK, drinkReducer, type DrinkAction } from "./drink.ts";
import { measureDrink } from "./measure.ts";
import { classicOrder, recheckOrder, type Order } from "./order.ts";
import { CLASSIC_RECIPES } from "./recipes.ts";
import { scoreDrink } from "./score.ts";

const recipe = (name: string) => CLASSIC_RECIPES.find((r) => r.name === name)!;
const ids = (name: string) => recipe(name).ingredients.map((i) => i.id);

test("every flavor lists only real classics", () => {
  const names = CLASSIC_RECIPES.map((r) => r.name);
  for (const list of Object.values(FLAVOR_DRINKS)) for (const n of list) assert.ok(names.includes(n), n);
});

test("the drink made is recognized by its ingredients, not its amounts", () => {
  assert.equal(identifyClassic(ids("Negroni"))?.name, "Negroni");
  assert.equal(identifyClassic(["gin", "campari"])?.name, "Negroni", "two of three is still a Negroni");
  assert.equal(identifyClassic(["vodka", "cranberry"])?.name, "Cape Codder", "not the Cosmopolitan");
  assert.equal(identifyClassic(["tequila"])?.name, "Tequila Shot");
  assert.equal(identifyClassic([]), null);
  assert.equal(identifyClassic(["heavy-cream", "tonic", "grenadine"]), null, "no classic is close");
});

const bitter: Order = { ...classicOrder([], () => 0, "bitter") };

test("bartender's choice grades the classic you made, and whether it fits", () => {
  assert.equal(bitter.choice, "bitter");
  assert.ok((FLAVOR_DRINKS.bitter as readonly string[]).includes(bitter.recipe.name));
  assert.match(bitter.line, /Something bitter/);

  const boulevardier = gradeTarget(bitter, ids("Boulevardier"));
  assert.equal(boulevardier.recipe.name, "Boulevardier");
  assert.deepEqual(boulevardier.choice, { asked: "bitter", made: "Boulevardier", fits: true });

  const margarita = gradeTarget(bitter, ids("Margarita"));
  assert.equal(margarita.recipe.name, "Margarita");
  assert.equal(margarita.choice?.fits, false);

  const nothing = gradeTarget(bitter, []);
  assert.equal(nothing.recipe, bitter.recipe, "falls back to the example spec");
  assert.deepEqual(nothing.choice, { asked: "bitter", made: null, fits: false });

  assert.equal(gradeTarget({ ...bitter, choice: undefined }, ids("Margarita")).choice, null, "normal orders are unchanged");
});

test("a perfect drink that doesn't fit the flavor loses the choice penalty", () => {
  const margarita: DrinkAction[] = [
    { type: "selectGlass", glass: "rocks" },
    { type: "addIce", into: "glass", cubes: 3 },
    { type: "pour", into: "shaker", ingredient: "tequila", ml: 2 * ML_PER_OZ },
    { type: "pour", into: "shaker", ingredient: "triple-sec", ml: ML_PER_OZ },
    { type: "pour", into: "shaker", ingredient: "lime-juice", ml: ML_PER_OZ },
    { type: "addIce", into: "shaker", cubes: 6 },
    { type: "capShaker" },
    { type: "shake", ms: 5000 },
    { type: "uncapShaker" },
    { type: "strain" },
    { type: "garnish", garnish: "lime-wedge" },
  ];
  const m = measureDrink(margarita.reduce(drinkReducer, INITIAL_DRINK), recipe("Margarita"));
  assert.equal(scoreDrink(m).points, 100);
  const miss = scoreDrink(m, { asked: "bitter", made: "Margarita", fits: false });
  assert.equal(miss.points, 100 - CHOICE_PENALTY);
  assert.match(miss.mistakes[0], /asked for something bitter, and a Margarita isn't bitter/);
  assert.equal(scoreDrink(m, { asked: "sour", made: "Margarita", fits: true }).points, 100);
});

test("choice orders survive the round trip, and a written order is swapped to a fitting classic", () => {
  const back = recheckOrder(bitter);
  assert.ok(back.ok && back.order.choice === "bitter");
  const written = classicOrder([], () => 0); // a Margarita
  const asked = asChoice(written, "bitter", () => 0);
  assert.equal(asked.choice, "bitter");
  assert.ok((FLAVOR_DRINKS.bitter as readonly string[]).includes(asked.recipe.name));
  assert.equal(asked.line, written.line, "the customer's words stay");
});

test("only known ingredients with a positive amount count from a sent measurement", () => {
  assert.deepEqual(
    pouredInMeasurement({ ingredients: [{ id: "gin", actualOz: 1 }, { id: "campari", actualOz: 0 }, { id: "bleach", actualOz: 2 }, { id: "tonic", actualOz: "1" }] }),
    ["gin"],
  );
  assert.deepEqual(pouredInMeasurement(null), []);
  assert.deepEqual(pouredInMeasurement({ ingredients: "gin" }), []);
});

test("the toggle only makes flavor requests possible, about a third of the time", () => {
  assert.equal(rollChoice(false, () => 0), undefined, "off: never");
  assert.equal(rollChoice(true, () => CHOICE_RATE + 0.01), undefined, "on: most customers still name a drink");
  assert.equal(rollChoice(true, () => 0), "bitter");
  let asked = 0;
  for (let i = 0; i < 300; i++) if (rollChoice(true, () => ((i * 37) % 300) / 300)) asked++;
  assert.equal(asked, 100);
});
