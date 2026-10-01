/* =========================================================
   EHSEBLI / HONDA FINANCIAL MANAGER V10.0
   Clean Event Handlers + Instant Modal Triggers
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

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const STORAGE_KEY = 'ehsebli_honda_data_v2';
const THEME_KEY = 'ehsebli_theme_v2';
const BUDGET_KEY = 'ehsebli_budget_v2';
const PIN_KEY = 'ehsebli_pin_v2';
const PRIVACY_KEY = 'ehsebli_privacy_v1';
const LAST_UID_KEY = 'ehsebli_last_uid';
const PERMS_CACHE_KEY = 'ehsebli_perms_cache';

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

let categoryChartInstance = null;
let balanceChartInstance = null;
let lastDeletedId = null;

let searchDebounceTimer = null;
let authResolved = false;

let adminActiveTab = 'users';
let usersSearchQuery = '';
let editingUserPermissions = null;
let currentUserPermissionsOverride = null;
let userDocUnsubscribe = null;
let transactionsUnsubscribe = null;

let currentLoginMethod = 'google';
let emailMode = 'signin';
let confirmationResult = null;
let recaptchaVerifier = null;

const ROLES_META = {
  free:     { name: 'مجاني',  icon: 'fa-user',           badgeClasses: 'bg-slate-500/10 border-slate-500/30 text-slate-400' },
  personal: { name: 'شخصي',   icon: 'fa-user-circle',    badgeClasses: 'bg-purple-500/10 border-purple-500/30 text-purple-400' },
  work:     { name: 'شغل',    icon: 'fa-briefcase',      badgeClasses: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' },
  pro:      { name: 'برو',    icon: 'fa-crown',          badgeClasses: 'bg-orange-500/10 border-orange-500/30 text-orange-400' },
  admin:    { name: 'مدير',   icon: 'fa-shield-halved',  badgeClasses: 'bg-rose-500/10 border-rose-500/30 text-rose-400' }
};

const FEATURE_LIST = [
  { key: 'charity', label: 'باب الخير',      icon: 'fa-hand-holding-heart', type: 'bool' },
  { key: 'debts',   label: 'دفتر الديون',    icon: 'fa-handshake',           type: 'bool' },
  { key: 'budget',  label: 'الميزانية',      icon: 'fa-wallet',              type: 'bool' },
  { key: 'export',  label: 'تصدير CSV',      icon: 'fa-file-excel',          type: 'bool' },
  { key: 'backup',  label: 'نسخ احتياطي',    icon: 'fa-database',            type: 'bool' },
  { key: 'reports', label: 'تقارير PDF',     icon: 'fa-file-pdf',            type: 'bool' }
];

const DEFAULT_PERMISSIONS = {
  free:     { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true },
  personal: { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true },
  work:     { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true },
  pro:      { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true },
  admin:    { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true }
};

let rolePermissions = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function yesterdayString() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function beforeYesterdayString() {
  const d = new Date(); d.setDate(d.getDate() - 2);
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

/* فتح وإغلاق مودال العملية مباشرة وبدون شروط تمنع الظهور */
function openModal(type = 'expense', id = null) {
  const modal = document.getElementById('transactionModal');
  const form = document.getElementById('transactionForm');
  if (!modal) return;

  editingId = id;
  form?.reset();
  currentReceiptData = null;
  setReceiptUI(null);

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

    if (item.receipt) {
      currentReceiptData = item.receipt;
      setReceiptUI(item.receipt);
    }
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
  currentReceiptData = null;
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
    if (type === 'charity') title.textContent = editingId ? 'تعديل باب الخير' : 'تسجيل صدقة أو عمل خير';
    else if (type === 'income') title.textContent = editingId ? 'تعديل الدخل' : 'تسجيل دخل / إيراد جديد';
    else if (type === 'debt_receivable') title.textContent = editingId ? 'تعديل دين ليا' : 'تسجيل دين مستحق لي';
    else if (type === 'debt_payable') title.textContent = editingId ? 'تعديل دين عليا' : 'تسجيل دين مستحق عليّ';
    else title.textContent = editingId ? 'تعديل مصروف' : 'تسجيل مصروف جديد';
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

  if (!amount || amount <= 0 || amount > 1e9) { showToast('يرجى إدخال مبلغ صحيح', 'error'); return; }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { showToast('يرجى اختيار تاريخ صحيح', 'error'); return; }

  if (wasEditing) {
    const index = transactions.findIndex(t => t.id === editingId);
    if (index === -1) return;
    const old = transactions[index];
    transactions[index] = normalizeTransaction({
      ...old, type, amount, date, time, client, category,
      paymentMethod: isDebt(type) ? 'آجل / معلق' : paymentMethod,
      notes: notes || (type === 'charity' ? 'صدقة لوجه الله' : category),
      receipt: currentReceiptData,
      status: isDebt(type) ? (old.status || 'pending') : null,
      _updatedAt: Date.now()
    });
    showToast('تم تعديل العملية بنجاح', 'success');
  } else {
    transactions.unshift(normalizeTransaction({
      id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      type, amount, date, time, client, category,
      paidAmount: 0,
      paymentMethod: isDebt(type) ? 'آجل / معلق' : paymentMethod,
      notes: notes || (type === 'charity' ? 'صدقة لوجه الله' : category),
      receipt: currentReceiptData,
      status: isDebt(type) ? 'pending' : null,
      _updatedAt: Date.now()
    }));

    if (type === 'charity') {
      if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 80, origin: { y: .6 } });
      showToast('تقبل الله منك وأخلف عليك بالبركة 🤲', 'success');
    } else {
      showToast('تم تسجيل العملية بنجاح', 'success');
    }
  }

  saveData();
  refreshAll();
  closeModal();
  if (!wasEditing && isDebt(type)) switchTab('debts');
}

function handleReceiptSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('يرجى اختيار صورة صحيحة', 'error'); return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 500;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
      else { if (h > MAX) { w *= MAX / h; h = MAX; } }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      currentReceiptData = canvas.toDataURL('image/jpeg', 0.4);
      setReceiptUI(currentReceiptData);
      showToast('تم إرفاق الصورة بنجاح ✓', 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function setReceiptUI(base64) {
  const box = document.getElementById('receiptPreviewBox');
  const img = document.getElementById('receiptPreviewImg');
  const text = document.getElementById('receiptUploadText');
  const removeBtn = document.getElementById('removeReceiptBtn');
  if (base64) {
    if (img) img.src = base64;
    box?.classList.remove('hidden');
    removeBtn?.classList.remove('hidden');
    if (text) text.textContent = 'تم اختيار صورة (اضغط للتغيير)';
  } else {
    if (img) img.src = '';
    box?.classList.add('hidden');
    removeBtn?.classList.add('hidden');
    if (text) text.textContent = 'تصوير بالكاميرا أو اختيار صورة';
    const input = document.getElementById('formReceiptFile');
    if (input) input.value = '';
  }
}
function clearReceiptImage() { currentReceiptData = null; setReceiptUI(null); }
function viewReceiptImage(src) {
  if (!src) return;
  const full = document.getElementById('viewerImageFull');
  if (full) full.src = src;
  const link = document.getElementById('downloadReceiptLink');
  if (link) link.href = src;
  const modal = document.getElementById('receiptViewerModal');
  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
}
function closeReceiptViewer() {
  const modal = document.getElementById('receiptViewerModal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
}

function initPrivacyMode() {
  isPrivacyMode = localStorage.getItem(PRIVACY_KEY) === 'true';
  applyPrivacyModeUI();
}
function togglePrivacyMode() {
  isPrivacyMode = !isPrivacyMode;
  localStorage.setItem(PRIVACY_KEY, isPrivacyMode);
  applyPrivacyModeUI();
  showToast(isPrivacyMode ? 'تم تفعيل وضع الخصوصية 🔒' : 'تم إظهار الأرقام 👁️', 'info');
}
function applyPrivacyModeUI() {
  document.body.classList.toggle('privacy-active', isPrivacyMode);
  const icon = document.getElementById('privacyIcon');
  if (icon) icon.className = isPrivacyMode ? 'fa-solid fa-eye-slash text-rose-500' : 'fa-solid fa-eye text-orange-500';
}

function updateClientsDatalist() {
  const dl = document.getElementById('clientsDatalist');
  if (!dl) return;
  dl.innerHTML = '';
  getAllClientNames().forEach(c => {
    const opt = document.createElement('option'); opt.value = c; dl.appendChild(opt);
  });
}
function getAllClientNames() {
  const set = new Set();
  getActiveTransactions().forEach(t => { if (t.client && t.client.trim()) set.add(t.client.trim()); });
  return Array.from(set).sort();
}

async function checkPublicPortalMode() {
  const params = new URLSearchParams(window.location.search);
  const clientParam = params.get('client');
  const uidParam = params.get('uid');
  if (!clientParam) return false;

  isPortalModeActive = true;
  document.body.classList.add('portal-mode');
  hideAuthLoading();

  let clientTransactions = [];
  if (uidParam) {
    try {
      const doc = await db.collection('users').doc(uidParam).get();
      if (doc.exists && doc.data().transactions) clientTransactions = (doc.data().transactions || []).filter(validateTransaction);
    } catch(e) {}
  }
  if (!clientTransactions.length) { loadLocalData(); clientTransactions = transactions; }
  renderPublicPortal(clientParam, clientTransactions);
  return true;
}

function renderPublicPortal(clientName, sourceTransactions) {
  const portalView = document.getElementById('clientPortalView');
  portalView?.classList.remove('hidden');
  document.getElementById('portalClientName').textContent = clientName;

  const txs = sourceTransactions.filter(t => !t._deleted && t.client && t.client.trim().toLowerCase() === clientName.toLowerCase())
    .sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));

  let income = 0, debtRec = 0, debtPay = 0;
  const tbody = document.getElementById('portalTransactionsTbody');
  if (tbody) tbody.innerHTML = '';
  document.getElementById('portalTxCount').textContent = `${txs.length} معاملة مسجلة`;

  txs.forEach(t => {
    const amt = Number(t.amount) || 0;
    const paid = Number(t.paidAmount) || 0;
    const rem = Math.max(0, amt - paid);
    if (t.type === 'income') income += amt;
    else if (t.type === 'debt_receivable' && t.status !== 'paid') debtRec += rem;
    else if (t.type === 'debt_payable' && t.status !== 'paid') debtPay += rem;

    if (tbody) {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 dark:hover:bg-dark-850/60';
      tr.innerHTML = `
        <td class="py-3 px-4"><div class="font-bold">${escapeHTML(t.date)}</div></td>
        <td class="py-3 px-4"><div class="font-bold">${escapeHTML(t.notes || t.category)}</div></td>
        <td class="py-3 px-4 text-slate-400">${escapeHTML(t.paymentMethod || 'كاش')}</td>
        <td class="py-3 px-4 font-black ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">${t.type === 'income' ? '+' : '-'}${money(t.amount)} ج.م</td>
        <td class="py-3 px-4 text-center">${t.receipt ? `<button onclick="viewReceiptImage('${t.receipt}')" class="text-orange-500"><i class="fa-solid fa-paperclip"></i></button>` : '-'}</td>
      `;
      tbody.appendChild(tr);
    }
  });

  document.getElementById('portalTotalIncome').textContent = money(income) + ' ج.م';
  document.getElementById('portalTotalDue').textContent = money(debtRec) + ' ج.م';
  document.getElementById('portalTotalPayable').textContent = money(debtPay) + ' ج.م';
}

