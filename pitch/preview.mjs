import { chromium } from 'playwright';
import { resolve } from 'path';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1320, height: 830 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const url = 'file:///' + resolve('pitch.html').replace(/\\/g, '/');
console.log('loading', url);
await page.goto(url);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);
const slides = await page.$$('.slide');
console.log('slides count:', slides.length);
for (const idx of [0, 1, 7, 8, 16, 18]) {
  if (slides[idx]) {
    await slides[idx].screenshot({ path: `preview-${idx + 1}.png` });
    console.log('captured preview-' + (idx + 1) + '.png');
  }
}
await browser.close();
