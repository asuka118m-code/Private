import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { coverOf, getSelectedCategory, listCategories, listRecipes, onDataChange, setSelectedCategory } from "../lib/db";
import { useSyncState } from "../lib/useSync";
import type { Category, Recipe } from "../lib/types";
import { StoredImage } from "../components/StoredImage";
import { cookedCount, daysSince, isCooked, lastCooked } from "../lib/cooked";
import { ShareDialog } from "../components/ShareDialog";
import { fetchInbox, fetchRequests, type FoodRequest, type InboxItem } from "../lib/share";
import { RequestBoard } from "../components/RequestBoard";
import { getMyName } from "../lib/profile";
import { InboxBoard } from "../components/InboxBoard";
import { ShoppingBoard } from "../components/ShoppingBoard";
import { ownShopApi } from "../lib/shopping";

type CookFilter = "all" | "cooked" | "notyet";
type SortKey = "updated" | "recent" | "longago";
const FILTER_KEY = "recipe-app:cookFilter";
const SORT_KEY = "recipe-app:sort";

export function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState(getSelectedCategory);
  const [q, setQ] = useState("");
  const [cook, setCook] = useState<CookFilter>(() => (localStorage.getItem(FILTER_KEY) as CookFilter) || "all");
  const [sort, setSort] = useState<SortKey>(() => (localStorage.getItem(SORT_KEY) as SortKey) || "updated");
  const chooseCook = (v: CookFilter) => { setCook(v); localStorage.setItem(FILTER_KEY, v); };
  const chooseSort = (v: SortKey) => { setSort(v); localStorage.setItem(SORT_KEY, v); };
  const sync = useSyncState();
  const [sharing, setSharing] = useState(false);
  const [requests, setRequests] = useState<FoodRequest[]>([]);
  const openRequests = requests.filter((x) => !x.done).length;
  const [params, setParams] = useSearchParams();
  const view = params.get("view"); // "requests" | "inbox" | "shop" | null（レシピ）
  const showShop = view === "shop";
  const showRequests = view === "requests";
  const showInbox = view === "inbox";
  const setView = (v: "requests" | "inbox" | "shop" | null) => setParams(v ? { view: v } : {}, { replace: true });
  const setShowRequests = (on: boolean) => setView(on ? "requests" : null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => { if (sync.session) getMyName().then(setMyName); }, [sync.session]);
  const openInbox = inbox.filter((x) => !x.done).length;
  useEffect(() => {
    if (!sync.session) return;
    const load = () => { fetchRequests().then(setRequests); fetchInbox().then(setInbox); };
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sync.session]);
  useEffect(() => {
    const load = () => { listRecipes().then(setRecipes); listCategories().then(setCategories); };
    load();
    return onDataChange(load);
  }, []);
  // 選んでいたカテゴリが消えていたら「すべて」に戻す
  const current = categories.some((c) => c.id === selected) ? selected : "";
  const select = (id: string) => { setSelected(id); setSelectedCategory(id); };

  const count = (id: string) => recipes?.filter((r) => r.categoryIds?.includes(id)).length ?? 0;
  // カテゴリで絞った中の「作った／まだ」の数（レパートリー）
  const inCat = useMemo(() => (recipes ?? []).filter((r) => !current || r.categoryIds?.includes(current)), [recipes, current]);
  const cookedN = inCat.filter(isCooked).length;

  const shown = useMemo(() => {
    if (!recipes) return recipes;
    let list = inCat;
    if (cook === "cooked") list = list.filter(isCooked);
    if (cook === "notyet") list = list.filter((r) => !isCooked(r));
    const k = q.trim();
    if (k) list = list.filter((r) => r.title.includes(k) || r.ingredients.some((i) => i.name.includes(k)));
    const last = (r: Recipe) => lastCooked(r) ?? "";
    if (sort === "recent") list = [...list].sort((a, b) => last(b).localeCompare(last(a)) || b.updatedAt - a.updatedAt);
    // しばらく作っていない順：作ったことのあるものを古い順に。まだのものは最後
    if (sort === "longago") list = [...list].sort((a, b) => (last(a) || "9") .localeCompare(last(b) || "9") || b.updatedAt - a.updatedAt);
    return list;
  }, [recipes, inCat, q, cook, sort]);

  return (
    <div className="page">
      <header className="topbar">
        <h1>あじめも</h1>
        {sync.session && <button className="btn small" onClick={() => setSharing(true)}>みんなに見せる</button>}
        <Link to="/settings" className="btn small">
          {!sync.enabled ? "設定" : !sync.session ? "ログイン" : sync.status === "syncing" ? "同期中…" : sync.status === "error" ? "⚠ 同期エラー" : "☁ 同期済み"}
        </Link>
      </header>
      {sync.enabled && !sync.session && (
        <Link to="/settings" className="notice">ログインすると、iPhone・iPadなど複数の端末でレシピが同期されます ›</Link>
      )}
      {sync.session && myName === "" && (
        <Link to="/settings" className="notice">👤 名前を登録してください（コメントやリクエストを送る時に表示されます） ›</Link>
      )}
      {openInbox > 0 && !view && (
        <button className="notice inbox-notice" onClick={() => setView("inbox")}>🔖 あとで登録が{openInbox}件あります ›</button>
      )}
      {openRequests > 0 && !showRequests && (
        <button className="notice request-notice" onClick={() => setShowRequests(true)}>🙋 食べたいリクエストが{openRequests}件届いています ›</button>
      )}
      {sync.session && (
        <nav className="view-tabs" aria-label="表示の切り替え">
          <button className={!view ? "on" : ""} onClick={() => setView(null)}>📖 レシピ</button>
          <button className={showShop ? "on" : ""} onClick={() => setView("shop")}>🛒 買い物</button>
          <button className={showRequests ? "on" : ""} onClick={() => setView("requests")}>
            🙋 リクエスト{openRequests > 0 && <span className="tab-count">{openRequests}</span>}
          </button>
          <button className={showInbox ? "on" : ""} onClick={() => setView("inbox")}>
            🔖 あとで{openInbox > 0 && <span className="tab-count inbox">{openInbox}</span>}
          </button>
          <Link to="/friends">👥 友だち</Link>
        </nav>
      )}
      {showShop ? (
        <ShoppingBoard api={ownShopApi} />
      ) : showRequests ? (
        <RequestBoard requests={requests} recipes={recipes ?? []} onChange={setRequests} />
      ) : showInbox ? (
        <InboxBoard items={inbox} recipes={recipes ?? []} onChange={setInbox} />
      ) : (<>
      <input className="search" placeholder="料理名・材料で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="cat-row">
        <nav className="cat-bar" aria-label="カテゴリ">
          <button className={`chip ${current === "" ? "on" : ""}`} onClick={() => select("")}>すべて <span>{recipes?.length ?? 0}</span></button>
          {categories.map((c) => (
            <button key={c.id} className={`chip ${current === c.id ? "on" : ""}`} onClick={() => select(c.id)}>
              {c.name} <span>{count(c.id)}</span>
            </button>
          ))}
        </nav>
        <Link to="/categories" className="cat-edit">{categories.length ? "✎ 編集" : "＋ 作る"}</Link>
      </div>
      {current && (
        <Link to={`/categories/${current}/select`} className="btn wide add-to-cat">＋ レシピを選んで「{categories.find((c) => c.id === current)?.name}」に追加</Link>
      )}
      <div className="cook-bar">
        <div className="seg" role="tablist">
          <button className={cook === "all" ? "on" : ""} onClick={() => chooseCook("all")}>すべて</button>
          <button className={cook === "cooked" ? "on" : ""} onClick={() => chooseCook("cooked")}>✓ 作った <span>{cookedN}</span></button>
          <button className={cook === "notyet" ? "on" : ""} onClick={() => chooseCook("notyet")}>まだ <span>{inCat.length - cookedN}</span></button>
        </div>
        <select className="input sort" value={sort} onChange={(e) => chooseSort(e.target.value as SortKey)} aria-label="並べ方">
          <option value="updated">新しく登録・更新した順</option>
          <option value="recent">最近作った順</option>
          <option value="longago">しばらく作っていない順</option>
        </select>
      </div>
      {shown && shown.length === 0 && (
        <div className="empty">
          {q.trim() ? "見つかりませんでした" :
            cook === "cooked" && inCat.length ? (<>まだ「作った」記録がありません。<br />作ったらレシピの画面で「🍳 今日作った！」を押してください。</>) :
            cook === "notyet" && inCat.length ? (<>全部作りました！🎉</>) :
            current ? (<>このカテゴリにはまだレシピがありません。<br />上の「＋ レシピを選んで追加」から入れられます。</>) :
            (<>まだレシピがありません。<br />右下の「＋」から追加しましょう。</>)}
        </div>
      )}
      <ul className="recipe-grid">
        {shown?.map((r) => {
          const cover = coverOf(r);
          const rating = r.comments.find((c) => c.rating)?.rating;
          return (
            <li key={r.id}>
              <Link to={`/recipe/${r.id}`} className="card cook-card">
                {cover ? <StoredImage id={cover} className="card-img" /> : <div className="card-img noimg">🍳</div>}
                {isCooked(r) ? (
                  <span className="cook-badge done">✓ 作った {cookedCount(r)}回</span>
                ) : (
                  <span className="cook-badge want">作ってみたい</span>
                )}
                <div className="card-body">
                  <div className="card-title">{r.title || "（無題）"}</div>
                  <div className="card-meta">
                    {sort !== "updated" && isCooked(r) && <span>{daysSince(r) === 0 ? "今日" : `${daysSince(r)}日前`}</span>}
                    {r.photoIds.length > 0 && <span>📷{r.photoIds.length}</span>}
                    {r.comments.length > 0 && <span>💬{r.comments.length}</span>}
                    {rating && <span className="stars">{"★".repeat(rating)}</span>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      </>)}
      {!view && <Link to="/import" className="fab" aria-label="レシピを追加">＋</Link>}
      {sharing && <ShareDialog recipeId={null} title="レシピ一覧" onClose={() => setSharing(false)} />}
    </div>
  );
}
