export type IngredientCategory = "spirit" | "liqueur" | "juice" | "syrup" | "mixer" | "dairy";

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
  bourbon: { name: "Bourbon", category: "spirit", color: "#b5651d" },
  "triple-sec": { name: "Triple Sec", category: "liqueur", color: "#f2a65a" },
  "dry-vermouth": { name: "Dry Vermouth", category: "liqueur", color: "#e4dca8" },
  "sweet-vermouth": { name: "Sweet Vermouth", category: "liqueur", color: "#6b1f1a" },
  campari: { name: "Campari", category: "liqueur", color: "#c8102e" },
  "coffee-liqueur": { name: "Coffee Liqueur", category: "liqueur", color: "#2b1408" },
  "lime-juice": { name: "Lime Juice", category: "juice", color: "#a3cf5b" },
  "lemon-juice": { name: "Lemon Juice", category: "juice", color: "#f3e27a" },
  cranberry: { name: "Cranberry", category: "juice", color: "#b8323f" },
  "orange-juice": { name: "Orange Juice", category: "juice", color: "#f7a531" },
  "grapefruit-juice": { name: "Grapefruit Juice", category: "juice", color: "#f2907e" },
  "simple-syrup": { name: "Simple Syrup", category: "syrup", color: "#f4efe1" },
  "honey-syrup": { name: "Honey Syrup", category: "syrup", color: "#e0a83a" },
  grenadine: { name: "Grenadine", category: "syrup", color: "#a3122a" },
  "soda-water": { name: "Soda Water", category: "mixer", color: "#cfe3f0" },
  tonic: { name: "Tonic", category: "mixer", color: "#dde8d8" },
  cola: { name: "Cola", category: "mixer", color: "#4a2516" },
  "ginger-beer": { name: "Ginger Beer", category: "mixer", color: "#d9c27a" },
  "heavy-cream": { name: "Heavy Cream", category: "dairy", color: "#f5f0e6" },
} as const satisfies Record<string, Ingredient>;

export type IngredientId = keyof typeof INGREDIENTS;

export const INGREDIENT_IDS = Object.keys(INGREDIENTS) as IngredientId[];

export const GARNISHES = {
  "lime-wedge": "Lime wedge",
  "lemon-twist": "Lemon twist",
  "lemon-wheel": "Lemon wheel",
  olive: "Olive",
  "orange-peel": "Orange peel",
  "orange-wheel": "Orange wheel",
  cherry: "Cherry",
  mint: "Mint sprig",
} as const;

export type GarnishId = keyof typeof GARNISHES;
