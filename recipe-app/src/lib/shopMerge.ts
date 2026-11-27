// 買い物リスト：同じ材料をまとめる（分量は同じ単位なら合計）
import { formatNumber, normalize } from "./scale";

export interface ShopIngredient { name: string; amount: string; mark?: string }
export interface ShopEntry {
  id: string;
  recipeId: string | null; // null = 手で追加したもの
  title: string;
  factor: number;
  ingredients: ShopIngredient[];
  addedBy?: string;
  createdAt?: number;
}
export interface ShopFlags { key: string; checked: boolean; pantry: boolean }
export interface ShopPart { entryId: string; recipeId: string | null; title: string; amount: string; note: string }
export interface ShopItem { key: string; name: string; total: string; parts: ShopPart[]; checked: boolean; pantry: boolean }

const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// 表記ゆれ（ひらがなにした形 → まとめる名前）
const SYNONYMS: Record<string, string> = {};
const group = (canon: string, ...forms: string[]) => [canon, ...forms].forEach((f) => (SYNONYMS[toHiragana(f)] = canon));
group("醤油", "しょうゆ", "しょう油", "濃口醤油", "こいくち醤油");
group("砂糖", "さとう", "上白糖");
group("塩", "しお", "食塩");
group("こしょう", "胡椒", "コショウ");
group("黒こしょう", "黒胡椒", "黒コショウ", "ブラックペッパー", "あらびき黒こしょう", "粗挽き黒胡椒", "粗びき黒こしょう");
group("塩こしょう", "塩胡椒", "塩コショウ");
group("にんにく", "ニンニク", "大蒜");
group("しょうが", "生姜", "ショウガ");
group("にんにくチューブ", "チューブにんにく", "おろしにんにく");
group("しょうがチューブ", "生姜チューブ", "チューブ生姜", "おろし生姜", "おろししょうが");
group("ごま油", "胡麻油", "ゴマ油");
group("酒", "料理酒", "日本酒");
group("みりん", "味醂", "本みりん");
group("酢", "米酢", "穀物酢");
group("片栗粉", "かたくり粉");
group("サラダ油", "サラダオイル");
group("オリーブオイル", "オリーブ油", "EXVオリーブオイル");
group("鶏ガラスープの素", "鶏がらスープの素", "鶏ガラスープのもと");
group("玉ねぎ", "たまねぎ", "タマネギ", "玉葱");
group("卵", "たまご", "玉子", "タマゴ");
group("バター", "有塩バター");

/** 材料名 → まとめる時のキー・表示名・カッコの説明 */
export function nameKey(raw: string): { key: string; name: string; note: string } {
  const name = String(raw).trim();
  const notes = [...name.matchAll(/[（(]([^）)]*)[）)]/g)].map((m) => m[1].trim()).filter(Boolean);
  const base = name.replace(/[（(][^）)]*[）)]/g, "").replace(/\s+/g, "").trim() || name;
  const h = toHiragana(base);
  const canon = SYNONYMS[h];
  return { key: canon ?? h, name: canon ?? base, note: notes.join("・") };
}

const NUM = "(\\d+(?:\\.\\d+)?\\s*と\\s*\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?)";
const PREFIX_UNIT = new RegExp(`^(大さじ|小さじ|カップ)\\s*${NUM}$`);
const SUFFIX_UNIT = new RegExp(`^約?\\s*${NUM}\\s*([^\\d\\s〜~\\-]*)$`);
function numValue(s: string) {
  const m = s.match(/(\d+(?:\.\d+)?)\s*と\s*(\d+)\s*\/\s*(\d+)/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  const f = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (f) return Number(f[1]) / Number(f[2]);
  return Number(s);
}

/** 「大さじ2」→ {unit:"大さじ", value:2, prefix:true}、「200g」→ {unit:"g", value:200}、足せないものは null */
export function parseQty(amount: string): { unit: string; value: number; prefix: boolean } | null {
  const s = normalize(String(amount).trim());
  let m = s.match(PREFIX_UNIT);
  if (m) return { unit: m[1], value: numValue(m[2]), prefix: true };
  m = s.match(SUFFIX_UNIT);
  if (m) return { unit: m[2], value: numValue(m[1]), prefix: false };
  return null;
}

/** 分量を合計する：同じ単位は足し算、違う単位は「＋」で並べる。少々・適量などは数字が無い時だけ出す */
export function sumAmounts(amounts: string[]): string {
  const sums = new Map<string, { value: number; prefix: boolean }>();
  const others: string[] = [];
  for (const a of amounts) {
    if (!a?.trim()) continue;
    const q = parseQty(a);
    if (!q) { if (!others.includes(a.trim())) others.push(a.trim()); continue; }
    const cur = sums.get(q.unit);
    sums.set(q.unit, { value: (cur?.value ?? 0) + q.value, prefix: q.prefix });
  }
  const parts = [...sums.entries()].map(([unit, { value, prefix }]) => (prefix ? `${unit}${formatNumber(value)}` : `${formatNumber(value)}${unit}`));
  // 「2〜3本」のような範囲は足せないので、そのまま足す
  const ranges = others.filter((o) => /\d/.test(o));
  const words = others.filter((o) => !/\d/.test(o));
  const all = [...parts, ...ranges];
  if (all.length) return all.join("＋");
  return words.join("・");
}

/** 料理ごとの材料を、材料ごとにまとめる（並びは最初に出てきた順） */
export function mergeShopping(entries: ShopEntry[], flags: ShopFlags[] = []): ShopItem[] {
  const byKey = new Map<string, ShopItem>();
  const flagMap = new Map(flags.map((f) => [f.key, f]));
  for (const e of entries) {
    for (const ing of e.ingredients) {
      if (!ing.name?.trim()) continue;
      const { key, name, note } = nameKey(ing.name);
      let item = byKey.get(key);
      if (!item) {
        const f = flagMap.get(key);
        item = { key, name, total: "", parts: [], checked: !!f?.checked, pantry: !!f?.pantry };
        byKey.set(key, item);
      }
      item.parts.push({ entryId: e.id, recipeId: e.recipeId, title: e.title || (e.addedBy ? `${e.addedBy}さんが追加` : "追加したもの"), amount: ing.amount, note });
    }
  }
  const items = [...byKey.values()];
  for (const it of items) it.total = sumAmounts(it.parts.map((p) => p.amount));
  return items;
}
