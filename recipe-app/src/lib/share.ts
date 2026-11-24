// 共有リンク：レシピを相手に見せて、感想コメントをもらう
import { supabase } from "./supabase";
import type { Comment, Recipe } from "./types";

const OWNER_NAME_KEY = "recipe-app:ownerName";
const GUEST_NAME_KEY = "recipe-app:guestName";
export const getOwnerName = () => localStorage.getItem(OWNER_NAME_KEY) || "";
export const setOwnerName = (n: string) => localStorage.setItem(OWNER_NAME_KEY, n);
export const getGuestName = () => localStorage.getItem(GUEST_NAME_KEY) || "";
/** 共有ページで使う名前を保存（同じページ内の他の欄にも知らせる） */
export const setGuestName = (n: string) => {
  const v = n.trim();
  if (v) localStorage.setItem(GUEST_NAME_KEY, v); else localStorage.removeItem(GUEST_NAME_KEY);
  window.dispatchEvent(new Event("guestname"));
};

export const shareUrl = (token: string) => `${location.origin}/s/${token}`;

/** recipeId が null なら「全レシピ一覧」の共有 */
type Target = string | null;

function need() {
  if (!supabase) throw new Error("共有にはクラウドの設定が必要です");
  return supabase;
}

const msg = (e: { message: string } | null, fallback: string) => {
  if (!e) return;
  if (/relation .*shares|function .*shared|does not exist|schema cache/i.test(e.message)) {
    throw new Error("共有の準備ができていません（Supabaseで 002_share.sql を実行してください）");
  }
  throw new Error(`${fallback}：${e.message}`);
};

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface ShareInfo { token: string; ownerName: string }

/** このレシピの、今有効な共有リンク */
export async function getActiveShare(recipeId: Target): Promise<ShareInfo | null> {
  const sb = need();
  const base = sb.from("shares").select("token, owner_name").eq("revoked", false);
  const { data, error } = await (recipeId ? base.eq("recipe_id", recipeId) : base.is("recipe_id", null))
    .order("created_at", { ascending: false }).limit(1);
  msg(error, "共有の確認に失敗しました");
  return data?.[0] ? { token: data[0].token, ownerName: data[0].owner_name } : null;
}

export async function createShare(recipeId: Target, ownerName: string): Promise<ShareInfo> {
  const sb = need();
  const token = newToken();
  const { error } = await sb.from("shares").insert({ token, recipe_id: recipeId, owner_name: ownerName });
  msg(error, "共有リンクを作れませんでした");
  setOwnerName(ownerName);
  return { token, ownerName };
}

export async function updateShareName(token: string, ownerName: string) {
  const { error } = await need().from("shares").update({ owner_name: ownerName }).eq("token", token);
  msg(error, "名前を変更できませんでした");
  setOwnerName(ownerName);
}

export async function revokeShare(token: string) {
  const { error } = await need().from("shares").update({ revoked: true }).eq("token", token);
  msg(error, "共有を止められませんでした");
}

/** 共有先から届いたコメント（持ち主のアプリで表示） */
export async function fetchSharedComments(recipeId: string): Promise<Comment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("shared_comments").select("id, author, text, rating, created_at")
    .eq("recipe_id", recipeId).order("created_at", { ascending: false });
  if (error) return [];
  return data.map((c) => ({ id: c.id, author: c.author, text: c.text, rating: c.rating ?? undefined, createdAt: Date.parse(c.created_at), shared: true }));
}

export async function deleteSharedComment(id: string) {
  const { error } = await need().from("shared_comments").delete().eq("id", id);
  msg(error, "削除できませんでした");
}

// ---- 共有リンクを開いた人（ログイン不要） ----
export interface SharedRecipe { recipe: Recipe; ownerId: string; ownerName: string; comments: Comment[] }

export async function getSharedRecipe(token: string, recipeId?: string): Promise<SharedRecipe | null> {
  const { data, error } = recipeId
    ? await need().rpc("get_shared_recipe", { p_token: token, p_recipe_id: recipeId })
    : await need().rpc("get_shared_recipe", { p_token: token });
  msg(error, "レシピを読み込めませんでした");
  if (!data) return null;
  return { ...data, comments: (data.comments as Comment[]).map((c) => ({ ...c, shared: true })) } as SharedRecipe;
}

export async function addSharedComment(token: string, author: string, text: string, rating?: number, recipeId?: string): Promise<Comment> {
  const args = { p_token: token, p_author: author, p_text: text, p_rating: rating ?? null };
  const { data, error } = recipeId
    ? await need().rpc("add_shared_comment", { ...args, p_recipe_id: recipeId })
    : await need().rpc("add_shared_comment", args);
  if (error) throw new Error(error.message.includes("使えません") || error.message.includes("多すぎ") ? error.message : `送信できませんでした：${error.message}`);
  setGuestName(author);
  return { ...(data as Comment), shared: true };
}

export async function loadSharedImage(ownerId: string, imageId: string): Promise<Blob | null> {
  const { data, error } = await need().storage.from("recipe-images").download(`${ownerId}/${imageId}`);
  return error ? null : data;
}

// ---- 一覧の共有・「食べたい」リクエスト ----
export interface SharedListItem { id: string; title: string; servings: string; cover: string | null; categoryIds: string[]; cookedCount: number; updatedAt: number }
export interface FoodRequest {
  id: string; author: string; text: string;
  recipeId: string | null; // 今あるレシピへの「これ食べたい」
  url?: string | null; // 参考のページ・動画
  createdAt: number; done?: boolean;
  acceptedRecipeId?: string | null; // OKしてレシピにした時のレシピ
}
export interface SharedList {
  ownerId: string; ownerName: string;
  recipes: SharedListItem[];
  categories: { id: string; name: string; order: number }[];
  requests: FoodRequest[];
}

