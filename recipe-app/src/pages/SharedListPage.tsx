import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { SharedList } from "../lib/share";
import { SharedImage } from "../components/SharedImage";
import { RequestForm } from "../components/RequestForm";
import { useSyncState } from "../lib/useSync";
import { addTarget, listTargets } from "../lib/profile";

const fmt = (t: number) => new Date(t).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });

/** 一覧の共有リンクを開いた人が見るページ（見るだけ・ログイン不要） */
/** friendId があれば「友だちのレシピ」（アプリの中から見る） */
export function SharedListPage({ token, list, friendId }: { token: string; list: SharedList; friendId?: string }) {
  const base = friendId ? `/friends/${friendId}` : `/s/${token}`;
  const [data, setData] = useState(list);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  // 共有メニュー（ショートカット）から来た時：URLが入った状態でリクエスト欄を開く
  const [params, setParams] = useSearchParams();
  const sharedUrl = params.get("url") || "";
  const [asking, setAsking] = useState(!!sharedUrl);
  const [howto, setHowto] = useState(false);
  const [copied, setCopied] = useState(false);
  const shortcutBase = `${location.origin}/s/${token}?url=`;
  // ログインしている人：このリンクを「リクエスト先」に登録できる
  const sync = useSyncState();
  const isOther = !friendId && !!sync.session && sync.session.user.id !== data.ownerId;
  const [targeted, setTargeted] = useState<boolean | null>(null);
  const [targetMsg, setTargetMsg] = useState("");
  useEffect(() => { if (isOther) listTargets().then((t) => setTargeted(t.some((x) => x.token === token))); }, [isOther, token]);
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
        {friendId ? <Link to="/friends" className="back">‹ 友だち</Link> : <img src="/icons-v2/icon-192.png" alt="" />}
        <span>{data.ownerName ? `${data.ownerName}さんのレシピ` : "あじめも"}</span>
      </header>
      <p className="hint">レシピを開いて、食べた感想や★を送れます。食べたいものがあればリクエストしてね。</p>
      {isOther && targeted === false && (
        <button className="notice target-btn" onClick={async () => {
          try { await addTarget(token, data.ownerName || "相手"); setTargeted(true); setTargetMsg("リクエスト先に登録しました。ショートカットから「" + (data.ownerName || "相手") + "さんにリクエスト」を選べます"); }
          catch (e) { setTargetMsg((e as Error).message); }
        }}>📌 {data.ownerName || "この人"}さんをリクエスト先に登録（ショートカットから送れるように）</button>
      )}
      {targetMsg && <p className="hint small">{targetMsg}</p>}

      <section className="panel requests-panel">
        <h2>🙋 食べたいリクエスト</h2>
        {data.requests.length > 0 ? (
          <ul className="request-list">
            {data.requests.map((r) => (
              <li key={r.id}>
                <b>{r.author}</b>
                <span>
                  {r.recipeId && titleOf(r.recipeId) ? <Link to={`${base}/r/${r.recipeId}`} className="recipe-link">{titleOf(r.recipeId)}</Link> : null}
                  {r.recipeId && r.text ? "　" : ""}{r.text}
                  {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="ref-link">🔗 参考</a>}
                </span>
                <small>{fmt(r.createdAt)}</small>
              </li>
            ))}
          </ul>
        ) : friendId ? null : <p className="hint small">まだありません。</p>}
        {sharedUrl && asking && <p className="hint small">共有されたURLが入っています。名前とひとことを入れて送ってください。</p>}
        {asking ? (
          <RequestForm token={token} friendId={friendId} initialUrl={sharedUrl}
            onSent={(r) => { setData((d) => ({ ...d, requests: [r, ...d.requests] })); setAsking(false); if (sharedUrl) setParams({}, { replace: true }); }} />
        ) : (
          <button className="btn" onClick={() => setAsking(true)}>＋ 食べたいものをリクエスト</button>
        )}
        {!friendId && <button className="link small" onClick={() => setHowto(!howto)}>
          {howto ? "閉じる" : "📱 InstagramなどからそのままリクエストするにはiPhone・iPadの「ショートカット」"}
        </button>}
        {howto && !friendId && (
          <div className="howto-box">
            <p className="hint small">一度だけ作ると、Instagramやレシピサイトの共有ボタンに「あじめもにリクエスト」が出て、そのURLでリクエストできます。</p>
            <ol className="howto">
              <li>「ショートカット」アプリで右上の「＋」→ 名前を「あじめもにリクエスト」にする</li>
              <li>「<b>URLをエンコード</b>」を追加する（入力は「ショートカットの入力」）</li>
              <li>「<b>テキスト</b>」を追加して下の文字を貼り、その後ろに「URLエンコードされたテキスト」を入れる
                <div className="share-url">{shortcutBase}</div>
                <button className="btn small" onClick={async () => { await navigator.clipboard?.writeText(shortcutBase); setCopied(true); }}>{copied ? "コピーしました" : "この文字をコピー"}</button>
              </li>
              <li>「<b>URLを開く</b>」を追加する</li>
              <li>詳細（ⓘ）で「<b>共有シートに表示</b>」をオンにする</li>
            </ol>
          </div>
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
            <Link to={`${base}/r/${r.id}`} className="card cook-card">
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
