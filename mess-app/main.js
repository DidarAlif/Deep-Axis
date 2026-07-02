/* ========================================
   MESS MANAGER — Main Application
   ======================================== */

// ── Member Colors ──
const COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#f472b6'];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DEFAULT_MEMBERS = ['ALIF', 'JUBAYER', 'SADMAN', 'ABID', 'RIFAT', 'RABBI', 'RAFID', 'LIKHON'];

const UTILITY_FIELDS = [
  { key: 'cylinder', label: 'Cylinder', divideBy: 7 },
  { key: 'dust', label: 'Dust', divideBy: 7 },
  { key: 'water', label: 'Water', divideBy: 7 },
  { key: 'serviceCharge', label: 'Service Charge', divideBy: 7 },
  { key: 'electricity', label: 'Electricity', divideBy: 4 },
  { key: 'internet', label: 'Internet', divideBy: 7 },
  { key: 'rannaBua', label: 'Ranna Bua', divideBy: 4 },
  { key: 'houseCleaner', label: 'House Cleaner', divideBy: 7 },
];

// ── State ──
function defaultState() {
  const now = new Date();
  return {
    members: [...DEFAULT_MEMBERS],
    memberMeta: {}, // { MEMBER_NAME: { addedAt: '2025-03', addedDate: ISO } }
    deletedMembers: {}, // { MEMBER_NAME: { deletedAt: '2025-08', deletedDate: ISO } }
    currentMonth: now.getMonth(),
    currentYear: now.getFullYear(),
    months: {}
  };
}

function uniqMembers(list) {
  const seen = new Set();
  return (list || [])
    .map(m => String(m || '').trim().toUpperCase())
    .filter(m => {
      if (!m || seen.has(m)) return false;
      seen.add(m);
      return true;
    });
}

function knownMembers(st = state) {
  const active = Array.isArray(st.members) && st.members.length ? st.members : DEFAULT_MEMBERS;
  return uniqMembers([
    ...active,
    ...Object.keys(st.memberMeta || {}),
    ...Object.keys(st.deletedMembers || {})
  ]);
}

// Check if a member should be active for a given month key
function isMemberActiveForMonth(memberName, mk, st = state) {
  const meta = st.memberMeta && st.memberMeta[memberName];
  const deleted = st.deletedMembers && st.deletedMembers[memberName];

  // If member has an addedAt, they should not appear in months before that
  if (meta && meta.addedAt && mk < meta.addedAt) return false;

  // If member was deleted, they should not appear in months after deletedAt
  if (deleted && deleted.deletedAt && mk > deleted.deletedAt) return false;

  return true;
}

function activeLoginMembers(st = state) {
  return uniqMembers(st.members || DEFAULT_MEMBERS).filter(m => {
    const deleted = st.deletedMembers && st.deletedMembers[m];
    return !(deleted && deleted.deletedAt);
  });
}

function membersForMonth(st, mk, md) {
  const existing = uniqMembers(md && md.members);
  const expected = knownMembers(st).filter(m => isMemberActiveForMonth(m, mk, st));
  if (!existing.length) return expected;

  const kept = existing.filter(m => expected.includes(m));
  const added = expected.filter(m => !kept.includes(m));
  return [...kept, ...added];
}

function currentMonthMembers() {
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);
  return md.members || [];
}

function sameMembers(a, b) {
  return a.length === b.length && a.every((m, i) => m === b[i]);
}

function remapByMember(values, oldMembers, newMembers, fallback) {
  return newMembers.map((member, idx) => {
    const oldIdx = oldMembers.indexOf(member);
    return oldIdx >= 0 && values && values[oldIdx] !== undefined ? values[oldIdx] : fallback(member, idx);
  });
}

function remapIndexedMonthData(md, oldMembers, newMembers) {
  ['meals', 'bazar', 'bazarOthers'].forEach(k => {
    const fillVal = k === 'meals' ? null : 0;
    md[k] = remapByMember(md[k], oldMembers, newMembers, () => new Array(31).fill(fillVal));
  });

  ['vMealsUser', 'vMealsAdmin', 'vBazarUser', 'vBazarAdmin', 'vBazarOthersUser', 'vBazarOthersAdmin'].forEach(k => {
    md[k] = remapByMember(md[k], oldMembers, newMembers, () => new Array(31).fill(false));
  });

  md.rent = remapByMember(md.rent, oldMembers, newMembers, member => DEFAULT_RENT[member] || 0);
  md.rentPaid = remapByMember(md.rentPaid, oldMembers, newMembers, () => 0);
  md.rentExtras = remapByMember(md.rentExtras, oldMembers, newMembers, () => 0);
  md.historyBalances = remapByMember(md.historyBalances, oldMembers, newMembers, () => 0);
  md.historyStatus = remapByMember(md.historyStatus, oldMembers, newMembers, () => '');
  md.mealOff = remapByMember(md.mealOff, oldMembers, newMembers, () => false);

  const nextExclusions = {};
  Object.entries(md.rentExclusions || {}).forEach(([key, val]) => {
    const [oldIdx, utilityKey] = key.split('_');
    const member = oldMembers[Number(oldIdx)];
    const newIdx = newMembers.indexOf(member);
    if (newIdx >= 0 && utilityKey) nextExclusions[`${newIdx}_${utilityKey}`] = val;
  });
  md.rentExclusions = nextExclusions;
}

let currentUser = null;
let rentUnlocked = false;
let historyUnlocked = false;

function monthKey(m, y) { return `${y}-${String(m + 1).padStart(2, '0')}`; }

// ── Security & Date Helpers ──
function getBDDate() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
  return { day: d.getDate(), month: d.getMonth(), year: d.getFullYear() };
}

function isDatePassed(day, month, year) {
  const bd = getBDDate();
  if (year < bd.year) return true;
  if (year > bd.year) return false;
  if (month < bd.month) return true;
  if (month > bd.month) return false;
  // If it's the current month and year, allow editing/verifying till the end of the month
  return false;
}

function canEditRecord(memberIdx, day) {
  if (isAdmin()) return true;
  if (currentMonthMembers()[memberIdx] !== currentUser) return false;

  const bd = getBDDate();
  const targetDate = new Date(state.currentYear, state.currentMonth, day);
  const currentDate = new Date(bd.year, bd.month, bd.day);

  const diffTime = currentDate.getTime() - targetDate.getTime();
  const diffDays = Math.round(diffTime / 86400000);

  return diffDays <= 1;
}

function canVerifyRecord(day, month, year) {
  // Can verify as long as the month hasn't passed
  return !isDatePassed(day, month, year);
}

function toggleVerify(mi, d, type, dataKey) {
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);
  const vPrefix = dataKey === 'meals' ? 'Meals' : (dataKey === 'bazar' ? 'Bazar' : 'BazarOthers');
  const vKey = type === 'user' ? `v${vPrefix}User` : `v${vPrefix}Admin`;

  if (!isAdmin() && !canVerifyRecord(d + 1, state.currentMonth, state.currentYear)) {
    showToast('Verification window closed', 'info');
    return;
  }

  if (type === 'user') {
    if (currentMonthMembers()[mi] !== currentUser) {
      showToast('Verify your own records only', 'error');
      return;
    }
  } else {
    if (!isAdmin()) {
      showToast('Admin verification required', 'error');
      return;
    }
  }

  const newValue = !md[vKey][mi][d];
  md[vKey][mi][d] = newValue;
  saveUpdates({ [`months/${mk}/${vKey}/${mi}/${d}`]: newValue });
  saveLocal();

  // High performance DOM updates without full re-render
  const badgeId = `v-${dataKey}-${mi}-${d}-${type}`;
  const badgeEl = document.querySelector(`[data-vid="${badgeId}"]`);
  if (badgeEl) {
    if (newValue) {
      badgeEl.classList.add('v-on');
    } else {
      badgeEl.classList.remove('v-on');
    }
  }

  const vUser = md[`v${vPrefix}User`][mi][d];
  const vAdmin = md[`v${vPrefix}Admin`][mi][d];
  const fullyVerified = vUser && vAdmin;

  const inpEl = document.getElementById(`inp-${dataKey}-${mi}-${d}`);
  if (inpEl) {
    inpEl.disabled = !canEditRecord(mi, d + 1) || (fullyVerified && !isAdmin());
    if (inpEl.parentElement) {
      if (fullyVerified) {
        inpEl.parentElement.classList.add('cell-fully-verified');
      } else {
        inpEl.parentElement.classList.remove('cell-fully-verified');
      }
    }
  }

  showToast('Verification updated', 'success');
}

// Default utility bills from the Excel file (house rent sheet row 6)
const DEFAULT_UTILITIES = {
  cylinder: 0,
  dust: 200,
  water: 1000,
  serviceCharge: 3000,
  electricity: 1200,
  internet: 840,
  rannaBua: 2800,
  houseCleaner: 1000,
};

// Default rent per member from the Excel file (house rent sheet rows 41-47)
// These are modifiable — just initial defaults for new months
const DEFAULT_RENT = {
  'ALIF': 2000,
  'JUBAYER': 3500,
  'SADMAN': 3500,
  'ABID': 0,
  'RIFAT': 3500,
  'RABBI': 3500,
  'RAFID': 1500,
  'LIKHON': 2000,
};

function ensureMonthData(st, mk) {
  if (!st.months[mk]) {
    const members = membersForMonth(st, mk);
    const n = members.length;
    st.months[mk] = {
      members: [...members],
      meals: Array.from({ length: n }, () => new Array(31).fill(null)),
      vMealsUser: Array.from({ length: n }, () => new Array(31).fill(false)),
      vMealsAdmin: Array.from({ length: n }, () => new Array(31).fill(false)),
      bazar: Array.from({ length: n }, () => new Array(31).fill(0)),
      vBazarUser: Array.from({ length: n }, () => new Array(31).fill(false)),
      vBazarAdmin: Array.from({ length: n }, () => new Array(31).fill(false)),
      bazarOthers: Array.from({ length: n }, () => new Array(31).fill(0)),
      vBazarOthersUser: Array.from({ length: n }, () => new Array(31).fill(false)),
      vBazarOthersAdmin: Array.from({ length: n }, () => new Array(31).fill(false)),
      utilities: {},
      utilityDivisors: {},
      utilityStatus: {},
      utilityPaidBy: {},
      rent: members.map(m => DEFAULT_RENT[m] || 0),
      rentPaid: new Array(n).fill(0),
      rentExclusions: {}, // { "memberIdx_utilityKey": true }
      rentExtras: new Array(n).fill(0),
      bazarSlots: [], // array of length = days, each entry = member name
      historyBalances: new Array(n).fill(0),
      historyStatus: new Array(n).fill(''),
      mealOff: new Array(n).fill(false),
    };
    UTILITY_FIELDS.forEach(f => {
      st.months[mk].utilities[f.key] = DEFAULT_UTILITIES[f.key] || 0;
      st.months[mk].utilityDivisors[f.key] = f.divideBy;
      st.months[mk].utilityStatus[f.key] = 'unpaid';
      st.months[mk].utilityPaidBy[f.key] = '';
    });
  }
  const md = st.months[mk];
  const oldMembers = uniqMembers(md.members);
  const nextMembers = membersForMonth(st, mk, md);
  if (oldMembers.length && !sameMembers(oldMembers, nextMembers)) {
    remapIndexedMonthData(md, oldMembers, nextMembers);
  }
  md.members = nextMembers;
  const n = md.members.length;
  ['meals', 'bazar', 'bazarOthers'].forEach(k => {
    if (!Array.isArray(md[k])) md[k] = Object.values(md[k] || {});
    const fillVal = (k === 'meals') ? null : 0;
    while (md[k].length < n) md[k].push(new Array(31).fill(fillVal));
    for (let i = 0; i < md[k].length; i++) {
      if (!Array.isArray(md[k][i])) {
        const obj = md[k][i] || {};
        md[k][i] = new Array(31).fill(fillVal);
        Object.keys(obj).forEach(idx => {
          const v = obj[idx];
          if (k === 'meals') {
            md[k][i][+idx] = (v === null || v === undefined) ? null : Number(v);
          } else {
            md[k][i][+idx] = Number(v) || 0;
          }
        });
      } else {
        while (md[k][i].length < 31) md[k][i].push(fillVal);
        for (let d = 0; d < 31; d++) {
          if (k === 'meals') {
            if (md[k][i][d] === undefined) md[k][i][d] = null;
          } else {
            if (md[k][i][d] === undefined || md[k][i][d] === null) md[k][i][d] = 0;
          }
        }
      }
    }
  });
  ['vMealsUser', 'vMealsAdmin', 'vBazarUser', 'vBazarAdmin', 'vBazarOthersUser', 'vBazarOthersAdmin'].forEach(k => {
    if (!md[k]) md[k] = Array.from({ length: n }, () => new Array(31).fill(false));
    if (!Array.isArray(md[k])) md[k] = Object.values(md[k] || {});
    while (md[k].length < n) md[k].push(new Array(31).fill(false));
    for (let i = 0; i < md[k].length; i++) {
      if (!Array.isArray(md[k][i])) {
        const obj = md[k][i] || {};
        md[k][i] = new Array(31).fill(false);
        Object.keys(obj).forEach(idx => { md[k][i][+idx] = !!obj[idx]; });
      } else {
        while (md[k][i].length < 31) md[k][i].push(false);
        for (let d = 0; d < 31; d++) {
          if (md[k][i][d] === undefined || md[k][i][d] === null) md[k][i][d] = false;
        }
      }
    }
  });
  while (md.rent.length < n) md.rent.push(DEFAULT_RENT[md.members[md.rent.length]] || 0);
  while (md.rentPaid.length < n) md.rentPaid.push(0);
  if (!md.rentExclusions) md.rentExclusions = {};
  if (!md.utilityStatus) md.utilityStatus = {};
  if (!md.utilityPaidBy) md.utilityPaidBy = {};
  if (!md.rentExtras) md.rentExtras = new Array(n).fill(0);
  while (md.rentExtras.length < n) md.rentExtras.push(0);
  if (!md.bazarSlots) md.bazarSlots = [];
  while (md.historyBalances.length < n) md.historyBalances.push(0);
  while (md.historyStatus.length < n) md.historyStatus.push('');
  if (!md.mealOff) md.mealOff = new Array(n).fill(false);
  while (md.mealOff.length < n) md.mealOff.push(false);
  // Khala calendar data
  if (!md.khalaCook) md.khalaCook = new Array(31).fill(null);
  while (md.khalaCook.length < 31) md.khalaCook.push(null);
  if (!md.khalaCleaner) md.khalaCleaner = new Array(31).fill(null);
  while (md.khalaCleaner.length < 31) md.khalaCleaner.push(null);
  return md;
}

function daysInMonth(m, y) { return new Date(y, m + 1, 0).getDate(); }

let state = defaultState();

// ── Firebase Config ──
const firebaseConfig = {
  apiKey: "AIzaSyAnM53b5Jx-YESl5GrfS-5LL8FUS6ACiOs",
  authDomain: "deep-axis-mess.firebaseapp.com",
  databaseURL: "https://deep-axis-mess-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "deep-axis-mess",
  storageBucket: "deep-axis-mess.firebasestorage.app",
  messagingSenderId: "516980608323",
  appId: "1:516980608323:web:efdd18905a6a09a76573f6"
};
const fbApp = firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const stateRef = db.ref('messState');
let _saveTimer = null;
let _skipNextRender = false;
let _firebaseReady = false;

