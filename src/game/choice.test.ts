import assert from "node:assert/strict";
import { test } from "node:test";
import { ML_PER_OZ } from "../lib/pour.ts";
import {
  asChoice,
  asForgot,
  CHOICE_PENALTY,
  CHOICE_RATE,
  describeForgotten,
  FLAVOR_DRINKS,
  FORGOT_RATE,
  gradeTarget,
  identifyClassic,
  pouredInMeasurement,
  rollPro,
} from "./choice.ts";
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

const bitter: Order = { ...classicOrder([], () => 0, { kind: "flavor", flavor: "bitter" }) };

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

test("professional mode makes flavor and forgot-the-name customers possible, about 1 in 6 each", () => {
  assert.equal(rollPro(false, () => 0), null, "off: never");
  assert.deepEqual(rollPro(true, () => 0), { kind: "flavor", flavor: "bitter" });
  assert.deepEqual(rollPro(true, () => CHOICE_RATE + 0.01), { kind: "forgot" });
  assert.equal(rollPro(true, () => CHOICE_RATE + FORGOT_RATE + 0.01), null, "most customers still name a drink");
  const kinds = { flavor: 0, forgot: 0, none: 0 };
  for (let i = 0; i < 300; i++) kinds[rollPro(true, () => ((i * 37) % 300) / 300)?.kind ?? "none"]++;
  assert.deepEqual(kinds, { flavor: 50, forgot: 50, none: 200 });
});

test("a customer who forgot the name describes the drink without naming it", () => {
  for (const r of CLASSIC_RECIPES) {
    const line = describeForgotten(r);
    assert.ok(!line.toLowerCase().includes(r.name.toLowerCase()), `${r.name}: ${line}`);
  }
  assert.equal(
    describeForgotten(recipe("Negroni")),
    "I can’t remember what it’s called. It’s made with gin, it’s bitter, and it comes in a rocks glass over ice.",
  );
  const order = classicOrder([], () => 0, { kind: "forgot" });
  assert.equal(order.mystery, true);
  assert.equal(order.recipe.name, "Margarita");
  const back = recheckOrder(order);
  assert.ok(back.ok && back.order.mystery === true, "survives the round trip to grading");
});

test("a written forgot-the-name order must be a classic and must not say its name", () => {
  const written = classicOrder([], () => 0); // "Could I get a Margarita, please?"
  assert.equal(asForgot(written), null, "said the name");
  const described = { ...written, line: "The tequila one with lime, salt on the rim maybe?" };
  const forgot = asForgot({ ...described, recipe: { ...described.recipe, garnish: null } });
  assert.ok(forgot?.mystery);
  assert.deepEqual(forgot.recipe, recipe("Margarita"), "the classic's exact spec");
  assert.equal(asForgot({ ...described, line: "a gin and tonic", recipe: recipe("Gin & Tonic") }), null, "& counts as and");
  assert.equal(asForgot({ ...described, recipe: { ...recipe("Margarita"), name: "Spicy Paloma Fizz" } }), null, "not a classic");
});
