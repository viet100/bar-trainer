"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  CanvasTexture,
  DoubleSide,
  LatheGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import { liquidHeight, POURER_HEIGHT, spoutHeight, type BottleShape, type BottleStyle } from "./bottleStyles";
import { RAILS, type Spot } from "./layout";
import { glassOutline, liquidOutline } from "./shapes";

const HELD_TILT = 0.15; // a slight lean the moment you pick it up
export const POUR_TILT = 2.05; // radians, tipped sideways with the neck down into the vessel
const RATE = 14; // easing speed per second; frame-rate independent

// Square bottles start their four lathe segments on a diagonal so a flat face points at the camera.
const lathe = (profile: readonly (readonly [number, number])[], shape: BottleShape) =>
  new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    shape.segments,
    shape.segments === 4 ? Math.PI / 4 : 0,
  );

// Shells and liquids are shared by every bottle with the same shape and fill.
const shellCache = new Map<BottleShape, LatheGeometry>();
const liquidCache = new Map<string, LatheGeometry>();
function shellOf(shape: BottleShape) {
  let g = shellCache.get(shape);
  if (!g) shellCache.set(shape, (g = lathe(glassOutline({ inner: [...shape.inner], wall: shape.wall }), shape)));
  return g;
}
function liquidOf(style: BottleStyle) {
  const key = `${style.shape.inner.join()}|${style.fill}`;
  let g = liquidCache.get(key);
  if (!g) liquidCache.set(key, (g = lathe(liquidOutline([...style.shape.inner], liquidHeight(style), 0.001), style.shape)));
  return g;
}

// Label card: big, high-contrast type on a cream card (or other colors), up to two lines.
const LABEL_PX: [number, number] = [256, 110];
export const LABEL_SIZE: [number, number] = [0.052, (0.052 * LABEL_PX[1]) / LABEL_PX[0]];
// The card floats up near the bottle's shoulders, a little in front of it toward the bartender.
const labelOffset = (style: BottleStyle) => new Vector3(0, spoutHeight(style) * 0.74, 0.042);

