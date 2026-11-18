import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { aiStatus, fetchRemoteImage, findUrl, importFromImages, importFromText, importFromUrl, type ImportResult } from "../lib/api";
import { setDraft } from "../lib/draft";
import { ImagePicker } from "../components/ImagePicker";
import { StoredImage } from "../components/StoredImage";

type Tab = "url" | "image" | "text";

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
    setDraft({
      title: result.title || "",
      servings: result.servings || "",
      ingredients: result.ingredients?.length ? result.ingredients : [],
      steps: result.steps ?? [],
      sourceUrl,
      sourceImages: imgs,
    });
    nav("/new");
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
        await finish(await importFromText(text), [], findUrl(text));
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
            <p className="hint">InstagramやX、YouTubeの説明欄などのレシピ文をコピーして貼り付けてください。</p>
            <textarea className="input" rows={10} placeholder={"【材料】\n豚バラ 200g\n玉ねぎ 1個\n\n【作り方】\n1. 玉ねぎを切る\n2. ..."} value={text} onChange={(e) => setText(e.target.value)} />
          </>
        )}

        {error && <div className="error">{error}</div>}
        <button className="btn primary wide" disabled={!canRun || busy || (tab === "image" && ai === false)} onClick={run}>
          {busy ? "読み取り中…" : "読み取る"}
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
