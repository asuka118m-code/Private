// レシピ解析ロジック（APIキー無しでも動くルールベース部分）
import * as cheerio from "cheerio";

/** 材料の1行を「名前」と「分量」に分ける。例: "玉ねぎ 1/2個" → {name:"玉ねぎ", amount:"1/2個"} */
export function splitIngredient(line) {
  let s = String(line).replace(/\s+/g, " ").trim();
  s = s.replace(/^[・\-\*●○◯■□◆◇★☆✓✔︎•·]+\s*/, "");
  if (!s) return null;
  // 区切り記号（… ‥ ： : … 全角スペース 等）
  const sep = s.match(/^(.+?)\s*(?:…+|‥+|・{2,}|\.{3,}|：|:|\t| {2,}|　)\s*(.+)$/);
  if (sep) return { name: sep[1].trim(), amount: sep[2].trim() };
  // 末尾の分量表現
  const amountRe =
    /\s*((?:大さじ|小さじ|大|小|カップ|約|お好みで|少々|適量|適宜|ひとつまみ|少量|ひとかけ|ひと?片)[^\s]*|[0-9０-９½¼¾/／.~〜～\-]+\s*(?:g|ｇ|kg|ml|mL|ｍｌ|cc|L|個|本|枚|片|かけ|房|束|袋|缶|パック|丁|玉|株|尾|切れ|杯|合|cm|粒|膳|人分|つまみ|カップ)?[^\s]*)$/;
  const m = s.match(amountRe);
  if (m && m.index > 0) {
    return { name: s.slice(0, m.index).trim(), amount: m[1].trim() };
  }
  // "砂糖 少々" のような単純なスペース区切り
  const sp = s.match(/^(\S+)\s+(\S+)$/);
  if (sp) return { name: sp[1], amount: sp[2] };
  return { name: s, amount: "" };
}

const stripStepNumber = (s) =>
  String(s)
    .replace(/^\s*(?:STEP\s*)?(?:[0-9０-９]+|[①-⑳])\s*[.．、)）:：]?\s*/i, "")
    .trim();

/** SNSのキャプションなど、プレーンテキストからレシピを推測 */
export function parseRecipeText(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let title = "";
  let servings = "";
  const ingredients = [];
  const steps = [];
  let mode = "none";
  const ingHead = /^[【\[\(（<＜■□◆●★☆▼▽]*\s*(材料|用意するもの|ingredients)/i;
  const stepHead = /^[【\[\(（<＜■□◆●★☆▼▽]*\s*(作り方|つくり方|手順|レシピ|how to|steps?|directions|instructions)/i;
  for (const line of lines) {
    if (ingHead.test(line)) {
      mode = "ing";
      servings ||= line.match(/[0-9０-９〜~\-]+\s*(?:人分|人前|個分|皿分)/)?.[0] ?? "";
      continue;
    }
    if (stepHead.test(line)) { mode = "step"; continue; }
    if (/^#/.test(line)) continue; // ハッシュタグ
    if (mode === "none") {
      if (!title) title = line.replace(/^[【\[]|[】\]]$/g, "");
      // 番号付きの行は手順とみなす
      if (/^(?:[0-9０-９]+[.．、)）]|[①-⑳])/.test(line)) { mode = "step"; steps.push(stripStepNumber(line)); }
      continue;
    }
    if (mode === "ing") {
      if (/^(?:[0-9０-９]+[.．、)）]|[①-⑳])/.test(line) && !/[個本枚gml]$/.test(line)) {
        mode = "step"; steps.push(stripStepNumber(line)); continue;
      }
      const ing = splitIngredient(line);
      if (ing) ingredients.push(ing);
    } else if (mode === "step") {
      const isNumbered = /^(?:STEP\s*)?(?:[0-9０-９]+[.．、)）:：]?|[①-⑳])/i.test(line);
      if (!isNumbered && steps.length) steps[steps.length - 1] += line; // 折り返し行は前の手順へ
      else steps.push(stripStepNumber(line));
    }
  }
  return { title, servings, ingredients, steps: steps.filter(Boolean) };
}

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
    imageUrl: abs(ogImage),
    pageText: $("body").text().replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").slice(0, 30000),
  };
}
