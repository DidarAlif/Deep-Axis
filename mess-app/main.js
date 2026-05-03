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
    currentMonth: now.getMonth(),
    currentYear: now.getFullYear(),
    months: {}
  };
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
  if (state.members[memberIdx] !== currentUser) return false;

  const bd = getBDDate();
  if (state.currentYear < bd.year) return false;
  if (state.currentYear > bd.year) return true;
  if (state.currentMonth < bd.month) return false;
  if (state.currentMonth > bd.month) return true;
  // Allow current day AND future days in current month
  if (day < bd.day) return false;

  return true;
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
    if (state.members[mi] !== currentUser) {
      showToast('Verify your own records only', 'error');
      return;
    }
  } else {
    if (!isAdmin()) {
      showToast('Admin verification required', 'error');
      return;
    }
  }

  md[vKey][mi][d] = !md[vKey][mi][d];
  save();
  renderAll();
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
    const n = st.members.length;
    st.months[mk] = {
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
      rent: st.members.map(m => DEFAULT_RENT[m] || 0),
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
  const n = st.members.length;
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
  while (md.rent.length < n) md.rent.push(0);
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
  const safeUpdates = JSON.parse(JSON.stringify(updates));
  stateRef.update(safeUpdates).catch(err => {
    console.error('Firebase update error:', err);
    showToast('Sync error \u2014 saved locally', 'error');
  });
}

function save() {
  localStorage.setItem('messManagerState', JSON.stringify(state));
  if (_saveTimer) clearTimeout(_saveTimer);
  _skipNextRender = true;
  _saveTimer = setTimeout(() => {
    let payload = Object.assign({}, state);
    delete payload.passwords;

    // Strip undefined values to prevent Firebase client crashes
    payload = JSON.parse(JSON.stringify(payload));

    stateRef.update(payload).catch(err => {
      console.error('Firebase save error:', err);
      showToast('Sync error \u2014 saved locally', 'error');
    });
  }, 300);
}

function load() {
  const raw = localStorage.getItem('messManagerState');
  if (raw) {
    try { state = JSON.parse(raw); } catch (e) { state = defaultState(); }
  }
  hydratePasswordsFromLocal();
}

