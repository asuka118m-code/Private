import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { coverOf, deleteRecipe, getRecipe, listCategories, newId, onDataChange, putImage, saveRecipe, setSelectedCategory } from "../lib/db";
import type { Category, Recipe } from "../lib/types";
import { IngredientsPanel } from "../components/IngredientsPanel";
import { StoredImage } from "../components/StoredImage";
import { ImagePicker } from "../components/ImagePicker";
import { Lightbox } from "../components/Lightbox";

const fmtDate = (t: number) => new Date(t).toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });

export function RecipeDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [r, setR] = useState<Recipe | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState(0);
  const [cats, setCats] = useState<Category[]>([]);

  useEffect(() => {
    if (!id) return;
    const load = () => getRecipe(id).then((x) => (x ? setR(x) : nav("/")));
    load();
    listCategories().then(setCats);
    return onDataChange((src) => { if (src === "sync") load(); listCategories().then(setCats); });
  }, [id, nav]);
  if (!r) return null;

  const update = async (patch: Partial<Recipe>) => setR(await saveRecipe({ ...r, ...patch }));

  async function addPhotos(blobs: Blob[]) {
    const ids = await Promise.all(blobs.map(putImage));
    await update({ photoIds: [...r!.photoIds, ...ids] });
  }

  async function addComment() {
    if (!comment.trim()) return;
    await update({ comments: [{ id: newId(), createdAt: Date.now(), text: comment.trim(), rating: rating || undefined }, ...r!.comments] });
    setComment("");
    setRating(0);
  }

  async function remove() {
    if (!confirm(`「${r!.title}」を削除しますか？`)) return;
    await deleteRecipe(r!);
    nav("/", { replace: true });
  }

  const cover = coverOf(r);

  return (
    <div className="page detail">
      <header className="topbar">
        <Link to="/" className="back">‹ 一覧</Link>
        <h1 className="ellipsis">{r.title}</h1>
        <Link to={`/recipe/${r.id}/edit`} className="btn small">編集</Link>
      </header>

      {cover && <StoredImage id={cover} className="hero" onClick={() => setView(cover)} />}
      <h1 className="recipe-title">{r.title}</h1>
      {r.servings && <div className="servings">{r.servings}</div>}
      {(() => {
        const mine = cats.filter((c) => r.categoryIds?.includes(c.id));
        return mine.length > 0 && (
          <div className="cat-picker detail-cats">
            {mine.map((c) => (
              <button key={c.id} className="chip" onClick={() => { setSelectedCategory(c.id); nav("/"); }}>{c.name}</button>
            ))}
          </div>
        );
      })()}

      <section className="panel">
        <h2>材料</h2>
        <IngredientsPanel key={r.id} ingredients={r.ingredients} servings={r.servings} />
      </section>

      <section className="panel">
        <h2>作り方</h2>
        {r.steps.length === 0 ? <p className="hint">未登録</p> : (
          <ol className="steps">{r.steps.map((s, k) => <li key={k}><span className="num">{k + 1}</span><p>{s}</p></li>)}</ol>
        )}
      </section>

      {r.memo && <section className="panel"><h2>メモ</h2><p className="pre">{r.memo}</p></section>}

      <section className="panel">
        <h2>作った料理の写真</h2>
        <div className="thumbs">{r.photoIds.map((p) => <div key={p} className="thumb"><StoredImage id={p} onClick={() => setView(p)} /></div>)}</div>
        <ImagePicker label="📷 写真を追加" onPick={addPhotos} />
      </section>

      <section className="panel">
        <h2>感想・コメント</h2>
        <div className="comment-form">
          <div className="rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={n <= rating ? "on" : ""} onClick={() => setRating(n === rating ? 0 : n)}>★</button>
            ))}
          </div>
          <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="例：少し甘かったので次はみりんを減らす" />
          <button className="btn primary" disabled={!comment.trim()} onClick={addComment}>コメントを残す</button>
        </div>
        <ul className="comments">
          {r.comments.map((c) => (
            <li key={c.id}>
              <div className="c-head">
                <span>{fmtDate(c.createdAt)}</span>
                {c.rating && <span className="stars">{"★".repeat(c.rating)}</span>}
                <button className="link small" onClick={() => confirm("このコメントを削除しますか？") && update({ comments: r.comments.filter((x) => x.id !== c.id) })}>削除</button>
              </div>
              <p className="pre">{c.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {(r.sourceUrl || r.sourceImageIds.length > 0) && (
        <section className="panel">
          <h2>参考にしたもの</h2>
          {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="source-link">{r.sourceUrl}</a>}
          <div className="thumbs">{r.sourceImageIds.map((p) => <div key={p} className="thumb"><StoredImage id={p} onClick={() => setView(p)} /></div>)}</div>
        </section>
      )}

      <div className="center"><button className="link danger" onClick={remove}>このレシピを削除</button></div>
      <Lightbox id={view} onClose={() => setView(null)} />
    </div>
  );
}
