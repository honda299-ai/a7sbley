/* =========================================================
   EHSEBLI / HONDA FINANCIAL MANAGER V9.6
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
   AUTH STATE CHANGE (WITH DIRECT REALTIME LISTENER)
   ========================================================= */
auth.onAuthStateChanged(async user => {
  if (isPortalModeActive) return;

  hideAuthLoading();
  authResolved = true;

  const avatar = document.getElementById('userAvatar');
  const cloudStatus = document.getElementById('cloudStatus');
  const syncEmail = document.getElementById('syncUserEmail');
  const menuEmail = document.getElementById('menuUserEmail');
  const footerSync = document.getElementById('footerSyncStatus');

  if (user) {
    currentUser = user;
    handleUserSwitch(user.uid);

    hideLoginWall();

    if (avatar) {
      if (user.photoURL) avatar.src = user.photoURL;
      else avatar.src = 'logo.png';
    }

    cloudStatus?.classList.remove('hidden');
    cloudStatus?.classList.add('flex');
    const userIdentifier = user.email || user.phoneNumber || 'مستخدم';
    if (syncEmail) syncEmail.textContent = userIdentifier;
    if (menuEmail) menuEmail.textContent = userIdentifier;
    if (footerSync) footerSync.innerHTML = `<i class="fa-solid fa-cloud-check text-emerald-500"></i> متصل بالسحاب (${escapeHTML(userIdentifier)})`;

    await loadUserRole(user.uid);
    await loadRolePermissions();

    loadLocalData();
    refreshAll();
    switchTab('transactions');

    subscribeToUserDoc(user.uid);
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
    
    if (userDocUnsubscribe) {
      try { userDocUnsubscribe(); } catch(e) {}
      userDocUnsubscribe = null;
    }
    if (transactionsUnsubscribe) {
      try { transactionsUnsubscribe(); } catch(e) {}
      transactionsUnsubscribe = null;
    }
    
    hidePinLock();
    showLoginWall();
    if (footerSync) footerSync.innerHTML = `<i class="fa-solid fa-database text-amber-500"></i> سجّل الدخول للمزامنة`;
    loadLocalData();
    applyRoleUI();
  }
});

