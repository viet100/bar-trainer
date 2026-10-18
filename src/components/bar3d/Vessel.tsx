"use client";

import { RigidBody } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import { DoubleSide, LatheGeometry, Vector2 } from "three";
import { glassOutline, heightForFraction, liquidOutline, radiusAt, SHAPES } from "./shapes";

export type ShapeId = keyof typeof SHAPES;

const lathe = (profile: [number, number][], segments = 48) =>
  new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);

// Liquid geometry is rebuilt as the level changes; rounding the height to
// half a millimeter keeps that to a few rebuilds per second of pouring.
const STEP = 0.0005;

type VesselProps = {
  shape: ShapeId;
  position: [number, number, number];
  fill: number; // 0-1 of the vessel's volume
  liquidColor: string | null;
  targetFill?: number | null; // pour assist ring
  highlight?: boolean; // being aimed at
  solid?: boolean; // collide with ice (the glass on the mat)
};

const geometryCache = new Map<ShapeId, LatheGeometry>();
const vesselGeometry = (shape: ShapeId) => {
  let g = geometryCache.get(shape);
  if (!g) geometryCache.set(shape, (g = lathe(glassOutline(SHAPES[shape]))));
  return g;
};

// Invisible fixed walls for ice to land in, for a vessel that can move (the
// tin): it stays put at the vessel's home spot instead of following the drag.
export function VesselCollider({ shape, position }: { shape: ShapeId; position: [number, number, number] }) {
  return (
    <RigidBody type="fixed" colliders="trimesh" position={position}>
      <mesh geometry={vesselGeometry(shape)} visible={false} />
    </RigidBody>
  );
}

export default function Vessel({ shape, position, fill, liquidColor, targetFill, highlight, solid }: VesselProps) {
  const s = SHAPES[shape];
  const isTin = shape === "tin" || shape === "smallTin";
  const glassGeo = vesselGeometry(shape);

  const bottom = s.inner[0][1];
  const level = fill > 0.002 ? Math.round(heightForFraction(s.inner, fill) / STEP) * STEP : 0;
  const liquidGeo = useMemo(
    () => (liquidColor && level > bottom + STEP ? lathe(liquidOutline(s.inner, level), 40) : null),
    [s, level, bottom, liquidColor],
  );
  useEffect(() => () => liquidGeo?.dispose(), [liquidGeo]);

  const ring = targetFill != null && targetFill > 0 ? heightForFraction(s.inner, Math.min(1, targetFill)) : null;
  const rimR = s.inner[s.inner.length - 1][0] + s.wall;

  const body = (
    <mesh geometry={glassGeo} castShadow renderOrder={2}>
      {isTin ? (
        // Brushed steel: full metalness renders near-black with nothing around to reflect.
        <meshStandardMaterial color="#d9dce0" metalness={0.55} roughness={0.38} />
      ) : (
        <meshStandardMaterial color="#e3eef2" transparent opacity={0.2} roughness={0.05} side={DoubleSide} depthWrite={false} />
      )}
    </mesh>
  );

  return (
    <group position={position}>
      {solid ? (
        <RigidBody key={shape} type="fixed" colliders="trimesh">
          {body}
        </RigidBody>
      ) : (
        body
      )}

      {s.stem && (
        <>
          <mesh position={[0, s.stem.top / 2, 0]} castShadow>
            <cylinderGeometry args={[0.0032, 0.0045, s.stem.top, 12]} />
            <meshStandardMaterial color="#e3eef2" transparent opacity={0.35} roughness={0.05} />
          </mesh>
          <mesh position={[0, 0.002, 0]} receiveShadow>
            <cylinderGeometry args={[s.stem.footRadius, s.stem.footRadius, 0.004, 32]} />
            <meshStandardMaterial color="#e3eef2" transparent opacity={0.35} roughness={0.05} />
          </mesh>
        </>
      )}

      {liquidGeo && liquidColor && (
        <mesh geometry={liquidGeo} renderOrder={1}>
          <meshStandardMaterial color={liquidColor} transparent opacity={0.88} roughness={0.15} />
        </mesh>
      )}

      {ring !== null && (
        <mesh position={[0, ring, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
          <torusGeometry args={[radiusAt(s.inner, ring) + 0.0006, 0.0009, 6, 48]} />
          <meshBasicMaterial color="#fcd34d" />
        </mesh>
      )}

      {highlight && (
        <mesh position={[0, 0.0015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[rimR + 0.006, rimR + 0.012, 48]} />
          <meshBasicMaterial color="#fcd34d" transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}
