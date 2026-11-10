#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
humanize.py - 下書きから「機械っぽさの跡」を取り除く。日本語向け。

次の順に処理する。

  1. 見えない文字   キーボードでは打てない文字を消す（またはふつうの空白にする）。
                    ゼロ幅スペース、単語結合子、ソフトハイフン、BOM、Unicodeのタグ文字、
                    改行しないスペースなど。コピペしても残り、どのエディタでも見えない。
  2. 記号          ダッシュ（—・―・——）→「、」、数字の間の – →「〜」、
                    日本語の中の “ ” →「」、‘ ’ → '、• や · →「・」。
                    区切り線として並べたダッシュの行（―――――）はそのまま残す。
  3. 全角と半角     全角の英数字（ＡＩ・１０）を半角に。
                    「！？」と「!?」、「…」「...」「・・・」が混ざっているときだけ、多いほうにそろえる。
                    句読点の前後の余計な半角スペースと、行末の空白を消す。
  4. 言い回し       slop.json の言い回しを、ふつうの言葉に置き換える（または消す）。URLの中は触らない。

文の形のクセ（「〜ではなく、〜なのです」、三つ並べ、絵文字の箇条書き、同じ語尾の連続、
体言止めの連発など）は「指摘するだけ」で、自動では書き換えない。
文の形を変えるには判断が要るので、それは人（とClaude）の仕事。

使い方
  python3 humanize.py draft.txt
  python3 humanize.py draft.txt --report      # 何を変えたかを表示（標準エラー出力）
  pbpaste | python3 humanize.py - --report
  python3 humanize.py draft.txt --json
  python3 humanize.py draft.txt -o clean.txt

終了コード
  0 … 処理できた
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

URL_RE = re.compile(r"https?://\S+|www\.\S+|\S+@\S+\.\S+")
JA_CHAR = r"[぀-ヿ㐀-鿿ｦ-ﾟ々〆ヵヶー]"
JA_RE = re.compile(JA_CHAR)
SENT_SPLIT_RE = re.compile(r"[^。！？!?\n]+[。！？!?]*")
DASH_CHARS = "—―‒"
DASH_RUN_RE = re.compile(r"[ \t　]*[—―‒]+[ \t　]*")


def die(msg):
    print("エラー：" + msg, file=sys.stderr)
    sys.exit(2)


def load_lexicon(path=LEX):
    try:
        with open(path, encoding="utf-8") as fh:
            lex = json.load(fh)
    except FileNotFoundError:
        die(f"辞書ファイルが見つかりません：{path}")
    except (ValueError, UnicodeDecodeError) as e:
        die(f"辞書ファイルが壊れています：{path}（{e}）")
    for key in ("invisible", "typographic", "words", "phrases", "structures"):
        if key not in lex:
            die(f"辞書ファイルに「{key}」がありません：{path}")
    return lex


def _cp(spec):
    """'U+200B' -> 0x200B,  'U+E0000-U+E007F' -> (start, end)."""
    if "-" in spec:
        a, b = spec.split("-")
        return (int(a[2:], 16), int(b[2:], 16))
    return int(spec[2:], 16)


def protect_urls(text):
    """URLを目印に置き換え、どの処理もリンクの中を書き換えないようにする。"""
    found = []

    def stash(m):
        found.append(m.group(0))
        return f"\x00URL{len(found) - 1}\x00"

    return URL_RE.sub(stash, text), found


def restore_urls(text, found):
    for i, url in enumerate(found):
        text = text.replace(f"\x00URL{i}\x00", url)
    return text


# ------------------------------------------------------------ 1. 見えない文字

def _is_emojiish(c):
    """絵文字の部品（絵文字本体・肌の色・異体字セレクタ）かどうか。"""
    o = ord(c)
    return (o >= 0x1F000 or 0x2600 <= o <= 0x27BF or o in (0xFE0F, 0x20E3)
            or unicodedata.category(c) == "So")


def _protected_positions(text):
    """絵文字の組み合わせ（👨‍👩‍👧・🏳️‍🌈・地域の旗）に使われている見えない文字の位置。
    ここを消すと絵文字がばらけるので、消さずに残す。"""
    keep = set()
    for i, c in enumerate(text):
        o = ord(c)
        if o == 0x200D and 0 < i < len(text) - 1:
            if _is_emojiish(text[i - 1]) and _is_emojiish(text[i + 1]):
                keep.add(i)
        elif 0xE0020 <= o <= 0xE007F and i > 0:
            if ord(text[i - 1]) == 0x1F3F4 or (i - 1) in keep:
                keep.add(i)
    return keep


