import assert from "node:assert/strict";
import { test } from "node:test";
import { classicOrder, parseOrder } from "./order.ts";

const valid = {
  customerName: "Rosa",
  customerAge: 32,
  customerVibe: "impatient, double-parked her bike",
  line: "Margarita, rocks, quick as you can!",
  drinkName: "Margarita",
  glass: "rocks",
  technique: "shake",
  ice: true,
  garnish: "lime-wedge",
  ingredients: [
    { ingredient: "tequila", oz: 2 },
    { ingredient: "triple-sec", oz: 0.9 },
    { ingredient: "lime-juice", oz: 1 },
  ],
};

const reason = (patch: Record<string, unknown>) => {
  const r = parseOrder({ ...valid, ...patch });
  assert.equal(r.ok, false, `expected rejection for ${JSON.stringify(patch)}`);
  return r.ok ? "" : r.reason;
};

test("a valid order parses and rounds amounts to the nearest quarter ounce", () => {
  const r = parseOrder(valid);
  assert.ok(r.ok);
  assert.equal(r.order.source, "gemini");
  assert.equal(r.order.customer.age, 32);
  assert.deepEqual(r.order.recipe.ingredients.map((i) => i.oz), [2, 1, 1]);
  assert.equal(r.order.recipe.garnish, "lime-wedge");
});

test('garnish "none" becomes null', () => {
  const r = parseOrder({ ...valid, garnish: "none" });
  assert.ok(r.ok && r.order.recipe.garnish === null);
});

test("rejects customers under 21", () => {
  assert.match(reason({ customerAge: 20 }), /under 21/);
  assert.match(reason({ customerAge: 17 }), /under 21/);
});

test("rejects a missing, fractional or string age", () => {
  for (const customerAge of [undefined, 21.5, "25", null]) assert.match(reason({ customerAge }), /age/);
});

test("rejects dialogue that implies an underage customer, even with a 21+ age", () => {
  assert.match(reason({ line: "I'm 19 years old but my fake ID says 22" }), /underage/);
  assert.match(reason({ customerVibe: "high schooler on spring break" }), /underage/);
  assert.match(reason({ line: "Don't tell anyone I'm a teenager" }), /underage/);
});

test("allows innocent wording that only looks close", () => {
  assert.ok(parseOrder({ ...valid, line: "Margarita please, I've been coming here for 15 years" }).ok);
  assert.ok(parseOrder({ ...valid, line: "One minor change: extra lime" }).ok);
});

test("rejects more than 3 oz of liquor", () => {
  assert.match(
    reason({ ingredients: [{ ingredient: "tequila", oz: 2.5 }, { ingredient: "triple-sec", oz: 1 }] }),
    /liquor/,
  );
});

test("rejects unknown or duplicate ingredients and silly amounts", () => {
  assert.match(reason({ ingredients: [{ ingredient: "absinthe", oz: 1 }] }), /unknown ingredient/);
  assert.match(reason({ ingredients: [{ ingredient: "gin", oz: 1 }, { ingredient: "gin", oz: 1 }] }), /twice/);
  assert.match(reason({ ingredients: [{ ingredient: "gin", oz: 0.1 }] }), /out of range/);
  assert.match(reason({ ingredients: [] }), /1-6 ingredients/);
});

test("rejects drinks that don't fit the glass, or ice in a glass served up", () => {
  assert.match(reason({ glass: "shot", ice: false }), /doesn't fit/);
  assert.match(reason({ glass: "coupe" }), /without ice/);
});

test("rejects unknown glass, technique and garnish", () => {
  assert.match(reason({ glass: "tiki-mug" }), /unknown glass/);
  assert.match(reason({ technique: "blend" }), /unknown technique/);
  assert.match(reason({ garnish: "umbrella" }), /unknown garnish/);
});

test("rejects missing or overlong text", () => {
  assert.match(reason({ line: "" }), /line is missing/);
  assert.match(reason({ customerName: "x".repeat(201) }), /too long/);
});

test("classic fallback skips recently served drinks", () => {
  const recent = ["Margarita", "Daiquiri", "Cosmopolitan", "Gin Martini", "Tom Collins", "Gin & Tonic", "Cuba Libre"];
  const o = classicOrder(recent, () => 0);
  assert.equal(o.recipe.name, "Tequila Shot");
  assert.equal(o.source, "classic");
  assert.ok(o.customer.age >= 21);
});
