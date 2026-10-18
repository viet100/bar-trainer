"use client";

import { Canvas, events, useFrame, useThree, type RootState, type ThreeEvent } from "@react-three/fiber";
import { CuboidCollider, Physics, RigidBody } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Color, Plane, Raycaster, Vector2, Vector3, type Camera, type Group, type PerspectiveCamera } from "three";
import { ICE_CUBE_ML, capacityMl, liquidMl, type DrinkAction, type DrinkState, type Vessel as VesselState, type VesselId } from "@/game/drink";
import { GLASS_IDS, type GlassId } from "@/game/glassware";
import { INGREDIENTS, INGREDIENT_IDS, type GarnishId, type IngredientId } from "@/game/ingredients";
import { SHAKE_OVER_S, SHAKE_READY_S } from "@/game/score";
import Bottle3D, { type HeldBottle } from "./Bottle3D";
import { BOTTLE_STYLES } from "./bottleStyles";
import {
  BAR_TOP,
  BAR_TOP_BACK,
  BAR_TOP_FRONT,
  CAMERA,
  CAP_HOME,
  DROP_RADIUS,
  GARNISH_IDS,
  GARNISH_TRAY,
  CARRY_Y,
  ICE_WELL,
  ICE_WELL_SIZE,
  LIFT,
  MAT,
  POUR_AT,
  POUR_INNER,
  SINK,
  RAILS,
  TIN,
  VESSEL_SPOT,
  bottleHome,
  clearHeight,
  distance,
  garnishHome,
  glassHome,
  onMat,
  pourReach,
  xz,
  type XZ,
} from "./layout";
import PourStream from "./PourStream";
import { GarnishCaddy, GarnishModel, IceCube, IceCubes, IceWell } from "./props";
import { CAP_INSET, heightForFraction, rimHeight, SHAPES } from "./shapes";
import Vessel, { VesselCollider, type ShapeId } from "./Vessel";

const ICE_SCOOP = 3;
const SHAKE_SPEED = 0.6; // px per ms of pointer movement that counts as shaking
const AIM_SETTLE_MS = 150; // a bottle must hover this long before it pours
const POUR_HYSTERESIS = 0.08; // once pouring, it keeps going down to POUR_AT minus this
const FOLLOW_RATE = 22; // easing speed per second into poses and back home
const HELD_RATE = 50; // easing speed per second while following the cursor: about two frames behind
const STRAIN_TILT = 1.9; // radians the tin tips over the glass when straining

type Drag =
  | { kind: "bottle"; id: IngredientId }
  | { kind: "glass"; id: GlassId }
  | { kind: "garnish"; id: GarnishId }
  | { kind: "ice" }
  | { kind: "tin" } // the big tin, with the small one riding along if capped
  | { kind: "cap" }; // the small tin

export type BarSceneProps = {
  drink: DrinkState;
  pouringId: IngredientId | null;
  pouringInto: VesselId | null;
  targetFill: Record<VesselId, number | null>; // pour assist rings
  onPour: (id: IngredientId, into: VesselId) => void;
  onPourStop: () => void;
  onAction: (action: DrinkAction) => void;
  onNudge: (message: string) => void;
  gaugeAnchor: RefObject<HTMLDivElement | null>; // HTML pinned beside the vessel being poured into
  overlay?: ReactNode;
};

const colorOf = (id: string) => INGREDIENTS[id as IngredientId]?.color ?? "#888";

// Volume-weighted average color: a shaken drink is one color, not stripes.
function mixColor(v: VesselState): string | null {
  const c = new Color(0, 0, 0);
  let total = 0;
  for (const [id, ml] of Object.entries(v.contents)) {
    if (!ml) continue;
    const k = new Color(colorOf(id));
    c.r += k.r * ml;
    c.g += k.g * ml;
    c.b += k.b * ml;
    total += ml;
  }
  return total > 0 ? `#${c.multiplyScalar(1 / total).getHexString()}` : null;
}

// Liquid level by volume; ice under the surface pushes it up.
const fillOf = (v: VesselState, capacity: number) => {
  const liquid = liquidMl(v);
  return capacity > 0 ? (liquid + Math.min(v.ice * ICE_CUBE_ML, liquid)) / capacity : 0;
};

const shapeIn = (drink: DrinkState, v: VesselId): ShapeId | null => (v === "shaker" ? "tin" : drink.glass);
const rimOf = (shape: ShapeId) => rimHeight(SHAPES[shape].inner);
const rimRadius = (shape: ShapeId) => SHAPES[shape].inner[SHAPES[shape].inner.length - 1][0];
// Base of the small tin when it sits upside down in the big one.
const CAP_SEAT_Y = rimOf("tin") - CAP_INSET + rimOf("smallTin");

