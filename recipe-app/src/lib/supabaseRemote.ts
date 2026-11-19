// Supabase（クラウドDB + 画像ストレージ）との接続部分
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Remote, RemoteRow } from "./sync";

const BUCKET = "recipe-images";
const PAGE = 500;

export function supabaseRemote(sb: SupabaseClient, userId: string): Remote {
  const path = (id: string) => `${userId}/${id}`;
  return {
    async push(rows) {
      for (let i = 0; i < rows.length; i += PAGE) {
        const { error } = await sb
          .from("recipes")
          .upsert(rows.slice(i, i + PAGE).map((r) => ({ ...r, user_id: userId })), { onConflict: "user_id,id" });
        if (error) throw new Error(`同期に失敗しました：${error.message}`);
      }
    },
    async pullSince(since) {
      const out: RemoteRow[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = sb.from("recipes").select("id,data,updated_at,deleted,server_updated_at").order("server_updated_at").range(from, from + PAGE - 1);
        if (since) q = q.gt("server_updated_at", since);
        const { data, error } = await q;
        if (error) throw new Error(`同期に失敗しました：${error.message}`);
        out.push(...(data as RemoteRow[]));
        if (data.length < PAGE) return out;
      }
    },
    async uploadImage(id, blob) {
      const { error } = await sb.storage.from(BUCKET).upload(path(id), blob, { upsert: true, contentType: blob.type || "image/jpeg" });
      if (error) throw new Error(`画像のアップロードに失敗しました：${error.message}`);
    },
    async downloadImage(id) {
      const { data, error } = await sb.storage.from(BUCKET).download(path(id));
      return error ? null : data;
    },
    async deleteImages(ids) {
      for (let i = 0; i < ids.length; i += 100) await sb.storage.from(BUCKET).remove(ids.slice(i, i + 100).map(path));
    },
  };
}
