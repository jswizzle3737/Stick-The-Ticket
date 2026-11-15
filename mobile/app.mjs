import { CHARGES, CATEGORIES, POA_GENERAL_CHECKLIST } from './legislation_data.mjs';
import { listPhotos, savePhoto, deletePhoto, capturePhoto } from './photos.mjs';

// Application State
const state = {
  currentTab: 'home', // 'home' | 'charges' | 'saved'
  selectedCategory: 'all',
  searchQuery: '',
  selectedChargeId: null,
  sortBy: 'section', // 'section' | 'name'
  savedCharges: new Set(JSON.parse(localStorage.getItem('stick-the-ticket-saved') || '[]')),
  // checklist state stored per charge: { [chargeId]: { [checkItemId]: boolean } }
  checklistState: JSON.parse(localStorage.getItem('stick-the-ticket-checks') || '{}'),
  theme: localStorage.getItem('stick-the-ticket-theme') || 'dark'
};

// Apply Initial Theme
document.documentElement.setAttribute('data-theme', state.theme);

const app = document.querySelector('#app');

function saveSavedCharges() {
  localStorage.setItem('stick-the-ticket-saved', JSON.stringify(Array.from(state.savedCharges)));
}

function saveChecklistState() {
  localStorage.setItem('stick-the-ticket-checks', JSON.stringify(state.checklistState));
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('stick-the-ticket-theme', state.theme);
  render();
}

function toggleSaved(chargeId) {
  if (state.savedCharges.has(chargeId)) {
    state.savedCharges.delete(chargeId);
  } else {
    state.savedCharges.add(chargeId);
  }
  saveSavedCharges();
  render();
}

function toggleCheck(chargeId, checkId) {
  if (!state.checklistState[chargeId]) {
    state.checklistState[chargeId] = {};
  }
  state.checklistState[chargeId][checkId] = !state.checklistState[chargeId][checkId];
  saveChecklistState();
  render();
}

function filterCharges(isSavedView = false) {
  const q = state.searchQuery.trim().toLowerCase();
  return CHARGES.filter(c => {
    if (isSavedView && !state.savedCharges.has(c.id)) return false;
    if (!isSavedView && state.selectedCategory !== 'all' && c.category !== state.selectedCategory) return false;
    if (!q) return true;
    return (
      c.section.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.statute.toLowerCase().includes(q) ||
      c.shortWording.toLowerCase().includes(q) ||
      (c.subSection && c.subSection.toLowerCase().includes(q))
    );
  }).sort((a, b) => {
    if (state.sortBy === 'name') return a.name.localeCompare(b.name);
    return a.section.localeCompare(b.section, undefined, { numeric: true });
  });
}

// Render Trillium SVG Vector Emblem
function trilliumIcon(size = 32) {
  return `
    <svg class="trillium-icon" width="${size}" height="${size}" viewBox="0 0 192 192">
      <defs>
        <linearGradient id="tg-${size}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#15803d"/>
          <stop offset="100%" stop-color="#052e16"/>
        </linearGradient>
      </defs>
      <g transform="translate(96,96)" fill="none" stroke="currentColor">
        <path d="M0,0 L0,55" stroke="#15803d" stroke-width="8" stroke-linecap="round"/>
        <path d="M0,0 L-47,-27" stroke="#15803d" stroke-width="8" stroke-linecap="round"/>
        <path d="M0,0 L47,-27" stroke="#15803d" stroke-width="8" stroke-linecap="round"/>
        <path d="M0,0 C-18,-25 -25,-60 0,-70 C25,-60 18,-25 0,0 Z" fill="#f0fdf4" stroke="#86efac" stroke-width="3.5"/>
        <path d="M0,0 C22,-18 55,-12 60,12 C45,28 15,18 0,0 Z" fill="#f0fdf4" stroke="#86efac" stroke-width="3.5" transform="rotate(120)"/>
        <path d="M0,0 C22,-18 55,-12 60,12 C45,28 15,18 0,0 Z" fill="#f0fdf4" stroke="#86efac" stroke-width="3.5" transform="rotate(240)"/>
        <circle cx="0" cy="0" r="8" fill="#eab308"/>
      </g>
    </svg>
  `;
}

