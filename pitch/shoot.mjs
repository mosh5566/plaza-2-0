import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const BASE = process.env.BASE || 'http://localhost:5055';
await mkdir('shots', { recursive: true });

console.log('→ launching chromium');
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 414, height: 896 },
  deviceScaleFactor: 2,
  locale: 'he-IL',
  hasTouch: true,
  isMobile: true,
});
await ctx.addInitScript(() => { try { localStorage.setItem('plazaGuest', '1'); } catch (e) { } });
// Intercept /api/health so API.ok=false → IS_SERVER=false → app stays in DEMO mode
await ctx.route('**/api/health', route => route.fulfill({ status: 500, body: '' }));
const page = await ctx.newPage();
page.on('pageerror', e => console.warn('  page-error:', e.message));

console.log('→ loading', BASE);
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('.fb', { timeout: 20000 });
await page.waitForTimeout(900);
// Force demo mode (no server fetch → no 401 → no redirect to login)
await page.evaluate(() => { try { if (window.API) { window.API.ok = false; window.API.token = null; } } catch (e) { } });

async function eval_(fn) { await page.evaluate(fn); await page.waitForTimeout(500); }
async function shot(name) {
  await page.screenshot({ path: `shots/${name}.png` });
  console.log('  ✓', name);
}
async function close() {
  await page.evaluate(() => { try { closeSheet && closeSheet(); } catch (e) { } });
  await page.waitForTimeout(220);
}

// 1 — Feed
await shot('01-feed');

// 2 — Filter (normal)
await eval_(() => openFilter());
await shot('02-filter');

// 3 — Filter marketplace mode
await eval_(() => setFMode(true));
await shot('03-marketplace');
await close();

// 4 — Search
await eval_(() => go('search'));
await shot('04-search');

// 5 — Rooms list
await eval_(() => go('rooms'));
await shot('05-rooms');

// 6 — Specific room with scope lens
await eval_(() => enterRoom('tech'));
await page.waitForTimeout(800);
await shot('06-room');

// 7 — Video full-screen (scroll feed to video card)
await eval_(() => go('feed'));
await page.waitForTimeout(700);
await page.evaluate(() => {
  const vid = document.querySelector('.fbvideo');
  if (vid) vid.scrollIntoView({ behavior: 'instant', block: 'center' });
});
await page.waitForTimeout(900);
await shot('07-video');

// 8 — Create wizard
await eval_(() => go('create'));
await shot('08-create');

// 9 — Messages list (populate via contactSeller demo path)
await page.evaluate(() => {
  contactSeller('נועה', null, 'שלום! ראיתי את הפוסט שלך 👋');
});
await page.waitForTimeout(500);
await page.evaluate(() => {
  contactSeller('Lena Audio', null, 'שלום! מעוניין/ת ב: Sony WH-1000XM5');
});
await page.waitForTimeout(500);
await eval_(() => go('msgs'));
await shot('09-msgs');

// debug: probe state before shot 10
const dbg = await page.evaluate(() => ({
  oP: typeof window.openPChat,
  cS: typeof window.contactSeller,
  aM: typeof window.addMsg,
  pchats: (typeof S !== 'undefined' && S.pchats) ? S.pchats.length : 'no-S',
}));
console.log('  debug:', JSON.stringify(dbg));

// 10 — Open a private chat with an audio bubble
await eval_(() => { window.openPChat('נועה'); });
await page.evaluate(() => {
  const wav = 'data:audio/wav;base64,UklGRiwBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQgBAAB/f39/f39/f3//f3+Af3+AgH9/gIB/gIB/gIB/gIB/gIB/gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIB/';
  window.addMsg({ w: 'אתה', t: 'מעוניין/ת בעוד פרטים?' }, true);
  window.addMsg({ w: 'נועה', audio: wav });
});
await page.waitForTimeout(700);
await shot('10-chat');

// 11 — Recording overlay
await eval_(() => { try { showRecOv(); } catch (e) { } });
await page.waitForTimeout(500);
await shot('11-record');
await eval_(() => { try { hideRecOv(); } catch (e) { } });

// 12 — Business profile with tiles — use the demo PROF "Lena Audio" (openProfDemo)
await close();
await eval_(() => go('feed'));
await page.waitForTimeout(400);
await eval_(() => openProfDemo('Lena Audio'));
await page.waitForTimeout(700);
await shot('12-profile');

console.log('→ done');
await browser.close();
