/* =========================================================
   EHSEBLI / HONDA FINANCIAL MANAGER V6.1
   Super Admin + Search + Individual Permissions + Live Sync
   + Bug Fix: New users now properly saved to Firestore
   ========================================================= */

/* =========================================================
   👑 SUPER ADMIN EMAILS
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
const LAST_UID_KEY = 'ehsebli_last_uid';
const PERMS_CACHE_KEY = 'ehsebli_perms_cache';

/* ---------- State ---------- */
let currentUser = null;
let transactions = [];
let activeFilter = 'all';
let currentPeriod = 'all';
let currentTab = 'transactions';
let editingId = null;
let userRole = 'free';
let isSuperAdmin = false;

let categoryChartInstance = null;
let balanceChartInstance = null;
let lastDeletedId = null;

let searchDebounceTimer = null;
let syncInProgress = false;
let syncPending = false;
let authResolved = false;

let adminActiveTab = 'users';
let usersSearchQuery = '';
let editingUserPermissions = null;
let currentUserPermissionsOverride = null;
let userDocUnsubscribe = null;

/* =========================================================
   ROLES META
   ========================================================= */
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
   HELPERS
   ========================================================= */
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
    date: t.date,
    category: sanitizeString(t.category, 100),
    paymentMethod: sanitizeString(t.paymentMethod, 50),
    reference: sanitizeString(t.reference, 50),
    notes: sanitizeString(t.notes, 200),
    status: t.status === 'paid' || t.status === 'pending' ? t.status : undefined,
    _deleted: t._deleted === true ? true : undefined,
    _updatedAt: Number(t._updatedAt) || Date.now()
  };
}

/* =========================================================
   PERMISSION HELPERS
   ========================================================= */
function hasFeature(feature) {
  if (isSuperAdmin || userRole === 'admin') return true;
  
  if (currentUserPermissionsOverride && 
      typeof currentUserPermissionsOverride[feature] === 'boolean') {
    return currentUserPermissionsOverride[feature];
  }
  
  const perms = rolePermissions[userRole];
  if (!perms) return false;
  return perms[feature] === true;
}

function getMaxTransactions() {
  if (isSuperAdmin || userRole === 'admin') return -1;
  
  if (currentUserPermissionsOverride && 
      typeof currentUserPermissionsOverride.maxTransactions === 'number') {
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
    console.warn('Could not load role permissions:', error);
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
    console.error('Save perms error:', error);
    showToast('فشل الحفظ في السحابة', 'error');
    return false;
  }
}

/* =========================================================
   APPLY ROLE UI
   ========================================================= */
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
      badge.className = 'hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-500';
      badge.innerHTML = '<i class="fa-solid fa-crown"></i> Super Admin';
    } else {
      const meta = ROLES_META[userRole] || ROLES_META.free;
      badge.className = `hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${meta.badgeClasses}`;
      badge.innerHTML = `<i class="fa-solid ${meta.icon}"></i> ${meta.name}`;
    }
  }
}

/* =========================================================
   USER ROLE LOAD (v6.1 - Fixed: No query for new users)
   ========================================================= */