function copyClientPortalLink() {
  if (!activeClientName) return;
  const url = new URL(window.location.href);
  url.searchParams.set('client', activeClientName);
  if (currentUser) url.searchParams.set('uid', currentUser.uid);
  navigator.clipboard.writeText(url.toString()).then(() => showToast('تم نسخ الرابط ✓', 'success'));
}
function shareClientPortalWhatsApp() {
  if (!activeClientName) return;
  const url = new URL(window.location.href);
  url.searchParams.set('client', activeClientName);
  if (currentUser) url.searchParams.set('uid', currentUser.uid);
  const text = `مرحباً ${activeClientName}، تفضل رابط صفحة كشف حسابك المباشر لمتابعة معاملاتنا:\n${url.toString()}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function hasFeature(feature) {
  if (isSuperAdmin || userRole === 'admin') return true;
  return rolePermissions[userRole]?.[feature] === true;
}
function getMaxTransactions() {
  if (isSuperAdmin || userRole === 'admin') return -1;
  return Number(rolePermissions[userRole]?.maxTransactions ?? -1);
}
function canAddMoreTransactions() {
  const max = getMaxTransactions();
  return max === -1 || getActiveTransactions().length < max;
}

async function loadRolePermissions() {
  try {
    const doc = await db.collection('config').doc('roles').get();
    if (doc.exists && doc.data().permissions) rolePermissions = doc.data().permissions;
  } catch(e) {}
  applyRoleUI();
}

function applyRoleUI() {
  document.querySelectorAll('[data-feature]').forEach(el => {
    el.style.display = hasFeature(el.dataset.feature) ? '' : 'none';
  });
  const adminBtn = document.getElementById('adminPanelBtn');
  const adminDiv = document.getElementById('adminDivider');
  const isAdmin = (userRole === 'admin' || isSuperAdmin);
  if (adminBtn) adminBtn.style.display = isAdmin ? '' : 'none';
  if (adminDiv) adminDiv.style.display = isAdmin ? '' : 'none';
  const badge = document.getElementById('roleBadge');
  if (badge) {
    if (isSuperAdmin) {
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black border border-amber-500/40 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300';
      badge.innerHTML = '<i class="fa-solid fa-crown text-[10px] text-amber-400"></i> Super Admin';
    } else {
      const meta = ROLES_META[userRole] || ROLES_META.free;
      badge.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${meta.badgeClasses}`;
      badge.innerHTML = `<i class="fa-solid ${meta.icon}"></i> ${meta.name}`;
    }
  }
}

