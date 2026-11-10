#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
detect.py - 下書きがどれくらい「機械が書いたっぽく」見えるかを、5つの目安で採点する。日本語向け。

これは何か:  公開されているAI判定ツールが見ているのと同じ種類の手がかりをまねた、
  5つの目安（ヒューリスティック＝経験則による簡易判定）。
    文の長さのばらつき … 人は長い文と短い文を混ぜる。機械は長さをそろえがち
    具体性             … 数字・固有名詞など、確かめられるものが100文字あたり何個あるか
    言い回し密度       … slop.json のAIっぽい言い回しが100文字あたり何個あるか
    文字の指紋         … 見えない文字・ダッシュ・曲がった引用符・全角半角の混在
    話し方             … 話し言葉の語尾、一人称・二人称、文の形のクセ、同じ語尾の連続
  すべてあなたのPCの中で、文章だけから計算する。どこにも送らない。

これは何ではないか:  GPTZero、Originality、Copyleaks、Winston、Turnitin などではない。
  それらのサービスを呼び出さないし、その判定結果を約束できない。
  同じ種類の手がかりを見ているので、ここを直すとそちらの数字も動きやすい。言えるのはそこまで。
  「AI判定にバレない」とは言えないし、言わない。

各項目は0〜100点の「人間らしさ」。高いほど良い。

使い方
  python3 detect.py draft.txt
  pbpaste | python3 detect.py -
  python3 detect.py draft.txt --json
  python3 detect.py before.txt after.txt      # 2つの下書きを比べる

終了コード
  0 … （比べるときは後ろの）判定が「合格（PASS）」
  1 … 「要確認（REVIEW）」または「AIっぽい（FLAGGED）」
  2 … 入力エラー（ファイルが無い・中身が空・辞書が読めないなど）
