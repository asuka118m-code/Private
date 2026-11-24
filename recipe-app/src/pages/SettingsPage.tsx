import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { exportBackup, importBackup } from "../lib/backup";
import { supabase } from "../lib/supabase";
import { syncNow, useSyncState } from "../lib/useSync";
import { getLastSyncedAt } from "../lib/sync";
import { createInboxLink, getInboxLink, inboxUrl, resetInboxLink } from "../lib/share";
import { getMyName, listTargets, removeTarget, saveMyName, type RequestTarget } from "../lib/profile";

function AccountSection() {
  const sync = useSyncState();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSynced, setLastSynced] = useState<number>();
  const recovery = params.get("recovery") === "1";
  const welcome = params.get("welcome") === "1";

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

  if (sync.session && welcome) return <WelcomeSection />;

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
        <NameField />
        <PasswordChange />
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
      <ShortcutSection />
      <InboxSection />
      <TargetsSection />
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

/** iPhone・iPad の共有メニューから送るための「ショートカット」の作り方 */
function ShortcutSection() {
  const base = `${location.origin}/import?auto=1&url=`;
  const [copied, setCopied] = useState(false);
  return (
    <section className="panel">
      <h2>iPhone・iPadの共有メニューから送る</h2>
      <p className="hint">「ショートカット」アプリで一度だけ作ると、Instagramやレシピサイトの共有ボタンに「あじめもに追加」が出ます。</p>
      <ol className="howto">
        <li>「ショートカット」アプリを開き、右上の「＋」で新しいショートカットを作る</li>
        <li>名前を「あじめもに追加」にする（上の名前の部分をタップ）</li>
        <li>下の検索で「<b>URLをエンコード</b>」を追加する</li>
        <li>続けて「<b>テキスト</b>」を追加し、下の文字を貼り付けてから、その後ろに「URLエンコードされたテキスト」（変数）を入れる
          <div className="share-url">{base}</div>
          <button className="btn small" onClick={async () => { await navigator.clipboard?.writeText(base); setCopied(true); }}>{copied ? "コピーしました" : "この文字をコピー"}</button>
        </li>
        <li>続けて「<b>URLを開く</b>」を追加する（入力は「テキスト」）</li>
        <li>下の「ⓘ（詳細）」で「<b>共有シートに表示</b>」をオンにし、受け取る種類を「URL」と「テキスト」にする</li>
        <li>「URLをエンコード」の入力が「<b>ショートカットの入力</b>」になっていることを確認して完了</li>
      </ol>
      <p className="hint small">送るとSafariで開きます。Safariでもログインしておくと、読み取ったレシピが同期され、ホーム画面のアプリにも入ります。</p>
    </section>
  );
}

/** あとで登録ボックス：ログインなし（プライベートブラウズでも）でショートカットから保存する */
function InboxSection() {
  const sync = useSyncState();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (sync.session) getInboxLink().then(setToken).catch((e) => { setMsg(e.message); setToken(null); }); }, [sync.session]);
  if (!sync.session) return null;
  const run = async (f: () => Promise<string>) => { setMsg(""); try { setToken(await f()); setCopied(false); } catch (e) { setMsg((e as Error).message); } };

  return (
    <section className="panel">
      <h2>🔖 あとで登録ボックス</h2>
      <p className="hint">ショートカットの送り先をこのボックスにすると、<b>ログインしていなくても（プライベートブラウズでも）</b>URLを保存できます。保存したものは、一覧の「🔖 あとで登録」から登録できます。</p>
      {token === undefined ? <p className="hint">確認中…</p> : token ? (
        <>
          <p className="hint small">ショートカットの「テキスト」の文字を、これに置き換えてください（後ろの「URLエンコード済みのテキスト」はそのまま）。</p>
          <div className="share-url">{inboxUrl(token)}</div>
          <div className="row">
            <button className="btn small" onClick={async () => { await navigator.clipboard?.writeText(inboxUrl(token)); setCopied(true); }}>{copied ? "コピーしました" : "この文字をコピー"}</button>
            <button className="link small" onClick={() => confirm("作り直すと、今のショートカットの文字は使えなくなります。作り直しますか？") && run(() => resetInboxLink(token))}>作り直す</button>
          </div>
        </>
      ) : (
        <button className="btn primary" onClick={() => run(createInboxLink)}>ボックスを作る</button>
      )}
      {msg && <p className="hint">{msg}</p>}
    </section>
  );
}

