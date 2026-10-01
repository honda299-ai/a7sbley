/* =========================================================
   EHSEBLI / HONDA FINANCIAL MANAGER V15.1
   ========================================================= */

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

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const STORAGE_KEY = 'ehsebli_honda_data_v3';
const THEME_KEY = 'ehsebli_theme_v3';
const BUDGET_KEY = 'ehsebli_budget_v3';
const PRIVACY_KEY = 'ehsebli_privacy_v2';

let currentUser = null;
let transactions = [];
let currentPeriod = 'all';
let currentTab = 'transactions';
let editingId = null;
let isPrivacyMode = false;
let transactionsUnsubscribe = null;

const CATEGORIES = {
  expense: ['شغل وصيانة','أكل ومشروبات','مواصلات','أخرى'],
  income: ['خدمات وسوفت وير','أرباح أخرى'],
  charity: ['صدقة جارية','مساعدة محتاج'],
  debt_receivable: ['دين ليا'],
  debt_payable: ['دين عليا']
};

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function money(value) { return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function escapeHTML(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function getActiveTransactions() { return transactions.filter(t => !t._deleted); }

function normalizeTransaction(t) {
  return {
    id: String(t.id || ('tx-' + Date.now())),
    type: t.type || 'expense',
    amount: Number(t.amount) || 0,
    paidAmount: Number(t.paidAmount) || 0,
    date: t.date || todayString(),
    client: t.client || '',
    category: t.category || 'عام',
    paymentMethod: t.paymentMethod || 'كاش نقدي',
    notes: t.notes || '',
    status: t.status || null,
    _deleted: t._deleted === true,
    _updatedAt: Number(t._updatedAt) || Date.now()
  };
}

function loadLocalData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) transactions = JSON.parse(saved).map(normalizeTransaction);
  } catch(e) {}
}

function saveLocalData() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); } catch(e) {}
}

async function saveData() {
  saveLocalData();
  if (currentUser && transactions.length > 0) {
    try {
      await db.collection('users').doc(currentUser.uid).set({
        transactions: transactions.map(normalizeTransaction),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch(e) {}
  }
}

function openModal(type = 'expense') {
  const modal = document.getElementById('transactionModal');
  document.getElementById('transactionForm').reset();
  document.getElementById('formDate').value = todayString();
  const radio = document.querySelector(`input[name="txType"][value="${type}"]`);
  if (radio) radio.checked = true;
  onTypeChange();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModal() {
  document.getElementById('transactionModal')?.classList.add('hidden');
  document.getElementById('transactionModal')?.classList.remove('flex');
}

function onTypeChange() {
  const type = document.querySelector('input[name="txType"]:checked')?.value || 'expense';
  const select = document.getElementById('formCategory');
  if (select) {
    select.innerHTML = '';
    (CATEGORIES[type] || ['عام']).forEach(c => {
      const opt = document.createElement('option'); opt.value = c; opt.textContent = c;
      select.appendChild(opt);
    });
  }
}

function handleFormSubmit(event) {
  event.preventDefault();
  const type = document.querySelector('input[name="txType"]:checked')?.value || 'expense';
  const amount = Number(document.getElementById('formAmount')?.value);
  const date = document.getElementById('formDate')?.value;
  const client = document.getElementById('formClient')?.value || '';
  const category = document.getElementById('formCategory')?.value || 'عام';
  const paymentMethod = document.getElementById('formPaymentMethod')?.value || 'كاش نقدي';
  const notes = document.getElementById('formNotes')?.value || '';

  if (!amount || amount <= 0) { showToast('أدخل مبلغ صحيح', 'error'); return; }

  transactions.unshift(normalizeTransaction({
    id: 'tx-' + Date.now(), type, amount, date, client, category, paymentMethod, notes, _updatedAt: Date.now()
  }));

  saveData();
  refreshAll();
  closeModal();
  showToast('تم الحفظ بنجاح ✓', 'success');
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.classList.toggle('dark', saved === 'dark');
}
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  document.documentElement.classList.toggle('dark', next === 'dark');
}

function initPrivacyMode() {
  isPrivacyMode = localStorage.getItem(PRIVACY_KEY) === 'true';
  document.body.classList.toggle('privacy-active', isPrivacyMode);
}
function togglePrivacyMode() {
  isPrivacyMode = !isPrivacyMode;
  localStorage.setItem(PRIVACY_KEY, isPrivacyMode);
  document.body.classList.toggle('privacy-active', isPrivacyMode);
  showToast(isPrivacyMode ? 'تم إخفاء الأرقام 🔒' : 'تم إظهار الأرقام 👁️', 'info');
}

auth.onAuthStateChanged(user => {
  document.getElementById('authLoading').style.display = 'none';
  if (user) {
    currentUser = user;
    document.getElementById('loginWall').classList.add('hidden');
    loadLocalData();
    refreshAll();
  } else {
    currentUser = null;
    document.getElementById('loginWall').classList.remove('hidden');
    loadLocalData();
    refreshAll();
  }
});

function loginWithGoogle() {
  auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => showToast(e.message, 'error'));
}
function logout() { auth.signOut(); }

function setPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.period === period));
  refreshAll();
}

