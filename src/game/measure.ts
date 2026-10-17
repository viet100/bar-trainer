import { mlToOz } from "../lib/pour.ts";
import type { DrinkState } from "./drink.ts";
import type { GlassId } from "./glassware.ts";
import type { GarnishId, IngredientId } from "./ingredients.ts";
import type { Recipe, Technique } from "./recipes.ts";

export type IngredientCheck = {
  id: IngredientId;
  expectedOz: number;
  actualOz: number;
  errorOz: number; // positive = over-poured
};

export type ActualTechnique = Technique | "shake+stir" | "strained unmixed";

// Facts about the drink versus the order. Code measures; Gemini judges.
export type Measurement = {
  recipe: string;
  glass: { expected: GlassId; actual: GlassId | null };
  ingredients: IngredientCheck[]; // recipe ingredients first, then extras
  technique: {
    expected: Technique;
    actual: ActualTechnique;
    shakeSeconds: number;
    stirTurns: number;
    mixedWithIce: boolean;
  };
  ice: { expected: boolean; actual: number }; // actual = cubes in the glass
  garnish: { expected: GarnishId | null; actual: GarnishId | null };
  totalErrorOz: number; // sum of |errorOz|
  spilledOz: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function actualTechnique(drink: DrinkState): ActualTechnique {
  const mix = drink.strainedMix;
  if (!mix) return "build";
  if (mix.shakeMs > 0 && mix.stirTurns > 0) return "shake+stir";
  if (mix.shakeMs > 0) return "shake";
  if (mix.stirTurns > 0) return "stir";
  return "strained unmixed";
}

export function measureDrink(drink: DrinkState, recipe: Recipe): Measurement {
  const poured = drink.inGlass.contents;
  const expected = new Map(recipe.ingredients.map((i) => [i.id, i.oz]));
  const ids = [
    ...recipe.ingredients.map((i) => i.id),
    ...(Object.keys(poured) as IngredientId[]).filter((id) => !expected.has(id)),
  ];

  const ingredients = ids.map((id) => {
    const expectedOz = expected.get(id) ?? 0;
    const actualOz = round2(mlToOz(poured[id] ?? 0));
    return { id, expectedOz, actualOz, errorOz: round2(actualOz - expectedOz) };
  });

  const mix = drink.strainedMix;
  return {
    recipe: recipe.name,
    glass: { expected: recipe.glass, actual: drink.glass },
    ingredients,
    technique: {
      expected: recipe.technique,
      actual: actualTechnique(drink),
      shakeSeconds: round2((mix?.shakeMs ?? 0) / 1000),
      stirTurns: mix?.stirTurns ?? 0,
      mixedWithIce: mix?.withIce ?? false,
    },
    ice: { expected: recipe.ice, actual: drink.inGlass.ice },
    garnish: { expected: recipe.garnish, actual: drink.garnish },
    totalErrorOz: round2(ingredients.reduce((sum, i) => sum + Math.abs(i.errorOz), 0)),
    spilledOz: round2(mlToOz(drink.spilledMl)),
  };
}