def pass_invisible(text, lex):
    hits = []
    for entry in lex["invisible"]:
        cp = _cp(entry["cp"])
        if isinstance(cp, tuple):
            pattern = "[" + re.escape(chr(cp[0])) + "-" + re.escape(chr(cp[1])) + "]"
        else:
            pattern = re.escape(chr(cp))
        keep = _protected_positions(text)
        spots = [m.start() for m in re.finditer(pattern, text) if m.start() not in keep]
        if spots:
            hits.append({"name": entry["cp"] + " " + entry["name"], "count": len(spots),
                         "action": "削除" if entry["action"] == "delete" else "空白に"})
            rep = "" if entry["action"] == "delete" else " "
            drop = set(spots)
            text = "".join(rep if i in drop else c for i, c in enumerate(text))
    keep = _protected_positions(text)
    stray = [i for i, c in enumerate(text)
             if unicodedata.category(c) == "Cf" and c != "\x00" and i not in keep]
    if stray:
        hits.append({"name": "その他の見えない書式文字", "count": len(stray), "action": "削除"})
        drop = set(stray)
        text = "".join(c for i, c in enumerate(text) if i not in drop)
    return text, hits


# ------------------------------------------------------------ 2. 記号

def _is_rule_line(line):
    """区切り線として並べたダッシュの行（―――――）かどうか。"""
    s = line.strip()
    return len(s) >= 3 and all(c in DASH_CHARS + "ー－-=＝_＿ 　" for c in s)


def pass_typographic(text, lex):
    hits = []

    def count(name, n, to):
        if n:
            hits.append({"name": name, "count": n, "to": to})

    # ダッシュ → 「、」（区切り線の行は残す）
    out_lines, n_dash = [], 0
    for line in text.split("\n"):
        if _is_rule_line(line):
            out_lines.append(line)
            continue
        # 数字の間のダッシュは範囲（5―10分）なので「〜」
        line, k = re.subn(r"(?<=\d)\s*[—―‒]\s*(?=\d)", "〜", line)
        n_dash += k
        n_dash += len(DASH_RUN_RE.findall(line))
        # 文が言い終わっている所（〜ます—）のダッシュは「。」、それ以外は「、」
        line = re.sub(r"(ます|です|した|ません|でした|だった)" + DASH_RUN_RE.pattern + r"(?!$)", r"\1。", line)
        line = DASH_RUN_RE.sub("、", line)
        out_lines.append(line)
    text = "\n".join(out_lines)
    count("ダッシュ（— ― ——）", n_dash, "、")

    # EN DASH：数字の間は範囲「〜」、それ以外は半角ハイフン
    n = text.count("–")
    if n:
        text = re.sub(r"(?<=\d)\s*–\s*(?=\d)", "〜", text)
        text = re.sub(r"\s+–\s+", "、", text)
        text = text.replace("–", "-")
        count("EN DASH（–）", n, "〜 / -")

    # 二重引用符：中身が日本語なら「」、それ以外は "
    n_q = text.count("“") + text.count("”")
    if n_q:
        text = re.sub(r"“([^“”\n]*)”",
                      lambda m: ("「" + m.group(1) + "」") if JA_RE.search(m.group(1))
                      else ('"' + m.group(1) + '"'), text)
        text = text.replace("“", '"').replace("”", '"')
        count("曲がった二重引用符（“ ”）", n_q, "「」 / \"")
    n_s = text.count("‘") + text.count("’")
    if n_s:
        text = text.replace("‘", "'").replace("’", "'")
        count("曲がった一重引用符（‘ ’）", n_s, "'")
    for ch, name in (("•", "BULLET（•）"), ("·", "半角の中黒（·）")):
        n = text.count(ch)
        if n:
            text = text.replace(ch, "・")
            count(name, n, "・")

    # ダッシュを「、」にしたあとの句読点の重なりを片づける
    text = tidy_punct(text)
    return text, hits


def tidy_punct(text):
    text = re.sub(r"、+", "、", text)
    text = re.sub(r"、([。！？!?」』）)])", r"\1", text)
    text = re.sub(r"([。！？!?「『（(])、", r"\1", text)
    text = re.sub(r"、[ \t　]*(?=\n|$)", "", text)          # 行末の「、」
    text = re.sub(r"(?m)^[ \t]*[、，,]+[ \t]*", "", text)   # 行頭の「、」
    return text