// Main View Template Renderers
function renderHeader() {
  return `
    <div class="status-bar">
      <span>9:41</span>
      <div class="status-icons">
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
          <rect x="0" y="8" width="2.5" height="3" rx="0.5"/>
          <rect x="4" y="5" width="2.5" height="6" rx="0.5"/>
          <rect x="8" y="2" width="2.5" height="9" rx="0.5"/>
          <rect x="12" y="0" width="2.5" height="11" rx="0.5"/>
        </svg>
        <span style="font-size:11px;">5G</span>
        <svg width="20" height="10" viewBox="0 0 20 10" fill="none" stroke="currentColor">
          <rect x="0.5" y="0.5" width="16" height="9" rx="2.5" stroke-width="1"/>
          <rect x="2" y="2" width="11" height="6" rx="1.5" fill="currentColor"/>
          <path d="M18 3.5v3" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
    </div>
    <header class="header-bar">
      <div class="header-brand">
        ${trilliumIcon(30)}
        <div class="header-title-wrap">
          <h1>Stick the Ticket</h1>
          <div class="header-subtitle">Ontario POA Officer Reference</div>
        </div>
      </div>
      <button id="theme-toggle" class="theme-btn" type="button">
        ${state.theme === 'dark' ? 'Light' : 'Dark'}
      </button>
    </header>
  `;
}

function renderHomeView() {
  const pinnedCount = state.savedCharges.size;
  return `
    <div class="home-view">
      <div class="home-hero-mark">
        ${trilliumIcon(72)}
      </div>
      <h2 class="home-hero-title">
        Before the ticket,
        <span>verify the elements.</span>
      </h2>
      <p class="home-hero-subtitle">
        Frontline reference for Ontario POA charges, short-form wording, set fines, and statutory compliance checklists.
      </p>

      <div class="home-stats-grid">
        <div class="stat-card">
          <div class="stat-number">${CHARGES.length}</div>
          <div class="stat-label">POA Charges Listed</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${pinnedCount}</div>
          <div class="stat-label">Pinned on Board</div>
        </div>
      </div>

      <div id="home-search-pill" class="home-search-pill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="11" cy="11" r="7"/>
          <line x1="16.5" y1="16.5" x2="21" y2="21"/>
        </svg>
        <input id="home-search-input" type="text" placeholder="Search section, offence, or statute..." autocomplete="off">
      </div>

      <div class="home-quick-cats">
        <button class="quick-cat-btn" data-cat="speeding">⚡ Speeding</button>
        <button class="quick-cat-btn" data-cat="moving">🚦 Moving Violations</button>
        <button class="quick-cat-btn" data-cat="insurance">🛡️ Insurance (CAIA)</button>
        <button class="quick-cat-btn" data-cat="liquor">🍺 Liquor (LLCA)</button>
        <button class="quick-cat-btn" data-cat="trespass">🚫 Trespass (TTPA)</button>
      </div>
    </div>
  `;
}

