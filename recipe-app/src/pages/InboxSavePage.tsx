import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { addInbox } from "../lib/share";
import { findUrl } from "../lib/api";

/**
 * ショートカットから開くページ。ログインなし（プライベートブラウズでも）で、
 * URLを自分の「あとで登録ボックス」に保存する。
 */
export function InboxSavePage() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const incoming = findUrl(params.get("url") || "") || (params.get("url") || "").trim();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const ran = useRef(false);

  async function save(url: string) {
    setState("saving"); setError("");
    try {
      await addInbox(token, url);
      setSaved(url);
      setState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  useEffect(() => {
    if (incoming && !ran.current) { ran.current = true; save(incoming); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

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
        {state === "saving" && <p>保存中…</p>}
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
