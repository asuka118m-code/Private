#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
hookscore.py - リールの「最初の一言（フック）」を5つの観点で採点し、
複数案を並べて順位をつける。日本語の話し言葉向け。

これは何か:  文字だけを見て、あなたのPCの中で計算する5つの目安。
  強いフックに共通しやすい性質を測る。
    長さ     … 3秒以内に言い切れる長さか（文字数で測る）
    具体性   … 数字・金額・固有名詞など、確かめられるものがあるか
    緊張感   … 損・失敗・否定など「見ないと何かを失う」要素があるか
    前出し   … 大事な言葉が頭のほうにあるか（前置きで始まっていないか）
    呼びかけ … 見ている「あなた」に向いているか

これは何ではないか:  再生数の予想ツールではない。
  元のスキル（英語版）の作者は、実在する短尺動画のフック74本で検証し、
  「わざと悪く書いたフック」を見分ける力はある（AUC 0.83）一方で、
  「同じ人のヒットと不発」を見分ける力はほぼない（AUC 0.56、0.50がコイン投げ）
  と報告している。この日本語版はその仕組みを日本語に作り直したもので、
  日本語のデータで同じ検証はしていない。
  あいさつ・前置き・具体性ゼロ・長すぎる一言を落とすのに使う。
  まともな2案のどちらが伸びるかは、顔・編集・音・誰に届くかで決まる。
  最後は自分のインサイト（視聴維持率のグラフ）を信じること。

各項目は0〜100点。高いほど良い。

使い方
  python3 hookscore.py hooks.txt              # 1行に1案。順位をつける
  python3 hookscore.py --hook "電気代そのまま払ってる人、正直かなり損してます"
  pbpaste | python3 hookscore.py -
  python3 hookscore.py hooks.txt --json

終了コード
  0 … いちばん良い案が70点以上
  1 … いちばん良い案でも70点未満（フックがまだ無い）
  2 … 入力エラー（ファイルが無い・中身が空など）