# ------------------------------------------------------------ 3. 全角と半角

FW_ALNUM = {c: chr(c - 0xFEE0) for c in list(range(0xFF10, 0xFF1A)) + list(range(0xFF21, 0xFF3B))
            + list(range(0xFF41, 0xFF5B))}


def width_mix_counts(text):
    """全角・半角の混ざり方を数える（detect.py でも使う）。"""
    fw_alnum = sum(1 for c in text if ord(c) in FW_ALNUM)
    half_bang = len(re.findall(JA_CHAR + r"[!?]", text))
    full_bang = len(re.findall(r"[！？]", text))
    ell = {"…": len(re.findall(r"…+", text)), "...": len(re.findall(r"(?<!\.)\.{3,}(?!\.)", text)),
           "・・・": len(re.findall(r"・{3,}", text))}
    styles = [k for k, v in ell.items() if v]
    ell_minor = sum(sorted(ell.values())[:-1]) if len(styles) > 1 else 0
    bang_minor = min(half_bang, full_bang)
    return {"fw_alnum": fw_alnum, "bang_minor": bang_minor, "ellipsis_minor": ell_minor,
            "half_bang": half_bang, "full_bang": full_bang, "ellipsis": ell}


def pass_width(text):
    hits = []
    m = width_mix_counts(text)
    if m["fw_alnum"]:
        text = text.translate(FW_ALNUM)
        text = re.sub(r"(?<=[A-Za-z0-9])－(?=[A-Za-z0-9])", "-", text)   # Ｗｉ－Ｆｉ → Wi-Fi
        hits.append({"name": "全角の英数字（ＡＩ・１０）", "count": m["fw_alnum"], "to": "半角"})
    if m["half_bang"] and m["full_bang"]:
        if m["half_bang"] > m["full_bang"]:
            text = text.replace("！", "!").replace("？", "?")
            hits.append({"name": "「！？」と「!?」の混在", "count": m["full_bang"], "to": "半角の !? にそろえた"})
        else:
            text = re.sub("(" + JA_CHAR + r"|[」』）])([!?])",
                          lambda x: x.group(1) + {"!": "！", "?": "？"}[x.group(2)], text)
            text = re.sub(r"(?<=[！？])([!?])", lambda x: {"!": "！", "?": "？"}[x.group(1)], text)
            hits.append({"name": "「！？」と「!?」の混在", "count": m["half_bang"], "to": "全角の！？にそろえた"})
    if m["ellipsis_minor"]:
        ell = m["ellipsis"]
        major = max(ell, key=lambda k: ell[k])
        repl = {"…": "…", "...": "...", "・・・": "・・・"}[major]
        n = 0
        if major != "…":
            text, k = re.subn(r"…+", repl, text)
            n += k
        if major != "...":
            text, k = re.subn(r"(?<!\.)\.{3,}(?!\.)", repl, text)
            n += k
        if major != "・・・":
            text, k = re.subn(r"・{3,}", repl, text)
            n += k
        hits.append({"name": "三点リーダーの書き方の混在（… / ... / ・・・）", "count": n,
                     "to": f"「{repl}」にそろえた"})
    # 句読点の前後の半角スペース、行末の空白
    before = text
    text = re.sub(r"[ \t]+([、。！？」』）])", r"\1", text)
    text = re.sub(r"([、。「『（])[ \t]+", r"\1", text)
    text = re.sub(r"(?m)[ \t　]+$", "", text)
    if text != before:
        hits.append({"name": "句読点まわり・行末の余計なスペース", "count": 1, "to": "削除"})
    return text, hits


# ------------------------------------------------------------ 4. 言い回し

def compile_entry(entry):
    if entry.get("regex"):
        return re.compile(entry["find"])
    return re.compile(re.escape(entry["find"]))


def lexicon_entries(lex):
    """文字列の項目を長い順に先に当て、正規表現の項目（文脈つき）はそのあとに当てる。"""
    entries = lex["phrases"] + lex["words"]
    plain = sorted([e for e in entries if not e.get("regex")], key=lambda e: len(e["find"]), reverse=True)
    regex = [e for e in entries if e.get("regex")]
    return plain + regex


def entry_label(entry):
    return entry.get("label") or entry["find"]


