export function recipeToText(
  r: { title?: string; servings?: string; ingredients?: { name: string; amount: string; mark?: string }[]; steps?: string[]; memo?: string; sourceUrl?: string },
  opts?: { url?: string },
): string;
