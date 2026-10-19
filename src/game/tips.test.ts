import assert from "node:assert/strict";
import { test } from "node:test";
import { CLASSIC_RECIPES } from "./recipes.ts";
import type { Stars } from "./score.ts";
import { newTab, parSeconds, recordServe, type Tab } from "./tips.ts";

const serve = (tab: Tab, stars: Stars, opts: { sendBack?: boolean; seconds?: number } = {}) =>
  recordServe(tab, { stars, sendBack: opts.sendBack ?? stars <= 2, seconds: opts.seconds ?? 999, par: 60 });

test("base tip follows the stars and a sent-back drink earns nothing", () => {
  assert.deepEqual([5, 4, 3].map((stars) => serve(newTab(), stars as Stars).tip.base), [8, 5, 3]);
  assert.equal(serve(newTab(), 3, { sendBack: true }).tip.total, 0);
});

test("streak bonus starts on the third 4-star drink in a row and resets", () => {
  let tab = newTab();
  const bonuses: number[] = [];
  for (const stars of [4, 5, 4, 3, 4] as Stars[]) {
    const r = serve(tab, stars);
    tab = r.tab;
    bonuses.push(r.tip.streak);
  }
  assert.deepEqual(bonuses, [0, 0, 2, 0, 0]);
  assert.equal(tab.streak, 1);
});

test("speed bonus needs par time and at least 3 stars", () => {
  assert.equal(serve(newTab(), 3, { seconds: 60 }).tip.speed, 2);
  assert.equal(serve(newTab(), 3, { seconds: 61 }).tip.speed, 0);
  assert.equal(serve(newTab(), 2, { seconds: 10 }).tip.speed, 0);
});

test("the tab keeps counting with no end: drinks served and tips add up", () => {
  let tab = newTab();
  for (let i = 0; i < 12; i++) tab = serve(tab, 5).tab; // 8 base, +2 streak from the 3rd on
  assert.equal(tab.served, 12);
  assert.equal(tab.tips, 12 * 8 + 10 * 2);
  assert.equal(tab.streak, 12);
});

test("par time grows with ingredients, mixing and garnish", () => {
  const margarita = CLASSIC_RECIPES.find((r) => r.name === "Margarita")!; // 3 ingredients, shaken, garnished
  const shot = CLASSIC_RECIPES.find((r) => r.name === "Tequila Shot")!; // 1 ingredient, built, no garnish
  assert.equal(parSeconds(margarita), 30 + 30 + 20 + 5);
  assert.equal(parSeconds(shot), 30 + 10);
});
