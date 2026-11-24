import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { addSharedComment, getGuestName, getSharedRecipe, type SharedRecipe } from "../lib/share";
import { SharedImage } from "../components/SharedImage";
import { RequestForm } from "../components/RequestForm";
import { GuestNameBadge, GuestNameField } from "../components/GuestName";
import { IngredientsPanel } from "../components/IngredientsPanel";
import { CommentList } from "../components/CommentList";
import { StepText } from "./RecipeDetail";
import type { Comment } from "../lib/types";

/** 共有リンクを開いた人が見るページ（ログイン不要） */
export function SharedRecipePage() {
  const { token = "", recipeId } = useParams();
  const [data, setData] = useState<SharedRecipe | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [name, setName] = useState(getGuestName());
  const [text, setText] = useState("");
  const [rating, setRating] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    getSharedRecipe(token, recipeId).then(setData).catch((e) => { setError(e.message); setData(null); });
  }, [token, recipeId]);

  if (data === undefined) return <div className="page"><p className="empty">読み込み中…</p></div>;
  if (!data) {
    return (
      <div className="page">
        <div className="empty">このレシピは見られません。<br />共有が止められたか、リンクが間違っている可能性があります。{error && <><br /><small>{error}</small></>}</div>
      </div>
    );
  }

  const r = data.recipe;
  const cover = r.coverImageId ?? r.photoIds[0] ?? r.sourceImageIds[0];
  const comments: Comment[] = [...r.comments, ...data.comments];

  async function send() {
    setSending(true); setError("");
    try {
      const c = await addSharedComment(token, name.trim(), text.trim(), rating || undefined, recipeId);
      setData((d) => d && { ...d, comments: [c, ...d.comments] });
      setText(""); setRating(0); setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page detail shared-page">
      <header className="shared-head">
        {recipeId ? (
          <Link to={`/s/${token}`} className="back">‹ レシピ一覧</Link>
        ) : (
          <><img src="/icons-v2/icon-192.png" alt="" /><span>{data.ownerName ? `${data.ownerName}さんから届いたレシピ` : "共有されたレシピ"}</span></>
        )}
        <GuestNameBadge />
      </header>
      {cover && <SharedImage ownerId={data.ownerId} id={cover} className="hero" onClick={() => setZoom(cover)} />}
      <h1 className="recipe-title">{r.title}</h1>
      {r.servings && <div className="servings">{r.servings}</div>}

      <section className="panel">
        <h2>材料</h2>
        <IngredientsPanel ingredients={r.ingredients} servings={r.servings} />
      </section>

      <section className="panel">
        <h2>作り方</h2>
        {r.steps.length === 0 ? <p className="hint">未登録</p> : (
          <ol className="steps">{r.steps.map((s, k) => <li key={k}><span className="num">{k + 1}</span><StepText text={s} linked={[]} self={r} factor={1} /></li>)}</ol>
        )}
      </section>

      {r.memo && <section className="panel"><h2>メモ</h2><p className="pre">{r.memo}</p></section>}

      {r.photoIds.length > 0 && (
        <section className="panel">
          <h2>作った料理の写真</h2>
          <div className="thumbs">{r.photoIds.map((p) => <div key={p} className="thumb"><SharedImage ownerId={data.ownerId} id={p} onClick={() => setZoom(p)} /></div>)}</div>
        </section>
      )}

      {recipeId && (
        <section className="panel">
          <h2>食べたい！</h2>
          <p className="hint">{data.ownerName ? `${data.ownerName}さん` : "作る人"}に「これ作って」と伝えられます。</p>
          <RequestForm token={token} recipeId={recipeId} recipeTitle={r.title} />
        </section>
      )}

      <section className="panel" id="comment">
        <h2>感想を送る</h2>
        <p className="hint">食べた感想や「ここをこうしてほしい」を{data.ownerName ? `${data.ownerName}さん` : "作った人"}に届けられます。</p>
        <div className="comment-form">
          <GuestNameField value={name} onChange={setName} />
          <div className="rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={n <= rating ? "on" : ""} onClick={() => setRating(n === rating ? 0 : n)} aria-label={`★${n}`}>★</button>
            ))}
          </div>
          <textarea className="input" rows={3} maxLength={2000} value={text} onChange={(e) => { setText(e.target.value); setSent(false); }}
            placeholder="例：すごく美味しかった！次はもう少し辛くしてほしい" />
          <button className="btn primary" disabled={sending || !name.trim() || !text.trim()} onClick={send}>{sending ? "送信中…" : "コメントを送る"}</button>
          {sent && <p className="hint">送りました。ありがとうございます！</p>}
          {error && <div className="error">{error}</div>}
        </div>
        <CommentList comments={comments} selfLabel={data.ownerName || "作った人"} />
      </section>

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}><SharedImage ownerId={data.ownerId} id={zoom} /></div>
      )}
    </div>
  );
}
