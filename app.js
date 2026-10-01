/* =========================================================
   EHSEBLI / HONDA FINANCIAL MANAGER V14.0 — SECURE SYNC
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

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const STORAGE_KEY = 'ehsebli_honda_data_v3';
const THEME_KEY = 'ehsebli_theme_v3';
const BUDGET_KEY = 'ehsebli_budget_v3';
const PRIVACY_KEY = 'ehsebli_privacy_v2';

let currentUser = null;
let transactions = [];
let activeFilter = 'all';
let currentPeriod = 'all';
let currentTab = 'transactions';
let editingId = null;
let isPrivacyMode = false;
let activeClientName = null;
let transactionsUnsubscribe = null;

const CATEGORIES = {
  expense: ['شغل وأدوات صيانة','تفعيل وسيرفرات وكريدت','أكل ومشروبات','مواصلات وبنزين','فواتير والتزامات','أخرى'],
  income: ['خدمات سوفت وير وصيانة','شحن رصيد وتفعيل أدوات','أرباح أخرى'],
  charity: ['صدقة جارية لوجه الله','مساعدة محتاج وتفريج كربة','أخرى']
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
    time: t.time || currentInputTimeString(),
    client: t.client || '',
    category: t.category || 'عام',
    paymentMethod: t.paymentMethod || 'كاش نقدي',
    notes: t.notes || '',
    status: t.status || null,
    _deleted: t._deleted === true,
    _updatedAt: Number(t._updatedAt) || Date.now()
  };
}

/* =========================================================
   التخزين المحلي الآمن والمزامنة اللحظية
   ========================================================= */
function loadLocalData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const arr = JSON.parse(saved);
      if (Array.isArray(arr) && arr.length > 0) {
        transactions = arr.map(normalizeTransaction);
      }
    }
  } catch(e) { console.warn("Local storage read error:", e); }
}

function saveLocalData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch(e) { console.warn("Local storage write error:", e); }
}

