// 共有リンク：レシピを相手に見せて、感想コメントをもらう
import { supabase } from "./supabase";
import type { Comment, Recipe } from "./types";

const OWNER_NAME_KEY = "recipe-app:ownerName";
const GUEST_NAME_KEY = "recipe-app:guestName";
export const getOwnerName = () => localStorage.getItem(OWNER_NAME_KEY) || "";
export const setOwnerName = (n: string) => localStorage.setItem(OWNER_NAME_KEY, n);
export const getGuestName = () => localStorage.getItem(GUEST_NAME_KEY) || "";
export const setGuestName = (n: string) => localStorage.setItem(GUEST_NAME_KEY, n);

export const shareUrl = (token: string) => `${location.origin}/s/${token}`;

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
export async function getActiveShare(recipeId: string): Promise<ShareInfo | null> {
  const sb = need();
  const { data, error } = await sb.from("shares").select("token, owner_name").eq("recipe_id", recipeId).eq("revoked", false)
    .order("created_at", { ascending: false }).limit(1);
  msg(error, "共有の確認に失敗しました");
  return data?.[0] ? { token: data[0].token, ownerName: data[0].owner_name } : null;
}

export async function createShare(recipeId: string, ownerName: string): Promise<ShareInfo> {
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

export async function getSharedRecipe(token: string): Promise<SharedRecipe | null> {
  const { data, error } = await need().rpc("get_shared_recipe", { p_token: token });
  msg(error, "レシピを読み込めませんでした");
  if (!data) return null;
  return { ...data, comments: (data.comments as Comment[]).map((c) => ({ ...c, shared: true })) } as SharedRecipe;
}

export async function addSharedComment(token: string, author: string, text: string, rating?: number): Promise<Comment> {
  const { data, error } = await need().rpc("add_shared_comment", { p_token: token, p_author: author, p_text: text, p_rating: rating ?? null });
  if (error) throw new Error(error.message.includes("使えません") || error.message.includes("多すぎ") ? error.message : `送信できませんでした：${error.message}`);
  setGuestName(author);
  return { ...(data as Comment), shared: true };
}

export async function loadSharedImage(ownerId: string, imageId: string): Promise<Blob | null> {
  const { data, error } = await need().storage.from("recipe-images").download(`${ownerId}/${imageId}`);
  return error ? null : data;
}
