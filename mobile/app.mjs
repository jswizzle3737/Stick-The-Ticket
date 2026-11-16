// Canvas-rendered egui layout emulator for Stick the Ticket (Exact 1:1 match with Stick the Charge)
import { CHARGES, CATEGORIES, POA_GENERAL_CHECKLIST } from './legislation_data.mjs';
import { listPhotos, savePhoto, deletePhoto, capturePhoto } from './photos.mjs';

const canvas = document.querySelector('#screen');
const ctx = canvas.getContext('2d');
const loading = document.querySelector('#loading');

// Layout Constants (identical to Stick the Charge egui constants)
const NAV_H = 64.0;
const PAD = 18.0;

// High contrast palette with refined deep green tint & darker green highlights
const THEME = {
  light: {
    page: '#e7ece6',
    body: '#111a13',
    screen: '#edf3ec',
    surface: '#ffffff',
    surface_hover: '#dfebd0',
    surface_press: '#d2e0cf',
    line: '#cbd9cc',
    ink: '#111a13',
    ink_dim: '#324235',
    ink_faint: '#546b58',
    accent: '#126332',   // Refined darker green accent
    green: '#126332',    // Brand green (darker forest green)
    link: '#115228'
  },
  dark: {
    page: '#050806',
    body: '#000000',
    screen: '#0a100c',
    surface: '#131c15',
    surface_hover: '#1c291f',
    surface_press: '#26372b',
    line: '#243327',
    ink: '#f5faf6',
    ink_dim: '#cbd8ce',
    ink_faint: '#7f9684',
    accent: '#2ea85c',   // Refined deep emerald
    green: '#1ba14e',    // Brand green
    link: '#34bc67'
  }
};

let isDark = localStorage.getItem('stick-the-ticket-theme') === 'dark';
document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

function colors() {
  return isDark ? THEME.dark : THEME.light;
}

// Logo image objects
const logoDark = new Image();
logoDark.src = './logo-dark.png';
const logoLight = new Image();
logoLight.src = './logo-light.png';

logoDark.onload = () => requestRedraw();
logoLight.onload = () => requestRedraw();

// State
let tab = 'home'; // 'home' | 'charges' | 'saved'
let query = '';
let filter = null;
let sort = 'number'; // 'number' | 'name'
let openChargeIdx = null;
let stuck = new Set(JSON.parse(localStorage.getItem('stick-the-ticket-saved') || '[]'));
let checkedItems = JSON.parse(localStorage.getItem('stick-the-ticket-checks') || '{}');
let listScrollY = 0;
let detailScrollY = 0;

function saveStuck() {
  localStorage.setItem('stick-the-ticket-saved', JSON.stringify(Array.from(stuck)));
}

function saveChecks() {
  localStorage.setItem('stick-the-ticket-checks', JSON.stringify(checkedItems));
}

function toggleTheme() {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('stick-the-ticket-theme', isDark ? 'dark' : 'light');
  requestRedraw();
}

// Click Targets for Hit-Testing on Canvas
let clickables = [];
function addClickable(rect, action) {
  clickables.push({ rect, action });
  window.testClickables = clickables.map(c => ({
    x: Math.round(c.rect.x),
    y: Math.round(c.rect.y),
    w: Math.round(c.rect.w),
    h: Math.round(c.rect.h)
  }));
}

// Draw new official clipboard & Ontario map logo
function drawLogo(context, cx, cy, targetWidth) {
  const img = isDark ? logoLight : logoDark;
  const aspect = 1024 / 764; // original aspect ratio 1.34:1
  const w = targetWidth;
  const h = w / aspect;
  if (img.complete && img.naturalWidth > 0) {
    context.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    // Fallback while loading
    context.fillStyle = colors().green;
    context.fillRect(cx - w / 2, cy - h / 2, w, h);
  }
}

