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
    .replace(/^\s*(?:STEP\s*)?(?:[0-9０-９]+|[①-⑳❶-❿➀-➉])\s*[.．、)）:：]?\s*/i, "")
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

// ---- キャプション読み取りの部品 ----
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;
// 行頭の飾り（絵文字・括弧・記号）を外して見出しを判定する
const stripDeco = (s) => String(s).replace(EMOJI, "").replace(/^[\s【\[\(（<＜≪《〈■□◆◇●○◎★☆▼▽▶▷►︎・＼\/／✔✓︎:：\-－ー=＝_~〜*＊|｜]+/, "").trim();
const CLOSE = "[\\s】\\]）)>＞》〉≫:：\\-－]*";
const ING_HEAD = /^(材料|用意するもの|ingredients?)(?![をがはにで])/i;
const SUB_HEAD = new RegExp(`^(調味料|合わせ調味料|タレ|たれ|ソース|下味|衣|ドレッシング|トッピング|仕上げ|飾り|具材|生地)${CLOSE}$`);
// 見出しだけの行（「作り方」「作り方（2人分）」「How to make」「作り方はこちら👇」）。「STEP1 〜」のような手順の行は含めない
const STEP_HEAD = /^(作り方|つくり方|作りかた|手順|how\s*to(\s*make)?|steps?|directions|instructions|recipe|レシピ(?!名))(\s*[（(][^）)]*[）)])?(\s*[0-9０-９]+\s*(?:人分|人前|個分|皿分|台分|枚分))?(\s*(?:は|も)?\s*(?:こちら|です|以下|下記|↓+)(です)?|♪)?[\s】\]）)>＞》〉≫:：\-－!！。.…↓]*$/i;
const MEMO_HEAD = /^(ポイント|point|コツ|memo|メモ|保存方法|保存期間|保存について|アレンジ|注意|tips?|補足)(\s*[（(][^）)]*[）)])?[\s】\]）)>＞》〉≫:：\-－!！。.…]*$/i;
const STEP_NUM = /^\s*(?:step\s*[0-9０-９]+\s*[.．:：)）]?|[0-9０-９]{1,2}\s*[.．、)）:：]|[0-9０-９]{1,2}\s+(?=[^\s0-9０-９\/／.個本枚gml])|[①-⑳❶-❿➀-➉])/i;
const PROMO = /(保存して|保存してね|保存お願い|保存推奨|いいね|フォロー|プロフ|@[\w.]+|#PR|ＰＲ|(^|\s)PR(\s|$)|コメント(して|ください|待って|お待ち)|詳しくは|ストーリーズ?|楽天ROOM|ハイライト|リンクから|DMで|コラボ|投稿しています)/i;
const HASHTAGS = /^(#\S+\s*)+$/;
const SEPARATOR_LINE = /^(?:[-－ー=＝_＿~〜*＊・.…]\s*){3,}$/;
const QTY = /^(約|各)?\s*([0-9０-９½¼¾⅓⅔]|大さじ|小さじ|カップ|少々|適量|適宜|お好み|ひとつまみ|少量|ひとかけ|ひと?片|半分|１|１\/)/;

const SERV = "[0-9０-９]+(?:\\s*[〜~\\-]\\s*[0-9０-９]+)?\\s*(?:人分|人前|個分|皿分|台分|枚分|本分|杯分|合分|食分)";
const ING_HEAD_REST = new RegExp(`^\\s*(?:[（(][^）)]{0,25}[）)])?\\s*(?:約?${SERV})?\\s*(?:[（(][^）)]{0,25}[）)])?\\s*(?:(?:は|も)?\\s*(?:こちら|です|以下|下記|↓+)(?:です)?)?[\\s】\\]）)>＞》〉≫:：\\-－!！。.…♪↓]*$`);
function isIngHead(deco) {
  const m = deco.match(ING_HEAD);
  if (!m) return false;
  const rest = deco.slice(m[0].length);
  // 「【材料】…」「材料：…」のように区切りがあればその後ろは材料。区切りが無ければ人数などだけの行
  return /^\s*[】\]）)>＞》〉≫:：]/.test(rest) || /^\s*[（(][^）)]{0,25}[）)]\s*[:：]/.test(rest) || ING_HEAD_REST.test(rest);
}