function getPeriodTransactions() {
  return getActiveTransactions().filter(t => {
    if (currentPeriod === 'all') return true;
    if (currentPeriod === 'today') return t.date === todayString();
    return true;
  });
}

function updateMetrics() {
  let income = 0, expense = 0, debtRec = 0, debtPay = 0;
  getPeriodTransactions().forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') income += amt;
    else if (t.type === 'expense') expense += amt;
    else if (t.type === 'debt_receivable') debtRec += amt;
    else if (t.type === 'debt_payable') debtPay += amt;
  });
  document.getElementById('statIncome').textContent = money(income);
  document.getElementById('statExpense').textContent = money(expense);
  document.getElementById('statNet').textContent = money(income - expense);
  document.getElementById('statDebtReceivable').textContent = money(debtRec) + ' ج.م';
  document.getElementById('statDebtPayable').textContent = money(debtPay) + ' ج.م';
  document.getElementById('badgeTxCount').textContent = getPeriodTransactions().length;
}

function renderTransactions() {
  const mobileList = document.getElementById('mobileTransactionsList');
  const empty = document.getElementById('emptyTransactionsState');
  if (mobileList) mobileList.innerHTML = '';

  const list = getPeriodTransactions();
  if (!list.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  list.forEach(item => {
    const isInc = item.type === 'income';
    const isDebt = String(item.type).startsWith('debt_');
    const colorClass = isInc ? 'text-emerald-500' : (isDebt ? 'text-cyan-500' : 'text-rose-500');
    const sign = isInc ? '+' : (isDebt ? '•' : '-');

    if (mobileList) {
      const card = document.createElement('div');
      card.className = 'mobile-tx-card py-2.5 border-b border-slate-100 dark:border-dark-800 flex justify-between items-center';
      card.innerHTML = `
        <div>
          <div class="font-bold text-xs">${escapeHTML(item.notes || item.category)}</div>
          <div class="text-[10px] text-slate-400">${escapeHTML(item.date)} ${item.client ? '• ' + escapeHTML(item.client) : ''}</div>
        </div>
        <div class="font-black text-sm ${colorClass}">${sign}${money(item.amount)}</div>
      `;
      mobileList.appendChild(card);
    }
  });
}

function switchTab(tab) {
  const title = document.getElementById('panelTitle');
  if (tab === 'transactions') title.textContent = 'أحدث المعاملات';
  if (tab === 'clients') title.textContent = 'قائمة العملاء';
  renderTransactions();
}

function showToast(msg, type = 'success') {
  const box = document.getElementById('toastBox');
  const inner = document.getElementById('toastInner');
  if (!box || !inner) return;
  inner.className = `px-4 py-2 rounded-xl text-xs font-black text-white ${type === 'error' ? 'bg-rose-600' : 'bg-orange-500'}`;
  inner.textContent = msg;
  box.classList.remove('opacity-0', '-translate-y-5');
  box.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => box.classList.add('opacity-0', '-translate-y-5'), 2000);
}

function refreshAll() {
  updateMetrics();
  renderTransactions();
}

window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPrivacyMode();
  loadLocalData();
  refreshAll();
});