async function loadUserRole(uid) {
  try {
    const userEmail = (currentUser?.email || '').toLowerCase().trim();
    isSuperAdmin = isSuperAdminEmail(userEmail);
    userRole = isSuperAdmin ? 'admin' : 'free';
    await db.collection('users').doc(uid).set({
      email: currentUser.email || null,
      role: userRole,
      isSuperAdmin: isSuperAdmin,
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch(e) { userRole = 'free'; }
  applyRoleUI();
}

function switchAdminTab(tab) {
  adminActiveTab = tab;
  const isUsers = tab === 'users';
  document.getElementById('adminTabUsers')?.classList.toggle('active', isUsers);
  document.getElementById('adminTabPerms')?.classList.toggle('active', !isUsers);
  document.getElementById('adminPanelUsers')?.classList.toggle('hidden', !isUsers);
  document.getElementById('adminPanelPerms')?.classList.toggle('hidden', isUsers);
}
function openAdminPanel() {
  closeMenus();
  document.getElementById('adminModal')?.classList.remove('hidden');
  document.getElementById('adminModal')?.classList.add('flex');
}
function closeAdminPanel() {
  document.getElementById('adminModal')?.classList.add('hidden');
  document.getElementById('adminModal')?.classList.remove('flex');
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
  if (isPortalModeActive) return;
  document.body.classList.add('not-authed');
  document.getElementById('loginWall')?.classList.remove('hidden');
  document.getElementById('loginWall')?.classList.add('flex');
}
function hideLoginWall() {
  document.body.classList.remove('not-authed');
  document.getElementById('loginWall')?.classList.add('hidden');
  document.getElementById('loginWall')?.classList.remove('flex');
}

auth.onAuthStateChanged(async user => {
  if (isPortalModeActive) return;
  hideAuthLoading();
  authResolved = true;

  if (user) {
    currentUser = user;
    hideLoginWall();
    document.getElementById('cloudStatus')?.classList.remove('hidden');
    document.getElementById('cloudStatus')?.classList.add('flex');
    const email = user.email || 'مستخدم';
    document.getElementById('syncUserEmail').textContent = email;
    document.getElementById('menuUserEmail').textContent = email;

    await loadUserRole(user.uid);
    loadLocalData();
    refreshAll();
    switchTab('transactions');
    subscribeToCloudTransactions(user.uid);
    loadCloudData(user.uid);
  } else {
    currentUser = null;
    userRole = 'free';
    isSuperAdmin = false;
    showLoginWall();
    loadLocalData();
    applyRoleUI();
  }
});

function subscribeToCloudTransactions(uid) {
  if (transactionsUnsubscribe) { try { transactionsUnsubscribe(); } catch(e) {} }
  transactionsUnsubscribe = db.collection('users').doc(uid).onSnapshot(doc => {
    if (!doc.exists || (doc.metadata && doc.metadata.hasPendingWrites)) return;
    const data = doc.data();
    if (Array.isArray(data.transactions)) {
      transactions = data.transactions.map(normalizeTransaction);
      saveLocalData();
      refreshAll();
    }
  });
}

async function syncToCloud() {
  if (!currentUser) return;
  try {
    const cleanTransactions = JSON.parse(JSON.stringify(transactions.map(normalizeTransaction), (k, v) => v === undefined ? null : v));
    await db.collection('users').doc(currentUser.uid).set({
      transactions: cleanTransactions,
      budget: getBudget() || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch(e) {
    showToast('فشل المزامنة: ' + (e.code || e.message), 'error');
  }
}

async function loadCloudData(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists && Array.isArray(doc.data().transactions)) {
      transactions = doc.data().transactions.map(normalizeTransaction);
      saveLocalData();
      refreshAll();
    }
  } catch(e) {}
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
}
function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function loadLocalData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    transactions = saved ? JSON.parse(saved).map(normalizeTransaction) : [];
  } catch(e) { transactions = []; }
}
function saveLocalData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }
function saveData() { saveLocalData(); syncToCloud(); }

function setPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.period === period));
  const customBox = document.getElementById('customDateBox');
  if (period === 'custom') {
    customBox?.classList.remove('hidden');
    customBox?.classList.add('flex');
    if (!document.getElementById('customStartDate').value) {
      document.getElementById('customStartDate').value = offsetDate(-7);
      document.getElementById('customEndDate').value = todayString();
    }
    applyCustomDates();
    return;
  } else {
    customBox?.classList.add('hidden');
    customBox?.classList.remove('flex');
  }
  const labels = { all: 'كل البيانات', today: 'النهاردة', yesterday: 'امبارح', before_yesterday: 'أول أمس', week: 'هذا الأسبوع', month: 'هذا الشهر', year: 'هذه السنة' };
  document.getElementById('periodLabel').textContent = labels[period] || 'كل البيانات';
  refreshAll();
}

