import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { aiStatus, fetchRemoteImage, findUrl, importFromImages, importFromText, importFromUrl, type ImportResult } from "../lib/api";
import { setDraft } from "../lib/draft";
import { getSelectedCategory, listCategories, saveDraftAsRecipe } from "../lib/db";
import type { RecipeDraft } from "../lib/types";
import { ImagePicker } from "../components/ImagePicker";
import { StoredImage } from "../components/StoredImage";

type Tab = "url" | "image" | "text";

const TEMPLATE = `レシピ名：肉じゃが
材料（2人分）
じゃがいも 2個
牛肉 150g
醤油 大さじ2
作り方
1. じゃがいもを切る
2. 牛肉を炒め、じゃがいもを加えて煮る

レシピ名：卵スープ
材料
卵 1個
水 300ml
作り方
1. 水を沸かす
2. 溶き卵を回し入れる`;

/** 端末の「共有」から渡されたデータを取り出す（service worker が保存） */
async function takeSharedInbox() {
  if (!("caches" in window)) return null;
  const cache = await caches.open("share-inbox");
  const meta = await cache.match("/share-inbox/meta");
  if (!meta) return null;
  const data = (await meta.json()) as { title: string; text: string; url: string };
  const count = Number(await (await cache.match("/share-inbox/count"))?.text()) || 0;
  const files: Blob[] = [];
  for (let i = 0; i < count; i++) {
    const r = await cache.match(`/share-inbox/file-${i}`);
    if (r) files.push(await r.blob());
  }
  await caches.delete("share-inbox");
  return { ...data, files };
}