function saveUpdates(updates) {
  stateRef.update(updates).catch(err => {
    console.error('Firebase update error:', err);
    showToast('Sync error \u2014 saved locally', 'error');
  });
}

let _localSaveTimer = null;
const _inputDebounceTimers = {}; // per-cell debounce timers for real-time save
function saveLocal() {
  if (_localSaveTimer) clearTimeout(_localSaveTimer);
  _localSaveTimer = setTimeout(() => {
    localStorage.setItem('messManagerState', JSON.stringify(state));
  }, 1000);
}

function load() {
  const raw = localStorage.getItem('messManagerState');
  if (raw) {
    try { state = JSON.parse(raw); } catch (e) { state = defaultState(); }
  }
  hydratePasswordsFromLocal();
}

// migrateMealNulls removed: it was destroying valid 0 meal entries by converting
// unverified 0 → null on every Firebase sync, which then became 3 via runPeriodicTasks.

function initFirebase() {
  stateRef.on('value', snapshot => {
    const data = snapshot.val();
    if (data) {
      state = data;
      if (!Array.isArray(state.members)) state.members = [...DEFAULT_MEMBERS];
      hydratePasswordsFromLocal();
      // migrateMealNulls() removed — was destroying valid 0 meal entries
      localStorage.setItem('messManagerState', JSON.stringify(state));
      // Keep login dropdown in sync with state.members across all connected clients
      if (typeof refreshLoginDropdown === 'function') refreshLoginDropdown();
      // If current user was deleted from members, force logout
      if (currentUser && !activeLoginMembers().includes(currentUser)) {
        logout();
        showToast('Your account has been removed', 'error');
        return;
      }
      if (_skipNextRender) {
        _skipNextRender = false;
      } else {
        renderActiveTabOnly();
      }
    }
    if (!_firebaseReady) {
      _firebaseReady = true;
      showToast('\u2601\ufe0f Real-time sync active!', 'success');

      // Feature: Auto Month Rollover & Meal Auto-Defaults
      if (typeof runPeriodicTasks === 'function') {
        runPeriodicTasks();
        setInterval(runPeriodicTasks, 60000);
      }
    }
  }, err => {
    console.error('Firebase listen error:', err);
    showToast('\u26a0\ufe0f Offline mode \u2014 changes saved locally only', 'error');
  });
}

// ── Calculations (match Excel formulas) ──
function calcReport(md, members) {
  const n = members.length;
  const totalMeals = new Array(n); // C col
  const totalBazar = new Array(n); // F col
  const totalOthersSpend = new Array(n); // J col

  for (let i = 0; i < n; i++) {
    totalMeals[i] = (md.meals[i] || []).reduce((a, b) => a + (Number(b) || 0), 0);
    totalBazar[i] = (md.bazar[i] || []).reduce((a, b) => a + (Number(b) || 0), 0);
    totalOthersSpend[i] = (md.bazarOthers[i] || []).reduce((a, b) => a + (Number(b) || 0), 0);
  }

  const grandTotalMeals = totalMeals.reduce((a, b) => a + b, 0); // C13
  const grandTotalBazar = totalBazar.reduce((a, b) => a + b, 0); // F13
  const grandTotalOthers = totalOthersSpend.reduce((a, b) => a + b, 0); // J12

  const perMealRate = grandTotalMeals > 0 ? grandTotalBazar / grandTotalMeals : 0; // =$F$13/$C$13

  const results = [];
  for (let i = 0; i < n; i++) {
    const mealCost = totalMeals[i] * perMealRate;        // =C4*D4
    const givenTake = totalBazar[i] - mealCost;           // =F4-E4
    const othersShare = n > 0 ? grandTotalOthers / n : 0; // =AVERAGE(J12/7)
    const finalBalance = givenTake + totalOthersSpend[i] - othersShare; // =SUM(H4,J4)-K4

    results.push({
      name: members[i],
      totalMeals: totalMeals[i],
      perMealRate,
      mealCost,
      totalBazar: totalBazar[i],
      givenTake,
      othersSpend: totalOthersSpend[i],
      othersShare,
      finalBalance
    });
  }
  return { results, grandTotalMeals, grandTotalBazar, grandTotalOthers, perMealRate };
}

function calcRent(md, members) {
  const n = members.length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const shares = {};
    let serviceTotal = 0;
    UTILITY_FIELDS.forEach(f => {
      // Check exclusion
      if (md.rentExclusions[`${i}_${f.key}`]) {
        shares[f.key] = 0;
        return;
      }

      // Calculate divisor based on current exclusions for this field
      let excludedCount = 0;
      for (let j = 0; j < n; j++) {
        if (md.rentExclusions[`${j}_${f.key}`]) excludedCount++;
      }

      const activeCount = n - excludedCount;
      const divisor = md.utilityDivisors[f.key] || f.divideBy;
      // If divisor is default (n), we use activeCount. Otherwise use the manual divisor.
      const actualDivisor = (divisor === f.divideBy) ? activeCount : divisor;

      const val = actualDivisor > 0 ? (md.utilities[f.key] || 0) / actualDivisor : 0;
      shares[f.key] = val;
      serviceTotal += val;
    });
    const rent = md.rent[i] || 0;
    const extra = md.rentExtras[i] || 0;
    const total = serviceTotal + rent + extra;
    const paid = md.rentPaid[i] || 0;
    const yet = total - paid;
    rows.push({ name: members[i], shares, serviceTotal, rent, extra, total, paid, yet });
  }
  return rows;
}

// ── DOM Helpers ──
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else if (typeof v === 'boolean') e[k] = v;
    else e.setAttribute(k, v);
  }
  children.forEach(c => {
    if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(c));
    else if (Array.isArray(c)) c.forEach(item => item && e.appendChild(item));
    else if (c && c.nodeType) e.appendChild(c);
    else if (c) e.appendChild(c);
  });
  return e;
}

function showToast(msg, type = 'success') {
  const container = $('#toastContainer');
  const toast = el('div', { class: `toast ${type}` }, msg);
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '0';
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
}
function fmtTk(n) { return '৳' + fmt(n); }

function avatar(name, idx) {
  const photoMap = {
    'ALIF': 'alif.png',
    'JUBAYER': 'jubayer.png',
    'SADMAN': 'sadman.png',
    'RIFAT': 'rifat.png',
    'RABBI': 'rabby.png',
    'RABBY': 'rabby.png',
    'RAFID': 'rafid.png',
    'LIKKON': 'likhon.png',
    'LIKHON': 'likhon.png'
  };

  const photo = photoMap[name.toUpperCase()];
  const color = COLORS[idx % COLORS.length];
  const initial = (name || '?')[0].toUpperCase();

  const front = el('div', { class: 'avatar-front' });
  if (photo) {
    const img = el('img', {
      src: photo, // Removed leading slash for relative pathing
      alt: name,
      onerror: function () {
        this.parentElement.style.background = color;
        this.parentElement.textContent = initial;
        this.remove();
      }
    });
    front.appendChild(img);
  } else {
    front.style.background = color;
    front.textContent = initial;
  }

  const back = el('div', { class: 'avatar-back', style: `background:${color}` }, initial);
  const inner = el('div', { class: 'avatar-inner' }, front, back);
  return el('div', { class: 'avatar' }, inner);
}

// ── Tab Navigation ──
function initNav() {
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab-content').forEach(t => t.classList.remove('active'));
      $(`#tab-${btn.dataset.tab}`).classList.add('active');
      $('#sidebar').classList.remove('open');

      // Delay slightly or call directly to populate the active tab container
      renderActiveTabOnly();
    });
  });
  $('#hamburger').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });
}

// ── Auth System ──
function persistPasswords(pw) {
  state.passwords = pw || {};
  localStorage.setItem('messPasswords', JSON.stringify(state.passwords));
}

function hydratePasswordsFromLocal() {
  if (state.passwords && Object.keys(state.passwords).length > 0) {
    localStorage.setItem('messPasswords', JSON.stringify(state.passwords));
    return;
  }
  const raw = localStorage.getItem('messPasswords');
  if (raw) {
    try {
      const pw = JSON.parse(raw);
      if (pw && Object.keys(pw).length > 0) state.passwords = pw;
    } catch (e) { }
  }
}

function getPasswords() {
  hydratePasswordsFromLocal();
  if (state.passwords && Object.keys(state.passwords).length > 0) return state.passwords;
  const pw = {};
  activeLoginMembers().forEach(m => { pw[m] = (m === 'ALIF' ? 'admin' : '1234'); });
  persistPasswords(pw);
  return pw;
}
function savePasswords(pw) {
  persistPasswords(pw);
  if (typeof stateRef !== 'undefined') {
    stateRef.child('passwords').set(pw).catch(console.error);
  }
  saveLocal();
}
function isAdmin() { return currentUser === 'ALIF'; }

// Rebuild login dropdown from state.members (single source of truth from Management)
function refreshLoginDropdown() {
  const sel = $('#loginUser');
  if (!sel) return;
  const previousValue = sel.value;
  sel.innerHTML = '';
  const members = activeLoginMembers();
  members.forEach(m => {
    sel.appendChild(el('option', { value: m }, m));
  });
  // Restore previous selection if still valid
  if (members.includes(previousValue)) {
    sel.value = previousValue;
  }
}

function initLogin() {
  // Populate login dropdown from state.members (not hardcoded DEFAULT_MEMBERS)
  refreshLoginDropdown();
  $('#loginBtn').addEventListener('click', doLogin);
  $('#loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // Eye toggle for password visibility
  const eyeBtn = $('#eyeToggle');
  if (eyeBtn) {
    eyeBtn.addEventListener('click', () => {
      const passInp = $('#loginPass');
      const isHidden = passInp.type === 'password';
      passInp.type = isHidden ? 'text' : 'password';
      eyeBtn.classList.toggle('visible', isHidden);
      eyeBtn.title = isHidden ? 'Hide password' : 'Show password';
    });
  }

  // Session restore — validate against current state.members, not DEFAULT_MEMBERS
  const sess = sessionStorage.getItem('messUser');
  const validMembers = activeLoginMembers();
  if (sess && validMembers.includes(sess)) {
    currentUser = sess;
    hideLogin();
  }
}

function doLogin() {
  const user = $('#loginUser').value;
  const pass = $('#loginPass').value;
  const passwords = getPasswords();
  if (passwords[user] === pass) {
    currentUser = user;
    // Fresh session: clear stale data and regenerate session
    sessionStorage.clear();
    sessionStorage.setItem('messUser', user);
    sessionStorage.setItem('messSessionId', crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    // Clear stale localStorage cache — Firebase listener will repopulate
    localStorage.removeItem('messManagerState');
    hideLogin();
  } else {
    $('#loginError').textContent = '❌ Incorrect password.';
  }
}

function hideLogin() {
  $('#loginOverlay').style.display = 'none';
  $('#adminNavBtn').style.display = isAdmin() ? '' : 'none';
  $('#mgmtNavBtn').style.display = isAdmin() ? '' : 'none';
  const gdlBtn = $('#globalDownloadBtn');
  if (gdlBtn) gdlBtn.style.display = isAdmin() ? '' : 'none';
  updateUserBadge();
  if (_firebaseReady) {
    renderActiveTabOnly();
  } else {
    // Wait for fresh data from Firebase before rendering to prevent stale UI
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
      activeTab.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted); font-size: 16px;">Syncing with database...</div>';
    }
  }
  showToast(`Welcome, ${currentUser}!`, 'info');
}

function logout() {
  currentUser = null;
  rentUnlocked = false;
  historyUnlocked = false;
  sessionStorage.removeItem('messUser');
  $('#loginOverlay').style.display = 'flex';
  $('#loginPass').value = '';
  $('#loginError').textContent = '';
  updateUserBadge();
}

function updateUserBadge() {
  const footer = $('.sidebar-footer');
  const old = $('#userBadgeContainer');
  if (old) old.remove();
  if (!currentUser) return;

  const idx = state.members.indexOf(currentUser);
  const container = el('div', { id: 'userBadgeContainer', style: 'margin-bottom:12px' },
    el('div', { class: 'user-badge' }, avatar(currentUser, idx), el('span', { style: 'font-weight:600' }, currentUser)),
    el('button', { class: 'logout-btn', style: 'width:100%;margin-top:8px', onclick: logout }, 'Logout')
  );
  footer.prepend(container);
}

// ── Month/Year Selectors ──
function initSelectors() {
  const ms = $('#monthSelect');
  const ys = $('#yearSelect');
  MONTH_NAMES.forEach((m, i) => {
    const o = el('option', { value: i }, m);
    if (i === state.currentMonth) o.selected = true;
    ms.appendChild(o);
  });
  for (let y = 2023; y <= 2030; y++) {
    const o = el('option', { value: y }, String(y));
    if (y === state.currentYear) o.selected = true;
    ys.appendChild(o);
  }
  ms.addEventListener('change', () => { state.currentMonth = +ms.value; saveUpdates({ 'currentMonth': state.currentMonth }); saveLocal(); renderActiveTabOnly(); });
  ys.addEventListener('change', () => { state.currentYear = +ys.value; saveUpdates({ 'currentYear': state.currentYear }); saveLocal(); renderActiveTabOnly(); });
}