async function loadUserRole(uid) {
  try {
    const userEmail = (currentUser.email || '').toLowerCase().trim();
    isSuperAdmin = isSuperAdminEmail(userEmail);

    // 👑 Super Admin handling
    if (isSuperAdmin) {
      userRole = 'admin';
      currentUserPermissionsOverride = null;
      await db.collection('users').doc(uid).set({
        role: 'admin',
        email: currentUser.email,
        displayName: currentUser.displayName || '',
        isSuperAdmin: true,
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return;
    }

    // 📄 Read existing user doc (own doc only — allowed by rules)
    const doc = await db.collection('users').doc(uid).get();

    if (doc.exists && doc.data().role && ROLES_META[doc.data().role]) {
      // ✅ موجود بالفعل
      userRole = doc.data().role;
      currentUserPermissionsOverride = doc.data().permissionsOverride || null;

      // 🛡️ حماية إضافية: بس Super Admin يقدر يبقى admin
      if (userRole === 'admin' && !isSuperAdmin) {
        userRole = 'free';
      }

      // تحديث آخر تسجيل دخول بدون تغيير دور
      await db.collection('users').doc(uid).set({
        email: currentUser.email,
        displayName: currentUser.displayName || '',
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } else {
      // 🆕 مستخدم جديد → افتراضي "مجاني" (بدون query على كل المستخدمين)
      userRole = 'free';
      currentUserPermissionsOverride = null;

      await db.collection('users').doc(uid).set({
        role: 'free',
        email: currentUser.email,
        displayName: currentUser.displayName || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  } catch (error) {
    console.error('Role load error:', error);
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

/* =========================================================
   ADMIN PANEL
   ========================================================= */
function switchAdminTab(tab) {
  adminActiveTab = tab;
  const isUsers = tab === 'users';
  document.getElementById('adminTabUsers').classList.toggle('active', isUsers);
  document.getElementById('adminTabPerms').classList.toggle('active', !isUsers);
  document.getElementById('adminPanelUsers').classList.toggle('hidden', !isUsers);
  document.getElementById('adminPanelPerms').classList.toggle('hidden', isUsers);

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
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  await loadRolePermissions();
  switchAdminTab('users');
}

function closeAdminPanel() {
  const modal = document.getElementById('adminModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function filterUsersList() {
  usersSearchQuery = (document.getElementById('usersSearchInput').value || '').trim().toLowerCase();
  renderUsersList();
}

async function renderUsersList() {
  const container = document.getElementById('usersList');
  const searchCount = document.getElementById('usersSearchCount');
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
      const isSuper = isSuperAdminEmail(emailLower);
      const isMe = doc.id === currentUser.uid;
      const roleKey = data.role || 'free';
      const hasOverride = data.permissionsOverride && Object.keys(data.permissionsOverride).length > 0;

      let priority = 3;
      if (isSuper) priority = 0;
      else if (roleKey === 'admin') priority = 1;
      else if (isMe) priority = 2;

      users.push({ doc, data, isSuper, isMe, roleKey, priority, emailLower, nameLower, hasOverride });
    });

    const q = usersSearchQuery;
    if (q) {
      users = users.filter(u => u.emailLower.includes(q) || u.nameLower.includes(q));
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

      card.innerHTML = `
        <div class="min-w-0 flex-1">
          <div class="text-xs font-black truncate flex items-center gap-1.5 flex-wrap">
            ${isSuper ? '<i class="fa-solid fa-crown text-amber-500"></i>' : `<i class="fa-solid ${meta.icon}"></i>`}
            <span class="truncate">${escapeHTML(data.displayName || 'بدون اسم')}</span>
            ${isSuper ? '<span class="text-[9px] text-amber-500 font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30">👑 SUPER</span>' : ''}
            ${hasOverride ? '<span class="text-[9px] text-cyan-500 font-black px-1.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30">🎛️ خاص</span>' : ''}
            ${isMe ? '<span class="text-[9px] text-orange-500 font-black">(أنت)</span>' : ''}
          </div>
          <div class="text-[10px] text-slate-400 truncate mt-0.5">${escapeHTML(data.email || '')}</div>
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
    console.error('Users list error:', error);
    container.innerHTML = '<div class="text-center py-4 text-xs text-rose-500"><i class="fa-solid fa-triangle-exclamation"></i> خطأ في تحميل المستخدمين</div>';
  }
}

async function changeUserRole(uid, newRole) {
  if (userRole !== 'admin') { showToast('غير مصرح لك', 'error'); return; }
  if (!ROLES_META[newRole]) return;

  if (uid === currentUser.uid) {
    showToast('لا يمكنك تغيير دورك الخاص', 'error');
    renderUsersList();
    return;
  }

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
    console.error(error);
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
    const isSuper = isSuperAdminEmail(data.email);
    
    if (isSuper) {
      showToast('لا يمكن تعديل صلاحيات Super Admin 🛡️', 'error');
      return;
    }
    
    editingUserPermissions = { uid, data };
    
    document.getElementById('userPermTitle').textContent = `صلاحيات: ${data.displayName || 'بدون اسم'}`;
    document.getElementById('userPermEmail').textContent = data.email || '';
    
    const roleSelect = document.getElementById('userPermRole');
    const currentRole = data.role || 'free';
    Array.from(roleSelect.options).forEach(opt => {
      opt.selected = opt.value === currentRole;
    });
    
    renderUserPermOverrides(data.permissionsOverride || {});
    
    const modal = document.getElementById('userPermissionsModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  } catch (error) {
    console.error(error);
    showToast('فشل تحميل بيانات المستخدم', 'error');
  }
}

function renderUserPermOverrides(override) {
  const container = document.getElementById('userPermOverrides');
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
    <input type="number" min="-1" step="1" 
           class="perm-max-input" 
           id="userPermMaxTx"
           value="${maxDisplay}"
           placeholder="حسب الدور">
  `;
  container.appendChild(maxRow);
}

function resetUserPermissionsOverride() {
  if (!editingUserPermissions) return;
  renderUserPermOverrides({});
  const currentRole = editingUserPermissions.data.role || 'free';
  const roleSelect = document.getElementById('userPermRole');
  Array.from(roleSelect.options).forEach(opt => {
    opt.selected = opt.value === currentRole;
  });
  showToast('تم إعادة تعيين الصلاحيات — اضغط حفظ للتأكيد', 'info');
}

function closeUserPermissionsModal() {
  const modal = document.getElementById('userPermissionsModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  editingUserPermissions = null;
}

async function saveUserPermissionsOverride() {
  if (!editingUserPermissions) return;
  if (userRole !== 'admin') { showToast('غير مصرح', 'error'); return; }
  
  const uid = editingUserPermissions.uid;
  const newRole = document.getElementById('userPermRole').value;
  
  if (!ROLES_META[newRole]) {
    showToast('دور غير صحيح', 'error');
    return;
  }
  
  const override = {};
  
  FEATURE_LIST.forEach(feature => {
    const el = document.querySelector(`[data-feature-override="${feature.key}"]`);
    if (!el) return;
    const val = el.value;
    if (val === 'allow') override[feature.key] = true;
    else if (val === 'deny') override[feature.key] = false;
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
    console.error(error);
    showToast('فشل حفظ الصلاحيات', 'error');
  }
}

/* =========================================================
   LIVE PERMISSIONS SYNC
   ========================================================= */
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
  }, err => {
    console.warn('User doc snapshot error:', err);
  });
}

/* =========================================================
   ROLE PERMISSIONS EDITOR
   ========================================================= */
function renderPermissionsEditor() {
  const container = document.getElementById('permsList');
  container.innerHTML = '';

  Object.keys(ROLES_META).forEach(roleKey => {
    const meta = ROLES_META[roleKey];
    const isAdminRole = roleKey === 'admin';
    const perms = rolePermissions[roleKey] || {};

    const card = document.createElement('div');
    card.className = 'role-card';

    const maxVal = Number(perms.maxTransactions ?? -1);
    const maxDisplay = maxVal === -1 ? '' : maxVal;

    let rowsHtml = '';

    rowsHtml += `
      <div class="perm-row">
        <div class="perm-row-label">
          <i class="fa-solid fa-list-ol"></i>
          <span>حد العمليات (فاضي = بلا حد)</span>
        </div>
        <input type="number" min="-1" step="1"
               class="perm-max-input"
               value="${maxDisplay}"
               placeholder="∞"
               data-role="${roleKey}"
               data-key="maxTransactions"
               ${isAdminRole ? 'disabled' : ''}>
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
          <button type="button"
                  class="perm-toggle ${isOn ? 'on' : ''}"
                  data-role="${roleKey}"
                  data-key="${feature.key}"
                  onclick="togglePerm(this)"
                  ${isAdminRole ? 'disabled style="opacity:.5; cursor:not-allowed;"' : ''}>
          </button>
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
   CATEGORIES & DEMO
   ========================================================= */
const CATEGORIES = {
  expense: ['شغل وأدوات صيانة','تفعيل وسيرفرات وكريدت','أكل ومشروبات','مواصلات وبنزين','فواتير والتزامات','شخصي وعائلة','مشتريات','أخرى'],
  income: ['خدمات سوفت وير وصيانة','شحن رصيد وتفعيل أدوات','شغل ريموت أونلاين','مبيعات إكسسوار وأجهزة','عمولة / وسيط','أرباح أخرى'],
  charity: ['صدقة جارية لوجه الله','مساعدة محتاج وتفريج كربة','إطعام طعام','بر والدين وأهل','زكاة مال','أخرى'],
  debt_receivable: ['حساب محل صيانة','سلف شخصي لصديق','باقي خدمة لعميل','مبيعات آجلة','أخرى'],
  debt_payable: ['دين لمورد / موزّع سيرفر','سلف مستحق للغير','فاتورة مؤجلة','شراء آجل','أخرى']
};

const DEMO_ITEMS = [
  { id:'demo-1', type:'income', amount:1200, category:'خدمات سوفت وير وصيانة', paymentMethod:'كاش نقدي', notes:'إصلاح بوت لودر وفلاش 3 أجهزة', reference:'INV-1001', date:offsetDate(-1) },
  { id:'demo-2', type:'charity', amount:150, category:'مساعدة محتاج وتفريج كربة', paymentMethod:'كاش نقدي', notes:'صدقة شكر بنية الرزق والبركة', reference:'', date:offsetDate(-1) },
  { id:'demo-3', type:'expense', amount:380, category:'تفعيل وسيرفرات وكريدت', paymentMethod:'إنستاباي (InstaPay)', notes:'تفعيل باقة دونجل وسيرفر شاومي', reference:'EXP-3001', date:offsetDate(-2) },
  { id:'demo-4', type:'income', amount:950, category:'شغل ريموت أونلاين', paymentMethod:'إنستاباي (InstaPay)', notes:'خدمة ريموت لمحل المنصورة', reference:'INV-1002', date:offsetDate(-2) },
  { id:'demo-5', type:'expense', amount:90, category:'أكل ومشروبات', paymentMethod:'فودافون كاش / محفظة', notes:'غداء ومشروبات الشغل', reference:'', date:offsetDate(-3) },
  { id:'demo-6', type:'debt_receivable', amount:650, category:'حساب محل صيانة', paymentMethod:'آجل / معلق', notes:'محل البرنس - باقي حساب فلاش 4 أجهزة', reference:'', status:'pending', date:offsetDate(-4) },
  { id:'demo-7', type:'debt_payable', amount:400, category:'دين لمورد / موزّع سيرفر', paymentMethod:'آجل / معلق', notes:'كريدت سيرفر من الموزع محمد', reference:'', status:'pending', date:offsetDate(-5) }
];

/* =========================================================
   AUTH GUARD + PIN
   ========================================================= */
function requireAuth() {
  if (!currentUser) {
    showToast('يجب تسجيل الدخول بحساب Google أولاً', 'error');
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

/* =========================================================
   UI SHOW / HIDE
   ========================================================= */
function showAuthLoading() {
  document.body.classList.add('auth-pending');
  document.body.classList.remove('not-authed');
  document.getElementById('authLoading').style.display = 'flex';
  document.getElementById('loginWall').classList.add('hidden');
  document.getElementById('loginWall').classList.remove('flex');
}
function hideAuthLoading() {
  document.body.classList.remove('auth-pending');
  document.getElementById('authLoading').style.display = 'none';
}
function showLoginWall() {
  document.body.classList.add('not-authed');
  document.getElementById('loginWall').classList.remove('hidden');
  document.getElementById('loginWall').classList.add('flex');
  document.getElementById('userProfile').classList.add('hidden');
  document.getElementById('userProfile').classList.remove('flex');
}
function hideLoginWall() {
  document.body.classList.remove('not-authed');
  document.getElementById('loginWall').classList.add('hidden');
  document.getElementById('loginWall').classList.remove('flex');
}
function showPinLock() {
  document.getElementById('lockScreen').classList.remove('hidden');
  document.getElementById('lockScreen').classList.add('flex');
  document.getElementById('unlockPinInput').value = '';
  document.getElementById('unlockError').classList.add('hidden');
  setTimeout(() => document.getElementById('unlockPinInput').focus(), 150);
}
function hidePinLock() {
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('lockScreen').classList.remove('flex');
}

/* =========================================================
   USER SWITCH
   ========================================================= */
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
   AUTH STATE
   ========================================================= */
auth.onAuthStateChanged(async user => {
  hideAuthLoading();
  authResolved = true;

  const avatar = document.getElementById('userAvatar');
  const cloudStatus = document.getElementById('cloudStatus');
  const syncEmail = document.getElementById('syncUserEmail');
  const footerSync = document.getElementById('footerSyncStatus');
  const userProfile = document.getElementById('userProfile');

  if (user) {
    currentUser = user;
    handleUserSwitch(user.uid);

    hideLoginWall();
    userProfile.classList.remove('hidden');
    userProfile.classList.add('flex');

    avatar.src = user.photoURL || 'https://via.placeholder.com/40';
    avatar.title = user.displayName || user.email;

    cloudStatus.classList.remove('hidden');
    cloudStatus.classList.add('flex');
    syncEmail.textContent = user.email;

    footerSync.innerHTML = `<i class="fa-solid fa-cloud-check text-emerald-500"></i> متصل بالسحاب (${escapeHTML(user.email)})`;

    await loadUserRole(user.uid);
    await loadRolePermissions();

    loadLocalData();
    refreshAll();
    switchTab('transactions');

    subscribeToUserDoc(user.uid);

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
    
    hidePinLock();
    showLoginWall();
    footerSync.innerHTML = `<i class="fa-solid fa-database text-amber-500"></i> سجّل الدخول للمزامنة`;
    loadLocalData();
    applyRoleUI();
  }
});

/* =========================================================
   LOGIN / LOGOUT
   ========================================================= */
async function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const result = await auth.signInWithPopup(provider);
    showToast(`أهلاً بك يا ${result.user.displayName || 'صديقنا'} 👋`, 'success');
  } catch (error) {
    console.error('Popup error:', error.code, error.message);

    const fallbackCodes = [
      'auth/popup-blocked',
      'auth/popup-closed-by-user',
      'auth/cancelled-popup-request',
      'auth/operation-not-supported-in-this-environment',
      'auth/web-storage-unsupported'
    ];

    if (fallbackCodes.includes(error.code) || /popup/i.test(error.message || '')) {
      showToast('جاري تحويلك لتسجيل الدخول...', 'info');
      try {
        await auth.signInWithRedirect(provider);
      } catch (redirectErr) {
        console.error('Redirect error:', redirectErr);
        showToast('تعذر تسجيل الدخول: ' + redirectErr.message, 'error');
      }
      return;
    }

    if (error.code === 'auth/unauthorized-domain') {
      showToast('النطاق الحالي غير مصرح به', 'error');
    } else if (error.code === 'auth/network-request-failed') {
      showToast('مشكلة في الاتصال بالإنترنت', 'error');
    } else {
      showToast('تعذر تسجيل الدخول: ' + (error.message || error.code), 'error');
    }
  }
}

async function handleRedirectResult() {
  try {
    const result = await auth.getRedirectResult();
    if (result && result.user) {
      showToast(`أهلاً بك يا ${result.user.displayName || 'صديقنا'} 👋`, 'success');
    }
  } catch (error) {
    console.error('Redirect result error:', error);
  }
}

function logout() {
  if (!currentUser) return;
  openConfirm(
    'تسجيل الخروج؟',
    'سيتم إنهاء الجلسة الحالية. بياناتك محفوظة في السحابة وترجع لها في أي وقت.',
    () => {
      auth.signOut()
        .then(() => showToast('تم تسجيل الخروج بنجاح', 'info'))
        .catch(err => showToast('خطأ في تسجيل الخروج: ' + err.message, 'error'));
    }
  );
}

function logoutFromLock() {
  auth.signOut()
    .then(() => showToast('تم تسجيل الخروج', 'info'))
    .catch(err => showToast('خطأ: ' + err.message, 'error'));
}

/* =========================================================
   MERGE + SYNC
   ========================================================= */
function mergeTransactions(local, cloud) {
  const map = new Map();
  cloud.forEach(t => { 
    if (t && t.id && validateTransaction(t)) map.set(t.id, t); 
  });
  local.forEach(t => {
    if (!t || !t.id || !validateTransaction(t)) return;
    const existing = map.get(t.id);
    if (!existing) { map.set(t.id, t); return; }
    const a = Number(existing._updatedAt) || 0;
    const b = Number(t._updatedAt) || 0;
    if (b > a) map.set(t.id, t);
  });
  return Array.from(map.values());
}

async function syncToCloud() {
  if (!currentUser) return;
  if (syncInProgress) { syncPending = true; return; }
  syncInProgress = true;
  try {
    const docRef = db.collection('users').doc(currentUser.uid);
    const doc = await docRef.get();
    const cloudTx = doc.exists && Array.isArray(doc.data().transactions) ? doc.data().transactions : [];
    const merged = mergeTransactions(transactions, cloudTx);
    await docRef.set({
      transactions: merged,
      budget: getBudget(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Cloud sync error: ", error);
  } finally {
    syncInProgress = false;
    if (syncPending) { syncPending = false; syncToCloud(); }
  }
}

async function forceSyncToCloud() {
  if (!currentUser) return;
  try {
    await db.collection('users').doc(currentUser.uid).set({
      transactions: transactions,
      budget: getBudget(),
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
    console.warn("Firestore read failed, falling back to local: ", error);
    loadLocalData();
    refreshAll();
    showToast('تعذر الاتصال بالسحابة — تم التبديل للتخزين المحلي', 'info');
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
  if (isDark) { icon.className = 'fa-solid fa-sun text-amber-500'; text.textContent = 'الوضع النهاري'; }
  else { icon.className = 'fa-solid fa-moon text-slate-700'; text.textContent = 'الوضع الليلي'; }
}
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  updateCharts();
}

/* =========================================================
   LOCAL DATA
   ========================================================= */
function loadLocalData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const arr = saved ? JSON.parse(saved) : [];
    transactions = Array.isArray(arr) ? arr.filter(validateTransaction) : [];
  } catch (error) { console.error(error); transactions = []; }
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
   PERIODS
   ========================================================= */
function setPeriod(period) {
  if (!requireAuth()) return;
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  const labels = { all:'كل البيانات', today:'اليوم', week:'هذا الأسبوع', month:'هذا الشهر', year:'هذه السنة' };
  document.getElementById('periodLabel').textContent = labels[period] || 'كل البيانات';
  refreshAll();
}

function isInPeriod(dateString, period = currentPeriod) {
  if (period === 'all') return true;
  const date = new Date(dateString + 'T12:00:00');
  const now = new Date();
  if (period === 'today') return dateString === todayString();
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
   METRICS
   ========================================================= */
function calculateMetrics(list = getPeriodTransactions()) {
  let income = 0, expense = 0, charity = 0, debtRec = 0, debtPay = 0;
  list.forEach(t => {
    const amount = Number(t.amount) || 0;
    if (t.type === 'income') income += amount;
    else if (t.type === 'expense') expense += amount;
    else if (t.type === 'charity') charity += amount;
    else if (t.type === 'debt_receivable' && t.status !== 'paid') debtRec += amount;
    else if (t.type === 'debt_payable' && t.status !== 'paid') debtPay += amount;
  });
  return { income, expense, charity, available: income - expense - charity, debtRec, debtPay };
}

function updateMetrics() {
  const metrics = calculateMetrics();
  document.getElementById('statIncome').textContent = money(metrics.income);
  document.getElementById('statExpense').textContent = money(metrics.expense);
  document.getElementById('statCharity').textContent = money(metrics.charity);

  const net = document.getElementById('statNet');
  net.textContent = money(metrics.available);
  net.className = 'text-xl sm:text-3xl font-black ' + (metrics.available >= 0 ? 'text-emerald-500' : 'text-rose-500');

  document.getElementById('statNetTag').textContent = metrics.available >= 0
    ? 'الرصيد المتاح بعد المصاريف والخير' : 'تنبيه: المصروفات تجاوزت الإيرادات';

  document.getElementById('statDebtReceivable').textContent = money(metrics.debtRec) + ' ج.م';
  document.getElementById('statDebtPayable').textContent = money(metrics.debtPay) + ' ج.م';

  const ratio = metrics.income > 0 ? ((metrics.charity / metrics.income) * 100).toFixed(1) : '0';
  document.getElementById('statCharityRatio').textContent = ratio + '%';

  const daily = getPeriodTransactions().filter(t => !isDebt(t.type));
  const debts = getActiveTransactions().filter(t => isDebt(t.type) && t.status !== 'paid');
  document.getElementById('badgeTxCount').textContent = daily.length;
  document.getElementById('badgeDebtCount').textContent = debts.length;
}

function debouncedRenderTransactions() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(renderTransactions, 300);
}

/* =========================================================
   TRANSACTIONS RENDER
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
  const empty = document.getElementById('emptyTransactionsState');
  const search = (document.getElementById('searchInput').value || '').trim().toLowerCase();

  tbody.innerHTML = '';

  let list = getPeriodTransactions().filter(t => {
    if (isDebt(t.type)) return false;
    if (activeFilter !== 'all' && t.type !== activeFilter) return false;
    if (!search) return true;
    const text = [t.category, t.notes, t.paymentMethod, t.reference, typeName(t.type)].join(' ').toLowerCase();
    return text.includes(search);
  });

  list.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!list.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 dark:hover:bg-dark-850/60 transition group';

    let badge = '', amount = '';
    if (item.type === 'income') {
      badge = `<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl text-[10px] font-black bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><i class="fa-solid fa-arrow-trend-up"></i> دخل</span>`;
      amount = `<span class="font-black text-emerald-500">+${money(item.amount)} ج.م</span>`;
    } else if (item.type === 'charity') {
      badge = `<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl text-[10px] font-black bg-orange-500/10 text-orange-500 border border-orange-500/20"><i class="fa-solid fa-heart"></i> خير</span>`;
      amount = `<span class="font-black text-orange-500">-${money(item.amount)} ج.م</span>`;
    } else {
      badge = `<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl text-[10px] font-black bg-rose-500/10 text-rose-500 border border-rose-500/20"><i class="fa-solid fa-arrow-trend-down"></i> مصروف</span>`;
      amount = `<span class="font-black text-rose-500">-${money(item.amount)} ج.م</span>`;
    }

    tr.innerHTML = `
      <td class="py-3.5 px-4">
        <div class="flex items-center gap-3">
          ${badge}
          <div>
            <div class="font-bold text-slate-800 dark:text-slate-100">${escapeHTML(item.notes || 'بدون بيان')}</div>
            ${item.reference ? `<div class="text-[9px] text-slate-400 mt-0.5">مرجع: ${escapeHTML(item.reference)}</div>` : ''}
          </div>
        </div>
      </td>
      <td class="py-3.5 px-4"><span class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-300 font-bold text-[10px]">${escapeHTML(item.category)}</span></td>
      <td class="py-3.5 px-4 text-slate-500 dark:text-slate-400">${escapeHTML(item.paymentMethod || 'كاش نقدي')}</td>
      <td class="py-3.5 px-4 text-slate-400 dark:text-slate-500 font-bold">${escapeHTML(item.date)}</td>
      <td class="py-3.5 px-4">${amount}</td>
      <td class="py-3.5 px-4">
        <div class="flex items-center gap-1">
          <button onclick="editTransaction('${item.id}')" title="تعديل" class="p-2 rounded-xl text-slate-400 hover:text-orange-500 hover:bg-orange-500/10 transition"><i class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="requestDelete('${item.id}')" title="حذف" class="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition"><i class="fa-solid fa-trash-can text-xs"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
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
            <h4 class="text-sm font-black truncate">${escapeHTML(d.notes || 'دين بدون بيان')}</h4>
            <p class="text-[10px] text-slate-400 font-semibold mt-1">${escapeHTML(d.category)} • ${escapeHTML(d.date)}</p>
            ${d.reference ? `<p class="text-[9px] text-slate-400 mt-0.5">مرجع: ${escapeHTML(d.reference)}</p>` : ''}
          </div>
        </div>
        <span class="text-base font-black shrink-0 ${isReceivable ? 'text-emerald-500' : 'text-rose-500'}">${money(d.amount)} ج.م</span>
      </div>
      <div class="mt-4 pt-3 border-t border-slate-200/60 dark:border-dark-800 flex flex-wrap items-center justify-between gap-2">
        <span class="text-[10px] font-black ${paid ? 'text-slate-400' : isReceivable ? 'text-emerald-500' : 'text-rose-500'}">
          <i class="fa-solid ${paid ? 'fa-circle-check' : 'fa-clock'}"></i>
          ${paid ? 'تم السداد وإغلاق الدين' : isReceivable ? 'مستحق لي - معلق' : 'مستحق عليّ - معلق'}
        </span>
        <div class="flex items-center gap-1.5">
          <button onclick="editTransaction('${d.id}')" class="px-2.5 py-1.5 rounded-xl bg-orange-500/10 text-orange-500 text-[10px] font-black hover:bg-orange-500 hover:text-white transition"><i class="fa-solid fa-pen"></i> تعديل</button>
          <button onclick="toggleDebtStatus('${d.id}')" class="px-2.5 py-1.5 rounded-xl ${paid ? 'bg-slate-200 dark:bg-dark-750 text-slate-700 dark:text-slate-300' : 'bg-orange-500 text-white'} text-[10px] font-black">${paid ? 'إعادة كمعلق' : 'تم السداد ✓'}</button>
          <button onclick="requestDelete('${d.id}')" class="p-2 rounded-xl text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
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

  if (!categories.length) {
    noData.classList.remove('hidden'); noData.classList.add('flex');
  } else {
    noData.classList.add('hidden'); noData.classList.remove('flex');
    categoryChartInstance = new Chart(document.getElementById('categoryChart').getContext('2d'), {
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

  const metrics = calculateMetrics(list);
  if (balanceChartInstance) balanceChartInstance.destroy();

  balanceChartInstance = new Chart(document.getElementById('balanceBarChart').getContext('2d'), {
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

/* =========================================================
   MODAL & FORM
   ========================================================= */
function openModal(type = 'expense', id = null) {
  if (!requireAuth()) return;

  if (type === 'charity' && !hasFeature('charity')) {
    showToast('باب الخير غير متاح لدورك', 'error');
    return;
  }
  if ((type === 'debt_receivable' || type === 'debt_payable') && !hasFeature('debts')) {
    showToast('دفتر الديون غير متاح لدورك', 'error');
    return;
  }

  const modal = document.getElementById('transactionModal');
  const form = document.getElementById('transactionForm');
  editingId = id;
  form.reset();
  document.getElementById('formDate').value = todayString();

  if (id) {
    const item = transactions.find(t => t.id === id);
    if (!item) return;
    const radio = document.querySelector(`input[name="txType"][value="${item.type}"]`);
    if (radio) radio.checked = true;
    onTypeChange();
    document.getElementById('formAmount').value = item.amount;
    document.getElementById('formDate').value = item.date;
    document.getElementById('formCategory').value = item.category;
    document.getElementById('formPaymentMethod').value = item.paymentMethod || 'كاش نقدي';
    document.getElementById('formReference').value = item.reference || '';
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
  setTimeout(() => document.getElementById('formAmount').focus(), 100);
}

function closeModal() {
  const modal = document.getElementById('transactionModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  editingId = null;
}

function onTypeChange() {
  const selected = document.querySelector('input[name="txType"]:checked');
  if (!selected) return;
  const type = selected.value;
  const select = document.getElementById('formCategory');
  const baraka = document.getElementById('barakaBox');
  const title = document.getElementById('modalTitle');
  const notes = document.getElementById('notesLabel');
  const icon = document.getElementById('modalIconBox');

  select.innerHTML = '';
  (CATEGORIES[type] || ['عام']).forEach(c => {
    const option = document.createElement('option');
    option.value = c; option.textContent = c;
    select.appendChild(option);
  });

  baraka.classList.toggle('hidden', type !== 'charity');

  if (type === 'charity') {
    title.textContent = editingId ? 'تعديل باب الخير' : 'تسجيل صدقة أو عمل خير';
    notes.textContent = 'النية / الملاحظات';
    icon.innerHTML = '<i class="fa-solid fa-heart text-orange-500"></i>';
  } else if (type === 'income') {
    title.textContent = editingId ? 'تعديل الدخل' : 'تسجيل دخل / إيراد جديد';
    notes.textContent = 'بيان الخدمة أو اسم العميل';
    icon.innerHTML = '<i class="fa-solid fa-arrow-trend-up text-emerald-500"></i>';
  } else if (type === 'debt_receivable') {
    title.textContent = editingId ? 'تعديل دين مستحق لي' : 'تسجيل دين مستحق لي';
    notes.textContent = 'اسم الشخص / المحل مع التفاصيل *';
    icon.innerHTML = '<i class="fa-solid fa-user-plus text-cyan-500"></i>';
  } else if (type === 'debt_payable') {
    title.textContent = editingId ? 'تعديل دين عليّ' : 'تسجيل دين مستحق عليّ';
    notes.textContent = 'اسم الشخص / الجهة مع التفاصيل *';
    icon.innerHTML = '<i class="fa-solid fa-user-minus text-purple-500"></i>';
  } else {
    title.textContent = editingId ? 'تعديل مصروف' : 'تسجيل مصروف جديد';
    notes.textContent = 'بيان المصروف';
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
  const category = document.getElementById('formCategory').value;
  const paymentMethod = document.getElementById('formPaymentMethod').value;
  const reference = sanitizeString(document.getElementById('formReference').value, 50);
  const notes = sanitizeString(document.getElementById('formNotes').value, 200);

  if (!amount || amount <= 0 || amount > 1e9) { 
    showToast('يرجى إدخال مبلغ صحيح (أكبر من 0)', 'error'); 
    return; 
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { 
    showToast('يرجى اختيار تاريخ صحيح', 'error'); 
    return; 
  }
  if (isDebt(type) && !notes) { 
    showToast('اكتب اسم الشخص أو الجهة في البيان', 'error'); 
    return; 
  }

  if (!wasEditing && !canAddMoreTransactions()) {
    showToast(`وصلت للحد الأقصى (${getMaxTransactions()} عملية)`, 'error');
    return;
  }

  if (wasEditing) {
    const index = transactions.findIndex(t => t.id === editingId);
    if (index === -1) return;
    const old = transactions[index];
    transactions[index] = normalizeTransaction({
      ...old, type, amount, date, category,
      paymentMethod: isDebt(type) ? 'آجل / معلق' : paymentMethod,
      reference,
      notes: notes || (type === 'charity' ? 'صدقة لوجه الله' : category),
      status: isDebt(type) ? (old.status || 'pending') : undefined,
      _updatedAt: Date.now()
    });
    showToast('تم تعديل العملية بنجاح', 'success');
  } else {
    transactions.unshift(normalizeTransaction({
      id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      type, amount, date, category,
      paymentMethod: isDebt(type) ? 'آجل / معلق' : paymentMethod,
      reference,
      notes: notes || (type === 'charity' ? 'صدقة لوجه الله' : category),
      status: isDebt(type) ? 'pending' : undefined,
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
   EDIT / DELETE / UNDO
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
   CONFIRM
   ========================================================= */
let confirmCallback = null;
function openConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').innerHTML = message;
  confirmCallback = callback;
  const modal = document.getElementById('confirmModal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
  document.getElementById('confirmActionBtn').onclick = () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  };
}
function closeConfirm() {
  const modal = document.getElementById('confirmModal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
  confirmCallback = null;
}

/* =========================================================
   DEBT TOGGLE
   ========================================================= */
function toggleDebtStatus(id) {
  if (!requireAuth()) return;
  const debt = transactions.find(t => t.id === id);
  if (!debt) return;
  debt.status = debt.status === 'paid' ? 'pending' : 'paid';
  debt._updatedAt = Date.now();
  saveData();
  refreshAll();
  showToast(debt.status === 'paid' ? 'تم إغلاق الدين وتسجيل السداد ✓' : 'تمت إعادة الدين كمعلق', 'success');
}

/* =========================================================
   BUDGET
   ========================================================= */
function getBudget() { return Number(localStorage.getItem(BUDGET_KEY) || 0); }

function openBudgetModal() {
  if (!requireAuth()) return;
  if (!hasFeature('budget')) {
    showToast('الميزانية غير متاحة لدورك', 'error');
    return;
  }
  document.getElementById('budgetInput').value = getBudget() || '';
  const modal = document.getElementById('budgetModal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
}
function closeBudgetModal() {
  const modal = document.getElementById('budgetModal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
}
function saveBudget() {
  if (!requireAuth()) return;
  const value = Number(document.getElementById('budgetInput').value);
  if (!isFinite(value) || value < 0 || value > 1e9) { 
    showToast('قيمة الميزانية غير صحيحة', 'error'); 
    return; 
  }
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

  document.getElementById('budgetUsed').textContent = money(used);

  if (!budget) {
    document.getElementById('budgetTotal').textContent = 'غير محددة';
    document.getElementById('budgetRemaining').textContent = 'حدد ميزانية شهرية';
    document.getElementById('budgetPercent').textContent = '0%';
    document.getElementById('budgetBar').style.width = '0%';
    return;
  }

  document.getElementById('budgetTotal').textContent = money(budget) + ' ج.م';
  const percent = Math.min(100, (used / budget) * 100);
  const remaining = budget - used;
  document.getElementById('budgetPercent').textContent = percent.toFixed(1) + '%';
  document.getElementById('budgetBar').style.width = percent + '%';
  document.getElementById('budgetRemaining').textContent = remaining >= 0
    ? `متبقي ${money(remaining)} ج.م` : `متجاوز بـ ${money(Math.abs(remaining))} ج.م`;
  document.getElementById('budgetRemaining').className =
    'text-[10px] font-bold ' + (remaining >= 0 ? 'text-emerald-500' : 'text-rose-500');
}

/* =========================================================
   BACKUP
   ========================================================= */
function openBackupModal() {
  if (!requireAuth()) return;
  if (!hasFeature('backup')) {
    showToast('النسخ الاحتياطي غير متاح لدورك', 'error');
    return;
  }
  closeMenus();
  const modal = document.getElementById('backupModal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
}
function closeBackupModal() {
  const modal = document.getElementById('backupModal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
}
function downloadBackup() {
  if (!requireAuth()) return;
  if (!hasFeature('backup')) return;
  const backup = {
    app: 'Ehsebli Honda Financial Manager',
    version: '6.1',
    createdAt: new Date().toISOString(),
    userEmail: currentUser.email,
    userRole: userRole,
    transactions,
    budget: getBudget(),
    theme: localStorage.getItem(THEME_KEY) || 'dark',
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
  if (!hasFeature('backup')) {
    showToast('غير مصرح بالاستعادة', 'error');
    event.target.value = '';
    return;
  }
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { 
    showToast('حجم الملف كبير جداً (أقصى 10MB)', 'error'); 
    event.target.value = '';
    return; 
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      let restored = Array.isArray(backup) ? backup : backup.transactions;
      if (!Array.isArray(restored)) throw new Error('Invalid backup');

      restored = restored.filter(validateTransaction);
      if (!restored.length) throw new Error('No valid transactions');

      openConfirm('استعادة النسخة؟', `سيتم استبدال العمليات الحالية بـ <strong>${restored.length}</strong> عملية صحيحة من الملف.`, () => {
        const now = Date.now();
        transactions = restored.map((item, i) => normalizeTransaction({
          ...item,
          _updatedAt: item._updatedAt || (now + i)
        }));
        if (backup.budget !== undefined) {
          const b = Number(backup.budget);
          if (isFinite(b) && b >= 0) localStorage.setItem(BUDGET_KEY, b);
        }
        saveData({ force: true });
        refreshAll();
        closeBackupModal();
        showToast('تم استعادة النسخة الاحتياطية بنجاح', 'success');
      });
    } catch (error) {
      console.error(error);
      showToast('ملف النسخة الاحتياطية غير صالح', 'error');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

/* =========================================================
   CLEAR & DEMO
   ========================================================= */
function confirmClearData() {
  if (!requireAuth()) return;
  closeMenus();
  openConfirm('تصفير جميع البيانات؟', 'سيتم حذف جميع المعاملات والميزانية من التطبيق والسحابة.', () => {
    transactions = [];
    localStorage.removeItem(BUDGET_KEY);
    lastDeletedId = null;
    saveData({ force: true });
    refreshAll();
    showToast('تم تصفير جميع البيانات', 'info');
  });
}

function loadDemoData() {
  if (!requireAuth()) return;
  closeMenus();
  openConfirm('تحميل البيانات التجريبية؟', 'سيتم استبدال المعاملات الحالية بالبيانات النموذجية.', () => {
    const now = Date.now();
    transactions = JSON.parse(JSON.stringify(DEMO_ITEMS)).map((t, i) => normalizeTransaction({ 
      ...t, 
      _updatedAt: now + i 
    }));
    saveData({ force: true });
    refreshAll();
    showToast('تم تحميل البيانات التجريبية', 'success');
  });
}

/* =========================================================
   CSV
   ========================================================= */
function exportToCSV() {
  if (!requireAuth()) return;
  if (!hasFeature('export')) {
    showToast('التصدير غير متاح لدورك', 'error');
    return;
  }
  closeMenus();
  const list = getActiveTransactions();
  if (!list.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }

  let csv = '\uFEFF';
  csv += 'المعرف,النوع,المبلغ,التصنيف,طريقة الدفع,التاريخ,المرجع,البيان,الحالة\n';
  list.forEach(t => {
    const row = [
      t.id, typeName(t.type), t.amount, t.category,
      t.paymentMethod || '', t.date, t.reference || '', t.notes || '',
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

/* =========================================================
   PRINT / PDF
   ========================================================= */
function printReport() {
  if (!requireAuth()) return;
  if (!hasFeature('reports')) {
    showToast('التقارير غير متاحة لدورك', 'error');
    return;
  }
  closeMenus();
  const metrics = calculateMetrics();
  const periodName = document.getElementById('periodLabel').textContent;
  const report = document.getElementById('printReport');

  report.innerHTML = `
    <div style="font-family:Cairo,Tajawal,sans-serif;direction:rtl;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #f97316;padding-bottom:18px;">
        <div>
          <h1 style="font-size:30px;margin:0;font-weight:900;">احسبلي</h1>
          <div style="font-size:12px;color:#666;">Honda Financial Manager</div>
        </div>
        <div style="text-align:left;font-size:12px;color:#555;">
          <div>تقرير مالي</div>
          <div>${escapeHTML(periodName)}</div>
          <div>${todayString()}</div>
          <div>${escapeHTML(currentUser?.email || '')}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:25px;">
        ${reportBox('الإيرادات', metrics.income, '#059669')}
        ${reportBox('المصاريف', metrics.expense, '#e11d48')}
        ${reportBox('باب الخير', metrics.charity, '#ea580c')}
        ${reportBox('الرصيد المتاح', metrics.available, metrics.available >= 0 ? '#059669' : '#e11d48')}
      </div>
      <div style="margin-top:30px;">
        <h2 style="font-size:18px;">ملخص الديون</h2>
        <div style="display:flex;gap:15px;">
          <div style="padding:15px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;"><strong>لي عند الناس:</strong> ${money(metrics.debtRec)} ج.م</div>
          <div style="padding:15px;background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;"><strong>عليّ للناس:</strong> ${money(metrics.debtPay)} ج.م</div>
        </div>
      </div>
      <div style="margin-top:30px;">
        <h2 style="font-size:18px;">تفاصيل العمليات</h2>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#f97316;color:white;">
              <th style="padding:9px;border:1px solid #ddd;">التاريخ</th>
              <th style="padding:9px;border:1px solid #ddd;">النوع</th>
              <th style="padding:9px;border:1px solid #ddd;">البيان</th>
              <th style="padding:9px;border:1px solid #ddd;">التصنيف</th>
              <th style="padding:9px;border:1px solid #ddd;">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            ${getPeriodTransactions()
              .sort((a,b) => new Date(b.date) - new Date(a.date))
              .map(t => `
                <tr>
                  <td style="padding:8px;border:1px solid #ddd;">${escapeHTML(t.date)}</td>
                  <td style="padding:8px;border:1px solid #ddd;">${escapeHTML(typeName(t.type))}</td>
                  <td style="padding:8px;border:1px solid #ddd;">${escapeHTML(t.notes || '')}</td>
                  <td style="padding:8px;border:1px solid #ddd;">${escapeHTML(t.category || '')}</td>
                  <td style="padding:8px;border:1px solid #ddd;">${money(t.amount)} ج.م</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:35px;text-align:center;color:#777;font-size:10px;">احسبلي — مقدم من هوندا</div>
    </div>
  `;
  window.print();
}

function reportBox(title, value, color) {
  return `<div style="border:1px solid #ddd;border-radius:14px;padding:15px;">
    <div style="font-size:11px;color:#777;">${title}</div>
    <div style="font-size:20px;font-weight:900;color:${color};margin-top:5px;">${money(value)} ج.م</div>
  </div>`;
}

/* =========================================================
   PIN
   ========================================================= */
function openPinModal() {
  if (!requireAuth()) return;
  closeMenus();
  const modal = document.getElementById('pinModal');
  const title = document.getElementById('pinTitle');
  const action = document.getElementById('pinActionBtn');
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError').classList.add('hidden');

  if (!getPin()) { title.textContent = 'إنشاء PIN'; action.textContent = 'تفعيل القفل'; }
  else { title.textContent = 'تغيير PIN'; action.textContent = 'تغيير الرمز'; }

  modal.classList.remove('hidden'); modal.classList.add('flex');
  setTimeout(() => document.getElementById('pinInput').focus(), 100);
}
function closePinModal() {
  const modal = document.getElementById('pinModal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
}
async function handlePinAction() {
  const pin = document.getElementById('pinInput').value.trim();
  const error = document.getElementById('pinError');
  if (!/^\d{4,6}$/.test(pin)) {
    error.textContent = 'PIN يجب أن يكون من 4 إلى 6 أرقام';
    error.classList.remove('hidden');
    return;
  }
  localStorage.setItem(PIN_KEY, await hashPin(pin));
  closePinModal();
  showToast('تم حفظ PIN بنجاح', 'success');
  showPinLock();
}
async function unlockApp() {
  const input = document.getElementById('unlockPinInput');
  const entered = input.value.trim();
  const stored = getPin();
  if (!stored) { hidePinLock(); return; }

  let ok = false;
  if (/^\d{4,6}$/.test(stored)) {
    ok = entered === stored;
    if (ok) localStorage.setItem(PIN_KEY, await hashPin(entered));
  } else {
    ok = (await hashPin(entered)) === stored;
  }

  if (ok) { hidePinLock(); input.value = ''; }
  else {
    document.getElementById('unlockError').classList.remove('hidden');
    input.value = '';
    input.focus();
  }
}

/* =========================================================
   TABS & TOASTS
   ========================================================= */
function switchTab(tab) {
  if (tab === 'debts' && !hasFeature('debts')) {
    showToast('دفتر الديون غير متاح لدورك', 'error');
    return;
  }
  currentTab = tab;
  const isTx = tab === 'transactions';
  document.getElementById('panelTransactions').classList.toggle('hidden', !isTx);
  document.getElementById('panelDebts').classList.toggle('hidden', isTx);
  document.getElementById('tabBtnTransactions').classList.toggle('active', isTx);
  document.getElementById('tabBtnDebts').classList.toggle('active', !isTx);
}

let toastTimer = null;
function showToast(message, type = 'success', allowUndo = false) {
  const box = document.getElementById('toastBox');
  const inner = document.getElementById('toastInner');

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
  updateMetrics();
  renderTransactions();
  renderDebts();
  updateCharts();
  updateBudget();
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeModal(); closeConfirm(); closeBackupModal();
    closeBudgetModal(); closePinModal(); closeMenus();
    closeAdminPanel();
    closeUserPermissionsModal();
  }
});

/* =========================================================
   INITIAL BOOT
   ========================================================= */
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  loadLocalData();
  refreshAll();
  switchTab('transactions');
  document.getElementById('formDate').value = todayString();

  try {
    const cached = localStorage.getItem(PERMS_CACHE_KEY);
    if (cached) rolePermissions = JSON.parse(cached);
  } catch(e) {}
  applyRoleUI();

  showAuthLoading();

  await handleRedirectResult();

  setTimeout(() => {
    if (!authResolved) {
      hideAuthLoading();
      showLoginWall();
    }
  }, 8000);
});