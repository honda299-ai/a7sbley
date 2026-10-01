/* =========================================================
   EHSEBLI / HONDA FINANCIAL MANAGER V9.4
   Full Code: Complete Admin Panel + Role Permissions
   Zero Undefined Data + Instant Realtime Sync + Days Filters
   Smooth Adaptive Splash Screen + User Avatar Integration
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

/* ---------- Storage Keys ---------- */
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

/* ---------- Roles Metadata ---------- */
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
   DATE, TIME & SANITIZATION HELPERS
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

/* =========================================================
   CLEAN TRANSACTION (ABSOLUTELY ZERO UNDEFINED VALUES)
   ========================================================= */
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
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
      } else {
        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
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

function clearReceiptImage() {
  currentReceiptData = null;
  setReceiptUI(null);
}

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
  showToast(isPrivacyMode ? 'تم تفعيل وضع الخصوصية وإخفاء الأرقام 🔒' : 'تم إظهار الأرقام 👁️', 'info');
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
   PUBLIC CLIENT PORTAL ROUTING
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
  portalView?.classList.remove('hidden');

  document.getElementById('portalClientName').textContent = clientName;

  const txs = sourceTransactions.filter(t => !t._deleted && t.client && t.client.trim().toLowerCase() === clientName.toLowerCase())
    .sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));

  let income = 0, debtRec = 0, debtPay = 0;
  const tbody = document.getElementById('portalTransactionsTbody');
  const empty = document.getElementById('portalEmptyState');
  if (tbody) tbody.innerHTML = '';

  document.getElementById('portalTxCount').textContent = `${txs.length} معاملة مسجلة`;

  if (!txs.length) {
    empty?.classList.remove('hidden');
  } else {
    empty?.classList.add('hidden');
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
      }
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
  const text = `مرحباً يا ${activeClientName}، تفضل رابط صفحة كشف حسابك المالي المباشر لمتابعة كافة المعاملات المشتركة بيننا أولاً بأول:\n${link}\n\n— Honda Store`;
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

