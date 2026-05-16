// OsakaPocket — main app
const TRIP_START = '2026-08-11';
const TRIP_END = '2026-08-17';

const state = {
  currentPage: 'home',
  itinerary: null,
  spots: null,
  prep: null,             // 旅前 To-Do 資料
  emergency: null,        // 緊急資訊資料
  phrases: null,          // 日語短語資料
  phraseCat: 'all',
  phraseQuery: '',
  phraseFav: new Set(),
  speakingId: null,
  transport: null,        // 交通票券資料
  foods: null,
  foodCat: 'all',
  shopping: null,
  shoppingBought: new Set(),
  expenses: null,         // 記帳 array
  expenseInput: { amount: '', label: '', payer: 'me', split: 'both' },
  customSpots: null,      // 自訂景點 array
  spotsView: 'list',      // list | map
  customItinerary: null,  // 行程客製化 {days: {N: {theme?, items?}}}
  editingDay: null,       // 編輯中的當日狀態
  pickerQuery: '',
  pickerCat: 'all',
  spotsScrollY: { list: 0, map: 0 },
  spotFilter: 'all',
  docs: null,             // 卡夾資料（文字部分）
  attach: {},             // 附件 blob URL 快取 {key: {name,type,size,url}}
  cardsOpen: new Set(),   // 卡夾頁哪些 section 展開
  prepDone: new Set(),    // 已勾選的 task id
  prepFilter: 'all',
  prepOpenCats: new Set(),
  prepExpanded: new Set(),
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// ===== PWA installed mode detection + persistent storage request =====
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}
let _persistedFlag = null;
async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    _persistedFlag = await navigator.storage.persist();
    return _persistedFlag;
  } catch { return false; }
}
async function isPersisted() {
  if (_persistedFlag !== null) return _persistedFlag;
  if (!navigator.storage?.persisted) return false;
  try { _persistedFlag = await navigator.storage.persisted(); }
  catch { _persistedFlag = false; }
  return _persistedFlag;
}

// ===== Modal helpers (body scroll lock, bg tap, ESC, auto-focus, focus trap) =====
const _modalStack = [];   // 多層 modal: ['day-edit', 'spot-picker']
function modalOpen(name, customRoot) {
  if (_modalStack.length === 0) document.body.classList.add('modal-open');
  if (!_modalStack.includes(name)) _modalStack.push(name);
  const root = customRoot || document.getElementById('modal-root');
  if (root) installFocusTrap(root);
}
function modalClose(name) {
  const i = _modalStack.indexOf(name);
  if (i >= 0) _modalStack.splice(i, 1);
  if (_modalStack.length === 0) {
    document.body.classList.remove('modal-open');
    removeFocusTrap();
  } else {
    // 上層被關了，重裝下層 modal 的 focus trap
    const root = document.getElementById('modal-root');
    if (root && root.innerHTML) installFocusTrap(root);
  }
}
function modalCloseAll() {
  _modalStack.length = 0;
  document.body.classList.remove('modal-open');
  removeFocusTrap();
  const r = document.getElementById('modal-root');
  if (r) r.innerHTML = '';
}
function modalTopName() { return _modalStack[_modalStack.length - 1]; }

// 全域 ESC 關閉最上層 modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _modalStack.length > 0) {
    const top = modalTopName();
    if (top === 'spot-picker') renderEditModal();  // picker 按 ESC 回 edit
    else if (top === 'image-modal') modalCloseAll();
    else if (top === 'spot-form') { modalClose('spot-form'); document.getElementById('modal-root').innerHTML = ''; }
    else if (top === 'day-edit') { state.editingDay = null; modalClose('day-edit'); document.getElementById('modal-root').innerHTML = ''; }
    else if (top === 'confirm-sheet') { modalClose('confirm-sheet'); document.getElementById('modal-root').innerHTML = ''; }
  }
});

// 自動聚焦 modal 內第一個 input（非 hidden、非 readonly）
function autoFocusFirstInput(root) {
  setTimeout(() => {
    const target = root?.querySelector('input:not([type=hidden]):not([readonly]), textarea, select');
    if (target && !target.value) target.focus();
  }, 80);
}

// Focus trap：Tab 在 modal 內循環，不跳到背景
let _focusTrapHandler = null;
function installFocusTrap(rootEl) {
  removeFocusTrap();
  const focusable = () => rootEl.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  _focusTrapHandler = (e) => {
    if (e.key !== 'Tab') return;
    const els = Array.from(focusable());
    if (els.length === 0) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', _focusTrapHandler);
}
function removeFocusTrap() {
  if (_focusTrapHandler) {
    document.removeEventListener('keydown', _focusTrapHandler);
    _focusTrapHandler = null;
  }
}

// ===== Toast =====
function toast(msg, kind = '') {
  let root = document.querySelector('.toast-root');
  if (!root) { root = document.createElement('div'); root.className = 'toast-root'; document.body.appendChild(root); }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    setTimeout(() => el.remove(), 300);
  }, 2400);
}

// ===== 自訂 Confirm Sheet（取代 confirm()）=====
function confirmSheet({ title = '確定？', message = '', confirmText = '確定', cancelText = '取消', danger = false }) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    // 疊加：暫存當前 modal 內容
    const prevHtml = root.innerHTML;
    const wrap = document.createElement('div');
    wrap.className = 'confirm-sheet-bg';
    wrap.id = 'confirm-sheet-bg';
    wrap.innerHTML = `
      <div class="confirm-sheet" role="dialog">
        <h3 class="confirm-sheet-title">${escapeHtml(title)}</h3>
        ${message ? `<p class="confirm-sheet-msg">${escapeHtml(message)}</p>` : ''}
        <div class="confirm-sheet-actions">
          <button class="cs-cancel" data-cs="cancel">${escapeHtml(cancelText)}</button>
          <button class="cs-confirm ${danger ? 'danger' : ''}" data-cs="ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    modalOpen('confirm-sheet', wrap);
    const finish = (v) => {
      modalClose('confirm-sheet');
      wrap.remove();
      resolve(v);
    };
    wrap.addEventListener('click', e => {
      if (e.target === wrap) finish(false);
      else if (e.target.dataset.cs === 'cancel') finish(false);
      else if (e.target.dataset.cs === 'ok') finish(true);
    });
  });
}

// 只允許 http/https/tel/mailto/maps protocol，擋掉 javascript: 等
const SAFE_PROTOCOLS = ['http:', 'https:', 'tel:', 'mailto:', 'maps:'];
function safeUrl(url) {
  if (!url) return '#';
  try {
    const u = new URL(url, location.href);
    if (SAFE_PROTOCOLS.includes(u.protocol)) return url;
  } catch {}
  return '#';
}

function debounce(fn, ms = 350) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function getNested(obj, path) {
  return path.split('.').reduce((a, k) => a?.[k], obj);
}
function setNested(obj, path, val) {
  if (!path || typeof path !== 'string' || /(^\.)|(\.\.)|(\.$)/.test(path)) return;
  const ks = path.split('.');
  // 任一 segment 為空或為 prototype-pollution 用字 → 直接 reject
  if (ks.some(k => k === '' || k === '__proto__' || k === 'constructor' || k === 'prototype')) return;
  let cur = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    const k = ks[i];
    // 如果父層是 Array，當前 key 必須是非負整數
    if (Array.isArray(cur) && !/^\d+$/.test(k)) return;
    if (cur[k] == null || typeof cur[k] !== 'object') {
      cur[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    }
    cur = cur[k];
  }
  const lastK = ks[ks.length - 1];
  if (Array.isArray(cur) && !/^\d+$/.test(lastK)) return;
  cur[lastK] = val;
}

// ===== Date helpers (一律用日本時區 Asia/Tokyo) =====
const TRIP_TZ = 'Asia/Tokyo';
function todayISO() {
  // 用 en-CA locale 拿到 YYYY-MM-DD，並指定日本時區，避免跨時區飛行時倒數差一天
  return new Intl.DateTimeFormat('en-CA', { timeZone: TRIP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function daysBetween(a, b) {
  // 兩個 'YYYY-MM-DD' 字串都當成日本時區的 00:00 計算
  return Math.round((new Date(b + 'T00:00:00+09:00') - new Date(a + 'T00:00:00+09:00')) / 86400000);
}

// ===== Notes (localStorage) =====
const NOTES_KEY = 'osakapocket.notes.v1';
function loadNotes() {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); }
  catch { return {}; }
}
function saveNote(dayKey, text) {
  const notes = loadNotes();
  if (text.trim()) notes[dayKey] = text;
  else delete notes[dayKey];
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

// ===== IndexedDB =====
const DB = { name: 'osakapocket', version: 1, store: 'kv' };
function dbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB.name, DB.version);
    r.onupgradeneeded = () => r.result.createObjectStore(DB.store);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbGet(k) {
  const db = await dbOpen();
  return new Promise((res, rej) => {
    const r = db.transaction(DB.store, 'readonly').objectStore(DB.store).get(k);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbSet(k, v) {
  const db = await dbOpen();
  return new Promise((res, rej) => {
    const r = db.transaction(DB.store, 'readwrite').objectStore(DB.store).put(v, k);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
async function dbDel(k) {
  const db = await dbOpen();
  return new Promise((res, rej) => {
    const r = db.transaction(DB.store, 'readwrite').objectStore(DB.store).delete(k);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
async function dbAllKeys() {
  const db = await dbOpen();
  return new Promise((res, rej) => {
    const r = db.transaction(DB.store, 'readonly').objectStore(DB.store).getAllKeys();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// ===== Docs (卡夾資料) =====
const DOCS_KEY = 'docs.v1';
const DEFAULT_DOCS = {
  flights: { outbound: {}, return: {} },
  passport: {},
  military: {},
  hotels: [],
  insurance: {},
  cards: [],
  contacts: [],
};
async function loadDocs() {
  if (state.docs) return state.docs;
  const stored = await dbGet(DOCS_KEY);
  state.docs = Object.assign({}, DEFAULT_DOCS, stored || {});
  for (const k of ['flights','passport','military','hotels','insurance','cards','contacts']) {
    if (state.docs[k] == null) state.docs[k] = DEFAULT_DOCS[k];
  }
  if (!state.docs.flights.outbound) state.docs.flights.outbound = {};
  if (!state.docs.flights.return) state.docs.flights.return = {};
  return state.docs;
}
const saveDocs = debounce(async () => {
  if (state.docs) await dbSet(DOCS_KEY, state.docs);
}, 400);

async function loadAttachments() {
  const keys = await dbAllKeys();
  for (const k of keys) {
    if (typeof k !== 'string' || !k.startsWith('attach.')) continue;
    if (state.attach[k]) continue;
    const v = await dbGet(k);
    if (v && v.blob) {
      state.attach[k] = {
        name: v.name, type: v.type, size: v.size,
        url: URL.createObjectURL(v.blob),
      };
    }
  }
}

async function saveAttachment(key, file) {
  await dbSet(key, { name: file.name, type: file.type, size: file.size, blob: file });
  if (state.attach[key]?.url) URL.revokeObjectURL(state.attach[key].url);
  state.attach[key] = {
    name: file.name, type: file.type, size: file.size,
    url: URL.createObjectURL(file),
  };
}

async function deleteAttachment(key) {
  await dbDel(key);
  if (state.attach[key]?.url) URL.revokeObjectURL(state.attach[key].url);
  delete state.attach[key];
}

// ===== Data =====
async function loadData() {
  // 用 allSettled — 即使某個 JSON 載不到，其他頁面照常運作
  const targets = [
    ['itinerary', 'data/itinerary.json', { days: [], tripName: '大阪行程' }],
    ['spots',     'data/spots.json',     { categories: [{id:'all',label:'全部'}], spots: [] }],
    ['prep',      'data/prep.json',      { categories: [], tasks: [] }],
    ['emergency', 'data/emergency.json', { groups: [] }],
    ['phrases',   'data/phrases.json',   { categories: [], phrases: [] }],
    ['transport', 'data/transport.json', { sections: [] }],
    ['foods',     'data/foods.json',     { categories: [{id:'all',label:'全部'}], foods: [] }],
    ['shopping',  'data/shopping.json',  { categories: [], items: [] }],
  ];
  const results = await Promise.allSettled(targets.map(t => fetch(t[1]).then(r => {
    if (!r.ok) throw new Error(`${t[1]} ${r.status}`);
    return r.json();
  })));
  state.loadErrors = [];
  results.forEach((r, i) => {
    const [key, , fallback] = targets[i];
    if (r.status === 'fulfilled') {
      state[key] = r.value;
    } else {
      console.warn(`[loadData] ${key} 載入失敗:`, r.reason?.message);
      state[key] = fallback;
      state.loadErrors.push(key);
    }
  });
}

// ===== Custom Itinerary =====
const CUSTOM_ITINERARY_KEY = 'itinerary.custom.v1';
async function loadCustomItinerary() {
  state.customItinerary = (await dbGet(CUSTOM_ITINERARY_KEY)) || { days: {} };
  if (!state.customItinerary.days) state.customItinerary.days = {};
}
const saveCustomItinerary = debounce(async () => {
  if (state.customItinerary) await dbSet(CUSTOM_ITINERARY_KEY, state.customItinerary);
}, 200);

function getDayData(dayNum) {
  const def = state.itinerary.days.find(d => d.day === dayNum);
  if (!def) return null;
  const custom = state.customItinerary?.days?.[dayNum] || {};
  return {
    ...def,
    theme: custom.theme ?? def.theme,
    items: custom.items
      ? custom.items
      : def.items.map(t => ({ type: 'text', text: t })),
    _hasCustom: custom.theme !== undefined || Array.isArray(custom.items),
  };
}

// ===== Custom Spots =====
const CUSTOM_SPOTS_KEY = 'customSpots.v1';
async function loadCustomSpots() {
  state.customSpots = (await dbGet(CUSTOM_SPOTS_KEY)) || [];
}
const saveCustomSpots = debounce(async () => {
  if (state.customSpots) await dbSet(CUSTOM_SPOTS_KEY, state.customSpots);
}, 200);

function allSpotsList() {
  const built = (state.spots?.spots || []).map(s => ({ ...s, isCustom: false }));
  const custom = (state.customSpots || []).map(s => ({ ...s, isCustom: true, category: 'custom' }));
  return [...built, ...custom];
}

function appleMapsLink(s) {
  if (s.lat && s.lng) {
    return `https://maps.apple.com/?ll=${s.lat},${s.lng}&q=${encodeURIComponent(s.name)}`;
  }
  return `https://maps.apple.com/?q=${encodeURIComponent(s.address || s.name)}`;
}

async function geocodeAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'zh-Hant,ja' } });
  if (res.status === 429) throw new Error('Nominatim 限流（請等 30 秒再試，或手動貼 Google Maps 連結）');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  return json[0] ? { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon), displayName: json[0].display_name } : null;
}