function visibleCharges(stuckOnly = false) {
  const q = query.trim().toLowerCase();
  let list = CHARGES.map((c, i) => ({ ...c, originalIdx: i })).filter(c => {
    if (stuckOnly) return stuck.has(c.id);
    if (filter && c.category !== filter) return false;
    if (!q) return true;
    return (
      c.section.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.statute.toLowerCase().includes(q) ||
      c.shortWording.toLowerCase().includes(q)
    );
  });

  if (sort === 'number') {
    list.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
  } else {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return list;
}

// Resize canvas to physical pixels
let dpr = window.devicePixelRatio || 1;
let width = 0;
let height = 0;
let screenRect = { x: 0, y: 0, w: 0, h: 0 };

function resize() {
  dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  draw();
}

window.addEventListener('resize', resize);

function requestRedraw() {
  requestAnimationFrame(draw);
}

// Drawing routines
function draw() {
  clickables = [];
  ctx.save();
  ctx.scale(dpr, dpr);

  const c = colors();

  // Background
  ctx.fillStyle = c.page;
  ctx.fillRect(0, 0, width, height);

  // Phone body mock (identical to Stick-the-Charge app.rs)
  const margin = 16.0;
  const phone_w = Math.max(300.0, Math.min(430.0, width - margin * 2.0));
  const phone_h = Math.max(420.0, Math.min(phone_w * 2.02, height - margin * 2.0));
  const phone_x = (width - phone_w) / 2.0;
  const phone_y = (height - phone_h) / 2.0;

  // Outer shadows & phone border
  ctx.fillStyle = c.body;
  roundRect(ctx, phone_x, phone_y, phone_w, phone_h, 40);
  ctx.fill();
  ctx.strokeStyle = '#1a241b';
  ctx.lineWidth = 1.0;
  ctx.stroke();

  // Phone inner screen
  const s_x = phone_x + 9.0;
  const s_y = phone_y + 9.0;
  const s_w = phone_w - 18.0;
  const s_h = phone_h - 18.0;
  screenRect = { x: s_x, y: s_y, w: s_w, h: s_h };

  ctx.save();
  roundRect(ctx, s_x, s_y, s_w, s_h, 32);
  ctx.clip();

  ctx.fillStyle = c.screen;
  ctx.fillRect(s_x, s_y, s_w, s_h);

  // Render status bar
  drawStatusBar(ctx, s_x, s_y, s_w);

  if (openChargeIdx !== null) {
    drawDetailScreen(ctx, s_x, s_y, s_w, s_h);
  } else {
    drawTitleBar(ctx, s_x, s_y + 44.0, s_w);
    if (tab === 'home') {
      drawHomeScreen(ctx, s_x, s_y, s_w, s_h);
    } else if (tab === 'charges') {
      drawChargesScreen(ctx, s_x, s_y, s_w, s_h, false);
    } else if (tab === 'saved') {
      drawChargesScreen(ctx, s_x, s_y, s_w, s_h, true);
    }
    drawNavBar(ctx, s_x, s_y, s_w, s_h);
  }

  ctx.restore();
  ctx.restore();

  if (loading) loading.textContent = '';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStatusBar(ctx, x, y, w) {
  const c = colors();
  ctx.font = '600 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink;
  ctx.textAlign = 'left';
  ctx.fillText('9:41', x + 30.0, y + 32.0);

  // Dynamic Island Notch
  ctx.fillStyle = '#000000';
  roundRect(ctx, x + w / 2 - 46.0, y + 6.0, 92.0, 22.0, 11);
  ctx.fill();

  // Battery & Signal bars
  const rx = x + w - 30.0;
  ctx.fillStyle = c.ink;
  roundRect(ctx, rx - 20.0, y + 24.0, 18.0, 9.0, 2.5);
  ctx.strokeStyle = c.ink_dim;
  ctx.stroke();
  ctx.fillRect(rx - 18.0, y + 26.0, 10.0, 5.0);
}

function drawTitleBar(ctx, x, y, w) {
  const c = colors();
  // Logo icon
  drawLogo(ctx, x + PAD + 14.0, y + 24.0, 30.0);

  ctx.font = `700 ${w < 340.0 ? 16.5 : 19.0}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = c.ink;
  ctx.textAlign = 'left';
  ctx.fillText('Stick the Ticket', x + PAD + 36.0, y + 21.0);

  ctx.font = '700 8.5px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink_faint;
  ctx.fillText('ONTARIO PROVINCIAL OFFENCES ACT', x + PAD + 36.5, y + 34.0);

  // Dark/Light switch button
  const sw_w = 58.0;
  const sw_h = 32.0;
  const sw_x = x + w - PAD - sw_w;
  const sw_y = y + 8.0;

  ctx.fillStyle = c.surface;
  roundRect(ctx, sw_x, sw_y, sw_w, sw_h, 9);
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.stroke();

  ctx.font = '600 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink;
  ctx.textAlign = 'center';
  ctx.fillText(isDark ? 'Light' : 'Dark', sw_x + sw_w / 2, sw_y + 20.5);

  addClickable({ x: sw_x, y: sw_y, w: sw_w, h: sw_h }, () => toggleTheme());
}

function drawHomeScreen(ctx, x, y, w, h) {
  const c = colors();
  const cx = x + w / 2;
  const leaf_y = y + Math.max(130.0, h * 0.20);

  // Hero Logo Emblem
  drawLogo(ctx, cx, leaf_y, 82.0);

  // Hero titles (identical typography to Stick-the-Charge)
  ctx.font = '700 27px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink;
  ctx.textAlign = 'center';
  ctx.fillText('Before the ticket,', cx, leaf_y + 68.0);

  ctx.fillStyle = c.green;
  ctx.fillText('check the Code.', cx, leaf_y + 102.0);

  ctx.font = '13px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink_faint;
  ctx.fillText('Find a POA charge. Review the essential elements.', cx, leaf_y + 138.0);

  // Search pill
  const pill_w = Math.max(120.0, w - PAD * 2.0);
  const pill_h = 50.0;
  const pill_y = y + h - NAV_H - 34.0;
  const pill_x = cx - pill_w / 2;

  ctx.fillStyle = c.surface;
  roundRect(ctx, pill_x, pill_y, pill_w, pill_h, 25);
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Search icon
  const ic_x = pill_x + 24.0;
  const ic_y = pill_y + pill_h / 2;
  ctx.beginPath();
  ctx.arc(ic_x, ic_y - 1.0, 5.5, 0, Math.PI * 2);
  ctx.strokeStyle = c.ink_faint;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ic_x + 4.0, ic_y + 3.0);
  ctx.lineTo(ic_x + 8.0, ic_y + 7.0);
  ctx.stroke();

  // Search text
  ctx.font = '13.5px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink_faint;
  ctx.textAlign = 'left';
  ctx.fillText(query ? query : 'Offence, keyword or section', pill_x + 42.0, pill_y + 31.0);

  addClickable({ x: pill_x, y: pill_y, w: pill_w, h: pill_h }, () => {
    tab = 'charges';
    requestRedraw();
  });
}

function drawChargesScreen(ctx, x, y, w, h, stuckOnly = false) {
  const c = colors();
  let curY = y + 44.0 + 52.0;

  if (!stuckOnly) {
    // Search Box
    const s_box_w = w - PAD * 2.0;
    const s_box_h = 40.0;
    const s_box_x = x + PAD;

    ctx.fillStyle = c.surface;
    roundRect(ctx, s_box_x, curY, s_box_w, s_box_h, 12);
    ctx.fill();
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1.0;
    ctx.stroke();

    const ic_x = s_box_x + 18.0;
    const ic_y = curY + s_box_h / 2;
    ctx.beginPath();
    ctx.arc(ic_x, ic_y - 1.0, 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = c.ink_dim;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ic_x + 4.0, ic_y + 3.0);
    ctx.lineTo(ic_x + 8.0, ic_y + 7.0);
    ctx.stroke();

    ctx.font = '13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = query ? c.ink : c.ink_faint;
    ctx.textAlign = 'left';
    ctx.fillText(query ? query : 'Search a number or charge', s_box_x + 36.0, curY + 25.0);

    addClickable({ x: s_box_x, y: curY, w: s_box_w, h: s_box_h }, () => {
      const input = prompt('Search POA section, offence, or keyword:', query);
      if (input !== null) {
        query = input;
        requestRedraw();
      }
    });

    curY += s_box_h + 8.0;

    // Category chips
    let chipX = x + PAD;
    const chipH = 28.0;
    const categories = [{ id: null, label: 'All' }, ...CATEGORIES.filter(c => c.id !== 'all')];

    for (const cat of categories) {
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      const textW = ctx.measureText(cat.label).width;
      const chipW = textW + 22.0;

      if (chipX + chipW > x + w - PAD) break;

      const isSel = (cat.id === null && filter === null) || filter === cat.id;
      ctx.fillStyle = isSel ? c.ink : c.surface;
      roundRect(ctx, chipX, curY, chipW, chipH, 14);
      ctx.fill();
      if (!isSel) {
        ctx.strokeStyle = c.line;
        ctx.stroke();
      }

      ctx.fillStyle = isSel ? c.screen : c.ink_dim;
      ctx.textAlign = 'center';
      ctx.fillText(cat.label, chipX + chipW / 2, curY + 18.5);

      addClickable({ x: chipX, y: curY, w: chipW, h: chipH }, () => {
        filter = cat.id;
        requestRedraw();
      });

      chipX += chipW + 7.0;
    }

    curY += chipH + 8.0;
  }

  // Caption row with count and Sort toggle
  const listItems = visibleCharges(stuckOnly);
  const headY = curY;
  ctx.font = '700 9.5px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink_faint;
  ctx.textAlign = 'left';
  const caption = stuckOnly
    ? `STUCK · ${listItems.length}`
    : `${filter ? filter.toUpperCase() : 'ALL POA CHARGES'} · ${listItems.length}`;
  ctx.fillText(caption, x + PAD, headY + 16.0);

  // Sort button
  const sortW = 76.0;
  const sortH = 22.0;
  const sortX = x + w - PAD - sortW;
  const sortY = headY + 4.0;
  ctx.fillStyle = c.surface;
  roundRect(ctx, sortX, sortY, sortW, sortH, 9);
  ctx.fill();
  ctx.font = '700 8.5px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink_dim;
  ctx.textAlign = 'center';
  ctx.fillText(sort === 'number' ? 'BY NUMBER' : 'BY NAME', sortX + sortW / 2, sortY + 14.5);

  addClickable({ x: sortX, y: sortY, w: sortW, h: sortH }, () => {
    sort = sort === 'number' ? 'name' : 'number';
    requestRedraw();
  });

  curY += 28.0;

  // List Rows
  const listBottom = y + h - NAV_H - 8.0;
  const maxListH = listBottom - curY;

  ctx.save();
  ctx.rect(x, curY, w, maxListH);
  ctx.clip();

  let rowY = curY - listScrollY;

  if (listItems.length === 0) {
    const cy = curY + 70.0;
    ctx.save();
    ctx.globalAlpha = 0.4;
    drawLogo(ctx, x + w / 2, cy - 20.0, 48.0);
    ctx.restore();
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = c.ink_dim;
    ctx.textAlign = 'center';
    ctx.fillText(stuckOnly ? 'Nothing stuck yet' : 'No charge matches that', x + w / 2, cy + 24.0);
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = c.ink_faint;
    ctx.fillText(stuckOnly ? 'Open a charge and stick it here' : 'Try another number or word', x + w / 2, cy + 42.0);
  } else {
    for (const item of listItems) {
      const isStuck = stuck.has(item.id);
      const rowW = w - PAD * 2.0;
      const rowH = 60.0;
      const rowX = x + PAD;

      if (rowY + rowH >= curY && rowY <= listBottom) {
        ctx.fillStyle = c.surface;
        roundRect(ctx, rowX, rowY, rowW, rowH, 13);
        ctx.fill();
        ctx.strokeStyle = c.line;
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Section number
        ctx.font = '700 13px ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = isStuck ? c.green : c.ink;
        ctx.textAlign = 'left';
        ctx.fillText(item.section, rowX + 14.0, rowY + 28.0);

        // Name
        ctx.font = '600 14px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = c.ink;
        ctx.fillText(item.name.length > 25 ? item.name.slice(0, 24) + '…' : item.name, rowX + 78.0, rowY + 26.0);

        // Category caption & act
        ctx.font = '700 8px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = c.ink_faint;
        ctx.fillText(`${item.statute} · ONTARIO PROVINCIAL OFFENCE`, rowX + 78.0, rowY + 46.0);

        // Stuck indicator pin mark
        if (isStuck) {
          drawLogo(ctx, rowX + rowW - 36.0, rowY + 28.0, 18.0);
        }

        // Chevron arrow
        ctx.beginPath();
        const arrX = rowX + rowW - 18.0;
        const arrY = rowY + 28.0;
        ctx.moveTo(arrX - 3.0, arrY - 5.0);
        ctx.lineTo(arrX + 2.0, arrY);
        ctx.lineTo(arrX - 3.0, arrY + 5.0);
        ctx.strokeStyle = c.ink_faint;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        addClickable({ x: rowX, y: rowY, w: rowW, h: rowH }, () => {
          openChargeIdx = item.originalIdx;
          detailScrollY = 0;
          requestRedraw();
        });
      }
      rowY += rowH + 8.0;
    }
  }

  ctx.restore();
}

function drawDetailScreen(ctx, x, y, w, h) {
  const c = colors();
  const charge = CHARGES[openChargeIdx];
  const isStuck = stuck.has(charge.id);
  const innerW = w - PAD * 2.0;

  // Header back bar (placed below 44px status bar)
  const barY = y + 44.0;
  const backX = x + PAD + 16.0;
  const backY = barY + 22.0;

  // Back circle button
  ctx.fillStyle = c.surface;
  ctx.beginPath();
  ctx.arc(backX, backY, 17.0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(backX + 2.5, backY - 5.0);
  ctx.lineTo(backX - 3.0, backY);
  ctx.lineTo(backX + 2.5, backY + 5.0);
  ctx.strokeStyle = c.ink_dim;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  addClickable({ x: backX - 17.0, y: backY - 17.0, w: 34.0, h: 34.0 }, () => {
    openChargeIdx = null;
    requestRedraw();
  });

  // Center Logo
  drawLogo(ctx, x + w / 2, backY, 34.0);

  // Save / Stick button (top right)
  const saveW = 76.0;
  const saveH = 44.0;
  const saveX = x + w - PAD - saveW;
  const saveY = barY;

  ctx.font = '600 14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink;
  ctx.textAlign = 'center';
  ctx.fillText(isStuck ? 'Saved' : 'Save', saveX + saveW / 2, saveY + 26.0);

  addClickable({ x: saveX, y: saveY, w: saveW, h: saveH }, () => {
    if (stuck.has(charge.id)) {
      stuck.delete(charge.id);
    } else {
      stuck.add(charge.id);
    }
    saveStuck();
    requestRedraw();
  });

  // Scrollable Content
  const contentTop = barY + 48.0;
  const contentH = y + h - contentTop - 14.0;

  ctx.save();
  ctx.rect(x, contentTop, w, contentH);
  ctx.clip();

  let curY = contentTop + 24.0 - detailScrollY;

  // Charge Title block
  ctx.font = '700 24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink;
  ctx.textAlign = 'left';
  const titleLines = wrapText(ctx, charge.name, x + PAD, curY, innerW, 28.0);
  curY += (titleLines - 1) * 28.0 + 26.0;

  // Section subtitle
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink_dim;
  ctx.fillText(`${charge.statute} Section ${charge.section} · officer compliance draft`, x + PAD, curY);
  curY += 28.0;

  // Essential Elements Points (with green numbered highlights)
  const chargeChecks = checkedItems[charge.id] || {};

  charge.elements.forEach((el, index) => {
    const isChecked = !!chargeChecks[el.id];
    const ptX = x + PAD;
    const ptY = curY;

    // Checkbox / Number highlight
    ctx.font = '700 14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = c.green;
    ctx.textAlign = 'left';
    ctx.fillText(`${index + 1}.`, ptX, ptY);

    // Box toggle
    const chkX = ptX + 22.0;
    ctx.strokeStyle = isChecked ? c.green : c.ink_faint;
    ctx.lineWidth = 1.6;
    roundRect(ctx, chkX, ptY - 12.0, 16.0, 16.0, 4);
    if (isChecked) {
      ctx.fillStyle = c.green;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(chkX + 4.0, ptY - 4.0);
      ctx.lineTo(chkX + 7.0, ptY - 1.0);
      ctx.lineTo(chkX + 12.0, ptY - 8.0);
      ctx.stroke();
    } else {
      ctx.stroke();
    }

    addClickable({ x: chkX - 4.0, y: ptY - 16.0, w: 24.0, h: 24.0 }, () => {
      if (!checkedItems[charge.id]) checkedItems[charge.id] = {};
      checkedItems[charge.id][el.id] = !checkedItems[charge.id][el.id];
      saveChecks();
      requestRedraw();
    });

    // Element text
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = isChecked ? c.ink_dim : c.ink;
    const lines = wrapText(ctx, el.text, ptX + 46.0, ptY, innerW - 46.0, 18.0);
    curY += Math.max(26.0, lines * 18.0 + 8.0);
  });

  curY += 16.0;

  // Short-form Wording note
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink;
  ctx.fillText('Regulation Short-Form Wording (O. Reg. 950)', x + PAD, curY);
  curY += 16.0;

  ctx.font = 'italic 13px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink_dim;
  wrapText(ctx, `“${charge.shortWording}”`, x + PAD, curY, innerW, 18.0);
  curY += 36.0;

  // Penalty / Fine Section (matching Stick the Charge layout)
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink;
  ctx.fillText(`Penalty · ${charge.part}`, x + PAD, curY);
  curY += 18.0;

  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink;
  ctx.fillText(
    charge.setFine
      ? `• Set fine: $${charge.setFine.toFixed(2)} (Total payable: $${charge.totalPayable.toFixed(2)})`
      : `• ${charge.totalPayable}`,
    x + PAD,
    curY
  );
  curY += 18.0;

  if (charge.points > 0) {
    ctx.fillText(`• Demerit points: ${charge.points} points upon conviction`, x + PAD, curY);
    curY += 18.0;
  }

  // Statutory Divider
  curY += 14.0;
  ctx.beginPath();
  ctx.moveTo(x + PAD, curY);
  ctx.lineTo(x + PAD + innerW, curY);
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1.0;
  ctx.stroke();

  // Green vertical bar highlight
  ctx.fillStyle = c.green;
  roundRect(ctx, x + PAD, curY + 12.0, 3.0, 28.0, 2);
  ctx.fill();

  ctx.font = '700 16px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink;
  ctx.fillText('Statutory text', x + PAD + 12.0, curY + 24.0);

  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink_faint;
  ctx.fillText('The wording of the law', x + PAD + 12.0, curY + 38.0);
  curY += 56.0;

  // Official Statute Link
  ctx.font = '600 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.link;
  ctx.fillText(`Official ${charge.statute} Statute Section ↗`, x + PAD, curY);
  addClickable({ x: x + PAD, y: curY - 14.0, w: 200.0, h: 20.0 }, () => {
    window.open(charge.statuteUrl, '_blank');
  });
  curY += 24.0;

  // Statute Text
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink_dim;
  ctx.fillText(`${charge.statute} · Section ${charge.section}`, x + PAD, curY);
  curY += 16.0;

  ctx.font = '12.5px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = c.ink;
  wrapText(ctx, charge.summary, x + PAD, curY, innerW, 18.0);
  curY += 50.0;

  ctx.restore();
}

function drawNavBar(ctx, x, y, w, h) {
  const c = colors();
  const barY = y + h - NAV_H;

  // Nav surface
  ctx.fillStyle = c.screen;
  ctx.fillRect(x, barY, w, NAV_H);
  ctx.beginPath();
  ctx.moveTo(x, barY);
  ctx.lineTo(x + w, barY);
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1.0;
  ctx.stroke();

  const items = [
    { id: 'home', label: 'Home' },
    { id: 'charges', label: 'POA Code' },
    { id: 'saved', label: 'Saved' }
  ];
  const itemW = w / items.length;

  items.forEach((item, i) => {
    const itemX = x + itemW * i;
    const cx = itemX + itemW / 2;
    const cy = barY + 19.0;
    const active = tab === item.id;
    const color = active ? c.green : c.ink_faint;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;

    if (item.id === 'home') {
      ctx.beginPath();
      ctx.moveTo(cx - 7.5, cy + 1.0);
      ctx.lineTo(cx, cy - 6.5);
      ctx.lineTo(cx + 7.5, cy + 1.0);
      ctx.stroke();
      ctx.strokeRect(cx - 5.5, cy + 0.5, 11.0, 7.5);
      ctx.strokeRect(cx - 2.0, cy + 3.5, 4.0, 4.5);
    } else if (item.id === 'charges') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5.0);
      ctx.lineTo(cx, cy + 6.0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5.0);
      ctx.lineTo(cx - 4.0, cy - 6.0);
      ctx.lineTo(cx - 7.5, cy - 4.5);
      ctx.lineTo(cx - 7.5, cy + 4.5);
      ctx.lineTo(cx - 4.0, cy + 4.0);
      ctx.lineTo(cx, cy + 6.0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5.0);
      ctx.lineTo(cx + 4.0, cy - 6.0);
      ctx.lineTo(cx + 7.5, cy - 4.5);
      ctx.lineTo(cx + 7.5, cy + 4.5);
      ctx.lineTo(cx + 4.0, cy + 4.0);
      ctx.lineTo(cx, cy + 6.0);
      ctx.stroke();
    } else if (item.id === 'saved') {
      ctx.beginPath();
      ctx.moveTo(cx - 5.5, cy - 6.5);
      ctx.lineTo(cx + 5.5, cy - 6.5);
      ctx.lineTo(cx + 5.5, cy + 6.5);
      ctx.lineTo(cx, cy + 3.0);
      ctx.lineTo(cx - 5.5, cy + 6.5);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.font = '700 9.5px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(item.label, cx, cy + 15.0);

    addClickable({ x: itemX, y: barY, w: itemW, h: NAV_H }, () => {
      tab = item.id;
      openChargeIdx = null;
      listScrollY = 0;
      requestRedraw();
    });
  });

  // Home Bar pill indicator
  ctx.fillStyle = c.ink_dim;
  roundRect(ctx, x + w / 2 - 67.0, y + h - 8.0, 134.0, 4.0, 2);
  ctx.fill();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let linesCount = 1;
  let testY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, testY);
      line = words[n] + ' ';
      testY += lineHeight;
      linesCount++;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, testY);
  return linesCount;
}

function handlePointerAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  for (let i = clickables.length - 1; i >= 0; i--) {
    const c = clickables[i];
    if (x >= c.rect.x && x <= c.rect.x + c.rect.w && y >= c.rect.y && y <= c.rect.y + c.rect.h) {
      c.action();
      break;
    }
  }
}

canvas.addEventListener('click', e => {
  handlePointerAt(e.clientX, e.clientY);
});

// Touch and Wheel Scrolling
let touchStartY = 0;
canvas.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

canvas.addEventListener('touchmove', e => {
  const touchY = e.touches[0].clientY;
  const deltaY = touchStartY - touchY;
  touchStartY = touchY;

  if (openChargeIdx !== null) {
    detailScrollY = Math.max(0, detailScrollY + deltaY);
  } else if (tab === 'charges' || tab === 'saved') {
    listScrollY = Math.max(0, listScrollY + deltaY);
  }
  requestRedraw();
}, { passive: true });

canvas.addEventListener('wheel', e => {
  if (openChargeIdx !== null) {
    detailScrollY = Math.max(0, detailScrollY + e.deltaY);
  } else if (tab === 'charges' || tab === 'saved') {
    listScrollY = Math.max(0, listScrollY + e.deltaY);
  }
  requestRedraw();
}, { passive: true });

// Initial Render
resize();

// --- Evidence Photos Dialog Management (Exact same as Stick-the-Charge) ---
const dialog = document.querySelector('#photos');
const grid = document.querySelector('#photo-grid');
const status = document.querySelector('#photo-status');
const camera = document.querySelector('#camera');
const openCamera = document.querySelector('#open-camera');
const controls = document.querySelector('#camera-controls');
const preview = document.querySelector('#camera-preview');
const capture = document.querySelector('#capture-photo');
let objectUrls = [];
let stream = null;
let cameraRequest = 0;

function stopCamera() {
  const wasOpening = openCamera.disabled && !stream;
  cameraRequest++;
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  preview.srcObject = null;
  controls.hidden = true;
  dialog.classList.remove('camera-active');
  openCamera.hidden = false;
  openCamera.disabled = false;
  if (wasOpening) status.textContent = '';
}

function releaseUrls() {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
}

async function showPhotos() {
  releaseUrls();
  grid.replaceChildren();
  try {
    const photos = await listPhotos();
    if (!photos.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No photos yet. Take or add one to keep it here.';
      grid.append(empty);
      return;
    }
    for (const photo of photos.reverse()) {
      const url = URL.createObjectURL(photo.blob);
      objectUrls.push(url);
      const item = document.createElement('article');
      item.className = 'photo';
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Photo saved ${new Date(photo.createdAt).toLocaleString()}`;
      const actions = document.createElement('div');
      actions.className = 'photo-actions';
      const download = document.createElement('a');
      download.href = url;
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[photo.blob.type] || 'image';
      download.download = `stick-the-ticket-${photo.id}.${ext}`;
      download.textContent = 'Download';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        try {
          await deletePhoto(photo.id);
          status.textContent = 'Photo deleted.';
          await showPhotos();
        } catch {
          status.textContent = 'Could not delete the photo. Please try again.';
        }
      });
      actions.append(download, remove);
      item.append(img, actions);
      grid.append(item);
    }
  } catch {
    status.textContent = 'Photo storage is unavailable in this browser.';
  }
}

