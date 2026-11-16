// Canvas-rendered phone UI for Stick the Ticket (Ontario POA officer reference)
import { CHARGES, CATEGORIES, STATUTES, POA_GENERAL_CHECKLIST } from './legislation_data.mjs';

const canvas = document.querySelector('#screen');
const ctx = canvas.getContext('2d');
const loading = document.querySelector('#loading');
const searchInput = document.querySelector('#search-input');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');

const authModal = document.querySelector('#auth-modal');
const authForm = document.querySelector('#auth-form');
const authTitle = document.querySelector('#auth-modal-title');
const authSubtitle = document.querySelector('#auth-modal-subtitle');
const authModeSignin = document.querySelector('#auth-mode-signin');
const authModeCreate = document.querySelector('#auth-mode-create');
const authUsernameInput = document.querySelector('#auth-username');
const authBadgeWrap = document.querySelector('#auth-badge-wrap');
const authBadgeInput = document.querySelector('#auth-badge');
const authPinInput = document.querySelector('#auth-pin');
const authCarryWrap = document.querySelector('#auth-carry-wrap');
const authCarryInput = document.querySelector('#auth-carry');
const authCarryLabel = document.querySelector('#auth-carry-label');
const authErrorEl = document.querySelector('#auth-error');
const authSubmitBtn = document.querySelector('#auth-submit');
const authCloseBtn = document.querySelector('#auth-close');
const authCancelBtn = document.querySelector('#auth-cancel');
const importBackupInput = document.querySelector('#import-backup-input');

// Layout Constants
const NAV_H = 64.0;
const TITLE_H = 54.0;
const STATUS_H = 44.0;
const PAD = 18.0;
const FONT_UI = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// Neutral dark charcoal (matching Stick the Charge) + high-contrast paper light mode, with Ontario green accents
const THEME = {
  light: {
    page: '#e8e8e2',
    body: '#090b0e',
    bezel_stroke: '#161a20',
    screen: '#f5f5f0',
    surface: '#ffffff',
    surface_hover: '#e9eae4',
    surface_press: '#dddfd7',
    line: '#bfc4bc',
    ink: '#000000',
    ink_dim: '#161b22',
    ink_faint: '#2b333c',
    accent: '#0f6b3e',
    green: '#0b5832',
    green_soft: 'rgba(11, 88, 50, 0.13)',
    link: '#094c2b',
    hl_bg: '#fde047',
    hl_ink: '#000000',
    shadow: 'rgba(0, 0, 0, 0.12)'
  },
  dark: {
    page: '#07070a',
    body: '#000000',
    bezel_stroke: '#1c1c22',
    screen: '#0f1116',
    surface: '#1e2229',
    surface_hover: '#2b313a',
    surface_press: '#38404a',
    line: '#323842',
    ink: '#f7f8fa',
    ink_dim: '#dde3eb',
    ink_faint: '#9aa5b4',
    accent: '#2ea85c',
    green: '#1ba14e',
    green_soft: 'rgba(27, 161, 78, 0.16)',
    link: '#34bc67',
    hl_bg: 'rgba(27, 161, 78, 0.25)',
    hl_ink: '#a7f3d0',
    shadow: 'rgba(0, 0, 0, 0.35)'
  }
};

// Official Ontario clipboard & map logos (preloaded for light & dark themes)
const logoDark = new Image();
logoDark.src = './logo-dark.png';
const logoLight = new Image();
logoLight.src = './logo-light.png';
logoDark.onload = () => requestRedraw();
logoLight.onload = () => requestRedraw();

// Storage Keys & Legislation Catalog
const THEME_KEY = 'stick-the-ticket-theme';
const SAVED_KEY = 'stick-the-ticket-saved';
const CHECKS_KEY = 'stick-the-ticket-checks';
const POA_RULES_KEY = 'stick-the-ticket-poa-rules';
const RECENT_SEARCHES_KEY = 'stick-the-ticket-recent-searches';
const STATUTES_KEY = 'stick-the-ticket-statutes';
const DEFAULT_SORT_KEY = 'stick-the-ticket-default-sort';
const PROFILES_KEY = 'stick-the-ticket-profiles';
const SESSION_KEY = 'stick-the-ticket-session';
const MAX_RECENT_SEARCHES = 6;

const LEGISLATION_CATALOG = (() => {
  const seen = new Set();
  const list = [];
  for (const st of STATUTES) {
    if (seen.has(st.code)) continue;
    seen.add(st.code);
    list.push({ ...st, available: true });
  }
  const upcoming = [
    { code: 'CAIA', name: 'Compulsory Automobile Insurance Act (R.S.O. 1990, c. C.25)', short: 'Insurance' },
    { code: 'LLCA', name: 'Liquor Licence and Control Act, 2019 (S.O. 2019, c. 15, Sched. 22)', short: 'Liquor' },
    { code: 'TTPA', name: 'Trespass to Property Act (R.S.O. 1990, c. T.21)', short: 'Trespass' },
    { code: 'CCA', name: 'Cannabis Control Act, 2017 (S.O. 2017, c. 26, Sched. 1)', short: 'Cannabis' },
    { code: 'SFOA', name: 'Smoke-Free Ontario Act, 2017 (S.O. 2017, c. 26, Sched. 3)', short: 'Smoke-Free' }
  ];
  for (const u of upcoming) {
    if (!seen.has(u.code)) {
      seen.add(u.code);
      list.push({ ...u, available: false });
    }
  }
  return list;
})();

const AVAILABLE_STATUTE_CODES = STATUTES.map(s => s.code);

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function loadSelectedStatutes() {
  const saved = readJsonStorage(STATUTES_KEY, null);
  if (Array.isArray(saved)) {
    const valid = saved.filter(code => AVAILABLE_STATUTE_CODES.includes(code));
    return new Set(valid);
  }
  return new Set(AVAILABLE_STATUTE_CODES);
}

function loadProfiles() {
  const raw = readJsonStorage(PROFILES_KEY, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function loadSessionUserId(profileMap) {
  const sess = readJsonStorage(SESSION_KEY, null);
  const id = typeof sess?.currentUserId === 'string' ? sess.currentUserId : null;
  return id && profileMap[id] ? id : null;
}

let isDark = localStorage.getItem(THEME_KEY) === 'dark';

function syncThemeDocument() {
  const mode = isDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', mode);
  if (themeMeta) themeMeta.setAttribute('content', colors().page);
  if (colorSchemeMeta) colorSchemeMeta.setAttribute('content', mode);
}

function colors() {
  return isDark ? THEME.dark : THEME.light;
}

syncThemeDocument();

// State
let tab = 'home'; // 'home' | 'charges' | 'saved' | 'settings'
let settingsSubView = null; // null | 'rules'
let query = '';
let savedQuery = '';
let filter = null;
let searchFacet = 'all'; // 'all' | 'part1' | 'part3' | 'points'
let sort = localStorage.getItem(DEFAULT_SORT_KEY) === 'name' ? 'name' : 'number'; // 'number' | 'name'
let searchSort = 'relevance'; // 'relevance' | 'number' | 'name'

function isSavedSearchContext() {
  return !appBarSearchOpen && openChargeIdx === null && tab === 'saved' && stuck.size > 0;
}

function getActiveSearchQuery() {
  return isSavedSearchContext() ? savedQuery : query;
}

function setActiveSearchQuery(nextVal) {
  if (isSavedSearchContext()) {
    savedQuery = nextVal;
    savedScrollY = 0;
  } else {
    query = nextVal;
    listScrollY = 0;
    searchScrollY = 0;
  }
}

function setSearchFacet(nextFacet) {
  const valid = ['all', 'part1', 'part3', 'points'].includes(nextFacet) ? nextFacet : 'all';
  if (searchFacet === valid) return;
  searchFacet = valid;
  listScrollY = 0;
  searchScrollY = 0;
  requestRedraw();
}
let openChargeIdx = null;
let stuck = new Set(Array.isArray(readJsonStorage(SAVED_KEY, [])) ? readJsonStorage(SAVED_KEY, []) : []);
let checkedItems = readJsonStorage(CHECKS_KEY, {}) || {};
let poaRuleChecks = readJsonStorage(POA_RULES_KEY, {}) || {};
let recentSearches = loadRecentSearches();
let selectedStatutes = loadSelectedStatutes();
let profiles = loadProfiles();
let currentProfileId = loadSessionUserId(profiles);

let appBarSearchOpen = false;
let searchOriginTab = 'home';
let pendingDetailReturnScroll = null;

let listScrollY = 0;
let savedScrollY = 0;
let rulesScrollY = 0;
let settingsScrollY = 0;
let searchScrollY = 0;
let detailScrollY = 0;

let maxListScrollY = 0;
let maxSavedScrollY = 0;
let maxRulesScrollY = 0;
let maxSettingsScrollY = 0;
let maxSearchScrollY = 0;
let maxDetailScrollY = 0;

let hoverPos = null;
let searchFocused = false;
let activeSearchBox = null;
let activeSuggestionPopoverRect = null;
let pendingPopoverInteraction = false;
let blurHideTimer = null;
let caretBlinkOn = true;
let caretBlinkTimer = null;
let searchTextScrollX = 0;
let lastSearchRender = null;
let ignoreNextPopState = false;
let lastStatuteRenderItalic = null;
let lastDetailMatchedElements = [];
let lastDetailHighlightCount = 0;
let confirmResetChecksUntil = 0;
let statusToast = null;
let toastTimer = null;
let authModalMode = 'signin';

function loadRecentSearches() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(item => typeof item === 'string' && item.trim().length > 0).slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function showStatusToast(message, durationMs = 2600) {
  statusToast = { message, expiresAt: Date.now() + durationMs };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastTimer = null;
    if (statusToast && Date.now() >= statusToast.expiresAt) {
      statusToast = null;
      requestRedraw();
    }
  }, durationMs + 30);
  requestRedraw();
}

function hashPin(pin) {
  const s = `stt::${String(pin || '')}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function normalizeProfileId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function activeProfile() {
  return currentProfileId && profiles[currentProfileId] ? profiles[currentProfileId] : null;
}

function getWorkSnapshot() {
  return {
    saved: Array.from(stuck),
    checks: JSON.parse(JSON.stringify(checkedItems || {})),
    poaRules: JSON.parse(JSON.stringify(poaRuleChecks || {})),
    recentSearches: [...recentSearches],
    selectedStatutes: Array.from(selectedStatutes),
    isDark: Boolean(isDark),
    sort: sort === 'name' ? 'name' : 'number'
  };
}

function countTotalCheckedElements() {
  let count = 0;
  for (const map of Object.values(checkedItems || {})) {
    if (!map || typeof map !== 'object') continue;
    for (const v of Object.values(map)) {
      if (v) count++;
    }
  }
  return count;
}

function hasAnySavedWork() {
  return (
    stuck.size > 0 ||
    countTotalCheckedElements() > 0 ||
    Object.values(poaRuleChecks || {}).some(Boolean) ||
    recentSearches.length > 0
  );
}

function persistProfilesMap() {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ currentUserId: currentProfileId }));
  } catch {}
}

function persistLiveKeys() {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(stuck)));
    localStorage.setItem(CHECKS_KEY, JSON.stringify(checkedItems));
    localStorage.setItem(POA_RULES_KEY, JSON.stringify(poaRuleChecks));
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recentSearches));
    localStorage.setItem(STATUTES_KEY, JSON.stringify(Array.from(selectedStatutes)));
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    localStorage.setItem(DEFAULT_SORT_KEY, sort);
  } catch {}
}

function persistActiveWorkspace() {
  persistLiveKeys();
  if (currentProfileId && profiles[currentProfileId]) {
    profiles[currentProfileId] = {
      ...profiles[currentProfileId],
      updatedAt: new Date().toISOString(),
      data: getWorkSnapshot()
    };
    persistProfilesMap();
  }
}

function applyWorkSnapshot(rawData = {}) {
  const d = rawData && typeof rawData === 'object' ? rawData : {};
  stuck = new Set(Array.isArray(d.saved) ? d.saved.filter(id => typeof id === 'string') : []);
  checkedItems = d.checks && typeof d.checks === 'object' && !Array.isArray(d.checks) ? JSON.parse(JSON.stringify(d.checks)) : {};
  poaRuleChecks = d.poaRules && typeof d.poaRules === 'object' && !Array.isArray(d.poaRules) ? JSON.parse(JSON.stringify(d.poaRules)) : {};
  recentSearches = Array.isArray(d.recentSearches)
    ? d.recentSearches.filter(item => typeof item === 'string' && item.trim().length > 0).slice(0, MAX_RECENT_SEARCHES)
    : [];
  if (Array.isArray(d.selectedStatutes)) {
    selectedStatutes = new Set(d.selectedStatutes.filter(code => AVAILABLE_STATUTE_CODES.includes(code)));
  } else {
    selectedStatutes = new Set(AVAILABLE_STATUTE_CODES);
  }
  isDark = Boolean(d.isDark);
  sort = d.sort === 'name' ? 'name' : 'number';
  confirmResetChecksUntil = 0;
  savedQuery = '';
  searchFacet = 'all';
  listScrollY = 0;
  searchScrollY = 0;
  rulesScrollY = 0;
  savedScrollY = 0;
  syncThemeDocument();
  if (typeof queryCountCache !== 'undefined') queryCountCache.clear();
  if (typeof rowMeasureCache !== 'undefined') rowMeasureCache.clear();
  persistLiveKeys();
}

function saveRecentSearches() {
  persistActiveWorkspace();
}

function addRecentSearch(raw) {
  const clean = (raw || '').trim();
  if (clean.length < 2) return;
  const lower = clean.toLowerCase();
  recentSearches = [clean, ...recentSearches.filter(q => q.toLowerCase() !== lower)].slice(0, MAX_RECENT_SEARCHES);
  saveRecentSearches();
}

function removeRecentSearch(target) {
  const lower = (target || '').toLowerCase();
  recentSearches = recentSearches.filter(q => q.toLowerCase() !== lower);
  saveRecentSearches();
  requestRedraw();
}

function clearRecentSearches() {
  recentSearches = [];
  saveRecentSearches();
  showStatusToast('Recent searches cleared');
  requestRedraw();
}

function saveStuck() {
  persistActiveWorkspace();
}

function saveChecks() {
  persistActiveWorkspace();
}

function savePoaRules() {
  persistActiveWorkspace();
}

function setThemeDark(nextDark) {
  if (isDark === Boolean(nextDark)) return;
  isDark = Boolean(nextDark);
  syncThemeDocument();
  persistActiveWorkspace();
  requestRedraw();
}

function setDefaultSort(nextSort) {
  const valid = nextSort === 'name' ? 'name' : 'number';
  if (sort === valid) return;
  sort = valid;
  listScrollY = 0;
  savedScrollY = 0;
  persistActiveWorkspace();
  showStatusToast(`Default sort: ${valid === 'name' ? 'By Name' : 'By Number'}`);
  requestRedraw();
}

function toggleStatuteSelection(code) {
  const entry = LEGISLATION_CATALOG.find(item => item.code === code);
  if (!entry) return;
  if (!entry.available) {
    showStatusToast(`${entry.code} coming soon — pending Drive legislation docs`);
    return;
  }
  if (selectedStatutes.has(code)) {
    selectedStatutes.delete(code);
  } else {
    selectedStatutes.add(code);
  }
  if (typeof queryCountCache !== 'undefined') queryCountCache.clear();
  if (typeof rowMeasureCache !== 'undefined') rowMeasureCache.clear();
  listScrollY = 0;
  searchScrollY = 0;
  if (filter && !CHARGES.some(ch => selectedStatutes.has(ch.statute) && ch.category === filter)) {
    filter = null;
  }
  persistActiveWorkspace();
  const actionLabel = selectedStatutes.has(code) ? 'enabled for search' : 'removed from search';
  showStatusToast(`${code} ${actionLabel}`);
  requestRedraw();
}

function enableStatuteCode(code = 'HTA') {
  if (!AVAILABLE_STATUTE_CODES.includes(code)) return;
  selectedStatutes.add(code);
  if (typeof queryCountCache !== 'undefined') queryCountCache.clear();
  listScrollY = 0;
  searchScrollY = 0;
  persistActiveWorkspace();
  showStatusToast(`${code} enabled (${STATUTE_COUNTS.get(code) || 0} offences)`);
  requestRedraw();
}

function resetAllElementChecks() {
  const now = Date.now();
  const total = countTotalCheckedElements();
  if (total === 0) return;
  if (confirmResetChecksUntil <= now) {
    confirmResetChecksUntil = now + 4000;
    requestRedraw();
    return;
  }
  confirmResetChecksUntil = 0;
  checkedItems = {};
  persistActiveWorkspace();
  showStatusToast('Element checkmarks reset');
  requestRedraw();
}

function exportWorkBackup() {
  const prof = activeProfile();
  const payload = {
    app: 'stick-the-ticket',
    version: 1,
    exportedAt: new Date().toISOString(),
    officer: prof ? { displayName: prof.displayName, badge: prof.badge || '' } : null,
    data: getWorkSnapshot()
  };
  const jsonText = JSON.stringify(payload, null, 2);
  window.lastExportedBackup = payload;
  try {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = prof ? normalizeProfileId(prof.displayName) || 'officer' : 'guest';
    a.download = `stick-the-ticket-${slug}-backup.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {}
  showStatusToast('Work backup exported (.json)');
}

function importWorkBackupPayload(payload) {
  if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
    throw new Error('Invalid Stick the Ticket backup file.');
  }
  applyWorkSnapshot(payload.data);
  if (currentProfileId && profiles[currentProfileId]) {
    persistActiveWorkspace();
  }
  showStatusToast('Backup imported cleanly');
  draw();
}

function openAuthModal(mode = 'signin', prefillName = '') {
  if (!authModal) return;
  authModalMode = mode === 'create' ? 'create' : 'signin';
  if (searchInput && document.activeElement === searchInput) searchInput.blur();
  if (authCarryInput) authCarryInput.checked = true;
  syncAuthModalMode();
  if (authUsernameInput) authUsernameInput.value = prefillName || '';
  if (authBadgeInput) authBadgeInput.value = '';
  if (authPinInput) authPinInput.value = '';
  if (authErrorEl) {
    authErrorEl.textContent = '';
    authErrorEl.hidden = true;
  }
  authModal.hidden = false;
  setTimeout(() => (prefillName && authPinInput ? authPinInput.focus() : authUsernameInput?.focus()), 20);
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.hidden = true;
  if (authErrorEl) {
    authErrorEl.textContent = '';
    authErrorEl.hidden = true;
  }
  draw();
}

function syncAuthModalMode() {
  const isCreate = authModalMode === 'create';
  if (authModeSignin) authModeSignin.classList.toggle('active', !isCreate);
  if (authModeCreate) authModeCreate.classList.toggle('active', isCreate);
  if (authTitle) authTitle.textContent = isCreate ? 'Create Officer Profile' : 'Officer Sign In';
  if (authSubtitle) {
    authSubtitle.textContent = isCreate
      ? 'Create a local profile to keep saved charges, checks, and statutes together.'
      : 'Sign in to load your saved charges, checklists, and selected legislation.';
  }
  if (authBadgeWrap) authBadgeWrap.hidden = !isCreate;
  if (authSubmitBtn) authSubmitBtn.textContent = isCreate ? 'Create & Sign In' : 'Sign In';
  if (authCarryWrap) {
    const showCarry = isCreate && !currentProfileId && hasAnySavedWork();
    authCarryWrap.hidden = !showCarry;
    if (showCarry && authCarryLabel) {
      authCarryLabel.textContent = `Keep guest work (${stuck.size} saved, ${countTotalCheckedElements()} checks)`;
    }
  }
}

function switchProfileDirect(profileId) {
  const target = profiles[profileId];
  if (!target) return;
  if (currentProfileId === profileId) return;
  if (target.pinHash) {
    openAuthModal('signin', target.displayName);
    return;
  }
  if (!currentProfileId) stashGuestWorkspace();
  else persistActiveWorkspace();
  currentProfileId = profileId;
  persistProfilesMap();
  applyWorkSnapshot(target.data);
  showStatusToast(`Signed in as ${target.displayName}`);
  draw();
}

function signOutProfile() {
  const prevName = activeProfile()?.displayName || 'Officer';
  persistActiveWorkspace();
  currentProfileId = null;
  persistProfilesMap();
  applyWorkSnapshot({
    saved: readJsonStorage(`${SAVED_KEY}-guest-stash`, []),
    checks: readJsonStorage(`${CHECKS_KEY}-guest-stash`, {}),
    poaRules: readJsonStorage(`${POA_RULES_KEY}-guest-stash`, {}),
    recentSearches: readJsonStorage(`${RECENT_SEARCHES_KEY}-guest-stash`, []),
    selectedStatutes: readJsonStorage(`${STATUTES_KEY}-guest-stash`, AVAILABLE_STATUTE_CODES),
    isDark: localStorage.getItem(`${THEME_KEY}-guest-stash`) === 'dark',
    sort: localStorage.getItem(`${DEFAULT_SORT_KEY}-guest-stash`) === 'name' ? 'name' : 'number'
  });
  showStatusToast(`Saved ${prevName} · Signed out`);
  draw();
}

function stashGuestWorkspace() {
  if (currentProfileId) return;
  try {
    localStorage.setItem(`${SAVED_KEY}-guest-stash`, JSON.stringify(Array.from(stuck)));
    localStorage.setItem(`${CHECKS_KEY}-guest-stash`, JSON.stringify(checkedItems));
    localStorage.setItem(`${POA_RULES_KEY}-guest-stash`, JSON.stringify(poaRuleChecks));
    localStorage.setItem(`${RECENT_SEARCHES_KEY}-guest-stash`, JSON.stringify(recentSearches));
    localStorage.setItem(`${STATUTES_KEY}-guest-stash`, JSON.stringify(Array.from(selectedStatutes)));
    localStorage.setItem(`${THEME_KEY}-guest-stash`, isDark ? 'dark' : 'light');
    localStorage.setItem(`${DEFAULT_SORT_KEY}-guest-stash`, sort);
  } catch {}
}

function clearGuestStashKeys() {
  try {
    for (const key of [
      `${SAVED_KEY}-guest-stash`,
      `${CHECKS_KEY}-guest-stash`,
      `${POA_RULES_KEY}-guest-stash`,
      `${RECENT_SEARCHES_KEY}-guest-stash`,
      `${STATUTES_KEY}-guest-stash`,
      `${THEME_KEY}-guest-stash`,
      `${DEFAULT_SORT_KEY}-guest-stash`
    ]) {
      localStorage.removeItem(key);
    }
  } catch {}
}

// Click Targets for Hit-Testing on Canvas
let clickables = [];
function addClickable(rect, action, id = '') {
  clickables.push({ rect, action, id });
}

function isRectHovered(rect) {
  if (!hoverPos) return false;
  return (
    hoverPos.x >= rect.x &&
    hoverPos.x <= rect.x + rect.w &&
    hoverPos.y >= rect.y &&
    hoverPos.y <= rect.y + rect.h
  );
}

// Clean geometric Ontario Trillium silhouette (monochrome/accent vector)
function drawTrillium(context, cx, cy, size, color) {
  context.save();
  context.translate(cx, cy);
  const scale = size / 50.0;
  context.scale(scale, scale);
  context.fillStyle = color;

  // 3 symmetrical ovate petals (0°, 120°, 240°)
  for (let i = 0; i < 3; i++) {
    context.save();
    context.rotate((i * 120 * Math.PI) / 180);
    context.beginPath();
    context.moveTo(0, -3.5);
    context.bezierCurveTo(6.2, -8.5, 11.2, -15.5, 0, -23.5);
    context.bezierCurveTo(-11.2, -15.5, -6.2, -8.5, 0, -3.5);
    context.closePath();
    context.fill();
    context.restore();
  }

  // 3 sleek pointed sepals between petals (60°, 180°, 300°)
  for (let i = 0; i < 3; i++) {
    context.save();
    context.rotate(((i * 120 + 60) * Math.PI) / 180);
    context.beginPath();
    context.moveTo(0, -5.5);
    context.bezierCurveTo(2.6, -10.5, 2.0, -14.5, 0, -18.8);
    context.bezierCurveTo(-2.0, -14.5, -2.6, -10.5, 0, -5.5);
    context.closePath();
    context.fill();
    context.restore();
  }

  // Crisp center pip
  context.beginPath();
  context.arc(0, 0, 1.8, 0, Math.PI * 2);
  context.fill();

  context.restore();
}

function drawLogo(context, cx, cy, targetWidth, fallbackColor = colors().green, alpha = 1.0) {
  const img = isDark ? logoLight : logoDark;
  const aspect = 1024 / 764;
  const w = targetWidth;
  const h = w / aspect;
  context.save();
  if (alpha !== 1.0) context.globalAlpha *= alpha;
  if (img.complete && img.naturalWidth > 0) {
    context.drawImage(img, cx - w / 2.0, cy - h / 2.0, w, h);
  } else {
    drawTrillium(context, cx, cy, targetWidth * 0.8, fallbackColor);
  }
  context.restore();
}

function categoryLabel(id) {
  const found = CATEGORIES.find(cat => cat.id === id);
  return found ? found.label : id.toUpperCase();
}

function formatSectionRef(charge) {
  return /^Reg\./i.test(charge.section) ? charge.section : `s. ${charge.section}`;
}

function formatItemRef(charge) {
  if (!charge.itemNumber) return '';
  return /^(?:Sched|Stat)/i.test(charge.itemNumber) ? charge.itemNumber : `Item ${charge.itemNumber}`;
}

function formatAuthorityBanner(charge) {
  const m = (charge.section || '').match(/^(Reg\.\s*\d+)/i);
  if (m) return `Official R.R.O. 1990, ${m[1]} ↗`;
  return `Official ${charge.statute} Statute Section ↗`;
}

function isGenericSubSection(sub) {
  if (!sub) return true;
  const low = sub.toLowerCase();
  return low.startsWith('item ') || low.startsWith('sched ') || low.startsWith('stat part');
}

const NUM_COLLATOR = new Intl.Collator(undefined, { numeric: true });

const STATUTE_CONTEXT = {
  HTA: 'Highway Traffic'
};

const STATUTE_MAP = new Map(STATUTES.map(s => [s.code, s]));
const CHARGE_BY_ID = new Map(CHARGES.map((c, idx) => [c.id, { ...c, originalIdx: idx }]));
const STATUTE_COUNTS = new Map();
const SECTION_COUNTS = new Map();
for (const c of CHARGES) {
  STATUTE_COUNTS.set(c.statute, (STATUTE_COUNTS.get(c.statute) || 0) + 1);
  SECTION_COUNTS.set(c.section, (SECTION_COUNTS.get(c.section) || 0) + 1);
}

function activeChargeCount() {
  let n = 0;
  for (const c of CHARGES) {
    if (selectedStatutes.has(c.statute)) n++;
  }
  return n;
}

function compareChargesByNumber(a, b) {
  return (
    NUM_COLLATOR.compare(a.section, b.section) ||
    NUM_COLLATOR.compare(a.itemNumber || '', b.itemNumber || '') ||
    NUM_COLLATOR.compare(a.name, b.name)
  );
}

const RELATED_CHARGES = {
  'HTA:128-15': ['HTA:128-25', 'HTA:128-40', 'HTA:item-340'],
  'HTA:128-25': ['HTA:128-15', 'HTA:128-40', 'HTA:172'],
  'HTA:128-40': ['HTA:172', 'HTA:128-25', 'HTA:130'],
  'HTA:172': ['HTA:128-40', 'HTA:130', 'HTA:53-1'],
  'HTA:182-2': ['HTA:136-1-a', 'HTA:144-18', 'HTA:128-15'],
  'HTA:144-18': ['HTA:136-1-a', 'HTA:182-2', 'HTA:130'],
  'HTA:136-1-a': ['HTA:182-2', 'HTA:144-18', 'HTA:130'],
  'HTA:78.1-1': ['HTA:130', 'HTA:106-2', 'HTA:item-223'],
  'HTA:106-2': ['HTA:78.1-1', 'HTA:33-1', 'HTA:7-5-a'],
  'HTA:130': ['HTA:142-1', 'HTA:172', 'HTA:78.1-1'],
  'HTA:142-1': ['HTA:130', 'HTA:78.1-1', 'HTA:144-18'],
  'HTA:32-1': ['HTA:33-1', 'HTA:53-1', 'HTA:7-1-a'],
  'HTA:33-1': ['HTA:32-1', 'HTA:7-5-a', 'HTA:53-1'],
  'HTA:7-1-a': ['HTA:7-5-a', 'HTA:13-2', 'HTA:32-1'],
  'HTA:13-2': ['HTA:7-1-a', 'HTA:7-5-a', 'HTA:33-1'],
  'HTA:7-5-a': ['HTA:7-1-a', 'HTA:33-1', 'HTA:32-1'],
  'HTA:53-1': ['HTA:32-1', 'HTA:172', 'HTA:33-1']
};

function getRelatedContent(charge) {
  const inApp = [];
  const external = [];
  const seen = new Set([charge.id]);
  const seenExt = new Set();
  const isAllowedStatute = code => selectedStatutes.size === 0 || selectedStatutes.has(code);

  if (Array.isArray(charge.relatedItems) && charge.relatedItems.length > 0) {
    for (const rel of charge.relatedItems) {
      if (rel.chargeId) {
        const target = CHARGE_BY_ID.get(rel.chargeId);
        if (target && isAllowedStatute(target.statute) && !seen.has(target.id) && inApp.length < 3) {
          seen.add(target.id);
          inApp.push(target);
        }
      } else if (rel.url) {
        const extKey = `${rel.section}|${rel.label}`;
        if (!seenExt.has(extKey)) {
          seenExt.add(extKey);
          external.push(rel);
        }
      }
    }
  }

  if (inApp.length === 0) {
    const mappedIds = Array.isArray(charge.related) && charge.related.length > 0
      ? charge.related
      : (RELATED_CHARGES[charge.id] || []);
    for (const id of mappedIds) {
      const target = CHARGE_BY_ID.get(id);
      if (target && isAllowedStatute(target.statute) && !seen.has(target.id) && inApp.length < 3) {
        seen.add(target.id);
        inApp.push(target);
      }
    }
  }

  const minInApp = 2;
  if (inApp.length < minInApp) {
    for (let i = 0; i < CHARGES.length && inApp.length < minInApp; i++) {
      const candidate = CHARGES[i];
      if (isAllowedStatute(candidate.statute) && !seen.has(candidate.id) && candidate.category === charge.category) {
        seen.add(candidate.id);
        inApp.push({ ...candidate, originalIdx: i });
      }
    }
    for (let i = 0; i < CHARGES.length && inApp.length < minInApp; i++) {
      const candidate = CHARGES[i];
      if (isAllowedStatute(candidate.statute) && !seen.has(candidate.id) && candidate.statute === charge.statute) {
        seen.add(candidate.id);
        inApp.push({ ...candidate, originalIdx: i });
      }
    }
  }

  return { inApp: inApp.slice(0, 3), external: external.slice(0, 2) };
}

const CHARGE_ALIASES = {
  'HTA:128-15': 'speeding slow radar lidar laser',
  'HTA:128-25': 'speeding radar points demerit',
  'HTA:128-40': 'excessive speed fast radar',
  'HTA:item-340': 'speeding csz radar lidar schedule b limit',
  'HTA:item-340.2': 'speeding community safety zone csz double fine',
  'HTA:item-340.4': 'speeding construction zone schedule e',
  'HTA:item-340.5': 'speeding construction zone worker present double fine',
  'HTA:172': 'racing drifting burnouts excessive speed 40 over 50 over impoundment license suspension',
  'HTA:182-2': 'turn left right one way do not enter sign',
  'HTA:144-18': 'intersection traffic signal amber light running red',
  'HTA:136-1-a': 'rolling stop intersection sign',
  'HTA:78.1-1': 'distracted driving phone cellphone smartphone texting screen messaging handheld',
  'HTA:item-221': 'distracted driving tv dvd video monitor screen dashboard visible',
  'HTA:item-223': 'distracted driving ipod tablet video game entertainment screen handheld',
  'HTA:item-276': 'seatbelt seat belt removed occupant restraint',
  'HTA:item-277': 'seatbelt seat belt inoperative occupant restraint',
  'HTA:item-278': 'seatbelt seat belt modified occupant restraint',
  'HTA:106-2': 'seat belt seatbelt buckle strap occupant restraint',
  'HTA:item-280': 'seatbelt seat belt passenger occupy position occupant restraint',
  'HTA:item-281': 'seatbelt seat belt passenger wear occupant restraint',
  'HTA:item-282': 'seatbelt seat belt passenger under 16 occupy occupant restraint',
  'HTA:item-283': 'seatbelt seat belt passenger under 16 wear occupant restraint',
  'HTA:item-284': 'seatbelt seat belt child car seat booster passenger secured occupant restraint',
  'HTA:130': 'collision crash accident unsafe driving',
  'HTA:130-3': 'careless driving bodily harm death collision fatal summons',
  'HTA:142-1': 'cutoff lane change signal weaving',
  'HTA:32-1': 'license unlicensed expired driver g1 g2',
  'HTA:item-85': 'wrong class g1 g2 m1 m2 improper licence',
  'HTA:33-1': 'license produce id failure surrender',
  'HTA:7-1-a': 'sticker validation expired tag registration plates renewal',
  'HTA:item-1': 'unregistered no permit registration plates',
  'HTA:item-6': 'expired sticker validation val tag plate renewal',
  'HTA:item-34.1': 'uvip used vehicle information package buyer inspection',
  'HTA:item-34.2': 'uvip used vehicle information package seller transfer',
  'HTA:item-52': 'wrong plate fictitious plates attached not authorized',
  'HTA:item-53': 'wrong plate permit fictitious plates attached not authorized',
  'HTA:item-67': 'plate cover tinted frame bracket obstruction',
  'HTA:item-68': 'mud snow dirt illegible dirty license plate',
  'HTA:13-2': 'plate cover tinted snow dirty bike rack obstructed obscured',
  'HTA:7-5-a': 'ownership registration permit papers produce',
  'HTA:53-1': 'license suspended prohibited unpaid fines impoundment',
  'HTA:53-1-1': 'suspended driving impaired criminal code suspension impoundment',
  'HTA:item-70': 'cvor commercial operator registration truck',
  'HTA:item-103.8': 'novice g1 g2 m1 m2 blood alcohol zero bac',
  'HTA:item-103.9': 'young driver under 22 blood alcohol zero bac',
  'HTA:item-103.10': 'novice g1 g2 m1 m2 drug thc zero tolerance',
  'HTA:item-103.11': 'young driver under 22 drug thc zero tolerance',
  'HTA:item-125': 'headlight one light burnt out lamp dark',
  'HTA:item-126': 'tail light rear red lamp brake light plate light',
  'HTA:item-144': 'licence plate light rear lamp',
  'HTA:item-163': 'brakes defective stopping mechanical',
  'HTA:item-171': 'windshield wiper rain snow view',
  'HTA:item-185': 'tires bald tread flat unsafe rubber',
  'HTA:item-195': 'tint dark window film windshield obscure view',
  'HTA:item-198': 'tint dark window film tinting coat view obstructed',
  'HTA:item-200': 'tint dark window tinting film colour coating obscuring interior',
  'HTA:item-204': 'muffler loud exhaust noise',
  'HTA:item-206': 'muffler loud exhaust noise cutout bypass',
  'HTA:item-211': 'loud exhaust unnecessary noise revving',
  'HTA:item-219': 'slow moving vehicle orange triangle smv',
  'HTA:item-219.1': 'slow moving vehicle orange triangle smv rear',
  'HTA:item-225': 'radar detector laser jammer speed measuring warning',
  'HTA:item-228': 'unfit unroadworthy unsafe mechanical defect',
  'HTA:item-317': 'overweight truck axle scale gross weight cmv',
  'HTA:item-354': 'pedestrian crossover stop yield walk',
  'HTA:item-463': 'tailgating following too closely distance',
  'HTA:item-465': 'move over emergency vehicle ambulance fire police siren',
  'HTA:item-468': 'move over slow down emergency vehicle tow truck',
  'HTA:item-468.1': 'move over lane change emergency vehicle tow truck',
  'HTA:item-507.5': 'school bus flashing red lights stop arm meeting',
  'HTA:item-507.7': 'school bus flashing red lights stop arm overtaking passing',
  'HTA:item-537': 'hours of service eld logbook daily log cmv',
  'HTA:item-540.4': '407 etr toll transponder highway',
  'HTA:item-545': 'hit and run fail to remain collision accident scene leave',
  'HTA:sched6-0.5': 'ev electric vehicle charging station parking',
  'HTA:sched7-1': 'parallel parking curb highway',
  'HTA:sched7-7': 'fire hydrant parking'
};