function applyCustomDates() {
  customStartDateVal = document.getElementById('customStartDate').value;
  customEndDateVal = document.getElementById('customEndDate').value;
  document.getElementById('periodLabel').textContent = `من ${customStartDateVal} إلى ${customEndDateVal}`;
  refreshAll();
}

function isInPeriod(dateString, period = currentPeriod) {
  if (period === 'all') return true;
  if (period === 'today') return dateString === todayString();
  if (period === 'yesterday') return dateString === yesterdayString();
  if (period === 'before_yesterday') return dateString === beforeYesterdayString();
  if (period === 'custom') {
    if (!customStartDateVal || !customEndDateVal) return true;
    return dateString >= customStartDateVal && dateString <= customEndDateVal;
  }
  const date = new Date(dateString + 'T12:00:00');
  const now = new Date();
  if (period === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (period === 'year') return date.getFullYear() === now.getFullYear();
  return true;
}
function getPeriodTransactions() { return getActiveTransactions().filter(t => isInPeriod(t.date)); }

function calculateMetrics(list = getPeriodTransactions()) {
  let income = 0, expense = 0, charity = 0, debtRec = 0, debtPay = 0;
  const wallets = {};
  list.forEach(t => {
    const amt = Number(t.amount) || 0;
    const method = t.paymentMethod || 'كاش نقدي';
    if (t.type === 'income') { income += amt; wallets[method] = (wallets[method] || 0) + amt; }
    else if (t.type === 'expense') { expense += amt; wallets[method] = (wallets[method] || 0) - amt; }
    else if (t.type === 'charity') { charity += amt; wallets[method] = (wallets[method] || 0) - amt; }
    else if (t.type === 'debt_receivable' && t.status !== 'paid') { debtRec += Math.max(0, amt - (Number(t.paidAmount) || 0)); }
    else if (t.type === 'debt_payable' && t.status !== 'paid') { debtPay += Math.max(0, amt - (Number(t.paidAmount) || 0)); }
  });
  return { income, expense, charity, available: income - expense - charity, debtRec, debtPay, wallets };
}

function updateMetrics() {
  const metrics = calculateMetrics();
  document.getElementById('statIncome').textContent = money(metrics.income);
  document.getElementById('statExpense').textContent = money(metrics.expense);
  document.getElementById('statCharity').textContent = money(metrics.charity);
  const net = document.getElementById('statNet');
  net.textContent = money(metrics.available);
  net.className = 'money-val text-lg sm:text-3xl font-black ' + (metrics.available >= 0 ? 'text-emerald-500' : 'text-rose-500');
  document.getElementById('statDebtReceivable').textContent = money(metrics.debtRec) + ' ج.م';
  document.getElementById('statDebtPayable').textContent = money(metrics.debtPay) + ' ج.م';
  renderWalletsBreakdown(metrics.wallets);
}

function renderWalletsBreakdown(wallets) {
  const container = document.getElementById('walletsContainer');
  if (!container) return;
  container.innerHTML = '';
  const allMethods = Array.from(new Set(['كاش نقدي', 'إنستاباي (InstaPay)', 'فودافون كاش / محفظة', 'فيزا / بطاقة بنكية', ...Object.keys(wallets)]));
  allMethods.forEach(method => {
    const bal = wallets[method] || 0;
    const card = document.createElement('div');
    card.className = 'p-2.5 rounded-xl border border-slate-100 dark:border-dark-750 bg-slate-50 dark:bg-dark-850/60 flex flex-col justify-between';
    card.innerHTML = `
      <div class="text-[10px] text-slate-400 font-bold truncate">${escapeHTML(method.split(' ')[0])}</div>
      <div class="mt-1 font-black text-xs ${bal >= 0 ? 'text-slate-800 dark:text-slate-100' : 'text-rose-500'}">${money(bal)} ج.م</div>
    `;
    container.appendChild(card);
  });
}

function debouncedRenderTransactions() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(renderTransactions, 250);
}

