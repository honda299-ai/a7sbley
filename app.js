/* =========================================================
   EHSEBLI / HONDA FINANCIAL MANAGER V9.1
   Mobile Native UI + Today / Yesterday Filters
   Zero Undefined Firestore Data + Instant Realtime Sync
   ========================================================= */

const SUPER_ADMIN_EMAILS = [
  'hondastore299@gmail.com'
];

/* ---------- Firebase Config ---------- */
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

/* ---------- Constants ---------- */
const STORAGE_KEY = 'ehsebli_honda_data_v2';
const THEME_KEY = 'ehsebli_theme_v2';
const BUDGET_KEY = 'ehsebli_budget_v2';
const PIN_KEY = 'ehsebli_pin_v2';
const PRIVACY_KEY = 'ehsebli_privacy_v1';
const LAST_UID_KEY = 'ehsebli_last_uid';
const PERMS_CACHE_KEY = 'ehsebli_perms_cache';

/* ---------- State ---------- */
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

/* ---------- Roles Meta ---------- */
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

/* =========================================================
   DATE, TIME & IMAGE HELPERS
   ========================================================= */
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function yesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function beforeYesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 2);
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
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function money(value) { 
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); 
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
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
    id: String(t.id).slice(0, 100),
    type: t.type,
    amount: Math.min(Math.max(Number(t.amount) || 0, 0), 1e9),
    paidAmount: Number(t.paidAmount) || 0,
    date: t.date,
    time: sanitizeString(t.time || formatTimeTo12Hour(currentInputTimeString()), 20),
    client: sanitizeString(t.client || '', 60),
    category: sanitizeString(t.category, 100),
    paymentMethod: sanitizeString(t.paymentMethod || 'كاش نقدي', 50),
    reference: sanitizeString(t.reference || '', 50),
    notes: sanitizeString(t.notes || '', 200),
    receipt: t.receipt || null,
    status: (t.status === 'paid' || t.status === 'pending') ? t.status : null,
    _deleted: t._deleted === true,
    _updatedAt: Number(t._updatedAt) || Date.now()
  };
}

/* =========================================================
   RECEIPT IMAGE UPLOAD & COMPRESSION
   ========================================================= */
function handleReceiptSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('يرجى اختيار ملف صورة صالح', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 500;
      const MAX_HEIGHT = 500;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

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
    img.src = base64;
    box.classList.remove('hidden');
    removeBtn.classList.remove('hidden');
    text.textContent = 'تم اختيار صورة';
  } else {
    img.src = '';
    box.classList.add('hidden');
    removeBtn.classList.add('hidden');
    text.textContent = 'تصوير بالكاميرا أو اختيار صورة';
    document.getElementById('formReceiptFile').value = '';
  }
}

function clearReceiptImage() {
  currentReceiptData = null;
  setReceiptUI(null);
}

function viewReceiptImage(src) {
  if (!src) return;
  document.getElementById('viewerImageFull').src = src;
  document.getElementById('downloadReceiptLink').href = src;
  const modal = document.getElementById('receiptViewerModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeReceiptViewer() {
  const modal = document.getElementById('receiptViewerModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

/* =========================================================
   PRIVACY (GHOST) MODE
   ========================================================= */
function initPrivacyMode() {
  isPrivacyMode = localStorage.getItem(PRIVACY_KEY) === 'true';
  applyPrivacyModeUI();
}

function togglePrivacyMode() {
  isPrivacyMode = !isPrivacyMode;
  localStorage.setItem(PRIVACY_KEY, isPrivacyMode);
  applyPrivacyModeUI();
  showToast(isPrivacyMode ? 'تم إخفاء الأرقام 🔒' : 'تم إظهار الأرقام 👁️', 'info');
}

function applyPrivacyModeUI() {
  document.body.classList.toggle('privacy-active', isPrivacyMode);
  const icon = document.getElementById('privacyIcon');
  if (icon) {
    icon.className = isPrivacyMode ? 'fa-solid fa-eye-slash text-rose-500' : 'fa-solid fa-eye text-orange-500';
  }
}

/* =========================================================
   CLIENTS AUTOCOMPLETE
   ========================================================= */
function updateClientsDatalist() {
  const dl = document.getElementById('clientsDatalist');
  if (!dl) return;
  dl.innerHTML = '';
  const clients = getAllClientNames();
  clients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    dl.appendChild(opt);
  });
}

function getAllClientNames() {
  const set = new Set();
  getActiveTransactions().forEach(t => {
    if (t.client && t.client.trim()) set.add(t.client.trim());
  });
  return Array.from(set).sort();
}

/* =========================================================
   PUBLIC CLIENT PORTAL
   ========================================================= */
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
      if (doc.exists && doc.data().transactions) {
        clientTransactions = (doc.data().transactions || []).filter(validateTransaction);
      }
    } catch(e) {
      console.warn("Could not load from cloud, reading local:", e);
    }
  }

  if (!clientTransactions.length) {
    loadLocalData();
    clientTransactions = transactions;
  }

  renderPublicPortal(clientParam, clientTransactions);
  return true;
}

