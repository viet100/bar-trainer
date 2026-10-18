import assert from "node:assert/strict";
import { test } from "node:test";
import { iceSpacing, stackIce } from "./icePile.ts";

const tub = { width: 0.4, depth: 0.22, floorY: -0.12 };
const size = 0.019;
const stack = stackIce(tub, size, 750);
const reach = (size * Math.sqrt(3)) / 2; // farthest a cube's corner can be from its center

test("places exactly the cubes asked for, in several layers", () => {
  assert.equal(stack.length, 750);
  const layers = new Set(stack.map((c) => c.position[1].toFixed(5)));
  assert.ok(layers.size >= 8);
});

test("no two cubes can touch at any rotation", () => {
  for (let i = 0; i < stack.length; i++) {
    for (let j = i + 1; j < stack.length; j++) {
      const [ax, ay, az] = stack[i].position;
      const [bx, by, bz] = stack[j].position;
      assert.ok(Math.hypot(ax - bx, ay - by, az - bz) >= 2 * reach, `cubes ${i} and ${j} could touch`);
    }
  }
});

test("every cube starts inside the tub walls and above the floor", () => {
  for (const { position: [x, y, z] } of stack) {
    assert.ok(Math.abs(x) + reach <= tub.width / 2 + 1e-9, "inside the side walls");
    assert.ok(Math.abs(z) + reach <= tub.depth / 2 + 1e-9, "inside the front and back walls");
    assert.ok(y - reach >= tub.floorY - 1e-9, "above the floor");
  }
});

test("spacing is at least a cube's full diagonal", () => {
  assert.ok(iceSpacing(size) >= size * Math.sqrt(3));
});
