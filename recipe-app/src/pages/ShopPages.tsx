import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ShoppingBoard } from "../components/ShoppingBoard";
import { addRecipeToShopping, linkShopApi, ownShopApi, shoppingRecipeIds } from "../lib/shopping";
import { coverOf, listRecipes } from "../lib/db";
import type { Recipe } from "../lib/types";
import { StoredImage } from "../components/StoredImage";

/** /shop/:token — 家族がリンクから開く買い物リスト（ログイン不要） */
export function SharedShopPage() {
  const { token = "" } = useParams();
  const api = useMemo(() => linkShopApi(token), [token]);
  const [owner, setOwner] = useState("");
  useEffect(() => { api.load().then((d) => setOwner(d.ownerName ?? "")).catch(() => {}); }, [api]);
  return (
    <div className="page shared-page">
      <header className="shared-head">
        <img src="/icons-v2/icon-192.png" alt="" />
        <span>🛒 {owner ? `${owner}さんの` : ""}買い物リスト</span>
      </header>
      <ShoppingBoard api={api} />
    </div>
  );
}

/** /shopping/select — 作る料理を、自分のレシピから複数選ぶ */
export function ShopSelectPage() {
  const nav = useNavigate();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inList, setInList] = useState<Map<string, string>>(new Map());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    listRecipes().then(setRecipes);
    shoppingRecipeIds().then((m) => { setInList(m); setChecked(new Set(m.keys())); });
  }, []);
  const shown = recipes.filter((r) => !q.trim() || r.title.includes(q.trim()) || r.ingredients.some((i) => i.name.includes(q.trim())));
  const added = [...checked].filter((id) => !inList.has(id));
  const removed = [...inList.keys()].filter((id) => !checked.has(id));
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function ok() {
    setSaving(true); setErr("");
    try {
      for (const id of added) { const r = recipes.find((x) => x.id === id); if (r) await addRecipeToShopping(r, 1); }
      for (const id of removed) await ownShopApi.removeEntry!(inList.get(id)!);
      nav("/?view=shop");
    } catch (e) { setErr((e as Error).message); setSaving(false); }
  }

  return (
    <div className="page select-page">
      <header className="topbar">
        <Link to="/?view=shop" className="back">‹ 買い物リスト</Link>
        <h1>作る料理を選ぶ</h1>
      </header>
      <p className="hint">作る料理をタップして選び、「OK」を押してください。材料が買い物リストに入ります。</p>
      <input className="search" placeholder="料理名・材料で検索" value={q} onChange={(e) => setQ(e.target.value)} />
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
      {err && <div className="error">{err}</div>}
      <div className="select-footer">
        <span className="small">{added.length || removed.length ? `${added.length ? `${added.length}品追加` : ""}${added.length && removed.length ? "・" : ""}${removed.length ? `${removed.length}品外す` : ""}` : `${checked.size}品選択中`}</span>
        <button className="btn primary" disabled={saving || (!added.length && !removed.length)} onClick={ok}>{saving ? "保存中…" : "OK"}</button>
      </div>
    </div>
  );
}

export { ownShopApi };
