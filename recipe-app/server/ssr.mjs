// 共有リンク（/s/…）を開いた時に、レシピの中身をページに入れて返す。
// → AI・リンクを読むツール・検索エンジンが読める／LINEやSNSでプレビュー（料理名と写真）が出る。
// 人が開いた時は、そのあとアプリの画面（React）に切り替わる。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const DIST_INDEX = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.html");

let cached = null;
/** アプリの index.html（ローカルではファイル、Vercelでは自分のサイトから読む） */
export async function appTemplate(origin) {
  if (cached) return cached;
  try { cached = fs.readFileSync(DIST_INDEX, "utf8"); return cached; } catch { /* Vercel */ }
  const r = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(5000) });
  cached = await r.text();
  return cached;
}

const coverOf = (r) => r.coverImageId ?? r.photoIds?.[0] ?? r.sourceImageIds?.[0] ?? null;

function recipeBody(r, ownerName) {
  const ings = (r.ingredients ?? []).map((i) => `<li>${i.mark ? `<b>${esc(i.mark)}</b> ` : ""}${esc(i.name)}${i.amount ? `<span>${esc(i.amount)}</span>` : ""}</li>`).join("");
  const steps = (r.steps ?? []).map((s) => `<li>${esc(s)}</li>`).join("");
  return `<main class="ssr">
<p class="ssr-from">${esc(ownerName ? `${ownerName}さんのレシピ` : "共有されたレシピ")}｜あじめも</p>
<h1>${esc(r.title || "（無題）")}</h1>
${r.servings ? `<p>${esc(r.servings)}</p>` : ""}
${ings ? `<h2>材料</h2><ul>${ings}</ul>` : ""}
${steps ? `<h2>作り方</h2><ol>${steps}</ol>` : ""}
${r.memo?.trim() ? `<h2>メモ</h2><p>${esc(r.memo.trim()).replace(/\n/g, "<br>")}</p>` : ""}
${r.sourceUrl ? `<p>参考：<a href="${esc(r.sourceUrl)}">${esc(r.sourceUrl)}</a></p>` : ""}
</main>`;
}

function listBody(list, token) {
  const items = (list.recipes ?? []).map((r) => `<li><a href="/s/${esc(token)}/r/${esc(r.id)}">${esc(r.title || "（無題）")}</a></li>`).join("");
  return `<main class="ssr">
<p class="ssr-from">あじめも</p>
<h1>${esc(list.ownerName ? `${list.ownerName}さんのレシピ` : "レシピ一覧")}</h1>
<ul>${items}</ul>
</main>`;
}

const SSR_STYLE = `<style>.ssr{max-width:720px;margin:0 auto;padding:16px;font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:#2b2420;line-height:1.7}.ssr h1{font-size:22px}.ssr h2{font-size:16px;border-left:4px solid #e8743b;padding-left:8px}.ssr li span{margin-left:8px;color:#8a7f78}.ssr-from{color:#8a7f78;font-size:13px}</style>`;

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase ログインなし（anon）のクライアント
 */
export async function renderSharePage(supabase, { token, recipeId, origin }) {
  const tpl = await appTemplate(origin);
  let title, description, image = null, body, url = `${origin}/s/${token}${recipeId ? `/r/${recipeId}` : ""}`;

  let list = null;
  if (!recipeId) {
    const { data } = await supabase.rpc("get_shared_list", { p_token: token });
    list = data ?? null;
  }
  if (list) {
    title = list.ownerName ? `${list.ownerName}さんのレシピ` : "レシピ一覧";
    description = (list.recipes ?? []).slice(0, 8).map((r) => r.title).join("、");
    const first = (list.recipes ?? []).find((r) => r.cover);
    if (first) image = `${origin}/api/share-image/${list.ownerId}/${first.cover}`;
    body = listBody(list, token);
  } else {
    const { data } = recipeId
      ? await supabase.rpc("get_shared_recipe", { p_token: token, p_recipe_id: recipeId })
      : await supabase.rpc("get_shared_recipe", { p_token: token });
    if (!data) return null;
    const r = data.recipe;
    title = r.title || "レシピ";
    description = [r.servings, (r.ingredients ?? []).slice(0, 10).map((i) => i.name).join("・")].filter(Boolean).join("｜材料：");
    const cover = coverOf(r);
    if (cover) image = `${origin}/api/share-image/${data.ownerId}/${cover}`;
    body = recipeBody(r, data.ownerName);
  }

  const meta = [
    `<title>${esc(title)}｜あじめも</title>`,
    `<meta name="description" content="${esc(description.slice(0, 200))}">`,
    `<meta name="robots" content="noindex">`, // 今は検索結果に出さない（公開するレシピを選べるようにしてから外す）
    `<meta property="og:site_name" content="あじめも">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description.slice(0, 200))}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : `<meta property="og:image" content="${esc(origin)}/icons-v2/icon-512.png">`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    SSR_STYLE,
  ].join("\n    ");

  return tpl
    .replace(/<title>[^<]*<\/title>/, meta)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}
