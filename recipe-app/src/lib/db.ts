import { openDB, type DBSchema } from "idb";
import type { Recipe, RecipeDraft } from "./types";

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

/** 取り込んだ下書きをそのまま新規レシピとして保存（一括登録用） */
export async function saveDraftAsRecipe(d: RecipeDraft) {
  const sourceImageIds: string[] = [];
  for (const b of d.sourceImages) sourceImageIds.push(await putImage(b));
  const now = Date.now();
  return saveRecipe({
    id: newId(), title: d.title || "（無題）", servings: d.servings, ingredients: d.ingredients, steps: d.steps,
    sourceUrl: d.sourceUrl, sourceImageIds, photoIds: [], memo: "", comments: [], createdAt: now, updatedAt: now,
  });
}

/** バックアップ用：全データ */
export async function getAllData() {
  const db = await dbPromise;
  return { recipes: await db.getAll("recipes"), images: await db.getAll("images") };
}

/** バックアップから復元。同じレシピは更新日時が新しい方を残す */
export async function mergeData(recipes: Recipe[], images: { id: string; blob: Blob }[]) {
  const db = await dbPromise;
  let added = 0, updated = 0;
  const tx = db.transaction(["recipes", "images"], "readwrite");
  for (const img of images) await tx.objectStore("images").put(img);
  for (const r of recipes) {
    const cur = await tx.objectStore("recipes").get(r.id);
    if (!cur) { await tx.objectStore("recipes").put(r); added++; }
    else if (r.updatedAt > cur.updatedAt) { await tx.objectStore("recipes").put(r); updated++; }
  }
  await tx.done;
  return { added, updated };
}