export function ImportPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [images, setImages] = useState<Blob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ai, setAi] = useState<boolean | null>(null);
  const [useAi, setUseAi] = useState(false);
  const [preview, setPreview] = useState<(RecipeDraft & { checked: boolean })[] | null>(null);

  useEffect(() => { aiStatus().then(setAi); }, []);

  // 共有シート / ?url= ?text= から来た場合
  useEffect(() => {
    (async () => {
      const shared = params.get("shared") ? await takeSharedInbox() : null;
      const sUrl = shared?.url || params.get("url") || findUrl(shared?.text || params.get("text") || "");
      const sText = [shared?.title, shared?.text || params.get("text")].filter(Boolean).join("\n");
      if (shared?.files.length) { setImages(shared.files); setTab("image"); }
      else if (sUrl) { setUrl(sUrl); setTab("url"); }
      else if (sText) { setText(sText); setTab("text"); }
    })();
  }, [params]);

  async function finish(result: ImportResult, sourceImages: Blob[], sourceUrl: string) {
    const imgs = [...sourceImages];
    if (result.imageUrl) {
      const b = await fetchRemoteImage(result.imageUrl);
      if (b) imgs.unshift(b);
    }
    const sel = getSelectedCategory();
    const categoryIds = sel && (await listCategories()).some((c) => c.id === sel) ? [sel] : [];
    const drafts: RecipeDraft[] = result.recipes.map((r) => ({
      categoryIds,
      title: r.title || "",
      servings: r.servings || "",
      ingredients: (r.ingredients ?? []).map((i) => (i.mark ? i : { name: i.name, amount: i.amount })),
      steps: r.steps ?? [],
      sourceUrl,
      sourceImages: imgs,
    }));
    if (drafts.length === 0) throw new Error("レシピを読み取れませんでした。「材料」「作り方」の見出しがあるか確認してください。");
    if (drafts.length === 1) {
      setDraft(drafts[0]);
      return nav("/new");
    }
    setPreview(drafts.map((d) => ({ ...d, checked: true })));
  }

  async function saveAll() {
    if (!preview) return;
    setBusy(true);
    try {
      for (const d of preview.filter((p) => p.checked)) await saveDraftAsRecipe(d);
      nav("/");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setError("");
    try {
      if (tab === "url") {
        const u = findUrl(url) || url.trim();
        await finish(await importFromUrl(u), [], u);
      } else if (tab === "image") {
        await finish(await importFromImages(images), images, "");
      } else {
        await finish(await importFromText(text, useAi ? "ai" : "rule"), [], "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function manualWithImages() {
    setDraft({ title: "", servings: "", ingredients: [], steps: [], sourceUrl: findUrl(url) || findUrl(text), sourceImages: images });
    nav("/new");
  }

  if (preview) {
    const n = preview.filter((p) => p.checked).length;
    return (
      <div className="page">
        <header className="topbar">
          <button className="link back" onClick={() => setPreview(null)}>‹ 戻る</button>
          <h1>{preview.length}件のレシピが見つかりました</h1>
        </header>
        <p className="hint">登録するレシピを選んでください。登録後も個別に編集できます。</p>
        {preview.map((d, i) => (
          <section key={i} className={`panel preview ${d.checked ? "" : "off"}`}>
            <label className="check">
              <input type="checkbox" checked={d.checked}
                onChange={(e) => setPreview((p) => p!.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))} />
              <b>{d.title || "（無題）"}</b>{d.servings && <span className="hint small">　{d.servings}</span>}
            </label>
            <div className="hint small">材料 {d.ingredients.length}品・手順 {d.steps.length}つ</div>
            <ul className="ingredients mini">
              {d.ingredients.slice(0, 6).map((x, k) => <li key={k}><span className="name">{x.name}</span><span className="dots" /><span className="amount">{x.amount}</span></li>)}
              {d.ingredients.length > 6 && <li className="hint small">…ほか{d.ingredients.length - 6}品</li>}
            </ul>
          </section>
        ))}
        <button className="btn primary wide" disabled={!n || busy} onClick={saveAll}>{busy ? "登録中…" : `${n}件をまとめて登録`}</button>
      </div>
    );
  }

  const canRun = tab === "url" ? !!url.trim() : tab === "image" ? images.length > 0 : !!text.trim();

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="back">‹ 戻る</Link>
        <h1>レシピを追加</h1>
      </header>

      <div className="tabs">
        <button className={tab === "url" ? "on" : ""} onClick={() => setTab("url")}>🔗 URL</button>
        <button className={tab === "image" ? "on" : ""} onClick={() => setTab("image")}>🖼 スクショ</button>
        <button className={tab === "text" ? "on" : ""} onClick={() => setTab("text")}>📝 テキスト</button>
      </div>

      <section className="panel">
        {tab === "url" && (
          <>
            <p className="hint">レシピサイトやSNS投稿のURLを貼り付けてください。</p>
            <input className="input" type="url" inputMode="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          </>
        )}
        {tab === "image" && (
          <>
            <p className="hint">
              レシピのスクリーンショットを選んでください（複数枚OK）。画像は「参考」としてレシピと一緒に保存されます。
              {ai === false && <><br /><b>※ 自動読み取りにはAI設定が必要です。未設定の場合は画像を添付して手入力できます。</b></>}
            </p>
            <ImagePicker label="画像を選ぶ" onPick={(b) => setImages((p) => [...p, ...b])} />
            <div className="thumbs">
              {images.map((b, i) => (
                <div key={i} className="thumb">
                  <StoredImage blob={b} />
                  <button className="x" onClick={() => setImages((p) => p.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "text" && (
          <>
            <p className="hint">
              InstagramやX、YouTubeの説明欄、メモなどのレシピ文を貼り付けてください。
              「材料」「作り方」の見出しがあれば自動で整えます。<b>複数のレシピもまとめて登録できます</b>（「レシピ名：」で区切る）。
            </p>
            <textarea className="input" rows={12} placeholder={TEMPLATE} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row">
              <button type="button" className="link small" onClick={() => setText(TEMPLATE)}>書き方の例を入れる</button>
              {ai && (
                <label className="check small">
                  <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                  AIで整形する（書き方がバラバラな時に。有料）
                </label>
              )}
            </div>
          </>
        )}

        {error && <div className="error">{error}</div>}
        <button className="btn primary wide" disabled={!canRun || busy || (tab === "image" && ai === false)} onClick={run}>
          {busy ? "読み取り中…" : tab === "text" && !useAi ? "整えて取り込む" : "読み取る"}
        </button>
        {tab === "image" && images.length > 0 && (
          <button className="btn wide" onClick={manualWithImages}>画像を添付して手入力する</button>
        )}
      </section>

      <div className="center">
        <Link to="/new" className="link">手入力で新しく作る</Link>
      </div>
      <p className="hint small">
        ヒント：Androidではホーム画面に追加すると、Instagramなどの「共有」からこのアプリへ直接送れます。
        iPhoneでは共有メニューから「リンクをコピー」して貼り付けてください。
      </p>
    </div>
  );
}
