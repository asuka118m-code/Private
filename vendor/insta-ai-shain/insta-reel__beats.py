#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
beats.py - リール台本を、撮る前に「秒数つきの進行表（ビートシート）」にする。日本語向け。

1行ごとに話す時間を見積もって時刻を積み上げ、編集でリールを殺す4つを指摘する。
  1. フックが3秒を超えている
  2. 1つのビート（1行＝1つの話）が4秒を超えていて、見ている人が離れる
  3. 具体的なもの（数字・名前・金額）が無い行が3つ以上続いている
  4. 最後の行が最初の行（フック）に戻ってこない（ループしない）

時間は「文字数 ÷ 話す速さ（文字/秒）」で見積もる。日本語は単語の間に空白が無いので、
英語版の「1分あたりの単語数」ではなく「1秒あたりの文字数」を使う。
初期値は 7.5文字/秒（リールの話し言葉のめやす）。自分の台本を声に出して測り、
--cps で変える。ゆっくり話す人は 6前後、早口の人は 9前後になることが多い。
数字は読むと長くなる（「30」→「さんじゅう」）ので、数字1文字を2文字として数える。
あくまで編集の段取り用の見積もりで、撮って測った秒数の代わりにはならない。

使い方
  python3 beats.py script.txt
  python3 beats.py script.txt --target 30
  python3 beats.py script.txt --cps 8.5 --target 45
  pbpaste | python3 beats.py -
  python3 beats.py script.txt --json

終了コード
  0 … 進行表を出せた（指摘があっても 0）
  2 … 入力エラー（ファイルが無い・台本が空など）
