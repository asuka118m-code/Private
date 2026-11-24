// ログイン状態の管理と、自動同期（起動時・変更時・画面に戻った時・オンライン復帰時）
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { onDataChange } from "./db";
import { resetSyncState, syncOnce } from "./sync";
import { supabaseRemote } from "./supabaseRemote";

export type SyncStatus = "off" | "idle" | "syncing" | "error";
let session: Session | null = null;
let status: SyncStatus = supabase ? "idle" : "off";
let lastError = "";
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (!supabase || !session) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      status = "syncing"; notify();
      try {
        await syncOnce(supabaseRemote(supabase!, session!.user.id));
        status = "idle"; lastError = "";
      } catch (e) {
        status = "error"; lastError = e instanceof Error ? e.message : String(e);
      }
      notify();
    } while (again && status !== "error");
    running = null;
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
const syncSoon = () => { clearTimeout(timer); timer = setTimeout(syncNow, 1500); };

export function initSync() {
  if (!supabase) return;
  supabase.auth.getSession().then(({ data }) => { session = data.session; notify(); syncNow(); });
  supabase.auth.onAuthStateChange((event, s) => {
    const prevUser = session?.user.id;
    session = s;
    if (event === "SIGNED_OUT" || (prevUser && s && prevUser !== s.user.id)) resetSyncState();
    notify();
    if (event === "SIGNED_IN") syncNow();
    if (event === "PASSWORD_RECOVERY" && !location.search.includes("recovery")) location.replace("/settings?recovery=1");
    // 招待メールから初めて来た人は、名前とパスワードの設定へ
    if (event === "SIGNED_IN" && sessionStorage.getItem("recipe-app:invite") && !location.search.includes("welcome")) {
      sessionStorage.removeItem("recipe-app:invite");
      location.replace("/settings?welcome=1");
    }
  });
  onDataChange((src) => src === "local" && syncSoon());
  addEventListener("online", () => syncNow());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && syncNow());
}

export function useSyncState() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((n) => n + 1); subs.add(f); return () => void subs.delete(f); }, []);
  return { enabled: !!supabase, session, status, error: lastError };
}
