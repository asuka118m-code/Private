// テキストからのレシピ解析（AI不要・ブラウザとサーバーの両方で使う）

/** 材料に付ける印（調味料のまとまりなど）として使える記号 */
export const MARK_CHOICES = ["A", "B", "C", "D", "E", "★", "☆", "◎", "○", "●", "◆", "◇", "■", "□", "※", "♪"];
const MARK_SYMBOLS = "★☆◎○◯●◆◇■□※♪";
const toHalf = (c) => c.replace(/[Ａ-Ｅａ-ｅ]/g, (x) => String.fromCharCode(x.charCodeAt(0) - 0xfee0)).toUpperCase().replace("◯", "○");
const GROUP_WORDS = "(?:合わせ調味料|調味料|たれ|タレ|ソース|下味|ドレッシング|衣|トッピング)";

/**
 * 行の先頭の印を取り出す。「A 醤油」「(A)醤油」「【A】醤油」「A.醤油」「★醤油」→ {mark:"A"/"★", rest:"醤油"}
 * 「A」「【A】」「A（合わせ調味料）」だけの行は見出し（rest が空）
 */
export function takeMark(line) {
  const s = String(line).trim();
  let m = s.match(new RegExp(`^[（(【\\[<＜〈]\\s*([A-EＡ-Ｅa-eａ-ｅ]|[${MARK_SYMBOLS}])\\s*[）)】\\]>＞〉]\\s*(.*)$`));
  if (!m) m = s.match(/^([A-EＡ-Ｅ])(?:\s+|[.．:：]\s*|(?=[ぁ-んァ-ヶ一-龠々（(【<＜])|$)(.*)$/);
  if (!m) m = s.match(new RegExp(`^([${MARK_SYMBOLS}])\\s*(.*)$`));
  if (!m) return { mark: "", rest: s };
  let rest = m[2].trim();
  if (new RegExp(`^[（(【<＜]?${GROUP_WORDS}[）)】>＞]?$`).test(rest)) rest = ""; // 「A（合わせ調味料）」は見出し
  return { mark: toHalf(m[1]), rest };
}

/** 材料の1行を「名前」と「分量」（と印）に分ける。例: "玉ねぎ 1/2個" → {name:"玉ねぎ", amount:"1/2個"} */
export function splitIngredient(line) {
  let s = String(line).replace(/\s+/g, " ").trim();
  s = s.replace(/^[・\-\*✓✔︎•·]+\s*/, "");
  const { mark, rest } = takeMark(s);
  if (mark && !rest) return null; // 見出しだけの行
  const ing = splitIngredientBody(rest);
  return ing && mark ? { ...ing, mark } : ing;
}

function splitIngredientBody(s) {
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
    .map((l) => l.trim());
  let title = "";
  let servings = "";
  const ingredients = [];
  const steps = [];
  let mode = "none";
  let groupMark = "";
  for (const line of lines) {
    if (!line && mode !== "ing") continue;
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
      if (!line) { groupMark = ""; continue; } // 空行で「A」などのまとまりが終わる
      const head = takeMark(line.replace(/^[・\-\*•·]+\s*/, ""));
      if (head.mark && !head.rest) { groupMark = head.mark; continue; } // 「【A】」「A（合わせ調味料）」の見出し行
      const ing = splitIngredient(line);
      if (ing) ingredients.push(!ing.mark && groupMark ? { ...ing, mark: groupMark } : ing);
    } else if (mode === "step") {
      const isNumbered = /^(?:STEP\s*)?(?:[0-9０-９]+[.．、)）:：]?|[①-⑳])/i.test(line);
      if (!isNumbered && steps.length) steps[steps.length - 1] += line; // 折り返し行は前の手順へ
      else steps.push(stripStepNumber(line));
    }
  }
  // 全部の材料の頭に同じ記号（●など）が付いているのは、印ではなくただの箇条書き
  const symbolMarks = ingredients.map((i) => i.mark).filter((m) => m && !/^[A-E]$/.test(m));
  if (ingredients.length >= 2 && symbolMarks.length === ingredients.length && new Set(symbolMarks).size === 1) {
    for (const i of ingredients) delete i.mark;
  }
  return { title, servings, ingredients, steps: steps.filter(Boolean) };
}
