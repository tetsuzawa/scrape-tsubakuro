# 燕山荘テント場 予約スクレイパー（Playwright）

9/15（または任意日）の予約状況が「◯ / △」のときに Slack へ通知します。

## セットアップ（ローカル実行 / Bun + Playwright）

1. Bun 1.1+ を用意（https://bun.sh/）
2. 依存インストール
   ```bash
   bun install
   bunx playwright install chromium
   ```
3. 環境変数
   - `.env` を作成（`.env.example` をコピー）
   ```env
   SLACK_WEBHOOK_URL=（Slack Incoming Webhook URL）
   HEADLESS=true  # デバッグ時は false
   ```

## 実行（ローカル）

- デフォルトは当年の 9/15 をチェック
  ```bash
  bun run src/index.ts
  ```
- 任意日を指定
  ```bash
  bun run src/index.ts --year 2025 --month 9 --day 15
  ```

## 仕組み（要点）
- `frameset` の `contents` フレームへ移動
- カレンダー（`#calendar-box`）内の指定日セルから記号（◯/△/満）を抽出
- 記号が「◯/△」なら Slack へ通知
 - stderr（標準エラー）に月次グリッドと各日一覧を出力

## 運用例（cron）
毎日 08:30 / 12:30 / 18:30 にチェック（JST で調整）
```cron
30 8,12,18 * * * cd /path/to/scrape-tsubakuro && /usr/bin/env NODE_ENV=production bun run src/index.ts --silent >> check.log 2>&1
```

## 注意
- 画面構造が変わると動かなくなる可能性があります。
- ネットワークやサイト側の負荷によっては失敗することがあります（リトライは必要に応じて追加してください）。

---

# Cloudflare Workers（cron）対応

ブラウザを使わずに HTTP 直読みでパースし、Cloudflare Workers の Scheduled Triggers で自動実行できます。

## セットアップ

1. 依存のインストール（ローカル作業マシン）
   ```bash
   bun install
   ```
2. Cloudflare アカウントにログイン
   ```bash
   bunx wrangler login
   ```
3. Slack Webhook をシークレットに設定
   ```bash
   bunx wrangler secret put SLACK_WEBHOOK_URL
   ```
4. スケジュール設定は `wrangler.toml` の `triggers.crons` を編集（UTC）。
   - 例: JST 08:30/12:30/18:30 → `23:30, 03:30, 09:30 UTC`
5. Secrets（手動トリガー用の鍵は任意）
   ```bash
   bunx wrangler secret put RUN_KEY
   ```
6. デプロイ
   ```bash
   bunx wrangler deploy
   ```

## 実装概要
- エントリ: `src/worker.ts`（`scheduled` ハンドラ）
- 取得/解析: `src/cf/calendar.ts`
- ログ: 週次グリッドと各日状況を `console.error` に出力（Wrangler `tail` で確認）
- 異常時: 例外を捕捉して Slack に失敗通知（Slack 側エラー時は Workers のログに記録）

## ローカルでのテスト
```bash
bunx wrangler dev --test-scheduled
```

## 手動トリガー（本番）
任意のタイミングで実行するエンドポイント `/trigger` を用意しています。

```bash
curl -X POST "https://<your-worker>.<subdomain>.workers.dev/trigger?year=2025&month=9&day=15" \
  -H "X-Run-Key: $RUN_KEY"
```
※ `RUN_KEY` は `wrangler secret put RUN_KEY` で設定した値。
