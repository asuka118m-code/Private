import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteInbox, setInboxDone, type InboxItem } from "../lib/share";
import { setPendingRequest } from "../lib/draft";
import type { Recipe } from "../lib/types";

const fmt = (t: number) => new Date(t).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/** あとで登録ボックス（自分だけ）。OKしたものだけレシピにする */
export function InboxBoard({ items, recipes, onChange }: { items: InboxItem[]; recipes: Recipe[]; onChange: (next: InboxItem[]) => void }) {
  const nav = useNavigate();
  const [showDone, setShowDone] = useState(false);
  const [err, setErr] = useState("");
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  const act = async (f: () => Promise<void>, next: (l: InboxItem[]) => InboxItem[]) => {
    setErr("");
    try { await f(); onChange(next(items)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  function accept(i: InboxItem) {
    setPendingRequest({ id: i.id, author: "", text: i.text, url: i.url, kind: "inbox" });
    nav("/import?fromRequest=1");
  }

  const card = (i: InboxItem) => {
    const accepted = i.acceptedRecipeId ? recipes.find((r) => r.id === i.acceptedRecipeId) : undefined;
    return (
      <li key={i.id} className={`req-card inbox-card ${i.done ? "done" : ""}`}>
        <div className="req-top"><b>🔖 {i.url ? hostOf(i.url) : "メモ"}</b><small>{fmt(i.createdAt)}</small></div>
        {i.text && <div className="req-what">{i.text}</div>}
        {i.url && <a href={i.url} target="_blank" rel="noreferrer" className="ref-link">{i.url.length > 60 ? i.url.slice(0, 60) + "…" : i.url}</a>}
        {i.done ? (
          <div className="req-status">
            {accepted ? <>✓ レシピにしました：<Link to={`/recipe/${accepted.id}`} className="recipe-link">{accepted.title}</Link></> : i.acceptedRecipeId ? "✓ レシピにしました" : "登録しない"}
            <button className="link small" onClick={() => act(() => setInboxDone(i.id, false), (l) => l.map((x) => (x.id === i.id ? { ...x, done: false } : x)))}>戻す</button>
            <button className="link small" onClick={() => confirm("消しますか？") && act(() => deleteInbox(i.id), (l) => l.filter((x) => x.id !== i.id))}>消す</button>
          </div>
        ) : (
          <div className="req-actions-row">
            <button className="btn small primary" onClick={() => accept(i)}>OK、レシピにする</button>
            <button className="btn small" onClick={() => act(() => setInboxDone(i.id, true), (l) => l.map((x) => (x.id === i.id ? { ...x, done: true } : x)))}>登録しない</button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="request-board">
      <p className="hint small">ショートカットから保存したURLです（あなただけに見えます）。「OK、レシピにする」で読み取って登録します。</p>
      {open.length === 0 && (
        <div className="empty">保存されたものはありません。<br />設定の「あとで登録ボックス」でショートカットを作ると、Instagramなどからここに保存できます。</div>
      )}
      <ul className="req-cards">{open.map(card)}</ul>
      {done.length > 0 && (
        <>
          <button className="link small" onClick={() => setShowDone(!showDone)}>{showDone ? "済みを隠す" : `済み（${done.length}件）を見る`}</button>
          {showDone && <ul className="req-cards">{done.map(card)}</ul>}
        </>
      )}
      {err && <div className="error">{err}</div>}
    </div>
  );
}