const POPULAR_QUERIES = [
  'Distracted driving',
  'Speeding',
  'Disobey sign',
  'No licence',
  'No permit',
  'Seatbelt'
];

const SPELLING_EQUIV_GROUPS = [
  ['licence', 'license', 'licences', 'licenses', 'licenced', 'licensed', 'licencing', 'licensing'],
  ['centre', 'center', 'centres', 'centers'],
  ['colour', 'color', 'colours', 'colors', 'coloured', 'colored'],
  ['kilometre', 'kilometer', 'kilometres', 'kilometers'],
  ['metre', 'meter', 'metres', 'meters'],
  ['tire', 'tyre', 'tires', 'tyres'],
  ['offence', 'offense', 'offences', 'offenses'],
  ['defence', 'defense', 'defences', 'defenses'],
  ['curb', 'kerb', 'curbs', 'kerbs'],
  ['litre', 'liter', 'litres', 'liters'],
  ['cancelled', 'canceled'],
  ['labelled', 'labeled'],
  ['travelling', 'traveling'],
  ['signalling', 'signaling'],
  ['aluminium', 'aluminum']
];

const SPELLING_EQUIV_MAP = new Map();
for (const grp of SPELLING_EQUIV_GROUPS) {
  for (const word of grp) {
    const alts = grp.filter(w => w !== word);
    SPELLING_EQUIV_MAP.set(word, alts);
  }
}

const SEARCH_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'on', 'in', 'at', 'to', 'for', 'with',
  'and', 'or', 'by', 'from', 'is', 'was', 'were', 'are', 'be',
  'that', 'this', 'their', 'they', 'who', 'if', 'as', 'into'
]);

const CONCEPT_PHRASES = [
  {
    match: /\b(?:cell\s*phone|cellphone|mobile\s*phone|smartphone|texting)\b/i,
    label: 'hand-held communication',
    anyOf: ['handheld', 'hand held', 'wireless communication', 'display screen', 'entertainment device'],
    highlight: ['hand-held', 'handheld', 'wireless', 'communication', 'screen', 'device', 'text']
  },
  {
    match: /\b(?:brake\s*lights?|brakelights?|stop\s*lights?)\b/i,
    label: 'stop lamp / brake lamp',
    anyOf: ['brake light', 'no brake lights', 'stop lamp', 'stop signalling'],
    highlight: ['stop', 'lamp', 'brake', 'rear', 'red', 'light']
  },
  {
    match: /\b(?:tail\s*lights?|taillights?)\b/i,
    label: 'rear lamp',
    anyOf: ['rear lamp', 'tail lamp', 'red light', 'rear red'],
    highlight: ['rear', 'tail', 'red', 'lamp', 'light']
  },
  {
    match: /\bheadlights?\b/i,
    label: 'headlamp',
    anyOf: ['headlamp', 'head lamp', 'front lamp', 'white light', 'lamps'],
    highlight: ['headlamp', 'headlight', 'lamp', 'white', 'light']
  },
  {
    match: /\b(?:turn\s*signals?|blinkers?|indicators?)\b/i,
    label: 'directional signal',
    anyOf: ['directional signal', 'signal', 'signalling'],
    highlight: ['directional', 'signal', 'signalling']
  },
  {
    match: /\b(?:high\s*beams?|highbeams?)\b/i,
    label: 'high beam / glare',
    anyOf: ['high beam', 'upper beam', 'glaring', 'dim'],
    highlight: ['beam', 'high', 'upper', 'glaring', 'dim']
  },
  {
    match: /\b(?:car\s*seats?|child\s*seats?|booster\s*seats?)\b/i,
    label: 'child restraint / booster',
    anyOf: ['child', 'booster', 'restraint', 'seat belt'],
    highlight: ['child', 'booster', 'restraint', 'seat', 'belt']
  },
  {
    match: /\b(?:hit\s*(?:&|and)\s*run|fled\s*scene|left\s*scene)\b/i,
    label: 'fail to remain at scene',
    anyOf: ['did not remain', 'fail to remain', 'remain at scene', 'report accident'],
    highlight: ['remain', 'scene', 'collision', 'accident', 'report']
  },
  {
    match: /\b(?:val\s*tags?|valtags?|expired\s*tags?|expired\s*stickers?|renewal\s*stickers?)\b/i,
    label: 'unvalidated permit / sticker',
    anyOf: ['validation', 'validated', 'permit', 'unvalidated', 'expired'],
    highlight: ['validation', 'validated', 'permit', 'sticker', 'expired']
  },
  {
    match: /\b(?:front\s*plates?|rear\s*plates?|plate\s*covers?|dirty\s*plates?|licen[cs]e\s*plates?)\b/i,
    label: 'number plate visibility',
    anyOf: ['two plates', 'number plate', 'entire plate', 'obstructed', 'plainly visible', 'dirty plate'],
    highlight: ['plate', 'plates', 'two', 'entire', 'obstructed', 'visible', 'dirty']
  },
  {
    match: /\b(?:rolling\s*stop|california\s*stop)\b/i,
    label: 'stop sign — fail to stop',
    anyOf: ['stop sign', 'fail to stop'],
    highlight: ['stop', 'sign', 'fail']
  },
  {
    match: /\b(?:ran|running)\s+(?:a\s+)?red\s*light\b/i,
    label: 'red light — fail to stop',
    anyOf: ['fail to stop red light', 'red light fail to stop', 'proceed before green'],
    highlight: ['red', 'light', 'stop']
  },
  {
    match: /\b(?:window\s*tint|tinted\s*windows?|dark\s*windows?|window\s*film)\b/i,
    label: 'window colour coating / view',
    anyOf: ['colour coating', 'transparent', 'coating obscuring', 'obstructed'],
    highlight: ['colour', 'coating', 'transparent', 'obscuring', 'obstructed', 'tint']
  },
  {
    match: /\b(?:e\s*-?\s*bikes?|electric\s*bikes?)\b/i,
    label: 'power-assisted bicycle',
    anyOf: ['power assisted bicycle', 'bicycle'],
    highlight: ['power-assisted', 'assisted', 'bicycle', 'e-bike']
  },
  {
    match: /\b(?:e\s*-?\s*scooters?|electric\s*scooters?)\b/i,
    label: 'kick scooter',
    anyOf: ['kick scooter', 'scooter'],
    highlight: ['scooter', 'kick']
  },
  {
    match: /\b(?:40\s*over|50\s*over|street\s*racing|drifting|burnouts?|wheelies?|doughnuts?)\b/i,
    label: 'stunt driving / racing',
    anyOf: ['stunt driving', 'stunt', 'race', 'racing'],
    highlight: ['stunt', 'race', 'racing', '172']
  },
  {
    match: /\b(?:bald\s*tires?|flat\s*tires?)\b/i,
    label: 'unsafe / defective tire',
    anyOf: ['tread', 'defective tire', 'unsafe tire', 'tire'],
    highlight: ['tire', 'tread', 'defective', 'unsafe']
  },
  {
    match: /\b(?:loud\s*exhaust|loud\s*muffler)\b/i,
    label: 'muffler / unnecessary noise',
    anyOf: ['muffler', 'unnecessary noise', 'exhaust'],
    highlight: ['muffler', 'exhaust', 'noise']
  },
  {
    match: /\b(?:semitrucks?|semi\s*trucks?|18\s*wheelers?|transport\s*trucks?|tractor\s*trailers?)\b/i,
    label: 'commercial motor vehicle',
    anyOf: ['commercial motor vehicle', 'tractor', 'trailer'],
    highlight: ['commercial', 'motor', 'vehicle', 'tractor', 'trailer']
  },
  {
    match: /\b(?:u\s*-?\s*turns?|uturns?)\b/i,
    label: 'U-turn',
    anyOf: ['u turn', 'turn around'],
    highlight: ['u-turn', 'u', 'turn']
  },
  {
    match: /\b(?:tailgate|tailgating)\b/i,
    label: 'follow too closely',
    anyOf: ['follow too closely', 'following too closely'],
    highlight: ['follow', 'closely', 'tailgating']
  },
  {
    match: /\b(?:drunk\s*driv(?:er|ing)|bac|zero\s*alcohol|dui|dwi)\b/i,
    label: 'blood alcohol / zero BAC',
    anyOf: ['blood alcohol', 'zero tolerance', 'alcohol'],
    highlight: ['alcohol', 'blood', 'zero', 'bac']
  },
  {
    match: /\b(?:cannabis|weed|thc)\b/i,
    label: 'drug / cannabis presence',
    anyOf: ['drug', 'cannabis', 'presence'],
    highlight: ['drug', 'cannabis', 'thc']
  }
];

const CONCEPT_TOKEN_ALTS = {
  missing: ['no', 'fail', 'without', 'unattached', 'absent', 'not'],
  broken: ['defective', 'inoperative', 'improper', 'unsafe', 'obstructed', 'illuminate'],
  busted: ['defective', 'inoperative', 'improper', 'unsafe'],
  cracked: ['defective', 'obscure', 'obstruct', 'unsafe', 'windshield'],
  damaged: ['defective', 'unsafe', 'inoperative', 'improper'],
  dead: ['inoperative', 'defective', 'illuminate', 'no'],
  burnt: ['inoperative', 'defective', 'illuminate'],
  burned: ['inoperative', 'defective', 'illuminate'],
  light: ['light', 'lamp', 'lamps'],
  lights: ['light', 'lamp', 'lamps'],
  headlight: ['headlight', 'headlamp', 'lamp'],
  headlights: ['headlight', 'headlamp', 'lamps'],
  taillight: ['taillight', 'rear', 'lamp'],
  taillights: ['taillight', 'rear', 'lamps'],
  phone: ['phone', 'device', 'wireless', 'communication'],
  cellphone: ['phone', 'device', 'wireless', 'communication'],
  smartphone: ['phone', 'device', 'wireless', 'communication'],
  car: ['car', 'vehicle', 'motor'],
  truck: ['truck', 'commercial', 'tractor', 'trailer'],
  semi: ['commercial', 'tractor', 'trailer'],
  semitruck: ['commercial', 'tractor', 'trailer'],
  rig: ['commercial', 'tractor', 'trailer'],
  bike: ['bike', 'bicycle', 'motorcycle'],
  ebike: ['ebike', 'assisted', 'bicycle'],
  sticker: ['sticker', 'validation', 'permit'],
  stickers: ['sticker', 'validation', 'permit'],
  tag: ['tag', 'validation', 'permit'],
  tags: ['tag', 'validation', 'permit'],
  seatbelt: ['seatbelt', 'seat', 'restraint'],
  seatbelts: ['seatbelt', 'seat', 'restraint'],
  crosswalk: ['crosswalk', 'crossover', 'pedestrian'],
  prohibited: ['prohibited', 'suspended'],
  suspended: ['suspended', 'suspension', 'prohibited'],
  uturn: ['uturn', 'turn'],
  tailgate: ['tailgating', 'closely'],
  tailgating: ['tailgating', 'closely']
};

