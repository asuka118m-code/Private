import { useState } from "react";
import { addRequest, getGuestName, type FoodRequest } from "../lib/share";
import { GuestNameField } from "./GuestName";

/** 「食べたい」リクエストを送る（レシピ指定 or 自由に書く） */
export function RequestForm({ token, recipeId, recipeTitle, onSent, initialUrl = "" }: {
  token: string; recipeId?: string; recipeTitle?: string; onSent?: (r: FoodRequest) => void;
  initialUrl?: string; // 共有メニュー（ショートカット）から来た時のURL
}) {
  const [name, setName] = useState(getGuestName());
  const [text, setText] = useState("");
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function send() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const link = url.trim();
      if (link && !/^https?:\/\//.test(link)) throw new Error("URLは https:// から始まる形で貼ってください");
      const r = await addRequest(token, name.trim(), text.trim(), recipeId, link || undefined);
      setText("");
      setUrl("");
      setMsg(recipeTitle ? `「${recipeTitle}」をリクエストしました！` : "リクエストを送りました！");
      onSent?.(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="request-form">
      <GuestNameField value={name} onChange={setName} />
      <input className="input" maxLength={500} value={text} onChange={(e) => { setText(e.target.value); setMsg(""); }}
        placeholder={recipeId ? "ひとこと（例：週末に食べたい！）※なくてもOK" : "食べたいもの（例：ハンバーグ、辛めのカレー）"} />
      {!recipeId && (
        <div className="row">
          <input className="input grow" type="url" inputMode="url" maxLength={1000} value={url} onChange={(e) => { setUrl(e.target.value); setMsg(""); }}
            placeholder="参考のURL（Instagram・YouTubeなど）※なくてもOK" />
          {navigator.clipboard?.readText && (
            <button type="button" className="btn small nowrap" onClick={async () => {
              try { const t = await navigator.clipboard.readText(); const u = t.match(/https?:\/\/[^\s"'<>]+/)?.[0]; if (u) setUrl(u); else setErr("コピーされた中にURLが見つかりませんでした"); }
              catch { setErr("貼り付けが許可されませんでした。欄を長押しして「ペースト」してください"); }
            }}>📋 貼り付け</button>
          )}
        </div>
      )}
      <button className="btn primary" disabled={busy || !name.trim() || (!recipeId && !text.trim() && !url.trim())} onClick={send}>
        {busy ? "送信中…" : recipeId ? "🙋 これ食べたい！" : "🙋 リクエストを送る"}
      </button>
      {msg && <p className="hint">{msg}</p>}
      {err && <div className="error">{err}</div>}
    </div>
  );
}
