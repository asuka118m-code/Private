import { getAllData, mergeData } from "./db";
import type { Category, Recipe } from "./types";

interface BackupFile {
  app: "recipe-app";
  version: 1 | 2;
  exportedAt: string;
  recipes: Recipe[];
  categories?: Category[];
  images: { id: string; type: string; data: string }[]; // base64
}

const toBase64 = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(b);
  });

const fromBase64 = (data: string, type: string) => {
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
};

/** 全レシピと画像を1つのファイルにして保存（iPhone/iPadは「ファイル」アプリやiCloud Driveに保存可） */
export async function exportBackup() {
  const { recipes, images, categories } = await getAllData();
  const file: BackupFile = {
    app: "recipe-app", version: 2, exportedAt: new Date().toISOString(), recipes, categories,
    images: await Promise.all(images.map(async (i) => ({ id: i.id, type: i.blob.type, data: await toBase64(i.blob) }))),
  };
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  const name = `recipes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const f = new File([blob], name, { type: "application/json" });
  // 共有シートが使える端末（iPhone/iPad等）では共有から保存先を選べる
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f], title: name }); return recipes.length; } catch (e) {
      if ((e as Error).name === "AbortError") return 0;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return recipes.length;
}

export async function importBackup(file: File) {
  const data = JSON.parse(await file.text()) as BackupFile;
  if (data.app !== "recipe-app" || !Array.isArray(data.recipes)) throw new Error("このアプリのバックアップファイルではありません");
  return mergeData(data.recipes, data.images.map((i) => ({ id: i.id, blob: fromBase64(i.data, i.type) })), data.categories ?? []);
}