/** 数字の付け方をそろえる：「1️⃣」「(1)」「手順1」→「1. 」 */
function normalizeLine(l) {
  return String(l).replace(/[\u200B\u3000]/g, " ").trim()
    .replace(/^([0-9])\uFE0F?\u20E3\s*/u, "$1. ")
    .replace(/^\u{1F51F}\s*/u, "10. ")
    .replace(/^[（(\[［]\s*([0-9０-９]{1,2})\s*[）)\]］]\s*/, "$1. ")
    .replace(/^(?:手順|工程)\s*([0-9０-９]{1,2})\s*[.．:：)）]?\s*/, "$1. ");
}
// 「.」「・」だけの行（インスタでよく使われる空行の代わり）
const SPACER = /^[.．。・･…\-－ー_＿~〜*＊|｜]{1,2}$/;
// 紹介文らしい長い文章
const isProse = (l) => (l.length > 15 && /[。！!？?]$/.test(l)) || l.length > 40;

/** 「醤油 大さじ2」のような材料らしい行か */
function ingredientLike(line) {
  const s = String(line).trim();
  if (!s || s.length > 60 || /[。]$/.test(s) || STEP_NUM.test(s)) return false;
  const ing = splitIngredient(s);
  if (!ing || !ing.amount || !QTY.test(ing.amount)) return false;
  // 「材料3つで簡単！」のような文章は材料ではない
  if (isTagline(s) || ing.amount.length > 15 || /[！!？?。／＼]/.test(ing.amount) || /[0-9０-９]\S*で\S/.test(ing.amount)) return false;
  // 「コンソメ水（水600mlに顆粒コンソメ小さじ1）」のようなカッコの説明は、名前の長さに数えない
  const core = ing.name.replace(/[（(][^）)]*[）)]/g, "").trim();
  return core.length >= 1 && core.length <= 20 && !/[をでてにがは]$/.test(core);
}

/** 1行に「春雨40g、きゅうり1本」のように並んでいれば分ける */
function splitIngredientLine(line) {
  const parts = String(line).split(/[、,，]/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.every(ingredientLike)) return parts.map(splitIngredient);
  const one = splitIngredient(line);
  return one ? [one] : [];
}

/** キャプションの1行から料理名だけを取り出す */
export function cleanTitle(raw) {
  let s = String(raw || "").replace(/#\S+/g, "").trim();
  const quoted = s.replace(EMOJI, "").match(/[「『【]([^」』】]{2,30})[」』】]/);
  if (quoted && !/保存版|PR|簡単|時短|節約|必見|人気|殿堂|大好評|リピ|絶品|話題/.test(quoted[1])) s = quoted[1];
  s = s.replace(/[【\[][^】\]]*[】\]]/g, " "); // 【保存版】などのタグ
  s = s.replace(EMOJI, " ").replace(/[＼\\\/／]/g, " ").replace(/\s+/g, " ").trim();
  s = s.split(/\s*[｜|]\s*/)[0];
  s = s.replace(/^(今日|本日|昨日|今回)(の(晩|夜|昼|朝)(ごはん|ご飯|ゴハン))?(は|も)\s*/, "");
  const made = s.match(/^(.{2,25}?)を(作|つく|ご?紹介|ご?提案)/);
  if (made) s = made[1];
  s = s.replace(/^((簡単|絶品|やみつき注意|激うま|爆速|時短|節約|超簡単|ほったらかし)[!！]?\s+)+/, "");
  s = s.replace(/^(簡単|絶品|激うま|超簡単)[!！]\s*/, "");
  s = s.replace(/(の)?(作り方|つくり方|レシピ)(です|でした)?[!！。♪~〜]*$/, "");
  s = s.replace(/[!！。、♪~〜…\s]+$/, "").trim();
  if (s.length > 30) s = s.split(/[。！!、]/)[0].slice(0, 30);
  return s;
}

const isTagline = (s) => /^[＼\\]|[／\/]$/.test(s.trim()) || /^[!！?？。、…\s]*$/.test(stripDeco(s));

