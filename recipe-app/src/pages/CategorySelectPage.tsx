import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { coverOf, listCategories, listRecipes, saveRecipe, setSelectedCategory } from "../lib/db";
import type { Category, Recipe } from "../lib/types";
import { StoredImage } from "../components/StoredImage";

/** カテゴリに入れるレシピを、全レシピから複数選択する画面 */
export function CategorySelectPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [cat, setCat] = useState<Category | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const c = (await listCategories()).find((x) => x.id === id);
      if (!c) return nav("/categories", { replace: true });
      const rs = await listRecipes();
      setCat(c);
      setRecipes(rs);
      setChecked(new Set(rs.filter((r) => r.categoryIds?.includes(id)).map((r) => r.id)));
    })();
  }, [id, nav]);

  const shown = useMemo(() => {
    const k = q.trim();
    return k ? recipes.filter((r) => r.title.includes(k) || r.ingredients.some((i) => i.name.includes(k))) : recipes;
  }, [recipes, q]);

  const before = (r: Recipe) => !!r.categoryIds?.includes(id);
  const added = recipes.filter((r) => checked.has(r.id) && !before(r)).length;
  const removed = recipes.filter((r) => !checked.has(r.id) && before(r)).length;

  const toggle = (rid: string) =>
    setChecked((s) => { const n = new Set(s); if (n.has(rid)) n.delete(rid); else n.add(rid); return n; });

  async function ok() {
    setSaving(true);
    try {
      for (const r of recipes) {
        const want = checked.has(r.id);
        if (want === before(r)) continue;
        const ids = r.categoryIds ?? [];
        await saveRecipe({ ...r, categoryIds: want ? [...ids, id] : ids.filter((x) => x !== id) });
      }
      setSelectedCategory(id);
      nav("/");
    } finally {
      setSaving(false);
    }
  }

  if (!cat) return null;

  return (
    <div className="page select-page">
      <header className="topbar">
        <button className="link back" onClick={() => nav(-1)}>‹ キャンセル</button>
        <h1 className="ellipsis">「{cat.name}」に入れるレシピ</h1>
      </header>
      <p className="hint">入れたいレシピをタップして選び、下の「OK」を押してください。チェックを外すとこのカテゴリから外れます（レシピは消えません）。</p>
      <input className="search" placeholder="料理名・材料で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="select-tools">
        <span className="hint small">{checked.size}件選択中</span>
        <button className="link small" onClick={() => setChecked((s) => new Set([...s, ...shown.map((r) => r.id)]))}>表示中をすべて選択</button>
        <button className="link small" onClick={() => setChecked((s) => { const n = new Set(s); shown.forEach((r) => n.delete(r.id)); return n; })}>選択を外す</button>
      </div>
      {recipes.length === 0 && <div className="empty">まだレシピがありません。<br /><Link className="link" to="/import">レシピを追加する</Link></div>}
      <ul className="recipe-grid">
        {shown.map((r) => {
          const cover = coverOf(r);
          const on = checked.has(r.id);
          return (
            <li key={r.id}>
              <button type="button" className={`card select-card ${on ? "on" : ""}`} onClick={() => toggle(r.id)} aria-pressed={on}>
                {cover ? <StoredImage id={cover} className="card-img" /> : <div className="card-img noimg">🍳</div>}
                <span className="check-mark">{on ? "✓" : ""}</span>
                <div className="card-body"><div className="card-title">{r.title || "（無題）"}</div></div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="select-footer">
        <span className="small">
          {added || removed ? <>{added > 0 && `${added}件追加`}{added > 0 && removed > 0 && "・"}{removed > 0 && `${removed}件外す`}</> : "変更なし"}
        </span>
        <button className="btn primary" disabled={saving || (!added && !removed)} onClick={ok}>{saving ? "保存中…" : "OK"}</button>
      </div>
    </div>
  );
}
