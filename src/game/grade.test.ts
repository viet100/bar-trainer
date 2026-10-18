import assert from "node:assert/strict";
import { test } from "node:test";
import { fallbackGrade, parseGrade, parseMeasurement } from "./grade.ts";
import { CLASSIC_RECIPES } from "./recipes.ts";
import type { Score } from "./score.ts";

const score3: Score = { points: 65, stars: 3, mistakes: ["Over-poured the Tequila by 0.50 oz"] };
const good = { stars: 3, sendBack: false, reaction: "A bit boozy, but I'll take it.", coachTip: "Count 3 seconds for 1.5 oz." };

test("keeps Gemini's stars within one of the rubric", () => {
  const at = (stars: number) => {
    const r = parseGrade({ ...good, stars }, score3);
    assert.ok(r.ok);
    return r.grade.stars;
  };
  assert.deepEqual([1, 2, 3, 4, 5].map(at), [2, 2, 3, 4, 4]);
});

test("send-back always matches the stars", () => {
  const r2 = parseGrade({ ...good, stars: 2, sendBack: false }, score3);
  const r4 = parseGrade({ ...good, stars: 4, sendBack: true }, score3);
  assert.ok(r2.ok && r2.grade.sendBack === true);
  assert.ok(r4.ok && r4.grade.sendBack === false);
});

test("rejects unsafe or missing customer text", () => {
  assert.equal(parseGrade({ ...good, reaction: "Great, now make the next one a double shot!" }, score3).ok, false);
  assert.equal(parseGrade({ ...good, reaction: "Not bad for my 19th birthday" }, score3).ok, false);
  assert.equal(parseGrade({ ...good, coachTip: "" }, score3).ok, false);
  assert.equal(parseGrade({ ...good, reaction: "x".repeat(241) }, score3).ok, false);
  assert.equal(parseGrade({ ...good, stars: "5" }, score3).ok, false);
});

test("fallback grade uses the rubric and its top mistake", () => {
  const g = fallbackGrade(score3);
  assert.equal(g.stars, 3);
  assert.equal(g.source, "fallback");
  assert.equal(g.coachTip, "Over-poured the Tequila by 0.50 oz.");
});

const margarita = CLASSIC_RECIPES.find((r) => r.name === "Margarita")!;
const measured = {
  ingredients: [{ id: "tequila", actualOz: 2.5 }, { id: "triple-sec", actualOz: 1 }],
  glass: { actual: "rocks" },
  technique: { actual: "shake", shakeSeconds: 10, stirSeconds: 0, mixedWithIce: true },
  ice: { actual: 3 },
  garnish: { actual: null },
  spilledOz: 0,
  leftInShakerOz: 0,
};

test("rebuilds an untrusted measurement from the recipe, ignoring client-sent expectations", () => {
  const m = parseMeasurement({ ...measured, ingredients: [...measured.ingredients.map((i) => ({ ...i, expectedOz: 99, errorOz: 0 }))] }, margarita);
  assert.ok(m);
  assert.deepEqual(
    m.ingredients.map((i) => [i.id, i.expectedOz, i.errorOz]),
    [["tequila", 2, 0.5], ["triple-sec", 1, 0], ["lime-juice", 1, -1]],
  );
  assert.equal(m.totalErrorOz, 1.5);
});

test("rejects measurements with unknown ids or bad numbers", () => {
  assert.equal(parseMeasurement({ ...measured, ingredients: [{ id: "absinthe", actualOz: 1 }] }, margarita), null);
  assert.equal(parseMeasurement({ ...measured, glass: { actual: "tiki" } }, margarita), null);
  assert.equal(parseMeasurement({ ...measured, spilledOz: -1 }, margarita), null);
  assert.equal(parseMeasurement({ ...measured, technique: { ...measured.technique, actual: "blend" } }, margarita), null);
  assert.equal(parseMeasurement("nope", margarita), null);
});