function parseGMapsUrl(url) {
  if (!url) return null;
  let m = url.match(/@(-?[\d.]+),(-?[\d.]+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = url.match(/[?&]q=(-?[\d.]+),(-?[\d.]+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = url.match(/[?&]ll=(-?[\d.]+),(-?[\d.]+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

// ===== Leaflet map =====
let _map = null;
function initMap() {
  if (typeof L === 'undefined') {
    const el = document.getElementById('leaflet-map');
    if (el) el.innerHTML = '<div class="empty"><span class="empty-emoji">🗺</span>地圖載入中或失敗，請檢查網路</div>';
    return;
  }
  const el = document.getElementById('leaflet-map');
  if (!el) return;
  if (_map) { _map.remove(); _map = null; }
  _map = L.map(el).setView([34.68, 135.50], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(_map);

  const filter = state.spotFilter;
  const list = allSpotsList().filter(s => {
    if (!s.lat || !s.lng) return false;
    if (filter !== 'all' && s.category !== filter) return false;
    return true;
  });
  // 用 markerClusterGroup 把重疊的 pin 合併成一個圓圈 + 數字（避免大阪市區擠在一起戳不準）
  const clusterGroup = typeof L.markerClusterGroup === 'function'
    ? L.markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 16,
        maxClusterRadius: 50,
      })
    : null;
  for (const s of list) {
    const icon = L.divIcon({
      className: s.isCustom ? 'pin-custom' : 'pin-builtin',
      html: s.isCustom ? '⭐' : (s.category === 'festival' ? '🔥' : '📍'),
      iconSize: [44, 44],
      iconAnchor: [22, 40],
    });
    const m = L.marker([s.lat, s.lng], { icon });
    if (clusterGroup) clusterGroup.addLayer(m);
    else m.addTo(_map);
    // 用 DOM 而非 HTML 字串，避免 bindPopup 信任未過濾輸入
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = s.name;
    div.appendChild(strong);
    if (s.nameJp) {
      div.appendChild(document.createElement('br'));
      const sm = document.createElement('small');
      sm.textContent = s.nameJp;
      div.appendChild(sm);
    }
    if (s.address) {
      div.appendChild(document.createElement('br'));
      div.appendChild(document.createTextNode(s.address));
    }
    div.appendChild(document.createElement('br'));
    const a = document.createElement('a');
    a.href = safeUrl(appleMapsLink(s));
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '🗺 在地圖開啟';
    div.appendChild(a);
    m.bindPopup(div);
  }
  if (clusterGroup) _map.addLayer(clusterGroup);
  if (list.length) {
    const bounds = L.latLngBounds(list.map(s => [s.lat, s.lng]));
    _map.fitBounds(bounds, { padding: [40, 40] });
  }
  setTimeout(() => _map?.invalidateSize(), 100);
}

// ===== Shopping (購物清單) =====
const SHOPPING_KEY = 'osakapocket.shopping.v1';
function loadShoppingBought() {
  try { state.shoppingBought = new Set(JSON.parse(localStorage.getItem(SHOPPING_KEY) || '[]')); }
  catch { state.shoppingBought = new Set(); }
}
function saveShoppingBought() {
  localStorage.setItem(SHOPPING_KEY, JSON.stringify(Array.from(state.shoppingBought)));
}

// ===== Expenses (記帳) =====
const EXPENSES_KEY = 'expenses.v1';
const JPY_TWD_RATE = 0.20;  // 2026/5 台銀現金約 0.1898 買 / 0.2026 賣，取中位 0.20
async function loadExpenses() {
  state.expenses = (await dbGet(EXPENSES_KEY)) || [];
}
const saveExpenses = debounce(async () => {
  if (state.expenses) await dbSet(EXPENSES_KEY, state.expenses);
}, 200);

function expenseTotals() {
  const list = state.expenses || [];
  let total = 0, mePaid = 0, herPaid = 0, meOwes = 0, herOwes = 0;
  for (const e of list) {
    total += e.amount;
    if (e.payer === 'me') mePaid += e.amount;
    else herPaid += e.amount;
    // split: 'both' = 50/50, 'me' = me only, 'her' = her only
    if (e.split === 'both') {
      const half = e.amount / 2;
      if (e.payer === 'me') herOwes += half; else meOwes += half;
    } else if (e.split === 'me') {
      // 我享受、她付 → 我欠她全額
      if (e.payer === 'her') meOwes += e.amount;
    } else if (e.split === 'her') {
      if (e.payer === 'me') herOwes += e.amount;
    }
  }
  const balance = meOwes - herOwes;  // > 0 → 我欠她 ; < 0 → 她欠我
  return { total, mePaid, herPaid, meOwes, herOwes, balance };
}

// ===== Phrase favorites (localStorage) =====
const PHRASE_FAV_KEY = 'osakapocket.phrase-fav.v1';
function loadPhraseFav() {
  try { state.phraseFav = new Set(JSON.parse(localStorage.getItem(PHRASE_FAV_KEY) || '[]')); }
  catch { state.phraseFav = new Set(); }
}
function savePhraseFav() {
  localStorage.setItem(PHRASE_FAV_KEY, JSON.stringify(Array.from(state.phraseFav)));
}

// ===== Speech Synthesis (iOS TTS) =====
let _jpVoice = null;
let _ttsWarm = false;
function pickJpVoice() {
  if (_jpVoice) return _jpVoice;
  const voices = speechSynthesis.getVoices();
  _jpVoice = voices.find(v => v.lang === 'ja-JP')
          || voices.find(v => v.lang?.startsWith('ja'))
          || null;
  return _jpVoice;
}
function speakJp(text, onEnd) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return; }
  const realSpeak = () => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 0.9;
    const v = pickJpVoice();
    if (v) u.voice = v;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    speechSynthesis.speak(u);
  };
  // iOS PWA warm-up：第一次播放前先 fire 一個無音量 utterance
  if (!_ttsWarm) {
    const warm = new SpeechSynthesisUtterance(' ');
    warm.lang = 'ja-JP';
    warm.volume = 0;
    speechSynthesis.speak(warm);
    _ttsWarm = true;
    setTimeout(realSpeak, 120);
  } else {
    realSpeak();
  }
}
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => { _jpVoice = null; pickJpVoice(); };
}

// ===== Prep To-Do =====
const PREP_DONE_KEY = 'prep.done.v1';

async function loadPrepDone() {
  const stored = await dbGet(PREP_DONE_KEY);
  state.prepDone = new Set(stored || []);
  // 首次進入：自動展開含 urgent / overdue 的 category 與「必辦」最多 3 個
  if (state.prepOpenCats.size === 0 && state.prep) {
    const cats = new Set();
    for (const t of state.prep.tasks) {
      if (state.prepDone.has(t.id)) continue;
      const st = taskStatus(t);
      if (st === 'urgent' || st === 'overdue') cats.add(t.category);
    }
    cats.forEach(c => state.prepOpenCats.add(c));
  }
}
const savePrepDone = debounce(async () => {
  await dbSet(PREP_DONE_KEY, Array.from(state.prepDone));
}, 200);

function daysUntilDeadline(task) {
  const today = todayISO();
  const daysUntilTrip = daysBetween(today, TRIP_START);
  return daysUntilTrip - (task.weeksAhead || 0) * 7;
}
function taskStatus(task) {
  if (state.prepDone.has(task.id)) return 'done';
  const d = daysUntilDeadline(task);
  if (d < 0) return 'overdue';
  if (d <= 7) return 'urgent';
  if (d <= 14) return 'upcoming';
  return 'later';
}

// ===== Render: Home =====
function renderHome() {
  const today = todayISO();
  const days = state.itinerary.days;
  let countdown = '';
  let todayCard = '';

  if (today < TRIP_START) {
    const n = daysBetween(today, TRIP_START);
    countdown = `
      <div class="countdown-card">
        <div class="countdown-label">DAYS UNTIL OSAKA</div>
        <div class="countdown-num">${n}</div>
        <div class="countdown-unit">天後出發</div>
        <div class="countdown-dates">2026 / 8 / 11 — 8 / 17  ・ 七日六夜</div>
      </div>`;
  } else if (today <= TRIP_END) {
    const dayN = daysBetween(TRIP_START, today) + 1;
    const info = days.find(d => d.date === today);
    countdown = `
      <div class="countdown-card">
        <div class="countdown-label">在大阪 ・ DAY ${dayN} / 7</div>
        <div class="countdown-num">${dayN}</div>
        <div class="countdown-unit">${escapeHtml(info?.theme || '')}</div>
        <div class="countdown-dates">${today.replace(/-/g, ' / ')}（${info?.weekday || ''}）</div>
      </div>`;
    if (info) {
      todayCard = `
        <div class="card">
          <h3 class="card-title">📋 今日行程</h3>
          <ul class="day-items">
            ${info.items.map(it => `<li>${escapeHtml(it)}</li>`).join('')}
          </ul>
        </div>`;
    }
  } else {
    countdown = `
      <div class="countdown-card">
        <div class="countdown-label">WELCOME HOME</div>
        <div class="countdown-num">✈</div>
        <div class="countdown-unit">旅程結束 — 想念大阪了嗎？</div>
        <div class="countdown-dates">2026 / 8 / 11 — 8 / 17</div>
      </div>`;
  }

  // 偵測是否安裝為 standalone PWA — 沒裝的話顯示醒目提示
  const installBanner = !isStandalone() ? `
    <div class="warn-card" style="background:linear-gradient(135deg,#fff4e0 0%,#ffe0b8 100%);border-color:#ffc890;color:#8b5a2b">
      <strong style="color:#c47514">📲 請加到主畫面才能完整離線使用</strong><br>
      你現在是在 Safari 內看這個 App。<strong>Safari 模式下資料 7 天會被 iOS 清掉</strong>。<br>
      ・ 點 Safari 下方分享 ⤴ → 加入主畫面<br>
      ・ 加完從桌面 🐙 圖示打開 — 變 standalone 模式<br>
      ・ standalone 模式下 <strong>不受 7 天清除限制</strong>（WebKit 官方政策豁免）
    </div>
  ` : '';

  return `
    <div class="page">
      ${installBanner}
      ${countdown}
      ${todayCard}

      <div id="home-actions"></div>

      <div class="warn-card" style="background:linear-gradient(135deg,#fff0f0 0%,#ffe1e1 100%);border-color:#ffc1c1;color:#8b3a3a">
        <strong style="color:#c12d2d">🚨 行程撞 Obon 盂蘭盆節（8/13–16）</strong><br>
        日本最大返鄉週，<strong>整段行程 3-5 天都在 Obon 期間</strong>。影響：<br>
        ・ 30-50% 家族經營餐廳 <strong>8/13-15 公休</strong>（自由軒、北極星可能受影響，建議事先電話確認 + 訂位）<br>
        ・ 新幹線、近鐵 8/13(下行)、8/16(上行) 指定席 1 個月前秒殺 — 如有跨城需求<strong>立即訂</strong><br>
        ・ 京都 8/16 五山送り火 = Obon 最後一晚，市內人潮 + 交通管制爆炸<br>
        ・ 飯店漲價 30-50%，請確認訂房已含這些天<br>
        詳見「✅ 旅前 To-Do」內的「Obon 應變」項目。
      </div>

      <div class="warn-card">
        <strong>🪖 役男短期出境核准（24 歲未役）</strong><br>
        出國前須在役政署線上申請、隨身攜帶核准函（紙本 + 手機備份）。<br>
        在卡夾頁的「役男核准」section 上傳 PDF。
      </div>

      <div class="warn-card">
        <strong>☀️ 8 月大阪超熱注意</strong><br>
        高溫 33–36°C、濕度 70 % +、午後常有雷陣雨。<br>
        ・ 隨身帶水、防曬乳、手持風扇<br>
        ・ 避開 11–15 點戶外行程<br>
        ・ 便利商店「冷感濕巾」必買
      </div>

      <div class="card card-soft">
        <h3 class="card-title">🌡 天氣速覽 ・ 8 月平均</h3>
        <div class="weather-row">
          <span>大阪市</span><span><strong>33° / 26°C</strong> ・ 體感悶熱</span>
        </div>
        <div class="weather-row" style="margin-top:6px">
          <span>京都</span><span><strong>34° / 25°C</strong> ・ 盆地更熱</span>
        </div>
        <div class="weather-row" style="margin-top:6px">
          <span>奈良</span><span><strong>33° / 24°C</strong> ・ 山區涼爽</span>
        </div>
      </div>

      <div class="card card-soft">
        <h3 class="card-title">💴 出發前提醒</h3>
        <ul class="day-items" style="margin:0">
          <li>役男短期出境核准（最重要！）</li>
          <li>填 Visit Japan Web（入境用 QR）</li>
          <li>下載 Google 翻譯離線日文 / 英文包</li>
          <li>確認信用卡海外免手續費 + 海外旅平險</li>
          <li>eSIM 或 WiFi 機 — eSIM 較方便</li>
          <li>機場領 ICOCA 或先在台灣買關空特急票</li>
        </ul>
      </div>
    </div>`;
}

// ===== Home actionable cards =====
async function fillHomeActions() {
  const root = document.getElementById('home-actions');
  if (!root) return;
  // 先載入所需資料
  await Promise.all([loadPrepDone(), loadDocs(), loadCustomSpots()]);
  // 計算 urgent 數量
  let urgentCount = 0;
  if (state.prep) {
    for (const t of state.prep.tasks) {
      if (state.prepDone.has(t.id)) continue;
      const st = taskStatus(t);
      if (st === 'urgent' || st === 'overdue') urgentCount++;
    }
  }
  // 役男狀態
  const mil = state.docs?.military || {};
  const milStatus = mil.status === 'approved' ? '已核准 ✓'
                  : mil.status === 'submitted' ? '已送件，等核准'
                  : '待辦！⚠';
  const milKind = mil.status === 'approved' ? '' : 'urgent';
  // 卡夾完成度
  const docs = state.docs || {};
  const docFilled = (Object.keys(docs.flights?.outbound || {}).length > 0 ? 1 : 0)
                  + (Object.keys(docs.flights?.return || {}).length > 0 ? 1 : 0)
                  + (Object.keys(docs.passport || {}).length > 0 ? 1 : 0)
                  + ((docs.hotels || []).length > 0 ? 1 : 0)
                  + (Object.keys(docs.insurance || {}).length > 0 ? 1 : 0);
  // 上次備份 — standalone PWA 已豁免 7 天清除，僅在「未安裝」或「真的很久沒備份」時 urgent
  const lastBackup = localStorage.getItem('osakapocket.lastBackup');
  const daysSinceBackup = lastBackup
    ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000)
    : null;
  const standaloneMode = isStandalone();
  const backupUrgent = !standaloneMode || (daysSinceBackup !== null && daysSinceBackup >= 30);

  const cards = [
    {
      go: 'prep',
      icon: '🚨',
      label: urgentCount > 0 ? '該辦了 / 已逾期' : '旅前 To-Do',
      sub: urgentCount > 0 ? `${urgentCount} 項需要現在處理` : '檢查所有準備項目',
      count: urgentCount,
      urgent: urgentCount > 0,
    },
    {
      go: 'cards',
      icon: '🪖',
      label: '役男核准',
      sub: milStatus,
      count: '',
      urgent: milKind === 'urgent',
    },
    {
      go: 'cards',
      icon: '🪪',
      label: '我的卡夾',
      sub: `航班 / 護照 / 飯店 / 保險 ${docFilled}/5`,
      count: docFilled,
      urgent: false,
    },
    {
      go: 'backup',
      icon: '💾',
      label: '備份',
      sub: !standaloneMode
        ? '⚠ 未加到主畫面，資料 7 天會被清'
        : lastBackup
          ? `上次 ${daysSinceBackup} 天前`
          : '建議出發前匯出一次（換手機保險）',
      count: '',
      urgent: backupUrgent,
    },
  ];

  root.innerHTML = `
    <div class="section-title">主要功能</div>
    ${cards.map(c => `
      <button class="action-card ${c.urgent ? 'urgent' : ''}" data-go="${c.go}">
        <span class="ac-icon">${c.icon}</span>
        <span class="ac-content">
          <span class="ac-label">${escapeHtml(c.label)}</span>
          <span class="ac-sub">${escapeHtml(c.sub)}</span>
        </span>
        ${c.count !== '' && c.count !== 0 ? `<span class="ac-count">${c.count}</span>` : ''}
      </button>`).join('')}
  `;
  root.querySelectorAll('[data-go]').forEach(b => {
    b.addEventListener('click', () => navigate(b.dataset.go));
  });
}

// ===== Render: Itinerary =====
function renderItinerary() {
  const today = todayISO();
  const notes = loadNotes();
  const cards = state.itinerary.days.map(d => {
    const data = getDayData(d.day);
    const isToday = data.date === today;
    const noteVal = escapeHtml(notes[d.day] || '');
    const customMark = data._hasCustom ? '<span title="已自訂" style="color:var(--primary);font-size:11px;margin-left:4px">✏</span>' : '';
    return `
      <div class="day-card ${isToday ? 'today' : ''}">
        <div class="day-head" data-day-edit="${d.day}" style="cursor:pointer">
          <div class="day-num">
            <span class="day-badge">${d.day}</span>
            Day ${d.day}${customMark}
            ${isToday ? '<span style="color:var(--primary);font-size:12px;font-weight:600">・今天</span>' : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="day-date">${data.date.slice(5).replace('-', ' / ')}（${data.weekday}）</div>
            <button class="day-edit-btn" data-day-edit="${d.day}" aria-label="編輯這天">✏</button>
          </div>
        </div>
        <div class="day-theme">${escapeHtml(data.theme)}</div>
        <ul class="day-items">
          ${data.items.map(it => {
            const text = escapeHtml(it.text);
            if (it.type === 'spot') return `<li class="item-spot">${text}</li>`;
            return `<li>${text}</li>`;
          }).join('')}
        </ul>
        <label class="note-label">📝 我的備註（自動儲存到此手機）</label>
        <textarea class="day-notes" data-day="${d.day}" placeholder="訂位資訊、想吃什麼、突發狀況...">${noteVal}</textarea>
      </div>`;
  }).join('');

  return `
    <div class="page">
      <div class="section-title">${escapeHtml(state.itinerary.tripName)}</div>
      ${cards}
      <p class="empty" style="padding:14px;font-size:11px">點每日「✏」可編輯主題、條目、拖拉重排、從景點清單挑。改動自動存到此手機。</p>
    </div>`;
}

// ===== Day Edit Modal =====
function renderEditItemRow(item, idx) {
  return `
    <div class="edit-item-row" data-idx="${idx}">
      <span class="drag-handle" aria-label="拖拉重排">⋮⋮</span>
      ${item.type === 'spot' ? `<span class="item-spot-badge" title="景點">📍</span>` : ''}
      <input class="edit-item-input" type="text" value="${escapeHtml(item.text)}" data-idx="${idx}" placeholder="條目內容">
      <button class="edit-item-del" data-del="${idx}" aria-label="刪除">✕</button>
    </div>`;
}

function renderEditModal() {
  const ed = state.editingDay;
  if (!ed) return;
  const root = $('#modal-root');
  const dayInfo = state.itinerary.days.find(d => d.day === ed.day);
  root.innerHTML = `
    <div class="modal-form-wrap" id="day-edit-modal">
      <div class="modal-form">
        <div class="modal-form-head">
          <div class="modal-form-title">編輯 Day ${ed.day}（${dayInfo.date.slice(5).replace('-', '/')} ${dayInfo.weekday}）</div>
          <button class="modal-form-close" data-form-close aria-label="關閉">✕</button>
        </div>
        <div class="field">
          <label class="field-label">主題</label>
          <input id="de-theme" type="text" value="${escapeHtml(ed.theme || '')}" placeholder="今日主軸（例：京都五山送り火）">
        </div>
        <label class="field-label" style="margin-bottom:8px;display:block">行程條目（按住 ⋮⋮ 拖拉重排）</label>
        <div id="de-items">
          ${ed.items.length === 0
            ? '<div class="empty" style="padding:20px;font-size:12px">沒有條目，點下方按鈕新增</div>'
            : ed.items.map(renderEditItemRow).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn-secondary" id="de-add-text" style="flex:1">＋ 新增文字</button>
          <button class="btn-secondary" id="de-add-spot" style="flex:1">📍 從景點挑</button>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
          <button class="btn-secondary" id="de-reset" style="width:100%;background:#fff4e0;color:#8b5a2b;border-color:#ffd9a8">🔄 重設這天為預設</button>
        </div>
        <div class="modal-form-actions" style="margin-top:14px">
          <button class="btn-secondary" data-form-close>取消</button>
          <button class="btn-add" id="de-save">儲存</button>
        </div>
      </div>
    </div>`;
  attachEditModalHandlers();
}

function attachEditModalHandlers() {
  const root = $('#modal-root');
  modalOpen('day-edit');
  autoFocusFirstInput(root);
  const close = () => {
    state.editingDay = null;
    modalClose('day-edit');
    root.innerHTML = '';
  };
  $$('[data-form-close]', root).forEach(b => b.addEventListener('click', close));
  // 點背景關閉
  const wrap = $('#day-edit-modal', root);
  wrap?.addEventListener('click', e => { if (e.target === wrap) close(); });

  $('#de-theme', root)?.addEventListener('input', e => {
    state.editingDay.theme = e.target.value;
  });
  $$('.edit-item-input', root).forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = parseInt(e.target.dataset.idx, 10);
      if (state.editingDay.items[idx]) state.editingDay.items[idx].text = e.target.value;
    });
  });
  $$('[data-del]', root).forEach(b => {
    b.addEventListener('click', () => {
      const idx = parseInt(b.dataset.del, 10);
      state.editingDay.items.splice(idx, 1);
      renderEditModal();
    });
  });

  // Sortable drag/drop with auto-scroll
  const list = $('#de-items', root);
  if (list && typeof Sortable !== 'undefined' && state.editingDay.items.length > 1) {
    Sortable.create(list, {
      handle: '.drag-handle',
      animation: 150,
      forceFallback: true,
      fallbackTolerance: 5,
      scroll: true,           // 自動滾動
      scrollSensitivity: 80,
      scrollSpeed: 12,
      bubbleScroll: true,
      onEnd: e => {
        if (e.oldIndex === e.newIndex) return;
        const items = state.editingDay.items;
        const moved = items.splice(e.oldIndex, 1)[0];
        items.splice(e.newIndex, 0, moved);
        renderEditModal();
      },
    });
  }

  $('#de-add-text', root)?.addEventListener('click', () => {
    state.editingDay.items.push({ type: 'text', text: '' });
    renderEditModal();
    setTimeout(() => {
      const inputs = $$('.edit-item-input', root);
      inputs[inputs.length - 1]?.focus();
    }, 50);
  });

  $('#de-add-spot', root)?.addEventListener('click', () => showSpotPicker());

  $('#de-reset', root)?.addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: `重設 Day ${state.editingDay.day}？`,
      message: '這天會還原為預設行程，所有自訂條目消失。',
      confirmText: '重設', danger: true,
    });
    if (!ok) return;
    if (state.customItinerary.days[state.editingDay.day]) {
      delete state.customItinerary.days[state.editingDay.day];
      saveCustomItinerary();
    }
    close();
    if (state.currentPage === 'itinerary') {
      $('#app').innerHTML = renderItinerary();
      attachHandlers('itinerary');
    }
  });

  $('#de-save', root)?.addEventListener('click', () => {
    const ed = state.editingDay;
    const def = state.itinerary.days.find(d => d.day === ed.day);
    const custom = {};
    if (ed.theme !== def.theme) custom.theme = ed.theme;
    const defItems = def.items.map(t => ({ type: 'text', text: t }));
    if (JSON.stringify(ed.items) !== JSON.stringify(defItems)) custom.items = ed.items;
    if (!state.customItinerary.days) state.customItinerary.days = {};
    if (Object.keys(custom).length > 0) {
      state.customItinerary.days[ed.day] = custom;
    } else {
      delete state.customItinerary.days[ed.day];
    }
    saveCustomItinerary();
    close();
    if (state.currentPage === 'itinerary') {
      $('#app').innerHTML = renderItinerary();
      attachHandlers('itinerary');
    }
  });
}