function renderPublicPortal(clientName, sourceTransactions) {
  const portalView = document.getElementById('clientPortalView');
  portalView.classList.remove('hidden');

  document.getElementById('portalClientName').textContent = clientName;
  document.getElementById('portalInitial').textContent = clientName.charAt(0).toUpperCase();

  const txs = sourceTransactions.filter(t => !t._deleted && t.client && t.client.trim().toLowerCase() === clientName.toLowerCase())
    .sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));

  let income = 0, debtRec = 0, debtPay = 0;
  const tbody = document.getElementById('portalTransactionsTbody');
  const empty = document.getElementById('portalEmptyState');
  tbody.innerHTML = '';

  document.getElementById('portalTxCount').textContent = `${txs.length} معاملة مسجلة`;

  if (!txs.length) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    txs.forEach(t => {
      const amt = Number(t.amount) || 0;
      const paid = Number(t.paidAmount) || 0;
      const rem = Math.max(0, amt - paid);

      if (t.type === 'income') income += amt;
      else if (t.type === 'debt_receivable' && t.status !== 'paid') debtRec += rem;
      else if (t.type === 'debt_payable' && t.status !== 'paid') debtPay += rem;

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 dark:hover:bg-dark-850/60';
      tr.innerHTML = `
        <td class="py-3 px-4">
          <div class="font-bold text-slate-700 dark:text-slate-200">${escapeHTML(t.date)}</div>
          <div class="text-[10px] text-orange-500 font-bold mt-0.5">${escapeHTML(formatTimeTo12Hour(t.time || ''))}</div>
        </td>
        <td class="py-3 px-4">
          <div class="font-bold text-slate-800 dark:text-slate-100">${escapeHTML(t.notes || t.category)}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">${escapeHTML(typeName(t.type))} ${t.status === 'paid' ? '• مسدد بالكامل' : ''}</div>
        </td>
        <td class="py-3 px-4 text-slate-500 dark:text-slate-400">${escapeHTML(t.paymentMethod || 'كاش')}</td>
        <td class="py-3 px-4 font-black ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">
          ${t.type === 'income' ? '+' : '-'}${money(t.amount)} ج.م
        </td>
        <td class="py-3 px-4 text-center">
          ${t.receipt ? `<button onclick="viewReceiptImage('${t.receipt}')" class="text-orange-500 hover:underline font-bold"><i class="fa-solid fa-paperclip"></i> معاينة</button>` : '-'}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('portalTotalIncome').textContent = money(income) + ' ج.م';
  document.getElementById('portalTotalDue').textContent = money(debtRec) + ' ج.م';
  document.getElementById('portalTotalPayable').textContent = money(debtPay) + ' ج.م';
}

function getClientPortalLink(clientName) {
  const url = new URL(window.location.href);
  url.searchParams.set('client', clientName);
  if (currentUser) url.searchParams.set('uid', currentUser.uid);
  return url.toString();
}

function copyClientPortalLink() {
  if (!activeClientName) return;
  const link = getClientPortalLink(activeClientName);
  navigator.clipboard.writeText(link).then(() => {
    showToast('تم نسخ رابط صفحة العميل بنجاح ✓', 'success');
  }).catch(() => {
    prompt('انسخ هذا الرابط وأرسله للعميل:', link);
  });
}

function shareClientPortalWhatsApp() {
  if (!activeClientName) return;
  const link = getClientPortalLink(activeClientName);
  const text = `مرحباً يا ${activeClientName}، تفضل رابط صفحة كشف حسابك المباشر لمتابعة كافة المعاملات المشتركة بيننا أولاً بأول:\n${link}\n\n— Honda Store`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

/* =========================================================
   PERMISSION HELPERS
   ========================================================= */
function hasFeature(feature) {
  if (isSuperAdmin || userRole === 'admin') return true;
  if (currentUserPermissionsOverride && typeof currentUserPermissionsOverride[feature] === 'boolean') {
    return currentUserPermissionsOverride[feature];
  }
  const perms = rolePermissions[userRole];
  if (!perms) return false;
  return perms[feature] === true;
}

function getMaxTransactions() {
  if (isSuperAdmin || userRole === 'admin') return -1;
  if (currentUserPermissionsOverride && typeof currentUserPermissionsOverride.maxTransactions === 'number') {
    return currentUserPermissionsOverride.maxTransactions;
  }
  const perms = rolePermissions[userRole];
  if (!perms) return -1;
  return Number(perms.maxTransactions ?? -1);
}

function canAddMoreTransactions() {
  const max = getMaxTransactions();
  if (max === -1) return true;
  return getActiveTransactions().length < max;
}

async function loadRolePermissions() {
  try {
    const doc = await db.collection('config').doc('roles').get();
    if (doc.exists && doc.data().permissions) {
      const cloud = doc.data().permissions;
      const merged = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
      Object.keys(merged).forEach(r => {
        if (cloud[r]) merged[r] = { ...merged[r], ...cloud[r] };
      });
      rolePermissions = merged;
    }
    localStorage.setItem(PERMS_CACHE_KEY, JSON.stringify(rolePermissions));
  } catch (error) {
    try {
      const cached = localStorage.getItem(PERMS_CACHE_KEY);
      if (cached) rolePermissions = JSON.parse(cached);
    } catch(e) {}
  }
  applyRoleUI();
}

function applyRoleUI() {
  document.querySelectorAll('[data-feature]').forEach(el => {
    el.style.display = hasFeature(el.dataset.feature) ? '' : 'none';
  });

  const adminBtn = document.getElementById('adminPanelBtn');
  const adminDivider = document.getElementById('adminDivider');
  const showAdmin = (userRole === 'admin');
  if (adminBtn) adminBtn.style.display = showAdmin ? '' : 'none';
  if (adminDivider) adminDivider.style.display = showAdmin ? '' : 'none';

  const badge = document.getElementById('roleBadge');
  if (badge) {
    if (isSuperAdmin) {
      badge.className = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black border bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-500';
      badge.innerHTML = '<i class="fa-solid fa-crown"></i> Super Admin';
    } else {
      const meta = ROLES_META[userRole] || ROLES_META.free;
      badge.className = `inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black border ${meta.badgeClasses}`;
      badge.innerHTML = `<i class="fa-solid ${meta.icon}"></i> ${meta.name}`;
    }
  }
  updatePinUI();
}

function updatePinUI() {
  const removeBtn = document.getElementById('removePinBtn');
  if (removeBtn) {
    removeBtn.style.display = getPin() ? '' : 'none';
  }
}

/* =========================================================
   USER ROLE LOAD
   ========================================================= */
async function loadUserRole(uid) {
  try {
    const userEmail = (currentUser.email || '').toLowerCase().trim();
    const userPhone = currentUser.phoneNumber || '';
    isSuperAdmin = isSuperAdminEmail(userEmail);

    if (isSuperAdmin) {
      userRole = 'admin';
      currentUserPermissionsOverride = null;
      await db.collection('users').doc(uid).set({
        role: 'admin',
        email: currentUser.email || null,
        displayName: currentUser.displayName || '',
        isSuperAdmin: true,
        loginMethod: getLoginMethod(),
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return;
    }

    const doc = await db.collection('users').doc(uid).get();

    if (doc.exists && doc.data().role && ROLES_META[doc.data().role]) {
      userRole = doc.data().role;
      currentUserPermissionsOverride = doc.data().permissionsOverride || null;

      if (userRole === 'admin' && !isSuperAdmin) {
        userRole = 'free';
      }

      await db.collection('users').doc(uid).set({
        email: currentUser.email || null,
        phoneNumber: userPhone || null,
        displayName: currentUser.displayName || doc.data().displayName || '',
        loginMethod: getLoginMethod(),
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } else {
      userRole = 'free';
      currentUserPermissionsOverride = null;

      await db.collection('users').doc(uid).set({
        role: 'free',
        email: currentUser.email || null,
        phoneNumber: userPhone || null,
        displayName: currentUser.displayName || '',
        loginMethod: getLoginMethod(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  } catch (error) {
    const userEmail = (currentUser?.email || '').toLowerCase().trim();
    if (isSuperAdminEmail(userEmail)) {
      userRole = 'admin';
      isSuperAdmin = true;
    } else {
      userRole = 'free';
    }
    currentUserPermissionsOverride = null;
  }
}

function getLoginMethod() {
  const user = auth.currentUser;
  if (!user) return 'unknown';
  const providers = (user.providerData || []).map(p => p.providerId);
  if (providers.includes('google.com')) return 'google';
  if (providers.includes('password')) return 'email';
  if (providers.includes('phone')) return 'phone';
  return 'unknown';
}

/* =========================================================
   AUTH STATE CHANGE (WITH DIRECT REALTIME LISTENER)
   ========================================================= */
auth.onAuthStateChanged(async user => {
  if (isPortalModeActive) return;

  hideAuthLoading();
  authResolved = true;

  const avatar = document.getElementById('userAvatar');
  const cloudStatus = document.getElementById('cloudStatus');
  const syncEmail = document.getElementById('syncUserEmail');
  const userProfile = document.getElementById('userProfile');

  if (user) {
    currentUser = user;
    handleUserSwitch(user.uid);

    hideLoginWall();
    userProfile.classList.remove('hidden');
    userProfile.classList.add('flex');

    if (user.photoURL) {
      avatar.src = user.photoURL;
    } else {
      const initial = (user.displayName || user.email || user.phoneNumber || 'U').charAt(0).toUpperCase();
      avatar.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' rx='10' fill='%23f97316'/><text x='50%' y='55%' text-anchor='middle' dominant-baseline='middle' font-size='20' font-family='Cairo' fill='white' font-weight='bold'>${escapeHTML(initial)}</text></svg>`;
    }

    cloudStatus.classList.remove('hidden');
    cloudStatus.classList.add('flex');
    syncEmail.textContent = user.email || user.phoneNumber || '';

    await loadUserRole(user.uid);
    await loadRolePermissions();

    loadLocalData();
    refreshAll();
    switchTab('transactions');

    subscribeToCloudTransactions(user.uid);
    updatePinUI();

    loadCloudData(user.uid).finally(() => {
      if (getPin()) showPinLock();
      else hidePinLock();
    });
  } else {
    currentUser = null;
    userRole = 'free';
    isSuperAdmin = false;
    currentUserPermissionsOverride = null;
    rolePermissions = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
    
    if (transactionsUnsubscribe) {
      try { transactionsUnsubscribe(); } catch(e) {}
      transactionsUnsubscribe = null;
    }
    
    hidePinLock();
    showLoginWall();
    loadLocalData();
    applyRoleUI();
  }
});