function renderChargesList(isSavedView = false) {
  const visible = filterCharges(isSavedView);
  return `
    ${!isSavedView ? `
      <div class="search-bar-wrap">
        <div class="search-input-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"/>
            <line x1="16.5" y1="16.5" x2="21" y2="21"/>
          </svg>
          <input id="search-input" type="text" value="${state.searchQuery}" placeholder="Search number, wording, or statute...">
        </div>
      </div>
      <div class="chips-wrap">
        ${CATEGORIES.map(cat => `
          <button class="chip-btn ${state.selectedCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">
            ${cat.label}
          </button>
        `).join('')}
      </div>
    ` : `
      <div class="saved-header">
        <h2>Pinned Patrol Charges</h2>
        <p>Keep your most frequent traffic stops and common charges ready for quick element verification.</p>
      </div>
    `}

    <div class="list-meta-bar">
      <span>${isSavedView ? 'PINNED' : (state.selectedCategory.toUpperCase())} · ${visible.length} CHARGES</span>
      <button id="sort-toggle" class="sort-btn" type="button">
        BY ${state.sortBy === 'section' ? 'SECTION' : 'NAME'}
      </button>
    </div>

    <div class="charge-list">
      ${visible.length === 0 ? `
        <div class="empty-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h3>${isSavedView ? 'No Charges Pinned Yet' : 'No Matching POA Charges'}</h3>
          <p>${isSavedView ? 'Tap on any charge detail and click "Pin Charge" to save it here.' : 'Try another section number or keyword.'}</p>
        </div>
      ` : visible.map(c => {
        const isStuck = state.savedCharges.has(c.id);
        return `
          <div class="charge-card" data-id="${c.id}">
            <div class="charge-sec">${c.statute} ${c.section}</div>
            <div class="charge-info">
              <div class="charge-name">${c.name}</div>
              <div class="charge-meta">
                <span class="badge-part">${c.part}</span>
                ${c.setFine ? `<span>Set: $${c.setFine.toFixed(2)}</span>` : '<span style="color:#eab308;font-weight:700;">Summons</span>'}
                ${c.points > 0 ? `<span class="badge-points">• ${c.points} Demerits</span>` : ''}
                ${isStuck ? '<span style="color:var(--accent);font-weight:700;">📌 Pinned</span>' : ''}
              </div>
            </div>
            <svg class="charge-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderDetailView() {
  const c = CHARGES.find(item => item.id === state.selectedChargeId);
  if (!c) return renderHomeView();

  const isStuck = state.savedCharges.has(c.id);
  const chargeChecks = state.checklistState[c.id] || {};
  
  // Element checks progress
  const totalElements = c.elements.length;
  const checkedElements = c.elements.filter(e => chargeChecks[e.id]).length;
  
  // POA statutory checklist progress
  const totalPOA = POA_GENERAL_CHECKLIST.length;
  const checkedPOA = POA_GENERAL_CHECKLIST.filter(p => chargeChecks[p.id]).length;

  return `
    <div class="detail-view">
      <div class="detail-top-bar">
        <button id="detail-back" class="back-btn" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        <button id="detail-stick" class="stick-btn ${isStuck ? 'stuck' : ''}" type="button">
          ${isStuck ? '✓ Pinned' : '+ Pin Charge'}
        </button>
      </div>

      <div class="detail-header">
        <div class="detail-section-code">${c.statute} Section ${c.section} ${c.subSection ? `(${c.subSection})` : ''}</div>
        <h2 class="detail-title">${c.name}</h2>
        <p class="detail-act-ref">${c.statute} · Official Provincial Offence Profile</p>
      </div>

      <div class="penalty-grid">
        <div class="penalty-box">
          <div class="p-label">Procedure</div>
          <div class="p-val" style="font-size:13px;">${c.part}</div>
        </div>
        <div class="penalty-box highlight">
          <div class="p-label">Set Fine</div>
          <div class="p-val">${c.setFine ? `$${c.setFine.toFixed(2)}` : 'Summons'}</div>
        </div>
        <div class="penalty-box">
          <div class="p-label">Demerits</div>
          <div class="p-val">${c.points} Pts</div>
        </div>
      </div>

      <div class="wording-box">
        <div class="wording-title">O. Reg 950 Short-Form Certificate Wording</div>
        <p class="wording-text">“${c.shortWording}”</p>
      </div>

      <!-- Offence Elements Checklist -->
      <section class="checklist-section">
        <div class="section-headline">
          <h3>1. Essential Elements Checklist</h3>
          <span class="checklist-progress">${checkedElements}/${totalElements} Verified</span>
        </div>
        <div class="checklist-items">
          ${c.elements.map(el => {
            const isChecked = !!chargeChecks[el.id];
            return `
              <div class="check-item ${isChecked ? 'checked' : ''}" data-check="${el.id}">
                <div class="check-box">
                  ${isChecked ? `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ` : ''}
                </div>
                <div class="check-content">
                  <div class="check-title">${el.text}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <!-- POA Statutory Requirements Checklist -->
      <section class="checklist-section">
        <div class="section-headline">
          <h3>2. POA Ticket Issuance Rules</h3>
          <span class="checklist-progress">${checkedPOA}/${totalPOA} Done</span>
        </div>
        <div class="checklist-items">
          ${POA_GENERAL_CHECKLIST.map(item => {
            const isChecked = !!chargeChecks[item.id];
            return `
              <div class="check-item ${isChecked ? 'checked' : ''}" data-check="${item.id}">
                <div class="check-box">
                  ${isChecked ? `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ` : ''}
                </div>
                <div class="check-content">
                  <div class="check-title">${item.label}</div>
                  <div class="check-note">${item.note}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <!-- Procedures & Notes -->
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:16px;">
        <div style="font-size:10.5px;font-weight:700;color:var(--accent);text-transform:uppercase;margin-bottom:4px;">Officer Patrol Notes</div>
        <p style="font-size:12.5px;color:var(--ink-dim);line-height:1.45;margin:0;">${c.procedureNotes}</p>
      </div>

      <div class="statute-link-box">
        <a href="${c.statuteUrl}" target="_blank" rel="noopener noreferrer">
          View official Ontario statute
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </div>
    </div>
  `;
}

function renderBottomNav() {
  return `
    <nav class="bottom-nav">
      <button class="nav-btn ${state.currentTab === 'home' ? 'active' : ''}" data-tab="home">
        <svg viewBox="0 0 24 24">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        Home
      </button>
      <button class="nav-btn ${state.currentTab === 'charges' ? 'active' : ''}" data-tab="charges">
        <svg viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        POA Codes
      </button>
      <button class="nav-btn ${state.currentTab === 'saved' ? 'active' : ''}" data-tab="saved">
        <svg viewBox="0 0 24 24">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        Pinned (${state.savedCharges.size})
      </button>
    </nav>
  `;
}

function render() {
  let mainContent = '';
  if (state.selectedChargeId) {
    mainContent = renderDetailView();
  } else if (state.currentTab === 'home') {
    mainContent = renderHomeView();
  } else if (state.currentTab === 'charges') {
    mainContent = renderChargesList(false);
  } else if (state.currentTab === 'saved') {
    mainContent = renderChargesList(true);
  }

  app.innerHTML = `
    ${renderHeader()}
    <div id="view-container" class="view-container">
      ${mainContent}
    </div>
    ${renderBottomNav()}
  `;

  attachEventHandlers();
}

function attachEventHandlers() {
  // Theme Toggle
  const themeBtn = document.querySelector('#theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // Bottom Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentTab = btn.dataset.tab;
      state.selectedChargeId = null;
      render();
    });
  });

  // Home search pill
  const homePill = document.querySelector('#home-search-pill');
  if (homePill) {
    homePill.addEventListener('click', () => {
      state.currentTab = 'charges';
      render();
      const input = document.querySelector('#search-input');
      if (input) input.focus();
    });
  }

  // Home Quick Categories
  document.querySelectorAll('.quick-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentTab = 'charges';
      state.selectedCategory = btn.dataset.cat;
      render();
    });
  });

  // Search input in Charges view
  const searchInput = document.querySelector('#search-input');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      state.searchQuery = e.target.value;
      const listContainer = document.querySelector('.charge-list');
      if (listContainer) {
        listContainer.innerHTML = filterCharges(false).map(c => `
          <div class="charge-card" data-id="${c.id}">
            <div class="charge-sec">${c.statute} ${c.section}</div>
            <div class="charge-info">
              <div class="charge-name">${c.name}</div>
              <div class="charge-meta">
                <span class="badge-part">${c.part}</span>
                ${c.setFine ? `<span>Set: $${c.setFine.toFixed(2)}</span>` : '<span style="color:#eab308;font-weight:700;">Summons</span>'}
                ${c.points > 0 ? `<span class="badge-points">• ${c.points} Demerits</span>` : ''}
              </div>
            </div>
            <svg class="charge-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        `).join('');
        // Re-attach card clicks
        attachCardClicks();
      }
    });
  }

  // Category Chips
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.dataset.category;
      render();
    });
  });

  // Sort toggle
  const sortBtn = document.querySelector('#sort-toggle');
  if (sortBtn) {
    sortBtn.addEventListener('click', () => {
      state.sortBy = state.sortBy === 'section' ? 'name' : 'section';
      render();
    });
  }

  // Charge row clicks
  attachCardClicks();

  // Detail View: Back button
  const backBtn = document.querySelector('#detail-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      state.selectedChargeId = null;
      render();
    });
  }

  // Detail View: Stick / Pin charge button
  const stickBtn = document.querySelector('#detail-stick');
  if (stickBtn) {
    stickBtn.addEventListener('click', () => {
      toggleSaved(state.selectedChargeId);
    });
  }

  // Detail View: Checkbox clicks
  document.querySelectorAll('.check-item').forEach(item => {
    item.addEventListener('click', () => {
      const checkId = item.dataset.check;
      if (state.selectedChargeId && checkId) {
        toggleCheck(state.selectedChargeId, checkId);
      }
    });
  });
}