// ── Render: Dashboard ──
function renderDashboard() {
  const container = $('#tab-dashboard');
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);
  const members = md.members;
  const { results, grandTotalMeals, grandTotalBazar, grandTotalOthers, perMealRate } = calcReport(md, members);

  const grandMealCost = results.reduce((a, r) => a + r.mealCost, 0);

  container.innerHTML = '';
  const header = el('div', { class: 'page-header', style: 'display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;' });
  const titleWrap = el('div', {},
    el('h2', {}, `Final Report — ${MONTH_NAMES[state.currentMonth]} ${state.currentYear}`),
    el('p', {}, 'Monthly meal & bazar cost summary with auto-calculated balances')
  );
  header.appendChild(titleWrap);
  container.appendChild(header);

  // Stats row
  const statsRow = el('div', { class: 'stats-row' });
  const stats = [
    { label: 'Total Meals', value: grandTotalMeals, cls: 'stat-accent', sub: `${members.length} members` },
    { label: 'Total Bazar', value: fmtTk(grandTotalBazar), cls: 'stat-green', sub: 'All members combined' },
    { label: 'Per Meal Rate', value: fmtTk(perMealRate), cls: 'stat-amber', sub: 'Total Bazar ÷ Total Meals' },
    { label: 'Others Cost', value: fmtTk(grandTotalOthers), cls: 'stat-red', sub: `÷${members.length} per member` },
  ];
  stats.forEach(s => {
    const c = el('div', { class: `stat-card ${s.cls}` },
      el('div', { class: 'stat-label' }, s.label),
      el('div', { class: 'stat-value' }, String(s.value)),
      el('div', { class: 'stat-sub' }, s.sub)
    );
    statsRow.appendChild(c);
  });
  container.appendChild(statsRow);

  // Table
  const wrap = el('div', { class: 'table-wrap' },
    el('div', { class: 'table-title' }, '📊 Member Breakdown')
  );
  const scroll = el('div', { class: 'table-scroll' });
  const table = el('table');
  const thead = el('thead');
  const headRow = el('tr');
  ['Member', 'Meals', 'Rate', 'Meal Cost', 'Bazar Spent', 'Meal Balance', 'Others Spend', 'Others Share', 'Final Balance', 'Status'].forEach(h => {
    headRow.appendChild(el('th', {}, h));
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  results.forEach((r, i) => {
    const tr = el('tr');
    const nameCell = el('td');
    const nameDiv = el('div', { class: 'name-cell' }, avatar(r.name, i), r.name);
    nameCell.appendChild(nameDiv);
    tr.appendChild(nameCell);
    tr.appendChild(el('td', {}, String(r.totalMeals)));
    tr.appendChild(el('td', { class: 'calc-cell' }, fmtTk(r.perMealRate)));
    tr.appendChild(el('td', { class: 'calc-cell' }, fmtTk(r.mealCost)));
    tr.appendChild(el('td', {}, fmtTk(r.totalBazar)));
    const balTd = el('td', { class: r.givenTake >= 0 ? 'positive' : 'negative' }, fmtTk(r.givenTake));
    tr.appendChild(balTd);
    tr.appendChild(el('td', {}, fmtTk(r.othersSpend)));
    tr.appendChild(el('td', { class: 'calc-cell' }, fmtTk(r.othersShare)));
    const finalTd = el('td', { class: r.finalBalance >= 0 ? 'positive' : 'negative', style: 'font-weight:700' }, fmtTk(r.finalBalance));
    tr.appendChild(finalTd);
    const badge = r.finalBalance >= 0
      ? el('span', { class: 'badge badge-green' }, 'Gets Back')
      : el('span', { class: 'badge badge-red' }, 'Owes');
    tr.appendChild(el('td', {}, badge));
    tbody.appendChild(tr);
  });

  // Grand total
  const gt = el('tr', { class: 'grand-total-row' });
  gt.appendChild(el('td', {}, 'Grand Total'));
  gt.appendChild(el('td', {}, String(grandTotalMeals)));
  gt.appendChild(el('td', {}, '—'));
  gt.appendChild(el('td', { class: 'calc-cell' }, fmtTk(grandMealCost)));
  gt.appendChild(el('td', {}, fmtTk(grandTotalBazar)));
  gt.appendChild(el('td', {}, fmtTk(results.reduce((a, r) => a + r.givenTake, 0))));
  gt.appendChild(el('td', {}, fmtTk(grandTotalOthers)));
  gt.appendChild(el('td', {}, fmtTk(results.reduce((a, r) => a + r.othersShare, 0))));
  gt.appendChild(el('td', { style: 'font-weight:700' }, fmtTk(results.reduce((a, r) => a + r.finalBalance, 0))));
  gt.appendChild(el('td', {}, ''));
  tbody.appendChild(gt);

  table.appendChild(tbody);
  scroll.appendChild(table);
  wrap.appendChild(scroll);
  container.appendChild(wrap);

  // Formula legend
  const legend = el('div', { class: 'table-wrap', style: 'padding:16px 18px; font-size:12px; color:var(--text-secondary); line-height:1.8' });
  legend.innerHTML = `
    <strong style="color:var(--text-primary)">📐 Formulas Used</strong><br>
    <code style="color:var(--accent)">Per Meal Rate</code> = Total Bazar ÷ Total Meals &nbsp;|&nbsp;
    <code style="color:var(--accent)">Meal Cost</code> = Meals × Rate &nbsp;|&nbsp;
    <code style="color:var(--accent)">Meal Balance</code> = Bazar Spent − Meal Cost &nbsp;|&nbsp;
    <code style="color:var(--accent)">Others Share</code> = Total Others ÷ Members &nbsp;|&nbsp;
    <code style="color:var(--accent)">Final Balance</code> = Meal Balance + Others Spend − Others Share
  `;
  container.appendChild(legend);

  // ── Khala Attendance Calendar ──
  const khalaHeaderWrap = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-top: 24px; margin-bottom: 8px;' });
  khalaHeaderWrap.appendChild(el('div', { class: 'section-heading', style: 'margin: 0;' }, '📅 Khala Schedule'));
  const toggleKhalaBtn = el('button', { class: 'btn-gradient', style: 'padding: 6px 12px; font-size: 12px;' }, 'Show Calendar');
  khalaHeaderWrap.appendChild(toggleKhalaBtn);
  container.appendChild(khalaHeaderWrap);

  const khalaWrap = el('div', { class: 'table-wrap', style: 'padding:18px; display: none;' });
  khalaWrap.appendChild(el('p', { style: 'font-size:12px; color:var(--text-secondary); margin-bottom:12px' },
    'Tap to toggle if Khala is coming. 🟢 = Coming, 🔴 = Not coming, ⚪ = Not set'));

  toggleKhalaBtn.addEventListener('click', () => {
    const isHidden = khalaWrap.style.display === 'none';
    khalaWrap.style.display = isHidden ? 'block' : 'none';
    toggleKhalaBtn.textContent = isHidden ? 'Hide Calendar' : 'Show Calendar';
  });

  const kDays = daysInMonth(state.currentMonth, state.currentYear);
  const khalaMk = monthKey(state.currentMonth, state.currentYear);
  const khalaMd = ensureMonthData(state, khalaMk);

  const firstDow = new Date(state.currentYear, state.currentMonth, 1).getDay();
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const calGrid = el('div', { class: 'khala-calendar' });
  dayLabels.forEach(dl => calGrid.appendChild(el('div', { class: 'khala-header' }, dl)));
  for (let e = 0; e < firstDow; e++) calGrid.appendChild(el('div', { class: 'khala-empty' }));

  for (let d = 0; d < kDays; d++) {
    const dayCell = el('div', { class: 'khala-day' });
    dayCell.appendChild(el('div', { class: 'khala-day-num' }, String(d + 1)));

    const cookStatus = khalaMd.khalaCook[d];
    const cleanStatus = khalaMd.khalaCleaner[d];

    const cookBtn = el('button', {
      class: `khala-toggle ${cookStatus === true ? 'k-on' : cookStatus === false ? 'k-off' : 'k-null'}`,
      title: 'Cook Khala',
      onclick: (ev) => {
        if (khalaMd.khalaCook[d] === null || khalaMd.khalaCook[d] === undefined) khalaMd.khalaCook[d] = true;
        else if (khalaMd.khalaCook[d] === true) khalaMd.khalaCook[d] = false;
        else khalaMd.khalaCook[d] = null;
        _skipNextRender = true;
        saveUpdates({ [`months/${khalaMk}/khalaCook/${d}`]: khalaMd.khalaCook[d] });
        saveLocal();
        const btn = ev.currentTarget;
        const v = khalaMd.khalaCook[d];
        btn.className = `khala-toggle ${v === true ? 'k-on' : v === false ? 'k-off' : 'k-null'}`;
        btn.textContent = `\u{1F373}${v === true ? '\u2713' : v === false ? '\u2717' : '?'}`;
      }
    }, `🍳${cookStatus === true ? '✓' : cookStatus === false ? '✗' : '?'}`);

    const cleanBtn = el('button', {
      class: `khala-toggle ${cleanStatus === true ? 'k-on' : cleanStatus === false ? 'k-off' : 'k-null'}`,
      title: 'Cleaning Khala',
      onclick: (ev) => {
        if (khalaMd.khalaCleaner[d] === null || khalaMd.khalaCleaner[d] === undefined) khalaMd.khalaCleaner[d] = true;
        else if (khalaMd.khalaCleaner[d] === true) khalaMd.khalaCleaner[d] = false;
        else khalaMd.khalaCleaner[d] = null;
        _skipNextRender = true;
        saveUpdates({ [`months/${khalaMk}/khalaCleaner/${d}`]: khalaMd.khalaCleaner[d] });
        saveLocal();
        const btn = ev.currentTarget;
        const v = khalaMd.khalaCleaner[d];
        btn.className = `khala-toggle ${v === true ? 'k-on' : v === false ? 'k-off' : 'k-null'}`;
        btn.textContent = `\u{1F9F9}${v === true ? '\u2713' : v === false ? '\u2717' : '?'}`;
      }
    }, `🧹${cleanStatus === true ? '✓' : cleanStatus === false ? '✗' : '?'}`);

    dayCell.appendChild(el('div', { class: 'khala-btns' }, cookBtn, cleanBtn));
    calGrid.appendChild(dayCell);
  }
  khalaWrap.appendChild(calGrid);
  container.appendChild(khalaWrap);
}

// ── Render: Daily Grid (Meals / Bazar / BazarOthers) ──
function renderDayGrid(containerId, dataKey, title, subtitle) {
  const container = $(containerId);
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);
  const members = md.members;
  const days = daysInMonth(state.currentMonth, state.currentYear);
  const data = md[dataKey];

  container.innerHTML = '';
  container.appendChild(el('div', { class: 'page-header' },
    el('h2', {}, `${title} — ${MONTH_NAMES[state.currentMonth]} ${state.currentYear}`),
    el('p', {}, subtitle)
  ));

  const wrap = el('div', { class: 'table-wrap' },
    el('div', { class: 'table-title' }, `📅 Daily ${title}`)
  );
  const scroll = el('div', { class: 'table-scroll' });
  const table = el('table');

  // Header
  const thead = el('thead');
  const headRow = el('tr');
  headRow.appendChild(el('th', { style: 'position:sticky;left:0;z-index:3;background:var(--bg-secondary)' }, 'Day'));
  members.forEach(member => headRow.appendChild(el('th', { style: 'text-align:center' }, member)));
  headRow.appendChild(el('th', { style: 'text-align:center' }, 'Total'));
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Body
  const tbody = el('tbody');
  
  tbody.addEventListener('input', (e) => {
    if (e.target.classList.contains('grid-input')) {
      const parts = e.target.id.split('-');
      if (parts.length === 4 && parts[0] === 'inp') {
         const dKey = parts[1];
         const mi = parseInt(parts[2], 10);
         const d = parseInt(parts[3], 10);
         
         const raw = e.target.value.trim();
         const newVal = raw === '' ? (dKey === 'meals' ? null : '') : Number(raw);
         
         const mk = monthKey(state.currentMonth, state.currentYear);
         const mData = ensureMonthData(state, mk);
         const dataArr = mData[dKey];
         
         if (dataArr[mi][d] === newVal) return;

         const vPrefix = dKey === 'meals' ? 'Meals' : (dKey === 'bazar' ? 'Bazar' : 'BazarOthers');
         const vUser = mData[`v${vPrefix}User`] && mData[`v${vPrefix}User`][mi][d];
         const vAdmin = mData[`v${vPrefix}Admin`] && mData[`v${vPrefix}Admin`][mi][d];
         const fullyVerified = vUser && vAdmin;
         if (!canEditRecord(mi, d + 1) || (fullyVerified && !isAdmin())) {
           showToast('Editing locked or window closed', 'error');
           e.target.value = dataArr[mi][d] === null ? '' : dataArr[mi][d];
           return;
         }

         dataArr[mi][d] = newVal;

         const cellKey = `grid-${dKey}-${mi}-${d}`;
         if (_inputDebounceTimers[cellKey]) clearTimeout(_inputDebounceTimers[cellKey]);
         _inputDebounceTimers[cellKey] = setTimeout(() => {
           const member = members[mi];
           if (typeof logActivity === 'function') logActivity(`${currentUser} updated ${title} for Day ${d + 1} (${member}) to ${newVal}`, member);
           
           _skipNextRender = true;
           const updates = { [`months/${mk}/${dKey}/${mi}/${d}`]: newVal };
           if (isAdmin()) {
             const vAKey = dKey === 'meals' ? 'vMealsAdmin' : (dKey === 'bazar' ? 'vBazarAdmin' : 'vBazarOthersAdmin');
             if (mData[vAKey]) {
               mData[vAKey][mi][d] = true;
               updates[`months/${mk}/${vAKey}/${mi}/${d}`] = true;
             }
           }
           if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
           saveUpdates(updates);
         }, 300);
         
         const days = daysInMonth(state.currentMonth, state.currentYear);
         let rTotal = 0;
         for (let j = 0; j < members.length; j++) rTotal += Number(dataArr[j][d]) || 0;
         const rowEl = document.getElementById(`rt-${dKey}-${d}`);
         if (rowEl) rowEl.textContent = fmt(rTotal);

         let cTotal = 0;
         for (let dx = 0; dx < days; dx++) cTotal += Number(dataArr[mi][dx]) || 0;
         const colEl = document.getElementById(`ct-${dKey}-${mi}`);
         if (colEl) colEl.textContent = fmt(cTotal);

         let gTotal = 0;
         for (let j = 0; j < members.length; j++) {
           for (let dx = 0; dx < days; dx++) gTotal += Number(dataArr[j][dx]) || 0;
         }
         const gtEl = document.getElementById(`gt-${dKey}`);
         if (gtEl) gtEl.textContent = fmt(gTotal);

         saveLocal();
         showToast('Update saved');
      }
    }
  });

  // Input handler — saves to Firebase on every keystroke and updates totals immediately
  tbody.addEventListener('input', (e) => {
    if (!e.target.classList.contains('grid-input')) return;
    const parts = e.target.id.split('-');
    if (parts.length !== 4 || parts[0] !== 'inp') return;
    const dKey = parts[1];
    const mi = parseInt(parts[2], 10);
    const d = parseInt(parts[3], 10);

    // Update local state and DOM immediately
    const raw = e.target.value.trim();
    const newVal = raw === '' ? (dKey === 'meals' ? null : 0) : Number(raw);
    const mk = monthKey(state.currentMonth, state.currentYear);
    const mData = ensureMonthData(state, mk);
    const dataArr = mData[dKey];
    dataArr[mi][d] = newVal;

    // Update row/column/grand totals inline
    const numDays = daysInMonth(state.currentMonth, state.currentYear);
    let rTotal = 0;
    for (let j = 0; j < members.length; j++) rTotal += Number(dataArr[j][d]) || 0;
    const rowEl = document.getElementById(`rt-${dKey}-${d}`);
    if (rowEl) rowEl.textContent = fmt(rTotal);
    let cTotal = 0;
    for (let dx = 0; dx < numDays; dx++) cTotal += Number(dataArr[mi][dx]) || 0;
    const colEl = document.getElementById(`ct-${dKey}-${mi}`);
    if (colEl) colEl.textContent = fmt(cTotal);
    let gTotal = 0;
    for (let j = 0; j < members.length; j++) {
      for (let dx = 0; dx < numDays; dx++) gTotal += Number(dataArr[j][dx]) || 0;
    }
    const gtEl = document.getElementById(`gt-${dKey}`);
    if (gtEl) gtEl.textContent = fmt(gTotal);

    _skipNextRender = true;
    const updates = { [`months/${mk}/${dKey}/${mi}/${d}`]: newVal };
    if (isAdmin()) {
      const vAKey = dKey === 'meals' ? 'vMealsAdmin' : (dKey === 'bazar' ? 'vBazarAdmin' : 'vBazarOthersAdmin');
      if (mData[vAKey]) {
        mData[vAKey][mi][d] = true;
        updates[`months/${mk}/${vAKey}/${mi}/${d}`] = true;
      }
    }
    saveUpdates(updates);
    saveLocal();
  });

  tbody.addEventListener('click', (e) => {
      const verifyBtn = e.target.closest('.verify-badge');
      if (verifyBtn) {
          const parts = verifyBtn.dataset.vid.split('-');
          const dKey = parts[1];
          const mi = parseInt(parts[2], 10);
          const d = parseInt(parts[3], 10);
          const type = parts[4];
          toggleVerify(mi, d, type, dKey);
      }
  });

  const memberTotals = new Array(members.length).fill(0);
  let grandTotal = 0;

  for (let d = 0; d < days; d++) {
    const tr = el('tr');
    const dateObj = new Date(state.currentYear, state.currentMonth, d + 1);
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getDay()];
    tr.appendChild(el('td', { style: 'position:sticky;left:0;z-index:1;background:var(--bg-secondary);font-weight:bold; white-space:nowrap;' }, `${d + 1} ${dayName}`));

    let rowTotal = 0;
    members.forEach((member, mi) => {
      const rawVal = data[mi][d];
      const val = (rawVal === null || rawVal === undefined) ? 0 : Number(rawVal);
      rowTotal += val;
      memberTotals[mi] += val;

      const vUser = md.vMealsUser[mi][d], vAdmin = md.vMealsAdmin[mi][d];
      const fullyVerified = vUser && vAdmin;

      const isNull = (rawVal === null || rawVal === undefined);
      const inp = el('input', {
        id: `inp-${dataKey}-${mi}-${d}`,
        type: 'number',
        class: `grid-input${isNull && dataKey === 'meals' ? ' meal-null' : ''}`,
        value: isNull ? '' : rawVal,
        placeholder: dataKey === 'meals' ? '-' : '0',
        min: '0'
      });
      if (!canEditRecord(mi, d + 1) || (fullyVerified && !isAdmin())) {
        inp.disabled = true;
      }

      const vu = el('span', { class: `verify-badge type-u ${vUser ? 'v-on' : ''}`, 'data-vid': `v-${dataKey}-${mi}-${d}-user` }, 'U');
      const va = el('span', { class: `verify-badge type-a ${vAdmin ? 'v-on' : ''}`, 'data-vid': `v-${dataKey}-${mi}-${d}-admin` }, 'A');
      const vRow = el('div', { class: 'verification-row', style: 'justify-content:center' }, vu, va);

      const td = el('td', { class: fullyVerified ? 'cell-fully-verified' : '', style: 'text-align:center' }, inp, vRow);
      tr.appendChild(td);
    });

    grandTotal += rowTotal;
    tr.appendChild(el('td', { id: `rt-${dataKey}-${d}`, class: 'calc-cell', style: 'text-align:center' }, fmt(rowTotal)));
    tbody.appendChild(tr);
  }

  // Grand total row
  const gt = el('tr', { class: 'grand-total-row' });
  gt.appendChild(el('td', { style: 'position:sticky;left:0;z-index:1;background:var(--bg-secondary)' }, 'Total'));
  members.forEach((member, mi) => {
    gt.appendChild(el('td', { id: `ct-${dataKey}-${mi}`, class: 'calc-cell', style: 'text-align:center' }, fmt(memberTotals[mi])));
  });
  gt.appendChild(el('td', { id: `gt-${dataKey}`, class: 'calc-cell', style: 'font-weight:800;text-align:center' }, fmt(grandTotal)));
  tbody.appendChild(gt);

  table.appendChild(tbody);
  scroll.appendChild(table);
  wrap.appendChild(scroll);
  container.appendChild(wrap);
}

