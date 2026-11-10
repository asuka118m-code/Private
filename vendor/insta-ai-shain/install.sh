#!/bin/bash
# インスタAI社員：13個のスキルを ~/.claude/skills/ に入れる
# 使い方：bash install.sh
# 終了コード 0=入った / 1=失敗 / 3=同じ名前のスキルがすでにある（何も変えていない）
# 最後に「インストール完了：13人」と出たときだけ成功。

SRC="$(cd "$(dirname "$0")" && pwd)"
NAMES="insta-reel insta-buzz insta-caption insta-carousel insta-story insta-profile insta-plan insta-natural insta-comment insta-reply insta-dm insta-remix insta-review"

fail() { echo "失敗：$1" >&2; exit 1; }

# 1. 前提
[ -n "$HOME" ] && [ -d "$HOME" ] || fail "ホームフォルダ（HOME）が見つかりません"
DEST="$HOME/.claude/skills"
DATA="$HOME/.claude/insta-ai-shain"
command -v python3 >/dev/null 2>&1 || fail "python3 がありません。Mac では「コマンドライン・デベロッパ・ツール」のインストール画面が出ることがあります。入れてからやり直してください"
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' >/dev/null 2>&1 \
  || fail "python3 が動かないか、古すぎます（3.8以上が必要）。Mac では「コマンドライン・デベロッパ・ツール」のインストール画面が出ることがあります"

# 2. 元のファイルがそろっているか
# フォルダの形（skills/<名前>/<ファイル>）と、共有リンク（Gist）用に1段に並べた形
# （<名前>__<ファイル>）の両方に対応する
if [ -d "$SRC/skills" ]; then
  LAYOUT=folders
  VOICE_SRC="$SRC/templates/voice.md"
else
  LAYOUT=flat
  VOICE_SRC="$SRC/templates__voice.md"
fi
for n in $NAMES; do
  if [ "$LAYOUT" = folders ]; then
    [ -f "$SRC/skills/$n/SKILL.md" ] || fail "元のファイルが欠けています：skills/$n/SKILL.md"
  else
    [ -f "$SRC/${n}__SKILL.md" ] || fail "元のファイルが欠けています：${n}__SKILL.md"
  fi
done
[ -f "$VOICE_SRC" ] || fail "元のファイルが欠けています：voice.md のひな形"

# 3. 同じ名前のスキルが無いか（あれば何もしないで止まる）
found=""
for n in $NAMES; do
  [ -e "$DEST/$n" ] && found="$found $n"
done
if [ -n "$found" ]; then
  echo "同じ名前のスキルがすでにあります：$found" >&2
  echo "上書きしないため、何も変えずに止まりました。" >&2
  exit 3
fi

# 4. コピー（1つでも失敗したら止まる）
mkdir -p "$DEST" || fail "$DEST を作れません"
for n in $NAMES; do
  [ -e "$DEST/$n" ] && fail "コピーの直前に $DEST/$n ができていました。上書きしないので止まります"
  if [ "$LAYOUT" = folders ]; then
    cp -R "$SRC/skills/$n" "$DEST/$n" || fail "コピーできません：$n（$n より前のものはコピー済み）"
  else
    mkdir "$DEST/$n" || fail "フォルダを作れません：$DEST/$n"
    for f in "$SRC/${n}__"*; do
      cp "$f" "$DEST/$n/$(basename "$f" | sed "s/^${n}__//")" || fail "コピーできません：$(basename "$f")（$n より前のものはコピー済み）"
    done
  fi
done

# 5. 入ったものを確かめる
python3 - "$DEST" <<'PY' || fail "入ったファイルの確認でNGが出ました（上のNGの行を見てください）"
import json, os, sys
root = sys.argv[1]
tools = {
    "insta-reel": ["hooks.json", "hookscore.py", "beats.py"],
    "insta-caption": ["caption.py"],
    "insta-natural": ["slop.json", "humanize.py", "detect.py"],
    "insta-buzz": ["swipe.py"],
    "insta-profile": ["rubric.json"],
}
names = ["insta-reel", "insta-buzz", "insta-caption", "insta-carousel", "insta-story",
         "insta-profile", "insta-plan", "insta-natural", "insta-comment", "insta-reply",
         "insta-dm", "insta-remix", "insta-review"]
