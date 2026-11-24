import { openDB, type DBSchema } from "idb";
import type { Category, Recipe, RecipeDraft } from "./types";

interface RecipeDB extends DBSchema {
  recipes: { key: string; value: Recipe; indexes: { updatedAt: number } };
  // 画像。Safariのプライベートブラウズは Blob を保存できないため、中身（ArrayBuffer）で保存する
  // （古いデータは blob のまま入っていることがある）
  images: { key: string; value: ImageRecord };
  // --- 同期用 ---
  meta: { key: string; value: { key: string; value: unknown } };
  tombstones: { key: string; value: { id: string; deletedAt: number } }; // 削除したレシピ（クラウドへ伝える）
  imageDeletes: { key: string; value: { id: string } }; // 削除した画像（クラウドから消す）
  syncedImages: { key: string; value: { id: string } }; // クラウドにアップ済みの画像
  categories: { key: string; value: Category };
}

export interface ImageRecord { id: string; blob?: Blob; data?: ArrayBuffer; type?: string }

const toRecord = async (id: string, blob: Blob): Promise<ImageRecord> => ({ id, data: await blob.arrayBuffer(), type: blob.type || "image/jpeg" });
const toBlob = (r?: ImageRecord): Blob | undefined => (!r ? undefined : r.data ? new Blob([r.data], { type: r.type || "image/jpeg" }) : r.blob);

/** 同期で使うカテゴリのID（レシピと区別するため先頭に付ける） */
export const CATEGORY_PREFIX = "cat:";

const dbPromise = openDB<RecipeDB>("recipe-app", 3, {
  async upgrade(db, oldVersion, _newVersion, tx) {
    if (oldVersion < 1) {
      const s = db.createObjectStore("recipes", { keyPath: "id" });
      s.createIndex("updatedAt", "updatedAt");
      db.createObjectStore("images", { keyPath: "id" });
    }
    if (oldVersion < 2) {
      db.createObjectStore("meta", { keyPath: "key" });
      db.createObjectStore("tombstones", { keyPath: "id" });
      db.createObjectStore("imageDeletes", { keyPath: "id" });
      db.createObjectStore("syncedImages", { keyPath: "id" });
    }
    if (oldVersion < 3) {
      db.createObjectStore("categories", { keyPath: "id" });
      if (oldVersion >= 2) {
        // 古い版のアプリがカテゴリをレシピとして取り込んでしまった場合の掃除。カテゴリを取り直す
        const recipes = tx.objectStore("recipes");
        for (const key of await recipes.getAllKeys()) if (String(key).startsWith(CATEGORY_PREFIX)) await recipes.delete(key);
        await tx.objectStore("meta").delete("lastPull");
      }
    }
  },
});
export const getDb = () => dbPromise;

// データが変わったら通知（同期の起動・画面の再読み込みに使う）
type Listener = (source: "local" | "sync") => void;
const listeners = new Set<Listener>();
export const onDataChange = (l: Listener) => (listeners.add(l), () => void listeners.delete(l));
export const emitChange = (source: "local" | "sync") => listeners.forEach((l) => l(source));

export const newId = () => crypto.randomUUID();

