// API本体（ローカル実行・Vercel共通）
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { cleanTitle, parseRecipeHtml, parseRecipeText, snsCaption } from "./parse.mjs";
import { fetchFullCaption, snsTitle } from "./sns.mjs";
import { aiAvailable, extractWithClaude } from "./ai.mjs";
import { appTemplate, renderSharePage } from "./ssr.mjs";

const app = express();
app.use(express.json({ limit: "25mb" }));

const errMsg = (e) => (e instanceof Error ? e.message : String(e));

// --- ログイン確認 ---------------------------------------------------------
// Supabaseが設定されていれば、ログイン済みの人だけがAPI（URL読み取り等）を使える。
// ALLOWED_EMAILS（カンマ区切り）に入っている人だけが、AI（費用がかかる）を使える。
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }) : null;
const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function userFrom(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!supabase || !token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}
const aiAllowedFor = (user) => aiAvailable() && (!allowed.length || allowed.includes((user?.email || "").toLowerCase()));

async function requireUser(req, res, next) {
  if (!supabase) { req.aiAllowed = aiAvailable(); return next(); } // 認証なしモード（ローカル開発）
  if (!req.headers.authorization) return res.status(401).json({ error: "ログインしてください" });
  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: "ログインの有効期限が切れました。もう一度ログインしてください" });
  req.aiAllowed = aiAllowedFor(user);
  next();
}

// ---- 共有リンクのページ（中身入り）と、その写真 ----
const originOf = (req) => `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`;

app.get(["/s/:token", "/s/:token/r/:recipeId"], async (req, res, next) => {
  if (!supabase) return next(); // ローカル開発（Supabase未設定）は普通のページ
  const origin = originOf(req);
  try {
    const html = await renderSharePage(supabase, { token: req.params.token, recipeId: req.params.recipeId, origin });
    res.set("cache-control", "public, max-age=0, s-maxage=60, stale-while-revalidate=600");
    res.type("html").send(html ?? (await appTemplate(origin)));
  } catch {
    try { res.type("html").send(await appTemplate(origin)); } catch { next(); }
  }
});

// 共有中のレシピの写真（プレビュー画像用）。見られるかどうかは Supabase の設定（共有中のものだけ）で決まる
app.get("/api/share-image/:owner/:image", async (req, res) => {
  if (!supabase) return res.status(404).end();
  const { owner, image } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(owner) || !/^[\w-]{1,80}$/.test(image)) return res.status(400).end();
  const { data, error } = await supabase.storage.from("recipe-images").download(`${owner}/${image}`);
  if (error || !data) return res.status(404).end();
  res.set("cache-control", "public, max-age=3600, s-maxage=86400");
  res.type(data.type || "image/jpeg").send(Buffer.from(await data.arrayBuffer()));
});

app.get("/api/status", async (req, res) => {
  if (!supabase) return res.json({ ai: aiAvailable() });
  res.json({ ai: aiAllowedFor(await userFrom(req)) });
});

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
    // Instagram などのSNSは、リンクのプレビュー用の情報（投稿の説明文）を取る
    const sns = /(^|\.)(instagram\.com|threads\.net|facebook\.com)$/i.test(target.hostname);
    const r = await fetch(target, {
      headers: {
        "user-agent": sns ? "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" : "Mozilla/5.0 (compatible; RecipeBox/1.0)",
        "accept-language": "ja,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });
    const html = r.ok ? await r.text() : "";
    const full = snsCaption(await fetchFullCaption(target, html));
    if (!r.ok && !full) throw new Error(`ページを読み込めませんでした（${r.status}）。ログインが必要なページかもしれません`);
    const parsed = r.ok ? parseRecipeHtml(html, target.href) : { found: false, title: "", description: "", imageUrl: "", pageText: "" };
    if (!parsed.found) {
      // プレビュー用の説明文は途中で切れることがあるので、取れれば全文のキャプションを使う
      if (full.length > (parsed.description || "").replace(/[….]+$/, "").length - 5) parsed.description = full;
    }
    if (parsed.found) {
      const { found, imageUrl, ...recipe } = parsed;
      return res.json({ recipes: [recipe], imageUrl, method: "structured" });
    }
    // 投稿の説明文（SNSのキャプションなど）＋ページ本文から探す
    const text = [parsed.description, parsed.pageText].filter(Boolean).join("\n\n");
    if (req.aiAllowed && text) {
      const recipes = await extractWithClaude({ text });
      return res.json({ recipes: recipes.slice(0, 1), imageUrl: parsed.imageUrl, method: "ai" });
    }
    const fromCaption = parsed.description ? parseRecipeText(parsed.description) : null;
    const guess = fromCaption && (fromCaption.ingredients.length || fromCaption.steps.length) ? fromCaption : parseRecipeText(parsed.pageText || "");
    // キャプションから読めた時はその料理名、読めない時はページの題名を整えて使う
    const title = (fromCaption && guess === fromCaption && guess.title) || cleanTitle(snsTitle(parsed.title)) || guess.title;
    return res.json({ recipes: [{ ...guess, title }], imageUrl: parsed.imageUrl, method: "text" });
  } catch (e) {
    const m = errMsg(e);
    res.status(502).json({ error: /fetch failed|timeout|aborted/i.test(m) ? "ページを開けませんでした。URLを確認するか、手入力で作ってください" : m });
  }
});

// テキストをAIで整形（AIを使わない整形はブラウザ内で行う）
app.post("/api/import/text", async (req, res) => {
  const { text } = req.body ?? {};
  if (!text?.trim()) return res.status(400).json({ error: "テキストが空です" });
  if (!req.aiAllowed) return res.status(403).json({ error: "このアカウントではAIは使えません" });
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
  if (!req.aiAllowed) return res.status(aiAvailable() ? 403 : 501).json({ error: aiAvailable() ? "このアカウントではAIは使えません" : "スクショの読み取りにはAI設定（ANTHROPIC_API_KEY）が必要です" });
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
