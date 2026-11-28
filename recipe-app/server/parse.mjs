// HTML（レシピサイト）からの解析
import * as cheerio from "cheerio";
import { parseRecipeText, splitIngredient, stripStepNumber } from "../shared/textparse.mjs";

export { parseRecipeText, parseRecipesText, splitIngredient, cleanTitle } from "../shared/textparse.mjs";

function flattenInstructions(ins) {
  if (!ins) return [];
  if (typeof ins === "string") return ins.split(/\r?\n/).map(stripStepNumber).filter(Boolean);
  if (Array.isArray(ins)) return ins.flatMap(flattenInstructions);
  if (ins["@type"] === "HowToSection") return flattenInstructions(ins.itemListElement);
  if (ins.text) return [stripStepNumber(cheerio.load(ins.text).text())];
  if (ins.name) return [stripStepNumber(ins.name)];
  return [];
}

function findRecipeNode(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipeNode(n); if (r) return r; }
    return null;
  }
  const t = node["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return node;
  if (node["@graph"]) return findRecipeNode(node["@graph"]);
  return null;
}

const pickImage = (img) => {
  if (!img) return "";
  if (typeof img === "string") return img;
  if (Array.isArray(img)) return pickImage(img[0]);
  return img.url || "";
};

/** HTMLからschema.org/Recipe(JSON-LD)を探す。多くのレシピサイトが対応 */
export function parseRecipeHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  let recipe = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (recipe) return;
    try { recipe = findRecipeNode(JSON.parse($(el).contents().text())); } catch {}
  });
  const ogImage = $('meta[property="og:image"]').attr("content") || "";
  const ogTitle = $('meta[property="og:title"]').attr("content") || $("title").text() || "";
  const description = $('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content") || "";
  const abs = (u) => { try { return u ? new URL(u, baseUrl).href : ""; } catch { return ""; } };
  if (recipe) {
    return {
      found: true,
      title: cheerio.load(String(recipe.name || ogTitle)).text().trim(),
      servings: Array.isArray(recipe.recipeYield) ? String(recipe.recipeYield[0]) : String(recipe.recipeYield || ""),
      ingredients: (recipe.recipeIngredient || recipe.ingredients || []).map(splitIngredient).filter(Boolean),
      steps: flattenInstructions(recipe.recipeInstructions),
      imageUrl: abs(pickImage(recipe.image) || ogImage),
    };
  }
  $("script,style,noscript,svg,header,footer,nav").remove();
  return {
    found: false,
    title: ogTitle.trim(),
    description: snsCaption(description),
    imageUrl: abs(ogImage),
    pageText: $("body").text().replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").slice(0, 30000),
  };
}

/**
 * SNSの説明文から投稿本文だけを取り出す。
 * Instagram: 「123 likes, 4 comments - user on November 1, 2026: "本文…"」→「本文…」
 */
export function snsCaption(desc) {
  let s = String(desc || "").trim();
  // 「123 likes, 4 comments - user on …: "」「いいね！123件、コメント4件 - user、…: "」の前置きを外す（終わりのカッコが無い＝途中で切れていても外す）
  const m = s.match(/^[^\n]{0,250}?(?:likes?|いいね|comments?|コメント)[^\n]{0,250}?[:：]\s*["“「]/i);
  if (m) s = s.slice(m[0].length).replace(/["”」]\.?\s*$/, "");
  return s.replace(/\\n/g, "\n").trim();
}