function logout() {
  if (!currentUser) return;
  openConfirm('تسجيل الخروج؟', 'سيتم إنهاء الجلسة. بياناتك محفوظة في السحابة بأمان.', () => {
    auth.signOut();
  });
}
function logoutFromLock() { auth.signOut(); }

/* =========================================================
   REALTIME TRANSACTIONS LISTENER (INSTANT & NO LOOP)
   ========================================================= */
function subscribeToCloudTransactions(uid) {
  if (transactionsUnsubscribe) {
    try { transactionsUnsubscribe(); } catch(e) {}
    transactionsUnsubscribe = null;
  }

  transactionsUnsubscribe = db.collection('users').doc(uid)
    .onSnapshot({ includeMetadataChanges: false }, doc => {
      if (!doc.exists) return;
      if (doc.metadata && doc.metadata.hasPendingWrites) return;

      const data = doc.data();
      if (Array.isArray(data.transactions)) {
        transactions = data.transactions.map(normalizeTransaction);
        if (data.budget !== undefined) {
          localStorage.setItem(BUDGET_KEY, data.budget);
        }
        saveLocalData();
        refreshAll();
      }
    }, err => {
      console.warn("Realtime transactions sync warning:", err);
    });
}

/* =========================================================
   DIRECT CLOUD SYNC (NO UNDEFINED / NO LOCKS)
   ========================================================= */
function mergeTransactions(local, cloud) {
  const map = new Map();
  cloud.forEach(t => { 
    if (t && t.id && validateTransaction(t)) map.set(t.id, normalizeTransaction(t)); 
  });
  local.forEach(t => {
    if (!t || !t.id || !validateTransaction(t)) return;
    const existing = map.get(t.id);
    if (!existing) { map.set(t.id, normalizeTransaction(t)); return; }
    const a = Number(existing._updatedAt) || 0;
    const b = Number(t._updatedAt) || 0;
    if (b > a) map.set(t.id, normalizeTransaction(t));
  });
  return Array.from(map.values());
}

async function syncToCloud() {
  if (!currentUser) return;
  try {
    const docRef = db.collection('users').doc(currentUser.uid);
    const cleanTransactions = JSON.parse(
      JSON.stringify(transactions.map(normalizeTransaction), (k, v) => (v === undefined ? null : v))
    );

    await docRef.set({
      transactions: cleanTransactions,
      budget: getBudget() || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Cloud sync error: ", error);
    showToast('فشل المزامنة: ' + (error.code || error.message), 'error');
  }
}

async function loadCloudData(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      const cloudTx = Array.isArray(data.transactions) ? data.transactions : [];
      transactions = mergeTransactions(transactions, cloudTx);
      if (data.budget !== undefined) {
        localStorage.setItem(BUDGET_KEY, data.budget);
      }
      saveLocalData();
      refreshAll();
      await syncToCloud();
    }
  } catch (error) {
    loadLocalData();
    refreshAll();
  }
}

