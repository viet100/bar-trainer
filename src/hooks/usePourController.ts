"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FLOW_RATE_ML_PER_S } from "@/lib/pour";

// ingredientId -> ml in the glass, keys kept in first-pour order
export type GlassContents = Record<string, number>;

export type PourState = {
  contents: GlassContents;
  totalMl: number;
  spilledMl: number;
  activeId: string | null;
  // volume of the current (or most recent) pour, including spill
  currentPourMl: number;
};

const EMPTY: PourState = {
  contents: {},
  totalMl: 0,
  spilledMl: 0,
  activeId: null,
  currentPourMl: 0,
};

export function usePourController(
  capacityMl: number,
  flowRateMlPerS = FLOW_RATE_ML_PER_S,
) {
  const [state, setState] = useState<PourState>(EMPTY);
  // The rAF loop reads and writes this ref so it never sees stale React state.
  const live = useRef<PourState>(EMPTY);
  const lastTs = useRef(0);
  const raf = useRef<number | null>(null);

  // Volume is elapsed wall-clock time x flow rate, so dropped frames
  // don't change how much gets poured.
  const advance = useCallback(
    (now: number) => {
      const s = live.current;
      const dt = now - lastTs.current;
      if (!s.activeId || dt <= 0) return;
      lastTs.current = now;

      const poured = (dt / 1000) * flowRateMlPerS;
      const kept = Math.min(poured, Math.max(0, capacityMl - s.totalMl));
      live.current = {
        ...s,
        contents:
          kept > 0
            ? { ...s.contents, [s.activeId]: (s.contents[s.activeId] ?? 0) + kept }
            : s.contents,
        totalMl: s.totalMl + kept,
        spilledMl: s.spilledMl + (poured - kept),
        currentPourMl: s.currentPourMl + poured,
      };
    },
    [capacityMl, flowRateMlPerS],
  );

  const stopPour = useCallback(() => {
    if (!live.current.activeId) return;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    advance(performance.now()); // count the partial frame since the last tick
    live.current = { ...live.current, activeId: null };
    setState(live.current);
  }, [advance]);

  const startPour = useCallback(
    (id: string) => {
      stopPour();
      lastTs.current = performance.now();
      live.current = { ...live.current, activeId: id, currentPourMl: 0 };
      setState(live.current);

      const loop = (now: number) => {
        advance(now);
        setState(live.current);
        raf.current = requestAnimationFrame(loop);
      };
      raf.current = requestAnimationFrame(loop);
    },
    [advance, stopPour],
  );

  const reset = useCallback(() => {
    stopPour();
    live.current = EMPTY;
    setState(EMPTY);
  }, [stopPour]);

  // A missed pointerup (alt-tab, tab hidden) must not leave the bottle pouring.
  useEffect(() => {
    window.addEventListener("blur", stopPour);
    document.addEventListener("visibilitychange", stopPour);
    return () => {
      window.removeEventListener("blur", stopPour);
      document.removeEventListener("visibilitychange", stopPour);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [stopPour]);

  return { ...state, startPour, stopPour, reset };
}
