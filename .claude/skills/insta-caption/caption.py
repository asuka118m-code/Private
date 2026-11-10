#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
caption.py - インスタのキャプションを点検し、フィードで「…続きを読む」の前に
見える部分を枠で表示する。日本語向け。

フィードでは、キャプションは最初の少しだけが見えて、残りはタップしないと読めない。
うまくいかないキャプションのほとんどは、そこでつまずく。フックが3文目にある、
1行目があいさつ、いきなりハッシュタグで始まる、など。
このツールはまず「見える範囲」を枠で出し、通りすがりの人が読む形で確認できるようにする。

見える範囲は「近似（だいたいの目安）」：
  日本語は文字数ではなく「表示幅」で切れる。全角文字（漢字・かな）は半角2つ分の幅をとる。
  このツールは全角=2、半角=1 として幅を数え、
    ・合計の幅が --truncate（初期値 60＝全角30文字ぶん）を超えたところ
    ・表示が --lines 行（初期値 2行）を超えたところ（改行と折り返しを数える。空行も1行）
  のどちらか早いほうで切る。1行の幅は --line-width（初期値 40＝全角20文字ぶん）で折り返す。
  実際の切れ目は、機種・文字の大きさ・アカウント名の長さ・Instagramの仕様変更で変わる。
  ぴったりを狙わず、余裕をもって最初の一文を置くための目安として使う。

使い方
  python3 caption.py caption.txt
  python3 caption.py caption.txt --keywords "電気代 節約,固定費 見直し"
  python3 caption.py caption.txt --truncate 50 --lines 2
  pbpaste | python3 caption.py -
  python3 caption.py caption.txt --json

終了コード
  0 … 判定が「投稿OK（READY）」
  1 … 「要確認（REVIEW）」または「要修正（FIX）」
  2 … 入力エラー（ファイルが無い・中身が空など）
