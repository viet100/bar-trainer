import assert from "node:assert/strict";
import { test } from "node:test";
import { allow } from "./rateLimit.ts";

test("allows up to the limit inside the window, then blocks", () => {
  const key = "test-a";
  for (let i = 0; i < 3; i++) assert.equal(allow(key, 3, 60_000, 1000 + i), true);
  assert.equal(allow(key, 3, 60_000, 1010), false);
});

test("allows again once old hits leave the window", () => {
  const key = "test-b";
  for (let i = 0; i < 3; i++) allow(key, 3, 60_000, 0);
  assert.equal(allow(key, 3, 60_000, 59_999), false);
  assert.equal(allow(key, 3, 60_000, 60_000), true);
});

test("blocked requests don't extend the block", () => {
  const key = "test-c";
  allow(key, 1, 1000, 0);
  for (let t = 100; t < 1000; t += 100) assert.equal(allow(key, 1, 1000, t), false);
  assert.equal(allow(key, 1, 1000, 1000), true);
});

test("keys are counted separately", () => {
  allow("test-d", 1, 60_000, 0);
  assert.equal(allow("test-d", 1, 60_000, 1), false);
  assert.equal(allow("test-e", 1, 60_000, 1), true);
});