async function saveData() {
  saveLocalData();
  if (currentUser) {
    try {
      // حماية سحابية: لا يتم إرسال مصفوفة فارغة أبداً إذا كان هناك داتا محلية
      if (transactions.length === 0) return;

      const cleanTransactions = transactions.map(normalizeTransaction);
      await db.collection('users').doc(currentUser.uid).set({
        transactions: cleanTransactions,
        budget: Number(localStorage.getItem(BUDGET_KEY)) || 0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch(e) {
      console.warn("Cloud save warning:", e);
    }
  }
}

/* دمج ذكي يمنع مسح البيانات القديمة عند جلب سحابة فارغة بالخطأ */
function mergeTransactions(local, cloud) {
  const map = new Map();
  // إذا كانت السحابة فارغة والمحلي مليان، نعتمد المحلي ولا نحذفه
  if (!Array.isArray(cloud) || cloud.length === 0) {
    if (Array.isArray(local)) local.forEach(t => map.set(t.id, normalizeTransaction(t)));
    return Array.from(map.values());
  }

  cloud.forEach(t => { if (t && t.id) map.set(t.id, normalizeTransaction(t)); });
  if (Array.isArray(local)) {
    local.forEach(t => {
      if (!t || !t.id) return;
      const existing = map.get(t.id);
      if (!existing) {
        map.set(t.id, normalizeTransaction(t));
      } else {
        const a = Number(existing._updatedAt) || 0;
        const b = Number(t._updatedAt) || 0;
        if (b > a) map.set(t.id, normalizeTransaction(t));
      }
    });
  }
  return Array.from(map.values());
}

async function loadCloudData(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      const cloudTx = Array.isArray(data.transactions) ? data.transactions : [];
      
      // صمام أمان: إذا كانت سحابة فايربيس فارغة، نقوم برفع البيانات المحلية فوراً لتعبئتها ولا نستبدلها بـ "فاضي"
      if (cloudTx.length === 0 && transactions.length > 0) {
        await saveData();
        return;
      }

      transactions = mergeTransactions(transactions, cloudTx);
      if (data.budget !== undefined && !localStorage.getItem(BUDGET_KEY)) {
        localStorage.setItem(BUDGET_KEY, data.budget);
      }
      saveLocalData();
      refreshAll();
    } else if (transactions.length > 0) {
      await saveData();
    }
  } catch(e) {
    console.warn("Cloud load warning:", e);
  }
}

/* =========================================================
   التحكم بالواجهة والمودالات
   ========================================================= */
function openModal(type = 'expense', id = null) {
  const modal = document.getElementById('transactionModal');
  const form = document.getElementById('transactionForm');
  if (!modal) return;

  editingId = id;
  form?.reset();
  document.getElementById('formDate').value = todayString();
  document.getElementById('formTime').value = currentInputTimeString();
  updateClientsDatalist();

  const radio = document.querySelector(`input[name="txType"][value="${type}"]`);
  if (radio) radio.checked = true;
  onTypeChange();

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModal() {
  document.getElementById('transactionModal')?.classList.add('hidden');
  document.getElementById('transactionModal')?.classList.remove('flex');
  editingId = null;
}

function onTypeChange() {
  const selected = document.querySelector('input[name="txType"]:checked');
  if (!selected) return;
  const type = selected.value;
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
  const time = document.getElementById('formTime')?.value;
  const client = document.getElementById('formClient')?.value || '';
  const category = document.getElementById('formCategory')?.value || 'عام';
  const paymentMethod = document.getElementById('formPaymentMethod')?.value || 'كاش نقدي';
  const notes = document.getElementById('formNotes')?.value || '';

  if (!amount || amount <= 0) { showToast('أدخل مبلغ صحيح', 'error'); return; }

  if (editingId) {
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
  showToast(isPrivacyMode ? 'تم إخفاء الأرقام 🔒' : 'تم إظهار الأرقام 👁️️', 'info');
}

function updateClientsDatalist() {
  const dl = document.getElementById('clientsDatalist');
  if (!dl) return;
  dl.innerHTML = '';
  const set = new Set();
  getActiveTransactions().forEach(t => { if (t.client) set.add(t.client); });
  set.forEach(c => { const opt = document.createElement('option'); opt.value = c; dl.appendChild(opt); });
}

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
  if (user) {
    currentUser = user;
    hideLoginWall();
    document.getElementById('cloudStatus')?.classList.remove('hidden');
    document.getElementById('cloudStatus')?.classList.add('flex');
    document.getElementById('syncUserEmail').textContent = user.email || 'مستخدم';
    
    loadLocalData();
    refreshAll();
    switchTab('transactions');
    loadCloudData(user.uid);
    
    if (transactionsUnsubscribe) transactionsUnsubscribe();
    transactionsUnsubscribe = db.collection('users').doc(user.uid).onSnapshot(doc => {
      if (!doc.exists || (doc.metadata && doc.metadata.hasPendingWrites)) return;
      const data = doc.data();
      if (Array.isArray(data.transactions) && data.transactions.length > 0) {
        transactions = mergeTransactions(transactions, data.transactions.map(normalizeTransaction));
        saveLocalData();
        refreshAll();
      }
    });
  } else {
    currentUser = null;
    showLoginWall();
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
    const isInc = item.type === 'income';
    const amountStr = `${isInc ? '+' : '-'}${money(item.amount)} ج.م`;
    
    if (tbody) {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 dark:hover:bg-dark-850/60';
      tr.innerHTML = `
        <td class="py-3 px-4 font-bold">${escapeHTML(item.notes || item.category)}</td>
        <td class="py-3 px-4 text-orange-500 font-bold">${escapeHTML(item.client || '-')}</td>
        <td class="py-3 px-4">${escapeHTML(item.category)}</td>
        <td class="py-3 px-4 text-slate-400">${escapeHTML(item.paymentMethod)}</td>
        <td class="py-3 px-4 font-bold text-xs">${escapeHTML(item.date)}</td>
        <td class="py-3 px-4 font-black ${isInc ? 'text-emerald-500' : 'text-rose-500'}">${amountStr}</td>
        <td class="py-3 px-4 text-center">
          <button onclick="deleteTransaction('${item.id}')" class="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    }
  });
}

function renderDebts() {}
function renderClients() {}
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
  inner.className = `px-4 py-2.5 rounded-2xl shadow-xl text-xs font-black text-white ${type === 'error' ? 'bg-rose-600' : 'bg-orange-500'}`;
  inner.textContent = msg;
  box.classList.remove('opacity-0', '-translate-y-5');
  box.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => box.classList.add('opacity-0', '-translate-y-5'), 2500);
}

function getBudget() { return Number(localStorage.getItem(BUDGET_KEY) || 0); }
function openBudgetModal() { document.getElementById('budgetModal')?.classList.remove('hidden'); document.getElementById('budgetModal')?.classList.add('flex'); }
function closeBudgetModal() { document.getElementById('budgetModal')?.classList.add('hidden'); document.getElementById('budgetModal')?.classList.remove('flex'); }
function saveBudget() {
  localStorage.setItem(BUDGET_KEY, Number(document.getElementById('budgetInput').value));
  closeBudgetModal();
  updateBudget();
  showToast('تم حفظ الميزانية', 'success');
}
function updateBudget() {
  const budget = getBudget();
  const bTotal = document.getElementById('budgetTotal');
  if (bTotal) bTotal.textContent = budget ? money(budget) + ' ج.م' : 'غير محددة';
}

function openBackupModal() { document.getElementById('backupModal')?.classList.remove('hidden'); document.getElementById('backupModal')?.classList.add('flex'); }
function closeBackupModal() { document.getElementById('backupModal')?.classList.add('hidden'); document.getElementById('backupModal')?.classList.remove('flex'); }
function downloadBackup() {
  const blob = new Blob([JSON.stringify({ app: 'Ehsebli', transactions }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `احسبلي_${todayString()}.json`; a.click();
}
function exportToCSV() {
  let csv = '\uFEFFالنوع,المبلغ,العميل,التصنيف,التاريخ,البيان\n';
  getActiveTransactions().forEach(t => {
    csv += `"${typeName(t.type)}","${t.amount}","${t.client || ''}","${t.category}","${t.date}","${t.notes || ''}"\n`;
  });
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); a.download = `احسبلي_${todayString()}.csv`; a.click();
}
function confirmClearData() {
  if (confirm('تصفير وحذف جميع العمليات؟')) { transactions = []; saveData(); refreshAll(); showToast('تم التصفير', 'info'); }
}
function loadDemoData() {
  transactions = [
    { id:'d1', type:'income', amount:1500, category:'خدمات سوفت وير وصيانة', client:'أحمد', paymentMethod:'كاش نقدي', notes:'صيانة 3 أجهزة', date:todayString() }
  ].map(normalizeTransaction);
  saveData(); refreshAll(); showToast('تم تحميل بيانات تجريبية', 'success');
}

function refreshAll() {
  updateMetrics();
  renderTransactions();
  renderDebts();
  renderClients();
  updateBudget();
}

window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPrivacyMode();
  loadLocalData();
  refreshAll();
  switchTab('transactions');
  setTimeout(() => { hideAuthLoading(); }, 800);
});