function normalizeSearchToken(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeFolded(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[-–—/]+/g, ' ')
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9.\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHyphenJoined(str) {
  return (str || '')
    .toLowerCase()
    .replace(/([a-z0-9])[-–—/]([a-z0-9])/g, '$1$2')
    .replace(/[-–—/]+/g, ' ')
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9.\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandTokenVariants(rawTok) {
  const tok = (rawTok || '').toLowerCase().trim();
  if (!tok) return [];
  const out = [];
  const seen = new Set();
  const push = v => {
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };

  push(tok);
  const folded = normalizeFolded(tok);
  push(folded);
  const joined = normalizeHyphenJoined(tok);
  push(joined);
  const compact = normalizeSearchToken(tok);
  push(compact);

  // Plural & inflectional de-suffixing so searching "running", "tinted", "brakes" finds root statutory forms
  const collectStems = word => {
    if (!word) return;
    if (word.length >= 5) {
      if (word.endsWith('ies') && word.length >= 6) {
        push(`${word.slice(0, -3)}y`);
      } else if (/(?:ches|shes|xes|zes)$/.test(word) && word.length >= 6) {
        push(word.slice(0, -2));
      } else if (word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) {
        push(word.slice(0, -1));
      }
    } else if (word.length === 4 && word.endsWith('s') && !/(?:ss|us|is|as|ns)$/.test(word)) {
      push(word.slice(0, -1));
    }

    if (word.length >= 6 && word.endsWith('ing')) {
      const stem = word.slice(0, -3);
      push(stem);
      if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
        push(stem.slice(0, -1));
      }
      if (!/[aeiou]$/.test(stem) && stem.length >= 3) {
        push(`${stem}e`);
      }
    }
    if (word.length >= 5 && word.endsWith('ed')) {
      const stem2 = word.slice(0, -2);
      const stem1 = word.slice(0, -1);
      push(stem2);
      push(stem1);
      if (stem2.length >= 3 && stem2[stem2.length - 1] === stem2[stem2.length - 2]) {
        push(stem2.slice(0, -1));
      }
    }
  };

  collectStems(compact);

  // Bidirectional Canadian <-> US/UK spelling equivalents on initial forms and derived stems
  const snapshot = out.slice();
  for (const w of snapshot) {
    const eq = SPELLING_EQUIV_MAP.get(w);
    if (eq) {
      for (const alt of eq) push(alt);
    }
  }
  return out;
}

function tokenMatchesField(tok, low, folded, joined) {
  const tokClean = normalizeSearchToken(tok);
  const variants = expandTokenVariants(tok);
  const spacedFolded = folded ? ` ${folded}` : '';
  const paddedFolded = folded ? ` ${folded} ` : '';
  const spacedJoined = joined ? ` ${joined}` : '';
  const paddedJoined = joined ? ` ${joined} ` : '';

  for (const v of variants) {
    if (!v) continue;
    const vf = normalizeFolded(v);
    const vj = normalizeHyphenJoined(v);
    const vc = normalizeSearchToken(v);
    const isStemShort = vc.length <= 3 && vc !== tokClean;
    const isShortExact = vf.length <= 2 || /^\d+$/.test(vf) || isStemShort;

    if (vf) {
      if (isShortExact) {
        if (paddedFolded && paddedFolded.includes(` ${vf} `)) return true;
      } else if (spacedFolded && spacedFolded.includes(` ${vf}`)) {
        return true;
      }
    }
    if (vj && vj !== vf) {
      if (isShortExact) {
        if (paddedJoined && paddedJoined.includes(` ${vj} `)) return true;
      } else if (spacedJoined && spacedJoined.includes(` ${vj}`)) {
        return true;
      }
    }
    if (vc.length >= 5 && vj && spacedJoined && spacedJoined.includes(` ${vc}`)) return true;
    if (/[().]/.test(v) && v.length >= 3 && low && low.includes(v)) return true;
  }
  return false;
}

const parsedQueryCache = new Map();
function parseSearchQuery(rawQuery) {
  const trimmed = (rawQuery || '').trim();
  const low = trimmed.toLowerCase();
  if (!low) {
    return {
      raw: '',
      q: '',
      qNorm: '',
      qFolded: '',
      qJoined: '',
      isExplicitItemQuery: false,
      rawTokens: [],
      contentTokens: [],
      isMultiWord: false,
      phraseConcepts: [],
      tokenAltSets: [],
      hasConceptAlt: false,
      highlightTerms: []
    };
  }
  if (parsedQueryCache.has(low)) return parsedQueryCache.get(low);

  // Strip statutory reference prefixes such as "s. 172", "sec 78.1", "section 128", "hta 172"
  let q = low.replace(/^(?:(?:s|sec|section)\.?\s+|hta\s+)(?=\d)/i, '').trim();
  if (!q) q = low;

  const isExplicitItemQuery = /^(?:item|sched(?:\s+\d+)?(?:\s+item)?)\s+[\da-z.]+$/.test(q);
  const qNorm = normalizeSearchToken(q);
  const qFolded = normalizeFolded(q);
  const qJoined = normalizeHyphenJoined(q);
  const rawTokens = qFolded ? qFolded.split(/\s+/).filter(Boolean) : [];
  const filteredTokens = rawTokens.filter(t => !SEARCH_STOPWORDS.has(t));
  const contentTokens = filteredTokens.length > 0 ? filteredTokens : rawTokens;
  const isMultiWord = contentTokens.length > 1;

  const phraseConcepts = [];
  const highlightSet = new Set(contentTokens);
  for (const tok of contentTokens) {
    for (const v of expandTokenVariants(tok)) {
      if (v.length >= 2) highlightSet.add(v);
    }
  }

  for (const cp of CONCEPT_PHRASES) {
    if (cp.match.test(q) || cp.match.test(qFolded)) {
      phraseConcepts.push(cp);
      for (const h of cp.highlight || []) highlightSet.add(h);
    }
  }

  let hasConceptAlt = phraseConcepts.length > 0;
  const tokenAltSets = contentTokens.map(tok => {
    const clean = normalizeSearchToken(tok);
    const alts = CONCEPT_TOKEN_ALTS[clean];
    if (alts && alts.length > 0) {
      hasConceptAlt = true;
      for (const a of alts) highlightSet.add(a);
      return Array.from(new Set([tok, ...alts]));
    }
    return [tok];
  });

  const parsed = {
    raw: trimmed,
    q,
    qNorm,
    qFolded,
    qJoined,
    isExplicitItemQuery,
    rawTokens,
    contentTokens,
    isMultiWord,
    phraseConcepts,
    tokenAltSets,
    hasConceptAlt,
    highlightTerms: Array.from(highlightSet)
  };
  if (parsedQueryCache.size > 300) parsedQueryCache.clear();
  parsedQueryCache.set(low, parsed);
  return parsed;
}

function getHighlightTermsForQuery(rawQuery) {
  const p = parseSearchQuery(rawQuery);
  return p.highlightTerms;
}

function findFirstMatchIndex(text, rawQuery, tokens = []) {
  if (!text) return -1;
  const lower = text.toLowerCase();
  const parsed = parseSearchQuery(rawQuery);
  const q = parsed.q;
  if (q) {
    const exact = lower.indexOf(q);
    if (exact !== -1) return exact;
  }
  const searchToks = tokens.length > 0 ? tokens : (parsed.highlightTerms.length > 0 ? parsed.highlightTerms : parsed.contentTokens);
  let earliest = -1;
  const considerIdx = idx => {
    if (idx !== -1 && (earliest === -1 || idx < earliest)) earliest = idx;
  };
  for (const tok of searchToks) {
    const tokClean = normalizeSearchToken(tok);
    for (const v of expandTokenVariants(tok)) {
      if (!v) continue;
      const requireBoundary = v.length <= 2 || /^\d+$/.test(v) || (v.length <= 3 && v !== tokClean);
      if (requireBoundary) {
        let from = 0;
        while (from < lower.length) {
          const hit = lower.indexOf(v, from);
          if (hit === -1) break;
          const prev = hit === 0 ? ' ' : lower[hit - 1];
          const next = hit + v.length >= lower.length ? ' ' : lower[hit + v.length];
          if (!/[a-z0-9]/.test(prev) && !/[a-z0-9]/.test(next)) {
            considerIdx(hit);
            break;
          }
          from = hit + 1;
        }
      } else {
        let from = 0;
        while (from < lower.length) {
          const hit = lower.indexOf(v, from);
          if (hit === -1) break;
          const prev = hit === 0 ? ' ' : lower[hit - 1];
          if (!/[a-z0-9]/.test(prev)) {
            considerIdx(hit);
            break;
          }
          from = hit + 1;
        }
      }
    }
  }
  if (earliest !== -1) return earliest;
  const tokCompacts = searchToks.map(normalizeSearchToken).filter(v => v.length >= 4);
  if (tokCompacts.length > 0) {
    for (const m of text.matchAll(/[a-z0-9]+(?:[-–—/'][a-z0-9]+)+/gi)) {
      const wc = normalizeSearchToken(m[0]);
      if (tokCompacts.some(tc => wc === tc || wc.startsWith(tc))) {
        return m.index ?? -1;
      }
    }
  }
  return -1;
}

function makeSnippetAround(text, q, maxLen = 78, tokens = []) {
  if (!text) return '';
  const idx = findFirstMatchIndex(text, q, tokens);
  if (idx === -1) {
    if (text.length <= maxLen) return text;
    const cut = text.lastIndexOf(' ', maxLen - 1);
    return `${text.slice(0, cut > 28 ? cut : maxLen - 1).trim()}…`;
  }
  let start = Math.max(0, idx - 22);
  if (start > 0) {
    const nextSpace = text.indexOf(' ', start);
    if (nextSpace !== -1 && nextSpace < idx) start = nextSpace + 1;
  }
  let end = Math.min(text.length, start + maxLen);
  if (end < text.length) {
    const lastSpace = text.lastIndexOf(' ', end);
    if (lastSpace > idx + 3 && lastSpace > start + 24) end = lastSpace;
  }
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function buildSearchIndex() {
  // Detect repeated glossary parentheticals (>= 10 occurrences) so boilerplate highway/vehicle definitions do not drown specific offences
  const parenCounts = new Map();
  for (const ch of CHARGES) {
    for (const el of ch.elements) {
      for (const raw of [el.text, ...(el.options || [])]) {
        for (const m of String(raw).matchAll(/\([^)]{12,}\)/g)) {
          parenCounts.set(m[0], (parenCounts.get(m[0]) || 0) + 1);
        }
      }
    }
  }
  const glossParens = Array.from(parenCounts.entries())
    .filter(([, cnt]) => cnt >= 10)
    .map(([txt]) => txt);

  const stripGlossParens = str => {
    let out = String(str || '');
    for (const gp of glossParens) {
      if (out.includes(gp)) out = out.split(gp).join(' ');
    }
    return out.replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  };

  const indexMap = new Map();
  const elPhraseMap = new Map();
  const vocabFreq = new Map();

  const recordVocabWords = (rawText, weight = 1) => {
    if (!rawText) return;
    for (const m of String(rawText).toLowerCase().matchAll(/[a-z]{4,}/g)) {
      const w = m[0];
      if (!SEARCH_STOPWORDS.has(w)) {
        vocabFreq.set(w, (vocabFreq.get(w) || 0) + weight);
      }
    }
  };

  for (const ch of CHARGES) {
    const secLow = ch.section.toLowerCase();
    const secBaseLow = secLow.replace(/\(.*/, '').trim();
    const secNorm = normalizeSearchToken(ch.section);
    const itemLabel = formatItemRef(ch);
    const itemLow = itemLabel.toLowerCase();
    const itemNumLow = (ch.itemNumber || '').toLowerCase();
    const nameLow = ch.name.toLowerCase();
    const nameFolded = normalizeFolded(ch.name);
    const nameJoined = normalizeHyphenJoined(ch.name);
    const subLow = (ch.subSection || '').toLowerCase();
    const subFolded = normalizeFolded(ch.subSection || '');
    const subJoined = normalizeHyphenJoined(ch.subSection || '');
    const wordingLow = ch.shortWording.toLowerCase();
    const wordingFolded = normalizeFolded(ch.shortWording);
    const wordingJoined = normalizeHyphenJoined(ch.shortWording);
    const statCodeLow = ch.statute.toLowerCase();
    const statObj = STATUTE_MAP.get(ch.statute);
    const statNameLow = (statObj?.name || '').toLowerCase();
    const statShortLow = (STATUTE_CONTEXT[ch.statute] || statObj?.short || '').toLowerCase();
    const catLow = categoryLabel(ch.category).toLowerCase();
    const catJoined = normalizeHyphenJoined(catLow);
    const aliasLow = (CHARGE_ALIASES[ch.id] || '').toLowerCase();
    const aliasFolded = normalizeFolded(aliasLow);
    const aliasJoined = normalizeHyphenJoined(aliasLow);
    const summaryLow = (ch.summary || '').toLowerCase();
    const summaryFolded = normalizeFolded(ch.summary || '');
    const summaryJoined = normalizeHyphenJoined(ch.summary || '');
    const notesLow = (ch.procedureNotes || '').toLowerCase();
    const notesFolded = normalizeFolded(ch.procedureNotes || '');
    const notesJoined = normalizeHyphenJoined(ch.procedureNotes || '');
    const statTextLow = (ch.statutoryText || '').toLowerCase();
    const statTextFolded = normalizeFolded(ch.statutoryText || '');
    const statTextJoined = normalizeHyphenJoined(ch.statutoryText || '');

    // Index Part I / Part III / summons / demerit metadata concisely without generic-word false positives
    const hasPart3 = /part\s*iii|summons/i.test(ch.part || '');
    const hasPart1 = /part\s*i(?![iv])/i.test(ch.part || '');
    const partTags = `${hasPart1 ? 'part i part 1' : ''} ${hasPart3 ? 'part iii part 3 summons' : ''}`.trim();
    const pointsTags = typeof ch.points === 'number' && ch.points > 0
      ? `demerit demerits points ${ch.points} pts ${ch.points} points`
      : '';
    const metaTagsLow = `${partTags} ${pointsTags}`.trim();
    const metaTagsFolded = normalizeFolded(metaTagsLow);

    const elementEntries = [];
    ch.elements.forEach((el, eIdx) => {
      const elNum = `${eIdx + 1}`;
      const coreRaw = stripGlossParens(el.text);
      const isGenericHighway = /^they drove on a highway|^the person drove a (?:motor|commercial motor) vehicle|^it happened in a community safety zone/i.test(coreRaw);
      elementEntries.push({
        elementIdx: eIdx,
        label: elNum,
        displayText: el.text,
        raw: el.text,
        low: el.text.toLowerCase(),
        folded: normalizeFolded(el.text),
        joined: normalizeHyphenJoined(el.text),
        coreLow: coreRaw.toLowerCase(),
        coreFolded: normalizeFolded(coreRaw),
        coreJoined: normalizeHyphenJoined(coreRaw),
        isGeneric: isGenericHighway,
        isOption: false
      });
      recordVocabWords(coreRaw, 2);

      (el.options || []).forEach((opt, oIdx) => {
        const letter = String.fromCharCode(97 + oIdx);
        const optClean = String(opt).replace(/^[a-z]\.\s+/i, '').trim();
        const optCore = stripGlossParens(optClean);
        const parentStem = stripGlossParens(el.text).replace(/[:\s]+$/, '').replace(/\s+ONE of these$/i, '').trim();
        const displayText = optClean.length < 44 && parentStem
          ? `${optClean} — ${parentStem}`
          : optClean;
        const searchableRaw = `${optClean} ${parentStem}`;
        elementEntries.push({
          elementIdx: eIdx,
          label: `${elNum}${letter}`,
          optClean,
          displayText,
          raw: searchableRaw,
          low: opt.toLowerCase(),
          folded: normalizeFolded(searchableRaw),
          joined: normalizeHyphenJoined(searchableRaw),
          coreLow: optCore.toLowerCase(),
          coreFolded: normalizeFolded(optCore),
          coreJoined: normalizeHyphenJoined(optCore),
          isGeneric: false,
          isOption: true
        });
        recordVocabWords(optCore, 2);
      });
    });

    recordVocabWords(ch.name, 4);
    recordVocabWords(ch.subSection, 3);
    recordVocabWords(ch.shortWording, 3);
    recordVocabWords(aliasLow, 3);
    recordVocabWords(catLow, 2);
    recordVocabWords(ch.summary, 1);

    const primaryLow = `${secLow} ${itemLow} ${nameLow} ${subLow} ${wordingLow} ${statCodeLow} ${statNameLow} ${statShortLow} ${catLow}`;
    const primaryFolded = `${normalizeFolded(primaryLow)} ${secNorm}`;
    const primaryJoined = `${normalizeHyphenJoined(primaryLow)} ${secNorm}`;
    const allElCoreFolded = elementEntries.map(e => e.coreFolded).join(' ');
    const allElCoreJoined = elementEntries.map(e => e.coreJoined).join(' ');
    const allElFolded = elementEntries.map(e => e.folded).join(' ');
    const allElJoined = elementEntries.map(e => e.joined).join(' ');
    const fullLow = `${primaryLow} ${aliasLow} ${summaryLow} ${notesLow} ${metaTagsLow} ${elementEntries.map(e => e.low).join(' ')} ${statTextLow}`;
    const fullFolded = `${primaryFolded} ${aliasFolded} ${summaryFolded} ${notesFolded} ${metaTagsFolded} ${allElFolded} ${statTextFolded}`;
    const fullJoined = `${primaryJoined} ${aliasJoined} ${summaryJoined} ${notesJoined} ${metaTagsFolded} ${allElJoined} ${statTextJoined}`;

    indexMap.set(ch.id, {
      secLow,
      secBaseLow,
      secNorm,
      itemLabel,
      itemLow,
      itemNumLow,
      nameLow,
      nameFolded,
      nameJoined,
      subLow,
      subFolded,
      subJoined,
      wordingLow,
      wordingFolded,
      wordingJoined,
      statCodeLow,
      statNameLow,
      statShortLow,
      catLow,
      catJoined,
      aliasLow,
      aliasFolded,
      aliasJoined,
      summaryLow,
      summaryFolded,
      summaryJoined,
      notesLow,
      notesFolded,
      notesJoined,
      statTextLow,
      statTextFolded,
      statTextJoined,
      metaTagsLow,
      metaTagsFolded,
      hasPart1,
      hasPart3,
      elementEntries,
      primaryFolded,
      primaryJoined,
      allElCoreFolded,
      allElCoreJoined,
      allElFolded,
      allElJoined,
      fullLow,
      fullFolded,
      fullJoined
    });

    // Extract clean distinctive core element clauses for predictive element-to-charge search suggestions
    for (const entry of elementEntries) {
      const stripped = stripGlossParens(entry.isOption ? entry.optClean : entry.raw)
        .replace(/^(?:the\s+(?:person|driver|defendant|owner|vehicle|operator|cyclist|pedestrian|motor\s+vehicle)\s+(?:was\s+|is\s+|did\s+)?|while\s+driving,\s+they\s+|they\s+|defendant\s+|it\s+(?:was|is)\s+)/i, '')
        .replace(/[.:;]+$/, '')
        .trim();
      if (stripped.length < 8 || stripped.length > 52) continue;
      if (/\b(?:one of these|the following|same)\s*$/i.test(stripped)) continue;
      const key = stripped.toLowerCase();
      if (/^(?:drove|operated|parked)\s+(?:a\s+)?(?:motor\s+)?vehicle(?:\s+on\s+a\s+highway)?$/i.test(key)) continue;
      if (/^happened in a community safety zone$/i.test(key)) continue;
      const existing = elPhraseMap.get(key);
      if (existing) {
        existing.occurrences++;
      } else {
        const displayLabel = stripped.length > 34
          ? `${stripped.slice(0, 32).replace(/\s+\S*$/, '')}…`
          : stripped;
        elPhraseMap.set(key, {
          query: stripped,
          label: displayLabel,
          folded: normalizeFolded(stripped),
          joined: normalizeHyphenJoined(stripped),
          occurrences: 1
        });
      }
    }
  }

  for (const cp of CONCEPT_PHRASES) {
    for (const h of cp.highlight || []) recordVocabWords(h, 4);
  }
  for (const w of Object.values(CHARGE_ALIASES)) recordVocabWords(w, 2);

  const elementPhrases = Array.from(elPhraseMap.values())
    .filter(p => p.occurrences >= 1 && p.occurrences <= 30)
    .sort((a, b) => a.occurrences - b.occurrences || a.query.length - b.query.length);

  const vocabEntries = Array.from(vocabFreq.entries())
    .map(([word, freq]) => ({ word, freq }))
    .sort((a, b) => b.freq - a.freq);

  return { indexMap, elementPhrases, vocabEntries, vocabSet: new Set(vocabFreq.keys()) };
}

const {
  indexMap: CHARGE_SEARCH_INDEX,
  elementPhrases: ELEMENT_PHRASE_ENTRIES,
  vocabEntries: SEARCH_VOCAB_ENTRIES,
  vocabSet: SEARCH_VOCAB_SET
} = buildSearchIndex();

function damerauDistance(a, b, maxDist = 2) {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;
  if (a === b) return 0;
  const d = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    let rowMin = maxDist + 1;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, d[i - 2][j - 2] + 1);
      }
      d[i][j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return d[la][lb];
}

function getDidYouMeanSuggestions(rawQuery, maxItems = 3, facet = 'all') {
  const trimmed = (rawQuery || '').trim();
  if (trimmed.length < 4 || selectedStatutes.size === 0) return [];
  if (/^(?:item|sched)\s/i.test(trimmed) || /^[\d.\s()-]+$/.test(trimmed)) return [];
  // Keep explicit uppercase non-HTA acronyms like CAIA from spurious corrections
  if (/^[A-Z]{2,6}$/.test(trimmed)) return [];

  const parsed = parseSearchQuery(trimmed);
  const contentToks = parsed.contentTokens;
  if (contentToks.length === 0) return [];

  const replacementsPerToken = contentToks.map(tok => {
    const clean = normalizeSearchToken(tok);
    if (!/^[a-z]{4,}$/.test(clean)) return [tok];
    if (SEARCH_VOCAB_SET.has(clean)) return [tok];

    // Prefer words with matches in the active statute/facet
    if (countMatchesForQuery(tok, facet) > 0) return [tok];

    const maxEdit = clean.length >= 7 ? 2 : 1;
    const candidates = [];
    for (const entry of SEARCH_VOCAB_ENTRIES) {
      const w = entry.word;
      if (Math.abs(w.length - clean.length) > maxEdit) continue;
      // For shorter 4-6 letter tokens require matching initial letter to prevent unrelated noise
      if (clean.length <= 6 && w[0] !== clean[0]) continue;
      if (clean.length >= 7 && maxEdit === 2 && w[0] !== clean[0] && w[1] !== clean[1]) continue;
      const dist = damerauDistance(clean, w, maxEdit);
      if (dist <= maxEdit) {
        candidates.push({ word: w, dist, freq: entry.freq });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist || b.freq - a.freq || Math.abs(a.word.length - clean.length) - Math.abs(b.word.length - clean.length));
    const topWords = candidates.slice(0, 3).map(c => c.word);
    return topWords.length > 0 ? topWords : [tok];
  });

  const anyChanged = replacementsPerToken.some((alts, idx) => alts[0] !== contentToks[idx]);
  if (!anyChanged) return [];

  const out = [];
  const seen = new Set([parsed.q]);
  const primaryQuery = replacementsPerToken.map(alts => alts[0]).join(' ');
  const tryPush = candQ => {
    const key = candQ.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    const cnt = countMatchesForQuery(candQ, facet);
    if (cnt > 0) {
      out.push({ query: candQ, label: candQ, count: cnt, kind: 'didyoumean' });
    }
  };

  tryPush(primaryQuery);
  for (let i = 0; i < replacementsPerToken.length && out.length < maxItems; i++) {
    for (const alt of replacementsPerToken[i]) {
      if (out.length >= maxItems) break;
      const built = replacementsPerToken.map((alts, j) => (j === i ? alt : alts[0])).join(' ');
      tryPush(built);
    }
  }
  return out.slice(0, maxItems);
}

function chargeMatchesFacet(charge, facet = searchFacet) {
  if (!facet || facet === 'all') return true;
  if (facet === 'part3') return /part\s*iii|summons/i.test(charge.part || '');
  if (facet === 'part1') return /part\s*i(?![iv])/i.test(charge.part || '');
  if (facet === 'points') return typeof charge.points === 'number' && charge.points > 0;
  return true;
}

function matchChargeWithContext(charge, rawQuery) {
  const parsed = parseSearchQuery(rawQuery);
  const q = parsed.q;
  if (!q) {
    return { matched: true, score: 0, contextLine: `“${charge.shortWording}”` };
  }

  const idx = CHARGE_SEARCH_INDEX.get(charge.id);
  const { qNorm, qFolded, qJoined, isExplicitItemQuery, contentTokens: tokens, isMultiWord, phraseConcepts, tokenAltSets } = parsed;

  let score = 0;
  let contextLine = `“${charge.shortWording}”`;
  let strongChargeHit = false;
  let wordingMatched = false;

  // Statutory section vs Schedule 43 item ranking: statutory section wins clearly unless "item"/"sched" was explicitly asked
  if (isExplicitItemQuery) {
    if (idx.itemNumLow && (q === idx.itemLow || q === idx.itemNumLow || q === `item ${idx.itemNumLow}`)) {
      score += 195;
      strongChargeHit = true;
      contextLine = `${/^Sched/i.test(idx.itemLabel) ? idx.itemLabel : `Sched. 43 ${idx.itemLabel}`} · “${charge.shortWording}”`;
    } else if (idx.itemLow && idx.itemLow.startsWith(q)) {
      score += 140;
      strongChargeHit = true;
      contextLine = `${/^Sched/i.test(idx.itemLabel) ? idx.itemLabel : `Sched. 43 ${idx.itemLabel}`} · “${charge.shortWording}”`;
    }
  } else {
    if (idx.secLow === q || (qNorm && idx.secNorm === qNorm)) {
      score += 220;
      strongChargeHit = true;
    } else if (idx.secBaseLow && q === idx.secBaseLow) {
      score += 195 + (!charge.itemNumber ? 8 : 0);
      strongChargeHit = true;
    } else if (idx.secLow.startsWith(q) || (qNorm && idx.secNorm.startsWith(qNorm))) {
      score += 145;
      strongChargeHit = true;
    } else if (idx.secLow.includes(q) || (qNorm.length >= 2 && idx.secNorm.includes(qNorm))) {
      score += 95;
      strongChargeHit = true;
    }

    if (idx.itemNumLow && (q === idx.itemLow || q === idx.itemNumLow)) {
      score += 36;
      strongChargeHit = true;
      if (score === 36) contextLine = `${/^Sched/i.test(idx.itemLabel) ? idx.itemLabel : `Sched. 43 ${idx.itemLabel}`} · “${charge.shortWording}”`;
    }
  }

  const isAlphaSingle = !isMultiWord && /^[a-z]+$/.test(q);
  const fieldHas = (low, folded, joined, minFoldedLen = 2) => {
    if (!low) return false;
    if (isAlphaSingle) return tokenMatchesField(q, low, folded, joined);
    return (
      low.includes(q) ||
      (qFolded.length >= minFoldedLen && folded.includes(qFolded)) ||
      (!isMultiWord && qNorm.length >= 3 && tokenMatchesField(q, low, folded, joined))
    );
  };

  if (idx.nameLow.startsWith(q) || (qFolded && idx.nameFolded.startsWith(qFolded))) {
    score += 130;
    strongChargeHit = true;
  } else if (fieldHas(idx.nameLow, idx.nameFolded, idx.nameJoined)) {
    score += 110;
    strongChargeHit = true;
  }

  if (idx.subLow && !isGenericSubSection(idx.subLow)) {
    if (idx.subLow.startsWith(q) || (qFolded && idx.subFolded.startsWith(qFolded))) {
      score += 110;
      strongChargeHit = true;
    } else if (fieldHas(idx.subLow, idx.subFolded, idx.subJoined)) {
      score += 82;
      strongChargeHit = true;
    }
  }

  if (fieldHas(idx.wordingLow, idx.wordingFolded, idx.wordingJoined)) {
    score += 68;
    wordingMatched = true;
  }

  if (idx.statCodeLow === q) {
    score += 72;
    strongChargeHit = true;
  } else if (idx.statCodeLow.includes(q) || idx.statNameLow.includes(q) || idx.statShortLow.includes(q)) {
    score += 48;
  }

  if (fieldHas(idx.catLow, idx.catLow, idx.catJoined)) {
    score += 52;
  }

  let aliasMatched = false;
  const exactAliasPhrase =
    idx.aliasFolded &&
    qFolded.length >= 2 &&
    (` ${idx.aliasFolded} `.includes(` ${qFolded} `) || (!isMultiWord && qNorm.length >= 4 && ` ${idx.aliasJoined} `.includes(` ${qNorm} `)));
  if (exactAliasPhrase) {
    score += 95;
    aliasMatched = true;
  } else if (fieldHas(idx.aliasLow, idx.aliasFolded, idx.aliasJoined)) {
    score += 48;
    aliasMatched = true;
  }

  let metaMatched = false;
  if (idx.metaTagsLow && fieldHas(idx.metaTagsLow, idx.metaTagsFolded, idx.metaTagsFolded)) {
    score += 44;
    metaMatched = true;
  }

  // Exact / hyphen-folded / Canadian<->US / verb-stemmed element matching
  let bestEl = null;
  let coreElMatches = 0;
  let glossOnlyElMatches = 0;
  if (!isExplicitItemQuery) {
    for (const elEntry of idx.elementEntries) {
      const hitCore = fieldHas(elEntry.coreLow, elEntry.coreFolded, elEntry.coreJoined, 1);
      if (hitCore) {
        coreElMatches++;
        const rankWeight = (elEntry.isGeneric ? 1 : 10) + (elEntry.isOption ? 2 : 0);
        if (!bestEl || bestEl.isGlossOnly || rankWeight > bestEl.rankWeight) {
          bestEl = { ...elEntry, isGlossOnly: false, rankWeight };
        }
        continue;
      }
      const hitGloss = fieldHas(elEntry.low, elEntry.folded, elEntry.joined, 1);
      if (hitGloss) {
        glossOnlyElMatches++;
        if (!bestEl) {
          bestEl = { ...elEntry, isGlossOnly: true, rankWeight: 0 };
        }
      }
    }
    if (coreElMatches > 0) {
      score += 88 + Math.min(18, (coreElMatches - 1) * 8);
    } else if (glossOnlyElMatches > 0) {
      score += 6;
    }
  }

  let summaryMatched = false;
  if (fieldHas(idx.summaryLow, idx.summaryFolded, idx.summaryJoined)) {
    score += 26;
    summaryMatched = true;
  }

  let notesMatched = false;
  if (fieldHas(idx.notesLow, idx.notesFolded, idx.notesJoined, 3)) {
    score += 18;
    notesMatched = true;
  }

  let statMatched = false;
  if (fieldHas(idx.statTextLow, idx.statTextFolded, idx.statTextJoined, 3)) {
    score += 12;
    statMatched = true;
  }

  // Multi-word / cross-element token search (uses contentTokens so filler stopwords don't block natural phrases)
  let multiMatchedTokens = false;
  let multiMatchedElLabels = [];
  if (tokens.length >= 1 && !isExplicitItemQuery && coreElMatches === 0 && !strongChargeHit) {
    const tokenSetMatches = (altSet, low, folded, joined) =>
      altSet.some(alt => tokenMatchesField(alt, low, folded, joined));

    const allDirectCoreEls = isMultiWord && tokens.every(tok => tokenMatchesField(tok, idx.allElCoreFolded, idx.allElCoreFolded, idx.allElCoreJoined));
    const allDirectFull = isMultiWord && tokens.every(tok => tokenMatchesField(tok, idx.fullLow, idx.fullFolded, idx.fullJoined));

    let conceptBoostMatched = false;
    let matchedConceptLabel = '';
    if (!allDirectCoreEls && !allDirectFull && parsed.hasConceptAlt) {
      if (tokenAltSets.every(altSet => tokenSetMatches(altSet, idx.fullLow, idx.fullFolded, idx.fullJoined))) {
        conceptBoostMatched = true;
      } else {
        for (const cp of phraseConcepts) {
          if (cp.anyOf.some(phrase => {
            const pToks = normalizeFolded(phrase).split(/\s+/).filter(Boolean);
            return idx.fullFolded.includes(phrase) || (pToks.length > 0 && pToks.every(t => tokenMatchesField(t, idx.fullLow, idx.fullFolded, idx.fullJoined)));
          })) {
            conceptBoostMatched = true;
            matchedConceptLabel = cp.label;
            break;
          }
        }
      }
    }

    if (allDirectCoreEls || allDirectFull || conceptBoostMatched) {
      multiMatchedTokens = true;
      const evalSets = allDirectCoreEls || allDirectFull ? tokens.map(t => [t]) : tokenAltSets;
      const primaryHits = evalSets.filter(altSet =>
        tokenSetMatches(altSet, idx.primaryFolded, idx.primaryFolded, idx.primaryJoined)
      ).length;
      const aliasHit = tokens.some(t => tokenMatchesField(t, idx.aliasLow, idx.aliasFolded, idx.aliasJoined));

      let bestEntry = null;
      let bestHits = 0;
      let bestCoreSpec = -1;
      const hitLabels = new Set();

      for (const elEntry of idx.elementEntries) {
        const coreHits = evalSets.filter(altSet =>
          tokenSetMatches(altSet, elEntry.coreLow, elEntry.coreFolded, elEntry.coreJoined)
        ).length;
        const fullHits = coreHits > 0
          ? coreHits
          : evalSets.filter(altSet => tokenSetMatches(altSet, elEntry.low, elEntry.folded, elEntry.joined)).length;
        if (fullHits === 0) continue;

        const isCoreHit = coreHits > 0;
        if (isCoreHit) hitLabels.add(elEntry.label.replace(/[a-z]+$/, ''));
        const specScore = (isCoreHit ? 100 : 0) + (elEntry.isGeneric ? 0 : 20) + (elEntry.isOption ? 4 : 0);
        if (
          fullHits > bestHits ||
          (fullHits === bestHits && specScore > bestCoreSpec)
        ) {
          bestHits = fullHits;
          bestCoreSpec = specScore;
          bestEntry = { ...elEntry, isGlossOnly: !isCoreHit };
        }
      }

      multiMatchedElLabels = Array.from(hitLabels);
      if (allDirectCoreEls) {
        const coreMultiScore =
          76 +
          Math.min(12, primaryHits * 6) +
          Math.min(14, Math.max(0, multiMatchedElLabels.length - 1) * 7) +
          (aliasMatched || aliasHit ? 12 : 0);
        score = Math.max(score, coreMultiScore);
        if (bestEntry && (!bestEl || !bestEntry.isGlossOnly)) bestEl = bestEntry;
      } else if (allDirectFull) {
        const allDirectPrimary = tokens.every(tok =>
          tokenMatchesField(tok, idx.primaryFolded, idx.primaryFolded, idx.primaryJoined)
        );
        const fullMultiScore = allDirectPrimary
          ? 72 + Math.min(12, multiMatchedElLabels.length * 6) + (aliasHit ? 10 : 0)
          : (multiMatchedElLabels.length > 0 || aliasHit)
            ? 58 + Math.min(18, primaryHits * 6) + Math.min(12, multiMatchedElLabels.length * 6) + (aliasHit ? 10 : 0)
            : 32 + Math.min(12, primaryHits * 6);
        score = Math.max(score, fullMultiScore);
        if (bestEntry && (!bestEl || bestEl.isGlossOnly)) bestEl = bestEntry;
      } else if (conceptBoostMatched) {
        const directTitleHits = tokens.filter(t => tokenMatchesField(t, idx.nameLow, idx.nameFolded, idx.nameJoined)).length;
        const directPrimaryHits = tokens.filter(t => tokenMatchesField(t, idx.primaryFolded, idx.primaryFolded, idx.primaryJoined)).length;
        const baseConcept = directTitleHits > 0 || directPrimaryHits > 0
          ? 40
          : primaryHits > 0 ? 32 : (multiMatchedElLabels.length > 0 ? 28 : 22);
        const conceptScore =
          baseConcept +
          Math.min(10, directTitleHits * 5) +
          Math.min(6, directPrimaryHits * 3) +
          Math.min(6, primaryHits * 2) +
          Math.min(6, multiMatchedElLabels.length * 3);
        if (score === 0) {
          score = conceptScore;
          if (matchedConceptLabel && !bestEntry) {
            contextLine = `Concept (${matchedConceptLabel}) · “${charge.shortWording}”`;
          }
          if (bestEntry) bestEl = bestEntry;
        }
      }
    }
  }

  // Context snippet: surface exact Element N proof line whenever search hits via elements cleanly (or spans multiple elements)
  const useBestElContext =
    bestEl &&
    (!bestEl.isGlossOnly || (!aliasMatched && !summaryMatched && !notesMatched)) &&
    !strongChargeHit &&
    (!wordingMatched || (multiMatchedTokens && multiMatchedElLabels.length > 0));

  if (useBestElContext) {
    const labelPrefix = multiMatchedElLabels.length > 1 && !bestEl.isGlossOnly
      ? `Elements ${multiMatchedElLabels.slice(0, 2).join(' & ')}`
      : `Element ${bestEl.label}`;
    contextLine = `${labelPrefix}: ${makeSnippetAround(bestEl.displayText, rawQuery, 78)}`;
  } else if (!strongChargeHit && !wordingMatched) {
    if (aliasMatched) {
      contextLine = `Keyword: ${q} · “${charge.shortWording}”`;
    } else if (metaMatched) {
      const ptsNote = typeof charge.points === 'number' && charge.points > 0 ? ` · ${charge.points} pts` : '';
      contextLine = `${charge.part}${ptsNote} · “${charge.shortWording}”`;
    } else if (summaryMatched) {
      contextLine = `Summary: ${makeSnippetAround(charge.summary, rawQuery, 78)}`;
    } else if (notesMatched) {
      contextLine = `Note: ${makeSnippetAround(charge.procedureNotes, rawQuery, 78)}`;
    } else if (statMatched) {
      contextLine = `Statute: ${makeSnippetAround(charge.statutoryText, rawQuery, 78)}`;
    } else if (multiMatchedTokens) {
      const bodySource = [
        { label: 'Summary', text: charge.summary },
        { label: 'Note', text: charge.procedureNotes },
        { label: 'Statute', text: charge.statutoryText }
      ].find(src => src.text && tokens.some(tok =>
        !tokenMatchesField(tok, idx.primaryFolded, idx.primaryFolded, idx.primaryJoined) &&
        tokenMatchesField(tok, src.text.toLowerCase(), normalizeFolded(src.text), normalizeHyphenJoined(src.text))
      ));
      if (bodySource) {
        contextLine = `${bodySource.label}: ${makeSnippetAround(bodySource.text, rawQuery, 78)}`;
      } else if (tokens.some(tok => tokenMatchesField(tok, idx.aliasLow, idx.aliasFolded, idx.aliasJoined))) {
        contextLine = `Keyword: ${q} · “${charge.shortWording}”`;
      }
    }
  }

  return { matched: score > 0, score, contextLine };
}

const queryCountCache = new Map();
function countMatchesForQuery(q, facet = searchFacet) {
  const scopeKey = Array.from(selectedStatutes).sort().join(',');
  const activeFacet = facet || 'all';
  const key = (q || '').trim().toLowerCase();
  if (!key) {
    if (activeFacet === 'all') return activeChargeCount();
    let total = 0;
    for (let i = 0; i < CHARGES.length; i++) {
      if (selectedStatutes.has(CHARGES[i].statute) && chargeMatchesFacet(CHARGES[i], activeFacet)) total++;
    }
    return total;
  }
  if (selectedStatutes.size === 0) return 0;
  const cacheKey = `${scopeKey}|${activeFacet}|${key}`;
  if (queryCountCache.has(cacheKey)) return queryCountCache.get(cacheKey);
  let n = 0;
  for (let i = 0; i < CHARGES.length; i++) {
    if (!selectedStatutes.has(CHARGES[i].statute)) continue;
    if (!chargeMatchesFacet(CHARGES[i], activeFacet)) continue;
    if (matchChargeWithContext(CHARGES[i], q).matched) n++;
  }
  if (queryCountCache.size > 500) queryCountCache.clear();
  queryCountCache.set(cacheKey, n);
  return n;
}

function buildSuggestionCatalog() {
  const entries = [];
  const seen = new Set();
  const addEntry = (queryText, label = queryText, kind = 'topic') => {
    const key = queryText.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    const count = countMatchesForQuery(queryText, 'all');
    if (count > 0) entries.push({ query: queryText, label, kind, count });
  };

  for (const pop of POPULAR_QUERIES) addEntry(pop, pop, 'popular');
  for (const cat of CATEGORIES) {
    if (cat.id !== 'all') addEntry(cat.label, cat.label, 'category');
  }
  for (const ch of CHARGES) {
    if (ch.subSection && !isGenericSubSection(ch.subSection)) {
      addEntry(ch.subSection, `${ch.subSection}`, 'offence');
    }
  }
  addEntry('Handheld phone', 'Handheld phone (78.1)', 'alias');
  addEntry('Move over', 'Move over / emergency (159)', 'alias');
  addEntry('School bus', 'Fail to stop / school bus (175)', 'alias');
  addEntry('Fail to remain', 'Fail to remain / hit & run (200)', 'alias');
  addEntry('Follow too closely', 'Follow too closely (158)', 'alias');
  addEntry('Overweight', 'Overweight / axle scale (115–126)', 'alias');
  addEntry('Tinted plate cover', 'Plate cover / obstructed', 'alias');
  addEntry('Expired sticker', 'Unvalidated permit', 'alias');
  addEntry('Rolling stop', 'Stop sign / rolling stop', 'alias');
  addEntry('Radar detector', 'Speed measuring warning device', 'alias');
  addEntry('Window tint', 'Obstructed view / tint (73)', 'alias');
  addEntry('Loud muffler', 'Muffler / unnecessary noise (75)', 'alias');
  addEntry('CVOR certificate', 'CVOR / commercial (16)', 'alias');
  addEntry('Unsafe vehicle', 'Unsafe vehicle (84)', 'alias');
  addEntry('Defective brakes', 'Brakes / defective (64)', 'alias');
  addEntry('Headlight', 'Headlights / lamps (62)', 'alias');
  addEntry('Reg. 604', 'King’s Highway Parking (Reg. 604)', 'alias');

  // High-signal proof element shortcuts so officers can search element facts to find the charge
  addEntry('15 cm of curb', 'Within 15 cm of curb', 'element');
  addEntry('Liftable axle', 'Liftable axle lifted/deployed', 'element');
  addEntry('Flashing amber light', 'Flashing amber light', 'element');
  addEntry('Flashing red light', 'Flashing red light', 'element');
  addEntry('Slow down and proceed with caution', 'Slow down & proceed with caution', 'element');
  addEntry('Did not remain at scene', 'Did not remain at scene', 'element');
  addEntry('Pedestrian crossover', 'Pedestrian crossover yield', 'element');
  addEntry('Phone calls', 'Device send/receive phone calls', 'element');
  addEntry('Text messages', 'Device send/receive text messages', 'element');

  for (const st of STATUTES) {
    addEntry(st.code, `${st.code} · ${STATUTE_CONTEXT[st.code] || st.short}`, 'statute');
  }

  return entries;
}

const SUGGESTION_CATALOG = buildSuggestionCatalog();

function getPredictiveSuggestions(rawQuery, maxItems = 5) {
  const q = (rawQuery || '').trim().toLowerCase();
  const parsed = parseSearchQuery(q);
  const qFolded = parsed.qFolded;
  const qCompact = parsed.qNorm;
  const results = [];
  const seen = new Set();

  if (!q) {
    for (const r of recentSearches) {
      const key = r.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ query: r, label: r, kind: 'recent', count: countMatchesForQuery(r, searchFacet) });
      if (results.length >= maxItems) return results;
    }
    for (const entry of SUGGESTION_CATALOG) {
      const key = entry.query.toLowerCase();
      if (seen.has(key)) continue;
      const liveCount = countMatchesForQuery(entry.query, searchFacet);
      if (liveCount === 0) continue;
      seen.add(key);
      results.push({ ...entry, count: liveCount, kind: 'popular' });
      if (results.length >= maxItems) break;
    }
    return results;
  }

  // Recent queries matching partial input come first
  for (const r of recentSearches) {
    const lower = r.toLowerCase();
    if (lower !== q && lower.includes(q) && !seen.has(lower)) {
      seen.add(lower);
      results.push({ query: r, label: r, kind: 'recent', count: countMatchesForQuery(r, searchFacet) });
      if (results.length >= maxItems) return results;
    }
  }

  // Prefix completions next (charges, topics, aliases, and curated element phrases)
  for (const entry of SUGGESTION_CATALOG) {
    const ql = entry.query.toLowerCase();
    const ll = entry.label.toLowerCase();
    if (ql !== q && (ql.startsWith(q) || ll.startsWith(q)) && !seen.has(ql)) {
      const liveCount = countMatchesForQuery(entry.query, searchFacet);
      if (liveCount === 0) continue;
      seen.add(ql);
      results.push({ ...entry, count: liveCount, kind: entry.kind === 'element' ? 'element' : 'completion' });
      if (results.length >= maxItems) return results;
    }
  }

  // Word/substring completions next
  for (const entry of SUGGESTION_CATALOG) {
    const ql = entry.query.toLowerCase();
    const ll = entry.label.toLowerCase();
    if (
      ql !== q &&
      (ql.includes(q) || ll.includes(q) || (qCompact.length >= 4 && normalizeSearchToken(ql).includes(qCompact))) &&
      !seen.has(ql)
    ) {
      const liveCount = countMatchesForQuery(entry.query, searchFacet);
      if (liveCount === 0) continue;
      seen.add(ql);
      results.push({ ...entry, count: liveCount, kind: entry.kind === 'element' ? 'element' : 'completion' });
      if (results.length >= maxItems) return results;
    }
  }

  // Dynamic core element-clause completions (lets officers discover charges by typing any element keyword)
  if (q.length >= 3 && results.length < maxItems && selectedStatutes.size > 0) {
    const qTokens = parsed.contentTokens;
    const elMatches = [];
    for (const ep of ELEMENT_PHRASE_ENTRIES) {
      const eq = ep.query.toLowerCase();
      if (eq === q || seen.has(eq)) continue;
      const matchesAll = qTokens.length > 0 && qTokens.every(tok => tokenMatchesField(tok, eq, ep.folded, ep.joined));
      if (!matchesAll) continue;
      const isPrefix = eq.startsWith(q) || ep.folded.startsWith(qFolded);
      elMatches.push({ ep, isPrefix });
    }
    elMatches.sort((a, b) => Number(b.isPrefix) - Number(a.isPrefix) || a.ep.occurrences - b.ep.occurrences || a.ep.query.length - b.ep.query.length);
    for (const { ep } of elMatches) {
      const eq = ep.query.toLowerCase();
      if (seen.has(eq)) continue;
      const liveCount = countMatchesForQuery(ep.query, searchFacet);
      if (liveCount === 0) continue;
      seen.add(eq);
      results.push({
        query: ep.query,
        label: ep.label,
        kind: 'element',
        count: liveCount
      });
      if (results.length >= maxItems) return results;
    }
  }

  // Fallback section / charge completions when typing numbers (e.g. "78", "128", "182")
  for (const ch of CHARGES) {
    if (!selectedStatutes.has(ch.statute)) continue;
    if (!chargeMatchesFacet(ch, searchFacet)) continue;
    const key = ch.section.toLowerCase();
    if ((key.includes(parsed.q) || (qCompact && normalizeSearchToken(key).includes(qCompact))) && key !== q && !seen.has(key)) {
      seen.add(key);
      const subLbl = ch.subSection && !isGenericSubSection(ch.subSection) ? ch.subSection : ch.name;
      results.push({
        query: ch.section,
        label: `${ch.statute} ${ch.section} · ${subLbl}`,
        kind: 'section',
        count: SECTION_COUNTS.get(ch.section) || 1
      });
      if (results.length >= maxItems) break;
    }
  }

  // Typo recovery completions right in predictive bar when no regular suggestion exists
  if (results.length === 0 && countMatchesForQuery(rawQuery, searchFacet) === 0) {
    const dym = getDidYouMeanSuggestions(rawQuery, Math.min(3, maxItems), searchFacet);
    for (const item of dym) results.push(item);
  }

  return results.slice(0, maxItems);
}

function visibleCharges(stuckOnly = false, { ignoreCategoryFilter = false, ignoreFacet = false, sortMode = null } = {}) {
  const q = stuckOnly ? savedQuery.trim() : query.trim();
  const activeFacet = ignoreFacet ? 'all' : searchFacet;
  const list = [];

  for (let i = 0; i < CHARGES.length; i++) {
    const c = CHARGES[i];
    if (stuckOnly) {
      if (!stuck.has(c.id)) continue;
      const match = matchChargeWithContext(c, q);
      if (match.matched) {
        list.push({ ...c, originalIdx: i, score: match.score, contextLine: match.contextLine });
      }
      continue;
    }
    if (!selectedStatutes.has(c.statute)) continue;
    if (!chargeMatchesFacet(c, activeFacet)) continue;
    if (!ignoreCategoryFilter && filter && c.category !== filter) continue;
    const match = matchChargeWithContext(c, q);
    if (match.matched) {
      list.push({ ...c, originalIdx: i, score: match.score, contextLine: match.contextLine });
    }
  }

  const activeSort = sortMode || (q ? searchSort : sort);
  if (activeSort === 'relevance' && q) {
    list.sort((a, b) => b.score - a.score || compareChargesByNumber(a, b));
  } else if (activeSort === 'number') {
    list.sort(compareChargesByNumber);
  } else {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return list;
}

function applySearchSuggestion(suggestionQuery, { recordHistory = true } = {}) {
  setActiveSearchQuery(suggestionQuery);
  if (searchInput) searchInput.value = getActiveSearchQuery();
  searchTextScrollX = 0;
  searchFocused = false;
  if (recordHistory) addRecentSearch(suggestionQuery);
  if (!appBarSearchOpen && tab === 'home') {
    tab = 'charges';
    pushNavState('charges');
  }
  draw();
}

function pushNavState(view, extra = {}) {
  if (typeof history?.pushState !== 'function') return;
  try {
    history.pushState({ sttView: view, tab, appBarSearchOpen, settingsSubView, ...extra }, '');
  } catch {}
}

function openRulesSubView() {
  tab = 'settings';
  settingsSubView = 'rules';
  rulesScrollY = 0;
  pushNavState('rules', { originTab: 'settings' });
  draw();
}

function closeRulesSubView({ fromPopState = false } = {}) {
  settingsSubView = null;
  if (!fromPopState && history?.state?.sttView === 'rules') {
    ignoreNextPopState = true;
    try { history.back(); } catch { ignoreNextPopState = false; }
    setTimeout(() => { ignoreNextPopState = false; }, 120);
  }
  draw();
}

function openAppBarSearch() {
  if (!appBarSearchOpen) {
    searchOriginTab = tab;
    appBarSearchOpen = true;
    searchScrollY = 0;
    pushNavState('search', { originTab: searchOriginTab });
  }
  focusSearchInput();
}

function closeAppBarSearch({ fromPopState = false, clearQuery = true } = {}) {
  appBarSearchOpen = false;
  searchFocused = false;
  if (clearQuery) {
    query = '';
    if (searchInput) searchInput.value = '';
    searchScrollY = 0;
  }
  tab = searchOriginTab || tab;
  if (!fromPopState && history?.state?.sttView === 'search') {
    ignoreNextPopState = true;
    try { history.back(); } catch { ignoreNextPopState = false; }
    setTimeout(() => { ignoreNextPopState = false; }, 120);
  }
  draw();
}

function openChargeDetail(idx, { replace = false } = {}) {
  const activeQ = getActiveSearchQuery().trim();
  if (activeQ.length >= 2) {
    addRecentSearch(activeQ);
  }
  if (!replace || !pendingDetailReturnScroll) {
    pendingDetailReturnScroll = {
      appBarSearchOpen,
      tab,
      settingsSubView,
      query,
      savedQuery,
      filter,
      searchFacet,
      searchScrollY,
      listScrollY,
      savedScrollY,
      detailQuery: activeQ
    };
  }
  openChargeIdx = idx;
  detailScrollY = 0;
  searchFocused = false;
  if (!replace) {
    pushNavState('detail', { chargeIdx: idx });
  }
  draw();
}

function closeDetail({ fromPopState = false } = {}) {
  const snap = pendingDetailReturnScroll;
  pendingDetailReturnScroll = null;
  openChargeIdx = null;
  if (snap) {
    appBarSearchOpen = snap.appBarSearchOpen;
    tab = snap.tab;
    settingsSubView = snap.settingsSubView || null;
    query = snap.query;
    savedQuery = snap.savedQuery ?? '';
    filter = snap.filter;
    searchFacet = snap.searchFacet ?? 'all';
    searchScrollY = snap.searchScrollY;
    listScrollY = snap.listScrollY;
    savedScrollY = snap.savedScrollY;
  }
  if (!fromPopState && history?.state?.sttView === 'detail') {
    ignoreNextPopState = true;
    try { history.back(); } catch { ignoreNextPopState = false; }
    setTimeout(() => { ignoreNextPopState = false; }, 120);
  }
  draw();
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

let redrawScheduled = false;
function requestRedraw() {
  if (redrawScheduled) return;
  redrawScheduled = true;
  requestAnimationFrame(() => {
    redrawScheduled = false;
    draw();
  });
}

function resetCaretBlink() {
  caretBlinkOn = true;
  if (caretBlinkTimer) clearInterval(caretBlinkTimer);
  if (searchFocused) {
    caretBlinkTimer = setInterval(() => {
      if (!searchFocused) {
        clearInterval(caretBlinkTimer);
        caretBlinkTimer = null;
        return;
      }
      caretBlinkOn = !caretBlinkOn;
      requestRedraw();
    }, 530);
  }
}

function stopCaretBlink() {
  caretBlinkOn = false;
  if (caretBlinkTimer) {
    clearInterval(caretBlinkTimer);
    caretBlinkTimer = null;
  }
}

function drawSearchBoxText(context, c, box) {
  if (!box) return;
  const activeQ = getActiveSearchQuery();
  const liveText = searchInput && document.activeElement === searchInput ? searchInput.value : activeQ;
  const len = liveText.length;
  const textColor = len > 0 ? c.ink : c.ink_faint;
  const displayStr = len > 0 ? liveText : box.placeholder;

  context.save();
  context.font = `500 ${box.fontSize}px ${FONT_UI}`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';

  const hasSelFocus = searchFocused && !!searchInput && document.activeElement === searchInput;
  let selStart = len;
  let selEnd = len;
  if (hasSelFocus && typeof searchInput.selectionStart === 'number') {
    selStart = Math.max(0, Math.min(len, searchInput.selectionStart));
    selEnd = typeof searchInput.selectionEnd === 'number'
      ? Math.max(selStart, Math.min(len, searchInput.selectionEnd))
      : selStart;
  }

  const totalW = len > 0 ? context.measureText(liveText).width : 0;
  const caretOffset = len > 0 ? context.measureText(liveText.slice(0, selEnd)).width : 0;
  const maxInnerW = Math.max(20.0, box.w - 3.0);
  if (len === 0 || totalW <= maxInnerW) {
    searchTextScrollX = 0;
  } else {
    if (caretOffset - searchTextScrollX > maxInnerW) {
      searchTextScrollX = caretOffset - maxInnerW;
    } else if (caretOffset - searchTextScrollX < 0) {
      searchTextScrollX = Math.max(0, caretOffset);
    }
    searchTextScrollX = Math.max(0, Math.min(searchTextScrollX, Math.max(0, totalW - maxInnerW)));
  }

  context.beginPath();
  context.rect(box.x - 1.5, box.y, box.w + 3.0, box.h);
  context.clip();

  const textDrawX = box.x - searchTextScrollX;
  const textMidY = box.y + box.h / 2.0 + 0.5;

  if (hasSelFocus && selEnd > selStart) {
    const s1 = textDrawX + context.measureText(liveText.slice(0, selStart)).width;
    const s2 = textDrawX + context.measureText(liveText.slice(0, selEnd)).width;
    context.fillStyle = isDark ? 'rgba(47, 196, 118, 0.34)' : 'rgba(11, 88, 50, 0.20)';
    context.fillRect(s1, box.y + 3.0, Math.max(2.0, s2 - s1), box.h - 6.0);
  }

  context.fillStyle = textColor;
  context.fillText(displayStr, len > 0 ? textDrawX : box.x, textMidY);

  const caretVisible = Boolean(searchFocused && caretBlinkOn && selStart === selEnd);
  if (caretVisible) {
    const caretX = Math.max(box.x, Math.min(box.x + box.w - 1.5, len > 0 ? textDrawX + caretOffset : box.x));
    const caretH = Math.min(box.h - 6.0, Math.round(box.fontSize * 1.32));
    context.fillStyle = isDark ? c.green : '#0b5832';
    context.fillRect(Math.round(caretX * 2) / 2, box.y + (box.h - caretH) / 2.0, 1.75, caretH);
  }

  context.restore();

  lastSearchRender = {
    text: liveText,
    placeholder: box.placeholder,
    isPlaceholder: len === 0,
    color: textColor,
    rect: { x: box.x, y: box.y, w: box.w, h: box.h },
    caretVisible
  };
}

function syncSearchOverlay() {
  if (!searchInput) return;
  if (!activeSearchBox) {
    stopCaretBlink();
    if (!searchInput.hidden) {
      if (document.activeElement === searchInput) searchInput.blur();
      searchInput.hidden = true;
    }
    return;
  }

  const wasHidden = searchInput.hidden;
  searchInput.hidden = false;
  searchInput.style.left = `${activeSearchBox.x}px`;
  searchInput.style.top = `${activeSearchBox.y}px`;
  searchInput.style.width = `${activeSearchBox.w}px`;
  searchInput.style.height = `${activeSearchBox.h}px`;
  searchInput.style.fontFamily = FONT_UI;
  searchInput.style.fontSize = `${activeSearchBox.fontSize}px`;
  searchInput.style.fontWeight = '500';
  searchInput.style.colorScheme = isDark ? 'dark' : 'light';
  searchInput.style.color = 'transparent';
  searchInput.style.webkitTextFillColor = 'transparent';
  searchInput.style.caretColor = 'transparent';
  searchInput.placeholder = '';
  searchInput.setAttribute('aria-label', activeSearchBox.placeholder);

  const activeQ = getActiveSearchQuery();
  if (searchInput.value !== activeQ) {
    searchInput.value = activeQ;
  }
  searchInput.scrollLeft = searchTextScrollX;
  if (wasHidden && searchFocused) {
    searchInput.focus({ preventScroll: true });
  }
}

function focusSearchInput() {
  if (!searchInput) return;
  if (blurHideTimer) {
    clearTimeout(blurHideTimer);
    blurHideTimer = null;
  }
  searchFocused = true;
  resetCaretBlink();
  draw();
  searchInput.focus({ preventScroll: true });
  const len = searchInput.value.length;
  searchInput.setSelectionRange?.(len, len);
  draw();
}

function drawStatusToast(context, x, y, w, h) {
  if (!statusToast || Date.now() >= statusToast.expiresAt) return;
  const c = colors();
  const maxW = Math.max(120.0, w - PAD * 2.0);
  context.font = '600 11.5px system-ui, -apple-system, sans-serif';
  const label = truncateToWidth(context, statusToast.message, maxW - 36.0);
  const textW = context.measureText(label).width;
  const pillW = Math.min(maxW, Math.max(116.0, textW + 36.0));
  const pillH = 30.0;
  const pillX = x + (w - pillW) / 2.0;
  const bottomAnchor = openChargeIdx !== null ? y + h - 22.0 : y + h - NAV_H - 12.0;
  const pillY = bottomAnchor - pillH;

  context.save();
  context.fillStyle = isDark ? 'rgba(0, 0, 0, 0.42)' : 'rgba(0, 0, 0, 0.22)';
  roundRect(context, pillX, pillY + 2.0, pillW, pillH, 15);
  context.fill();

  context.fillStyle = isDark ? '#242a33' : '#0a0c10';
  roundRect(context, pillX, pillY, pillW, pillH, 15);
  context.fill();
  context.strokeStyle = isDark ? c.green : 'rgba(255, 255, 255, 0.14)';
  context.lineWidth = 1.0;
  context.stroke();

  context.fillStyle = c.green;
  context.beginPath();
  context.arc(pillX + 14.0, pillY + pillH / 2.0, 3.2, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#ffffff';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(label, pillX + 23.0, pillY + pillH / 2.0 + 0.5);
  context.restore();
}

// Drawing routines
function draw() {
  clickables = [];
  activeSearchBox = null;
  lastSearchRender = null;
  activeSuggestionPopoverRect = null;
  lastStatuteRenderItalic = null;
  lastDetailMatchedElements = [];
  lastDetailHighlightCount = 0;

  ctx.save();
  ctx.scale(dpr, dpr);

  const c = colors();

  // Outer page background
  ctx.fillStyle = c.page;
  ctx.fillRect(0, 0, width, height);

  // Phone frame geometry
  const margin = 16.0;
  const phone_w = Math.max(300.0, Math.min(430.0, width - margin * 2.0));
  const phone_h = Math.max(420.0, Math.min(phone_w * 2.02, height - margin * 2.0));
  const phone_x = (width - phone_w) / 2.0;
  const phone_y = (height - phone_h) / 2.0;

  // Soft concentric drop shadow layers (like Stick the Charge)
  for (let i = 0; i < 6; i++) {
    const expand = 2.0 + i * 3.0;
    const alpha = (isDark ? 0.14 : 0.045) * (1 - i / 6);
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha.toFixed(3)})`;
    roundRect(
      ctx,
      phone_x - expand,
      phone_y - expand + 3.0,
      phone_w + expand * 2.0,
      phone_h + expand * 2.0,
      40 + expand
    );
    ctx.fill();
  }

  // Phone outer bezel
  ctx.fillStyle = c.body;
  roundRect(ctx, phone_x, phone_y, phone_w, phone_h, 40);
  ctx.fill();
  ctx.strokeStyle = c.bezel_stroke;
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

  // Status bar
  drawStatusBar(ctx, s_x, s_y, s_w);

  if (openChargeIdx !== null) {
    drawDetailScreen(ctx, s_x, s_y, s_w, s_h);
  } else {
    drawTitleBar(ctx, s_x, s_y + STATUS_H, s_w);
    if (appBarSearchOpen) {
      drawAppBarSearchScreen(ctx, s_x, s_y, s_w, s_h);
    } else if (tab === 'home') {
      drawHomeScreen(ctx, s_x, s_y, s_w, s_h);
    } else if (tab === 'charges') {
      drawChargesScreen(ctx, s_x, s_y, s_w, s_h, false);
    } else if (tab === 'saved') {
      drawChargesScreen(ctx, s_x, s_y, s_w, s_h, true);
    } else if (tab === 'settings') {
      if (settingsSubView === 'rules') {
        drawRulesSubScreen(ctx, s_x, s_y, s_w, s_h);
      } else {
        drawSettingsScreen(ctx, s_x, s_y, s_w, s_h);
      }
    }
    drawNavBar(ctx, s_x, s_y, s_w, s_h);
  }

  if (statusToast && Date.now() < statusToast.expiresAt) {
    drawStatusToast(ctx, s_x, s_y, s_w, s_h);
  }

  ctx.restore();
  ctx.restore();

  if (loading) loading.textContent = '';

  syncSearchOverlay();
  updateCursor();

  window.testClickables = clickables.map(item => ({
    id: item.id,
    x: Math.round(item.rect.x),
    y: Math.round(item.rect.y),
    w: Math.round(item.rect.w),
    h: Math.round(item.rect.h)
  }));
  const activeCharge = openChargeIdx !== null ? CHARGES[openChargeIdx] : null;
  window.testState = {
    tab,
    settingsSubView,
    isDark,
    query,
    savedQuery,
    filter,
    searchFacet,
    sort,
    searchSort,
    appBarSearchOpen,
    searchOriginTab,
    openChargeIdx,
    openChargeId: activeCharge ? activeCharge.id : null,
    activeDetailQuery: activeCharge ? (pendingDetailReturnScroll?.detailQuery || '') : '',
    detailMatchedElements: activeCharge ? [...lastDetailMatchedElements] : [],
    detailHighlightSpans: activeCharge ? lastDetailHighlightCount : 0,
    openChargeSetFine: activeCharge ? activeCharge.setFine : null,
    openChargeTotalPayable: activeCharge ? activeCharge.totalPayable : null,
    openChargePoints: activeCharge && typeof activeCharge.points === 'number' ? activeCharge.points : null,
    openChargeHasStatuteText: !!(activeCharge && activeCharge.statutoryText),
    openChargeStatuteItalic: activeCharge ? lastStatuteRenderItalic : null,
    openChargeHasOptions: !!(activeCharge && activeCharge.elements.some(e => Array.isArray(e.options) && e.options.length > 0)),
    openChargeElementsCount: activeCharge ? activeCharge.elements.length : 0,
    listScrollY,
    maxListScrollY,
    searchScrollY,
    maxSearchScrollY,
    detailScrollY,
    maxDetailScrollY,
    rulesScrollY,
    maxRulesScrollY,
    settingsScrollY,
    maxSettingsScrollY,
    searchFocused,
    searchRender: lastSearchRender,
    recentSearches: [...recentSearches],
    selectedStatutes: Array.from(selectedStatutes).sort(),
    activeChargeCount: activeChargeCount(),
    currentUserId: currentProfileId,
    currentUserName: activeProfile()?.displayName || null,
    profileCount: Object.keys(profiles).length,
    checkedElementsTotal: countTotalCheckedElements(),
    statusToast: statusToast && Date.now() < statusToast.expiresAt ? statusToast.message : null,
    savedCount: stuck.size,
    chargeCount: CHARGES.length,
    statuteCount: STATUTES.length,
    themePalette: {
      ink: c.ink,
      inkDim: c.ink_dim,
      inkFaint: c.ink_faint,
      line: c.line,
      hlBg: c.hl_bg,
      hlInk: c.hl_ink
    }
  };
}

function updateCursor() {
  if (!hoverPos) {
    canvas.style.cursor = 'default';
    return;
  }
  const over = clickables.some(c => isRectHovered(c.rect));
  canvas.style.cursor = over ? 'pointer' : 'default';
}

function roundRect(context, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

function topRoundedRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.arcTo(x + w, y, x + w, y + r, r);
  context.lineTo(x + w, y + h);
  context.lineTo(x, y + h);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

function drawStatusBar(context, x, y, w) {
  const c = colors();
  context.font = '600 12px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText('9:41', x + 30.0, y + STATUS_H - 13.0);

  // Dynamic Island pill
  context.fillStyle = '#000000';
  roundRect(context, x + w / 2 - 46.0, y + 7.0, 92.0, 22.0, 11);
  context.fill();

  // Cellular signal bars
  const baseBottom = y + STATUS_H - 9.0;
  for (let k = 0; k < 4; k++) {
    const barH = 3.5 + k * 1.8;
    context.fillStyle = c.ink;
    roundRect(context, x + w - 92.0 + k * 4.0, baseBottom - barH, 2.5, barH, 1);
    context.fill();
  }

  // Wi-Fi arcs
  const wifiX = x + w - 67.0;
  const wifiY = baseBottom - 1.0;
  context.strokeStyle = c.ink;
  context.lineWidth = 1.25;
  context.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const rad = 2.4 + k * 2.8;
    context.beginPath();
    context.arc(wifiX, wifiY, rad, Math.PI * 1.25, Math.PI * 1.75);
    context.stroke();
  }

  // Battery icon
  const batX = x + w - 50.0;
  const batY = baseBottom - 9.5;
  context.strokeStyle = c.ink_dim;
  context.lineWidth = 1.0;
  roundRect(context, batX, batY, 19.0, 9.5, 2.5);
  context.stroke();
  context.fillStyle = c.ink;
  roundRect(context, batX + 1.8, batY + 1.8, 12.0, 5.9, 1.2);
  context.fill();
  context.fillStyle = c.ink_dim;
  roundRect(context, batX + 20.0, batY + 2.8, 1.8, 4.0, 0.9);
  context.fill();

  context.textBaseline = 'alphabetic';
}

function drawTitleBar(context, x, y, w) {
  const c = colors();
  const centerY = y + TITLE_H / 2.0 - 1.0;

  if (appBarSearchOpen) {
    // Expanded AppBar SearchView (back collapse button + full search pill + clear)
    const backSize = 32.0;
    const backX = x + PAD;
    const backY = centerY - backSize / 2.0;
    const backRect = { x: backX, y: backY, w: backSize, h: backSize };
    const backHovered = isRectHovered(backRect);

    context.fillStyle = backHovered ? c.surface_hover : c.surface;
    roundRect(context, backX, backY, backSize, backSize, 16);
    context.fill();
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();

    const arrCx = backX + backSize / 2.0;
    const arrCy = backY + backSize / 2.0;
    context.beginPath();
    context.moveTo(arrCx + 4.5, arrCy);
    context.lineTo(arrCx - 4.5, arrCy);
    context.moveTo(arrCx - 0.5, arrCy - 4.2);
    context.lineTo(arrCx - 4.5, arrCy);
    context.lineTo(arrCx - 0.5, arrCy + 4.2);
    context.strokeStyle = backHovered ? c.ink : c.ink_dim;
    context.lineWidth = 1.65;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();

    addClickable(backRect, () => closeAppBarSearch({ clearQuery: true }), 'header-search-close');

    const pillX = backX + backSize + 8.0;
    const pillW = Math.max(120.0, x + w - PAD - pillX);
    const pillH = 36.0;
    const pillY = centerY - pillH / 2.0;
    const pillRect = { x: pillX, y: pillY, w: pillW, h: pillH };

    context.fillStyle = c.surface;
    roundRect(context, pillX, pillY, pillW, pillH, 18);
    context.fill();
    context.strokeStyle = searchFocused ? c.green : c.line;
    context.lineWidth = searchFocused ? 1.5 : 1.0;
    context.stroke();

    const icX = pillX + 16.0;
    const icY = centerY;
    context.beginPath();
    context.arc(icX, icY - 1.0, 4.8, 0, Math.PI * 2);
    context.strokeStyle = searchFocused ? c.green : c.ink_faint;
    context.lineWidth = 1.55;
    context.stroke();
    context.beginPath();
    context.moveTo(icX + 3.5, icY + 2.5);
    context.lineTo(icX + 6.8, icY + 5.8);
    context.stroke();

    const hasQuery = query.length > 0;
    activeSearchBox = {
      x: pillX + 32.0,
      y: pillY + 5.0,
      w: pillW - (hasQuery ? 60.0 : 44.0),
      h: 26.0,
      fontSize: 13.0,
      placeholder: 'Charge, section or element'
    };
    drawSearchBoxText(context, c, activeSearchBox);

    addClickable(pillRect, () => focusSearchInput(), 'appbar-search-input');

    if (hasQuery) {
      const clearX = pillX + pillW - 28.0;
      const clearY = pillY + 4.0;
      const clearRect = { x: clearX, y: clearY, w: 24.0, h: 28.0 };
      context.strokeStyle = isRectHovered(clearRect) ? c.ink : c.ink_faint;
      context.lineWidth = 1.6;
      context.lineCap = 'round';
      const clCx = clearX + 12.0;
      const clCy = centerY;
      context.beginPath();
      context.moveTo(clCx - 3.8, clCy - 3.8);
      context.lineTo(clCx + 3.8, clCy + 3.8);
      context.moveTo(clCx + 3.8, clCy - 3.8);
      context.lineTo(clCx - 3.8, clCy + 3.8);
      context.stroke();

      addClickable(clearRect, () => {
        query = '';
        if (searchInput) searchInput.value = '';
        searchScrollY = 0;
        listScrollY = 0;
        focusSearchInput();
      }, 'search-clear');
    }
    return;
  }

  // Standard AppBar with Collapsible Search Action
  drawLogo(context, x + PAD + 14.0, centerY, 27.0, c.green);

  // Right search button aligned cleanly to right margin
  const srch_s = 30.0;
  const srch_x = x + w - PAD - srch_s;
  const srch_y = centerY - srch_s / 2.0;
  const srchRect = { x: srch_x, y: srch_y, w: srch_s, h: srch_s };

  // Title & Subtitle cleanly bounded before search toggle button
  const textX = x + PAD + 33.0;
  const titleMaxW = Math.max(80.0, srch_x - textX - 8.0);
  context.font = `700 ${w < 340.0 ? 16.0 : 18.0}px system-ui, -apple-system, sans-serif`;
  context.fillStyle = c.ink;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillText(truncateToWidth(context, 'Stick the Ticket', titleMaxW), textX, y + 23.0);

  context.font = '700 8px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink_faint;
  context.fillText(truncateToWidth(context, 'ONTARIO POA · FIELD GUIDE', titleMaxW), textX + 0.5, y + 36.5);

  // Collapsible Search Toggle Button
  const srchHovered = isRectHovered(srchRect);
  context.fillStyle = srchHovered ? c.surface_hover : c.surface;
  roundRect(context, srch_x, srch_y, srch_s, srch_s, 15);
  context.fill();
  context.strokeStyle = srchHovered ? c.green : c.line;
  context.lineWidth = 1.0;
  context.stroke();

  const mgCx = srch_x + srch_s / 2.0 - 1.2;
  const mgCy = srch_y + srch_s / 2.0 - 1.2;
  context.beginPath();
  context.arc(mgCx, mgCy, 4.6, 0, Math.PI * 2);
  context.strokeStyle = srchHovered ? c.green : c.ink_dim;
  context.lineWidth = 1.5;
  context.stroke();
  context.beginPath();
  context.moveTo(mgCx + 3.3, mgCy + 3.3);
  context.lineTo(mgCx + 6.3, mgCy + 6.3);
  context.strokeStyle = srchHovered ? c.green : c.ink_dim;
  context.lineWidth = 1.6;
  context.lineCap = 'round';
  context.stroke();

  addClickable(srchRect, () => openAppBarSearch(), 'header-search-toggle');
}

function formatFineAmount(val) {
  if (typeof val !== 'number') return String(val || '');
  return Number.isInteger(val) ? val.toFixed(0) : val.toFixed(2);
}

function truncateToWidth(context, text, maxW) {
  if (!text) return '';
  if (context.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && context.measureText(`${out}…`).width > maxW) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

const highlightPlanCache = new Map();
function getHighlightPlan(rawQuery) {
  const trimmed = (rawQuery || '').trim();
  const key = trimmed.toLowerCase();
  if (!key) return null;
  if (highlightPlanCache.has(key)) return highlightPlanCache.get(key);

  const parsed = parseSearchQuery(trimmed);
  const terms = [];
  const termSeen = new Set();
  const compactTerms = [];
  const compactSeen = new Set();

  const rawSource = parsed.highlightTerms.length > 0 ? parsed.highlightTerms : parsed.contentTokens;
  const multi = rawSource.length > 1;
  const candidateTokens = Array.from(new Set(multi ? rawSource : rawSource.filter(t => t.length >= 2)));

  for (const tok of candidateTokens) {
    const tokClean = normalizeSearchToken(tok);
    if (tokClean.length >= 4 && !compactSeen.has(tokClean)) {
      compactSeen.add(tokClean);
      compactTerms.push(tokClean);
    }
    const requireWholeForTok = tok.length <= 2 || /^\d+$/.test(tok);
    for (const v of expandTokenVariants(tok)) {
      if (!v || (v.length < 2 && !requireWholeForTok)) continue;
      const isShortStem = v.length <= 3 && v !== tokClean;
      const requireWhole = requireWholeForTok || isShortStem;
      const k = `${requireWhole ? '1' : '0'}|${v}`;
      if (!termSeen.has(k)) {
        termSeen.add(k);
        terms.push({ v, requireWhole });
      }
    }
  }

  const plan = { q: parsed.q || key, terms, compactTerms };
  if (highlightPlanCache.size > 300) highlightPlanCache.clear();
  highlightPlanCache.set(key, plan);
  return plan;
}

function drawHighlightedText(context, text, qRaw, x, y, baseColor, highlightColor, highlightBg) {
  if (!text) return 0;
  const plan = getHighlightPlan(qRaw);
  if (!plan || !plan.q) {
    context.fillStyle = baseColor;
    context.fillText(text, x, y);
    return 0;
  }
  const q = plan.q;
  const lower = text.toLowerCase();
  const spans = [];
  const isDigitsOnly = /^\d+$/.test(q);
  let searchFrom = 0;
  while (searchFrom < lower.length) {
    const hit = lower.indexOf(q, searchFrom);
    if (hit === -1) break;
    if (isDigitsOnly) {
      const prev = hit === 0 ? ' ' : lower[hit - 1];
      const next = hit + q.length >= lower.length ? ' ' : lower[hit + q.length];
      if (/[a-z0-9]/.test(prev) || /\d/.test(next)) {
        searchFrom = hit + 1;
        continue;
      }
    }
    spans.push([hit, hit + q.length]);
    searchFrom = hit + q.length;
  }

  if (spans.length === 0) {
    const rawSpans = [];
    for (const { v, requireWhole } of plan.terms) {
      let from = 0;
      while (from < lower.length) {
        const hit = lower.indexOf(v, from);
        if (hit === -1) break;
        const prev = hit === 0 ? ' ' : lower[hit - 1];
        const next = hit + v.length >= lower.length ? ' ' : lower[hit + v.length];
        const okStart = !/[a-z0-9]/.test(prev);
        const okEnd = !requireWhole || !/[a-z0-9]/.test(next);
        if (okStart && okEnd) {
          rawSpans.push([hit, hit + v.length]);
        }
        from = hit + 1;
      }
    }
    if (rawSpans.length === 0 && plan.compactTerms.length > 0) {
      for (const m of text.matchAll(/[a-z0-9]+(?:[-–—/'][a-z0-9]+)+/gi)) {
        const wc = normalizeSearchToken(m[0]);
        if (plan.compactTerms.some(tc => wc === tc || wc.startsWith(tc))) {
          rawSpans.push([m.index, m.index + m[0].length]);
        }
      }
    }
    rawSpans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    for (const sp of rawSpans) {
      if (spans.length === 0 || sp[0] >= spans[spans.length - 1][1]) {
        spans.push(sp);
      }
    }
  }

  if (spans.length === 0) {
    context.fillStyle = baseColor;
    context.fillText(text, x, y);
    return 0;
  }

  let curX = x;
  let pos = 0;
  const metrics = context.measureText('Mg');
  const asc = metrics.actualBoundingBoxAscent || 9.0;
  const desc = metrics.actualBoundingBoxDescent || 2.5;

  for (const [start, end] of spans) {
    if (start > pos) {
      const before = text.slice(pos, start);
      context.fillStyle = baseColor;
      context.fillText(before, curX, y);
      curX += context.measureText(before).width;
    }
    const match = text.slice(start, end);
    const matchW = context.measureText(match).width;
    context.fillStyle = highlightBg;
    roundRect(context, curX - 1.5, y - asc - 1.5, matchW + 3.0, asc + desc + 3.0, 3);
    context.fill();
    if (!isDark) {
      context.strokeStyle = 'rgba(161, 98, 7, 0.42)';
      context.lineWidth = 0.75;
      context.stroke();
    }
    context.fillStyle = highlightColor;
    context.fillText(match, curX, y);
    curX += matchW;
    pos = end;
  }
  if (pos < text.length) {
    context.fillStyle = baseColor;
    context.fillText(text.slice(pos), curX, y);
  }
  return spans.length;
}

function packMetaPills(context, specs, maxWidth) {
  const pillH = 16.5;
  const gapX = 4.0;
  const gapY = 4.0;
  const rows = [];
  let row = [];
  let used = 0;

  context.font = '600 8.5px system-ui, -apple-system, sans-serif';
  for (const spec of specs) {
    const textW = context.measureText(spec.label).width;
    const w = Math.min(maxWidth, Math.ceil(textW + 10.0));
    if (row.length > 0 && used + gapX + w > maxWidth) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += row.length === 0 ? w : gapX + w;
    row.push({ ...spec, w });
  }
  if (row.length > 0) rows.push(row);

  const totalH = rows.length * pillH + Math.max(0, rows.length - 1) * gapY;
  return { rows, pillH, gapX, gapY, totalH };
}

function drawClockIcon(context, cx, cy, color) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1.3;
  context.lineCap = 'round';
  context.beginPath();
  context.arc(cx, cy, 5.2, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(cx, cy - 2.8);
  context.lineTo(cx, cy + 0.2);
  context.lineTo(cx + 2.2, cy + 1.4);
  context.stroke();
  context.restore();
}

function drawPredictiveChipStrip(context, x, y, w, c, queryText) {
  const suggestions = getPredictiveSuggestions(queryText, 5);
  if (suggestions.length === 0) return 0;

  const stripH = 26.0;
  const gap = 5.0;
  let curX = x;
  const maxX = x + w;
  let drawn = 0;

  context.font = '600 10.5px system-ui, -apple-system, sans-serif';
  for (let idx = 0; idx < suggestions.length; idx++) {
    const s = suggestions[idx];
    const isRecent = s.kind === 'recent';
    const isDym = s.kind === 'didyoumean';
    const prefix = isRecent ? '↺ ' : isDym ? 'Did you mean: ' : '';
    const suffix = s.count > 0 ? ` (${s.count})` : '';
    const fullText = `${prefix}${s.label}${suffix}`;
    const pillW = Math.ceil(context.measureText(fullText).width + 16.0);
    if (drawn > 0 && curX + pillW > maxX) continue;
    if (pillW > w && drawn > 0) continue;

    const actualW = Math.min(w, pillW);
    const rect = { x: curX, y, w: actualW, h: stripH };
    const hovered = isRectHovered(rect);

    context.fillStyle = isDym
      ? (hovered ? c.surface_hover : c.green_soft)
      : (hovered ? c.surface_hover : c.surface);
    roundRect(context, rect.x, rect.y, rect.w, rect.h, 13);
    context.fill();
    context.strokeStyle = hovered || isDym ? c.green : c.line;
    context.lineWidth = hovered ? 1.2 : 1.0;
    context.stroke();

    context.fillStyle = isRecent || isDym ? c.green : (hovered ? c.ink : c.ink_dim);
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(truncateToWidth(context, fullText, rect.w - 14.0), rect.x + 8.0, rect.y + rect.h / 2.0 + 0.5);
    context.textBaseline = 'alphabetic';

    addClickable(rect, () => applySearchSuggestion(s.query, { recordHistory: true }), `predict-${idx}`);
    curX += actualW + gap;
    drawn++;
  }

  return drawn > 0 ? stripH + 6.0 : 0;
}

function drawSuggestionPopover(context, x, y, w, maxAvailBottom, c) {
  const headerH = 26.0;
  const rowH = 34.0;
  const bottomPad = 6.0;
  const availH = Math.max(0, maxAvailBottom - y - 6.0);
  const maxRows = Math.min(4, Math.floor((availH - headerH - bottomPad) / rowH));
  if (maxRows < 1) return;

  const items = getPredictiveSuggestions('', maxRows);
  if (items.length === 0) return;

  const popH = headerH + items.length * rowH + bottomPad;
  activeSuggestionPopoverRect = { x, y, w, h: popH };

  // Soft popover shadow
  context.save();
  context.fillStyle = isDark ? 'rgba(0, 0, 0, 0.34)' : 'rgba(18, 22, 28, 0.10)';
  roundRect(context, x, y + 3.0, w, popH, 14);
  context.fill();
  context.restore();

  context.fillStyle = c.surface;
  roundRect(context, x, y, w, popH, 14);
  context.fill();
  context.strokeStyle = c.line;
  context.lineWidth = 1.0;
  context.stroke();

  const hasRecent = recentSearches.length > 0;
  context.font = '700 8.5px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink_faint;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(hasRecent ? 'RECENT & SUGGESTED' : 'SUGGESTED SEARCHES', x + 13.0, y + headerH / 2.0 + 1.0);

  if (hasRecent) {
    const clrW = 42.0;
    const clrRect = { x: x + w - clrW - 6.0, y: y + 3.0, w: clrW, h: headerH - 4.0 };
    context.font = '700 8.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = isRectHovered(clrRect) ? c.ink : c.green;
    context.textAlign = 'right';
    context.fillText('CLEAR', x + w - 12.0, y + headerH / 2.0 + 1.0);
    addClickable(clrRect, () => clearRecentSearches(), 'popover-recent-clear');
  }
  context.textBaseline = 'alphabetic';

  items.forEach((item, idx) => {
    const ry = y + headerH + idx * rowH;
    const isRecent = item.kind === 'recent';
    const remW = isRecent ? 26.0 : 0.0;
    const rowRect = { x: x + 2.0, y: ry, w: w - 4.0 - remW, h: rowH };
    const hovered = isRectHovered(rowRect);

    if (hovered) {
      context.fillStyle = c.surface_hover;
      roundRect(context, x + 4.0, ry + 1.0, w - 8.0, rowH - 2.0, 9);
      context.fill();
    }

    if (idx > 0) {
      context.beginPath();
      context.moveTo(x + 12.0, ry);
      context.lineTo(x + w - 12.0, ry);
      context.strokeStyle = c.line;
      context.lineWidth = 0.7;
      context.stroke();
    }

    const icCx = x + 20.0;
    const icCy = ry + rowH / 2.0;
    if (isRecent) {
      drawClockIcon(context, icCx, icCy, c.green);
    } else {
      context.save();
      context.beginPath();
      context.arc(icCx - 1.0, icCy - 1.0, 4.2, 0, Math.PI * 2);
      context.strokeStyle = c.ink_faint;
      context.lineWidth = 1.3;
      context.stroke();
      context.beginPath();
      context.moveTo(icCx + 2.0, icCy + 2.0);
      context.lineTo(icCx + 4.8, icCy + 4.8);
      context.stroke();
      context.restore();
    }

    const countLabel = `${item.count}`;
    context.font = '600 10px system-ui, -apple-system, sans-serif';
    const countW = context.measureText(countLabel).width;
    const rightSpace = (isRecent ? 32.0 : 14.0) + countW + 8.0;
    const labelMaxW = Math.max(80.0, w - 36.0 - rightSpace);

    context.font = '500 12.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(truncateToWidth(context, item.label, labelMaxW), x + 34.0, icCy + 0.5);

    context.font = '600 10px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_faint;
    context.textAlign = 'right';
    context.fillText(countLabel, x + w - (isRecent ? 32.0 : 12.0), icCy + 0.5);
    context.textBaseline = 'alphabetic';

    addClickable(rowRect, () => applySearchSuggestion(item.query, { recordHistory: true }), `popover-suggestion-${idx}`);

    if (isRecent) {
      const remRect = { x: x + w - 28.0, y: ry + 3.0, w: 24.0, h: rowH - 6.0 };
      const remHovered = isRectHovered(remRect);
      const rx = x + w - 16.0;
      context.strokeStyle = remHovered ? c.ink : c.ink_faint;
      context.lineWidth = 1.4;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(rx - 3.0, icCy - 3.0);
      context.lineTo(rx + 3.0, icCy + 3.0);
      context.moveTo(rx + 3.0, icCy - 3.0);
      context.lineTo(rx - 3.0, icCy + 3.0);
      context.stroke();

      addClickable(remRect, () => removeRecentSearch(item.query), `popover-remove-${idx}`);
    }
  });
}

function drawHomeScreen(context, x, y, w, h) {
  const c = colors();
  const cx = x + w / 2.0;
  const innerW = Math.max(120.0, w - PAD * 2.0);
  const availTop = y + STATUS_H + TITLE_H;
  const availBottom = y + h - NAV_H;
  const availH = availBottom - availTop;

  // Balanced vertical hero stack centered gracefully in available space
  const stackH = 272.0;
  const topY = availTop + Math.max(20.0, (availH - stackH) * 0.44);

  // Hero Clipboard Emblem
  const emblemY = topY + 28.0;
  drawLogo(context, cx, emblemY, 78.0, c.accent);

  // Hero Headlines
  context.font = '700 26px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink;
  context.textAlign = 'center';
  context.fillText('Before the ticket,', cx, emblemY + 62.0);

  context.fillStyle = c.green;
  context.fillText('check the Code.', cx, emblemY + 95.0);

  // Subtitle
  context.font = '13px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink_faint;
  context.fillText('Search POA offences and essential elements.', cx, emblemY + 125.0);

  // Balanced Search Pill directly below hero copy
  const pillW = innerW;
  const pillH = 50.0;
  const pillY = emblemY + 153.0;
  const pillX = cx - pillW / 2.0;
  const pillRect = { x: pillX, y: pillY, w: pillW, h: pillH };
  const pillHovered = isRectHovered(pillRect);

  context.fillStyle = pillHovered ? c.surface_hover : c.surface;
  roundRect(context, pillX, pillY, pillW, pillH, 25);
  context.fill();
  context.strokeStyle = searchFocused ? c.green : c.line;
  context.lineWidth = searchFocused ? 1.5 : 1.15;
  context.stroke();

  // Search icon
  const icX = pillX + 22.0;
  const icY = pillY + pillH / 2.0;
  context.beginPath();
  context.arc(icX, icY - 1.0, 5.5, 0, Math.PI * 2);
  context.strokeStyle = searchFocused ? c.green : c.ink_faint;
  context.lineWidth = 1.6;
  context.stroke();
  context.beginPath();
  context.moveTo(icX + 4.0, icY + 3.0);
  context.lineTo(icX + 8.0, icY + 7.0);
  context.stroke();

  // Position inline input over pill text region
  activeSearchBox = {
    x: pillX + 40.0,
    y: pillY + 11.0,
    w: pillW - 58.0,
    h: 28.0,
    fontSize: 13.5,
    placeholder: 'Offence, section or element'
  };
  drawSearchBoxText(context, c, activeSearchBox);

  addClickable(pillRect, () => focusSearchInput(), 'home-search-pill');

  // Subtle summary + browse/settings shortcut beneath pill
  const metaY = pillY + pillH + 26.0;
  const enabledCodes = AVAILABLE_STATUTE_CODES.filter(code => selectedStatutes.has(code));
  const enabledCount = activeChargeCount();
  let metaLabel;
  let browseLabel;
  let metaAction;
  let metaActionId;

  if (enabledCodes.length === 0) {
    metaLabel = 'No legislation selected  ·  ';
    browseLabel = 'Pick in Settings →';
    metaActionId = 'home-pick-settings';
    metaAction = () => {
      tab = 'settings';
      settingsSubView = null;
      settingsScrollY = 0;
      requestRedraw();
    };
  } else if (enabledCodes.length === 1) {
    metaLabel = `${enabledCount} ${enabledCodes[0]} offences  ·  `;
    browseLabel = 'Browse all →';
    metaActionId = 'home-browse-all';
    metaAction = () => {
      tab = 'charges';
      listScrollY = 0;
      requestRedraw();
    };
  } else {
    metaLabel = `${enabledCount} offences (${enabledCodes.join(' + ')})  ·  `;
    browseLabel = 'Browse all →';
    metaActionId = 'home-browse-all';
    metaAction = () => {
      tab = 'charges';
      listScrollY = 0;
      requestRedraw();
    };
  }

  context.font = '12px system-ui, -apple-system, sans-serif';
  const metaW = context.measureText(metaLabel).width;
  context.font = '600 12px system-ui, -apple-system, sans-serif';
  const browseW = context.measureText(browseLabel).width;
  const totalMetaW = metaW + browseW;
  const startMetaX = cx - totalMetaW / 2.0;

  context.textAlign = 'left';
  context.font = '12px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink_faint;
  context.fillText(metaLabel, startMetaX, metaY);

  context.font = '600 12px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.green;
  context.fillText(browseLabel, startMetaX + metaW, metaY);

  addClickable(
    { x: startMetaX + metaW - 6.0, y: metaY - 16.0, w: browseW + 12.0, h: 24.0 },
    metaAction,
    metaActionId
  );

  // Floating predictive / recent search popover when focused on Home with empty query
  if (searchFocused && !query.trim()) {
    drawSuggestionPopover(context, pillX, pillY + pillH + 6.0, pillW, availBottom, c);
  }
}

const ROW_NAME_OFFSET_X = 76.0;
const rowMeasureCache = new Map();

function measureChargeRow(context, item, rowW, { richSearch = false } = {}) {
  const isStuck = stuck.has(item.id);
  const wKey = Math.round(rowW * 10);
  const cacheKey = `${wKey}|${richSearch ? 1 : 0}|${isStuck ? 1 : 0}|${item.id}|${richSearch ? (item.contextLine || '') : ''}`;
  const cached = rowMeasureCache.get(cacheKey);
  if (cached) return { ...cached, item };

  const rightGutter = isStuck ? 42.0 : 26.0;
  const nameMaxW = Math.max(80.0, rowW - ROW_NAME_OFFSET_X - rightGutter);
  context.font = '600 12.5px system-ui, -apple-system, sans-serif';
  const nameLines = wrapLines(context, item.name, nameMaxW);
  const nameH = nameLines.length * 14.5;

  let measured;
  if (!richSearch) {
    const rowH = Math.max(40.0, 7.0 + nameH + 12.0 + 6.5);
    measured = { item, isStuck, nameLines, nameH, rowH, richSearch: false };
  } else {
    const rawSnippet = item.contextLine || `“${item.shortWording}”`;
    context.font = '11px system-ui, -apple-system, sans-serif';
    const rawSnippetLines = wrapLines(context, rawSnippet, nameMaxW);
    const snippetLines = rawSnippetLines.slice(0, 2);
    if (rawSnippetLines.length > 2) {
      snippetLines[1] = truncateToWidth(context, `${snippetLines[1]} …`, nameMaxW);
    }
    const snippetH = snippetLines.length * 13.5;

    const partTag = item.part.replace(' (Summons Mandatory)', '');
    const statLabel = STATUTE_CONTEXT[item.statute] || item.statute;
    const fineText = typeof item.setFine === 'number'
      ? `Set $${formatFineAmount(item.setFine)} · Total $${formatFineAmount(item.totalPayable)}`
      : String(item.totalPayable || '').replace('Court Summons ', 'Summons ');

    const pillsSpec = [
      { label: `${item.statute} · ${statLabel} · ${partTag}`, tone: 'statute' },
      { label: fineText, tone: 'fine' }
    ];
    if (typeof item.points === 'number') {
      pillsSpec.push({
        label: `${item.points} ${item.points === 1 ? 'pt' : 'pts'}`,
        tone: item.points > 0 ? 'points-accent' : 'points'
      });
    }
    const pillPacked = packMetaPills(context, pillsSpec, nameMaxW);
    const pillsH = pillPacked.totalH;

    const rowH = Math.max(72.0, 8.0 + nameH + 3.0 + snippetH + 5.0 + pillsH + 8.0);
    measured = {
      item,
      isStuck,
      nameLines,
      nameH,
      snippetLines,
      snippetH,
      pillPacked,
      rowH,
      richSearch: true
    };
  }

  if (rowMeasureCache.size > 5000) rowMeasureCache.clear();
  rowMeasureCache.set(cacheKey, measured);
  return measured;
}

function drawScrollbar(context, c, rightEdgeX, viewTop, viewH, scrollY, maxScrollY) {
  if (maxScrollY <= 1 || viewH < 48) return;
  const trackPad = 5.0;
  const trackH = viewH - trackPad * 2.0;
  const contentRatio = viewH / (viewH + maxScrollY);
  const thumbH = Math.max(24.0, Math.min(trackH * 0.85, trackH * contentRatio));
  const thumbY = viewTop + trackPad + (trackH - thumbH) * (scrollY / maxScrollY);
  context.save();
  context.fillStyle = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.36)';
  roundRect(context, rightEdgeX - 5.5, thumbY, 2.8, thumbH, 1.4);
  context.fill();
  context.restore();
}

function drawGroupedChargeList(context, c, measured, groupX, startY, groupW, clipTop, clipBottom, idPrefix, opts = {}) {
  if (measured.length === 0) return 0;
  const groupH = measured.reduce((acc, m) => acc + m.rowH, 0);
  const highlightQuery = opts.highlightQuery || '';
  const hlBg = c.hl_bg;
  const hlInk = c.hl_ink;

  context.save();
  roundRect(context, groupX, startY, groupW, groupH, 12);
  context.clip();

  let rowY = startY;
  for (let i = 0; i < measured.length; i++) {
    const m = measured[i];
    const { item, isStuck, nameLines, rowH } = m;
    if (rowY + rowH >= clipTop && rowY <= clipBottom) {
      const rowRect = { x: groupX, y: rowY, w: groupW, h: rowH };
      const hovered = isRectHovered(rowRect);

      context.fillStyle = hovered ? c.surface_hover : c.surface;
      context.fillRect(groupX, rowY, groupW, rowH);

      if (i > 0) {
        context.beginPath();
        context.moveTo(groupX, rowY + 0.5);
        context.lineTo(groupX + groupW, rowY + 0.5);
        context.strokeStyle = c.line;
        context.lineWidth = 1.0;
        context.stroke();
      }

      // Left column: Section number (auto-sized cleanly to avoid overlapping title) + Statute tag
      const maxBadgeW = ROW_NAME_OFFSET_X - 18.0;
      const sizes = [11.5, 10.0, 9.0, 8.2, 7.6];
      for (const sz of sizes) {
        context.font = `700 ${sz}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        if (context.measureText(item.section).width <= maxBadgeW) break;
      }
      const secText = truncateToWidth(context, item.section, maxBadgeW);
      const badgeTop = m.richSearch
        ? rowY + 21.0
        : rowY + Math.max(17.5, rowH / 2.0 - 2.5);
      context.textAlign = 'left';
      drawHighlightedText(
        context,
        secText,
        highlightQuery,
        groupX + 12.0,
        badgeTop,
        isStuck ? c.green : c.ink,
        hlInk,
        hlBg
      );

      context.font = '700 7.5px system-ui, -apple-system, sans-serif';
      drawHighlightedText(
        context,
        item.statute,
        highlightQuery,
        groupX + 12.0,
        badgeTop + 12.0,
        c.ink_faint,
        hlInk,
        hlBg
      );

      // Middle column: browse compact mode vs richSearch contextual metadata mode
      if (m.richSearch) {
        const nameTop = rowY + 8.0;
        context.font = '600 12.5px system-ui, -apple-system, sans-serif';
        nameLines.forEach((line, idx) => {
          drawHighlightedText(
            context,
            line,
            highlightQuery,
            groupX + ROW_NAME_OFFSET_X,
            nameTop + 10.0 + idx * 14.5,
            c.ink,
            hlInk,
            hlBg
          );
        });

        const snippetTop = nameTop + m.nameH + 3.0;
        context.font = '11px system-ui, -apple-system, sans-serif';
        m.snippetLines.forEach((line, idx) => {
          drawHighlightedText(
            context,
            line,
            highlightQuery,
            groupX + ROW_NAME_OFFSET_X,
            snippetTop + 9.5 + idx * 13.5,
            c.ink_dim,
            hlInk,
            hlBg
          );
        });

        const pillsTop = snippetTop + m.snippetH + 5.0;
        const { rows: pRows, pillH, gapX, gapY } = m.pillPacked;
        pRows.forEach((pRow, rIdx) => {
          let px = groupX + ROW_NAME_OFFSET_X;
          const py = pillsTop + rIdx * (pillH + gapY);
          pRow.forEach(pill => {
            const isAccent = pill.tone === 'points-accent';
            context.fillStyle = isAccent
              ? c.green_soft
              : (isDark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(0, 0, 0, 0.075)');
            roundRect(context, px, py, pill.w, pillH, 5.5);
            context.fill();
            if (isAccent) {
              context.strokeStyle = isDark ? 'rgba(52, 199, 123, 0.30)' : 'rgba(11, 88, 50, 0.35)';
              context.lineWidth = 0.8;
              context.stroke();
            } else if (!isDark) {
              context.strokeStyle = 'rgba(0, 0, 0, 0.14)';
              context.lineWidth = 0.7;
              context.stroke();
            }

            context.font = '600 8.5px system-ui, -apple-system, sans-serif';
            context.fillStyle = isAccent ? c.green : c.ink_dim;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(pill.label, px + pill.w / 2.0, py + pillH / 2.0 + 0.5);
            context.textBaseline = 'alphabetic';
            px += pill.w + gapX;
          });
        });
        context.textAlign = 'left';
      } else {
        context.font = '600 12.5px system-ui, -apple-system, sans-serif';
        context.fillStyle = c.ink;
        nameLines.forEach((line, idx) => {
          context.fillText(line, groupX + ROW_NAME_OFFSET_X, rowY + 17.0 + idx * 14.5);
        });

        const partTag = item.part.replace(' (Summons Mandatory)', '').toUpperCase();
        context.font = '700 7.5px system-ui, -apple-system, sans-serif';
        context.fillStyle = c.ink_faint;
        context.fillText(`${categoryLabel(item.category).toUpperCase()} · ${partTag}`, groupX + ROW_NAME_OFFSET_X, rowY + rowH - 7.0);
      }

      // Right indicators: Clipboard pin (when saved) + chevron
      const midY = rowY + rowH / 2.0;
      if (isStuck) {
        drawLogo(context, groupX + groupW - 30.0, midY, 17.0, c.green);
      }

      const arrX = groupX + groupW - 12.0;
      context.beginPath();
      context.moveTo(arrX - 2.5, midY - 3.8);
      context.lineTo(arrX + 1.8, midY);
      context.lineTo(arrX - 2.5, midY + 3.8);
      context.strokeStyle = hovered ? c.ink : c.ink_faint;
      context.lineWidth = 1.5;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.stroke();

      const visTop = Math.max(clipTop, rowY);
      const visBottom = Math.min(rowY + rowH, clipBottom);
      if (visBottom > visTop) {
        addClickable(
          {
            x: groupX,
            y: visTop,
            w: groupW,
            h: visBottom - visTop
          },
          () => openChargeDetail(item.originalIdx, { replace: idPrefix === 'similar' }),
          `${idPrefix}-${item.id}`
        );
      }
    }
    rowY += rowH;
  }

  context.restore();

  roundRect(context, groupX, startY, groupW, groupH, 12);
  context.strokeStyle = c.line;
  context.lineWidth = 1.0;
  context.stroke();

  return groupH;
}

function justifyChipRow(row, availW, gapX) {
  const natSum = row.reduce((acc, c) => acc + c.natW, 0);
  const gapsW = gapX * Math.max(0, row.length - 1);
  const extra = Math.max(0, availW - natSum - gapsW);
  const baseAdd = Math.floor(extra / row.length);
  let rem = Math.round(extra - baseAdd * row.length);

  // Distribute remainder pixels symmetrically from the wider middle/outer chips
  const order = row
    .map((c, idx) => ({ idx, natW: c.natW }))
    .sort((a, b) => b.natW - a.natW || a.idx - b.idx);
  const bonus = new Array(row.length).fill(0);
  for (let i = 0; i < order.length && rem > 0; i++) {
    bonus[order[i].idx] = 1;
    rem--;
  }

  let used = gapsW;
  return row.map((c, idx) => {
    const w = idx === row.length - 1
      ? Math.max(c.natW, Math.round(availW - used))
      : c.natW + baseAdd + bonus[idx];
    used += w;
    return { ...c, w };
  });
}

function packCategoryChips(context, availW) {
  const categories = [{ id: null, label: 'All' }, ...CATEGORIES.filter(cat => cat.id !== 'all')];
  const splitIdx = Math.ceil(categories.length / 2);
  const rawRows = [categories.slice(0, splitIdx), categories.slice(splitIdx)];
  const chipH = 24.0;
  const gapY = 5.0;

  const tiers = [
    { gapX: 5.0, minPadX: 10.0, minAllW: 34.0, sizes: [10.0, 9.5, 9.2, 8.8, 8.4, 8.0] },
    { gapX: 4.0, minPadX: 8.0, minAllW: 30.0, sizes: [8.8, 8.4, 8.0] }
  ];

  for (const tier of tiers) {
    for (const sz of tier.sizes) {
      context.font = `500 ${sz}px system-ui, -apple-system, sans-serif`;
      const candidateRows = rawRows.map(r =>
        r.map(cat => ({
          ...cat,
          natW: Math.max(cat.id === null ? tier.minAllW : 0, Math.ceil(context.measureText(cat.label).width + tier.minPadX))
        }))
      );
      const fits = candidateRows.every(r => {
        const sumW = r.reduce((acc, c) => acc + c.natW, 0) + tier.gapX * (r.length - 1);
        return sumW <= availW;
      });
      if (fits) {
        const rows = candidateRows.map(r => justifyChipRow(r, availW, tier.gapX));
        return { rows, gapX: tier.gapX, gapY, chipH, fontSize: sz };
      }
    }
  }

  const chosenFontSize = 7.6;
  const fallbackGapX = 3.0;
  context.font = `500 ${chosenFontSize}px system-ui, -apple-system, sans-serif`;
  const measuredRows = rawRows.map(r => {
    const nats = r.map(cat => ({
      ...cat,
      natW: Math.max(cat.id === null ? 28.0 : 0, Math.ceil(context.measureText(cat.label).width + 6.0))
    }));
    const natSum = nats.reduce((acc, c) => acc + c.natW, 0);
    const maxChipsW = Math.max(1.0, availW - fallbackGapX * Math.max(0, nats.length - 1));
    const scale = natSum > maxChipsW ? maxChipsW / natSum : 1.0;
    return nats.map(c => ({ ...c, natW: Math.floor(c.natW * scale) }));
  });
  const rows = measuredRows.map(r => justifyChipRow(r, availW, fallbackGapX));
  return { rows, gapX: fallbackGapX, gapY, chipH, fontSize: chosenFontSize };
}

function drawDidYouMeanPills(context, cx, startY, maxW, c, items) {
  if (!items || items.length === 0) return 0;
  const pillH = 28.0;
  const gapX = 6.0;
  const gapY = 6.0;
  context.font = '600 11.5px system-ui, -apple-system, sans-serif';
  const rows = [];
  let row = [];
  let rowW = 0;
  items.forEach((item, idx) => {
    const label = `${item.label} (${item.count})`;
    const pw = Math.min(maxW, Math.ceil(context.measureText(label).width + 20.0));
    if (row.length > 0 && rowW + gapX + pw > maxW) {
      rows.push({ items: row, w: rowW });
      row = [];
      rowW = 0;
    }
    rowW += row.length === 0 ? pw : gapX + pw;
    row.push({ item, idx, label, w: pw });
  });
  if (row.length > 0) rows.push({ items: row, w: rowW });

  let py = startY;
  for (const r of rows) {
    let px = cx - r.w / 2.0;
    for (const p of r.items) {
      const rect = { x: px, y: py, w: p.w, h: pillH };
      const hov = isRectHovered(rect);
      context.fillStyle = hov ? c.surface_hover : c.green_soft;
      roundRect(context, rect.x, rect.y, rect.w, rect.h, 14);
      context.fill();
      context.strokeStyle = c.green;
      context.lineWidth = hov ? 1.3 : 1.0;
      context.stroke();
      context.font = '600 11.5px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.green;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(truncateToWidth(context, p.label, rect.w - 14.0), rect.x + rect.w / 2.0, rect.y + rect.h / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      addClickable(rect, () => applySearchSuggestion(p.item.query, { recordHistory: true }), `empty-didyoumean-${p.idx}`);
      px += p.w + gapX;
    }
    py += pillH + gapY;
  }
  return rows.length * (pillH + gapY);
}

function drawSearchFacetBar(context, x, y, w, c) {
  const specs = [
    { id: 'all', label: 'All' },
    { id: 'part3', label: 'Part III · Summons' },
    { id: 'points', label: 'Demerit pts' },
    { id: 'part1', label: 'Part I' }
  ];
  const pillH = 24.0;
  const gapX = 5.0;
  let chosenSize = 8.5;
  let fitted = null;

  for (const sz of [10.0, 9.5, 9.0, 8.5]) {
    context.font = `600 ${sz}px system-ui, -apple-system, sans-serif`;
    const cand = specs.map(sp => ({
      ...sp,
      natW: Math.ceil(context.measureText(sp.label).width + 13.0)
    }));
    const sumW = cand.reduce((acc, it) => acc + it.natW, 0) + gapX * (cand.length - 1);
    if (sumW <= w) {
      chosenSize = sz;
      fitted = justifyChipRow(cand, w, gapX);
      break;
    }
  }
  if (!fitted) {
    context.font = `600 ${chosenSize}px system-ui, -apple-system, sans-serif`;
    const cand = specs.map(sp => ({
      ...sp,
      natW: Math.ceil(context.measureText(sp.label).width + 8.0)
    }));
    const sumNat = cand.reduce((acc, it) => acc + it.natW, 0);
    const maxW = Math.max(1.0, w - gapX * (cand.length - 1));
    const scale = sumNat > maxW ? maxW / sumNat : 1.0;
    fitted = justifyChipRow(cand.map(it => ({ ...it, natW: Math.floor(it.natW * scale) })), w, gapX);
  }

  let px = x;
  for (const f of fitted) {
    const isSel = searchFacet === f.id;
    const rect = { x: px, y, w: f.w, h: pillH };
    const hov = isRectHovered(rect);
    context.fillStyle = isSel
      ? (f.id === 'all' ? c.ink : c.green)
      : (hov ? c.surface_hover : c.surface);
    roundRect(context, rect.x, rect.y, rect.w, rect.h, 12);
    context.fill();
    if (!isSel) {
      context.strokeStyle = c.line;
      context.lineWidth = 1.0;
      context.stroke();
    }
    context.font = `600 ${chosenSize}px system-ui, -apple-system, sans-serif`;
    context.fillStyle = isSel
      ? (f.id === 'all' ? c.screen : '#ffffff')
      : (hov ? c.ink : c.ink_dim);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(truncateToWidth(context, f.label, Math.max(8.0, rect.w - 6.0)), rect.x + rect.w / 2.0, rect.y + rect.h / 2.0 + 0.5);
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    addClickable(rect, () => setSearchFacet(f.id), `facet-${f.id}`);
    px += f.w + gapX;
  }

  return pillH + 6.0;
}

function drawChargesScreen(context, x, y, w, h, stuckOnly = false) {
  const c = colors();
  const innerW = w - PAD * 2.0;
  const listBottom = y + h - NAV_H - 6.0;
  let curY = y + STATUS_H + TITLE_H + 2.0;
  let searchBoxBottom = curY;

  const trimmedQuery = query.trim();
  const trimmedSavedQuery = savedQuery.trim();
  const hasActiveSearch = !stuckOnly && trimmedQuery.length > 0;
  const hasSavedSearch = stuckOnly && stuck.size > 0 && trimmedSavedQuery.length > 0;
  const hasRichSearch = stuckOnly ? hasSavedSearch : hasActiveSearch;
  const highlightQ = stuckOnly ? trimmedSavedQuery : (hasActiveSearch ? trimmedQuery : '');

  if (!stuckOnly) {
    // Search Box
    const sBoxW = innerW;
    const sBoxH = 38.0;
    const sBoxX = x + PAD;
    const sBoxRect = { x: sBoxX, y: curY, w: sBoxW, h: sBoxH };

    context.fillStyle = c.surface;
    roundRect(context, sBoxX, curY, sBoxW, sBoxH, 11);
    context.fill();
    context.strokeStyle = searchFocused ? c.green : c.line;
    context.lineWidth = searchFocused ? 1.5 : 1.0;
    context.stroke();

    const icX = sBoxX + 17.0;
    const icY = curY + sBoxH / 2.0;
    context.beginPath();
    context.arc(icX, icY - 1.0, 5.2, 0, Math.PI * 2);
    context.strokeStyle = searchFocused ? c.green : c.ink_dim;
    context.lineWidth = 1.6;
    context.stroke();
    context.beginPath();
    context.moveTo(icX + 3.8, icY + 2.8);
    context.lineTo(icX + 7.5, icY + 6.5);
    context.stroke();

    const hasQuery = query.length > 0;
    activeSearchBox = {
      x: sBoxX + 34.0,
      y: curY + 6.0,
      w: sBoxW - (hasQuery ? 64.0 : 46.0),
      h: 26.0,
      fontSize: 13.0,
      placeholder: 'Search charge, # or element'
    };
    drawSearchBoxText(context, c, activeSearchBox);

    addClickable(sBoxRect, () => focusSearchInput(), 'charges-search-box');

    if (hasQuery) {
      const clearX = sBoxX + sBoxW - 30.0;
      const clearY = curY + 5.0;
      const clearRect = { x: clearX, y: clearY, w: 24.0, h: 28.0 };
      context.strokeStyle = isRectHovered(clearRect) ? c.ink : c.ink_faint;
      context.lineWidth = 1.6;
      context.lineCap = 'round';
      const cx = clearX + 12.0;
      const cy = curY + sBoxH / 2.0;
      context.beginPath();
      context.moveTo(cx - 4.0, cy - 4.0);
      context.lineTo(cx + 4.0, cy + 4.0);
      context.moveTo(cx + 4.0, cy - 4.0);
      context.lineTo(cx - 4.0, cy + 4.0);
      context.stroke();

      addClickable(clearRect, () => {
        query = '';
        if (searchInput) searchInput.value = '';
        listScrollY = 0;
        focusSearchInput();
      }, 'search-clear');
    }

    curY += sBoxH + 8.0;
    searchBoxBottom = curY - 1.0;

    // Predictive completions directly under inline search bar while typing
    if (hasActiveSearch) {
      const stripUsed = drawPredictiveChipStrip(context, x + PAD, curY, innerW, c, trimmedQuery);
      curY += stripUsed;
    }

    // Balanced 2-row Quick-Link Category Chips aligned flush with search box
    const { rows: chipRows, gapX, gapY, chipH, fontSize } = packCategoryChips(context, innerW);
    for (const row of chipRows) {
      let chipX = x + PAD;
      for (const cat of row) {
        const isSel = (cat.id === null && filter === null) || filter === cat.id;
        const chipRect = { x: chipX, y: curY, w: cat.w, h: chipH };
        const hovered = isRectHovered(chipRect);

        context.fillStyle = isSel ? c.ink : hovered ? c.surface_hover : c.surface;
        roundRect(context, chipX, curY, cat.w, chipH, chipH / 2.0);
        context.fill();
        if (!isSel) {
          context.strokeStyle = c.line;
          context.lineWidth = 1.0;
          context.stroke();
        }

        context.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
        context.fillStyle = isSel ? c.screen : hovered ? c.ink : c.ink_dim;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(truncateToWidth(context, cat.label, Math.max(8.0, cat.w - 4.0)), chipX + cat.w / 2.0, curY + chipH / 2.0 + 0.5);
        context.textBaseline = 'alphabetic';

        addClickable(chipRect, () => {
          if (cat.id === null) {
            filter = null;
          } else {
            filter = filter === cat.id ? null : cat.id;
          }
          listScrollY = 0;
          requestRedraw();
        }, `chip-${cat.id ?? 'all'}`);

        chipX += cat.w + gapX;
      }
      curY += chipH + gapY;
    }
    curY += 1.0;
  } else if (stuck.size > 0) {
    // Dedicated Saved Tickets search pill (independent of main POA query)
    const sBoxW = innerW;
    const sBoxH = 36.0;
    const sBoxX = x + PAD;
    const sBoxRect = { x: sBoxX, y: curY, w: sBoxW, h: sBoxH };

    context.fillStyle = c.surface;
    roundRect(context, sBoxX, curY, sBoxW, sBoxH, 11);
    context.fill();
    context.strokeStyle = searchFocused ? c.green : c.line;
    context.lineWidth = searchFocused ? 1.5 : 1.0;
    context.stroke();

    const icX = sBoxX + 16.0;
    const icY = curY + sBoxH / 2.0;
    context.beginPath();
    context.arc(icX, icY - 1.0, 5.0, 0, Math.PI * 2);
    context.strokeStyle = searchFocused ? c.green : c.ink_dim;
    context.lineWidth = 1.6;
    context.stroke();
    context.beginPath();
    context.moveTo(icX + 3.6, icY + 2.6);
    context.lineTo(icX + 7.2, icY + 6.2);
    context.stroke();

    const hasSavedQ = savedQuery.length > 0;
    activeSearchBox = {
      x: sBoxX + 33.0,
      y: curY + 5.0,
      w: sBoxW - (hasSavedQ ? 62.0 : 45.0),
      h: 26.0,
      fontSize: 12.5,
      placeholder: 'Search saved tickets'
    };
    drawSearchBoxText(context, c, activeSearchBox);
    addClickable(sBoxRect, () => focusSearchInput(), 'saved-search-box');

    if (hasSavedQ) {
      const clearX = sBoxX + sBoxW - 30.0;
      const clearY = curY + 4.0;
      const clearRect = { x: clearX, y: clearY, w: 24.0, h: 28.0 };
      context.strokeStyle = isRectHovered(clearRect) ? c.ink : c.ink_faint;
      context.lineWidth = 1.6;
      context.lineCap = 'round';
      const cx = clearX + 12.0;
      const cy = curY + sBoxH / 2.0;
      context.beginPath();
      context.moveTo(cx - 4.0, cy - 4.0);
      context.lineTo(cx + 4.0, cy + 4.0);
      context.moveTo(cx + 4.0, cy - 4.0);
      context.lineTo(cx - 4.0, cy + 4.0);
      context.stroke();

      addClickable(clearRect, () => {
        savedQuery = '';
        savedScrollY = 0;
        if (searchInput) searchInput.value = '';
        focusSearchInput();
      }, 'saved-search-clear');
    }

    curY += sBoxH + 8.0;
  }

  // Caption row with count, Part/Demerits facet cycle, and Sort toggle
  const listItems = visibleCharges(stuckOnly);
  const enabledCodes = AVAILABLE_STATUTE_CODES.filter(code => selectedStatutes.has(code));
  const headY = curY;
  context.font = '700 9.5px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink_faint;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  const allLabel = enabledCodes.length === 0
    ? 'NO LEGISLATION SELECTED'
    : enabledCodes.length === 1
      ? `ALL ${enabledCodes[0]} CHARGES`
      : `ALL ${enabledCodes.join(' + ')} CHARGES`;
  const facetSuffix = !stuckOnly && searchFacet !== 'all'
    ? (searchFacet === 'part3' ? ' · SUMMONS' : searchFacet === 'points' ? ' · DEMERITS' : ' · PART I')
    : '';
  const caption = stuckOnly
    ? `SAVED${hasSavedSearch ? ' MATCHES' : ''}  ·  ${listItems.length}`
    : hasActiveSearch
      ? `${filter ? categoryLabel(filter).toUpperCase() : 'MATCHES'}${facetSuffix}  ·  ${listItems.length}`
      : `${filter ? categoryLabel(filter).toUpperCase() : allLabel}${facetSuffix}  ·  ${listItems.length}`;

  const sortW = stuckOnly ? 82.0 : 76.0;
  const sortH = 21.0;
  const sortX = x + w - PAD - sortW;
  const sortY = headY + 1.5;
  const facetW = 72.0;
  const controlsW = !stuckOnly ? (sortW + 5.0 + facetW + 8.0) : (sortW + 8.0);
  context.fillText(truncateToWidth(context, caption, Math.max(70.0, innerW - controlsW)), x + PAD, headY + 12.0);

  if (!stuckOnly) {
    const facetX = sortX - 5.0 - facetW;
    const facetY = headY + 1.5;
    const facetRect = { x: facetX, y: facetY, w: facetW, h: sortH };
    const facetHovered = isRectHovered(facetRect);
    const facetActive = searchFacet !== 'all';

    context.fillStyle = facetActive ? c.green_soft : (facetHovered ? c.surface_hover : c.surface);
    roundRect(context, facetX, facetY, facetW, sortH, 8.5);
    context.fill();
    context.strokeStyle = facetActive || facetHovered ? c.green : c.line;
    context.lineWidth = facetActive ? 1.15 : 1.0;
    context.stroke();

    const facetLabel =
      searchFacet === 'part3' ? 'SUMMONS'
      : searchFacet === 'points' ? 'DEMERITS'
      : searchFacet === 'part1' ? 'PART I'
      : 'ALL PARTS';
    context.font = '700 8.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = facetActive ? c.green : (facetHovered ? c.ink : c.ink_dim);
    context.textAlign = 'center';
    context.fillText(facetLabel, facetX + facetW / 2.0, facetY + sortH / 2.0 + 0.5);

    addClickable(facetRect, () => {
      const nextFacet =
        searchFacet === 'all' ? 'part3'
        : searchFacet === 'part3' ? 'points'
        : searchFacet === 'points' ? 'part1'
        : 'all';
      setSearchFacet(nextFacet);
    }, 'facet-toggle');
  }

  const sortRect = { x: sortX, y: sortY, w: sortW, h: sortH };
  const sortHovered = isRectHovered(sortRect);

  context.fillStyle = sortHovered ? c.surface_hover : c.surface;
  roundRect(context, sortX, sortY, sortW, sortH, 8.5);
  context.fill();
  context.strokeStyle = c.line;
  context.lineWidth = 1.0;
  context.stroke();

  const sortLabel = hasRichSearch
    ? (searchSort === 'relevance' ? 'BEST MATCH' : searchSort === 'number' ? 'BY NUMBER' : 'BY NAME')
    : (sort === 'number' ? 'BY NUMBER' : 'BY NAME');
  context.font = '700 8.5px system-ui, -apple-system, sans-serif';
  context.fillStyle = sortHovered ? c.ink : c.ink_dim;
  context.textAlign = 'center';
  context.fillText(sortLabel, sortX + sortW / 2.0, sortY + sortH / 2.0 + 0.5);
  context.textBaseline = 'alphabetic';

  addClickable(sortRect, () => {
    if (hasRichSearch) {
      searchSort = searchSort === 'relevance' ? 'number' : searchSort === 'number' ? 'name' : 'relevance';
      if (stuckOnly) savedScrollY = 0;
      else listScrollY = 0;
    } else {
      sort = sort === 'number' ? 'name' : 'number';
      if (stuckOnly) savedScrollY = 0;
      else listScrollY = 0;
      persistActiveWorkspace();
    }
    requestRedraw();
  }, 'sort-toggle');

  curY += 26.0;

  // Scroll viewport
  const maxListH = Math.max(80.0, listBottom - curY);

  if (listItems.length === 0) {
    if (stuckOnly) maxSavedScrollY = 0;
    else maxListScrollY = 0;

    const noStatutes = !stuckOnly && selectedStatutes.size === 0;

    if (stuckOnly) {
      const hasSaved = stuck.size > 0;
      const cy = curY + Math.min(100.0, maxListH * 0.42);
      drawLogo(context, x + w / 2.0, cy - 28.0, 48.0, c.line, 0.42);
      context.font = '600 13.5px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_dim;
      context.textAlign = 'center';
      context.fillText(hasSaved ? 'No saved charge matches' : 'Nothing saved yet', x + w / 2.0, cy + 18.0);
      context.font = '12px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_faint;
      context.fillText(
        hasSaved ? 'Try another section, charge or element keyword' : 'Open a charge and tap Save to pin it here',
        x + w / 2.0,
        cy + 38.0
      );

      const btnW = 148.0;
      const btnH = 34.0;
      const btnX = x + (w - btnW) / 2.0;
      const btnY = cy + 56.0;
      const btnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
      context.fillStyle = isRectHovered(btnRect) ? c.surface_hover : c.surface;
      roundRect(context, btnX, btnY, btnW, btnH, 17);
      context.fill();
      context.strokeStyle = c.line;
      context.lineWidth = 1.0;
      context.stroke();
      context.font = '600 12px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.green;
      context.textBaseline = 'middle';
      context.fillText(hasSaved ? 'Clear saved filter' : 'Browse POA Code', x + w / 2.0, btnY + btnH / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      addClickable(btnRect, () => {
        if (hasSaved) {
          savedQuery = '';
          savedScrollY = 0;
          if (searchInput && isSavedSearchContext()) searchInput.value = '';
          requestRedraw();
        } else {
          tab = 'charges';
          requestRedraw();
        }
      }, hasSaved ? 'saved-empty-clear' : 'empty-browse-poa');
    } else if (noStatutes) {
      const cy = curY + Math.min(100.0, maxListH * 0.42);
      drawLogo(context, x + w / 2.0, cy - 28.0, 48.0, c.line, 0.42);
      context.font = '600 13.5px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_dim;
      context.textAlign = 'center';
      context.fillText('No POA legislation selected', x + w / 2.0, cy + 18.0);
      context.font = '12px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_faint;
      context.fillText('Enable HTA or pick acts in Settings to search', x + w / 2.0, cy + 38.0);

      const btnH = 34.0;
      const btnY = cy + 56.0;
      const w1 = 114.0;
      const w2 = 122.0;
      const gap = 8.0;
      const startX = x + (w - w1 - gap - w2) / 2.0;

      const r1 = { x: startX, y: btnY, w: w1, h: btnH };
      context.fillStyle = isRectHovered(r1) ? c.accent : c.green;
      roundRect(context, r1.x, r1.y, r1.w, r1.h, 17);
      context.fill();
      context.font = '600 12px system-ui, -apple-system, sans-serif';
      context.fillStyle = '#ffffff';
      context.textBaseline = 'middle';
      context.fillText('Enable HTA', r1.x + r1.w / 2.0, r1.y + r1.h / 2.0 + 0.5);
      addClickable(r1, () => enableStatuteCode('HTA'), 'empty-enable-hta');

      const r2 = { x: startX + w1 + gap, y: btnY, w: w2, h: btnH };
      context.fillStyle = isRectHovered(r2) ? c.surface_hover : c.surface;
      roundRect(context, r2.x, r2.y, r2.w, r2.h, 17);
      context.fill();
      context.strokeStyle = c.line;
      context.lineWidth = 1.0;
      context.stroke();
      context.fillStyle = c.ink;
      context.fillText('Open Settings', r2.x + r2.w / 2.0, r2.y + r2.h / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      addClickable(r2, () => {
        tab = 'settings';
        settingsSubView = null;
        settingsScrollY = 0;
        requestRedraw();
      }, 'empty-open-settings');
    } else {
      const unfilteredCatCount = filter !== null ? visibleCharges(false, { ignoreCategoryFilter: true }).length : 0;
      const unfilteredFacetCount = searchFacet !== 'all' ? visibleCharges(false, { ignoreFacet: true }).length : 0;
      const dym = trimmedQuery.length > 0 && unfilteredCatCount === 0 && unfilteredFacetCount === 0
        ? getDidYouMeanSuggestions(trimmedQuery, 3, searchFacet)
        : [];

      const cy = curY + Math.min(82.0, maxListH * 0.30);
      drawLogo(context, x + w / 2.0, cy - 26.0, 44.0, c.line, 0.42);
      context.font = '600 13.5px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_dim;
      context.textAlign = 'center';

      let headline = 'No charge matches that';
      let subtitle = dym.length > 0 ? 'Did you mean one of these?' : 'Try a section, charge or element';
      if (filter !== null && unfilteredCatCount > 0) {
        headline = `0 matches in ${categoryLabel(filter)}`;
        subtitle = `${unfilteredCatCount} match${unfilteredCatCount === 1 ? '' : 'es'} in other HTA categories`;
      } else if (searchFacet !== 'all' && unfilteredFacetCount > 0) {
        const fName = searchFacet === 'part3' ? 'Summons' : searchFacet === 'points' ? 'Demerit pts' : 'Part I';
        headline = `0 matches under ${fName}`;
        subtitle = `${unfilteredFacetCount} match${unfilteredFacetCount === 1 ? '' : 'es'} across all POA parts`;
      }

      context.fillText(truncateToWidth(context, headline, innerW), x + w / 2.0, cy + 16.0);
      context.font = '12px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_faint;
      context.fillText(truncateToWidth(context, subtitle, innerW), x + w / 2.0, cy + 35.0);

      let btnY = cy + 52.0;
      if (filter !== null && unfilteredCatCount > 0) {
        const label = `Search all categories (${unfilteredCatCount})`;
        context.font = '600 12px system-ui, -apple-system, sans-serif';
        const bw = Math.min(innerW, Math.max(166.0, Math.ceil(context.measureText(label).width + 28.0)));
        const bh = 32.0;
        const br = { x: x + (w - bw) / 2.0, y: btnY, w: bw, h: bh };
        context.fillStyle = isRectHovered(br) ? c.accent : c.green;
        roundRect(context, br.x, br.y, br.w, br.h, 16);
        context.fill();
        context.fillStyle = '#ffffff';
        context.textBaseline = 'middle';
        context.fillText(label, x + w / 2.0, br.y + bh / 2.0 + 0.5);
        context.textBaseline = 'alphabetic';
        addClickable(br, () => {
          filter = null;
          listScrollY = 0;
          requestRedraw();
        }, 'empty-all-categories');
        btnY += bh + 8.0;
      } else if (searchFacet !== 'all' && unfilteredFacetCount > 0) {
        const label = `Show all parts (${unfilteredFacetCount})`;
        context.font = '600 12px system-ui, -apple-system, sans-serif';
        const bw = Math.min(innerW, Math.max(146.0, Math.ceil(context.measureText(label).width + 28.0)));
        const bh = 32.0;
        const br = { x: x + (w - bw) / 2.0, y: btnY, w: bw, h: bh };
        context.fillStyle = isRectHovered(br) ? c.accent : c.green;
        roundRect(context, br.x, br.y, br.w, br.h, 16);
        context.fill();
        context.fillStyle = '#ffffff';
        context.textBaseline = 'middle';
        context.fillText(label, x + w / 2.0, br.y + bh / 2.0 + 0.5);
        context.textBaseline = 'alphabetic';
        addClickable(br, () => setSearchFacet('all'), 'empty-all-facets');
        btnY += bh + 8.0;
      } else if (dym.length > 0) {
        btnY += drawDidYouMeanPills(context, x + w / 2.0, btnY, innerW, c, dym) + 2.0;
      }

      if (trimmedQuery.length > 0 && btnY + 32.0 <= listBottom) {
        const cw = 116.0;
        const ch = 32.0;
        const cr = { x: x + (w - cw) / 2.0, y: btnY, w: cw, h: ch };
        context.fillStyle = isRectHovered(cr) ? c.surface_hover : c.surface;
        roundRect(context, cr.x, cr.y, cw, ch, 16);
        context.fill();
        context.strokeStyle = c.line;
        context.lineWidth = 1.0;
        context.stroke();
        context.font = '600 12px system-ui, -apple-system, sans-serif';
        context.fillStyle = c.green;
        context.textBaseline = 'middle';
        context.fillText('Clear search', x + w / 2.0, cr.y + ch / 2.0 + 0.5);
        context.textBaseline = 'alphabetic';
        addClickable(cr, () => {
          query = '';
          if (searchInput) searchInput.value = '';
          listScrollY = 0;
          focusSearchInput();
        }, 'search-empty-clear');
      }
    }
  } else {
    // Measure every row dynamically before drawing so nothing truncates or collides
    const rowW = innerW;
    const rowX = x + PAD;
    const measured = listItems.map(item =>
      measureChargeRow(context, item, rowW, { richSearch: hasRichSearch })
    );
    const groupH = measured.reduce((acc, m) => acc + m.rowH, 0);
    const totalH = groupH + 8.0;

    const maxScroll = Math.max(0, totalH - maxListH);
    if (stuckOnly) {
      maxSavedScrollY = maxScroll;
      savedScrollY = Math.min(savedScrollY, maxSavedScrollY);
    } else {
      maxListScrollY = maxScroll;
      listScrollY = Math.min(listScrollY, maxListScrollY);
    }

    const activeScroll = stuckOnly ? savedScrollY : listScrollY;

    context.save();
    context.beginPath();
    context.rect(x, curY, w, maxListH);
    context.clip();

    drawGroupedChargeList(context, c, measured, rowX, curY - activeScroll, rowW, curY, listBottom, 'charge', {
      highlightQuery: highlightQ
    });

    context.restore();
    drawScrollbar(context, c, x + w, curY, maxListH, activeScroll, maxScroll);
  }

  // Floating recent & suggested searches popover when inline POA Code box is focused and empty
  if (!stuckOnly && searchFocused && !trimmedQuery) {
    drawSuggestionPopover(context, x + PAD, searchBoxBottom, innerW, listBottom, c);
  }
}

function drawAppBarSearchScreen(context, x, y, w, h) {
  const c = colors();
  const innerW = w - PAD * 2.0;
  const listBottom = y + h - NAV_H - 6.0;
  let curY = y + STATUS_H + TITLE_H + 4.0;
  const trimmedQuery = query.trim();

  if (trimmedQuery.length === 0) {
    // Zero-query AppBar Search Screen: Recent Searches + Popular Topics + Browse by Statute
    const maxViewH = Math.max(80.0, listBottom - curY);
    const starterList = [
      ...POPULAR_QUERIES,
      'Handheld phone',
      'Move over',
      'School bus',
      '15 cm of curb',
      'Liftable axle',
      'Unsafe vehicle',
      'Rolling stop',
      'Expired sticker'
    ];

    // Measure stacked starter pills
    const pillH = 26.0;
    const pillGap = 6.0;
    const starterRows = [];
    let sRow = [];
    let sUsed = 0;
    context.font = '500 11px system-ui, -apple-system, sans-serif';
    starterList.forEach((term, idx) => {
      const pw = Math.ceil(context.measureText(term).width + 18.0);
      if (sRow.length > 0 && sUsed + pillGap + pw > innerW) {
        starterRows.push(sRow);
        sRow = [];
        sUsed = 0;
      }
      sUsed += sRow.length === 0 ? pw : pillGap + pw;
      sRow.push({ term, idx, w: Math.min(innerW, pw) });
    });
    if (sRow.length > 0) starterRows.push(sRow);

    const recentHeaderH = 24.0;
    const recentRowH = 38.0;
    const recentCardH = recentSearches.length > 0 ? recentSearches.length * recentRowH : 44.0;
    const starterHeaderH = 24.0;
    const starterGridH = starterRows.length * (pillH + pillGap) - pillGap;
    const statHeaderH = 24.0;
    const statRowH = 44.0;
    const statCardH = STATUTES.length * statRowH;

    const totalH =
      recentHeaderH +
      recentCardH +
      16.0 +
      starterHeaderH +
      starterGridH +
      16.0 +
      statHeaderH +
      statCardH +
      12.0;

    maxSearchScrollY = Math.max(0, totalH - maxViewH);
    searchScrollY = Math.min(searchScrollY, maxSearchScrollY);

    context.save();
    context.beginPath();
    context.rect(x, curY, w, maxViewH);
    context.clip();

    let ry = curY - searchScrollY;

    // 1. Recent Searches Header & Card
    context.font = '700 9.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_faint;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText('RECENT SEARCHES', x + PAD, ry + 11.0);

    if (recentSearches.length > 0) {
      const clrW = 48.0;
      const clrRect = { x: x + w - PAD - clrW, y: ry, w: clrW, h: 22.0 };
      context.fillStyle = isRectHovered(clrRect) ? c.ink : c.green;
      context.textAlign = 'right';
      context.fillText('CLEAR', x + w - PAD, ry + 11.0);
      addClickable(clrRect, () => clearRecentSearches(), 'recent-clear');
    }
    context.textBaseline = 'alphabetic';
    ry += recentHeaderH;

    if (recentSearches.length === 0) {
      context.fillStyle = c.surface;
      roundRect(context, x + PAD, ry, innerW, recentCardH, 12);
      context.fill();
      context.strokeStyle = c.line;
      context.lineWidth = 1.0;
      context.stroke();

      context.font = '12px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_faint;
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText('Recent queries appear here for quick one-tap reuse.', x + PAD + 14.0, ry + recentCardH / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      ry += recentCardH;
    } else {
      context.save();
      roundRect(context, x + PAD, ry, innerW, recentCardH, 12);
      context.clip();

      recentSearches.forEach((term, idx) => {
        const itemY = ry + idx * recentRowH;
        const count = countMatchesForQuery(term);
        const mainRect = { x: x + PAD, y: itemY, w: innerW - 32.0, h: recentRowH };
        const hovered = isRectHovered(mainRect);

        context.fillStyle = hovered ? c.surface_hover : c.surface;
        context.fillRect(x + PAD, itemY, innerW, recentRowH);
        if (idx > 0) {
          context.beginPath();
          context.moveTo(x + PAD, itemY + 0.5);
          context.lineTo(x + PAD + innerW, itemY + 0.5);
          context.strokeStyle = c.line;
          context.lineWidth = 1.0;
          context.stroke();
        }

        const midY = itemY + recentRowH / 2.0;
        drawClockIcon(context, x + PAD + 17.0, midY, c.green);

        context.font = '500 12.5px system-ui, -apple-system, sans-serif';
        context.fillStyle = c.ink;
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillText(truncateToWidth(context, term, innerW - 118.0), x + PAD + 32.0, midY + 0.5);

        context.font = '600 10px system-ui, -apple-system, sans-serif';
        context.fillStyle = c.ink_faint;
        context.textAlign = 'right';
        context.fillText(`${count} match${count === 1 ? '' : 'es'}`, x + PAD + innerW - 34.0, midY + 0.5);
        context.textBaseline = 'alphabetic';

        const visTop = Math.max(curY, itemY);
        const visBottom = Math.min(itemY + recentRowH, listBottom);
        if (visBottom > visTop) {
          addClickable(
            { x: mainRect.x, y: visTop, w: mainRect.w, h: visBottom - visTop },
            () => applySearchSuggestion(term, { recordHistory: true }),
            `recent-item-${idx}`
          );
        }

        const remRect = { x: x + PAD + innerW - 30.0, y: itemY, w: 30.0, h: recentRowH };
        const rx = x + PAD + innerW - 15.0;
        context.strokeStyle = isRectHovered(remRect) ? c.ink : c.ink_faint;
        context.lineWidth = 1.45;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(rx - 3.3, midY - 3.3);
        context.lineTo(rx + 3.3, midY + 3.3);
        context.moveTo(rx + 3.3, midY - 3.3);
        context.lineTo(rx - 3.3, midY + 3.3);
        context.stroke();

        if (visBottom > visTop) {
          addClickable(
            { x: remRect.x, y: visTop, w: remRect.w, h: visBottom - visTop },
            () => removeRecentSearch(term),
            `recent-remove-${idx}`
          );
        }
      });

      context.restore();
      roundRect(context, x + PAD, ry, innerW, recentCardH, 12);
      context.strokeStyle = c.line;
      context.lineWidth = 1.0;
      context.stroke();

      ry += recentCardH;
    }

    ry += 16.0;

    // 2. Suggested Topics & Officer Keywords
    context.font = '700 9.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_faint;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText('SUGGESTED TOPICS & SHORTCUTS', x + PAD, ry + 11.0);
    context.textBaseline = 'alphabetic';
    ry += starterHeaderH;

    starterRows.forEach(sRowItems => {
      let px = x + PAD;
      sRowItems.forEach(sItem => {
        const pRect = { x: px, y: ry, w: sItem.w, h: pillH };
        const pHov = isRectHovered(pRect);
        context.fillStyle = pHov ? c.surface_hover : c.surface;
        roundRect(context, px, ry, sItem.w, pillH, 13);
        context.fill();
        context.strokeStyle = pHov ? c.green : c.line;
        context.lineWidth = 1.0;
        context.stroke();

        context.font = '500 11px system-ui, -apple-system, sans-serif';
        context.fillStyle = pHov ? c.ink : c.ink_dim;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(sItem.term, px + sItem.w / 2.0, ry + pillH / 2.0 + 0.5);
        context.textBaseline = 'alphabetic';

        const visTop = Math.max(curY, ry);
        const visBottom = Math.min(ry + pillH, listBottom);
        if (visBottom > visTop) {
          addClickable(
            { x: px, y: visTop, w: sItem.w, h: visBottom - visTop },
            () => applySearchSuggestion(sItem.term, { recordHistory: true }),
            `search-starter-${sItem.idx}`
          );
        }
        px += sItem.w + pillGap;
      });
      ry += pillH + pillGap;
    });

    ry += 16.0 - pillGap;

    // 3. Browse by Ontario Statute
    context.font = '700 9.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_faint;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText('BROWSE BY STATUTE', x + PAD, ry + 11.0);
    context.textBaseline = 'alphabetic';
    ry += statHeaderH;

    context.save();
    roundRect(context, x + PAD, ry, innerW, statCardH, 12);
    context.clip();

    STATUTES.forEach((st, idx) => {
      const sy = ry + idx * statRowH;
      const stRect = { x: x + PAD, y: sy, w: innerW, h: statRowH };
      const hovered = isRectHovered(stRect);
      const count = STATUTE_COUNTS.get(st.code) || 0;
      const isEnabled = selectedStatutes.has(st.code);

      context.fillStyle = hovered ? c.surface_hover : c.surface;
      context.fillRect(x + PAD, sy, innerW, statRowH);
      if (idx > 0) {
        context.beginPath();
        context.moveTo(x + PAD, sy + 0.5);
        context.lineTo(x + PAD + innerW, sy + 0.5);
        context.strokeStyle = c.line;
        context.lineWidth = 1.0;
        context.stroke();
      }

      context.font = '700 11.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.fillStyle = isEnabled ? c.green : c.ink_faint;
      context.textAlign = 'left';
      context.fillText(st.code, x + PAD + 12.0, sy + 20.0);

      context.font = '600 12px system-ui, -apple-system, sans-serif';
      context.fillStyle = isEnabled ? c.ink : c.ink_dim;
      context.fillText(truncateToWidth(context, STATUTE_CONTEXT[st.code] || st.short, innerW - 140.0), x + PAD + 62.0, sy + 18.5);

      context.font = '10.5px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_faint;
      context.fillText(truncateToWidth(context, st.name, innerW - 140.0), x + PAD + 62.0, sy + 33.5);

      context.font = '600 10.5px system-ui, -apple-system, sans-serif';
      context.fillStyle = isEnabled ? c.ink_dim : c.ink_faint;
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      context.fillText(isEnabled ? `${count}` : 'Off', x + PAD + innerW - 22.0, sy + statRowH / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';

      const arrX = x + PAD + innerW - 11.0;
      const midY = sy + statRowH / 2.0;
      context.beginPath();
      context.moveTo(arrX - 2.2, midY - 3.5);
      context.lineTo(arrX + 1.6, midY);
      context.lineTo(arrX - 2.2, midY + 3.5);
      context.strokeStyle = hovered ? c.ink : c.ink_faint;
      context.lineWidth = 1.4;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.stroke();

      const visTop = Math.max(curY, sy);
      const visBottom = Math.min(sy + statRowH, listBottom);
      if (visBottom > visTop) {
        addClickable(
          { x: stRect.x, y: visTop, w: stRect.w, h: visBottom - visTop },
          () => {
            if (!selectedStatutes.has(st.code)) enableStatuteCode(st.code);
            applySearchSuggestion(st.code, { recordHistory: true });
          },
          `search-statute-${st.code}`
        );
      }
    });

    context.restore();
    roundRect(context, x + PAD, ry, innerW, statCardH, 12);
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();

    context.restore();
    drawScrollbar(context, c, x + w, curY, maxViewH, searchScrollY, maxSearchScrollY);
    return;
  }

  // Active Query AppBar Search Results
  const stripUsed = drawPredictiveChipStrip(context, x + PAD, curY, innerW, c, trimmedQuery);
  curY += stripUsed;

  const facetUsed = drawSearchFacetBar(context, x + PAD, curY, innerW, c);
  curY += facetUsed;

  const listItems = visibleCharges(false, { ignoreCategoryFilter: true });
  const headY = curY;
  context.font = '700 9.5px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink_faint;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  const facetHead = searchFacet === 'part3' ? ' · SUMMONS' : searchFacet === 'points' ? ' · DEMERITS' : searchFacet === 'part1' ? ' · PART I' : '';
  context.fillText(
    truncateToWidth(context, `SEARCH RESULTS${facetHead}  ·  ${listItems.length}`, Math.max(80.0, innerW - 92.0)),
    x + PAD,
    headY + 12.0
  );

  const sortW = 84.0;
  const sortH = 21.0;
  const sortX = x + w - PAD - sortW;
  const sortY = headY + 1.5;
  const sortRect = { x: sortX, y: sortY, w: sortW, h: sortH };
  const sortHovered = isRectHovered(sortRect);

  context.fillStyle = sortHovered ? c.surface_hover : c.surface;
  roundRect(context, sortX, sortY, sortW, sortH, 8.5);
  context.fill();
  context.strokeStyle = c.line;
  context.lineWidth = 1.0;
  context.stroke();

  const sortLabel = searchSort === 'relevance' ? 'BEST MATCH' : searchSort === 'number' ? 'BY NUMBER' : 'BY NAME';
  context.font = '700 8.5px system-ui, -apple-system, sans-serif';
  context.fillStyle = sortHovered ? c.ink : c.ink_dim;
  context.textAlign = 'center';
  context.fillText(sortLabel, sortX + sortW / 2.0, sortY + sortH / 2.0 + 0.5);
  context.textBaseline = 'alphabetic';

  addClickable(sortRect, () => {
    searchSort = searchSort === 'relevance' ? 'number' : searchSort === 'number' ? 'name' : 'relevance';
    searchScrollY = 0;
    requestRedraw();
  }, 'search-sort-toggle');

  curY += 26.0;

  const maxViewH = Math.max(80.0, listBottom - curY);
  if (listItems.length === 0) {
    maxSearchScrollY = 0;
    searchScrollY = 0;

    const noStatutes = selectedStatutes.size === 0;
    const allFacetCount = !noStatutes && searchFacet !== 'all'
      ? visibleCharges(false, { ignoreCategoryFilter: true, ignoreFacet: true }).length
      : 0;
    const dym = !noStatutes && allFacetCount === 0
      ? getDidYouMeanSuggestions(trimmedQuery, 3, searchFacet)
      : [];

    const cy = curY + Math.min(88.0, maxViewH * 0.34);
    drawLogo(context, x + w / 2.0, cy - 26.0, 46.0, c.line, 0.42);
    context.font = '600 13.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_dim;
    context.textAlign = 'center';
    const headline = noStatutes
      ? 'No legislation selected'
      : allFacetCount > 0
        ? '0 matches under this filter'
        : 'No POA offence matched';
    const subtitle = noStatutes
      ? 'Enable HTA or pick acts in Settings to search'
      : allFacetCount > 0
        ? `${allFacetCount} match${allFacetCount === 1 ? '' : 'es'} across all POA parts`
        : dym.length > 0
          ? 'Did you mean one of these?'
          : 'Try a section (78.1), element fact, or keyword';
    context.fillText(truncateToWidth(context, headline, innerW), x + w / 2.0, cy + 16.0);
    context.font = '12px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_faint;
    context.fillText(truncateToWidth(context, subtitle, innerW), x + w / 2.0, cy + 36.0);

    const clrW = 114.0;
    const clrH = 32.0;
    let clrY = cy + 54.0;
    if (noStatutes) {
      const enW = 114.0;
      const gap = 8.0;
      const startX = x + (w - enW - gap - clrW) / 2.0;
      const enRect = { x: startX, y: clrY, w: enW, h: clrH };
      context.fillStyle = isRectHovered(enRect) ? c.accent : c.green;
      roundRect(context, enRect.x, enRect.y, enRect.w, enRect.h, 16);
      context.fill();
      context.font = '600 12px system-ui, -apple-system, sans-serif';
      context.fillStyle = '#ffffff';
      context.textBaseline = 'middle';
      context.fillText('Enable HTA', enRect.x + enRect.w / 2.0, enRect.y + enRect.h / 2.0 + 0.5);
      addClickable(enRect, () => enableStatuteCode('HTA'), 'search-enable-hta');

      const clrX = startX + enW + gap;
      const clrRect = { x: clrX, y: clrY, w: clrW, h: clrH };
      context.fillStyle = isRectHovered(clrRect) ? c.surface_hover : c.surface;
      roundRect(context, clrX, clrY, clrW, clrH, 16);
      context.fill();
      context.strokeStyle = c.line;
      context.lineWidth = 1.0;
      context.stroke();
      context.fillStyle = c.green;
      context.fillText('Clear search', clrX + clrW / 2.0, clrY + clrH / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      addClickable(clrRect, () => {
        query = '';
        if (searchInput) searchInput.value = '';
        searchScrollY = 0;
        focusSearchInput();
      }, 'search-empty-clear');
    } else if (allFacetCount > 0) {
      const allLabel = `All parts (${allFacetCount})`;
      context.font = '600 12px system-ui, -apple-system, sans-serif';
      const allW = Math.min(148.0, Math.max(108.0, Math.ceil(context.measureText(allLabel).width + 24.0)));
      const gap = 8.0;
      const startX = x + (w - allW - gap - clrW) / 2.0;
      const allRect = { x: startX, y: clrY, w: allW, h: clrH };
      context.fillStyle = isRectHovered(allRect) ? c.accent : c.green;
      roundRect(context, allRect.x, allRect.y, allRect.w, allRect.h, 16);
      context.fill();
      context.fillStyle = '#ffffff';
      context.textBaseline = 'middle';
      context.fillText(allLabel, allRect.x + allRect.w / 2.0, allRect.y + allRect.h / 2.0 + 0.5);
      addClickable(allRect, () => setSearchFacet('all'), 'empty-all-facets');

      const clrX = startX + allW + gap;
      const clrRect = { x: clrX, y: clrY, w: clrW, h: clrH };
      context.fillStyle = isRectHovered(clrRect) ? c.surface_hover : c.surface;
      roundRect(context, clrX, clrY, clrW, clrH, 16);
      context.fill();
      context.strokeStyle = c.line;
      context.lineWidth = 1.0;
      context.stroke();
      context.fillStyle = c.green;
      context.fillText('Clear search', clrX + clrW / 2.0, clrY + clrH / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      addClickable(clrRect, () => {
        query = '';
        if (searchInput) searchInput.value = '';
        searchScrollY = 0;
        focusSearchInput();
      }, 'search-empty-clear');
    } else {
      if (dym.length > 0) {
        clrY += drawDidYouMeanPills(context, x + w / 2.0, clrY, innerW, c, dym) + 2.0;
      }
      const clrX = x + (w - 120.0) / 2.0;
      const clrRect = { x: clrX, y: clrY, w: 120.0, h: clrH };
      context.fillStyle = isRectHovered(clrRect) ? c.surface_hover : c.surface;
      roundRect(context, clrX, clrY, 120.0, clrH, 16);
      context.fill();
      context.strokeStyle = c.line;
      context.lineWidth = 1.0;
      context.stroke();
      context.font = '600 12px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.green;
      context.textBaseline = 'middle';
      context.fillText('Clear search', x + w / 2.0, clrY + clrH / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      addClickable(clrRect, () => {
        query = '';
        if (searchInput) searchInput.value = '';
        searchScrollY = 0;
        focusSearchInput();
      }, 'search-empty-clear');
    }
    return;
  }

  const measured = listItems.map(item => measureChargeRow(context, item, innerW, { richSearch: true }));
  const groupH = measured.reduce((acc, m) => acc + m.rowH, 0);
  const totalH = groupH + 8.0;

  maxSearchScrollY = Math.max(0, totalH - maxViewH);
  searchScrollY = Math.min(searchScrollY, maxSearchScrollY);

  context.save();
  context.beginPath();
  context.rect(x, curY, w, maxViewH);
  context.clip();

  drawGroupedChargeList(context, c, measured, x + PAD, curY - searchScrollY, innerW, curY, listBottom, 'search-result', {
    highlightQuery: trimmedQuery
  });

  context.restore();
  drawScrollbar(context, c, x + w, curY, maxViewH, searchScrollY, maxSearchScrollY);
}

function drawRulesSubScreen(context, x, y, w, h) {
  const c = colors();
  const innerW = w - PAD * 2.0;
  let curY = y + STATUS_H + TITLE_H + 4.0;

  const doneCount = POA_GENERAL_CHECKLIST.filter(item => !!poaRuleChecks[item.id]).length;

  // Back button to Settings + Title + Reset bar
  const backSize = 26.0;
  const backX = x + PAD;
  const backY = curY + 1.0;
  const backRect = { x: backX, y: backY, w: backSize, h: backSize };
  const backHovered = isRectHovered(backRect);

  context.fillStyle = backHovered ? c.surface_hover : c.surface;
  roundRect(context, backX, backY, backSize, backSize, 13);
  context.fill();
  context.strokeStyle = c.line;
  context.lineWidth = 1.0;
  context.stroke();

  const bCx = backX + backSize / 2.0;
  const bCy = backY + backSize / 2.0;
  context.beginPath();
  context.moveTo(bCx + 2.0, bCy - 4.0);
  context.lineTo(bCx - 2.5, bCy);
  context.lineTo(bCx + 2.0, bCy + 4.0);
  context.strokeStyle = backHovered ? c.ink : c.ink_dim;
  context.lineWidth = 1.65;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();

  addClickable(backRect, () => closeRulesSubView(), 'settings-rules-back');

  const resetW = 60.0;
  const resetH = 22.0;
  const resetX = x + w - PAD - resetW;
  const resetY = curY + 3.0;
  const resetRect = { x: resetX, y: resetY, w: resetW, h: resetH };
  const resetHovered = doneCount > 0 && isRectHovered(resetRect);

  context.font = '700 12px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  const hdrMaxW = Math.max(60.0, resetX - (backX + backSize + 8.0) - 8.0);
  context.fillText(
    truncateToWidth(context, `POA Field Rules · ${doneCount}/${POA_GENERAL_CHECKLIST.length}`, hdrMaxW),
    backX + backSize + 8.0,
    backY + backSize / 2.0 + 0.5
  );

  context.fillStyle = resetHovered ? c.surface_hover : c.surface;
  roundRect(context, resetX, resetY, resetW, resetH, 9);
  context.fill();
  context.strokeStyle = c.line;
  context.lineWidth = 1.0;
  context.stroke();

  context.font = '700 8.5px system-ui, -apple-system, sans-serif';
  context.fillStyle = doneCount > 0 ? c.ink_dim : c.ink_faint;
  context.textAlign = 'center';
  context.fillText('RESET', resetX + resetW / 2.0, resetY + resetH / 2.0 + 0.5);
  context.textBaseline = 'alphabetic';

  if (doneCount > 0) {
    addClickable(resetRect, () => {
      poaRuleChecks = {};
      savePoaRules();
      showStatusToast('POA checklist reset');
      requestRedraw();
    }, 'rules-reset');
  }

  curY += 34.0;

  const listBottom = y + h - NAV_H - 6.0;
  const maxListH = Math.max(80.0, listBottom - curY);

  const cardX = x + PAD;
  const cardW = innerW;
  const textXOff = 44.0;
  const textMaxW = Math.max(80.0, cardW - textXOff - 14.0);
  const cardGap = 8.0;

  const measuredCards = POA_GENERAL_CHECKLIST.map(item => {
    context.font = '600 13.5px system-ui, -apple-system, sans-serif';
    const titleLines = wrapLines(context, item.label, textMaxW);
    context.font = '12px system-ui, -apple-system, sans-serif';
    const noteLines = wrapLines(context, item.note, textMaxW);
    const cardH = 14.0 + titleLines.length * 17.0 + 4.0 + noteLines.length * 16.5 + 12.0;
    return { item, titleLines, noteLines, cardH };
  });

  // Part I vs Part III summary card height
  const partRows = [
    { label: 'Part I · Offence Notice', detail: 'Set fines up to $1,000. Serve within 30 days; file with court within 7 days.' },
    { label: 'Part III · Court Summons', detail: 'No set fine cap. Mandatory court appearance for major offences (Stunt, Suspended, Careless Harm).' }
  ];
  const refTextMaxW = Math.max(80.0, cardW - 30.0);
  const measuredRef = partRows.map(r => {
    context.font = '12px system-ui, -apple-system, sans-serif';
    const lines = wrapLines(context, r.detail, refTextMaxW);
    return { ...r, lines, h: 17.0 + lines.length * 16.5 };
  });
  const refCardH = 44.0 + measuredRef.reduce((acc, r) => acc + r.h + 10.0, 0) + 6.0;

  const totalH = measuredCards.reduce((acc, m) => acc + m.cardH + cardGap, 0) + 6.0 + refCardH + 8.0;
  maxRulesScrollY = Math.max(0, totalH - maxListH);
  rulesScrollY = Math.min(rulesScrollY, maxRulesScrollY);

  context.save();
  context.beginPath();
  context.rect(x, curY, w, maxListH);
  context.clip();

  let rowY = curY - rulesScrollY;

  for (const m of measuredCards) {
    const { item, titleLines, noteLines, cardH } = m;
    const isDone = !!poaRuleChecks[item.id];
    if (rowY + cardH >= curY && rowY <= listBottom) {
      const cardRect = { x: cardX, y: rowY, w: cardW, h: cardH };
      const hovered = isRectHovered(cardRect);

      context.fillStyle = hovered ? c.surface_hover : c.surface;
      roundRect(context, cardX, rowY, cardW, cardH, 13);
      context.fill();
      context.strokeStyle = isDone ? c.green : c.line;
      context.lineWidth = isDone ? 1.15 : 1.0;
      context.stroke();

      // Checkbox
      const chkX = cardX + 14.0;
      const chkY = rowY + 15.0;
      roundRect(context, chkX, chkY, 18.0, 18.0, 5);
      if (isDone) {
        context.fillStyle = c.green;
        context.fill();
        context.strokeStyle = '#ffffff';
        context.lineWidth = 1.8;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo(chkX + 4.5, chkY + 9.5);
        context.lineTo(chkX + 7.8, chkY + 12.8);
        context.lineTo(chkX + 13.5, chkY + 5.8);
        context.stroke();
      } else {
        context.strokeStyle = c.ink_faint;
        context.lineWidth = 1.4;
        context.stroke();
      }

      // Label & Note
      context.textAlign = 'left';
      context.font = '600 13.5px system-ui, -apple-system, sans-serif';
      context.fillStyle = isDone ? c.ink_dim : c.ink;
      let ty = rowY + 27.0;
      titleLines.forEach(line => {
        context.fillText(line, cardX + textXOff, ty);
        ty += 17.0;
      });

      ty += 2.0;
      context.font = '12px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_dim;
      noteLines.forEach(line => {
        context.fillText(line, cardX + textXOff, ty);
        ty += 16.5;
      });

      const visTop = Math.max(curY, rowY);
      const visBottom = Math.min(rowY + cardH, listBottom);
      if (visBottom > visTop) {
        addClickable(
          {
            x: cardX,
            y: visTop,
            w: cardW,
            h: visBottom - visTop
          },
          () => {
            poaRuleChecks[item.id] = !poaRuleChecks[item.id];
            savePoaRules();
            requestRedraw();
          },
          `rule-${item.id}`
        );
      }
    }
    rowY += cardH + cardGap;
  }

  // Part I vs Part III Summary Card
  rowY += 6.0;
  if (rowY + refCardH >= curY && rowY <= listBottom) {
    context.fillStyle = c.surface;
    roundRect(context, cardX, rowY, cardW, refCardH, 13);
    context.fill();
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();

    // Accent bar
    context.fillStyle = c.green;
    roundRect(context, cardX + 12.0, rowY + 14.0, 3.0, 18.0, 1.5);
    context.fill();

    context.textAlign = 'left';
    context.font = '700 13px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink;
    context.fillText('Part I vs. Part III Quick Reference', cardX + 22.0, rowY + 27.0);

    let ry = rowY + 50.0;
    for (const ref of measuredRef) {
      context.font = '600 12px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.green;
      context.fillText(ref.label, cardX + 14.0, ry);
      ry += 17.0;

      context.font = '12px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_dim;
      ref.lines.forEach(line => {
        context.fillText(line, cardX + 14.0, ry);
        ry += 16.5;
      });
      ry += 10.0;
    }
  }

  context.restore();
  drawScrollbar(context, c, x + w, curY, maxListH, rulesScrollY, maxRulesScrollY);
}

function drawSettingsScreen(context, x, y, w, h) {
  const c = colors();
  const innerW = w - PAD * 2.0;
  const viewTop = y + STATUS_H + TITLE_H + 4.0;
  const viewBottom = y + h - NAV_H - 6.0;
  const viewH = Math.max(80.0, viewBottom - viewTop);
  const cardX = x + PAD;
  const cardW = innerW;

  const prof = activeProfile();
  const profileList = Object.values(profiles);
  const totalChecks = countTotalCheckedElements();
  const doneRules = POA_GENERAL_CHECKLIST.filter(item => !!poaRuleChecks[item.id]).length;
  const confirmingReset = confirmResetChecksUntil > Date.now();

  const registerClippedClick = (rect, action, id) => {
    const visTop = Math.max(viewTop, rect.y);
    const visBottom = Math.min(rect.y + rect.h, viewBottom);
    if (visBottom > visTop) {
      addClickable({ x: rect.x, y: visTop, w: rect.w, h: visBottom - visTop }, action, id);
    }
  };

  // Pre-measure profile quick-switch chips cleanly
  const profChipRows = [];
  if (profileList.length > 0) {
    context.font = '600 10.5px system-ui, -apple-system, sans-serif';
    const maxChipRowW = cardW - 24.0;
    let curRow = [];
    let curRowW = 0;
    profileList.forEach((p, idx) => {
      const chipLabel = `${p.displayName}${p.pinHash ? ' · PIN' : ''}`;
      const cw = Math.min(maxChipRowW, Math.ceil(context.measureText(chipLabel).width + 20.0));
      if (curRow.length > 0 && curRowW + 6.0 + cw > maxChipRowW) {
        profChipRows.push(curRow);
        curRow = [];
        curRowW = 0;
      }
      curRowW += curRow.length === 0 ? cw : 6.0 + cw;
      curRow.push({ profile: p, idx, chipLabel, w: cw });
    });
    if (curRow.length > 0) profChipRows.push(curRow);
  }

  const hdrH = 20.0;
  const profHeaderH = 62.0;
  const profActionsH = 44.0;
  const profChipsH = profChipRows.length > 0
    ? 20.0 + profChipRows.length * 24.0 + Math.max(0, profChipRows.length - 1) * 6.0 + 10.0
    : 0;
  const accountCardH = profHeaderH + profActionsH + profChipsH;

  const legRowH = 52.0;
  const legCardH = LEGISLATION_CATALOG.length * legRowH;
  const prefRowH = 50.0;
  const prefCardH = 2 * prefRowH;
  const rulesCardH = 56.0;
  const dataRowH = 50.0;
  const dataCardH = 2 * dataRowH;
  const footerH = 34.0;

  const totalH =
    hdrH + accountCardH + 14.0 +
    hdrH + legCardH + 14.0 +
    hdrH + prefCardH + 14.0 +
    hdrH + rulesCardH + 14.0 +
    hdrH + dataCardH + footerH;

  maxSettingsScrollY = Math.max(0, totalH - viewH);
  settingsScrollY = Math.min(settingsScrollY, maxSettingsScrollY);

  context.save();
  context.beginPath();
  context.rect(x, viewTop, w, viewH);
  context.clip();

  let curY = viewTop - settingsScrollY;

  const drawSectionHeader = (leftLabel, rightLabel = '', rightColor = c.ink_faint) => {
    if (curY + hdrH >= viewTop && curY <= viewBottom) {
      context.font = '700 9.5px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_faint;
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(leftLabel, cardX + 2.0, curY + 9.0);
      if (rightLabel) {
        context.fillStyle = rightColor;
        context.textAlign = 'right';
        context.fillText(rightLabel, cardX + cardW - 2.0, curY + 9.0);
      }
      context.textBaseline = 'alphabetic';
    }
    curY += hdrH;
  };

  // 1. OFFICER ACCOUNT & BACKUP
  drawSectionHeader(
    'OFFICER ACCOUNT & BACKUP',
    prof ? (prof.pinHash ? 'PIN PROTECTED' : 'LOCAL PROFILE') : 'GUEST SESSION',
    prof ? c.green : c.ink_faint
  );

  const accTop = curY;
  if (accTop + accountCardH >= viewTop && accTop <= viewBottom) {
    context.fillStyle = c.surface;
    roundRect(context, cardX, accTop, cardW, accountCardH, 13);
    context.fill();
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();

    // Avatar circle
    const avCx = cardX + 29.0;
    const avCy = accTop + 31.0;
    context.beginPath();
    context.arc(avCx, avCy, 17.0, 0, Math.PI * 2);
    context.fillStyle = prof ? c.green_soft : (isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)');
    context.fill();
    context.strokeStyle = prof ? c.green : c.line;
    context.lineWidth = 1.0;
    context.stroke();

    if (prof) {
      const words = prof.displayName.trim().split(/\s+/).filter(Boolean);
      const initials = words.length >= 2
        ? `${words[0][0]}${words[1][0]}`.toUpperCase()
        : prof.displayName.slice(0, 2).toUpperCase();
      context.font = '700 12px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.green;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(initials, avCx, avCy + 0.5);
      context.textBaseline = 'alphabetic';
    } else {
      context.strokeStyle = c.ink_faint;
      context.lineWidth = 1.45;
      context.beginPath();
      context.arc(avCx, avCy - 3.5, 4.0, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(avCx, avCy + 8.5, 6.8, Math.PI * 1.15, Math.PI * 1.85);
      context.stroke();
    }

    // Primary Sign In / Sign Out pill
    const authBtnW = 68.0;
    const authBtnH = 28.0;
    const authBtnX = cardX + cardW - 12.0 - authBtnW;
    const authBtnY = accTop + 17.0;
    const authBtnRect = { x: authBtnX, y: authBtnY, w: authBtnW, h: authBtnH };
    const authBtnHov = isRectHovered(authBtnRect);

    if (prof) {
      context.fillStyle = authBtnHov ? c.surface_hover : (isDark ? c.screen : c.surface_hover);
      roundRect(context, authBtnX, authBtnY, authBtnW, authBtnH, 14);
      context.fill();
      context.strokeStyle = c.line;
      context.lineWidth = 1.0;
      context.stroke();
      context.font = '600 11px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('Sign Out', authBtnX + authBtnW / 2.0, authBtnY + authBtnH / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      registerClippedClick(authBtnRect, () => signOutProfile(), 'settings-signout');
    } else {
      context.fillStyle = authBtnHov ? c.accent : c.green;
      roundRect(context, authBtnX, authBtnY, authBtnW, authBtnH, 14);
      context.fill();
      context.font = '600 11.5px system-ui, -apple-system, sans-serif';
      context.fillStyle = '#ffffff';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('Sign In', authBtnX + authBtnW / 2.0, authBtnY + authBtnH / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      registerClippedClick(authBtnRect, () => openAuthModal('signin'), 'settings-signin');
    }

    // Name & live summary
    const infoX = cardX + 54.0;
    const infoMaxW = Math.max(80.0, authBtnX - infoX - 8.0);
    const titleStr = prof
      ? (prof.badge ? `${prof.displayName} · #${prof.badge}` : prof.displayName)
      : 'Guest Session';
    const subStr = `${stuck.size} saved · ${totalChecks} checks · ${doneRules}/6 rules`;

    context.textAlign = 'left';
    context.font = '700 13.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink;
    context.fillText(truncateToWidth(context, titleStr, infoMaxW), infoX, accTop + 26.0);

    context.font = '10.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_dim;
    context.fillText(truncateToWidth(context, subStr, infoMaxW), infoX, accTop + 43.0);

    // Divider before action bar
    const actY = accTop + profHeaderH;
    context.beginPath();
    context.moveTo(cardX + 12.0, actY + 0.5);
    context.lineTo(cardX + cardW - 12.0, actY + 0.5);
    context.strokeStyle = c.line;
    context.lineWidth = 0.8;
    context.stroke();

    // 3 evenly spaced action buttons (New/Switch | Export JSON | Import JSON)
    const btnGap = 6.0;
    const actionW = (cardW - 24.0 - btnGap * 2.0) / 3.0;
    const actionH = 28.0;
    const actionTop = actY + 8.0;
    const actionSpecs = [
      prof
        ? {
            id: 'settings-switch-account',
            label: 'Switch / New',
            fn: () => openAuthModal('signin')
          }
        : {
            id: 'settings-create-profile',
            label: 'New Profile',
            fn: () => openAuthModal('create')
          },
      {
        id: 'settings-export',
        label: 'Export JSON',
        fn: () => exportWorkBackup()
      },
      {
        id: 'settings-import',
        label: 'Import JSON',
        fn: () => {
          if (importBackupInput) importBackupInput.click();
        }
      }
    ];

    actionSpecs.forEach((act, idx) => {
      const bx = cardX + 12.0 + idx * (actionW + btnGap);
      const bRect = { x: bx, y: actionTop, w: actionW, h: actionH };
      const bHov = isRectHovered(bRect);
      context.fillStyle = bHov ? c.surface_hover : (isDark ? c.screen : '#efefe9');
      roundRect(context, bx, actionTop, actionW, actionH, 8);
      context.fill();
      context.strokeStyle = bHov ? c.green : c.line;
      context.lineWidth = 1.0;
      context.stroke();

      for (const fz of [10.5, 9.8, 9.2]) {
        context.font = `600 ${fz}px system-ui, -apple-system, sans-serif`;
        if (context.measureText(act.label).width <= actionW - 10.0) break;
      }
      context.fillStyle = bHov ? c.green : c.ink_dim;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(truncateToWidth(context, act.label, actionW - 8.0), bx + actionW / 2.0, actionTop + actionH / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      registerClippedClick(bRect, act.fn, act.id);
    });

    // Optional saved local profiles quick-switch bar
    if (profChipRows.length > 0) {
      let chipBlockY = accTop + profHeaderH + profActionsH;
      context.beginPath();
      context.moveTo(cardX + 12.0, chipBlockY + 0.5);
      context.lineTo(cardX + cardW - 12.0, chipBlockY + 0.5);
      context.strokeStyle = c.line;
      context.lineWidth = 0.8;
      context.stroke();

      context.font = '700 8px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_faint;
      context.textAlign = 'left';
      context.fillText('SAVED PROFILES (TAP TO SWITCH)', cardX + 12.0, chipBlockY + 13.0);
      chipBlockY += 20.0;

      profChipRows.forEach(cRow => {
        let cxp = cardX + 12.0;
        cRow.forEach(chip => {
          const isCur = currentProfileId === chip.profile.id;
          const pRect = { x: cxp, y: chipBlockY, w: chip.w, h: 24.0 };
          const pHov = isRectHovered(pRect);

          context.fillStyle = isCur ? c.green_soft : (pHov ? c.surface_hover : c.screen);
          roundRect(context, pRect.x, pRect.y, pRect.w, pRect.h, 12);
          context.fill();
          context.strokeStyle = isCur ? c.green : (pHov ? c.ink_dim : c.line);
          context.lineWidth = isCur ? 1.1 : 1.0;
          context.stroke();

          context.font = `${isCur ? '700' : '600'} 10.5px system-ui, -apple-system, sans-serif`;
          context.fillStyle = isCur ? c.green : c.ink_dim;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(truncateToWidth(context, chip.chipLabel, pRect.w - 10.0), pRect.x + pRect.w / 2.0, pRect.y + 12.5);
          context.textBaseline = 'alphabetic';

          registerClippedClick(pRect, () => switchProfileDirect(chip.profile.id), `settings-profile-${chip.idx}`);
          cxp += chip.w + 6.0;
        });
        chipBlockY += 30.0;
      });
    }
  }
  curY += accountCardH + 14.0;

  // 2. POA LEGISLATION (MULTI-SELECT SEARCH SCOPE)
  drawSectionHeader(
    'POA LEGISLATION',
    `${selectedStatutes.size} ACTIVE · MULTI-SELECT`,
    selectedStatutes.size > 0 ? c.green : c.ink_faint
  );

  const legTop = curY;
  if (legTop + legCardH >= viewTop && legTop <= viewBottom) {
    context.save();
    roundRect(context, cardX, legTop, cardW, legCardH, 13);
    context.clip();

    LEGISLATION_CATALOG.forEach((st, idx) => {
      const sy = legTop + idx * legRowH;
      if (sy + legRowH < viewTop || sy > viewBottom) return;
      const rowRect = { x: cardX, y: sy, w: cardW, h: legRowH };
      const hovered = isRectHovered(rowRect);
      const isSelected = st.available && selectedStatutes.has(st.code);

      context.fillStyle = hovered ? c.surface_hover : c.surface;
      context.fillRect(cardX, sy, cardW, legRowH);
      if (idx > 0) {
        context.beginPath();
        context.moveTo(cardX, sy + 0.5);
        context.lineTo(cardX + cardW, sy + 0.5);
        context.strokeStyle = c.line;
        context.lineWidth = 1.0;
        context.stroke();
      }

      // Code pill/tag
      context.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.fillStyle = st.available ? (isSelected ? c.green : c.ink_dim) : c.ink_faint;
      context.textAlign = 'left';
      context.fillText(st.code, cardX + 12.0, sy + 24.0);

      // Right switch coordinates
      const swW = 38.0;
      const swH = 22.0;
      const swX = cardX + cardW - 12.0 - swW;
      const swY = sy + (legRowH - swH) / 2.0;

      // Clean title (citation stripped cleanly) + detail subtitle
      const cleanName = st.name.replace(/\s*\([^)]+\)\s*$/, '').replace(/,\s*\d{4}$/, '');
      const textX = cardX + 52.0;
      const textMaxW = Math.max(80.0, swX - textX - 10.0);

      for (const fz of [12.0, 11.4, 10.8, 10.2, 9.6]) {
        context.font = `600 ${fz}px system-ui, -apple-system, sans-serif`;
        if (context.measureText(cleanName).width <= textMaxW) break;
      }
      context.fillStyle = st.available ? c.ink : c.ink_dim;
      context.fillText(truncateToWidth(context, cleanName, textMaxW), textX, sy + 22.0);

      context.font = '10.5px system-ui, -apple-system, sans-serif';
      context.fillStyle = c.ink_faint;
      const subText = st.available
        ? `${STATUTE_COUNTS.get(st.code) || 0} offences · ${isSelected ? 'Included in search' : 'Excluded'}`
        : `Coming soon · Pending Drive docs`;
      context.fillText(truncateToWidth(context, subText, textMaxW), textX, sy + 37.5);

      context.fillStyle = st.available
        ? (isSelected ? c.green : (isDark ? '#323842' : '#aeb4ac'))
        : (isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.09)');
      roundRect(context, swX, swY, swW, swH, 11);
      context.fill();
      if (!st.available) {
        context.strokeStyle = c.line;
        context.lineWidth = 0.8;
        context.stroke();
      }

      const knobCx = isSelected ? swX + swW - 11.0 : swX + 11.0;
      const knobCy = swY + 11.0;
      context.beginPath();
      context.arc(knobCx, knobCy, 8.0, 0, Math.PI * 2);
      context.fillStyle = st.available ? '#ffffff' : c.ink_faint;
      context.fill();

      registerClippedClick(rowRect, () => toggleStatuteSelection(st.code), `settings-statute-${st.code}`);
    });

    context.restore();
    roundRect(context, cardX, legTop, cardW, legCardH, 13);
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();
  }
  curY += legCardH + 14.0;

  // 3. APPEARANCE & PREFERENCES
  drawSectionHeader('APPEARANCE & PREFERENCES');
  const prefTop = curY;
  if (prefTop + prefCardH >= viewTop && prefTop <= viewBottom) {
    context.save();
    roundRect(context, cardX, prefTop, cardW, prefCardH, 13);
    context.clip();

    const segW = 118.0;
    const segH = 28.0;
    const segX = cardX + cardW - 12.0 - segW;
    const halfW = segW / 2.0 - 2.0;

    // Row 1: Light | Dark Theme Switch
    context.fillStyle = c.surface;
    context.fillRect(cardX, prefTop, cardW, prefRowH);
    const labelMaxW = Math.max(80.0, segX - cardX - 20.0);
    context.textAlign = 'left';
    context.font = '600 13px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink;
    context.fillText(truncateToWidth(context, 'Appearance', labelMaxW), cardX + 14.0, prefTop + 21.5);
    context.font = '10.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_faint;
    context.fillText(truncateToWidth(context, 'Light or dark display theme', labelMaxW), cardX + 14.0, prefTop + 37.0);

    const segY1 = prefTop + (prefRowH - segH) / 2.0;
    context.fillStyle = isDark ? c.screen : '#e4e5de';
    roundRect(context, segX, segY1, segW, segH, 9);
    context.fill();
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();

    const themeSegments = [
      { id: 'settings-theme-light', label: 'Light', active: !isDark, fn: () => setThemeDark(false) },
      { id: 'settings-theme-dark', label: 'Dark', active: isDark, fn: () => setThemeDark(true) }
    ];
    themeSegments.forEach((seg, idx) => {
      const sx = segX + 2.0 + idx * (segW / 2.0 - 1.0);
      const sRect = { x: sx, y: segY1 + 2.0, w: halfW, h: segH - 4.0 };
      if (seg.active) {
        context.fillStyle = c.green;
        roundRect(context, sRect.x, sRect.y, sRect.w, sRect.h, 7);
        context.fill();
      } else if (isRectHovered(sRect)) {
        context.fillStyle = c.surface_hover;
        roundRect(context, sRect.x, sRect.y, sRect.w, sRect.h, 7);
        context.fill();
      }
      context.font = '600 11px system-ui, -apple-system, sans-serif';
      context.fillStyle = seg.active ? '#ffffff' : c.ink_dim;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(seg.label, sRect.x + sRect.w / 2.0, sRect.y + sRect.h / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      registerClippedClick(sRect, seg.fn, seg.id);
    });

    // Row 2: Number | Name Default Sort
    const row2Y = prefTop + prefRowH;
    context.fillStyle = c.surface;
    context.fillRect(cardX, row2Y, cardW, prefRowH);
    context.beginPath();
    context.moveTo(cardX, row2Y + 0.5);
    context.lineTo(cardX + cardW, row2Y + 0.5);
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();

    context.textAlign = 'left';
    context.font = '600 13px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink;
    context.fillText(truncateToWidth(context, 'Default Sort', labelMaxW), cardX + 14.0, row2Y + 21.5);
    context.font = '10.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_faint;
    context.fillText(truncateToWidth(context, 'POA Code & Saved order', labelMaxW), cardX + 14.0, row2Y + 37.0);

    const segY2 = row2Y + (prefRowH - segH) / 2.0;
    context.fillStyle = isDark ? c.screen : '#e4e5de';
    roundRect(context, segX, segY2, segW, segH, 9);
    context.fill();
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();

    const sortSegments = [
      { id: 'settings-sort-number', label: 'Number', active: sort === 'number', fn: () => setDefaultSort('number') },
      { id: 'settings-sort-name', label: 'Name', active: sort === 'name', fn: () => setDefaultSort('name') }
    ];
    sortSegments.forEach((seg, idx) => {
      const sx = segX + 2.0 + idx * (segW / 2.0 - 1.0);
      const sRect = { x: sx, y: segY2 + 2.0, w: halfW, h: segH - 4.0 };
      if (seg.active) {
        context.fillStyle = c.green;
        roundRect(context, sRect.x, sRect.y, sRect.w, sRect.h, 7);
        context.fill();
      } else if (isRectHovered(sRect)) {
        context.fillStyle = c.surface_hover;
        roundRect(context, sRect.x, sRect.y, sRect.w, sRect.h, 7);
        context.fill();
      }
      context.font = '600 11px system-ui, -apple-system, sans-serif';
      context.fillStyle = seg.active ? '#ffffff' : c.ink_dim;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(seg.label, sRect.x + sRect.w / 2.0, sRect.y + sRect.h / 2.0 + 0.5);
      context.textBaseline = 'alphabetic';
      registerClippedClick(sRect, seg.fn, seg.id);
    });

    context.restore();
    roundRect(context, cardX, prefTop, cardW, prefCardH, 13);
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();
  }
  curY += prefCardH + 14.0;

  // 4. FIELD REFERENCE (POA FIELD RULES & PART I / III)
  drawSectionHeader('FIELD REFERENCE');
  const ruleCardTop = curY;
  if (ruleCardTop + rulesCardH >= viewTop && ruleCardTop <= viewBottom) {
    const rRect = { x: cardX, y: ruleCardTop, w: cardW, h: rulesCardH };
    const rHov = isRectHovered(rRect);
    context.fillStyle = rHov ? c.surface_hover : c.surface;
    roundRect(context, cardX, ruleCardTop, cardW, rulesCardH, 13);
    context.fill();
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();

    // Soft-green checklist icon box
    const icX = cardX + 12.0;
    const icY = ruleCardTop + 11.0;
    context.fillStyle = c.green_soft;
    roundRect(context, icX, icY, 34.0, 34.0, 9);
    context.fill();

    const chkCx = icX + 17.0;
    const chkCy = icY + 17.0;
    context.strokeStyle = c.green;
    context.lineWidth = 1.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    roundRect(context, chkCx - 6.0, chkCy - 6.5, 12.0, 13.0, 2);
    context.stroke();
    context.beginPath();
    context.moveTo(chkCx - 3.2, chkCy - 1.5);
    context.lineTo(chkCx - 1.0, chkCy + 0.5);
    context.lineTo(chkCx + 2.8, chkCy - 3.2);
    context.moveTo(chkCx - 3.2, chkCy + 3.2);
    context.lineTo(chkCx + 3.2, chkCy + 3.2);
    context.stroke();

    const rTextX = cardX + 56.0;
    const rTextMaxW = Math.max(80.0, cardW - 56.0 - 26.0);
    context.textAlign = 'left';
    const fieldRefTitle = 'POA Field Rules & Reference';
    for (const fz of [13.0, 12.2, 11.6]) {
      context.font = `600 ${fz}px system-ui, -apple-system, sans-serif`;
      if (context.measureText(fieldRefTitle).width <= rTextMaxW) break;
    }
    context.fillStyle = c.ink;
    context.fillText(truncateToWidth(context, fieldRefTitle, rTextMaxW), rTextX, ruleCardTop + 24.5);

    context.font = '11px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_dim;
    context.fillText(
      truncateToWidth(context, `${doneRules}/${POA_GENERAL_CHECKLIST.length} verified · Part I vs. Part III rules`, rTextMaxW),
      rTextX,
      ruleCardTop + 40.5
    );

    const arrX = cardX + cardW - 14.0;
    const midY = ruleCardTop + rulesCardH / 2.0;
    context.beginPath();
    context.moveTo(arrX - 3.0, midY - 4.2);
    context.lineTo(arrX + 1.8, midY);
    context.lineTo(arrX - 3.0, midY + 4.2);
    context.strokeStyle = rHov ? c.ink : c.ink_faint;
    context.lineWidth = 1.6;
    context.stroke();

    registerClippedClick(rRect, () => openRulesSubView(), 'settings-open-rules');
  }
  curY += rulesCardH + 14.0;

  // 5. DATA CONTROLS
  drawSectionHeader('DATA CONTROLS');
  const dataTop = curY;
  if (dataTop + dataCardH >= viewTop && dataTop <= viewBottom) {
    context.save();
    roundRect(context, cardX, dataTop, cardW, dataCardH, 13);
    context.clip();

    const btnW = 78.0;
    const btnH = 28.0;
    const btnX = cardX + cardW - 12.0 - btnW;
    const dataTextMaxW = Math.max(80.0, btnX - cardX - 20.0);

    // Row 1: Recent Search History
    context.fillStyle = c.surface;
    context.fillRect(cardX, dataTop, cardW, dataRowH);
    context.textAlign = 'left';
    context.font = '600 13px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink;
    context.fillText(truncateToWidth(context, 'Search History', dataTextMaxW), cardX + 14.0, dataTop + 21.5);
    context.font = '10.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_faint;
    context.fillText(
      truncateToWidth(
        context,
        `${recentSearches.length} saved recent quer${recentSearches.length === 1 ? 'y' : 'ies'}`,
        dataTextMaxW
      ),
      cardX + 14.0,
      dataTop + 37.0
    );

    const clrRect = { x: btnX, y: dataTop + (dataRowH - btnH) / 2.0, w: btnW, h: btnH };
    const clrEnabled = recentSearches.length > 0;
    const clrHov = clrEnabled && isRectHovered(clrRect);
    context.fillStyle = clrHov ? c.surface_hover : (isDark ? c.screen : '#efefe9');
    roundRect(context, clrRect.x, clrRect.y, clrRect.w, clrRect.h, 8);
    context.fill();
    context.strokeStyle = clrHov ? c.green : c.line;
    context.lineWidth = 1.0;
    context.stroke();
    context.font = '600 11px system-ui, -apple-system, sans-serif';
    context.fillStyle = clrEnabled ? c.ink : c.ink_faint;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('Clear', clrRect.x + clrRect.w / 2.0, clrRect.y + clrRect.h / 2.0 + 0.5);
    context.textBaseline = 'alphabetic';
    if (clrEnabled) {
      registerClippedClick(clrRect, () => clearRecentSearches(), 'settings-clear-history');
    }

    // Row 2: Element Checkmarks Reset (with 2-tap safety confirm)
    const dRow2Y = dataTop + dataRowH;
    context.fillStyle = c.surface;
    context.fillRect(cardX, dRow2Y, cardW, dataRowH);
    context.beginPath();
    context.moveTo(cardX, dRow2Y + 0.5);
    context.lineTo(cardX + cardW, dRow2Y + 0.5);
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();

    context.textAlign = 'left';
    context.font = '600 13px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink;
    context.fillText(truncateToWidth(context, 'Element Checkmarks', dataTextMaxW), cardX + 14.0, dRow2Y + 21.5);
    context.font = '10.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_faint;
    context.fillText(
      truncateToWidth(context, `${totalChecks} checked proof element${totalChecks === 1 ? '' : 's'}`, dataTextMaxW),
      cardX + 14.0,
      dRow2Y + 37.0
    );

    const chkRect = { x: btnX, y: dRow2Y + (dataRowH - btnH) / 2.0, w: btnW, h: btnH };
    const chkEnabled = totalChecks > 0;
    const chkHov = chkEnabled && isRectHovered(chkRect);
    context.fillStyle = confirmingReset
      ? 'rgba(220, 38, 38, 0.14)'
      : (chkHov ? c.surface_hover : (isDark ? c.screen : '#efefe9'));
    roundRect(context, chkRect.x, chkRect.y, chkRect.w, chkRect.h, 8);
    context.fill();
    context.strokeStyle = confirmingReset ? '#dc2626' : (chkHov ? c.green : c.line);
    context.lineWidth = 1.0;
    context.stroke();
    context.font = '600 11px system-ui, -apple-system, sans-serif';
    context.fillStyle = confirmingReset ? '#dc2626' : (chkEnabled ? c.ink : c.ink_faint);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(confirmingReset ? 'Confirm?' : 'Reset', chkRect.x + chkRect.w / 2.0, chkRect.y + chkRect.h / 2.0 + 0.5);
    context.textBaseline = 'alphabetic';
    if (chkEnabled) {
      registerClippedClick(chkRect, () => resetAllElementChecks(), 'settings-clear-checks');
    }

    context.restore();
    roundRect(context, cardX, dataTop, cardW, dataCardH, 13);
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();
  }
  curY += dataCardH;

  // Footer
  if (curY + footerH >= viewTop && curY <= viewBottom) {
    context.font = '10.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_faint;
    context.textAlign = 'center';
    context.fillText(`Stick the Ticket · ${CHARGES.length} HTA offences stored locally offline`, x + w / 2.0, curY + 21.0);
  }

  context.restore();
  drawScrollbar(context, c, x + w, viewTop, viewH, settingsScrollY, maxSettingsScrollY);
}

function measureParagraphLines(context, rawText, maxW) {
  if (!rawText) return [];
  const paragraphs = String(rawText).split(/\n/);
  const out = [];
  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const p = paragraphs[pIdx].trim();
    if (!p) {
      if (out.length > 0 && out[out.length - 1] !== null) out.push(null);
      continue;
    }
    const wrapped = wrapLines(context, p, maxW);
    for (const line of wrapped) out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === null) out.pop();
  return out;
}

function drawDetailScreen(context, x, y, w, h) {
  const c = colors();
  const charge = CHARGES[openChargeIdx];
  const isStuck = stuck.has(charge.id);
  const innerW = w - PAD * 2.0;

  // Header bar below status bar
  const barY = y + STATUS_H;
  const barCenterY = barY + 24.0;
  const backX = x + PAD + 17.0;
  const backRect = { x: backX - 18.0, y: barCenterY - 18.0, w: 36.0, h: 36.0 };
  const backHovered = isRectHovered(backRect);

  context.fillStyle = backHovered ? c.surface_hover : c.surface;
  context.beginPath();
  context.arc(backX, barCenterY, 17.0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = c.line;
  context.lineWidth = 1.0;
  context.stroke();

  context.beginPath();
  context.moveTo(backX + 2.5, barCenterY - 5.0);
  context.lineTo(backX - 3.0, barCenterY);
  context.lineTo(backX + 2.5, barCenterY + 5.0);
  context.strokeStyle = backHovered ? c.ink : c.ink_dim;
  context.lineWidth = 1.8;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();

  addClickable(backRect, () => closeDetail(), 'detail-back');

  // Center Clipboard Logo
  drawLogo(context, x + w / 2.0, barCenterY, 32.0, c.green);

  // Save / Saved pill button
  const saveW = 74.0;
  const saveH = 32.0;
  const saveX = x + w - PAD - saveW;
  const saveY = barCenterY - saveH / 2.0;
  const saveRect = { x: saveX, y: saveY, w: saveW, h: saveH };
  const saveHovered = isRectHovered(saveRect);

  context.fillStyle = isStuck
    ? c.green_soft
    : saveHovered ? c.surface_hover : c.surface;
  roundRect(context, saveX, saveY, saveW, saveH, 16);
  context.fill();
  context.strokeStyle = isStuck ? c.green : c.line;
  context.lineWidth = isStuck ? 1.2 : 1.0;
  context.stroke();

  context.font = '600 12.5px system-ui, -apple-system, sans-serif';
  context.fillStyle = isStuck ? c.green : c.ink;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(isStuck ? 'Saved' : 'Save', saveX + saveW / 2.0, barCenterY + 0.5);
  context.textBaseline = 'alphabetic';

  addClickable(saveRect, () => {
    if (stuck.has(charge.id)) {
      stuck.delete(charge.id);
    } else {
      stuck.add(charge.id);
    }
    saveStuck();
    requestRedraw();
  }, 'detail-save');

  // Measure detail content for dynamic layout & exact scroll clamping
  const contentTop = barY + 50.0;
  const contentBottom = y + h - 14.0;
  const contentH = Math.max(120.0, contentBottom - contentTop);

  context.font = '700 22px system-ui, -apple-system, sans-serif';
  const titleLines = wrapLines(context, charge.name, innerW);

  const hasVerbatimStatute = Boolean(charge.statutoryText && charge.statutoryText.trim());
  context.font = '13px system-ui, -apple-system, sans-serif';
  const topSummaryLines = hasVerbatimStatute && charge.summary
    ? wrapLines(context, charge.summary, innerW)
    : [];

  const activeDetailQuery = (pendingDetailReturnScroll?.detailQuery || '').trim();
  const detailIdxEntry = activeDetailQuery ? CHARGE_SEARCH_INDEX.get(charge.id) : null;
  const detailParsed = activeDetailQuery ? parseSearchQuery(activeDetailQuery) : null;

  const matchedElementIdxSet = new Set();
  if (activeDetailQuery && detailParsed && detailIdxEntry && !detailParsed.isExplicitItemQuery) {
    const dq = detailParsed.q;
    const dqFolded = detailParsed.qFolded;
    const dqJoined = detailParsed.qJoined;
    const dqNorm = detailParsed.qNorm;
    const dqAlphaSingle = !detailParsed.isMultiWord && /^[a-z]+$/.test(dq);
    const dTokens = detailParsed.contentTokens;
    const dTokenAlts = detailParsed.tokenAltSets;
    const dConcepts = detailParsed.phraseConcepts;

    const coreMatchesExactOrAll = entry => {
      if (dqAlphaSingle) return tokenMatchesField(dq, entry.coreLow, entry.coreFolded, entry.coreJoined);
      if (!detailParsed.isMultiWord) {
        return (
          entry.coreLow.includes(dq) ||
          (dqFolded.length >= 1 && entry.coreFolded.includes(dqFolded)) ||
          (dqNorm.length >= 3 && tokenMatchesField(dq, entry.coreLow, entry.coreFolded, entry.coreJoined))
        );
      }
      if (entry.coreLow.includes(dq) || entry.coreFolded.includes(dqFolded) || (dqJoined && entry.coreJoined.includes(dqJoined))) {
        return true;
      }
      return dTokens.length > 0 && dTokens.every(tok => tokenMatchesField(tok, entry.coreLow, entry.coreFolded, entry.coreJoined));
    };

    const entryMatchesConceptOrAny = entry => {
      for (const cp of dConcepts) {
        if (
          cp.anyOf.some(phrase => {
            const pToks = normalizeFolded(phrase).split(/\s+/).filter(Boolean);
            return entry.coreFolded.includes(phrase) || (pToks.length > 0 && pToks.every(t => tokenMatchesField(t, entry.coreLow, entry.coreFolded, entry.coreJoined)));
          })
        ) {
          return true;
        }
      }
      for (const altSet of dTokenAlts) {
        if (altSet.some(alt => tokenMatchesField(alt, entry.coreLow, entry.coreFolded, entry.coreJoined))) {
          return true;
        }
      }
      return false;
    };

    const directNonGeneric = new Set();
    const directAll = new Set();
    for (const entry of detailIdxEntry.elementEntries) {
      if (coreMatchesExactOrAll(entry)) {
        directAll.add(entry.elementIdx);
        if (!entry.isGeneric) directNonGeneric.add(entry.elementIdx);
      }
    }
    if (directNonGeneric.size > 0) {
      directNonGeneric.forEach(idx => matchedElementIdxSet.add(idx));
    } else if (directAll.size > 0) {
      directAll.forEach(idx => matchedElementIdxSet.add(idx));
    } else {
      const partialNonGeneric = new Set();
      const partialAll = new Set();
      for (const entry of detailIdxEntry.elementEntries) {
        if (entryMatchesConceptOrAny(entry)) {
          partialAll.add(entry.elementIdx);
          if (!entry.isGeneric) partialNonGeneric.add(entry.elementIdx);
        }
      }
      const chosen = partialNonGeneric.size > 0 ? partialNonGeneric : partialAll;
      chosen.forEach(idx => matchedElementIdxSet.add(idx));
    }
  }
  const matchedElementIndices = Array.from(matchedElementIdxSet).sort((a, b) => a - b);
  lastDetailMatchedElements = matchedElementIndices.map(i => i + 1);

  const chargeChecks = checkedItems[charge.id] || {};
  const elementLayouts = charge.elements.map((el, eIdx) => {
    context.font = '14px system-ui, -apple-system, sans-serif';
    const lines = wrapLines(context, el.text, innerW - 48.0);
    const parentH = Math.max(24.0, lines.length * 19.0 + (el.options?.length ? 6.0 : 10.0));
    context.font = '13px system-ui, -apple-system, sans-serif';
    const optionLayouts = (el.options || []).map((optText, oIdx) => {
      const optLines = wrapLines(context, optText, innerW - 72.0);
      const optH = Math.max(21.0, optLines.length * 17.5 + 4.0);
      return { oIdx, optText, optLines, optH };
    });
    const optsTotalH = optionLayouts.reduce((acc, o) => acc + o.optH, 0) + (optionLayouts.length > 0 ? 6.0 : 0);
    return { el, lines, parentH, optionLayouts, h: parentH + optsTotalH, isSearchMatch: matchedElementIdxSet.has(eIdx) };
  });

  context.font = 'italic 13px system-ui, -apple-system, sans-serif';
  const wordingLines = wrapLines(context, `“${charge.shortWording}”`, innerW);

  context.font = '12.5px system-ui, -apple-system, sans-serif';
  const procLines = charge.procedureNotes ? wrapLines(context, charge.procedureNotes, innerW) : [];
  context.font = 'italic 12.5px system-ui, -apple-system, sans-serif';
  const statuteMeasureItalic = /\bitalic\b/i.test(context.font);
  const statuteBodyLines = measureParagraphLines(
    context,
    hasVerbatimStatute ? charge.statutoryText : charge.summary,
    innerW
  );
  const statuteBodyH = statuteBodyLines.reduce((acc, line) => acc + (line === null ? 7.0 : 18.0), 0);

  const { inApp: relatedCharges, external: externalLinks } = getRelatedContent(charge);
  const similarMeasured = relatedCharges.map(item => measureChargeRow(context, item, innerW));
  const extRowH = 40.0;
  const extBlockH = externalLinks.length > 0 ? 8.0 + externalLinks.length * extRowH : 0;

  const proveHeaderH = 22.0;

  // Compute exact total scrollable height & per-element scroll targets
  let preElementsH = 12.0;
  preElementsH += titleLines.length * 27.0 + 4.0 + (topSummaryLines.length > 0 ? 22.0 : 30.0);
  if (topSummaryLines.length > 0) {
    preElementsH += topSummaryLines.length * 18.0 + 14.0;
  }
  preElementsH += proveHeaderH;

  let elCursorY = preElementsH;
  const elementRelYs = elementLayouts.map(m => {
    const top = elCursorY;
    elCursorY += m.h;
    return top;
  });

  let totalH = elCursorY;
  totalH += 14.0 + 18.0 + wordingLines.length * 18.0 + 16.0; // Short-form wording
  totalH += 18.0 + 20.0 + (typeof charge.points === 'number' && charge.points > 0 ? 20.0 : 0); // Penalty
  if (procLines.length > 0) totalH += 4.0 + procLines.length * 17.5;
  totalH += 14.0 + 62.0 + 24.0 + 18.0 + statuteBodyH; // Statutory text
  if (similarMeasured.length > 0 || externalLinks.length > 0) {
    totalH += 14.0 + 54.0 + similarMeasured.reduce((acc, m) => acc + m.rowH, 0) + extBlockH;
  }
  totalH += 10.0;

  maxDetailScrollY = Math.max(0, totalH - contentH);
  detailScrollY = Math.min(detailScrollY, maxDetailScrollY);

  const highlightDetailLine = (text, lx, ly, baseColor) => {
    if (!activeDetailQuery) {
      context.fillStyle = baseColor;
      context.fillText(text, lx, ly);
      return;
    }
    lastDetailHighlightCount += drawHighlightedText(
      context,
      text,
      activeDetailQuery,
      lx,
      ly,
      baseColor,
      c.hl_ink,
      c.hl_bg
    );
  };

  context.save();
  context.beginPath();
  context.rect(x, contentTop, w, contentH);
  context.clip();

  let curY = contentTop + 12.0 - detailScrollY;

  // Title
  context.textAlign = 'left';
  context.font = '700 22px system-ui, -apple-system, sans-serif';
  titleLines.forEach(line => {
    highlightDetailLine(line, x + PAD, curY + 18.0, c.ink);
    curY += 27.0;
  });
  curY += 4.0;

  // Subtitle
  context.font = '12px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink_dim;
  const itemRef = formatItemRef(charge);
  const subText = `${charge.statute} ${formatSectionRef(charge)} · ${charge.part}${itemRef ? ` · ${itemRef}` : ''}`;
  context.fillText(truncateToWidth(context, subText, innerW), x + PAD, curY + 8.0);
  curY += topSummaryLines.length > 0 ? 22.0 : 30.0;

  // Plain-English Overview (when verbatim statutory text is rendered below)
  if (topSummaryLines.length > 0) {
    context.font = '13px system-ui, -apple-system, sans-serif';
    topSummaryLines.forEach(line => {
      highlightDetailLine(line, x + PAD, curY + 7.0, c.ink_dim);
      curY += 18.0;
    });
    curY += 14.0;
  }

  // Prove ALL N Header + optional Jump-to-Match pill
  context.font = '700 11.5px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.green;
  const proveLabel = `Prove ALL ${charge.elements.length}:`;
  context.fillText(proveLabel, x + PAD, curY);
  if (matchedElementIndices.length > 0 && curY + 8.0 >= contentTop && curY - 16.0 <= contentBottom) {
    const proveLabelW = context.measureText(proveLabel).width;
    const shownNums = matchedElementIndices.slice(0, 3).map(idx => idx + 1).join(', ');
    const moreSuffix = matchedElementIndices.length > 3 ? '+' : '';
    const jumpRaw = `Match in Prove ${shownNums}${moreSuffix} · Jump ↓`;
    const maxJumpW = Math.max(88.0, innerW - proveLabelW - 10.0);
    context.font = '600 9.5px system-ui, -apple-system, sans-serif';
    const jumpText = truncateToWidth(context, jumpRaw, maxJumpW - 14.0);
    const jumpW = Math.min(maxJumpW, Math.ceil(context.measureText(jumpText).width + 14.0));
    const jumpH = 19.0;
    const jumpX = x + w - PAD - jumpW;
    const jumpY = curY - 12.5;
    const jumpRect = { x: jumpX, y: jumpY, w: jumpW, h: jumpH };
    const jumpHov = isRectHovered(jumpRect);
    context.fillStyle = jumpHov ? c.surface_hover : c.green_soft;
    roundRect(context, jumpX, jumpY, jumpW, jumpH, 9.5);
    context.fill();
    context.strokeStyle = c.green;
    context.lineWidth = jumpHov ? 1.2 : 0.9;
    context.stroke();
    context.fillStyle = c.green;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(jumpText, jumpX + jumpW / 2.0, jumpY + jumpH / 2.0 + 0.5);
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';

    const firstMatchRelY = elementRelYs[matchedElementIndices[0]] ?? preElementsH;
    addClickable(jumpRect, () => {
      detailScrollY = Math.max(0, Math.min(maxDetailScrollY, firstMatchRelY - 26.0));
      requestRedraw();
    }, 'detail-jump-match');
  }
  curY += proveHeaderH;

  // Essential elements checklist + nested OR-options
  elementLayouts.forEach((m, index) => {
    const isChecked = !!chargeChecks[m.el.id];
    const ptX = x + PAD;
    const ptY = curY;

    if (m.isSearchMatch) {
      context.fillStyle = c.green;
      roundRect(context, ptX - 7.5, ptY - 12.0, 2.8, Math.max(16.0, m.h - 4.0), 1.4);
      context.fill();
    }

    context.font = '700 13.5px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.green;
    context.fillText(`${index + 1}.`, ptX, ptY);

    const chkX = ptX + 22.0;
    const chkY = ptY - 12.0;
    roundRect(context, chkX, chkY, 16.0, 16.0, 4);
    if (isChecked) {
      context.fillStyle = c.green;
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.7;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(chkX + 3.8, ptY - 4.0);
      context.lineTo(chkX + 6.8, ptY - 1.2);
      context.lineTo(chkX + 12.2, ptY - 7.8);
      context.stroke();
    } else {
      context.strokeStyle = c.ink_faint;
      context.lineWidth = 1.5;
      context.stroke();
    }

    const parentHitBottom = ptY - 16.0 + m.parentH;
    if (parentHitBottom >= contentTop && ptY - 16.0 <= contentBottom) {
      const visTop = Math.max(contentTop, ptY - 16.0);
      const visBottom = Math.min(parentHitBottom, contentBottom);
      if (visBottom > visTop) {
        addClickable(
          { x: ptX, y: visTop, w: innerW, h: visBottom - visTop },
          () => {
            if (!checkedItems[charge.id]) checkedItems[charge.id] = {};
            checkedItems[charge.id][m.el.id] = !checkedItems[charge.id][m.el.id];
            saveChecks();
            requestRedraw();
          },
          `element-${m.el.id}`
        );
      }
    }

    context.font = '14px system-ui, -apple-system, sans-serif';
    const elColor = isChecked ? c.ink_dim : c.ink;
    m.lines.forEach((line, lIdx) => {
      highlightDetailLine(line, ptX + 48.0, ptY + lIdx * 19.0, elColor);
    });

    let optY = ptY + m.parentH;
    for (const opt of m.optionLayouts) {
      const optKey = `${m.el.id}:${opt.oIdx}`;
      const optChecked = !!chargeChecks[optKey];
      const radioCx = ptX + 55.0;
      const radioCy = optY - 4.0;

      context.beginPath();
      context.arc(radioCx, radioCy, 5.2, 0, Math.PI * 2);
      context.strokeStyle = optChecked ? c.green : c.ink_faint;
      context.lineWidth = optChecked ? 1.5 : 1.25;
      context.stroke();
      if (optChecked) {
        context.beginPath();
        context.arc(radioCx, radioCy, 2.7, 0, Math.PI * 2);
        context.fillStyle = c.green;
        context.fill();
      }

      context.font = '13px system-ui, -apple-system, sans-serif';
      const optColor = optChecked ? c.green : c.ink_dim;
      opt.optLines.forEach((oLine, oLIdx) => {
        highlightDetailLine(oLine, ptX + 68.0, optY + oLIdx * 17.5, optColor);
      });

      const optHitTop = optY - 15.0;
      const optHitBottom = optHitTop + opt.optH;
      if (optHitBottom >= contentTop && optHitTop <= contentBottom) {
        const visTop = Math.max(contentTop, optHitTop);
        const visBottom = Math.min(optHitBottom, contentBottom);
        if (visBottom > visTop) {
          addClickable(
            { x: ptX + 44.0, y: visTop, w: innerW - 44.0, h: visBottom - visTop },
            () => {
              if (!checkedItems[charge.id]) checkedItems[charge.id] = {};
              checkedItems[charge.id][optKey] = !checkedItems[charge.id][optKey];
              const anyOpt = m.optionLayouts.some(o => !!checkedItems[charge.id][`${m.el.id}:${o.oIdx}`]);
              checkedItems[charge.id][m.el.id] = anyOpt;
              saveChecks();
              requestRedraw();
            },
            `element-${m.el.id}-opt-${opt.oIdx}`
          );
        }
      }

      optY += opt.optH;
    }

    curY += m.h;
  });

  curY += 14.0;

  // Short-form wording
  context.font = '700 12px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink;
  const isStatPart3 = charge.id.startsWith('HTA:stat-') || charge.id === 'HTA:172';
  context.fillText(
    isStatPart3 ? 'Information Wording & Description' : 'Regulation Short-Form Wording (O. Reg. 950)',
    x + PAD,
    curY
  );
  curY += 18.0;

  context.font = 'italic 13px system-ui, -apple-system, sans-serif';
  wordingLines.forEach(line => {
    highlightDetailLine(line, x + PAD, curY, c.ink_dim);
    curY += 18.0;
  });
  curY += 16.0;

  // Penalty
  context.font = '700 12px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink;
  context.fillText(`Penalty · ${charge.part}`, x + PAD, curY);
  curY += 18.0;

  context.font = '14px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink;
  const fineDisplay = typeof charge.setFine === 'number'
    ? `• Set fine: $${formatFineAmount(charge.setFine)} (Total payable: $${formatFineAmount(charge.totalPayable)})`
    : `• ${charge.totalPayable}`;
  context.fillText(truncateToWidth(context, fineDisplay, innerW), x + PAD, curY);
  curY += 20.0;

  if (typeof charge.points === 'number' && charge.points > 0) {
    context.fillText(`• Demerit points: ${charge.points} points upon conviction`, x + PAD, curY);
    curY += 20.0;
  }

  if (procLines.length > 0) {
    curY += 4.0;
    context.font = '12.5px system-ui, -apple-system, sans-serif';
    procLines.forEach(line => {
      highlightDetailLine(line, x + PAD, curY, c.ink_dim);
      curY += 17.5;
    });
  }

  // Statutory Divider
  curY += 14.0;
  context.beginPath();
  context.moveTo(x + PAD, curY);
  context.lineTo(x + PAD + innerW, curY);
  context.strokeStyle = c.line;
  context.lineWidth = 1.0;
  context.stroke();

  context.fillStyle = c.green;
  roundRect(context, x + PAD, curY + 13.0, 3.0, 28.0, 1.5);
  context.fill();

  context.font = '700 16px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink;
  context.fillText('Statutory text', x + PAD + 13.0, curY + 25.0);

  context.font = '11px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink_faint;
  context.fillText('The wording of the law', x + PAD + 13.0, curY + 40.0);
  curY += 62.0;

  // Official Statute Link
  context.font = '600 12.5px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.link;
  const linkText = formatAuthorityBanner(charge);
  context.fillText(linkText, x + PAD, curY);
  const linkW = context.measureText(linkText).width;
  if (curY >= contentTop && curY - 16.0 <= contentBottom) {
    addClickable({ x: x + PAD, y: curY - 14.0, w: linkW + 10.0, h: 22.0 }, () => {
      window.open(charge.statuteUrl, '_blank', 'noopener,noreferrer');
    }, 'detail-statute-link');
  }
  curY += 24.0;

  context.font = '12px system-ui, -apple-system, sans-serif';
  context.fillStyle = c.ink_dim;
  const secLineText = `${charge.statute} · ${/^Reg\./i.test(charge.section) ? charge.section : `Section ${charge.section}`}`;
  context.fillText(secLineText, x + PAD, curY);
  curY += 18.0;

  context.font = 'italic 12.5px system-ui, -apple-system, sans-serif';
  lastStatuteRenderItalic = statuteMeasureItalic && /\bitalic\b/i.test(context.font);
  for (const line of statuteBodyLines) {
    if (line === null) {
      curY += 7.0;
      continue;
    }
    highlightDetailLine(line, x + PAD, curY, c.ink);
    curY += 18.0;
  }

  // Similar & Related Charges Section (in-app navigation + external Ontario e-Laws fallbacks)
  if (similarMeasured.length > 0 || externalLinks.length > 0) {
    curY += 14.0;
    context.beginPath();
    context.moveTo(x + PAD, curY);
    context.lineTo(x + PAD + innerW, curY);
    context.strokeStyle = c.line;
    context.lineWidth = 1.0;
    context.stroke();

    context.fillStyle = c.green;
    roundRect(context, x + PAD, curY + 13.0, 3.0, 26.0, 1.5);
    context.fill();

    context.textAlign = 'left';
    context.font = '700 15px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink;
    context.fillText('Similar charges', x + PAD + 13.0, curY + 24.0);

    context.font = '11px system-ui, -apple-system, sans-serif';
    context.fillStyle = c.ink_faint;
    context.fillText('Related offences & referenced sections', x + PAD + 13.0, curY + 39.0);
    curY += 54.0;

    if (similarMeasured.length > 0) {
      curY += drawGroupedChargeList(context, c, similarMeasured, x + PAD, curY, innerW, contentTop, contentBottom, 'similar');
    }

    if (externalLinks.length > 0) {
      curY += 8.0;
      const extCardH = externalLinks.length * extRowH;
      context.save();
      roundRect(context, x + PAD, curY, innerW, extCardH, 12);
      context.clip();

      externalLinks.forEach((ext, i) => {
        const ey = curY + i * extRowH;
        const extRect = { x: x + PAD, y: ey, w: innerW, h: extRowH };
        const extHovered = isRectHovered(extRect);
        context.fillStyle = extHovered ? c.surface_hover : c.surface;
        context.fillRect(x + PAD, ey, innerW, extRowH);

        if (i > 0) {
          context.beginPath();
          context.moveTo(x + PAD, ey + 0.5);
          context.lineTo(x + PAD + innerW, ey + 0.5);
          context.strokeStyle = c.line;
          context.lineWidth = 1.0;
          context.stroke();
        }

        const midY = ey + extRowH / 2.0;
        context.font = '700 10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        context.fillStyle = c.ink_dim;
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillText(truncateToWidth(context, ext.section || ext.statute, 58.0), x + PAD + 12.0, midY);

        context.font = '600 12px system-ui, -apple-system, sans-serif';
        context.fillStyle = c.link;
        context.fillText(truncateToWidth(context, `${ext.label} (e-Laws)`, innerW - 102.0), x + PAD + ROW_NAME_OFFSET_X, midY);

        context.font = '600 12px system-ui, -apple-system, sans-serif';
        context.textAlign = 'right';
        context.fillText('↗', x + PAD + innerW - 12.0, midY);
        context.textBaseline = 'alphabetic';

        const visTop = Math.max(contentTop, ey);
        const visBottom = Math.min(ey + extRowH, contentBottom);
        if (visBottom > visTop) {
          addClickable(
            { x: extRect.x, y: visTop, w: extRect.w, h: visBottom - visTop },
            () => window.open(ext.url, '_blank', 'noopener,noreferrer'),
            `related-ext-${i}`
          );
        }
      });

      context.restore();
      roundRect(context, x + PAD, curY, innerW, extCardH, 12);
      context.strokeStyle = c.line;
      context.lineWidth = 1.0;
      context.stroke();
    }
  }

  context.restore();
  drawScrollbar(context, c, x + w, contentTop, contentH, detailScrollY, maxDetailScrollY);
}

function drawNavBar(context, x, y, w, h) {
  const c = colors();
  const barY = y + h - NAV_H;

  // Nav surface with crisp rounded top corners
  context.fillStyle = c.screen;
  topRoundedRect(context, x, barY, w, NAV_H, 16);
  context.fill();

  context.beginPath();
  context.moveTo(x, barY);
  context.lineTo(x + w, barY);
  context.strokeStyle = c.line;
  context.lineWidth = 1.0;
  context.stroke();

  const items = [
    { id: 'home', label: 'Home' },
    { id: 'charges', label: 'POA Code' },
    { id: 'saved', label: 'Saved' },
    { id: 'settings', label: 'Settings' }
  ];
  const itemW = w / items.length;

  items.forEach((item, i) => {
    const itemX = x + itemW * i;
    const itemRect = { x: itemX, y: barY, w: itemW, h: NAV_H - 10.0 };
    const hovered = isRectHovered(itemRect);
    const active = !appBarSearchOpen && tab === item.id;
    const cx = itemX + itemW / 2.0;
    const cy = barY + 20.0;
    const color = active ? c.green : hovered ? c.ink : c.ink_faint;

    // Subtle top active pill indicator
    if (active) {
      context.fillStyle = c.green;
      roundRect(context, cx - 12.0, barY + 2.0, 24.0, 2.5, 1.25);
      context.fill();
    }

    context.strokeStyle = color;
    context.lineWidth = 1.55;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (item.id === 'home') {
      context.beginPath();
      context.moveTo(cx - 7.5, cy + 0.5);
      context.lineTo(cx, cy - 6.5);
      context.lineTo(cx + 7.5, cy + 0.5);
      context.stroke();
      context.strokeRect(cx - 5.5, cy + 0.5, 11.0, 7.5);
      context.strokeRect(cx - 2.0, cy + 3.5, 4.0, 4.5);
    } else if (item.id === 'charges') {
      context.beginPath();
      context.moveTo(cx, cy - 5.0);
      context.lineTo(cx, cy + 6.0);
      context.stroke();
      context.beginPath();
      context.moveTo(cx, cy - 5.0);
      context.lineTo(cx - 4.0, cy - 6.0);
      context.lineTo(cx - 7.5, cy - 4.5);
      context.lineTo(cx - 7.5, cy + 4.5);
      context.lineTo(cx - 4.0, cy + 4.0);
      context.lineTo(cx, cy + 6.0);
      context.stroke();
      context.beginPath();
      context.moveTo(cx, cy - 5.0);
      context.lineTo(cx + 4.0, cy - 6.0);
      context.lineTo(cx + 7.5, cy - 4.5);
      context.lineTo(cx + 7.5, cy + 4.5);
      context.lineTo(cx + 4.0, cy + 4.0);
      context.lineTo(cx, cy + 6.0);
      context.stroke();
    } else if (item.id === 'saved') {
      context.beginPath();
      context.moveTo(cx - 5.2, cy - 6.2);
      context.lineTo(cx + 5.2, cy - 6.2);
      context.lineTo(cx + 5.2, cy + 6.2);
      context.lineTo(cx, cy + 2.8);
      context.lineTo(cx - 5.2, cy + 6.2);
      context.closePath();
      context.stroke();
    } else if (item.id === 'settings') {
      // Crisp 8-tooth vector gear icon
      context.beginPath();
      context.arc(cx, cy, 4.7, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(cx, cy, 1.9, 0, Math.PI * 2);
      context.stroke();
      context.save();
      context.lineWidth = 1.85;
      for (let t = 0; t < 8; t++) {
        const ang = (t * Math.PI) / 4;
        context.beginPath();
        context.moveTo(cx + Math.cos(ang) * 4.9, cy + Math.sin(ang) * 4.9);
        context.lineTo(cx + Math.cos(ang) * 6.9, cy + Math.sin(ang) * 6.9);
        context.stroke();
      }
      context.restore();
    }

    context.font = `${active ? '700' : '600'} 9.5px system-ui, -apple-system, sans-serif`;
    context.fillStyle = color;
    context.textAlign = 'center';
    context.fillText(item.label, cx, cy + 16.5);

    addClickable(
      { x: itemX, y: barY, w: itemW, h: NAV_H },
      () => {
        if (appBarSearchOpen) {
          query = '';
          if (searchInput) searchInput.value = '';
          searchScrollY = 0;
        }
        tab = item.id;
        settingsSubView = null;
        openChargeIdx = null;
        appBarSearchOpen = false;
        searchFocused = false;
        pendingDetailReturnScroll = null;
        if (item.id === 'charges') listScrollY = 0;
        if (item.id === 'saved') savedScrollY = 0;
        if (item.id === 'settings') settingsScrollY = 0;
        if (typeof history?.replaceState === 'function') {
          try {
            history.replaceState({ sttView: 'root', tab: item.id, settingsSubView: null, appBarSearchOpen: false }, '');
          } catch {}
        }
        requestRedraw();
      },
      `nav-${item.id}`
    );
  });

  // Home Bar indicator pill
  context.fillStyle = c.ink_dim;
  roundRect(context, x + w / 2.0 - 67.0, y + h - 8.5, 134.0, 4.0, 2);
  context.fill();
}

function wrapLines(context, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (let n = 0; n < words.length; n++) {
    const candidate = line ? `${line} ${words[n]}` : words[n];
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = words[n];
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function pointInRect(x, y, rect) {
  return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function handlePointerAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  let hit = false;
  for (let i = clickables.length - 1; i >= 0; i--) {
    const item = clickables[i];
    if (x >= item.rect.x && x <= item.rect.x + item.rect.w && y >= item.rect.y && y <= item.rect.y + item.rect.h) {
      item.action();
      hit = true;
      break;
    }
  }
  if (!hit && searchFocused && document.activeElement !== searchInput) {
    searchFocused = false;
    requestRedraw();
  }
}

// Inline search input events
if (searchInput) {
  const handleLiveInput = () => {
    setActiveSearchQuery(searchInput.value);
    resetCaretBlink();
    if (!appBarSearchOpen && tab === 'home' && query.length > 0) {
      tab = 'charges';
    }
    draw();
  };

  searchInput.addEventListener('input', handleLiveInput);
  searchInput.addEventListener('compositionupdate', handleLiveInput);
  searchInput.addEventListener('compositionend', handleLiveInput);

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const activeQ = getActiveSearchQuery().trim();
      if (activeQ.length >= 2) {
        addRecentSearch(activeQ);
      }
      if (!appBarSearchOpen && tab === 'home') {
        tab = 'charges';
        listScrollY = 0;
      }
      searchFocused = false;
      stopCaretBlink();
      searchInput.blur();
      draw();
    } else if (e.key === 'Escape') {
      if (getActiveSearchQuery()) {
        setActiveSearchQuery('');
        searchInput.value = '';
        searchTextScrollX = 0;
        resetCaretBlink();
        draw();
      } else if (appBarSearchOpen) {
        stopCaretBlink();
        closeAppBarSearch({ clearQuery: true });
      } else {
        searchFocused = false;
        stopCaretBlink();
        searchInput.blur();
        draw();
      }
    } else {
      resetCaretBlink();
      requestRedraw();
    }
  });

  ['keyup', 'mouseup', 'select'].forEach(evtName => {
    searchInput.addEventListener(evtName, () => {
      if (document.activeElement === searchInput) {
        resetCaretBlink();
        requestRedraw();
      }
    });
  });

  document.addEventListener('selectionchange', () => {
    if (document.activeElement === searchInput && searchFocused) {
      requestRedraw();
    }
  });

  searchInput.addEventListener('focus', () => {
    if (blurHideTimer) {
      clearTimeout(blurHideTimer);
      blurHideTimer = null;
    }
    searchFocused = true;
    resetCaretBlink();
    requestRedraw();
  });

  searchInput.addEventListener('blur', () => {
    if (blurHideTimer) clearTimeout(blurHideTimer);
    blurHideTimer = setTimeout(() => {
      blurHideTimer = null;
      if (pendingPopoverInteraction) {
        pendingPopoverInteraction = false;
        return;
      }
      if (document.activeElement === searchInput) return;
      searchFocused = false;
      stopCaretBlink();
      requestRedraw();
    }, 120);
  });
}

let ignoreNextClick = false;

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  if (pointInRect(px, py, activeSuggestionPopoverRect)) {
    pendingPopoverInteraction = true;
  }
});

canvas.addEventListener('click', e => {
  pendingPopoverInteraction = false;
  if (ignoreNextClick) {
    ignoreNextClick = false;
    return;
  }
  handlePointerAt(e.clientX, e.clientY);
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  hoverPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  requestRedraw();
});

canvas.addEventListener('mouseleave', () => {
  hoverPos = null;
  requestRedraw();
});

// Touch and Wheel Scrolling
let touchStartY = 0;
let touchTotalDelta = 0;

function applyScroll(deltaY) {
  if (openChargeIdx !== null) {
    detailScrollY = Math.max(0, Math.min(maxDetailScrollY, detailScrollY + deltaY));
  } else if (appBarSearchOpen) {
    searchScrollY = Math.max(0, Math.min(maxSearchScrollY, searchScrollY + deltaY));
  } else if (tab === 'charges') {
    listScrollY = Math.max(0, Math.min(maxListScrollY, listScrollY + deltaY));
  } else if (tab === 'saved') {
    savedScrollY = Math.max(0, Math.min(maxSavedScrollY, savedScrollY + deltaY));
  } else if (tab === 'settings') {
    if (settingsSubView === 'rules') {
      rulesScrollY = Math.max(0, Math.min(maxRulesScrollY, rulesScrollY + deltaY));
    } else {
      settingsScrollY = Math.max(0, Math.min(maxSettingsScrollY, settingsScrollY + deltaY));
    }
  }
  requestRedraw();
}

canvas.addEventListener('touchstart', e => {
  const rect = canvas.getBoundingClientRect();
  const px = e.touches[0].clientX - rect.left;
  const py = e.touches[0].clientY - rect.top;
  if (pointInRect(px, py, activeSuggestionPopoverRect)) {
    pendingPopoverInteraction = true;
  }
  touchStartY = e.touches[0].clientY;
  touchTotalDelta = 0;
  hoverPos = null;
}, { passive: true });

canvas.addEventListener('touchmove', e => {
  const touchY = e.touches[0].clientY;
  const deltaY = touchStartY - touchY;
  touchStartY = touchY;
  touchTotalDelta += Math.abs(deltaY);
  applyScroll(deltaY);
}, { passive: true });

canvas.addEventListener('touchend', () => {
  if (touchTotalDelta > 8) {
    ignoreNextClick = true;
  }
}, { passive: true });

canvas.addEventListener('wheel', e => {
  applyScroll(e.deltaY);
}, { passive: true });

if (typeof history?.replaceState === 'function') {
  try {
    history.replaceState({ sttView: 'root', tab, settingsSubView: null, appBarSearchOpen: false }, '');
  } catch {}
}

window.addEventListener('popstate', e => {
  if (ignoreNextPopState) {
    ignoreNextPopState = false;
    return;
  }
  if (openChargeIdx !== null) {
    closeDetail({ fromPopState: true });
    return;
  }
  if (appBarSearchOpen) {
    closeAppBarSearch({ fromPopState: true, clearQuery: true });
    return;
  }
  if (tab === 'settings' && settingsSubView === 'rules') {
    closeRulesSubView({ fromPopState: true });
    return;
  }
  const nextTab = e.state?.tab;
  const nextSub = e.state?.settingsSubView || null;
  if ((nextTab && nextTab !== tab) || nextSub !== settingsSubView) {
    if (nextTab) tab = nextTab;
    settingsSubView = nextSub;
    draw();
  }
});

function showAuthError(msg) {
  if (!authErrorEl) return;
  authErrorEl.textContent = msg;
  authErrorEl.hidden = !msg;
}

authModeSignin?.addEventListener('click', () => {
  authModalMode = 'signin';
  showAuthError('');
  syncAuthModalMode();
  authUsernameInput?.focus();
});

authModeCreate?.addEventListener('click', () => {
  authModalMode = 'create';
  showAuthError('');
  syncAuthModalMode();
  authUsernameInput?.focus();
});

authCloseBtn?.addEventListener('click', () => closeAuthModal());
authCancelBtn?.addEventListener('click', () => closeAuthModal());
authModal?.addEventListener('click', e => {
  if (e.target === authModal) closeAuthModal();
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && authModal && !authModal.hidden) {
    e.preventDefault();
    closeAuthModal();
  }
});

authForm?.addEventListener('submit', e => {
  e.preventDefault();
  showAuthError('');
  const rawName = (authUsernameInput?.value || '').trim();
  const rawBadge = (authBadgeInput?.value || '').trim();
  const rawPin = (authPinInput?.value || '').trim();
  const normId = normalizeProfileId(rawName);

  if (!rawName || !normId) {
    showAuthError('Enter an officer name or username.');
    authUsernameInput?.focus();
    return;
  }

  if (authModalMode === 'create') {
    if (profiles[normId]) {
      showAuthError('Profile already exists. Switch to Sign In.');
      authUsernameInput?.focus();
      return;
    }
    const showCarry = !currentProfileId && hasAnySavedWork();
    const keepCarry = Boolean(showCarry && authCarryInput?.checked);
    let initialData;
    if (keepCarry) {
      initialData = getWorkSnapshot();
      clearGuestStashKeys();
    } else {
      if (!currentProfileId) stashGuestWorkspace();
      else persistActiveWorkspace();
      initialData = {
        saved: [],
        checks: {},
        poaRules: {},
        recentSearches: [],
        selectedStatutes: [...AVAILABLE_STATUTE_CODES],
        isDark: false,
        sort: 'number'
      };
    }
    const nowIso = new Date().toISOString();
    profiles[normId] = {
      id: normId,
      displayName: rawName,
      badge: rawBadge,
      pinHash: rawPin ? hashPin(rawPin) : null,
      createdAt: nowIso,
      updatedAt: nowIso,
      data: initialData
    };
    currentProfileId = normId;
    persistProfilesMap();
    applyWorkSnapshot(initialData);
    closeAuthModal();
    showStatusToast(`Signed in as ${rawName}`);
    return;
  }

  const target =
    profiles[normId] ||
    Object.values(profiles).find(p => p.displayName.trim().toLowerCase() === rawName.toLowerCase());
  if (!target) {
    showAuthError('Profile not found. Switch to Create Profile.');
    authUsernameInput?.focus();
    return;
  }
  if (target.pinHash && (!rawPin || hashPin(rawPin) !== target.pinHash)) {
    showAuthError('Incorrect passcode / PIN.');
    authPinInput?.focus();
    return;
  }
  if (currentProfileId === target.id) {
    closeAuthModal();
    showStatusToast(`Signed in as ${target.displayName}`);
    return;
  }
  if (!currentProfileId) stashGuestWorkspace();
  else persistActiveWorkspace();
  currentProfileId = target.id;
  persistProfilesMap();
  applyWorkSnapshot(target.data);
  closeAuthModal();
  showStatusToast(`Signed in as ${target.displayName}`);
});

importBackupInput?.addEventListener('change', async () => {
  const file = importBackupInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    importWorkBackupPayload(parsed);
  } catch (err) {
    showStatusToast(err?.message || 'Invalid backup JSON file');
  } finally {
    importBackupInput.value = '';
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => reg?.update?.()).catch(() => {});
}

// Initial Render
resize();