"""

import argparse
import json
import os
import re
import statistics
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
LEX = os.path.join(HERE, "slop.json")
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True   # スキルのフォルダに __pycache__ を作らない
from humanize import (char_len, compile_entry, die, ending_flags, entry_label,  # noqa: E402
                      lexicon_entries, load_lexicon, read_input, split_sentences,
                      width_mix_counts)

COUNTER = (r"(?:万|億|千)?\s*(?:円|%|％|パーセント|人|つ|個|選|本|回|倍|分|秒|時間|日|週間|週|"
           r"か月|ヶ月|カ月|ヵ月|年|歳|才|kg|キロ|件|位|割|枚|冊|ドル|フォロワー|再生|投稿)")
DIGIT_NUM_RE = re.compile(r"[0-9][0-9,.]*\s*" + COUNTER + r"?")
KANJI_NUM_RE = re.compile(r"(?<![一二三四五六七八九十百千])(?!十分)[一二三四五六七八九十百千]+\s*" + COUNTER)
LATIN_RE = re.compile(r"(?<![#@A-Za-z0-9])[A-Za-z][A-Za-z0-9+.]+")
KATAKANA_RE = re.compile(r"[ァ-ヴー]{3,}")
GENERIC_KATAKANA = {
    "コンテンツ", "アルゴリズム", "エンゲージメント", "ポイント", "メリット", "デメリット",
    "ノウハウ", "スキル", "マインド", "モチベーション", "ストレス", "イメージ", "タイプ",
    "パターン", "レベル", "チャンス", "テクニック", "アプローチ", "クオリティ", "バランス",
    "プロセス", "システム", "サービス", "ステップ", "ルール", "ジャンル", "テーマ",
    "アカウント", "ユーザー", "フォロワー", "ファン", "ビジネス", "コツ", "コメント",
    "フォロー", "シェア", "チェック", "スタート", "ゴール", "トレンド", "アイデア", "ツール",
    "アプリ", "グッズ", "アイテム", "ストーリー", "メッセージ", "ソリューション", "シームレス",
    "ライフスタイル", "コミュニケーション", "マーケティング", "インフルエンサー", "クリエイター",
}
HASHTAG_RE = re.compile(r"[#＃][^\s#＃]+")
# 話し言葉らしい文末・言い回し
COLLOQUIAL_RE = re.compile(
    r"よね|よな|かな[。！？!?\s]|かも|じゃん|けど|だよ|んだ|んです|んだよ|ちゃう|ちゃった|ちゃって|"
    r"てる|ってる|でる|なぁ|なー|ですよ[。！!\s]|ますよ[。！!\s]|でした[！!]|ね[。！!？?\n]|よ[。！!\n]|"
    r"笑|w[。\n]|マジ|めっちゃ|ほんと|ぶっちゃけ|正直")
PERSON_RE = re.compile(r"私|僕|俺|わたし|ぼく|自分|うち[はのでも]|あなた|みんな|我が家|夫|妻|娘|息子|友達|友だち")


def clamp(n):
    return max(0.0, min(100.0, n))


def scale(value, human, machine):
    """value を 0〜100 に写す。human → 100、machine → 0。"""
    if human == machine:
        return 50.0
    return clamp((value - machine) / (human - machine) * 100)


def body_len(text):
    """本文の文字数（空白とハッシュタグを除く）。"""
    return len(re.sub(r"\s", "", HASHTAG_RE.sub("", text)))


def check_burstiness(text):
    """人は文の長さを大きく変える。機械はそろえて書く。"""
    lens = [char_len(s) for s in split_sentences(text) if char_len(s) >= 4]
    if len(lens) < 4:
        return 50.0, "文が少なすぎて判定できない"
    mean = statistics.mean(lens)
    cv = statistics.pstdev(lens) / mean if mean else 0
    score = scale(cv, human=0.65, machine=0.20)
    return score, f"{len(lens)}文のばらつき {cv:.2f}（0.5以上が目安）"


def concrete_markers(text):
    t = unicodedata.normalize("NFKC", HASHTAG_RE.sub(" ", text))
    found = [m for m in DIGIT_NUM_RE.findall(t) if m.strip()]
    found += KANJI_NUM_RE.findall(t)
    found += sorted(set(LATIN_RE.findall(t)))
    found += sorted({k for k in KATAKANA_RE.findall(t) if k not in GENERIC_KATAKANA})
    return found


def check_specificity(text):
    """数字・固有名詞。AIっぽい文章は抽象的。"""
    n = body_len(text)
    if n < 60:
        return 50.0, "短すぎて判定できない"
    hits = len(concrete_markers(text))
    density = hits * 100.0 / n
    score = scale(density, human=3.0, machine=0.3)
    return score, f"具体的なもの{hits}個、100文字あたり{density:.1f}個（2以上が目安）"


def check_slop(text, lex):
    """AIっぽい言い回しの密度。"""
    n = body_len(text)
    if not n:
        return 50.0, "空です"
    hits, found = 0, []
    work = text          # 当たった所は印に置き換え、短い項目で二重に数えないようにする
    for entry in lexicon_entries(lex):
        try:
            pattern = compile_entry(entry)
        except re.error as e:
            print("エラー：辞書 slop.json の正規表現が壊れています（" + str(e) + "）", file=sys.stderr)
            sys.exit(2)
        k = len(pattern.findall(work))
        if k:
            hits += k
            found.append(entry_label(entry))
            work = pattern.sub("\x01", work)
    density = hits * 100.0 / n
    score = scale(density, human=0.0, machine=2.0)
    detail = f"AIっぽい言い回し{hits}個、100文字あたり{density:.1f}個"
    if found:
        detail += "（" + "、".join(found[:4]) + ("、…" if len(found) > 4 else "") + "）"
    return score, detail


def check_fingerprint(text):
    """スマホのキーボードでは出ない文字や、そろっていない記号。"""
    invisible = sum(1 for c in text if unicodedata.category(c) == "Cf")
    dash = len(re.findall(r"[—―‒]+", "\n".join(
        l for l in text.split("\n") if not re.fullmatch(r"[\s　—―‒ー－\-=＝_＿]{3,}", l.strip() or "x"))))
    curly = sum(text.count(c) for c in "‘’“”")
    nbsp = sum(text.count(c) for c in "      ")
    mix = width_mix_counts(text)
    width = mix["fw_alnum"] + mix["bang_minor"] + mix["ellipsis_minor"]
    total = invisible * 4 + dash * 2 + curly + nbsp + width
    per1k = total * 1000.0 / max(len(text), 1)
    score = scale(per1k, human=0.0, machine=12.0)
    detail = (f"見えない文字{invisible}、ダッシュ{dash}、曲がった引用符{curly}、"
              f"特殊な空白{nbsp}、全角半角の混在{width}")
    return score, detail


def check_voice(text, lex):
    """話し言葉の語尾・人称・文の形のクセ。"""
    n = body_len(text)
    if n < 60:
        return 50.0, "短すぎて判定できない"
    per100 = 100.0 / n
    colloquial = len(COLLOQUIAL_RE.findall(text)) * per100
    person = len(PERSON_RE.findall(text)) * per100
    tells, names = 0, []
    for s in lex["structures"]:
        try:
            k = len(re.compile(s["regex"]).findall(text))
        except re.error as e:
            print("エラー：辞書 slop.json の正規表現が壊れています（" + str(e) + "）", file=sys.stderr)
            sys.exit(2)
        if k:
            tells += k
            names.append(s["id"])
    endings = ending_flags(text)
    score = (scale(colloquial, human=2.0, machine=0.2) * 0.35
             + scale(person, human=1.2, machine=0.1) * 0.35
             + clamp(100 - tells * 22) * 0.30)
    for f in endings:
        score -= 12
        names.append(f["id"])
    detail = (f"話し言葉{colloquial:.1f}・一人称/二人称{person:.1f}（100文字あたり）、"
              f"文の形のクセ{tells}個" + (f"、語尾の問題{len(endings)}個" if endings else ""))
    if names:
        detail += " [" + ", ".join(names[:5]) + "]"
    return clamp(score), detail


CHECKS = ["BURSTINESS", "SPECIFICITY", "SLOP DENSITY", "FINGERPRINT", "VOICE"]
LABELS = {"BURSTINESS": "文の長さ", "SPECIFICITY": "具体性", "SLOP DENSITY": "言い回し",
          "FINGERPRINT": "文字の指紋", "VOICE": "話し方"}
VERDICT_JA = {"PASS": "合格", "REVIEW": "要確認", "FLAGGED": "AIっぽい"}


def run(text, lex):
    results = {
        "BURSTINESS": check_burstiness(text),
        "SPECIFICITY": check_specificity(text),
        "SLOP DENSITY": check_slop(text, lex),
        "FINGERPRINT": check_fingerprint(text),
        "VOICE": check_voice(text, lex),
    }
    scores = [results[c][0] for c in CHECKS]
    # いちばん弱い項目が判定を引き下げる。判定ツールは手がかりが1つあれば十分だから。
    overall = statistics.mean(scores) * 0.6 + min(scores) * 0.4
    verdict = "PASS" if overall >= 70 and min(scores) >= 55 else (
        "REVIEW" if overall >= 50 else "FLAGGED")
    return results, overall, verdict


def bar(score, width=24):
    filled = int(round(score / 100.0 * width))
    return "#" * filled + "." * (width - filled)


def dwidth(s):
    return sum(2 if unicodedata.east_asian_width(c) in ("W", "F") else 1 for c in s)


def pad(s, width):
    return s + " " * max(0, width - dwidth(s))


def render(results, overall, verdict, label=None, out=sys.stdout):
    title = "AIっぽさチェック" + (f"  -  {label}" if label else "")
    print("\n" + title, file=out)
    print("=" * 62, file=out)
    for name in CHECKS:
        score, detail = results[name]
        print(f"  {pad(LABELS[name], 12)} {bar(score)} {score:5.1f}", file=out)
        print(f"  {pad('', 12)} {detail}", file=out)
    print("-" * 62, file=out)
    print(f"  {pad('人間らしさ', 12)} {bar(overall)} {overall:5.1f}   {VERDICT_JA[verdict]}（{verdict}）",
          file=out)
    if verdict != "PASS":
        weakest = min(CHECKS, key=lambda c: results[c][0])
        print(f"\n  いちばん弱い項目：{LABELS[weakest]}。まずここを直す。", file=out)
    print("\n  ※ PCの中だけで計算した目安です。外部のAI判定サービスの結果ではありません。", file=out)
    print("", file=out)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="下書きのAIっぽさを5つの目安で採点する（日本語向け）。")
    ap.add_argument("input", nargs="?", default="-", help="ファイル。- なら標準入力")
    ap.add_argument("compare", nargs="?", help="比べたい2つ目のファイル（直す前→直した後）")
    ap.add_argument("--json", action="store_true", help="結果をJSONで出す")
    ap.add_argument("--lexicon", default=LEX, help="辞書 slop.json の場所")
    args = ap.parse_args()

    if args.input == "-" and args.compare == "-":
        die("標準入力（-）は1つしか使えません")
    lex = load_lexicon(args.lexicon)
    targets = [(args.input, read_input(args.input))]
    if args.compare:
        targets.append((args.compare, read_input(args.compare)))
    for name, text in targets:
        if not text.strip():
            die(f"文章が空です：{name}")

    payload = []
    for name, text in targets:
        results, overall, verdict = run(text, lex)
        payload.append({
            "source": name,
            "checks": {k: {"label": LABELS[k], "score": round(v[0], 1), "detail": v[1]}
                       for k, v in results.items()},
            "human_score": round(overall, 1),
            "verdict": verdict,
        })

    if args.json:
        print(json.dumps(payload if args.compare else payload[0], indent=2, ensure_ascii=False))
    else:
        for (name, text), p in zip(targets, payload):
            results, overall, verdict = run(text, lex)
            render(results, overall, verdict,
                   label=os.path.basename(name) if args.compare else None)
        if args.compare:
            a, b = payload
            delta = b["human_score"] - a["human_score"]
            print(f"  {a['human_score']:.1f} {VERDICT_JA[a['verdict']]}  ->  "
                  f"{b['human_score']:.1f} {VERDICT_JA[b['verdict']]}   ({delta:+.1f})\n")

    sys.exit(0 if payload[-1]["verdict"] == "PASS" else 1)


if __name__ == "__main__":
    main()
