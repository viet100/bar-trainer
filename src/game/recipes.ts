import type { GlassId } from "./glassware.ts";
import type { GarnishId, IngredientId } from "./ingredients.ts";

// build: poured straight into the glass. shake/stir: mixed in the tin, then strained.
export type Technique = "build" | "shake" | "stir";

export type Recipe = {
  name: string;
  glass: GlassId;
  ingredients: { id: IngredientId; oz: number }[];
  technique: Technique;
  ice: boolean; // served over ice in the glass
  garnish: GarnishId | null;
};

// Classic specs. They cover offline play now and act as the fallback when Gemini is unavailable.
export const CLASSIC_RECIPES: Recipe[] = [
  {
    name: "Margarita",
    glass: "rocks",
    ingredients: [
      { id: "tequila", oz: 2 },
      { id: "triple-sec", oz: 1 },
      { id: "lime-juice", oz: 1 },
    ],
    technique: "shake",
    ice: true,
    garnish: "lime-wedge",
  },
  {
    name: "Daiquiri",
    glass: "coupe",
    ingredients: [
      { id: "white-rum", oz: 2 },
      { id: "lime-juice", oz: 1 },
      { id: "simple-syrup", oz: 0.75 },
    ],
    technique: "shake",
    ice: false,
    garnish: "lime-wedge",
  },
  {
    name: "Cosmopolitan",
    glass: "martini",
    ingredients: [
      { id: "vodka", oz: 1.5 },
      { id: "triple-sec", oz: 1 },
      { id: "cranberry", oz: 1 },
      { id: "lime-juice", oz: 0.5 },
    ],
    technique: "shake",
    ice: false,
    garnish: "lemon-twist",
  },
  {
    name: "Gin Martini",
    glass: "martini",
    ingredients: [
      { id: "gin", oz: 2.5 },
      { id: "dry-vermouth", oz: 0.5 },
    ],
    technique: "stir",
    ice: false,
    garnish: "olive",
  },
  {
    name: "Tom Collins",
    glass: "collins",
    ingredients: [
      { id: "gin", oz: 2 },
      { id: "lemon-juice", oz: 1 },
      { id: "simple-syrup", oz: 0.5 },
      { id: "soda-water", oz: 3 },
    ],
    technique: "shake", // shake the sour, strain over ice, top with soda in the glass
    ice: true,
    garnish: "lemon-wheel",
  },
  {
    name: "Gin & Tonic",
    glass: "highball",
    ingredients: [
      { id: "gin", oz: 2 },
      { id: "tonic", oz: 4 },
    ],
    technique: "build",
    ice: true,
    garnish: "lime-wedge",
  },
  {
    name: "Cuba Libre",
    glass: "highball",
    ingredients: [
      { id: "white-rum", oz: 2 },
      { id: "cola", oz: 4 },
      { id: "lime-juice", oz: 0.5 },
    ],
    technique: "build",
    ice: true,
    garnish: "lime-wedge",
  },
  {
    name: "Tequila Shot",
    glass: "shot",
    ingredients: [{ id: "tequila", oz: 1.5 }],
    technique: "build",
    ice: false,
    garnish: null,
  },
];