function showDayEdit(dayNum) {
  const root = $('#modal-root');
  if (root.innerHTML) return;
  const data = getDayData(dayNum);
  state.editingDay = {
    day: dayNum,
    theme: data.theme,
    items: data.items.map(it => ({ ...it })),
  };
  renderEditModal();
}

// ===== Spot Picker (從景點清單挑選) =====
function showSpotPicker() {
  state.pickerQuery = '';
  state.pickerCat = 'all';
  renderSpotPicker();
}

function renderSpotPicker() {
  const root = $('#modal-root');
  const cats = state.spots.categories;
  const q = state.pickerQuery.toLowerCase().trim();
  const cat = state.pickerCat;
  const list = allSpotsList().filter(s => {
    if (cat !== 'all' && s.category !== cat) return false;
    if (q) {
      const hay = `${s.name} ${s.nameJp || ''} ${s.address || ''} ${s.tag || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  root.innerHTML = `
    <div class="modal-form-wrap" id="spot-picker-modal">
      <div class="modal-form">
        <div class="modal-form-head">
          <div class="modal-form-title">從景點清單挑（${list.length}）</div>
          <button class="modal-form-close" data-picker-back>↩ 回</button>
        </div>
        <div class="search-bar picker-search">
          <span class="icon">🔍</span>
          <input id="picker-search-input" type="search" placeholder="搜尋名稱 / 地址 / tag" value="${escapeHtml(state.pickerQuery)}" autocomplete="off">
        </div>
        <div class="filter-bar">
          ${cats.map(c => `
            <button class="filter-chip ${cat === c.id ? 'active' : ''}" data-picker-cat="${c.id}">
              ${escapeHtml(c.label)}
            </button>`).join('')}
        </div>
        ${list.length === 0
          ? '<div class="empty"><span class="empty-emoji">🔍</span>沒有符合景點</div>'
          : list.map(s => `
              <button class="picker-spot-card" data-pick-spot="${s.id}">
                <div class="picker-spot-content">
                  <div class="picker-spot-name">${escapeHtml(s.name)}</div>
                  ${s.nameJp ? `<div class="picker-spot-jp">${escapeHtml(s.nameJp)}${s.tag ? ' ・ ' + escapeHtml(s.tag) : ''}</div>` : ''}
                </div>
                <span class="picker-spot-tag">＋</span>
              </button>`).join('')
        }
      </div>
    </div>`;
  attachSpotPickerHandlers();
}

function attachSpotPickerHandlers() {
  const root = $('#modal-root');
  modalOpen('spot-picker');
  // 從 picker 回 edit 時要 blur 所有 input 收掉 IME composing
  const back = () => {
    document.activeElement?.blur?.();
    modalClose('spot-picker');
    renderEditModal();  // 重建 edit modal
  };
  $$('[data-picker-back]', root).forEach(b => b.addEventListener('click', back));
  // 點背景回 edit
  const wrap = $('#spot-picker-modal', root);
  wrap?.addEventListener('click', e => { if (e.target === wrap) back(); });
  const search = $('#picker-search-input', root);
  if (search) {
    const onSearch = debounce(() => {
      state.pickerQuery = search.value;
      renderSpotPicker();
    }, 200);
    search.addEventListener('input', onSearch);
  }
  $$('[data-picker-cat]', root).forEach(c => {
    c.addEventListener('click', () => {
      state.pickerCat = c.dataset.pickerCat;
      renderSpotPicker();
    });
  });
  $$('[data-pick-spot]', root).forEach(b => {
    b.addEventListener('click', () => {
      const spotId = b.dataset.pickSpot;
      const spot = allSpotsList().find(s => s.id === spotId);
      if (!spot) return;
      state.editingDay.items.push({
        type: 'spot',
        spotId: spotId,
        text: spot.name,
      });
      modalClose('spot-picker');
      renderEditModal();
    });
  });
}

// ===== Render: Spots =====
function renderSpotCard(s) {
  const tagHtml = s.tag ? `<span class="spot-tag">${escapeHtml(s.tag)}</span>` : '';
  const metaHtml = s.isCustom ? '' : `
    <dl class="spot-meta">
      <dt>地址</dt><dd>${escapeHtml(s.address || '—')}</dd>
      <dt>時間</dt><dd>${escapeHtml(s.hours || '—')}</dd>
      <dt>費用</dt><dd>${escapeHtml(s.fee || '—')}</dd>
      <dt>建議</dt><dd>${escapeHtml(s.duration || '—')}</dd>
      <dt>交通</dt><dd>${escapeHtml(s.access || '—')}</dd>
    </dl>`;
  const customMeta = s.isCustom ? `
    ${s.address ? `<div class="spot-tip" style="border-color:var(--accent)">📍 ${escapeHtml(s.address)}</div>` : ''}
    ${s.lat && s.lng ? `<div style="font-size:11px;color:var(--muted);margin-top:6px">座標 ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}</div>` : '<div style="font-size:11px;color:var(--muted);margin-top:6px">⚠ 沒座標，不會在地圖顯示 pin</div>'}
    ${s.note ? `<div class="spot-tip">💡 ${escapeHtml(s.note)}</div>` : ''}
  ` : (s.tip ? `<div class="spot-tip">💡 ${escapeHtml(s.tip)}</div>` : '');
  const editBtns = s.isCustom ? `
    <button class="spot-action" data-edit-spot="${s.id}">✏ 編輯</button>
    <button class="spot-action" data-del-spot="${s.id}" style="background:#fce5e5;color:#c12d2d;border-color:#f5b5b5">刪除</button>
  ` : '';
  return `
    <div class="spot-card ${s.isCustom ? 'custom' : ''}">
      <div class="spot-head">
        <div>
          <span class="spot-name">${escapeHtml(s.name)}</span>
          ${s.nameJp ? `<span class="spot-name-jp">${escapeHtml(s.nameJp)}</span>` : ''}
        </div>
        ${tagHtml}
      </div>
      ${metaHtml}
      ${customMeta}
      <div class="spot-actions">
        <a class="spot-action primary" href="${escapeHtml(safeUrl(appleMapsLink(s)))}" target="_blank" rel="noopener">🗺 在地圖 App 開啟</a>
        ${editBtns}
      </div>
    </div>`;
}

function renderSpots() {
  const cats = state.spots.categories;
  const filter = state.spotFilter;
  const view = state.spotsView;
  const all = allSpotsList();
  const list = all.filter(s => filter === 'all' || s.category === filter);
  const customCount = state.customSpots?.length || 0;

  const filterBarHtml = `
    <div class="filter-bar">
      ${cats.map(c => {
        const lbl = c.id === 'custom' ? `${escapeHtml(c.label)} (${customCount})` : escapeHtml(c.label);
        return `<button class="filter-chip ${filter === c.id ? 'active' : ''}" data-cat="${c.id}">${lbl}</button>`;
      }).join('')}
    </div>`;

  return `
    <div class="page">
      <div class="view-toggle">
        <button class="vt-btn ${view === 'list' ? 'active' : ''}" data-view="list">📋 清單</button>
        <button class="vt-btn ${view === 'map' ? 'active' : ''}" data-view="map">🗺 地圖</button>
      </div>
      ${filterBarHtml}
      ${view === 'list' ? `
        ${list.length === 0
          ? `<div class="empty"><span class="empty-emoji">🐙</span>${filter === 'custom' ? '還沒有自訂景點，點右下 + 新增' : '這個分類沒有景點'}</div>`
          : list.map(renderSpotCard).join('')
        }
      ` : `
        <div id="leaflet-map"></div>
        <p style="font-size:12px;color:var(--muted);text-align:center;margin-top:10px">
          📍 內建景點 ・ ⭐ 自訂景點 ・ 🔥 祭典 ・ 點 pin 看詳情<br>
          地圖瓦片需網路；點開的 iPhone 地圖 App 可離線
        </p>
      `}
      <button class="fab-add" id="fab-add-spot" aria-label="新增景點">+</button>
    </div>`;
}

// ===== Modal: 新增 / 編輯自訂景點 =====
function renderSpotForm(spot) {
  const editing = !!spot?.id;
  const s = spot || { name: '', nameJp: '', address: '', note: '', lat: '', lng: '' };
  return `
    <div class="modal-form-wrap" id="spot-form-modal">
      <div class="modal-form">
        <div class="modal-form-head">
          <div class="modal-form-title">${editing ? '編輯' : '新增'}景點</div>
          <button class="modal-form-close" data-form-close aria-label="關閉">✕</button>
        </div>
        <div class="field">
          <label class="field-label">名稱 *</label>
          <input id="sp-name" type="text" placeholder="例：奶奶推薦的拉麵店" value="${escapeHtml(s.name)}">
        </div>
        <div class="field">
          <label class="field-label">日文名（給計程車看）</label>
          <input id="sp-nameJp" type="text" placeholder="例：神座" value="${escapeHtml(s.nameJp || '')}">
        </div>
        <div class="field">
          <label class="field-label">地址（中文或日文）</label>
          <input id="sp-address" type="text" placeholder="例：大阪市西区南堀江 1-7-6" value="${escapeHtml(s.address || '')}">
          <div class="geocode-row">
            <button id="sp-search" type="button">🔍 從地址找座標</button>
          </div>
          <div class="geocode-status" id="sp-status"></div>
        </div>
        <div class="field">
          <label class="field-label">或貼上 Google Maps 連結（自動讀座標）</label>
          <input id="sp-gmaps" type="text" placeholder="https://www.google.com/maps/..." autocomplete="off">
          <div class="hint">在 Google Maps 點分享 → 複製連結。如果是 maps.app.goo.gl 短網址，請先在 Google Maps 開啟轉成長網址</div>
        </div>
        <div class="field-grid">
          <div class="field" style="margin:0">
            <label class="field-label">緯度 (lat)</label>
            <input id="sp-lat" type="number" step="any" inputmode="decimal" value="${s.lat ?? ''}">
          </div>
          <div class="field" style="margin:0">
            <label class="field-label">經度 (lng)</label>
            <input id="sp-lng" type="number" step="any" inputmode="decimal" value="${s.lng ?? ''}">
          </div>
        </div>
        <div class="hint" style="margin-top:6px">沒填座標也能存，只是不會在地圖上顯示 pin</div>
        <div class="field">
          <label class="field-label">備註</label>
          <input id="sp-note" type="text" placeholder="想吃什麼 / 注意事項" value="${escapeHtml(s.note || '')}">
        </div>
        <div class="modal-form-actions">
          <button class="btn-secondary" data-form-close>取消</button>
          <button class="btn-add" id="sp-save">${editing ? '儲存' : '新增'}</button>
        </div>
      </div>
    </div>`;
}

function showSpotForm(spot) {
  const root = $('#modal-root');
  if (root.innerHTML) return;
  root.innerHTML = renderSpotForm(spot);
  modalOpen('spot-form');
  autoFocusFirstInput(root);

  const close = () => { modalClose('spot-form'); root.innerHTML = ''; };
  $$('[data-form-close]', root).forEach(b => b.addEventListener('click', close));
  // 點背景關閉
  const wrap = $('#spot-form-modal', root);
  wrap?.addEventListener('click', e => { if (e.target === wrap) close(); });

  // Geocoding
  $('#sp-search', root)?.addEventListener('click', async () => {
    const addr = $('#sp-address', root).value.trim();
    if (!addr) return;
    const status = $('#sp-status', root);
    status.className = 'geocode-status show';
    status.textContent = '搜尋中...';
    try {
      const r = await geocodeAddress(addr);
      if (r) {
        $('#sp-lat', root).value = r.lat.toFixed(6);
        $('#sp-lng', root).value = r.lng.toFixed(6);
        status.className = 'geocode-status show ok';
        status.textContent = '✓ 找到：' + r.displayName.slice(0, 50);
      } else {
        status.className = 'geocode-status show err';
        status.textContent = '找不到。改用日文地址，或貼 Google Maps 連結。';
      }
    } catch (e) {
      status.className = 'geocode-status show err';
      status.textContent = '搜尋失敗（要連網）：' + e.message;
    }
  });

  // Parse GMaps URL
  $('#sp-gmaps', root)?.addEventListener('input', () => {
    const url = $('#sp-gmaps', root).value;
    const r = parseGMapsUrl(url);
    if (r) {
      $('#sp-lat', root).value = r.lat;
      $('#sp-lng', root).value = r.lng;
      const status = $('#sp-status', root);
      status.className = 'geocode-status show ok';
      status.textContent = `✓ 從連結讀到座標 ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`;
    }
  });

  // Save
  $('#sp-save', root)?.addEventListener('click', () => {
    const name = $('#sp-name', root).value.trim();
    if (!name) { toast('請填名稱', 'err'); $('#sp-name', root)?.focus(); return; }
    const data = {
      id: spot?.id || 'cs_' + Date.now() + Math.random().toString(36).slice(2, 5),
      name,
      nameJp: $('#sp-nameJp', root).value.trim(),
      address: $('#sp-address', root).value.trim(),
      note: $('#sp-note', root).value.trim(),
      lat: parseFloat($('#sp-lat', root).value) || null,
      lng: parseFloat($('#sp-lng', root).value) || null,
    };
    if (spot?.id) {
      const idx = state.customSpots.findIndex(s => s.id === spot.id);
      if (idx >= 0) state.customSpots[idx] = data;
    } else {
      state.customSpots.push(data);
    }
    saveCustomSpots();
    close();
    if (state.currentPage === 'spots') {
      $('#app').innerHTML = renderSpots();
      attachHandlers('spots');
      if (state.spotsView === 'map') setTimeout(initMap, 50);
    }
  });
}

// ===== Render: Cards (卡夾) =====
function fieldsFilledCount(obj, keys) {
  if (!obj) return 0;
  return keys.filter(k => obj[k] && String(obj[k]).trim()).length;
}
function statusFromCount(filled, total) {
  if (filled === 0) return { kind: 'empty', label: '未填寫' };
  if (filled < total) return { kind: 'partial', label: '部分' };
  return { kind: 'done', label: '已完成' };
}

function inputAttrs(extra = {}) {
  return Object.entries(extra).map(([k, v]) => `${k}="${escapeHtml(v)}"`).join(' ');
}
function field(label, bind, val, type = 'text', placeholder = '', extra = {}) {
  const attrs = inputAttrs(extra);
  const inp = type === 'textarea'
    ? `<textarea data-bind="${bind}" placeholder="${escapeHtml(placeholder)}" rows="2" ${attrs}>${escapeHtml(val ?? '')}</textarea>`
    : `<input data-bind="${bind}" type="${type}" value="${escapeHtml(val ?? '')}" placeholder="${escapeHtml(placeholder)}" ${attrs}>`;
  return `<div class="field"><label class="field-label">${escapeHtml(label)}</label>${inp}</div>`;
}
function fieldFull(label, bind, val, type = 'text', placeholder = '', extra = {}) {
  const attrs = inputAttrs(extra);
  return `<div class="field full"><label class="field-label">${escapeHtml(label)}</label>${
    type === 'textarea'
      ? `<textarea data-bind="${bind}" placeholder="${escapeHtml(placeholder)}" rows="2" ${attrs}>${escapeHtml(val ?? '')}</textarea>`
      : `<input data-bind="${bind}" type="${type}" value="${escapeHtml(val ?? '')}" placeholder="${escapeHtml(placeholder)}" ${attrs}>`
  }</div>`;
}

function renderAttachment(key) {
  const a = state.attach[key];
  if (!a) {
    return `
      <label class="upload-btn">
        📎 上傳 PDF / 圖片
        <input type="file" accept="image/*,.pdf,application/pdf" data-attach="${key}">
      </label>`;
  }
  const isImg = a.type.startsWith('image/');
  const thumb = isImg
    ? `<img src="${a.url}" alt="${escapeHtml(a.name)}">`
    : `<div class="pdf-icon">📄</div>`;
  return `
    <div class="attach-thumb" data-attach-view="${key}">
      ${thumb}
      <div class="attach-info">
        <div class="attach-name">${escapeHtml(a.name)}</div>
        <div class="attach-size">${formatBytes(a.size)} ・ 點擊${isImg ? '放大' : '開啟'}</div>
      </div>
      <button class="attach-del" data-attach-del="${key}" title="刪除">✕</button>
    </div>`;
}

function sectionBlock({ key, emoji, title, sub, status, body }) {
  const open = state.cardsOpen.has(key);
  return `
    <div class="section-block ${open ? 'open' : ''}" data-section="${key}">
      <button class="section-head" data-toggle="${key}">
        <span class="section-emoji">${emoji}</span>
        <div class="section-titles">
          <div class="section-name">${escapeHtml(title)}</div>
          ${sub ? `<div class="section-sub">${escapeHtml(sub)}</div>` : ''}
        </div>
        <span class="section-status status-${status.kind}">${escapeHtml(status.label)}</span>
        <span class="section-caret">▶</span>
      </button>
      <div class="section-body">${body}</div>
    </div>`;
}

function sectionFlight(side, label, data) {
  const filled = fieldsFilledCount(data, ['airline','flightNo','depDate','depTime','arrTime','bookingRef']);
  const total = 6;
  const body = `
    <div class="field-grid">
      ${field('航空公司', `flights.${side}.airline`, data.airline, 'text', '長榮、星宇...', { autocomplete: 'off', autocorrect: 'off' })}
      ${field('航班號', `flights.${side}.flightNo`, data.flightNo, 'text', 'BR132', { autocapitalize: 'characters', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false' })}
      ${field('出發地', `flights.${side}.from`, data.from, 'text', side === 'outbound' ? 'TPE 桃園' : 'KIX 關西', { autocapitalize: 'characters', autocomplete: 'off' })}
      ${field('降落地', `flights.${side}.to`, data.to, 'text', side === 'outbound' ? 'KIX 關西' : 'TPE 桃園', { autocapitalize: 'characters', autocomplete: 'off' })}
      ${field('出發日期', `flights.${side}.depDate`, data.depDate, 'date')}
      ${field('出發時間', `flights.${side}.depTime`, data.depTime, 'time')}
      ${field('降落日期', `flights.${side}.arrDate`, data.arrDate, 'date')}
      ${field('降落時間', `flights.${side}.arrTime`, data.arrTime, 'time')}
      ${field('訂位編號', `flights.${side}.bookingRef`, data.bookingRef, 'text', 'PNR / Booking Ref', { autocapitalize: 'characters', autocomplete: 'off', autocorrect: 'off' })}
      ${field('座位', `flights.${side}.seat`, data.seat, 'text', '24A / 24B', { autocapitalize: 'characters', autocomplete: 'off' })}
    </div>
    ${renderAttachment(`attach.flight-${side}`)}`;
  return sectionBlock({
    key: `flight-${side}`,
    emoji: '✈️',
    title: label,
    sub: data.airline || data.flightNo
      ? `${data.airline || ''} ${data.flightNo || ''} ・ ${data.depDate || ''} ${data.depTime || ''}`.trim()
      : '航班、訂位編號、座位',
    status: statusFromCount(filled, total),
    body,
  });
}

function sectionPassport(data) {
  const filled = fieldsFilledCount(data, ['last4', 'expiry']);
  const body = `
    <div class="field-grid">
      ${field('護照末四碼', 'passport.last4', data.last4, 'text', '1234', { inputmode: 'numeric', pattern: '\\d{4}', maxlength: '4', autocomplete: 'off' })}
      ${field('到期日', 'passport.expiry', data.expiry, 'date')}
      ${fieldFull('英文姓名（與護照一致）', 'passport.name', data.name, 'text', 'WANG, MING-DE', { autocapitalize: 'characters', autocomplete: 'name', autocorrect: 'off', spellcheck: 'false' })}
    </div>
    ${renderAttachment('attach.passport')}
    <p style="font-size:11px;color:var(--muted);margin:8px 0 0">
      ⚠ 為了安全，建議只填末四碼。若上傳資料頁，請確認手機本身有設密碼鎖。
    </p>`;
  return sectionBlock({
    key: 'passport',
    emoji: '📘',
    title: '護照',
    sub: data.expiry ? `到期：${data.expiry}` : '末四碼、到期日、資料頁照片',
    status: statusFromCount(filled, 2),
    body,
  });
}

function sectionMilitary(data) {
  const status = data.status;
  let stat;
  if (status === 'approved') stat = { kind: 'done', label: '已核准' };
  else if (status === 'submitted') stat = { kind: 'partial', label: '已申請' };
  else stat = { kind: 'warn', label: '待辦！' };

  const body = `
    <div class="field-grid">
      <div class="field full">
        <label class="field-label">申請狀態</label>
        <select data-bind="military.status">
          <option value="" ${!status ? 'selected' : ''}>未申請（待辦）</option>
          <option value="submitted" ${status === 'submitted' ? 'selected' : ''}>已送件，等待核准</option>
          <option value="approved" ${status === 'approved' ? 'selected' : ''}>已核准</option>
        </select>
      </div>
      ${field('申請日期', 'military.submittedDate', data.submittedDate, 'date')}
      ${field('核准日期', 'military.approvedDate', data.approvedDate, 'date')}
      ${fieldFull('備註', 'military.note', data.note, 'textarea', '出境天數、案件編號...')}
    </div>
    ${renderAttachment('attach.military')}
    <p style="font-size:11px;color:var(--text-soft);margin:10px 0 0;line-height:1.6">
      💡 申請網址：<a href="https://www.gsa.gov.tw/" target="_blank" style="color:var(--primary)">役政署 gsa.gov.tw</a><br>
      ・ 短期 4 個月內，須在出國前申請<br>
      ・ 核准函 PDF 可上傳到此處離線備份<br>
      ・ 海關抽查時要拿得出來
    </p>`;
  return sectionBlock({
    key: 'military',
    emoji: '🪖',
    title: '役男出境核准',
    sub: status === 'approved' ? '已核准 ✓' : status === 'submitted' ? '已送件' : '出國前必辦',
    status: stat,
    body,
  });
}

function sectionHotels(hotels) {
  const blocks = hotels.map((h, i) => `
    <div class="repeat-block">
      <div class="repeat-head">
        <span class="repeat-title">飯店 #${i + 1}</span>
        <button class="btn-ghost" data-remove="hotels.${i}">移除</button>
      </div>
      <div class="field-grid">
        ${fieldFull('飯店名（中/英）', `hotels.${i}.name`, h.name, 'text', 'Hotel Granvia Osaka', { autocomplete: 'off' })}
        ${fieldFull('地址（漢字 — 給計程車看）', `hotels.${i}.addressJp`, h.addressJp, 'text', '大阪市北区梅田 3-1-1', { autocomplete: 'off' })}
        ${fieldFull('地址（英文）', `hotels.${i}.addressEn`, h.addressEn, 'text', '3-1-1 Umeda, Kita-ku, Osaka', { autocomplete: 'off' })}
        ${field('電話', `hotels.${i}.phone`, h.phone, 'tel', '+81-6-...', { autocomplete: 'tel' })}
        ${field('訂位編號', `hotels.${i}.bookingRef`, h.bookingRef, 'text', '', { autocapitalize: 'characters', autocomplete: 'off' })}
        ${field('入住', `hotels.${i}.checkIn`, h.checkIn, 'date')}
        ${field('退房', `hotels.${i}.checkOut`, h.checkOut, 'date')}
      </div>
      ${renderAttachment(`attach.hotel-${i}`)}
    </div>
  `).join('');

  const filled = hotels.length > 0 && hotels[0].name ? hotels.length : 0;
  const stat = filled === 0
    ? { kind: 'empty', label: '未填寫' }
    : { kind: 'done', label: `${filled} 間` };

  const body = `
    ${blocks}
    <button class="btn-add" data-add="hotels">＋ 新增一間飯店</button>`;
  return sectionBlock({
    key: 'hotels',
    emoji: '🏨',
    title: '飯店訂房',
    sub: hotels.length ? hotels.map(h => h.name).filter(Boolean).join(' / ') || '尚未填寫' : '可加多筆（如有換飯店）',
    status: stat,
    body,
  });
}

function sectionInsurance(data) {
  const filled = fieldsFilledCount(data, ['company','policyNo','emergencyTel']);
  const body = `
    <div class="field-grid">
      ${fieldFull('保險公司', 'insurance.company', data.company, 'text', '富邦產險、新光產險...', { autocomplete: 'off' })}
      ${field('保單號碼', 'insurance.policyNo', data.policyNo, 'text', '', { autocapitalize: 'characters', autocomplete: 'off' })}
      ${field('24h 緊急電話', 'insurance.emergencyTel', data.emergencyTel, 'tel', '+886-2-...', { autocomplete: 'tel' })}
      ${fieldFull('承保期間', 'insurance.period', data.period, 'text', '2026/8/11 – 2026/8/17', { autocomplete: 'off' })}
    </div>
    ${renderAttachment('attach.insurance')}`;
  return sectionBlock({
    key: 'insurance',
    emoji: '🛡️',
    title: '旅遊平安險',
    sub: data.company || '保單、24h 客服',
    status: statusFromCount(filled, 3),
    body,
  });
}

function sectionCards(cards) {
  const blocks = cards.map((c, i) => `
    <div class="repeat-block">
      <div class="repeat-head">
        <span class="repeat-title">卡 #${i + 1}</span>
        <button class="btn-ghost" data-remove="cards.${i}">移除</button>
      </div>
      <div class="field-grid">
        ${fieldFull('卡別 / 銀行', `cards.${i}.name`, c.name, 'text', '玉山世界卡', { autocomplete: 'off' })}
        ${field('末四碼', `cards.${i}.last4`, c.last4, 'text', '1234', { inputmode: 'numeric', pattern: '\\d{4}', maxlength: '4', autocomplete: 'off' })}
        ${field('掛失專線', `cards.${i}.supportTel`, c.supportTel, 'tel', '+886-2-...', { autocomplete: 'tel' })}
      </div>
    </div>
  `).join('');

  const stat = cards.length === 0
    ? { kind: 'empty', label: '未填寫' }
    : { kind: 'done', label: `${cards.length} 張` };

  return sectionBlock({
    key: 'creditcards',
    emoji: '💳',
    title: '信用卡（掛失用）',
    sub: '卡掉了的緊急聯絡 — 不存全卡號',
    status: stat,
    body: `${blocks}<button class="btn-add" data-add="cards">＋ 新增一張</button>`,
  });
}

function sectionContacts(contacts) {
  const blocks = contacts.map((c, i) => `
    <div class="repeat-block">
      <div class="repeat-head">
        <span class="repeat-title">聯絡人 #${i + 1}</span>
        <button class="btn-ghost" data-remove="contacts.${i}">移除</button>
      </div>
      <div class="field-grid">
        ${field('姓名', `contacts.${i}.name`, c.name, 'text', '', { autocomplete: 'name' })}
        ${field('關係', `contacts.${i}.relation`, c.relation, 'text', '父 / 母 / 兄...', { autocomplete: 'off' })}
        ${fieldFull('電話', `contacts.${i}.tel`, c.tel, 'tel', '+886-9...', { autocomplete: 'tel' })}
      </div>
    </div>
  `).join('');

  const stat = contacts.length === 0
    ? { kind: 'empty', label: '未填寫' }
    : { kind: 'done', label: `${contacts.length} 位` };

  return sectionBlock({
    key: 'contacts',
    emoji: '📞',
    title: '緊急聯絡人',
    sub: '家人或朋友，至少留一位',
    status: stat,
    body: `${blocks}<button class="btn-add" data-add="contacts">＋ 新增一位</button>`,
  });
}

function renderCards() {
  const d = state.docs || DEFAULT_DOCS;
  const sections = [
    { key: 'flight-outbound', label: '✈️ 去程' },
    { key: 'flight-return', label: '✈️ 回程' },
    { key: 'passport', label: '📘 護照' },
    { key: 'military', label: '🪖 役男' },
    { key: 'hotels', label: '🏨 飯店' },
    { key: 'insurance', label: '🛡 保險' },
    { key: 'creditcards', label: '💳 信用卡' },
    { key: 'contacts', label: '📞 聯絡人' },
  ];
  return `
    <div class="page">
      <div class="privacy-card">
        <span class="ico">🔒</span>
        <div>
          <strong>本機加密儲存</strong><br>
          這頁所有資料只在這支 iPhone（IndexedDB），不會上傳。重要文件建議也另存到 iCloud / Photos 備份。
        </div>
      </div>
      <div class="cards-toolbar">
        <button data-cards-action="expand-all">全部展開</button>
        <button data-cards-action="collapse-all">全部收合</button>
        <select id="cards-jump">
          <option value="">跳到… ▼</option>
          ${sections.map(s => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join('')}
        </select>
      </div>
      ${sectionFlight('outbound', '去程航班', d.flights.outbound || {})}
      ${sectionFlight('return', '回程航班', d.flights.return || {})}
      ${sectionPassport(d.passport || {})}
      ${sectionMilitary(d.military || {})}
      ${sectionHotels(d.hotels || [])}
      ${sectionInsurance(d.insurance || {})}
      ${sectionCards(d.cards || [])}
      ${sectionContacts(d.contacts || [])}
    </div>`;
}

// ===== Render: Prep To-Do =====
function renderTaskRow(t) {
  const done = state.prepDone.has(t.id);
  const expanded = state.prepExpanded.has(t.id);
  const st = taskStatus(t);
  const badges = [];
  if (t.priority === 'must') badges.push('<span class="task-badge badge-must">必辦</span>');
  else if (t.priority === 'recommended') badges.push('<span class="task-badge badge-rec">建議</span>');
  else if (t.priority === 'optional') badges.push('<span class="task-badge badge-opt">選</span>');
  if (t.scope === 'male') badges.push('<span class="task-badge badge-male">男限</span>');
  if (t.scope === 'female') badges.push('<span class="task-badge badge-female">女限</span>');
  if (!done && st === 'overdue') badges.push('<span class="task-badge badge-urgent">逾期</span>');
  else if (!done && st === 'urgent') badges.push('<span class="task-badge badge-urgent">該辦了</span>');

  return `
    <div class="task-item ${done ? 'done' : ''} ${expanded ? 'expanded' : ''}" data-task-id="${t.id}">
      <span class="task-checkbox" data-check="${t.id}"></span>
      <div class="task-content" data-expand="${t.id}">
        <div class="task-title-row">
          <span class="task-title">${escapeHtml(t.title)}</span>
          ${badges.join('')}
        </div>
        <div class="task-detail">
          ${escapeHtml(t.detail)}
          ${t.link ? `<br><a class="task-link" href="${escapeHtml(safeUrl(t.link))}" target="_blank" rel="noopener">→ ${escapeHtml(t.linkLabel || '官方連結')}</a>` : ''}
        </div>
      </div>
    </div>`;
}

function renderPrep() {
  const data = state.prep;
  const allTasks = data.tasks;
  const doneCount = allTasks.filter(t => state.prepDone.has(t.id)).length;
  const totalCount = allTasks.length;
  const pct = totalCount ? Math.round(doneCount / totalCount * 100) : 0;
  const today = todayISO();
  const daysUntilTrip = daysBetween(today, TRIP_START);

  const urgentTasks = allTasks.filter(t => {
    if (state.prepDone.has(t.id)) return false;
    const st = taskStatus(t);
    return st === 'overdue' || st === 'urgent';
  });

  const filterFn = (() => {
    if (state.prepFilter === 'urgent') return t => {
      if (state.prepDone.has(t.id)) return false;
      const st = taskStatus(t);
      return st === 'overdue' || st === 'urgent';
    };
    if (state.prepFilter === 'must') return t => t.priority === 'must';
    if (state.prepFilter === 'male') return t => t.scope === 'male';
    if (state.prepFilter === 'done') return t => state.prepDone.has(t.id);
    return () => true;
  })();
  const filteredTasks = allTasks.filter(filterFn);

  const byCategory = {};
  for (const cat of data.categories) byCategory[cat.id] = [];
  for (const t of filteredTasks) {
    if (!byCategory[t.category]) byCategory[t.category] = [];
    byCategory[t.category].push(t);
  }

  const filterChips = [
    { id: 'all', label: '全部' },
    { id: 'urgent', label: `🔥 該辦了${urgentTasks.length ? ` (${urgentTasks.length})` : ''}` },
    { id: 'must', label: '必辦' },
    { id: 'male', label: '男限' },
    { id: 'done', label: '已完成' },
  ];

  return `
    <div class="page">
      <div class="prep-header">
        <div class="prep-counter-inline">
          <span class="prep-counter-inline-num">${daysUntilTrip}</span>
          <span class="prep-counter-inline-txt">天後出發 ・ ${doneCount} / ${totalCount} 完成（${pct}%）</span>
        </div>
        <div class="prep-progress-bar">
          <div class="prep-progress-fill" style="width:${pct}%"></div>
        </div>
      </div>

      ${urgentTasks.length ? `
        <div class="urgent-banner">
          <div class="urgent-banner-head">
            🚨 該辦了 / 已逾期
            <span class="urgent-banner-count">${urgentTasks.length}</span>
          </div>
          <ul class="urgent-list">
            ${urgentTasks.slice(0, 5).map(t => `<li>${escapeHtml(t.title)}</li>`).join('')}
            ${urgentTasks.length > 5 ? `<li class="urgent-more" data-jump-urgent="1">還有 ${urgentTasks.length - 5} 項 — 看全部</li>` : ''}
          </ul>
        </div>` : ''
      }

      <div class="prep-filter-row">
        ${filterChips.map(f => `
          <button class="filter-chip ${state.prepFilter === f.id ? 'active' : ''}" data-prep-filter="${f.id}">
            ${escapeHtml(f.label)}
          </button>`).join('')}
      </div>

      ${data.categories.map(cat => {
        const tasks = byCategory[cat.id] || [];
        if (tasks.length === 0) return '';
        const catDone = tasks.filter(t => state.prepDone.has(t.id)).length;
        const open = state.prepOpenCats.has(cat.id);
        const stat = catDone === tasks.length ? 'done' : catDone > 0 ? 'partial' : 'empty';
        return `
          <div class="section-block ${open ? 'open' : ''}" data-prep-cat="${cat.id}">
            <button class="section-head" data-toggle-cat="${cat.id}">
              <span class="section-emoji">${cat.emoji}</span>
              <div class="section-titles">
                <div class="section-name">${escapeHtml(cat.label)}</div>
              </div>
              <span class="section-status status-${stat}">${catDone} / ${tasks.length}</span>
              <span class="section-caret">▶</span>
            </button>
            <div class="section-body" style="padding:0 16px">
              ${tasks.map(renderTaskRow).join('')}
            </div>
          </div>`;
      }).join('')}

      ${filteredTasks.length === 0 ? '<div class="empty"><span class="empty-emoji">🎉</span>這個分類沒有項目</div>' : ''}
    </div>`;
}

// ===== Render: Emergency =====
function telHref(phone) {
  // 移除空白與括號，保留 + 與 -，瀏覽器/iOS 會處理
  return 'tel:' + phone.replace(/[^\d+\-]/g, '');
}
function mapHref(q) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}

function renderEmergencyContact(c, critical) {
  // tip-only row (no actions): only title + subtitle
  const hasAction = c.phone || c.map || c.email || c.url;
  if (!hasAction) {
    return `
      <div class="emergency-row emergency-tip">
        <div class="e-content">
          <div class="e-title">${escapeHtml(c.title)}</div>
          ${c.subtitle ? `<div class="e-sub">${escapeHtml(c.subtitle)}</div>` : ''}
        </div>
      </div>`;
  }
  let href = '#', actionLabel = '', actionIcon = '';
  if (c.phone) { href = telHref(c.phone); actionLabel = c.phoneDisplay || c.phone; actionIcon = '📞'; }
  else if (c.map)   { href = mapHref(c.map); actionLabel = '開地圖'; actionIcon = '🗺'; }
  else if (c.email) { href = 'mailto:' + c.email; actionLabel = '寄信'; actionIcon = '✉'; }
  else if (c.url)   { href = c.url; actionLabel = '開啟'; actionIcon = '↗'; }
  const target = c.url ? ' target="_blank" rel="noopener"' : '';
  return `
    <a class="emergency-row" href="${escapeHtml(safeUrl(href))}"${target}>
      <div class="e-content">
        <div class="e-title">${escapeHtml(c.title)}</div>
        ${c.subtitle ? `<div class="e-sub">${escapeHtml(c.subtitle)}</div>` : ''}
      </div>
      <span class="e-action">
        <span class="e-action-icon">${actionIcon}</span>
        ${critical ? escapeHtml(actionLabel) : ''}
      </span>
    </a>`;
}

function renderEmergency() {
  const groups = state.emergency?.groups || [];
  return `
    <div class="page">
      <div class="warn-card" style="margin-bottom:18px">
        <strong>🆘 在最不希望用到的時候最有用</strong><br>
        所有電話可以點擊撥打。地址點擊會開 Google Maps。
        建議用 iPhone「分享 → 加入聯絡資訊」把急難救助 090-8794-4568 存起來。
      </div>
      ${groups.map(g => `
        <div class="emergency-group">
          <div class="emergency-group-title">${g.emoji} ${escapeHtml(g.title)}</div>
          <div class="emergency-card ${g.critical ? 'critical' : ''}">
            ${g.contacts.map(c => renderEmergencyContact(c, g.critical)).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

// ===== Render: Phrases =====
function renderPhrase(p) {
  const fav = state.phraseFav.has(p.id);
  const speaking = state.speakingId === p.id;
  const searchText = (p.zh + ' ' + p.jp + ' ' + p.romaji + ' ' + (p.note || '')).toLowerCase();
  return `
    <div class="phrase-card ${fav ? 'favorite' : ''}" data-phrase-id="${p.id}" data-search="${escapeHtml(searchText)}">
      <div class="phrase-top-row">
        <div class="phrase-text">
          <div class="phrase-zh">${escapeHtml(p.zh)}</div>
          <div class="phrase-jp">${escapeHtml(p.jp)}</div>
          <div class="phrase-romaji">${escapeHtml(p.romaji)}</div>
        </div>
        <div class="phrase-actions">
          <button class="phrase-btn play ${speaking ? 'speaking' : ''}" data-speak="${p.id}" aria-label="播放">📢</button>
          <button class="phrase-btn fav ${fav ? 'on' : ''}" data-fav="${p.id}" aria-label="收藏">${fav ? '⭐' : '☆'}</button>
        </div>
      </div>
      ${p.note ? `<div class="phrase-note">💡 ${escapeHtml(p.note)}</div>` : ''}
    </div>`;
}

function renderPhrases() {
  const data = state.phrases;
  const cats = data.categories;
  const q = state.phraseQuery.toLowerCase().trim();
  const cat = state.phraseCat;

  const filtered = data.phrases.filter(p => {
    if (cat === 'fav') {
      if (!state.phraseFav.has(p.id)) return false;
    } else if (cat !== 'all') {
      if (p.category !== cat) return false;
    }
    if (q) {
      const hay = `${p.zh} ${p.jp} ${p.romaji} ${p.note || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const chips = [
    { id: 'all', label: '全部' },
    { id: 'fav', label: `⭐ 收藏${state.phraseFav.size ? ` (${state.phraseFav.size})` : ''}` },
    ...cats.map(c => ({ id: c.id, label: `${c.emoji} ${c.label}` })),
  ];

  return `
    <div class="page">
      <div class="search-bar">
        <span class="icon">🔍</span>
        <input id="phrase-search" type="search" placeholder="搜尋（中文 / 日文 / 羅馬拼音）" value="${escapeHtml(state.phraseQuery)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="filter-bar">
        ${chips.map(c => `
          <button class="filter-chip ${state.phraseCat === c.id ? 'active' : ''}" data-phrase-cat="${c.id}">
            ${escapeHtml(c.label)}
          </button>`).join('')}
      </div>
      ${filtered.length === 0
        ? '<div class="empty"><span class="empty-emoji">🔍</span>找不到符合的短語</div>'
        : filtered.map(renderPhrase).join('')
      }
      <div class="phrase-count">${filtered.length} 句 ・ 共 ${data.phrases.length} 句</div>
    </div>`;
}

// ===== Render: Transport =====
function renderTransportCard(c) {
  return `
    <div class="transport-card">
      <div class="transport-card-head">
        <div class="transport-name">${escapeHtml(c.name)}</div>
        ${c.subtitle ? `<div class="transport-subtitle">${escapeHtml(c.subtitle)}</div>` : ''}
      </div>
      ${c.rows?.length ? `
        <div class="transport-rows">
          ${c.rows.map(r => `
            <div class="tlabel">${escapeHtml(r.label)}</div>
            <div class="tvalue">${escapeHtml(r.value)}</div>
          `).join('')}
        </div>` : ''}
      ${c.good ? `<div class="transport-good">👍 ${escapeHtml(c.good)}</div>` : ''}
      ${c.bad  ? `<div class="transport-bad">👎 ${escapeHtml(c.bad)}</div>` : ''}
      ${c.tip  ? `<div class="transport-tip">💡 ${escapeHtml(c.tip)}</div>` : ''}
    </div>`;
}

function renderTransport() {
  const sections = state.transport?.sections || [];
  return `
    <div class="page">
      ${sections.map(s => `
        <div class="section-title">${s.emoji} ${escapeHtml(s.title)}</div>
        ${s.intro ? `<div class="transport-intro">${escapeHtml(s.intro)}</div>` : ''}
        ${s.cards.map(renderTransportCard).join('')}
      `).join('')}
    </div>`;
}

// ===== Render: Foods =====
function renderFoods() {
  const cats = state.foods.categories;
  const list = state.foods.foods.filter(f => state.foodCat === 'all' || f.category === state.foodCat);
  return `
    <div class="page">
      <div class="filter-bar">
        ${cats.map(c => `<button class="filter-chip ${state.foodCat === c.id ? 'active' : ''}" data-food-cat="${c.id}">${escapeHtml(c.label)}</button>`).join('')}
      </div>
      ${list.length === 0 ? '<div class="empty"><span class="empty-emoji">🍜</span>沒有項目</div>' : list.map(f => `
        <div class="food-card">
          <div class="food-head">
            <span class="food-name">${escapeHtml(f.name)}</span>
            <span class="food-jp">${escapeHtml(f.nameJp)}</span>
            <span class="food-price">${escapeHtml(f.price)}</span>
          </div>
          <div class="food-where">📍 ${escapeHtml(f.where)}</div>
          ${f.tip ? `<div class="food-tip">💡 ${escapeHtml(f.tip)}</div>` : ''}
        </div>`).join('')}
    </div>`;
}

// ===== Render: Shopping (必買) =====
function renderShopping() {
  const cats = state.shopping.categories;
  const items = state.shopping.items;
  const totalBought = items.filter(i => state.shoppingBought.has(i.id)).length;
  const pct = items.length ? Math.round(totalBought / items.length * 100) : 0;
  return `
    <div class="page">
      <div class="card-soft card">
        <h3 class="card-title">🛍 大阪必買清單</h3>
        <div class="weather-row"><span>進度</span><span><strong>${totalBought} / ${items.length}</strong></span></div>
        <div class="prep-progress-bar" style="margin-top:8px;background:var(--border)">
          <div class="prep-progress-fill" style="width:${pct}%;background:var(--primary)"></div>
        </div>
      </div>
      ${cats.map(cat => {
        const catItems = items.filter(i => i.category === cat.id);
        const bought = catItems.filter(i => state.shoppingBought.has(i.id)).length;
        return `
          <div class="section-block open">
            <div class="section-head" style="cursor:default">
              <span class="section-emoji">${cat.emoji}</span>
              <div class="section-titles">
                <div class="section-name">${escapeHtml(cat.label)}</div>
              </div>
              <span class="section-status status-${bought === catItems.length && catItems.length > 0 ? 'done' : bought > 0 ? 'partial' : 'empty'}">${bought} / ${catItems.length}</span>
            </div>
            <div class="section-body" style="padding: 0 16px">
              ${catItems.map(i => {
                const isBought = state.shoppingBought.has(i.id);
                return `
                  <div class="shop-item ${isBought ? 'bought' : ''}">
                    <span class="shop-checkbox" data-shop="${i.id}"></span>
                    <div class="shop-content">
                      <div class="shop-name">${escapeHtml(i.name)}</div>
                      <div class="shop-meta">📍 ${escapeHtml(i.where)} ・ <span class="shop-price">${escapeHtml(i.price)}</span></div>
                      ${i.note ? `<div class="shop-note">${escapeHtml(i.note)}</div>` : ''}
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ===== Render: Expenses (記帳) =====
function payerLabel(p) {
  return p === 'me' ? '我' : '女友';
}
function splitLabel(s) {
  return s === 'both' ? '兩人均分' : s === 'me' ? '我自己用' : '她自己用';
}
function renderExpenses() {
  const list = state.expenses || [];
  const t = expenseTotals();
  const balanceMsg = Math.abs(t.balance) < 1
    ? '🟢 兩人平衡'
    : t.balance > 0
      ? `💸 我欠女友 ¥${Math.round(t.balance).toLocaleString()} (約 NT$${Math.round(t.balance * JPY_TWD_RATE)})`
      : `💰 女友欠我 ¥${Math.round(-t.balance).toLocaleString()} (約 NT$${Math.round(-t.balance * JPY_TWD_RATE)})`;
  const i = state.expenseInput;
  return `
    <div class="page">
      <div class="expense-header">
        <div class="expense-total-row">
          <div>
            <div class="expense-total-label">總花費</div>
            <div class="expense-total-jpy">¥${t.total.toLocaleString()}</div>
            <div class="expense-total-twd">約 NT$${Math.round(t.total * JPY_TWD_RATE).toLocaleString()} ・ 匯率 ${JPY_TWD_RATE}</div>
          </div>
        </div>
        <div class="expense-split-row">
          <span>我付了 <strong>¥${t.mePaid.toLocaleString()}</strong></span>
          <span>女友付了 <strong>¥${t.herPaid.toLocaleString()}</strong></span>
        </div>
        <div class="expense-balance-msg">${balanceMsg}</div>
      </div>

      <div class="expense-form">
        <div class="card-title" style="font-size:13px;margin:0 0 10px">➕ 新增一筆</div>
        <div class="expense-form-row">
          <div>
            <label>金額（日圓）</label>
            <input id="exp-amount" type="number" inputmode="numeric" placeholder="500" value="${escapeHtml(i.amount)}">
          </div>
          <div>
            <label>項目</label>
            <input id="exp-label" type="text" placeholder="拉麵 / 地鐵 / 紀念品" value="${escapeHtml(i.label)}">
          </div>
          <div>
            <label>誰付的</label>
            <select id="exp-payer">
              <option value="me" ${i.payer === 'me' ? 'selected' : ''}>我</option>
              <option value="her" ${i.payer === 'her' ? 'selected' : ''}>女友</option>
            </select>
          </div>
          <div>
            <label>分擔方式</label>
            <select id="exp-split">
              <option value="both" ${i.split === 'both' ? 'selected' : ''}>兩人均分</option>
              <option value="me" ${i.split === 'me' ? 'selected' : ''}>我自己用</option>
              <option value="her" ${i.split === 'her' ? 'selected' : ''}>她自己用</option>
            </select>
          </div>
        </div>
        <button class="btn-add" id="exp-add">＋ 新增</button>
      </div>

      ${list.length === 0
        ? '<div class="empty"><span class="empty-emoji">💰</span>還沒記帳呢</div>'
        : '<div class="section-title">記錄（最新在上）</div>' +
          [...list].reverse().map(e => `
            <div class="expense-item">
              <div class="expense-info">
                <div class="expense-label-text">${escapeHtml(e.label || '(未命名)')}</div>
                <div class="expense-meta">
                  ${new Date(e.ts).toLocaleString('zh-TW', { timeZone: TRIP_TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  ・ <span class="payer-${e.payer}">${escapeHtml(payerLabel(e.payer))} 付</span>
                  ・ ${escapeHtml(splitLabel(e.split))}
                </div>
              </div>
              <div class="expense-amount">¥${e.amount.toLocaleString()}</div>
              <button class="expense-del" data-exp-del="${e.id}" aria-label="刪除">✕</button>
            </div>
          `).join('')
      }
    </div>`;
}

function rerenderExpenses() {
  if (state.currentPage !== 'expenses') return;
  $('#app').innerHTML = renderExpenses();
  attachHandlers('expenses');
}

// ===== Backup (匯出 / 匯入) =====
const LAST_BACKUP_KEY = 'osakapocket.lastBackup';
const BACKUP_VERSION = 1;

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
function dataUrlToBlob(dataUrl) {
  const [meta, b64] = String(dataUrl).split(',');
  const mime = (meta.match(/data:(.+);base64/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function gatherBackup() {
  // 確保所有資料已 load
  await Promise.all([loadDocs(), loadCustomSpots(), loadExpenses(), loadPrepDone()]);
  loadShoppingBought();
  loadPhraseFav();

  // 蒐集附件
  const attachments = {};
  const keys = await dbAllKeys();
  for (const k of keys) {
    if (typeof k !== 'string' || !k.startsWith('attach.')) continue;
    const v = await dbGet(k);
    if (v && v.blob) {
      attachments[k] = {
        name: v.name,
        type: v.type,
        size: v.size,
        dataUrl: await blobToDataUrl(v.blob),
      };
    }
  }

  return {
    version: BACKUP_VERSION,
    appName: 'OsakaPocket',
    exportedAt: new Date().toISOString(),
    data: {
      docs: state.docs,
      notes: loadNotes(),
      prepDone: Array.from(state.prepDone),
      customSpots: state.customSpots,
      expenses: state.expenses,
      shoppingBought: Array.from(state.shoppingBought),
      phraseFav: Array.from(state.phraseFav),
    },
    attachments,
  };
}

async function exportBackup() {
  const backup = await gatherBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `osakapocket-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  return blob.size;
}

async function importBackup(file) {
  const text = await file.text();
  let backup;
  try { backup = JSON.parse(text); } catch { throw new Error('不是有效的 JSON 檔'); }
  if (backup.appName !== 'OsakaPocket') throw new Error('不是 OsakaPocket 的備份');
  if (backup.version !== BACKUP_VERSION) throw new Error(`備份版本 v${backup.version} 不相容（目前 v${BACKUP_VERSION}）`);
  const d = backup.data || {};

  if (d.docs) { state.docs = d.docs; await dbSet(DOCS_KEY, d.docs); }
  if (d.notes) localStorage.setItem(NOTES_KEY, JSON.stringify(d.notes));
  if (d.prepDone) { state.prepDone = new Set(d.prepDone); await dbSet(PREP_DONE_KEY, d.prepDone); }
  if (d.customSpots) { state.customSpots = d.customSpots; await dbSet(CUSTOM_SPOTS_KEY, d.customSpots); }
  if (d.expenses) { state.expenses = d.expenses; await dbSet(EXPENSES_KEY, d.expenses); }
  if (d.shoppingBought) { state.shoppingBought = new Set(d.shoppingBought); localStorage.setItem(SHOPPING_KEY, JSON.stringify(d.shoppingBought)); }
  if (d.phraseFav) { state.phraseFav = new Set(d.phraseFav); localStorage.setItem(PHRASE_FAV_KEY, JSON.stringify(d.phraseFav)); }

  // 清掉現有 attachment URL 後重新匯入 IDB
  for (const k of Object.keys(state.attach)) {
    if (state.attach[k]?.url) URL.revokeObjectURL(state.attach[k].url);
  }
  state.attach = {};
  if (backup.attachments) {
    for (const [key, val] of Object.entries(backup.attachments)) {
      if (!val?.dataUrl) continue;
      const blob = dataUrlToBlob(val.dataUrl);
      await dbSet(key, { name: val.name, type: val.type, size: val.size, blob });
    }
  }

  return {
    exportedAt: backup.exportedAt,
    counts: {
      hotels: d.docs?.hotels?.length || 0,
      prepDone: d.prepDone?.length || 0,
      customSpots: d.customSpots?.length || 0,
      expenses: d.expenses?.length || 0,
      shoppingBought: d.shoppingBought?.length || 0,
      phraseFav: d.phraseFav?.length || 0,
      attachments: Object.keys(backup.attachments || {}).length,
    },
  };
}

async function gatherStorageStats() {
  await Promise.all([loadDocs(), loadCustomSpots(), loadExpenses(), loadPrepDone()]);
  loadShoppingBought();
  loadPhraseFav();
  const d = state.docs || {};
  const attachKeys = (await dbAllKeys()).filter(k => typeof k === 'string' && k.startsWith('attach.'));
  let attachTotalSize = 0;
  for (const k of attachKeys) {
    const v = await dbGet(k);
    if (v?.size) attachTotalSize += v.size;
  }
  let quota = null, usage = null;
  if (navigator.storage?.estimate) {
    try { const est = await navigator.storage.estimate(); quota = est.quota; usage = est.usage; } catch {}
  }
  return {
    docs: {
      flightOut: Object.keys(d.flights?.outbound || {}).length > 0,
      flightRet: Object.keys(d.flights?.return || {}).length > 0,
      passport: Object.keys(d.passport || {}).length > 0,
      military: !!d.military?.status,
      hotels: (d.hotels || []).length,
      insurance: Object.keys(d.insurance || {}).length > 0,
      cards: (d.cards || []).length,
      contacts: (d.contacts || []).length,
    },
    prepDone: state.prepDone.size,
    customSpots: state.customSpots.length,
    expenses: state.expenses.length,
    shoppingBought: state.shoppingBought.size,
    phraseFav: state.phraseFav.size,
    notes: Object.keys(loadNotes()).length,
    attachCount: attachKeys.length,
    attachTotalSize,
    quota, usage,
  };
}

function renderBackup() {
  const last = localStorage.getItem(LAST_BACKUP_KEY);
  const lastTxt = last ? new Date(last).toLocaleString('zh-TW', { timeZone: TRIP_TZ }) : '從未匯出';
  const standalone = isStandalone();
  return `
    <div class="page">
      ${standalone ? `
        <div class="card card-soft" style="background:#ebf7ed;border-color:#a8d5a8">
          <h3 class="card-title" style="color:#2d7a2d">✓ Standalone PWA 模式</h3>
          <p style="font-size:13px;color:var(--text-soft);line-height:1.6;margin:0">
            你已加到主畫面、從圖示開啟。<strong>iOS WebKit 官方明確豁免 7 天清除規則</strong>，<br>
            正常使用下資料不會丟。但仍建議定期匯出備份，以防：① 換手機 ② 手動清 Safari 資料 ③ 大型 iOS 升級。
          </p>
        </div>
      ` : `
        <div class="warn-card" style="background:linear-gradient(135deg,#fff4e0 0%,#ffe0b8 100%);border-color:#ffc890;color:#8b5a2b">
          <strong style="color:#c47514">⚠ 你在 Safari 內看這個 App，未安裝</strong><br>
          Safari 模式有 7 天清除規則。請先 <strong>分享 → 加入主畫面</strong>，從桌面圖示打開後再用此 App，資料才不會掉。
        </div>
      `}

      <div class="card">
        <h3 class="card-title">💾 匯出備份</h3>
        <p style="font-size:13px;color:var(--text-soft);line-height:1.6;margin:0 0 8px">
          把所有本機資料（卡夾、行程備註、勾選、記帳、自訂景點、附件）打包成 JSON 檔下載。可存到 iCloud Drive、寄給自己、AirDrop 給女友。
        </p>
        <div style="font-size:11px;color:var(--muted);margin:6px 0 10px">上次匯出：${escapeHtml(lastTxt)}</div>
        <button class="btn-add" id="export-backup">📤 立即匯出備份</button>
        <div id="export-status" style="font-size:12px;margin-top:8px;color:var(--text-soft)"></div>
      </div>

      <div class="card">
        <h3 class="card-title">📥 匯入備份</h3>
        <p style="font-size:13px;color:var(--text-soft);line-height:1.6;margin:0 0 8px">
          ⚠ 匯入會 <strong>覆蓋</strong> 目前所有資料。確認沒有比備份新的內容才匯入。
        </p>
        <label class="upload-btn" style="margin-top:6px">
          📥 選擇備份 JSON 檔
          <input type="file" id="import-backup-file" accept=".json,application/json">
        </label>
        <div id="import-status" style="font-size:12px;margin-top:8px"></div>
      </div>

      <div class="card card-soft">
        <h3 class="card-title">📊 目前儲存狀態</h3>
        <div id="storage-stats" style="font-size:13px;color:var(--text-soft);line-height:1.8">
          載入中...
        </div>
      </div>

      ${state.loadErrors?.length ? `
        <div class="warn-card">
          <strong>⚠ 部分資料載入失敗</strong><br>
          這些資料檔有問題：${state.loadErrors.map(escapeHtml).join('、')}<br>
          請重新整理頁面或重新部署。
        </div>` : ''}
    </div>
  `;
}

async function refreshStorageStats() {
  const el = document.getElementById('storage-stats');
  if (!el) return;
  const s = await gatherStorageStats();
  const persisted = await isPersisted();
  const standalone = isStandalone();
  const fmt = b => b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/1024/1024).toFixed(1)} MB`;
  const pctUsage = s.quota ? Math.round(s.usage / s.quota * 100) : null;
  el.innerHTML = `
    <dl class="backup-stats">
      <dt>PWA 模式</dt><dd>${standalone ? '✓ Standalone（豁免 7 天清除）' : '⚠ Safari（建議加到主畫面）'}</dd>
      <dt>持久儲存</dt><dd>${persisted ? '✓ 已授予（LRU eviction 最後才挑）' : '✗ 未授予'}</dd>
      <dt>卡夾資料</dt><dd>飯店 ${s.docs.hotels}・卡 ${s.docs.cards}・聯絡人 ${s.docs.contacts}</dd>
      <dt>附件</dt><dd>${s.attachCount} 個 ・ ${fmt(s.attachTotalSize)}</dd>
      <dt>旅前 To-Do 已勾</dt><dd>${s.prepDone}</dd>
      <dt>自訂景點</dt><dd>${s.customSpots}</dd>
      <dt>記帳筆數</dt><dd>${s.expenses}</dd>
      <dt>必買勾選</dt><dd>${s.shoppingBought}</dd>
      <dt>日語收藏</dt><dd>${s.phraseFav}</dd>
      <dt>行程備註</dt><dd>${s.notes} 天有寫</dd>
      ${s.quota ? `<dt>儲存使用量</dt><dd>${fmt(s.usage)} / ${fmt(s.quota)}（${pctUsage}%）</dd>` : ''}
    </dl>
  `;
}

// ===== Render: More =====
function renderMore() {
  const tiles = [
    { go: 'spots',    emoji: '📍', label: '景點清單', hint: '11 個大阪 + 京阪奈' },
    { go: 'prep',     emoji: '✅', label: '旅前 To-Do', hint: '役男核准 / VJW / 行李' },
    { go: 'emergency', emoji: '🆘', label: '緊急資訊', hint: '領事館、110、醫院' },
    { go: 'phrases',  emoji: '🗣',  label: '日語短語', hint: '90 句 + 點擊發音' },
    { go: 'transport', emoji: '🚆', label: '交通票券', hint: '機場進市區、地鐵' },
    { go: 'foods',    emoji: '🍜', label: '美食推薦', hint: '章魚燒 / 大阪燒 / 串炸' },
    { go: 'expenses', emoji: '💰', label: '兩人記帳', hint: '日圓 / 台幣分帳' },
    { go: 'shopping', emoji: '🛍', label: '必買清單', hint: '藥妝 / 電器 / 零食' },
    { go: 'backup',   emoji: '💾', label: '備份 / 設定', hint: 'iOS 7 天清資料防護' },
  ];
  return `
    <div class="page">
      <div class="section-title">所有功能</div>
      <div class="more-grid">
        ${tiles.map(t => `
          <button class="more-tile" ${t.todo ? 'disabled' : ''} ${t.go ? `data-go="${t.go}"` : ''}>
            ${t.todo ? '<span class="pill">即將</span>' : ''}
            <span class="emoji">${t.emoji}</span>
            <span class="label">${escapeHtml(t.label)}</span>
            <span class="hint">${escapeHtml(t.hint)}</span>
          </button>`).join('')}
      </div>
    </div>`;
}

// ===== Modal (圖片放大) =====
function showImageModal(url) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-bg">
      <button class="modal-close" aria-label="關閉">✕</button>
      <img src="${url}" alt="">
    </div>`;
  modalOpen('image-modal');
  const close = () => { modalClose('image-modal'); root.innerHTML = ''; };
  $('.modal-bg', root).addEventListener('click', e => { if (e.target.classList.contains('modal-bg')) close(); });
  $('.modal-close', root).addEventListener('click', close);
}

// ===== Navigation =====
const PAGE_TITLES = {
  home: '隨身夾', itinerary: '行程', spots: '景點',
  cards: '我的卡夾', more: '所有功能', prep: '旅前 To-Do',
  emergency: '緊急資訊', phrases: '日語短語', transport: '交通票券',
  foods: '美食推薦', shopping: '必買清單', expenses: '兩人記帳',
  backup: '備份 / 設定',
};

// 子頁不在 tab bar — 從更多進去後 topbar 顯示返回 chip
const TAB_PAGES = new Set(['home','itinerary','spots','cards','more']);

async function navigate(page, opts = {}) {
  const prev = state.currentPage;
  state.currentPage = page;
  // URL hash 同步（讓 iOS 系統手勢能回上頁）
  if (!opts.fromPopState) {
    const hash = '#' + page;
    if (location.hash !== hash) {
      try { history.pushState({ page }, '', hash); } catch {}
    }
  }
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  // 子頁顯示返回 chip
  const topSub = $('#topbar-sub');
  if (topSub) {
    if (!TAB_PAGES.has(page)) {
      topSub.innerHTML = `<button class="topbar-back" type="button">← 更多</button>${escapeHtml(PAGE_TITLES[page] || '')}`;
    } else {
      topSub.textContent = PAGE_TITLES[page] || '';
    }
  }
  const main = $('#app');
  if (page === 'cards') {
    main.innerHTML = '<div class="empty"><span class="empty-emoji">⏳</span>載入中...</div>';
    await loadDocs();
    await loadAttachments();
    main.innerHTML = renderCards();
  } else if (page === 'prep') {
    main.innerHTML = '<div class="empty"><span class="empty-emoji">⏳</span>載入中...</div>';
    await loadPrepDone();
    main.innerHTML = renderPrep();
  } else if (page === 'emergency') main.innerHTML = renderEmergency();
  else if (page === 'phrases') { loadPhraseFav(); main.innerHTML = renderPhrases(); }
  else if (page === 'transport') main.innerHTML = renderTransport();
  else if (page === 'foods') main.innerHTML = renderFoods();
  else if (page === 'shopping') { loadShoppingBought(); main.innerHTML = renderShopping(); }
  else if (page === 'expenses') {
    main.innerHTML = '<div class="empty"><span class="empty-emoji">⏳</span>載入中...</div>';
    await loadExpenses();
    main.innerHTML = renderExpenses();
  }
  else if (page === 'backup') {
    main.innerHTML = renderBackup();
    refreshStorageStats();
  }
  else if (page === 'home') {
    main.innerHTML = renderHome();
    setTimeout(() => fillHomeActions(), 0);
  }
  else if (page === 'itinerary') {
    await loadCustomItinerary();
    main.innerHTML = renderItinerary();
  }
  else if (page === 'spots') {
    await loadCustomSpots();
    main.innerHTML = renderSpots();
    if (state.spotsView === 'map') setTimeout(initMap, 50);
  }
  else if (page === 'more') main.innerHTML = renderMore();
  attachHandlers(page);
  // 子頁返回 chip wire up
  $('.topbar-back', topSub)?.addEventListener('click', () => navigate('more'));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// 監聽 popstate（iOS 系統滑回手勢、外接鍵盤）
window.addEventListener('popstate', e => {
  const page = e.state?.page || (location.hash ? location.hash.slice(1) : 'home');
  if (PAGE_TITLES[page]) navigate(page, { fromPopState: true });
});

function rerenderPrep() {
  if (state.currentPage !== 'prep') return;
  $('#app').innerHTML = renderPrep();
  attachHandlers('prep');
}

function rerenderPhrases() {
  if (state.currentPage !== 'phrases') return;
  const scrollY = window.scrollY;
  const focusedSearch = document.activeElement?.id === 'phrase-search';
  $('#app').innerHTML = renderPhrases();
  attachHandlers('phrases');
  window.scrollTo({ top: scrollY, behavior: 'instant' });
  if (focusedSearch) {
    const el = $('#phrase-search');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }
}

function updatePrepProgress() {
  if (!state.prep) return;
  const all = state.prep.tasks;
  const done = all.filter(t => state.prepDone.has(t.id)).length;
  const pct = all.length ? Math.round(done / all.length * 100) : 0;
  const fill = document.querySelector('.prep-progress-fill');
  const text = document.querySelector('.prep-progress-text');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = `${done} / ${all.length} ・ ${pct}% 完成`;
}

function updatePrepCategoryCounts() {
  if (!state.prep) return;
  // 用 DOM 內當前可見的 task 數來計算（避開 filter 邏輯差異）
  for (const block of $$('[data-prep-cat]')) {
    const items = block.querySelectorAll('.task-item');
    let done = 0;
    items.forEach(it => { if (it.classList.contains('done')) done++; });
    const badge = block.querySelector('.section-status');
    if (!badge) continue;
    const stat = done === items.length && items.length > 0 ? 'done' : done > 0 ? 'partial' : 'empty';
    badge.textContent = `${done} / ${items.length}`;
    badge.className = `section-status status-${stat}`;
  }
}

// Re-render only the cards page in place (for add/remove/attach changes)
async function rerenderCards() {
  if (state.currentPage !== 'cards') return;
  $('#app').innerHTML = renderCards();
  attachHandlers('cards');
}

// Update section status badges in place — no DOM rebuild, preserves focus
function refreshSectionStatuses() {
  if (!state.docs) return;
  const d = state.docs;
  const flightKeys = ['airline','flightNo','depDate','depTime','arrTime','bookingRef'];
  const updates = {
    'flight-outbound': statusFromCount(fieldsFilledCount(d.flights?.outbound, flightKeys), 6),
    'flight-return':   statusFromCount(fieldsFilledCount(d.flights?.return,   flightKeys), 6),
    'passport':        statusFromCount(fieldsFilledCount(d.passport,          ['last4','expiry']), 2),
    'insurance':       statusFromCount(fieldsFilledCount(d.insurance,         ['company','policyNo','emergencyTel']), 3),
    'military': (() => {
      const s = d.military?.status;
      if (s === 'approved')  return { kind: 'done',    label: '已核准' };
      if (s === 'submitted') return { kind: 'partial', label: '已申請' };
      return { kind: 'warn', label: '待辦！' };
    })(),
  };
  for (const [k, st] of Object.entries(updates)) {
    const badge = document.querySelector(`[data-section="${k}"] .section-status`);
    if (!badge) continue;
    badge.textContent = st.label;
    badge.className = `section-status status-${st.kind}`;
  }
}

function attachHandlers(page) {
  if (page === 'home') {
    $$('[data-go]').forEach(b => {
      b.addEventListener('click', () => navigate(b.dataset.go));
    });
  } else if (page === 'itinerary') {
    $$('.day-notes').forEach(t => {
      t.addEventListener('input', () => saveNote(t.dataset.day, t.value));
    });
    $$('[data-day-edit]').forEach(b => {
      b.addEventListener('click', () => showDayEdit(parseInt(b.dataset.dayEdit, 10)));
    });
  } else if (page === 'spots') {
    // View toggle — 切換時保留各 view 的 scroll 位置
    $$('[data-view]').forEach(b => {
      b.addEventListener('click', () => {
        const oldView = state.spotsView;
        const newView = b.dataset.view;
        if (oldView === newView) return;
        state.spotsScrollY[oldView] = window.scrollY;
        state.spotsView = newView;
        $('#app').innerHTML = renderSpots();
        attachHandlers('spots');
        if (newView === 'map') setTimeout(initMap, 50);
        window.scrollTo({ top: state.spotsScrollY[newView] || 0, behavior: 'instant' });
      });
    });
    // Filter chips
    $$('.filter-chip').forEach(c => {
      c.addEventListener('click', () => {
        state.spotFilter = c.dataset.cat;
        $('#app').innerHTML = renderSpots();
        attachHandlers('spots');
        if (state.spotsView === 'map') setTimeout(initMap, 50);
      });
    });
    // FAB add button
    $('#fab-add-spot')?.addEventListener('click', () => showSpotForm());
    // Edit custom spot
    $$('[data-edit-spot]').forEach(b => {
      b.addEventListener('click', () => {
        const s = state.customSpots.find(x => x.id === b.dataset.editSpot);
        if (s) showSpotForm(s);
      });
    });
    // Delete custom spot
    $$('[data-del-spot]').forEach(b => {
      b.addEventListener('click', async () => {
        const ok = await confirmSheet({
          title: '刪除這個自訂景點？', confirmText: '刪除', danger: true,
        });
        if (!ok) return;
        state.customSpots = state.customSpots.filter(s => s.id !== b.dataset.delSpot);
        saveCustomSpots();
        $('#app').innerHTML = renderSpots();
        attachHandlers('spots');
        if (state.spotsView === 'map') setTimeout(initMap, 50);
      });
    });
  } else if (page === 'more') {
    $$('.more-tile[data-go]').forEach(b => {
      b.addEventListener('click', () => navigate(b.dataset.go));
    });
  } else if (page === 'backup') {
    document.getElementById('export-backup')?.addEventListener('click', async () => {
      const btn = document.getElementById('export-backup');
      const status = document.getElementById('export-status');
      btn.disabled = true; btn.textContent = '📤 匯出中...';
      try {
        const sz = await exportBackup();
        status.style.color = '#2d7a2d';
        status.textContent = `✓ 已下載 ${(sz/1024).toFixed(1)} KB JSON 檔。建議存到 iCloud Drive 或寄給自己。`;
        btn.textContent = '📤 再次匯出';
      } catch (e) {
        status.style.color = '#c12d2d';
        status.textContent = '匯出失敗：' + e.message;
        btn.textContent = '📤 重試';
      } finally {
        btn.disabled = false;
        refreshStorageStats();
      }
    });
    document.getElementById('import-backup-file')?.addEventListener('change', async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const status = document.getElementById('import-status');
      const ok = await confirmSheet({
        title: '匯入備份？',
        message: `「${file.name}」會覆蓋目前所有資料（卡夾、行程、勾選、附件全部換掉）。`,
        confirmText: '覆蓋並匯入', danger: true,
      });
      if (!ok) { e.target.value = ''; return; }
      status.style.color = 'var(--text-soft)';
      status.textContent = '⏳ 匯入中...';
      try {
        const r = await importBackup(file);
        status.style.color = '#2d7a2d';
        status.innerHTML = `✓ 匯入完成（${new Date(r.exportedAt).toLocaleString('zh-TW', {timeZone: TRIP_TZ})}）<br>卡夾 ${r.counts.hotels} 飯店、勾選 ${r.counts.prepDone}、自訂景點 ${r.counts.customSpots}、記帳 ${r.counts.expenses}、附件 ${r.counts.attachments}`;
        refreshStorageStats();
      } catch (err) {
        status.style.color = '#c12d2d';
        status.textContent = '匯入失敗：' + err.message;
      }
      e.target.value = '';
    });
  } else if (page === 'foods') {
    $$('[data-food-cat]').forEach(b => {
      b.addEventListener('click', () => { state.foodCat = b.dataset.foodCat; navigate('foods'); });
    });
  } else if (page === 'shopping') {
    $$('[data-shop]').forEach(c => {
      c.addEventListener('click', () => {
        const id = c.dataset.shop;
        if (state.shoppingBought.has(id)) state.shoppingBought.delete(id);
        else state.shoppingBought.add(id);
        saveShoppingBought();
        const row = c.closest('.shop-item');
        row?.classList.toggle('bought');
      });
    });
  } else if (page === 'expenses') {
    const amt = $('#exp-amount'), lab = $('#exp-label'), pay = $('#exp-payer'), spl = $('#exp-split');
    [amt, lab, pay, spl].forEach(el => {
      if (!el) return;
      el.addEventListener('input', () => {
        state.expenseInput.amount = amt.value;
        state.expenseInput.label = lab.value;
        state.expenseInput.payer = pay.value;
        state.expenseInput.split = spl.value;
      });
    });
    $('#exp-add')?.addEventListener('click', () => {
      const amount = parseInt(amt.value, 10);
      if (!amount || amount <= 0) { toast('請輸入有效金額', 'err'); amt?.focus(); return; }
      const expense = {
        id: 'e' + Date.now() + Math.random().toString(36).slice(2, 5),
        ts: Date.now(),
        amount,
        label: lab.value.trim(),
        payer: pay.value,
        split: spl.value,
      };
      state.expenses.push(expense);
      saveExpenses();
      state.expenseInput = { amount: '', label: '', payer: pay.value, split: spl.value };
      rerenderExpenses();
    });
    $$('[data-exp-del]').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.dataset.expDel;
        const ok = await confirmSheet({ title: '刪除這筆記帳？', confirmText: '刪除', danger: true });
        if (!ok) return;
        state.expenses = state.expenses.filter(e => e.id !== id);
        saveExpenses();
        rerenderExpenses();
      });
    });
  } else if (page === 'phrases') {
    // 搜尋：不 re-render 整頁，只 hide/show 卡片（避免打斷 IME composing）
    const search = $('#phrase-search');
    if (search) {
      search.addEventListener('input', () => {
        state.phraseQuery = search.value;
        const q = search.value.toLowerCase().trim();
        let visible = 0;
        const cards = $$('.phrase-card');
        cards.forEach(c => {
          const matches = !q || (c.dataset.search || '').includes(q);
          c.classList.toggle('search-hidden', !matches);
          if (matches) visible++;
        });
        const countEl = $('.phrase-count');
        if (countEl) countEl.textContent = `${visible} 句 ・ 共 ${state.phrases.phrases.length} 句`;
      });
    }
    // 分類 chip — 改變 filter 才整頁 render
    $$('[data-phrase-cat]').forEach(b => {
      b.addEventListener('click', () => {
        state.phraseCat = b.dataset.phraseCat;
        rerenderPhrases();
      });
    });
    // 播放（iOS TTS）
    $$('[data-speak]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.speak;
        const p = state.phrases.phrases.find(x => x.id === id);
        if (!p) return;
        const text = p.jp.replace(/\s*[\(（].*?[\)）]\s*/g, '');
        $$('.phrase-btn.play').forEach(x => x.classList.remove('speaking'));
        b.classList.add('speaking');
        state.speakingId = id;
        speakJp(text, () => {
          b.classList.remove('speaking');
          state.speakingId = null;
        });
      });
    });
    // 收藏
    $$('[data-fav]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.fav;
        if (state.phraseFav.has(id)) state.phraseFav.delete(id);
        else state.phraseFav.add(id);
        savePhraseFav();
        const card = b.closest('.phrase-card');
        const on = state.phraseFav.has(id);
        b.classList.toggle('on', on);
        b.textContent = on ? '⭐' : '☆';
        card?.classList.toggle('favorite', on);
        const favChip = document.querySelector('[data-phrase-cat="fav"]');
        if (favChip) {
          favChip.textContent = state.phraseFav.size
            ? `⭐ 收藏 (${state.phraseFav.size})`
            : '⭐ 收藏';
        }
      });
    });
  } else if (page === 'prep') {
    // 篩選 chip
    $$('[data-prep-filter]').forEach(b => {
      b.addEventListener('click', () => {
        state.prepFilter = b.dataset.prepFilter;
        rerenderPrep();
      });
    });
    // urgent-banner「還有 N 項」可點 → 切到 urgent filter
    document.querySelector('[data-jump-urgent]')?.addEventListener('click', () => {
      state.prepFilter = 'urgent';
      rerenderPrep();
    });
    // 分類摺疊
    $$('[data-toggle-cat]').forEach(h => {
      h.addEventListener('click', () => {
        const k = h.dataset.toggleCat;
        if (state.prepOpenCats.has(k)) state.prepOpenCats.delete(k);
        else state.prepOpenCats.add(k);
        h.parentElement.classList.toggle('open');
      });
    });
    // 勾選 checkbox（點 checkbox 元素本身）
    $$('[data-check]').forEach(c => {
      c.addEventListener('click', e => {
        e.stopPropagation();
        const id = c.dataset.check;
        if (state.prepDone.has(id)) state.prepDone.delete(id);
        else state.prepDone.add(id);
        savePrepDone();
        // 局部更新：task item class + 進度條
        const item = c.closest('.task-item');
        item?.classList.toggle('done');
        updatePrepProgress();
        updatePrepCategoryCounts();
      });
    });
    // 展開 task 細節（點內容區，避開連結與 checkbox）
    $$('[data-expand]').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.task-link')) return;
        const id = el.dataset.expand;
        if (state.prepExpanded.has(id)) state.prepExpanded.delete(id);
        else state.prepExpanded.add(id);
        el.closest('.task-item')?.classList.toggle('expanded');
      });
    });
  } else if (page === 'cards') {
    // 工具列：全部展開 / 全部收合 / 跳轉
    document.querySelector('[data-cards-action="expand-all"]')?.addEventListener('click', () => {
      ['flight-outbound','flight-return','passport','military','hotels','insurance','creditcards','contacts'].forEach(k => state.cardsOpen.add(k));
      $$('.section-block').forEach(b => b.classList.add('open'));
    });
    document.querySelector('[data-cards-action="collapse-all"]')?.addEventListener('click', () => {
      state.cardsOpen.clear();
      $$('.section-block').forEach(b => b.classList.remove('open'));
    });
    document.getElementById('cards-jump')?.addEventListener('change', e => {
      const k = e.target.value;
      if (!k) return;
      const block = document.querySelector(`[data-section="${k}"]`);
      if (block) {
        state.cardsOpen.add(k);
        block.classList.add('open');
        block.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      e.target.value = '';  // reset
    });
    // 摺疊（點 section header）
    $$('.section-head').forEach(h => {
      h.addEventListener('click', () => {
        const k = h.dataset.toggle;
        if (state.cardsOpen.has(k)) state.cardsOpen.delete(k);
        else state.cardsOpen.add(k);
        h.parentElement.classList.toggle('open');
      });
    });
    // 文字 / 日期欄位 input
    $$('[data-bind]').forEach(el => {
      const handler = () => {
        setNested(state.docs, el.dataset.bind, el.value);
        saveDocs();
        refreshSectionStatuses();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });
    // 新增（飯店、信用卡、聯絡人）
    $$('[data-add]').forEach(b => {
      b.addEventListener('click', () => {
        const arr = state.docs[b.dataset.add];
        if (!Array.isArray(arr)) return;
        arr.push({});
        saveDocs();
        const k = b.dataset.add === 'hotels' ? 'hotels'
                : b.dataset.add === 'cards' ? 'creditcards' : 'contacts';
        state.cardsOpen.add(k);
        rerenderCards();
      });
    });
    // 移除某個 array 項
    $$('[data-remove]').forEach(b => {
      b.addEventListener('click', async () => {
        const path = b.dataset.remove;
        const [arrName, idxStr] = path.split('.');
        const idx = parseInt(idxStr, 10);
        const arr = state.docs[arrName];
        if (!Array.isArray(arr)) return;
        // 同步 IDB + in-memory 重新編號 hotel attachments
        if (arrName === 'hotels') {
          // 1. 刪除被移除 hotel 的附件（IDB + memory）
          await deleteAttachment(`attach.hotel-${idx}`);
          // 2. 把後續 hotel 的附件全部前移一格（IDB + memory）
          for (let i = idx + 1; i < arr.length; i++) {
            const fromKey = `attach.hotel-${i}`;
            const toKey = `attach.hotel-${i - 1}`;
            const v = await dbGet(fromKey);
            if (v) {
              await dbSet(toKey, v);
              await dbDel(fromKey);
            }
            const mem = state.attach[fromKey];
            if (mem) {
              state.attach[toKey] = mem;
              delete state.attach[fromKey];
            }
          }
        }
        arr.splice(idx, 1);
        saveDocs();
        const k = arrName === 'hotels' ? 'hotels'
                : arrName === 'cards' ? 'creditcards' : 'contacts';
        state.cardsOpen.add(k);
        rerenderCards();
      });
    });
    // 檔案上傳
    $$('[data-attach]').forEach(inp => {
      inp.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const key = inp.dataset.attach;
        await saveAttachment(key, file);
        rerenderCards();
      });
    });
    // 點擊縮圖：圖片放大、PDF 開新分頁
    $$('[data-attach-view]').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('[data-attach-del]')) return;
        const key = el.dataset.attachView;
        const a = state.attach[key];
        if (!a) return;
        if (a.type.startsWith('image/')) {
          showImageModal(a.url);
        } else {
          window.open(a.url, '_blank');
        }
      });
    });
    // 刪除附件
    $$('[data-attach-del]').forEach(b => {
      b.addEventListener('click', async e => {
        e.stopPropagation();
        const ok = await confirmSheet({ title: '刪除這個附件？', confirmText: '刪除', danger: true });
        if (!ok) return;
        await deleteAttachment(b.dataset.attachDel);
        rerenderCards();
      });
    });
  }
}

