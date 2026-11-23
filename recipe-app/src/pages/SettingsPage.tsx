import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { exportBackup, importBackup } from "../lib/backup";
import { supabase } from "../lib/supabase";
import { syncNow, useSyncState } from "../lib/useSync";
import { getLastSyncedAt } from "../lib/sync";

function AccountSection() {
  const sync = useSyncState();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSynced, setLastSynced] = useState<number>();
  const recovery = params.get("recovery") === "1";

  useEffect(() => { getLastSyncedAt().then(setLastSynced); }, [sync.status]);
  if (!supabase) return null;

  const run = async (f: () => Promise<string | void>) => {
    setBusy(true); setMsg("");
    try { const m = await f(); if (m) setMsg(m); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const check = (error: { message: string } | null) => {
    if (!error) return;
    const m = error.message;
    throw new Error(
      /Invalid login/i.test(m) ? "メールアドレスかパスワードが違います" :
      /not confirmed/i.test(m) ? "確認メールのリンクを開いてから、もう一度ログインしてください" :
      /at least 6/i.test(m) ? "パスワードは6文字以上にしてください" : m);
  };

  if (sync.session && recovery) {
    return (
      <section className="panel">
        <h2>新しいパスワード</h2>
        <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6文字以上" />
        <button className="btn primary" disabled={busy || password.length < 6}
          onClick={() => run(async () => { check((await supabase!.auth.updateUser({ password })).error); return "パスワードを変更しました"; })}>変更する</button>
        {msg && <p className="hint">{msg}</p>}
      </section>
    );
  }

  if (sync.session) {
    return (
      <section className="panel">
        <h2>同期</h2>
        <p className="hint">
          {sync.session.user.email} でログイン中<br />
          {sync.status === "syncing" ? "同期中…" : sync.status === "error" ? `⚠ ${sync.error}` :
            lastSynced ? `最終同期：${new Date(lastSynced).toLocaleString("ja-JP")}` : ""}
        </p>
        <button className="btn primary" disabled={sync.status === "syncing"} onClick={() => syncNow()}>今すぐ同期</button>
        <button className="link small" onClick={() => confirm("ログアウトしますか？（この端末のレシピは残ります）") && supabase!.auth.signOut()}>ログアウト</button>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>ログイン（端末間の同期）</h2>
      <p className="hint">同じアカウントでログインした端末どうしで、レシピ・写真・コメントが自動で同期されます。</p>
      <input className="input" type="email" autoComplete="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="input" type="password" autoComplete="current-password" placeholder="パスワード（6文字以上）" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn primary" disabled={busy || !email || !password}
        onClick={() => run(async () => { check((await supabase!.auth.signInWithPassword({ email, password })).error); })}>ログイン</button>
      <button className="btn" disabled={busy || !email || password.length < 6}
        onClick={() => run(async () => {
          const { data, error } = await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
          check(error);
          return data.session ? "" : "確認メールを送りました。メールのリンクを開いたあと、ここでログインしてください。";
        })}>新規登録</button>
      <button className="link small" disabled={busy || !email}
        onClick={() => run(async () => {
          check((await supabase!.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/settings?recovery=1` })).error);
          return "パスワード再設定のメールを送りました";
        })}>パスワードを忘れた（メールアドレスを入力してから押す）</button>
      {msg && <p className="hint">{msg}</p>}
    </section>
  );
}

export function SettingsPage() {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function doExport() {
    setBusy(true);
    try {
      const n = await exportBackup();
      if (n) setMsg(`${n}件のレシピを書き出しました`);
    } catch (e) {
      setMsg(`失敗しました：${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function doImport(f: File) {
    setBusy(true);
    try {
      const { added, updated } = await importBackup(f);
      setMsg(`復元しました（追加 ${added}件・更新 ${updated}件）`);
    } catch (e) {
      setMsg(`失敗しました：${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="back">‹ 戻る</Link>
        <h1>設定</h1>
      </header>
      <AccountSection />
      <section className="panel">
        <h2>バックアップの書き出し</h2>
        <p className="hint">全レシピ・画像・コメントを1つのファイルに保存します。iPhone/iPadでは「"ファイル"に保存」からiCloud Driveに保存しておくと安心です。</p>
        <button className="btn" disabled={busy} onClick={doExport}>バックアップを書き出す</button>
      </section>
      <section className="panel">
        <h2>バックアップの読み込み</h2>
        <p className="hint">バックアップファイルから復元します。今あるレシピは消えず、同じレシピは新しい方が残ります。</p>
        <button className="btn" disabled={busy} onClick={() => ref.current?.click()}>ファイルを選ぶ</button>
        <input ref={ref} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) doImport(f); }} />
      </section>
      {msg && <div className="panel"><p className="pre">{msg}</p></div>}
    </div>
  );
}
