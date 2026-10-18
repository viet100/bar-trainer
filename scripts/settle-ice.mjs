// Settles the ice in the well once, with the same physics engine the game
// uses, and saves where every cube came to rest. The game draws that saved
// heap as static meshes, so the ice looks naturally piled (cubes resting on
// each other) without simulating anything at runtime.
//
// Run after changing the tub size or the ice count:  npm run settle-ice

import { writeFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import { ICE_TUB, stackIce } from "../src/components/bar3d/icePile.ts";
import { ICE_WELL_SIZE } from "../src/components/bar3d/layout.ts";

const OUT = new URL("../src/components/bar3d/iceWellLayout.json", import.meta.url);
const MAX_STEPS = 4000; // 66 s of simulated time at 60 Hz
const REST_SPEED = 0.01; // m/s: slower than this, a cube counts as settled (invisible)

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

// Tub, centered at the origin with its rim at y = 0. Walls rise above the rim
// to hold the starting stack while it falls.
const [w, d] = ICE_WELL_SIZE;
const start = stackIce({ width: w, depth: d, floorY: -ICE_TUB.depth }, ICE_TUB.cubeSize, ICE_TUB.count);
const top = Math.max(...start.map((c) => c.position[1])) + 0.03;
const wallH = (ICE_TUB.depth + top) / 2;
const wallY = -ICE_TUB.depth + wallH;
const t = 0.01;
const tub = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
for (const [hx, hy, hz, x, y, z] of [
  [w / 2, t, d / 2, 0, -ICE_TUB.depth - t, 0],
  [w / 2 + t, wallH, t, 0, wallY, -d / 2 - t],
  [w / 2 + t, wallH, t, 0, wallY, d / 2 + t],
  [t, wallH, d / 2, -w / 2 - t, wallY, 0],
  [t, wallH, d / 2, w / 2 + t, wallY, 0],
]) {
  world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z), tub);
}

// One dynamic body per cube, starting from the non-overlapping stack.
const half = ICE_TUB.cubeSize / 2;
const bodies = start.map(({ position: [x, y, z], rotation: [rx, ry, rz] }) => {
  const q = eulerToQuat(rx, ry, rz);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(q).setLinearDamping(0.6).setAngularDamping(0.9),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(half, half, half).setFriction(0.9).setRestitution(0.05), body);
  return body;
});

// Stop once every cube has (nearly) stopped; checked every 30 steps.
const speed = (b) => Math.hypot(b.linvel().x, b.linvel().y, b.linvel().z);
let steps = 0;
while (steps < MAX_STEPS) {
  world.step();
  steps++;
  if (steps > 120 && steps % 30 === 0 && bodies.every((b) => b.isSleeping() || speed(b) < REST_SPEED)) break;
}

const r = (n, digits) => +n.toFixed(digits);
const cubes = bodies.map((b) => {
  const p = b.translation();
  const q = b.rotation();
  return [r(p.x, 5), r(p.y, 5), r(p.z, 5), r(q.x, 5), r(q.y, 5), r(q.z, 5), r(q.w, 5)];
});
const highest = Math.max(...cubes.map((c) => c[1]));
writeFileSync(OUT, JSON.stringify({ cubeSize: ICE_TUB.cubeSize, cubes }) + "\n");
console.log(`settled ${cubes.length} cubes in ${steps} steps; highest cube center ${(highest * 100).toFixed(1)} cm from the rim`);

// three.js Euler order XYZ -> quaternion, matching how the cubes were tilted.
function eulerToQuat(x, y, z) {
  const [c1, c2, c3] = [Math.cos(x / 2), Math.cos(y / 2), Math.cos(z / 2)];
  const [s1, s2, s3] = [Math.sin(x / 2), Math.sin(y / 2), Math.sin(z / 2)];
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
}