async function saveRolePermissionsToCloud() {
  if (!currentUser || userRole !== 'admin') {
    showToast('غير مصرح', 'error');
    return false;
  }
  try {
    await db.collection('config').doc('roles').set({
      permissions: rolePermissions,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.uid
    }, { merge: true });
    localStorage.setItem(PERMS_CACHE_KEY, JSON.stringify(rolePermissions));
    return true;
  } catch (error) {
    showToast('فشل الحفظ في السحابة', 'error');
    return false;
  }
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
      badge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-500';
      badge.innerHTML = '<i class="fa-solid fa-crown"></i> Super Admin';
    } else {
      const meta = ROLES_META[userRole] || ROLES_META.free;
      badge.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${meta.badgeClasses}`;
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
   ADMIN PANEL FUNCTIONS
   ========================================================= */
function switchAdminTab(tab) {
  adminActiveTab = tab;
  const isUsers = tab === 'users';
  document.getElementById('adminTabUsers')?.classList.toggle('active', isUsers);
  document.getElementById('adminTabPerms')?.classList.toggle('active', !isUsers);
  document.getElementById('adminPanelUsers')?.classList.toggle('hidden', !isUsers);
  document.getElementById('adminPanelPerms')?.classList.toggle('hidden', isUsers);

  if (isUsers) renderUsersList();
  else renderPermissionsEditor();
}

async function openAdminPanel() {
  if (userRole !== 'admin') {
    showToast('هذه الصفحة للمدير فقط', 'error');
    return;
  }
  closeMenus();
  const modal = document.getElementById('adminModal');
  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
  await loadRolePermissions();
  switchAdminTab('users');
}

function closeAdminPanel() {
  const modal = document.getElementById('adminModal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
}

function filterUsersList() {
  usersSearchQuery = (document.getElementById('usersSearchInput')?.value || '').trim().toLowerCase();
  renderUsersList();
}

async function renderUsersList() {
  const container = document.getElementById('usersList');
  const searchCount = document.getElementById('usersSearchCount');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-4 text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>';

  try {
    const snap = await db.collection('users').get();
    container.innerHTML = '';

    if (snap.empty) {
      container.innerHTML = '<div class="text-center py-4 text-xs text-slate-400">لا يوجد مستخدمين</div>';
      if (searchCount) searchCount.textContent = '';
      return;
    }

    let users = [];
    snap.forEach(doc => {
      const data = doc.data();
      const emailLower = (data.email || '').toLowerCase().trim();
      const nameLower = (data.displayName || '').toLowerCase().trim();
      const phoneLower = (data.phoneNumber || '').toLowerCase().trim();
      const isSuper = isSuperAdminEmail(emailLower);
      const isMe = doc.id === currentUser.uid;
      const roleKey = data.role || 'free';
      const hasOverride = data.permissionsOverride && Object.keys(data.permissionsOverride).length > 0;

      let priority = 3;
      if (isSuper) priority = 0;
      else if (roleKey === 'admin') priority = 1;
      else if (isMe) priority = 2;

      users.push({ doc, data, isSuper, isMe, roleKey, priority, emailLower, nameLower, phoneLower, hasOverride });
    });

    const q = usersSearchQuery;
    if (q) {
      users = users.filter(u => 
        u.emailLower.includes(q) || 
        u.nameLower.includes(q) ||
        u.phoneLower.includes(q)
      );
    }

    users.sort((a, b) => a.priority - b.priority);

    if (searchCount) {
      searchCount.textContent = q ? `${users.length} نتيجة` : `${users.length} مستخدم`;
    }

    if (!users.length) {
      container.innerHTML = `
        <div class="text-center py-8 text-xs text-slate-400">
          <i class="fa-solid fa-magnifying-glass text-3xl mb-3 opacity-30"></i>
          <p class="font-bold">لا توجد نتائج مطابقة</p>
        </div>
      `;
      return;
    }

    users.forEach(({ doc, data, isSuper, isMe, roleKey, hasOverride }) => {
      const meta = ROLES_META[roleKey] || ROLES_META.free;
      const card = document.createElement('div');
      card.className = 'p-3 rounded-xl border flex items-center justify-between gap-2 ' + (
        isSuper
          ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/40'
          : 'border-slate-200 dark:border-dark-750 bg-slate-50/50 dark:bg-dark-850/50'
      );

      let lastLoginStr = 'لم يسجل بعد';
      try {
        const lastLogin = data.lastLoginAt && data.lastLoginAt.toDate ? data.lastLoginAt.toDate() : null;
        if (lastLogin) lastLoginStr = `آخر دخول: ${lastLogin.toLocaleDateString('ar-EG')}`;
      } catch(e) {}

      const optionsHtml = Object.keys(ROLES_META).map(r =>
        `<option value="${r}" ${roleKey === r ? 'selected' : ''}>${ROLES_META[r].name}</option>`
      ).join('');

      const disabled = isMe || isSuper;
      const identifier = data.email ? escapeHTML(data.email) : (data.phoneNumber ? '📱 ' + escapeHTML(data.phoneNumber) : 'بدون معرّف');

      card.innerHTML = `
        <div class="min-w-0 flex-1">
          <div class="text-xs font-black truncate flex items-center gap-1.5 flex-wrap">
            ${isSuper ? '<i class="fa-solid fa-crown text-amber-500"></i>' : `<i class="fa-solid ${meta.icon}"></i>`}
            <span class="truncate">${escapeHTML(data.displayName || 'بدون اسم')}</span>
            ${isSuper ? '<span class="text-[9px] text-amber-500 font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30">👑 SUPER</span>' : ''}
            ${hasOverride ? '<span class="text-[9px] text-cyan-500 font-black px-1.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30">🎛️ خاص</span>' : ''}
            ${isMe ? '<span class="text-[9px] text-orange-500 font-black">(أنت)</span>' : ''}
          </div>
          <div class="text-[10px] text-slate-400 truncate mt-0.5">${identifier}</div>
          <div class="text-[9px] text-slate-500 mt-0.5">${lastLoginStr}</div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <select onchange="changeUserRole('${doc.id}', this.value)"
                  ${disabled ? 'disabled' : ''}
                  class="text-[10px] font-black rounded-lg px-2 py-1.5 border border-slate-200 dark:border-dark-750 bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
            ${optionsHtml}
          </select>
          <button onclick="openUserPermissionsModal('${doc.id}')"
                  title="صلاحيات مخصصة"
                  class="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white transition flex items-center justify-center">
            <i class="fa-solid fa-sliders text-xs"></i>
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (error) {
    container.innerHTML = '<div class="text-center py-4 text-xs text-rose-500">خطأ في تحميل المستخدمين</div>';
  }
}

