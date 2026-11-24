// アカウントの名前（コメントやリクエストに使われる）と、リクエスト先
import { supabase } from "./supabase";

let cache: { userId: string; name: string } | null = null;
const listeners = new Set<() => void>();
export const onProfileChange = (f: () => void) => (listeners.add(f), () => void listeners.delete(f));

/** 自分の名前（未登録なら ""、ログインしていなければ null） */
export async function getMyName(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;
  if (cache?.userId === uid) return cache.name;
  const { data: rows, error } = await supabase.from("profiles").select("name").eq("user_id", uid).limit(1);
  if (error) return ""; // 5回目の設定前など
  cache = { userId: uid, name: (Array.isArray(rows) && rows[0]?.name) || "" };
  return cache.name;
}

export async function saveMyName(name: string) {
  if (!supabase) throw new Error("ログインが必要です");
  const n = name.trim();
  if (!n) throw new Error("名前を入れてください");
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("ログインが必要です");
  const { error } = await supabase.from("profiles").upsert({ user_id: uid, name: n, updated_at: new Date().toISOString() });
  if (error) throw new Error(/profiles|schema cache|does not exist/i.test(error.message) ? "準備ができていません（Supabaseで 005_accounts.sql を実行してください）" : error.message);
  cache = { userId: uid, name: n };
  listeners.forEach((f) => f());
}

export async function myUserId() {
  if (!supabase) return null;
  return (await supabase.auth.getSession()).data.session?.user.id ?? null;
}

// ---- リクエスト先（相手の「一覧の共有リンク」） ----
export interface RequestTarget { id: string; token: string; label: string }

export async function listTargets(): Promise<RequestTarget[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("request_targets").select("id, token, label").order("created_at");
  return !error && Array.isArray(data) ? data : [];
}
export async function addTarget(token: string, label: string) {
  if (!supabase) throw new Error("ログインが必要です");
  const { error } = await supabase.from("request_targets").upsert({ token, label: label.slice(0, 40) || "相手" }, { onConflict: "user_id,token" });
  if (error) throw new Error(/request_targets|schema cache|does not exist/i.test(error.message) ? "準備ができていません（Supabaseで 005_accounts.sql を実行してください）" : error.message);
}
export async function removeTarget(id: string) {
  if (!supabase) return;
  await supabase.from("request_targets").delete().eq("id", id);
}
