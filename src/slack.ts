// Slack 通知モジュール
// Incoming Webhook を使用し、テキストを送信するだけの最小実装

export async function notifySlack(text: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) throw new Error('SLACK_WEBHOOK_URL が未設定です (.env を確認)');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) {
    const msg = await safeText(res);
    throw new Error(`Slack 通知失敗 status=${res.status} body=${msg}`);
  }
}

async function safeText(res: any) {
  try { return await res.text(); } catch { return '<no-body>'; }
}
