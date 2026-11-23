// 分量の計算（人数や材料の量に合わせて、文字列の中の数字だけを掛け算する）

const FULL = "０１２３４５６７８９";
const UNICODE_FRACTIONS: Record<string, string> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3" };

/** 全角数字・全角スラッシュ・½などを、計算しやすい形にそろえる */
export function normalize(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String(FULL.indexOf(c)))
    .replace(/[／]/g, "/")
    .replace(/[．]/g, ".")
    .replace(/(\d)?([½¼¾⅓⅔])/g, (_, d, f) => (d ? `${d}と${UNICODE_FRACTIONS[f]}` : UNICODE_FRACTIONS[f]));
}

// 「1と1/2」「1/2」「1.5」「2」
const NUM = /(\d+(?:\.\d+)?)\s*と\s*(\d+)\s*\/\s*(\d+)|(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?)/g;

function tokenValue(m: RegExpExecArray): number {
  if (m[1] !== undefined) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  if (m[4] !== undefined) return Number(m[4]) / Number(m[5]);
  return Number(m[6]);
}

/** 文字列の最初の数値（例：「大さじ1と1/2」→1.5、「2人分」→2、「少々」→null） */
export function firstNumber(s: string): number | null {
  NUM.lastIndex = 0;
  const m = NUM.exec(normalize(s));
  if (!m) return null;
  const v = tokenValue(m);
  return Number.isFinite(v) && v > 0 ? v : null;
}

const NICE_FRACTIONS: [number, string][] = [[1 / 4, "1/4"], [1 / 3, "1/3"], [1 / 2, "1/2"], [2 / 3, "2/3"], [3 / 4, "3/4"]];

/** 数値を料理で使いやすい表記にする（1.5→「1と1/2」、0.333→「1/3」、187.5→「188」） */
export function formatNumber(v: number): string {
  if (v >= 10) return String(Math.round(v));
  const whole = Math.floor(v);
  const frac = v - whole;
  if (frac < 0.05) return String(whole || Math.round(v * 100) / 100);
  if (frac > 0.95) return String(whole + 1);
  for (const [f, label] of NICE_FRACTIONS) {
    if (Math.abs(frac - f) < 0.04) return whole ? `${whole}と${label}` : label;
  }
  return String(Math.round(v * 10) / 10);
}

/** 分量の文字列の中の数字をすべて factor 倍する。数字が無い（少々・適量など）場合はそのまま */
export function scaleAmount(amount: string, factor: number): string {
  if (factor === 1 || !amount) return amount;
  const s = normalize(amount);
  if (!/\d/.test(s)) return amount;
  return s.replace(NUM, (...args) => {
    const m = args.slice(0, 7) as unknown as RegExpExecArray;
    return formatNumber(tokenValue(m) * factor);
  });
}

/** 数字を含む（＝計算できる）分量か */
export const isScalable = (amount: string) => firstNumber(amount) !== null;