// ── Render: Meals Tab ──
function renderMeals() {
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);
  const members = md.members;

  // First, render the base grid the same way it used to be rendered.
  renderDayGrid('#tab-meals', 'meals', 'Meal Tracking', 'Enter daily meal count for each member');

  // Then append Admin "Verify All" and "Clear All" buttons below it, if the user is an admin.
  if (isAdmin()) {
    const container = $('#tab-meals');

    // Meal Off checkboxes
    const offWrap = el('div', { class: 'table-wrap', style: 'padding: 16px; margin-top: 16px; margin-bottom: 24px;' });
    const offTitle = el('div', { style: 'font-weight:bold; margin-bottom:12px; font-size:14px; color:var(--text-primary)' }, '⚙️ Meal Off (Exempt from Auto 3)');
    const offGrid = el('div', { style: 'display:flex; flex-wrap:wrap; gap:16px;' });
    members.forEach((m, mi) => {
      const lbl = el('label', { style: 'display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; color:var(--text-secondary)' });
      const chk = el('input', { type: 'checkbox' });
      chk.checked = md.mealOff ? md.mealOff[mi] : false;
      chk.addEventListener('change', (e) => {
        if (!md.mealOff) md.mealOff = new Array(members.length).fill(false);
        md.mealOff[mi] = e.target.checked;
        saveUpdates({ [`months/${mk}/mealOff/${mi}`]: md.mealOff[mi] });
        saveLocal();
        showToast(`${m} ${e.target.checked ? 'exempt from' : 'subject to'} auto 3 meals defaults`, 'success');
      });
      lbl.appendChild(chk);
      lbl.appendChild(document.createTextNode(m));
      offGrid.appendChild(lbl);
    });
    offWrap.appendChild(offTitle);
    offWrap.appendChild(offGrid);
    container.appendChild(offWrap);
    const verifyBtn = el('button', {
      class: 'login-btn',
      style: 'margin-right: 12px; max-width: 250px; background-color: var(--accent);',
      onclick: () => {
        const days = daysInMonth(state.currentMonth, state.currentYear);
        const membersCount = members.length;
        let verifiedCount = 0;

        // Loop through all members and all days and verify ONLY inputted meals
        const updates = {};
        for (let mi = 0; mi < membersCount; mi++) {
          for (let d = 0; d < days; d++) {
            if (md.meals[mi][d] > 0) {
              md.vMealsAdmin[mi][d] = true;
              updates[`months/${mk}/vMealsAdmin/${mi}/${d}`] = true;
              verifiedCount++;
            }
          }
        }
        if (Object.keys(updates).length > 0) saveUpdates(updates);
        saveLocal();
        renderActiveTabOnly();
        showToast(`Verified ${verifiedCount} inputted meals`, 'success');
      }
    }, '✅ Verify Inputted Meals');

    const clearBtn = el('button', {
      class: 'login-btn',
      style: 'max-width: 200px; background-color: #f44336;', // Red color for clear
      onclick: () => {
        const days = daysInMonth(state.currentMonth, state.currentYear);
        const membersCount = members.length;

        // Loop through all members and all days and clear admin verification
        const updates = {};
        for (let mi = 0; mi < membersCount; mi++) {
          for (let d = 0; d < days; d++) {
            md.vMealsAdmin[mi][d] = false;
            updates[`months/${mk}/vMealsAdmin/${mi}/${d}`] = false;
          }
        }
        saveUpdates(updates);
        saveLocal();
        renderActiveTabOnly();
        showToast('Cleared all meal verifications', 'info');
      }
    }, '❌ Clear Verifications');

    // Add them within a wrapper so they align nicely side-by-side
    const btnWrap = el('div', { class: 'table-wrap', style: 'padding: 16px; margin-top: 16px; margin-bottom: 24px; display: flex; justify-content: flex-end; align-items: center;' }, verifyBtn, clearBtn);
    container.appendChild(btnWrap);
  }
}

// ── Render: Bazar Tab ──
function renderBazar() {
  const container = $('#tab-bazar');
  container.innerHTML = '';
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);
  const members = md.members;
  const days = daysInMonth(state.currentMonth, state.currentYear);
  container.appendChild(el('div', { class: 'page-header' },
    el('h2', {}, `Bazar Costs \u2014 ${MONTH_NAMES[state.currentMonth]} ${state.currentYear}`),
    el('p', {}, 'Track grocery spending and miscellaneous costs per member per day')
  ));

  // ── Bazar Duty Slots Section ──
  container.appendChild(el('div', { class: 'section-heading' }, '\ud83d\udcc5 Bazar Duty Calendar'));
  const slotWrap = el('div', { class: 'table-wrap', style: 'padding:18px' });

  if (isAdmin()) {
    if (!md.bazarSkip) md.bazarSkip = {};
    const availWrap = el('div', { style: 'margin-bottom:16px' });
    availWrap.appendChild(el('div', { style: 'font-weight:600; font-size:13px; margin-bottom:8px; color:var(--text-primary)' }, '\ud83d\udc64 Member Bazar Availability'));
    const availGrid = el('div', { style: 'display:flex; flex-wrap:wrap; gap:10px;' });
    members.forEach((m) => {
      const isSkipped = md.bazarSkip[m] || false;
      const chip = el('button', {
        class: `bazar-avail-chip ${isSkipped ? 'skipped' : 'active-chip'}`,
        onclick: () => { md.bazarSkip[m] = !md.bazarSkip[m]; saveUpdates({ [`months/${mk}/bazarSkip/${m}`]: md.bazarSkip[m] }); saveLocal(); renderBazar(); }
      }, `${isSkipped ? '\u274c' : '\u2705'} ${m}`);
      availGrid.appendChild(chip);
    });
    availWrap.appendChild(availGrid);
    slotWrap.appendChild(availWrap);

    const availableMembers = members.filter(m => !md.bazarSkip[m]);
    const genBtn = el('button', {
      class: 'btn-gradient', style: 'margin-bottom:16px;max-width:350px',
      onclick: () => {
        if (availableMembers.length === 0) { showToast('No available members!', 'error'); return; }
        const n = availableMembers.length;
        const base = Math.floor(days / n);
        const remainder = days % n;
        const slots = [];
        availableMembers.forEach((m, mi) => {
          const count = base + (mi === 0 ? remainder : 0);
          for (let j = 0; j < count; j++) slots.push(m);
        });
        md.bazarSlots = slots;
        saveUpdates({ [`months/${mk}/bazarSlots`]: slots });
        saveLocal(); renderBazar();
        showToast(`Slots generated for ${n} members!`, 'success');
      }
    }, `\u2699\ufe0f Generate Slots (${days} days \u00f7 ${availableMembers.length} members)`);
    slotWrap.appendChild(genBtn);
  }

  if (md.bazarSlots && md.bazarSlots.length > 0) {
    const legend = el('div', { class: 'slot-legend' });
    members.forEach((m, mi) => {
      const count = md.bazarSlots.filter(s => s === m).length;
      if (count > 0) {
        const dot = el('div', { class: 'slot-legend-item' });
        dot.appendChild(el('span', { class: 'slot-dot', style: `background:${COLORS[mi % COLORS.length]}` }));
        dot.appendChild(el('span', {}, `${m} (${count}d)`));
        legend.appendChild(dot);
      }
    });
    slotWrap.appendChild(legend);

    const firstDow = new Date(state.currentYear, state.currentMonth, 1).getDay();
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const calGrid = el('div', { class: 'bazar-calendar' });
    dayLabels.forEach(dl => calGrid.appendChild(el('div', { class: 'bazar-cal-header' }, dl)));
    for (let e = 0; e < firstDow; e++) calGrid.appendChild(el('div', { class: 'bazar-cal-empty' }));

    for (let d = 0; d < days; d++) {
      ((dayIdx) => {
        const assigned = md.bazarSlots[dayIdx] || '?';
        const mi = members.indexOf(assigned);
        const color = mi >= 0 ? COLORS[mi % COLORS.length] : '#555';

        const dayCell = el('div', { class: 'bazar-cal-day', style: `border-color:${color}` });
        dayCell.appendChild(el('div', { class: 'bazar-cal-num' }, String(dayIdx + 1)));
        dayCell.appendChild(el('div', { class: 'bazar-cal-member', style: `color:${color}` }, assigned.substring(0, 4)));

        if (isAdmin()) {
          dayCell.style.cursor = 'pointer';
          dayCell.addEventListener('click', () => {
            const modal = el('div', { class: 'modal-overlay' });
            const content = el('div', { class: 'modal-content' });
            content.appendChild(el('h3', { style: 'margin-bottom:12px' }, `Day ${dayIdx + 1} \u2014 Reassign`));
            members.forEach((m, idx) => {
              if (md.bazarSkip && md.bazarSkip[m]) return;
              content.appendChild(el('button', {
                class: 'btn-gradient', style: `margin-bottom:8px; background:${COLORS[idx % COLORS.length]}`,
                onclick: () => { md.bazarSlots[dayIdx] = m; saveUpdates({ [`months/${mk}/bazarSlots/${dayIdx}`]: m }); saveLocal(); modal.remove(); renderBazar(); showToast(`Day ${dayIdx + 1} reassigned to ${m}`, 'success'); }
              }, m));
            });
            content.appendChild(el('button', { class: 'mini-btn', style: 'margin-top:12px;width:100%', onclick: () => modal.remove() }, 'Cancel'));
            modal.appendChild(content);
            document.body.appendChild(modal);
          });
        }
        calGrid.appendChild(dayCell);
      })(d);
    }
    slotWrap.appendChild(calGrid);

    // WhatsApp reminder links
    const waWrap = el('div', { style: 'margin-top:16px; padding-top:12px; border-top:1px solid var(--border)' });
    waWrap.appendChild(el('div', { style: 'font-weight:600; font-size:13px; margin-bottom:10px; color:var(--text-primary)' }, '\ud83d\udcf2 WhatsApp Reminders'));

    // Always use the REAL today's date (not the viewed month)
    const bd = getBDDate();
    const realMk = monthKey(bd.month, bd.year);
    const realMd = state.months && state.months[realMk] ? ensureMonthData(state, realMk) : null;
    const todayIdx = bd.day - 1;
    const todayMember = (md.bazarSlots && todayIdx < md.bazarSlots.length) ? md.bazarSlots[todayIdx] : null;
    const tomorrowMember = (md.bazarSlots && todayIdx + 1 < md.bazarSlots.length) ? md.bazarSlots[todayIdx + 1] : null;

    if (todayMember) {
      const msg1 = encodeURIComponent(`\ud83d\uded2 Hey ${todayMember}! Today is your bazar duty (Day ${bd.day}). Don't forget!`);
      waWrap.appendChild(el('a', { href: `https://wa.me/?text=${msg1}`, target: '_blank', class: 'btn-gradient wa-btn' }, `\ud83d\udce2 Today: ${todayMember}'s duty`));
    }
    if (tomorrowMember) {
      const msg2 = encodeURIComponent(`\ud83d\uded2 Hey ${tomorrowMember}! Tomorrow (Day ${bd.day + 1}) is your bazar duty. Be ready!`);
      waWrap.appendChild(el('a', { href: `https://wa.me/?text=${msg2}`, target: '_blank', class: 'btn-gradient wa-btn' }, `\ud83d\udce2 Tomorrow: ${tomorrowMember}'s duty`));
    }

    // Meal reminder: check TODAY's actual date against actual current month data
    if (realMd) {
      const realMembers = realMd.members || membersForMonth(state, realMk, realMd);
      const unenteredMembers = realMembers.filter((m, mi) => {
        if (realMembers[mi] === 'ALIF') return false; // ALIF is excluded
        if (realMd.mealOff && realMd.mealOff[mi]) return false; // mealOff members excluded
        const val = realMd.meals[mi] ? realMd.meals[mi][todayIdx] : null;
        return val === null || val === undefined;
      });
      if (unenteredMembers.length > 0) {
        const nameList = unenteredMembers.join(', ');
        const msg3 = encodeURIComponent(`\ud83c\udf7d\ufe0f Meal Reminder! ${nameList} \u2014 you haven't entered today's (Day ${bd.day}) meal count. Please update before end of day!`);
        waWrap.appendChild(el('a', { href: `https://wa.me/?text=${msg3}`, target: '_blank', class: 'btn-gradient wa-btn wa-meal' }, `\ud83c\udf7d\ufe0f ${unenteredMembers.length} member${unenteredMembers.length > 1 ? 's' : ''} haven't entered meals today`));
      } else {
        waWrap.appendChild(el('div', { style: 'font-size:12px; color:var(--green)' }, '\u2705 All members have entered today\'s meals!'));
      }
    }
    slotWrap.appendChild(waWrap);
  } else {
    slotWrap.appendChild(el('p', { style: 'color:var(--text-secondary);font-size:13px' }, isAdmin() ? 'Click the button above to generate bazar duty slots.' : 'Admin has not generated bazar duty slots yet.'));
  }
  container.appendChild(slotWrap);

  // Bazar cost grid
  const bazarSection = el('div', { id: 'bazar-main-grid' });
  container.appendChild(bazarSection);
  renderBazarGrid('#bazar-main-grid', 'bazar', '\ud83d\uded2 Bazar Cost (TK)');

  container.appendChild(el('div', { class: 'section-heading' }, '\ud83d\udce6 Others / Miscellaneous Cost'));
  const othersSection = el('div', { id: 'bazar-others-grid' });
  container.appendChild(othersSection);
  renderBazarGrid('#bazar-others-grid', 'bazarOthers', '\ud83e\uddf9 Bazar Others Cost (TK)');
}