他のスキル（insta-buzz の swipe.py）が run(text) を読み込んで使う。
run() の戻り値 (results, overall, verdict, flags) の形は変えないこと。
"""

import argparse
import json
import re
import statistics
import sys
import unicodedata

# ---------------------------------------------------------------- 文字の判定

# 空白と句読点・記号。長音「ー」は「ダイソー」の一部なので含めない
SPACE_PUNCT_RE = re.compile(r"[\s、。，．,.!！?？「」『』（）()\[\]【】…‥・〜~―—:：;；\"'“”‘’/／]")

COUNTER = (r"(?:万|億|千)?\s*(?:円|%|％|パーセント|人|つ|個|選|本|回|倍|分|秒|時間|日|週間|週|"
           r"か月|ヶ月|カ月|ヵ月|年|歳|才|kg|キロ|件|位|割|枚|冊|ドル|フォロワー|再生|投稿)")
# 算用数字（全角も）。単位はあってもなくても1つと数える
DIGIT_NUM_RE = re.compile(r"[0-9０-９][0-9０-９,，.．]*\s*" + COUNTER + r"?")
# 漢数字は「単位つき」のときだけ数える（「一番」「一緒」を拾わないため）
KANJI_NUM_RE = re.compile(r"(?<![一二三四五六七八九十百千])(?!十分)[一二三四五六七八九十百千]+\s*" + COUNTER)
SPOKEN_NUM_RE = re.compile(r"ゼロ|半分|半年|倍に|数万|数十万|百万")
MONEY_WORDS = ["年収", "月収", "時給", "貯金", "家賃", "給料", "手取り", "副収入", "売上", "売り上げ",
               "収入", "電気代", "固定費", "税金", "ポイント還元"]
LATIN_RE = re.compile(r"[A-Za-zＡ-Ｚａ-ｚ][A-Za-z0-9Ａ-Ｚａ-ｚ０-９+.]+")
KATAKANA_RE = re.compile(r"[ァ-ヴー]{3,}")
# 具体的とは言えないカタカナ語（抽象語・一般語）
GENERIC_KATAKANA = {
    "コンテンツ", "アルゴリズム", "エンゲージメント", "ポイント", "メリット", "デメリット",
    "ノウハウ", "スキル", "マインド", "モチベーション", "ストレス", "イメージ", "タイプ",
    "パターン", "レベル", "チャンス", "テクニック", "アプローチ", "ソリューション", "クオリティ",
    "バランス", "プロセス", "システム", "サービス", "コミュニケーション", "ライフスタイル",
    "ステップ", "ルール", "ジャンル", "テーマ", "アカウント", "ユーザー", "フォロワー", "ファン",
    "ビジネス", "ブランド", "マーケティング", "ターゲット", "コツ", "ワード", "テキスト",
    "ストーリー", "メッセージ", "コメント", "フォロー", "シェア", "チェック", "スタート",
    "ゴール", "トレンド", "リサーチ", "アイデア", "アイディア", "インパクト", "クリエイター",
    "インフルエンサー", "ライフ", "スタイル", "グッズ", "アイテム", "ツール", "アプリ",
}

# 緊張感（見ないと何かを失う・常識が揺らぐ）の目印
STAKES = [
    "損", "失敗", "ミス", "間違", "やめ", "ダメ", "だめ", "NG", "危", "注意", "後悔", "無駄", "ムダ",
    "知らない", "誰も", "本当は", "ほんとは", "実は", "嘘", "ウソ", "秘密", "裏", "削除", "凍結",
    "稼", "節約", "無料", "タダ", "0円", "最悪", "絶対", "正直", "ぶっちゃけ", "だけ", "しか",
    "なのに", "のに", "じゃなくて", "ではなく", "前に", "いらない", "いりません", "必要ない",
    "意味ない", "逆効果", "炎上", "手遅れ", "知ってた", "多すぎ", "上位", "最強", "いちばん",
    "一番", "辞め", "解約", "払って", "払い", "お願い", "しないで", "結果", "本音", "暴露",
    "隠", "罠", "落とし穴", "勘違い", "怖", "ヤバ", "やば", "溶か", "失っ", "取られ",
    # 「前と今」の落差（英語版の before / until / instead / already / still に当たる）
    "今は", "たった", "わずか", "前は", "今まで", "かかってた", "止まって", "変わっ", "初めて",
    "最初", "もう", "まだ", "代わりに", "かわりに",
]

# 最初の1秒を何も言わずに使ってしまう出だし
WEAK_OPENERS = [
    "えー", "えっと", "えーと", "あのー", "あの", "はいどうも", "はーい", "はい", "どうも",
    "こんにちは", "こんばんは", "おはよう", "みなさん", "皆さん", "今日は", "今回は", "本日は",
    "さて", "それでは", "では", "じゃあ", "というわけで", "ということで", "まず", "ちなみに",
]

# 前に置く価値のある命令形
IMPERATIVE_RE = re.compile(r"(?:見て|みて|やめて|保存して|試して|やって|使って|パクって|知って|"
                           r"聞いて|止めて|しないで|ください|下さい|してね|して)(?:ください|ね|！|!)?\s*$")

HASHTAG_RE = re.compile(r"[#＃][^\s#＃、。]+")
EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF☀-➿]")

DEALBREAKERS = [
    (re.compile(r"^\s*(?:はいどうも|どうも[ー〜、,\s]|どうもこんにちは|こんにちは|こんばんは|おはようございます|おはよう|"
                r"はーい|ハロー|やっほー|みなさん(?:こんにちは|こんばんは)|皆さん(?:こんにちは|こんばんは))"),
     "あいさつから始まっている。フィードを見ている人は、あいさつを聞きに来ていない。"),
    (re.compile(r"^\s*(?:どうも)?[^\s。、!！?？]{1,15}です[。！!、,\s]*(?:今日は|今回は|本日は)"),
     "名乗りから始まっている（「どうも〇〇です」）。名前はプロフィールで伝わる。"),
    (re.compile(r"(?:今回の|この|今日の)(?:動画|リール|投稿)(?:では|は)|"
                r"(?:今日は|今回は|本日は)[^。！？!?]{0,25}(?:について|を)(?:話|お話|紹介|ご紹介|解説|説明)|"
                r"(?:紹介|解説|お話し?|説明)(?:して)?(?:いきます|いきたいと思います|したいと思います)"),
     "動画の前置き（「今回の動画では〜」「今日は〜について話します」）。消して、答えから始める。"),
    (re.compile(r"^[^。！？!?]{0,15}最後まで(?:見て|みて|ご覧|観て)"),
     "冒頭で「最後まで見てね」と頼んでいる。見てもらう理由を言う前にお願いすると、逆に離れる。"),
    (re.compile(r"スクロール(?:を)?(?:止めて|ストップ|しないで|する手を止めて)|指を止めて"),
     "「スクロール止めて」系。注意を頼むのは、まだ注意を引けていない証拠。"),
    (HASHTAG_RE,
     "フックにハッシュタグが入っている。ハッシュタグはキャプションの最後に置くもの。"),
    (EMOJI_RE,
     "フックに絵文字が入っている。フックの大きさのテロップには、言葉か絵文字のどちらかしか入らない。"),
]

LABELS = {
    "LENGTH": "長さ",
    "SPECIFICITY": "具体性",
    "STAKES": "緊張感",
    "FRONTLOAD": "前出し",
    "ADDRESS": "呼びかけ",
}
VERDICT_JA = {"STRONG": "強い", "OK": "まずまず", "WEAK": "弱い"}
CHECKS = ["LENGTH", "SPECIFICITY", "STAKES", "FRONTLOAD", "ADDRESS"]


def clamp(n):
    return max(0.0, min(100.0, n))


def nfkc(text):
    return unicodedata.normalize("NFKC", text)


def speak_len(text):
    """話す文字数のめやす。空白と句読点・記号は数えない。"""
    return len(SPACE_PUNCT_RE.sub("", text))


def concrete_markers(text):
    """具体的なもの（数字・漢数字＋単位・お金の言葉・英字の名前・カタカナ固有名詞）を拾う。"""
    t = nfkc(text)
    found = []
    nums = [m.group(0).strip() for m in DIGIT_NUM_RE.finditer(t) if m.group(0).strip()]
    found += nums
    found += [m.group(0) for m in KANJI_NUM_RE.finditer(t)]
    found += SPOKEN_NUM_RE.findall(t)
    found += [w for w in MONEY_WORDS if w in t]
    found += sorted(set(LATIN_RE.findall(t)))
    kata = [k for k in KATAKANA_RE.findall(t) if k not in GENERIC_KATAKANA]
    found += sorted(set(kata))
    return found


def first_marker_pos(text):
    """大事な言葉（数字・緊張感・固有名詞）が最初に出る位置（空白・記号を除いた文字数）。"""
    t = SPACE_PUNCT_RE.sub("", nfkc(text))
    best = None
    for rx in (DIGIT_NUM_RE, KANJI_NUM_RE, SPOKEN_NUM_RE, LATIN_RE):
        m = rx.search(t)
        if m and (best is None or m.start() < best):
            best = m.start()
    for m in KATAKANA_RE.finditer(t):
        if m.group(0) not in GENERIC_KATAKANA:
            if best is None or m.start() < best:
                best = m.start()
            break
    for w in STAKES + MONEY_WORDS:
        i = t.find(w)
        if i >= 0 and (best is None or i < best):
            best = i
    return best


def check_length(text):
    """スクロールする指が動く前に言い切れるか。目安は2〜3秒。"""
    n = speak_len(text)
    secs = n / 7.5                      # 話し言葉の目安 約7.5文字/秒
    if 8 <= n <= 25:
        score = 100.0
    elif n < 8:
        score = clamp(100 - (8 - n) * 12)
    else:
        score = clamp(100 - (n - 25) * 4)
    if n > 32:                           # 大きなテロップで2行を超える
        score -= 12
    return clamp(score), f"{n}文字、話すと約{secs:.1f}秒（目安は8〜25文字）"


def check_specificity(text):
    """抽象的な3つより、具体的な1つ。"""
    found = concrete_markers(text)
    hits = len(found)
    score = 15.0 if hits == 0 else clamp(45 + hits * 30)
    detail = f"具体的なもの{hits}個"
    detail += f"：{', '.join(found[:4])}" if found else "：数字も名前もない。確かめられるものが何もない"
    return score, detail


def check_stakes(text):
    """損・失敗・否定・意外性。見ないと何かを失う感じ。"""
    t = nfkc(text)
    markers = sorted({w for w in STAKES if w in t})
    if re.search(r"\d[\d,]*\s*(?:万|千)?\s*円", t):
        markers.append("金額")
    n = len(markers)
    score = {0: 20.0, 1: 70.0}.get(n, 100.0)
    detail = f"緊張感の目印{n}個" + (f"：{', '.join(markers[:4])}" if markers else
                                    "：この一言では何も懸かっていない")
    return clamp(score), detail


def check_frontload(text):
    """大事な言葉が後ろに埋もれていないか。"""
    t = SPACE_PUNCT_RE.sub("", nfkc(text))
    if not t:
        return 0.0, "空です"
    penalty, hit_opener = 0, None
    for weak in WEAK_OPENERS:
        if t.startswith(weak):
            penalty, hit_opener = 30, weak
            break
    pos = first_marker_pos(text)
    if pos is None:
        base, where = 30.0, "大事な言葉が一つもない"
    elif pos <= 6:
        base, where = 100.0, f"大事な言葉が{pos + 1}文字目に出る"
    elif pos <= 12:
        base, where = 70.0, f"大事な言葉が{pos + 1}文字目。もう少し前に出せる"
    else:
        base, where = 40.0, f"大事な言葉が{pos + 1}文字目。遅すぎる"
    detail = where + (f"。出だしが「{hit_opener}」で弱い" if hit_opener else "")
    return clamp(base - penalty), detail


def check_address(text):
    """見ている一人に向いているか、宙に浮いているか。"""
    t = nfkc(text).strip()
    if re.search(r"あなた|アナタ|きみ|君(?!た)|(?:てる|ている|な|の|たい|ない|する|した)(?:人|方(?!法|向|面|針))|みんな|全員|お前", t):
        return 100.0, "見ている人に向けて話している"
    if re.search(r"(?:知ってた|知ってる|どう思う|ない|てる|ます|でしょ|よね)[？?]\s*$|って知ってた", t):
        return 90.0, "見ている人への問いかけ"
    if IMPERATIVE_RE.search(t) or re.match(r"^\s*(?:見て|やめて|保存して|試して|ねぇ|ねえ|ちょっと)", t):
        return 90.0, "命令形・呼びかけで始まる／終わる"
    if re.search(r"私|僕|俺|わたし|ぼく|自分|うち|我が家", t):
        return 70.0, "一人称だけで、見ている人が出てこない"
    if re.search(r"(?:です|ます|ました|ません|でした)(?:よ|ね)?[。！!]?\s*$|(?:です|ます)[、。]", t):
        # 日本語は主語を省くのがふつう。丁寧語は聞き手に向けた話し方なので、一人称と同じ扱い
        return 70.0, "丁寧語で話しているが、見ている人が出てこない（主語なし）"
    return 35.0, "三人称だけで、誰にも話しかけていない"


def run(text):
    results = {
        "LENGTH": check_length(text),
        "SPECIFICITY": check_specificity(text),
        "STAKES": check_stakes(text),
        "FRONTLOAD": check_frontload(text),
        "ADDRESS": check_address(text),
    }
    flags = [msg for pattern, msg in DEALBREAKERS if pattern.search(text)]
    scores = [results[c][0] for c in CHECKS]
    # いちばん弱い項目が全体の上限になる。弱点が1つあれば指は止まらない。
    overall = statistics.mean(scores) * 0.6 + min(scores) * 0.4 - len(flags) * 15
    overall = clamp(overall)
    verdict = "STRONG" if overall >= 70 and min(scores) >= 55 and not flags else (
        "OK" if overall >= 50 else "WEAK")
    return results, overall, verdict, flags


def bar(score, width=24):
    filled = int(round(score / 100.0 * width))
    return "#" * filled + "." * (width - filled)


def dwidth(s):
    return sum(2 if unicodedata.east_asian_width(c) in ("W", "F") else 1 for c in s)


def pad(s, width):
    return s + " " * max(0, width - dwidth(s))


def cut(s, width):
    out, w = "", 0
    for c in s:
        cw = 2 if unicodedata.east_asian_width(c) in ("W", "F") else 1
        if w + cw > width - 3:
            return out + "..."
        out += c
        w += cw
    return out


def render_one(text, results, overall, verdict, flags, out=sys.stdout):
    print("\nフック採点", file=out)
    print("=" * 62, file=out)
    print(f"  「{text.strip()}」\n", file=out)
    for name in CHECKS:
        score, detail = results[name]
        print(f"  {pad(LABELS[name], 10)} {bar(score)} {score:5.1f}", file=out)
        print(f"  {pad('', 10)} {detail}", file=out)
    print("-" * 62, file=out)
    print(f"  {pad('合計', 10)} {bar(overall)} {overall:5.1f}   {VERDICT_JA[verdict]}（{verdict}）",
          file=out)
    for f in flags:
        print(f"\n  致命的  {f}", file=out)
    if verdict != "STRONG":
        weakest = min(CHECKS, key=lambda c: results[c][0])
        print(f"\n  いちばん弱い項目：{LABELS[weakest]}。ここを直して、もう一度採点する。", file=out)
    print("\n  ※ 文字だけを見た目安です。再生数の予想ではありません。", file=out)
    print("", file=out)


def render_table(rows, out=sys.stdout):
    print("\nフックの順位\n" + "=" * 78, file=out)
    for i, r in enumerate(rows, 1):
        mark = "->" if i == 1 else "  "
        print(f"{mark} {r['score']:5.1f} {pad(VERDICT_JA[r['verdict']], 8)} {cut(r['hook'], 60)}",
              file=out)
        w = r["weakest"]
        print(f"        いちばん弱い項目：{LABELS[w]}（{r['checks'][w]['score']:.0f}）", file=out)
        for f in r["flags"]:
            print(f"        致命的：{f}", file=out)
    print("\n1位で撮る。1位が50点未満なら、この中にはまだフックがない。", file=out)
    print("※ 文字だけを見た目安です。最後は自分のインサイト（視聴維持率）を信じてください。\n",
          file=out)


def read_input(path):
    try:
        if path == "-":
            return sys.stdin.read()
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except FileNotFoundError:
        print(f"エラー：ファイルが見つかりません：{path}", file=sys.stderr)
        sys.exit(2)
    except UnicodeDecodeError:
        print(f"エラー：UTF-8で読めないファイルです：{path}", file=sys.stderr)
        sys.exit(2)
    except OSError as e:
        print(f"エラー：ファイルを読めません：{path}（{e}）", file=sys.stderr)
        sys.exit(2)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="リールのフック（最初の一言）を5つの観点で採点する。")
    ap.add_argument("input", nargs="?", default="-", help="1行に1案を書いたファイル。- なら標準入力")
    ap.add_argument("--hook", help="1案だけをその場で採点する")
    ap.add_argument("--json", action="store_true", help="結果をJSONで出す")
    args = ap.parse_args()

    if args.hook is not None:
        lines = [args.hook.strip()] if args.hook.strip() else []
    else:
        raw = read_input(args.input)
        lines = [l.strip() for l in raw.splitlines() if l.strip()]
    if not lines:
        print("エラー：採点するフックがありません（入力が空です）", file=sys.stderr)
        sys.exit(2)

    payload = []
    for line in lines:
        results, overall, verdict, flags = run(line)
        payload.append({
            "hook": line,
            "checks": {k: {"label": LABELS[k], "score": round(v[0], 1), "detail": v[1]}
                       for k, v in results.items()},
            "weakest": min(CHECKS, key=lambda c: results[c][0]),
            "flags": flags,
            "score": round(overall, 1),
            "verdict": verdict,
        })

    if args.json:
        print(json.dumps(payload if len(payload) > 1 else payload[0], indent=2, ensure_ascii=False))
    elif len(payload) == 1:
        results, overall, verdict, flags = run(lines[0])
        render_one(lines[0], results, overall, verdict, flags)
    else:
        render_table(sorted(payload, key=lambda r: -r["score"]))

    sys.exit(0 if max(p["score"] for p in payload) >= 70 else 1)


if __name__ == "__main__":
    main()
