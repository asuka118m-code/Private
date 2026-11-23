import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import { coverOf, deleteRecipe, getRecipe, listCategories, listRecipes, newId, onDataChange, putImage, saveRecipe, setSelectedCategory } from "../lib/db";
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
  const [all, setAll] = useState<Recipe[]>([]);
  const location = useLocation();
  const from = (location.state as { fromId?: string; fromTitle?: string; factor?: number } | null) ?? null;
  const inherited = from?.factor && from.factor !== 1 ? from.factor : 1;
  // 「戻る」で戻ってきた時は、そのレシピで入れていた「今回」の分量を復元する
  const navType = useNavigationType();
  const savedKey = `recipe-app:factor:${id}`;
  const restored = navType === "POP" ? Number(sessionStorage.getItem(savedKey)) || 1 : 1;
  const startFactor = inherited !== 1 ? inherited : restored;
  const [factor, setFactorState] = useState(startFactor);
  useEffect(() => setFactorState(startFactor), [id, startFactor]);
  const setFactor = (f: number) => {
    setFactorState(f);
    if (f === 1) sessionStorage.removeItem(savedKey); else sessionStorage.setItem(savedKey, String(f));
  };

  useEffect(() => {
    if (!id) return;
    const load = () => getRecipe(id).then((x) => (x ? setR(x) : nav("/")));
    load();
    listCategories().then(setCats);
    listRecipes().then(setAll);
    return onDataChange((src) => { if (src === "sync") load(); listCategories().then(setCats); listRecipes().then(setAll); });
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
  // この料理の材料につながっているレシピ / このレシピを材料に使っている料理
  const linked = r.ingredients
    .map((i) => i.recipeId && all.find((x) => x.id === i.recipeId))
    .filter((x): x is Recipe => !!x);
  const usedIn = all.filter((x) => x.id !== r.id && x.ingredients.some((i) => i.recipeId === r.id));

  return (
    <div className="page detail">
      <header className="topbar">
        {from?.fromId ? (
          <button className="link back" onClick={() => nav(-1)}>‹ {from.fromTitle}</button>
        ) : (
          <Link to="/" className="back">‹ 一覧</Link>
        )}
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
        <IngredientsPanel key={`${r.id}:${startFactor}`} ingredients={r.ingredients} servings={r.servings}
          initialFactor={startFactor} onFactorChange={setFactor}
          note={inherited === 1 ? undefined : <>「{from?.fromTitle}」の分量に合わせて <b>×{Math.round(inherited * 100) / 100}</b> で計算しています。元の分量に戻すには「リセット」</>}
          renderName={(ing) => {
            const target = ing.recipeId && all.find((x) => x.id === ing.recipeId);
            return target ? (
              <Link to={`/recipe/${target.id}`} state={{ fromId: r.id, fromTitle: r.title, factor }} className="recipe-link">📖 {ing.name} ›</Link>
            ) : ing.name;
          }} />
      </section>

      {usedIn.length > 0 && (
        <section className="panel used-in">
          <h2>このレシピを使う料理</h2>
          <div className="cat-picker">
            {usedIn.map((x) => (
              <Link key={x.id} to={`/recipe/${x.id}`} state={{ fromId: r.id, fromTitle: r.title }} className="chip">📖 {x.title} ›</Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>作り方</h2>
        {r.steps.length === 0 ? <p className="hint">未登録</p> : (
          <ol className="steps">{r.steps.map((s, k) => <li key={k}><span className="num">{k + 1}</span><p>{linkify(s, linked, r, factor)}</p></li>)}</ol>
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

/** 手順の文中に、つないだレシピの名前があれば押せるリンクにする */
function linkify(text: string, linked: Recipe[], self: Recipe, factor: number) {
  const names = [...new Set(linked.map((x) => x.title))].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${names.map(esc).join("|")})`));
  return parts.map((part, i) => {
    const target = linked.find((x) => x.title === part);
    return target ? (
      <Link key={i} to={`/recipe/${target.id}`} state={{ fromId: self.id, fromTitle: self.title, factor }} className="recipe-link">{part}</Link>
    ) : part;
  });
}
