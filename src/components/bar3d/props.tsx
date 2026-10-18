"use client";

import { RigidBody } from "@react-three/rapier";
import { useLayoutEffect, useRef } from "react";
import { DoubleSide, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import type { GarnishId } from "@/game/ingredients";
import { ICE_TUB } from "./icePile";
import iceWellLayout from "./iceWellLayout.json";
import type { Spot, XZ } from "./layout";

export const ICE_SIZE = 0.021;

// One physics body per cube in the drink state. New cubes drop from above the
// vessel with a little spread so they tumble instead of stacking in a column.
export function IceCubes({ count, at, dropY }: { count: number; at: XZ; dropY: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <RigidBody
          key={i}
          colliders="cuboid"
          ccd
          restitution={0.15}
          friction={0.7}
          position={[at[0] + (((i * 37) % 7) - 3) * 0.003, dropY + (i % 3) * 0.024, at[1] + (((i * 53) % 7) - 3) * 0.003]}
          rotation={[i * 0.7, i * 1.3, i * 0.4]}
        >
          <IceCube />
        </RigidBody>
      ))}
    </>
  );
}

export function IceCube({ position }: { position?: [number, number, number] }) {
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={[ICE_SIZE, ICE_SIZE, ICE_SIZE]} />
      <meshStandardMaterial color="#eaf7ff" transparent opacity={0.72} roughness={0.08} />
    </mesh>
  );
}

// Small stylized garnishes; position is where the garnish's center sits.
export function GarnishModel({ id }: { id: GarnishId }) {
  switch (id) {
    case "lime-wedge":
      return (
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.014, 0.014, 0.012, 16, 1, false, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#8fcf4a" roughness={0.5} />
        </mesh>
      );
    case "lemon-wheel":
      return (
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.016, 0.016, 0.004, 20]} />
          <meshStandardMaterial color="#f5dc4a" roughness={0.5} />
        </mesh>
      );
    case "lemon-twist":
      return (
        <mesh rotation={[0.4, 0, 0.6]} castShadow>
          <torusGeometry args={[0.009, 0.0025, 6, 20, Math.PI * 1.6]} />
          <meshStandardMaterial color="#f2c832" roughness={0.5} />
        </mesh>
      );
    case "orange-peel":
      return (
        <mesh rotation={[0.3, 0, -0.5]} castShadow>
          <torusGeometry args={[0.011, 0.003, 6, 20, Math.PI * 1.4]} />
          <meshStandardMaterial color="#f08a1c" roughness={0.5} />
        </mesh>
      );
    case "orange-wheel":
      return (
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.019, 0.019, 0.004, 20]} />
          <meshStandardMaterial color="#f39a2a" roughness={0.5} />
        </mesh>
      );
    case "cherry":
      return (
        <group>
          <mesh castShadow>
            <sphereGeometry args={[0.008, 14, 10]} />
            <meshStandardMaterial color="#9b0f1f" roughness={0.25} />
          </mesh>
          <mesh position={[0.002, 0.014, 0]} rotation={[0, 0, -0.25]}>
            <cylinderGeometry args={[0.0007, 0.0007, 0.02, 6]} />
            <meshStandardMaterial color="#5a6b2a" />
          </mesh>
        </group>
      );
    case "mint":
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[(i - 1) * 0.006, 0.004 + (i % 2) * 0.004, 0]} rotation={[0.3, i * 1.9, (i - 1) * 0.5]} scale={[1, 0.25, 0.6]} castShadow>
              <sphereGeometry args={[0.008, 10, 8]} />
              <meshStandardMaterial color="#3f9a3a" roughness={0.6} />
            </mesh>
          ))}
        </group>
      );
    case "olive":
      return (
        <group>
          <mesh castShadow scale={[1, 1.25, 1]}>
            <sphereGeometry args={[0.007, 14, 10]} />
            <meshStandardMaterial color="#6c8a2e" roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.0008, 0.0008, 0.05, 6]} />
            <meshStandardMaterial color="#b98a4a" />
          </mesh>
        </group>
      );
  }
}

