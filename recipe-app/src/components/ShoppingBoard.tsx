import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { mergeShopping, nameKey, type ShopItem } from "../lib/shopMerge";
import { createShopShare, getShopShare, revokeShopShare, shopShareUrl, type ShopApi, type ShopData } from "../lib/shopping";
import { getGuestName } from "../lib/share";

const VIEW_KEY = "recipe-app:shopView";

/** 買い物リスト（自分用・家族のリンク用で共通） */
export function ShoppingBoard({ api }: { api: ShopApi }) {
  const [data, setData] = useState<(ShopData & { offline?: boolean }) | null>(null);
  const [err, setErr] = useState("");
  const [view, setView] = useState<"merged" | "byRecipe">(() => (localStorage.getItem(VIEW_KEY) as "merged" | "byRecipe") || "merged");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [share, setShare] = useState<string | null | undefined>(undefined);
  const [shareMsg, setShareMsg] = useState("");

  const load = useCallback(() => api.load().then((d) => { setData(d); setErr(""); }).catch((e) => setErr(e.message)), [api]);
  useEffect(() => {
    load();
    // 家族がチェックした分も見えるよう、ときどき読み直す
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);
  useEffect(() => { if (api.owner) getShopShare().then(setShare).catch(() => setShare(null)); }, [api]);

  const items = useMemo(() => (data ? mergeShopping(data.entries, data.flags) : []), [data]);
  const flagOf = (key: string) => items.find((i) => i.key === key);
  const toBuy = items.filter((i) => !i.checked && !i.pantry);
  const bought = items.filter((i) => i.checked && !i.pantry);
  const pantry = items.filter((i) => i.pantry);
  const chooseView = (v: "merged" | "byRecipe") => { setView(v); localStorage.setItem(VIEW_KEY, v); };

  // 画面はすぐ変えて、裏で保存する
  async function toggle(it: Pick<ShopItem, "key" | "checked" | "pantry">, field: "checked" | "pantry") {
    const value = !it[field];
    setData((d) => {
      if (!d) return d;
      const flags = d.flags.filter((f) => f.key !== it.key);
      flags.push({ key: it.key, checked: field === "checked" ? value : it.checked, pantry: field === "pantry" ? value : it.pantry });
      return { ...d, flags };
    });
    try { await api.setFlag(it.key, field, value); } catch (e) { setErr((e as Error).message); load(); }
  }

  async function addManual() {
    if (!name.trim()) return;
    try { await api.addManual(name, amount, getGuestName()); setName(""); setAmount(""); load(); }
    catch (e) { setErr((e as Error).message); }
  }

  const recipeLink = (recipeId: string | null, title: string) =>
    api.owner && recipeId ? <Link to={`/recipe/${recipeId}`} state={{ fromShop: true }} className="recipe-link">{title}</Link> : <span>{title}</span>;

  const row = (it: ShopItem, muted = false) => (
    <li key={it.key} className={`shop-item ${it.checked ? "checked" : ""} ${muted ? "muted" : ""}`}>
      <label className="shop-check">
        <input type="checkbox" checked={it.checked || it.pantry} onChange={() => toggle(it, it.pantry ? "pantry" : "checked")} />
        <span className="shop-name">{it.name}</span>
        <span className="shop-total">{it.total}</span>
      </label>
      <div className="shop-parts">
        {it.parts.map((p, k) => (
          <span key={k} className="shop-part">{recipeLink(p.recipeId, p.title)}{p.amount && it.parts.length > 1 ? ` ${p.amount}` : ""}{p.note ? `（${p.note}）` : ""}</span>
        ))}
      </div>
      <button className={`pantry-btn ${it.pantry ? "on" : ""}`} onClick={() => toggle(it, "pantry")} title="家にある" aria-label={`${it.name}は家にある`}>🏠</button>
    </li>
  );

  if (!data) return <div className="shop">{err ? <div className="error">{err}</div> : <p className="hint">読み込み中…</p>}</div>;
  const recipes = data.entries.filter((e) => e.recipeId);
  const manual = data.entries.filter((e) => !e.recipeId);

  return (
    <div className="shop">
      {data.offline && <div className="notice">電波がないため、最後に読み込んだリストを表示しています</div>}
      <div className="shop-head">
        <div className="seg">
          <button className={view === "merged" ? "on" : ""} onClick={() => chooseView("merged")}>まとめて</button>
          <button className={view === "byRecipe" ? "on" : ""} onClick={() => chooseView("byRecipe")}>料理ごと</button>
        </div>
        <span className="hint small">残り {toBuy.length} 品</span>
        {api.owner && <Link to="/shopping/select" className="btn small primary">＋ 料理を選ぶ</Link>}
      </div>

      {recipes.length > 0 && (
        <div className="shop-recipes">
          {recipes.map((e) => (
            <span key={e.id} className="shop-recipe">
              🍳 {recipeLink(e.recipeId, e.title)}{e.factor !== 1 ? <small> ×{Math.round(e.factor * 100) / 100}</small> : null}
              {api.removeEntry && <button className="x-mini" aria-label={`${e.title}を外す`} onClick={async () => { await api.removeEntry!(e.id); load(); }}>×</button>}
            </span>
          ))}
        </div>
      )}
      {items.length === 0 && <div className="empty">リストは空です。<br />{api.owner ? "「＋ 料理を選ぶ」か、レシピの「🛒 買い物リストに入れる」で追加できます。" : "下から買うものを追加できます。"}</div>}

      {view === "merged" ? (
        <>
          <ul className="shop-list">{toBuy.map((it) => row(it))}</ul>
          {bought.length > 0 && (
            <>
              <button className="link small" onClick={() => setShowDone(!showDone)}>{showDone ? "買ったものを隠す" : `✓ 買ったもの（${bought.length}）`}</button>
              {showDone && <ul className="shop-list">{bought.map((it) => row(it, true))}</ul>}
            </>
          )}
          {pantry.length > 0 && (
            <details className="pantry-box">
              <summary>🏠 家にあるもの（{pantry.length}）</summary>
              <ul className="shop-list">{pantry.map((it) => row(it, true))}</ul>
            </details>
          )}
        </>
      ) : (
        <div className="by-recipe">
          {[...recipes, ...manual].map((e) => (
            <section key={e.id} className="panel by-recipe-card">
              <h2>{e.recipeId ? recipeLink(e.recipeId, e.title) : e.addedBy ? `${e.addedBy}さんが追加` : "追加したもの"}</h2>
              <ul className="shop-list">
                {e.ingredients.filter((i) => i.name.trim()).map((ing, k) => {
                  const key = nameKey(ing.name).key;
                  const f = flagOf(key) ?? { key, checked: false, pantry: false };
                  return (
                    <li key={k} className={`shop-item ${f.checked ? "checked" : ""} ${f.pantry ? "muted" : ""}`}>
                      <label className="shop-check">
                        <input type="checkbox" checked={f.checked || f.pantry} onChange={() => toggle(f, f.pantry ? "pantry" : "checked")} />
                        <span className="shop-name">{ing.mark ? `${ing.mark} ` : ""}{ing.name}</span>
                        <span className="shop-total">{ing.amount}</span>
                      </label>
                      {e.recipeId === null && api.removeEntry && <button className="x-mini" onClick={async () => { await api.removeEntry!(e.id); load(); }}>×</button>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="shop-add">
        <input className="input grow" placeholder="買うものを追加（例：牛乳）" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addManual()} />
        <input className="input amount" placeholder="量" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" disabled={!name.trim()} onClick={addManual}>追加</button>
      </div>

      <div className="shop-footer">
        {bought.length > 0 && api.uncheckAll && <button className="link small" onClick={async () => { await api.uncheckAll!(bought.map((b) => b.key)); load(); }}>チェックを全部外す</button>}
        {api.clear && data.entries.length > 0 && (
          <button className="link small danger" onClick={async () => { if (confirm("買い物リストを空にしますか？（「家にある」の印は残ります）")) { await api.clear!(); load(); } }}>リストを空にする</button>
        )}
      </div>

      {api.owner && share !== undefined && (
        <section className="panel shop-share">
          <h2>👨‍👩‍👧 家族と共有</h2>
          <p className="hint small">リンクを送ると、家族もログインなしでこのリストを見て、チェックや「買うもの」の追加ができます。</p>
          {share ? (
            <>
              <div className="share-url">{shopShareUrl(share)}</div>
              <div className="row">
                <button className="btn small primary" onClick={async () => {
                  const url = shopShareUrl(share);
                  if (navigator.share) { try { await navigator.share({ title: "買い物リスト", text: "あじめもの買い物リストです", url }); return; } catch { /* キャンセル */ } }
                  await navigator.clipboard?.writeText(url); setShareMsg("リンクをコピーしました");
                }}>リンクを送る</button>
                <button className="link small danger" onClick={async () => { if (confirm("共有を止めますか？送ったリンクは開けなくなります")) { await revokeShopShare(share); setShare(null); } }}>共有を止める</button>
              </div>
            </>
          ) : (
            <button className="btn small" onClick={async () => { try { setShare(await createShopShare()); } catch (e) { setShareMsg((e as Error).message); } }}>共有リンクを作る</button>
          )}
          {shareMsg && <p className="hint small">{shareMsg}</p>}
        </section>
      )}
      {err && <div className="error">{err}</div>}
    </div>
  );
}