export type ShakeMeterRefs = {
  root: RefObject<HTMLDivElement | null>;
  fill: RefObject<HTMLDivElement | null>;
  label: RefObject<HTMLSpanElement | null>;
};

// The bar spans 0 to "over" with a tick at "ready"; both come from the scoring
// rules, so the meter and the grade always agree.
const SHAKE_STATES = [
  { below: SHAKE_READY_S, word: "Keep shaking", color: "#fcd34d" },
  { below: SHAKE_OVER_S, word: "Ready to strain", color: "#34d399" },
  { below: Infinity, word: "Over-diluted", color: "#f87171" },
];

export default function BarScene(props: BarSceneProps) {
  const meterRoot = useRef<HTMLDivElement>(null);
  const meterFill = useRef<HTMLDivElement>(null);
  const meterLabel = useRef<HTMLSpanElement>(null);
  return (
    <div className="relative h-full w-full touch-none select-none">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [...CAMERA.position], fov: CAMERA.fov, near: 0.01, far: 10 }}
        events={clientEvents}
      >
        <color attach="background" args={["#140e0a"]} />
        <FitCamera />
        <Scene {...props} meter={{ root: meterRoot, fill: meterFill, label: meterLabel }} />
      </Canvas>
      {/* Shake meter, pinned beside the shaker by the scene every frame */}
      <div ref={meterRoot} className="pointer-events-none absolute left-0 top-0 hidden">
        <div className="w-28 -translate-y-1/2 rounded-lg bg-stone-950/80 px-2 py-1.5 shadow-lg shadow-black/50">
          <span ref={meterLabel} className="block text-[11px] font-semibold text-white" />
          <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-white/15">
            <div ref={meterFill} className="h-full w-0 rounded-full" />
            {/* "ready" tick */}
            <div className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: `${(SHAKE_READY_S / SHAKE_OVER_S) * 100}%` }} />
          </div>
        </div>
      </div>
      {props.overlay}
    </div>
  );
}

type SceneProps = BarSceneProps & { meter: ShakeMeterRefs };

