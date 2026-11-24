import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// 招待メールのリンクから来たか（Supabaseが読み取る前に記録しておく）
if (typeof location !== "undefined" && /type=invite/.test(location.hash)) sessionStorage.setItem("recipe-app:invite", "1");

/** Supabase未設定（ローカル開発など）の場合は null。同期・ログインは無効になる */
export const supabase = url && key ? createClient(url, key) : null;

export async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}