function logout() {
  if (!currentUser) return;
  closeMenus();
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

async function forceSyncToCloud() {
  if (!currentUser) return;
  try {
    const cleanTransactions = JSON.parse(
      JSON.stringify(transactions.map(normalizeTransaction), (k, v) => (v === undefined ? null : v))
    );
    await db.collection('users').doc(currentUser.uid).set({
      transactions: cleanTransactions,
      budget: getBudget() || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Force sync error: ", error);
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
      showToast('تمت مزامنة بياناتك من السحابة ✓', 'success');
    } else {
      if (transactions.length > 0) await forceSyncToCloud();
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
  if (!isPortalModeActive) updateCharts();
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
function saveData(options = {}) {
  if (!requireAuth()) return;
  saveLocalData();
  if (options.force) forceSyncToCloud(); else syncToCloud();
}

/* =========================================================
   PERIODS & DAYS FILTERS
   ========================================================= */
function setPeriod(period) {
  if (!requireAuth()) return;
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  
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

  const labels = { 
    all: 'كل البيانات', 
    today: 'النهاردة', 
    yesterday: 'امبارح', 
    before_yesterday: 'أول أمس', 
    week: 'هذا الأسبوع', 
    month: 'هذا الشهر',
    year: 'هذه السنة'
  };
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

  document.getElementById('statDebtReceivable').textContent = money(metrics.debtRec) + ' ج.م';
  document.getElementById('statDebtPayable').textContent = money(metrics.debtPay) + ' ج.م';

  const daily = getPeriodTransactions().filter(t => !isDebt(t.type));
  const debts = getActiveTransactions().filter(t => isDebt(t.type) && t.status !== 'paid');
  
  const bTx = document.getElementById('badgeTxCount');
  if (bTx) bTx.textContent = daily.length;
  const bDebt = document.getElementById('badgeDebtCount');
  if (bDebt) bDebt.textContent = debts.length;
  const bClient = document.getElementById('badgeClientCount');
  if (bClient) bClient.textContent = getAllClientNames().length;

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
    card.className = 'p-2.5 rounded-xl border border-slate-100 dark:border-dark-750 bg-slate-50 dark:bg-dark-850/60 flex flex-col justify-between';
    
    let icon = 'fa-wallet';
    if (method.includes('كاش')) icon = 'fa-money-bill-1-wave';
    else if (method.includes('إنستاباي')) icon = 'fa-bolt';
    else if (method.includes('محفظة')) icon = 'fa-mobile-screen-button';
    else if (method.includes('فيزا')) icon = 'fa-credit-card';

    card.innerHTML = `
      <div class="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold truncate">
        <i class="fa-solid ${icon} text-orange-500"></i>
        <span class="truncate">${escapeHTML(method.split(' ')[0])}</span>
      </div>
      <div class="mt-1 font-black text-xs money-val ${bal >= 0 ? 'text-slate-800 dark:text-slate-100' : 'text-rose-500'}">
        ${money(bal)} <span class="text-[9px] text-slate-400">ج.م</span>
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
   TRANSACTIONS RENDER (DESKTOP + MOBILE CARDS)
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
  const search = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

  if (tbody) tbody.innerHTML = '';
  if (mobileList) mobileList.innerHTML = '';

  let list = getPeriodTransactions().filter(t => {
    if (isDebt(t.type)) return false;
    if (activeFilter !== 'all' && t.type !== activeFilter) return false;
    if (!search) return true;
    const text = [t.category, t.notes, t.client, t.paymentMethod, t.reference, t.time, typeName(t.type)].join(' ').toLowerCase();
    return text.includes(search);
  });

  list.sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));

  if (!list.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

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

    // 1. جدول الكمبيوتر
    if (tbody) {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 dark:hover:bg-dark-850/60 transition group';
      tr.innerHTML = `
        <td class="py-3 px-4">
          <div class="flex items-center gap-2.5">
            ${badge}
            <div>
              <div class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <span>${escapeHTML(item.notes || 'بدون بيان')}</span>
                ${item.receipt ? `<button onclick="viewReceiptImage('${item.receipt}')" class="text-orange-500 hover:text-orange-400"><i class="fa-solid fa-paperclip text-xs"></i></button>` : ''}
              </div>
              ${item.reference ? `<div class="text-[9px] text-slate-400 mt-0.5">مرجع: ${escapeHTML(item.reference)}</div>` : ''}
            </div>
          </div>
        </td>
        <td class="py-3 px-4">
          ${item.client ? `<button onclick="openClientLedger('${escapeHTML(item.client)}')" class="inline-flex items-center gap-1 text-xs font-black text-orange-500 hover:underline"><i class="fa-solid fa-user-circle"></i> ${escapeHTML(item.client)}</button>` : '<span class="text-slate-400 text-[10px]">-</span>'}
        </td>
        <td class="py-3 px-4"><span class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-300 font-bold text-[10px]">${escapeHTML(item.category)}</span></td>
        <td class="py-3 px-4 text-slate-500 dark:text-slate-400 font-semibold">${escapeHTML(item.paymentMethod || 'كاش نقدي')}</td>
        <td class="py-3 px-4">
          <div class="font-bold text-slate-600 dark:text-slate-300 text-xs">${escapeHTML(item.date)}</div>
          <div class="text-[10px] text-orange-500 font-bold flex items-center gap-1 mt-0.5"><i class="fa-regular fa-clock"></i> ${escapeHTML(timeFormatted)}</div>
        </td>
        <td class="py-3 px-4">${amount}</td>
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center gap-1">
            <button onclick="shareViaWhatsApp('${item.id}')" title="مشاركة واتساب" class="p-2 rounded-xl text-emerald-500 hover:bg-emerald-500/10"><i class="fa-brands fa-whatsapp text-sm"></i></button>
            <button onclick="editTransaction('${item.id}')" title="تعديل" class="p-2 rounded-xl text-slate-400 hover:text-orange-500"><i class="fa-solid fa-pen text-xs"></i></button>
            <button onclick="requestDelete('${item.id}')" title="حذف" class="p-2 rounded-xl text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }

    // 2. كروت متجاوبة للموبايل
    if (mobileList) {
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
              <div class="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span>${escapeHTML(item.date)}</span>
                <span>•</span>
                <span class="text-orange-500 font-bold">${escapeHTML(timeFormatted)}</span>
                ${item.client ? `<span>•</span><span class="text-orange-400 font-bold" onclick="openClientLedger('${escapeHTML(item.client)}')"><i class="fa-solid fa-user text-[9px]"></i> ${escapeHTML(item.client)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="text-left shrink-0">
            <div class="text-sm font-black">${amount}</div>
            <span class="text-[9px] text-slate-400 block">${escapeHTML((item.paymentMethod || 'كاش').split(' ')[0])}</span>
          </div>
        </div>
        <div class="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-100/60 dark:border-dark-800">
          <button onclick="shareViaWhatsApp('${item.id}')" class="p-1 text-emerald-500"><i class="fa-brands fa-whatsapp text-sm"></i></button>
          <button onclick="editTransaction('${item.id}')" class="p-1 text-slate-400 hover:text-orange-500"><i class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="requestDelete('${item.id}')" class="p-1 text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
        </div>
      `;
      mobileList.appendChild(card);
    }
  });
}

/* =========================================================
   DEBTS RENDER
   ========================================================= */
function renderDebts() {
  const container = document.getElementById('debtsContainer');
  const empty = document.getElementById('emptyDebtsState');
  if (!container) return;
  container.innerHTML = '';

  const debts = getActiveTransactions()
    .filter(t => isDebt(t.type))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return new Date(b.date) - new Date(a.date);
    });

  if (!debts.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  debts.forEach(d => {
    const isReceivable = d.type === 'debt_receivable';
    const paid = d.status === 'paid';
    const totalAmount = Number(d.amount) || 0;
    const paidAmt = Number(d.paidAmount) || 0;
    const remainingAmt = Math.max(0, totalAmount - paidAmt);
    const progressPercent = Math.min(100, Math.round((paidAmt / totalAmount) * 100)) || 0;

    const card = document.createElement('div');
    card.className = 'p-4 rounded-2xl border ' + (
      paid ? 'bg-slate-50 dark:bg-dark-850/40 border-slate-200 dark:border-dark-800 opacity-60'
      : isReceivable ? 'bg-emerald-500/5 border-emerald-500/30'
      : 'bg-rose-500/5 border-rose-500/30'
    );

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${isReceivable ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}">
            <i class="fa-solid ${isReceivable ? 'fa-user-plus' : 'fa-user-minus'}"></i>
          </div>
          <div class="min-w-0">
            <h4 class="text-sm font-black truncate flex items-center gap-1.5">
              <span>${escapeHTML(d.notes || 'دين بدون بيان')}</span>
              ${d.receipt ? `<button onclick="viewReceiptImage('${d.receipt}')" class="text-orange-500"><i class="fa-solid fa-paperclip text-xs"></i></button>` : ''}
            </h4>
            <p class="text-[10px] text-slate-400 font-semibold mt-0.5">
              ${d.client ? `<span class="text-orange-500 font-black cursor-pointer" onclick="openClientLedger('${escapeHTML(d.client)}')"><i class="fa-solid fa-user"></i> ${escapeHTML(d.client)} • </span>` : ''}
              ${escapeHTML(d.category)} • ${escapeHTML(d.date)}
            </p>
          </div>
        </div>
        <div class="text-left shrink-0">
          <div class="money-val text-base font-black ${isReceivable ? 'text-emerald-500' : 'text-rose-500'}">${money(remainingAmt)} ج.م</div>
          ${paidAmt > 0 && !paid ? `<div class="text-[9px] text-slate-400">سُدد ${money(paidAmt)} من ${money(totalAmount)}</div>` : ''}
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-200/60 dark:border-dark-800 flex flex-wrap items-center justify-between gap-2">
        <span class="text-[10px] font-black ${paid ? 'text-slate-400' : isReceivable ? 'text-emerald-500' : 'text-rose-500'}">
          ${paid ? 'تم السداد بالكامل ✓' : isReceivable ? 'مستحق لي - معلق' : 'مستحق عليّ - معلق'}
        </span>
        <div class="flex items-center gap-1.5">
          ${!paid ? `
            <button onclick="openDebtPaymentModal('${d.id}')" class="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white text-[10px] font-black transition">
              <i class="fa-solid fa-hand-holding-dollar"></i> دفعة جزئية
            </button>
          ` : ''}
          <button onclick="toggleDebtStatus('${d.id}')" class="px-2.5 py-1.5 rounded-xl ${paid ? 'bg-slate-200 dark:bg-dark-750 text-slate-700 dark:text-slate-300' : 'bg-orange-500 text-white'} text-[10px] font-black">${paid ? 'إعادة كمعلق' : 'تم السداد كلياً ✓'}</button>
          <button onclick="editTransaction('${d.id}')" class="p-2 rounded-xl text-slate-400 hover:text-orange-500"><i class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="requestDelete('${d.id}')" class="p-2 rounded-xl text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
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

  const sub = document.getElementById('debtPayModalSubtitle');
  if (sub) sub.textContent = `الدين: ${debt.notes} (المتبقي: ${money(rem)} ج.م)`;
  const amtInput = document.getElementById('partialPayAmount');
  if (amtInput) { amtInput.value = ''; amtInput.max = rem; }

  const modal = document.getElementById('debtPaymentModal');
  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
}

function closeDebtPaymentModal() {
  const modal = document.getElementById('debtPaymentModal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
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
  if (!container) return;
  container.innerHTML = '';

  let clientNames = getAllClientNames();
  if (q) clientNames = clientNames.filter(name => name.toLowerCase().includes(q));

  if (!clientNames.length) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

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
    card.className = 'glow-card bg-slate-50 dark:bg-dark-850 p-4 rounded-2xl border border-slate-200 dark:border-dark-750 cursor-pointer flex flex-col justify-between';
    card.onclick = () => openClientLedger(name);

    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center font-black text-sm">
            ${escapeHTML(name.charAt(0).toUpperCase())}
          </div>
          <div>
            <h4 class="font-black text-sm text-slate-800 dark:text-slate-100">${escapeHTML(name)}</h4>
            <p class="text-[10px] text-slate-400 font-bold">${txs.length} معاملة مسجلة</p>
          </div>
        </div>
        <span class="text-orange-500 text-xs"><i class="fa-solid fa-chevron-left"></i></span>
      </div>
      <div class="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-200/60 dark:border-dark-800">
        <div class="text-[10px]">
          <span class="text-slate-400 block font-bold">باقي عليه (لك):</span>
          <span class="money-val font-black ${totalDebtReceivable > 0 ? 'text-cyan-500' : 'text-slate-500'}">${money(totalDebtReceivable)} ج.م</span>
        </div>
        <div class="text-[10px]">
          <span class="text-slate-400 block font-bold">إجمالي الخدمات:</span>
          <span class="money-val font-black text-emerald-500">${money(totalIncome)} ج.م</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function openClientLedger(clientName) {
  activeClientName = clientName;
  const title = document.getElementById('clientModalName');
  if (title) title.textContent = `كشف حساب: ${clientName}`;
  const initial = document.getElementById('clientModalInitial');
  if (initial) initial.textContent = clientName.charAt(0).toUpperCase();

  const txs = getActiveTransactions().filter(t => t.client && t.client.trim().toLowerCase() === clientName.toLowerCase())
    .sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));

  let income = 0, debtRec = 0, debtPay = 0;
  const tbody = document.getElementById('clientTransactionsTbody');
  const empty = document.getElementById('emptyClientTxState');
  if (tbody) tbody.innerHTML = '';

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
          <td class="py-2.5 px-3">
            <div class="font-bold">${escapeHTML(t.date)}</div>
            <div class="text-[9px] text-orange-500 font-bold">${escapeHTML(formatTimeTo12Hour(t.time || ''))}</div>
          </td>
          <td class="py-2.5 px-3">
            <div class="font-bold">${escapeHTML(t.notes || t.category)}</div>
          </td>
          <td class="py-2.5 px-3 text-slate-400 font-semibold">${escapeHTML(t.paymentMethod || 'كاش')}</td>
          <td class="py-2.5 px-3 font-black ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">
            ${t.type === 'income' ? '+' : '-'}${money(t.amount)} ج.م
          </td>
          <td class="py-2.5 px-3 text-center">
            ${t.receipt ? `<button onclick="viewReceiptImage('${t.receipt}')" class="text-orange-500 hover:underline text-[10px] font-bold"><i class="fa-solid fa-image"></i> الفاتورة</button>` : '-'}
          </td>
        `;
        tbody.appendChild(tr);
      }
    });
  }

  document.getElementById('clientTotalIncome').textContent = money(income) + ' ج.م';
  document.getElementById('clientTotalReceivable').textContent = money(debtRec) + ' ج.م';
  document.getElementById('clientTotalPayable').textContent = money(debtPay) + ' ج.م';

  const modal = document.getElementById('clientLedgerModal');
  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
}

function closeClientLedger() {
  const modal = document.getElementById('clientLedgerModal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
  activeClientName = null;
}

function openModalForSpecificClient() {
  const name = activeClientName;
  closeClientLedger();
  openModal('income');
  setTimeout(() => {
    const el = document.getElementById('formClient');
    if (el) el.value = name;
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
   CHARTS
   ========================================================= */
function updateCharts() {
  const list = getPeriodTransactions();
  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(51,65,85,.25)' : 'rgba(226,232,240,.8)';

  const map = {};
  list.forEach(t => {
    if (t.type === 'expense' || t.type === 'charity') {
      const category = t.type === 'charity' ? 'باب الخير' : t.category;
      map[category] = (map[category] || 0) + Number(t.amount || 0);
    }
  });

  const categories = Object.keys(map);
  const amounts = Object.values(map);
  const noData = document.getElementById('noDataCategory');

  if (categoryChartInstance) categoryChartInstance.destroy();

  const ctxCat = document.getElementById('categoryChart')?.getContext('2d');
  if (ctxCat) {
    if (!categories.length) {
      noData?.classList.remove('hidden'); noData?.classList.add('flex');
    } else {
      noData?.classList.add('hidden'); noData?.classList.remove('flex');
      categoryChartInstance = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: categories,
          datasets: [{
            data: amounts,
            backgroundColor: ['#ea580c','#f97316','#fb923c','#f59e0b','#10b981','#06b6d4','#8b5cf6','#64748b','#ef4444'],
            borderWidth: 2,
            borderColor: isDark ? '#0f1117' : '#ffffff'
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', rtl: true, labels: { color: textColor, font: { family: 'Cairo', size: 10, weight: 'bold' }, boxWidth: 10 } } },
          cutout: '68%'
        }
      });
    }
  }

  const metrics = calculateMetrics(list);
  if (balanceChartInstance) balanceChartInstance.destroy();

  const ctxBar = document.getElementById('balanceBarChart')?.getContext('2d');
  if (ctxBar) {
    balanceChartInstance = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: ['الإيرادات', 'المصاريف', 'باب الخير'],
        datasets: [{
          data: [metrics.income, metrics.expense, metrics.charity],
          backgroundColor: ['rgba(16,185,129,.85)','rgba(244,63,94,.85)','rgba(249,115,22,.9)'],
          borderRadius: 10, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: { label: ctx => ' ' + money(ctx.raw) + ' ج.م' } } },
        scales: {
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Cairo', size: 10 }, callback: v => money(v) } },
          x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'Cairo', size: 11, weight: 'bold' } } }
        }
      }
    });
  }
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
  form?.reset();

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
    document.getElementById('formReference').value = item.reference || '';
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

  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
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
  const icon = document.getElementById('modalIconBox');

  if (select) {
    select.innerHTML = '';
    (CATEGORIES[type] || ['عام']).forEach(c => {
      const option = document.createElement('option');
      option.value = c; option.textContent = c;
      select.appendChild(option);
    });
  }

  if (title && icon) {
    if (type === 'charity') {
      title.textContent = editingId ? 'تعديل باب الخير' : 'تسجيل صدقة أو عمل خير';
      icon.innerHTML = '<i class="fa-solid fa-heart text-orange-500"></i>';
    } else if (type === 'income') {
      title.textContent = editingId ? 'تعديل الدخل' : 'تسجيل دخل / إيراد جديد';
      icon.innerHTML = '<i class="fa-solid fa-arrow-trend-up text-emerald-500"></i>';
    } else if (type === 'debt_receivable') {
      title.textContent = editingId ? 'تعديل دين مستحق لي' : 'تسجيل دين مستحق لي';
      icon.innerHTML = '<i class="fa-solid fa-user-plus text-cyan-500"></i>';
    } else if (type === 'debt_payable') {
      title.textContent = editingId ? 'تعديل دين عليّ' : 'تسجيل دين مستحق عليّ';
      icon.innerHTML = '<i class="fa-solid fa-user-minus text-purple-500"></i>';
    } else {
      title.textContent = editingId ? 'تعديل مصروف' : 'تسجيل مصروف جديد';
      icon.innerHTML = '<i class="fa-solid fa-arrow-trend-down text-rose-500"></i>';
    }
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
  const reference = sanitizeString(document.getElementById('formReference').value, 50);
  const notes = sanitizeString(document.getElementById('formNotes').value, 200);

  if (!amount || amount <= 0 || amount > 1e9) { 
    showToast('يرجى إدخال مبلغ صحيح (أكبر من 0)', 'error'); return; 
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
      reference,
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
      reference,
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
    `سيتم حذف: <strong>${escapeHTML(item.notes || item.category)}</strong> بمبلغ <strong>${money(item.amount)} ج.م</strong>.`,
    () => deleteTransaction(id)
  );
}

function deleteTransaction(id) {
  if (!requireAuth()) return;
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  tx._deleted = true;
  tx._updatedAt = Date.now();
  lastDeletedId = id;
  saveData();
  refreshAll();
  showToast('تم حذف العملية — اضغط "تراجع" لاستعادتها', 'info', true);
}

function undoDelete() {
  if (!lastDeletedId || !requireAuth()) return;
  const tx = transactions.find(t => t.id === lastDeletedId);
  if (tx) { tx._deleted = false; tx._updatedAt = Date.now(); }
  lastDeletedId = null;
  saveData();
  refreshAll();
  showToast('تم استرجاع العملية بنجاح', 'success');
}

/* =========================================================
   CONFIRM MODAL
   ========================================================= */
let confirmCallback = null;
function openConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').innerHTML = message;
  confirmCallback = callback;
  const modal = document.getElementById('confirmModal');
  modal?.classList.remove('hidden'); modal?.classList.add('flex');
  document.getElementById('confirmActionBtn').onclick = () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  };
}
function closeConfirm() {
  const modal = document.getElementById('confirmModal');
  modal?.classList.add('hidden'); modal?.classList.remove('flex');
  confirmCallback = null;
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
   BUDGET
   ========================================================= */
function getBudget() { return Number(localStorage.getItem(BUDGET_KEY) || 0); }

function openBudgetModal() {
  if (!requireAuth()) return;
  if (!hasFeature('budget')) { showToast('الميزانية غير متاحة لدورك', 'error'); return; }
  closeMenus();
  document.getElementById('budgetInput').value = getBudget() || '';
  const modal = document.getElementById('budgetModal');
  modal?.classList.remove('hidden'); modal?.classList.add('flex');
}
function closeBudgetModal() {
  const modal = document.getElementById('budgetModal');
  modal?.classList.add('hidden'); modal?.classList.remove('flex');
}
function saveBudget() {
  if (!requireAuth()) return;
  const value = Number(document.getElementById('budgetInput').value);
  if (!isFinite(value) || value < 0 || value > 1e9) { showToast('قيمة الميزانية غير صحيحة', 'error'); return; }
  localStorage.setItem(BUDGET_KEY, value);
  closeBudgetModal();
  updateBudget();
  syncToCloud();
  showToast('تم حفظ الميزانية الشهرية', 'success');
}
function clearBudget() {
  if (!requireAuth()) return;
  localStorage.removeItem(BUDGET_KEY);
  closeBudgetModal();
  updateBudget();
  syncToCloud();
  showToast('تم حذف الميزانية الشهرية', 'info');
}

function updateBudget() {
  const budget = getBudget();
  const monthItems = getActiveTransactions().filter(t => isInPeriod(t.date, 'month'));
  let used = 0;
  monthItems.forEach(t => {
    if (t.type === 'expense' || t.type === 'charity') used += Number(t.amount || 0);
  });

  const bUsed = document.getElementById('budgetUsed');
  if (bUsed) bUsed.textContent = money(used);

  const bTotal = document.getElementById('budgetTotal');
  const bBar = document.getElementById('budgetBar');

  if (!budget) {
    if (bTotal) bTotal.textContent = 'غير محددة';
    if (bBar) bBar.style.width = '0%';
    return;
  }

  if (bTotal) bTotal.textContent = money(budget) + ' ج.م';
  const percent = Math.min(100, (used / budget) * 100);
  if (bBar) bBar.style.width = percent + '%';
}

/* =========================================================
   BACKUP & EXPORT
   ========================================================= */
function openBackupModal() {
  if (!requireAuth()) return;
  if (!hasFeature('backup')) { showToast('النسخ الاحتياطي غير متاح لدورك', 'error'); return; }
  closeMenus();
  const modal = document.getElementById('backupModal');
  modal?.classList.remove('hidden'); modal?.classList.add('flex');
}
function closeBackupModal() {
  const modal = document.getElementById('backupModal');
  modal?.classList.add('hidden'); modal?.classList.remove('flex');
}

function downloadBackup() {
  if (!requireAuth()) return;
  const backup = {
    app: 'Ehsebli Honda Financial Manager',
    version: '9.6',
    createdAt: new Date().toISOString(),
    transactions,
    budget: getBudget(),
    count: transactions.length
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `احسبلي_نسخة_احتياطية_${todayString()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast(`تم تحميل النسخة الاحتياطية (${transactions.length} عملية)`, 'success');
}

function restoreBackup(event) {
  if (!requireAuth()) { event.target.value = ''; return; }
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      let restored = Array.isArray(backup) ? backup : backup.transactions;
      restored = restored.filter(validateTransaction);
      if (!restored.length) throw new Error('No valid transactions');

      openConfirm('استعادة النسخة؟', `سيتم استبدال العمليات بـ <strong>${restored.length}</strong> عملية.`, () => {
        const now = Date.now();
        transactions = restored.map((item, i) => normalizeTransaction({ ...item, _updatedAt: now + i }));
        if (backup.budget !== undefined) localStorage.setItem(BUDGET_KEY, Number(backup.budget) || 0);
        saveData({ force: true });
        refreshAll();
        closeBackupModal();
        showToast('تم استعادة النسخة الاحتياطية بنجاح', 'success');
      });
    } catch (error) {
      showToast('ملف النسخة الاحتياطية غير صالح', 'error');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function exportToCSV() {
  if (!requireAuth()) return;
  if (!hasFeature('export')) { showToast('التصدير غير متاح لدورك', 'error'); return; }
  closeMenus();
  const list = getActiveTransactions();
  if (!list.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }

  let csv = '\uFEFF';
  csv += 'المعرف,النوع,المبلغ,العميل,التصنيف,طريقة الدفع,التاريخ,الوقت,المرجع,البيان,الحالة\n';
  list.forEach(t => {
    const row = [
      t.id, typeName(t.type), t.amount, t.client || '', t.category,
      t.paymentMethod || '', t.date, t.time || '', t.reference || '', t.notes || '',
      t.status === 'paid' ? 'مسدد' : t.status === 'pending' ? 'معلق' : 'منجز'
    ];
    csv += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `احسبلي_${todayString()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('تم تصدير ملف Excel CSV بنجاح', 'success');
}

function printReport() {
  if (!requireAuth()) return;
  if (!hasFeature('reports')) { showToast('التقارير غير متاحة لدورك', 'error'); return; }
  closeMenus();
  window.print();
}

function confirmClearData() {
  if (!requireAuth()) return;
  closeMenus();
  openConfirm('تصفير جميع البيانات؟', 'سيتم حذف كل المعاملات والميزانية نهائياً.', () => {
    transactions = [];
    localStorage.removeItem(BUDGET_KEY);
    saveData({ force: true });
    refreshAll();
    showToast('تم تصفير البيانات بالكامل', 'info');
  });
}

function loadDemoData() {
  if (!requireAuth()) return;
  closeMenus();
  openConfirm('تحميل البيانات التجريبية؟', 'سيتم استبدال المعاملات الحالية بالبيانات النموذجية.', () => {
    const now = Date.now();
    transactions = JSON.parse(JSON.stringify(DEMO_ITEMS)).map((t, i) => normalizeTransaction({ ...t, _updatedAt: now + i }));
    saveData({ force: true });
    refreshAll();
    showToast('تم تحميل البيانات التجريبية', 'success');
  });
}

/* =========================================================
   PIN SECURITY
   ========================================================= */
function openPinModal() {
  if (!requireAuth()) return;
  closeMenus();
  const modal = document.getElementById('pinModal');
  const title = document.getElementById('pinTitle');
  const action = document.getElementById('pinActionBtn');
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError')?.classList.add('hidden');
  if (title) title.textContent = !getPin() ? 'إنشاء PIN' : 'تغيير PIN';
  if (action) action.textContent = !getPin() ? 'تفعيل القفل' : 'تغيير الرمز';
  modal?.classList.remove('hidden'); modal?.classList.add('flex');
  setTimeout(() => document.getElementById('pinInput')?.focus(), 100);
}

function closePinModal() {
  const modal = document.getElementById('pinModal');
  modal?.classList.add('hidden'); modal?.classList.remove('flex');
}

async function handlePinAction() {
  const pin = document.getElementById('pinInput').value.trim();
  const error = document.getElementById('pinError');
  if (!/^\d{4,6}$/.test(pin)) {
    if (error) { error.textContent = 'PIN يجب أن يكون من 4 إلى 6 أرقام'; error.classList.remove('hidden'); }
    return;
  }
  localStorage.setItem(PIN_KEY, await hashPin(pin));
  closePinModal();
  updatePinUI();
  showToast('تم حفظ PIN بنجاح', 'success');
  showPinLock();
}

function confirmRemovePin() {
  if (!requireAuth()) return;
  closeMenus();
  openConfirm('إزالة رمز القفل؟', 'سيتم إلغاء قفل التطبيق PIN.', () => {
    localStorage.removeItem(PIN_KEY);
    updatePinUI();
    showToast('تمت إزالة رمز القفل', 'success');
  });
}

async function unlockApp() {
  const input = document.getElementById('unlockPinInput');
  const entered = input.value.trim();
  const stored = getPin();
  if (!stored) { hidePinLock(); return; }
  const ok = (await hashPin(entered)) === stored;
  if (ok) { hidePinLock(); input.value = ''; }
  else {
    document.getElementById('unlockError')?.classList.remove('hidden');
    input.value = '';
    input.focus();
  }
}

async function forgotPinUnlock() {
  if (!currentUser) return;
  const user = currentUser;
  const providers = (user.providerData || []).map(p => p.providerId);
  try {
    if (providers.includes('google.com')) {
      const provider = new firebase.auth.GoogleAuthProvider();
      const res = await user.reauthenticateWithPopup(provider);
      if (res.user && res.user.uid === user.uid) {
        localStorage.removeItem(PIN_KEY);
        updatePinUI();
        hidePinLock();
        showToast('تم التحقق — أزيل القفل', 'success');
      }
    } else {
      const pwd = prompt('أدخل كلمة السر لتأكيد هويتك:');
      if (!pwd) return;
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, pwd);
      await user.reauthenticateWithCredential(cred);
      localStorage.removeItem(PIN_KEY);
      updatePinUI();
      hidePinLock();
      showToast('تم التحقق — أزيل القفل', 'success');
    }
  } catch (error) {
    showToast('فشل التحقق من الهوية', 'error');
  }
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

  // النزول الساحر للوحة المطلوبة على شاشات الموبايل
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

let toastTimer = null;
function showToast(message, type = 'success', allowUndo = false) {
  const box = document.getElementById('toastBox');
  const inner = document.getElementById('toastInner');
  if (!box || !inner) return;

  let icon = 'fa-solid fa-circle-check';
  let classes = 'bg-dark-900 text-white border-orange-500/40';
  if (type === 'error') { icon = 'fa-solid fa-circle-exclamation'; classes = 'bg-rose-950 text-white border-rose-500/50'; }
  else if (type === 'info') { icon = 'fa-solid fa-circle-info'; classes = 'bg-dark-850 text-slate-100 border-slate-700'; }

  inner.className = `flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl text-xs font-black border ${classes}`;
  inner.innerHTML = `
    <i class="${icon} ${type === 'error' ? 'text-rose-400' : type === 'info' ? 'text-blue-400' : 'text-orange-500'}"></i>
    <span id="toastMsgSpan"></span>
    ${allowUndo ? '<button onclick="undoDelete()" class="mr-2 px-2.5 py-1 rounded-lg bg-orange-500 text-white text-[10px] font-black pointer-events-auto">تراجع</button>' : ''}
  `;
  document.getElementById('toastMsgSpan').textContent = message;
  box.classList.remove('opacity-0', '-translate-y-5');
  box.classList.add('opacity-100', 'translate-y-0');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.classList.remove('opacity-100', 'translate-y-0');
    box.classList.add('opacity-0', '-translate-y-5');
  }, allowUndo ? 6000 : 3500);
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

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeModal(); closeConfirm(); closeBackupModal();
    closeBudgetModal(); closePinModal(); closeMenus();
    closeAdminPanel(); closeUserPermissionsModal();
    closeDebtPaymentModal(); closeReceiptViewer();
    closeClientLedger();
  }
});

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

  // صمام أمان لإخفاء شاشة اللودنج حتى لو تأخر الرد
  setTimeout(() => {
    hideAuthLoading();
    if (!currentUser && !authResolved) {
      showLoginWall();
    }
  }, 2500);
});