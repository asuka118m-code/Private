import type { Ingredient } from "./types";
import { blobToBase64, shrinkImage } from "./image";

export interface ImportResult {
  title: string;
  servings?: string;
  ingredients: Ingredient[];
  steps: string[];
  imageUrl?: string;
  method: "structured" | "ai" | "text";
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `エラー (${r.status})`);
  return j as T;
}

export const importFromUrl = (url: string) => post<ImportResult>("/api/import/url", { url });
export const importFromText = (text: string) => post<ImportResult>("/api/import/text", { text });
export async function importFromImages(images: Blob[]) {
  const payload = await Promise.all(images.map(async (b) => blobToBase64(await shrinkImage(b, 1568, 0.9))));
  return post<ImportResult>("/api/import/image", { images: payload });
}

export async function fetchRemoteImage(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(`/api/image?url=${encodeURIComponent(url)}`);
    if (!r.ok) return null;
    return await shrinkImage(await r.blob());
  } catch {
    return null;
  }
}

export async function aiStatus(): Promise<boolean> {
  try {
    return (await (await fetch("/api/status")).json()).ai;
  } catch {
    return false;
  }
}

/** テキスト中の最初のURL */
export const findUrl = (s: string) => s.match(/https?:\/\/[^\s"'<>]+/)?.[0] ?? "";
