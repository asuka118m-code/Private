// クラウド同期（端末内のデータを正として、変更分だけをやり取りする）
// ルール：同じレシピを2台で変更した場合は「後から変更した方」が残る
import { CATEGORY_PREFIX, emitChange, getDb, getImage, hasImage, storeImage } from "./db";
import type { Category, Recipe } from "./types";

export interface RemoteRow {
  id: string;
  data: Recipe | Category | null; // IDが "cat:" で始まる行はカテゴリ
  updated_at: number; // レシピの更新日時（端末の時計, ms）
  deleted: boolean;
  server_updated_at: string; // サーバー側で変更された時刻（取得位置の記録に使う）
}

export interface Remote {
  push(rows: Omit<RemoteRow, "server_updated_at">[]): Promise<void>;
  pullSince(since: string | null): Promise<RemoteRow[]>;
  uploadImage(id: string, blob: Blob): Promise<void>;
  downloadImage(id: string): Promise<Blob | null>;
  deleteImages(ids: string[]): Promise<void>;
}

const PULL_OVERLAP_MS = 60_000; // 取りこぼし防止のため少し前から取り直す

async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await getDb()).get("meta", key))?.value as T | undefined;
}
async function setMeta(key: string, value: unknown) {
  await (await getDb()).put("meta", { key, value });
}

export async function resetSyncState() {
  const db = await getDb();
  const tx = db.transaction(["meta", "syncedImages"], "readwrite");
  await tx.objectStore("meta").clear();
  await tx.objectStore("syncedImages").clear();
  await tx.done;
}

export interface SyncResult { pushed: number; pulled: number }

export async function syncOnce(remote: Remote): Promise<SyncResult> {
  const db = await getDb();

  // ---- 1. 送信：前回の同期以降に変更・削除したもの ----
  const lastPushAt = (await getMeta<number>("lastPushAt")) ?? 0;
  const pushStart = Date.now();
  // 時計を1ミリ秒以上進めてから読む：読んだ後の保存は必ず pushStart より後の時刻になり、取りこぼさない
  await new Promise((r) => setTimeout(r, 2));
  const changed = (await db.getAll("recipes")).filter((r) => r.updatedAt > lastPushAt);
  const tombstones = await db.getAll("tombstones");

  for (const r of changed) {
    for (const imgId of [...r.sourceImageIds, ...r.photoIds]) {
      if (await db.get("syncedImages", imgId)) continue;
      const blob = await getImage(imgId);
      if (!blob) continue;
      await remote.uploadImage(imgId, blob);
      await db.put("syncedImages", { id: imgId });
    }
  }
  const changedCats = (await db.getAll("categories")).filter((c) => c.updatedAt > lastPushAt);
  const rows = [
    ...changed.map((r) => ({ id: r.id, data: r, updated_at: r.updatedAt, deleted: false })),
    ...changedCats.map((c) => ({ id: CATEGORY_PREFIX + c.id, data: c, updated_at: c.updatedAt, deleted: false })),
    ...tombstones.map((t) => ({ id: t.id, data: null, updated_at: t.deletedAt, deleted: true })),
  ];
  if (rows.length) await remote.push(rows);
  for (const t of tombstones) await db.delete("tombstones", t.id);
  await setMeta("lastPushAt", pushStart);

  const imageDeletes = (await db.getAll("imageDeletes")).map((x) => x.id);
  if (imageDeletes.length) {
    await remote.deleteImages(imageDeletes);
    for (const id of imageDeletes) {
      await db.delete("imageDeletes", id);
      await db.delete("syncedImages", id);
    }
  }

  // ---- 2. 受信：他の端末での変更 ----
  const lastPull = await getMeta<string>("lastPull");
  const since = lastPull ? new Date(new Date(lastPull).getTime() - PULL_OVERLAP_MS).toISOString() : null;
  const remoteRows = await remote.pullSince(since);
  let pulled = 0;
  let maxSeen = lastPull ?? null;
  for (const row of remoteRows) {
    if (!maxSeen || row.server_updated_at > maxSeen) maxSeen = row.server_updated_at;
    if (row.id.startsWith(CATEGORY_PREFIX)) {
      const id = row.id.slice(CATEGORY_PREFIX.length);
      const cur = await db.get("categories", id);
      if (cur && cur.updatedAt >= row.updated_at) continue;
      if (row.deleted) { if (cur) { await db.delete("categories", id); pulled++; } continue; }
      if (!cur && (await db.get("tombstones", row.id))) continue;
      if (row.data) { await db.put("categories", { ...(row.data as Category), updatedAt: row.updated_at }); pulled++; }
      continue;
    }
    const local = await db.get("recipes", row.id);
    if (row.deleted) {
      if (local && local.updatedAt <= row.updated_at) {
        const tx = db.transaction(["recipes", "images", "syncedImages"], "readwrite");
        for (const id of [...local.sourceImageIds, ...local.photoIds]) {
          tx.objectStore("images").delete(id);
          tx.objectStore("syncedImages").delete(id);
        }
        tx.objectStore("recipes").delete(row.id);
        await tx.done;
        pulled++;
      }
      continue;
    }
    if (!row.data || (local && local.updatedAt >= row.updated_at)) continue;
    if (!local && (await db.get("tombstones", row.id))) continue; // この端末で削除済み
    const data = row.data as Recipe;
    for (const imgId of [...data.sourceImageIds, ...data.photoIds]) {
      if (await hasImage(imgId)) continue;
      const blob = await remote.downloadImage(imgId);
      if (blob) {
        await storeImage(imgId, blob);
        await db.put("syncedImages", { id: imgId });
      }
    }
    // 不要になった画像を消す
    if (local) {
      const keep = new Set([...data.sourceImageIds, ...data.photoIds]);
      for (const id of [...local.sourceImageIds, ...local.photoIds]) if (!keep.has(id)) await db.delete("images", id);
    }
    await db.put("recipes", { ...data, updatedAt: row.updated_at });
    pulled++;
  }
  if (maxSeen) await setMeta("lastPull", maxSeen);
  await setMeta("lastSyncedAt", Date.now());
  if (pulled) emitChange("sync");
  return { pushed: rows.length, pulled };
}

export const getLastSyncedAt = () => getMeta<number>("lastSyncedAt");
