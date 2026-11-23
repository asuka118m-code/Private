// 2台の端末（別々のIndexedDB）＋ 疑似クラウドで同期の動きを確認する
import { describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import type { Remote, RemoteRow } from "../src/lib/sync";
import type { Recipe } from "../src/lib/types";

/** Supabaseのテーブル＋トリガー（古い更新は無視）＋ストレージを模したもの */
function fakeCloud() {
  const rows = new Map<string, RemoteRow>();
  const files = new Map<string, Blob>();
  let clock = 0;
  const ts = () => new Date(Date.UTC(2026, 0, 1) + ++clock * 1000).toISOString();
  const remote: Remote = {
    async push(input) {
      for (const r of input) {
        const cur = rows.get(r.id);
        if (cur && r.updated_at <= cur.updated_at) continue; // LWWトリガー
        rows.set(r.id, { ...r, server_updated_at: ts() });
      }
    },
    async pullSince(since) {
      return [...rows.values()].filter((r) => !since || r.server_updated_at > since).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at));
    },
    async uploadImage(id, blob) { files.set(id, blob); },
    async downloadImage(id) { return files.get(id) ?? null; },
    async deleteImages(ids) { ids.forEach((i) => files.delete(i)); },
  };
  return { remote, rows, files };
}

async function device() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  const db = await import("../src/lib/db");
  const sync = await import("../src/lib/sync");
  return { db, sync };
}

const recipe = (id: string, title: string, extra: Partial<Recipe> = {}): Recipe => ({
  id, title, servings: "", ingredients: [{ name: "塩", amount: "少々" }], steps: ["焼く"], sourceUrl: "",
  sourceImageIds: [], photoIds: [], memo: "", comments: [], createdAt: 1, updatedAt: 1, ...extra,
});

describe("クラウド同期", () => {
  it("iPhoneで作ったレシピと写真がiPadに届き、iPadで足したコメントがiPhoneに戻る", async () => {
    const cloud = fakeCloud();
    const iphone = await device();
    const imgId = await iphone.db.putImage(new Blob(["photo"], { type: "image/jpeg" }));
    await iphone.db.saveRecipe(recipe("r1", "肉じゃが", { photoIds: [imgId] }));
    await iphone.sync.syncOnce(cloud.remote);
    expect(cloud.files.has(imgId)).toBe(true);

    const ipad = await device();
    await ipad.sync.syncOnce(cloud.remote);
    const got = await ipad.db.getRecipe("r1");
    expect(got?.title).toBe("肉じゃが");
    expect(await (await ipad.db.getImage(imgId))?.text()).toBe("photo");

    // iPadでコメント追加 → iPhoneへ
    await new Promise((r) => setTimeout(r, 5));
    await ipad.db.saveRecipe({ ...got!, comments: [{ id: "c1", createdAt: 1, text: "甘め" }] });
    await ipad.sync.syncOnce(cloud.remote);

    await iphone.sync.syncOnce(cloud.remote);
    expect((await iphone.db.getRecipe("r1"))?.comments[0]?.text).toBe("甘め");
  });

  it("2台で同時に編集したら、後から編集した方が残る／削除は他端末にも反映", async () => {
    const cloud = fakeCloud();
    const a = await device();
    await a.db.saveRecipe(recipe("r1", "カレー"));
    await a.sync.syncOnce(cloud.remote);
    const b = await device();
    await b.sync.syncOnce(cloud.remote);

    // 先にA、後からBが編集（どちらも同期前）
    await a.db.saveRecipe({ ...(await a.db.getRecipe("r1"))!, title: "カレー（A）" });
    await new Promise((r) => setTimeout(r, 5));
    await b.db.saveRecipe({ ...(await b.db.getRecipe("r1"))!, title: "カレー（B）" });
    await b.sync.syncOnce(cloud.remote);
    await a.sync.syncOnce(cloud.remote); // Aの古い変更は採用されず、Bの内容を受け取る
    expect((await a.db.getRecipe("r1"))?.title).toBe("カレー（B）");
    expect(cloud.rows.get("r1")?.data?.title).toBe("カレー（B）");

    // Bで削除 → Aからも消える
    await b.db.deleteRecipe((await b.db.getRecipe("r1"))!);
    await b.sync.syncOnce(cloud.remote);
    await a.sync.syncOnce(cloud.remote);
    expect(await a.db.getRecipe("r1")).toBeUndefined();
    expect(cloud.rows.get("r1")?.deleted).toBe(true);
  });

  it("写真を外すとクラウドからも消える／オフライン中の変更は次の同期で送られる", async () => {
    const cloud = fakeCloud();
    const a = await device();
    const img = await a.db.putImage(new Blob(["x"]));
    const r = await a.db.saveRecipe(recipe("r1", "サラダ", { photoIds: [img] }));
    await a.sync.syncOnce(cloud.remote);
    await a.db.deleteImage(img);
    await a.db.saveRecipe({ ...r, photoIds: [] });
    await a.db.saveRecipe(recipe("r2", "スープ")); // 同期前に複数変更
    const res = await a.sync.syncOnce(cloud.remote);
    expect(res.pushed).toBe(2);
    expect(cloud.files.has(img)).toBe(false);
    expect(cloud.rows.get("r2")?.data?.title).toBe("スープ");
    // 変更がなければ何も送らない
    expect((await a.sync.syncOnce(cloud.remote)).pushed).toBe(0);
  });
});
