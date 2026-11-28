import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { addInbox, addRequestViaInbox, getInboxTargets } from "../lib/share";
import { findUrl } from "../lib/api";

/**
 * ショートカットから開くページ。ログインなし（プライベートブラウズでも）で、
 * URLを自分の「あとで登録ボックス」に保存する。
 */
export function InboxSavePage() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const incoming = findUrl(params.get("url") || "") || (params.get("url") || "").trim();
  const [state, setState] = useState<"loading" | "choose" | "idle" | "saving" | "saved" | "sent" | "error">("loading");
  const [targets, setTargets] = useState<{ id: string; label: string }[]>([]);
  const [sentTo, setSentTo] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const ran = useRef(false);
  const LAST = `recipe-app:inbox-last:${token}`;

  // 保存・送信したら、ページのアドレスからURLを消す（Safariがページを読み込み直しても、もう一度保存しない）
  function finish(kind: "saved" | "sent", url: string, label = "") {
    sessionStorage.setItem(LAST, JSON.stringify({ kind, url, label, at: Date.now() }));
    history.replaceState(null, "", location.pathname);
  }

  async function save(url: string) {
    setState("saving"); setError("");
    try {
      await addInbox(token, url);
      setSaved(url);
      setState("saved");
      finish("saved", url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  // リクエスト先が登録されていれば「自分に保存／○○さんにリクエスト」を選ぶ。なければすぐ保存
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    // 読み込み直した時：さっき保存したものなら「保存しました」の表示のままにする
    if (!incoming) {
      try {
        const last = JSON.parse(sessionStorage.getItem(LAST) || "null");
        if (last && Date.now() - last.at < 30 * 60 * 1000) {
          if (last.kind === "sent") { setSentTo(last.label); setSaved(last.url); setState("sent"); } else { setSaved(last.url); setState("saved"); }
          return;
        }
      } catch { /* 何もしない */ }
    }
    getInboxTargets(token).then((t) => {
      setTargets(t);
      if (!incoming) setState("idle");
      else if (t.length) setState("choose");
      else save(incoming);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function sendTo(id: string, label: string) {
    setState("saving"); setError("");
    try {
      await addRequestViaInbox(token, id, incoming, note.trim());
      setSentTo(label);
      setSaved(incoming);
      setState("sent");
      finish("sent", incoming, label);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("choose");
    }
  }

  async function paste() {
    try {
      const u = findUrl(await navigator.clipboard.readText());
      if (u) save(u); else setError("コピーされた中にURLが見つかりませんでした");
    } catch { setError("貼り付けが許可されませんでした。下の欄を長押しして「ペースト」してください"); }
  }

  return (
    <div className="page shared-page">
      <header className="shared-head">
        <img src="/icons-v2/icon-192.png" alt="" />
        <span>あとで登録ボックス</span>
      </header>
      <section className="panel">
        {state === "loading" && <p>読み込み中…</p>}
        {state === "saving" && <p>送信中…</p>}
        {state === "choose" && (
          <>
            <h2>どうしますか？</h2>
            <p className="share-url">{incoming}</p>
            <button className="btn primary wide" onClick={() => save(incoming)}>🔖 自分に保存（あとで登録）</button>
            <input className="input" maxLength={500} placeholder="ひとこと（リクエストに付ける・なくてもOK）" value={note} onChange={(e) => setNote(e.target.value)} />
            {targets.map((t) => (
              <button key={t.id} className="btn wide target-send" onClick={() => sendTo(t.id, t.label)}>🙋 {t.label}さんにリクエスト</button>
            ))}
          </>
        )}
        {state === "sent" && (
          <>
            <h2>🙋 {sentTo}さんにリクエストしました</h2>
            <p className="share-url">{saved || incoming}</p>
            <p className="hint">このページは閉じて大丈夫です。</p>
          </>
        )}
        {state === "saved" && (
          <>
            <h2>🔖 保存しました</h2>
            <p className="share-url">{saved}</p>
            <p className="hint">あじめもを開くと「🔖 あとで登録」に入っています。このページは閉じて大丈夫です。</p>
            <Link className="btn wide" to={`/import?auto=1&url=${encodeURIComponent(saved)}`}>今すぐ登録する（ログイン中の場合）</Link>
          </>
        )}
        {(state === "idle" || state === "error") && (
          <>
            <h2>URLを保存</h2>
            {!incoming && <p className="hint">共有からURLを受け取れませんでした。Instagramなどで「リンクをコピー」してから、下のボタンを押してください。</p>}
            {typeof navigator.clipboard?.readText === "function" && <button className="btn primary wide" onClick={paste}>📋 コピーしたリンクを保存</button>}
            <div className="row">
              <input className="input grow" type="url" inputMode="url" placeholder="https://..." value={manual} onChange={(e) => setManual(e.target.value)} />
              <button className="btn" disabled={!findUrl(manual)} onClick={() => save(findUrl(manual))}>保存</button>
            </div>
          </>
        )}
        {error && <div className="error">{error}</div>}
      </section>
    </div>
  );
}
