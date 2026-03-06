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
  return day < bd.day;
}

function canEditRecord(memberIdx, day) {
  if (isAdmin()) return true;
  if (state.members[memberIdx] !== currentUser) return false;
  if (isDatePassed(day, state.currentMonth, state.currentYear)) return false;
  return true;
}

function canVerifyRecord(day, month, year) {
  const bd = getBDDate();
  const now = new Date(bd.year, bd.month, bd.day);
  const entryDate = new Date(year, month, day);
  const diffTime = now - entryDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 0 || diffDays === 1;
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
      meals: Array.from({ length: n }, () => new Array(31).fill(0)),
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
      rent: st.members.map(m => DEFAULT_RENT[m] || 0),
      rentPaid: new Array(n).fill(0),
      rentExclusions: {}, // { "memberIdx_utilityKey": true }
      rentExtras: new Array(n).fill(0),
      bazarSlots: [], // array of length = days, each entry = member name
      historyBalances: new Array(n).fill(0),
      historyStatus: new Array(n).fill(''),
    };
    UTILITY_FIELDS.forEach(f => {
      st.months[mk].utilities[f.key] = DEFAULT_UTILITIES[f.key] || 0;
      st.months[mk].utilityDivisors[f.key] = f.divideBy;
    });
  }
  const md = st.months[mk];
  const n = st.members.length;
  ['meals', 'bazar', 'bazarOthers'].forEach(k => {
    if (!Array.isArray(md[k])) md[k] = Object.values(md[k] || {});
    while (md[k].length < n) md[k].push(new Array(31).fill(0));
    for (let i = 0; i < md[k].length; i++) {
      if (!Array.isArray(md[k][i])) {
        const obj = md[k][i] || {};
        md[k][i] = new Array(31).fill(0);
        Object.keys(obj).forEach(idx => { md[k][i][+idx] = Number(obj[idx]) || 0; });
      } else {
        while (md[k][i].length < 31) md[k][i].push(0);
        for (let d = 0; d < 31; d++) {
          if (md[k][i][d] === undefined || md[k][i][d] === null) md[k][i][d] = 0;
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
  if (!md.rentExtras) md.rentExtras = new Array(n).fill(0);
  while (md.rentExtras.length < n) md.rentExtras.push(0);
  if (!md.bazarSlots) md.bazarSlots = [];
  while (md.historyBalances.length < n) md.historyBalances.push(0);
  while (md.historyStatus.length < n) md.historyStatus.push('');
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

function save() {
  localStorage.setItem('messManagerState', JSON.stringify(state));
  if (_saveTimer) clearTimeout(_saveTimer);
  _skipNextRender = true;
  _saveTimer = setTimeout(() => {
    const payload = Object.assign({}, state);
    delete payload.passwords;

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
  container.appendChild(el('div', { class: 'page-header' },
    el('h2', {}, `Final Report — ${MONTH_NAMES[state.currentMonth]} ${state.currentYear}`),
    el('p', {}, 'Monthly meal & bazar cost summary with auto-calculated balances')
  ));

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
  headRow.appendChild(el('th', { style: 'position:sticky;left:0;z-index:3;background:var(--bg-secondary)' }, 'Member'));
  for (let d = 1; d <= days; d++) headRow.appendChild(el('th', {}, String(d)));
  headRow.appendChild(el('th', {}, 'Total'));
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Body
  const tbody = el('tbody');
  const colTotals = new Array(days).fill(0);
  let grandTotal = 0;

  state.members.forEach((member, mi) => {
    const tr = el('tr');
    const nameCell = el('td', { style: 'position:sticky;left:0;z-index:1;background:var(--bg-card)' });
    nameCell.appendChild(el('div', { class: 'name-cell' }, avatar(member, mi), member));
    tr.appendChild(nameCell);

    let rowTotal = 0;
    for (let d = 0; d < days; d++) {
      const val = data[mi][d] || 0;
      rowTotal += val;
      colTotals[d] += val;

      const vUser = md.vMealsUser[mi][d], vAdmin = md.vMealsAdmin[mi][d];
      const fullyVerified = vUser && vAdmin;

      const inp = el('input', {
        type: 'number',
        class: 'grid-input',
        value: val || '',
        min: '0',
        disabled: !canEditRecord(mi, d + 1) || (fullyVerified && !isAdmin())
      });
      inp.addEventListener('change', (e) => {
        data[mi][d] = parseFloat(e.target.value) || 0;
        save();
        renderAll();
        showToast('Update saved');
      });

      const vu = el('span', { class: `verify-badge type-u ${vUser ? 'v-on' : ''}`, onclick: () => toggleVerify(mi, d, 'user', dataKey) }, 'U');
      const va = el('span', { class: `verify-badge type-a ${vAdmin ? 'v-on' : ''}`, onclick: () => toggleVerify(mi, d, 'admin', dataKey) }, 'A');
      const vRow = el('div', { class: 'verification-row' }, vu, va);

      const td = el('td', { class: fullyVerified ? 'cell-fully-verified' : '' }, inp, vRow);
      tr.appendChild(td);
    }
    grandTotal += rowTotal;
    tr.appendChild(el('td', { class: 'calc-cell' }, fmt(rowTotal)));
    tbody.appendChild(tr);
  });

  // Grand total row
  const gt = el('tr', { class: 'grand-total-row' });
  gt.appendChild(el('td', { style: 'position:sticky;left:0;z-index:1;background:var(--bg-secondary)' }, 'Grand Total'));
  for (let d = 0; d < days; d++) {
    gt.appendChild(el('td', { class: 'calc-cell' }, fmt(colTotals[d])));
  }
  gt.appendChild(el('td', { class: 'calc-cell', style: 'font-weight:800' }, fmt(grandTotal)));
  tbody.appendChild(gt);

  table.appendChild(tbody);
  scroll.appendChild(table);
  wrap.appendChild(scroll);
  container.appendChild(wrap);
}

// ── Render: Meals Tab ──
function renderMeals() {
  renderDayGrid('#tab-meals', 'meals', 'Meal Tracking', 'Enter daily meal count for each member');
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
  container.appendChild(el('div', { class: 'section-heading' }, '\ud83d\udcc5 Bazar Duty Slots'));
  const slotWrap = el('div', { class: 'table-wrap', style: 'padding:18px' });

  if (isAdmin()) {
    const genBtn = el('button', {
      class: 'login-btn', style: 'margin-bottom:16px;max-width:300px',
      onclick: () => {
        const n = state.members.length;
        const base = Math.floor(days / n);
        const remainder = days % n;
        const slots = [];
        let alifIdx = state.members.indexOf('ALIF');
        if (alifIdx < 0) alifIdx = 0;
        state.members.forEach((m, mi) => {
          const count = base + (mi === alifIdx ? remainder : 0);
          for (let j = 0; j < count; j++) slots.push(m);
        });
        md.bazarSlots = slots;
        save();
        renderBazar();
        showToast(`Slots generated! ALIF gets ${base + remainder} days, others get ${base}.`, 'success');
      }
    }, `\u2699\ufe0f Generate Slots (${days} days \u00f7 ${state.members.length} members)`);
    slotWrap.appendChild(genBtn);
  }

  if (md.bazarSlots && md.bazarSlots.length > 0) {
    const legend = el('div', { class: 'slot-legend' });
    state.members.forEach((m, mi) => {
      const count = md.bazarSlots.filter(s => s === m).length;
      const dot = el('div', { class: 'slot-legend-item' });
      dot.appendChild(el('span', { class: 'slot-dot', style: `background:${COLORS[mi % COLORS.length]}` }));
      dot.appendChild(el('span', {}, `${m} (${count}d)`));
      legend.appendChild(dot);
    });
    slotWrap.appendChild(legend);

    const calBar = el('div', { class: 'slot-calendar' });
    for (let d = 0; d < days; d++) {
      ((dayIdx) => {
        const assigned = md.bazarSlots[dayIdx] || '?';
        const mi = state.members.indexOf(assigned);
        const color = mi >= 0 ? COLORS[mi % COLORS.length] : '#555';
        const dayEl = el('div', {
          class: 'slot-day',
          style: `background:${color}22; border-color:${color}`,
          title: `Day ${dayIdx + 1}: ${assigned}`
        });
        dayEl.appendChild(el('span', { class: 'slot-day-num' }, String(dayIdx + 1)));
        dayEl.appendChild(el('span', { class: 'slot-day-name' }, assigned.substring(0, 3)));
        if (isAdmin()) {
          dayEl.style.cursor = 'pointer';
          dayEl.addEventListener('click', () => {
            const modal = el('div', { class: 'modal-overlay' });
            const content = el('div', { class: 'modal-content' });
            content.appendChild(el('h3', { style: 'margin-bottom:12px' }, `Day ${dayIdx + 1} \u2014 Reassign`));
            state.members.forEach((m, idx) => {
              content.appendChild(el('button', {
                class: 'login-btn',
                style: `margin-bottom:8px; background:${COLORS[idx % COLORS.length]}`,
                onclick: () => {
                  md.bazarSlots[dayIdx] = m;
                  save();
                  modal.remove();
                  renderBazar();
                  showToast(`Day ${dayIdx + 1} reassigned to ${m}`, 'success');
                }
              }, m));
            });
            content.appendChild(el('button', { class: 'mini-btn', style: 'margin-top:12px;width:100%', onclick: () => modal.remove() }, 'Cancel'));
            modal.appendChild(content);
            document.body.appendChild(modal);
          });
        }
        calBar.appendChild(dayEl);
      })(d);
    }
    slotWrap.appendChild(calBar);
  } else {
    slotWrap.appendChild(el('p', { style: 'color:var(--text-secondary);font-size:13px' }, isAdmin() ? 'Click the button above to generate bazar duty slots for this month.' : 'Admin has not generated bazar duty slots yet.'));
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
  headRow.appendChild(el('th', { style: 'position:sticky;left:0;z-index:3;background:var(--bg-secondary)' }, 'Member'));
  for (let d = 1; d <= days; d++) headRow.appendChild(el('th', {}, String(d)));
  headRow.appendChild(el('th', {}, 'Total'));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  const colTotals = new Array(days).fill(0);
  let grandTotal = 0;

  state.members.forEach((member, mi) => {
    const tr = el('tr');
    const nameCell = el('td', { style: 'position:sticky;left:0;z-index:1;background:var(--bg-card)' });
    nameCell.appendChild(el('div', { class: 'name-cell' }, avatar(member, mi), member));
    tr.appendChild(nameCell);

    let rowTotal = 0;
    for (let d = 0; d < days; d++) {
      const val = data[mi][d] || 0;
      rowTotal += val;
      colTotals[d] += val;

      const vUKey = dataKey === 'bazar' ? 'vBazarUser' : 'vBazarOthersUser';
      const vAKey = dataKey === 'bazar' ? 'vBazarAdmin' : 'vBazarOthersAdmin';
      const vUser = md[vUKey][mi][d], vAdmin = md[vAKey][mi][d];
      const fullyVerified = vUser && vAdmin;

      const inp = el('input', {
        type: 'number',
        class: 'grid-input',
        value: val || '',
        min: '0',
        disabled: !canEditRecord(mi, d + 1) || (fullyVerified && !isAdmin())
      });
      inp.addEventListener('change', (e) => {
        data[mi][d] = parseFloat(e.target.value) || 0;
        save();
        renderAll();
        showToast('Update saved');
      });

      const vu = el('span', { class: `verify-badge type-u ${vUser ? 'v-on' : ''}`, onclick: () => toggleVerify(mi, d, 'user', dataKey) }, 'U');
      const va = el('span', { class: `verify-badge type-a ${vAdmin ? 'v-on' : ''}`, onclick: () => toggleVerify(mi, d, 'admin', dataKey) }, 'A');
      const vRow = el('div', { class: 'verification-row' }, vu, va);

      const td = el('td', { class: fullyVerified ? 'cell-fully-verified' : '' }, inp, vRow);
      tr.appendChild(td);
    }
    grandTotal += rowTotal;
    tr.appendChild(el('td', { class: 'calc-cell' }, fmtTk(rowTotal)));
    tbody.appendChild(tr);
  });

  const gt = el('tr', { class: 'grand-total-row' });
  gt.appendChild(el('td', { style: 'position:sticky;left:0;z-index:1;background:var(--bg-secondary)' }, 'Grand Total'));
  for (let d = 0; d < days; d++) {
    gt.appendChild(el('td', { class: 'calc-cell' }, fmtTk(colTotals[d])));
  }
  gt.appendChild(el('td', { class: 'calc-cell', style: 'font-weight:800' }, fmtTk(grandTotal)));
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
      type: 'number',
      value: md.utilities[f.key] || '',
      placeholder: '0'
    });
    inp.addEventListener('change', e => {
      md.utilities[f.key] = parseFloat(e.target.value) || 0;
      save();
      renderRent();
    });
    fg.appendChild(inp);

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
      save();
      renderRent();
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
      type: 'number',
      class: 'grid-input wide',
      value: r.rent || '',
      placeholder: '0',
      disabled: !isAdmin()
    });
    rentInp.addEventListener('change', e => {
      md.rent[i] = parseFloat(e.target.value) || 0;
      save();
      renderRent();
    });
    tr.appendChild(el('td', {}, rentInp));

    const extraInp = el('input', {
      type: 'number',
      class: 'grid-input wide',
      value: r.extra || '',
      placeholder: '0',
      disabled: !isAdmin()
    });
    extraInp.addEventListener('change', e => {
      md.rentExtras[i] = parseFloat(e.target.value) || 0;
      save();
      renderRent();
    });
    tr.appendChild(el('td', {}, extraInp));

    tr.appendChild(el('td', { class: 'calc-cell', style: 'font-weight:700' }, fmtTk(r.total)));
    sumTotal += r.total;

    const paidInp = el('input', {
      type: 'number',
      class: 'grid-input wide',
      value: r.paid || '',
      placeholder: '0',
      disabled: !isAdmin()
    });
    paidInp.addEventListener('change', e => {
      md.rentPaid[i] = parseFloat(e.target.value) || 0;
      save();
      renderRent();
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
  renderDashboard();
  renderMeals();
  renderBazar();
  renderRent();
  renderHistory();
  renderAdmin();
  renderMgmt();
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
renderAll();
