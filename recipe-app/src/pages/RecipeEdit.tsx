import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteImage, getRecipe, newId, putImage, saveRecipe } from "../lib/db";
import { takeDraft } from "../lib/draft";
import type { Ingredient, Recipe } from "../lib/types";
import { ImagePicker } from "../components/ImagePicker";
import { StoredImage } from "../components/StoredImage";

/** 保存済み(id) or 未保存(blob) の画像 */
type Img = { id?: string; blob?: Blob; key: string };
const toImg = (id: string): Img => ({ id, key: id });
const fromBlob = (blob: Blob): Img => ({ blob, key: newId() });

function move<T>(arr: T[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const a = [...arr];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}

export function RecipeEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const [base, setBase] = useState<Recipe | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: "", amount: "" }]);
  const [steps, setSteps] = useState<string[]>([""]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [memo, setMemo] = useState("");
  const [sourceImgs, setSourceImgs] = useState<Img[]>([]);
  const [photos, setPhotos] = useState<Img[]>([]);
  const [cover, setCover] = useState<string | undefined>(); // Img.key
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (id) {
        const r = await getRecipe(id);
        if (!r) return nav("/");
        setBase(r);
        setTitle(r.title);
        setServings(r.servings);
        setIngredients(r.ingredients.length ? r.ingredients : [{ name: "", amount: "" }]);
        setSteps(r.steps.length ? r.steps : [""]);
        setSourceUrl(r.sourceUrl);
        setMemo(r.memo);
        setSourceImgs(r.sourceImageIds.map(toImg));
        setPhotos(r.photoIds.map(toImg));
        setCover(r.coverImageId);
      } else {
        const d = takeDraft();
        if (d) {
          setTitle(d.title);
          setServings(d.servings);
          if (d.ingredients.length) setIngredients(d.ingredients);
          if (d.steps.length) setSteps(d.steps);
          setSourceUrl(d.sourceUrl);
          setSourceImgs(d.sourceImages.map(fromBlob));
        }
      }
      setLoaded(true);
    })();
  }, [id, nav]);

  async function persist(list: Img[]) {
    const out: { key: string; id: string }[] = [];
    for (const im of list) out.push({ key: im.key, id: im.id ?? (await putImage(im.blob!)) });
    return out;
  }

  async function save() {
    if (!title.trim()) return alert("タイトルを入力してください");
    setSaving(true);
    try {
      const src = await persist(sourceImgs);
      const ph = await persist(photos);
      const keep = new Set([...src, ...ph].map((x) => x.id));
      for (const old of [...(base?.sourceImageIds ?? []), ...(base?.photoIds ?? [])]) if (!keep.has(old)) await deleteImage(old);
      const coverId = [...src, ...ph].find((x) => x.key === cover)?.id;
      const now = Date.now();
      const r = await saveRecipe({
        id: base?.id ?? newId(),
        title: title.trim(),
        servings: servings.trim(),
        ingredients: ingredients.map((i) => ({ name: i.name.trim(), amount: i.amount.trim() })).filter((i) => i.name),
        steps: steps.map((s) => s.trim()).filter(Boolean),
        sourceUrl: sourceUrl.trim(),
        memo,
        sourceImageIds: src.map((x) => x.id),
        photoIds: ph.map((x) => x.id),
        coverImageId: coverId,
        comments: base?.comments ?? [],
        createdAt: base?.createdAt ?? now,
        updatedAt: now,
      });
      nav(`/recipe/${r.id}`, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  const imgGrid = (list: Img[], set: (f: (p: Img[]) => Img[]) => void) => (
    <div className="thumbs">
      {list.map((im) => (
        <div key={im.key} className={`thumb ${cover === im.key ? "cover" : ""}`}>
          <StoredImage id={im.id} blob={im.blob} onClick={() => setCover(im.key)} />
          {cover === im.key && <span className="badge">表紙</span>}
          <button type="button" className="x" onClick={() => set((p) => p.filter((x) => x.key !== im.key))}>×</button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="page">
      <header className="topbar">
        <Link to={base ? `/recipe/${base.id}` : "/"} className="back">‹ キャンセル</Link>
        <h1>{base ? "レシピを編集" : "新しいレシピ"}</h1>
        <button className="btn primary small" disabled={saving} onClick={save}>保存</button>
      </header>

      {base && base.comments.length > 0 && (
        <section className="panel feedback">
          <h2>💡 これまでの感想（改善のヒント）</h2>
          <ul>{base.comments.slice(0, 5).map((c) => <li key={c.id}>{c.rating ? "★".repeat(c.rating) + " " : ""}{c.text}</li>)}</ul>
        </section>
      )}

      <section className="panel">
        <label className="field">タイトル<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：豚バラ大根" /></label>
        <label className="field">分量（何人分）<input className="input" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="例：2人分" /></label>
      </section>

      <section className="panel">
        <h2>材料</h2>
        {ingredients.map((ing, i) => (
          <div key={i} className="row">
            <input className="input grow" placeholder="材料" value={ing.name}
              onChange={(e) => setIngredients((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className="input amount" placeholder="分量" value={ing.amount}
              onChange={(e) => setIngredients((p) => p.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            <div className="row-tools">
              <button type="button" onClick={() => setIngredients((p) => move(p, i, -1))}>↑</button>
              <button type="button" onClick={() => setIngredients((p) => move(p, i, 1))}>↓</button>
              <button type="button" onClick={() => setIngredients((p) => p.filter((_, j) => j !== i))}>×</button>
            </div>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setIngredients((p) => [...p, { name: "", amount: "" }])}>＋ 材料を追加</button>
      </section>

      <section className="panel">
        <h2>作り方</h2>
        {steps.map((s, i) => (
          <div key={i} className="row step-row">
            <span className="num">{i + 1}</span>
            <textarea className="input grow" rows={2} value={s} placeholder="手順を入力"
              onChange={(e) => setSteps((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
            <div className="row-tools col">
              <button type="button" onClick={() => setSteps((p) => move(p, i, -1))}>↑</button>
              <button type="button" onClick={() => setSteps((p) => move(p, i, 1))}>↓</button>
              <button type="button" onClick={() => setSteps((p) => p.filter((_, j) => j !== i))}>×</button>
            </div>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setSteps((p) => [...p, ""])}>＋ 手順を追加</button>
      </section>

      <section className="panel">
        <h2>参考にしたもの</h2>
        <label className="field">URL<input className="input" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." /></label>
        {imgGrid(sourceImgs, setSourceImgs)}
        <ImagePicker label="＋ 参考画像を追加" onPick={(b) => setSourceImgs((p) => [...p, ...b.map(fromBlob)])} />
      </section>

      <section className="panel">
        <h2>作った料理の写真</h2>
        {imgGrid(photos, setPhotos)}
        <ImagePicker label="＋ 写真を追加" onPick={(b) => setPhotos((p) => [...p, ...b.map(fromBlob)])} />
        <p className="hint small">画像をタップすると一覧の表紙に設定できます。</p>
      </section>

      <section className="panel">
        <h2>メモ</h2>
        <textarea className="input" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="コツ・アレンジなど" />
      </section>

      <button className="btn primary wide" disabled={saving} onClick={save}>{saving ? "保存中…" : "保存する"}</button>
    </div>
  );
}