async function changeUserRole(uid, newRole) {
  if (userRole !== 'admin') { showToast('غير مصرح لك', 'error'); return; }
  if (!ROLES_META[newRole]) return;
  if (uid === currentUser.uid) { showToast('لا يمكنك تغيير دورك الخاص', 'error'); renderUsersList(); return; }

  try {
    const targetDoc = await db.collection('users').doc(uid).get();
    const targetData = targetDoc.data() || {};
    const targetEmail = (targetData.email || '').toLowerCase().trim();

    if (isSuperAdminEmail(targetEmail)) {
      showToast('لا يمكن تعديل صلاحيات Super Admin 🛡️', 'error');
      renderUsersList();
      return;
    }

    await db.collection('users').doc(uid).update({
      role: newRole,
      roleUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      roleUpdatedBy: currentUser.uid
    });
    showToast(`تم تحديث الصلاحية إلى: ${ROLES_META[newRole].name}`, 'success');
  } catch (error) {
    showToast('فشل تحديث الصلاحية', 'error');
    renderUsersList();
  }
}

/* =========================================================
   USER PERMISSIONS OVERRIDE MODAL
   ========================================================= */
async function openUserPermissionsModal(uid) {
  if (userRole !== 'admin') { showToast('غير مصرح', 'error'); return; }
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) { showToast('المستخدم غير موجود', 'error'); return; }
    const data = doc.data();
    if (isSuperAdminEmail(data.email)) {
      showToast('لا يمكن تعديل صلاحيات Super Admin 🛡️', 'error');
      return;
    }
    editingUserPermissions = { uid, data };
    document.getElementById('userPermTitle').textContent = `صلاحيات: ${data.displayName || 'بدون اسم'}`;
    document.getElementById('userPermEmail').textContent = data.email || data.phoneNumber || '';

    const roleSelect = document.getElementById('userPermRole');
    const currentRole = data.role || 'free';
    Array.from(roleSelect.options).forEach(opt => { opt.selected = opt.value === currentRole; });

    renderUserPermOverrides(data.permissionsOverride || {});
    const modal = document.getElementById('userPermissionsModal');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
  } catch (error) {
    showToast('فشل تحميل بيانات المستخدم', 'error');
  }
}

