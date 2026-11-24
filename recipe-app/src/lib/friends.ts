// 友だち：招待リンクでつながり、アプリの中で相手のレシピを見る（編集はできない）
import { supabase } from "./supabase";
import type { Comment } from "./types";
import type { FoodRequest, SharedList, SharedRecipe } from "./share";

function sb() {
  if (!supabase) throw new Error("ログインが必要です");
  return supabase;
}
const check = (error: { message: string } | null, fallback: string) => {
  if (!error) return;
  if (/friend|schema cache|does not exist/i.test(error.message) && !/友だち|ログイン|招待|自分|名前|コメント|リクエスト|URL/.test(error.message)) {
    throw new Error("友だち機能の準備ができていません（Supabaseで 006_friends.sql を実行してください）");
  }
  throw new Error(/[ぁ-んァ-ン一-龠]/.test(error.message) ? error.message : `${fallback}：${error.message}`);
};

export interface Friend { id: string; name: string; since: number }

export const friendInviteUrl = (code: string) => `${location.origin}/friend/${code}`;

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 自分の友だち招待コード（なければ作る） */
export async function getOrCreateFriendCode(): Promise<string> {
  const { data, error } = await sb().from("friend_codes").select("code").eq("revoked", false).order("created_at", { ascending: false }).limit(1);
  check(error, "招待リンクを読み込めませんでした");
  if (Array.isArray(data) && data[0]) return data[0].code;
  const code = newCode();
  const { error: e2 } = await sb().from("friend_codes").insert({ code });
  check(e2, "招待リンクを作れませんでした");
  return code;
}
/** 招待リンクを作り直す（前のリンクは使えなくなる。友だちは解除されない） */
export async function resetFriendCode(old: string): Promise<string> {
  await sb().from("friend_codes").update({ revoked: true }).eq("code", old);
  const code = newCode();
  const { error } = await sb().from("friend_codes").insert({ code });
  check(error, "招待リンクを作れませんでした");
  return code;
}

export async function getFriendCodeOwner(code: string): Promise<{ name: string; self: boolean; already: boolean } | null> {
  const { data, error } = await sb().rpc("get_friend_code_owner", { p_code: code });
  check(error, "招待リンクを確認できませんでした");
  return (data as { name: string; self: boolean; already: boolean }) ?? null;
}
export async function acceptFriend(code: string): Promise<{ id: string; name: string }> {
  const { data, error } = await sb().rpc("accept_friend", { p_code: code });
  check(error, "友だちになれませんでした");
  return data as { id: string; name: string };
}
export async function listFriends(): Promise<Friend[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_friends");
  if (error) return [];
  return Array.isArray(data) ? (data as Friend[]) : [];
}
export async function removeFriend(friendId: string) {
  const { data } = await sb().auth.getSession();
  const me = data.session?.user.id;
  if (!me) return;
  const [a, b] = me < friendId ? [me, friendId] : [friendId, me];
  const { error } = await sb().from("friendships").delete().eq("user_a", a).eq("user_b", b);
  check(error, "友だちを解除できませんでした");
}

export async function getFriendRecipes(friendId: string): Promise<SharedList | null> {
  const { data, error } = await sb().rpc("get_friend_recipes", { p_friend: friendId });
  check(error, "レシピを読み込めませんでした");
  return (data as SharedList) ?? null;
}
export async function getFriendRecipe(friendId: string, recipeId: string): Promise<SharedRecipe | null> {
  const { data, error } = await sb().rpc("get_friend_recipe", { p_friend: friendId, p_recipe_id: recipeId });
  check(error, "レシピを読み込めませんでした");
  if (!data) return null;
  return { ...data, comments: (data.comments as Comment[]).map((c) => ({ ...c, shared: true })) } as SharedRecipe;
}
export async function addFriendComment(friendId: string, recipeId: string, text: string, rating?: number): Promise<Comment> {
  const { data, error } = await sb().rpc("add_friend_comment", { p_friend: friendId, p_recipe_id: recipeId, p_text: text, p_rating: rating ?? null });
  check(error, "送信できませんでした");
  return { ...(data as Comment), shared: true };
}
export async function addFriendRequest(friendId: string, text: string, url?: string, recipeId?: string | null): Promise<FoodRequest> {
  const { data, error } = await sb().rpc("add_friend_request", { p_friend: friendId, p_text: text, p_url: url || null, p_recipe_id: recipeId ?? null });
  check(error, "送信できませんでした");
  return data as FoodRequest;
}