function renderBazarGrid(targetSelector, dataKey, title) {
  const target = $(targetSelector);
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);
  const days = daysInMonth(state.currentMonth, state.currentYear);
  const data = md[dataKey];
  const members = md.members;

  target.innerHTML = '';
  const wrap = el('div', { class: 'table-wrap' },
    el('div', { class: 'table-title' }, title)
  );
  const scroll = el('div', { class: 'table-scroll' });
  const table = el('table');

  const thead = el('thead');
  const headRow = el('tr');
  headRow.appendChild(el('th', { style: 'position:sticky;left:0;z-index:3;background:var(--bg-secondary)' }, 'Day'));
  members.forEach(member => headRow.appendChild(el('th', { style: 'text-align:center' }, member)));
  headRow.appendChild(el('th', { style: 'text-align:center' }, 'Total'));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  
  tbody.addEventListener('change', (e) => {
    if (e.target.classList.contains('grid-input')) {
      const parts = e.target.id.split('-');
      if (parts.length === 4 && parts[0] === 'inp') {
         const dKey = parts[1];
         const mi = parseInt(parts[2], 10);
         const d = parseInt(parts[3], 10);
         
         const raw = e.target.value.trim();
         const newVal = raw === '' ? (dKey === 'meals' ? null : '') : Number(raw);
         
         const mk = monthKey(state.currentMonth, state.currentYear);
         const mData = ensureMonthData(state, mk);
         const dataArr = mData[dKey];
         
         if (dataArr[mi][d] === newVal) return;

         const vPrefix = dKey === 'meals' ? 'Meals' : (dKey === 'bazar' ? 'Bazar' : 'BazarOthers');
         const vUser = mData[`v${vPrefix}User`] && mData[`v${vPrefix}User`][mi][d];
         const vAdmin = mData[`v${vPrefix}Admin`] && mData[`v${vPrefix}Admin`][mi][d];
         const fullyVerified = vUser && vAdmin;
         if (!canEditRecord(mi, d + 1) || (fullyVerified && !isAdmin())) {
           showToast('Editing locked or window closed', 'error');
           e.target.value = dataArr[mi][d] === null ? '' : dataArr[mi][d];
           return;
         }

         dataArr[mi][d] = newVal;
         const member = members[mi];
         if (typeof logActivity === 'function') logActivity(`${currentUser} updated ${title} for Day ${d + 1} (${member}) to ${newVal}`, member);
         
         _skipNextRender = true;
         const updates = { [`months/${mk}/${dKey}/${mi}/${d}`]: newVal };
         if (isAdmin()) {
           const vAKey = dKey === 'meals' ? 'vMealsAdmin' : (dKey === 'bazar' ? 'vBazarAdmin' : 'vBazarOthersAdmin');
           if (mData[vAKey]) {
             mData[vAKey][mi][d] = true;
             updates[`months/${mk}/${vAKey}/${mi}/${d}`] = true;
           }
         }
         if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
         saveUpdates(updates);
         
         const days = daysInMonth(state.currentMonth, state.currentYear);
         let rTotal = 0;
         for (let j = 0; j < members.length; j++) rTotal += Number(dataArr[j][d]) || 0;
         const rowEl = document.getElementById(`rt-${dKey}-${d}`);
         if (rowEl) rowEl.textContent = fmt(rTotal);

         let cTotal = 0;
         for (let dx = 0; dx < days; dx++) cTotal += Number(dataArr[mi][dx]) || 0;
         const colEl = document.getElementById(`ct-${dKey}-${mi}`);
         if (colEl) colEl.textContent = fmt(cTotal);

         let gTotal = 0;
         for (let j = 0; j < members.length; j++) {
           for (let dx = 0; dx < days; dx++) gTotal += Number(dataArr[j][dx]) || 0;
         }
         const gtEl = document.getElementById(`gt-${dKey}`);
         if (gtEl) gtEl.textContent = fmt(gTotal);

         saveLocal();
         showToast('Update saved');
      }
    }
  });

  // Input handler — saves to Firebase on every keystroke and updates totals immediately
  tbody.addEventListener('input', (e) => {
    if (!e.target.classList.contains('grid-input')) return;
    const parts = e.target.id.split('-');
    if (parts.length !== 4 || parts[0] !== 'inp') return;
    const dKey = parts[1];
    const mi = parseInt(parts[2], 10);
    const d = parseInt(parts[3], 10);
    const raw = e.target.value.trim();
    const newVal = raw === '' ? 0 : Number(raw);
    const mk = monthKey(state.currentMonth, state.currentYear);
    const mData = ensureMonthData(state, mk);
    const dataArr = mData[dKey];
    dataArr[mi][d] = newVal;

    // Update row/column/grand totals inline
    const numDays = daysInMonth(state.currentMonth, state.currentYear);
    let rTotal = 0;
    for (let j = 0; j < members.length; j++) rTotal += Number(dataArr[j][d]) || 0;
    const rowEl = document.getElementById(`rt-${dKey}-${d}`);
    if (rowEl) rowEl.textContent = fmtTk(rTotal);
    let cTotal = 0;
    for (let dx = 0; dx < numDays; dx++) cTotal += Number(dataArr[mi][dx]) || 0;
    const colEl = document.getElementById(`ct-${dKey}-${mi}`);
    if (colEl) colEl.textContent = fmtTk(cTotal);
    let gTotal = 0;
    for (let j = 0; j < members.length; j++) {
      for (let dx = 0; dx < numDays; dx++) gTotal += Number(dataArr[j][dx]) || 0;
    }
    const gtEl = document.getElementById(`gt-${dKey}`);
    if (gtEl) gtEl.textContent = fmtTk(gTotal);

    _skipNextRender = true;
    const updates = { [`months/${mk}/${dKey}/${mi}/${d}`]: newVal };
    if (isAdmin()) {
      const vAKey = dKey === 'bazar' ? 'vBazarAdmin' : 'vBazarOthersAdmin';
      if (mData[vAKey]) {
        mData[vAKey][mi][d] = true;
        updates[`months/${mk}/${vAKey}/${mi}/${d}`] = true;
      }
    }
    saveUpdates(updates);
    saveLocal();
  });

  tbody.addEventListener('click', (e) => {
      const verifyBtn = e.target.closest('.verify-badge');
      if (verifyBtn) {
          const parts = verifyBtn.dataset.vid.split('-');
          const dKey = parts[1];
          const mi = parseInt(parts[2], 10);
          const d = parseInt(parts[3], 10);
          const type = parts[4];
          toggleVerify(mi, d, type, dKey);
      }
  });

  const memberTotals = new Array(members.length).fill(0);
  let grandTotal = 0;

  for (let d = 0; d < days; d++) {
    const tr = el('tr');
    const dateObj = new Date(state.currentYear, state.currentMonth, d + 1);
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getDay()];
    tr.appendChild(el('td', { style: 'position:sticky;left:0;z-index:1;background:var(--bg-secondary);font-weight:bold; white-space:nowrap;' }, `${d + 1} ${dayName}`));

    let rowTotal = 0;
    members.forEach((member, mi) => {
      const val = data[mi][d] || 0;
      rowTotal += val;
      memberTotals[mi] += val;

      const vUKey = dataKey === 'bazar' ? 'vBazarUser' : 'vBazarOthersUser';
      const vAKey = dataKey === 'bazar' ? 'vBazarAdmin' : 'vBazarOthersAdmin';
      const vUser = md[vUKey][mi][d], vAdmin = md[vAKey][mi][d];
      const fullyVerified = vUser && vAdmin;

      const inp = el('input', {
        id: `inp-${dataKey}-${mi}-${d}`,
        type: 'number',
        class: 'grid-input wide',
        value: val !== '' && val !== null && val !== undefined ? val : '',
        min: '0',
        disabled: !canEditRecord(mi, d + 1) || (fullyVerified && !isAdmin())
      });

      const vu = el('span', { class: `verify-badge type-u ${vUser ? 'v-on' : ''}`, 'data-vid': `v-${dataKey}-${mi}-${d}-user` }, 'U');
      const va = el('span', { class: `verify-badge type-a ${vAdmin ? 'v-on' : ''}`, 'data-vid': `v-${dataKey}-${mi}-${d}-admin` }, 'A');
      const vRow = el('div', { class: 'verification-row', style: 'justify-content:center' }, vu, va);

      const td = el('td', { class: fullyVerified ? 'cell-fully-verified' : '', style: 'text-align:center' }, inp, vRow);
      tr.appendChild(td);
    });

    grandTotal += rowTotal;
    tr.appendChild(el('td', { id: `rt-${dataKey}-${d}`, class: 'calc-cell', style: 'text-align:center' }, fmtTk(rowTotal)));
    tbody.appendChild(tr);
  }

  const gt = el('tr', { class: 'grand-total-row' });
  gt.appendChild(el('td', { style: 'position:sticky;left:0;z-index:1;background:var(--bg-secondary)' }, 'Total'));
  members.forEach((member, mi) => {
    gt.appendChild(el('td', { id: `ct-${dataKey}-${mi}`, class: 'calc-cell', style: 'text-align:center' }, fmtTk(memberTotals[mi])));
  });
  gt.appendChild(el('td', { id: `gt-${dataKey}`, class: 'calc-cell', style: 'font-weight:800;text-align:center' }, fmtTk(grandTotal)));
  tbody.appendChild(gt);

  table.appendChild(tbody);
  scroll.appendChild(table);
  wrap.appendChild(scroll);
  target.appendChild(wrap);
}