/** アカウントの名前（コメント・リクエストに使われる） */
function NameField({ onSaved }: { onSaved?: () => void }) {
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { getMyName().then((n) => { setName(n ?? ""); setLoaded(true); }); }, []);
  if (!loaded) return null;
  return (
    <div className="field">
      名前（コメントやリクエストに表示されます）
      <div className="row">
        <input className="input grow" maxLength={40} value={name} placeholder="例：あすか" onChange={(e) => { setName(e.target.value); setMsg(""); }} />
        <button className="btn small" disabled={!name.trim()} onClick={async () => {
          try { await saveMyName(name); setMsg("保存しました"); onSaved?.(); } catch (e) { setMsg((e as Error).message); }
        }}>保存</button>
      </div>
      {msg && <span className="hint small">{msg}</span>}
    </div>
  );
}

function PasswordChange({ title = "パスワードを変更", onDone }: { title?: string; onDone?: () => void }) {
  const [open, setOpen] = useState(!!onDone);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  if (!open) return <button className="link small" onClick={() => setOpen(true)}>{title}</button>;
  return (
    <div className="field">
      {title}
      <div className="row">
        <input className="input grow" type="password" autoComplete="new-password" placeholder="6文字以上" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn small" disabled={pw.length < 6} onClick={async () => {
          const { error } = await supabase!.auth.updateUser({ password: pw });
          if (error) setMsg(error.message); else { setMsg("設定しました"); setPw(""); onDone?.(); }
        }}>設定</button>
      </div>
      {msg && <span className="hint small">{msg}</span>}
    </div>
  );
}

/** 招待メールから初めて来た人：名前とパスワードを決める */
function WelcomeSection() {
  const [nameDone, setNameDone] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  return (
    <section className="panel welcome">
      <h2>ようこそ、あじめもへ！</h2>
      <p className="hint">はじめに、名前とパスワードを決めてください。名前は、コメントやリクエストを送る時に相手に表示されます。</p>
      <NameField onSaved={() => setNameDone(true)} />
      <PasswordChange title="パスワード（次からのログインに使います）" onDone={() => setPwDone(true)} />
      {nameDone && pwDone && <Link to="/" className="btn primary wide">はじめる</Link>}
    </section>
  );
}

/** リクエスト先（相手の一覧の共有リンク）。あとで登録ボックスの画面から選べる */
function TargetsSection() {
  const sync = useSyncState();
  const [targets, setTargets] = useState<RequestTarget[] | null>(null);
  useEffect(() => { if (sync.session) listTargets().then(setTargets); }, [sync.session]);
  if (!sync.session || !targets) return null;
  return (
    <section className="panel">
      <h2>🙋 リクエスト先</h2>
      <p className="hint small">相手からもらった「一覧の共有リンク」を開いて「リクエスト先に登録」を押すと、ここに並びます。ショートカット（あとで登録ボックス）で送る時に「○○さんにリクエスト」を選べます。</p>
      {targets.length === 0 ? <p className="hint small">まだありません。</p> : (
        <ul className="target-list">
          {targets.map((t) => (
            <li key={t.id}>
              <Link to={`/s/${t.token}`} className="recipe-link">{t.label}さんのレシピ</Link>
              <button className="link small" onClick={() => confirm(`「${t.label}」をリクエスト先から外しますか？`) && removeTarget(t.id).then(() => setTargets(targets.filter((x) => x.id !== t.id)))}>外す</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