function Scene(props: SceneProps) {
  const { drink, pouringId, pouringInto, targetFill } = props;
  const { camera, gl } = useThree();

  // Latest props for the window listeners, which live for a whole drag.
  const latest = useRef<SceneProps>(props);
  useEffect(() => {
    latest.current = props;
  });

  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<VesselId | "mat" | null>(null);
  const held = useRef(new Vector3()); // where the held thing's origin goes
  const bottle = useRef<HeldBottle>({ base: new Vector3(), reach: 0, mouth: null, side: 1, spout: new Vector3() });
  const shake = useRef({ ms: 0, x: 0, y: 0, t: 0, wobble: 0, warned: false });
  const tinPose = useRef<HeldPose>({ on: false, pos: new Vector3(), rot: 0 });

  // Picks something up so the exact point you clicked stays under the cursor:
  // the drag plane runs through that point (raised by the lift), and the
  // object keeps its offset from it. Ice and garnish instead glide to the
  // cursor and float at CARRY_Y, above both counters.
  // Listeners go on the window right away, not in an effect, so a quick flick
  // can't finish before they exist.
  const grab = (d: Drag, e: ThreeEvent<PointerEvent>, origin: [number, number, number]) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const magnet = d.kind === "ice" || d.kind === "garnish";
    const lift = d.kind === "bottle" ? LIFT.bottle : magnet ? 0 : LIFT.item;
    const planeY = magnet ? CARRY_Y : e.point.y + lift;
    const baseY = magnet ? CARRY_Y : origin[1] + lift;
    const offX = magnet ? 0 : origin[0] - e.point.x;
    const offZ = magnet ? 0 : origin[2] - e.point.z;
    // The tins are carried low, so they climb over the bar top's edge. As one
    // rises, the grabbed point must rise with it to stay under the cursor. The
    // height that does that is where the cursor's ray meets the climb, found
    // by bisection: aiming higher only ever lands closer to the bartender,
    // where the climb is lower, so there's exactly one answer.
    const climbs = d.kind === "tin" || d.kind === "cap";
    const grabAbove = planeY - baseY; // how far the grabbed point sits above the object's origin
    const settle = (clientX: number, clientY: number, aimY: number) => {
      pointerOnPlane(HIT, camera, gl.domElement, clientX, clientY, aimY);
      return clearHeight(HIT.z + offZ, baseY) + grabAbove - aimY; // > 0: aim higher
    };
    const follow = (clientX: number, clientY: number) => {
      let aimY = planeY;
      if (climbs && settle(clientX, clientY, planeY) > 0) {
        let lo = planeY;
        let hi = planeY + BAR_TOP + 0.1;
        for (let i = 0; i < 24; i++) {
          aimY = (lo + hi) / 2;
          if (settle(clientX, clientY, aimY) > 0) lo = aimY;
          else hi = aimY;
        }
        aimY = hi;
      }
      pointerOnPlane(HIT, camera, gl.domElement, clientX, clientY, aimY);
      held.current.set(HIT.x + offX, aimY - grabAbove, HIT.z + offZ);
    };
    follow(e.nativeEvent.clientX, e.nativeEvent.clientY);

    shake.current = { ms: 0, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, t: e.nativeEvent.timeStamp, wobble: 0, warned: false };
    if (d.kind === "cap" && latest.current.drink.shakerCapped) latest.current.onAction({ type: "uncapShaker" });
    document.body.style.cursor = "grabbing";
    setDrag(d);

    const now: { over: VesselId | "mat" | null; want: VesselId | null; pouring: VesselId | null; timer?: ReturnType<typeof setTimeout> } = {
      over: null,
      want: null,
      pouring: null,
    };
    const here = (): XZ => [held.current.x, held.current.z];
    const spotUnder = (): VesselId | "mat" | null => {
      const p = here();
      if (onMat(p)) return latest.current.drink.glass ? "glass" : "mat";
      if (distance(p, xz(TIN)) < DROP_RADIUS) return "shaker";
      return null;
    };
    const setOver = (spot: VesselId | "mat" | null) => {
      if (spot === now.over) return;
      now.over = spot;
      setHover(spot);
    };

    // Bottle: aim by where the cursor points at each vessel's opening (its
    // rim height), so "cursor over the tin" means pour into the tin. Tilt with
    // reach to the nearest open vessel; pour once tipped far enough.
    const aimBottle = (id: IngredientId, clientX: number, clientY: number) => {
      const { drink: dk, onPour, onPourStop, onNudge } = latest.current;
      const open: VesselId[] = [];
      if (dk.glass) open.push("glass");
      if (!dk.shakerCapped) open.push("shaker");
      let best: VesselId | null = null;
      let bestD = Infinity;
      for (const v of open) {
        const [vx, vy, vz] = VESSEL_SPOT[v];
        pointerOnPlane(AIM, camera, gl.domElement, clientX, clientY, vy + rimOf(shapeIn(dk, v)!));
        const dist = distance([AIM.x, AIM.z], [vx, vz]);
        if (dist < bestD) [best, bestD] = [v, dist];
      }
      const reach = best ? pourReach(bestD) : 0;
      const b = bottle.current;
      b.base.copy(held.current);
      // Rise smoothly to clear the bar top's edge instead of snapping onto it.
      b.base.y = clearHeight(b.base.z, b.base.y);
      const at = best && VESSEL_SPOT[best];
      // Tip from whichever side the bottle came in on; don't flip mid-pour.
      if (at && b.reach === 0 && reach > 0) b.side = b.base.x >= at[0] ? 1 : -1;
      b.reach = reach;
      b.mouth = best && at && reach > 0 ? MOUTH.set(at[0], at[1] + rimOf(shapeIn(dk, best)!) + 0.05, at[2]) : null;
      setOver(best && reach > 0.3 ? best : null);
      if (!dk.glass) {
        pointerOnPlane(AIM, camera, gl.domElement, clientX, clientY, MAT[1]);
        if (distance([AIM.x, AIM.z], xz(MAT)) < POUR_INNER) onNudge("Drag a glass onto the mat first");
      }

      const keep = now.pouring === best && reach >= POUR_AT - POUR_HYSTERESIS;
      const want = keep || reach >= POUR_AT ? best : null;
      if (want === now.want) return;
      now.want = want;
      clearTimeout(now.timer);
      if (now.pouring) {
        now.pouring = null;
        onPourStop();
      }
      if (want) {
        now.timer = setTimeout(() => {
          now.pouring = want;
          onPour(id, want);
        }, AIM_SETTLE_MS);
      }
    };
    if (d.kind === "bottle") aimBottle(d.id, e.nativeEvent.clientX, e.nativeEvent.clientY);

    const move = (ev: PointerEvent) => {
      follow(ev.clientX, ev.clientY);
      if (d.kind === "bottle") {
        aimBottle(d.id, ev.clientX, ev.clientY);
        return;
      }
      const spot = spotUnder();
      setOver(d.kind === "tin" ? (spot === "glass" ? "glass" : null) : spot);

      if (d.kind === "tin") {
        // Over the glass and open: lift and tip the tin so its lip pours into the glass.
        const { drink: dk } = latest.current;
        const pose = tinPose.current;
        pose.on = spot === "glass" && !dk.shakerCapped && !!dk.glass;
        if (pose.on && dk.glass) {
          const side = held.current.x >= MAT[0] ? 1 : -1;
          pose.rot = side * STRAIN_TILT;
          const lipY = MAT[1] + rimOf(dk.glass) + 0.035;
          const rim = rimOf("tin");
          // Tin mouth sits rim up its axis; rolled by `rot` it's at (-sin, cos) * rim from the base.
          pose.pos.set(MAT[0] + rim * Math.sin(pose.rot), lipY - rim * Math.cos(pose.rot), MAT[2]);
        }
      }

      if (d.kind === "tin") {
        // Only quick back-and-forth motion counts as shaking, not slow dragging.
        const s = shake.current;
        const dt = ev.timeStamp - s.t;
        const speed = Math.hypot(ev.clientX - s.x, ev.clientY - s.y) / Math.max(dt, 1);
        if (dt > 0 && dt < 100 && speed > SHAKE_SPEED) s.ms += dt;
        if (s.ms > 400 && !latest.current.drink.shakerCapped && !s.warned) {
          s.warned = true;
          latest.current.onNudge("Cap it first: drag the small tin onto the big one");
        }
        // Rattle only while capped, i.e. shaking; carrying an open tin keeps it level.
        s.wobble = latest.current.drink.shakerCapped ? Math.max(-1, Math.min(1, (ev.clientX - s.x) / 25)) : 0;
        s.x = ev.clientX;
        s.y = ev.clientY;
        s.t = ev.timeStamp;
      }
    };

    const drop = (ev: PointerEvent | FocusEvent) => {
      if ("clientX" in ev) follow(ev.clientX, ev.clientY); // a quick flick may have no move events
      const { onAction, onPourStop, onNudge, drink: dk } = latest.current;
      const spot = spotUnder();
      switch (d.kind) {
        case "bottle":
          clearTimeout(now.timer);
          if (now.pouring) onPourStop();
          bottle.current.reach = 0;
          bottle.current.mouth = null;
          break;
        case "glass":
          if (spot === "mat" || spot === "glass") onAction({ type: "selectGlass", glass: d.id });
          break;
        case "garnish":
          if (spot === "glass") onAction({ type: "garnish", garnish: d.id });
          else if (spot === "mat") onNudge("Garnish goes on a glass");
          break;
        case "ice":
          if (spot === "shaker" && dk.shakerCapped) onNudge("Take the small tin off first");
          else if (spot === "glass" || spot === "shaker") onAction({ type: "addIce", into: spot, cubes: ICE_SCOOP });
          else if (spot === "mat") onNudge("Drag a glass onto the mat first");
          break;
        case "tin":
          if (shake.current.ms > 0 && dk.shakerCapped) onAction({ type: "shake", ms: shake.current.ms });
          if (spot === "glass") {
            if (dk.shakerCapped) onNudge("Take the small tin off to strain");
            else if (liquidMl(dk.inShaker) > 0) onAction({ type: "strain" });
          }
          break;
        case "cap":
          if (distance(here(), xz(TIN)) < DROP_RADIUS) onAction({ type: "capShaker" });
          break;
      }
      tinPose.current.on = false;
      document.body.style.cursor = "";
      setHover(null);
      setDrag(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", drop);
      window.removeEventListener("blur", drop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
    window.addEventListener("blur", drop);
  };

  // Shake meter: total shake time (recorded + this grab, if capped). It stays
  // put beside the tin's spot on the drainboard, so it's readable while you shake.
  useFrame(() => {
    const { root, fill, label } = latest.current.meter;
    if (!root.current || !fill.current || !label.current) return;
    const holding = drag?.kind === "tin";
    const capped = drink.shakerCapped;
    const ms = drink.shakerMix.shakeMs + (holding && capped ? shake.current.ms : 0);
    const show = capped && (holding || ms > 0);
    root.current.style.display = show ? "block" : "none";
    if (!show) return;

    const screen = SCRATCH.set(TIN[0] + 0.09, TIN[1] + rimOf("tin") + 0.03, TIN[2]).project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    root.current.style.transform = `translate(${((screen.x + 1) / 2) * rect.width}px, ${((1 - screen.y) / 2) * rect.height}px)`;

    const secs = ms / 1000;
    const state = SHAKE_STATES.find((st) => secs < st.below)!;
    fill.current.style.width = `${Math.min(1, secs / SHAKE_OVER_S) * 100}%`;
    fill.current.style.background = state.color;
    label.current.textContent = state.word;
  });

  // Pin the pour gauge beside the vessel being poured into.
  useFrame(() => {
    const el = latest.current.gaugeAnchor.current;
    const shape = pouringInto && shapeIn(drink, pouringInto);
    if (!el || !pouringInto || !shape) return;
    const [x, y, z] = VESSEL_SPOT[pouringInto];
    const screen = SCRATCH.set(x + 0.07, y + rimOf(shape), z).project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    el.style.transform = `translate(${((screen.x + 1) / 2) * rect.width}px, ${((1 - screen.y) / 2) * rect.height}px)`;
  });

  const glassShape = drink.glass;
  const capped = drink.shakerCapped;
  const tinHeld = drag?.kind === "tin";
  const pourShape = pouringInto && shapeIn(drink, pouringInto);
  const grabCursor = {
    onPointerOver: () => (document.body.style.cursor = "grab"),
    onPointerOut: () => (document.body.style.cursor = drag ? "grabbing" : ""),
  };

  // Where the stream lands: the liquid surface in the vessel being poured into.
  let surfaceY: number | null = null;
  if (pouringInto && pourShape) {
    const vessel = pouringInto === "glass" ? drink.inGlass : drink.inShaker;
    const fill = fillOf(vessel, capacityMl(drink, pouringInto));
    surfaceY = VESSEL_SPOT[pouringInto][1] + heightForFraction(SHAPES[pourShape].inner, fill);
  }

  const smallTin = <Vessel shape="smallTin" position={[0, 0, 0]} fill={0} liquidColor={null} />;

  return (
    <>
      <hemisphereLight args={["#ffe9cc", "#2a1a10", 0.7]} />
      <directionalLight
        position={[0.3, 0.9, 0.5]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-0.6}
        shadow-camera-right={0.6}
        shadow-camera-top={0.6}
        shadow-camera-bottom={-0.6}
      />
      <pointLight position={[-0.3, 0.4, 0.2]} intensity={0.6} color="#ffb870" />

      <Station matLit={hover === "mat" || hover === "glass"} />

      {/* Physics loads its WASM engine asynchronously; the rest of the bar shouldn't wait for it. */}
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]}>
          <RigidBody type="fixed">
            <CuboidCollider args={[0.65, 0.02, (BAR_TOP_FRONT - BAR_TOP_BACK) / 2]} position={[0, BAR_TOP - 0.02, (BAR_TOP_FRONT + BAR_TOP_BACK) / 2]} />
            {underbarPieces(UNDERBAR_FRONT - BAR_TOP_FRONT).map(([x, z, w, d], i) => (
              <CuboidCollider key={i} args={[w / 2, 0.02, d / 2]} position={[x, -0.02, z]} />
            ))}
          </RigidBody>

          {/* The glass you're building, on the mat */}
          {glassShape && (
            <Vessel
              key={glassShape}
              shape={glassShape}
              position={MAT}
              fill={fillOf(drink.inGlass, capacityMl(drink, "glass"))}
              liquidColor={mixColor(drink.inGlass)}
              targetFill={targetFill.glass}
              highlight={hover === "glass"}
              solid
            />
          )}
          {glassShape && <IceCubes key={`g-${glassShape}`} count={drink.inGlass.ice} at={xz(MAT)} dropY={MAT[1] + rimOf(glassShape) + 0.04} />}

          {/* While the tin is in your hand its ice is "inside" it; the cubes drop back in when you set it down. */}
          {!tinHeld && (
            <>
              <VesselCollider shape="tin" position={TIN} />
              <IceCubes key="t" count={drink.inShaker.ice} at={xz(TIN)} dropY={TIN[1] + rimOf("tin") + 0.04} />
            </>
          )}
        </Physics>
      </Suspense>

      {/* Boston shaker: big tin, with the small tin seated upside down in it when capped */}
      <Follow active={tinHeld} home={TIN} held={held} wobble={shake} pose={tinPose}>
        <group {...grabCursor} onPointerDown={(e) => grab({ kind: "tin" }, e, TIN)}>
          <Vessel
            shape="tin"
            position={[0, 0, 0]}
            fill={fillOf(drink.inShaker, capacityMl(drink, "shaker"))}
            liquidColor={mixColor(drink.inShaker)}
            targetFill={targetFill.shaker}
            highlight={hover === "shaker" && !tinHeld}
          />
        </group>
        {capped && drag?.kind !== "cap" && (
          <group
            position={[0, CAP_SEAT_Y, 0]}
            rotation={[Math.PI, 0, 0]}
            {...grabCursor}
            onPointerDown={(e) => grab({ kind: "cap" }, e, [TIN[0], TIN[1] + rimOf("tin"), TIN[2]])}
          >
            {smallTin}
          </group>
        )}
      </Follow>
      {!capped && drag?.kind !== "cap" && (
        <group position={CAP_HOME} {...grabCursor} onPointerDown={(e) => grab({ kind: "cap" }, e, CAP_HOME)}>
          {smallTin}
        </group>
      )}
      {drag?.kind === "cap" && (
        <Follow active home={CAP_HOME} held={held}>
          {smallTin}
        </Follow>
      )}

      <PourStream pouring={!!pouringId && !!pouringInto} color={pouringId && colorOf(pouringId)} spout={bottle} surfaceY={surfaceY} />

      {/* Back bar */}
      {INGREDIENT_IDS.map((id) => (
        <Bottle3D
          key={id}
          name={INGREDIENTS[id].name}
          color={INGREDIENTS[id].color}
          style={BOTTLE_STYLES[id]}
          home={bottleHome(id)}
          held={drag?.kind === "bottle" && drag.id === id ? bottle : null}
          onGrab={(e) => grab({ kind: "bottle", id }, e, bottleHome(id))}
        />
      ))}

      {/* Glass rack; the glass you're carrying leaves its slot */}
      {GLASS_IDS.map((id) => {
        if (drag?.kind === "glass" && drag.id === id) return null;
        return (
          <group key={id} {...grabCursor} onPointerDown={(e) => grab({ kind: "glass", id }, e, glassHome(id))}>
            <Vessel shape={id} position={glassHome(id)} fill={0} liquidColor={null} />
          </group>
        );
      })}
      {drag?.kind === "glass" && (
        <Follow active home={glassHome(drag.id)} held={held}>
          <Vessel shape={drag.id} position={[0, 0, 0]} fill={0} liquidColor={null} />
        </Follow>
      )}

      {/* Garnish caddy on the underbar, left of the ice */}
      <GarnishCaddy at={GARNISH_TRAY} cups={GARNISH_IDS.map(garnishHome)} />
      {GARNISH_IDS.map((id) => {
        if (drag?.kind === "garnish" && drag.id === id) return null;
        return (
          <group key={id} position={garnishHome(id)} {...grabCursor} onPointerDown={(e) => grab({ kind: "garnish", id }, e, garnishHome(id))}>
            <GarnishModel id={id} />
            {/* a bigger invisible grab target than the tiny garnish itself */}
            <mesh visible={false}>
              <boxGeometry args={[0.04, 0.04, 0.045]} />
            </mesh>
          </group>
        );
      })}
      {drag?.kind === "garnish" && (
        <Follow active home={garnishHome(drag.id)} held={held}>
          <GarnishModel id={drag.id} />
        </Follow>
      )}
      {drink.garnish && glassShape && (
        <group position={[MAT[0] + rimRadius(glassShape) * 0.8, MAT[1] + rimOf(glassShape) + 0.004, MAT[2] + 0.005]}>
          <GarnishModel id={drink.garnish} />
        </group>
      )}

      {/* Ice well; a bundle of three cubes glides to the cursor when you grab it */}
      <group {...grabCursor} onPointerDown={(e) => grab({ kind: "ice" }, e, [ICE_WELL[0], CARRY_Y, ICE_WELL[2]])}>
        <IceWell at={ICE_WELL} size={ICE_WELL_SIZE} />
      </group>
      {drag?.kind === "ice" && (
        <Follow active home={[ICE_WELL[0], CARRY_Y, ICE_WELL[2]]} held={held}>
          {[-1, 0, 1].map((i) => (
            <IceCube key={i} position={[i * 0.021, (i % 2) * 0.012, i * 0.006]} />
          ))}
        </Follow>
      )}
    </>
  );
}