function renderTransactions() {
  const tbody = document.getElementById('transactionsTbody');
  const mobileList = document.getElementById('mobileTransactionsList');
  const empty = document.getElementById('emptyTransactionsState');
  const search = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  if (tbody) tbody.innerHTML = '';
  if (mobileList) mobileList.innerHTML = '';

  let list = getPeriodTransactions().filter(t => {
    if (isDebt(t.type)) return false;
    if (activeFilter !== 'all' && t.type !== activeFilter) return false;
    if (!search) return true;
    return [t.category, t.notes, t.client, t.paymentMethod].join(' ').toLowerCase().includes(search);
  });

  list.sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));
  if (!list.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  list.forEach(item => {
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
    tbody?.appendChild(tr);

    const card = document.createElement('div');
    card.className = 'mobile-tx-card border-b border-slate-100 dark:border-dark-800 p-2.5';
    card.innerHTML = `
      <div class="flex justify-between items-center">
        <div>
          <div class="font-bold text-xs">${escapeHTML(item.notes || item.category)}</div>
          <div class="text-[10px] text-slate-400">${escapeHTML(item.date)} • ${escapeHTML(item.client || 'عام')}</div>
        </div>
        <div class="font-black text-sm ${item.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">${item.type === 'income' ? '+' : '-'}${money(item.amount)}</div>
      </div>
    `;
    mobileList?.appendChild(card);
  });
}

