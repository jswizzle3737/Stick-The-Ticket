import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const PORT = 8789;
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

describe('Stick the Ticket Web App Tests', () => {
  test('Page loads properly with header and trillium emblem', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://localhost:${PORT}/`);
    
    // Check title and header
    const title = await page.title();
    assert.match(title, /Stick the Ticket/i);

    const header = await page.locator('.header-title-wrap h1').innerText();
    assert.equal(header, 'Stick the Ticket');

    // Check trillium icon presence
    const trillium = await page.locator('.trillium-icon').first();
    assert.ok(await trillium.isVisible());
    await page.close();
  });

  test('Theme toggle switches between dark and light mode', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://localhost:${PORT}/`);
    
    const themeBtn = page.locator('#theme-toggle');
    const html = page.locator('html');

    // Default dark
    assert.equal(await html.getAttribute('data-theme'), 'dark');

    // Click to light
    await themeBtn.click();
    assert.equal(await html.getAttribute('data-theme'), 'light');
    assert.equal(await themeBtn.innerText(), 'Dark');

    // Click back to dark
    await themeBtn.click();
    assert.equal(await html.getAttribute('data-theme'), 'dark');
    assert.equal(await themeBtn.innerText(), 'Light');
    await page.close();
  });

  test('Navigation to POA Codes and search filtering works', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://localhost:${PORT}/`);

    // Click POA Codes tab
    await page.locator('.nav-btn[data-tab="charges"]').click();

    // Verify charge items are listed
    const cards = page.locator('.charge-card');
    const count = await cards.count();
    assert.ok(count >= 10, 'Expected at least 10 POA charges');

    // Search for speeding
    const searchInput = page.locator('#search-input');
    await searchInput.fill('speeding');
    await page.waitForTimeout(100);

    const filteredCount = await page.locator('.charge-card').count();
    assert.ok(filteredCount > 0 && filteredCount < count, 'Search should filter list');

    // Click on speeding row to view details
    await page.locator('.charge-card').first().click();
    
    // Detail view elements check
    const detailTitle = await page.locator('.detail-title').innerText();
    assert.match(detailTitle, /Speeding/i);

    // Verify Short-Form Wording box
    const wording = await page.locator('.wording-text').innerText();
    assert.match(wording, /Speeding/i);

    // Verify Essential Elements Checklist
    const elementItems = page.locator('.checklist-section').first().locator('.check-item');
    assert.ok(await elementItems.count() >= 3);

    // Test clicking a checklist item to verify
    const firstCheck = elementItems.first();
    assert.ok(!(await firstCheck.getAttribute('class')).includes('checked'));
    await firstCheck.click();
    assert.ok((await firstCheck.getAttribute('class')).includes('checked'));

    // Test Pinning / Sticking the charge
    const stickBtn = page.locator('#detail-stick');
    assert.equal(await stickBtn.innerText(), '+ Pin Charge');
    await stickBtn.click();
    assert.equal(await stickBtn.innerText(), '✓ Pinned');

    // Go to Pinned tab and verify it appears
    await page.locator('.nav-btn[data-tab="saved"]').click();
    const pinnedCards = page.locator('.charge-card');
    assert.equal(await pinnedCards.count(), 1);
    assert.match(await pinnedCards.first().innerText(), /Speeding/i);

    await page.close();
  });

  test('Evidence photos dialog opens and closes', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://localhost:${PORT}/`);

    const openPhotosBtn = page.locator('#open-photos');
    await openPhotosBtn.click();

    const dialog = page.locator('#photos');
    assert.ok(await dialog.isVisible());

    const closePhotosBtn = page.locator('#close-photos');
    await closePhotosBtn.click();
    assert.ok(!(await dialog.isVisible()));

    await page.close();
  });
});
