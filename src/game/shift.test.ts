import assert from "node:assert/strict";
import { test } from "node:test";
import type { Measurement } from "./measure.ts";
import { CLASSIC_RECIPES } from "./recipes.ts";
import type { Stars } from "./score.ts";
import { newShift, parSeconds, recordServe, shiftOver, summarize, type Shift } from "./shift.ts";

const measurement = (tequilaErr = 0): Measurement => ({
  recipe: "Margarita",
  glass: { expected: "rocks", actual: "rocks" },
  ingredients: [
    { id: "tequila", expectedOz: 2, actualOz: 2 + tequilaErr, errorOz: tequilaErr },
    { id: "lime-juice", expectedOz: 1, actualOz: 1, errorOz: 0 },
    { id: "soda-water", expectedOz: 0, actualOz: 1, errorOz: 1 }, // an extra: not a pour habit
  ],
  technique: { expected: "shake", actual: "shake", shakeSeconds: 10, stirTurns: 0, mixedWithIce: true },
  ice: { expected: true, actual: 3 },
  garnish: { expected: null, actual: null },
  totalErrorOz: Math.abs(tequilaErr) + 1,
  spilledOz: 0,
  leftInShakerOz: 0,
});

const serve = (shift: Shift, stars: Stars, opts: { sendBack?: boolean; seconds?: number; tequilaErr?: number } = {}) =>
  recordServe(shift, {
    drink: "Margarita",
    stars,
    sendBack: opts.sendBack ?? stars <= 2,
    seconds: opts.seconds ?? 999,
    par: 60,
    measurement: measurement(opts.tequilaErr),
  });

const lastTip = (s: Shift) => s.served.at(-1)!.tip;

test("base tip follows the stars and a sent-back drink earns nothing", () => {
  assert.deepEqual([5, 4, 3].map((stars) => lastTip(serve(newShift(), stars as Stars)).base), [8, 5, 3]);
  assert.equal(lastTip(serve(newShift(), 3, { sendBack: true })).total, 0);
});

test("streak bonus starts on the third 4-star drink in a row and resets", () => {
  let s = newShift();
  const totals: number[] = [];
  for (const stars of [4, 5, 4, 3, 4] as Stars[]) {
    s = serve(s, stars);
    totals.push(lastTip(s).streak);
  }
  assert.deepEqual(totals, [0, 0, 2, 0, 0]);
  assert.equal(s.bestStreak, 3);
});

test("speed bonus needs par time and at least 3 stars", () => {
  assert.equal(lastTip(serve(newShift(), 3, { seconds: 60 })).speed, 2);
  assert.equal(lastTip(serve(newShift(), 3, { seconds: 61 })).speed, 0);
  assert.equal(lastTip(serve(newShift(), 2, { seconds: 10 })).speed, 0);
});

test("par time grows with ingredients, mixing and garnish", () => {
  const margarita = CLASSIC_RECIPES.find((r) => r.name === "Margarita")!; // 3 ingredients, shaken, garnished
  const shot = CLASSIC_RECIPES.find((r) => r.name === "Tequila Shot")!; // 1 ingredient, built, no garnish
  assert.equal(parSeconds(margarita), 30 + 30 + 20 + 5);
  assert.equal(parSeconds(shot), 30 + 10);
});

test("summary names the steadiest pour habit, ignoring extras", () => {
  let s = newShift();
  s = serve(s, 4, { tequilaErr: 0.25 });
  s = serve(s, 4, { tequilaErr: 0.5 });
  s = serve(s, 5);
  s = serve(s, 2, { sendBack: true, seconds: 10 });
  s = serve(s, 5, { seconds: 30 });
  assert.ok(shiftOver(s));
  const sum = summarize(s);
  assert.equal(sum.tips, 5 + 5 + (8 + 2) + 0 + (8 + 2));
  assert.equal(sum.avgStars, 4);
  assert.equal(sum.sentBack, 1);
  assert.equal(sum.underPar, 1); // the fast sent-back drink doesn't count
  assert.equal(sum.focus, "You over-poured Tequila 2 times, by 0.38 oz on average.");
});

test("a left-out ingredient is a memory slip, not a pour habit", () => {
  // tequilaErr -2 means the 2 oz of tequila was never poured
  let s = serve(newShift(), 1, { tequilaErr: -2 });
  assert.deepEqual(s.served[0].pourErrors, []);
  assert.equal(s.served[0].leftOut, 1);
  assert.equal(summarize(s).focus, "1 of 1 drinks were missing an ingredient. Check the ticket before you serve.");

  s = serve(s, 4, { tequilaErr: 0.25 });
  assert.equal(summarize(s).focus, "You over-poured Tequila by 0.25 oz.");
});