export async function listRecipes(): Promise<Recipe[]> {
  const all = await (await dbPromise).getAll("recipes");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getRecipe(id: string) {
  return (await dbPromise).get("recipes", id);
}

export async function saveRecipe(recipe: Recipe) {
  const r = { ...recipe, updatedAt: Math.max(Date.now(), recipe.updatedAt + 1) };
  await (await dbPromise).put("recipes", r);
  emitChange("local");
  return r;
}

export async function deleteRecipe(recipe: Recipe) {
  const db = await dbPromise;
  const tx = db.transaction(["recipes", "images", "tombstones", "imageDeletes"], "readwrite");
  for (const id of [...recipe.sourceImageIds, ...recipe.photoIds]) {
    tx.objectStore("images").delete(id);
    tx.objectStore("imageDeletes").put({ id });
  }
  tx.objectStore("recipes").delete(recipe.id);
  tx.objectStore("tombstones").put({ id: recipe.id, deletedAt: Date.now() });
  await tx.done;
  emitChange("local");
}

export async function putImage(blob: Blob) {
  const id = newId();
  await storeImage(id, blob);
  return id;
}

/** 決まったIDで画像を保存（同期・復元用） */
export async function storeImage(id: string, blob: Blob) {
  const rec = await toRecord(id, blob);
  await (await dbPromise).put("images", rec);
}

export async function getImage(id: string) {
  return toBlob(await (await dbPromise).get("images", id));
}

export async function hasImage(id: string) {
  return (await (await dbPromise).getKey("images", id)) !== undefined;
}

export async function deleteImage(id: string) {
  const db = await dbPromise;
  await db.delete("images", id);
  await db.put("imageDeletes", { id });
}

export function coverOf(r: Recipe) {
  return r.coverImageId ?? r.photoIds[0] ?? r.sourceImageIds[0];
}

// ---- カテゴリ ----
export async function listCategories(): Promise<Category[]> {
  const all = await (await dbPromise).getAll("categories");
  return all.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function saveCategory(c: Category) {
  const v = { ...c, updatedAt: Math.max(Date.now(), c.updatedAt + 1) };
  await (await dbPromise).put("categories", v);
  emitChange("local");
  return v;
}

export async function addCategory(name: string) {
  const all = await listCategories();
  const now = Date.now();
  return saveCategory({ id: newId(), name, order: (all.at(-1)?.order ?? 0) + 1, createdAt: now, updatedAt: now });
}

/** カテゴリを削除（中のレシピは消さない。レシピ側に残ったIDは表示時に無視する） */
export async function deleteCategory(id: string) {
  const db = await dbPromise;
  const tx = db.transaction(["categories", "tombstones"], "readwrite");
  tx.objectStore("categories").delete(id);
  tx.objectStore("tombstones").put({ id: CATEGORY_PREFIX + id, deletedAt: Date.now() });
  await tx.done;
  emitChange("local");
}

/** 一覧で選んでいるカテゴリ（新しいレシピの初期カテゴリにも使う） */
const SELECTED_KEY = "recipe-app:selectedCategory";
export const getSelectedCategory = () => localStorage.getItem(SELECTED_KEY) || "";
export const setSelectedCategory = (id: string) => localStorage.setItem(SELECTED_KEY, id);

/** 取り込んだ下書きをそのまま新規レシピとして保存（一括登録用） */
export async function saveDraftAsRecipe(d: RecipeDraft) {
  const sourceImageIds: string[] = [];
  for (const b of d.sourceImages) sourceImageIds.push(await putImage(b));
  const now = Date.now();
  return saveRecipe({
    id: newId(), title: d.title || "（無題）", servings: d.servings, ingredients: d.ingredients, steps: d.steps,
    sourceUrl: d.sourceUrl, sourceImageIds, photoIds: [], memo: "", comments: [], createdAt: now, updatedAt: now,
    categoryIds: d.categoryIds ?? [],
  });
}

/** バックアップ用：全データ */
export async function getAllData() {
  const db = await dbPromise;
  const images = (await db.getAll("images")).map((r) => ({ id: r.id, blob: toBlob(r)! })).filter((x) => x.blob);
  return { recipes: await db.getAll("recipes"), images, categories: await db.getAll("categories") };
}

/** バックアップから復元。同じレシピは更新日時が新しい方を残す */
export async function mergeData(recipes: Recipe[], images: { id: string; blob: Blob }[], categories: Category[] = []) {
  const db = await dbPromise;
  let added = 0, updated = 0;
  const records = await Promise.all(images.map((i) => toRecord(i.id, i.blob))); // トランザクションの前に変換しておく
  const tx = db.transaction(["recipes", "images", "categories"], "readwrite");
  for (const c of categories) {
    const cur = await tx.objectStore("categories").get(c.id);
    if (!cur || c.updatedAt > cur.updatedAt) await tx.objectStore("categories").put({ ...c, updatedAt: Date.now() });
  }
  for (const rec of records) await tx.objectStore("images").put(rec);
  for (const r of recipes) {
    const cur = await tx.objectStore("recipes").get(r.id);
    // 復元したものも同期で他の端末へ送られるよう、更新日時を今にする
    if (!cur) { await tx.objectStore("recipes").put({ ...r, updatedAt: Date.now() }); added++; }
    else if (r.updatedAt > cur.updatedAt) { await tx.objectStore("recipes").put({ ...r, updatedAt: Date.now() }); updated++; }
  }
  await tx.done;
  emitChange("local");
  return { added, updated };
}
