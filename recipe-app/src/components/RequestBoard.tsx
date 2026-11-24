import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteRequest, setRequestDone, type FoodRequest } from "../lib/share";
import { requestMemo, setDraft, setPendingRequest } from "../lib/draft";
import type { Recipe } from "../lib/types";

const fmt = (t: number) => new Date(t).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/**
 * 届いた「食べたい」リクエスト。自分のレシピとは別に管理し、
 * OKしたものだけレシピにして自分の一覧に入れる。
 */
export function RequestBoard({ requests, recipes, onChange }: {
  requests: FoodRequest[]; recipes: Recipe[]; onChange: (next: FoodRequest[]) => void;
}) {
  const nav = useNavigate();
  const [showDone, setShowDone] = useState(false);
  const [err, setErr] = useState("");
  const open = requests.filter((r) => !r.done);
  const done = requests.filter((r) => r.done);

  const act = async (f: () => Promise<void>, next: (r: FoodRequest[]) => FoodRequest[]) => {
    setErr("");
    try { await f(); onChange(next(requests)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  function accept(r: FoodRequest) {
    const pending = { id: r.id, author: r.author, text: r.text, url: r.url, kind: "request" as const };
    if (r.url) {
      setPendingRequest(pending); // 取り込み画面でURLから読み取る
      nav("/import?fromRequest=1");
    } else {
      setDraft({
        title: r.text, servings: "", ingredients: [], steps: [], sourceUrl: "", sourceImages: [],
        memo: requestMemo(pending), fromRequest: { id: r.id, author: r.author, kind: "request" },
      });
      nav("/new");
    }
  }

  const card = (r: FoodRequest) => {
    const existing = r.recipeId ? recipes.find((x) => x.id === r.recipeId) : undefined;
    const accepted = r.acceptedRecipeId ? recipes.find((x) => x.id === r.acceptedRecipeId) : undefined;
    return (
      <li key={r.id} className={`req-card ${r.done ? "done" : ""}`}>
        <div className="req-top"><b>🙋 {r.author}</b><small>{fmt(r.createdAt)}</small></div>
        <div className="req-what">
          {existing && <Link to={`/recipe/${existing.id}`} className="recipe-link">📖 {existing.title}</Link>}
          {r.text && <span>{r.text}</span>}
        </div>
        {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="ref-link">🔗 参考：{hostOf(r.url)}</a>}
        {r.done ? (
          <div className="req-status">
            {accepted ? <>✓ レシピにしました：<Link to={`/recipe/${accepted.id}`} className="recipe-link">{accepted.title}</Link></> :
              r.acceptedRecipeId ? "✓ レシピにしました" : existing ? "✓ 作った" : "見送り"}
            <button className="link small" onClick={() => act(() => setRequestDone(r.id, false), (l) => l.map((x) => (x.id === r.id ? { ...x, done: false } : x)))}>戻す</button>
            <button className="link small" onClick={() => confirm("このリクエストを消しますか？") && act(() => deleteRequest(r.id), (l) => l.filter((x) => x.id !== r.id))}>消す</button>
          </div>
        ) : existing ? (
          <div className="req-actions-row">
            <button className="btn small primary" onClick={() => act(() => setRequestDone(r.id, true), (l) => l.map((x) => (x.id === r.id ? { ...x, done: true } : x)))}>✓ 作った</button>
            <button className="link small" onClick={() => confirm("このリクエストを消しますか？") && act(() => deleteRequest(r.id), (l) => l.filter((x) => x.id !== r.id))}>消す</button>
          </div>
        ) : (
          <div className="req-actions-row">
            <button className="btn small primary" onClick={() => accept(r)}>OK、レシピにする</button>
            <button className="btn small" onClick={() => confirm("このリクエストを見送りますか？（相手の画面から消えます）") && act(() => setRequestDone(r.id, true), (l) => l.map((x) => (x.id === r.id ? { ...x, done: true } : x)))}>見送る</button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="request-board">
      <p className="hint small">家族から届いた「食べたい」です。あなたのレシピとは別に管理されます。「OK、レシピにする」で、あなたのレシピ一覧に加わります。</p>
      {open.length === 0 && <div className="empty">今届いているリクエストはありません。<br />一覧の「みんなに見せる」からリンクを送ると、リクエストが届きます。</div>}
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
