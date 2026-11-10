#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
swipe.py - 集めたリールを「そのアカウントのいつもの再生数の何倍か」で並べ、
フックの型を名付けて、ネタ帳（スワイプファイル）を書き出す道具。

いちばん大事な考え方はひとつだけです。再生数の大きさは証拠になりません。
フォロワー200万人のアカウントが40万回再生でも「静かな日」です。
フォロワー4,000人のアカウントが40万回再生なら「何かを見つけた」のです。
だから、そのアカウント自身のいつもの再生数（中央値）に対する倍率で並べます。

入力はタブ区切りのファイル（TSV）です。見ながら1本1行で書き込みます。
1行目に列名を書いてください（英語でも日本語でも可）。

    アカウント  フォロワー  中央値  再生数  フック
    @sample_a   4.8万       1.1万   41.2万  最初の30本はスベって当たり前って誰も言わない

数字は「1.2万」「12万」「3,400」「1.5M」「2.3K」「１２万」のどれでも読めます。
中央値（いつもの再生数）が無いときはフォロワー数を基準にしますが、精度は落ちます。

使い方
  python3 swipe.py captured.tsv
  python3 swipe.py captured.tsv --out ~/.claude/insta-ai-shain/swipe.md
  python3 swipe.py captured.tsv --json

標準ライブラリだけで動きます。ネットには一切つなぎません。
"""

import argparse
import json
import os
import re
import statistics
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_HOOKS = os.path.normpath(os.path.join(HERE, "..", "insta-reel", "hooks.json"))
REEL_DIR = os.path.normpath(os.path.join(HERE, "..", "insta-reel"))

# 列名の別名。左が内部名、右が受け付ける書き方（小文字・前後空白なしで比較）
COLUMN_ALIASES = {
    "account": ["account", "アカウント", "アカウント名", "垢", "ユーザー名", "ハンドル", "handle"],
    "followers": ["followers", "follower", "フォロワー", "フォロワー数"],
    "median": ["median", "中央値", "いつもの再生数", "普段の再生数", "基準"],
    "views": ["views", "view", "再生数", "再生回数", "視聴数", "再生"],
    "hook": ["hook", "フック", "冒頭", "冒頭の一言", "最初の一言", "1行目", "一行目"],
    "on_screen": ["on-screen", "on_screen", "onscreen", "テロップ", "冒頭テロップ", "画面の文字"],
    "length": ["length", "秒数", "長さ", "尺"],
    "cta": ["cta", "最後のお願い", "誘導", "締め"],
    "url": ["url", "リンク"],
}
ALIAS_TO_KEY = {}
for _key, _names in COLUMN_ALIASES.items():
    for _n in _names:
        ALIAS_TO_KEY[_n.lower()] = _key

UNITS = {"億": 100000000, "万": 10000, "千": 1000, "k": 1000, "m": 1000000, "b": 1000000000}
PART_RE = re.compile(r"(\d+(?:\.\d+)?)(億|万|千|k|m|b)?")


def setup_io():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


def die(message, code=1):
    print("エラー: " + message, file=sys.stderr)
    sys.exit(code)


def parse_count(text):
    """「1.2万」「12万」「3,400」「1.5M」「１２万」「1万2000」などを整数にする。
    空なら None。読めなければ ValueError。"""
    if text is None:
        return None
    t = unicodedata.normalize("NFKC", str(text)).strip().lower()
    if not t:
        return None
    for junk in (",", "，", " ", "　", "約", "およそ", "回", "人", "views", "view",
                 "再生", "~", "〜", "+"):
        t = t.replace(junk, "")
    if t in ("", "-", "ー", "―", "不明", "?", "n/a", "na", "なし"):
        return None
    pos, total, parts = 0, 0.0, []
    while pos < len(t):
        m = PART_RE.match(t, pos)
        if not m:
            raise ValueError(text)
        parts.append(m)
        pos = m.end()
    # 単位なしの数が途中に来る書き方（例「12.34.5」）は受け付けない
    for m in parts[:-1]:
        if not m.group(2):
            raise ValueError(text)
    for m in parts:
        total += float(m.group(1)) * UNITS.get(m.group(2) or "", 1)
    return int(round(total))


def load_formulas(path):
    """insta-reel/hooks.json からフックの型を読む。無い・壊れているときは止める。"""
    if not os.path.isfile(path):
        die("フックの型の一覧（hooks.json）が見つかりません。\n"
            "  探した場所: " + path + "\n"
            "  insta-reel スキルが、この insta-buzz と同じ skills フォルダに入っているか確認してください。\n"
            "  別の場所にある場合は --hooks でファイルを指定できます。", 3)
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError) as e:
        die("hooks.json を読めませんでした（壊れている可能性があります）: %s\n  %s" % (path, e), 3)
    hooks = data.get("hooks") if isinstance(data, dict) else None
    if not isinstance(hooks, list) or not hooks:
        die("hooks.json に \"hooks\" の一覧がありません: " + path, 3)
    by_id = {}
    for h in hooks:
        if not isinstance(h, dict) or "id" not in h or "match" not in h:
            die("hooks.json の中に id か match が欠けている型があります: " + path, 3)
        name = h.get("name_ja") or h.get("name") or ("型%s" % h["id"])
        try:
            pattern = re.compile(h["match"], re.IGNORECASE)
        except re.error as e:
            die("hooks.json の #%s の match（判定用の正規表現）が壊れています: %s" % (h["id"], e), 3)
        by_id[h["id"]] = (h["id"], name, pattern)
    order = data.get("classify_order") or sorted(by_id)
    formulas = [by_id[i] for i in order if i in by_id]
    # classify_order に載っていない型も最後に足す（取りこぼし防止）
    for i in sorted(by_id):
        if i not in order:
            formulas.append(by_id[i])
    return formulas


def load_scorer():
    """insta-reel/hookscore.py があればフックの点数も付ける（無くても動く）。"""
    if not os.path.isfile(os.path.join(REEL_DIR, "hookscore.py")):
        return None, "insta-reel/hookscore.py が見つからないため、フックの点数は省略しました。"
    try:
        sys.dont_write_bytecode = True  # スキルのフォルダに __pycache__ を作らない
        sys.path.insert(0, REEL_DIR)
        from hookscore import run  # noqa: E402
        return run, None
    except Exception as e:  # 読み込めないときは点数だけ省略
        return None, "hookscore.py を読み込めなかったため、フックの点数は省略しました（%s）。" % e


def classify(hook, formulas):
    for fid, name, pattern in formulas:
        if pattern.search(hook):
            return fid, name
    return None, "型なし"


def read_rows(path):
    if path == "-":
        raw = sys.stdin.read()
    else:
        if not os.path.isfile(path):
            die("入力ファイルが見つかりません: " + path, 1)
        try:
            with open(path, encoding="utf-8-sig") as f:
                raw = f.read()
        except UnicodeDecodeError:
            die("入力ファイルを UTF-8 として読めませんでした。Excel などで「UTF-8（タブ区切り）」で保存し直してください: " + path, 1)
        except OSError as e:
            die("入力ファイルを開けませんでした: %s" % e, 1)
    numbered = [(i + 1, l) for i, l in enumerate(raw.splitlines())
                if l.strip() and not l.lstrip().startswith("#")]
    if not numbered:
        return [], []
    first_no, first = numbered[0]
    head_cells = [c.strip().lower() for c in first.split("\t")]
    head_keys = [ALIAS_TO_KEY.get(c) for c in head_cells]
    if "views" in head_keys and "hook" in head_keys:
        cols, body = head_keys, numbered[1:]
    elif re.search(r"\d", unicodedata.normalize("NFKC", first)) and "\t" in first:
        cols, body = ["account", "followers", "views", "hook"], numbered
    else:
        accepted = "、".join(["再生数(views)", "フック(hook)", "アカウント(account)",
                             "フォロワー(followers)", "中央値(median)"])
        die("1行目の列名を読み取れませんでした（%d行目）。\n"
            "  少なくとも「再生数」と「フック」の列が必要です。使える列名: %s\n"
            "  列の区切りはタブです（スペースやカンマではありません）。" % (first_no, accepted), 2)

    rows, skipped = [], []
    for line_no, line in body:
        cells = [c.strip() for c in line.split("\t")]
        if len(cells) < len(cols):
            cells += [""] * (len(cols) - len(cells))
        r = {}
        for key, val in zip(cols, cells):
            if key and key not in r:
                r[key] = val
        r["line"] = line_no
        if not r.get("hook"):
            skipped.append((line_no, "フックが空です"))
            continue
        try:
            views = parse_count(r.get("views"))
        except ValueError:
            skipped.append((line_no, "再生数「%s」を数字として読めません" % r.get("views")))
            continue
        if not views:
            skipped.append((line_no, "再生数が空か0です"))
            continue
        r["views"] = views
        for k in ("followers", "median"):
            try:
                r[k] = parse_count(r.get(k))
            except ValueError:
                skipped.append((line_no, "%s「%s」を読めないので空として扱いました"
                                % ("フォロワー数" if k == "followers" else "中央値", r.get(k))))
                r[k] = None
        rows.append(r)
    return rows, skipped


def analyse(rows, formulas, scorer):
    used_median = any(r.get("median") for r in rows)
    all_median = all(r.get("median") for r in rows)
    score_note = None
    for r in rows:
        base = r.get("median") or r.get("followers") or 0
        r["baseline"] = base or None
        r["baseline_kind"] = "中央値" if r.get("median") else ("フォロワー数" if r.get("followers") else "なし")
        r["outlier"] = round(r["views"] / float(base), 2) if base else None
        r["formula_id"], r["formula"] = classify(r["hook"], formulas)
        r["chars"] = len(re.sub(r"\s", "", r["hook"]))
        r["hook_score"], r["hook_verdict"] = None, None
        if scorer is not None:
            try:
                result = scorer(r["hook"])
                r["hook_score"] = round(float(result[1]), 1)
                r["hook_verdict"] = result[2]
            except Exception as e:
                score_note = "hookscore.py の採点でエラーが出たため、一部の点数を省略しました（%s）。" % e
    ranked = sorted(rows, key=lambda r: -(r["outlier"] or 0))
    third = max(1, len(ranked) // 3)
    top, bottom = ranked[:third], ranked[-third:]

    def med(items, key):
        vals = [i[key] for i in items if i.get(key) is not None]
        return round(statistics.median(vals), 1) if vals else None

    counts = {}
    for r in top:
        counts[r["formula"]] = counts.get(r["formula"], 0) + 1
    return {
        "baseline": ("アカウントの中央値" if all_median else
                     "中央値とフォロワー数の混在（行ごとの基準は --json で確認）" if used_median else
                     "フォロワー数（中央値が無いため目安）"),
        "n": len(ranked),
        "accounts": len({r.get("account", "") for r in ranked if r.get("account", "")}),
        "reels": ranked,
        "top_formulas": sorted(counts.items(), key=lambda kv: -kv[1]),
        "top_hook_score": med(top, "hook_score"),
        "bottom_hook_score": med(bottom, "hook_score"),
        "top_chars": med(top, "chars"),
        "bottom_chars": med(bottom, "chars"),
        "unclassified": sum(1 for r in ranked if r["formula_id"] is None),
        "no_baseline": sum(1 for r in ranked if r["outlier"] is None),
        "score_note": score_note,
    }


def width(s):
    return sum(2 if unicodedata.east_asian_width(c) in ("F", "W") else 1 for c in s)


def fit(s, w):
    """表示幅 w に収まるよう切って、右を空白で埋める（全角は幅2）。"""
    out, cur = "", 0
    for c in s:
        cw = 2 if unicodedata.east_asian_width(c) in ("F", "W") else 1
        if cur + cw > w:
            break
        out += c
        cur += cw
    return out + " " * (w - cur)


def sample_comment(n, accounts):
    if n < 12:
        return "%d本だけでは傾向とは言えません。参考程度に見て、もっと集めてから判断してください。" % n
    if n < 40 or accounts < 6:
        return "%d本・%dアカウント。傾向の「当たり」はつけられますが、まだ断定はできません。" % (n, accounts)
    return "%d本・%dアカウント。手で集めた件数としては、ある程度の根拠になります。" % (n, accounts)


def render(a, skipped, out=sys.stdout):
    head = "ネタ帳（スワイプファイル） ・ %d本 ・ %dアカウント ・ 基準: %s" % (a["n"], a["accounts"], a["baseline"])
    line = "=" * 78
    print("\n" + head, file=out)
    print(line, file=out)
    for r in a["reels"]:
        mult = ("%.1f倍" % r["outlier"]) if r["outlier"] is not None else "基準なし"
        score = ("%.0f点" % r["hook_score"]) if r["hook_score"] is not None else "  -  "
        fid = ("#%s" % r["formula_id"]) if r["formula_id"] is not None else "-"
        print("  %s  %s  %s %s %s %s回" % (
            fit(mult, 9), fit(score, 5), fit(fid, 3), fit(r["formula"], 22),
            fit(r.get("account", ""), 16), format(r["views"], ",")), file=out)
        print("             「%s」" % r["hook"][:60], file=out)
    print("-" * 78, file=out)
    print("このまとまりで伸びているもの", file=out)
    if a["top_formulas"]:
        print("  倍率の上位3分の1に多い型:  " +
              "、".join("%s ×%d" % (n, c) for n, c in a["top_formulas"][:4]), file=out)
    if a["top_hook_score"] is not None and a["bottom_hook_score"] is not None:
        print("  フック点数の中央値:        上位 %.0f点 / 下位 %.0f点"
              % (a["top_hook_score"], a["bottom_hook_score"]), file=out)
    print("  フックの文字数の中央値:    上位 %s文字 / 下位 %s文字"
          % (a["top_chars"], a["bottom_chars"]), file=out)
    print("  型に当てはまらなかった:    %d本 / %d本。ここは手で読んでください。"
          "まだ一覧に無い型が隠れている場所です。" % (a["unclassified"], a["n"]), file=out)
    if a["no_baseline"]:
        print("  基準なし（中央値もフォロワー数も空）: %d本。倍率が出せないので最下位に置いています。"
              % a["no_baseline"], file=out)
    if skipped:
        print("  読み飛ばした・直した行:    %d件（詳しくはエラー出力を参照）" % len(skipped), file=out)
    print("\n  " + sample_comment(a["n"], a["accounts"]), file=out)
    print("  手で集めた記録は「手がかり」であって「証明」ではありません。\n", file=out)


def to_markdown(a):
    lines = ["# ネタ帳（スワイプファイル）", "",
             "%d本・%dアカウント。%sに対する倍率の順。" % (a["n"], a["accounts"], a["baseline"]),
             "", sample_comment(a["n"], a["accounts"]), ""]
    for r in a["reels"]:
        mult = ("%.1f倍" % r["outlier"]) if r["outlier"] is not None else "基準なし"
        fid = ("#%s " % r["formula_id"]) if r["formula_id"] is not None else ""
        lines.append("## %s  %s%s  （%s）" % (mult, fid, r["formula"], r.get("account", "")))
        base = format(r["baseline"], ",") if r["baseline"] else "なし"
        lines.append("- 再生数: %s回 / 基準（%s）: %s" % (format(r["views"], ","), r["baseline_kind"], base))
        if r["hook_score"] is not None:
            lines.append("- フック点数: %s / 文字数: %d" % (r["hook_score"], r["chars"]))
        else:
            lines.append("- 文字数: %d" % r["chars"])
        lines.append("- フック: 「%s」" % r["hook"])
        for key, label in (("on_screen", "冒頭テロップ"), ("length", "長さ"), ("cta", "最後のお願い"), ("url", "URL")):
            if r.get(key):
                lines.append("- %s: %s" % (label, r[key]))
        lines.append("")
    return "\n".join(lines) + "\n"


def main():
    setup_io()
    ap = argparse.ArgumentParser(description="集めたリールを「いつもの再生数の何倍か」で並べる。")
    ap.add_argument("input", nargs="?", default="-", help="タブ区切りのファイル（- なら標準入力）")
    ap.add_argument("--hooks", default=DEFAULT_HOOKS, help="insta-reel/hooks.json の場所")
    ap.add_argument("--out", help="ネタ帳を Markdown でここにも書き出す（例: ~/.claude/insta-ai-shain/swipe.md）")
    ap.add_argument("--json", action="store_true", help="結果を JSON で出す")
    args = ap.parse_args()

    formulas = load_formulas(os.path.expanduser(args.hooks))
    rows, skipped = read_rows(args.input)
    for line_no, reason in skipped:
        print("注意: %d行目: %s" % (line_no, reason), file=sys.stderr)
    if not rows:
        die("使える行が1本もありませんでした。タブ区切りで、少なくとも「再生数」と「フック」の列が必要です。", 2)

    scorer, scorer_note = load_scorer()
    a = analyse(rows, formulas, scorer)
    if scorer_note:
        print("お知らせ: " + scorer_note, file=sys.stderr)
    if a["score_note"]:
        print("お知らせ: " + a["score_note"], file=sys.stderr)

    if args.json:
        print(json.dumps(a, indent=2, ensure_ascii=False))
    else:
        render(a, skipped)
    if args.out:
        path = os.path.expanduser(args.out)
        try:
            folder = os.path.dirname(path)
            if folder:
                os.makedirs(folder, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(to_markdown(a))
        except OSError as e:
            die("ネタ帳を書き出せませんでした: %s" % e, 4)
        print("書き出しました: " + path, file=sys.stderr)


if __name__ == "__main__":
    main()