const UNDERBAR_FRONT = RAILS[0].z - 0.02; // the underbar's edge nearest the bartender
const UNDERBAR_WIDTH = 1.2;

// The underbar slab as four boxes [x, z, width, depth] that leave a hole for the ice well.
function underbarPieces(depth: number): [number, number, number, number][] {
  const [wx, , wz] = ICE_WELL;
  const [ww, wd] = ICE_WELL_SIZE;
  const back = BAR_TOP_FRONT;
  const front = back + depth;
  const left = -UNDERBAR_WIDTH / 2;
  const right = UNDERBAR_WIDTH / 2;
  const holeL = wx - ww / 2;
  const holeR = wx + ww / 2;
  const holeB = wz - wd / 2;
  const holeF = wz + wd / 2;
  return [
    [(left + holeL) / 2, (back + front) / 2, holeL - left, depth], // left of the hole
    [(holeR + right) / 2, (back + front) / 2, right - holeR, depth], // right of the hole
    [wx, (back + holeB) / 2, ww, holeB - back], // behind it
    [wx, (holeF + front) / 2, ww, front - holeF], // in front of it
  ];
}
const STEEL = { color: "#aab0b6", metalness: 0.6, roughness: 0.35 } as const;

// The fixed parts of the station: marble bar top with the rail mat on it,
// its steel face, the underbar work surface, the speed rail and the sink.
function Station({ matLit }: { matLit: boolean }) {
  const topDepth = BAR_TOP_FRONT - BAR_TOP_BACK;
  const underDepth = UNDERBAR_FRONT - BAR_TOP_FRONT;
  return (
    <group>
      {/* Marble bar top and the rubber rail mat the drink is built on */}
      <mesh position={[0, BAR_TOP - 0.02, (BAR_TOP_FRONT + BAR_TOP_BACK) / 2]} receiveShadow castShadow>
        <boxGeometry args={[1.3, 0.04, topDepth]} />
        <meshStandardMaterial color="#ddd8cf" roughness={0.35} />
      </mesh>
      <mesh position={[MAT[0], MAT[1] + 0.002, MAT[2]]} receiveShadow>
        <boxGeometry args={[0.44, 0.004, 0.13]} />
        <meshStandardMaterial color={matLit ? "#3a3a2a" : "#1b1b1d"} roughness={0.9} />
      </mesh>
      {/* Steel face below the bar top's front edge */}
      <mesh position={[0, (BAR_TOP - 0.04) / 2, BAR_TOP_FRONT + 0.005]} receiveShadow>
        <boxGeometry args={[1.3, BAR_TOP - 0.04, 0.01]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      {/* Underbar work surface, in four pieces around the ice well's opening,
          with its front face dropping down behind the speed rail */}
      {underbarPieces(underDepth).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, -0.01, z]} receiveShadow>
          <boxGeometry args={[w, 0.02, d]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
      ))}
      <mesh position={[0, -0.17, UNDERBAR_FRONT]} receiveShadow>
        <boxGeometry args={[1.2, 0.34, 0.01]} />
        <meshStandardMaterial color="#8d939a" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Speed rails: a shelf for each tier, with a guard bar across the front */}
      {RAILS.map((rail) => {
        const xs = INGREDIENT_IDS.filter((id) => rail.categories.includes(INGREDIENTS[id].category)).map((id) => bottleHome(id)[0]);
        const from = Math.min(...xs) - 0.04;
        const to = Math.max(...xs) + 0.04;
        return (
          <group key={rail.z}>
            <mesh position={[(from + to) / 2, rail.baseY - 0.005, rail.z]} receiveShadow castShadow>
              <boxGeometry args={[to - from, 0.01, 0.065]} />
              <meshStandardMaterial {...STEEL} />
            </mesh>
            <mesh position={[(from + to) / 2, rail.baseY + 0.07, rail.z + 0.032]} castShadow>
              <boxGeometry args={[to - from, 0.012, 0.004]} />
              <meshStandardMaterial {...STEEL} />
            </mesh>
          </group>
        );
      })}
      {/* Sink with a gooseneck tap */}
      <mesh position={[SINK[0], 0.001, SINK[2]]}>
        <boxGeometry args={[0.12, 0.004, 0.11]} />
        <meshStandardMaterial color="#3d4247" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[SINK[0] + 0.045, 0.06, SINK[2] - 0.05]} castShadow>
        <cylinderGeometry args={[0.005, 0.005, 0.12, 10]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      <mesh position={[SINK[0] + 0.045, 0.12, SINK[2] - 0.025]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.025, 0.005, 8, 16, Math.PI]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
    </group>
  );
}

