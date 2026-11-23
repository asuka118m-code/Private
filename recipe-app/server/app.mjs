// API本体（ローカル実行・Vercel共通）
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { parseRecipeHtml, parseRecipeText } from "./parse.mjs";
import { aiAvailable, extractWithClaude } from "./ai.mjs";

const app = express();
app.use(express.json({ limit: "25mb" }));

const errMsg = (e) => (e instanceof Error ? e.message : String(e));

// --- ログイン確認 ---------------------------------------------------------
// Supabaseが設定されていれば、ログイン済みの人だけがAPI（AI読み取り等）を使える。
// ALLOWED_EMAILS（カンマ区切り）を設定すると、さらに利用者を限定できる。
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }) : null;
const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function requireUser(req, res, next) {
  if (!supabase) return next(); // 認証なしモード（ローカル開発）
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "ログインしてください" });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "ログインの有効期限が切れました。もう一度ログインしてください" });
  if (allowed.length && !allowed.includes((data.user.email || "").toLowerCase())) {
    return res.status(403).json({ error: "このアカウントでは利用できません" });
  }
  next();
}

app.get("/api/status", (_req, res) => res.json({ ai: aiAvailable() }));

app.use("/api/import", requireUser);
app.use("/api/image", requireUser);

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
    if (parsed.found) {
      const { found, imageUrl, ...recipe } = parsed;
      return res.json({ recipes: [recipe], imageUrl, method: "structured" });
    }
    if (aiAvailable() && parsed.pageText) {
      const recipes = await extractWithClaude({ text: parsed.pageText });
      return res.json({ recipes: recipes.slice(0, 1), imageUrl: parsed.imageUrl, method: "ai" });
    }
    const guess = parseRecipeText(parsed.pageText || "");
    return res.json({ recipes: [{ ...guess, title: parsed.title || guess.title }], imageUrl: parsed.imageUrl, method: "text" });
  } catch (e) {
    res.status(502).json({ error: errMsg(e) });
  }
});

// テキストをAIで整形（AIを使わない整形はブラウザ内で行う）
app.post("/api/import/text", async (req, res) => {
  const { text } = req.body ?? {};
  if (!text?.trim()) return res.status(400).json({ error: "テキストが空です" });
  if (!aiAvailable()) return res.status(501).json({ error: "AI設定（ANTHROPIC_API_KEY）がありません" });
  try {
    res.json({ recipes: await extractWithClaude({ text }), method: "ai" });
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
    res.json({ recipes: await extractWithClaude({ images }), method: "ai" });
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

export default app;