bad = []
for n in names:
    p = os.path.join(root, n, "SKILL.md")
    if not os.path.isfile(p):
        bad.append(n + ": SKILL.md がありません")
        continue
    with open(p, encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    if len(lines) < 2 or lines[1].strip() != "name: " + n:
        bad.append(n + ": 2行目が「name: " + n + "」ではありません")
    tail = [l for l in lines if l.strip()]
    if not tail or tail[-1].strip() != "<!-- end: " + n + " -->":
        bad.append(n + ": 最後の行に終わりの印がありません（途中で切れている可能性）")
    for t in tools.get(n, []):
        tp = os.path.join(root, n, t)
        if not os.path.isfile(tp):
            bad.append(n + ": " + t + " がありません")
        elif t.endswith(".json"):
            try:
                with open(tp, encoding="utf-8") as fh:
                    json.load(fh)
            except ValueError as e:
                bad.append(n + ": " + t + " が壊れています（" + str(e) + "）")
for b in bad:
    print("NG " + b)
sys.exit(1 if bad else 0)
PY
echo "13個のファイル確認：OK"

# 6. 話し方プロフィールの置き場所（すでにあれば触らない）
mkdir -p "$DATA" || fail "$DATA を作れません"
if [ -e "$DATA/voice.md" ]; then
  echo "voice.md はすでにあるので、そのままにしました"
else
  cp "$VOICE_SRC" "$DATA/voice.md" || fail "voice.md のひな形を置けません"
  echo "voice.md のひな形を置きました：$DATA/voice.md"
fi

# 7. 道具を1回ずつ動かす（終了コード 0 か 1 は「動いた」。2以上は道具のエラー）
TMP="$(mktemp -d)" || fail "一時フォルダを作れません"
trap 'rm -rf "$TMP"' EXIT
printf '貯金ゼロだった私が、最初にやめたのはコンビニでした。\n毎日の150円が、1年で5万円になっていました。\nまずは1週間、寄らない日を作ってみて。\nコンビニをやめたら、貯金が始まりました。\n' > "$TMP/script.txt"
printf '貯金ゼロだった私が最初にやめたのはコンビニでした。\n\n毎日150円の寄り道が、1年で5万円に。\n\n#節約 #貯金\n' > "$TMP/caption.txt"

smoke() {
  label="$1"; shift
  out="$("$@" 2>&1)"; code=$?
  if [ "$code" -gt 1 ] || [ -z "$out" ]; then
    echo "$out" | tail -5 >&2
    fail "道具が動きません：$label（終了コード $code）"
  fi
  echo "道具の確認 OK：$label"
}
PYI="python3 -I"
smoke "フック採点"   $PYI "$DEST/insta-reel/hookscore.py" --hook "貯金ゼロだった私が、最初にやめたのはコンビニでした"
smoke "秒数の進行表" $PYI "$DEST/insta-reel/beats.py" "$TMP/script.txt" --target 15
smoke "キャプション" $PYI "$DEST/insta-caption/caption.py" "$TMP/caption.txt"
smoke "AIっぽさ消し" $PYI "$DEST/insta-natural/humanize.py" "$TMP/caption.txt"
smoke "AIっぽさ判定" $PYI "$DEST/insta-natural/detect.py" "$TMP/caption.txt"
printf '再生数\tフック\n12万\t貯金ゼロだった私が最初にやめたこと\n' > "$TMP/swipe.tsv"
smoke "ネタ帳"       $PYI "$DEST/insta-buzz/swipe.py" "$TMP/swipe.tsv"

echo "インストール完了：13人"
exit 0
