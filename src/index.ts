// エントリポイント: 指定日の空きが「◯/△」なら Slack に通知
// Bun では .env が自動で読み込まれるため dotenv は不要
import { checkAvailability } from './checker';
import { notifySlack } from './slack';

function parseArgs(argv: string[]) {
  // --year 2025 --month 9 --day 15 形式
  const map: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      map[a.slice(2)] = argv[i + 1];
      i++;
    }
  }
  const now = new Date();
  const year = Number(map.year || now.getFullYear());
  const month = Number(map.month || 9);
  const day = Number(map.day || 15);
  if (!year || !month || !day) throw new Error('引数エラー: year/month/day を確認してください');
  return { year, month, day } as const;
}

async function main() {
  const target = parseArgs(process.argv.slice(2));
  const res = await checkAvailability(target);

  const isNotify = res.mark === '◯' || res.mark === '△';
  const ymd = `${target.year}/${String(target.month).padStart(2, '0')}/${String(target.day).padStart(2, '0')}`;
  const baseMsg = `燕山荘テント場 予約状況 ${ymd}: ${res.mark ?? '不明'}`;
  // stderr にカレンダー月次サマリを出力
  printMonthStatusToStderr(res.monthStatus);

  console.log(baseMsg);
  if (isNotify) {
    await notifySlack(`${baseMsg}\n${res.pageUrl}`);
    console.log('Slack 通知を送信しました');
  } else {
    console.log('通知条件を満たさないため送信しません');
  }
}

main().catch(async (err) => {
  console.error('[ERROR]', err);
  // 失敗時通知（任意）: SLACK_WEBHOOK_URL が設定されている場合のみ
  try {
    if (process.env.SLACK_WEBHOOK_URL) {
      await notifySlack(`スクレイピング失敗: ${err?.message ?? err}`);
    }
  } catch (_) { /* noop */ }
  process.exit(1);
});

function printMonthStatusToStderr(ms: { year: number; month: number; days: Record<number, string | null> }) {
  const year = ms.year;
  const month = ms.month;
  const last = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  console.error(`カレンダー: ${year}/${String(month).padStart(2, '0')}`);
  console.error('日 月 火 水 木 金 土');
  let line: string[] = [];
  for (let i = 0; i < firstDow; i++) line.push('   ');
  for (let d = 1; d <= last; d++) {
    const mark = ms.days[d] ?? ' ';
    const cell = `${String(d).padStart(2, ' ')}${mark || ' '}`;
    line.push(cell);
    if ((firstDow + d) % 7 === 0 || d === last) {
      console.error(line.join(' '));
      line = [];
    }
  }
  console.error('各日状況:');
  const lines: string[] = [];
  for (let d = 1; d <= last; d++) {
    lines.push(`${String(d).padStart(2, '0')}:${ms.days[d] ?? ' '}`);
  }
  console.error(lines.join(', '));
}
