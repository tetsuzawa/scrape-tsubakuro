// 予約カレンダーから指定日の記号を取得するロジック
// Playwright を用い、frameset 内の contents フレームにアクセスする。

import { chromium, firefox, webkit } from 'playwright';
import type { Page, Frame } from 'playwright';

export type MonthStatus = { year: number; month: number; days: Record<number, string | null> };

export type CheckResult = {
  mark: string | null; // "◯" | "△" | "満" | null
  pageUrl: string;
  monthStatus: MonthStatus;
};

export type TargetDate = { year: number; month: number; day: number };

const BASE_URL = 'https://enzanso-reservation.jp/reserve/enz0010.php?p=50&type=10';

export async function checkAvailability(target: TargetDate): Promise<CheckResult> {
  const headless = (process.env.HEADLESS ?? 'true') !== 'false';
  const browserName = (process.env.BROWSER || 'chromium') as 'chromium' | 'firefox' | 'webkit';
  const launcher = browserName === 'firefox' ? firefox : browserName === 'webkit' ? webkit : chromium;
  const browser = await launcher.launch({ headless });
  const page = await browser.newPage({ locale: 'ja-JP' });
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // contents フレームを取得
    const frame = await waitForContentsFrame(page);
    await frame.waitForSelector('#calendar-box', { timeout: 15000 });

    // ターゲットの年月まで移動
    await moveToYearMonth(frame, target.year, target.month);

    // 指定日の記号を抽出
    const mark = await extractMark(frame, target.day);
    const monthStatus = await extractMonthStatus(frame);
    return { mark, pageUrl: BASE_URL, monthStatus };
  } finally {
    await page.close();
    await browser.close();
  }
}

async function waitForContentsFrame(page: Page): Promise<Frame> {
  // Playwright には waitForFrame は無いため、polling で待機する
  await page.waitForLoadState('domcontentloaded');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const f = page.frame({ name: 'contents' });
    if (f) return f;
    await page.waitForTimeout(200);
  }
  throw new Error('contents フレームが見つかりません');
}

async function getDisplayedYearMonth(frame: Frame): Promise<{ y: number; m: number }> {
  // 画面内テキストから "2025年9月" を拾う。該当が複数あっても最初を採用。
  const ym = await frame.evaluate(() => {
    const text = document.body?.innerText ?? '';
    const m = text.match(/(\d{4})年\s*(\d{1,2})月/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]) };
  });
  if (!ym) throw new Error('表示中の年月を取得できませんでした');
  return ym;
}

async function moveToYearMonth(frame: Frame, year: number, month: number) {
  const target = year * 12 + month;
  for (let i = 0; i < 24; i++) {
    const { y, m } = await getDisplayedYearMonth(frame);
    const cur = y * 12 + m;
    if (cur === target) return;
    const dir = cur < target ? '次月' : '前月';
    await frame.locator(`text=${dir}`).first().click();
    // 月が切り替わるまで待機
    await frame.waitForFunction(({ prev }) => {
      const t = document.body?.innerText ?? '';
      const m = t.match(/(\d{4})年\s*(\d{1,2})月/);
      if (!m) return false;
      const cur = Number(m[1]) * 12 + Number(m[2]);
      return cur !== prev;
    }, { prev: cur });
  }
  throw new Error('年月移動が想定以上に繰り返されました');
}

async function extractMark(frame: Frame, day: number): Promise<string | null> {
  return await frame.evaluate((d) => {
    const nodes = Array.from(document.querySelectorAll('#calendar-box .cal li div.day')) as HTMLElement[];
    for (const el of nodes) {
      const txt = (el.textContent || '').replace(/\s+/g, '');
      if (txt.startsWith(String(d))) {
        const a = el.querySelector('a');
        if (a) {
          const t = (a.textContent || '').replace(/\s+/g, '');
          // 例: "15◯" → 記号部分
          return t.replace(/^\d+/, '') || '◯';
        }
        return txt.replace(/^\d+/, '') || null;
      }
    }
    return null;
  }, day);
}

async function extractMonthStatus(frame: Frame): Promise<MonthStatus> {
  return await frame.evaluate(() => {
    const text = document.body?.innerText ?? '';
    const m = text.match(/(\d{4})年\s*(\d{1,2})月/);
    const year = m ? Number(m[1]) : new Date().getFullYear();
    const month = m ? Number(m[2]) : new Date().getMonth() + 1;
    const days: Record<number, string | null> = {};
    const nodes = Array.from(document.querySelectorAll('#calendar-box .cal li div.day')) as HTMLElement[];
    for (const el of nodes) {
      const raw = (el.textContent || '').replace(/\s+/g, '');
      const dm = raw.match(/^(\d{1,2})(.*)$/);
      if (!dm) continue; // 空白セル
      const d = Number(dm[1]);
      if (!d) continue;
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
        else mark = null; // 記号なし
      }
      days[d] = mark;
    }
    return { year, month, days };
  });
}