// A pose that overrides following the cursor, e.g. the tin tipped over the glass.
type HeldPose = { on: boolean; pos: Vector3; rot: number };

// Eases its children toward the held position while active, and home after.
// While `pose` is on, it eases into that position and tilt instead.
function Follow({
  active,
  home,
  held,
  wobble,
  pose,
  children,
}: {
  active: boolean;
  home: readonly [number, number, number];
  held: RefObject<Vector3>;
  wobble?: RefObject<{ wobble: number }>;
  pose?: RefObject<HeldPose>;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const goal = useMemo(() => new Vector3(), []);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const posed = active && pose?.current?.on;
    // Track the cursor tightly while held; ease more gently into poses and back home.
    const rate = active && !posed ? HELD_RATE : FOLLOW_RATE;
    const k = 1 - Math.exp(-rate * Math.min(dt, 0.05)); // frame-rate independent easing
    if (posed) goal.copy(pose.current.pos);
    else if (active && held.current) goal.copy(held.current);
    else goal.set(...home);
    g.position.lerp(goal, k);
    const tilt = posed ? pose.current.rot : active && wobble?.current ? wobble.current.wobble * 0.5 : 0;
    g.rotation.z += (tilt - g.rotation.z) * k;
  });
  return (
    <group ref={ref} position={[...home]}>
      {children}
    </group>
  );
}

