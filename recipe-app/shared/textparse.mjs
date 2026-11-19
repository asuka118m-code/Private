// テキストからのレシピ解析（AI不要・ブラウザとサーバーの両方で使う）

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

export const stripStepNumber = (s) =>
  String(s)
    .replace(/^\s*(?:STEP\s*)?(?:[0-9０-９]+|[①-⑳])\s*[.．、)）:：]?\s*/i, "")
    .trim();

const MARK = "[【\\[\\(（<＜■□◆◇●○★☆▼▽▶︎・]*\\s*";
const ingHead = new RegExp(`^${MARK}(材料|用意するもの|ingredients)`, "i");
const stepHead = new RegExp(`^${MARK}(作り方|つくり方|手順|レシピ(?!名)|how to|steps?|directions|instructions)`, "i");
const TITLE_HEAD = new RegExp(`^${MARK}(レシピ名|料理名|タイトル|メニュー名)\\s*[:：】\\]）)>＞]?\\s*(.*?)\\s*[】\\]]?$`);
const SEPARATOR = /^(?:[-－ー=＝_＿~〜*＊]\s*){3,}$/;
const NUMBERED = /^(?:STEP\s*)?(?:[0-9０-９]+[.．、)）:：]|[①-⑳])/i;

/**
 * 複数レシピがまとめて書かれたテキストを1件ずつに分ける。
 * 区切り: 「レシピ名：」「料理名：」行 / 「---」「===」などの区切り線 /
 *        作り方の後に再び「材料」見出しが来たら、その直前の行を次のレシピ名とみなす
 */
export function splitRecipeBlocks(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim());
  const blocks = [];
  let cur = [];
  let sawSteps = false;
  const flush = () => { if (cur.some(Boolean)) blocks.push(cur); cur = []; sawSteps = false; };
  for (const line of lines) {
    if (SEPARATOR.test(line)) { flush(); continue; }
    if (TITLE_HEAD.test(line)) { flush(); cur.push(line); continue; }
    if (ingHead.test(line) && sawSteps) {
      // 直前の行が見出しや番号付き手順でなければ、それを次のレシピ名として持っていく
      let i = cur.length - 1;
      while (i >= 0 && !cur[i]) i--;
      const prev = cur[i];
      const carry = prev && !NUMBERED.test(prev) && !stepHead.test(prev) ? cur.splice(i) : [];
      flush();
      cur.push(...carry);
    }
    if (stepHead.test(line)) sawSteps = true;
    cur.push(line);
  }
  flush();
  return blocks.map((b) => b.join("\n"));
}

/** 複数レシピ対応のテキスト解析。材料も手順も無いブロックは捨てる */
export function parseRecipesText(text) {
  return splitRecipeBlocks(text)
    .map(parseRecipeText)
    .filter((r) => r.ingredients.length || r.steps.length);
}

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
  for (const line of lines) {
    const t = line.match(TITLE_HEAD);
    if (t) { if (!title) title = t[2].trim(); continue; }
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