function renderUserPermOverrides(override) {
  const container = document.getElementById('userPermOverrides');
  if (!container) return;
  container.innerHTML = '';
  FEATURE_LIST.forEach(feature => {
    const val = override[feature.key];
    let state = 'inherit';
    if (val === true) state = 'allow';
    else if (val === false) state = 'deny';

    const row = document.createElement('div');
    row.className = 'perm-row';
    row.innerHTML = `
      <div class="perm-row-label">
        <i class="fa-solid ${feature.icon}"></i>
        <span>${feature.label}</span>
      </div>
      <select class="perm-override-select" data-feature-override="${feature.key}">
        <option value="inherit" ${state === 'inherit' ? 'selected' : ''}>🔵 حسب الدور</option>
        <option value="allow" ${state === 'allow' ? 'selected' : ''}>🟢 مفعّل دايماً</option>
        <option value="deny" ${state === 'deny' ? 'selected' : ''}>🔴 معطّل دايماً</option>
      </select>
    `;
    container.appendChild(row);
  });

  const maxVal = override.maxTransactions;
  const maxDisplay = typeof maxVal === 'number' ? maxVal : '';
  const maxRow = document.createElement('div');
  maxRow.className = 'perm-row';
  maxRow.innerHTML = `
    <div class="perm-row-label">
      <i class="fa-solid fa-list-ol"></i>
      <span>حد العمليات</span>
    </div>
    <input type="number" min="-1" step="1" class="perm-max-input" id="userPermMaxTx" value="${maxDisplay}" placeholder="حسب الدور">
  `;
  container.appendChild(maxRow);
}

function resetUserPermissionsOverride() {
  if (!editingUserPermissions) return;
  renderUserPermOverrides({});
  const currentRole = editingUserPermissions.data.role || 'free';
  const roleSelect = document.getElementById('userPermRole');
  Array.from(roleSelect.options).forEach(opt => { opt.selected = opt.value === currentRole; });
  showToast('تمت إعادة التعيين — اضغط حفظ للتأكيد', 'info');
}

function closeUserPermissionsModal() {
  const modal = document.getElementById('userPermissionsModal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
  editingUserPermissions = null;
}

async function saveUserPermissionsOverride() {
  if (!editingUserPermissions || userRole !== 'admin') return;
  const uid = editingUserPermissions.uid;
  const newRole = document.getElementById('userPermRole').value;
  const override = {};

  FEATURE_LIST.forEach(feature => {
    const el = document.querySelector(`[data-feature-override="${feature.key}"]`);
    if (!el) return;
    if (el.value === 'allow') override[feature.key] = true;
    else if (el.value === 'deny') override[feature.key] = false;
  });

  const maxEl = document.getElementById('userPermMaxTx');
  if (maxEl && maxEl.value.trim() !== '') {
    const n = parseInt(maxEl.value, 10);
    if (isFinite(n)) override.maxTransactions = Math.max(-1, Math.min(1000000, n));
  }

  const hasOverride = Object.keys(override).length > 0;
  try {
    await db.collection('users').doc(uid).update({
      role: newRole,
      permissionsOverride: hasOverride ? override : null,
      permissionsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      permissionsUpdatedBy: currentUser.uid
    });
    showToast('تم حفظ الصلاحيات بنجاح ✓', 'success');
    closeUserPermissionsModal();
    renderUsersList();
  } catch (error) {
    showToast('فشل حفظ الصلاحيات', 'error');
  }
}

function subscribeToUserDoc(uid) {
  if (userDocUnsubscribe) {
    try { userDocUnsubscribe(); } catch(e) {}
    userDocUnsubscribe = null;
  }
  userDocUnsubscribe = db.collection('users').doc(uid).onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();
    if (!isSuperAdmin && data.role && ROLES_META[data.role]) {
      userRole = data.role;
    }
    currentUserPermissionsOverride = data.permissionsOverride || null;
    applyRoleUI();
    refreshAll();
  });
}

