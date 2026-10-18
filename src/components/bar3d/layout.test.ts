import assert from "node:assert/strict";
import { test } from "node:test";
import { INGREDIENT_IDS, INGREDIENTS } from "../../game/ingredients.ts";
import { GLASS_IDS } from "../../game/glassware.ts";
import { BAR_TOP, BAR_TOP_FRONT, bottleHome, clearHeight, glassHome, MAT, MAT_SIZE, onMat, POUR_AT, POUR_INNER, POUR_OUTER, pourReach, RAILS } from "./layout.ts";

test("every bottle has its own slot, liquor on the back rail and the rest in front, grouped by category", () => {
  const spots = INGREDIENT_IDS.map(bottleHome);
  assert.ok(spots.every(Boolean), "every ingredient has a slot");
  assert.equal(new Set(spots.map(([x, , z]) => `${x}|${z}`)).size, spots.length, "no two share a slot");
  for (const id of INGREDIENT_IDS) {
    const rail = RAILS.find((r) => r.categories.includes(INGREDIENTS[id].category));
    assert.ok(rail, `${id} has a rail`);
    assert.deepEqual([bottleHome(id)[1], bottleHome(id)[2]], [rail.baseY, rail.z], id);
  }
  // Along each rail, each category is one unbroken run.
  for (const rail of RAILS) {
    const ids = INGREDIENT_IDS.filter((id) => rail.categories.includes(INGREDIENTS[id].category));
    const cats = ids.sort((a, b) => bottleHome(a)[0] - bottleHome(b)[0]).map((id) => INGREDIENTS[id].category);
    assert.equal(cats.filter((c, i) => i === 0 || c !== cats[i - 1]).length, new Set(cats).size);
  }
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