// ── Render: Rent Tab ──
function renderRent() {
  const container = $('#tab-rent');
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);
  const members = md.members;
  const canSeeAll = isAdmin() || rentUnlocked;

  container.innerHTML = '';
  container.appendChild(el('div', { class: 'page-header' },
    el('h2', {}, `House Rent & Utilities — ${MONTH_NAMES[state.currentMonth]} ${state.currentYear}`),
    el('p', {}, canSeeAll ? 'Full view — all members' : 'Showing your rent only. Enter admin password to see all.')
  ));

  if (!isAdmin() && !rentUnlocked) {
    const bar = el('div', { class: 'login-card', style: 'width:100%;padding:20px;display:flex;gap:10px;margin-bottom:20px' },
      el('span', {}, '🔒 Unlock All:'),
      el('input', { type: 'password', id: 'rentUnlockPass', placeholder: 'Admin pass...' }),
      el('button', {
        class: 'unlock-btn', onclick: () => {
          if ($('#rentUnlockPass').value === getPasswords()['ALIF']) { rentUnlocked = true; renderRent(); }
          else showToast('Wrong password', 'error');
        }
      }, 'Unlock')
    );
    container.appendChild(bar);
  }

  // Utility bill inputs
  container.appendChild(el('div', { class: 'section-heading' }, '💡 Monthly Bills'));
  const formGrid = el('div', { class: 'form-grid' });
  UTILITY_FIELDS.forEach(f => {
    const fg = el('div', { class: 'form-group' });
    fg.appendChild(el('label', {}, f.label));
    const inp = el('input', {
      id: `inp-util-${f.key}`,
      type: 'number',
      value: md.utilities[f.key] !== '' && md.utilities[f.key] !== undefined ? md.utilities[f.key] : '',
      placeholder: '0'
    });
    inp.addEventListener('input', e => {
      const raw = e.target.value.trim();
      const newVal = raw === '' ? '' : Number(raw);
      if (md.utilities[f.key] === newVal) return;
      md.utilities[f.key] = newVal;
      const mk = monthKey(state.currentMonth, state.currentYear);
      const updates = { [`months/${mk}/utilities/${f.key}`]: newVal };
      if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
      _skipNextRender = true;
      saveUpdates(updates);
      saveLocal();
      renderActiveTabOnly();
    });
    fg.appendChild(inp);

    // Status and Paid By
    const stRow = el('div', { class: 'form-row', style: 'margin-top:8px; display:flex; gap:6px;' });
    const isPaid = md.utilityStatus[f.key] === 'paid';
    const stBtn = el('button', {
      class: 'divide-select',
      style: `flex:1; background:${isPaid ? 'var(--green)' : 'var(--red)'}; color:#fff; font-weight:bold; border:none; padding:4px`,
      onclick: (ev) => {
        if (!isAdmin()) { showToast('Admin only', 'error'); return; }
        md.utilityStatus[f.key] = isPaid ? 'unpaid' : 'paid';
        saveUpdates({ [`months/${mk}/utilityStatus/${f.key}`]: md.utilityStatus[f.key] });
        saveLocal();
        const btn = ev.currentTarget;
        const nowPaid = md.utilityStatus[f.key] === 'paid';
        btn.style.background = nowPaid ? 'var(--green)' : 'var(--red)';
        btn.textContent = nowPaid ? 'PAID' : 'UNPAID';
        showToast(nowPaid ? 'Marked as paid' : 'Marked as unpaid', 'success');
      }
    }, isPaid ? 'PAID' : 'UNPAID');
    stRow.appendChild(stBtn);
    fg.appendChild(stRow);

    const pbRow = el('div', { class: 'form-row', style: 'margin-top:8px' });
    pbRow.appendChild(el('label', {}, 'Paid By:'));
    const pbInp = el('input', {
      id: `inp-util-pb-${f.key}`,
      type: 'text',
      value: md.utilityPaidBy[f.key] || '',
      placeholder: 'Name...',
      disabled: !isAdmin(),
      style: 'flex:1; padding:4px 6px; font-size:11px'
    });
    pbInp.addEventListener('input', e => {
      md.utilityPaidBy[f.key] = e.target.value;
      _skipNextRender = true;
      saveUpdates({ [`months/${mk}/utilityPaidBy/${f.key}`]: md.utilityPaidBy[f.key] });
      saveLocal();
    });
    pbRow.appendChild(pbInp);
    fg.appendChild(pbRow);

    // Divisor selector
    const divRow = el('div', { class: 'form-row', style: 'margin-top:8px' });
    divRow.appendChild(el('label', {}, 'Divide by:'));
    const sel = el('select', { class: 'divide-select' });
    [1, 2, 3, 4, 5, 6, 7, 8].forEach(n => {
      const o = el('option', { value: n }, `÷${n}`);
      if ((md.utilityDivisors[f.key] || f.divideBy) === n) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', e => {
      md.utilityDivisors[f.key] = +e.target.value;
      saveUpdates({ [`months/${mk}/utilityDivisors/${f.key}`]: md.utilityDivisors[f.key] });
      saveLocal();
      showToast('Divisor updated', 'success');
      renderRent(); // Instantly recalculate all rent totals
    });
    divRow.appendChild(sel);
    fg.appendChild(divRow);

    if (isAdmin()) {
      const exBtn = el('button', {
        class: 'mini-btn',
        style: 'margin-top:8px; width:100%',
        onclick: () => {
          const modal = el('div', { class: 'modal-overlay' });
          const content = el('div', { class: 'modal-content' });
          content.appendChild(el('h3', { style: 'margin-bottom:8px' }, `Exclusions: ${f.label}`));
          content.appendChild(el('p', { style: 'font-size:12px; margin-bottom:12px; color:var(--text-secondary)' }, 'Uncheck members who should NOT pay for this bill.'));
          members.forEach((m, mi) => {
            const row = el('div', { class: 'toggle-row' });
            const key = `${mi}_${f.key}`;
            const isExcluded = md.rentExclusions[key];
            const chk = el('input', { type: 'checkbox', checked: !isExcluded });
            chk.addEventListener('change', () => {
              if (chk.checked) delete md.rentExclusions[key];
              else md.rentExclusions[key] = true;
              saveUpdates({ [`months/${mk}/rentExclusions/${key}`]: md.rentExclusions[key] || null });
              saveLocal();
            });
            row.appendChild(chk);
            row.appendChild(el('span', {}, m));
            content.appendChild(row);
          });
          const close = el('button', { class: 'login-btn', style: 'margin-top:16px', onclick: () => { modal.remove(); renderRent(); } }, 'Close & Refresh');
          content.appendChild(close);
          modal.appendChild(content);
          document.body.appendChild(modal);
        }
      }, '⚙️ Manage Exclusions');
      fg.appendChild(exBtn);
    }
    formGrid.appendChild(fg);
  });

  // Total utility card
  const totalUtility = UTILITY_FIELDS.reduce((s, f) => s + (md.utilities[f.key] || 0), 0);
  const totalCard = el('div', { class: 'form-group', style: 'border-color:var(--accent)' });
  totalCard.appendChild(el('label', {}, 'Total Bills'));
  totalCard.appendChild(el('div', { style: 'font-size:22px;font-weight:700;color:var(--accent)' }, fmtTk(totalUtility)));
  formGrid.appendChild(totalCard);
  container.appendChild(formGrid);

  // Per-member breakdown table
  container.appendChild(el('div', { class: 'section-heading' }, '👥 Per-Member Breakdown'));
  const rentRows = calcRent(md, members);

  const wrap = el('div', { class: 'table-wrap' },
    el('div', { class: 'table-title' }, '🏠 Rent & Utilities Split')
  );
  const scroll = el('div', { class: 'table-scroll' });
  const table = el('table');

  const thead = el('thead');
  const headRow = el('tr');
  ['Member'].concat(UTILITY_FIELDS.map(f => f.label)).concat(['Service Total', 'Rent', 'Extras', 'Grand Total', 'Paid', 'Yet to Pay']).forEach(h => {
    headRow.appendChild(el('th', {}, h));
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  let sumService = 0, sumRent = 0, sumExtra = 0, sumTotal = 0, sumPaid = 0, sumYet = 0;

  rentRows.forEach((r, i) => {
    if (!canSeeAll && r.name !== currentUser) return;
    const tr = el('tr');
    const nameCell = el('td');
    nameCell.appendChild(el('div', { class: 'name-cell' }, avatar(r.name, i), r.name));
    tr.appendChild(nameCell);

    UTILITY_FIELDS.forEach(f => {
      tr.appendChild(el('td', { class: 'calc-cell' }, fmtTk(r.shares[f.key])));
    });

    tr.appendChild(el('td', { class: 'calc-cell', style: 'font-weight:600' }, fmtTk(r.serviceTotal)));
    sumService += r.serviceTotal;

    const rentInp = el('input', {
      id: `inp-rent-rent-${i}`,
      type: 'number',
      class: 'grid-input wide',
      value: r.rent !== '' && r.rent !== undefined ? r.rent : '',
      placeholder: '0'
    });
    if (!isAdmin()) rentInp.disabled = true;

    rentInp.addEventListener('input', e => {
      const raw = e.target.value.trim();
      const newVal = raw === '' ? '' : Number(raw);
      if (md.rent[i] === newVal) return;
      md.rent[i] = newVal;
      
      const cellKey = `rent-${i}`;
      if (_inputDebounceTimers[cellKey]) clearTimeout(_inputDebounceTimers[cellKey]);
      _inputDebounceTimers[cellKey] = setTimeout(() => {
        if (typeof logActivity === 'function') logActivity(`${currentUser} updated House Rent for ${r.name} to ৳${md.rent[i]}`, r.name);
        const mk = monthKey(state.currentMonth, state.currentYear);
        const updates = { [`months/${mk}/rent/${i}`]: newVal };
        if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
        _skipNextRender = true;
        saveUpdates(updates);
        saveLocal();
        renderActiveTabOnly();
      }, 300);
    });
    tr.appendChild(el('td', {}, rentInp));

    const extraInp = el('input', {
      id: `inp-rent-extra-${i}`,
      type: 'number',
      class: 'grid-input wide',
      value: r.extra !== '' && r.extra !== undefined ? r.extra : '',
      placeholder: '0'
    });
    if (!isAdmin()) extraInp.disabled = true;

    extraInp.addEventListener('input', e => {
      const raw = e.target.value.trim();
      const newVal = raw === '' ? '' : Number(raw);
      if (md.rentExtras[i] === newVal) return;
      md.rentExtras[i] = newVal;
      
      const cellKey = `extra-${i}`;
      if (_inputDebounceTimers[cellKey]) clearTimeout(_inputDebounceTimers[cellKey]);
      _inputDebounceTimers[cellKey] = setTimeout(() => {
        if (typeof logActivity === 'function') logActivity(`${currentUser} updated Utilities Extra for ${r.name} to ৳${md.rentExtras[i]}`, r.name);
        const mk = monthKey(state.currentMonth, state.currentYear);
        const updates = { [`months/${mk}/rentExtras/${i}`]: newVal };
        if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
        _skipNextRender = true;
        saveUpdates(updates);
        saveLocal();
        renderActiveTabOnly();
      }, 300);
    });
    tr.appendChild(el('td', {}, extraInp));

    tr.appendChild(el('td', { class: 'calc-cell', style: 'font-weight:700' }, fmtTk(r.total)));
    sumTotal += r.total;

    const paidInp = el('input', {
      id: `inp-rent-paid-${i}`,
      type: 'number',
      class: 'grid-input wide',
      value: r.paid !== '' && r.paid !== undefined ? r.paid : '',
      placeholder: '0'
    });
    if (!isAdmin()) paidInp.disabled = true;

    paidInp.addEventListener('input', e => {
      const raw = e.target.value.trim();
      const newVal = raw === '' ? '' : Number(raw);
      if (md.rentPaid[i] === newVal) return;
      md.rentPaid[i] = newVal;
      
      const cellKey = `paid-${i}`;
      if (_inputDebounceTimers[cellKey]) clearTimeout(_inputDebounceTimers[cellKey]);
      _inputDebounceTimers[cellKey] = setTimeout(() => {
        if (typeof logActivity === 'function') logActivity(`${currentUser} updated Rent Paid for ${r.name} to ৳${md.rentPaid[i]}`, r.name);
        const mk = monthKey(state.currentMonth, state.currentYear);
        const updates = { [`months/${mk}/rentPaid/${i}`]: newVal };
        if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
        _skipNextRender = true;
        saveUpdates(updates);
        saveLocal();
        renderActiveTabOnly();
      }, 300);
    });
    tr.appendChild(el('td', {}, paidInp));

    const yetTd = el('td', { class: r.yet > 0 ? 'negative' : 'positive', style: 'font-weight:700' }, fmtTk(r.yet));
    tr.appendChild(yetTd);

    sumRent += r.rent;
    sumExtra += r.extra;
    sumPaid += r.paid;
    sumYet += r.yet;

    tbody.appendChild(tr);
  });

  // Grand total
  const gt = el('tr', { class: 'grand-total-row' });
  gt.appendChild(el('td', {}, 'Grand Total'));
  UTILITY_FIELDS.forEach(() => gt.appendChild(el('td', {}, '')));
  gt.appendChild(el('td', { class: 'calc-cell' }, fmtTk(sumService)));
  gt.appendChild(el('td', { class: 'calc-cell' }, fmtTk(sumRent)));
  gt.appendChild(el('td', { class: 'calc-cell' }, fmtTk(sumExtra)));
  gt.appendChild(el('td', { class: 'calc-cell', style: 'font-weight:800' }, fmtTk(sumTotal)));
  gt.appendChild(el('td', { class: 'calc-cell' }, fmtTk(sumPaid)));
  gt.appendChild(el('td', { class: sumYet > 0 ? 'negative' : 'positive', style: 'font-weight:800' }, fmtTk(sumYet)));
  tbody.appendChild(gt);

  table.appendChild(tbody);
  scroll.appendChild(table);
  wrap.appendChild(scroll);
  container.appendChild(wrap);

  // Formula info
  const legend = el('div', { class: 'table-wrap', style: 'padding:16px 18px; font-size:12px; color:var(--text-secondary); line-height:1.8' });
  legend.innerHTML = `
    <strong style="color:var(--text-primary)">📐 Formulas Used</strong><br>
    <code style="color:var(--accent)">Per Utility Share</code> = Bill Amount ÷ Divisor &nbsp;|&nbsp;
    <code style="color:var(--accent)">Service Total</code> = SUM(all utility shares) &nbsp;|&nbsp;
    <code style="color:var(--accent)">Grand Total</code> = Service Total + Rent &nbsp;|&nbsp;
    <code style="color:var(--accent)">Yet to Pay</code> = Grand Total − Paid
  `;
  container.appendChild(legend);
}

// ── Render: History Tab ──
function renderHistory() {
  const container = $('#tab-history');
  container.innerHTML = '';
  if (!isAdmin()) {
    container.appendChild(el('div', { class: 'table-wrap', style: 'padding:20px;text-align:center;color:var(--text-muted)' }, '🔒 Admin access only.'));
    return;
  }

  container.appendChild(el('div', { class: 'page-header' },
    el('h2', {}, 'Balance History'),
    el('p', {}, 'Full view — all members')
  ));

  // Collect months that have data
  const monthKeys = Object.keys(state.months).sort();
  if (monthKeys.length === 0) {
    container.appendChild(el('div', { class: 'table-wrap', style: 'padding:20px;text-align:center;color:var(--text-muted)' }, 'No data yet. Start entering meals and bazar costs to see history.'));
    return;
  }

  const wrap = el('div', { class: 'table-wrap' },
    el('div', { class: 'table-title' }, '📜 Monthly Balance Summary')
  );
  const scroll = el('div', { class: 'table-scroll' });
  const table = el('table');

  const thead = el('thead');
  const headRow = el('tr');
  headRow.appendChild(el('th', {}, 'Member'));
  monthKeys.forEach(mk => {
    const [y, m] = mk.split('-');
    headRow.appendChild(el('th', {}, `${MONTH_NAMES[+m - 1].slice(0, 3)} ${y}`));
  });
  headRow.appendChild(el('th', {}, 'Total'));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const historyMembers = knownMembers(state).filter(member => monthKeys.some(mk => ensureMonthData(state, mk).members.includes(member)));

  const tbody = el('tbody');
  historyMembers.forEach((member, mi) => {
    // admin only, see all
    const tr = el('tr');
    const nameCell = el('td');
    nameCell.appendChild(el('div', { class: 'name-cell' }, avatar(member, mi), member));
    tr.appendChild(nameCell);

    let total = 0;
    monthKeys.forEach(mk => {
      const md = ensureMonthData(state, mk);
      const { results } = calcReport(md, md.members);
      const r = results.find(row => row.name === member);
      const bal = r ? r.finalBalance : 0;
      total += bal;
      const td = el('td', { class: bal >= 0 ? 'positive' : 'negative' }, fmtTk(bal));
      tr.appendChild(td);
    });

    const totalTd = el('td', { class: total >= 0 ? 'positive' : 'negative', style: 'font-weight:700' }, fmtTk(total));
    tr.appendChild(totalTd);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  scroll.appendChild(table);
  wrap.appendChild(scroll);
  container.appendChild(wrap);

  // Notes section
  container.appendChild(el('div', { class: 'section-heading' }, '📝 Notes & Ledger'));
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);
  const members = md.members;

  const notesWrap = el('div', { class: 'table-wrap' },
    el('div', { class: 'table-title' }, `Notes for ${MONTH_NAMES[state.currentMonth]} ${state.currentYear}`)
  );
  const notesScroll = el('div', { class: 'table-scroll' });
  const notesTable = el('table');
  const nthead = el('thead');
  const nhr = el('tr');
  ['Member', 'Balance Override', 'Status'].forEach(h => nhr.appendChild(el('th', {}, h)));
  nthead.appendChild(nhr);
  notesTable.appendChild(nthead);

  const ntbody = el('tbody');
  members.forEach((member, mi) => {
    // admin only, see all
    const tr = el('tr');
    const nameCell = el('td');
    nameCell.appendChild(el('div', { class: 'name-cell' }, avatar(member, mi), member));
    tr.appendChild(nameCell);

    const balInp = el('input', {
      type: 'number',
      class: 'grid-input wide',
      value: md.historyBalances[mi] || '',
      placeholder: '0',
      readonly: !isAdmin()
    });
    balInp.addEventListener('input', e => {
      md.historyBalances[mi] = parseFloat(e.target.value) || 0;
      _skipNextRender = true;
      saveUpdates({ [`months/${mk}/historyBalances/${mi}`]: md.historyBalances[mi] });
      saveLocal();
    });
    tr.appendChild(el('td', {}, balInp));

    const statusSel = el('select', { class: 'divide-select', style: 'min-width:80px', disabled: !isAdmin() });
    ['', 'paid', 'unpaid'].forEach(s => {
      const o = el('option', { value: s }, s || '—');
      if (md.historyStatus[mi] === s) o.selected = true;
      statusSel.appendChild(o);
    });
    statusSel.addEventListener('change', e => {
      md.historyStatus[mi] = e.target.value;
      saveUpdates({ [`months/${mk}/historyStatus/${mi}`]: md.historyStatus[mi] });
      saveLocal();
    });
    tr.appendChild(el('td', {}, statusSel));
    ntbody.appendChild(tr);
  });
  notesTable.appendChild(ntbody);
  notesScroll.appendChild(notesTable);
  notesWrap.appendChild(notesScroll);
  container.appendChild(notesWrap);
}



// ── Admin Panel ──
function renderAdmin() {
  const container = $('#tab-admin');
  container.innerHTML = '';
  if (!isAdmin()) { container.appendChild(el('div', { class: 'table-wrap', style: 'padding:20px;text-align:center;color:var(--text-muted)' }, '🔒 Admin access only.')); return; }
  container.appendChild(el('div', { class: 'page-header' }, el('h2', {}, '⚙️ Admin Panel'), el('p', {}, 'Manage member passwords')));

  const passwords = getPasswords();
  const grid = el('div', { class: 'form-grid' });
  const inputs = {};

  state.members.forEach((member) => {
    const fg = el('div', { class: 'form-group' });
    fg.appendChild(el('label', {}, member));
    const inp = el('input', { type: 'text', value: passwords[member] || '1234' });
    inp.addEventListener('input', e => {
      const pw = getPasswords();
      pw[member] = e.target.value.trim();
      savePasswords(pw);
      // No toast on every keystroke to avoid spam
    });
    inputs[member] = inp;
    fg.appendChild(inp);
    grid.appendChild(fg);
  });

  container.appendChild(grid);

  // Removed manual save button for keystroke updates
}

// ── Management Tab ──
function renderMgmt() {
  const container = $('#tab-mgmt');
  container.innerHTML = '';
  if (!isAdmin()) { container.appendChild(el('div', { class: 'table-wrap', style: 'padding:20px;text-align:center;color:var(--text-muted)' }, '🔒 Admin access only.')); return; }

  container.appendChild(el('div', { class: 'page-header' }, el('h2', {}, '🛠️ System Management'), el('p', {}, 'Management is the single source of truth for login users. Add/remove members here.')));

  const grid = el('div', { class: 'form-grid' });

  // Backup
  const exCard = el('div', { class: 'form-group' }, el('label', {}, 'Backup Data'),
    el('button', { class: 'login-btn', onclick: exportData }, '📥 Download JSON')
  );
  grid.appendChild(exCard);

  // Restore
  const fileInp = el('input', { type: 'file', style: 'display:none', id: 'importFile', onchange: importData });
  const imCard = el('div', { class: 'form-group' }, el('label', {}, 'Restore Data'), fileInp,
    el('button', { class: 'login-btn', style: 'background:var(--amber-bg);color:var(--amber)', onclick: () => $('#importFile').click() }, '📤 Upload JSON')
  );
  grid.appendChild(imCard);

  // Reset
  const reCard = el('div', { class: 'form-group' }, el('label', {}, 'Danger Zone'),
    el('button', { class: 'login-btn', style: 'background:var(--red-bg);color:var(--red)', onclick: resetAllData }, '🗑️ Reset All')
  );
  grid.appendChild(reCard);

  container.appendChild(grid);

  // ── Active Member List ──
  container.appendChild(el('div', { class: 'section-heading' }, '👥 Active Members'));
  const mWrap = el('div', { class: 'table-wrap' });
  const mTable = el('table');
  const mThead = el('thead');
  const mHeadRow = el('tr');
  ['', 'Name', 'Joined', 'Status', 'Action'].forEach(h => mHeadRow.appendChild(el('th', {}, h)));
  mThead.appendChild(mHeadRow);
  mTable.appendChild(mThead);

  const mTbody = el('tbody');
  state.members.forEach((m, i) => {
    const tr = el('tr');
    tr.appendChild(el('td', { style: 'width:40px' }, avatar(m, i)));
    tr.appendChild(el('td', { style: 'font-weight:600' }, m));

    // Show join date from memberMeta
    const meta = state.memberMeta && state.memberMeta[m];
    const joinMk = meta && meta.addedAt;
    let joinLabel = 'Original';
    if (joinMk) {
      const [y, mo] = joinMk.split('-');
      joinLabel = `${MONTH_NAMES[+mo - 1]} ${y}`;
    }
    tr.appendChild(el('td', { style: 'font-size:12px; color:var(--text-secondary)' }, joinLabel));

    // Status badge
    tr.appendChild(el('td', {}, el('span', { class: 'badge badge-green', style: 'font-size:11px' }, '● Active')));

    // Action
    const delTd = el('td', { style: 'text-align:right' });
    if (m !== 'ALIF') {
      delTd.appendChild(el('button', { class: 'logout-btn', style: 'padding:4px 8px', onclick: () => removeMember(m) }, 'Remove'));
    } else {
      delTd.appendChild(el('span', { style: 'font-size:11px; color:var(--text-muted)' }, 'Admin'));
    }
    tr.appendChild(delTd);
    mTbody.appendChild(tr);
  });
  mTable.appendChild(mTbody);
  mWrap.appendChild(mTable);

  const addBox = el('div', { style: 'padding:16px; display:flex; gap:8px; border-top:1px solid var(--border)' },
    el('input', { type: 'text', id: 'newMemberName', placeholder: 'New member name...' }),
    el('button', { class: 'login-btn', style: 'width:auto', onclick: addMember }, '➕ Add Member')
  );
  mWrap.appendChild(addBox);
  container.appendChild(mWrap);

  // ── Deleted Members History ──
  const deletedMembers = state.deletedMembers || {};
  const deletedNames = Object.keys(deletedMembers);
  if (deletedNames.length > 0) {
    container.appendChild(el('div', { class: 'section-heading', style: 'margin-top:24px' }, '🗂️ Deleted Members (Historical)'));
    const dWrap = el('div', { class: 'table-wrap' });
    const dTable = el('table');
    const dThead = el('thead');
    const dHeadRow = el('tr');
    ['Name', 'Active Period', 'Deleted On', 'Action'].forEach(h => dHeadRow.appendChild(el('th', {}, h)));
    dThead.appendChild(dHeadRow);
    dTable.appendChild(dThead);

    const dTbody = el('tbody');
    deletedNames.forEach(name => {
      const info = deletedMembers[name];
      const tr = el('tr', { style: 'opacity:0.7' });
      tr.appendChild(el('td', { style: 'font-weight:600' }, name));

      // Active period
      const meta = state.memberMeta && state.memberMeta[name];
      const from = meta && meta.addedAt ? (() => { const [y, mo] = meta.addedAt.split('-'); return `${MONTH_NAMES[+mo - 1]} ${y}`; })() : 'Origin';
      const to = info.deletedAt ? (() => { const [y, mo] = info.deletedAt.split('-'); return `${MONTH_NAMES[+mo - 1]} ${y}`; })() : '?';
      tr.appendChild(el('td', { style: 'font-size:12px' }, `${from} → ${to}`));

      // Deleted date
      const delDate = info.deletedDate ? new Date(info.deletedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
      tr.appendChild(el('td', { style: 'font-size:12px; color:var(--red)' }, delDate));

      // Archived status
      const actionTd = el('td', { style: 'text-align:right' });
      actionTd.appendChild(el('span', { style: 'font-size:11px; color:var(--text-muted)' }, 'Archived'));
      tr.appendChild(actionTd);
      dTbody.appendChild(tr);
    });
    dTable.appendChild(dTbody);
    dWrap.appendChild(dTable);
    container.appendChild(dWrap);
  }
}

function exportData() {
  const data = { state, passwords: getPasswords() };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `backup_${Date.now()}.json`; a.click();
}

function importData(e) {
  const reader = new FileReader();
  reader.onload = ev => {
    const data = JSON.parse(ev.target.result);
    state = data.state; saveLocal();
    savePasswords(data.passwords);
    location.reload();
  };
  reader.readAsText(e.target.files[0]);
}

function resetAllData() {
  if (confirm('Delete all records?')) { state = defaultState(); saveLocal(); location.reload(); }
}

function addMember() {
  const name = $('#newMemberName').value.trim().toUpperCase();
  if (!name) { showToast('Please enter a name', 'error'); return; }
  if (state.members.includes(name)) { showToast(`${name} is already a member`, 'error'); return; }
  if (state.deletedMembers && state.deletedMembers[name]) {
    showToast(`${name} was deleted earlier. Use a unique name to preserve history.`, 'error');
    return;
  }

  // Add to active members
  state.members.push(name);

  // Record join metadata — member is active from the selected/current month onward
  if (!state.memberMeta) state.memberMeta = {};
  const bd = getBDDate();
  const addedMk = monthKey(state.currentMonth, state.currentYear);
  state.memberMeta[name] = {
    addedAt: addedMk,
    addedDate: new Date().toISOString()
  };

  // Create password
  const pw = getPasswords(); pw[name] = '1234'; savePasswords(pw);

  // Propagate: ensure month data exists for the selected month and all
  // existing future months (do NOT create records for months before addedAt)
  const currentMk = monthKey(state.currentMonth, state.currentYear);
  const realMk = monthKey(bd.month, bd.year);

  const updates = {
    'members': state.members,
    'memberMeta': state.memberMeta
  };
  if (state.deletedMembers) {
    updates['deletedMembers'] = state.deletedMembers;
  }

  // Ensure the current viewed month + real month have data for this new member
  ensureMonthData(state, currentMk);
  updates[`months/${currentMk}`] = state.months[currentMk];

  if (realMk !== currentMk) {
    ensureMonthData(state, realMk);
    updates[`months/${realMk}`] = state.months[realMk];
  }

  // Also propagate to any other existing future months
  if (state.months) {
    Object.keys(state.months).forEach(mk => {
      if (mk >= addedMk && mk !== currentMk && mk !== realMk) {
        ensureMonthData(state, mk);
        updates[`months/${mk}`] = state.months[mk];
      }
    });
  }

  saveUpdates(updates);
  saveLocal();
  refreshLoginDropdown();
  renderActiveTabOnly();
  showToast(`${name} added! Active from ${MONTH_NAMES[state.currentMonth]} ${state.currentYear} onward.`, 'success');
}

function removeMember(name) {
  if (name === 'ALIF') {
    showToast('Cannot remove admin user', 'error');
    return;
  }
  if (!confirm(`Remove ${name}?\n\n• They will be removed from the login dropdown immediately\n• Historical records (meals, bazar, rent) will be preserved\n• They will not appear in future months`)) return;

  // Track deletion for historical integrity based on currently viewed month
  if (!state.deletedMembers) state.deletedMembers = {};
  const deletedMk = monthKey(state.currentMonth, state.currentYear);
  state.deletedMembers[name] = {
    deletedAt: deletedMk,
    deletedDate: new Date().toISOString()
  };

  // Remove from active members list
  state.members = state.members.filter(m => m !== name);

  // Remove password
  const pw = getPasswords();
  delete pw[name];
  savePasswords(pw);

  // Save to Firebase — historical month data is NOT modified
  const updates = {
    'members': state.members,
    'deletedMembers': state.deletedMembers
  };
  if (state.months) {
    Object.keys(state.months).forEach(mk => {
      if (mk > deletedMk) {
        ensureMonthData(state, mk);
        updates[`months/${mk}`] = state.months[mk];
      }
    });
  }
  saveUpdates(updates);
  saveLocal();

  // Update login dropdown
  refreshLoginDropdown();

  // Force logout if the deleted user is currently logged in
  if (currentUser === name) {
    logout();
    showToast('Your account has been removed', 'error');
    return;
  }

  renderActiveTabOnly();
  showToast(`${name} removed. Historical data preserved.`, 'success');
}

// Re-add a previously deleted member
function reAddMember(name) {
  showToast(`${name} is archived. Add a unique new member name to preserve history.`, 'error');
}

function renderActiveTabOnly() {
  const activeTabContent = document.querySelector('.tab-content.active');
  const scrollPositions = [];
  let focusedId = null;
  let cursorStart = null;

  if (document.activeElement && document.activeElement.tagName === 'INPUT') {
    focusedId = document.activeElement.id;
    try { cursorStart = document.activeElement.selectionStart; } catch (e) { }
  }

  if (activeTabContent) {
    activeTabContent.querySelectorAll('.table-scroll').forEach(el => {
      scrollPositions.push({ top: el.scrollTop, left: el.scrollLeft });
    });
  }

  if (activeTabContent) {
    if (activeTabContent.id === 'tab-dashboard') renderDashboard();
    else if (activeTabContent.id === 'tab-meals') renderMeals();
    else if (activeTabContent.id === 'tab-bazar') renderBazar();
    else if (activeTabContent.id === 'tab-rent') renderRent();
    else if (activeTabContent.id === 'tab-history') renderHistory();
    else if (activeTabContent.id === 'tab-football' && typeof renderFootball === 'function') renderFootball();
    else if (activeTabContent.id === 'tab-chat') renderChat();
    else if (activeTabContent.id === 'tab-admin') renderAdmin();
    else if (activeTabContent.id === 'tab-mgmt') renderMgmt();
  }

  if (activeTabContent) {
    const newScrollEls = activeTabContent.querySelectorAll('.table-scroll');
    newScrollEls.forEach((el, i) => {
      if (scrollPositions[i]) {
        el.scrollTop = scrollPositions[i].top;
        el.scrollLeft = scrollPositions[i].left;
      }
    });
  }

  if (focusedId) {
    const elToFocus = document.getElementById(focusedId);
    if (elToFocus) {
      elToFocus.focus();
      try { if (cursorStart !== null) elToFocus.setSelectionRange(cursorStart, cursorStart); } catch (e) { }
    }
  }
}

// ── Excel Export & Periodic Tasks ──
function generateExcelReport() {
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);
  const members = md.members;
  const days = daysInMonth(state.currentMonth, state.currentYear);
  const { results, grandTotalMeals, grandTotalBazar, grandTotalOthers, perMealRate } = calcReport(md, members);

  const wb = XLSX.utils.book_new();

  // 1. Meals Sheet
  const mealData = [["Day", ...members, "Total"]];
  const mealTotals = new Array(members.length).fill(0);
  let mealGrand = 0;
  for (let d = 0; d < days; d++) {
    const row = [d + 1];
    let rTotal = 0;
    members.forEach((m, mi) => {
      const v = md.meals[mi][d] || 0;
      row.push(v);
      rTotal += v;
      mealTotals[mi] += v;
    });
    mealGrand += rTotal;
    row.push(rTotal);
    mealData.push(row);
  }
  mealData.push(["Total", ...mealTotals, mealGrand]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mealData), "Meals");

  // 2. Bazar Sheet
  const bazarData = [["Day", ...members, "Total Bazar", "Day", ...members, "Total Others"]];
  const bazarTotals = new Array(members.length).fill(0);
  const othersTotals = new Array(members.length).fill(0);
  let bGrand = 0, oGrand = 0;
  for (let d = 0; d < days; d++) {
    const row = [d + 1];
    let brTotal = 0;
    members.forEach((m, mi) => {
      const v = md.bazar[mi][d] || 0;
      row.push(v);
      brTotal += v;
      bazarTotals[mi] += v;
    });
    bGrand += brTotal;
    row.push(brTotal);

    row.push(d + 1);
    let orTotal = 0;
    members.forEach((m, mi) => {
      const v = md.bazarOthers[mi][d] || 0;
      row.push(v);
      orTotal += v;
      othersTotals[mi] += v;
    });
    oGrand += orTotal;
    row.push(orTotal);
    bazarData.push(row);
  }
  bazarData.push(["Total", ...bazarTotals, bGrand, "Total", ...othersTotals, oGrand]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bazarData), "Bazar");

  // 3. Summary Sheet
  const sumData = [
    ["Member", "Total Meals", "Per Meal Rate", "Meal Cost", "Bazar Spent", "Meal Balance", "Others Spend", "Others Share", "Final Balance", "Status"]
  ];
  let sMealCost = 0, sBazar = 0, sMealBal = 0, sOthers = 0, sOShare = 0, sFinal = 0;
  results.forEach(r => {
    sumData.push([
      r.name, r.totalMeals, Number(r.perMealRate.toFixed(2)), Number(r.mealCost.toFixed(2)), r.totalBazar, Number(r.givenTake.toFixed(2)), r.othersSpend, Number(r.othersShare.toFixed(2)), Number(r.finalBalance.toFixed(2)), r.finalBalance >= 0 ? "Gets Back" : "Owes"
    ]);
    sMealCost += r.mealCost; sBazar += r.totalBazar; sMealBal += r.givenTake; sOthers += r.othersSpend; sOShare += r.othersShare; sFinal += r.finalBalance;
  });
  sumData.push(["Grand Total", grandTotalMeals, "-", Number(sMealCost.toFixed(2)), sBazar, Number(sMealBal.toFixed(2)), sOthers, Number(sOShare.toFixed(2)), Number(sFinal.toFixed(2))]);

  sumData.push([]);
  sumData.push(["House Rent & Utilities Split"]);
  sumData.push(["Member", ...UTILITY_FIELDS.map(f => f.label), "Service Total", "Rent", "Extras", "Grand Total", "Paid", "Yet to Pay"]);
  const rentRows = calcRent(md, members);
  let ss = 0, sr = 0, se = 0, sgt = 0, sp = 0, sy = 0;
  rentRows.forEach(r => {
    if (!isAdmin() && !rentUnlocked && r.name !== currentUser) return;
    const row = [r.name];
    UTILITY_FIELDS.forEach(f => row.push(Number(r.shares[f.key].toFixed(2))));
    row.push(Number(r.serviceTotal.toFixed(2)), r.rent, r.extra, Number(r.total.toFixed(2)), r.paid, Number(r.yet.toFixed(2)));
    sumData.push(row);
    ss += r.serviceTotal; sr += r.rent; se += r.extra; sgt += r.total; sp += r.paid; sy += r.yet;
  });
  if (isAdmin() || rentUnlocked) {
    const grow = ["Grand Total"];
    UTILITY_FIELDS.forEach(() => grow.push("-"));
    grow.push(Number(ss.toFixed(2)), sr, se, Number(sgt.toFixed(2)), sp, Number(sy.toFixed(2)));
    sumData.push(grow);
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumData), "Summary");
  XLSX.writeFile(wb, `Mess_Report_${MONTH_NAMES[state.currentMonth]}_${state.currentYear}.xlsx`);
}

