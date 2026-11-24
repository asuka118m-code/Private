import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteRequest, fetchRequests, setRequestDone, type FoodRequest } from "../lib/share";
import { listRecipes } from "../lib/db";
import type { Recipe } from "../lib/types";
import { useSyncState } from "../lib/useSync";

const fmt = (t: number) => new Date(t).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });

/** 届いた「食べたい」リクエスト（作る人の画面） */
export function RequestsPage() {
  const sync = useSyncState();
  const [reqs, setReqs] = useState<FoodRequest[] | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { listRecipes().then(setRecipes); }, []);
  useEffect(() => { if (sync.session) fetchRequests().then(setReqs); }, [sync.session]);

  const act = async (f: () => Promise<void>, next: (r: FoodRequest[]) => FoodRequest[]) => {
    setErr("");
    try { await f(); setReqs((r) => (r ? next(r) : r)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const open = (reqs ?? []).filter((r) => !r.done);
  const done = (reqs ?? []).filter((r) => r.done);

  const item = (r: FoodRequest) => {
    const recipe = r.recipeId ? recipes.find((x) => x.id === r.recipeId) : undefined;
    return (
      <li key={r.id} className={r.done ? "done" : ""}>
        <div className="req-main">
          <b>{r.author}</b><small>{fmt(r.createdAt)}</small>
          <div>
            {recipe && <Link to={`/recipe/${recipe.id}`} className="recipe-link">📖 {recipe.title}</Link>}
            {recipe && r.text ? "　" : ""}{r.text}
          </div>
        </div>
        <div className="req-actions">
          <button className="btn small" onClick={() => act(() => setRequestDone(r.id, !r.done), (l) => l.map((x) => (x.id === r.id ? { ...x, done: !r.done } : x)))}>
            {r.done ? "戻す" : "✓ 作った"}
          </button>
          <button className="link small" onClick={() => confirm("このリクエストを消しますか？") && act(() => deleteRequest(r.id), (l) => l.filter((x) => x.id !== r.id))}>消す</button>
        </div>
      </li>
    );
  };

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="back">‹ 一覧</Link>
        <h1>🙋 食べたいリクエスト</h1>
      </header>
      {!sync.session ? <p className="hint">見るにはログインしてください。<Link to="/settings" className="link">ログインへ</Link></p> : (
        <>
          {reqs === null && <p className="hint">読み込み中…</p>}
          {reqs && open.length === 0 && <div className="empty">今届いているリクエストはありません。</div>}
          <ul className="req-list">{open.map(item)}</ul>
          {done.length > 0 && (
            <>
              <button className="link small" onClick={() => setShowDone(!showDone)}>{showDone ? "作ったものを隠す" : `作ったもの（${done.length}件）を見る`}</button>
              {showDone && <ul className="req-list">{done.map(item)}</ul>}
            </>
          )}
          <p className="hint small">リクエストは、一覧の共有リンク（一覧の「みんなに見せる」）から届きます。「✓ 作った」にすると、相手の画面からも消えます。</p>
        </>
      )}
      {err && <div className="error">{err}</div>}
    </div>
  );
}
