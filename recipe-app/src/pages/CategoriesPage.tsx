import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addCategory, deleteCategory, listCategories, listRecipes, onDataChange, saveCategory } from "../lib/db";
import type { Category, Recipe } from "../lib/types";

export function CategoriesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [name, setName] = useState("");
  useEffect(() => {
    const load = () => { listCategories().then(setCats); listRecipes().then(setRecipes); };
    load();
    return onDataChange(load);
  }, []);

  const count = (id: string) => recipes.filter((r) => r.categoryIds?.includes(id)).length;

  async function add() {
    const n = name.trim();
    if (!n) return;
    if (cats.some((c) => c.name === n)) return alert("同じ名前のカテゴリがあります");
    setName("");
    await addCategory(n);
  }

  async function rename(c: Category, value: string) {
    const n = value.trim();
    if (!n || n === c.name) return;
    await saveCategory({ ...c, name: n });
  }

  async function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= cats.length) return;
    const a = cats[i], b = cats[j];
    // 並び順を入れ替え（同じ番号の場合もあるので並び位置で振り直す）
    await saveCategory({ ...a, order: j });
    await saveCategory({ ...b, order: i });
    for (const [k, c] of cats.entries()) if (k !== i && k !== j && c.order !== k) await saveCategory({ ...c, order: k });
  }

  async function remove(c: Category) {
    const n = count(c.id);
    if (!confirm(`カテゴリ「${c.name}」を削除しますか？${n ? `\n中の${n}件のレシピは削除されず、「すべて」に残ります。` : ""}`)) return;
    await deleteCategory(c.id);
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="back">‹ 一覧</Link>
        <h1>カテゴリ</h1>
      </header>
      <section className="panel">
        <h2>新しいカテゴリ</h2>
        <div className="row">
          <input className="input grow" placeholder="例：主菜、副菜、汁物、おやつ、作り置き" value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn primary" disabled={!name.trim()} onClick={add}>追加</button>
        </div>
      </section>
      <section className="panel">
        <h2>カテゴリ一覧</h2>
        {cats.length === 0 && <p className="hint">まだありません。上から作ってください。</p>}
        {cats.map((c, i) => (
          <div key={c.id} className="row">
            <input className="input grow" defaultValue={c.name} key={c.name} onBlur={(e) => rename(c, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            <span className="hint small nowrap">{count(c.id)}件</span>
            <div className="row-tools">
              <button type="button" onClick={() => move(i, -1)} aria-label="上へ">↑</button>
              <button type="button" onClick={() => move(i, 1)} aria-label="下へ">↓</button>
              <button type="button" onClick={() => remove(c)} aria-label="削除">×</button>
            </div>
          </div>
        ))}
        <p className="hint small">名前はタップして直接書き換えられます。レシピをカテゴリに入れるには、レシピの「編集」で選びます。</p>
      </section>
    </div>
  );
}
