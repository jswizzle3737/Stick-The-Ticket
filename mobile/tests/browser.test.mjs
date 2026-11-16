import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const PORT = 8790;
const CHROME_PATH =
  process.env.CHROME_PATH ||
  ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find(p => existsSync(p)) ||
  '/usr/bin/chromium';

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.errors = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        this.errors.push(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || 'exceptionThrown');
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
        this.errors.push((msg.params.args || []).map(a => a.value || a.description).join(' '));
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || 'Runtime evaluation error');
    }
    return res.result?.value;
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 80));
  }

  async typeText(text) {
    for (const ch of text) {
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch });
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', text: ch, unmodifiedText: ch, key: ch });
    }
    await new Promise(r => setTimeout(r, 80));
  }

  async wheelScroll(x, y, deltaY, waitMs = 80) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
  }

  async touchFlick(x, startY, endY, { steps = 5, stepMs = 15 } = {}) {
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: startY, id: 1 }]
    });
    for (let i = 1; i <= steps; i++) {
      await new Promise(r => setTimeout(r, stepMs));
      const y = Math.round(startY + ((endY - startY) * i) / steps);
      await this.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y, id: 1 }]
      });
    }
    await new Promise(r => setTimeout(r, 8));
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
  }

  async touchTap(x, y, holdMs = 35) {
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }]
    });
    if (holdMs > 0) await new Promise(r => setTimeout(r, holdMs));
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
  }

  async mouseDrag(x, startY, endY, { steps = 5, stepMs = 15 } = {}) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: startY, button: 'none' });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: startY, button: 'left', clickCount: 1 });
    for (let i = 1; i <= steps; i++) {
      await new Promise(r => setTimeout(r, stepMs));
      const y = Math.round(startY + ((endY - startY) * i) / steps);
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    }
    await new Promise(r => setTimeout(r, 8));
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: endY, button: 'left', clickCount: 1 });
  }

  close() {
    this.ws.close();
  }
}

let server;
let chromeProc;
let userDataDir;
let debugPort;

async function startChrome() {
  userDataDir = await mkdtemp(join(tmpdir(), 'stt-chrome-'));
  chromeProc = spawn(
    CHROME_PATH,
    [
      '--headless',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank'
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );

  const wsEndpoint = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Timed out starting Chromium: ${stderr}`)), 10000);
    chromeProc.stderr.on('data', chunk => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/[^\s]+)/);
      if (match) {
        debugPort = match[2];
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    chromeProc.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Chromium exited early (${code}): ${stderr}`));
    });
  });

  return wsEndpoint;
}

async function openPage(width = 390, height = 844) {
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json());
  const newTarget = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
  const client = new CDPClient(newTarget.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true
  });
  await client.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await new Promise(r => setTimeout(r, 350));
  const waitStart = Date.now();
  while (Date.now() - waitStart < 5000) {
    const ready = await client.eval(`document.querySelector('#loading')?.textContent === '' && Array.isArray(window.testClickables)`);
    if (ready) break;
    await new Promise(r => setTimeout(r, 50));
  }
  return {
    client,
    close: async () => {
      client.close();
      await fetch(`http://127.0.0.1:${debugPort}/json/close/${newTarget.id}`).catch(() => {});
    },
    targetCount: targets.length
  };
}

async function scrollUntilClickable(page, id, { minH = 16 } = {}) {
  let item = await page.client.eval(`window.testClickables.find(c => c.id === ${JSON.stringify(id)})`);
  if (item && item.h >= minH) return item;

  for (let i = 0; i < 16; i++) {
    await page.client.wheelScroll(180, 420, 110);
    item = await page.client.eval(`window.testClickables.find(c => c.id === ${JSON.stringify(id)})`);
    if (item && item.h >= minH) return item;
    const atBottom = await page.client.eval(
      '(() => { const s = window.testState; return s.tab === "settings" && !s.settingsSubView && s.settingsScrollY >= s.maxSettingsScrollY - 1; })()'
    );
    if (atBottom) break;
  }

  for (let i = 0; i < 16; i++) {
    await page.client.wheelScroll(180, 420, -110);
    item = await page.client.eval(`window.testClickables.find(c => c.id === ${JSON.stringify(id)})`);
    if (item && item.h >= minH) return item;
    const atTop = await page.client.eval(
      '(() => { const s = window.testState; return s.tab === "settings" && !s.settingsSubView && s.settingsScrollY <= 1; })()'
    );
    if (atTop) break;
  }

  return await page.client.eval(`window.testClickables.find(c => c.id === ${JSON.stringify(id)})`);
}

async function resetAppStorage(page) {
  await page.client.eval('localStorage.clear()');
  await page.client.send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 300));
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const ready = await page.client.eval(`document.querySelector('#loading')?.textContent === '' && Array.isArray(window.testClickables)`);
    if (ready) break;
    await new Promise(r => setTimeout(r, 50));
  }
}

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
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(PORT, resolve));
  await startChrome();
});

after(async () => {
  if (chromeProc) {
    chromeProc.kill('SIGKILL');
    await new Promise(r => setTimeout(r, 150));
  }
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true });
  if (server) await new Promise(resolve => server.close(resolve));
});

