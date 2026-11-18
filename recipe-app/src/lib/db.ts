import { openDB, type DBSchema } from "idb";
import type { Recipe } from "./types";

interface RecipeDB extends DBSchema {
  recipes: { key: string; value: Recipe; indexes: { updatedAt: number } };
  images: { key: string; value: { id: string; blob: Blob } };
}

const dbPromise = openDB<RecipeDB>("recipe-app", 1, {
  upgrade(db) {
    const s = db.createObjectStore("recipes", { keyPath: "id" });
    s.createIndex("updatedAt", "updatedAt");
    db.createObjectStore("images", { keyPath: "id" });
  },
});

export const newId = () => crypto.randomUUID();

export async function listRecipes(): Promise<Recipe[]> {
  const all = await (await dbPromise).getAll("recipes");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getRecipe(id: string) {
  return (await dbPromise).get("recipes", id);
}

export async function saveRecipe(recipe: Recipe) {
  const r = { ...recipe, updatedAt: Date.now() };
  await (await dbPromise).put("recipes", r);
  return r;
}

export async function deleteRecipe(recipe: Recipe) {
  const db = await dbPromise;
  const tx = db.transaction(["recipes", "images"], "readwrite");
  for (const id of [...recipe.sourceImageIds, ...recipe.photoIds]) tx.objectStore("images").delete(id);
  tx.objectStore("recipes").delete(recipe.id);
  await tx.done;
}

export async function putImage(blob: Blob) {
  const id = newId();
  await (await dbPromise).put("images", { id, blob });
  return id;
}

export async function getImage(id: string) {
  return (await (await dbPromise).get("images", id))?.blob;
}

export async function deleteImage(id: string) {
  await (await dbPromise).delete("images", id);
}

export function coverOf(r: Recipe) {
  return r.coverImageId ?? r.photoIds[0] ?? r.sourceImageIds[0];
}