"""

import argparse
import json
import re
import sys
import unicodedata

HOOK_WINDOW = 3.0        # 秒。これを過ぎると、もう指が判断している
MAX_BEAT = 4.0           # 秒。画面が変わらずに1つの話を続けてよい上限
ABSTRACT_RUN = 3         # 具体的なものが無い行が何行続いたら指摘するか

SPACE_PUNCT_RE = re.compile(r"[\s、。，．,.!！?？「」『』（）()\[\]【】…‥・〜~―—:：;；\"'“”‘’/／]")
SENT_RE = re.compile(r"[^。！？!?]+[。！？!?]*")
CLAUSE_RE = re.compile(r"[^、,]+[、,]*")

COUNTER = (r"(?:万|億|千)?\s*(?:円|%|％|パーセント|人|つ|個|選|本|回|倍|分|秒|時間|日|週間|週|"
           r"か月|ヶ月|カ月|ヵ月|年|歳|才|kg|キロ|件|位|割|枚|冊|ドル|フォロワー|再生|投稿)")
DIGIT_NUM_RE = re.compile(r"[0-9][0-9,.]*\s*" + COUNTER + r"?")
KANJI_NUM_RE = re.compile(r"(?<![一二三四五六七八九十百千])(?!十分)[一二三四五六七八九十百千]+\s*" + COUNTER)
LATIN_RE = re.compile(r"[A-Za-z][A-Za-z0-9+.]+")
KATAKANA_RE = re.compile(r"[ァ-ヴー]{2,}")
KANJI_RUN_RE = re.compile(r"[一-龥々〆ヵヶ]{2,}")
MONEY_WORDS = ["年収", "月収", "時給", "貯金", "家賃", "給料", "手取り", "副収入", "売上", "電気代",
               "固定費", "税金"]
GENERIC_KATAKANA = {
    "コンテンツ", "アルゴリズム", "エンゲージメント", "ポイント", "メリット", "デメリット",
    "ノウハウ", "スキル", "マインド", "モチベーション", "ストレス", "イメージ", "タイプ",
    "パターン", "レベル", "チャンス", "テクニック", "アプローチ", "クオリティ", "バランス",
    "プロセス", "システム", "サービス", "ステップ", "ルール", "ジャンル", "テーマ",
    "アカウント", "ユーザー", "フォロワー", "ファン", "ビジネス", "コツ", "コメント",
    "フォロー", "シェア", "チェック", "スタート", "ゴール", "トレンド", "アイデア", "ツール",
    "アプリ", "グッズ", "アイテム", "ストーリー", "メッセージ",
}
# ループ判定で「同じ言葉」と見なさない、どの台本にも出る漢字語
LOOP_STOP = {"自分", "今日", "本当", "今回", "一番", "動画", "最後", "大事", "必要", "感じ",
             "時間", "毎日", "今年", "人生", "全部", "方法", "結果", "簡単", "最初", "普通"}


def nfkc(text):
    return unicodedata.normalize("NFKC", text)


def speak_chars(text):
    """話す文字数のめやす。記号と空白は数えず、数字は1文字＝2文字として数える。"""
    t = SPACE_PUNCT_RE.sub("", nfkc(text))
    digits = sum(1 for c in t if c.isdigit())
    return len(t) + digits


def concrete_count(text):
    t = nfkc(text)
    n = len(DIGIT_NUM_RE.findall(t)) + len(KANJI_NUM_RE.findall(t))
    n += sum(1 for w in MONEY_WORDS if w in t)
    n += len(set(LATIN_RE.findall(t)))
    n += len({k for k in re.findall(r"[ァ-ヴー]{3,}", t) if k not in GENERIC_KATAKANA})
    return n


def loop_terms(text):
    """ループ判定に使う「中身のある言葉」：数字・英字・カタカナ語・漢字2文字の組。
    戻り値は {判定用の言葉: 表示用の言葉}。漢字は2文字ずつ比べ、表示は元の熟語で出す。"""
    t = nfkc(text)
    terms = {}
    num_re = re.compile(r"\d[\d,.]*\s*(?:万|千|億)?\s*(?:円|%|人|つ|選|本|回|分|秒|時間|日|年)?")
    for m in num_re.findall(t):
        key = re.sub(r"[,\s]", "", m).rstrip(".")
        terms[key] = key
    t = num_re.sub(" ", t)          # 数字と単位は上で数えたので、漢字の組からは外す
    for w in LATIN_RE.findall(t):
        terms[w.lower()] = w
    for k in KATAKANA_RE.findall(t):
        if k not in GENERIC_KATAKANA:
            terms[k] = k
    for run in KANJI_RUN_RE.findall(t):
        for i in range(len(run) - 1):
            bg = run[i:i + 2]
            if bg not in LOOP_STOP:
                terms.setdefault(bg, run)
    return terms


def tc(seconds):
    m, s = divmod(seconds, 60)
    return f"{int(m)}:{s:04.1f}"


def split_beats(raw, cps):
    """1行＝1ビート。ただし長すぎる行は句点、それでも長ければ読点で分ける。"""
    beats = []
    limit = MAX_BEAT * cps
    for line in [l.strip() for l in raw.splitlines()]:
        if not line:
            continue
        if speak_chars(line) <= limit * 1.5:
            beats.append(line)
            continue
        parts = [p.strip() for p in SENT_RE.findall(line) if p.strip()]
        pieces = []
        for part in parts:
            if speak_chars(part) > limit * 1.5:
                pieces += [c.strip() for c in CLAUSE_RE.findall(part) if c.strip()]
            else:
                pieces.append(part)
        buf = ""
        for piece in pieces:
            candidate = buf + piece
            if buf and speak_chars(candidate) > limit:
                beats.append(buf)
                buf = piece
            else:
                buf = candidate
        if buf:
            beats.append(buf)
    return beats


def analyse(raw, cps=7.5, target=None):
    beats = split_beats(raw, cps)
    if not beats:
        return None

    rows, clock = [], 0.0
    for i, text in enumerate(beats):
        n = speak_chars(text)
        dur = n / cps
        rows.append({
            "n": i + 1,
            "start": round(clock, 2),
            "dur": round(dur, 2),
            "chars": n,
            "text": text,
            "concrete": concrete_count(text),
            "label": "",
            "flags": [],
        })
        clock += dur
    total = clock

    for r in rows:
        if r["n"] == 1 or r["start"] + r["dur"] <= HOOK_WINDOW:
            r["label"] = "フック"
    rows[-1]["label"] = "締め" if rows[-1]["label"] != "フック" else "フック/締め"
    half = total / 2
    for r in rows:
        if not r["label"] and r["start"] <= half < r["start"] + r["dur"]:
            r["label"] = "中盤"

    notes = []
    if rows[0]["dur"] > HOOK_WINDOW:
        rows[0]["flags"].append(f"フックが{rows[0]['dur']:.1f}秒。{HOOK_WINDOW:.0f}秒を超えている")
        notes.append(f"1行目は言い終わるまで{rows[0]['dur']:.1f}秒かかる。"
                     f"{int(HOOK_WINDOW * cps)}文字以内に削らないと、見るかどうか決まったあとにフックが届く。")
    if rows[0]["concrete"] == 0:
        notes.append("1行目に数字も名前も無い。確かめられるものが無いフックは流されやすい。")

    for r in rows:
        if r["dur"] > MAX_BEAT:
            r["flags"].append(f"1つのビートに{r['dur']:.1f}秒")
    long_beats = [r["n"] for r in rows if r["dur"] > MAX_BEAT]
    if long_beats:
        notes.append(f"{', '.join(map(str, long_beats))}行目が{MAX_BEAT:.0f}秒を超えている。"
                     "行を分けるか、その途中で画面（カット・テロップ・映すもの）を変える。"
                     "動かない画面は、人が離れる場所。")

    run, start = 0, None
    for r in rows:
        if r["concrete"] == 0:
            run += 1
            start = start if start is not None else r["n"]
            if run == ABSTRACT_RUN:
                notes.append(f"{start}〜{r['n']}行目に具体的なものが何も無い。"
                             "どれか1行に数字・名前・金額を入れる。")
        else:
            run, start = 0, None

    first_terms = loop_terms(rows[0]["text"])
    shared = sorted(set(first_terms) & set(loop_terms(rows[-1]["text"])))
    loop = []
    for w in shared:
        if first_terms[w] not in loop:
            loop.append(first_terms[w])
    if len(rows) == 1:
        notes.append("台本が1行だけなので、ループは判定していない。")
    elif loop:
        notes.append(f"ループあり：最後の行がフックの「{'」「'.join(loop[:3])}」をくり返している。"
                     "2周目の再生はタダで手に入るリーチ。")
    else:
        notes.append("ループなし：最後の行がフックと同じ言葉を1つも使っていないので、平らに終わる。"
                     "1行目の言葉を1つ最後にくり返すのが、いちばん安い2周目の作り方。")

    if target:
        delta = total - target
        if abs(delta) <= target * 0.1:
            notes.append(f"長さは目標どおり（{total:.1f}秒／目標{target:g}秒）。")
        elif delta > 0:
            notes.append(f"目標より{delta:.1f}秒長い。約{int(delta * cps)}文字削る。")
        else:
            notes.append(f"目標より{-delta:.1f}秒短い。約{int(-delta * cps)}文字足すか、"
                         "そのまま短く撮る。短いほうがたいてい正解。")

    return {
        "cps": cps, "target": target,
        "total_seconds": round(total, 2),
        "total_chars": sum(r["chars"] for r in rows),
        "beats": rows,
        "notes": notes,
    }


def dwidth(s):
    return sum(2 if unicodedata.east_asian_width(c) in ("W", "F") else 1 for c in s)


def pad(s, width):
    return s + " " * max(0, width - dwidth(s))


def render(a, out=sys.stdout):
    head = (f"ビートシート  ·  {a['total_chars']}文字  ·  約{a['total_seconds']:.1f}秒"
            f"（{a['cps']:g}文字/秒）" + (f"  ·  目標{a['target']:g}秒" if a["target"] else ""))
    print("\n" + head, file=out)
    print("=" * 72, file=out)
    for r in a["beats"]:
        label = pad(r["label"], 11)
        print(f"  {tc(r['start'])}  {r['dur']:4.1f}秒  {label}{r['text']}", file=out)
        for f in r["flags"]:
            print(f"  {'':>6}  {'':>6}  {pad('', 11)}^ {f}", file=out)
    print("-" * 72, file=out)
    for n in a["notes"]:
        print(f"  - {n}", file=out)
    print("\n  ※ 秒数は文字数からの見積もり。撮って測った秒数が正しい。", file=out)
    print("", file=out)


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
    ap = argparse.ArgumentParser(description="リール台本を秒数つきの進行表（ビートシート）にする。")
    ap.add_argument("input", nargs="?", default="-", help="台本ファイル。- なら標準入力")
    ap.add_argument("--cps", type=float, default=7.5,
                    help="話す速さ（1秒あたりの文字数。初期値 7.5）")
    ap.add_argument("--target", type=float, help="目標の長さ（秒）")
    ap.add_argument("--json", action="store_true", help="結果をJSONで出す")
    args = ap.parse_args()

    if args.cps <= 0:
        print("エラー：--cps は0より大きい数にしてください", file=sys.stderr)
        sys.exit(2)
    if args.target is not None and args.target <= 0:
        print("エラー：--target は0より大きい秒数にしてください", file=sys.stderr)
        sys.exit(2)

    raw = read_input(args.input)
    a = analyse(raw, cps=args.cps, target=args.target)
    if not a:
        print("エラー：台本が空です", file=sys.stderr)
        sys.exit(2)
    if args.json:
        print(json.dumps(a, indent=2, ensure_ascii=False))
    else:
        render(a)
    sys.exit(0)


if __name__ == "__main__":
    main()