describe('Stick the Ticket Refined UI Tests', () => {
  test('Home screen renders without Photos bar and has balanced search pill', async () => {
    const page = await openPage(390, 844);
    try {
      const title = await page.client.eval('document.title');
      assert.match(title, /Stick the Ticket/i);

      const photosRemoved = await page.client.eval('!document.querySelector("#open-photos") && !document.querySelector("#photos")');
      assert.ok(photosRemoved, 'Photos button and dialog should be removed');

      const searchVisible = await page.client.eval('!document.querySelector("#search-input").hidden');
      assert.ok(searchVisible, 'Inline search input should be positioned on Home screen');

      const navTabs = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("nav-")).map(c => c.id)');
      assert.deepEqual(navTabs, ['nav-home', 'nav-charges', 'nav-saved', 'nav-settings']);

      const hasHeaderThemeToggle = await page.client.eval('window.testClickables.some(c => c.id === "theme-toggle")');
      assert.equal(hasHeaderThemeToggle, false, 'Top header must not contain theme-toggle button');
    } finally {
      await page.close();
    }
  });

  test('Inline search transitions smoothly from Home to POA Code without prompt() and filters charges', async () => {
    const page = await openPage(390, 844);
    try {
      const pill = await page.client.eval('window.testClickables.find(c => c.id === "home-search-pill")');
      await page.client.click(pill.x + pill.w / 2, pill.y + pill.h / 2);
      await page.client.typeText('stunt');

      const state = await page.client.eval('window.testState');
      assert.equal(state.tab, 'charges');
      assert.equal(state.query, 'stunt');

      const hasStunt = await page.client.eval('window.testClickables.some(c => c.id === "charge-HTA:172")');
      assert.ok(hasStunt, 'Searching "stunt" should show HTA:172');

      const clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      assert.ok(clearBtn, 'Clear button should appear when query is non-empty');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);

      const clearedState = await page.client.eval('window.testState');
      assert.equal(clearedState.query, '');
    } finally {
      await page.close();
    }
  });

  test('All 9 HTA category chips wrap cleanly onto 2 flush rows at 390px and 360px and filter charges', async () => {
    const page = await openPage(390, 844);
    try {
      const navCharges = await page.client.eval('window.testClickables.find(c => c.id === "nav-charges")');
      await page.client.click(navCharges.x + navCharges.w / 2, navCharges.y + navCharges.h / 2);

      const searchBox = await page.client.eval('window.testClickables.find(c => c.id === "charges-search-box")');
      const chips = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("chip-"))');
      assert.equal(chips.length, 9, 'All 9 HTA quick-click category chips must render');
      assert.deepEqual(
        chips.map(c => c.id),
        [
          'chip-all',
          'chip-speeding',
          'chip-signs',
          'chip-safety',
          'chip-licence',
          'chip-permits',
          'chip-equipment',
          'chip-commercial',
          'chip-parking'
        ]
      );

      const chipAll = chips.find(c => c.id === 'chip-all');
      assert.ok(chipAll.w > chipAll.h, `Expected All chip pill wider than tall (${chipAll.w}x${chipAll.h})`);

      const distinctRows = Array.from(new Set(chips.map(c => c.y))).sort((a, b) => a - b);
      assert.equal(distinctRows.length, 2, `Expected 9 HTA category chips on 2 clean rows at 390px, got ${distinctRows.length}`);
      const rows = distinctRows.map(y => chips.filter(c => c.y === y));
      assert.deepEqual(
        rows.map(r => r.map(c => c.id)),
        [
          ['chip-all', 'chip-speeding', 'chip-signs', 'chip-safety', 'chip-licence'],
          ['chip-permits', 'chip-equipment', 'chip-commercial', 'chip-parking']
        ]
      );
      assert.ok(rows[0][0].y >= searchBox.y + searchBox.h + 4, 'Row 1 must sit cleanly below search box');
      assert.ok(rows[1][0].y >= rows[0][0].y + rows[0][0].h + 4, 'Row 2 must sit cleanly below Row 1');
      for (const r of rows) {
        assert.ok(Math.abs(r[0].x - searchBox.x) <= 2, 'Chip row left edge must align with search box');
        const rightEdge = r[r.length - 1].x + r[r.length - 1].w;
        assert.ok(Math.abs(rightEdge - (searchBox.x + searchBox.w)) <= 2, 'Chip row right edge must align flush with search box');
      }

      const speedingChip = chips.find(c => c.id === 'chip-speeding');
      assert.ok(speedingChip, 'Speeding chip must be visible');
      await page.client.click(speedingChip.x + speedingChip.w / 2, speedingChip.y + speedingChip.h / 2);
      const speedingVisible = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-")).map(c => c.id)');
      assert.ok(speedingVisible.length >= 6, `Speeding chip should populate >= 6 visible rows, got ${speedingVisible.length}`);
      assert.deepEqual(
        speedingVisible.slice(0, 5),
        ['charge-HTA:128-15', 'charge-HTA:128-25', 'charge-HTA:128-40', 'charge-HTA:item-340', 'charge-HTA:item-340.1']
      );

      const signsChip = chips.find(c => c.id === 'chip-signs');
      assert.ok(signsChip, 'Signs & Lights chip must be visible');
      await page.client.click(signsChip.x + signsChip.w / 2, signsChip.y + signsChip.h / 2);
      const signsVisible = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-")).map(c => c.id)');
      assert.ok(signsVisible.includes('charge-HTA:136-1-a'), 'Signs & Lights chip should include HTA:136-1-a');

      const safetyChip = chips.find(c => c.id === 'chip-safety');
      assert.ok(safetyChip, 'Moving & Safety chip must be visible');
      await page.client.click(safetyChip.x + safetyChip.w / 2, safetyChip.y + safetyChip.h / 2);
      const safetyVisible = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-")).map(c => c.id)');
      assert.ok(safetyVisible.includes('charge-HTA:78.1-1'), 'Safety chip should include HTA:78.1-1');

      const licenceChip = await page.client.eval('window.testClickables.find(c => c.id === "chip-licence")');
      assert.ok(licenceChip, 'Licence chip must be visible');
      await page.client.click(licenceChip.x + licenceChip.w / 2, licenceChip.y + licenceChip.h / 2);
      const licenceVisible = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-")).map(c => c.id)');
      assert.ok(licenceVisible.includes('charge-HTA:32-1'), 'Licence chip should show HTA:32-1');

      const permitsChip = await page.client.eval('window.testClickables.find(c => c.id === "chip-permits")');
      assert.ok(permitsChip, 'Permits & Plates chip must be visible');
      await page.client.click(permitsChip.x + permitsChip.w / 2, permitsChip.y + permitsChip.h / 2);
      const permitsVisible = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-")).map(c => c.id)');
      assert.ok(permitsVisible.includes('charge-HTA:7-1-a'), 'Permits & Plates chip should include HTA:7-1-a');

      const equipChip = await page.client.eval('window.testClickables.find(c => c.id === "chip-equipment")');
      await page.client.click(equipChip.x + equipChip.w / 2, equipChip.y + equipChip.h / 2);
      const equipVisible = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-")).map(c => c.id)');
      assert.ok(equipVisible.length >= 6, 'Equipment chip should populate matching offences');

      const commChip = await page.client.eval('window.testClickables.find(c => c.id === "chip-commercial")');
      await page.client.click(commChip.x + commChip.w / 2, commChip.y + commChip.h / 2);
      const commVisible = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-")).map(c => c.id)');
      assert.ok(commVisible.length >= 6, 'Commercial / CMV chip should populate matching offences');

      const parkingChip = await page.client.eval('window.testClickables.find(c => c.id === "chip-parking")');
      assert.ok(parkingChip, 'Parking chip must be visible');
      await page.client.click(parkingChip.x + parkingChip.w / 2, parkingChip.y + parkingChip.h / 2);
      const parkingVisible = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-")).map(c => c.id)');
      assert.ok(parkingVisible.includes('charge-HTA:sched6-0.5'), 'Parking chip should include EV/King\'s Highway parking offences');
    } finally {
      await page.close();
    }

    const narrowPage = await openPage(360, 780);
    try {
      const navCharges = await narrowPage.client.eval('window.testClickables.find(c => c.id === "nav-charges")');
      await narrowPage.client.click(navCharges.x + navCharges.w / 2, navCharges.y + navCharges.h / 2);
      const searchBox = await narrowPage.client.eval('window.testClickables.find(c => c.id === "charges-search-box")');
      const chips = await narrowPage.client.eval('window.testClickables.filter(c => c.id.startsWith("chip-"))');
      const rowsY = Array.from(new Set(chips.map(c => c.y))).sort((a, b) => a - b);
      assert.equal(rowsY.length, 2, `Expected 2 quick-link rows at 360px, got ${rowsY.length}`);
      const rows = rowsY.map(y => chips.filter(c => c.y === y));
      assert.deepEqual(rows.map(r => r.length), [5, 4]);
      const chipAll = chips.find(c => c.id === 'chip-all');
      assert.ok(chipAll.w > chipAll.h, `Expected All chip wider than tall at 360px (${chipAll.w}x${chipAll.h})`);
      for (const r of rows) {
        assert.ok(Math.abs(r[0].x - searchBox.x) <= 2, '360px chip row left edge must align flush');
        const rightEdge = r[r.length - 1].x + r[r.length - 1].w;
        assert.ok(Math.abs(rightEdge - (searchBox.x + searchBox.w)) <= 2, '360px chip row right edge must align flush');
      }
    } finally {
      await narrowPage.close();
    }
  });

  test('Detail Save persists and POA Rules checklist tab works interactively', async () => {
    const page = await openPage(390, 844);
    try {
      const navCharges = await page.client.eval('window.testClickables.find(c => c.id === "nav-charges")');
      await page.client.click(navCharges.x + navCharges.w / 2, navCharges.y + navCharges.h / 2);

      const firstCharge = await page.client.eval('window.testClickables.find(c => c.id.startsWith("charge-"))');
      await page.client.click(firstCharge.x + firstCharge.w / 2, firstCharge.y + firstCharge.h / 2);

      const saveBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-save")');
      assert.ok(saveBtn);
      await page.client.click(saveBtn.x + saveBtn.w / 2, saveBtn.y + saveBtn.h / 2);

      const saved = await page.client.eval('localStorage.getItem("stick-the-ticket-saved")');
      assert.ok(saved && saved.length > 5);

      const backBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backBtn.x + backBtn.w / 2, backBtn.y + backBtn.h / 2);

      // Switch to Settings tab -> open POA Field Rules sub-view
      const navSettings = await page.client.eval('window.testClickables.find(c => c.id === "nav-settings")');
      await page.client.click(navSettings.x + navSettings.w / 2, navSettings.y + navSettings.h / 2);

      const openRules = await scrollUntilClickable(page, 'settings-open-rules');
      assert.ok(openRules, 'Settings must expose POA Field Rules sub-view entry');
      await page.client.click(openRules.x + openRules.w / 2, openRules.y + openRules.h / 2);

      const firstRule = await page.client.eval('window.testClickables.find(c => c.id === "rule-poa-1")');
      assert.ok(firstRule, 'First POA checklist rule should be rendered');
      await page.client.click(firstRule.x + firstRule.w / 2, firstRule.y + firstRule.h / 2);

      const ruleSaved = await page.client.eval('JSON.parse(localStorage.getItem("stick-the-ticket-poa-rules"))');
      assert.equal(ruleSaved['poa-1'], true);

      const rulesBack = await page.client.eval('window.testClickables.find(c => c.id === "settings-rules-back")');
      await page.client.click(rulesBack.x + rulesBack.w / 2, rulesBack.y + rulesBack.h / 2);

      // Toggle dark mode via Settings (no header theme-toggle)
      const themeBtn = await scrollUntilClickable(page, 'settings-theme-dark');
      assert.ok(themeBtn, 'Dark theme toggle must render inside Settings');
      await page.client.click(themeBtn.x + themeBtn.w / 2, themeBtn.y + themeBtn.h / 2);
      const themeAttr = await page.client.eval('document.documentElement.getAttribute("data-theme")');
      assert.equal(themeAttr, 'dark');
    } finally {
      await page.close();
    }
  });

  test('Closely fitted charge rows fit densely and detail Similar charges link in-app', async () => {
    const page = await openPage(390, 844);
    try {
      const navCharges = await page.client.eval('window.testClickables.find(c => c.id === "nav-charges")');
      await page.client.click(navCharges.x + navCharges.w / 2, navCharges.y + navCharges.h / 2);

      const visibleCharges = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-"))');
      assert.ok(visibleCharges.length >= 6, `Expected at least 6 tightly fitted charge rows visible, got ${visibleCharges.length}`);

      const firstCharge = visibleCharges[0];
      const initialId = firstCharge.id.replace('charge-', '');
      await page.client.click(firstCharge.x + firstCharge.w / 2, firstCharge.y + firstCharge.h / 2);

      let state = await page.client.eval('window.testState');
      assert.equal(state.openChargeId, initialId);
      assert.ok(state.maxDetailScrollY > 0, 'Detail view should allow scrolling to Similar charges');

      // Wheel scroll down to bottom of detail screen reliably
      for (let step = 0; step < 30; step++) {
        state = await page.client.eval('window.testState');
        if (state.detailScrollY >= state.maxDetailScrollY - 1) break;
        await page.client.wheelScroll(195, 422, 180);
      }
      await new Promise(r => setTimeout(r, 120));

      state = await page.client.eval('window.testState');
      assert.ok(state.detailScrollY >= state.maxDetailScrollY - 2, 'Detail view should scroll to the bottom');

      const similarLinks = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("similar-"))');
      assert.ok(similarLinks.length >= 2 && similarLinks.length <= 3, `Expected 2-3 similar charge links at bottom, got ${similarLinks.length}`);

      const firstSimilar = similarLinks[0];
      const targetId = firstSimilar.id.replace('similar-', '');
      await page.client.click(firstSimilar.x + firstSimilar.w / 2, firstSimilar.y + firstSimilar.h / 2);

      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeId, targetId, 'Clicking a similar charge should open it inside the app');
      assert.equal(state.detailScrollY, 0, 'Opening a similar charge should reset detail scroll to top');

      const backBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backBtn.x + backBtn.w / 2, backBtn.y + backBtn.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeId, null, 'Back button should return to the charge list');
    } finally {
      await page.close();
    }
  });

  test('Collapsible AppBar SearchView opens from Settings tab and collapses back cleanly', async () => {
    const page = await openPage(390, 844);
    try {
      // Switch to Settings tab
      const navSettings = await page.client.eval('window.testClickables.find(c => c.id === "nav-settings")');
      await page.client.click(navSettings.x + navSettings.w / 2, navSettings.y + navSettings.h / 2);

      const searchToggle = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      const hasHeaderThemeToggle = await page.client.eval('window.testClickables.some(c => c.id === "theme-toggle")');
      assert.ok(searchToggle, 'AppBar collapsible search toggle must render on Settings tab');
      assert.equal(hasHeaderThemeToggle, false, 'Top header must remain uncluttered without theme-toggle');

      await page.client.click(searchToggle.x + searchToggle.w / 2, searchToggle.y + searchToggle.h / 2);
      let state = await page.client.eval('window.testState');
      assert.equal(state.appBarSearchOpen, true, 'Tapping header search toggle opens AppBar SearchView');
      assert.equal(state.searchOriginTab, 'settings');

      const closeBtn = await page.client.eval('window.testClickables.find(c => c.id === "header-search-close")');
      assert.ok(closeBtn, 'Collapse back button should appear in expanded AppBar SearchView');
      const starters = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-starter-"))');
      const statutes = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-statute-"))');
      assert.ok(starters.length >= 6, 'Zero-query AppBar SearchView should show suggested topics');
      assert.equal(statutes.length, 1, 'Zero-query AppBar SearchView should show only HTA statute');
      assert.equal(statutes[0].id, 'search-statute-HTA');

      await page.client.click(closeBtn.x + closeBtn.w / 2, closeBtn.y + closeBtn.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.appBarSearchOpen, false, 'Collapse arrow returns from SearchView');
      assert.equal(state.tab, 'settings', 'Collapsing SearchView restores originating tab');
    } finally {
      await page.close();
    }
  });

  test('Predictive search completions and recent query suggestions work across AppBar and inline popover', async () => {
    const page = await openPage(390, 844);
    try {
      const toggle = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      await page.client.click(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);
      await page.client.typeText('dis');

      const predictions = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("predict-"))');
      assert.ok(predictions.length >= 2, `Expected predictive completion chips for "dis", got ${predictions.length}`);

      // Click first prediction and confirm recent query recorded
      await page.client.click(predictions[0].x + predictions[0].w / 2, predictions[0].y + predictions[0].h / 2);
      let state = await page.client.eval('window.testState');
      assert.ok(state.query.length > 3, 'Clicking predictive completion expands query');
      assert.ok(state.recentSearches.length >= 1, 'Applying prediction records recent query');

      // Clear search -> recent item appears in AppBar zero-query screen
      const clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      const recentRow = await page.client.eval('window.testClickables.find(c => c.id === "recent-item-0")');
      assert.ok(recentRow, 'Recorded recent search must appear in AppBar zero-query list');

      // Collapse SearchView to Home, focus Home search pill -> floating popover displays recent suggestion
      const closeBtn = await page.client.eval('window.testClickables.find(c => c.id === "header-search-close")');
      await page.client.click(closeBtn.x + closeBtn.w / 2, closeBtn.y + closeBtn.h / 2);
      const pill = await page.client.eval('window.testClickables.find(c => c.id === "home-search-pill")');
      await page.client.click(pill.x + pill.w / 2, pill.y + pill.h / 2);

      const popoverItem = await page.client.eval('window.testClickables.find(c => c.id === "popover-suggestion-0")');
      assert.ok(popoverItem, 'Home search focus must display recent search suggestion popover');
      await page.client.click(popoverItem.x + popoverItem.w / 2, popoverItem.y + popoverItem.h / 2);

      state = await page.client.eval('window.testState');
      assert.equal(state.tab, 'charges', 'Clicking suggestion from Home transitions to POA Code results');
      assert.ok(state.query.length > 3, 'Clicking popover suggestion populates query cleanly');

      // Also verify multi-token natural alias query ("Handheld phone")
      const clearInline = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearInline.x + clearInline.w / 2, clearInline.y + clearInline.h / 2);
      await page.client.typeText('Handheld phone');
      const handheldMatch = await page.client.eval('window.testClickables.find(c => c.id === "charge-HTA:78.1-1")');
      assert.ok(handheldMatch, 'Multi-word alias query "Handheld phone" should match HTA:78.1-1');
    } finally {
      await page.close();
    }
  });

  test('Contextual search cards render expanded metadata and Back preserves search query & scroll position', async () => {
    const page = await openPage(390, 844);
    try {
      // Compare browse row height vs rich contextual search row height
      const navCharges = await page.client.eval('window.testClickables.find(c => c.id === "nav-charges")');
      await page.client.click(navCharges.x + navCharges.w / 2, navCharges.y + navCharges.h / 2);
      const browseRow = await page.client.eval('window.testClickables.find(c => c.id.startsWith("charge-"))');
      assert.ok(browseRow.h <= 62, `Browse rows should remain compact, got height ${browseRow.h}`);

      // Open collapsible AppBar SearchView and search a broad keyword so results scroll
      const toggle = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      await page.client.click(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);
      await page.client.typeText('drive');

      const searchRow = await page.client.eval('window.testClickables.find(c => c.id.startsWith("search-result-"))');
      assert.ok(searchRow && searchRow.h >= 72, `Contextual search rows should expand for snippet/statute/fine/points pills, got height ${searchRow?.h}`);

      // Scroll AppBar SearchView results down meaningfully
      for (let step = 0; step < 3; step++) {
        await page.client.wheelScroll(195, 422, 95);
      }
      await new Promise(r => setTimeout(r, 120));

      let state = await page.client.eval('window.testState');
      assert.ok(state.searchScrollY > 100, `Expected searchScrollY > 100 after wheel scroll, got ${state.searchScrollY}`);
      const expectedScrollY = state.searchScrollY;

      // Pick a middle visible result row and open it
      const visibleResults = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-"))');
      const targetRow = visibleResults[Math.min(2, visibleResults.length - 1)];
      await page.client.click(targetRow.x + targetRow.w / 2, targetRow.y + targetRow.h / 2);

      state = await page.client.eval('window.testState');
      assert.ok(state.openChargeId, 'Clicking a search result must open charge detail');

      // 1) Tap UI Back button -> returns to SearchView with query + exact scroll preserved
      const detailBack = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(detailBack.x + detailBack.w / 2, detailBack.y + detailBack.h / 2);
      await new Promise(r => setTimeout(r, 150));

      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeId, null);
      assert.equal(state.appBarSearchOpen, true);
      assert.equal(state.query, 'drive');
      assert.equal(state.searchScrollY, expectedScrollY, 'detail-back must preserve exact searchScrollY');

      // 2) Re-open charge and test browser/system history.back() -> preserves exact scroll too
      const reopenedRow = (await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-"))'))[Math.min(2, visibleResults.length - 1)];
      await page.client.click(reopenedRow.x + reopenedRow.w / 2, reopenedRow.y + reopenedRow.h / 2);
      state = await page.client.eval('window.testState');
      assert.ok(state.openChargeId);

      await page.client.eval('window.history.back()');
      await new Promise(r => setTimeout(r, 180));

      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeId, null, 'Browser back must close charge detail');
      assert.equal(state.appBarSearchOpen, true, 'Browser back must return to AppBar SearchView');
      assert.equal(state.query, 'drive');
      assert.equal(state.searchScrollY, expectedScrollY, 'Browser back must preserve exact searchScrollY');

      // 3) Collapse AppBar SearchView and verify inline POA Code scrolled search preserves listScrollY too
      const closeBtn = await page.client.eval('window.testClickables.find(c => c.id === "header-search-close")');
      await page.client.click(closeBtn.x + closeBtn.w / 2, closeBtn.y + closeBtn.h / 2);
      const inlineBox = await page.client.eval('window.testClickables.find(c => c.id === "charges-search-box")');
      await page.client.click(inlineBox.x + inlineBox.w / 2, inlineBox.y + inlineBox.h / 2);
      await page.client.typeText('drive');

      for (let step = 0; step < 3; step++) {
        await page.client.wheelScroll(195, 500, 95);
      }
      await new Promise(r => setTimeout(r, 120));
      state = await page.client.eval('window.testState');
      assert.ok(state.listScrollY > 90, `Expected inline search listScrollY > 90, got ${state.listScrollY}`);
      const expectedListScroll = state.listScrollY;

      const inlineRows = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-"))');
      const inlineTarget = inlineRows[Math.min(2, inlineRows.length - 1)];
      await page.client.click(inlineTarget.x + inlineTarget.w / 2, inlineTarget.y + inlineTarget.h / 2);
      const inlineBack = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(inlineBack.x + inlineBack.w / 2, inlineBack.y + inlineBack.h / 2);
      await new Promise(r => setTimeout(r, 150));

      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeId, null);
      assert.equal(state.tab, 'charges');
      assert.equal(state.query, 'drive');
      assert.equal(state.listScrollY, expectedListScroll, 'detail-back must preserve exact inline search listScrollY');
      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });

  test('1006-offence HTA-only import excludes repealed items and non-HTA laws, computes Part I/II/III/Tariff fines with verbatim text', async () => {
    const page = await openPage(390, 844);
    try {
      let state = await page.client.eval('window.testState');
      assert.equal(state.chargeCount, 1006, 'Total HTA dataset must contain 1006 charges');
      assert.equal(state.statuteCount, 1, 'Should contain only HTA statute');

      const toggle = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      await page.client.click(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);

      // Verify repealed items (69.1, 236-252, 497.1) are excluded
      await page.client.typeText('item 236');
      let results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-"))');
      assert.equal(results.length, 0, 'Repealed item 236 must be excluded from dataset');

      const clearEmpty = await page.client.eval('window.testClickables.find(c => c.id === "search-empty-clear")');
      await page.client.click(clearEmpty.x + clearEmpty.w / 2, clearEmpty.y + clearEmpty.h / 2);
      await page.client.typeText('item 69.1');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-"))');
      assert.equal(results.length, 0, 'Repealed item 69.1 must be excluded from dataset');

      const clearEmptyR = await page.client.eval('window.testClickables.find(c => c.id === "search-empty-clear")');
      await page.client.click(clearEmptyR.x + clearEmptyR.w / 2, clearEmptyR.y + clearEmptyR.h / 2);
      await page.client.typeText('item 497.1');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-"))');
      assert.equal(results.length, 0, 'Repealed item 497.1 must be excluded from dataset');

      // Verify non-HTA statutes (CAIA, LLCA, TTPA, CCA) are removed
      const clearEmpty2 = await page.client.eval('window.testClickables.find(c => c.id === "search-empty-clear")');
      await page.client.click(clearEmpty2.x + clearEmpty2.w / 2, clearEmpty2.y + clearEmpty2.h / 2);
      await page.client.typeText('CAIA');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-"))');
      assert.equal(results.length, 0, 'CAIA statute should be removed');

      const clearEmpty3 = await page.client.eval('window.testClickables.find(c => c.id === "search-empty-clear")');
      await page.client.click(clearEmpty3.x + clearEmpty3.w / 2, clearEmpty3.y + clearEmpty3.h / 2);
      await page.client.typeText('open liquor');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-"))');
      assert.equal(results.length, 0, 'LLCA open liquor charges should be removed');

      // Verify 78.1(1) Part I + nested OR options
      const clearEmpty4 = await page.client.eval('window.testClickables.find(c => c.id === "search-empty-clear")');
      await page.client.click(clearEmpty4.x + clearEmpty4.w / 2, clearEmpty4.y + clearEmpty4.h / 2);
      await page.client.typeText('78.1(1)');

      const target = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:78.1-1")');
      assert.ok(target, 'Searching "78.1(1)" must find upgraded HTA:78.1-1 offence');
      await page.client.click(target.x + target.w / 2, target.y + target.h / 2);

      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeId, 'HTA:78.1-1');
      assert.equal(state.openChargeSetFine, 500);
      assert.equal(state.openChargeTotalPayable, 615, 'Total payable must auto-calculate $500 set fine + $110 VFS + $5 court cost = $615');
      assert.equal(state.openChargePoints, 3, 'Handheld communication device must retain 3 demerit points');
      assert.equal(state.openChargeHasStatuteText, true, 'Imported Doc charge must expose full verbatim statutoryText');
      assert.equal(state.openChargeStatuteItalic, true, 'Verbatim statutory text must wrap and render in italics');
      assert.equal(state.openChargeHasOptions, true, 'HTA:78.1-1 must expose nested OR options');
      assert.equal(state.openChargeElementsCount, 4);

      // Verify promoted Seatbelt 106(2) -> HTA:106-2 ($200 -> $240, 2 pts)
      let backBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backBtn.x + backBtn.w / 2, backBtn.y + backBtn.h / 2);
      let clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('106(2)');
      const seatbeltRow = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:106-2")');
      assert.ok(seatbeltRow, 'Searching "106(2)" must find promoted HTA:106-2');
      await page.client.click(seatbeltRow.x + seatbeltRow.w / 2, seatbeltRow.y + seatbeltRow.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeSetFine, 200);
      assert.equal(state.openChargeTotalPayable, 240);
      assert.equal(state.openChargePoints, 2);
      assert.equal(state.openChargeStatuteItalic, true);

      // Verify Schedule 7 Part II PIN (Reg. 604 s. 2 -> HTA:sched7-1, $25 set fine & $25 total, no Part I surcharge)
      backBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backBtn.x + backBtn.w / 2, backBtn.y + backBtn.h / 2);
      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('Sched 7 Item 1');
      const sched7Row = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:sched7-1")');
      assert.ok(sched7Row, 'Searching "Sched 7 Item 1" must find HTA:sched7-1');
      await page.client.click(sched7Row.x + sched7Row.w / 2, sched7Row.y + sched7Row.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeSetFine, 25);
      assert.equal(state.openChargeTotalPayable, 25, 'Part II Parking Infraction Notice has no Part I court cost or VFS');
      assert.equal(state.openChargeHasStatuteText, true);
      assert.equal(state.openChargeStatuteItalic, true);

      // Verify Part III Fail to remain (item 545 -> HTA:item-545, 7 pts, Court Summons)
      backBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backBtn.x + backBtn.w / 2, backBtn.y + backBtn.h / 2);
      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('200(1)(a)');
      const failRemainRow = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:item-545")');
      assert.ok(failRemainRow, 'Searching "200(1)(a)" must find HTA:item-545 Fail to remain');
      await page.client.click(failRemainRow.x + failRemainRow.w / 2, failRemainRow.y + failRemainRow.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeSetFine, null);
      assert.equal(state.openChargePoints, 7);
      assert.match(String(state.openChargeTotalPayable), /Court Summons.*\$400/);
      assert.equal(state.openChargeStatuteItalic, true);

      // Verify Statutory Part III (s. 9.1(1) -> HTA:stat-9.1-1)
      backBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backBtn.x + backBtn.w / 2, backBtn.y + backBtn.h / 2);
      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('9.1(1)');
      const statRow = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:stat-9.1-1")');
      assert.ok(statRow, 'Searching "9.1(1)" must find Statutory Part III HTA:stat-9.1-1');
      await page.client.click(statRow.x + statRow.w / 2, statRow.y + statRow.h / 2);
      state = await page.client.eval('window.testState');
      assert.match(String(state.openChargeTotalPayable), /Court Summons.*\$50,000/);
      assert.equal(state.openChargeHasStatuteText, true);
      assert.equal(state.openChargeStatuteItalic, true);

      // Verify fallback statutory body (HTA:128-15 without statutoryText field) also renders italicized
      backBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backBtn.x + backBtn.w / 2, backBtn.y + backBtn.h / 2);
      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('15 km/h over');
      const speedBracketRow = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:128-15")');
      assert.ok(speedBracketRow, 'Speeding bracket HTA:128-15 should be searchable');
      await page.client.click(speedBracketRow.x + speedBracketRow.w / 2, speedBracketRow.y + speedBracketRow.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeStatuteItalic, true, 'Fallback statutory body text must also render in italics');

      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });

  test('Interactive nested OR options persist state and external e-Laws fallbacks render at bottom', async () => {
    const page = await openPage(390, 844);
    try {
      const toggle = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      await page.client.click(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);
      await page.client.typeText('78.1(1)');

      const target = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:78.1-1")');
      await page.client.click(target.x + target.w / 2, target.y + target.h / 2);

      // Locate nested radio OR-option element-e3-opt-0 (scroll gently if below fold)
      let optBtn = await page.client.eval('window.testClickables.find(c => c.id === "element-e3-opt-0")');
      for (let i = 0; i < 4 && !optBtn; i++) {
        await page.client.wheelScroll(195, 422, 120);
        optBtn = await page.client.eval('window.testClickables.find(c => c.id === "element-e3-opt-0")');
      }
      assert.ok(optBtn, 'Nested radio option element-e3-opt-0 must render for HTA:78.1-1');
      await page.client.click(optBtn.x + optBtn.w / 2, optBtn.y + optBtn.h / 2);

      let checks = await page.client.eval('JSON.parse(localStorage.getItem("stick-the-ticket-checks") || "{}")');
      assert.equal(checks['HTA:78.1-1']?.['e3:0'], true, 'Clicking OR option must persist option selection');
      assert.equal(checks['HTA:78.1-1']?.e3, true, 'Selecting an OR option must auto-check parent element e3');

      await page.client.click(optBtn.x + optBtn.w / 2, optBtn.y + optBtn.h / 2);
      checks = await page.client.eval('JSON.parse(localStorage.getItem("stick-the-ticket-checks") || "{}")');
      assert.equal(checks['HTA:78.1-1']?.['e3:0'], false);
      assert.equal(checks['HTA:78.1-1']?.e3, false, 'Deselecting last OR option must uncheck parent element e3');

      // Scroll all the way down past full statutory text to Similar charges
      for (let step = 0; step < 30; step++) {
        const st = await page.client.eval('window.testState');
        if (st.detailScrollY >= st.maxDetailScrollY - 1) break;
        await page.client.wheelScroll(195, 422, 180);
      }
      await new Promise(r => setTimeout(r, 120));

      const simEnt = await page.client.eval('window.testClickables.find(c => c.id === "similar-HTA:item-223")');
      assert.ok(simEnt, 'HTA:78.1-1 should show in-app similar link HTA:item-223');
      await page.client.click(simEnt.x + simEnt.w / 2, simEnt.y + simEnt.h / 2);
      let state = await page.client.eval('window.testState');
      assert.equal(state.openChargeId, 'HTA:item-223');

      // Check external e-Laws fallback card on HTA:item-13 (s. 7(15))
      const backBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backBtn.x + backBtn.w / 2, backBtn.y + backBtn.h / 2);
      const clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('7(15)');

      const item13Row = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:item-13")');
      assert.ok(item13Row, 'Searching "7(15)" should find HTA:item-13');
      await page.client.click(item13Row.x + item13Row.w / 2, item13Row.y + item13Row.h / 2);

      for (let step = 0; step < 30; step++) {
        const st = await page.client.eval('window.testState');
        if (st.detailScrollY >= st.maxDetailScrollY - 1) break;
        await page.client.wheelScroll(195, 422, 180);
      }
      await new Promise(r => setTimeout(r, 120));

      const extFallback = await page.client.eval('window.testClickables.find(c => c.id === "related-ext-0")');
      assert.ok(extFallback, 'HTA:item-13 must render external Ontario e-Laws fallback card at bottom');
      const simLinks = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("similar-"))');
      assert.ok(simLinks.length >= 2, 'HTA:item-13 should also render at least 2 in-app similar charges');
      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });

  test('Keyword alias searches match imported offences cleanly with zero runtime errors', async () => {
    const page = await openPage(390, 844);
    try {
      const toggle = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      await page.client.click(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);

      await page.client.typeText('radar detector');
      const radarMatch = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:item-225")');
      assert.ok(radarMatch, '"radar detector" alias must match HTA:item-225');

      const clear1 = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clear1.x + clear1.w / 2, clear1.y + clear1.h / 2);
      await page.client.typeText('window tint');
      const tintMatch = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:item-195")');
      assert.ok(tintMatch, '"window tint" alias must match HTA:item-195');

      const clear2 = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clear2.x + clear2.w / 2, clear2.y + clear2.h / 2);
      await page.client.typeText('move over');
      const moveMatch = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:item-468")');
      assert.ok(moveMatch, '"move over" alias must match HTA:item-468');

      const clear3 = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clear3.x + clear3.w / 2, clear3.y + clear3.h / 2);
      await page.client.typeText('84(1)');
      const unsafeMatch = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:item-228")');
      assert.ok(unsafeMatch, '"84(1)" must match HTA:item-228');

      // Open HTA:item-228 (Summons offence without points) and verify clean state
      await page.client.click(unsafeMatch.x + unsafeMatch.w / 2, unsafeMatch.y + unsafeMatch.h / 2);
      const state = await page.client.eval('window.testState');
      assert.equal(state.openChargeId, 'HTA:item-228');
      assert.equal(state.openChargeSetFine, null);
      assert.equal(state.openChargePoints, null);
      assert.equal(state.openChargeHasStatuteText, true);
      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });

  test('Bidirectional Element -> Charge search finds charges by proof ingredients, handles folding/plurals, and demotes boilerplate glosses', async () => {
    const page = await openPage(390, 844);
    try {
      const toggle = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      await page.client.click(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);

      // 1. Element-fact starter pill ("15 cm of curb" at search-starter-9) finds Parking—improper parallel
      const curbStarter = await page.client.eval('window.testClickables.find(c => c.id === "search-starter-9")');
      assert.ok(curbStarter, 'Zero-query AppBar SearchView must show element starter pill "15 cm of curb"');
      await page.client.click(curbStarter.x + curbStarter.w / 2, curbStarter.y + curbStarter.h / 2);
      let state = await page.client.eval('window.testState');
      assert.equal(state.query, '15 cm of curb');
      let results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:sched7-1', '"15 cm of curb" must rank HTA:sched7-1 first');

      // 2. Hyphen-folded element query ("handheld wireless") matches Element 3a on 78.1(1)
      let clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('handheld wireless');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:78.1-1', '"handheld wireless" must find HTA:78.1-1');

      // 3. Nested OR-option element phrase ("electronic data") matches HTA:78.1-1 Element 4b
      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('electronic data');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:78.1-1', '"electronic data" must match HTA:78.1-1 Element 4b');

      // 4. Plural-to-singular matching ("brakes" -> HTA:item-163 / HTA:item-162; "tires" -> HTA:item-185 / HTA:item-182)
      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('brakes');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:item-163', '"brakes" must rank HTA:item-163 first');
      assert.ok(results.includes('search-result-HTA:item-162'), '"brakes" must include trailer brakes HTA:item-162');

      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('tires');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:item-185', '"tires" must rank HTA:item-185 first');
      assert.ok(results.includes('search-result-HTA:item-182'), '"tires" must match singular tire offence HTA:item-182');

      // 5. Multi-word queries with short units / numbers / multiple elements
      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('15 cm curb');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:sched7-1', '"15 cm curb" must match HTA:sched7-1 first');

      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('2 m passenger door');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:item-480', '"2 m passenger door" must rank HTA:item-480 first without partial-number noise');

      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('stop arm extended');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.ok(
        results[0] === 'search-result-HTA:item-507.6' || results[0] === 'search-result-HTA:item-507.8',
        `"stop arm extended" must rank school-bus stop-arm offences first, got ${results[0]}`
      );

      // 6. Boilerplate gloss demotion ("street car" ranks actual street-car charges, not 33(1) / 78.1(1))
      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('street car');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.ok(
        results.slice(0, 5).includes('search-result-HTA:item-479') &&
          !results.slice(0, 5).includes('search-result-HTA:33-1') &&
          !results.slice(0, 5).includes('search-result-HTA:78.1-1'),
        `"street car" top 5 must be real street-car offences, got ${results.slice(0, 5).join(', ')}`
      );

      // 7. Predictive element completions ("liftable" offers liftable-axle element phrases)
      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('liftable');
      const liftPreds = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("predict-"))');
      assert.ok(liftPreds.length >= 1, 'Typing "liftable" must offer predictive element phrase chips');
      await page.client.click(liftPreds[0].x + liftPreds[0].w / 2, liftPreds[0].y + liftPreds[0].h / 2);
      state = await page.client.eval('window.testState');
      assert.ok(/liftable axle/i.test(state.query), `Clicking liftable prediction must populate element query, got "${state.query}"`);

      // 8. Cross-element query -> open Detail -> verify elements checklist & return preserving query
      clearBtn = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      await page.client.click(clearBtn.x + clearBtn.w / 2, clearBtn.y + clearBtn.h / 2);
      await page.client.typeText('slow down tow truck');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:item-468', '"slow down tow truck" must rank HTA:item-468 first');

      const towRow = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:item-468")');
      await page.client.click(towRow.x + towRow.w / 2, towRow.y + towRow.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeId, 'HTA:item-468');
      assert.ok(state.openChargeElementsCount >= 2, 'Detail screen must show full Prove ALL elements checklist');

      const backBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backBtn.x + backBtn.w / 2, backBtn.y + backBtn.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.openChargeId, null);
      assert.equal(state.appBarSearchOpen, true);
      assert.equal(state.query, 'slow down tow truck', 'Back from element search result must preserve element query');
      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });

  test('Settings manages dark/light appearance and default sort without header toggle and persists across reload', async () => {
    const page = await openPage(390, 844);
    try {
      await resetAppStorage(page);
      assert.equal(await page.client.eval('window.testState.isDark'), false);
      assert.equal(await page.client.eval('window.testClickables.some(c => c.id === "theme-toggle")'), false);

      const navSettings = await page.client.eval('window.testClickables.find(c => c.id === "nav-settings")');
      await page.client.click(navSettings.x + navSettings.w / 2, navSettings.y + navSettings.h / 2);

      const darkBtn = await scrollUntilClickable(page, 'settings-theme-dark');
      assert.ok(darkBtn, 'Settings must expose Dark theme option');
      await page.client.click(darkBtn.x + darkBtn.w / 2, darkBtn.y + darkBtn.h / 2);

      const nameSortBtn = await scrollUntilClickable(page, 'settings-sort-name');
      assert.ok(nameSortBtn, 'Settings must expose Name default sort option');
      await page.client.click(nameSortBtn.x + nameSortBtn.w / 2, nameSortBtn.y + nameSortBtn.h / 2);

      let state = await page.client.eval('window.testState');
      assert.equal(state.isDark, true);
      assert.equal(state.sort, 'name');
      assert.equal(await page.client.eval('document.documentElement.getAttribute("data-theme")'), 'dark');

      const navCharges = await page.client.eval('window.testClickables.find(c => c.id === "nav-charges")');
      await page.client.click(navCharges.x + navCharges.w / 2, navCharges.y + navCharges.h / 2);
      const firstChargeId = await page.client.eval('window.testClickables.find(c => c.id.startsWith("charge-"))?.id');
      assert.ok(firstChargeId, 'POA Code must render charges under Name sort');

      // Verify preference persistence after reload
      await page.client.send('Page.reload', { ignoreCache: true });
      await new Promise(r => setTimeout(r, 350));
      state = await page.client.eval('window.testState');
      assert.equal(state.isDark, true, 'Dark theme must persist across reload');
      assert.equal(state.sort, 'name', 'Default sort preference must persist across reload');

      // Switch back to Light + Number cleanly
      const navSet2 = await page.client.eval('window.testClickables.find(c => c.id === "nav-settings")');
      await page.client.click(navSet2.x + navSet2.w / 2, navSet2.y + navSet2.h / 2);
      const lightBtn = await scrollUntilClickable(page, 'settings-theme-light');
      await page.client.click(lightBtn.x + lightBtn.w / 2, lightBtn.y + lightBtn.h / 2);
      const numSortBtn = await scrollUntilClickable(page, 'settings-sort-number');
      await page.client.click(numSortBtn.x + numSortBtn.w / 2, numSortBtn.y + numSortBtn.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.isDark, false);
      assert.equal(state.sort, 'number');
      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });

  test('Settings multi-select POA legislation picker controls search scope and 0-statute empty states', async () => {
    const page = await openPage(390, 844);
    try {
      await resetAppStorage(page);
      const navSettings = await page.client.eval('window.testClickables.find(c => c.id === "nav-settings")');
      await page.client.click(navSettings.x + navSettings.w / 2, navSettings.y + navSettings.h / 2);

      // Verify all 6 Ontario POA legislation rows render (1 populated + 5 coming soon)
      const statToggles = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("settings-statute-")).map(c => c.id)');
      assert.deepEqual(statToggles, [
        'settings-statute-HTA',
        'settings-statute-CAIA',
        'settings-statute-LLCA',
        'settings-statute-TTPA',
        'settings-statute-CCA',
        'settings-statute-SFOA'
      ]);

      // Tapping upcoming CAIA shows coming soon status without altering active statutes
      const caiaRow = await scrollUntilClickable(page, 'settings-statute-CAIA');
      await page.client.click(caiaRow.x + caiaRow.w / 2, caiaRow.y + caiaRow.h / 2);
      let state = await page.client.eval('window.testState');
      assert.match(String(state.statusToast), /coming soon/i);
      assert.deepEqual(state.selectedStatutes, ['HTA']);

      // Uncheck HTA -> 0 active statutes
      const htaRow = await scrollUntilClickable(page, 'settings-statute-HTA');
      await page.client.click(htaRow.x + htaRow.w / 2, htaRow.y + htaRow.h / 2);
      state = await page.client.eval('window.testState');
      assert.deepEqual(state.selectedStatutes, []);
      assert.equal(state.activeChargeCount, 0);

      // Home reflects 0 selected statutes and offers shortcut back to Settings
      const navHome = await page.client.eval('window.testClickables.find(c => c.id === "nav-home")');
      await page.client.click(navHome.x + navHome.w / 2, navHome.y + navHome.h / 2);
      assert.ok(await page.client.eval('window.testClickables.find(c => c.id === "home-pick-settings")'));

      // AppBar SearchView respects 0-statute scope and offers search-enable-hta quick recovery
      const searchToggle = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      await page.client.click(searchToggle.x + searchToggle.w / 2, searchToggle.y + searchToggle.h / 2);
      await page.client.typeText('speed');
      assert.equal(await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).length'), 0);
      const searchEnableHta = await page.client.eval('window.testClickables.find(c => c.id === "search-enable-hta")');
      assert.ok(searchEnableHta, 'Search empty state with 0 selected statutes must offer Enable HTA');
      await page.client.click(searchEnableHta.x + searchEnableHta.w / 2, searchEnableHta.y + searchEnableHta.h / 2);

      state = await page.client.eval('window.testState');
      assert.deepEqual(state.selectedStatutes, ['HTA']);
      assert.equal(state.activeChargeCount, 1006);
      assert.ok(await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).length > 0'), 'Enabling HTA immediately populates search results');

      // Also verify empty-enable-hta & empty-open-settings on POA Code list when HTA toggled off
      const closeSearch = await page.client.eval('window.testClickables.find(c => c.id === "header-search-close")');
      await page.client.click(closeSearch.x + closeSearch.w / 2, closeSearch.y + closeSearch.h / 2);
      const navSet2 = await page.client.eval('window.testClickables.find(c => c.id === "nav-settings")');
      await page.client.click(navSet2.x + navSet2.w / 2, navSet2.y + navSet2.h / 2);
      const htaRow2 = await scrollUntilClickable(page, 'settings-statute-HTA');
      await page.client.click(htaRow2.x + htaRow2.w / 2, htaRow2.y + htaRow2.h / 2);
      const navCharges = await page.client.eval('window.testClickables.find(c => c.id === "nav-charges")');
      await page.client.click(navCharges.x + navCharges.w / 2, navCharges.y + navCharges.h / 2);
      assert.ok(await page.client.eval('window.testClickables.find(c => c.id === "empty-open-settings")'));
      const emptyEnable = await page.client.eval('window.testClickables.find(c => c.id === "empty-enable-hta")');
      await page.client.click(emptyEnable.x + emptyEnable.w / 2, emptyEnable.y + emptyEnable.h / 2);
      assert.equal(await page.client.eval('window.testState.activeChargeCount'), 1006);
      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });

  test('POA Field Rules sub-view works inside Settings with history back and checklist Reset', async () => {
    const page = await openPage(360, 780);
    try {
      await resetAppStorage(page);
      const navSettings = await page.client.eval('window.testClickables.find(c => c.id === "nav-settings")');
      await page.client.click(navSettings.x + navSettings.w / 2, navSettings.y + navSettings.h / 2);

      // Scroll Settings cleanly on narrow 360px screen down to Data Controls
      const clearHistBtn = await scrollUntilClickable(page, 'settings-open-rules');
      assert.ok(clearHistBtn);
      await page.client.click(clearHistBtn.x + clearHistBtn.w / 2, clearHistBtn.y + clearHistBtn.h / 2);

      let state = await page.client.eval('window.testState');
      assert.equal(state.tab, 'settings');
      assert.equal(state.settingsSubView, 'rules');

      const r1 = await page.client.eval('window.testClickables.find(c => c.id === "rule-poa-1")');
      const r2 = await page.client.eval('window.testClickables.find(c => c.id === "rule-poa-2")');
      await page.client.click(r1.x + r1.w / 2, r1.y + r1.h / 2);
      await page.client.click(r2.x + r2.w / 2, r2.y + r2.h / 2);
      assert.equal(await page.client.eval('JSON.parse(localStorage.getItem("stick-the-ticket-poa-rules"))["poa-2"]'), true);

      const resetRules = await page.client.eval('window.testClickables.find(c => c.id === "rules-reset")');
      assert.ok(resetRules);
      await page.client.click(resetRules.x + resetRules.w / 2, resetRules.y + resetRules.h / 2);
      assert.equal(await page.client.eval('Object.keys(JSON.parse(localStorage.getItem("stick-the-ticket-poa-rules") || "{}")).length'), 0);

      // Verify browser/system back exits POA Rules sub-view cleanly back to Settings
      await page.client.eval('window.history.back()');
      await new Promise(r => setTimeout(r, 150));
      state = await page.client.eval('window.testState');
      assert.equal(state.tab, 'settings');
      assert.equal(state.settingsSubView, null);
      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });

  test('Officer profile sign-in with PIN, workspace isolation, JSON Export/Import backup, and Data Controls work end-to-end', async () => {
    const page = await openPage(390, 844);
    try {
      await resetAppStorage(page);

      // 1. Create Guest work: open HTA:78.1-1, save charge + check element e1
      const searchToggle = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      await page.client.click(searchToggle.x + searchToggle.w / 2, searchToggle.y + searchToggle.h / 2);
      await page.client.typeText('78.1(1)');
      const handheld = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:78.1-1")');
      await page.client.click(handheld.x + handheld.w / 2, handheld.y + handheld.h / 2);
      const saveGuest = await page.client.eval('window.testClickables.find(c => c.id === "detail-save")');
      await page.client.click(saveGuest.x + saveGuest.w / 2, saveGuest.y + saveGuest.h / 2);
      const el1Guest = await page.client.eval('window.testClickables.find(c => c.id === "element-e1")');
      await page.client.click(el1Guest.x + el1Guest.w / 2, el1Guest.y + el1Guest.h / 2);
      const backGuest = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backGuest.x + backGuest.w / 2, backGuest.y + backGuest.h / 2);
      const closeSearch = await page.client.eval('window.testClickables.find(c => c.id === "header-search-close")');
      await page.client.click(closeSearch.x + closeSearch.w / 2, closeSearch.y + closeSearch.h / 2);

      // 2. Open Settings -> Create PIN-protected profile WITHOUT carrying guest work
      const navSettings = await page.client.eval('window.testClickables.find(c => c.id === "nav-settings")');
      await page.client.click(navSettings.x + navSettings.w / 2, navSettings.y + navSettings.h / 2);
      const createBtn = await scrollUntilClickable(page, 'settings-create-profile');
      await page.client.click(createBtn.x + createBtn.w / 2, createBtn.y + createBtn.h / 2);

      assert.equal(await page.client.eval('document.querySelector("#auth-modal").hidden'), false);
      assert.equal(await page.client.eval('document.querySelector("#auth-carry-wrap").hidden'), false);

      // Uncheck carry-over so Guest work remains isolated in guest stash
      const carryRect = await page.client.eval('(() => { const r = document.querySelector("#auth-carry").getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()');
      await page.client.click(carryRect.x, carryRect.y);

      const userRect = await page.client.eval('(() => { const r = document.querySelector("#auth-username").getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()');
      await page.client.click(userRect.x, userRect.y);
      await page.client.typeText('Ofc. Miller');

      const badgeRect = await page.client.eval('(() => { const r = document.querySelector("#auth-badge").getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()');
      await page.client.click(badgeRect.x, badgeRect.y);
      await page.client.typeText('412');

      const pinRect = await page.client.eval('(() => { const r = document.querySelector("#auth-pin").getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()');
      await page.client.click(pinRect.x, pinRect.y);
      await page.client.typeText('1234');

      const submitRect = await page.client.eval('(() => { const r = document.querySelector("#auth-submit").getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()');
      await page.client.click(submitRect.x, submitRect.y);
      await new Promise(r => setTimeout(r, 100));

      let state = await page.client.eval('window.testState');
      assert.equal(await page.client.eval('document.querySelector("#auth-modal").hidden'), true);
      assert.equal(state.currentUserId, 'ofc-miller');
      assert.equal(state.currentUserName, 'Ofc. Miller');
      assert.equal(state.savedCount, 0, 'Fresh officer profile must start clean when carry-over unchecked');
      assert.equal(state.checkedElementsTotal, 0);

      // 3. Populate Ofc. Miller profile with HTA:172 save, element check, dark theme, name sort, and recent search
      const darkBtn = await scrollUntilClickable(page, 'settings-theme-dark');
      await page.client.click(darkBtn.x + darkBtn.w / 2, darkBtn.y + darkBtn.h / 2);
      const nameBtn = await scrollUntilClickable(page, 'settings-sort-name');
      await page.client.click(nameBtn.x + nameBtn.w / 2, nameBtn.y + nameBtn.h / 2);

      const searchToggle2 = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      await page.client.click(searchToggle2.x + searchToggle2.w / 2, searchToggle2.y + searchToggle2.h / 2);
      await page.client.typeText('stunt');
      const stuntRes = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:172")');
      await page.client.click(stuntRes.x + stuntRes.w / 2, stuntRes.y + stuntRes.h / 2);
      const saveMiller = await page.client.eval('window.testClickables.find(c => c.id === "detail-save")');
      await page.client.click(saveMiller.x + saveMiller.w / 2, saveMiller.y + saveMiller.h / 2);
      const el1Miller = await page.client.eval('window.testClickables.find(c => c.id === "element-e1")');
      await page.client.click(el1Miller.x + el1Miller.w / 2, el1Miller.y + el1Miller.h / 2);
      const backMiller = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backMiller.x + backMiller.w / 2, backMiller.y + backMiller.h / 2);
      const closeSearch2 = await page.client.eval('window.testClickables.find(c => c.id === "header-search-close")');
      await page.client.click(closeSearch2.x + closeSearch2.w / 2, closeSearch2.y + closeSearch2.h / 2);

      // 4. Export JSON backup for Ofc. Miller
      const exportBtn = await scrollUntilClickable(page, 'settings-export');
      await page.client.click(exportBtn.x + exportBtn.w / 2, exportBtn.y + exportBtn.h / 2);
      const backupOk = await page.client.eval(`(() => {
        const b = window.lastExportedBackup;
        return !!(b && b.app === 'stick-the-ticket' && b.officer?.displayName === 'Ofc. Miller' && b.data?.saved?.includes('HTA:172') && b.data?.isDark === true && b.data?.sort === 'name');
      })()`);
      assert.equal(backupOk, true, 'Exported backup JSON must contain officer profile work');

      // 5. Sign Out -> restores isolated Guest stash cleanly
      const signOutBtn = await scrollUntilClickable(page, 'settings-signout');
      await page.client.click(signOutBtn.x + signOutBtn.w / 2, signOutBtn.y + signOutBtn.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.currentUserId, null);
      assert.equal(state.isDark, false, 'Signing out returns to Guest light mode');
      assert.equal(state.sort, 'number', 'Signing out returns to Guest default number sort');
      assert.deepEqual(
        await page.client.eval('JSON.parse(localStorage.getItem("stick-the-ticket-saved"))'),
        ['HTA:78.1-1'],
        'Guest workspace stash must remain preserved separately'
      );

      // 6. Tap saved profile chip (PIN required) -> verify wrong PIN error, then correct PIN restores Ofc. Miller
      const profChip = await scrollUntilClickable(page, 'settings-profile-0');
      await page.client.click(profChip.x + profChip.w / 2, profChip.y + profChip.h / 2);
      assert.equal(await page.client.eval('document.querySelector("#auth-modal").hidden'), false);
      assert.equal(await page.client.eval('document.querySelector("#auth-username").value'), 'Ofc. Miller');

      await page.client.typeText('9999');
      const submit2 = await page.client.eval('(() => { const r = document.querySelector("#auth-submit").getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()');
      await page.client.click(submit2.x, submit2.y);
      await new Promise(r => setTimeout(r, 80));
      assert.equal(await page.client.eval('document.querySelector("#auth-error").hidden'), false, 'Wrong PIN must show alert error');
      assert.match(await page.client.eval('document.querySelector("#auth-error").textContent'), /Incorrect passcode/i);
      assert.equal(await page.client.eval('window.testState.currentUserId'), null);

      await page.client.eval('document.querySelector("#auth-pin").value = ""');
      const pinRect2 = await page.client.eval('(() => { const r = document.querySelector("#auth-pin").getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()');
      await page.client.click(pinRect2.x, pinRect2.y);
      await page.client.typeText('1234');
      await page.client.click(submit2.x, submit2.y);
      await new Promise(r => setTimeout(r, 120));

      state = await page.client.eval('window.testState');
      assert.equal(await page.client.eval('document.querySelector("#auth-modal").hidden'), true);
      assert.equal(state.currentUserId, 'ofc-miller');
      assert.equal(state.isDark, true);
      assert.equal(state.sort, 'name');
      assert.equal(state.checkedElementsTotal, 1);
      assert.deepEqual(
        await page.client.eval('JSON.parse(localStorage.getItem("stick-the-ticket-saved"))'),
        ['HTA:172']
      );

      // 7. Data Controls: Clear Search History + 2-tap Reset Element Checkmarks
      const clearHist = await scrollUntilClickable(page, 'settings-clear-history');
      assert.ok(clearHist, 'Search History Clear button should be active when history exists');
      await page.client.click(clearHist.x + clearHist.w / 2, clearHist.y + clearHist.h / 2);
      assert.equal(await page.client.eval('window.testState.recentSearches.length'), 0);

      const clearChk1 = await scrollUntilClickable(page, 'settings-clear-checks');
      await page.client.click(clearChk1.x + clearChk1.w / 2, clearChk1.y + clearChk1.h / 2);
      assert.equal(await page.client.eval('window.testState.checkedElementsTotal'), 1, 'First Reset tap arms Confirm without clearing yet');
      await page.client.click(clearChk1.x + clearChk1.w / 2, clearChk1.y + clearChk1.h / 2);
      assert.equal(await page.client.eval('window.testState.checkedElementsTotal'), 0, 'Second Reset tap clears element checkmarks');

      // 8. Import JSON backup restores previously exported check & data cleanly
      await page.client.eval(`(() => {
        const input = document.querySelector('#import-backup-input');
        const dt = new DataTransfer();
        const file = new File([JSON.stringify(window.lastExportedBackup)], 'backup.json', { type: 'application/json' });
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await new Promise(r => setTimeout(r, 160));
      state = await page.client.eval('window.testState');
      assert.equal(state.checkedElementsTotal, 1, 'Importing JSON backup must restore checked proof elements');
      assert.match(String(state.statusToast), /Backup imported cleanly/i);
      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });

  test('White/light mode renders crisp black searched words inside search box even under OS dark scheme and Chrome Auto Dark Mode', async () => {
    const page = await openPage(390, 844);
    try {
      await resetAppStorage(page);
      await page.client.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: 'dark' }]
      });
      await page.client.send('Emulation.setAutoDarkModeOverride', { enabled: true });

      const homePill = await page.client.eval('window.testClickables.find(c => c.id === "home-search-pill")');
      await page.client.click(homePill.x + homePill.w / 2, homePill.y + homePill.h / 2);
      await page.client.typeText('handheld');

      const inspectSearchPixels = () => page.client.eval(`(() => {
        const st = window.testState;
        const r = st.searchRender?.rect;
        const el = document.querySelector('#search-input');
        const cs = getComputedStyle(el);
        const canvas = document.querySelector('#screen');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const sx = Math.max(0, Math.floor(r.x * dpr));
        const sy = Math.max(0, Math.floor(r.y * dpr));
        const sw = Math.max(1, Math.floor(r.w * dpr));
        const sh = Math.max(1, Math.floor(r.h * dpr));
        const data = ctx.getImageData(sx, sy, sw, sh).data;
        let darkTextPixels = 0;
        let whiteBgPixels = 0;
        for (let i = 0; i < data.length; i += 4) {
          const red = data[i], green = data[i + 1], blue = data[i + 2];
          if (red <= 25 && green <= 25 && blue <= 25) darkTextPixels++;
          if (red >= 245 && green >= 245 && blue >= 245) whiteBgPixels++;
        }
        return {
          isDark: st.isDark,
          searchRender: st.searchRender,
          themePalette: st.themePalette,
          darkTextPixels,
          whiteBgPixels,
          inputColor: cs.color,
          inputValue: el.value
        };
      })()`);

      let snap = await inspectSearchPixels();
      assert.equal(snap.isDark, false);
      assert.equal(snap.themePalette.ink, '#000000', 'Light mode primary ink must be pure black');
      assert.equal(snap.themePalette.inkDim, '#161b22', 'Light mode secondary ink must be deep near-black');
      assert.equal(snap.themePalette.hlBg, '#fde047', 'Light mode matched-word highlight background must be high-visibility yellow');
      assert.equal(snap.themePalette.hlInk, '#000000', 'Light mode matched-word text must be pure black');
      assert.equal(snap.inputValue, 'handheld');
      assert.equal(snap.searchRender.text, 'handheld');
      assert.equal(snap.searchRender.isPlaceholder, false);
      assert.equal(snap.searchRender.color, '#000000');
      assert.equal(snap.searchRender.caretVisible, true);
      assert.ok(snap.darkTextPixels >= 60, `Expected crisp dark glyph pixels inside search box under Auto Dark Mode, got ${snap.darkTextPixels}`);
      assert.ok(snap.whiteBgPixels >= 1000, `Expected white pill background pixels inside search box, got ${snap.whiteBgPixels}`);

      // Also verify toggling Dark -> Light in Settings keeps AppBar typed words crisp black immediately
      const navSet = await page.client.eval('window.testClickables.find(c => c.id === "nav-settings")');
      await page.client.click(navSet.x + navSet.w / 2, navSet.y + navSet.h / 2);
      const darkBtn = await scrollUntilClickable(page, 'settings-theme-dark');
      await page.client.click(darkBtn.x + darkBtn.w / 2, darkBtn.y + darkBtn.h / 2);
      const lightBtn = await scrollUntilClickable(page, 'settings-theme-light');
      await page.client.click(lightBtn.x + lightBtn.w / 2, lightBtn.y + lightBtn.h / 2);

      const searchToggle = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      await page.client.click(searchToggle.x + searchToggle.w / 2, searchToggle.y + searchToggle.h / 2);
      const clr = await page.client.eval('window.testClickables.find(c => c.id === "search-clear")');
      if (clr) await page.client.click(clr.x + clr.w / 2, clr.y + clr.h / 2);
      await page.client.typeText('dis');
      snap = await inspectSearchPixels();
      assert.equal(snap.searchRender.text, 'dis');
      assert.equal(snap.searchRender.color, '#000000');
      assert.ok(snap.darkTextPixels >= 30, `Expected dark glyph pixels in AppBar search box, got ${snap.darkTextPixels}`);
      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });

  test('All 6 search improvements: spelling/stemming/boundaries, concepts, s. vs item ranking, typo/filter recovery, facets & saved search, and detail highlight + jump', async () => {
    const page = await openPage(390, 844);
    try {
      await resetAppStorage(page);
      const toggle = await page.client.eval('window.testClickables.find(c => c.id === "header-search-toggle")');
      await page.client.click(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);

      const clearAppBarSearch = async () => {
        const clr = await page.client.eval('window.testClickables.find(c => c.id === "search-clear") || window.testClickables.find(c => c.id === "search-empty-clear")');
        if (clr) await page.client.click(clr.x + clr.w / 2, clr.y + clr.h / 2);
      };

      // 1. US <-> Canadian spelling, stopword stripping, stemming, and word-boundary safety ("meter" vs "odometer")
      await page.client.typeText('left of center');
      let results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.ok(results.slice(0, 4).includes('search-result-HTA:item-446'), `"left of center" must match CA spelling HTA:item-446, got ${results.slice(0, 4).join(', ')}`);

      await clearAppBarSearch();
      await page.client.typeText('running a red light');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:144-18', `"running a red light" must rank HTA:144-18 first, got ${results[0]}`);

      await clearAppBarSearch();
      await page.client.typeText('meter');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.ok(results.length > 0, '"meter" must match metre charges');
      assert.equal(results.includes('search-result-HTA:item-177'), false, '"meter" must NOT false-match odometer HTA:item-177');
      assert.equal(results.includes('search-result-HTA:item-178'), false, '"meter" must NOT false-match odometer HTA:item-178');
      assert.ok(results.includes('search-result-HTA:item-439.2'), '"meter" must find "Fail to leave one metre while passing bicycle"');

      // 2. Global Concept Expansion
      await clearAppBarSearch();
      await page.client.typeText('missing brake light');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:item-155', `"missing brake light" must rank HTA:item-155 No brake lights first, got ${results[0]}`);

      await clearAppBarSearch();
      await page.client.typeText('cell phone');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:78.1-1', `"cell phone" must rank HTA:78.1-1 first, got ${results[0]}`);

      await clearAppBarSearch();
      await page.client.typeText('val tag');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.ok(results.includes('search-result-HTA:item-6'), '"val tag" must include HTA:item-6 no validation on plate');
      assert.ok(results.includes('search-result-HTA:7-1-a'), '"val tag" must include HTA:7-1-a no currently validated permit');

      await clearAppBarSearch();
      await page.client.typeText('license plate');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.ok(
        results.slice(0, 6).some(id => id === 'search-result-HTA:13-2' || id === 'search-result-HTA:item-68' || id === 'search-result-HTA:item-3'),
        `"license plate" must surface plate charges in top results, got ${results.slice(0, 6).join(', ')}`
      );

      // 3. Statutory Section vs Schedule 43 Item ranking precision
      await clearAppBarSearch();
      await page.client.typeText('s. 172');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:172', `"s. 172" must rank HTA:172 Stunt Driving #1, got ${results[0]}`);

      await clearAppBarSearch();
      await page.client.typeText('172');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:172', `"172" must rank section 172(1) HTA:172 #1 above Item 172, got ${results[0]}`);

      await clearAppBarSearch();
      await page.client.typeText('item 172');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.equal(results[0], 'search-result-HTA:item-172', `"item 172" must explicitly rank Schedule 43 Item 172 first, got ${results[0]}`);

      // 4. Typo tolerance ("Did you mean...") + Facet filters & zero-result recovery
      await clearAppBarSearch();
      await page.client.typeText('distrcted');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-"))');
      assert.equal(results.length, 0, 'Misspelled "distrcted" initially has 0 exact results');
      const dymPill = await page.client.eval('window.testClickables.find(c => c.id === "empty-didyoumean-0") || window.testClickables.find(c => c.id === "predict-0")');
      assert.ok(dymPill, 'Zero-result misspelled query "distrcted" must show Did You Mean recovery pill');
      await page.client.click(dymPill.x + dymPill.w / 2, dymPill.y + dymPill.h / 2);
      let state = await page.client.eval('window.testState');
      assert.equal(state.query, 'distracted', 'Clicking Did You Mean pill recovers "distracted"');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.ok(results.includes('search-result-HTA:78.1-1'), 'Recovered "distracted" query must find HTA:78.1-1');

      // 5. Part III / Demerit / Part I Facets in AppBar SearchView
      await clearAppBarSearch();
      await page.client.typeText('172');
      const facetPart3 = await page.client.eval('window.testClickables.find(c => c.id === "facet-part3")');
      assert.ok(facetPart3, 'AppBar SearchView must expose Part III · Summons facet pill');
      await page.client.click(facetPart3.x + facetPart3.w / 2, facetPart3.y + facetPart3.h / 2);
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.ok(results.includes('search-result-HTA:172'), 'Summons facet retains Part III HTA:172');
      assert.equal(results.includes('search-result-HTA:item-172'), false, 'Summons facet excludes Part I HTA:item-172');

      const facetPoints = await page.client.eval('window.testClickables.find(c => c.id === "facet-points")');
      await page.client.click(facetPoints.x + facetPoints.w / 2, facetPoints.y + facetPoints.h / 2);
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-")).map(c => c.id)');
      assert.ok(results.includes('search-result-HTA:172'), 'Demerit pts facet retains 6-point HTA:172');

      // Filtering a Part III-only query down to 0 via Part I and recovering via empty-all-facets
      await clearAppBarSearch();
      await page.client.typeText('careless driving causing death');
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-"))');
      const facetPart1 = await page.client.eval('window.testClickables.find(c => c.id === "facet-part1")');
      await page.client.click(facetPart1.x + facetPart1.w / 2, facetPart1.y + facetPart1.h / 2);
      results = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("search-result-"))');
      assert.equal(results.length, 0, 'Careless driving causing death under Part I facet yields 0 results');
      const allFacetsBtn = await page.client.eval('window.testClickables.find(c => c.id === "empty-all-facets")');
      assert.ok(allFacetsBtn, '0 matches under active facet must offer All parts escape pill');
      await page.client.click(allFacetsBtn.x + allFacetsBtn.w / 2, allFacetsBtn.y + allFacetsBtn.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.searchFacet, 'all');
      assert.ok(await page.client.eval('window.testClickables.some(c => c.id === "search-result-HTA:130-3")'), 'Clearing facet restores HTA:130-3');

      // 6. Detail highlighting + Jump-to-Match (single-element & cross-element)
      await clearAppBarSearch();
      await page.client.typeText('electronic data');
      const elDataRow = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:78.1-1")');
      await page.client.click(elDataRow.x + elDataRow.w / 2, elDataRow.y + elDataRow.h / 2);
      state = await page.client.eval('window.testState');
      assert.equal(state.activeDetailQuery, 'electronic data');
      assert.deepEqual(state.detailMatchedElements, [4], 'Detail screen must attribute "electronic data" specifically to Element 4');
      assert.ok(state.detailHighlightSpans >= 1, `Expected highlighted spans in Detail view, got ${state.detailHighlightSpans}`);
      assert.equal(state.openChargeStatuteItalic, true, 'Highlighted statutory text must stay italic');
      assert.equal(state.detailScrollY, 0);

      const jumpBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-jump-match")');
      assert.ok(jumpBtn, 'Detail view must render Match in Prove 4 · Jump pill');
      await page.client.click(jumpBtn.x + jumpBtn.w / 2, jumpBtn.y + jumpBtn.h / 2);
      state = await page.client.eval('window.testState');
      assert.ok(state.detailScrollY > 50, `Clicking detail-jump-match must scroll down to Element 4, got detailScrollY=${state.detailScrollY}`);

      // Save HTA:78.1-1 while inspecting it
      const save78 = await page.client.eval('window.testClickables.find(c => c.id === "detail-save")');
      await page.client.click(save78.x + save78.w / 2, save78.y + save78.h / 2);
      const back1 = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(back1.x + back1.w / 2, back1.y + back1.h / 2);

      // Cross-element detail match on HTA:item-468 ("slow down tow truck")
      await clearAppBarSearch();
      await page.client.typeText('slow down tow truck');
      const moveRow = await page.client.eval('window.testClickables.find(c => c.id === "search-result-HTA:item-468")');
      await page.client.click(moveRow.x + moveRow.w / 2, moveRow.y + moveRow.h / 2);
      state = await page.client.eval('window.testState');
      assert.deepEqual(state.detailMatchedElements, [1, 2], 'Cross-element query must highlight both Element 1 and Element 2');
      assert.ok(state.detailHighlightSpans >= 2, 'Cross-element query must render multiple highlight spans across Elements');
      const save468 = await page.client.eval('window.testClickables.find(c => c.id === "detail-save")');
      await page.client.click(save468.x + save468.w / 2, save468.y + save468.h / 2);
      const back2 = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(back2.x + back2.w / 2, back2.y + back2.h / 2);

      // Close AppBar SearchView -> verify POA Code category escape & Saved tab independent search
      const closeSearch = await page.client.eval('window.testClickables.find(c => c.id === "header-search-close")');
      await page.client.click(closeSearch.x + closeSearch.w / 2, closeSearch.y + closeSearch.h / 2);
      const navCharges = await page.client.eval('window.testClickables.find(c => c.id === "nav-charges")');
      await page.client.click(navCharges.x + navCharges.w / 2, navCharges.y + navCharges.h / 2);

      const chipSpeed = await page.client.eval('window.testClickables.find(c => c.id === "chip-speeding")');
      await page.client.click(chipSpeed.x + chipSpeed.w / 2, chipSpeed.y + chipSpeed.h / 2);
      const inlineBox = await page.client.eval('window.testClickables.find(c => c.id === "charges-search-box")');
      await page.client.click(inlineBox.x + inlineBox.w / 2, inlineBox.y + inlineBox.h / 2);
      await page.client.typeText('78.1');
      assert.equal(await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-")).length'), 0);
      const allCatsBtn = await page.client.eval('window.testClickables.find(c => c.id === "empty-all-categories")');
      assert.ok(allCatsBtn, '0 matches under active category chip must offer Search all categories recovery pill');
      await page.client.click(allCatsBtn.x + allCatsBtn.w / 2, allCatsBtn.y + allCatsBtn.h / 2);
      assert.ok(await page.client.eval('window.testClickables.some(c => c.id === "charge-HTA:78.1-1")'), 'Clearing category filter immediately finds HTA:78.1-1');

      // Switch to Saved tab -> search saved charges independently without disturbing main query ("78.1")
      const navSaved = await page.client.eval('window.testClickables.find(c => c.id === "nav-saved")');
      await page.client.click(navSaved.x + navSaved.w / 2, navSaved.y + navSaved.h / 2);
      const savedBox = await page.client.eval('window.testClickables.find(c => c.id === "saved-search-box")');
      assert.ok(savedBox, 'Saved tab with saved charges must render saved-search-box');
      await page.client.click(savedBox.x + savedBox.w / 2, savedBox.y + savedBox.h / 2);
      await page.client.typeText('tow truck');
      state = await page.client.eval('window.testState');
      assert.equal(state.savedQuery, 'tow truck');
      assert.equal(state.query, '78.1', 'Saved tab search must not overwrite main POA query');
      const savedRows = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-")).map(c => c.id)');
      assert.deepEqual(savedRows, ['charge-HTA:item-468'], 'Saved search filters saved tickets to HTA:item-468 only');

      const savedClear = await page.client.eval('window.testClickables.find(c => c.id === "saved-search-clear")');
      await page.client.click(savedClear.x + savedClear.w / 2, savedClear.y + savedClear.h / 2);
      const restoredSaved = await page.client.eval('window.testClickables.filter(c => c.id.startsWith("charge-")).map(c => c.id)');
      assert.equal(restoredSaved.length, 2, 'Clearing saved search restores all saved tickets');

      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });

  test('Smooth physics scrolling glides with momentum on touch flicks and mouse drags, eases wheel ticks smoothly, and catches cleanly', async () => {
    const page = await openPage(390, 844);
    try {
      const navCharges = await page.client.eval('window.testClickables.find(c => c.id === "nav-charges")');
      await page.client.click(navCharges.x + navCharges.w / 2, navCharges.y + navCharges.h / 2);

      // 1. Wheel smooth easing (multi-frame glide instead of instant 1-frame snap)
      await page.client.wheelScroll(195, 500, 240, 32);
      const wheelMid = await page.client.eval('window.testState');
      assert.ok(
        wheelMid.listScrollY > 15 && wheelMid.listScrollY < 120 && wheelMid.isScrolling,
        `Wheel scroll must ease smoothly mid-flight, got listScrollY=${wheelMid.listScrollY}, isScrolling=${wheelMid.isScrolling}`
      );
      await new Promise(r => setTimeout(r, 240));
      const wheelDone = await page.client.eval('window.testState');
      assert.equal(wheelDone.listScrollY, 120, 'Wheel scroll must settle deterministically at exact 120px CSS target (240 / dpr=2)');
      assert.equal(wheelDone.isScrolling, false);

      // 2. Touch flick inertia glide on 1006-offence list
      await page.client.touchFlick(195, 640, 420, { steps: 5, stepMs: 15 });
      await new Promise(r => setTimeout(r, 24));
      const atRelease = await page.client.eval('window.testState');
      assert.ok(atRelease.scrollVelocityY > 200, `Expected strong release velocity > 200, got ${atRelease.scrollVelocityY}`);
      assert.equal(atRelease.isScrolling, true);

      await new Promise(r => setTimeout(r, 120));
      const at120ms = await page.client.eval('window.testState');
      assert.ok(
        at120ms.listScrollY > atRelease.listScrollY + 40,
        `Momentum glide must continue advancing list after release (${atRelease.listScrollY} -> ${at120ms.listScrollY})`
      );

      await new Promise(r => setTimeout(r, 220));
      const at340ms = await page.client.eval('window.testState');
      assert.ok(at340ms.listScrollY > at120ms.listScrollY, 'List must keep gliding smoothly over 340ms');
      assert.ok(at340ms.scrollVelocityY < atRelease.scrollVelocityY, 'Momentum velocity must decelerate smoothly over time');

      const settleDeadline = Date.now() + 2600;
      let settled = at340ms;
      while (settled.isScrolling && Date.now() < settleDeadline) {
        await new Promise(r => setTimeout(r, 80));
        settled = await page.client.eval('window.testState');
      }
      assert.equal(settled.isScrolling, false, 'Touch momentum glide must come to a full stop');
      assert.equal(settled.scrollVelocityY, 0);
      assert.ok(settled.listScrollY > at340ms.listScrollY && settled.listScrollY <= settled.maxListScrollY);

      // 3. Catch-tap mid-glide stops motion cleanly without accidentally opening a row
      await page.client.touchFlick(195, 640, 420, { steps: 5, stepMs: 15 });
      await new Promise(r => setTimeout(r, 65));
      const glidingState = await page.client.eval('window.testState');
      assert.ok(glidingState.scrollVelocityY > 150, `Expected active glide before catch-tap, got v=${glidingState.scrollVelocityY}`);

      await page.client.touchTap(195, 520, 35);
      await new Promise(r => setTimeout(r, 90));
      const caughtState = await page.client.eval('window.testState');
      assert.equal(caughtState.scrollVelocityY, 0, 'Catch-tap must stop glide velocity immediately');
      assert.equal(caughtState.isScrolling, false);
      assert.equal(caughtState.openChargeId, null, 'Catch-tap mid-glide must not open the charge row under the finger');

      await new Promise(r => setTimeout(r, 280));
      const firstVisibleRow = await page.client.eval('window.testClickables.find(c => c.id.startsWith("charge-") && c.h >= 24)');
      assert.ok(firstVisibleRow, 'Expected clickable charge row after catch');
      await page.client.click(firstVisibleRow.x + firstVisibleRow.w / 2, firstVisibleRow.y + firstVisibleRow.h / 2);
      assert.ok((await page.client.eval('window.testState')).openChargeId, 'Subsequent normal tap after catch must open charge');

      const backBtn = await page.client.eval('window.testClickables.find(c => c.id === "detail-back")');
      await page.client.click(backBtn.x + backBtn.w / 2, backBtn.y + backBtn.h / 2);

      // 4. Boundary rubber-band spring-back never leaves listScrollY negative
      const navHome = await page.client.eval('window.testClickables.find(c => c.id === "nav-home")');
      await page.client.click(navHome.x + navHome.w / 2, navHome.y + navHome.h / 2);
      const navCharges2 = await page.client.eval('window.testClickables.find(c => c.id === "nav-charges")');
      await page.client.click(navCharges2.x + navCharges2.w / 2, navCharges2.y + navCharges2.h / 2);

      await page.client.touchFlick(195, 380, 620, { steps: 5, stepMs: 15 });
      await new Promise(r => setTimeout(r, 24));
      const overAtTop = await page.client.eval('window.testState');
      assert.equal(overAtTop.listScrollY, 0, 'Stored listScrollY must stay clamped >= 0 during top pull');
      await new Promise(r => setTimeout(r, 380));
      const afterSpring = await page.client.eval('window.testState');
      assert.equal(afterSpring.listScrollY, 0);
      assert.equal(afterSpring.scrollOverscrollY, 0, 'Top boundary overscroll must spring cleanly back to 0');
      assert.equal(afterSpring.isScrolling, false);

      // 5. Desktop mouse-drag momentum glide on Charge Detail (HTA:172)
      const searchBox = await page.client.eval('window.testClickables.find(c => c.id === "charges-search-box")');
      await page.client.click(searchBox.x + searchBox.w / 2, searchBox.y + searchBox.h / 2);
      await page.client.typeText('stunt');
      const stuntRow = await page.client.eval('window.testClickables.find(c => c.id === "charge-HTA:172")');
      assert.ok(stuntRow, 'Expected HTA:172 row for detail mouse-drag glide test');
      await page.client.click(stuntRow.x + stuntRow.w / 2, stuntRow.y + stuntRow.h / 2);

      await page.client.mouseDrag(195, 620, 420, { steps: 5, stepMs: 15 });
      await new Promise(r => setTimeout(r, 24));
      const detailAfterDrag = await page.client.eval('window.testState');
      assert.equal(detailAfterDrag.openChargeId, 'HTA:172', 'Mouse drag release must not accidentally click detail links');
      assert.ok(detailAfterDrag.detailScrollY > 120, `Mouse drag must scroll detail smoothly, got ${detailAfterDrag.detailScrollY}`);
      assert.ok(detailAfterDrag.scrollVelocityY > 150, `Expected mouse drag momentum velocity > 150, got ${detailAfterDrag.scrollVelocityY}`);

      await new Promise(r => setTimeout(r, 140));
      const detailLater = await page.client.eval('window.testState');
      assert.ok(detailLater.detailScrollY > detailAfterDrag.detailScrollY, 'Charge Detail must continue gliding smoothly after mouse drag release');

      assert.deepEqual(page.client.errors, []);
    } finally {
      await page.close();
    }
  });
});
