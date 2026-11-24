import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { SharedList } from "../lib/share";
import { SharedImage } from "../components/SharedImage";
import { RequestForm } from "../components/RequestForm";

const fmt = (t: number) => new Date(t).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });

/** 一覧の共有リンクを開いた人が見るページ（見るだけ・ログイン不要） */
export function SharedListPage({ token, list }: { token: string; list: SharedList }) {
  const [data, setData] = useState(list);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const titleOf = (id: string | null) => data.recipes.find((r) => r.id === id)?.title;
  const cats = data.categories.filter((c) => data.recipes.some((r) => r.categoryIds.includes(c.id)));

  const shown = useMemo(() => {
    let rs = data.recipes;
    if (cat) rs = rs.filter((r) => r.categoryIds.includes(cat));
    const k = q.trim();
    if (k) rs = rs.filter((r) => r.title.includes(k));
    return rs;
  }, [data.recipes, cat, q]);

  return (
    <div className="page shared-page">
      <header className="shared-head">
        <img src="/icons-v2/icon-192.png" alt="" />
        <span>{data.ownerName ? `${data.ownerName}さんのレシピ` : "あじめも"}</span>
      </header>
      <p className="hint">レシピを開いて、食べた感想や★を送れます。食べたいものがあればリクエストしてね。</p>

      <section className="panel requests-panel">
        <h2>🙋 食べたいリクエスト</h2>
        {data.requests.length > 0 ? (
          <ul className="request-list">
            {data.requests.map((r) => (
              <li key={r.id}>
                <b>{r.author}</b>
                <span>
                  {r.recipeId && titleOf(r.recipeId) ? <Link to={`/s/${token}/r/${r.recipeId}`} className="recipe-link">{titleOf(r.recipeId)}</Link> : null}
                  {r.recipeId && r.text ? "　" : ""}{r.text}
                </span>
                <small>{fmt(r.createdAt)}</small>
              </li>
            ))}
          </ul>
        ) : <p className="hint small">まだありません。</p>}
        {asking ? (
          <RequestForm token={token} onSent={(r) => { setData((d) => ({ ...d, requests: [r, ...d.requests] })); setAsking(false); }} />
        ) : (
          <button className="btn" onClick={() => setAsking(true)}>＋ 食べたいものをリクエスト</button>
        )}
      </section>

      <input className="search" placeholder="料理名で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      {cats.length > 0 && (
        <nav className="cat-bar">
          <button className={`chip ${cat === "" ? "on" : ""}`} onClick={() => setCat("")}>すべて <span>{data.recipes.length}</span></button>
          {cats.map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? "on" : ""}`} onClick={() => setCat(c.id)}>
              {c.name} <span>{data.recipes.filter((r) => r.categoryIds.includes(c.id)).length}</span>
            </button>
          ))}
        </nav>
      )}
      {shown.length === 0 && <div className="empty">{data.recipes.length ? "見つかりませんでした" : "まだレシピがありません"}</div>}
      <ul className="recipe-grid">
        {shown.map((r) => (
          <li key={r.id}>
            <Link to={`/s/${token}/r/${r.id}`} className="card cook-card">
              {r.cover ? <SharedImage ownerId={data.ownerId} id={r.cover} className="card-img" /> : <div className="card-img noimg">🍳</div>}
              {r.cookedCount > 0 && <span className="cook-badge done">✓ 作った {r.cookedCount}回</span>}
              <div className="card-body"><div className="card-title">{r.title || "（無題）"}</div></div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