/** SNSのキャプションなど、プレーンテキストからレシピを推測 */
export function parseRecipeText(text) {
  const lines = String(text).split(/\r?\n/).map(normalizeLine).map((l) => (SPACER.test(l) ? "" : l));
  let title = "";
  let servings = "";
  const titleCands = [];
  const ingredients = [];
  const steps = [];
  const memo = [];
  let mode = "none"; // none → ing → step → memo / after / done
  let groupMark = "";
  let numbered = false; // 作り方に番号が付いているか
  let blank = false;

  const findServings = (line) => line.match(/[0-9０-９]+(?:\s*[〜~\-]\s*[0-9０-９]+)?\s*(?:人分|人前|個分|皿分|台分|枚分|本分|杯分|合分)/)?.[0] ?? "";
  const pushIngredients = (line) => {
    const head = takeMark(line.replace(/^[・\-\*•·]+\s*/, ""));
    if (head.mark && !head.rest) { groupMark = head.mark; return; } // 「【A】」「A（合わせ調味料）」の見出し行
    for (const ing of splitIngredientLine(line)) ingredients.push(!ing.mark && groupMark ? { ...ing, mark: groupMark } : ing);
  };
  const pushStep = (line) => { steps.push(stripStepNumber(line)); };
  // 後ろに「作り方」の見出しがあるなら、材料の欄の行は（長くても）材料として扱う
  const stepHeadAt = lines.findIndex((l) => STEP_HEAD.test(stripDeco(l).replace(EMOJI, "").trim()));

  for (const [idx, line] of lines.entries()) {
    if (!line) { blank = true; if (mode === "ing") groupMark = ""; continue; }
    const wasBlank = blank;
    blank = false;
    const deco = stripDeco(line);
    const t = line.match(TITLE_HEAD);
    if (t) { if (!title) title = t[2].trim(); continue; }
    if (HASHTAGS.test(line)) continue;
    if (SEPARATOR_LINE.test(line)) { if (mode !== "none") mode = "after"; continue; }

    // 見出し
    if (isIngHead(deco)) {
      mode = "ing";
      servings ||= findServings(line);
      const rest = deco.replace(ING_HEAD, "").replace(/^[\s】\])）>＞》:：]+/, "").replace(/^[（(][^）)]*[）)]\s*/, "").trim();
      if (rest && !findServings(rest) && splitIngredientLine(rest).some((i) => i.amount)) pushIngredients(rest);
      else if (rest && rest.includes("、")) pushIngredients(rest);
      continue;
    }
    if (SUB_HEAD.test(deco) && (mode === "ing" || mode === "none")) { mode = "ing"; continue; }
    if (STEP_HEAD.test(deco.replace(EMOJI, "").trim())) { mode = "step"; continue; }
    if (MEMO_HEAD.test(deco.replace(EMOJI, "").trim()) && mode !== "none") { mode = "memo"; continue; }
    if (PROMO.test(line) && !STEP_NUM.test(line)) { if (mode === "step" || mode === "memo" || mode === "after") mode = "done"; continue; }
    if (mode === "done") continue;

    const isNum = STEP_NUM.test(line);
    if (mode === "none") {
      if (isNum && !ingredientLike(line)) { mode = "step"; numbered = true; pushStep(line); }
      else if (ingredientLike(line) || takeMark(line).mark && ingredientLike(takeMark(line).rest)) { mode = "ing"; pushIngredients(line); }
      else titleCands.push(line);
      continue;
    }
    if (mode === "ing") {
      if (isNum && !ingredientLike(line)) { mode = "step"; numbered = true; pushStep(line); continue; }
      if (ingredientLike(line) || /^[^\s。]{1,15}$/.test(line) || takeMark(line).mark) { pushIngredients(line); continue; }
      // 材料の途中に文章が来たら、番号のない作り方とみなす（後ろに「作り方」の見出しがある時は材料のまま。ただし紹介文はメモへ）
      if (!(stepHeadAt > idx) && (/[。！!]$/.test(line) || line.length > 20)) { mode = "step"; pushStep(line); continue; }
      if (isProse(line)) { memo.push(line); continue; }
      pushIngredients(line);
      continue;
    }
    if (mode === "step") {
      if (isNum) { numbered = true; pushStep(line); continue; }
      if (numbered && wasBlank) { mode = "after"; memo.push(line); continue; } // 番号付きの作り方のあとの空行＋文章は、作り方の外
      if (numbered && steps.length) { steps[steps.length - 1] += line; continue; } // 折り返し行は前の手順へ
      pushStep(line);
      continue;
    }
    if (mode === "memo" || mode === "after") { memo.push(line); continue; }
  }

  if (!title) {
    const ok = titleCands.filter((l) => !isTagline(l));
    const cand = ok.find((l) => { const c = cleanTitle(l); return c.length >= 2 && c.length <= 25 && !isProse(l) && !/(です|ます|でした|ました|よね|かな)[!！。♪〜~]*$/.test(c); }) ?? ok[0] ?? titleCands[0] ?? "";
    const quoted = titleCands.find((l) => /[「『【][^」』】]{2,30}[」』】]/.test(l) && !/^[【\[][^】\]]*[】\]]$/.test(l.trim()));
    title = cleanTitle(quoted ?? cand);
  }
  servings ||= lines.map(findServings).find(Boolean) ?? "";

  // 全部の材料の頭に同じ記号（●など）が付いているのは、印ではなくただの箇条書き
  const symbolMarks = ingredients.map((i) => i.mark).filter((m) => m && !/^[A-E]$/.test(m));
  if (ingredients.length >= 2 && symbolMarks.length === ingredients.length && new Set(symbolMarks).size === 1) {
    for (const i of ingredients) delete i.mark;
  }
  return { title, servings, ingredients, steps: steps.filter(Boolean), memo: memo.join("\n").trim() };
}