def pass_lexical(text, lex):
    hits = []
    for entry in lexicon_entries(lex):
        try:
            pattern = compile_entry(entry)
        except re.error as e:
            print("エラー：辞書 slop.json の正規表現が壊れています（" + str(e) + "）", file=sys.stderr)
            sys.exit(2)
        found = pattern.findall(text)
        if not found:
            continue
        hits.append({"find": entry_label(entry), "replace": entry["replace"] or "（削除）",
                     "count": len(found), "family": entry.get("family", "")})
        text = pattern.sub(lambda m: entry["replace"], text)
    # 削除したあとに残る句読点・記号・空行を片づける
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"(?m)^[ \t　]*[、。，．,.]+[ \t]*", "", text)
    text = re.sub(r"(?m)^[ \t　]*[？?！!]+[ \t]*$", "", text)
    text = re.sub(r"(?m)^ (?=\S)", "", text)
    text = re.sub(r"「\s*」|『\s*』", "", text)
    text = re.sub(r"、+", "、", text)
    text = re.sub(r"。{2,}", "。", text)
    text = re.sub(r"、。|。、", "。", text)
    text = re.sub(r"([！？!?])[。、]", r"\1", text)
    text = tidy_punct(text)
    text = re.sub(r"(?m)^[ \t]+$", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text, hits


# ------------------------------------------------------------ 文の形のクセ（指摘のみ）

def split_sentences(text):
    """文に分ける。ハッシュタグだけの行と、記号だけの行は除く。"""
    out = []
    for line in text.split("\n"):
        s = line.strip()
        if not s or re.fullmatch(r"(?:[#＃][^\s#＃]+[\s　]*)+", s):
            continue
        for part in SENT_SPLIT_RE.findall(s):
            part = part.strip()
            core = re.sub(r"[\s　、。！？!?「」『』（）()…・\-ー〜~]", "", part)
            if len(core) >= 2:
                out.append(part)
    return out


def char_len(s):
    return len(re.sub(r"[\s　、。！？!?「」『』（）()]", "", s))


EMOJI_TAIL_RE = re.compile(r"[\s　。！？!?…・〜~♪☆★♡♥、)）」』\U0001F300-\U0001FAFF☀-➿]+$")


def sentence_ending(s):
    """文末の言葉（最後の2文字）。記号と絵文字は除く。"""
    core = EMOJI_TAIL_RE.sub("", s)
    return core[-2:] if len(core) >= 2 else core


def is_taigen(s):
    """体言止め（名詞で終わる）らしいか。漢字・カタカナ・英数字で終わる文。"""
    core = EMOJI_TAIL_RE.sub("", s)
    if not core or re.match(r"^\s*(?:[・\-*•]|\d+[.．、)）])", s):
        return False
    return bool(re.search(r"[一-鿿々ァ-ヴA-Za-z0-9]$", core))


def ending_flags(text):
    """語尾の単調さと、体言止めの連発を調べる。"""
    flags = []
    sents = split_sentences(text)
    ends = [sentence_ending(s) for s in sents]
    # 同じ語尾が3文以上続く
    best_run, best_end, run = 1, None, 1
    for i in range(1, len(ends)):
        if ends[i] and ends[i] == ends[i - 1]:
            run += 1
            if run > best_run:
                best_run, best_end = run, ends[i]
        else:
            run = 1
    if best_run >= 3:
        flags.append({"name": f"同じ語尾の連続（「〜{best_end}」が{best_run}文続く）", "count": best_run,
                      "id": "same-ending",
                      "fix": "語尾を変える。言い切り・問いかけ・「〜よね」・体言止めを混ぜる。"})
    elif len(ends) >= 5:
        top = max(set(ends), key=ends.count)
        share = ends.count(top) / float(len(ends))
        if share >= 0.6:
            flags.append({"name": f"語尾がほぼ同じ（「〜{top}」が{ends.count(top)}/{len(ends)}文）",
                          "count": ends.count(top), "id": "same-ending",
                          "fix": "語尾を変える。言い切り・問いかけ・「〜よね」・体言止めを混ぜる。"})
    # 体言止めが3文以上続く
    run, best = 0, 0
    for s in sents:
        run = run + 1 if is_taigen(s) else 0
        best = max(best, run)
    if best >= 3:
        flags.append({"name": f"体言止めの連発（{best}文続く）", "count": best, "id": "taigen",
                      "fix": "名詞で終わる文が続くと、広告コピーのように聞こえる。1〜2文はふつうの文末にする。"})
    return flags


def scan_structures(text, lex):
    flags = []
    for s in lex["structures"]:
        try:
            pattern = re.compile(s["regex"])
        except re.error as e:
            print("エラー：辞書 slop.json の正規表現が壊れています（" + str(e) + "）", file=sys.stderr)
            sys.exit(2)
        found = pattern.findall(text)
        if found:
            flags.append({"name": s["name"], "count": len(found), "fix": s["fix"], "id": s.get("id", "")})
    flags += ending_flags(text)
    lens = [char_len(s) for s in split_sentences(text) if char_len(s) >= 4]
    if len(lens) >= 4:
        mean = statistics.mean(lens)
        cv = statistics.pstdev(lens) / mean if mean else 0
        if cv < 0.35:
            flags.append({"name": f"文の長さがそろいすぎ（ばらつき {cv:.2f}）", "count": len(lens),
                          "id": "uniform-length",
                          "fix": "1文を半分に切る。別の1文は長くしてみる。機械は長さをそろえて書く。"})
    return flags


def humanize(text, lex):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text, urls = protect_urls(text)
    text, inv = pass_invisible(text, lex)
    text, typo = pass_typographic(text, lex)
    text, width = pass_width(text)
    text, lexi = pass_lexical(text, lex)
    text = restore_urls(text, urls)
    return text.strip() + "\n", {
        "invisible": inv,
        "typographic": typo,
        "width": width,
        "lexical": lexi,
        "structures": scan_structures(text, lex),
    }


def render_report(report, out=sys.stderr):
    def head(title):
        print(f"\n{title}\n" + "-" * 40, file=out)

    total = sum(h["count"] for k in ("invisible", "typographic", "width", "lexical") for h in report[k])
    head("AIっぽさ消し レポート")
    print(f"機械っぽさの跡を{total}か所修正、文の形のクセを{len(report['structures'])}種類指摘"
          "（指摘は自動では直していない）", file=out)

    if report["invisible"]:
        head("1. 見えない文字")
        for h in report["invisible"]:
            print(f"  {h['count']:>3}か所  {h['name']}  → {h['action']}", file=out)
    if report["typographic"]:
        head("2. 記号")
        for h in report["typographic"]:
            print(f"  {h['count']:>3}か所  {h['name']}  → {h['to']}", file=out)
    if report["width"]:
        head("3. 全角と半角")
        for h in report["width"]:
            print(f"  {h['count']:>3}か所  {h['name']}  → {h['to']}", file=out)
    if report["lexical"]:
        head("4. AIっぽい言い回し")
        for h in report["lexical"]:
            print(f"  {h['count']:>3}か所  {h['find']}  → {h['replace']}   [{h['family']}]", file=out)
    if report["structures"]:
        head("5. 文の形のクセ（自動では直さない。自分で書き直す）")
        for h in report["structures"]:
            print(f"  {h['count']:>3}か所  {h['name']}\n          {h['fix']}", file=out)
    if not any(report.values()):
        head("きれいです")
        print("  消すものはありませんでした。", file=out)
    print("", file=out)


def read_input(path):
    try:
        if path == "-":
            return sys.stdin.read()
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except FileNotFoundError:
        die(f"ファイルが見つかりません：{path}")
    except UnicodeDecodeError:
        die(f"UTF-8で読めないファイルです：{path}")
    except OSError as e:
        die(f"ファイルを読めません：{path}（{e}）")


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="下書きから機械っぽさの跡を取り除く（日本語向け）。")
    ap.add_argument("input", nargs="?", default="-", help="ファイル。- なら標準入力")
    ap.add_argument("-o", "--out", help="きれいにした文章をこのファイルに書く（指定しなければ画面に出す）")
    ap.add_argument("--report", action="store_true", help="何を変えたかを表示する（標準エラー出力）")
    ap.add_argument("--json", action="store_true", help="{text, report} をJSONで出す")
    ap.add_argument("--lexicon", default=LEX, help="辞書 slop.json の場所")
    args = ap.parse_args()

    raw = read_input(args.input)
    if not raw.strip():
        die("文章が空です")
    lex = load_lexicon(args.lexicon)
    clean, report = humanize(raw, lex)

    if args.json and args.out:
        die("--json と -o/--out は同時に使えません（どちらか1つにしてください）")
    if args.json:
        print(json.dumps({"text": clean, "report": report}, indent=2, ensure_ascii=False))
        return
    if args.out:
        try:
            with open(args.out, "w", encoding="utf-8") as fh:
                fh.write(clean)
        except OSError as e:
            die(f"書き込めません：{args.out}（{e}）")
        print(f"書き込みました：{args.out}", file=sys.stderr)
    else:
        sys.stdout.write(clean)
    if args.report:
        render_report(report)


if __name__ == "__main__":
    main()
