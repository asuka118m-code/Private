import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { coverOf, getSelectedCategory, listCategories, listRecipes, onDataChange, setSelectedCategory } from "../lib/db";
import { useSyncState } from "../lib/useSync";
import type { Category, Recipe } from "../lib/types";
import { StoredImage } from "../components/StoredImage";

export function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState(getSelectedCategory);
  const [q, setQ] = useState("");
  const sync = useSyncState();
  useEffect(() => {
    const load = () => { listRecipes().then(setRecipes); listCategories().then(setCategories); };
    load();
    return onDataChange(load);
  }, []);
  // 選んでいたカテゴリが消えていたら「すべて」に戻す
  const current = categories.some((c) => c.id === selected) ? selected : "";
  const select = (id: string) => { setSelected(id); setSelectedCategory(id); };

  const count = (id: string) => recipes?.filter((r) => r.categoryIds?.includes(id)).length ?? 0;
  const shown = useMemo(() => {
    let list = recipes;
    if (list && current) list = list.filter((r) => r.categoryIds?.includes(current));
    const k = q.trim();
    if (!list || !k) return list;
    return list.filter((r) => r.title.includes(k) || r.ingredients.some((i) => i.name.includes(k)));
  }, [recipes, q, current]);

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
      <nav className="cat-bar">
        <button className={`chip ${current === "" ? "on" : ""}`} onClick={() => select("")}>すべて <span>{recipes?.length ?? 0}</span></button>
        {categories.map((c) => (
          <button key={c.id} className={`chip ${current === c.id ? "on" : ""}`} onClick={() => select(c.id)}>
            {c.name} <span>{count(c.id)}</span>
          </button>
        ))}
        <Link to="/categories" className="chip ghost">{categories.length ? "✎ カテゴリ編集" : "＋ カテゴリを作る"}</Link>
      </nav>
      {shown && shown.length === 0 && (
        <div className="empty">
          {q.trim() ? "見つかりませんでした" :
            current ? (<>このカテゴリにはまだレシピがありません。<br />レシピの「編集」からカテゴリを選べます。</>) :
            (<>まだレシピがありません。<br />右下の「＋」から追加しましょう。</>)}
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
