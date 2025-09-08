# プロジェクト運用ルール（AGENTS）

本リポジトリで作業するエージェント／開発者向けのガイドです。既存機能を壊さず、安全かつ再現可能な形で変更してください。

## 目的
- 「燕山荘テント場」のカレンダーから 9/15（または指定日）の空き状況を取得し、◯/△ の場合に Slack へ通知する。
- 実行形態は2系統:
  - ローカル実行（Bun + Playwright）
  - Cloudflare Workers（HTTP直読み + cron）

## 技術スタック
- 言語: TypeScript（コメント・ログは日本語）
- パッケージ/ランタイム: Bun 1.2+
- ローカル自動化: Playwright（ブラウザ依存）
- サーバレス: Cloudflare Workers + Wrangler（scheduled trigger）
- HTMLパース（Workers）: linkedom
- 通知: Slack Incoming Webhook

## ディレクトリ構成（要点）
- `src/checker.ts`: Playwright を使ったローカル用の取得ロジック
- `src/index.ts`: ローカル実行のエントリ。stderr に月次ログを出力
- `src/cf/calendar.ts`: Workers 用 HTTP 直読み + パース
- `src/worker.ts`: Workers エントリ（scheduled / 手動 `/trigger`）
- `wrangler.toml`: Workers 設定（cron/vars）

## コーディング方針
- 仕様変更/追加時は最小差分で。周辺の無関係な修正は避ける。
- 例外時は必ず原因がわかるメッセージを残す。
- Slack 通知は成功/失敗を検知。失敗時は Workers ログへ詳細を出力。
- DOM セレクタは `#calendar-box .cal li div.day` を基本とし、変化に備えたフォールバックを検討。
- ネットワーク処理はリトライを追加しやすい構造に保つ（必要時に導入）。

## 変更時のチェックリスト
- 型安全: `bunx tsc -p .` が通ること。
- 実行確認:
  - ローカル: `bunx playwright install chromium` 後、`bun run src/index.ts`
  - Workers: `bunx wrangler dev --test-scheduled`
- ドキュメント更新: README の手順、必要なら AGENTS/CLAUDE を更新。

## 禁則事項
- 機密の直書き（Webhook URL 等）は不可。必ず Secrets/環境変数を使用。
- 過剰なスクレイピング頻度は禁止。cron は 1日数回に留める。
- 無断で大規模なリファクタや依存追加を行わない。

## 作業フロー（提案）
1. 課題の再現・要件確認（必要ならログ強化）
2. 最小実装 → 型チェック → ローカル/Workersでの動作確認
3. README/設定更新 → PR 作成（変更点・動作確認手順を日本語で記載）

---

このガイドはプロジェクトの状況に応じて随時更新してください。