// Points the whole station must stay inside: the tall glasses at the back
// left, the bar top's far corners, the sink tap, the shaker's top, and the
// bottom of the front speed rail. Mostly the rail matters on wide screens and
// the sides on narrow ones.
const FRAME_POINTS = (() => {
  const front = RAILS[RAILS.length - 1];
  const xs = INGREDIENT_IDS.map((id) => bottleHome(id)[0]);
  return [
    [-0.58, BAR_TOP + 0.18, -0.42],
    [-0.6, BAR_TOP, BAR_TOP_BACK],
    [0.6, BAR_TOP, BAR_TOP_BACK],
    [SINK[0] + 0.07, 0.13, SINK[2]],
    [TIN[0], 0.32, TIN[2]],
    [Math.min(...xs) - 0.04, front.baseY - 0.02, front.z + 0.04],
    [Math.max(...xs) + 0.04, front.baseY - 0.02, front.z + 0.04],
  ].map(([x, y, z]) => new Vector3(x, y, z));
})();
const FRAME_MARGIN = 0.94; // keep points this far inside the edges (NDC)

// Frames the station for whatever shape the window is: slides the camera along
// its line of sight until every frame point fits, then shifts it up or down so
// the station sits centered. The viewing angle never changes. Runs in the
// frame loop, once per window size.
function FitCamera() {
  const fittedFor = useRef("");
  useFrame(({ camera, size }) => {
    const key = `${size.width}x${size.height}`;
    if (fittedFor.current === key || !size.width || !size.height) return;
    fittedFor.current = key;
    fitStation(camera as PerspectiveCamera, size.width / size.height);
    if (process.env.NODE_ENV !== "production") {
      // Lets browser tests aim at scene points the same way the camera sees them.
      (window as unknown as { __barCamera?: unknown }).__barCamera = camera;
    }
  });
  return null;
}

