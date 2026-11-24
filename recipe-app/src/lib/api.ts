import type { Ingredient } from "./types";
import { blobToBase64, shrinkImage } from "./image";
import { authHeader } from "./supabase";
import { parseRecipesText } from "../../shared/textparse.mjs";

export interface ImportedRecipe {
  title: string;
  servings?: string;
  ingredients: Ingredient[];
  steps: string[];
}

export interface ImportResult {
  recipes: ImportedRecipe[];
  imageUrl?: string;
  method: "structured" | "ai" | "text";
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `エラー (${r.status})`);
  return j as T;
}

export const importFromUrl = (url: string) => post<ImportResult>("/api/import/url", { url });
/** テキストから取り込み。rule=端末内で整形（無料・オフラインでも可） / ai=AIで整形 */
export async function importFromText(text: string, mode: "rule" | "ai"): Promise<ImportResult> {
  if (mode === "ai") return post<ImportResult>("/api/import/text", { text });
  return { recipes: parseRecipesText(text), method: "text" };
}
export async function importFromImages(images: Blob[]) {
  const payload = await Promise.all(images.map(async (b) => blobToBase64(await shrinkImage(b, 1568, 0.8))));
  const size = payload.reduce((n, p) => n + p.data.length, 0);
  if (size > 4_000_000) throw new Error("画像が大きすぎます。枚数を減らして（3〜4枚ずつ）お試しください");
  return post<ImportResult>("/api/import/image", { images: payload });
}

export async function fetchRemoteImage(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(`/api/image?url=${encodeURIComponent(url)}`, { headers: await authHeader() });
    if (!r.ok) return null;
    return await shrinkImage(await r.blob());
  } catch {
    return null;
  }
}

export async function aiStatus(): Promise<boolean> {
  try {
    return (await (await fetch("/api/status", { headers: await authHeader() })).json()).ai;
  } catch {
    return false;
  }
}

/** テキスト中の最初のURL */
export const findUrl = (s: string) => s.match(/https?:\/\/[^\s"'<>]+/)?.[0] ?? "";