function attachCardClicks() {
  document.querySelectorAll('.charge-card').forEach(card => {
    card.addEventListener('click', () => {
      state.selectedChargeId = card.dataset.id;
      render();
    });
  });
}

// Initial Render
render();

// --- Evidence Photos Dialog Management ---
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
      empty.className = 'empty-photos';
      empty.textContent = 'No evidence photos taken yet. Photos are kept privately in this browser.';
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
      img.alt = `Evidence photo saved ${new Date(photo.createdAt).toLocaleString()}`;
      const actions = document.createElement('div');
      actions.className = 'photo-actions';
      const download = document.createElement('a');
      download.href = url;
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[photo.blob.type] || 'image';
      download.download = `stick-the-ticket-evidence-${photo.id}.${ext}`;
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
          status.textContent = 'Could not delete the photo.';
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
      throw new Error('Camera unavailable. Use image chooser below.');
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
      ? 'Camera permission denied. Use the image file chooser below.'
      : (error.message || 'Could not open camera.');
  }
});

capture.addEventListener('click', async () => {
  capture.disabled = true;
  status.textContent = 'Saving evidence photo…';
  try {
    await capturePhoto(preview);
    stopCamera();
    status.textContent = 'Evidence photo saved on device.';
    await showPhotos();
  } catch (error) {
    status.textContent = error.message || 'Could not save photo.';
  } finally {
    capture.disabled = false;
  }
});

camera.addEventListener('change', async () => {
  const file = camera.files?.[0];
  if (!file) return;
  camera.disabled = true;
  status.textContent = 'Saving image…';
  try {
    await savePhoto(file);
    status.textContent = 'Image saved on device.';
    await showPhotos();
  } catch (error) {
    status.textContent = error.message || 'Could not save image.';
  } finally {
    camera.disabled = false;
    camera.value = '';
  }
});
