import { useState } from "react";
import { addRequest, getGuestName, type FoodRequest } from "../lib/share";

/** 「食べたい」リクエストを送る（レシピ指定 or 自由に書く） */
export function RequestForm({ token, recipeId, recipeTitle, onSent }: {
  token: string; recipeId?: string; recipeTitle?: string; onSent?: (r: FoodRequest) => void;
}) {
  const [name, setName] = useState(getGuestName());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function send() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await addRequest(token, name.trim(), text.trim(), recipeId);
      setText("");
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
      <input className="input" placeholder="あなたの名前" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input" maxLength={500} value={text} onChange={(e) => { setText(e.target.value); setMsg(""); }}
        placeholder={recipeId ? "ひとこと（例：週末に食べたい！）※なくてもOK" : "食べたいもの（例：ハンバーグ、辛めのカレー）"} />
      <button className="btn primary" disabled={busy || !name.trim() || (!recipeId && !text.trim())} onClick={send}>
        {busy ? "送信中…" : recipeId ? "🙋 これ食べたい！" : "🙋 リクエストを送る"}
      </button>
      {msg && <p className="hint">{msg}</p>}
      {err && <div className="error">{err}</div>}
    </div>
  );
}
