/* =========================================================
   EHSEBLI / HONDA FINANCIAL MANAGER V11.6
   Fixed initTheme + Clean Event Handlers + Instant Triggers
   ========================================================= */

const SUPER_ADMIN_EMAILS = ['hondastore299@gmail.com'];

const firebaseConfig = {
  apiKey: "AIzaSyAlPUHguP1juNajN0Y9dM3CFAJ-48Hlr0Y",
  authDomain: "a7sble.firebaseapp.com",
  databaseURL: "https://a7sble-default-rtdb.firebaseio.com",
  projectId: "a7sble",
  storageBucket: "a7sble.firebasestorage.app",
  messagingSenderId: "66680366908",
  appId: "1:66680366908:web:cc82925437e02156b42039",
  measurementId: "G-RKCDDTFGR4"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

const STORAGE_KEY = 'ehsebli_honda_data_v2';
const THEME_KEY = 'ehsebli_theme_v2';
const BUDGET_KEY = 'ehsebli_budget_v2';
const PIN_KEY = 'ehsebli_pin_v2';
const PRIVACY_KEY = 'ehsebli_privacy_v1';
const LAST_UID_KEY = 'ehsebli_last_uid';

let currentUser = null;
let transactions = [];
let activeFilter = 'all';
let currentPeriod = 'all';
let customStartDateVal = '';
let customEndDateVal = '';
let currentTab = 'transactions';
let editingId = null;
let userRole = 'free';
let isSuperAdmin = false;
let isPrivacyMode = false;
let partialPaymentDebtId = null;
let currentReceiptData = null;
let activeClientName = null;
let isPortalModeActive = false;
let searchDebounceTimer = null;
let authResolved = false;
let transactionsUnsubscribe = null;

const ROLES_META = {
  free: { name: 'مجاني', icon: 'fa-user', badgeClasses: 'bg-slate-500/10 border-slate-500/30 text-slate-400' },
  admin: { name: 'مدير', icon: 'fa-shield-halved', badgeClasses: 'bg-rose-500/10 border-rose-500/30 text-rose-400' }
};

let rolePermissions = {
  free: { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true },
  admin: { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true }
};

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function yesterdayString() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function currentInputTimeString() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatTimeTo12Hour(timeStr) {
  if (!timeStr) return '';
  if (/am|pm/i.test(timeStr)) return timeStr;
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  const m = parts[1].slice(0, 2);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
}
function format12To24(time12) {
  if (!time12) return currentInputTimeString();
  const match = time12.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return time12;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
}
function offsetDate(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function money(value) { return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function escapeHTML(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function sanitizeString(str, maxLength = 500) {
  return String(str || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLength).trim();
}
function isDebt(type) { return String(type || '').startsWith('debt_'); }
function typeName(type) {
  return ({ income:'دخل', expense:'مصروف', charity:'باب الخير', debt_receivable:'دين ليا', debt_payable:'دين عليا' })[type] || type;
}
function getActiveTransactions() { return transactions.filter(t => !t._deleted); }
function isSuperAdminEmail(email) {
  return SUPER_ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(String(email || '').toLowerCase().trim());
}

function validateTransaction(t) {
  if (!t || typeof t !== 'object') return false;
  if (!t.id || typeof t.id !== 'string') return false;
  if (!['income','expense','charity','debt_receivable','debt_payable'].includes(t.type)) return false;
  const amt = Number(t.amount);
  if (!isFinite(amt) || amt <= 0 || amt > 1e9) return false;
  if (!t.date || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return false;
  return true;
}

function normalizeTransaction(t) {
  return {
    id: String(t.id || ('tx-' + Date.now())).slice(0, 100),
    type: t.type,
    amount: Math.min(Math.max(Number(t.amount) || 0, 0), 1e9),
    paidAmount: Number(t.paidAmount) || 0,
    date: t.date || todayString(),
    time: sanitizeString(t.time || formatTimeTo12Hour(currentInputTimeString()), 20),
    client: sanitizeString(t.client || '', 60),
    category: sanitizeString(t.category || 'عام', 100),
    paymentMethod: sanitizeString(t.paymentMethod || 'كاش نقدي', 50),
    reference: sanitizeString(t.reference || '', 50),
    notes: sanitizeString(t.notes || '', 200),
    receipt: t.receipt || null,
    status: (t.status === 'paid' || t.status === 'pending') ? t.status : null,
    _deleted: t._deleted === true,
    _updatedAt: Number(t._updatedAt) || Date.now()
  };
}

const CATEGORIES = {
  expense: ['شغل وأدوات صيانة','تفعيل وسيرفرات وكريدت','أكل ومشروبات','مواصلات وبنزين','فواتير والتزامات','شخصي وعائلة','مشتريات','أخرى'],
  income: ['خدمات سوفت وير وصيانة','شحن رصيد وتفعيل أدوات','شغل ريموت أونلاين','مبيعات إكسسوار وأجهزة','عمولة / وسيط','أرباح أخرى'],
  charity: ['صدقة جارية لوجه الله','مساعدة محتاج وتفريج كربة','إطعام طعام','بر والدين وأهل','زكاة مال','أخرى'],
  debt_receivable: ['حساب محل صيانة','سلف شخصي لصديق','باقي خدمة لعميل','مبيعات آجلة','أخرى'],
  debt_payable: ['دين لمورد / موزّع سيرفر','سلف مستحق للغير','فاتورة مؤجلة','شراء آجل','أخرى']
};

/* دوال الثيم المفقودة التي كانت تسبب الـ ReferenceError */
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  const icon = document.getElementById('themeIcon');
  const text = document.getElementById('themeText');
  if (icon && text) {
    if (isDark) { icon.className = 'fa-solid fa-sun text-amber-500'; text.textContent = 'الوضع النهاري'; }
    else { icon.className = 'fa-solid fa-moon text-slate-700'; text.textContent = 'الوضع الليلي'; }
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

/* فتح المودال لإضافة عملية جديدة فوراً */
function openModal(type = 'expense', id = null) {
  const modal = document.getElementById('transactionModal');
  const form = document.getElementById('transactionForm');
  if (!modal) return;

  editingId = id;
  form?.reset();
  currentReceiptData = null;

  const formDate = document.getElementById('formDate');
  if (formDate) formDate.value = todayString();
  const formTime = document.getElementById('formTime');
  if (formTime) formTime.value = currentInputTimeString();
  
  updateClientsDatalist();

  if (id) {
    const item = transactions.find(t => t.id === id);
    if (!item) return;
    const radio = document.querySelector(`input[name="txType"][value="${item.type}"]`);
    if (radio) radio.checked = true;
    onTypeChange();
    document.getElementById('formAmount').value = item.amount;
    document.getElementById('formDate').value = item.date;
    document.getElementById('formTime').value = format12To24(item.time);
    document.getElementById('formClient').value = item.client || '';
    document.getElementById('formCategory').value = item.category;
    document.getElementById('formPaymentMethod').value = item.paymentMethod || 'كاش نقدي';
    document.getElementById('formNotes').value = item.notes || '';
    document.getElementById('submitText').textContent = 'حفظ التعديل';
  } else {
    const radio = document.querySelector(`input[name="txType"][value="${type}"]`);
    if (radio) radio.checked = true;
    onTypeChange();
    document.getElementById('submitText').textContent = 'حفظ العملية';
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => document.getElementById('formAmount')?.focus(), 100);
}

function closeModal() {
  const modal = document.getElementById('transactionModal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
  editingId = null;
}

function onTypeChange() {
  const selected = document.querySelector('input[name="txType"]:checked');
  if (!selected) return;
  const type = selected.value;
  const select = document.getElementById('formCategory');
  const title = document.getElementById('modalTitle');

  if (select) {
    select.innerHTML = '';
    (CATEGORIES[type] || ['عام']).forEach(c => {
      const option = document.createElement('option');
      option.value = c; option.textContent = c;
      select.appendChild(option);
    });
  }

  if (title) {
    if (type === 'charity') title.textContent = 'تسجيل صدقة أو عمل خير';
    else if (type === 'income') title.textContent = 'تسجيل دخل / إيراد جديد';
    else if (type === 'debt_receivable') title.textContent = 'تسجيل دين مستحق لي';
    else if (type === 'debt_payable') title.textContent = 'تسجيل دين مستحق عليّ';
    else title.textContent = 'تسجيل مصروف جديد';
  }
}

function handleFormSubmit(event) {
  event.preventDefault();
  const wasEditing = !!editingId;

  const type = document.querySelector('input[name="txType"]:checked')?.value || 'expense';
  const amount = Number(document.getElementById('formAmount')?.value);
  const date = document.getElementById('formDate')?.value;
  const timeInput = document.getElementById('formTime')?.value;
  const time = formatTimeTo12Hour(timeInput || currentInputTimeString());
  const client = sanitizeString(document.getElementById('formClient')?.value, 60);
  const category = document.getElementById('formCategory')?.value || 'عام';
  const paymentMethod = document.getElementById('formPaymentMethod')?.value || 'كاش نقدي';
  const notes = sanitizeString(document.getElementById('formNotes')?.value, 200);

  if (!amount || amount <= 0) { showToast('يرجى إدخال مبلغ صحيح', 'error'); return; }

  if (wasEditing) {
    const index = transactions.findIndex(t => t.id === editingId);
    if (index !== -1) {
      transactions[index] = normalizeTransaction({
        ...transactions[index], type, amount, date, time, client, category, paymentMethod, notes, _updatedAt: Date.now()
      });
      showToast('تم التعديل بنجاح', 'success');
    }
  } else {
    transactions.unshift(normalizeTransaction({
      id: 'tx-' + Date.now(),
      type, amount, date, time, client, category, paymentMethod, notes,
      _updatedAt: Date.now()
    }));
    showToast('تمت الإضافة بنجاح ✓', 'success');
  }

  saveData();
  refreshAll();
  closeModal();
}

function initPrivacyMode() { isPrivacyMode = localStorage.getItem(PRIVACY_KEY) === 'true'; applyPrivacyModeUI(); }
function togglePrivacyMode() {
  isPrivacyMode = !isPrivacyMode;
  localStorage.setItem(PRIVACY_KEY, isPrivacyMode);
  applyPrivacyModeUI();
}
function applyPrivacyModeUI() {
  document.body.classList.toggle('privacy-active', isPrivacyMode);
}

function updateClientsDatalist() {
  const dl = document.getElementById('clientsDatalist');
  if (!dl) return;
  dl.innerHTML = '';
  getAllClientNames().forEach(c => { const opt = document.createElement('option'); opt.value = c; dl.appendChild(opt); });
}
function getAllClientNames() {
  const set = new Set();
  getActiveTransactions().forEach(t => { if (t.client && t.client.trim()) set.add(t.client.trim()); });
  return Array.from(set).sort();
}

async function checkPublicPortalMode() { return false; }

function hasFeature() { return true; }
function applyRoleUI() {}
async function loadUserRole() {}

function showAuthLoading() {
  const splash = document.getElementById('splashScreen');
  if (splash) { splash.style.display = 'flex'; splash.style.opacity = '1'; }
}
function hideAuthLoading() {
  const splash = document.getElementById('splashScreen');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => { splash.style.display = 'none'; }, 400);
  }
}
function showLoginWall() {
  document.body.classList.add('not-authed');
  document.getElementById('loginWall')?.classList.remove('hidden');
  document.getElementById('loginWall')?.classList.add('flex');
}
function hideLoginWall() {
  document.body.classList.remove('not-authed');
  document.getElementById('loginWall')?.classList.add('hidden');
  document.getElementById('loginWall')?.classList.remove('flex');
}

auth.onAuthStateChanged(user => {
  hideAuthLoading();
  authResolved = true;
  if (user) {
    currentUser = user;
    hideLoginWall();
    document.getElementById('cloudStatus')?.classList.remove('hidden');
    document.getElementById('cloudStatus')?.classList.add('flex');
    document.getElementById('syncUserEmail').textContent = user.email || 'مستخدم';
    loadLocalData();
    refreshAll();
    switchTab('transactions');
  } else {
    currentUser = null;
    showLoginWall();
    loadLocalData();
  }
});

function loginWithGoogle() {
  auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => showToast(e.message, 'error'));
}
function logout() { auth.signOut(); }

function loadLocalData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    transactions = saved ? JSON.parse(saved).map(normalizeTransaction) : [];
  } catch(e) { transactions = []; }
}
function saveLocalData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }
function saveData() { saveLocalData(); }

function setPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.period === period));
  refreshAll();
}
function applyCustomDates() { refreshAll(); }