function renderDebts() {
  const container = document.getElementById('debtsContainer');
  if (!container) return;
  container.innerHTML = '';
  const debts = getActiveTransactions().filter(t => isDebt(t.type));
  debts.forEach(d => {
    const card = document.createElement('div');
    card.className = 'p-3 rounded-2xl border border-slate-200 dark:border-dark-750 bg-white dark:bg-dark-900';
    card.innerHTML = `
      <div class="flex justify-between">
        <div class="font-black text-xs">${escapeHTML(d.notes || 'دين')} (${escapeHTML(d.client || 'بدون اسم')})</div>
        <div class="font-black text-xs text-rose-500">${money(d.amount)} ج.م</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderClients() {
  const container = document.getElementById('clientsContainer');
  if (!container) return;
  container.innerHTML = '';
  getAllClientNames().forEach(name => {
    const card = document.createElement('div');
    card.className = 'p-3 rounded-2xl border border-slate-200 dark:border-dark-750 bg-white dark:bg-dark-900 font-bold text-xs flex justify-between cursor-pointer';
    card.onclick = () => openClientLedger(name);
    card.innerHTML = `<span>${escapeHTML(name)}</span><i class="fa-solid fa-chevron-left text-orange-500"></i>`;
    container.appendChild(card);
  });
}

function openClientLedger(clientName) {
  activeClientName = clientName;
  document.getElementById('clientModalName').textContent = `كشف حساب: ${clientName}`;
  const modal = document.getElementById('clientLedgerModal');
  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
}
function closeClientLedger() {
  document.getElementById('clientLedgerModal')?.classList.add('hidden');
  document.getElementById('clientLedgerModal')?.classList.remove('flex');
}
function openModalForSpecificClient() {
  const name = activeClientName;
  closeClientLedger();
  openModal('income');
  setTimeout(() => { document.getElementById('formClient').value = name; }, 100);
}

function editTransaction(id) { openModal('expense', id); }
function deleteTransaction(id) {
  if (confirm('هل أنت متأكد من حذف العملية؟')) {
    const tx = transactions.find(t => t.id === id);
    if (tx) { tx._deleted = true; tx._updatedAt = Date.now(); saveData(); refreshAll(); }
  }
}

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('panelTransactions')?.classList.toggle('hidden', tab !== 'transactions');
  document.getElementById('panelDebts')?.classList.toggle('hidden', tab !== 'debts');
  document.getElementById('panelClients')?.classList.toggle('hidden', tab !== 'clients');

  document.getElementById('tabBtnTransactions')?.classList.toggle('active', tab === 'transactions');
  document.getElementById('tabBtnDebts')?.classList.toggle('active', tab === 'debts');
  document.getElementById('tabBtnClients')?.classList.toggle('active', tab === 'clients');

  document.getElementById('mNavTx')?.classList.toggle('active', tab === 'transactions');
  document.getElementById('mNavDebts')?.classList.toggle('active', tab === 'debts');
  document.getElementById('mNavClients')?.classList.toggle('active', tab === 'clients');

  if (tab === 'clients') renderClients();
  if (tab === 'debts') renderDebts();

  const target = document.getElementById(tab === 'transactions' ? 'panelTransactions' : (tab === 'debts' ? 'panelDebts' : 'panelClients'));
  if (target && window.innerWidth < 768) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleMenu() { document.getElementById('dropMenu')?.classList.toggle('hidden'); }
function closeMenus() { document.getElementById('dropMenu')?.classList.add('hidden'); }
function toggleMobileMoreMenu(event) {
  event?.stopPropagation();
  const menu = document.getElementById('dropMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
  if (window.innerWidth < 768) menu.classList.add('fixed', 'bottom-20', 'right-4', 'left-4', 'w-auto');
}

function showToast(msg, type = 'success') {
  const box = document.getElementById('toastBox');
  const inner = document.getElementById('toastInner');
  if (!box || !inner) return;
  inner.className = `px-4 py-2.5 rounded-2xl shadow-xl text-xs font-black border ${type === 'error' ? 'bg-rose-950 text-white border-rose-500' : 'bg-dark-900 text-white border-orange-500'}`;
  inner.textContent = msg;
  box.classList.remove('opacity-0', '-translate-y-5');
  box.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => {
    box.classList.remove('opacity-100', 'translate-y-0');
    box.classList.add('opacity-0', '-translate-y-5');
  }, 2500);
}

function getBudget() { return Number(localStorage.getItem(BUDGET_KEY) || 0); }
function openBudgetModal() {
  document.getElementById('budgetInput').value = getBudget() || '';
  document.getElementById('budgetModal')?.classList.remove('hidden');
  document.getElementById('budgetModal')?.classList.add('flex');
}
function closeBudgetModal() {
  document.getElementById('budgetModal')?.classList.add('hidden');
  document.getElementById('budgetModal')?.classList.remove('flex');
}
function saveBudget() {
  const val = Number(document.getElementById('budgetInput').value);
  localStorage.setItem(BUDGET_KEY, val);
  closeBudgetModal();
  saveData();
  showToast('تم حفظ الميزانية', 'success');
}
function clearBudget() {
  localStorage.removeItem(BUDGET_KEY);
  closeBudgetModal();
  saveData();
  showToast('تم حذف الميزانية', 'info');
}

function openBackupModal() {
  document.getElementById('backupModal')?.classList.remove('hidden');
  document.getElementById('backupModal')?.classList.add('flex');
}
function closeBackupModal() {
  document.getElementById('backupModal')?.classList.add('hidden');
  document.getElementById('backupModal')?.classList.remove('flex');
}
function downloadBackup() {
  const blob = new Blob([JSON.stringify({ app: 'Ehsebli', date: new Date().toISOString(), transactions }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `احسبلي_${todayString()}.json`;
  a.click();
}
function restoreBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data.transactions)) {
        transactions = data.transactions.map(normalizeTransaction);
        saveData();
        refreshAll();
        closeBackupModal();
        showToast('تمت استعادة النسخة بنجاح', 'success');
      }
    } catch(e) { showToast('الملف غير صالح', 'error'); }
  };
  reader.readAsText(file);
}

function exportToCSV() {
  let csv = '\uFEFFالنوع,المبلغ,العميل,التصنيف,طريقة الدفع,التاريخ,البيان\n';
  getActiveTransactions().forEach(t => {
    csv += `"${typeName(t.type)}","${t.amount}","${t.client || ''}","${t.category}","${t.paymentMethod}","${t.date}","${t.notes || ''}"\n`;
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `احسبلي_${todayString()}.csv`;
  a.click();
}

function confirmClearData() {
  if (confirm('تصفير وحذف جميع العمليات نهائياً؟')) {
    transactions = [];
    saveData();
    refreshAll();
    showToast('تم تصفير البيانات', 'info');
  }
}
function loadDemoData() {
  transactions = [
    { id:'d1', type:'income', amount:1500, category:'خدمات سوفت وير وصيانة', client:'أحمد', paymentMethod:'كاش نقدي', notes:'صيانة 3 أجهزة', date:todayString() },
    { id:'d2', type:'expense', amount:250, category:'أكل ومشروبات', client:'', paymentMethod:'كاش نقدي', notes:'غداء', date:yesterdayString() }
  ].map(normalizeTransaction);
  saveData();
  refreshAll();
  showToast('تم تحميل البيانات النموذجية', 'success');
}

function refreshAll() {
  if (isPortalModeActive) return;
  updateMetrics();
  renderTransactions();
  renderDebts();
  renderClients();
}

/* ربط فوري لأزرار الإضافة في الصفحة لضمان الاستجابة من أول لمسة */
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  const isPortal = await checkPublicPortalMode();
  if (isPortal) return;

  initPrivacyMode();
  loadLocalData();
  refreshAll();

  // ربط أزرار الإضافة مباشرة
  document.getElementById('headerAddBtn')?.addEventListener('click', () => openModal('expense'));
  document.getElementById('mobileFabBtn')?.addEventListener('click', () => openModal('expense'));

  setTimeout(() => { hideAuthLoading(); }, 1200);
});