/** 一覧の共有リンクなら中身、1品の共有リンクなら null */
export async function getSharedList(token: string): Promise<SharedList | null> {
  const { data, error } = await need().rpc("get_shared_list", { p_token: token });
  if (error && /get_shared_list|schema cache|does not exist/i.test(error.message)) return null; // 3回目の設定前
  msg(error, "一覧を読み込めませんでした");
  return (data as SharedList) ?? null;
}

export async function addRequest(token: string, author: string, text: string, recipeId?: string | null, url?: string): Promise<FoodRequest> {
  const { data, error } = await need().rpc("add_request", { p_token: token, p_author: author, p_text: text, p_recipe_id: recipeId ?? null, p_url: url || null });
  if (error) throw new Error(/できません|書|貼って|多すぎ|使えません|正しく/.test(error.message) ? error.message : `送信できませんでした：${error.message}`);
  setGuestName(author);
  return data as FoodRequest;
}

/** 持ち主：届いているリクエスト */
export async function fetchRequests(): Promise<FoodRequest[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("requests").select("id, author, text, recipe_id, url, done, accepted_recipe_id, created_at").order("created_at", { ascending: false });
  if (error) return [];
  return data.map((q) => ({
    id: q.id, author: q.author, text: q.text, recipeId: q.recipe_id, url: q.url, done: q.done,
    acceptedRecipeId: q.accepted_recipe_id, createdAt: Date.parse(q.created_at),
  }));
}
export async function setRequestDone(id: string, done: boolean) {
  const { error } = await need().from("requests").update({ done }).eq("id", id);
  msg(error, "更新できませんでした");
}
/** OKしてレシピにした */
export async function acceptRequest(id: string, recipeId: string) {
  const { error } = await need().from("requests").update({ done: true, accepted_recipe_id: recipeId }).eq("id", id);
  msg(error, "更新できませんでした");
}
export async function deleteRequest(id: string) {
  const { error } = await need().from("requests").delete().eq("id", id);
  msg(error, "削除できませんでした");
}

// ---- あとで登録ボックス（自分専用・ログインなしでURLを保存） ----
export const INBOX = "__inbox__";
export interface InboxItem { id: string; url: string | null; text: string; createdAt: number; done?: boolean; acceptedRecipeId?: string | null }

export const inboxUrl = (token: string) => `${location.origin}/inbox/${token}?url=`;

export async function getInboxLink(): Promise<string | null> {
  return (await getActiveShare(INBOX))?.token ?? null;
}
export async function createInboxLink(): Promise<string> {
  const token = newToken();
  const { error } = await need().from("shares").insert({ token, recipe_id: INBOX, owner_name: "" });
  msg(error, "ボックスを作れませんでした");
  return token;
}
/** 作り直す（前のリンクは使えなくなる） */
export async function resetInboxLink(old: string): Promise<string> {
  await revokeShare(old);
  return createInboxLink();
}

/** ショートカットから：ボックスに保存（ログイン不要） */
export async function addInbox(token: string, url: string, text = ""): Promise<InboxItem> {
  const { data, error } = await need().rpc("add_inbox", { p_token: token, p_url: url || null, p_text: text });
  if (error) {
    if (/add_inbox|schema cache|does not exist/i.test(error.message)) throw new Error("ボックスの準備ができていません（Supabaseで 004_inbox.sql を実行してください）");
    throw new Error(/使えません|正しく|ありません|多すぎ/.test(error.message) ? error.message : `保存できませんでした：${error.message}`);
  }
  return data as InboxItem;
}

export async function fetchInbox(): Promise<InboxItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("inbox").select("id, url, text, done, accepted_recipe_id, created_at").order("created_at", { ascending: false });
  if (error) return [];
  return data.map((i) => ({ id: i.id, url: i.url, text: i.text, done: i.done, acceptedRecipeId: i.accepted_recipe_id, createdAt: Date.parse(i.created_at) }));
}
export async function setInboxDone(id: string, done: boolean) {
  const { error } = await need().from("inbox").update({ done }).eq("id", id);
  msg(error, "更新できませんでした");
}
export async function acceptInbox(id: string, recipeId: string) {
  const { error } = await need().from("inbox").update({ done: true, accepted_recipe_id: recipeId }).eq("id", id);
  msg(error, "更新できませんでした");
}
export async function deleteInbox(id: string) {
  const { error } = await need().from("inbox").delete().eq("id", id);
  msg(error, "削除できませんでした");
}

/** あとで登録ボックスの画面で選べるリクエスト先（ログイン不要） */
export async function getInboxTargets(token: string): Promise<{ id: string; label: string }[]> {
  const { data, error } = await need().rpc("get_inbox_targets", { p_inbox_token: token });
  if (error) return []; // 5回目の設定前など
  return Array.isArray(data) ? (data as { id: string; label: string }[]) : [];
}
export async function addRequestViaInbox(token: string, targetId: string, url: string, text = "") {
  // 友だち（id が "f:" で始まる）も送れる新しい関数。6回目の設定前は古い関数を使う
  let { error } = await need().rpc("send_inbox_request", { p_inbox_token: token, p_target: targetId, p_url: url || null, p_text: text });
  if (error && /send_inbox_request|schema cache/i.test(error.message) && !targetId.startsWith("f:")) {
    ({ error } = await need().rpc("add_request_via_inbox", { p_inbox_token: token, p_target_id: targetId, p_url: url || null, p_text: text }));
  }
  if (error) throw new Error(/見つかりません|止められ|名前|正しく|ありません|多すぎ|使えません/.test(error.message) ? error.message : `送れませんでした：${error.message}`);
}