function renderPermissionsEditor() {
  const container = document.getElementById('permsList');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(ROLES_META).forEach(roleKey => {
    const meta = ROLES_META[roleKey];
    const isAdminRole = roleKey === 'admin';
    const perms = rolePermissions[roleKey] || {};
    const card = document.createElement('div');
    card.className = 'role-card';

    const maxVal = Number(perms.maxTransactions ?? -1);
    const maxDisplay = maxVal === -1 ? '' : maxVal;
    let rowsHtml = `
      <div class="perm-row">
        <div class="perm-row-label">
          <i class="fa-solid fa-list-ol"></i>
          <span>حد العمليات (فاضي = بلا حد)</span>
        </div>
        <input type="number" min="-1" step="1" class="perm-max-input" value="${maxDisplay}" placeholder="∞" data-role="${roleKey}" data-key="maxTransactions" ${isAdminRole ? 'disabled' : ''}>
      </div>
    `;

    FEATURE_LIST.forEach(feature => {
      const isOn = perms[feature.key] === true;
      rowsHtml += `
        <div class="perm-row">
          <div class="perm-row-label">
            <i class="fa-solid ${feature.icon}"></i>
            <span>${feature.label}</span>
          </div>
          <button type="button" class="perm-toggle ${isOn ? 'on' : ''}" data-role="${roleKey}" data-key="${feature.key}" onclick="togglePerm(this)" ${isAdminRole ? 'disabled style="opacity:.5; cursor:not-allowed;"' : ''}></button>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="role-card-header">
        <div class="role-card-title">
          <i class="fa-solid ${meta.icon}" style="color: #f97316;"></i>
          <span>${meta.name}</span>
        </div>
        ${isAdminRole ? '<span class="role-card-locked"><i class="fa-solid fa-lock"></i> مقفول</span>' : ''}
      </div>
      <div class="perm-grid">${rowsHtml}</div>
    `;
    container.appendChild(card);
  });
}

function togglePerm(btn) {
  if (btn.disabled) return;
  const roleKey = btn.dataset.role;
  const key = btn.dataset.key;
  if (roleKey === 'admin') return;

  if (!rolePermissions[roleKey]) rolePermissions[roleKey] = { ...DEFAULT_PERMISSIONS[roleKey] };
  const current = rolePermissions[roleKey][key] === true;
  rolePermissions[roleKey][key] = !current;
  btn.classList.toggle('on', !current);
}

async function saveRolePermissions() {
  if (userRole !== 'admin') { showToast('غير مصرح', 'error'); return; }
  document.querySelectorAll('.perm-max-input[data-role]').forEach(input => {
    const roleKey = input.dataset.role;
    if (!roleKey || roleKey === 'admin') return;
    const raw = input.value.trim();
    const val = raw === '' ? -1 : Math.max(-1, Math.min(1000000, parseInt(raw, 10) || -1));
    if (!rolePermissions[roleKey]) rolePermissions[roleKey] = { ...DEFAULT_PERMISSIONS[roleKey] };
    rolePermissions[roleKey].maxTransactions = val;
  });

  rolePermissions.admin = { ...DEFAULT_PERMISSIONS.admin };
  const ok = await saveRolePermissionsToCloud();
  if (ok) {
    showToast('تم حفظ الصلاحيات بنجاح ✓', 'success');
    applyRoleUI();
    refreshAll();
  }
}

/* =========================================================
   LOGIN & AUTH FLOW
   ========================================================= */
function switchLoginMethod(method) {
  currentLoginMethod = method;
  ['google', 'email', 'phone'].forEach(m => {
    const tab = document.getElementById('loginTab' + m.charAt(0).toUpperCase() + m.slice(1));
    const panel = document.getElementById('loginPanel' + m.charAt(0).toUpperCase() + m.slice(1));
    if (tab) tab.classList.toggle('active', m === method);
    if (panel) panel.classList.toggle('hidden', m !== method);
  });
  hideEmailError();
  hidePhoneError();
}

function setEmailMode(mode) {
  emailMode = mode;
  document.getElementById('emailModeSignin')?.classList.toggle('active', mode === 'signin');
  document.getElementById('emailModeSignup')?.classList.toggle('active', mode === 'signup');
  document.getElementById('signupOnlyFields')?.classList.toggle('hidden', mode !== 'signup');
  document.getElementById('confirmPasswordWrapper')?.classList.toggle('hidden', mode !== 'signup');
  document.getElementById('forgotPasswordBtn')?.classList.toggle('hidden', mode === 'signup');
  
  const submitText = document.getElementById('emailSubmitText');
  const submitIcon = document.getElementById('emailSubmitIcon');
  if (submitText) submitText.textContent = mode === 'signup' ? 'إنشاء الحساب' : 'تسجيل الدخول';
  if (submitIcon) submitIcon.className = mode === 'signup' ? 'fa-solid fa-user-plus' : 'fa-solid fa-right-to-bracket';
  hideEmailError();
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  const eye = document.getElementById(inputId + 'Eye');
  if (!input || !eye) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  eye.className = isPass ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
}

function showEmailError(msg) {
  const el = document.getElementById('emailError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}
function hideEmailError() {
  const el = document.getElementById('emailError');
  if (el) el.classList.add('hidden');
}
function showPhoneError(msg) {
  const el = document.getElementById('phoneError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}
function hidePhoneError() {
  const el = document.getElementById('phoneError');
  if (el) el.classList.add('hidden');
}

async function submitEmailAuth() {
  hideEmailError();
  const email = (document.getElementById('emailInput')?.value || '').trim().toLowerCase();
  const password = document.getElementById('passwordInput')?.value || '';
  const displayName = (document.getElementById('emailDisplayNameInput')?.value || '').trim();
  const confirmPassword = document.getElementById('confirmPasswordInput')?.value || '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showEmailError('❌ يرجى إدخال إيميل صحيح'); return;
  }
  if (!password || password.length < 6) {
    showEmailError('❌ كلمة السر لازم تكون 6 أحرف على الأقل'); return;
  }
  if (emailMode === 'signup') {
    if (!displayName || displayName.length < 2) { showEmailError('❌ يرجى إدخال اسمك الكامل'); return; }
    if (password !== confirmPassword) { showEmailError('❌ كلمتي السر مش متطابقتين'); return; }
  }

  const btn = document.getElementById('emailSubmitBtn');
  if (btn) btn.disabled = true;

  try {
    if (emailMode === 'signup') {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      if (cred.user && displayName) {
        try { await cred.user.updateProfile({ displayName }); } catch(e) {}
      }
      showToast(`أهلاً بك يا ${displayName || 'صديقنا'} 🎉`, 'success');
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      showToast(`أهلاً بعودتك 👋`, 'success');
    }
  } catch (error) {
    showEmailError('❌ ' + (error.message || error.code));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function sendPasswordReset() {
  hideEmailError();
  const email = (document.getElementById('emailInput')?.value || '').trim().toLowerCase();
  if (!email) { showEmailError('❌ اكتب الإيميل أولاً'); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    showToast('تم إرسال رابط استعادة كلمة السر للإيميل', 'success');
  } catch (error) {
    showEmailError('❌ ' + (error.message || error.code));
  }
}

function initRecaptcha() {
  if (recaptchaVerifier) return recaptchaVerifier;
  try {
    recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptchaContainer', {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        try { recaptchaVerifier.clear(); } catch(e) {}
        recaptchaVerifier = null;
      }
    });
    return recaptchaVerifier;
  } catch (error) {
    return null;
  }
}

async function sendPhoneOTP() {
  hidePhoneError();
  const code = document.getElementById('phoneCountryCode')?.value || '+20';
  let number = (document.getElementById('phoneNumberInput')?.value || '').replace(/[^\d]/g, '');
  if (!number || number.length < 7) { showPhoneError('❌ رقم موبايل غير صحيح'); return; }
  if (code === '+20' && number.startsWith('0')) number = number.slice(1);

  const fullNumber = code + number;
  const btn = document.getElementById('sendOtpBtn');
  if (btn) btn.disabled = true;

  try {
    const appVerifier = initRecaptcha();
    confirmationResult = await auth.signInWithPhoneNumber(fullNumber, appVerifier);
    document.getElementById('phoneStep1')?.classList.add('hidden');
    document.getElementById('phoneStep2')?.classList.remove('hidden');
    showToast('تم إرسال الكود ✓', 'success');
  } catch (error) {
    showPhoneError('❌ ' + (error.message || error.code));
    if (recaptchaVerifier) { try { recaptchaVerifier.clear(); } catch(e) {} recaptchaVerifier = null; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function verifyPhoneOTP() {
  hidePhoneError();
  const code = (document.getElementById('otpInput')?.value || '').trim();
  if (!code || !/^\d{4,6}$/.test(code)) { showPhoneError('❌ الكود مكوّن من 6 أرقام'); return; }
  if (!confirmationResult) { changePhoneNumber(); return; }

  const btn = document.getElementById('verifyOtpBtn');
  if (btn) btn.disabled = true;
  try {
    const result = await confirmationResult.confirm(code);
    showToast(`أهلاً بك يا ${result.user.phoneNumber} 👋`, 'success');
  } catch (error) {
    showPhoneError('❌ كود غير صحيح أو منتهي');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function changePhoneNumber() {
  document.getElementById('phoneStep1')?.classList.remove('hidden');
  document.getElementById('phoneStep2')?.classList.add('hidden');
  const inp = document.getElementById('otpInput');
  if (inp) inp.value = '';
}

async function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await auth.signInWithPopup(provider);
    showToast(`أهلاً بك يا ${result.user.displayName || 'صديقنا'} 👋`, 'success');
  } catch (error) {
    if (error.code === 'auth/popup-blocked') {
      await auth.signInWithRedirect(provider);
    } else {
      showToast('تعذر تسجيل الدخول: ' + error.message, 'error');
    }
  }
}

async function handleRedirectResult() {
  try {
    const result = await auth.getRedirectResult();
    if (result && result.user) {
      showToast(`أهلاً بك يا ${result.user.displayName || 'صديقنا'} 👋`, 'success');
    }
  } catch (error) {}
}

/* =========================================================
   AUTH GUARDS & PIN
   ========================================================= */
function requireAuth() {
  if (!currentUser) {
    showToast('يجب تسجيل الدخول أولاً', 'error');
    return false;
  }
  return true;
}

async function hashPin(pin) {
  const salted = 'ehsebli_v3_' + pin;
  if (window.crypto && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salted));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    } catch(e) {}
  }
  let h = 2166136261;
  for (let i = 0; i < salted.length; i++) { h ^= salted.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'fnv_' + (h >>> 0).toString(16);
}

function getPin() { return localStorage.getItem(PIN_KEY); }

function showAuthLoading() {
  const splash = document.getElementById('splashScreen');
  if (splash) {
    splash.style.display = 'flex';
    splash.style.opacity = '1';
    splash.classList.remove('hidden');
  }
  document.getElementById('loginWall')?.classList.add('hidden');
}

function hideAuthLoading() {
  const splash = document.getElementById('splashScreen');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.style.display = 'none';
      splash.classList.add('hidden');
    }, 400);
  }
  const oldLoading = document.getElementById('authLoading');
  if (oldLoading) oldLoading.style.display = 'none';
}

function showLoginWall() {
  if (isPortalModeActive) return;
  document.body.classList.add('not-authed');
  const wall = document.getElementById('loginWall');
  wall?.classList.remove('hidden');
  wall?.classList.add('flex');
}

function hideLoginWall() {
  document.body.classList.remove('not-authed');
  const wall = document.getElementById('loginWall');
  wall?.classList.add('hidden');
  wall?.classList.remove('flex');
}

function showPinLock() {
  if (isPortalModeActive) return;
  const lock = document.getElementById('lockScreen');
  lock?.classList.remove('hidden');
  lock?.classList.add('flex');
  const input = document.getElementById('unlockPinInput');
  if (input) { input.value = ''; setTimeout(() => input.focus(), 150); }
  document.getElementById('unlockError')?.classList.add('hidden');
}

function hidePinLock() {
  const lock = document.getElementById('lockScreen');
  lock?.classList.add('hidden');
  lock?.classList.remove('flex');
}

function handleUserSwitch(uid) {
  const lastUid = localStorage.getItem(LAST_UID_KEY);
  if (lastUid && lastUid !== uid) {
    transactions = [];
    localStorage.removeItem(BUDGET_KEY);
    localStorage.removeItem(STORAGE_KEY);
    lastDeletedId = null;
  }
  localStorage.setItem(LAST_UID_KEY, uid);
}

/* =========================================================
   TABS & NAVIGATION (DESKTOP + MOBILE APP BAR)
   ========================================================= */
function switchTab(tab) {
  if (tab === 'debts' && !hasFeature('debts')) { showToast('دفتر الديون غير متاح لدورك', 'error'); return; }
  currentTab = tab;
  
  const isTx = tab === 'transactions';
  const isDebts = tab === 'debts';
  const isClients = tab === 'clients';

  const panelTx = document.getElementById('panelTransactions');
  const panelDebts = document.getElementById('panelDebts');
  const panelClients = document.getElementById('panelClients');

  panelTx?.classList.toggle('hidden', !isTx);
  panelDebts?.classList.toggle('hidden', !isDebts);
  panelClients?.classList.toggle('hidden', !isClients);

  document.getElementById('tabBtnTransactions')?.classList.toggle('active', isTx);
  document.getElementById('tabBtnDebts')?.classList.toggle('active', isDebts);
  document.getElementById('tabBtnClients')?.classList.toggle('active', isClients);

  document.getElementById('mNavTx')?.classList.toggle('active', isTx);
  document.getElementById('mNavDebts')?.classList.toggle('active', isDebts);
  document.getElementById('mNavClients')?.classList.toggle('active', isClients);

  if (isClients) renderClients();

  let targetPanel = isTx ? panelTx : (isDebts ? panelDebts : panelClients);
  if (targetPanel && window.innerWidth < 768) {
    targetPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function toggleMobileMoreMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('dropMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
  
  if (window.innerWidth < 768) {
    menu.classList.add('fixed', 'bottom-20', 'right-4', 'left-4', 'w-auto');
  }
}

function toggleMenu() { 
  const menu = document.getElementById('dropMenu');
  if (!menu) return;
  menu.classList.remove('fixed', 'bottom-20', 'right-4', 'left-4', 'w-auto');
  menu.classList.toggle('hidden'); 
}

function closeMenus() { 
  const menu = document.getElementById('dropMenu');
  if (!menu) return;
  menu.classList.add('hidden'); 
  menu.classList.remove('fixed', 'bottom-20', 'right-4', 'left-4', 'w-auto');
}

window.addEventListener('click', event => {
  const btn = document.getElementById('menuBtn');
  const mNavBtn = document.getElementById('mNavMore');
  const menu = document.getElementById('dropMenu');
  if (menu && !menu.contains(event.target) && !btn?.contains(event.target) && !mNavBtn?.contains(event.target)) {
    closeMenus();
  }
});

function refreshAll() {
  if (isPortalModeActive) return;
  updateMetrics();
  renderTransactions();
  renderDebts();
  renderClients();
  updateCharts();
  updateBudget();
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
  
  const fDate = document.getElementById('formDate');
  if (fDate) fDate.value = todayString();
  const fTime = document.getElementById('formTime');
  if (fTime) fTime.value = currentInputTimeString();

  try {
    const cached = localStorage.getItem(PERMS_CACHE_KEY);
    if (cached) rolePermissions = JSON.parse(cached);
  } catch(e) {}
  
  applyRoleUI();
  updatePinUI();

  showAuthLoading();
  await handleRedirectResult();

  setTimeout(() => {
    hideAuthLoading();
    if (!currentUser && !authResolved) {
      showLoginWall();
    }
  }, 2500);
});