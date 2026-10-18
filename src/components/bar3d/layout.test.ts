import assert from "node:assert/strict";
import { test } from "node:test";
import { INGREDIENT_IDS, INGREDIENTS } from "../../game/ingredients.ts";
import { GLASS_IDS } from "../../game/glassware.ts";
import { BAR_TOP, BAR_TOP_FRONT, bottleHome, clearHeight, glassHome, MAT, MAT_SIZE, onMat, POUR_AT, POUR_INNER, POUR_OUTER, pourReach, SPEED_RAIL } from "./layout.ts";

test("every bottle has its own slot on the speed rail, grouped by category", () => {
  const homes = INGREDIENT_IDS.map(bottleHome);
  assert.equal(new Set(homes.map(([x]) => x)).size, homes.length);
  assert.ok(homes.every(([, y, z]) => y === SPEED_RAIL.baseY && z === SPEED_RAIL.z));
  // Walking the rail left to right, each category appears as one unbroken run.
  const cats = [...INGREDIENT_IDS].sort((a, b) => bottleHome(a)[0] - bottleHome(b)[0]).map((id) => INGREDIENTS[id].category);
  const runs = cats.filter((c, i) => i === 0 || c !== cats[i - 1]);
  assert.equal(runs.length, new Set(cats).size);
});

test("the mat and glassware are up on the bar top, behind the underbar", () => {
  assert.equal(MAT[1], BAR_TOP);
  assert.ok(MAT[2] < BAR_TOP_FRONT);
  for (const id of GLASS_IDS) assert.ok(glassHome(id)[1] === BAR_TOP && glassHome(id)[2] < BAR_TOP_FRONT, id);
});

test("pour reach ramps from 0 far away to 1 over the vessel", () => {
  assert.equal(pourReach(POUR_OUTER + 0.01), 0);
  assert.equal(pourReach(POUR_INNER), 1);
  assert.equal(pourReach(0), 1);
  const mid = pourReach((POUR_OUTER + POUR_INNER) / 2);
  assert.ok(mid > 0.4 && mid < 0.6);
  assert.ok(pourReach(POUR_INNER + 0.02) >= POUR_AT, "pouring starts a little before dead center");
});

test("dropping on the mat counts over the whole visible mat, not just its center", () => {
  const [w, d] = MAT_SIZE;
  assert.ok(onMat([MAT[0], MAT[2]]));
  assert.ok(onMat([MAT[0] + w / 2, MAT[2] + d / 2]), "corner");
  assert.ok(!onMat([MAT[0] + w / 2 + 0.1, MAT[2]]), "well past the end");
});

test("a carried bottle's height ramps smoothly over the bar top edge", () => {
  assert.equal(clearHeight(0.2, 0.05), 0.05, "far in front of the edge: unchanged");
  assert.ok(clearHeight(BAR_TOP_FRONT, 0) > BAR_TOP, "at the edge: above the bar top");
  let prev = 0;
  for (let z = 0.0; z >= BAR_TOP_FRONT; z -= 0.005) {
    const y = clearHeight(z, 0);
    assert.ok(y - prev < 0.03, `no jump at z=${z.toFixed(3)}`);
    prev = y;
  }
});
