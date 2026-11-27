// レシピを読みやすい文章にする（コピー用・AIが読む公開ページ用で共通）

/** @param {{title?:string, servings?:string, ingredients?:{name:string,amount:string,mark?:string}[], steps?:string[], memo?:string, sourceUrl?:string}} r */
export function recipeToText(r, { url = "" } = {}) {
  const out = [];
  out.push(r.title || "（無題）");
  if (r.servings) out.push(`（${r.servings}）`);
  const ings = r.ingredients ?? [];
  if (ings.length) {
    out.push("", "【材料】");
    for (const i of ings) out.push(`・${i.mark ? `${i.mark} ` : ""}${i.name}${i.amount ? `　${i.amount}` : ""}`);
  }
  const steps = r.steps ?? [];
  if (steps.length) {
    out.push("", "【作り方】");
    steps.forEach((s, k) => out.push(`${k + 1}. ${s}`));
  }
  if (r.memo?.trim()) out.push("", "【メモ】", r.memo.trim());
  if (r.sourceUrl) out.push("", `参考：${r.sourceUrl}`);
  if (url) out.push("", `あじめも：${url}`);
  return out.join("\n");
}
