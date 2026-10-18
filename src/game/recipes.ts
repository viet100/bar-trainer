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
    name: "Negroni",
    glass: "rocks",
    ingredients: [
      { id: "gin", oz: 1 },
      { id: "campari", oz: 1 },
      { id: "sweet-vermouth", oz: 1 },
    ],
    technique: "stir",
    ice: true,
    garnish: "orange-peel",
  },
  {
    name: "Boulevardier",
    glass: "coupe",
    ingredients: [
      { id: "bourbon", oz: 1 },
      { id: "campari", oz: 1 },
      { id: "sweet-vermouth", oz: 1 },
    ],
    technique: "stir",
    ice: false,
    garnish: "orange-peel",
  },
  {
    name: "Whiskey Sour",
    glass: "rocks",
    ingredients: [
      { id: "bourbon", oz: 2 },
      { id: "lemon-juice", oz: 0.75 },
      { id: "simple-syrup", oz: 0.75 },
    ],
    technique: "shake",
    ice: true,
    garnish: "cherry",
  },
  {
    name: "Gold Rush",
    glass: "rocks",
    ingredients: [
      { id: "bourbon", oz: 2 },
      { id: "lemon-juice", oz: 0.75 },
      { id: "honey-syrup", oz: 0.75 },
    ],
    technique: "shake",
    ice: true,
    garnish: "lemon-twist",
  },
  {
    name: "Bee's Knees",
    glass: "coupe",
    ingredients: [
      { id: "gin", oz: 2 },
      { id: "lemon-juice", oz: 0.75 },
      { id: "honey-syrup", oz: 0.75 },
    ],
    technique: "shake",
    ice: false,
    garnish: "lemon-twist",
  },
  {
    name: "Gimlet",
    glass: "coupe",
    ingredients: [
      { id: "gin", oz: 2 },
      { id: "lime-juice", oz: 0.75 },
      { id: "simple-syrup", oz: 0.75 },
    ],
    technique: "shake",
    ice: false,
    garnish: "lime-wedge",
  },
  {
    name: "Lemon Drop",
    glass: "martini",
    ingredients: [
      { id: "vodka", oz: 2 },
      { id: "triple-sec", oz: 0.5 },
      { id: "lemon-juice", oz: 0.75 },
      { id: "simple-syrup", oz: 0.5 },
    ],
    technique: "shake",
    ice: false,
    garnish: "lemon-twist",
  },
  {
    name: "Moscow Mule",
    glass: "mule",
    ingredients: [
      { id: "vodka", oz: 2 },
      { id: "lime-juice", oz: 0.5 },
      { id: "ginger-beer", oz: 4 },
    ],
    technique: "build",
    ice: true,
    garnish: "lime-wedge",
  },
  {
    name: "Mojito",
    glass: "highball",
    ingredients: [
      { id: "white-rum", oz: 2 },
      { id: "lime-juice", oz: 1 },
      { id: "simple-syrup", oz: 0.75 },
      { id: "soda-water", oz: 2 },
    ],
    technique: "build",
    ice: true,
    garnish: "mint",
  },
  {
    name: "White Russian",
    glass: "rocks",
    ingredients: [
      { id: "vodka", oz: 2 },
      { id: "coffee-liqueur", oz: 1 },
      { id: "heavy-cream", oz: 1 },
    ],
    technique: "build",
    ice: true,
    garnish: null,
  },
  {
    name: "Paloma",
    glass: "highball",
    ingredients: [
      { id: "tequila", oz: 2 },
      { id: "grapefruit-juice", oz: 2 },
      { id: "lime-juice", oz: 0.5 },
      { id: "soda-water", oz: 2 },
    ],
    technique: "build",
    ice: true,
    garnish: "lime-wedge",
  },
  {
    name: "Tequila Sunrise",
    glass: "highball",
    ingredients: [
      { id: "tequila", oz: 2 },
      { id: "orange-juice", oz: 4 },
      { id: "grenadine", oz: 0.5 },
    ],
    technique: "build",
    ice: true,
    garnish: "orange-wheel",
  },
  {
    name: "Screwdriver",
    glass: "highball",
    ingredients: [
      { id: "vodka", oz: 2 },
      { id: "orange-juice", oz: 4 },
    ],
    technique: "build",
    ice: true,
    garnish: "orange-wheel",
  },
  {
    name: "Cape Codder",
    glass: "highball",
    ingredients: [
      { id: "vodka", oz: 2 },
      { id: "cranberry", oz: 4 },
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