/* =========================================================
   THEME
   ========================================================= */
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

/* =========================================================
   LOCAL DATA
   ========================================================= */
function loadLocalData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const arr = saved ? JSON.parse(saved) : [];
    transactions = Array.isArray(arr) ? arr.filter(validateTransaction).map(normalizeTransaction) : [];
  } catch (error) { transactions = []; }
}
function saveLocalData() { 
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); 
}
function saveData() {
  if (!requireAuth()) return;
  saveLocalData();
  syncToCloud();
}

/* =========================================================
   PERIODS & DAYS FILTERS (النهاردة - امبارح - أول أمس...)
   ========================================================= */
function setPeriod(period) {
  if (!requireAuth()) return;
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  
  const customBox = document.getElementById('customDateBox');
  if (period === 'custom') {
    customBox.classList.remove('hidden');
    customBox.classList.add('flex');
    if (!document.getElementById('customStartDate').value) {
      document.getElementById('customStartDate').value = offsetDate(-7);
      document.getElementById('customEndDate').value = todayString();
    }
    applyCustomDates();
    return;
  } else {
    customBox.classList.add('hidden');
    customBox.classList.remove('flex');
  }

  const labels = { 
    all: 'الكل', 
    today: 'النهاردة', 
    yesterday: 'امبارح', 
    before_yesterday: 'أول أمس', 
    week: 'هذا الأسبوع', 
    month: 'هذا الشهر'
  };
  document.getElementById('periodLabel').textContent = labels[period] || 'الكل';
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
  if (period === 'week') {
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return date >= start && date < end;
  }
  return true;
}
function getPeriodTransactions() { return getActiveTransactions().filter(t => isInPeriod(t.date)); }

/* =========================================================
   METRICS & WALLET BREAKDOWN
   ========================================================= */
