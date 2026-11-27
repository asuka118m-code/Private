// 買い物リスト（Supabaseに保存：自分の端末どうしで同期・リンクで家族と共有）
import { supabase } from "./supabase";
import { scaleAmount } from "./scale";
import type { Recipe } from "./types";
import type { ShopEntry, ShopFlags } from "./shopMerge";

export interface ShopData { entries: ShopEntry[]; flags: ShopFlags[]; ownerName?: string }

/** 自分のリストとリンク（家族）で、同じ画面から使えるようにする */
export interface ShopApi {
  owner: boolean;
  load(): Promise<ShopData>;
  setFlag(key: string, field: "checked" | "pantry", value: boolean): Promise<void>;
  addManual(name: string, amount: string, by: string): Promise<void>;
  removeEntry?(id: string): Promise<void>;
  clear?(): Promise<void>;
  uncheckAll?(keys: string[]): Promise<void>;
}

function sb() {
  if (!supabase) throw new Error("ログインが必要です");
  return supabase;
}
const check = (error: { message: string } | null, fallback: string) => {
  if (!error) return;
  if (/shopping|schema cache|does not exist/i.test(error.message) && !/[ぁ-ん]/.test(error.message)) {
    throw new Error("買い物リストの準備ができていません（Supabaseで 007_shopping.sql を実行してください）");
  }
  throw new Error(/[ぁ-んァ-ン一-龠]/.test(error.message) ? error.message : `${fallback}：${error.message}`);
};
const CACHE = "recipe-app:shopping";

const toEntry = (e: { id: string; recipe_id: string | null; title: string; factor: number; ingredients: ShopEntry["ingredients"]; added_by: string; created_at: string }): ShopEntry => ({
  id: e.id, recipeId: e.recipe_id, title: e.title, factor: Number(e.factor), ingredients: e.ingredients ?? [], addedBy: e.added_by, createdAt: Date.parse(e.created_at),
});

async function myId() {
  return (await sb().auth.getSession()).data.session?.user.id ?? null;
}

/** 自分の買い物リスト */
export const ownShopApi: ShopApi = {
  owner: true,
  async load() {
    try {
      const [{ data: e, error: e1 }, { data: c, error: e2 }] = await Promise.all([
        sb().from("shopping_entries").select("id, recipe_id, title, factor, ingredients, added_by, created_at").order("created_at"),
        sb().from("shopping_checks").select("item_key, checked, pantry"),
      ]);
      check(e1 ?? e2, "読み込めませんでした");
      const data: ShopData = {
        entries: (e ?? []).map(toEntry),
        flags: (c ?? []).map((x) => ({ key: x.item_key, checked: x.checked, pantry: x.pantry })),
      };
      localStorage.setItem(CACHE, JSON.stringify(data));
      return data;
    } catch (err) {
      // 電波が無い時は最後に読み込んだものを出す
      const cached = localStorage.getItem(CACHE);
      if (cached && /fetch|network|Failed/i.test(String(err))) return { ...JSON.parse(cached), offline: true } as ShopData;
      throw err;
    }
  },
  async setFlag(key, field, value) {
    const uid = await myId();
    const { data: cur } = await sb().from("shopping_checks").select("checked, pantry").eq("item_key", key).limit(1);
    const row = { user_id: uid, item_key: key, checked: cur?.[0]?.checked ?? false, pantry: cur?.[0]?.pantry ?? false, updated_at: new Date().toISOString() };
    row[field] = value;
    const { error } = await sb().from("shopping_checks").upsert(row, { onConflict: "user_id,item_key" });
    check(error, "保存できませんでした");
  },
  async addManual(name, amount) {
    const { error } = await sb().from("shopping_entries").insert({ recipe_id: null, title: "", ingredients: [{ name: name.trim(), amount: amount.trim() }] });
    check(error, "追加できませんでした");
  },
  async removeEntry(id) {
    const { error } = await sb().from("shopping_entries").delete().eq("id", id);
    check(error, "外せませんでした");
  },
  async uncheckAll(keys) {
    if (!keys.length) return;
    const { error } = await sb().from("shopping_checks").update({ checked: false }).in("item_key", keys);
    check(error, "更新できませんでした");
  },
  async clear() {
    const uid = await myId();
    const { error } = await sb().from("shopping_entries").delete().eq("user_id", uid);
    check(error, "空にできませんでした");
    await sb().from("shopping_checks").update({ checked: false }).eq("user_id", uid);
  },
};

/** リンクから開いた家族用 */
export function linkShopApi(token: string): ShopApi {
  return {
    owner: false,
    async load() {
      const { data, error } = await sb().rpc("get_shopping", { p_token: token });
      check(error, "読み込めませんでした");
      if (!data) throw new Error("この買い物リストは見られません（共有が止められた可能性があります）");
      return {
        ownerName: data.ownerName,
        entries: (data.entries ?? []) as ShopEntry[],
        flags: ((data.checks ?? []) as { key: string; checked: boolean; pantry: boolean }[]),
      };
    },
    async setFlag(key, field, value) {
      const { error } = await sb().rpc("set_shopping_flag", { p_token: token, p_key: key, p_field: field, p_value: value });
      check(error, "保存できませんでした");
    },
    async addManual(name, amount, by) {
      const { error } = await sb().rpc("add_shopping_item", { p_token: token, p_name: name, p_amount: amount, p_by: by });
      check(error, "追加できませんでした");
    },
  };
}

/** 料理を買い物リストに入れる（すでに入っていれば分量を入れ直す） */
export async function addRecipeToShopping(r: Recipe, factor = 1) {
  const ingredients = r.ingredients.filter((i) => i.name.trim()).map((i) => ({ name: i.name, amount: scaleAmount(i.amount, factor), ...(i.mark ? { mark: i.mark } : {}) }));
  const { data: existing } = await sb().from("shopping_entries").select("id").eq("recipe_id", r.id).limit(1);
  if (existing?.[0]) {
    const { error } = await sb().from("shopping_entries").update({ title: r.title, factor, ingredients }).eq("id", existing[0].id);
    check(error, "入れられませんでした");
  } else {
    const { error } = await sb().from("shopping_entries").insert({ recipe_id: r.id, title: r.title, factor, ingredients });
    check(error, "入れられませんでした");
  }
}
export async function shoppingRecipeIds(): Promise<Map<string, string>> {
  if (!supabase) return new Map();
  const { data } = await supabase.from("shopping_entries").select("id, recipe_id").not("recipe_id", "is", null);
  return new Map((data ?? []).map((x) => [x.recipe_id as string, x.id as string]));
}

// ---- 家族と共有するリンク ----
export const shopShareUrl = (token: string) => `${location.origin}/shop/${token}`;
export async function getShopShare(): Promise<string | null> {
  const { data } = await sb().from("shopping_shares").select("token").eq("revoked", false).limit(1);
  return data?.[0]?.token ?? null;
}
export async function createShopShare(): Promise<string> {
  const b = crypto.getRandomValues(new Uint8Array(15));
  const token = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const { error } = await sb().from("shopping_shares").insert({ token });
  check(error, "共有リンクを作れませんでした");
  return token;
}
export async function revokeShopShare(token: string) {
  const { error } = await sb().from("shopping_shares").update({ revoked: true }).eq("token", token);
  check(error, "共有を止められませんでした");
}