function initFirebase() {
  stateRef.on('value', snapshot => {
    const data = snapshot.val();
    if (data) {
      state = data;
      if (!Array.isArray(state.members)) state.members = [...DEFAULT_MEMBERS];
      hydratePasswordsFromLocal();
      localStorage.setItem('messManagerState', JSON.stringify(state));
      if (_skipNextRender) {
        _skipNextRender = false;
      } else {
        renderAll();
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
      if (typeof renderAll === 'function') renderAll();
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
  (state.members || DEFAULT_MEMBERS).forEach(m => { pw[m] = (m === 'ALIF' ? 'admin' : '1234'); });
  persistPasswords(pw);
  return pw;
}
function savePasswords(pw) {
  persistPasswords(pw);
  if (typeof stateRef !== 'undefined') {
    stateRef.child('passwords').set(pw).catch(console.error);
  }
  save();
}
function isAdmin() { return currentUser === 'ALIF'; }

function initLogin() {
  const sel = $('#loginUser');
  DEFAULT_MEMBERS.forEach(m => { sel.appendChild(el('option', { value: m }, m)); });
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

  const sess = sessionStorage.getItem('messUser');
  if (sess && DEFAULT_MEMBERS.includes(sess)) {
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
    sessionStorage.setItem('messUser', user);
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
  renderAll();
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
  ms.addEventListener('change', () => { state.currentMonth = +ms.value; save(); renderAll(); });
  ys.addEventListener('change', () => { state.currentYear = +ys.value; save(); renderAll(); });
}

// ── Render: Dashboard ──
function renderDashboard() {
  const container = $('#tab-dashboard');
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);
  const { results, grandTotalMeals, grandTotalBazar, grandTotalOthers, perMealRate } = calcReport(md, state.members);

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
    { label: 'Total Meals', value: grandTotalMeals, cls: 'stat-accent', sub: `${state.members.length} members` },
    { label: 'Total Bazar', value: fmtTk(grandTotalBazar), cls: 'stat-green', sub: 'All members combined' },
    { label: 'Per Meal Rate', value: fmtTk(perMealRate), cls: 'stat-amber', sub: 'Total Bazar ÷ Total Meals' },
    { label: 'Others Cost', value: fmtTk(grandTotalOthers), cls: 'stat-red', sub: `÷${state.members.length} per member` },
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
  container.appendChild(el('div', { class: 'section-heading', style: 'margin-top:24px' }, '📅 Khala Schedule'));
  const khalaWrap = el('div', { class: 'table-wrap', style: 'padding:18px' });
  khalaWrap.appendChild(el('p', { style: 'font-size:12px; color:var(--text-secondary); margin-bottom:12px' },
    'Tap to toggle if Khala is coming. 🟢 = Coming, 🔴 = Not coming, ⚪ = Not set'));

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
      onclick: () => {
        if (khalaMd.khalaCook[d] === null || khalaMd.khalaCook[d] === undefined) khalaMd.khalaCook[d] = true;
        else if (khalaMd.khalaCook[d] === true) khalaMd.khalaCook[d] = false;
        else khalaMd.khalaCook[d] = null;
        _skipNextRender = true; save(); renderAll();
      }
    }, `🍳${cookStatus === true ? '✓' : cookStatus === false ? '✗' : '?'}`);

    const cleanBtn = el('button', {
      class: `khala-toggle ${cleanStatus === true ? 'k-on' : cleanStatus === false ? 'k-off' : 'k-null'}`,
      title: 'Cleaning Khala',
      onclick: () => {
        if (khalaMd.khalaCleaner[d] === null || khalaMd.khalaCleaner[d] === undefined) khalaMd.khalaCleaner[d] = true;
        else if (khalaMd.khalaCleaner[d] === true) khalaMd.khalaCleaner[d] = false;
        else khalaMd.khalaCleaner[d] = null;
        _skipNextRender = true; save(); renderAll();
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
  state.members.forEach(member => headRow.appendChild(el('th', { style: 'text-align:center' }, member)));
  headRow.appendChild(el('th', { style: 'text-align:center' }, 'Total'));
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Body
  const tbody = el('tbody');
  const memberTotals = new Array(state.members.length).fill(0);
  let grandTotal = 0;

  for (let d = 0; d < days; d++) {
    const tr = el('tr');
    const dateObj = new Date(state.currentYear, state.currentMonth, d + 1);
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getDay()];
    tr.appendChild(el('td', { style: 'position:sticky;left:0;z-index:1;background:var(--bg-secondary);font-weight:bold; white-space:nowrap;' }, `${d + 1} ${dayName}`));

    let rowTotal = 0;
    state.members.forEach((member, mi) => {
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

      inp.addEventListener('change', (e) => {
        const raw = e.target.value.trim();
        const newVal = raw === '' ? (dataKey === 'meals' ? null : '') : Number(raw);
        if (data[mi][d] === newVal) return;

        data[mi][d] = newVal;
        if (typeof logActivity === 'function') logActivity(`${currentUser} updated ${title} for Day ${d + 1} (${member}) to ${newVal}`, member);

        _skipNextRender = true;
        const mk = monthKey(state.currentMonth, state.currentYear);
        const updates = { [`months/${mk}/${dataKey}/${mi}/${d}`]: newVal };
        if (isAdmin()) {
          const vAKey = dataKey === 'meals' ? 'vMealsAdmin' : (dataKey === 'bazar' ? 'vBazarAdmin' : 'vBazarOthersAdmin');
          if (md[vAKey]) {
            md[vAKey][mi][d] = true;
            updates[`months/${mk}/${vAKey}/${mi}/${d}`] = true;
          }
        }
        if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
        saveUpdates(updates);

        let rTotal = 0;
        for (let j = 0; j < state.members.length; j++) rTotal += Number(data[j][d]) || 0;
        const rowEl = document.getElementById(`rt-${dataKey}-${d}`);
        if (rowEl) rowEl.textContent = fmt(rTotal);

        let cTotal = 0;
        for (let dx = 0; dx < days; dx++) cTotal += Number(data[mi][dx]) || 0;
        const colEl = document.getElementById(`ct-${dataKey}-${mi}`);
        if (colEl) colEl.textContent = fmt(cTotal);

        let gTotal = 0;
        for (let j = 0; j < state.members.length; j++) {
          for (let dx = 0; dx < days; dx++) gTotal += Number(data[j][dx]) || 0;
        }
        const gtEl = document.getElementById(`gt-${dataKey}`);
        if (gtEl) gtEl.textContent = fmt(gTotal);

        showToast('Update saved');
      });

      const vu = el('span', { class: `verify-badge type-u ${vUser ? 'v-on' : ''}`, onclick: () => toggleVerify(mi, d, 'user', dataKey) }, 'U');
      const va = el('span', { class: `verify-badge type-a ${vAdmin ? 'v-on' : ''}`, onclick: () => toggleVerify(mi, d, 'admin', dataKey) }, 'A');
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
  state.members.forEach((member, mi) => {
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

  // First, render the base grid the same way it used to be rendered.
  renderDayGrid('#tab-meals', 'meals', 'Meal Tracking', 'Enter daily meal count for each member');

  // Then append Admin "Verify All" and "Clear All" buttons below it, if the user is an admin.
  if (isAdmin()) {
    const container = $('#tab-meals');

    // Meal Off checkboxes
    const offWrap = el('div', { class: 'table-wrap', style: 'padding: 16px; margin-top: 16px; margin-bottom: 24px;' });
    const offTitle = el('div', { style: 'font-weight:bold; margin-bottom:12px; font-size:14px; color:var(--text-primary)' }, '⚙️ Meal Off (Exempt from Auto 3)');
    const offGrid = el('div', { style: 'display:flex; flex-wrap:wrap; gap:16px;' });
    state.members.forEach((m, mi) => {
      const lbl = el('label', { style: 'display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; color:var(--text-secondary)' });
      const chk = el('input', { type: 'checkbox' });
      chk.checked = md.mealOff ? md.mealOff[mi] : false;
      chk.addEventListener('change', (e) => {
        if (!md.mealOff) md.mealOff = new Array(state.members.length).fill(false);
        md.mealOff[mi] = e.target.checked;
        save();
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
        const membersCount = state.members.length;
        let verifiedCount = 0;

        // Loop through all members and all days and verify ONLY inputted meals
        for (let mi = 0; mi < membersCount; mi++) {
          for (let d = 0; d < days; d++) {
            if (md.meals[mi][d] > 0) {
              md.vMealsAdmin[mi][d] = true;
              verifiedCount++;
            }
          }
        }

        save();
        renderAll();
        showToast(`Verified ${verifiedCount} inputted meals`, 'success');
      }
    }, '✅ Verify Inputted Meals');

    const clearBtn = el('button', {
      class: 'login-btn',
      style: 'max-width: 200px; background-color: #f44336;', // Red color for clear
      onclick: () => {
        const days = daysInMonth(state.currentMonth, state.currentYear);
        const membersCount = state.members.length;

        // Loop through all members and all days and clear admin verification
        for (let mi = 0; mi < membersCount; mi++) {
          for (let d = 0; d < days; d++) {
            md.vMealsAdmin[mi][d] = false;
          }
        }

        save();
        renderAll();
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
    state.members.forEach((m) => {
      const isSkipped = md.bazarSkip[m] || false;
      const chip = el('button', {
        class: `bazar-avail-chip ${isSkipped ? 'skipped' : 'active-chip'}`,
        onclick: () => { md.bazarSkip[m] = !md.bazarSkip[m]; save(); renderBazar(); }
      }, `${isSkipped ? '\u274c' : '\u2705'} ${m}`);
      availGrid.appendChild(chip);
    });
    availWrap.appendChild(availGrid);
    slotWrap.appendChild(availWrap);

    const availableMembers = state.members.filter(m => !md.bazarSkip[m]);
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
        save(); renderBazar();
        showToast(`Slots generated for ${n} members!`, 'success');
      }
    }, `\u2699\ufe0f Generate Slots (${days} days \u00f7 ${availableMembers.length} members)`);
    slotWrap.appendChild(genBtn);
  }

  if (md.bazarSlots && md.bazarSlots.length > 0) {
    const legend = el('div', { class: 'slot-legend' });
    state.members.forEach((m, mi) => {
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
        const mi = state.members.indexOf(assigned);
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
            state.members.forEach((m, idx) => {
              if (md.bazarSkip && md.bazarSkip[m]) return;
              content.appendChild(el('button', {
                class: 'btn-gradient', style: `margin-bottom:8px; background:${COLORS[idx % COLORS.length]}`,
                onclick: () => { md.bazarSlots[dayIdx] = m; save(); modal.remove(); renderBazar(); showToast(`Day ${dayIdx + 1} reassigned to ${m}`, 'success'); }
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
    const bd = getBDDate();
    const todayIdx = (state.currentYear === bd.year && state.currentMonth === bd.month) ? bd.day - 1 : -1;
    const todayMember = todayIdx >= 0 ? md.bazarSlots[todayIdx] : null;
    const tomorrowMember = (todayIdx >= 0 && todayIdx + 1 < days) ? md.bazarSlots[todayIdx + 1] : null;

    if (todayMember) {
      const msg1 = encodeURIComponent(`\ud83d\uded2 Hey ${todayMember}! Today is your bazar duty (Day ${todayIdx + 1}). Don't forget!`);
      waWrap.appendChild(el('a', { href: `https://wa.me/?text=${msg1}`, target: '_blank', class: 'btn-gradient wa-btn' }, `\ud83d\udce2 Today: ${todayMember}'s duty`));
    }
    if (tomorrowMember) {
      const msg2 = encodeURIComponent(`\ud83d\uded2 Hey ${tomorrowMember}! Tomorrow (Day ${todayIdx + 2}) is your bazar duty. Be ready!`);
      waWrap.appendChild(el('a', { href: `https://wa.me/?text=${msg2}`, target: '_blank', class: 'btn-gradient wa-btn' }, `\ud83d\udce2 Tomorrow: ${tomorrowMember}'s duty`));
    }

    // Meal reminder
    if (state.currentYear === bd.year && state.currentMonth === bd.month) {
      const currentMk = monthKey(state.currentMonth, state.currentYear);
      const currentMd = ensureMonthData(state, currentMk);
      const unenteredMembers = state.members.filter((m, mi) => {
        return currentMd.meals[mi] && (currentMd.meals[mi][bd.day - 1] === null || currentMd.meals[mi][bd.day - 1] === undefined);
      });
      if (unenteredMembers.length > 0) {
        const msg3 = encodeURIComponent(`\ud83c\udf7d\ufe0f Meal Reminder! ${unenteredMembers.join(', ')} \u2014 you haven't entered today's meal count. Update now!`);
        waWrap.appendChild(el('a', { href: `https://wa.me/?text=${msg3}`, target: '_blank', class: 'btn-gradient wa-btn wa-meal' }, `\ud83c\udf7d\ufe0f Meal reminder (${unenteredMembers.length} pending)`));
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

  target.innerHTML = '';
  const wrap = el('div', { class: 'table-wrap' },
    el('div', { class: 'table-title' }, title)
  );
  const scroll = el('div', { class: 'table-scroll' });
  const table = el('table');

  const thead = el('thead');
  const headRow = el('tr');
  headRow.appendChild(el('th', { style: 'position:sticky;left:0;z-index:3;background:var(--bg-secondary)' }, 'Day'));
  state.members.forEach(member => headRow.appendChild(el('th', { style: 'text-align:center' }, member)));
  headRow.appendChild(el('th', { style: 'text-align:center' }, 'Total'));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  const memberTotals = new Array(state.members.length).fill(0);
  let grandTotal = 0;

  for (let d = 0; d < days; d++) {
    const tr = el('tr');
    const dateObj = new Date(state.currentYear, state.currentMonth, d + 1);
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getDay()];
    tr.appendChild(el('td', { style: 'position:sticky;left:0;z-index:1;background:var(--bg-secondary);font-weight:bold; white-space:nowrap;' }, `${d + 1} ${dayName}`));

    let rowTotal = 0;
    state.members.forEach((member, mi) => {
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

      inp.addEventListener('change', (e) => {
        const raw = e.target.value.trim();
        const newVal = raw === '' ? '' : Number(raw);
        if (data[mi][d] === newVal) return;

        data[mi][d] = newVal;
        let tLabel = dataKey === 'bazar' ? 'Bazar' : 'Others';
        if (typeof logActivity === 'function') logActivity(`${currentUser} updated ${tLabel} for Day ${d + 1} (${member}) to ৳${newVal}`, member);

        _skipNextRender = true;
        const mk = monthKey(state.currentMonth, state.currentYear);
        const updates = { [`months/${mk}/${dataKey}/${mi}/${d}`]: newVal };
        if (isAdmin()) {
          const vAKey = dataKey === 'meals' ? 'vMealsAdmin' : (dataKey === 'bazar' ? 'vBazarAdmin' : 'vBazarOthersAdmin');
          if (md[vAKey]) {
            md[vAKey][mi][d] = true;
            updates[`months/${mk}/${vAKey}/${mi}/${d}`] = true;
          }
        }
        if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
        saveUpdates(updates);

        let rTotal = 0;
        for (let j = 0; j < state.members.length; j++) rTotal += Number(data[j][d]) || 0;
        const rowEl = document.getElementById(`rt-${dataKey}-${d}`);
        if (rowEl) rowEl.textContent = fmtTk(rTotal);

        let cTotal = 0;
        for (let dx = 0; dx < days; dx++) cTotal += Number(data[mi][dx]) || 0;
        const colEl = document.getElementById(`ct-${dataKey}-${mi}`);
        if (colEl) colEl.textContent = fmtTk(cTotal);

        let gTotal = 0;
        for (let j = 0; j < state.members.length; j++) {
          for (let dx = 0; dx < days; dx++) gTotal += Number(data[j][dx]) || 0;
        }
        const gtEl = document.getElementById(`gt-${dataKey}`);
        if (gtEl) gtEl.textContent = fmtTk(gTotal);

        showToast('Update saved');
      });

      const vu = el('span', { class: `verify-badge type-u ${vUser ? 'v-on' : ''}`, onclick: () => toggleVerify(mi, d, 'user', dataKey) }, 'U');
      const va = el('span', { class: `verify-badge type-a ${vAdmin ? 'v-on' : ''}`, onclick: () => toggleVerify(mi, d, 'admin', dataKey) }, 'A');
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
  state.members.forEach((member, mi) => {
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
    inp.addEventListener('change', e => {
      const raw = e.target.value.trim();
      const newVal = raw === '' ? '' : Number(raw);
      if (md.utilities[f.key] === newVal) return;
      md.utilities[f.key] = newVal;
      _skipNextRender = true;
      const mk = monthKey(state.currentMonth, state.currentYear);
      const updates = { [`months/${mk}/utilities/${f.key}`]: newVal };
      if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
      saveUpdates(updates);
      renderAll();
    });
    fg.appendChild(inp);

    // Status and Paid By
    const stRow = el('div', { class: 'form-row', style: 'margin-top:8px; display:flex; gap:6px;' });
    const isPaid = md.utilityStatus[f.key] === 'paid';
    const stBtn = el('button', {
      class: 'divide-select',
      style: `flex:1; background:${isPaid ? 'var(--green)' : 'var(--red)'}; color:#fff; font-weight:bold; border:none; padding:4px`,
      onclick: () => {
        if (!isAdmin()) { showToast('Admin only', 'error'); return; }
        md.utilityStatus[f.key] = isPaid ? 'unpaid' : 'paid';
        _skipNextRender = true;
        save();
        renderAll();
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
    pbInp.addEventListener('change', e => {
      md.utilityPaidBy[f.key] = e.target.value;
      _skipNextRender = true;
      save();
      renderAll();
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
      _skipNextRender = true;
      save();
      renderAll();
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
          state.members.forEach((m, mi) => {
            const row = el('div', { class: 'toggle-row' });
            const key = `${mi}_${f.key}`;
            const isExcluded = md.rentExclusions[key];
            const chk = el('input', { type: 'checkbox', checked: !isExcluded });
            chk.addEventListener('change', () => {
              if (chk.checked) delete md.rentExclusions[key];
              else md.rentExclusions[key] = true;
              save();
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
  const rentRows = calcRent(md, state.members);

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

    rentInp.addEventListener('change', e => {
      const raw = e.target.value.trim();
      const newVal = raw === '' ? '' : Number(raw);
      if (md.rent[i] === newVal) return;
      md.rent[i] = newVal;
      if (typeof logActivity === 'function') logActivity(`${currentUser} updated House Rent for ${r.name} to ৳${md.rent[i]}`, r.name);
      _skipNextRender = true;
      const mk = monthKey(state.currentMonth, state.currentYear);
      const updates = { [`months/${mk}/rent/${i}`]: newVal };
      if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
      saveUpdates(updates);
      renderAll();
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

    extraInp.addEventListener('change', e => {
      const raw = e.target.value.trim();
      const newVal = raw === '' ? '' : Number(raw);
      if (md.rentExtras[i] === newVal) return;
      md.rentExtras[i] = newVal;
      if (typeof logActivity === 'function') logActivity(`${currentUser} updated Utilities Extra for ${r.name} to ৳${md.rentExtras[i]}`, r.name);
      _skipNextRender = true;
      const mk = monthKey(state.currentMonth, state.currentYear);
      const updates = { [`months/${mk}/rentExtras/${i}`]: newVal };
      if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
      saveUpdates(updates);
      renderAll();
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

    paidInp.addEventListener('change', e => {
      const raw = e.target.value.trim();
      const newVal = raw === '' ? '' : Number(raw);
      if (md.rentPaid[i] === newVal) return;
      md.rentPaid[i] = newVal;
      if (typeof logActivity === 'function') logActivity(`${currentUser} updated Rent Paid for ${r.name} to ৳${md.rentPaid[i]}`, r.name);
      _skipNextRender = true;
      const mk = monthKey(state.currentMonth, state.currentYear);
      const updates = { [`months/${mk}/rentPaid/${i}`]: newVal };
      if (typeof logActivity === 'function') updates['logs'] = state.logs || [];
      saveUpdates(updates);
      renderAll();
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
  const canSeeAll = isAdmin() || historyUnlocked;
  container.innerHTML = '';
  container.appendChild(el('div', { class: 'page-header' },
    el('h2', {}, 'Balance History'),
    el('p', {}, canSeeAll ? 'Full view — all members' : 'Showing your history only. Enter admin password to see all.')
  ));

  if (!isAdmin() && !historyUnlocked) {
    const bar = el('div', { class: 'login-card', style: 'width:100%;padding:20px;display:flex;gap:10px;margin-bottom:20px' },
      el('span', {}, '🔒 Unlock All:'),
      el('input', { type: 'password', id: 'histUnlockPass', placeholder: 'Admin pass...' }),
      el('button', {
        class: 'unlock-btn', onclick: () => {
          if ($('#histUnlockPass').value === getPasswords()['ALIF']) { historyUnlocked = true; renderHistory(); }
          else showToast('Wrong password', 'error');
        }
      }, 'Unlock')
    );
    container.appendChild(bar);
  }

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

  const tbody = el('tbody');
  state.members.forEach((member, mi) => {
    if (!canSeeAll && member !== currentUser) return;
    const tr = el('tr');
    const nameCell = el('td');
    nameCell.appendChild(el('div', { class: 'name-cell' }, avatar(member, mi), member));
    tr.appendChild(nameCell);

    let total = 0;
    monthKeys.forEach(mk => {
      const md = ensureMonthData(state, mk);
      const { results } = calcReport(md, state.members);
      const r = results[mi];
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
  state.members.forEach((member, mi) => {
    if (!canSeeAll && member !== currentUser) return;
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
    balInp.addEventListener('change', e => {
      md.historyBalances[mi] = parseFloat(e.target.value) || 0;
      save();
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
      save();
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
    inputs[member] = inp;
    fg.appendChild(inp);
    grid.appendChild(fg);
  });

  container.appendChild(grid);

  const saveBtn = el('button', {
    class: 'btn',
    style: 'margin-top: 20px; padding: 10px 20px; background-color: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;',
    onclick: () => {
      let changed = false;
      state.members.forEach(member => {
        const newVal = inputs[member].value;
        if (passwords[member] !== newVal) {
          passwords[member] = newVal;
          changed = true;
        }
      });

      if (changed) {
        savePasswords(passwords);
        showToast('Passwords saved successfully!', 'success');
      } else {
        showToast('No changes to save.', 'info');
      }
    }
  }, '💾 Save Passwords');

  container.appendChild(saveBtn);
}

// ── Management Tab ──
function renderMgmt() {
  const container = $('#tab-mgmt');
  container.innerHTML = '';
  if (!isAdmin()) { container.appendChild(el('div', { class: 'table-wrap', style: 'padding:20px;text-align:center;color:var(--text-muted)' }, '🔒 Admin access only.')); return; }

  container.appendChild(el('div', { class: 'page-header' }, el('h2', {}, '🛠️ System Management'), el('p', {}, 'Configure mess settings and backup data')));

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

  // Member management
  container.appendChild(el('div', { class: 'section-heading' }, '👥 Member List'));
  const mWrap = el('div', { class: 'table-wrap' });
  const mTbody = el('tbody');
  state.members.forEach((m, i) => {
    const tr = el('tr');
    tr.appendChild(el('td', { style: 'width:40px' }, avatar(m, i)));
    tr.appendChild(el('td', { style: 'font-weight:600' }, m));
    const delTd = el('td', { style: 'text-align:right' });
    if (m !== 'ALIF') {
      delTd.appendChild(el('button', { class: 'logout-btn', style: 'padding:4px 8px', onclick: () => removeMember(m) }, 'Remove'));
    }
    tr.appendChild(delTd);
    mTbody.appendChild(tr);
  });
  const table = el('table', {}, mTbody);
  mWrap.appendChild(table);

  const addBox = el('div', { style: 'padding:16px; display:flex; gap:8px; border-top:1px solid var(--border)' },
    el('input', { type: 'text', id: 'newMemberName', placeholder: 'Name...' }),
    el('button', { class: 'login-btn', style: 'width:auto', onclick: addMember }, 'Add Member')
  );
  mWrap.appendChild(addBox);
  container.appendChild(mWrap);
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
    state = data.state; save();
    savePasswords(data.passwords);
    location.reload();
  };
  reader.readAsText(e.target.files[0]);
}

function resetAllData() {
  if (confirm('Delete all records?')) { state = defaultState(); save(); location.reload(); }
}

function addMember() {
  const name = $('#newMemberName').value.trim().toUpperCase();
  if (!name || state.members.includes(name)) return;
  state.members.push(name);
  const pw = getPasswords(); pw[name] = '1234'; savePasswords(pw);
  save(); renderAll();
}

function removeMember(name) {
  if (confirm(`Remove ${name}?`)) { state.members = state.members.filter(m => m !== name); save(); renderAll(); }
}

function renderAll() {
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

  renderDashboard();
  if (activeTabContent && activeTabContent.id === 'tab-meals') renderMeals();
  if (activeTabContent && activeTabContent.id === 'tab-bazar') renderBazar();
  if (activeTabContent && activeTabContent.id === 'tab-rent') renderRent();
  if (activeTabContent && activeTabContent.id === 'tab-history') renderHistory();
  if (activeTabContent && activeTabContent.id === 'tab-chat') renderChat();
  if (activeTabContent && activeTabContent.id === 'tab-admin') renderAdmin();
  if (activeTabContent && activeTabContent.id === 'tab-mgmt') renderMgmt();

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
  const days = daysInMonth(state.currentMonth, state.currentYear);
  const { results, grandTotalMeals, grandTotalBazar, grandTotalOthers, perMealRate } = calcReport(md, state.members);

  const wb = XLSX.utils.book_new();

  // 1. Meals Sheet
  const mealData = [["Day", ...state.members, "Total"]];
  const mealTotals = new Array(state.members.length).fill(0);
  let mealGrand = 0;
  for (let d = 0; d < days; d++) {
    const row = [d + 1];
    let rTotal = 0;
    state.members.forEach((m, mi) => {
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
  const bazarData = [["Day", ...state.members, "Total Bazar", "Day", ...state.members, "Total Others"]];
  const bazarTotals = new Array(state.members.length).fill(0);
  const othersTotals = new Array(state.members.length).fill(0);
  let bGrand = 0, oGrand = 0;
  for (let d = 0; d < days; d++) {
    const row = [d + 1];
    let brTotal = 0;
    state.members.forEach((m, mi) => {
      const v = md.bazar[mi][d] || 0;
      row.push(v);
      brTotal += v;
      bazarTotals[mi] += v;
    });
    bGrand += brTotal;
    row.push(brTotal);

    row.push(d + 1);
    let orTotal = 0;
    state.members.forEach((m, mi) => {
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
  const rentRows = calcRent(md, state.members);
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

  // 2. Meal Auto-Default
  const mk = monthKey(state.currentMonth, state.currentYear);
  const md = ensureMonthData(state, mk);

  if (state.currentYear === bd.year && state.currentMonth === bd.month) {
    const alifIdx = state.members.indexOf('ALIF');
    for (let mi = 0; mi < state.members.length; mi++) {
      if (mi === alifIdx) continue;
      if (md.mealOff && md.mealOff[mi]) continue;

      for (let d = 0; d < bd.day - 1; d++) {
        // Only auto-fill null (un-entered) meals to 3.
        // Explicit 0 means "no meal" and is preserved.
        if (md.meals[mi][d] === null || md.meals[mi][d] === undefined) {
          md.meals[mi][d] = 3;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    save();
    renderAll();
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
    state.members.forEach(m => filterSelect.appendChild(el('option', { value: m }, m)));
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
          _skipNextRender = true; save(); renderMessages();
        } }, emoji));
      });

      if (isAdmin()) {
        const isPinned = (state.chatPinned || []).includes(msg.id);
        actions.appendChild(el('button', { class: `chat-action-btn ${isPinned ? 'pinned' : ''}`, title: isPinned ? 'Unpin' : 'Pin', onclick: () => {
          if (!state.chatPinned) state.chatPinned = [];
          const pi = state.chatPinned.indexOf(msg.id);
          if (pi >= 0) state.chatPinned.splice(pi, 1); else state.chatPinned.push(msg.id);
          save(); renderPinned(); renderMessages();
        } }, '📌'));
      }

      if (isSelf || isAdmin()) {
        actions.appendChild(el('button', { class: 'chat-action-btn del', title: 'Delete', onclick: () => {
          if (!confirm('Delete this message?')) return;
          state.chat = state.chat.filter(m => m.id !== msg.id);
          if (state.chatPinned) state.chatPinned = state.chatPinned.filter(id => id !== msg.id);
          save(); renderMessages(); renderPinned();
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
    save(); renderMessages(); renderPinned(); updateReplyPreview();
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
renderAll();
