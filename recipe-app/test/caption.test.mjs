// いろいろな書き方のSNSキャプションから、料理名・材料・作り方・メモを取り出せるか
import { describe, expect, it } from "vitest";
import { parseRecipeText, cleanTitle } from "../shared/textparse.mjs";

const names = (r) => r.ingredients.map((i) => i.name);

describe("キャプションの読み取り", () => {
  it("絵文字の見出し・前置き・宣伝・ハッシュタグ・☆の印・ポイント", () => {
    const r = parseRecipeText(`＼レンジで5分／
やみつき無限ピーマン🫑
食べ出したら止まらない！

📝材料（2人分）
ピーマン…4個
ツナ缶…1缶
☆鶏ガラスープの素…小さじ1
☆ごま油…大さじ1
☆塩こしょう…少々

📝作り方
①ピーマンを細切りにする
②耐熱ボウルに全部入れてレンジ600Wで3分
③よく混ぜて完成！

💡ポイント
ツナの油ごと入れるとコクが出ます

保存して作ってみてね🙌
他のレシピは @aji_kitchen から
#無限ピーマン #簡単レシピ #時短`);
    expect(r.title).toBe("やみつき無限ピーマン");
    expect(r.servings).toBe("2人分");
    expect(names(r)).toEqual(["ピーマン", "ツナ缶", "鶏ガラスープの素", "ごま油", "塩こしょう"]);
    expect(r.ingredients.filter((i) => i.mark === "☆")).toHaveLength(3);
    expect(r.steps).toEqual(["ピーマンを細切りにする", "耐熱ボウルに全部入れてレンジ600Wで3分", "よく混ぜて完成！"]);
    expect(r.memo).toBe("ツナの油ごと入れるとコクが出ます");
  });

  it("見出しなし：分量の付いた行を材料、番号の行を作り方と判断。【】の中が料理名", () => {
    const r = parseRecipeText(`今日の晩ごはんは【豚こま生姜焼き】🐷
タレが絶品です✨
豚こま切れ肉 250g
玉ねぎ 1/2個
醤油 大さじ2
みりん 大さじ2
生姜チューブ 3cm
1. 玉ねぎを薄切りにする
2. 豚肉を焼いて玉ねぎを加える
3. 調味料を入れて絡める
いいね・保存お願いします！
#生姜焼き`);
    expect(r.title).toBe("豚こま生姜焼き");
    expect(names(r)).toEqual(["豚こま切れ肉", "玉ねぎ", "醤油", "みりん", "生姜チューブ"]);
    expect(r.steps).toEqual(["玉ねぎを薄切りにする", "豚肉を焼いて玉ねぎを加える", "調味料を入れて絡める"]);
    expect(r.memo).toBe("");
  });

  it("【調味料】の小見出し・How to make・STEP・区切り線のあとの宣伝・｜の後ろ", () => {
    const r = parseRecipeText(`鶏むね肉のガリバタチキン｜節約レシピ
【材料】
鶏むね肉 1枚
片栗粉 大さじ1
【調味料】
醤油 大さじ1
みりん 大さじ1
にんにくチューブ 2cm
バター 10g
【How to make】
STEP1 鶏むね肉をそぎ切りにして片栗粉をまぶす
STEP2 フライパンで両面焼く
STEP3 調味料を入れて煮絡める
-----
詳しくはプロフィールのリンクから✔︎`);
    expect(r.title).toBe("鶏むね肉のガリバタチキン");
    expect(names(r)).toEqual(["鶏むね肉", "片栗粉", "醤油", "みりん", "にんにくチューブ", "バター"]);
    expect(r.steps).toEqual(["鶏むね肉をそぎ切りにして片栗粉をまぶす", "フライパンで両面焼く", "調味料を入れて煮絡める"]);
  });

  it("「材料：」の1行に読点区切り・番号のない作り方・「〜の作り方」", () => {
    const r = parseRecipeText(`春雨サラダの作り方🥗
材料：春雨40g、きゅうり1本、ハム4枚、酢大さじ2、砂糖大さじ1、醤油大さじ1
作り方
春雨を茹でて水気を切る。
きゅうりとハムを細切りにする。
全部を調味料で和える。

フォローしてね @xxx`);
    expect(r.title).toBe("春雨サラダ");
    expect(r.ingredients).toEqual([
      { name: "春雨", amount: "40g" }, { name: "きゅうり", amount: "1本" }, { name: "ハム", amount: "4枚" },
      { name: "酢", amount: "大さじ2" }, { name: "砂糖", amount: "大さじ1" }, { name: "醤油", amount: "大さじ1" },
    ]);
    expect(r.steps).toEqual(["春雨を茹でて水気を切る。", "きゅうりとハムを細切りにする。", "全部を調味料で和える。"]);
  });

  it("長い文章の中の「」が料理名・<材料>・「1 」の番号・台分", () => {
    const r = parseRecipeText(`旦那が大絶賛した「ほうれん草とベーコンのキッシュ」を作りました！パイシートで簡単です😊
<材料> 18cmタルト型1台分
冷凍パイシート 2枚
ほうれん草 1束
ベーコン 4枚
卵 2個
牛乳 100ml
<作り方>
1 パイシートを型に敷く
2 具材を炒める
3 卵液と具材を流して200℃で25分焼く`);
    expect(r.title).toBe("ほうれん草とベーコンのキッシュ");
    expect(r.servings).toBe("1台分");
    expect(names(r)).toEqual(["冷凍パイシート", "ほうれん草", "ベーコン", "卵", "牛乳"]);
    expect(r.steps).toHaveLength(3);
    expect(r.steps[2]).toBe("卵液と具材を流して200℃で25分焼く");
  });

  it("料理名の整え方", () => {
    expect(cleanTitle("【保存版】絶品！豚バラ大根🐷")).toBe("豚バラ大根");
    expect(cleanTitle("今日は親子丼を作りました！")).toBe("親子丼");
    expect(cleanTitle("✨簡単✨ 鮭のちゃんちゃん焼きレシピ")).toBe("鮭のちゃんちゃん焼き");
  });
});
