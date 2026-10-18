"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import type { Mesh, MeshStandardMaterial } from "three";

const GRAVITY = 9.81;
const START_SPEED = 0.6; // m/s the liquid leaves the spout with
const RADIUS = 0.0026;

type PourStreamProps = {
  pouring: boolean;
  color: string | null;
  spout: RefObject<{ spout: { x: number; y: number; z: number } }>; // the held bottle's spout, updated every frame
  surfaceY: number | null; // liquid surface in the vessel being poured into
};

// The stream is a column from `top` down to `bottom`. When a pour starts, the
// bottom falls from the spout under gravity until it reaches the surface. When
// it stops, the top lets go of the spout and falls too, until the stream is gone.
export default function PourStream({ pouring, color, spout, surfaceY }: PourStreamProps) {
  const mesh = useRef<Mesh>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const s = useRef({ top: 0, bottom: 0, x: 0, z: 0, surface: 0, headV: 0, tailV: 0, live: false, attached: false });

  useFrame((_, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(rawDt, 0.05);
    const st = s.current;
    if (surfaceY !== null) st.surface = surfaceY;
    // Keep the last color while the tail falls after the pour has stopped.
    if (color && material.current) material.current.color.set(color);

    if (pouring && spout.current) {
      const { x, y, z } = spout.current.spout;
      if (!st.attached) {
        // A fresh pour: the liquid starts at the spout.
        st.bottom = y;
        st.headV = START_SPEED;
        st.live = true;
        st.attached = true;
      }
      st.top = y;
      st.x = x;
      st.z = z;
      st.tailV = START_SPEED;
    } else if (st.attached) {
      st.attached = false; // stopped: the tail falls away from the spout
    }

    if (!st.live) {
      m.visible = false;
      return;
    }
    if (st.bottom > st.surface) {
      st.headV += GRAVITY * dt;
      st.bottom = Math.max(st.surface, st.bottom - st.headV * dt);
    }
    if (!st.attached) {
      st.tailV += GRAVITY * dt;
      st.top -= st.tailV * dt;
      if (st.top <= st.bottom) {
        st.live = false;
        m.visible = false;
        return;
      }
    }
    const length = Math.max(0.0005, st.top - st.bottom);
    m.visible = true;
    m.position.set(st.x, st.bottom + length / 2, st.z);
    m.scale.set(1, length, 1);
  });

  return (
    <mesh ref={mesh} visible={false}>
      <cylinderGeometry args={[RADIUS * 0.85, RADIUS, 1, 10]} />
      <meshStandardMaterial ref={material} transparent opacity={0.85} roughness={0.1} />
    </mesh>
  );
}
