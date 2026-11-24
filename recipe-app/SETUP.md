# 公開と同期のセットアップ手順（Vercel + Supabase）

所要時間：30〜40分。費用：Vercel・Supabaseは無料枠。AIはスクショ1枚あたり約0.2円（前払い5ドルから）。

順番どおりに進めてください。途中でメモしておく値が4つあります。

| メモする値 | どこで手に入るか |
|---|---|
| ① Supabase の Project URL | 手順1 |
| ② Supabase の公開キー（Publishable key / anon key） | 手順1 |
| ③ Anthropic の APIキー | 手順2 |
| ④ 公開したアプリのURL | 手順3 |

> ①②は外に見えても問題ない値です。③は**誰にも見せないでください**（チャットにも貼らないでください）。

---

## 1. Supabase（データの保存先）

1. https://supabase.com で「Start your project」→ GitHubアカウントでサインアップ
2. 「New project」を作成
   - Name：`recipe-app`（何でもOK）
   - Database Password：自動生成のままでOK（使いません）
   - Region：**Northeast Asia (Tokyo)**
3. 作成が終わったら、左メニューの **SQL Editor** を開く
4. このフォルダの `supabase/schema.sql` の中身を全部コピーして貼り付け、**Run** を押す（「Success」と出ればOK）
5. 画面上部の **Connect** ボタン（または Project Settings → API Keys）から、次の2つをメモ
   - ① Project URL（`https://xxxx.supabase.co`）
   - ② Publishable key（`sb_publishable_...`）。無ければ anon key（`eyJ...` で始まる長い文字列）

### 1-追加. 共有リンク用の設定（共有機能を使う場合）

SQL Editor で新しい入力欄を開き、`supabase/002_share.sql` の中身を全部貼り付けて **Run** を押す（1回だけ）。

### 1-追加2. レシピ一覧の共有と「食べたい」リクエスト用の設定

SQL Editor で新しい入力欄を開き、`supabase/003_list_and_requests.sql` の中身を全部貼り付けて **Run** を押す（1回だけ）。

### 1-追加3. あとで登録ボックス用の設定

SQL Editor で `supabase/004_inbox.sql` の中身を全部貼り付けて **Run**（1回だけ）。

## 2. Anthropic（スクショ読み取りのAI）

AIを使わない場合（テキスト貼り付けだけで使う場合）はこの手順を飛ばしてOKです。

1. https://console.anthropic.com でアカウント作成
2. **Billing** でクレジットを購入（最低5ドル）
3. **Limits** で月の上限を設定しておくと安心（例：10ドル）
4. **API Keys** →「Create Key」→ 表示されたキー（`sk-ant-...`）を ③ としてメモ（一度しか表示されません）

## 3. Vercel（アプリの公開）

1. https://vercel.com で「Sign Up」→「Continue with GitHub」
2. 「Add New…」→「Project」→ リポジトリ `Private` の「Import」
   - 一覧に出ない場合は「Adjust GitHub App Permissions」からこのリポジトリへのアクセスを許可
3. 設定画面で：
   - **Root Directory**：「Edit」→ `recipe-app` を選ぶ
   - **Environment Variables** に次を追加

     | Key | Value |
     |---|---|
     | `VITE_SUPABASE_URL` | ① |
     | `VITE_SUPABASE_ANON_KEY` | ② |
     | `ANTHROPIC_API_KEY` | ③（AIを使わないなら不要） |
     | `ALLOWED_EMAILS` | 自分のメールアドレス（家族も使うならカンマ区切りで追加） |

4. **Deploy** を押す。1〜2分で完了し、`https://〜.vercel.app` のURLが出る → ④ としてメモ

> 公開されるのは GitHub の **main ブランチ** です。作業用ブランチの内容を main に取り込んでから（プルリクエストをマージ）デプロイしてください。

## 4. Supabase にアプリのURLを登録

1. Supabase の **Authentication → URL Configuration**
2. **Site URL** に ④ を入れて保存（確認メールのリンク先になります）

## 5. 自分のアカウントを作る

1. iPad/iPhoneの Safari で ④ を開く
2. 右上「ログイン」→ メールアドレスとパスワードを入れて「新規登録」
3. 届いた確認メールのリンクを開く → アプリに戻って「ログイン」
4. **他の人が登録できないようにする**：Supabase の **Authentication → Sign In / Providers** で「Allow new users to sign up」をオフ
   （家族の分も先に登録してからオフにしてください）

## 6. ホーム画面に追加

Safari の共有ボタン →「ホーム画面に追加」。以後はアイコンから起動します。
ホーム画面のアプリでも一度ログインしてください（Safariとは別扱いのため）。

---

## 困ったとき
- **「ログインしてください」と出て読み取れない**：設定画面からログインしてください（AIの不正利用を防ぐため、ログインが必要です）
- **同期エラー**：手順1-4のSQLを実行したか確認。設定画面の「今すぐ同期」で再試行できます
- **スクショ読み取りが失敗**：Vercel の Environment Variables に `ANTHROPIC_API_KEY` があるか、Anthropic にクレジットが残っているか確認。変数を変えたら Vercel で「Redeploy」が必要です