document.querySelector('#open-photos').addEventListener('click', async () => {
  status.textContent = '';
  dialog.showModal();
  await showPhotos();
});

document.querySelector('#close-photos').addEventListener('click', () => {
  stopCamera();
  dialog.close();
});
dialog.addEventListener('cancel', stopCamera);
dialog.addEventListener('close', () => {
  stopCamera();
  releaseUrls();
});
document.querySelector('#cancel-camera').addEventListener('click', stopCamera);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
});

openCamera.addEventListener('click', async () => {
  const request = ++cameraRequest;
  openCamera.disabled = true;
  status.textContent = 'Opening camera…';
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera unavailable. Use the phone camera or image chooser below.');
    }
    const nextStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    if (request !== cameraRequest || !dialog.open) {
      nextStream.getTracks().forEach(track => track.stop());
      return;
    }
    stream = nextStream;
    preview.srcObject = stream;
    controls.hidden = false;
    dialog.classList.add('camera-active');
    await preview.play();
    if (request !== cameraRequest) return;
    openCamera.hidden = true;
    status.textContent = '';
  } catch (error) {
    if (request !== cameraRequest) return;
    stopCamera();
    status.textContent = error.name === 'NotAllowedError'
      ? 'Camera permission was denied. Use the image chooser below or enable camera access.'
      : (error.message || 'Could not open the camera. Use the image chooser below.');
  }
});

capture.addEventListener('click', async () => {
  capture.disabled = true;
  status.textContent = 'Saving photo…';
  try {
    await capturePhoto(preview);
    stopCamera();
    status.textContent = 'Photo saved on this device.';
    await showPhotos();
  } catch (error) {
    status.textContent = error.message || 'Could not save the photo. Please try again.';
  } finally {
    capture.disabled = false;
  }
});

camera.addEventListener('change', async () => {
  const file = camera.files?.[0];
  if (!file) return;
  camera.disabled = true;
  status.textContent = 'Saving photo…';
  try {
    await savePhoto(file);
    status.textContent = 'Photo saved on this device.';
    await showPhotos();
  } catch (error) {
    status.textContent = error.message || 'Could not save the photo. Please try again.';
  } finally {
    camera.disabled = false;
    camera.value = '';
  }
});
