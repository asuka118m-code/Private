import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRecipeHtml, parseRecipeText } from "./parse.mjs";
import { aiAvailable, extractWithClaude } from "./ai.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "25mb" }));

const errMsg = (e) => (e instanceof Error ? e.message : String(e));

app.get("/api/status", (_req, res) => res.json({ ai: aiAvailable() }));

// URL（レシピサイト・SNS投稿など）から取り込み
app.post("/api/import/url", async (req, res) => {
  const { url } = req.body ?? {};
  let target;
  try {
    target = new URL(url);
    if (!/^https?:$/.test(target.protocol)) throw new Error();
  } catch {
    return res.status(400).json({ error: "URLが正しくありません" });
  }
  try {
    const r = await fetch(target, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; RecipeBox/1.0)", "accept-language": "ja,en;q=0.8" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`ページを取得できませんでした (${r.status})`);
    const parsed = parseRecipeHtml(await r.text(), target.href);
    if (parsed.found) return res.json({ ...parsed, method: "structured" });
    if (aiAvailable() && parsed.pageText) {
      const ai = await extractWithClaude({ text: parsed.pageText });
      return res.json({ ...ai, imageUrl: parsed.imageUrl, method: "ai" });
    }
    const guess = parseRecipeText(parsed.pageText || "");
    return res.json({ ...guess, title: parsed.title || guess.title, imageUrl: parsed.imageUrl, method: "text" });
  } catch (e) {
    res.status(502).json({ error: errMsg(e) });
  }
});

// テキスト（SNSの投稿文のコピーなど）から取り込み
app.post("/api/import/text", async (req, res) => {
  const { text } = req.body ?? {};
  if (!text?.trim()) return res.status(400).json({ error: "テキストが空です" });
  try {
    if (aiAvailable()) return res.json({ ...(await extractWithClaude({ text })), method: "ai" });
    res.json({ ...parseRecipeText(text), method: "text" });
  } catch (e) {
    res.status(502).json({ error: errMsg(e) });
  }
});

// スクリーンショットから取り込み（AI必須）
app.post("/api/import/image", async (req, res) => {
  const { images } = req.body ?? {};
  if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: "画像がありません" });
  if (!aiAvailable()) return res.status(501).json({ error: "スクショの読み取りにはAI設定（ANTHROPIC_API_KEY）が必要です" });
  try {
    res.json({ ...(await extractWithClaude({ images })), method: "ai" });
  } catch (e) {
    res.status(502).json({ error: errMsg(e) });
  }
});

// 参考画像URLをプロキシして端末に保存できるようにする
app.get("/api/image", async (req, res) => {
  try {
    const u = new URL(String(req.query.url));
    if (!/^https?:$/.test(u.protocol)) throw new Error("bad url");
    const r = await fetch(u, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0" } });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) throw new Error("画像を取得できませんでした");
    res.set("content-type", type).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: errMsg(e) });
  }
});

const dist = path.join(__dirname, "..", "dist");
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`RecipeBox: http://localhost:${port}  (AI: ${aiAvailable() ? "ON" : "OFF"})`));
