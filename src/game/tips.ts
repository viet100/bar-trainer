import type { Recipe } from "./recipes.ts";
import type { Stars } from "./score.ts";

export const TIP_BY_STARS = [0, 0, 1, 3, 5, 8] as const; // dollars, indexed by stars
export const STREAK_START = 3; // the streak bonus starts on the 3rd 4-star-or-better drink in a row
export const STREAK_BONUS = 2;
export const SPEED_BONUS = 2; // served at or under par with at least 3 stars

// Seconds a working bartender would take: base, per ingredient, mixing, garnish.
export const parSeconds = (r: Recipe) =>
  30 + 10 * r.ingredients.length + (r.technique === "build" ? 0 : 20) + (r.garnish ? 5 : 0);

export type Tip = { base: number; streak: number; speed: number; total: number };

// The running tab of an endless game: drinks served, tips earned, and the
// current streak of 4-star-or-better drinks the customer kept.
export type Tab = { served: number; tips: number; streak: number };
export const newTab = (): Tab => ({ served: 0, tips: 0, streak: 0 });

type ServeInput = { stars: Stars; sendBack: boolean; seconds: number; par: number };

export function recordServe(tab: Tab, s: ServeInput): { tab: Tab; tip: Tip } {
  const kept = !s.sendBack;
  const streak = kept && s.stars >= 4 ? tab.streak + 1 : 0;
  const base = kept ? TIP_BY_STARS[s.stars] : 0;
  const streakBonus = streak >= STREAK_START ? STREAK_BONUS : 0;
  const speed = kept && s.stars >= 3 && s.seconds <= s.par ? SPEED_BONUS : 0;
  const tip = { base, streak: streakBonus, speed, total: base + streakBonus + speed };
  return { tab: { served: tab.served + 1, tips: tab.tips + tip.total, streak }, tip };
}