export function labelTexture(name: string, colors = { card: "#f6efe0", ink: "#16100b" }) {
  const [w, h] = LABEL_PX;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = colors.card;
  g.beginPath();
  g.roundRect(2, 2, w - 4, h - 4, 18);
  g.fill();
  g.fillStyle = colors.ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const words = name.toUpperCase().split(" ");
  const lines = words.length > 1 ? [words.slice(0, -1).join(" "), words.at(-1)!] : words;
  const size = lines.length > 1 ? 40 : 52;
  g.font = `800 ${size}px system-ui, -apple-system, sans-serif`;
  lines.forEach((line, i) => {
    const y = h / 2 + (i - (lines.length - 1) / 2) * (size + 4);
    g.fillText(line, w / 2, y, w - 20); // maxWidth squeezes long words instead of clipping
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Shared with the scene while this bottle is held: where its base should be
// (under the cursor), how close it is to a vessel (0-1), that vessel's pour
// point, and which side of the vessel the bottle tips from (+1 = from the right).
export type HeldBottle = {
  base: Vector3;
  reach: number;
  mouth: Vector3 | null;
  side: 1 | -1;
  spout: Vector3; // written back every frame: where the pour stream starts
};



type Bottle3DProps = {
  name: string;
  color: string; // the liquid
  style: BottleStyle;
  home: Spot;
  held: RefObject<HeldBottle> | null; // null while it sits on the shelf
  onGrab: (e: ThreeEvent<PointerEvent>) => void;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

export default function Bottle3D({ name, color, style, home, held, onGrab }: Bottle3DProps) {
  const spoutY = spoutHeight(style);
  const spoutLocal = useMemo(() => new Vector3(0, spoutY, 0), [spoutY]);
  const cardOffset = useMemo(() => labelOffset(style), [style]);
  const ref = useRef<Group>(null);
  const card = useRef<Mesh>(null);
  const cardMaterial = useRef<MeshBasicMaterial>(null);
  const { camera } = useThree();
  const label = useMemo(() => labelTexture(name), [name]);
  // Bottle glass is see-through and doesn't block what's behind it, so draw
  // order decides which bottle looks in front. Seen from above, the raised
  // back rail sorts as nearer than the front rail and would paint over its
  // shoulders: draw resting back-rail bottles first. A held bottle sorts normally.
  const backRow = home[2] < RAILS[RAILS.length - 1].z;
  const shellOrder = backRow && !held ? 1.5 : 2;
  useEffect(() => () => label.dispose(), [label]);

  const goal = useMemo(() => new Vector3(), []);
  const pourPos = useMemo(() => new Vector3(), []);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = 1 - Math.exp(-RATE * Math.min(dt, 0.05));
    let roll = 0; // rotation about z: tipping sideways
    const h = held?.current;
    if (h) {
      // Tip further the closer you bring it, neck toward the vessel. Near it,
      // slide the bottle beside the vessel so the spout sits over its center.
      const near = smooth(h.reach);
      const tilt = HELD_TILT + (POUR_TILT - HELD_TILT) * near;
      roll = h.side * tilt;
      goal.copy(h.base);
      if (h.mouth && near > 0) {
        // The spout is spoutY up the bottle's axis; rolled by `roll` it sits at
        // (-sin, cos) * spoutY from the base, so put the base that far back.
        pourPos.set(h.mouth.x + spoutY * Math.sin(roll), h.mouth.y - spoutY * Math.cos(roll), h.mouth.z);
        goal.lerp(pourPos, near);
      }
    } else {
      goal.set(...home);
    }
    g.position.lerp(goal, k);
    g.rotation.z += (roll - g.rotation.z) * k;
    if (h) {
      g.updateMatrixWorld();
      h.spout.copy(spoutLocal).applyMatrix4(g.matrixWorld);
    }

    // The label card follows the bottle but always faces the camera squarely,
    // and fades out while the bottle is tipped to pour.
    const c = card.current;
    if (c && cardMaterial.current) {
      c.position.copy(g.position).add(cardOffset);
      c.quaternion.copy(camera.quaternion);
      const opacity = Math.max(0, 1 - Math.abs(g.rotation.z) / 0.6);
      cardMaterial.current.opacity = opacity;
      c.visible = opacity > 0.02;
    }
  });

  return (
    <>
      <group
        ref={ref}
        position={[...home]}
        onPointerDown={onGrab}
        onPointerOver={() => (document.body.style.cursor = "grab")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        {/* The liquid, seen through the bottle */}
        <mesh geometry={liquidOf(style)} renderOrder={1}>
          <meshStandardMaterial color={color} transparent opacity={0.9} roughness={0.2} />
        </mesh>
        {/* Glass (or plastic) shell */}
        <mesh geometry={shellOf(style.shape)} castShadow renderOrder={shellOrder}>
          <meshStandardMaterial
            color={style.glass.color}
            transparent
            opacity={style.glass.opacity}
            roughness={style.glass.roughness}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <Pourer style={style} />
      </group>
      {/* Grabbing the card picks up its bottle too */}
      <mesh
        ref={card}
        position={[home[0], home[1] + cardOffset.y, home[2] + cardOffset.z]}
        onPointerDown={onGrab}
        renderOrder={5}
      >
        <planeGeometry args={LABEL_SIZE} />
        <meshBasicMaterial ref={cardMaterial} map={label} transparent toneMapped={false} />
      </mesh>
    </>
  );
}

// Steel speed pourer on liquor; a colored plastic tip on squeeze bottles.
function Pourer({ style }: { style: BottleStyle }) {
  const mouth = style.shape.inner[style.shape.inner.length - 1];
  const y = mouth[1] + POURER_HEIGHT / 2;
  const r = mouth[0] + style.shape.wall;
  if (style.pourer.kind === "tip") {
    return (
      <mesh position={[0, y, 0]}>
        <cylinderGeometry args={[0.002, r, POURER_HEIGHT, 16]} />
        <meshStandardMaterial color={style.pourer.color} roughness={0.5} />
      </mesh>
    );
  }
  return (
    <group position={[0, y, 0]}>
      {/* rubber cork in the neck, steel spout angled out of it */}
      <mesh position={[0, -POURER_HEIGHT / 2 + 0.003, 0]}>
        <cylinderGeometry args={[r, r, 0.006, 16]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.003, 0]}>
        <cylinderGeometry args={[0.0028, 0.004, POURER_HEIGHT - 0.006, 10]} />
        <meshStandardMaterial color="#c4c8cd" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}
