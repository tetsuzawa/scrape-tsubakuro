## CLAUDE 向けメモ

Claude 等の LLM が本リポジトリで作業する際の最小限ガイド。

### 前提
- すべて日本語でコミュニケーション・コメントを書くこと。
- 依存インストールやネットワーク操作は、必要な場合のみ最小限で。

### 目的
- 燕山荘テント場の予約カレンダーを取得し、9/15（または指定日）が「◯/△」なら Slack 通知。
- 実行はローカル（Bun+Playwright）または Cloudflare Workers（HTTP直読み+cron）。

### ローカル（Bun + Playwright）
- 依存: `bun install && bunx playwright install chromium`
- 実行: `bun run src/index.ts --year 2025 --month 9 --day 15`
- 環境変数: `.env` に `SLACK_WEBHOOK_URL`、`HEADLESS`
- 出力: 標準出力に判定、標準エラーに月次カレンダー

### Cloudflare Workers
- コード: `src/worker.ts`, `src/cf/calendar.ts`
- cron: `wrangler.toml` の `triggers.crons`
- Secrets: `SLACK_WEBHOOK_URL` と手動実行鍵 `RUN_KEY`
- デプロイ: `bunx wrangler deploy`
- 手動トリガー: `POST /trigger?year=YYYY&month=M&day=D` に `X-Run-Key` を付与

### 開発ルール
- 型チェック必須: `bunx tsc -p .`
- 機密は Secrets/環境変数を利用。直書き禁止。
- 変更は最小差分で。README/AGENTS/CLAUDE を必要に応じて更新。

