import { describe, expect, it } from "vitest";
import { parseRecipeHtml, parseRecipeText, parseRecipesText, splitIngredient } from "../server/parse.mjs";

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

describe("parseRecipesText（一括登録）", () => {
  it("レシピ名：で区切る", () => {
    const r = parseRecipesText(`レシピ名：肉じゃが
材料（4人分）
じゃがいも 3個
牛肉 200g
作り方
1. 切る
2. 煮る

レシピ名：卵スープ
材料
卵 2個
作り方
1. 沸かす
2. 卵を入れる`);
    expect(r.map((x) => x.title)).toEqual(["肉じゃが", "卵スープ"]);
    expect(r[0].servings).toBe("4人分");
    expect(r[0].ingredients).toHaveLength(2);
    expect(r[1].steps).toEqual(["沸かす", "卵を入れる"]);
  });

  it("見出しなし・タイトル行だけで続けて書いても分かれる", () => {
    const r = parseRecipesText(`【肉じゃが】
【材料】
じゃがいも 3個
【作り方】
1. 煮る
きんぴら
【材料】
ごぼう 1本
【作り方】
1. 炒める`);
    expect(r.map((x) => x.title)).toEqual(["肉じゃが", "きんぴら"]);
    expect(r[0].steps).toEqual(["煮る"]);
  });

  it("区切り線で分ける・1件だけでも動く", () => {
    expect(parseRecipesText("A\n材料\n塩 少々\n---\nB\n材料\n砂糖 1g").map((x) => x.title)).toEqual(["A", "B"]);
    expect(parseRecipesText("カレー\n材料\n玉ねぎ 1個\n作り方\n1. 炒める")).toHaveLength(1);
  });
});

describe("材料の印（A・B・★など）", () => {
  it.each([
    ["A 醤油 大さじ2", { mark: "A", name: "醤油", amount: "大さじ2" }],
    ["(A)みりん 大さじ1", { mark: "A", name: "みりん", amount: "大さじ1" }],
    ["【B】酢 大さじ1", { mark: "B", name: "酢", amount: "大さじ1" }],
    ["Ａ砂糖 小さじ1", { mark: "A", name: "砂糖", amount: "小さじ1" }],
    ["★片栗粉 小さじ1", { mark: "★", name: "片栗粉", amount: "小さじ1" }],
    ["・塩 少々", { name: "塩", amount: "少々" }],
    ["Lサイズの卵 2個", { name: "Lサイズの卵", amount: "2個" }],
  ])("%s", (line, want) => expect(splitIngredient(line)).toEqual(want));

  it("見出しでまとめた書き方・箇条書きの●は印にしない", () => {
    const r = parseRecipeText(`照り焼き
材料
鶏もも肉 1枚
A（合わせ調味料）
醤油 大さじ2
みりん 大さじ2

サラダ油 小さじ1
★片栗粉 小さじ1
作り方
1. Aを混ぜておく`);
    expect(r.ingredients).toEqual([
      { name: "鶏もも肉", amount: "1枚" },
      { name: "醤油", amount: "大さじ2", mark: "A" },
      { name: "みりん", amount: "大さじ2", mark: "A" },
      { name: "サラダ油", amount: "小さじ1" },
      { name: "片栗粉", amount: "小さじ1", mark: "★" },
    ]);
    const b = parseRecipeText("サラダ\n材料\n●レタス 1/2玉\n●トマト 1個\n作り方\n1. 切る");
    expect(b.ingredients).toEqual([{ name: "レタス", amount: "1/2玉" }, { name: "トマト", amount: "1個" }]);
  });
});