"""

import argparse
import json
import re
import sys
import unicodedata

LIMIT = 2200             # Instagramのキャプションの上限（文字数）
TRUNCATE = 60            # 「続きを読む」までに見える表示幅のめやす（半角換算）
LINES = 2                # 「続きを読む」までに見える行数のめやす
LINE_WIDTH = 40          # 1行の表示幅のめやす（半角換算。全角なら20文字）
HASHTAG_LIMIT = 5        # 元のスキル（英語版）作成時点の情報：Instagramは2025年12月18日に
                         # 1投稿あたりのハッシュタグを5個までにした、と元の作者が書いている。
                         # 最新の上限はInstagramの案内を優先し、--max-tags で変える。

HASHTAG_RE = re.compile(r"[#＃]([^\s#＃、。，．,.!！?？「」『』()（）\[\]【】]+)")
MENTION_RE = re.compile(r"(?:^|(?<=\s))(@[A-Za-z0-9_.]+)")
LINK_RE = re.compile(r"https?://\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|co|jp|io|net|org|ai|app|me|ly)/\S*",
                     re.IGNORECASE)
EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF☀-➿⭐⭕‼⁉←-⇿]")

COUNTER = (r"(?:万|億|千)?\s*(?:円|%|％|パーセント|人|つ|個|選|本|回|倍|分|秒|時間|日|週間|週|"
           r"か月|ヶ月|カ月|ヵ月|年|歳|才|kg|キロ|件|位|割|枚|冊|ドル|フォロワー|再生|投稿)")
DIGIT_NUM_RE = re.compile(r"[0-9][0-9,.]*\s*" + COUNTER + r"?")
KANJI_NUM_RE = re.compile(r"(?<![一二三四五六七八九十百千])(?!十分)[一二三四五六七八九十百千]+\s*" + COUNTER)
LATIN_RE = re.compile(r"(?<![#@A-Za-z0-9])[A-Za-z][A-Za-z0-9+.]+")
KATAKANA_RE = re.compile(r"[ァ-ヴー]{3,}")
MONEY_WORDS = ["年収", "月収", "時給", "貯金", "家賃", "給料", "手取り", "副収入", "売上", "電気代",
               "固定費", "税金"]
GENERIC_KATAKANA = {
    "コンテンツ", "アルゴリズム", "エンゲージメント", "ポイント", "メリット", "デメリット",
    "ノウハウ", "スキル", "マインド", "モチベーション", "ストレス", "イメージ", "タイプ",
    "パターン", "レベル", "チャンス", "テクニック", "アプローチ", "クオリティ", "バランス",
    "プロセス", "システム", "サービス", "ステップ", "ルール", "ジャンル", "テーマ",
    "アカウント", "ユーザー", "フォロワー", "ファン", "ビジネス", "コツ", "コメント",
    "フォロー", "シェア", "チェック", "スタート", "ゴール", "トレンド", "アイデア", "ツール",
    "アプリ", "グッズ", "アイテム", "ストーリー", "メッセージ", "キャプション", "プロフィール",
    "リンク", "ハイライト",
}

GREETING_RE = re.compile(r"^\s*(?:こんにちは|こんばんは|おはよう|はいどうも|どうも|はじめまして|"
                         r"みなさん|皆さん|お疲れ様です|おつかれさまです)")

# お願い（行動のよびかけ）。同じ種類は1つと数える
ASKS = [
    (re.compile(r"[「『\"“]?[^\s「」『』\"“”]{1,15}[」』\"”]?\s*(?:って|と)\s*コメント|コメント(?:で|に|欄に)?\s*[「『]"),
     "キーワードをコメント"),
    (re.compile(r"(?:DM|ＤＭ)(?:して|ください|で(?:送|聞|く|ど)|ちょうだい|待って)|メッセージ(?:して|ください|送って)"),
     "DMしてもらう"),
    (re.compile(r"保存(?:も|を)?(?:して|しておく|推奨|必須|しといて|しておいて|がおすすめ|してね|しておこう|お願い)"), "保存"),
    (re.compile(r"シェア(?:して|お願い)|(?:友達|友だち|誰か|家族)に(?:送って|教えて|シェア)|ストーリーズ?で(?:シェア|紹介)"),
     "シェア"),
    (re.compile(r"フォロー(?:して|お願い|すると|で(?:応援|最新|見逃)|よろしく)"), "フォロー"),
    (re.compile(r"プロフ(?:ィール)?(?:の)?(?:リンク|URL|から)|ハイライト(?:から|を見て|をチェック)"),
     "プロフィールのリンク"),
    (re.compile(r"(?:コメント|コメ欄)で(?:教えて|聞かせて)|どっち派|どれ派|教えてね|教えてください"),
     "質問に答えてもらう"),
    (re.compile(r"いいね(?:して|お願い|押して|で応援|と(?:フォロー|保存|コメント))"), "いいね"),
]

FILLER_TAGS = {
    "#instagood", "#フォローミー", "#いいね返し", "#相互フォロー", "#フォロバ", "#フォロバ100",
    "#f4f", "#l4l", "#like4like", "#follow4follow", "#followme", "#instagram", "#インスタ",
    "#おすすめ", "#おすすめにのりたい", "#おすすめに乗りたい", "#バズりたい", "#拡散希望",
    "#viral", "#fyp", "#explore", "#explorepage", "#foryou", "#reels", "#reel", "#リール",
    "#人気", "#いいね", "#フォロー", "#インスタグラム", "#instadaily", "#love", "#trending",
}


def cwidth(c):
    return 2 if unicodedata.east_asian_width(c) in ("W", "F") else 1


def dwidth(s):
    return sum(cwidth(c) for c in s)


def visible_window(text, cut, max_lines, line_width):
    """フィードで見える部分（近似）。幅の上限か行数の上限の、早いほうで切る。"""
    flat = text.strip()
    out = []
    total = 0
    line_no = 1
    cur = 0
    for c in flat:
        if c == "\n":
            if line_no >= max_lines:
                return "".join(out), True
            line_no += 1
            cur = 0
            out.append(c)
            continue
        w = cwidth(c)
        if total + w > cut:
            return "".join(out), True
        if cur + w > line_width:
            if line_no >= max_lines:
                return "".join(out), True
            line_no += 1
            cur = 0
        out.append(c)
        total += w
        cur += w
    return "".join(out), False


def wrap_width(line, width):
    """表示幅で折り返す（全角=2、半角=1）。"""
    if not line:
        return [""]
    rows, cur, w = [], "", 0
    for c in line:
        cw = cwidth(c)
        if w + cw > width:
            rows.append(cur)
            cur, w = "", 0
        cur += c
        w += cw
    rows.append(cur)
    return rows


def render_box(window, truncated, line_width, out=sys.stdout):
    inner = max(line_width, 28)
    print("\n  フィードで見える部分（近似）", file=out)
    print("  +" + "-" * (inner + 2) + "+", file=out)
    rows = []
    for raw in window.split("\n"):
        rows.extend(wrap_width(raw, inner))
    for row in rows[:8]:
        print("  | " + row + " " * (inner - dwidth(row)) + " |", file=out)
    tail = "…続きを読む" if truncated else "（全文が見えている）"
    print("  +" + "-" * max(1, inner + 2 - dwidth(tail) - 2) + " " + tail + " +", file=out)


def concrete(text):
    found = [m.strip() for m in DIGIT_NUM_RE.findall(text) if m.strip()]
    found += KANJI_NUM_RE.findall(text)
    found += [w for w in MONEY_WORDS if w in text]
    found += sorted(set(LATIN_RE.findall(text)))
    found += sorted({k for k in KATAKANA_RE.findall(text) if k not in GENERIC_KATAKANA})
    return found


def analyse(text, cut=TRUNCATE, max_lines=LINES, line_width=LINE_WIDTH, keywords=None,
            max_tags=HASHTAG_LIMIT):
    norm = unicodedata.normalize("NFKC", text)
    stripped = text.strip()
    stripped_n = norm.strip()
    chars = len(stripped)
    lines = stripped.split("\n")
    first_line = lines[0].strip() if lines else ""
    tags = ["#" + t for t in HASHTAG_RE.findall(stripped_n) if not t.isdigit()]
    mentions = MENTION_RE.findall(stripped_n)
    links = LINK_RE.findall(stripped_n)
    emoji = EMOJI_RE.findall(stripped)
    window, truncated = visible_window(stripped, cut, max_lines, line_width)
    window_n = unicodedata.normalize("NFKC", window)
    asks = [name for pattern, name in ASKS if pattern.search(stripped_n)]
    filler = [t for t in tags if t.lower() in FILLER_TAGS]
    keywords = [k.strip() for k in (keywords or []) if k.strip()]
    paragraphs = [p for p in re.split(r"\n\s*\n", stripped) if p.strip()]

    checks = []

    def add(name, status, detail):
        checks.append({"check": name, "status": status, "detail": detail})

    add("文字数", "FAIL" if chars > LIMIT else "PASS",
        f"{chars} / {LIMIT}文字" + (f"。{chars - LIMIT}文字オーバー" if chars > LIMIT else ""))

    fw = dwidth(first_line)
    if not first_line:
        add("1行目", "FAIL", "空行から始まっている")
    elif first_line[0] in "#＃@＠":
        add("1行目", "FAIL", "ハッシュタグかメンションで始まっている。いちばん目立つ場所なので一文を置く")
    elif GREETING_RE.search(first_line):
        add("1行目", "WARN", "あいさつで始まっている。見える範囲をあいさつに使うのはもったいない")
    elif EMOJI_RE.match(first_line):
        add("1行目", "WARN", "絵文字で始まっている。最初の1文字は言葉にする")
    elif fw > cut:
        add("1行目", "WARN",
            f"表示幅{fw}（全角約{(fw + 1) // 2}文字）で、途中の{cut}あたりで切れる。"
            "切れ目が「続きが気になる」所ならOK、文の途中で意味が切れるならNG")
    else:
        add("1行目", "PASS", f"表示幅{fw}（全角約{(fw + 1) // 2}文字）。切れずに見える")

    hits = concrete(HASHTAG_RE.sub(" ", window_n))   # タグの中の言葉は数えない
    add("見える範囲の具体性", "PASS" if hits else "WARN",
        f"数字・名前が{len(hits)}個" + (f"（{', '.join(hits[:3])}）" if hits else
                                       "。タップの前に確かめられるものが何もない"))

    if len(tags) > max_tags:
        add("ハッシュタグ", "FAIL", f"{len(tags)}個。上限の{max_tags}個を超えている"
                                   "（上限は元のスキル作成時点の情報。Instagramの最新の案内を優先）")
    elif filler:
        add("ハッシュタグ", "WARN", f"{len(tags)}個のうち{len(filler)}個が中身のないタグ"
                                   f"（{' '.join(filler[:3])}）。何の投稿かを表すタグに使う")
    else:
        add("ハッシュタグ", "PASS", f"{len(tags)}個" + (f"：{' '.join(tags)}" if tags else ""))

    if not tags:
        add("タグの位置", "PASS", "タグなし")
    elif any(t in window_n for t in tags):
        add("タグの位置", "WARN", "見える範囲にハッシュタグがある。いちばん目立つ場所をラベルに使っている")
    else:
        add("タグの位置", "PASS", "タグは見える範囲の外（下のほう）")

    add("リンク", "WARN" if links else "PASS",
        f"キャプションにリンクが{len(links)}個。キャプションのURLは押せない。"
        "プロフィールかDMに移す" if links else "押せないリンクは無い")

    if len(asks) == 1:
        add("お願いは1つ", "PASS", f"お願いは1つ：{asks[0]}")
    elif not asks:
        add("お願いは1つ", "WARN", "お願いが無い。保存・シェア・コメントのどれか1つを一言で入れる"
                                   "（例：「あとで見返せるように保存してね」）")
    else:
        add("お願いは1つ", "WARN", f"お願いが{len(asks)}種類（{', '.join(asks)}）。"
                                   "2つ頼むと、どちらもされない")

    density = len(emoji) * 100.0 / max(chars, 1)
    add("絵文字", "WARN" if density > 4 else "PASS",
        f"{len(emoji)}個、100文字あたり{density:.1f}個"
        + ("。飾りに見える。句読点がわりに少しだけ" if density > 4 else ""))

    long_paras = [p for p in paragraphs if len(p.strip()) > 150]
    if chars > 200 and len(paragraphs) == 1:
        add("改行と空行", "WARN", "200文字を超えているのに空行が無い。スマホでは文字の壁に見える。"
                                 "2〜4行ごとに空行を入れる")
    elif long_paras:
        add("改行と空行", "WARN", f"150文字を超えるかたまりが{len(long_paras)}つ。途中に空行を入れる")
    else:
        add("改行と空行", "PASS", f"段落{len(paragraphs)}つ。読みやすい区切り")

    if keywords:
        body = HASHTAG_RE.sub(" ", stripped_n).lower()      # ハッシュタグを除いた本文
        alltext = stripped_n.lower()
        key = lambda k: unicodedata.normalize("NFKC", k).lower()
        found = [k for k in keywords if key(k) in body]
        tag_only = [k for k in keywords if k not in found and key(k) in alltext]
        missing = [k for k in keywords if k not in found and k not in tag_only]
        in_window = [k for k in found if key(k) in window_n.lower()]
        if not missing and not tag_only:
            status = "PASS"
        elif found or tag_only:
            status = "WARN"
        else:
            status = "FAIL"
        add("検索キーワード", status,
            f"{len(found)}/{len(keywords)}個が本文の文章にある"
            + (f"、うち{len(in_window)}個が見える範囲" if found else "")
            + (f"。ハッシュタグの中だけ：{', '.join(tag_only)}（文章にも入れる）" if tag_only else "")
            + (f"。足りない：{', '.join(missing)}" if missing else ""))

    fails = sum(1 for c in checks if c["status"] == "FAIL")
    warns = sum(1 for c in checks if c["status"] == "WARN")
    verdict = "FIX" if fails else ("REVIEW" if warns else "READY")

    return {
        "characters": chars, "limit": LIMIT,
        "truncate_width": cut, "visible_lines": max_lines, "line_width": line_width,
        "visible": window, "truncated": truncated,
        "first_line_width": fw,
        "hashtags": tags, "max_tags": max_tags, "mentions": mentions, "links": links,
        "emoji": len(emoji), "asks": asks,
        "checks": checks, "verdict": verdict,
    }


STATUS_JA = {"PASS": "OK  ", "WARN": "注意", "FAIL": "NG  "}
VERDICT_JA = {"READY": "投稿OK（READY）", "REVIEW": "要確認（REVIEW）", "FIX": "要修正（FIX）"}


def pad(s, width):
    return s + " " * max(0, width - dwidth(s))


def render(a, out=sys.stdout):
    head = (f"キャプション点検  ·  {a['characters']} / {a['limit']}文字  ·  "
            f"ハッシュタグ{len(a['hashtags'])}個  ·  お願い{len(a['asks'])}種類")
    print("\n" + head, file=out)
    print("=" * 66, file=out)
    render_box(a["visible"], a["truncated"], a["line_width"], out=out)
    print(f"  ※ 見える範囲は近似（幅{a['truncate_width']}・{a['visible_lines']}行で計算）。"
          "機種やInstagramの仕様で変わる。", file=out)
    print("", file=out)
    for c in a["checks"]:
        print(f"  {STATUS_JA[c['status']]}  {pad(c['check'], 18)} {c['detail']}", file=out)
    print("-" * 66, file=out)
    print(f"  判定  {VERDICT_JA[a['verdict']]}\n", file=out)


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
    ap = argparse.ArgumentParser(description="インスタのキャプションを点検する（日本語向け）。")
    ap.add_argument("input", nargs="?", default="-", help="キャプションのファイル。- なら標準入力")
    ap.add_argument("--truncate", type=int, default=TRUNCATE,
                    help=f"「続きを読む」までに見える表示幅（半角換算。初期値 {TRUNCATE}＝全角{TRUNCATE // 2}文字ぶん）")
    ap.add_argument("--lines", type=int, default=LINES,
                    help=f"「続きを読む」までに見える行数（初期値 {LINES}）")
    ap.add_argument("--line-width", type=int, default=LINE_WIDTH,
                    help=f"1行の表示幅（半角換算。初期値 {LINE_WIDTH}＝全角{LINE_WIDTH // 2}文字ぶん）")
    ap.add_argument("--max-tags", type=int, default=HASHTAG_LIMIT,
                    help=f"ハッシュタグの上限（初期値 {HASHTAG_LIMIT}。Instagramの最新の案内を優先）")
    ap.add_argument("--keywords", default="",
                    help="見つけてほしい検索キーワード。カンマ区切り（例：\"電気代 節約,固定費\"）")
    ap.add_argument("--json", action="store_true", help="結果をJSONで出す")
    args = ap.parse_args()

    for name in ("truncate", "lines", "line_width"):
        if getattr(args, name) <= 0:
            print(f"エラー：--{name.replace('_', '-')} は1以上にしてください", file=sys.stderr)
            sys.exit(2)
    if args.max_tags < 0:
        print("エラー：--max-tags は0以上にしてください", file=sys.stderr)
        sys.exit(2)

    raw = read_input(args.input)
    if not raw.strip():
        print("エラー：キャプションが空です", file=sys.stderr)
        sys.exit(2)
    kw = re.split(r"[,、，]", args.keywords) if args.keywords else []
    a = analyse(raw, cut=args.truncate, max_lines=args.lines, line_width=args.line_width,
                keywords=kw, max_tags=args.max_tags)
    if args.json:
        print(json.dumps(a, indent=2, ensure_ascii=False))
    else:
        render(a)
    sys.exit(0 if a["verdict"] == "READY" else 1)


if __name__ == "__main__":
    main()
