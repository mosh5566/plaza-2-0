import { chromium } from 'playwright';
import { resolve } from 'path';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const url = 'file:///' + resolve('pitch.html').replace(/\\/g, '/');
console.log('loading', url);
await page.goto(url);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500); // give fonts time to load
await page.pdf({
  path: 'PLAZA-Pitch-v2.pdf',
  width: '297mm',
  height: '210mm',
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  preferCSSPageSize: true,
});
console.log('✓ PDF written: PLAZA-Pitch.pdf');
await browser.close();