export const ICE_TUB_DEPTH = ICE_TUB.depth;

// The ice in the well. Its heap was settled once with physics by
// scripts/settle-ice.mjs, so cubes rest on each other like real ice; here it's
// just drawn, with no simulation. One instanced mesh: a single draw call.
function TubIce() {
  const ice = useRef<InstancedMesh>(null);
  const { cubeSize, cubes } = iceWellLayout as { cubeSize: number; cubes: number[][] };
  useLayoutEffect(() => {
    const m = new Matrix4();
    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3().setScalar(cubeSize);
    cubes.forEach(([x, y, z, qx, qy, qz, qw], i) => {
      ice.current?.setMatrixAt(i, m.compose(p.set(x, y, z), q.set(qx, qy, qz, qw), s));
    });
    if (ice.current) ice.current.instanceMatrix.needsUpdate = true;
  }, [cubeSize, cubes]);
  return (
    <instancedMesh ref={ice} args={[undefined, undefined, cubes.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#eaf7ff" transparent opacity={0.82} roughness={0.12} />
    </instancedMesh>
  );
}

// The well itself: a deep steel tub sunk into the underbar, full of ice.
// The invisible lid over the opening is the grab target for scooping.
export function IceWell({ at, size }: { at: Spot; size: XZ }) {
  const [w, d] = size;
  const rim = 0.012;
  const wall = 0.004;
  const steelInside = { color: "#6b7178", metalness: 0.55, roughness: 0.45 } as const;
  return (
    <group position={at}>
      <mesh position={[0, -ICE_TUB_DEPTH - wall / 2, 0]} receiveShadow>
        <boxGeometry args={[w, wall, d]} />
        <meshStandardMaterial {...steelInside} />
      </mesh>
      {(
        [
          [0, -d / 2, w, wall],
          [0, d / 2, w, wall],
          [-w / 2, 0, wall, d],
          [w / 2, 0, wall, d],
        ] as const
      ).map(([x, z, sx, sz], i) => (
        <mesh key={`w${i}`} position={[x, -ICE_TUB_DEPTH / 2, z]} receiveShadow>
          <boxGeometry args={[sx, ICE_TUB_DEPTH, sz]} />
          <meshStandardMaterial {...steelInside} />
        </mesh>
      ))}
      {(
        [
          [0, -d / 2 - rim / 2, w + rim * 2, rim],
          [0, d / 2 + rim / 2, w + rim * 2, rim],
          [-w / 2 - rim / 2, 0, rim, d],
          [w / 2 + rim / 2, 0, rim, d],
        ] as const
      ).map(([x, z, sx, sz], i) => (
        <mesh key={`r${i}`} position={[x, 0.004, z]} castShadow receiveShadow>
          <boxGeometry args={[sx, 0.012, sz]} />
          <meshStandardMaterial color="#c3c7cc" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      <TubIce />
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[w, 0.03, d]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// Garnish caddy: a steel tray with four white cups, like the ones on a real well.
export function GarnishCaddy({ at, cups }: { at: Spot; cups: Spot[] }) {
  const zs = cups.map(([, , z]) => z);
  const depth = Math.max(...zs) - Math.min(...zs) + 0.06;
  return (
    <group>
      <mesh position={[at[0], 0.004, at[2]]} receiveShadow castShadow>
        <boxGeometry args={[0.13, 0.008, depth]} />
        <meshStandardMaterial color="#b7bcc1" metalness={0.6} roughness={0.35} />
      </mesh>
      {cups.map(([x, , z], i) => (
        <mesh key={i} position={[x, 0.014, z]} castShadow>
          <cylinderGeometry args={[0.022, 0.018, 0.02, 20, 1, true]} />
          <meshStandardMaterial color="#f2f0ea" roughness={0.6} side={DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
