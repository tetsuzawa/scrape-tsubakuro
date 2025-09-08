// Cloudflare Workers entrypoint (Scheduled Trigger)
import { fetchMonthStatus } from './cf/calendar';

export interface Env {
  SLACK_WEBHOOK_URL: string;
  TARGET_YEAR?: string;
  TARGET_MONTH?: string; // default 9
  TARGET_DAY?: string;   // default 15
  RUN_KEY?: string;      // 手動実行用の簡易鍵
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const now = new Date();
    const year = Number(env.TARGET_YEAR || now.getFullYear());
    const month = Number(env.TARGET_MONTH || 9);
    const day = Number(env.TARGET_DAY || 15);
    await runOnce(year, month, day, env, ctx);
  },
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (url.pathname === '/trigger' && req.method !== 'OPTIONS') {
      // 簡易認証: ヘッダ X-Run-Key またはクエリ ?key=...
      const key = req.headers.get('X-Run-Key') || url.searchParams.get('key');
      if (!env.RUN_KEY || key !== env.RUN_KEY) {
        return new Response('unauthorized', { status: 401 });
      }
      const y = Number(url.searchParams.get('year')) || Number(env.TARGET_YEAR) || new Date().getFullYear();
      const m = Number(url.searchParams.get('month')) || Number(env.TARGET_MONTH) || 9;
      const d = Number(url.searchParams.get('day')) || Number(env.TARGET_DAY) || 15;
      const result = await runOnce(y, m, d, env, ctx);
      return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }
} satisfies ExportedHandler<Env>;

function logMonth(ms: { year: number; month: number; days: Record<number, string | null> }) {
  const y = ms.year, m = ms.month;
  const last = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay();
  console.error(`カレンダー: ${y}/${String(m).padStart(2,'0')}`);
  console.error('日 月 火 水 木 金 土');
  let line: string[] = [];
  for (let i = 0; i < firstDow; i++) line.push('   ');
  for (let d = 1; d <= last; d++) {
    const cell = `${String(d).padStart(2,' ')}${ms.days[d] ?? ' '}`;
    line.push(cell);
    if ((firstDow + d) % 7 === 0 || d === last) {
      console.error(line.join(' '));
      line = [];
    }
  }
  const pairs: string[] = [];
  for (let d = 1; d <= last; d++) pairs.push(`${String(d).padStart(2,'0')}:${ms.days[d] ?? ' '}`);
  console.error('各日状況: ' + pairs.join(', '));
}

async function notifySlack(webhookUrl: string, text: string) {
  if (!webhookUrl) return;
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`Slack通知失敗 status=${res.status} body=${body}`);
  }
}

async function notifySlackSafe(webhookUrl: string, text: string) {
  try {
    await notifySlack(webhookUrl, text);
  } catch (e: any) {
    console.error('[SLACK_NOTIFY_ERROR]', e?.message ?? e);
  }
}

async function safeText(res: Response) {
  try { return await res.text(); } catch { return '<no-body>'; }
}

async function runOnce(year: number, month: number, day: number, env: Env, ctx: ExecutionContext) {
  try {
    const ms = await fetchMonthStatus(year, month);
    logMonth(ms);
    if (ms.year !== year || ms.month !== month) {
      await notifySlackSafe(env.SLACK_WEBHOOK_URL, `警告: 取得月が想定外でした。expected=${year}/${month} actual=${ms.year}/${ms.month}`);
    }
    const mark = ms.days[day] ?? null;
    const baseMsg = `燕山荘テント場 予約状況 ${year}/${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}: ${mark ?? '不明'}`;
    if (mark === '◯' || mark === '△') {
      ctx.waitUntil(notifySlack(env.SLACK_WEBHOOK_URL, `${baseMsg}\nhttps://enzanso-reservation.jp/reserve/enz0010.php?p=50&type=10`));
    }
    return { year, month, day, mark };
  } catch (err: any) {
    await notifySlackSafe(env.SLACK_WEBHOOK_URL, `スクレイピング失敗: ${err?.message ?? err}`);
    console.error('[ERROR]', err);
    return { year, month, day, error: String(err?.message ?? err) } as any;
  }
}
