import assert from "node:assert/strict";
import { test } from "node:test";
import { INGREDIENT_IDS, INGREDIENTS } from "../../game/ingredients.ts";
import { BOTTLE_STYLES, liquidHeight, spoutHeight } from "./bottleStyles.ts";

test("every ingredient has a bottle, and they don't all look alike", () => {
  for (const id of INGREDIENT_IDS) assert.ok(BOTTLE_STYLES[id], id);
  const shapes = new Set(INGREDIENT_IDS.map((id) => BOTTLE_STYLES[id].shape));
  assert.ok(shapes.size >= 5, `only ${shapes.size} bottle shapes`);
});

test("fresh juice and syrup are in squeeze bottles with colored tips; liquor gets steel pourers", () => {
  for (const id of INGREDIENT_IDS) {
    const { category } = INGREDIENTS[id];
    const kind = BOTTLE_STYLES[id].pourer.kind;
    if (category === "juice" || category === "syrup") assert.equal(kind, "tip", id);
    if (category === "spirit" || category === "liqueur") assert.equal(kind, "steel", id);
  }
});

test("liquid sits inside the body, below the neck and the spout", () => {
  for (const id of INGREDIENT_IDS) {
    const style = BOTTLE_STYLES[id];
    const level = liquidHeight(style);
    assert.ok(level > style.shape.inner[0][1], `${id}: some liquid`);
    assert.ok(level < spoutHeight(style), `${id}: below the spout`);
    assert.ok(style.fill > 0 && style.fill <= 1, `${id}: fill in range`);
  }
});