function fitStation(camera: PerspectiveCamera, aspect: number) {
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  const target = new Vector3(...CAMERA.target);
  const back = new Vector3(...CAMERA.position).sub(target); // camera offset from target
  const lift = new Vector3();
  const place = (k: number) => {
    camera.position.copy(target).add(lift).addScaledVector(back, k);
    camera.lookAt(SCRATCH.copy(target).add(lift));
    camera.updateMatrixWorld();
  };
  const extent = () => {
    let worst = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of FRAME_POINTS) {
      const v = SCRATCH.copy(p).project(camera);
      worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y));
      lo = Math.min(lo, v.y);
      hi = Math.max(hi, v.y);
    }
    return { worst, mid: (lo + hi) / 2 };
  };

  let k = 1;
  for (let pass = 0; pass < 3; pass++) {
    // The closest distance where everything fits.
    let near = 0.5;
    let far = 4;
    for (let i = 0; i < 30; i++) {
      k = (near + far) / 2;
      place(k);
      if (extent().worst <= FRAME_MARGIN) far = k;
      else near = k;
    }
    k = far;
    place(k);
    // Center vertically: move along the camera's up direction by the leftover offset.
    const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    lift.addScaledVector(up, extent().mid * back.length() * k * Math.tan((CAMERA.fov * Math.PI) / 360));
  }
  place(k);
}

// Aim with clientX and the canvas's on-screen box instead of R3F's default
// offsetX, which is wrong under CSS scaling and, in some embedded browsers,
// for scripted events.
const clientEvents = (store: Parameters<typeof events>[0]) => ({
  ...events(store),
  compute(event: { clientX: number; clientY: number }, state: RootState) {
    const rect = state.gl.domElement.getBoundingClientRect();
    state.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    state.raycaster.setFromCamera(state.pointer, state.camera);
  },
});

// Scratch objects for pointer math, shared because only one drag runs at a time.
const RAYCASTER = new Raycaster();
const NDC = new Vector2();
const PLANE = new Plane(new Vector3(0, 1, 0), 0);
const HIT = new Vector3();
const AIM = new Vector3();
const MOUTH = new Vector3();
const SCRATCH = new Vector3();

// Where the pointer's ray hits the horizontal plane at `height`, written into `out`.
function pointerOnPlane(out: Vector3, camera: Camera, canvas: HTMLCanvasElement, clientX: number, clientY: number, height: number) {
  const rect = canvas.getBoundingClientRect();
  NDC.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  RAYCASTER.setFromCamera(NDC, camera);
  PLANE.constant = -height;
  RAYCASTER.ray.intersectPlane(PLANE, out);
}
