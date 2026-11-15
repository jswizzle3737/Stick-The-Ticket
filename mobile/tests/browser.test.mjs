import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const PORT = 8790;
let server;
let browser;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
};

before(async () => {
  const dir = new URL('..', import.meta.url).pathname;
  server = createServer(async (req, res) => {
    try {
      const pathname = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      const filePath = join(dir, pathname);
      const data = await readFile(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise(resolve => server.listen(PORT, resolve));
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

describe('Stick the Ticket Canvas Layout Tests (Exact 1:1 with Stick the Charge)', () => {
  test('Canvas screen element exists and initial loading clears', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.goto(`http://localhost:${PORT}/`);
    
    // Check title
    const title = await page.title();
    assert.match(title, /Stick the Ticket/i);

    // Canvas exists and has rendered
    const canvas = page.locator('#screen');
    assert.ok(await canvas.isVisible());

    // Loading overlay is cleared
    await page.waitForFunction(() => document.querySelector('#loading').textContent === '');

    // Photos button exists in camera bar
    const photosBtn = page.locator('#open-photos');
    assert.ok(await photosBtn.isVisible());

    await page.close();
  });

  test('Canvas navigation to POA charges and hit-testing works', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => document.querySelector('#loading').textContent === '');

    // Measure canvas dimensions
    const box = await page.locator('#screen').boundingBox();
    assert.ok(box.width > 280 && box.height > 500);

    // Click POA Code nav tab (middle tab in bottom bar)
    await page.mouse.click(195, 710);
    await page.waitForTimeout(200);

    // Open first row
    await page.mouse.click(195, 270);
    await page.waitForTimeout(200);

    // Save button (top right of detail bar)
    const saveBox = await page.evaluate(() => window.testClickables.find(c => c.w === 76));
    assert.ok(saveBox, 'Save button should be present on detail screen');
    await page.mouse.click(saveBox.x + 20, saveBox.y + 20);
    await page.waitForTimeout(200);

    // Check localStorage persistence
    const saved = await page.evaluate(() => localStorage.getItem('stick-the-ticket-saved'));
    assert.ok(saved && saved.length > 5, 'Charge should be saved in localStorage');

    await page.close();
  });

  test('Evidence photos dialog opens, displays UI, and closes', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://localhost:${PORT}/`);

    await page.locator('#open-photos').click();
    const dialog = page.locator('#photos');
    assert.ok(await dialog.isVisible());

    await page.locator('#close-photos').click();
    assert.ok(!(await dialog.isVisible()));

    await page.close();
  });
});