function setupNav() {
  $$('.tab').forEach(t => t.addEventListener('click', () => navigate(t.dataset.page)));
}

// ===== Service Worker =====
function showUpdateBanner(onConfirm) {
  if (document.getElementById('update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <div class="ub-text">
      <strong>📦 有新版</strong>
      <span>點此更新（不會打斷你目前的輸入；可稍後再點）</span>
    </div>
    <button class="ub-btn">立即更新</button>
    <button class="ub-close" aria-label="稍後">✕</button>
  `;
  banner.querySelector('.ub-btn').addEventListener('click', () => {
    banner.querySelector('.ub-btn').textContent = '更新中...';
    banner.querySelector('.ub-btn').disabled = true;
    onConfirm();
  });
  banner.querySelector('.ub-close').addEventListener('click', () => banner.remove());
  document.body.appendChild(banner);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  let waitingWorker = null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  const doRegister = () => navigator.serviceWorker.register('service-worker.js')
    .then(reg => {
      // 如果頁面載入時已經有 waiting SW（先前 install 但沒接管）
      if (reg.waiting && navigator.serviceWorker.controller) {
        waitingWorker = reg.waiting;
        showUpdateBanner(() => waitingWorker.postMessage({ type: 'SKIP_WAITING' }));
      }
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            // 新版裝好，等使用者點按鈕才接管 — 不打斷編輯
            waitingWorker = w;
            showUpdateBanner(() => w.postMessage({ type: 'SKIP_WAITING' }));
          }
        });
      });
    })
    .catch(err => console.warn('Service Worker 註冊失敗:', err));
  if (document.readyState === 'complete') doRegister();
  else window.addEventListener('load', doRegister, { once: true });
}

// ===== Init =====
(async function init() {
  try {
    await loadData();
    setupNav();
    navigate('home');
    registerSW();
    // 試圖向 iOS 申請「持久儲存」— standalone PWA 較易拿到
    requestPersistentStorage();
  } catch (err) {
    $('#app').innerHTML = `
      <div class="empty">
        <span class="empty-emoji">⚠️</span>
        資料載入失敗：${escapeHtml(err.message)}<br>
        <small>請檢查是否從 http(s) 開啟，不是直接點開 file://</small>
      </div>`;
    console.error(err);
  }
})();
