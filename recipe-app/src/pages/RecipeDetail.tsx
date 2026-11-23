import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import { coverOf, deleteRecipe, getRecipe, listCategories, listRecipes, newId, onDataChange, putImage, saveRecipe, setSelectedCategory } from "../lib/db";
import type { Category, Recipe } from "../lib/types";
import { IngredientsPanel } from "../components/IngredientsPanel";
import { MarkBadge, markColor } from "../components/Mark";
import { scaleAmount } from "../lib/scale";
import { ShareDialog } from "../components/ShareDialog";
import { CookedPanel } from "../components/CookedPanel";
import { CommentList } from "../components/CommentList";
import { deleteSharedComment, fetchSharedComments, getOwnerName } from "../lib/share";
import type { Comment } from "../lib/types";
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
  const [sharing, setSharing] = useState(false);
  const [guestComments, setGuestComments] = useState<Comment[]>([]);
  useEffect(() => {
    if (!id) return;
    const load = () => fetchSharedComments(id).then(setGuestComments);
    load();
    // アプリに戻ってきた時に新しいコメントを取り直す
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [id, sharing]);
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
        <button className="btn small" onClick={() => setSharing(true)}>共有</button>
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

      <CookedPanel recipe={r} onChange={async (next) => { await update({ cookedDates: next.cookedDates }); }} />

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
          <ol className="steps">{r.steps.map((s, k) => <li key={k}><span className="num">{k + 1}</span><StepText text={s} linked={linked} self={r} factor={factor} /></li>)}</ol>
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
        <CommentList comments={[...r.comments, ...guestComments]} selfLabel={getOwnerName() || "わたし"}
          onDelete={async (c) => {
            if (!confirm(c.shared ? `${c.author}さんのコメントを削除しますか？` : "このコメントを削除しますか？")) return;
            if (c.shared) { await deleteSharedComment(c.id); setGuestComments((g) => g.filter((x) => x.id !== c.id)); }
            else await update({ comments: r.comments.filter((x) => x.id !== c.id) });
          }} />
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
      {sharing && <ShareDialog recipeId={r.id} title={r.title} onClose={() => setSharing(false)} />}
    </div>
  );
}

/**
 * 手順の1行。つないだレシピの名前は押せるリンクに、「A」「★」などの印は色付きの印にする。
 * 印を押すと、その印の材料（今回の分量があればその量）が下に出る。
 */
export function StepText({ text, linked, self, factor }: { text: string; linked: Recipe[]; self: Recipe; factor: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = [...new Set(linked.map((x) => x.title))].filter(Boolean).sort((a, b) => b.length - a.length);
  const marks = [...new Set(self.ingredients.map((i) => i.mark).filter((m): m is string => !!m))];
  const full = (c: string) => String.fromCharCode(c.charCodeAt(0) + 0xfee0);
  const markPatterns = marks.map((m) =>
    /^[A-E]$/.test(m) ? `(?<![A-Za-zＡ-Ｚａ-ｚ])[${m}${full(m)}](?![A-Za-zＡ-Ｚａ-ｚ])` : esc(m));
  const alts = [...names.map(esc), ...markPatterns];
  const parts = alts.length ? text.split(new RegExp(`(${alts.join("|")})`)) : [text];
  const toMark = (part: string) => {
    const half = part.replace(/[Ａ-Ｅ]/, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    return marks.includes(half) ? half : null;
  };
  const items = open ? self.ingredients.filter((i) => i.mark === open) : [];
  return (
    <div className="step-body">
      <p>
        {parts.map((part, i) => {
          if (!part) return null;
          const target = linked.find((x) => x.title === part);
          if (target) {
            return <Link key={i} to={`/recipe/${target.id}`} state={{ fromId: self.id, fromTitle: self.title, factor }} className="recipe-link">{part}</Link>;
          }
          const m = toMark(part);
          if (m) return <MarkBadge key={i} mark={m} active={open === m} onClick={() => setOpen(open === m ? null : m)} />;
          return part;
        })}
      </p>
      {open && (
        <div className="mark-pop" style={{ "--mk": markColor(open) } as React.CSSProperties}>
          <MarkBadge mark={open} />
          <span>{items.map((x) => `${x.name} ${factor !== 1 ? scaleAmount(x.amount, factor) : x.amount}`.trim()).join("、")}</span>
        </div>
      )}
    </div>
  );
}