function runPeriodicTasks() {
  const bd = getBDDate();
  let changed = false;

  // 1. Auto Month Rollover (execute only once when the real-world month actually changes)
  if (state.lastRolledMonth !== bd.month || state.lastRolledYear !== bd.year) {
    state.lastRolledMonth = bd.month;
    state.lastRolledYear = bd.year;
    // Auto-advance the UI to the strictly new month
    state.currentMonth = bd.month;
    state.currentYear = bd.year;
    const mk = monthKey(state.currentMonth, state.currentYear);
    ensureMonthData(state, mk);
    changed = true;

    const ms = $('#monthSelect');
    const ys = $('#yearSelect');
    if (ms) ms.value = state.currentMonth;
    if (ys) ys.value = state.currentYear;
    showToast('Welcome to a new month!', 'info');
  }

  if (changed) {
    const updates = { 
        'lastRolledMonth': state.lastRolledMonth, 
        'lastRolledYear': state.lastRolledYear,
        'currentMonth': state.currentMonth,
        'currentYear': state.currentYear
    };
    if (md && md.meals) {
        members.forEach((m, mi) => {
            if (md.meals[mi]) updates[`months/${mk}/meals/${mi}`] = md.meals[mi];
        });
    }
    saveUpdates(updates);
    saveLocal();
    renderActiveTabOnly();
  }
}

