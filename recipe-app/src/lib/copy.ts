// 共有されたレシピを、自分のレシピとしてコピーする（コメント・作った記録は入れない）
import { newId, putImage, saveRecipe } from "./db";
import { loadSharedImage, type SharedRecipe } from "./share";

export async function copySharedRecipe(shared: SharedRecipe): Promise<string> {
  const r = shared.recipe;
  // 相手の写真（参考・作った写真）は、自分のレシピでは「参考にしたもの」として入れる
  const sourceImageIds: string[] = [];
  for (const id of [...r.sourceImageIds, ...r.photoIds]) {
    const blob = await loadSharedImage(shared.ownerId, id);
    if (blob) sourceImageIds.push(await putImage(blob));
  }
  const now = Date.now();
  const from = shared.ownerName ? `📖 ${shared.ownerName}さんのレシピから登録` : "📖 共有されたレシピから登録";
  const saved = await saveRecipe({
    id: newId(),
    title: r.title,
    servings: r.servings,
    // 相手のレシピ同士のつながり（ナムルなど）は、自分のレシピには無いので外す
    ingredients: r.ingredients.map(({ recipeId: _drop, ...i }) => i),
    steps: r.steps,
    sourceUrl: r.sourceUrl,
    sourceImageIds,
    photoIds: [],
    memo: [from, r.memo].filter(Boolean).join("\n"),
    comments: [],
    cookedDates: [],
    categoryIds: [],
    createdAt: now,
    updatedAt: now,
  });
  return saved.id;
}
