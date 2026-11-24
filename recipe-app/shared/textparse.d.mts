export interface ParsedIngredient { name: string; amount: string; mark?: string }
export interface ParsedRecipe { title: string; servings: string; ingredients: ParsedIngredient[]; steps: string[]; memo: string }
export function splitIngredient(line: string): ParsedIngredient | null;
export function stripStepNumber(s: string): string;
export function splitRecipeBlocks(text: string): string[];
export function parseRecipeText(text: string): ParsedRecipe;
export function parseRecipesText(text: string): ParsedRecipe[];
export const MARK_CHOICES: string[];
export function takeMark(line: string): { mark: string; rest: string };
export function cleanTitle(raw: string): string;