function calculateMetrics(list = getPeriodTransactions()) {
  let income = 0, expense = 0, charity = 0, debtRec = 0, debtPay = 0;
  const wallets = {};

  list.forEach(t => {
    const amount = Number(t.amount) || 0;
    const method = t.paymentMethod || 'كاش نقدي';

    if (t.type === 'income') {
      income += amount;
      wallets[method] = (wallets[method] || 0) + amount;
    } else if (t.type === 'expense') {
      expense += amount;
      wallets[method] = (wallets[method] || 0) - amount;
    } else if (t.type === 'charity') {
      charity += amount;
      wallets[method] = (wallets[method] || 0) - amount;
    } else if (t.type === 'debt_receivable' && t.status !== 'paid') {
      const remaining = amount - (Number(t.paidAmount) || 0);
      debtRec += Math.max(0, remaining);
    } else if (t.type === 'debt_payable' && t.status !== 'paid') {
      const remaining = amount - (Number(t.paidAmount) || 0);
      debtPay += Math.max(0, remaining);
    }
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

  const daily = getPeriodTransactions().filter(t => !isDebt(t.type));
  const debts = getActiveTransactions().filter(t => isDebt(t.type) && t.status !== 'paid');
  document.getElementById('badgeTxCount').textContent = daily.length;
  document.getElementById('badgeDebtCount').textContent = debts.length;
  document.getElementById('badgeClientCount').textContent = getAllClientNames().length;

  renderWalletsBreakdown(metrics.wallets);
}

function renderWalletsBreakdown(wallets) {
  const container = document.getElementById('walletsContainer');
  if (!container) return;
  container.innerHTML = '';

  const defaultMethods = ['كاش نقدي', 'إنستاباي (InstaPay)', 'فودافون كاش / محفظة', 'فيزا / بطاقة بنكية'];
  const allMethods = Array.from(new Set([...defaultMethods, ...Object.keys(wallets)]));

  allMethods.forEach(method => {
    const bal = wallets[method] || 0;
    const card = document.createElement('div');
    card.className = 'p-2 rounded-xl border border-slate-100 dark:border-dark-750 bg-slate-50 dark:bg-dark-850/60 flex flex-col justify-between';
    
    let icon = 'fa-wallet';
    if (method.includes('كاش')) icon = 'fa-money-bill-1-wave';
    else if (method.includes('إنستاباي')) icon = 'fa-bolt';
    else if (method.includes('محفظة')) icon = 'fa-mobile-screen-button';
    else if (method.includes('فيزا')) icon = 'fa-credit-card';

    card.innerHTML = `
      <div class="flex items-center gap-1.5 text-slate-400 text-[9px] font-bold truncate">
        <i class="fa-solid ${icon} text-orange-500"></i>
        <span class="truncate">${escapeHTML(method.split(' ')[0])}</span>
      </div>
      <div class="mt-1 font-black text-xs money-val ${bal >= 0 ? 'text-slate-800 dark:text-slate-100' : 'text-rose-500'}">
        ${money(bal)} <span class="text-[8px] text-slate-400">ج.م</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function debouncedRenderTransactions() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(renderTransactions, 250);
}

/* =========================================================
   TRANSACTIONS RENDER (DESKTOP TABLE + MOBILE CARDS)
   ========================================================= */
function filterTransactions(filter) {
  activeFilter = filter;
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderTransactions();
}

function renderTransactions() {
  const tbody = document.getElementById('transactionsTbody');
  const mobileList = document.getElementById('mobileTransactionsList');
  const empty = document.getElementById('emptyTransactionsState');
  const search = (document.getElementById('searchInput').value || '').trim().toLowerCase();

  tbody.innerHTML = '';
  mobileList.innerHTML = '';

  let list = getPeriodTransactions().filter(t => {
    if (isDebt(t.type)) return false;
    if (activeFilter !== 'all' && t.type !== activeFilter) return false;
    if (!search) return true;
    const text = [t.category, t.notes, t.client, t.paymentMethod, t.reference, t.time, typeName(t.type)].join(' ').toLowerCase();
    return text.includes(search);
  });

  list.sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));

  if (!list.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  list.forEach(item => {
    let badge = '', amount = '', isInc = item.type === 'income', isCharity = item.type === 'charity';
    if (isInc) {
      badge = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] font-black bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">دخل</span>`;
      amount = `<span class="money-val font-black text-emerald-500">+${money(item.amount)} ج.م</span>`;
    } else if (isCharity) {
      badge = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] font-black bg-orange-500/10 text-orange-500 border border-orange-500/20">خير</span>`;
      amount = `<span class="money-val font-black text-orange-500">-${money(item.amount)} ج.م</span>`;
    } else {
      badge = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] font-black bg-rose-500/10 text-rose-500 border border-rose-500/20">مصروف</span>`;
      amount = `<span class="money-val font-black text-rose-500">-${money(item.amount)} ج.م</span>`;
    }

    const timeFormatted = item.time ? formatTimeTo12Hour(item.time) : '';

    // 1. إضافة سطر في جدول الكمبيوتر
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 dark:hover:bg-dark-850/60 transition group';
    tr.innerHTML = `
      <td class="py-3 px-4">
        <div class="flex items-center gap-2">
          ${badge}
          <div>
            <div class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span>${escapeHTML(item.notes || 'بدون بيان')}</span>
              ${item.receipt ? `<button onclick="viewReceiptImage('${item.receipt}')" class="text-orange-500"><i class="fa-solid fa-paperclip text-xs"></i></button>` : ''}
            </div>
          </div>
        </div>
      </td>
      <td class="py-3 px-4">
        ${item.client ? `<button onclick="openClientLedger('${escapeHTML(item.client)}')" class="text-xs font-black text-orange-500 hover:underline"><i class="fa-solid fa-user-circle"></i> ${escapeHTML(item.client)}</button>` : '<span class="text-slate-400 text-[10px]">-</span>'}
      </td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-300 font-bold text-[10px]">${escapeHTML(item.category)}</span></td>
      <td class="py-3 px-4 text-slate-500 dark:text-slate-400 text-[11px] font-semibold">${escapeHTML(item.paymentMethod || 'كاش نقدي')}</td>
      <td class="py-3 px-4">
        <div class="font-bold text-slate-600 dark:text-slate-300 text-xs">${escapeHTML(item.date)}</div>
        <div class="text-[9px] text-orange-500 font-bold flex items-center gap-1"><i class="fa-regular fa-clock"></i> ${escapeHTML(timeFormatted)}</div>
      </td>
      <td class="py-3 px-4">${amount}</td>
      <td class="py-3 px-4 text-center">
        <div class="flex items-center justify-center gap-1">
          <button onclick="shareViaWhatsApp('${item.id}')" class="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg"><i class="fa-brands fa-whatsapp"></i></button>
          <button onclick="editTransaction('${item.id}')" class="p-1.5 text-slate-400 hover:text-orange-500 rounded-lg"><i class="fa-solid fa-pen"></i></button>
          <button onclick="requestDelete('${item.id}')" class="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

    // 2. كارت متجاوب خاص بشاشات الموبايل (Native App Style)
    const card = document.createElement('div');
    card.className = 'mobile-tx-card';
    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          ${badge}
          <div class="min-w-0">
            <h4 class="font-bold text-xs truncate text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span>${escapeHTML(item.notes || item.category)}</span>
              ${item.receipt ? `<button onclick="viewReceiptImage('${item.receipt}')" class="text-orange-500"><i class="fa-solid fa-paperclip text-xs"></i></button>` : ''}
            </h4>
            <div class="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span>${escapeHTML(item.date)}</span>
              <span>•</span>
              <span class="text-orange-500 font-bold">${escapeHTML(timeFormatted)}</span>
              ${item.client ? `<span>•</span><span class="text-orange-400 font-bold" onclick="openClientLedger('${escapeHTML(item.client)}')"><i class="fa-solid fa-user text-[9px]"></i> ${escapeHTML(item.client)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="text-left shrink-0">
          <div class="text-sm font-black">${amount}</div>
          <span class="text-[9px] text-slate-400 block">${escapeHTML(item.paymentMethod.split(' ')[0])}</span>
        </div>
      </div>
      <div class="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100/60 dark:border-dark-800">
        <button onclick="shareViaWhatsApp('${item.id}')" class="p-1.5 text-emerald-500"><i class="fa-brands fa-whatsapp text-xs"></i></button>
        <button onclick="editTransaction('${item.id}')" class="p-1.5 text-slate-400 hover:text-orange-500"><i class="fa-solid fa-pen text-xs"></i></button>
        <button onclick="requestDelete('${item.id}')" class="p-1.5 text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
      </div>
    `;
    mobileList.appendChild(card);
  });
}

/* =========================================================
   DEBTS RENDER
   ========================================================= */
function renderDebts() {
  const container = document.getElementById('debtsContainer');
  const empty = document.getElementById('emptyDebtsState');
  container.innerHTML = '';

  const debts = getActiveTransactions()
    .filter(t => isDebt(t.type))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return new Date(b.date) - new Date(a.date);
    });

  if (!debts.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  debts.forEach(d => {
    const isReceivable = d.type === 'debt_receivable';
    const paid = d.status === 'paid';
    const totalAmount = Number(d.amount) || 0;
    const paidAmt = Number(d.paidAmount) || 0;
    const remainingAmt = Math.max(0, totalAmount - paidAmt);
    const progressPercent = Math.min(100, Math.round((paidAmt / totalAmount) * 100)) || 0;

    const card = document.createElement('div');
    card.className = 'p-3 rounded-2xl border ' + (
      paid ? 'bg-slate-50 dark:bg-dark-850/40 border-slate-200 dark:border-dark-800 opacity-60'
      : isReceivable ? 'bg-emerald-500/5 border-emerald-500/30'
      : 'bg-rose-500/5 border-rose-500/30'
    );

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2.5">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center ${isReceivable ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}">
            <i class="fa-solid ${isReceivable ? 'fa-user-plus' : 'fa-user-minus'} text-xs"></i>
          </div>
          <div class="min-w-0">
            <h4 class="text-xs font-black truncate">${escapeHTML(d.notes || 'دين بدون بيان')}</h4>
            <p class="text-[9px] text-slate-400 font-semibold mt-0.5">
              ${d.client ? `<span class="text-orange-500 font-bold" onclick="openClientLedger('${escapeHTML(d.client)}')"><i class="fa-solid fa-user"></i> ${escapeHTML(d.client)} • </span>` : ''}
              ${escapeHTML(d.date)}
            </p>
          </div>
        </div>
        <div class="text-left shrink-0">
          <div class="money-val text-sm font-black ${isReceivable ? 'text-emerald-500' : 'text-rose-500'}">${money(remainingAmt)} ج.م</div>
          ${paidAmt > 0 && !paid ? `<div class="text-[8px] text-slate-400">سُدد ${money(paidAmt)}</div>` : ''}
        </div>
      </div>

      <div class="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-dark-800 flex items-center justify-between gap-1 text-[10px]">
        <span class="${paid ? 'text-slate-400' : isReceivable ? 'text-emerald-500' : 'text-rose-500'} font-bold">
          ${paid ? 'مسدد بالكامل ✓' : 'معلق'}
        </span>
        <div class="flex items-center gap-1">
          ${!paid ? `
            <button onclick="openDebtPaymentModal('${d.id}')" class="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 font-black">
              دفعة جزئية
            </button>
          ` : ''}
          <button onclick="toggleDebtStatus('${d.id}')" class="px-2 py-1 rounded-lg ${paid ? 'bg-slate-200 dark:bg-dark-750 text-slate-600 dark:text-slate-300' : 'bg-orange-500 text-white'} font-black">${paid ? 'إعادة' : 'تم السداد ✓'}</button>
          <button onclick="requestDelete('${d.id}')" class="p-1 text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function openDebtPaymentModal(id) {
  const debt = transactions.find(t => t.id === id);
  if (!debt) return;
  partialPaymentDebtId = id;
  const rem = Math.max(0, (Number(debt.amount) || 0) - (Number(debt.paidAmount) || 0));

  document.getElementById('debtPayModalSubtitle').textContent = `${debt.notes} (المتبقي: ${money(rem)} ج.م)`;
  document.getElementById('partialPayAmount').value = '';
  document.getElementById('partialPayAmount').max = rem;

  const modal = document.getElementById('debtPaymentModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeDebtPaymentModal() {
  document.getElementById('debtPaymentModal').classList.add('hidden');
  document.getElementById('debtPaymentModal').classList.remove('flex');
  partialPaymentDebtId = null;
}

function submitPartialDebtPayment() {
  if (!partialPaymentDebtId) return;
  const debt = transactions.find(t => t.id === partialPaymentDebtId);
  if (!debt) return;

  const amt = Number(document.getElementById('partialPayAmount').value);
  if (!amt || amt <= 0) {
    showToast('أدخل مبلغ دفعة صحيح', 'error');
    return;
  }

  const currentPaid = Number(debt.paidAmount) || 0;
  const total = Number(debt.amount) || 0;
  const newPaid = currentPaid + amt;

  debt.paidAmount = newPaid;
  if (newPaid >= total) {
    debt.status = 'paid';
    showToast('تم اكتمال سداد كامل الدين بنجاح 🎉', 'success');
  } else {
    showToast(`تم تسجيل دفعة بقيمة ${money(amt)} ج.م ✓`, 'success');
  }
  debt._updatedAt = Date.now();

  saveData();
  refreshAll();
  closeDebtPaymentModal();
}

/* =========================================================
   CLIENTS LEDGER & PORTAL SHARING
   ========================================================= */
function renderClients() {
  const container = document.getElementById('clientsContainer');
  const empty = document.getElementById('emptyClientsState');
  const q = (document.getElementById('clientSearchInput')?.value || '').trim().toLowerCase();
  container.innerHTML = '';

  let clientNames = getAllClientNames();
  if (q) clientNames = clientNames.filter(name => name.toLowerCase().includes(q));

  if (!clientNames.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  clientNames.forEach(name => {
    const txs = getActiveTransactions().filter(t => t.client && t.client.trim().toLowerCase() === name.toLowerCase());
    let totalIncome = 0, totalDebtReceivable = 0;

    txs.forEach(t => {
      const amt = Number(t.amount) || 0;
      const paid = Number(t.paidAmount) || 0;
      if (t.type === 'income') totalIncome += amt;
      else if (t.type === 'debt_receivable' && t.status !== 'paid') totalDebtReceivable += Math.max(0, amt - paid);
    });

    const card = document.createElement('div');
    card.className = 'glow-card bg-slate-50 dark:bg-dark-850 p-3 rounded-2xl border border-slate-200 dark:border-dark-750 cursor-pointer flex flex-col justify-between';
    card.onclick = () => openClientLedger(name);

    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center font-black text-xs">
            ${escapeHTML(name.charAt(0).toUpperCase())}
          </div>
          <div>
            <h4 class="font-black text-xs text-slate-800 dark:text-slate-100">${escapeHTML(name)}</h4>
            <p class="text-[9px] text-slate-400">${txs.length} معاملة</p>
          </div>
        </div>
        <i class="fa-solid fa-chevron-left text-orange-500 text-xs"></i>
      </div>
      <div class="flex justify-between items-center mt-3 pt-2 border-t border-slate-200/60 dark:border-dark-800 text-[10px]">
        <span class="text-slate-400">باقي عليه: <strong class="money-val ${totalDebtReceivable > 0 ? 'text-cyan-500' : 'text-slate-500'}">${money(totalDebtReceivable)}</strong></span>
        <span class="text-emerald-500 font-black">+${money(totalIncome)}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function openClientLedger(clientName) {
  activeClientName = clientName;
  document.getElementById('clientModalName').textContent = clientName;
  document.getElementById('clientModalInitial').textContent = clientName.charAt(0).toUpperCase();

  const txs = getActiveTransactions().filter(t => t.client && t.client.trim().toLowerCase() === clientName.toLowerCase())
    .sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));

  let income = 0, debtRec = 0, debtPay = 0;
  const tbody = document.getElementById('clientTransactionsTbody');
  const empty = document.getElementById('emptyClientTxState');
  tbody.innerHTML = '';

  if (!txs.length) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    txs.forEach(t => {
      const amt = Number(t.amount) || 0;
      const paid = Number(t.paidAmount) || 0;
      const rem = Math.max(0, amt - paid);

      if (t.type === 'income') income += amt;
      else if (t.type === 'debt_receivable' && t.status !== 'paid') debtRec += rem;
      else if (t.type === 'debt_payable' && t.status !== 'paid') debtPay += rem;

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 dark:hover:bg-dark-850/60';
      tr.innerHTML = `
        <td class="py-2 px-2.5">
          <div class="font-bold text-[10px]">${escapeHTML(t.date)}</div>
          <div class="text-[8px] text-orange-500">${escapeHTML(formatTimeTo12Hour(t.time || ''))}</div>
        </td>
        <td class="py-2 px-2.5">
          <div class="font-bold text-[10px]">${escapeHTML(t.notes || t.category)}</div>
        </td>
        <td class="py-2 px-2.5 text-slate-400 text-[10px]">${escapeHTML(t.paymentMethod.split(' ')[0])}</td>
        <td class="py-2 px-2.5 font-black text-[11px] ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">
          ${t.type === 'income' ? '+' : '-'}${money(t.amount)}
        </td>
        <td class="py-2 px-2.5 text-center">
          ${t.receipt ? `<button onclick="viewReceiptImage('${t.receipt}')" class="text-orange-500 text-[10px]"><i class="fa-solid fa-image"></i></button>` : '-'}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('clientTotalIncome').textContent = money(income) + ' ج.م';
  document.getElementById('clientTotalReceivable').textContent = money(debtRec) + ' ج.م';
  document.getElementById('clientTotalPayable').textContent = money(debtPay) + ' ج.م';

  const modal = document.getElementById('clientLedgerModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeClientLedger() {
  document.getElementById('clientLedgerModal').classList.add('hidden');
  document.getElementById('clientLedgerModal').classList.remove('flex');
  activeClientName = null;
}

function openModalForSpecificClient() {
  const name = activeClientName;
  closeClientLedger();
  openModal('income');
  setTimeout(() => {
    document.getElementById('formClient').value = name;
  }, 100);
}

/* =========================================================
   WHATSAPP SHARE RECEIPT
   ========================================================= */
function shareViaWhatsApp(id) {
  const item = transactions.find(t => t.id === id);
  if (!item) return;

  const timeStr = item.time ? formatTimeTo12Hour(item.time) : '';
  const text = 
`🧾 *إشعار عملية مالية | Honda Financial Manager*
----------------------------------------
👤 *العميل:* ${item.client || 'عميل محترم'}
📌 *البيان:* ${item.notes || item.category}
💰 *المبلغ:* ${money(item.amount)} ج.م
📅 *التاريخ:* ${item.date} ${timeStr ? `(${timeStr})` : ''}
💳 *طريقة الدفع:* ${item.paymentMethod || 'كاش'}
----------------------------------------
شكراً لتعاملكم معنا ✨`;

  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

/* =========================================================
   TRANSACTION MODAL & FORM SUBMIT
   ========================================================= */
function openModal(type = 'expense', id = null) {
  if (!requireAuth()) return;
  if (type === 'charity' && !hasFeature('charity')) { showToast('باب الخير غير متاح لدورك', 'error'); return; }
  if ((type === 'debt_receivable' || type === 'debt_payable') && !hasFeature('debts')) { showToast('دفتر الديون غير متاح لدورك', 'error'); return; }

  const modal = document.getElementById('transactionModal');
  const form = document.getElementById('transactionForm');
  editingId = id;
  form.reset();

  currentReceiptData = null;
  setReceiptUI(null);

  document.getElementById('formDate').value = todayString();
  document.getElementById('formTime').value = currentInputTimeString();
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
  setTimeout(() => document.getElementById('formAmount').focus(), 100);
}

function closeModal() {
  const modal = document.getElementById('transactionModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  editingId = null;
  currentReceiptData = null;
}

function onTypeChange() {
  const selected = document.querySelector('input[name="txType"]:checked');
  if (!selected) return;
  const type = selected.value;
  const select = document.getElementById('formCategory');
  const title = document.getElementById('modalTitle');
  const icon = document.getElementById('modalIconBox');

  select.innerHTML = '';
  (CATEGORIES[type] || ['عام']).forEach(c => {
    const option = document.createElement('option');
    option.value = c; option.textContent = c;
    select.appendChild(option);
  });

  if (type === 'charity') {
    title.textContent = editingId ? 'تعديل باب الخير' : 'تسجيل خير';
    icon.innerHTML = '<i class="fa-solid fa-heart text-orange-500"></i>';
  } else if (type === 'income') {
    title.textContent = editingId ? 'تعديل الدخل' : 'تسجيل إيراد';
    icon.innerHTML = '<i class="fa-solid fa-arrow-trend-up text-emerald-500"></i>';
  } else if (type === 'debt_receivable') {
    title.textContent = editingId ? 'تعديل دين ليا' : 'تسجيل دين مستحق لي';
    icon.innerHTML = '<i class="fa-solid fa-user-plus text-cyan-500"></i>';
  } else if (type === 'debt_payable') {
    title.textContent = editingId ? 'تعديل دين عليا' : 'تسجيل دين مستحق عليّ';
    icon.innerHTML = '<i class="fa-solid fa-user-minus text-purple-500"></i>';
  } else {
    title.textContent = editingId ? 'تعديل مصروف' : 'تسجيل مصروف جديد';
    icon.innerHTML = '<i class="fa-solid fa-arrow-trend-down text-rose-500"></i>';
  }
}

function handleFormSubmit(event) {
  event.preventDefault();
  if (!requireAuth()) return;
  const wasEditing = !!editingId;

  const type = document.querySelector('input[name="txType"]:checked').value;
  const amount = Number(document.getElementById('formAmount').value);
  const date = document.getElementById('formDate').value;
  const timeInput = document.getElementById('formTime').value;
  const time = formatTimeTo12Hour(timeInput || currentInputTimeString());
  const client = sanitizeString(document.getElementById('formClient').value, 60);
  const category = document.getElementById('formCategory').value;
  const paymentMethod = document.getElementById('formPaymentMethod').value;
  const notes = sanitizeString(document.getElementById('formNotes').value, 200);

  if (!amount || amount <= 0 || amount > 1e9) { 
    showToast('يرجى إدخال مبلغ صحيح', 'error'); return; 
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { 
    showToast('يرجى اختيار تاريخ صحيح', 'error'); return; 
  }

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
      if (typeof confetti === 'function') confetti({ particleCount: 80, spread: 70, origin: { y: .6 } });
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

/* =========================================================
   DELETE & UNDO
   ========================================================= */
function editTransaction(id) {
  if (!requireAuth()) return;
  openModal('expense', id);
}

function requestDelete(id) {
  if (!requireAuth()) return;
  const item = transactions.find(t => t.id === id);
  if (!item) return;
  openConfirm(
    'حذف العملية؟',
    `سيتم حذف العملية بمبلغ <strong>${money(item.amount)} ج.م</strong>.`,
    () => deleteTransaction(id)
  );
}

function deleteTransaction(id) {
  if (!requireAuth()) return;
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  tx._deleted = true;
  tx._updatedAt = Date.now();
  saveData();
  refreshAll();
  showToast('تم حذف العملية بنجاح', 'info');
}

function openConfirm(title, message, callback) {
  if (confirm(title)) callback();
}

function toggleDebtStatus(id) {
  if (!requireAuth()) return;
  const debt = transactions.find(t => t.id === id);
  if (!debt) return;
  const wasPaid = debt.status === 'paid';
  debt.status = wasPaid ? 'pending' : 'paid';
  if (!wasPaid) debt.paidAmount = debt.amount;
  else debt.paidAmount = 0;
  debt._updatedAt = Date.now();
  saveData();
  refreshAll();
  showToast(debt.status === 'paid' ? 'تم إغلاق الدين بالكامل ✓' : 'تمت إعادة الدين كمعلق', 'success');
}

/* =========================================================
   TABS & NAVIGATION (DESKTOP + MOBILE APP NAV)
   ========================================================= */
function switchTab(tab) {
  if (tab === 'debts' && !hasFeature('debts')) { showToast('دفتر الديون غير متاح لدورك', 'error'); return; }
  currentTab = tab;
  
  const isTx = tab === 'transactions';
  const isDebts = tab === 'debts';
  const isClients = tab === 'clients';

  document.getElementById('panelTransactions').classList.toggle('hidden', !isTx);
  document.getElementById('panelDebts').classList.toggle('hidden', !isDebts);
  document.getElementById('panelClients').classList.toggle('hidden', !isClients);

  // تحديث شريط الكمبيوتر
  document.getElementById('tabBtnTransactions')?.classList.toggle('active', isTx);
  document.getElementById('tabBtnDebts')?.classList.toggle('active', isDebts);
  document.getElementById('tabBtnClients')?.classList.toggle('active', isClients);

  // تحديث شريط الموبايل السفلي
  document.getElementById('mNavTx')?.classList.toggle('active', isTx);
  document.getElementById('mNavDebts')?.classList.toggle('active', isDebts);
  document.getElementById('mNavClients')?.classList.toggle('active', isClients);

  if (isClients) renderClients();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let toastTimer = null;
function showToast(message, type = 'success') {
  const box = document.getElementById('toastBox');
  const inner = document.getElementById('toastInner');
  let icon = 'fa-solid fa-circle-check';
  let classes = 'bg-dark-900 text-white border-orange-500/40';
  if (type === 'error') { icon = 'fa-solid fa-circle-exclamation'; classes = 'bg-rose-950 text-white border-rose-500/50'; }
  else if (type === 'info') { icon = 'fa-solid fa-circle-info'; classes = 'bg-dark-850 text-slate-100 border-slate-700'; }

  inner.className = `flex items-center gap-2 px-3.5 py-2.5 rounded-2xl shadow-2xl text-xs font-black border ${classes}`;
  inner.innerHTML = `<i class="${icon} text-orange-500"></i><span>${escapeHTML(message)}</span>`;

  box.classList.remove('opacity-0', '-translate-y-5');
  box.classList.add('opacity-100', 'translate-y-0');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.classList.remove('opacity-100', 'translate-y-0');
    box.classList.add('opacity-0', '-translate-y-5');
  }, 3000);
}

function toggleMenu() { document.getElementById('dropMenu').classList.toggle('hidden'); }
function closeMenus() { document.getElementById('dropMenu').classList.add('hidden'); }

window.addEventListener('click', event => {
  const btn = document.getElementById('menuBtn');
  const menu = document.getElementById('dropMenu');
  if (btn && menu && !btn.contains(event.target) && !menu.contains(event.target)) {
    menu.classList.add('hidden');
  }
});

function refreshAll() {
  if (isPortalModeActive) return;
  updateMetrics();
  renderTransactions();
  renderDebts();
  renderClients();
  updateClientsDatalist();
  applyPrivacyModeUI();
}

/* =========================================================
   INITIAL BOOT
   ========================================================= */
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();

  const isPortal = await checkPublicPortalMode();
  if (isPortal) return;

  initPrivacyMode();
  loadLocalData();
  refreshAll();
  switchTab('transactions');
  document.getElementById('formDate').value = todayString();
  document.getElementById('formTime').value = currentInputTimeString();

  try {
    const cached = localStorage.getItem(PERMS_CACHE_KEY);
    if (cached) rolePermissions = JSON.parse(cached);
  } catch(e) {}
  applyRoleUI();
  updatePinUI();

  showAuthLoading();
  setTimeout(() => {
    if (!authResolved) {
      hideAuthLoading();
      showLoginWall();
    }
  }, 4000);
});