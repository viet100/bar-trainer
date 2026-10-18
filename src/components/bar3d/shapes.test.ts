import assert from "node:assert/strict";
import { test } from "node:test";
import { GLASSES } from "../../game/glassware.ts";
import { glassOutline, heightForFraction, liquidOutline, radiusAt, rimHeight, SHAPES, volumeTo } from "./shapes.ts";

const close = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("a straight cylinder's volume matches pi r^2 h", () => {
  const cyl: [number, number][] = [[0, 0], [0.05, 0], [0.05, 0.1]];
  close(volumeTo(cyl, 0.1), Math.PI * 0.05 ** 2 * 0.1, 1e-12);
  close(volumeTo(cyl, 0.05), Math.PI * 0.05 ** 2 * 0.05, 1e-12);
});

test("radius is interpolated along tapered walls", () => {
  const [, [rBottom], [rRim, yRim]] = SHAPES.rocks.inner;
  close(radiusAt(SHAPES.rocks.inner, 0.009), rBottom, 1e-12); // a flat bottom's edge, not the axis
  close(radiusAt(SHAPES.rocks.inner, yRim), rRim, 1e-12);
  const [, [r0, y0], [r1, y1]] = SHAPES.martini.inner;
  close(radiusAt(SHAPES.martini.inner, (y0 + y1) / 2), (r0 + r1) / 2, 1e-12);
});

test("fill height inverts volume, and a V glass fills fast near the bottom", () => {
  for (const id of Object.keys(SHAPES) as (keyof typeof SHAPES)[]) {
    const p = SHAPES[id].inner;
    const full = volumeTo(p, rimHeight(p));
    for (const f of [0, 0.25, 0.5, 1]) close(volumeTo(p, heightForFraction(p, f)) / full, f, 1e-6);
  }
  // Half the volume of a martini cone sits in the top fifth of its height.
  const m = SHAPES.martini.inner;
  const half = heightForFraction(m, 0.5);
  assert.ok((half - m[0][1]) / (rimHeight(m) - m[0][1]) > 0.75);
});

test("each glass shape holds roughly what the game says it holds", () => {
  // Within 25%: the shapes are drawn by eye, the game capacity is what counts.
  for (const id of Object.keys(GLASSES) as (keyof typeof GLASSES)[]) {
    const p = SHAPES[id].inner;
    const ml = volumeTo(p, rimHeight(p)) * 1e6;
    const want = GLASSES[id].capacityMl;
    assert.ok(Math.abs(ml - want) / want < 0.25, `${id}: shape holds ${ml.toFixed(0)} ml, game says ${want.toFixed(0)}`);
  }
});

test("outlines start and end on the axis so the lathe closes", () => {
  for (const shape of Object.values(SHAPES)) {
    const g = glassOutline(shape);
    assert.equal(g[0][0], 0);
    assert.equal(g.at(-1)![0], 0);
    const l = liquidOutline(shape.inner, heightForFraction(shape.inner, 0.4));
    assert.equal(l[0][0], 0);
    assert.equal(l.at(-1)![0], 0);
    assert.ok(l.every(([, y], i) => i === 0 || y >= l[i - 1][1]), "liquid outline goes up");
  }
});