function isInPeriod(dateString) {
  if (currentPeriod === 'all') return true;
  if (currentPeriod === 'today') return dateString === todayString();
  if (currentPeriod === 'yesterday') return dateString === yesterdayString();
  return true;
}
function getPeriodTransactions() { return getActiveTransactions().filter(t => isInPeriod(t.date)); }

function updateMetrics() {
  let income = 0, expense = 0, charity = 0;
  getPeriodTransactions().forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') income += amt;
    else if (t.type === 'expense') expense += amt;
    else if (t.type === 'charity') charity += amt;
  });
  document.getElementById('statIncome').textContent = money(income);
  document.getElementById('statExpense').textContent = money(expense);
  document.getElementById('statCharity').textContent = money(charity);
  document.getElementById('statNet').textContent = money(income - expense - charity);
}

function renderTransactions() {
  const tbody = document.getElementById('transactionsTbody');
  const empty = document.getElementById('emptyTransactionsState');
  if (tbody) tbody.innerHTML = '';
  
  const list = getPeriodTransactions();
  if (!list.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  list.forEach(item => {
    if (tbody) {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 dark:hover:bg-dark-850/60';
      tr.innerHTML = `
        <td class="py-3 px-4 font-bold">${escapeHTML(item.notes || item.category)}</td>
        <td class="py-3 px-4 text-orange-500 font-bold">${escapeHTML(item.client || '-')}</td>
        <td class="py-3 px-4">${escapeHTML(item.category)}</td>
        <td class="py-3 px-4 text-slate-400">${escapeHTML(item.paymentMethod)}</td>
        <td class="py-3 px-4 font-bold text-xs">${escapeHTML(item.date)}</td>
        <td class="py-3 px-4 font-black ${item.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">${item.type === 'income' ? '+' : '-'}${money(item.amount)} ج.م</td>
        <td class="py-3 px-4 text-center">
          <button onclick="editTransaction('${item.id}')" class="p-1.5 text-slate-400 hover:text-orange-500"><i class="fa-solid fa-pen"></i></button>
          <button onclick="deleteTransaction('${item.id}')" class="p-1.5 text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    }
  });
}

function renderDebts() {}
function renderClients() {}
function editTransaction(id) { openModal('expense', id); }
function deleteTransaction(id) {
  if (confirm('حذف العملية؟')) {
    transactions = transactions.filter(t => t.id !== id);
    saveData(); refreshAll();
  }
}

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('panelTransactions')?.classList.toggle('hidden', tab !== 'transactions');
  document.getElementById('panelDebts')?.classList.toggle('hidden', tab !== 'debts');
  document.getElementById('panelClients')?.classList.toggle('hidden', tab !== 'clients');
}

function toggleMenu() { document.getElementById('dropMenu')?.classList.toggle('hidden'); }
function closeMenus() { document.getElementById('dropMenu')?.classList.add('hidden'); }

function showToast(msg, type = 'success') {
  const box = document.getElementById('toastBox');
  const inner = document.getElementById('toastInner');
  if (!box || !inner) return;
  inner.className = `px-4 py-2 rounded-xl text-xs font-black text-white ${type === 'error' ? 'bg-rose-600' : 'bg-orange-500'}`;
  inner.textContent = msg;
  box.classList.remove('opacity-0', '-translate-y-5');
  box.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => box.classList.add('opacity-0', '-translate-y-5'), 2500);
}

function refreshAll() {
  updateMetrics();
  renderTransactions();
  renderDebts();
  renderClients();
}

window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPrivacyMode();
  loadLocalData();
  refreshAll();
  switchTab('transactions');

  setTimeout(() => { hideAuthLoading(); }, 1000);
});