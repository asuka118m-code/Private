import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { coverOf, listRecipes, onDataChange } from "../lib/db";
import { useSyncState } from "../lib/useSync";
import type { Recipe } from "../lib/types";
import { StoredImage } from "../components/StoredImage";

export function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [q, setQ] = useState("");
  const sync = useSyncState();
  useEffect(() => {
    listRecipes().then(setRecipes);
    return onDataChange(() => listRecipes().then(setRecipes));
  }, []);
  const shown = useMemo(() => {
    const k = q.trim();
    if (!recipes || !k) return recipes;
    return recipes.filter((r) => r.title.includes(k) || r.ingredients.some((i) => i.name.includes(k)));
  }, [recipes, q]);

  return (
    <div className="page">
      <header className="topbar">
        <h1>レシピ帳</h1>
        <Link to="/settings" className="btn small">
          {!sync.enabled ? "設定" : !sync.session ? "ログイン" : sync.status === "syncing" ? "同期中…" : sync.status === "error" ? "⚠ 同期エラー" : "☁ 同期済み"}
        </Link>
      </header>
      {sync.enabled && !sync.session && (
        <Link to="/settings" className="notice">ログインすると、iPhone・iPadなど複数の端末でレシピが同期されます ›</Link>
      )}
      <input className="search" placeholder="料理名・材料で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown && shown.length === 0 && (
        <div className="empty">
          {recipes?.length ? "見つかりませんでした" : (<>まだレシピがありません。<br />右下の「＋」から追加しましょう。</>)}
        </div>
      )}
      <ul className="recipe-grid">
        {shown?.map((r) => {
          const cover = coverOf(r);
          const rating = r.comments.find((c) => c.rating)?.rating;
          return (
            <li key={r.id}>
              <Link to={`/recipe/${r.id}`} className="card">
                {cover ? <StoredImage id={cover} className="card-img" /> : <div className="card-img noimg">🍳</div>}
                <div className="card-body">
                  <div className="card-title">{r.title || "（無題）"}</div>
                  <div className="card-meta">
                    {r.photoIds.length > 0 && <span>📷{r.photoIds.length}</span>}
                    {r.comments.length > 0 && <span>💬{r.comments.length}</span>}
                    {rating && <span className="stars">{"★".repeat(rating)}</span>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link to="/import" className="fab" aria-label="レシピを追加">＋</Link>
    </div>
  );
}