// ── Activity Log & Notifications ──
function logActivity(msg, memberKey) {
  if (!state.logs) state.logs = [];
  const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka", month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  state.logs.unshift({ time: now, msg, member: memberKey });
  if (state.logs.length > 200) state.logs.pop();
}

function showNotifications() {
  const modal = el('div', { class: 'modal-overlay', style: 'z-index:9999;' });
  const content = el('div', { class: 'modal-content', style: 'max-width:400px; max-height:80vh; overflow-y:auto; padding:20px;' });

  content.appendChild(el('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;' },
    el('h3', { style: 'margin:0;' }, '🔔 Activity Log'),
    el('button', { class: 'logout-btn', style: 'padding:4px 8px; width:auto; margin:0;', onclick: () => modal.remove() }, 'Close')
  ));

  let activeFilter = 'All';
  const filterWrap = el('div', { style: 'margin-bottom:12px; display:none;' });
  const filterSelect = el('select', { style: 'width:100%; padding:8px; border-radius:6px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border); outline:none;' });

  if (isAdmin()) {
    filterWrap.style.display = 'block';
    filterSelect.appendChild(el('option', { value: 'All' }, 'All Members'));
    activeLoginMembers().forEach(m => filterSelect.appendChild(el('option', { value: m }, m)));
    filterWrap.appendChild(filterSelect);
    content.appendChild(filterWrap);
  }

  const list = el('div', { style: 'display:flex; flex-direction:column; gap:8px;' });
  content.appendChild(list);

  function renderList() {
    list.innerHTML = '';
    const logs = state.logs || [];
    let filtered = logs;

    if (isAdmin()) {
      if (activeFilter !== 'All') {
        filtered = logs.filter(l => l.member === activeFilter || l.msg.includes(activeFilter));
      }
    } else {
      filtered = logs.filter(l => l.member === currentUser || l.msg.includes(currentUser));
    }

    if (filtered.length === 0) {
      list.appendChild(el('div', { style: 'color:var(--text-muted); text-align:center; padding:20px;' }, 'No recent activity.'));
    } else {
      filtered.forEach(l => {
        const item = el('div', { style: 'background:var(--bg-input); padding:10px; border-radius:6px; border-left:3px solid var(--accent);' },
          el('div', { style: 'font-size:11px; color:var(--text-muted); margin-bottom:4px;' }, l.time),
          el('div', { style: 'font-size:13px; color:var(--text-primary); line-height:1.4;' }, l.msg)
        );
        list.appendChild(item);
      });
    }
  }

  filterSelect.addEventListener('change', (e) => {
    activeFilter = e.target.value;
    renderList();
  });

  renderList();
  modal.appendChild(content);
  document.body.appendChild(modal);
}

// ── Chat Module 2.0 ──
let _chatReplyTo = null;
let _chatSearch = '';

function renderChat() {
  const container = $('#tab-chat');
  if (!container) return;
  container.innerHTML = '';

  if (!state.chat) state.chat = [];
  if (!state.chatPinned) state.chatPinned = [];

  container.appendChild(el('div', { class: 'page-header' },
    el('h2', {}, '💬 Group Chat & Suggestions'),
    el('p', {}, 'Share opinions, ideas, and stay coordinated')
  ));

  const chatContainer = el('div', { class: 'chat-container' });

  // Search bar
  const searchBar = el('div', { class: 'chat-search-bar' });
  const searchInp = el('input', { type: 'text', placeholder: '🔍 Search messages...', value: _chatSearch });
  searchInp.addEventListener('input', (e) => { _chatSearch = e.target.value; renderMessages(); });
  searchBar.appendChild(searchInp);
  chatContainer.appendChild(searchBar);

  // Pinned messages area
  const pinnedArea = el('div', { class: 'chat-pinned-area' });
  function renderPinned() {
    pinnedArea.innerHTML = '';
    const pinned = (state.chatPinned || []).map(id => state.chat.find(m => m.id === id)).filter(Boolean);
    if (pinned.length > 0) {
      pinnedArea.appendChild(el('div', { class: 'chat-pinned-label' }, '📌 Pinned'));
      pinned.forEach(msg => {
        pinnedArea.appendChild(el('div', { class: 'chat-pinned-msg' },
          el('span', { style: 'font-weight:600; color:var(--accent)' }, msg.sender + ': '),
          el('span', {}, msg.text.substring(0, 80) + (msg.text.length > 80 ? '...' : ''))
        ));
      });
    }
  }
  renderPinned();
  chatContainer.appendChild(pinnedArea);

  const messagesWrap = el('div', { class: 'chat-messages' });

  function renderMessages() {
    messagesWrap.innerHTML = '';
    let messages = state.chat || [];
    if (_chatSearch.trim()) {
      const q = _chatSearch.toLowerCase();
      messages = messages.filter(m => m.text.toLowerCase().includes(q) || m.sender.toLowerCase().includes(q));
    }
    if (messages.length === 0) {
      messagesWrap.appendChild(el('div', { style: 'color:var(--text-muted); text-align:center; padding:40px;' },
        _chatSearch ? 'No messages found.' : 'No messages yet. Start the conversation!'));
      return;
    }
    messages.forEach(msg => {
      const isSelf = msg.sender === currentUser;
      const cw = el('div', { class: `chat-msg ${isSelf ? 'self' : 'other'}` });

      if (msg.replyTo) {
        const orig = state.chat.find(m => m.id === msg.replyTo);
        if (orig) {
          cw.appendChild(el('div', { class: 'chat-reply-preview' },
            el('span', { style: 'font-weight:600; color:var(--accent)' }, orig.sender + ': '),
            el('span', {}, orig.text.substring(0, 60) + (orig.text.length > 60 ? '...' : ''))
          ));
        }
      }

      const bubble = el('div', { class: 'chat-bubble' });
      if (msg.category && msg.category !== 'General') {
        bubble.appendChild(el('span', { class: 'chat-category' }, msg.category));
        bubble.appendChild(document.createElement('br'));
      }
      bubble.appendChild(document.createTextNode(msg.text));
      cw.appendChild(bubble);

      // Reactions
      const reactions = msg.reactions || {};
      const reactionKeys = Object.keys(reactions);
      if (reactionKeys.length > 0) {
        const rBar = el('div', { class: 'chat-reactions-bar' });
        reactionKeys.forEach(emoji => {
          const users = reactions[emoji] || [];
          if (users.length > 0) {
            rBar.appendChild(el('span', { class: 'chat-reaction-badge', title: users.join(', ') }, `${emoji} ${users.length}`));
          }
        });
        cw.appendChild(rBar);
      }

      // Actions
      const actions = el('div', { class: 'chat-actions' });
      actions.appendChild(el('button', { class: 'chat-action-btn', title: 'Reply', onclick: () => {
        _chatReplyTo = msg; updateReplyPreview();
      } }, '↩'));

      ['👍','❤️','😂','😮','👎'].forEach(emoji => {
        actions.appendChild(el('button', { class: 'chat-action-btn', onclick: () => {
          if (!msg.reactions) msg.reactions = {};
          if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
          const idx = msg.reactions[emoji].indexOf(currentUser);
          if (idx >= 0) msg.reactions[emoji].splice(idx, 1);
          else msg.reactions[emoji].push(currentUser);
          if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
          _skipNextRender = true; 
          saveUpdates({ 'chat': state.chat });
          saveLocal(); renderMessages();
        } }, emoji));
      });

      if (isAdmin()) {
        const isPinned = (state.chatPinned || []).includes(msg.id);
        actions.appendChild(el('button', { class: `chat-action-btn ${isPinned ? 'pinned' : ''}`, title: isPinned ? 'Unpin' : 'Pin', onclick: () => {
          if (!state.chatPinned) state.chatPinned = [];
          const pi = state.chatPinned.indexOf(msg.id);
          if (pi >= 0) state.chatPinned.splice(pi, 1); else state.chatPinned.push(msg.id);
          saveUpdates({ 'chatPinned': state.chatPinned });
          saveLocal(); renderPinned(); renderMessages();
        } }, '📌'));
      }

      if (isSelf || isAdmin()) {
        actions.appendChild(el('button', { class: 'chat-action-btn del', title: 'Delete', onclick: () => {
          if (!confirm('Delete this message?')) return;
          state.chat = state.chat.filter(m => m.id !== msg.id);
          if (state.chatPinned) state.chatPinned = state.chatPinned.filter(id => id !== msg.id);
          saveUpdates({ 'chat': state.chat, 'chatPinned': state.chatPinned });
          saveLocal(); renderMessages(); renderPinned();
        } }, '🗑'));
      }

      cw.appendChild(actions);
      cw.appendChild(el('div', { class: 'chat-meta' }, isSelf ? msg.time : `${msg.sender} • ${msg.time}`));
      messagesWrap.appendChild(cw);
    });
  }

  renderMessages();
  chatContainer.appendChild(messagesWrap);

  // Reply bar
  const replyPreview = el('div', { class: 'chat-reply-bar', style: 'display:none' });
  function updateReplyPreview() {
    if (_chatReplyTo) {
      replyPreview.style.display = 'flex';
      replyPreview.innerHTML = '';
      replyPreview.appendChild(el('span', { style: 'flex:1; font-size:12px; color:var(--text-secondary)' },
        `↩ Replying to ${_chatReplyTo.sender}: ${_chatReplyTo.text.substring(0, 40)}...`));
      replyPreview.appendChild(el('button', { class: 'chat-action-btn', onclick: () => {
        _chatReplyTo = null; replyPreview.style.display = 'none';
      } }, '✕'));
    } else { replyPreview.style.display = 'none'; }
  }
  chatContainer.appendChild(replyPreview);

  const inputArea = el('div', { class: 'chat-input-area' });
  const catSelect = el('select', { style: 'flex:0.3' });
  ['General', 'Suggestion', 'Bug/Issue', 'Opinion', 'Reminder'].forEach(c => {
    catSelect.appendChild(el('option', { value: c }, c));
  });
  const textInp = el('input', { type: 'text', placeholder: 'Type your message...', style: 'flex:1' });
  const sendBtn = el('button', { class: 'login-btn', style: 'width:auto; margin:0;' }, 'Send');

  function sendMessage() {
    if (!textInp.value.trim()) return;
    const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka", month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (!Array.isArray(state.chat)) state.chat = [];
    const newMsg = { id: Date.now(), sender: currentUser, text: textInp.value.trim(), category: catSelect.value, time: now, reactions: {} };
    if (_chatReplyTo) { newMsg.replyTo = _chatReplyTo.id; _chatReplyTo = null; }
    state.chat.push(newMsg);
    if (state.chat.length > 500) state.chat.shift();
    textInp.value = '';
    saveUpdates({ 'chat': state.chat });
    saveLocal(); renderMessages(); renderPinned(); updateReplyPreview();
    setTimeout(() => { messagesWrap.scrollTop = messagesWrap.scrollHeight; }, 50);
  }

  sendBtn.addEventListener('click', sendMessage);
  textInp.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
  inputArea.appendChild(catSelect);
  inputArea.appendChild(textInp);
  inputArea.appendChild(sendBtn);
  chatContainer.appendChild(inputArea);
  container.appendChild(chatContainer);
  setTimeout(() => { messagesWrap.scrollTop = messagesWrap.scrollHeight; }, 10);
}

function initGlobals() {
  const gdlBtn = $('#globalDownloadBtn');
  if (gdlBtn) gdlBtn.addEventListener('click', generateExcelReport);

  const nSideBtn = $('#notifSideBtn');
  if (nSideBtn) {
    nSideBtn.addEventListener('click', () => {
      $('#sidebar').classList.remove('open');
      showNotifications();
    });
  }

  const nMobBtn = $('#notifMobileBtn');
  if (nMobBtn) nMobBtn.addEventListener('click', showNotifications);
}

// ── Theme Toggle ──
function initTheme() {
  const saved = localStorage.getItem('messTheme') || 'dark';
  applyTheme(saved);
  $('#themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('messTheme', next);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = $('#themeIcon');
  const label = $('#themeLabel');
  if (theme === 'light') {
    icon.textContent = '☀️';
    label.textContent = 'Light Mode';
  } else {
    icon.textContent = '🌙';
    label.textContent = 'Dark Mode';
  }
}

// ── Init ──
load();
initNav();
initSelectors();
initTheme();
initLogin();
initFirebase();
initGlobals();
renderActiveTabOnly();
