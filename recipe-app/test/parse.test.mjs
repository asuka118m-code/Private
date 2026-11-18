import { describe, expect, it } from "vitest";
import { parseRecipeHtml, parseRecipeText, splitIngredient } from "../server/parse.mjs";

describe("splitIngredient", () => {
  it.each([
    ["玉ねぎ 1/2個", "玉ねぎ", "1/2個"],
    ["豚バラ肉……200g", "豚バラ肉", "200g"],
    ["・醤油 大さじ2", "醤油", "大さじ2"],
    ["塩 少々", "塩", "少々"],
    ["砂糖：小さじ1", "砂糖", "小さじ1"],
    ["卵2個", "卵", "2個"],
    ["サラダ油", "サラダ油", ""],
  ])("%s", (line, name, amount) => expect(splitIngredient(line)).toEqual({ name, amount }));
});

describe("parseRecipeText", () => {
  it("SNSキャプション風", () => {
    const r = parseRecipeText(`やみつき豚バラ大根🐷
【材料】2人分
・豚バラ 200g
・大根 1/3本
・醤油 大さじ2
【作り方】
1. 大根を切る
2. 豚バラを炒めて
大根を加える
3. 醤油で味付け
#簡単レシピ`);
    expect(r.title).toBe("やみつき豚バラ大根🐷");
    expect(r.servings).toBe("2人分");
    expect(r.ingredients).toEqual([
      { name: "豚バラ", amount: "200g" }, { name: "大根", amount: "1/3本" }, { name: "醤油", amount: "大さじ2" },
    ]);
    expect(r.steps).toEqual(["大根を切る", "豚バラを炒めて大根を加える", "醤油で味付け"]);
  });
});

describe("parseRecipeHtml", () => {
  it("JSON-LD Recipe", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, {
        "@type": "Recipe", name: "肉じゃが", recipeYield: "4人分", image: ["/img/a.jpg"],
        recipeIngredient: ["じゃがいも 3個", "牛肉 200g"],
        recipeInstructions: [{ "@type": "HowToSection", itemListElement: [{ "@type": "HowToStep", text: "1. 切る" }, { "@type": "HowToStep", text: "煮る" }] }],
      }],
    })}</script></head><body></body></html>`;
    const r = parseRecipeHtml(html, "https://example.com/r/1");
    expect(r).toMatchObject({
      found: true, title: "肉じゃが", servings: "4人分", imageUrl: "https://example.com/img/a.jpg",
      ingredients: [{ name: "じゃがいも", amount: "3個" }, { name: "牛肉", amount: "200g" }],
      steps: ["切る", "煮る"],
    });
  });
});
