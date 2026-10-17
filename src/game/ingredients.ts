export type IngredientCategory = "spirit" | "liqueur" | "juice" | "syrup" | "mixer";

export type Ingredient = {
  name: string;
  category: IngredientCategory;
  color: string;
};

export const INGREDIENTS = {
  tequila: { name: "Tequila", category: "spirit", color: "#e9d38c" },
  vodka: { name: "Vodka", category: "spirit", color: "#dfe9ee" },
  gin: { name: "Gin", category: "spirit", color: "#d6ecea" },
  "white-rum": { name: "White Rum", category: "spirit", color: "#ece3cf" },
  "triple-sec": { name: "Triple Sec", category: "liqueur", color: "#f2a65a" },
  "dry-vermouth": { name: "Dry Vermouth", category: "liqueur", color: "#e4dca8" },
  "lime-juice": { name: "Lime Juice", category: "juice", color: "#a3cf5b" },
  "lemon-juice": { name: "Lemon Juice", category: "juice", color: "#f3e27a" },
  cranberry: { name: "Cranberry", category: "juice", color: "#b8323f" },
  "simple-syrup": { name: "Simple Syrup", category: "syrup", color: "#f4efe1" },
  "soda-water": { name: "Soda Water", category: "mixer", color: "#cfe3f0" },
  tonic: { name: "Tonic", category: "mixer", color: "#dde8d8" },
  cola: { name: "Cola", category: "mixer", color: "#4a2516" },
} as const satisfies Record<string, Ingredient>;

export type IngredientId = keyof typeof INGREDIENTS;

export const INGREDIENT_IDS = Object.keys(INGREDIENTS) as IngredientId[];

export const GARNISHES = {
  "lime-wedge": "Lime wedge",
  "lemon-twist": "Lemon twist",
  "lemon-wheel": "Lemon wheel",
  olive: "Olive",
} as const;

export type GarnishId = keyof typeof GARNISHES;
