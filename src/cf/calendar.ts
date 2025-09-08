// Cloudflare Workers 環境で動く、HTTP直読みのカレンダーパース
// - fetch で contents 側のURLを取得
// - linkedom で DOM を構築し、#calendar-box の .day を解析

import { parseHTML } from 'linkedom';

export type MonthStatus = { year: number; month: number; days: Record<number, string | null> };

const CONTENTS_URL = 'https://enzanso-reservation.jp/reserve/enz0023.php?p=50';

export async function fetchMonthStatus(year?: number, month?: number): Promise<MonthStatus> {
  // まずはデフォルト（月指定なし）を取得
  const html0 = await fetchText(CONTENTS_URL);
  let ms = parseMonthStatus(html0);
  if (!year || !month) return ms;
  if (ms.year === year && ms.month === month) return ms;

  // ターゲット年月を要求してみる。サイト依存だが試行順でフォールバック。
  const ymd = `${year}${String(month).padStart(2, '0')}01`;
  const trials: Request[] = [
    // 推定1: POST フォーム送信（yoteibi）
    new Request(CONTENTS_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `yoteibi=${ymd}&move=true` }),
    // 推定2: POST（date）
    new Request(CONTENTS_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `date=${ymd}&move=true` }),
    // 推定3: GET（yoteibi）
    new Request(`${CONTENTS_URL}&yoteibi=${ymd}`),
    // 推定4: GET（date）
    new Request(`${CONTENTS_URL}&date=${ymd}`),
  ];

  for (const req of trials) {
    try {
      const html = await fetchText(req);
      ms = parseMonthStatus(html);
      if (ms.year === year && ms.month === month) return ms;
    } catch (_) {
      // 無視して次
    }
  }
  return ms; // 最後に取得したもの（一致しない場合は呼出側で扱う）
}

export function parseMonthStatus(html: string): MonthStatus {
  const { document } = parseHTML(html);
  const bodyText = document.body?.textContent || '';
  const m = bodyText.match(/(\d{4})年\s*(\d{1,2})月/);
  const year = m ? Number(m[1]) : new Date().getFullYear();
  const month = m ? Number(m[2]) : new Date().getMonth() + 1;

  const days: Record<number, string | null> = {};
  const dayDivs = document.querySelectorAll('#calendar-box .cal li div.day');
  dayDivs.forEach((el: any) => {
    const raw = (el.textContent || '').replace(/\s+/g, '');
    const dm = raw.match(/^(\d{1,2})(.*)$/);
    if (!dm) return; // 空白セル
    const d = Number(dm[1]);
    if (!d) return;
    let mark: string | null = null;
    const a = el.querySelector('a');
    if (a) {
      const t = (a.textContent || '').replace(/\s+/g, '');
      mark = t.replace(/^\d+/, '') || '◯';
    } else {
      const rest = dm[2] ?? '';
      if (rest.includes('満')) mark = '満';
      else if (rest.includes('◯')) mark = '◯';
      else if (rest.includes('△')) mark = '△';
      else mark = null;
    }
    days[d] = mark;
  });

  return { year, month, days };
}

async function fetchText(input: string | Request): Promise<string> {
  const res = await fetch(input, {
    headers: {
      'accept-language': 'ja-JP,ja;q=0.9,en;q=0.8',
      'user-agent': 'Mozilla/5.0 (compatible; TsubakuroChecker/1.0; +https://example.invalid)'
    },
    cf: { cacheTtl: 0, cacheEverything: false },
  } as any);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return await res.text();
}

