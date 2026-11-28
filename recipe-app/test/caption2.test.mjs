import { describe, it, expect } from "vitest";
import { parseRecipeText } from "../shared/textparse.mjs";
import { snsCaption } from "../server/parse.mjs";
import { instagramEmbedCaption, snsTitle, youtubeDescription } from "../server/sns.mjs";

describe("インスタのキャプション（精度改善）", () => {
  it("紹介文・「材料3つで」・1️⃣の番号・「.」の行", () => {
    const r = parseRecipeText(`＼材料3つで簡単！／
.
今日はご飯が止まらないおかずを紹介します。
寒い日にぴったりで、家族にも大好評でした！
材料3つでできるので、ぜひ作ってみてくださいね。
.
やみつき豚バラ大根
.
【材料】2人分
豚バラ肉 200g
大根 1/3本
.
A 醤油 大さじ2
A みりん 大さじ2
.
【作り方】
1️⃣大根は1cm幅のいちょう切りにする。
2️⃣フライパンで豚バラを炒め、大根を加える。
3️⃣Aを入れて10分煮る。
.
保存していつでも見返してね！
#豚バラ大根 #簡単レシピ`);
    expect(r.title).toBe("やみつき豚バラ大根");
    expect(r.servings).toBe("2人分");
    expect(r.ingredients.map((i) => i.name)).toEqual(["豚バラ肉", "大根", "醤油", "みりん"]);
    expect(r.steps).toEqual(["大根は1cm幅のいちょう切りにする。", "フライパンで豚バラを炒め、大根を加える。", "Aを入れて10分煮る。"]);
  });

  it("「〜をご紹介」から料理名・(1)の番号・作り方(2人分)↓", () => {
    const r = parseRecipeText(`今回は鶏むね肉のねぎ塩焼きをご紹介します🙌
パサつかずしっとり仕上がります！

材料（2人分）
鶏むね肉 1枚
長ねぎ 1/2本
塩 小さじ1/2

作り方は以下↓
(1) 鶏むね肉をそぎ切りにする
(2) ねぎをみじん切りにして塩と混ぜる
(3) 焼いてねぎ塩をのせる`);
    expect(r.title).toBe("鶏むね肉のねぎ塩焼き");
    expect(r.ingredients).toHaveLength(3);
    expect(r.steps).toHaveLength(3);
    expect(r.steps[0]).toBe("鶏むね肉をそぎ切りにする");
  });

  it("材料見出しのあとに紹介文が挟まってもメモへ", () => {
    const r = parseRecipeText(`ふわとろ親子丼
【材料】1人分
冷蔵庫にあるもので作れるので、ぜひ試してみてくださいね！
鶏もも肉 100g
卵 2個
【作り方】
1. 鶏肉を煮る
2. 卵でとじる`);
    expect(r.ingredients.map((i) => i.name)).toEqual(["鶏もも肉", "卵"]);
    expect(r.steps).toHaveLength(2);
  });

  it("説明文の前置き（切れていても）を外す", () => {
    expect(snsCaption(`いいね！1,234件、コメント56件 - 料理家ゆか (@yuka_cook)、2026年3月1日: "やみつき豚バラ大根
【材料】2人分…`)).toMatch(/^やみつき豚バラ大根/);
    expect(snsCaption(`1,234 likes, 56 comments - yuka_cook on March 1, 2026: "やみつき豚バラ大根". `)).toBe("やみつき豚バラ大根");
  });

  it("ページの題名から投稿者名を外す", () => {
    expect(snsTitle(`料理家ゆか on Instagram: "やみつき豚バラ大根 #簡単"`)).toBe("やみつき豚バラ大根 #簡単");
    expect(snsTitle(`料理家ゆか (@yuka_cook) • Instagram photos and videos`)).toBe("");
    expect(snsTitle(`やみつき豚バラ大根 | TikTok`)).toBe("やみつき豚バラ大根");
  });

  it("インスタ埋め込み表示・YouTube概要欄から全文を取る", () => {
    const html = `<div class="Caption"><a class="CaptionUsername" href="#">yuka_cook</a><br/><br/>やみつき豚バラ大根<br/>【材料】2人分<br/>豚バラ肉 200g<div class="CaptionComments">コメント</div></div>`;
    expect(instagramEmbedCaption(html)).toBe("やみつき豚バラ大根\n【材料】2人分\n豚バラ肉 200g");
    expect(youtubeDescription(`..."shortDescription":"親子丼\\n材料\\n卵 2個","isCrawlable"...`)).toBe("親子丼\n材料\n卵 2個");
  });
});

describe("材料だけの投稿（おにぎり）", () => {
  it("▷の箇条書き・飾り線・作り方なし", () => {
    const r = parseRecipeText(`忙しい朝の味方になる冷凍おにぎり🍙
味噌バターおにぎり

材料——————————*☼*

▷ご飯…1合
▷味噌…大さじ1/2
▷バター…5g
▷鮭フレーク…大さじ２
▷焼き海苔…全形１枚
▷醤油…小さじ１

*☼*—————*☼*—————*☼*

#おにぎり #味噌 #バター #鮭
︵︵︵︵︵︵︵︵︵︵︵︵︵︵。⁂.ꕤ。◌⁘".`);
    expect(r.ingredients.map((i) => i.name)).toEqual(["ご飯", "味噌", "バター", "鮭フレーク", "焼き海苔", "醤油"]);
    expect(r.ingredients[0].amount).toBe("1合");
    expect(r.steps).toEqual([]);
    expect(r.memo).toBe("");
  });
});
