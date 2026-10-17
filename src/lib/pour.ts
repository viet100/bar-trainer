export const ML_PER_OZ = 29.5735;

// Free-pour standard: a 3-second hold pours 1.5 oz (~44.4 ml).
export const FREE_POUR_OZ = 1.5;
export const FREE_POUR_SECONDS = 3;
export const FLOW_RATE_ML_PER_S = (FREE_POUR_OZ * ML_PER_OZ) / FREE_POUR_SECONDS;

export const mlToOz = (ml: number) => ml / ML_PER_OZ;
