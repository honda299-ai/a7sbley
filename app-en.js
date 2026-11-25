/* =========================================================
   PUBLIC PORTAL INSTANT LOCK (The radical solution to a pageClient)
   ========================================================= */
(function() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('client')) {
    window.isPortalModeActive = true;
    window.addEventListener('DOMContentLoaded', () => {
      document.body.classList.add('portal-mode');
      const l = document.getElementById('authLoading');
      if (l) l.style.display = 'none';
      const w = document.getElementById('loginWall');
      if (w) w.classList.add('hidden');
      checkPublicPortalMode();
    });
  }
})();


/* =========================================================
   EHSEBLI / HONDA FINANCIAL MANAGER V9.3
   PWA Edition + Push Notifications (Clean Edition / v20.10.2-en mobile + security patch)
   ========================================================= */

const SUPER_ADMIN_EMAILS = ['hondastore299@gmail.com'];

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
const storage = firebase.storage();

/* ---------- Constants ---------- */
const STORAGE_KEY = 'ehsebli_honda_data_v2';
const THEME_KEY = 'ehsebli_theme_v2';
const BUDGET_KEY = 'ehsebli_budget_v2';
const PIN_KEY = 'ehsebli_pin_v2';
const PRIVACY_KEY = 'ehsebli_privacy_v1';
const LAST_UID_KEY = 'ehsebli_last_uid';
const PERMS_CACHE_KEY = 'ehsebli_perms_cache';

const INVENTORY_KEY = 'ehsebli_inventory_v1';
const AUDIT_KEY = 'ehsebli_audit_v1';

/* =========================================================
   Isolate each dataUser (account/visitor) on the same device
   Each data key is stored with the name: Key::UID
   FVisitor data The data of each account will never be mixed.
   ========================================================= */
let categoryBudgets = {};
let chargeMachines = [];
let clientPhones = {};
let workspaceUid = null;
let teamPerms = null;
const CHARGE_KEY = 'ehsebli_charge_machines_v1';
const CATBUDGET_KEY = 'ehsebli_catbudget_v1';
function dataScope() {
  if (!(currentUser && currentUser.uid)) return null;
  return (workspaceUid && workspaceUid !== currentUser.uid) ? (String(currentUser.uid) + '@' + String(workspaceUid)) : String(currentUser.uid);
}
function scopedKey(key, scope) { return key + '::' + (scope || dataScope()); }
function lsGet(key) {
  const sc = dataScope();
  return sc ? localStorage.getItem(scopedKey(key, sc)) : null;
}
function lsSet(key, value) {
  const sc = dataScope();
  if (!sc) return;
  try { localStorage.setItem(scopedKey(key, sc), value); } catch (e) { console.warn('localStorage full/blocked', e); }
}
function lsDel(key) {
  const sc = dataScope();
  if (sc) localStorage.removeItem(scopedKey(key, sc));
}
// transferDescriptionThe old ones (before insulation) belong to their owner only once instead of sharing them
function migrateLegacyLocalData(uid) {
  try {
    if (localStorage.getItem('a7sbly_scope_migrated_v1') === 'true') return;
    const legacyKeys = [STORAGE_KEY, BUDGET_KEY, INVENTORY_KEY, AUDIT_KEY, RECURRING_KEY, PIN_KEY, PERMS_CACHE_KEY, APP_MODE_KEY, DEMO_FLAG_KEY];
    const hasLegacy = legacyKeys.some(k => localStorage.getItem(k) !== null);
    if (!hasLegacy) { localStorage.setItem('a7sbly_scope_migrated_v1', 'true'); return; }
    const lastUid = localStorage.getItem(LAST_UID_KEY);
    const isGuestUid = String(uid).startsWith('guest-');
    // ownerDescriptionOld ones: anotherUser known,Or OrFor a real accountIncome (The visitor will not seize it.)
    const owner = lastUid || (!isGuestUid ? uid : null);
    if (owner !== uid) return;
    legacyKeys.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) { localStorage.setItem(scopedKey(k, uid), v); localStorage.removeItem(k); }
    });
    localStorage.setItem('a7sbly_scope_migrated_v1', 'true');
  } catch (e) { console.warn('legacy migration failed', e); }
}
let inventoryItems = [];
let auditLogs = [];
let editingInvId = null;


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
let deferredInstallPrompt = null;

/* ---------- Roles Meta ---------- */
const ROLES_META = {
  free:     { name: 'Free',  icon: 'fa-user',           badgeClasses: 'bg-slate-500/10 border-slate-500/30 text-slate-400' },
  personal: { name: 'Personal',   icon: 'fa-user-circle',    badgeClasses: 'bg-purple-500/10 border-purple-500/30 text-purple-400' },
  work:     { name: 'Job',    icon: 'fa-briefcase',      badgeClasses: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' },
  pro:      { name: 'Pro',    icon: 'fa-crown',          badgeClasses: 'bg-orange-500/10 border-orange-500/30 text-orange-400' },
  admin:    { name: 'Manager',   icon: 'fa-shield-halved',  badgeClasses: 'bg-rose-500/10 border-rose-500/30 text-rose-400' }
};

const FEATURE_LIST = [
  { key: 'charity', label: 'Charity',      icon: 'fa-hand-holding-heart' },
  { key: 'debts',   label: 'Debt book',    icon: 'fa-handshake' },
  { key: 'budget',  label: 'Budget',      icon: 'fa-wallet' },
  { key: 'export',  label: 'CSV export',      icon: 'fa-file-excel' },
  { key: 'backup',  label: 'Backup',    icon: 'fa-database' },
  { key: 'reports', label: 'PDF reports',     icon: 'fa-file-pdf' },
  { key: 'profitCurve', label: 'Earnings Curve (Pro)', icon: 'fa-chart-area' },
  { key: 'team', label: 'Team (Pro)', icon: 'fa-people-group' }
];

const DEFAULT_PERMISSIONS = {
  free:     { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true, profitCurve: false, team: false },
  personal: { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true, profitCurve: false, team: false },
  work:     { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true, profitCurve: false, team: false },
  pro:      { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true, profitCurve: true, team: true },
  admin:    { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true, profitCurve: true, team: true }
};

let rolePermissions = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));

/* ---------- Helpers ---------- */
function todayString() {
  const d = new Date();
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
function money(v) { return Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function escapeHTML(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// XSS-safe value for a JS string literal inside an inline HTML handler.
// Quotes are emitted as \uXXXX so the HTML parser cannot turn entities back into real quotes.
function jsAttr(v) {
  return String(v ?? '').replace(/[\\'"&<>\r\n\t]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
// Receipt images are only ever loaded from HTTPS URLs, and HTML-escaped for attributes.
function safeReceiptURL(v) {
  const u = String(v || '');
  return /^https:\/\//i.test(u) && u.length <= 800 ? escapeHTML(u) : '';
}
function sanitizeString(str, maxLength = 500) {
  return String(str || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLength).trim();
}
function isDebt(type) { return String(type || '').startsWith('debt_'); }
function typeName(type) {
  return ({ income:'Income', expense:'Expense', charity:'Charity', debt_receivable:'Dean Leah', debt_payable:'High religion' })[type] || type;
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
    paymentMethod: sanitizeString(normalizePaymentMethod(t.paymentMethod), 50),
    reference: sanitizeString(t.reference || '', 50),
    notes: sanitizeString(t.notes || '', 200),
    receipt: t.receipt || null,
    dueDate: t.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ? t.dueDate : null,
    status: (t.status === 'paid' || t.status === 'pending') ? t.status : null,
    _deleted: t._deleted === true,
    _updatedAt: Number(t._updatedAt) || Date.now()
  };
}

/* (Installation menu moved to sectionV20.8 at the end of the file)*/

/* =========================================================
   PWA: SHARE TARGET
   ========================================================= */
function handleShareTarget() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('share')) return false;

  const sharedTitle = params.get('title') || '';
  const sharedText = params.get('text') || '';
  const sharedUrl = params.get('url') || '';
  const payload = { sharedTitle, sharedText, sharedUrl };

  const runAction = () => {
    if (!currentUser) {
      sessionStorage.setItem('pending_share', JSON.stringify(payload));
      return;
    }
    openModal('expense');
    setTimeout(() => {
      const notesField = document.getElementById('formNotes');
      const combined = [sharedTitle, sharedText, sharedUrl].filter(Boolean).join(' - ');
      if (notesField && combined) notesField.value = combined.slice(0, 200);
    }, 300);
  };

  if (authResolved && currentUser) setTimeout(runAction, 500);
  else sessionStorage.setItem('pending_share', JSON.stringify(payload));

  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
  return true;
}

function checkPendingShare() {
  const pending = sessionStorage.getItem('pending_share');
  if (pending && currentUser) {
    try {
      const data = JSON.parse(pending);
      sessionStorage.removeItem('pending_share');
      openModal('expense');
      setTimeout(() => {
        const notesField = document.getElementById('formNotes');
        const combined = [data.sharedTitle, data.sharedText, data.sharedUrl].filter(Boolean).join(' - ');
        if (notesField && combined) notesField.value = combined.slice(0, 200);
      }, 400);
    } catch (e) {}
  }
}

/* =========================================================
   PWA: FILE RESTORE
   ========================================================= */
function handleFileRestore() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('file')) return false;
  showToast('Drag the backup file into the app to restore', 'info');
  openBackupModal();
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
  return true;
}

/* =========================================================
   PWA: PUSH NOTIFICATIONS
   ========================================================= */
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    showToast('Alerts are dismissed - open browser settings', 'error');
    return false;
  }
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

async function subscribeToPushNotifications() {
  if (!currentUser) { showToast('Log in first', 'error'); return; }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Notifications are not supported in this browser', 'error');
    return;
  }
  const granted = await requestNotificationPermission();
  if (!granted) return;
  showToast('Notifications have been activated successfully 🔔', 'success');
  updateNotificationUI(true);
  localStorage.setItem('ehsebli_notif_enabled', 'true');
}

async function unsubscribeFromPushNotifications() {
  if (!currentUser) return;
  localStorage.setItem('ehsebli_notif_enabled', 'false');
  showToast('Notifications have been turned off', 'info');
  updateNotificationUI(false);
}

async function togglePushNotifications() {
  if (!currentUser) return;
  const enabled = localStorage.getItem('ehsebli_notif_enabled') === 'true';
  if (enabled) await unsubscribeFromPushNotifications();
  else await subscribeToPushNotifications();
}

function updateNotificationUI(enabled) {
  const btn = document.getElementById('notificationToggleBtn');
  if (!btn) return;
  const icon = btn.querySelector('i');
  const label = btn.querySelector('span');
  if (enabled) {
    if (icon) icon.className = 'fa-solid fa-bell text-emerald-500';
    if (label) label.textContent = 'Turn off notifications';
  } else {
    if (icon) icon.className = 'fa-solid fa-bell-slash text-slate-400';
    if (label) label.textContent = 'Activate notifications';
  }
}

function showLocalNotification(title, body, url) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_LOCAL_NOTIFICATION', title, body, url
    });
  } else {
    new Notification(title, { body, icon: './icon.svg', badge: './icon.svg' });
  }
}

async function sendTestNotification() {
  if (!('Notification' in window)) { showToast('Notifications are not supported', 'error'); return; }
  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermission();
    if (!granted) return;
  }
  showLocalNotification(
    'a7sbly — test notifications 🔔',
    'If you receive this message, it means that notifications are working perfectly!',
    './'
  );
}

/* =========================================================
   PWA: NETWORK STATUS
   ========================================================= */
function initNetworkStatus() {
  window.addEventListener('online', () => {
    showToast('Internet connection is back ✓', 'success');
    document.body.classList.remove('offline');
  });
  window.addEventListener('offline', () => {
    showToast('Connection lost — working in local mode', 'info');
    document.body.classList.add('offline');
  });
  if (!navigator.onLine) document.body.classList.add('offline');
}

/* =========================================================
   PWA: UPDATE BANNER
   ========================================================= */
function showUpdateBanner() {
  if (document.getElementById('updateBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <span><i class="fa-solid fa-rocket"></i> New version available!</span>
    <button onclick="applyUpdate()">Update Now</button>
  `;
  document.body.appendChild(banner);
}

function applyUpdate() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
  }
  setTimeout(() => window.location.reload(), 300);
}

/* =========================================================
   RECEIPT IMAGE
   ========================================================= */
async function handleReceiptSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please choose a valid image file', 'error'); return; }

  showToast('Image is being processed...', 'info');
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const MAX_W = 600, MAX_H = 600;
      let width = img.width, height = img.height;
      if (width > height) { if (width > MAX_W) { height *= MAX_W / width; width = MAX_W; } }
      else { if (height > MAX_H) { width *= MAX_H / height; height = MAX_H; } }
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const compressedDataUrl = safeCanvasToDataURL(canvas, 'image/jpeg', 0.6);
      
      // Upload to Firebase Storage if online
      if (currentUser && navigator.onLine) {
        try {
          showToast('Uploading the invoice to the cloud ☁️...', 'info');
          const fileRef = storage.ref(`receipts/${currentUser.uid}/${Date.now()}_receipt.jpg`);
          await fileRef.putString(compressedDataUrl, 'data_url');
          currentReceiptData = await fileRef.getDownloadURL();
          setReceiptUI(currentReceiptData);
          showToast('The invoice has been uploaded to the cloud ✓', 'success');
          return;
        } catch(storageErr) {
          console.warn("Storage upload failed, fallback to local:", storageErr);
        }
      }
      
      currentReceiptData = compressedDataUrl;
      setReceiptUI(currentReceiptData);
      showToast('Image attached locally ✓', 'success');
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
    text.textContent = 'Image selected (click to change)';
  } else {
    img.src = '';
    box.classList.add('hidden');
    removeBtn.classList.add('hidden');
    text.textContent = 'Shoot or choose a photo';
    document.getElementById('formReceiptFile').value = '';
  }
}

function clearReceiptImage() { currentReceiptData = null; setReceiptUI(null); }

function viewReceiptImage(src) {
  if (!src) return;
  document.getElementById('viewerImageFull').src = src;
  document.getElementById('downloadReceiptLink').href = src;
  const modal = document.getElementById('receiptViewerModal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
}

function closeReceiptViewer() {
  const modal = document.getElementById('receiptViewerModal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
}

/* =========================================================
   PRIVACY MODE
   ========================================================= */
function initPrivacyMode() {
  isPrivacyMode = localStorage.getItem(PRIVACY_KEY) === 'true';
  applyPrivacyModeUI();
}
function togglePrivacyMode() {
  isPrivacyMode = !isPrivacyMode;
  localStorage.setItem(PRIVACY_KEY, isPrivacyMode);
  applyPrivacyModeUI();
  showToast(isPrivacyMode ? 'Privacy mode and hiding numbers have been activated 🔒' : 'Numbers are shown 👁️', 'info');
}
function applyPrivacyModeUI() {
  document.body.classList.toggle('privacy-active', isPrivacyMode);
  const icon = document.getElementById('privacyIcon');
  if (icon) icon.className = isPrivacyMode ? 'fa-solid fa-eye-slash text-rose-500' : 'fa-solid fa-eye text-orange-500';
}

/* =========================================================
   CLIENTS AUTOCOMPLETE
   ========================================================= */
function updateClientsDatalist() {
  const dl = document.getElementById('clientsDatalist');
  if (!dl) return;
  dl.innerHTML = '';
  getAllClientNames().forEach(c => {
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
   PUBLIC PORTAL
   ========================================================= */
async function checkPublicPortalMode() {
  const params = new URLSearchParams(window.location.search);
  const clientParam = params.get('client');
  const portalId = params.get('p');
  if (!clientParam) return false;

  isPortalModeActive = true;
  document.body.classList.add('portal-mode');
  hideAuthLoading();

  let clientTransactions = [];
  window.portalMeta = null;
  if (portalId && /^[a-f0-9]{16,64}$/.test(portalId)) {
    try {
      const doc = await db.collection('client_portals').doc(portalId).get();
      if (doc.exists) {
        const d = doc.data();
        window.portalMeta = { portalId, ownerUid: d.ownerUid };
        clientTransactions = (d.transactions || []).filter(validateTransaction);
      }
    } catch (e) { console.warn('Portal load failed:', e); }
  } else {
    showToast('Outdated or invalid link, ask the store for a new link', 'error');
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
  document.getElementById('portalTxCount').textContent = `${txs.length}Recorded transaction`;

  if (!txs.length) empty.classList.remove('hidden');
  else {
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
          <div class="text-[10px] text-slate-400 mt-0.5">${escapeHTML(typeName(t.type))} ${t.status === 'paid' ? '• Paid in full' : ''}</div>
        </td>
        <td class="py-3 px-4 text-slate-500 dark:text-slate-400">${payMethodHTML(t.paymentMethod)}</td>
        <td class="py-3 px-4 font-black ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">
          ${t.type === 'income' ? '+' : '-'}${money(t.amount)} EGP
        </td>
        <td class="py-3 px-4 text-center">
          ${t.receipt ? `
            <img src="${safeReceiptURL(t.receipt)}" 
                 onclick="viewReceiptImage('${jsAttr(t.receipt)}')" 
                 title="Preview" 
                 class="w-7 h-7 rounded-lg object-cover border border-orange-500/40 inline-block cursor-pointer hover:scale-110 transition shadow-sm" 
                 alt="Image">
          ` : '<span class="text-slate-400">-</span>'}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('portalTotalIncome').textContent = money(income) + ' EGP';
  document.getElementById('portalTotalDue').textContent = money(debtRec) + ' EGP';
  document.getElementById('portalTotalPayable').textContent = money(debtPay) + ' EGP';
}

/* ---------- Shared client portals (client_portals/{randomId}) ---------- */
const portalIndex = new Map();      // lower(clientName) -> portalId
const portalPayloadCache = new Map(); // portalId -> last written JSON

function portalKey(name) { return String(name || '').trim().toLowerCase(); }
function portalHash(name) {
  let h = 5381; const k = portalKey(name);
  for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) >>> 0;
  return 'c' + h.toString(16);
}
function randomPortalId() {
  const a = new Uint8Array(20); crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
function buildPortalPayload(clientName) {
  const key = portalKey(clientName);
  const list = transactions
    .filter(t => t && !t._deleted && t.client && portalKey(t.client) === key)
    .map(t => {
      const o = {
        id: t.id, type: t.type, amount: Number(t.amount) || 0, paidAmount: Number(t.paidAmount) || 0,
        date: t.date, time: t.time || '', client: t.client, category: t.category || '',
        notes: t.notes || '', status: t.status || null, paymentMethod: t.paymentMethod || '',
        _updatedAt: t._updatedAt || 0
      };
      if (typeof t.receipt === 'string' && t.receipt.startsWith('https://') && t.receipt.length < 800) o.receipt = t.receipt;
      return o;
    });
  return { ownerUid: currentUser.uid, clientName, transactions: list };
}
async function loadPortalIndex(uid) {
  try {
    const snap = await db.collection('users').doc(uid).collection('portal_index').get();
    portalIndex.clear();
    snap.forEach(d => { const v = d.data(); if (v && v.portalId && v.name) portalIndex.set(portalKey(v.name), v.portalId); });
  } catch (e) { console.warn('portal index load failed', e); }
}
async function ensurePortal(clientName) {
  if (!currentUser) throw new Error('auth');
  const key = portalKey(clientName);
  let id = portalIndex.get(key);
  const payload = buildPortalPayload(clientName);
  if (!id) {
    id = randomPortalId();
    await db.collection('client_portals').doc(id).set({ ...payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(currentUser.uid).collection('portal_index').doc(portalHash(clientName)).set({ portalId: id, name: clientName });
    portalIndex.set(key, id);
    portalPayloadCache.set(id, JSON.stringify(payload));
  } else {
    await writePortalIfChanged(id, payload);
  }
  return id;
}
async function writePortalIfChanged(id, payload) {
  const j = JSON.stringify(payload);
  if (portalPayloadCache.get(id) === j) return;
  await db.collection('client_portals').doc(id).set({ ...payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  portalPayloadCache.set(id, j);
}
let portalRefreshTimer = null;
function refreshSharedPortals() {
  if (!currentUser || !portalIndex.size) return;
  clearTimeout(portalRefreshTimer);
  portalRefreshTimer = setTimeout(async () => {
    for (const [key, id] of portalIndex) {
      const name = (transactions.find(t => t && t.client && portalKey(t.client) === key) || {}).client;
      if (!name) continue;
      try { await writePortalIfChanged(id, buildPortalPayload(name)); } catch (e) { console.warn('portal refresh failed', e); }
    }
  }, 1500);
}
async function getClientPortalLink(clientName) {
  const id = await ensurePortal(clientName);
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('client', clientName);
  url.searchParams.set('p', id);
  return url.toString();
}

async function copyClientPortalLink() {
  if (!activeClientName) return;
  if (!currentUser) { showToast('Log in to share your customer page', 'error'); return; }
  let link;
  try { link = await getClientPortalLink(activeClientName); }
  catch (e) { showToast('Unable to create client link', 'error'); return; }
  navigator.clipboard.writeText(link).then(() => {
    showToast('Customer page link copied successfully ✓', 'success');
  }).catch(() => prompt('Copy this link and send it to the customer:', link));
}

async function shareClientPortalWhatsApp() {
  if (!activeClientName) return;
  if (!currentUser) { showToast('Log in to share your customer page', 'error'); return; }
  let link;
  try { link = await getClientPortalLink(activeClientName); }
  catch (e) { showToast('Unable to create client link', 'error'); return; }
  const text = `Hello my ${activeClientName}Please visit the link to your direct account statement page to follow up on all the transactions shared between us:\n${link}\n\n— a7sbly`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

/* =========================================================
   PERMISSIONS
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
      Object.keys(merged).forEach(r => { if (cloud[r]) merged[r] = { ...merged[r], ...cloud[r] }; });
      rolePermissions = merged;
    }
    lsSet(PERMS_CACHE_KEY, JSON.stringify(rolePermissions));
  } catch (error) {
    try {
      const cached = lsGet(PERMS_CACHE_KEY);
      if (cached) rolePermissions = JSON.parse(cached);
    } catch(e) {}
  }
  applyRoleUI();
  updateQuickInsights();
}
async function saveRolePermissionsToCloud() {
  if (!currentUser || userRole !== 'admin') { showToast('Unauthorized', 'error'); return false; }
  try {
    await db.collection('config').doc('roles').set({
      permissions: rolePermissions,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.uid
    }, { merge: true });
    lsSet(PERMS_CACHE_KEY, JSON.stringify(rolePermissions));
    return true;
  } catch (error) { showToast('Save to the cloud failed', 'error'); return false; }
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
  const adminCtrlBtn = document.getElementById('adminPanelControlBtn');
  if (adminCtrlBtn) adminCtrlBtn.style.display = showAdmin ? '' : 'none';

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
  updatePinUI();
  document.querySelectorAll('.mob-nav-btn[data-feature]').forEach(btn => {
    btn.style.display = hasFeature(btn.dataset.feature) ? '' : 'none';
  });
}

function updatePinUI() {
  const removeBtn = document.getElementById('removePinBtn');
  if (removeBtn) removeBtn.style.display = getPin() ? '' : 'none';
}

/* =========================================================
   USER ROLE
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
        role: 'admin', email: currentUser.email || null,
        displayName: currentUser.displayName || '', isSuperAdmin: true,
        loginMethod: getLoginMethod(),
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return;
    }

    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists && doc.data().disabled === true) {
      showSuspendedScreen(doc.data().disabledReason);
      return;
    }
    if (doc.exists && doc.data().role && ROLES_META[doc.data().role]) {
      userRole = doc.data().role;
      currentUserPermissionsOverride = doc.data().permissionsOverride || null;
      if (userRole === 'admin' && !isSuperAdmin) userRole = 'free';
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
        role: 'free', email: currentUser.email || null,
        phoneNumber: userPhone || null,
        displayName: currentUser.displayName || '',
        loginMethod: getLoginMethod(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  } catch (error) {
    const userEmail = (currentUser?.email || '').toLowerCase().trim();
    if (isSuperAdminEmail(userEmail)) { userRole = 'admin'; isSuperAdmin = true; }
    else userRole = 'free';
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
   ADMIN PANEL
   ========================================================= */
async function openAdminPanel() {
  if (userRole !== 'admin') { showToast('This page is for the administrator only', 'error'); return; }
  closeMenus();
  const modal = document.getElementById('adminModal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
  await loadRolePermissions();
  switchAdminTab('overview');
}

function closeAdminPanel() {
  const modal = document.getElementById('adminModal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
}

async function changeUserRole(uid, newRole) {
  if (userRole !== 'admin') { showToast('You are not authorized', 'error'); return; }
  if (!ROLES_META[newRole]) return;
  if (uid === currentUser.uid) { showToast('You cannot change your own role', 'error'); renderUsersList(); return; }
  try {
    const targetDoc = await db.collection('users').doc(uid).get();
    const targetData = targetDoc.data() || {};
    const targetEmail = (targetData.email || '').toLowerCase().trim();
    if (isSuperAdminEmail(targetEmail)) {
      showToast('Super Admin permissions cannot be modified 🛡️', 'error');
      renderUsersList(); return;
    }
    await db.collection('users').doc(uid).update({
      role: newRole,
      roleUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      roleUpdatedBy: currentUser.uid
    });
    showToast(`Validity has been updated to:${ROLES_META[newRole].name}`, 'success');
  } catch (error) {
    showToast('Validity update failed', 'error');
    renderUsersList();
  }
}

/* =========================================================
   USER PERMISSIONS OVERRIDE
   ========================================================= */
async function openUserPermissionsModal(uid) {
  if (userRole !== 'admin') { showToast('Unauthorized', 'error'); return; }
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) { showToast('User not found', 'error'); return; }
    const data = doc.data();
    if (isSuperAdminEmail(data.email)) { showToast('Super Admin permissions cannot be modified 🛡️', 'error'); return; }
    editingUserPermissions = { uid, data };
    document.getElementById('userPermTitle').textContent = `Permissions: ${data.displayName || 'Unnamed'}`;
    document.getElementById('userPermEmail').textContent = data.email || data.phoneNumber || '';
    const roleSelect = document.getElementById('userPermRole');
    const currentRole = data.role || 'free';
    Array.from(roleSelect.options).forEach(opt => { opt.selected = opt.value === currentRole; });
    renderUserPermOverrides(data.permissionsOverride || {});
    const modal = document.getElementById('userPermissionsModal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
  } catch (error) { showToast('Failed to load user data', 'error'); }
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
      <div class="perm-row-label"><i class="fa-solid ${feature.icon}"></i><span>${feature.label}</span></div>
      <select class="perm-override-select" data-feature-override="${feature.key}">
        <option value="inherit" ${state === 'inherit' ? 'selected' : ''}>🔵 According toThe role</option>
        <option value="allow" ${state === 'allow' ? 'selected' : ''}>🟢 Activated</option>
        <option value="deny" ${state === 'deny' ? 'selected' : ''}>🔴 Disabled</option>
      </select>
    `;
    container.appendChild(row);
  });
  const maxVal = override.maxTransactions;
  const maxDisplay = typeof maxVal === 'number' ? maxVal : '';
  const maxRow = document.createElement('div');
  maxRow.className = 'perm-row';
  maxRow.innerHTML = `
    <div class="perm-row-label"><i class="fa-solid fa-list-ol"></i><span>endTransactions</span></div>
    <input type="number" min="-1" step="1" class="perm-max-input" id="userPermMaxTx" value="${maxDisplay}" placeholder="According toThe role">
  `;
  container.appendChild(maxRow);
}

function resetUserPermissionsOverride() {
  if (!editingUserPermissions) return;
  renderUserPermOverrides({});
  const currentRole = editingUserPermissions.data.role || 'free';
  const roleSelect = document.getElementById('userPermRole');
  Array.from(roleSelect.options).forEach(opt => { opt.selected = opt.value === currentRole; });
  showToast('Reset has been done — click Save to confirm', 'info');
}

function closeUserPermissionsModal() {
  const modal = document.getElementById('userPermissionsModal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
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
    showToast('Permissions saved successfully ✓', 'success');
    closeUserPermissionsModal();
    renderUsersList();
  } catch (error) { showToast('Failed to save permissions', 'error'); }
}

function subscribeToUserDoc(uid) {
  if (userDocUnsubscribe) { try { userDocUnsubscribe(); } catch(e) {} userDocUnsubscribe = null; }
  userDocUnsubscribe = db.collection('users').doc(uid).onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();
    if (data.disabled === true && !isSuperAdmin) { showSuspendedScreen(data.disabledReason); return; }
    if (window._accountSuspended) { location.reload(); return; }
    if (!isSuperAdmin && data.role && ROLES_META[data.role]) userRole = data.role;
    currentUserPermissionsOverride = data.permissionsOverride || null;
    applyRoleUI();
    refreshAll();
  });
}

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
    let rowsHtml = `
      <div class="perm-row">
        <div class="perm-row-label"><i class="fa-solid fa-list-ol"></i><span>endTransactions</span></div>
        <input type="number" min="-1" step="1" class="perm-max-input" value="${maxDisplay}" placeholder="∞" data-role="${roleKey}" data-key="maxTransactions" ${isAdminRole ? 'disabled' : ''}>
      </div>
    `;
    FEATURE_LIST.forEach(feature => {
      const isOn = perms[feature.key] === true;
      rowsHtml += `
        <div class="perm-row">
          <div class="perm-row-label"><i class="fa-solid ${feature.icon}"></i><span>${feature.label}</span></div>
          <button type="button" class="perm-toggle ${isOn ? 'on' : ''}" data-role="${roleKey}" data-key="${feature.key}" onclick="togglePerm(this)" ${isAdminRole ? 'disabled style="opacity:.5; cursor:not-allowed;"' : ''}></button>
        </div>
      `;
    });
    card.innerHTML = `
      <div class="role-card-header">
        <div class="role-card-title"><i class="fa-solid ${meta.icon}" style="color: #f97316;"></i><span>${meta.name}</span></div>
        ${isAdminRole ? '<span class="role-card-locked"><i class="fa-solid fa-lock"></i> stuffy</span>' : ''}
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
  if (userRole !== 'admin') { showToast('Unauthorized', 'error'); return; }
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
    showToast('Permissions saved successfully ✓', 'success');
    applyRoleUI();
    refreshAll();
  }
}

/* =========================================================
   LOGIN & AUTH
   ========================================================= */
function switchLoginMethod(method) {
  currentLoginMethod = method;
  ['google', 'guest'].forEach(m => {
    const tab = document.getElementById('loginTab' + m.charAt(0).toUpperCase() + m.slice(1));
    const panel = document.getElementById('loginPanel' + m.charAt(0).toUpperCase() + m.slice(1));
    if (tab) tab.classList.toggle('active', m === method);
    if (panel) panel.classList.toggle('hidden', m !== method);
  });
}

function loginAsGuest() {
  currentUser = {
    uid: 'guest-local-user', // Install theUID For the visitor so that he does not accidentally delete everythingRefresh
    displayName: 'Guest',
    email: 'guest@a7sbly.local',
    isAnonymous: true,
    providerData: [{ providerId: 'guest' }]
  };
  
  // We must call this to delete the data of the account that was previously accessed, if it was in it
  handleUserSwitch(currentUser.uid); 
  
  if (!window._guestSilent) showToast('Welcome to visitor mode 👋', 'success');
  hideLoginWall();
  const userProfile = document.getElementById('userProfile');
  if (userProfile) {
    userProfile.classList.remove('hidden');
    userProfile.classList.add('flex');
  }
  const footerSync = document.getElementById('footerSyncStatus');
  setSyncStatusUI('guest');
  userRole = 'free';
  isSuperAdmin = false;
  loadLocalData();
  loadInventory();
  loadRecurring();
  loadAuditLog();
  loadCatBudgets();
  loadChargeMachines();
  loadClientPhones();
  refreshAll();
  syncModeForCurrentUser();
  navigateSegmented('home');
  applyRoleUI();
  updatePinUI();
  scheduleAppTour(800);
  scheduleBackupCheck();
  scheduleLibPrefetch();
}

function setEmailMode(mode) {
  emailMode = mode;
  document.getElementById('emailModeSignin').classList.toggle('active', mode === 'signin');
  document.getElementById('emailModeSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('signupOnlyFields').classList.toggle('hidden', mode !== 'signup');
  document.getElementById('confirmPasswordWrapper').classList.toggle('hidden', mode !== 'signup');
  document.getElementById('forgotPasswordBtn').classList.toggle('hidden', mode === 'signup');
  const submitText = document.getElementById('emailSubmitText');
  const submitIcon = document.getElementById('emailSubmitIcon');
  submitText.textContent = mode === 'signup' ? 'Create account' : 'Login';
  submitIcon.className = mode === 'signup' ? 'fa-solid fa-user-plus' : 'fa-solid fa-right-to-bracket';
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

function showEmailError(msg) { const el = document.getElementById('emailError'); if (el) { el.textContent = msg; el.classList.remove('hidden'); } }
function hideEmailError() { const el = document.getElementById('emailError'); if (el) el.classList.add('hidden'); }
function showPhoneError(msg) { const el = document.getElementById('phoneError'); if (el) { el.textContent = msg; el.classList.remove('hidden'); } }
function hidePhoneError() { const el = document.getElementById('phoneError'); if (el) el.classList.add('hidden'); }

async function submitEmailAuth() {
  hideEmailError();
  const email = (document.getElementById('emailInput').value || '').trim().toLowerCase();
  const password = document.getElementById('passwordInput').value || '';
  const displayName = (document.getElementById('emailDisplayNameInput').value || '').trim();
  const confirmPassword = document.getElementById('confirmPasswordInput').value || '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showEmailError('❌ Please enter a valid email'); return; }
  if (!password || password.length < 6) { showEmailError('❌ The password must be at least 6 characters'); return; }
  if (emailMode === 'signup') {
    if (!displayName || displayName.length < 2) { showEmailError('❌ Please enter your full name'); return; }
    if (password !== confirmPassword) { showEmailError('❌ The two passwords do not match'); return; }
  }
  const btn = document.getElementById('emailSubmitBtn');
  btn.disabled = true;
  try {
    if (emailMode === 'signup') {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      if (cred.user && displayName) { try { await cred.user.updateProfile({ displayName }); } catch(e) {} }
      showToast(`Welcome, my friend ${displayName || 'friend'} 🎉`, 'success');
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      showToast(`Welcome back 👋`, 'success');
    }
  } catch (error) { showEmailError('❌ ' + (error.message || error.code)); }
  finally { btn.disabled = false; }
}

async function sendPasswordReset() {
  hideEmailError();
  const email = (document.getElementById('emailInput').value || '').trim().toLowerCase();
  if (!email) { showEmailError('❌ Write your email in the field above first'); return; }
  showToast('Sending recovery email...', 'info');
  try {
    await auth.sendPasswordResetEmail(email);
    showToast('The password recovery link has been sent to your email successfully 📧 (Check for Spam)', 'success');
  } catch (error) { 
    showEmailError('❌ Error:' + (error.message || error.code));
    showToast('Transmission failure: ' + error.code, 'error');
  }
}

function initRecaptcha() {
  if (recaptchaVerifier) return recaptchaVerifier;
  try {
    recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptchaContainer', {
      size: 'invisible', callback: () => {},
      'expired-callback': () => { try { recaptchaVerifier.clear(); } catch(e) {} recaptchaVerifier = null; }
    });
    return recaptchaVerifier;
  } catch (error) { return null; }
}

async function sendPhoneOTP() {
  hidePhoneError();
  const code = document.getElementById('phoneCountryCode').value || '+20';
  let number = (document.getElementById('phoneNumberInput').value || '').replace(/[^\d]/g, '');
  if (!number || number.length < 7) { showPhoneError('❌ Incorrect mobile number'); return; }
  if (code === '+20' && number.startsWith('0')) number = number.slice(1);
  const fullNumber = code + number;
  const btn = document.getElementById('sendOtpBtn');
  btn.disabled = true;
  try {
    const appVerifier = initRecaptcha();
    confirmationResult = await auth.signInWithPhoneNumber(fullNumber, appVerifier);
    document.getElementById('phoneStep1').classList.add('hidden');
    document.getElementById('phoneStep2').classList.remove('hidden');
    showToast('The code has been sent ✓', 'success');
  } catch (error) {
    showPhoneError('❌ ' + (error.message || error.code));
    if (recaptchaVerifier) { try { recaptchaVerifier.clear(); } catch(e) {} recaptchaVerifier = null; }
  } finally { btn.disabled = false; }
}

async function verifyPhoneOTP() {
  hidePhoneError();
  const code = (document.getElementById('otpInput').value || '').trim();
  if (!code || !/^\d{4,6}$/.test(code)) { showPhoneError('❌ The code consists of 6 numbers'); return; }
  if (!confirmationResult) { changePhoneNumber(); return; }
  const btn = document.getElementById('verifyOtpBtn');
  btn.disabled = true;
  try {
    const result = await confirmationResult.confirm(code);
    showToast(`Welcome, my friend ${result.user.phoneNumber} 👋`, 'success');
  } catch (error) { showPhoneError('❌ Invalid or expired code'); }
  finally { btn.disabled = false; }
}

function changePhoneNumber() {
  document.getElementById('phoneStep1').classList.remove('hidden');
  document.getElementById('phoneStep2').classList.add('hidden');
  document.getElementById('otpInput').value = '';
}

/* =========================================================
   CATEGORIES & DEMO
   ========================================================= */
const CATEGORIES = {
  expense: ['Work and maintenance tools','Activation, servers and credit','Food and drinks','Transportation and gasoline','Invoices and obligations','Personal and family','Purchases','Other'],
  income: ['Software services and maintenance','Recharging balance and activating tools','Remote work online','Accessory and hardware sales','Commission/broker','Other profits'],
  charity: ['An ongoing charity for the sake of God','Helping someone in need and relieving distress','Feed food','Righteousness, religion, and family','Zakat on money','Other'],
  debt_receivable: ['Maintenance shop account','A personal advance to a friend','The rest of the service is for a client','Forward sales','Other'],
  debt_payable: ['A debt to a server supplier/distributor','An advance owed to another','Deferred invoice','Forward purchase','Other']
};

const DEMO_ITEMS = [
  { id:'demo-1', type:'income', amount:1200, category:'Software services and maintenance', client:'Ahmed', paymentMethod:'Cash', notes:'Repair bootloader and flash 3 devices', reference:'INV-1001', date:offsetDate(-1), time:'02:30 PM' },
  { id:'demo-2', type:'charity', amount:150, category:'Helping someone in need and relieving distress', client:'', paymentMethod:'Cash', notes:'A charity of gratitude', reference:'', date:offsetDate(-1), time:'03:15 PM' },
  { id:'demo-3', type:'expense', amount:380, category:'Activation, servers and credit', client:'Mohamed server distributor', paymentMethod:'InstaPay', notes:'Activate the dongle package', reference:'EXP-3001', date:offsetDate(-2), time:'05:40 PM' },
  { id:'demo-4', type:'income', amount:950, category:'Remote work online', client:'Mansoura store', paymentMethod:'InstaPay', notes:'Remote service', reference:'INV-1002', date:offsetDate(-2), time:'08:10 PM' },
  { id:'demo-5', type:'expense', amount:90, category:'Food and drinks', client:'', paymentMethod:'Vodafone Cash/Wallet', notes:'Lunch', reference:'', date:offsetDate(-3), time:'01:00 PM' },
  { id:'demo-6', type:'debt_receivable', amount:650, paidAmount:200, category:'Maintenance shop account', client:'Ahmed', paymentMethod:'Pending', notes:'The rest of the flash account is 4 devices', reference:'', status:'pending', date:offsetDate(-4), time:'11:20 AM' },
  { id:'demo-7', type:'debt_payable', amount:400, paidAmount:0, category:'A debt to a server supplier/distributor', client:'Mohamed server distributor', paymentMethod:'Pending', notes:'Credit Server', reference:'', status:'pending', date:offsetDate(-5), time:'04:15 PM' }
];

/* =========================================================
   AUTH GUARDS & PIN
   ========================================================= */
function requireAuth() {
  if (!currentUser) { showToast('You must log in first', 'error'); return false; }
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
function getPin() { return lsGet(PIN_KEY); }

/* ---------- PIN v3: PBKDF2 + salt random+ Sync acrossFirestore ----------
   Cloud path:users/{uid}/security/lock  => { v:3, salt, hash, iter, updatedAt }
   The shopy (PIN_KEY): Same record asJSON (Or hash oldSHA-256 is automatically upgraded)*/
const PIN_ITER = 200000;
function pinB64(u8) { let s = ''; u8.forEach(b => { s += String.fromCharCode(b); }); return btoa(s); }
function pinUnB64(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
async function pbkdf2Pin(pin, saltB64, iter) {
  if (!(window.crypto && crypto.subtle)) throw new Error('crypto-unavailable');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: pinUnB64(saltB64), iterations: iter, hash: 'SHA-256' }, key, 256);
  return pinB64(new Uint8Array(bits));
}
async function makePinRecord(pin) {
  const salt = pinB64(crypto.getRandomValues(new Uint8Array(16)));
  return { v: 3, salt, hash: await pbkdf2Pin(pin, salt, PIN_ITER), iter: PIN_ITER };
}
function parsePinRecord(raw) {
  if (!raw || raw.charAt(0) !== '{') return null;
  try {
    const r = JSON.parse(raw);
    if (r && r.v === 3 && typeof r.salt === 'string' && typeof r.hash === 'string' && Number.isInteger(r.iter)) return r;
  } catch (e) { /* ignore */ }
  return null;
}
async function verifyPin(entered) {
  const raw = getPin();
  if (!raw) return true;
  const rec = parsePinRecord(raw);
  if (rec) return (await pbkdf2Pin(entered, rec.salt, rec.iter)) === rec.hash;
  return (await hashPin(entered)) === raw; // Old code (beforev3)
}
function pinDocRef(uid) { return db.collection('users').doc(uid).collection('security').doc('lock'); }
function pinWithTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
async function syncPinFromCloud(uid) {
  try {
    const snap = await pinWithTimeout(pinDocRef(uid).get(), 4000);
    if (snap.exists) {
      const d = snap.data() || {};
      if (d.v === 3 && d.salt && d.hash && Number.isInteger(d.iter)) {
        lsSet(PIN_KEY, JSON.stringify({ v: 3, salt: d.salt, hash: d.hash, iter: d.iter }));
      }
    } else if (parsePinRecord(getPin())) {
      lsDel(PIN_KEY); // Download from another device
    }
    return true;
  } catch (e) { console.warn('PIN cloud sync skipped:', e); return false; }
}
async function savePinEverywhere(pin) {
  if (!currentUser) throw new Error('auth');
  const rec = await makePinRecord(pin);
  await pinDocRef(currentUser.uid).set({ ...rec, updatedAt: Date.now() });
  lsSet(PIN_KEY, JSON.stringify(rec));
}
async function clearPinEverywhere() {
  if (currentUser) await pinDocRef(currentUser.uid).delete();
  lsDel(PIN_KEY);
  lsDel(PIN_ACTIVE_KEY);
}

function showAuthLoading() {
  document.body.classList.add('auth-pending');
  document.body.classList.remove('not-authed');
  document.getElementById('authLoading').style.display = 'flex';
  document.getElementById('loginWall').classList.add('hidden');
}
function hideAuthLoading() {
  document.body.classList.remove('auth-pending');
  document.getElementById('authLoading').style.display = 'none';
}
function showLoginWall() {
  if (window.isPortalModeActive || new URLSearchParams(window.location.search).has('client')) return;
  if (isPortalModeActive) return;
  document.body.classList.add('not-authed');
  document.getElementById('loginWall').classList.remove('hidden');
  document.getElementById('loginWall').classList.add('flex');
  document.getElementById('userProfile').classList.add('hidden');
}
function hideLoginWall() {
  document.body.classList.remove('not-authed');
  document.getElementById('loginWall').classList.add('hidden');
}
function hidePinLock() {
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('lockScreen').classList.remove('flex');
}

function handleUserSwitch(uid) {
  // Instead of deleting the dataUser The one before that, allUser It has an independent storage space.
  // Here we just zero the memory (RAM) So that there is no trace of the session leftPrevious.
  migrateLegacyLocalData(uid);
  transactions = [];
  inventoryItems = [];
  recurringExpenses = [];
  auditLogs = [];
  categoryBudgets = {};
  chargeMachines = [];
  workspaceUid = null; teamPerms = null; clientPhones = {};
  lastDeletedId = null;
  localStorage.setItem(LAST_UID_KEY, uid);
}

/* =========================================================
   AUTH STATE
   ========================================================= */

/* =========================================================
   condition"Not registered" (afterSign out From an accountOr From visitor mode)
   ========================================================= */
function applySignedOutState() {
  lsDel(PIN_ACTIVE_KEY);
  closeAllOverlays();
  currentUser = null;
  userRole = 'free';
  isSuperAdmin = false;
  currentUserPermissionsOverride = null;
  rolePermissions = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));

  transactions = [];
  inventoryItems = [];
  recurringExpenses = [];
  auditLogs = [];
  categoryBudgets = {};
  chargeMachines = [];
  workspaceUid = null; teamPerms = null; clientPhones = {};
  if (typeof applyTeamUI === 'function') applyTeamUI();
  if (typeof clearNotices === 'function') clearNotices();
  if (typeof hideSuspendedScreen === 'function') hideSuspendedScreen();
  if (typeof closeChargeMachines === 'function') closeChargeMachines();

  [() => userDocUnsubscribe, () => transactionsUnsubscribe, () => requestsUnsubscribe, () => cloudUserMetaUnsubscribe]
    .forEach(get => { try { const fn = get(); if (typeof fn === 'function') fn(); } catch (e) {} });
  userDocUnsubscribe = null; transactionsUnsubscribe = null; requestsUnsubscribe = null; cloudUserMetaUnsubscribe = null;
  cloudSnapshot.clear(); portalIndex.clear(); portalPayloadCache.clear();

  if (typeof _tourDriver !== 'undefined' && _tourDriver) _finishTour(false);
  hidePinLock();
  showLoginWall();
  const footerSync = document.getElementById('footerSyncStatus');
  if (footerSync) footerSync.innerHTML = `<i class="fa-solid fa-database text-amber-500"></i>Sign in to sync  `;
  loadAllLocal();
  applyRoleUI();
}

/* =========================================================
   Introductory tour (Onboarding Tour) — Professional for mobile and computer
   - You are waiting for the login / lock / selection screenthe situation You close
   - It skips any item that does not appear on the current device (mobileOr computer)
   - It appears once on the device, and can be retrieved from the filePersonal
   ========================================================= */
const TOUR_DONE_KEY = 'a7sbly_tour_done_v6';
let _tourDriver = null;
let _tourTimer = null;
let _tourKeyHandler = null;

function _tourVisible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}
function _tourFirstVisible(selectors) {
  for (const sel of [].concat(selectors)) {
    for (const el of document.querySelectorAll(sel)) if (_tourVisible(el)) return el;
  }
  return null;
}
function _tourBlocked() {
  if (typeof admViewActive === 'function' && admViewActive()) return true;
  const b = document.body.classList;
  if (b.contains('not-authed') || b.contains('auth-pending')) return true;
  return ['authLoading', 'loginWall', 'lockScreen', 'modeOnboardingModal', 'userProfileModal', 'guestImportModal', 'mobileInstallModal', 'pinModal', 'teamInviteModal', 'clientPhoneModal'].some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  });
}

function scheduleAppTour(delay = 800, force = false) {
  if (!force && localStorage.getItem(TOUR_DONE_KEY)) return;
  clearTimeout(_tourTimer);
  const deadline = Date.now() + 90000;
  const tick = () => {
    if (!currentUser || _tourDriver) return;
    const im = document.getElementById('mobileInstallModal');
    if (im && !im.classList.contains('hidden') && typeof dismissMobileInstall === 'function') dismissMobileInstall();
    if (_tourBlocked()) {
      if (Date.now() < deadline) _tourTimer = setTimeout(tick, 700);
      return;
    }
    startAppTour({ force });
  };
  _tourTimer = setTimeout(tick, delay);
}

function _finishTour(completed) {
  localStorage.setItem(TOUR_DONE_KEY, 'true');
  const d = _tourDriver;
  _tourDriver = null;
  if (_tourKeyHandler) { document.removeEventListener('keydown', _tourKeyHandler, true); _tourKeyHandler = null; }
  try { if (d) d.destroy(); } catch (e) {}
  if (completed && typeof confetti === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    confetti({ particleCount: 90, spread: 75, origin: { y: .65 } });
  }
}

function startAppTour(opts) {
  const force = opts === true || !!(opts && opts.force);
  if (_tourDriver || !currentUser) return;
  if (!force && localStorage.getItem(TOUR_DONE_KEY)) return;
  const driverFactory = window.driver && window.driver.js && window.driver.js.driver;
  if (!driverFactory) { console.warn('Driver.js not loaded'); return; }

  const installModal = document.getElementById('mobileInstallModal');
  if (installModal && !installModal.classList.contains('hidden') && typeof dismissMobileInstall === 'function') dismissMobileInstall();
  navigateSegmented('home');
  window.scrollTo(0, 0);
  setTimeout(() => _runAppTour(driverFactory), 400);
}

function _runAppTour(driverFactory) {
  if (_tourDriver || !currentUser || _tourBlocked()) return;

  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const isBusiness = (document.body.getAttribute('data-mode') || 'business') === 'business';
  const canMode = !!_tourFirstVisible(['#modeSwitcherBtn']);
  const T = {
  welcomeTitle: "a7sbly complete tour 👋",
  welcomeDesc: "Short steps that explain every real control:<br>language, account, balances, quick add, transactions, debts, clients, inventory, reports and security.<br>Use Next/Back or Esc, and skip any time.",
  langTitle: "Arabic / English any time 🌐",
  langDesc: "The <b>EN / AR</b> button switches language and layout instantly. Your choice is remembered and your data stays exactly the same.",
  profileTitle: "Your profile 👤",
  profileDesc: "Avatar and name, sync status, theme, account type, workspace, replay this tour, and sign out.",
  alertTitle: "Money alerts 🔔",
  alertDesc: "When requests or due debts exist, this counter takes you straight to the details.",
  modeTitle: "Shop or personal? 🏪 / 👤",
  modeDesc: "One tap separates shop data (debts, clients, inventory) from your personal data. Each account stays independent.",
  ccTitle: "Control center: all tools 🎛️",
  ccDesc: "Shift closing, wallet transfers, charge machines, repairs, PDF/Excel reports, backup, PIN, team, and admin panel — all in one place.",
  ccSearchTitle: "Find any tool 🔎",
  ccSearchDesc: "Type the tool name in search — e.g. “PDF”, “backup” or “PIN” — and it appears instantly. The tabs above group the tools.",
  balanceTitle: "Your balance in one card 💳",
  balanceDesc: "Net balance, income, expenses, charity and wallets. Numbers refresh immediately after every entry.",
  privacyTitle: "Hide the numbers 👁️",
  privacyDesc: "Tap the eye to hide or reveal balances at any time, without adding any transaction.",
  qaTitle: "The + button ⚡",
  qaDesc: "Available on every screen: bottom bar on mobile, floating button on desktop. Everything new starts here.",
  qaSheetTitle: "Quick add menu 📋",
  qaSheetDesc: "Income, expense, charity, budget — plus for shops: receivable, payable, shift closing and charge machines. Pick a type and fill the form.",
  txTitle: "Transactions 🧾",
  txDesc: "Search, review the summary, open any entry to edit or delete it, and view its receipt. Date, time, category, client and payment method are all here.",
  debtTitle: "Debts 🤝",
  debtDesc: "Filter “receivable / payable / overdue”. Open a debt to record full or partial payment, or send a WhatsApp reminder to the client.",
  clientTitle: "Clients 👥",
  clientDesc: "A full ledger per client: income, receivable, payable, WhatsApp number and all transactions. Search and sorting are right on top.",
  invTitle: "Spare-parts inventory 📦",
  invDesc: "Items, price, quantity and low-stock alert. Add or edit an item without leaving the page.",
  auditTitle: "Activity log 🕘",
  auditDesc: "Every add, edit or delete is recorded here with date and user. If something changed, you can trace it.",
  budgetTitle: "Monthly budget 💰",
  budgetDesc: "Set a monthly cap and per-category budgets. The bar compares spending with the limit and changes color near the danger zone.",
  profitTitle: "Profit curve 📈",
  profitDesc: "Choose day / week / month / year and open the follow-up table. It shows period start, end and net profit.",
  footerTitle: "Save & sync ☁️",
  footerDesc: "Here you see your data state: synced to cloud, guest on this device, or syncing. The app also works offline.",
  doneTitle: "Ready to start 🚀",
  doneDesc: "Record your first entry with the + button. To see this tour again: Profile → Guided tour.<br>Good luck!",
  progress: "{{current}} of {{total}}",
  next: "Next",
  prev: "Back",
  done: "Let’s start 🚀",
  skip: "Skip tour"
};

  const wait = ms => new Promise(res => setTimeout(res, ms));
  const tourNext = (fn, delay) => (el, step, ctx) => {
    try { if (fn) fn(); } catch (e) { console.warn('a7sbly tour action failed', e); }
    setTimeout(() => { if (_tourDriver) _tourDriver.moveNext(); }, delay || 240);
  };
  const tourPrev = (fn, delay) => (el, step, ctx) => {
    try { if (fn) fn(); } catch (e) { console.warn('a7sbly tour action failed', e); }
    setTimeout(() => { if (_tourDriver) _tourDriver.movePrevious(); }, delay || 200);
  };

  const navHome = () => {
    try {
      navigateSegmented('home');
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (e) {}
  };
  const goTab = tab => () => {
    try {
      if (typeof switchTab === 'function') switchTab(tab, false);
      else navigateSegmented(tab);
    } catch (e) {}
  };
  const openCC = () => { try { openControlCenter(); } catch (e) {} };
  const closeCC = () => { try { closeControlCenter(); } catch (e) {} };
  const openQA = () => { try { openQuickAdd(); } catch (e) {} };
  const closeQA = () => { try { closeQuickAdd(false); } catch (e) {} };
  const restoreQA = () => {
    const sheet = document.getElementById('quickAddSheet');
    if (sheet && sheet.classList.contains('hidden')) openQA();
  };

  const mk = (selector, title, description, opts) => {
    const o = opts || {};
    const popover = {
      title: title,
      description: description,
      side: o.side || 'bottom',
      align: o.align || 'center'
    };
    if (o.next) popover.onNextClick = tourNext(o.next, o.wait);
    if (o.prev) popover.onPrevClick = tourPrev(o.prev, o.wait);
    const out = { popover: popover };
    if (selector) out.element = selector;
    return out;
  };

  const steps = [];
  steps.push(mk(null, T.welcomeTitle, T.welcomeDesc, { side: 'over' }));
  steps.push(mk('#a7LangToggle', T.langTitle, T.langDesc, { side: isMobile ? 'bottom' : 'right' }));
  steps.push(mk('#userProfile', T.profileTitle, T.profileDesc, { side: isMobile ? 'bottom' : 'right' }));
  if (_tourFirstVisible(['#globalPendingAlert'])) {
    steps.push(mk('#globalPendingAlert', T.alertTitle, T.alertDesc, { side: isMobile ? 'bottom' : 'right' }));
  }
  if (canMode) {
    steps.push(mk('#modeSwitcherBtn', T.modeTitle, T.modeDesc, { side: isMobile ? 'bottom' : 'right' }));
  }

  steps.push(mk('#controlCenterBtn', T.ccTitle, T.ccDesc, { side: isMobile ? 'bottom' : 'right' }));
  steps.push(mk('#controlCenterModal .cc-head', T.ccSearchTitle, T.ccSearchDesc, {
    side: 'right', next: openCC, prev: closeCC
  }));
  steps.push(mk('#ccSearch', T.ccTitle, T.ccDesc, {
    side: 'bottom', next: () => { closeCC(); navHome(); }, prev: openCC
  }));

  const balanceSel = isMobile ? '#mobileHero' : '#desktopHero';
  steps.push(mk(balanceSel, T.balanceTitle, T.balanceDesc, { side: 'bottom' }));
  const privacySel = isMobile ? '#privacyIcon' : '#privacyIconDk';
  if (_tourFirstVisible([privacySel])) {
    steps.push(mk(privacySel, T.privacyTitle, T.privacyDesc, { side: isMobile ? 'bottom' : 'right' }));
  }

  const qaSel = isMobile ? '.mob-nav-fab' : '#desktopFab';
  steps.push(mk(qaSel, T.qaTitle, T.qaDesc, { side: 'top', next: openQA }));
  steps.push(mk('#quickAddSheet .qa-panel', T.qaSheetTitle, T.qaSheetDesc, {
    side: 'top', next: () => { closeQA(); goTab('transactions')(); }, prev: closeQA
  }));

  steps.push(mk('#panelTransactions', T.txTitle, T.txDesc, {
    side: 'top', next: goTab('debts'), prev: restoreQA
  }));
  if (isBusiness) {
    steps.push(mk('#panelDebts', T.debtTitle, T.debtDesc, {
      side: 'top', next: goTab('clients'), prev: goTab('transactions')
    }));
    steps.push(mk('#panelClients', T.clientTitle, T.clientDesc, {
      side: 'top', next: goTab('inventory'), prev: goTab('debts')
    }));
    steps.push(mk('#panelInventory', T.invTitle, T.invDesc, {
      side: 'top', next: goTab('audit'), prev: goTab('clients')
    }));
  }
  steps.push(mk('#panelAudit', T.auditTitle, T.auditDesc, {
    side: 'top', next: navHome, prev: goTab('inventory')
  }));
  steps.push(mk('#budgetUsed', T.budgetTitle, T.budgetDesc, {
    side: 'bottom', prev: () => { navHome(); goTab('audit')(); }
  }));
  steps.push(mk('#profitCurveCard', T.profitTitle, T.profitDesc, {
    side: 'bottom', prev: navHome
  }));
  steps.push(mk('#footerSyncStatus', T.footerTitle, T.footerDesc, {
    side: 'top', prev: navHome
  }));
  steps.push(mk(null, T.doneTitle, T.doneDesc, { side: 'over' }));

  if (steps.length < 3) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lastIndex = steps.length - 1;

  _tourDriver = driverFactory({
    steps: steps,
    popoverClass: 'a7-tour',
    showProgress: true,
    progressText: T.progress,
    nextBtnText: T.next,
    prevBtnText: T.prev,
    doneBtnText: T.done,
    showButtons: ['next', 'previous'],
    allowClose: false,
    allowKeyboardControl: true,
    overlayColor: '#05060a',
    overlayOpacity: 0.82,
    stagePadding: isMobile ? 7 : 11,
    stageRadius: 18,
    popoverOffset: isMobile ? 12 : 16,
    smoothScroll: !reduceMotion,
    animate: !reduceMotion,
    onPopoverRender: (popover, { state }) => {
      try {
        const old = popover.footer.querySelector('.a7-tour-skip');
        if (old) old.remove();
        if (state.activeIndex !== lastIndex) {
          const skip = document.createElement('button');
          skip.type = 'button';
          skip.className = 'a7-tour-skip';
          skip.textContent = T.skip;
          skip.addEventListener('click', () => _finishTour(false));
          popover.footer.appendChild(skip);
        }
      } catch (e) {}
    },
    onDestroyStarted: (element, step, { state }) => {
      _finishTour(!!state && state.activeIndex === lastIndex);
    }
  });

  _tourKeyHandler = e => { if (e.key === 'Escape') _finishTour(false); };
  document.addEventListener('keydown', _tourKeyHandler, true);
  _tourDriver.drive();
}

auth.onAuthStateChanged(async user => {
  if (typeof admViewActive === 'function' && admViewActive()) admExitViewAs({ silent: true });
  // Old code forauth
  if (window.isPortalModeActive || new URLSearchParams(window.location.search).has('client')) return;
  if (isPortalModeActive) return;
  hideAuthLoading();
  authResolved = true;

  const avatar = document.getElementById('userAvatar');
  const footerSync = document.getElementById('footerSyncStatus');
  const userProfile = document.getElementById('userProfile');

  if (user) {
    currentUser = user;
    localStorage.removeItem(GUEST_SESSION_KEY);
    handleUserSwitch(user.uid);
    hideLoginWall();
    syncModeForCurrentUser();
    if (userProfile) {
      userProfile.classList.remove('hidden');
      userProfile.classList.add('flex');
    }

    if (avatar) {
      if (user.photoURL) avatar.src = user.photoURL;
      else {
        const initial = (user.displayName || user.email || user.phoneNumber || 'U').charAt(0).toUpperCase();
        avatar.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' rx='10' fill='%23f97316'/><text x='50%' y='55%' text-anchor='middle' dominant-baseline='middle' font-size='20' font-family='Inter' fill='white' font-weight='bold'>${escapeHTML(initial)}</text></svg>`;
      }
    }

    const userIdentifier = user.email || user.phoneNumber || 'User';
    if (footerSync) {
      footerSync.innerHTML = `<i class="fa-solid fa-cloud text-emerald-500"></i>connected to the cloud (${escapeHTML(userIdentifier)})`;
    }

    await loadUserRole(user.uid);
    if (window._accountSuspended) return;
    await loadRolePermissions();
    await resolveWorkspace(user);
    if (isTeamMode()) syncModeForCurrentUser();
    applyTeamUI();

    loadAllLocal();
    refreshAll();
    navigateSegmented('home');

    setSyncStatusUI('syncing');
    subscribeToUserDoc(user.uid);
    updatePinUI();
    updateNotificationUI(localStorage.getItem('ehsebli_notif_enabled') === 'true');

    checkPendingShare();

    loadCloudData(wsUid()).finally(() => {
      if (getPin() && !pinStillUnlocked() && !(typeof admViewActive === 'function' && admViewActive())) showPinLock();
      else { hidePinLock(); if (getPin()) markPinActive(); }
      
      // Run the Tutorial after everything you need to download
      maybeOfferGuestImport();
      maybeShowTeamInvites();
      scheduleAppTour(1500);
      scheduleBackupCheck();
      scheduleLibPrefetch();
    });
  } else {
    if (localStorage.getItem(GUEST_SESSION_KEY) === '1') { window._guestSilent = true; try { loginAsGuest(); } finally { window._guestSilent = false; } }
    else applySignedOutState();
  }
});


function logout() {
  if (typeof admViewActive === 'function' && admViewActive()) {
    openConfirm(VIEWX.exitTitle, VIEWX.exitBody, () => admExitViewAs());
    return;
  }
  if (!currentUser) return;
  if (isRealCloudUser()) {
    openConfirm('Sign out?', 'The session will be terminated. Your data is securely stored in the cloud.', () => auth.signOut());
  } else {
    openConfirm('Exit visitor mode?', 'Visitor data is stored on this device only and completely separate from any account, and you will find it when you log in as a second visitor.', () => { localStorage.removeItem(GUEST_SESSION_KEY); applySignedOutState(); });
  }
}
function logoutFromLock() {
  if (isRealCloudUser()) auth.signOut(); else { localStorage.removeItem(GUEST_SESSION_KEY); applySignedOutState(); }
}

/* =========================================================
   REALTIME LISTENER
   ========================================================= */
const cloudSnapshot = new Map(); // id -> JSON last known in cloud
let syncChain = Promise.resolve();
const txJSON = t => JSON.stringify(normalizeTransaction(t), (k, v) => (v === undefined ? null : v));
const txCol = uid => db.collection('users').doc(uid).collection('transactions');

function subscribeToCloudTransactions(uid) {
  if (transactionsUnsubscribe) { try { transactionsUnsubscribe(); } catch(e) {} transactionsUnsubscribe = null; }
  transactionsUnsubscribe = txCol(uid).onSnapshot({ includeMetadataChanges: false }, snap => {
    if (snap.metadata.hasPendingWrites) return;
    let changed = false;
    snap.docChanges().forEach(ch => {
      const id = ch.doc.id;
      if (ch.type === 'removed') {
        cloudSnapshot.delete(id);
        const i = transactions.findIndex(t => t.id === id);
        if (i >= 0) { transactions.splice(i, 1); changed = true; }
        return;
      }
      const data = ch.doc.data();
      if (!validateTransaction(data)) return;
      const remote = normalizeTransaction(data);
      cloudSnapshot.set(id, txJSON(remote));
      const i = transactions.findIndex(t => t.id === id);
      if (i < 0) { transactions.push(remote); changed = true; }
      else if ((Number(remote._updatedAt) || 0) >= (Number(transactions[i]._updatedAt) || 0) && txJSON(transactions[i]) !== txJSON(remote)) {
        transactions[i] = remote; changed = true;
      }
    });
    if (changed) { saveLocalData(); refreshAll(); refreshSharedPortals(); }
  }, err => console.warn('Realtime sync warning:', err));
}

/* =========================================================
   CLOUD SYNC
   ========================================================= */
function mergeTransactions(local, cloud) {
  const map = new Map();
  cloud.forEach(t => { if (t && t.id && validateTransaction(t)) map.set(t.id, normalizeTransaction(t)); });
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

function syncToCloud() {
  syncChain = syncChain.then(doSyncToCloud).catch(() => {});
  return syncChain;
}

function isRealCloudUser() {
  return currentUser && !currentUser.isAnonymous && !String(currentUser.uid || '').startsWith('guest-');
}

function setSyncStatusUI(state, detail = '') {
  const footerSync = document.getElementById('footerSyncStatus');
  const guestBanner = document.getElementById('guestSyncWarningBanner');
  if (guestBanner) {
    guestBanner.classList.toggle('hidden', state !== 'guest');
  }
  if (!footerSync) return;
  if (state === 'syncing') {
    footerSync.className = 'text-amber-400 flex items-center gap-1.5 font-black';
    footerSync.innerHTML = `<i class="fa-solid fa-rotate fa-spin"></i> <span>Syncing with the cloud...</span>`;
  } else if (state === 'synced') {
    footerSync.className = 'text-emerald-400 flex items-center gap-1.5 font-black';
    footerSync.innerHTML = `<i class="fa-solid fa-cloud"></i> <span>Cloud synchronized${detail ? '(' + escapeHTML(detail) + ')' : '✓'}</span>`;
  } else if (state === 'guest') {
    footerSync.className = 'text-orange-400 flex items-center gap-1.5 font-black';
    footerSync.innerHTML = `<i class="fa-solid fa-user-secret"></i> <span>Visitor mode (local only)  </span>`;
  } else if (state === 'error') {
    footerSync.className = 'text-rose-400 flex items-center gap-1.5 font-black';
    footerSync.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>Sync error:   ${escapeHTML(detail)}</span>`;
  }
}

let cloudUserMetaUnsubscribe = null;

async function doSyncToCloud() {
  if (!currentUser) return;
  if (!isRealCloudUser()) {
    setSyncStatusUI('guest');
    return;
  }
  const uid = wsUid();
  setSyncStatusUI('syncing');
  try {
    const ops = [];
    const localIds = new Set();
    transactions.forEach(t => {
      if (!t || !t.id || !validateTransaction(t)) return;
      localIds.add(t.id);
      const j = txJSON(t);
      if (cloudSnapshot.get(t.id) !== j) ops.push({ kind: 'set', id: t.id, json: j });
    });
    // Never mirror an empty/partial local list into destructive cloud deletes.
    // Only an explicit user wipe (confirmClearData / exitDemoData) may remove all docs.
    if (transactions.length > 0 || window._a7ExplicitWipe === true) {
      cloudSnapshot.forEach((_, id) => {
        if (!localIds.has(id)) ops.push({ kind: 'del', id });
      });
    }
    window._a7ExplicitWipe = false;

    if (isTeamMode()) {   // A member can only be removed if his powers allow him (the rules prohibit otherwise and are invalidated).Paymentall)
      const keep = ops.filter(op => {
        if (op.kind === 'del') return teamPerms && teamPerms.deleteTx === true;
        let t = {}; try { t = JSON.parse(op.json); } catch (e) {}
        const exists = cloudSnapshot.has(op.id);
        const debt = t.type === 'debt_receivable' || t.type === 'debt_payable';
        if (!exists) return t.type === 'income' ? teamPerms.addIncome === true : (t.type === 'expense' || t.type === 'charity') ? teamPerms.addExpense === true : debt ? teamPerms.debts === true : false;
        if (t._deleted === true && teamPerms.deleteTx !== true) return false;
        return teamPerms.editTx === true || (debt && teamPerms.debts === true);
      });
      ops.length = 0; ops.push(...keep);
    }
    for (let i = 0; i < ops.length; i += 400) {
      const batch = db.batch();
      ops.slice(i, i + 400).forEach(op => {
        const ref = txCol(uid).doc(op.id);
        if (op.kind === 'set') batch.set(ref, JSON.parse(op.json));
        else batch.delete(ref);
      });
      await batch.commit();
      ops.slice(i, i + 400).forEach(op => {
        if (op.kind === 'set') cloudSnapshot.set(op.id, op.json);
        else cloudSnapshot.delete(op.id);
      });
    }

    const userPayload = {
      budget: getBudget() || 0,
      inventory: Array.isArray(inventoryItems) ? inventoryItems : [],
      recurring: Array.isArray(recurringExpenses) ? recurringExpenses : [],
      catBudgets: sanitizeCatBudgets(categoryBudgets),
      chargeMachines: sanitizeMachines(chargeMachines),
      txCount: transactions.filter(t => !t._deleted).length,
      clientPhones: sanitizeClientPhones(clientPhones),
      appVersion: '20.10',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (isTeamMode()) {   // The member does not writeBudget/Fixed, Possible/The store Only validly
      delete userPayload.budget; delete userPayload.recurring; delete userPayload.catBudgets;
      if (!teamPerms || teamPerms.machines !== true) delete userPayload.chargeMachines;
      if (!teamPerms || teamPerms.inventory !== true) delete userPayload.inventory;
      if (!teamPerms || !(teamPerms.clients === true || teamPerms.debts === true)) delete userPayload.clientPhones;
    }
    await db.collection('users').doc(uid).set(userPayload, { merge: true });

    refreshSharedPortals();
    setSyncStatusUI('synced', currentUser.email || '');
  } catch (error) {
    console.error('Cloud sync error:', error);
    setSyncStatusUI('error', error.code || error.message);
    showToast('Cloud sync failure: ' + (error.code || error.message), 'error');
  }
}

async function forceSyncToCloud() { return syncToCloud(); }

async function loadCloudData(uid) {
  if (!isRealCloudUser()) {
    setSyncStatusUI('guest');
    return;
  }
  setSyncStatusUI('syncing');
  try {
    const userRef = db.collection('users').doc(uid);
    let userDoc = { exists: false, data: () => ({}) };
    try {
      userDoc = await userRef.get();
    } catch (uErr) {
      console.warn('userRef.get warning:', uErr);
    }
    const txSnap = await txCol(uid).get();
    const cloudTx = [];
    cloudSnapshot.clear();
    txSnap.forEach(d => {
      const v = d.data();
      if (validateTransaction(v)) {
        const norm = normalizeTransaction(v);
        cloudTx.push(norm);
        cloudSnapshot.set(d.id, txJSON(norm));
      }
    });

    let legacyTx = [], legacyReqs = [];
    if (userDoc.exists) {
      const data = userDoc.data();
      if (Array.isArray(data.transactions)) legacyTx = data.transactions;
      if (Array.isArray(data.pendingRequests)) legacyReqs = data.pendingRequests;
      if (data.budget !== undefined) lsSet(BUDGET_KEY, data.budget);
      if (Array.isArray(data.inventory)) {
        inventoryItems = data.inventory;
        lsSet(INVENTORY_KEY, JSON.stringify(inventoryItems));
      }
      if (Array.isArray(data.recurring)) {
        recurringExpenses = data.recurring;
        lsSet(RECURRING_KEY, JSON.stringify(recurringExpenses));
      }
      if (data.catBudgets && typeof data.catBudgets === 'object') {
        categoryBudgets = sanitizeCatBudgets(data.catBudgets);
        lsSet(CATBUDGET_KEY, JSON.stringify(categoryBudgets));
      }
      if (Array.isArray(data.chargeMachines)) {
        chargeMachines = sanitizeMachines(data.chargeMachines);
        lsSet(CHARGE_KEY, JSON.stringify(chargeMachines));
      }
      if (data.clientPhones && typeof data.clientPhones === 'object') {
        clientPhones = sanitizeClientPhones(data.clientPhones);
        lsSet(CLIENT_PHONES_KEY, JSON.stringify(clientPhones));
      }
    }

    transactions = mergeTransactions(mergeTransactions(transactions, cloudTx), legacyTx);
    saveLocalData();
    refreshAll();
    if (typeof renderInventory === 'function') renderInventory();

    await doSyncToCloud();

    if (!isTeamMode() && (legacyTx.length || legacyReqs.length)) {
      const b = db.batch();
      legacyReqs.forEach(r => { if (r && r.id) b.set(userRef.collection('requests').doc(r.id), r); });
      b.update(userRef, {
        transactions: firebase.firestore.FieldValue.delete(),
        pendingRequests: firebase.firestore.FieldValue.delete()
      });
      await b.commit();
    }

    if (!isTeamMode()) { await loadPortalIndex(uid); subscribeToRequests(uid); }
    subscribeToCloudTransactions(uid);

    if (cloudUserMetaUnsubscribe) { try { cloudUserMetaUnsubscribe(); } catch(e) {} }
    cloudUserMetaUnsubscribe = userRef.onSnapshot(snap => {
      if (!snap.exists || snap.metadata.hasPendingWrites) return;
      const d = snap.data();
      let needRefresh = false;
      if (d.budget !== undefined && Number(d.budget) !== getBudget()) {
        lsSet(BUDGET_KEY, d.budget);
        needRefresh = true;
      }
      if (Array.isArray(d.inventory) && JSON.stringify(d.inventory) !== JSON.stringify(inventoryItems)) {
        inventoryItems = d.inventory;
        lsSet(INVENTORY_KEY, JSON.stringify(inventoryItems));
        if (typeof renderInventory === 'function') renderInventory();
      }
      if (Array.isArray(d.recurring) && JSON.stringify(d.recurring) !== JSON.stringify(recurringExpenses)) {
        recurringExpenses = d.recurring;
        lsSet(RECURRING_KEY, JSON.stringify(recurringExpenses));
      }
      if (d.catBudgets && typeof d.catBudgets === 'object') {
        const incoming = sanitizeCatBudgets(d.catBudgets);
        if (JSON.stringify(incoming) !== JSON.stringify(categoryBudgets)) {
          categoryBudgets = incoming;
          lsSet(CATBUDGET_KEY, JSON.stringify(categoryBudgets));
          needRefresh = true;
        }
      }
      if (Array.isArray(d.chargeMachines)) {
        const inc = sanitizeMachines(d.chargeMachines);
        if (JSON.stringify(inc) !== JSON.stringify(chargeMachines)) {
          chargeMachines = inc;
          lsSet(CHARGE_KEY, JSON.stringify(chargeMachines));
          renderMachineSummaries();
          if (typeof mcRenderList === 'function' && !_mcId) mcRenderList();
          else if (_mcId && _mcFind()) mcRenderDetail();
        }
      }
      if (d.clientPhones && typeof d.clientPhones === 'object') {
        const incP = sanitizeClientPhones(d.clientPhones);
        if (JSON.stringify(incP) !== JSON.stringify(clientPhones)) { clientPhones = incP; lsSet(CLIENT_PHONES_KEY, JSON.stringify(clientPhones)); needRefresh = true; }
      }
      if (needRefresh) refreshAll();
    });

    setSyncStatusUI('synced', currentUser.email || '');
  } catch (error) {
    console.error('loadCloudData failed:', error);
    const isPerm = String(error.code || '').includes('permission-denied');
    setSyncStatusUI('error', isPerm ? 'Please post your Firestore Rules in your Firebase panel' : (error.code || error.message));
    if (isPerm) {
      showToast('⚠️ Unpublished Firestore permissions: Open Firebase Console and press Publish on Rules', 'error');
    }
    loadAllLocal();
    refreshAll();
  }
}

async function manualCloudSyncNow() {
  if (!currentUser) { showToast('Log in first', 'error'); return; }
  if (!isRealCloudUser()) {
    showToast('You are in local visitor mode! Sign up with a Google Account to sync your data between devices.', 'error');
    return;
  }
  showToast('Syncing data to the cloud now...', 'info');
  await loadCloudData(wsUid());
  showToast('Complete synchronization between devices has been completed successfully ✓', 'success');
}

async function upgradeGuestToGoogle() {
  const localTxBackup = [...transactions];
  const localInvBackup = [...inventoryItems];
  const localRecBackup = [...recurringExpenses];
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await auth.signInWithPopup(provider);
    if (result && result.user) {
      transactions = mergeTransactions(transactions, localTxBackup);
      if (localInvBackup.length && !inventoryItems.length) inventoryItems = localInvBackup;
      if (localRecBackup.length && !recurringExpenses.length) recurringExpenses = localRecBackup;
      saveLocalData();
      showToast('Your account has been linked and your data has been successfully transferred to the cloud 🎉', 'success');
    }
  } catch (err) {
    showToast('Unable to link account: ' + (err.message || err.code), 'error');
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
    if (isDark) { icon.className = 'fa-solid fa-sun text-amber-500'; text.textContent = 'Day mode'; }
    else { icon.className = 'fa-solid fa-moon text-slate-700'; text.textContent = 'Night mode'; }
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark ? '#0f1117' : '#ffffff');
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
function loadAllLocal() {
  loadLocalData();
  loadInventory();
  loadRecurring();
  loadAuditLog();
  loadCatBudgets();
  loadChargeMachines();
  loadClientPhones();
  checkOverdueDebtsAlert();
}

function loadLocalData() {
  try {
    const saved = lsGet(STORAGE_KEY);
    const arr = saved ? JSON.parse(saved) : [];
    transactions = Array.isArray(arr) ? arr.filter(validateTransaction).map(normalizeTransaction) : [];
  } catch (error) { transactions = []; }
}
function saveLocalData() { lsSet(STORAGE_KEY, JSON.stringify(transactions)); }
function saveData(options = {}) {
  if (!requireAuth()) return;
  if (typeof admAuditViewAction === 'function') admAuditViewAction('edit_as_owner');
  saveLocalData();
  if (options.force) forceSyncToCloud(); else syncToCloud();
}

/* =========================================================
   PERIODS
   ========================================================= */
function setPeriod(period) {
  if (!requireAuth()) return;
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.period === period));
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
  const labels = { all:'All data', today:'today', week:'this week', month:'This month', year:'This year' };
  document.getElementById('periodLabel').textContent = labels[period] || 'All data';
  refreshAll();
}

function applyCustomDates() {
  customStartDateVal = document.getElementById('customStartDate').value;
  customEndDateVal = document.getElementById('customEndDate').value;
  document.getElementById('periodLabel').textContent = `Who   ${customStartDateVal}To   ${customEndDateVal}`;
  refreshAll();
}

function isInPeriod(dateString, period = currentPeriod) {
  if (period === 'all') return true;
  if (period === 'custom') {
    if (!customStartDateVal || !customEndDateVal) return true;
    return dateString >= customStartDateVal && dateString <= customEndDateVal;
  }
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
  const wallets = {};
  list.forEach(t => {
    const amount = Number(t.amount) || 0;
    const method = normalizePaymentMethod(t.paymentMethod);
    if (t.type === 'income') { income += amount; wallets[method] = (wallets[method] || 0) + amount; }
    else if (t.type === 'expense') { expense += amount; wallets[method] = (wallets[method] || 0) - amount; }
    else if (t.type === 'charity') { charity += amount; wallets[method] = (wallets[method] || 0) - amount; }
    else if (t.type === 'debt_receivable' && t.status !== 'paid') debtRec += Math.max(0, amount - (Number(t.paidAmount) || 0));
    else if (t.type === 'debt_payable' && t.status !== 'paid') debtPay += Math.max(0, amount - (Number(t.paidAmount) || 0));
  });
  return { income, expense, charity, available: income - expense - charity, debtRec, debtPay, wallets };
}

function updateMetrics() {
  const metrics = calculateMetrics();
  document.getElementById('statIncome').textContent = money(metrics.income);
  document.getElementById('statExpense').textContent = money(metrics.expense);
  document.getElementById('statCharity').textContent = money(metrics.charity);
  const heroSet = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  heroSet('heroNet', money(metrics.available)); heroSet('heroIncome', money(metrics.income));
  heroSet('heroExpense', money(metrics.expense)); heroSet('heroDebt', money(metrics.debtRec));
  const net = document.getElementById('statNet');
  net.textContent = money(metrics.available);
  net.className = 'money-val text-lg sm:text-3xl font-black ' + (metrics.available >= 0 ? 'text-emerald-500' : 'text-rose-500');
  document.getElementById('statNetTag').textContent = metrics.available >= 0
    ? 'Available balance after expenses and good deeds' : 'Warning: Expenses exceed revenues';
  document.getElementById('statDebtReceivable').textContent = money(metrics.debtRec) + ' EGP';
  document.getElementById('statDebtPayable').textContent = money(metrics.debtPay) + ' EGP';
  const ratio = metrics.income > 0 ? ((metrics.charity / metrics.income) * 100).toFixed(1) : '0';
  document.getElementById('statCharityRatio').textContent = ratio + '%';
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
  const defaultMethods = ['Cash', 'InstaPay', 'Vodafone Cash/Wallet', 'Visa/bank card'];
  const allMethods = Array.from(new Set([...defaultMethods, ...Object.keys(wallets)]));
  allMethods.forEach(method => {
    const bal = wallets[method] || 0;
    const card = document.createElement('div');
    card.className = 'p-2.5 rounded-xl border border-slate-100 dark:border-dark-750 bg-slate-50 dark:bg-dark-850/60 flex flex-col justify-between';
    let icon = 'fa-wallet';
    if (isCashMethod(method)) icon = 'fa-hand-holding-dollar';
    else if (method.includes('InstaPay')) icon = 'fa-bolt';
    else if (method.includes('Wallet')) icon = 'fa-mobile-screen-button';
    else if (method.includes('Visa')) icon = 'fa-credit-card';
    card.innerHTML = `
      <div class="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold truncate">
        <i class="fa-solid ${icon} text-orange-500"></i>
        <span class="truncate">${escapeHTML(method.split(' ')[0])}</span>
      </div>
      <div class="mt-1 font-black text-xs money-val ${bal >= 0 ? 'text-slate-800 dark:text-slate-100' : 'text-rose-500'}">
        ${money(bal)} <span class="text-[9px] text-slate-400">EGP</span>
      </div>
    `;
    container.appendChild(card);
  });
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
  document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === filter));
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
    const text = [t.category, t.notes, t.client, t.paymentMethod, t.reference, t.time, typeName(t.type)].join(' ').toLowerCase();
    return text.includes(search);
  });
  list.sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));
  if (!list.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 dark:hover:bg-dark-850/60 transition group';
    let badge = '', amount = '';
    if (item.type === 'income') {
      badge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><i class="fa-solid fa-arrow-trend-up"></i>Income  </span>`;
      amount = `<span class="money-val font-black text-emerald-500">+${money(item.amount)}EGP</span>`;
    } else if (item.type === 'charity') {
      badge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-orange-500/10 text-orange-500 border border-orange-500/20"><i class="fa-solid fa-heart"></i>Good  </span>`;
      amount = `<span class="money-val font-black text-orange-500">-${money(item.amount)}EGP</span>`;
    } else {
      badge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-rose-500/10 text-rose-500 border border-rose-500/20"><i class="fa-solid fa-arrow-trend-down"></i>Expense</span>`;
      amount = `<span class="money-val font-black text-rose-500">-${money(item.amount)}EGP</span>`;
    }
    const timeFormatted = item.time ? formatTimeTo12Hour(item.time) : '';
    tr.innerHTML = `
      <td class="py-3 px-4">
        <div class="flex items-center gap-2.5">
          ${badge}
          <div class="flex items-center gap-2">
            ${item.receipt ? `
              <img src="${safeReceiptURL(item.receipt)}" 
                   onclick="viewReceiptImage('${jsAttr(item.receipt)}')" 
                   title="Click to enlarge the image"
                   class="w-9 h-9 rounded-xl object-cover border border-orange-500/40 cursor-pointer hover:scale-110 hover:border-orange-500 transition shadow-sm shrink-0" 
                   alt="Transaction image">
            ` : ''}
            <div>
              <div class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <span>${escapeHTML(item.notes || 'Without statement')}</span>
              </div>
              ${item.reference ? `<div class="text-[9px] text-slate-400 mt-0.5">Reference: ${escapeHTML(item.reference)}</div>` : ''}
            </div>
          </div>
        </div>
      </td>
      <td class="py-3 px-4">
        ${item.client ? `<button onclick="openClientLedger('${jsAttr(item.client)}')" class="inline-flex items-center gap-1 text-xs font-black text-orange-500 hover:underline"><i class="fa-solid fa-user-circle"></i> ${escapeHTML(item.client)}</button>` : '<span class="text-slate-400 text-[10px]">-</span>'}
      </td>
      <td class="py-3 px-4"><span class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-300 font-bold text-[10px]">${escapeHTML(item.category)}</span></td>
      <td class="py-3 px-4 text-slate-500 dark:text-slate-400 font-semibold">${payMethodHTML(item.paymentMethod)}</td>
      <td class="py-3 px-4">
        <div class="font-bold text-slate-600 dark:text-slate-300 text-xs">${escapeHTML(item.date)}</div>
        <div class="text-[10px] text-orange-500 font-bold flex items-center gap-1 mt-0.5"><i class="fa-regular fa-clock"></i> ${escapeHTML(timeFormatted)}</div>
      </td>
      <td class="py-3 px-4">${amount}</td>
      <td class="py-3 px-4 text-center">
        <div class="flex items-center justify-center gap-1">
          <button onclick="shareViaWhatsApp('${jsAttr(item.id)}')" title="sharing" class="p-2 rounded-xl text-emerald-500 hover:bg-emerald-500/10 transition"><i class="fa-brands fa-whatsapp text-sm"></i></button>
          <button onclick="editTransaction('${jsAttr(item.id)}')" title="amendment" class="p-2 rounded-xl text-slate-400 hover:text-orange-500 hover:bg-orange-500/10 transition"><i class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="requestDelete('${jsAttr(item.id)}')" title="delete" class="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition"><i class="fa-solid fa-trash-can text-xs"></i></button>
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
  const debts = getActiveTransactions().filter(t => isDebt(t.type))
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
            <h4 class="text-sm font-black truncate flex items-center gap-2">
              ${d.receipt ? `
                <img src="${safeReceiptURL(d.receipt)}" 
                     onclick="viewReceiptImage('${jsAttr(d.receipt)}')" 
                     title="Preview invoice/device image" 
                     class="w-7 h-7 rounded-lg object-cover border border-orange-500/50 cursor-pointer hover:scale-105 transition shrink-0" 
                     alt="Attached">
              ` : ''}
              <span>${escapeHTML(d.notes || 'Religion without statement')}</span>
            </h4>
            <p class="text-[10px] text-slate-400 font-semibold mt-0.5">
              ${d.client ? `<span class="text-orange-500 font-black cursor-pointer" onclick="openClientLedger('${jsAttr(d.client)}')"><i class="fa-solid fa-user"></i> ${escapeHTML(d.client)} • </span>` : ''}
              ${escapeHTML(d.category)} • ${escapeHTML(d.date)} ${d.time ? '• ' + escapeHTML(formatTimeTo12Hour(d.time)) : ''}
              ${getDueDateBadge(d)}
            </p>
          </div>
        </div>
        <div class="text-left shrink-0">
          <div class="money-val text-base font-black ${isReceivable ? 'text-emerald-500' : 'text-rose-500'}">${money(remainingAmt)} EGP</div>
          ${paidAmt > 0 && !paid ? `<div class="text-[9px] text-slate-400">Paid ${money(paidAmt)} from${money(totalAmount)}</div>` : ''}
        </div>
      </div>
      ${!paid && paidAmt > 0 ? `
        <div class="mt-3">
          <div class="h-1.5 rounded-full bg-slate-200 dark:bg-dark-750 overflow-hidden">
            <div class="h-full bg-emerald-500 rounded-full" style="width: ${progressPercent}%"></div>
          </div>
          <div class="flex justify-between text-[9px] text-slate-400 mt-1 font-bold">
            <span>Paid ${progressPercent}%</span>
            <span>Remaining ${money(remainingAmt)} EGP</span>
          </div>
        </div>
      ` : ''}
      <div class="mt-4 pt-3 border-t border-slate-200/60 dark:border-dark-800 flex flex-wrap items-center justify-between gap-2">
        <span class="text-[10px] font-black ${paid ? 'text-slate-400' : isReceivable ? 'text-emerald-500' : 'text-rose-500'}">
          <i class="fa-solid ${paid ? 'fa-circle-check' : 'fa-clock'}"></i>
          ${paid ? 'Payment made in full✓' : isReceivable ? 'due to me -Pending' : 'Due to me -Pending'}
        </span>
        <div class="flex flex-wrap items-center gap-1.5">
          <button onclick="openDebtCardModal('${jsAttr(d.id)}')" title="Claim card and debt reminder" class="px-2.5 py-1.5 rounded-xl bg-orange-500/15 text-orange-400 hover:bg-orange-500 hover:text-white text-[10px] font-black transition flex items-center gap-1 border border-orange-500/30">
            <i class="fa-solid fa-receipt"></i> <span>Claim card</span>
          </button>
          ${!paid ? `<button onclick="openDebtPaymentModal('${jsAttr(d.id)}')" class="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white text-[10px] font-black transition"><i class="fa-solid fa-hand-holding-dollar"></i> Partial payment</button>` : ''}
          <button onclick="toggleDebtStatus('${jsAttr(d.id)}')" class="px-2.5 py-1.5 rounded-xl ${paid ? 'bg-slate-200 dark:bg-dark-750 text-slate-700 dark:text-slate-300' : 'bg-orange-500 text-white'} text-[10px] font-black">${paid ? 're kPending' : 'Payment made✓'}</button>
          <button onclick="editTransaction('${jsAttr(d.id)}')" class="p-2 rounded-xl text-slate-400 hover:text-orange-500"><i class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="requestDelete('${jsAttr(d.id)}')" class="p-2 rounded-xl text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
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
  const total = Number(debt.amount) || 0;
  const paid = Number(debt.paidAmount) || 0;
  const rem = Math.max(0, total - paid);
  document.getElementById('debtPayModalSubtitle').textContent = `Debt: ${debt.notes} (Remaining: ${money(rem)} EGP)`;
  document.getElementById('partialPayAmount').value = '';
  document.getElementById('partialPayAmount').max = rem;
  const modal = document.getElementById('debtPaymentModal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
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
  if (!amt || amt <= 0) { showToast('Enter a valid payment amount', 'error'); return; }
  const currentPaid = Number(debt.paidAmount) || 0;
  const total = Number(debt.amount) || 0;
  const newPaid = currentPaid + amt;
  debt.paidAmount = newPaid;
  if (newPaid >= total) { debt.status = 'paid'; showToast('The entire debt has been repaid 🎉', 'success'); }
  else showToast(`A payment has been recorded${money(amt)}EGP ✓`, 'success');
  debt._updatedAt = Date.now();
  saveData();
  refreshAll();
  closeDebtPaymentModal();
}

/* =========================================================
   CLIENTS LEDGER
   ========================================================= */
function renderClients() {
  const container = document.getElementById('clientsContainer');
  const empty = document.getElementById('emptyClientsState');
  const q = (document.getElementById('clientSearchInput')?.value || '').trim().toLowerCase();
  container.innerHTML = '';
  let clientNames = getAllClientNames();
  if (q) clientNames = clientNames.filter(name => name.toLowerCase().includes(q));
  if (!clientNames.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  clientNames.forEach(name => {
    const txs = getActiveTransactions().filter(t => t.client && t.client.trim().toLowerCase() === name.toLowerCase());
    let totalIncome = 0, totalDebtReceivable = 0, totalDebtPayable = 0;
    txs.forEach(t => {
      const amt = Number(t.amount) || 0;
      const paid = Number(t.paidAmount) || 0;
      if (t.type === 'income') totalIncome += amt;
      else if (t.type === 'debt_receivable' && t.status !== 'paid') totalDebtReceivable += Math.max(0, amt - paid);
      else if (t.type === 'debt_payable' && t.status !== 'paid') totalDebtPayable += Math.max(0, amt - paid);
    });
    const card = document.createElement('div');
    card.className = 'glow-card bg-slate-50 dark:bg-dark-850 p-4 rounded-2xl border border-slate-200 dark:border-dark-750 cursor-pointer flex flex-col justify-between';
    card.onclick = () => openClientLedger(name);
    const initial = name.charAt(0).toUpperCase();
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center font-black text-sm">${escapeHTML(initial)}</div>
            <div>
              <h4 class="font-black text-sm text-slate-800 dark:text-slate-100">${escapeHTML(name)}</h4>
              <p class="text-[10px] text-slate-400 font-bold">${txs.length}Recorded transaction</p>
            </div>
          </div>
          <span class="text-orange-500 text-xs"><i class="fa-solid fa-chevron-left"></i></span>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-200/60 dark:border-dark-800">
          <div class="text-[10px]">
            <span class="text-slate-400 block font-bold">The rest of it (for you):</span>
            <span class="money-val font-black ${totalDebtReceivable > 0 ? 'text-cyan-500' : 'text-slate-500'}">${money(totalDebtReceivable)} EGP</span>
          </div>
          <div class="text-[10px]">
            <span class="text-slate-400 block font-bold">Total services:</span>
            <span class="money-val font-black text-emerald-500">${money(totalIncome)} EGP</span>
          </div>
        </div>
      </div>
      <div class="mt-3 pt-2 text-[10px] font-black text-orange-500 flex items-center justify-between">
        <span>Open the account statement and link</span>
        <i class="fa-solid fa-folder-open"></i>
      </div>
    `;
    container.appendChild(card);
  });
}

function openClientLedger(clientName) {
  activeClientName = clientName;
  document.getElementById('clientModalName').textContent = `Account statement: ${clientName}`;
  document.getElementById('clientModalInitial').textContent = clientName.charAt(0).toUpperCase();
  const txs = getActiveTransactions().filter(t => t.client && t.client.trim().toLowerCase() === clientName.toLowerCase())
    .sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));
  let income = 0, debtRec = 0, debtPay = 0;
  const tbody = document.getElementById('clientTransactionsTbody');
  const empty = document.getElementById('emptyClientTxState');
  tbody.innerHTML = '';
  if (!txs.length) empty.classList.remove('hidden');
  else {
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
        <td class="py-2.5 px-3">
          <div class="font-bold">${escapeHTML(t.date)}</div>
          <div class="text-[9px] text-orange-500 font-bold">${escapeHTML(formatTimeTo12Hour(t.time || ''))}</div>
        </td>
        <td class="py-2.5 px-3">
          <div class="font-bold">${escapeHTML(t.notes || t.category)}</div>
          <div class="text-[9px] text-slate-400">${escapeHTML(typeName(t.type))} ${t.status === 'paid' ? '• Settled' : ''}</div>
        </td>
        <td class="py-2.5 px-3 text-slate-400 font-semibold">${payMethodHTML(t.paymentMethod)}</td>
        <td class="py-2.5 px-3 font-black ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">
          ${t.type === 'income' ? '+' : '-'}${money(t.amount)} EGP
        </td>
        <td class="py-2.5 px-3 text-center">
          ${t.receipt ? `
            <img src="${safeReceiptURL(t.receipt)}" 
                 onclick="viewReceiptImage('${jsAttr(t.receipt)}')" 
                 title="Preview" 
                 class="w-7 h-7 rounded-lg object-cover border border-orange-500/40 inline-block cursor-pointer hover:scale-110 transition shadow-sm" 
                 alt="Image">
          ` : '<span class="text-slate-400">-</span>'}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('clientTotalIncome').textContent = money(income) + ' EGP';
  document.getElementById('clientTotalReceivable').textContent = money(debtRec) + ' EGP';
  document.getElementById('clientTotalPayable').textContent = money(debtPay) + ' EGP';
  const modal = document.getElementById('clientLedgerModal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
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
  setTimeout(() => { document.getElementById('formClient').value = name; }, 100);
}

/* =========================================================
   WHATSAPP SHARE
   ========================================================= */
function shareViaWhatsApp(id) {
  const item = transactions.find(t => t.id === id);
  if (!item) return;
  const timeStr = item.time ? formatTimeTo12Hour(item.time) : '';
  const text = `🧾 *Financial transaction notice | Honda Finance Manager*
----------------------------------------
👤 *Client:* ${item.client || 'Client respected'}
📌 *Description:* ${item.notes || item.category}
💰 *Amount:* ${money(item.amount)} EGP
📅 *Date:* ${item.date} ${timeStr ? `(${timeStr})` : ''}
💳 *Payment method:* ${normalizePaymentMethod(item.paymentMethod)}
${item.reference ? `🔖 *Ref:* ${item.reference}\n` : ''}----------------------------------------
Thank youGeneralYou are with us✨`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
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
      const category = t.type === 'charity' ? 'Charity' : t.category;
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
        datasets: [{ data: amounts, backgroundColor: ['#ea580c','#f97316','#fb923c','#f59e0b','#10b981','#06b6d4','#8b5cf6','#64748b','#ef4444'], borderWidth: 2, borderColor: isDark ? '#0f1117' : '#ffffff' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', rtl: true, labels: { color: textColor, font: { family: 'Inter', size: 10, weight: 'bold' }, boxWidth: 10 } } },
        cutout: '68%'
      }
    });
  }
  const metrics = calculateMetrics(list);
  if (balanceChartInstance) balanceChartInstance.destroy();
  balanceChartInstance = new Chart(document.getElementById('balanceBarChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Revenue', 'Expenses', 'Charity'],
      datasets: [{ data: [metrics.income, metrics.expense, metrics.charity], backgroundColor: ['rgba(16,185,129,.85)','rgba(244,63,94,.85)','rgba(249,115,22,.9)'], borderRadius: 10, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: { label: ctx => ' ' + money(ctx.raw) + ' EGP' } } },
      scales: {
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Inter', size: 10 }, callback: v => money(v) } },
        x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'Inter', size: 11, weight: 'bold' } } }
      }
    }
  });
}

/* =========================================================
   TRANSACTION MODAL
   ========================================================= */
function openModal(type = 'expense', id = null) {
  if (!requireAuth()) return;
  if (type === 'charity' && !hasFeature('charity')) { showToast('The door of goodness is not available for your role', 'error'); return; }
  if ((type === 'debt_receivable' || type === 'debt_payable') && !hasFeature('debts')) { showToast('Debt book is not available for your role', 'error'); return; }
  const modal = document.getElementById('transactionModal');
  const form = document.getElementById('transactionForm');
  editingId = id;
  form.reset();
  currentReceiptData = null;
  setReceiptUI(null);
  document.getElementById('formDate').value = todayString();
  const dueDateInput = document.getElementById('formDueDate');
  if (dueDateInput) dueDateInput.value = '';
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
    document.getElementById('formPaymentMethod').value = normalizePaymentMethod(item.paymentMethod);
    document.getElementById('formReference').value = item.reference || '';
    document.getElementById('formNotes').value = item.notes || '';
    if (dueDateInput) dueDateInput.value = item.dueDate || '';
    if (item.receipt) { currentReceiptData = item.receipt; setReceiptUI(item.receipt); }
    document.getElementById('submitText').textContent = 'Save the modification';
  } else {
    const radio = document.querySelector(`input[name="txType"][value="${type}"]`);
    if (radio) radio.checked = true;
    onTypeChange();
    document.getElementById('submitText').textContent = 'Save the process';
  }
  modal.classList.remove('hidden'); modal.classList.add('flex');
  setTimeout(() => document.getElementById('formAmount').focus(), 100);
}

function closeModal() {
  const modal = document.getElementById('transactionModal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
  editingId = null;
  currentReceiptData = null;
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
  (CATEGORIES[type] || ['General']).forEach(c => {
    const option = document.createElement('option');
    option.value = c; option.textContent = c;
    select.appendChild(option);
  });
  baraka.classList.toggle('hidden', type !== 'charity');
  const dueDateWrapper = document.getElementById('debtDueDateWrapper');
  if (dueDateWrapper) dueDateWrapper.classList.toggle('hidden', !isDebt(type));
  if (type === 'charity') { title.textContent = editingId ? 'Edit the chapter on goodness' : 'Registering a charity or charitable deed'; notes.textContent = 'Intention/feedback'; icon.innerHTML = '<i class="fa-solid fa-heart text-orange-500"></i>'; }
  else if (type === 'income') { title.textContent = editingId ? 'Income adjustment' : 'Record new income/revenue'; notes.textContent = 'Service statement in detail'; icon.innerHTML = '<i class="fa-solid fa-arrow-trend-up text-emerald-500"></i>'; }
  else if (type === 'debt_receivable') { title.textContent = editingId ? 'Modify a debt owed to me' : 'Register a debt owed to me'; notes.textContent = 'Description of debt and service *'; icon.innerHTML = '<i class="fa-solid fa-user-plus text-cyan-500"></i>'; }
  else if (type === 'debt_payable') { title.textContent = editingId ? 'Modifying my debt' : 'Recording a debt owed to me'; notes.textContent = 'Description of debt and commitment *'; icon.innerHTML = '<i class="fa-solid fa-user-minus text-purple-500"></i>'; }
  else { title.textContent = editingId ? 'Expense adjustment' : 'Register a new expense'; notes.textContent = 'Expense statement'; icon.innerHTML = '<i class="fa-solid fa-arrow-trend-down text-rose-500"></i>'; }
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
  const dueDate = isDebt(type) ? (document.getElementById('formDueDate')?.value || null) : null;

  if (!amount || amount <= 0 || amount > 1e9) { showToast('Please enter a valid amount', 'error'); return; }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { showToast('Please choose a valid date', 'error'); return; }
  if (isDebt(type) && !notes && !client) { showToast('Write the customer’s name or statement to save the debt', 'error'); return; }
  if (!wasEditing && !canAddMoreTransactions()) { showToast(`reached the maximum (${getMaxTransactions()}practical)`, 'error'); return; }

  if (wasEditing) {
    const index = transactions.findIndex(t => t.id === editingId);
    if (index === -1) return;
    const old = transactions[index];
    transactions[index] = normalizeTransaction({
      ...old, type, amount, date, time, client, category,
      paymentMethod: isDebt(type) ? 'Pending' : paymentMethod, reference,
      notes: notes || (type === 'charity' ? 'Charity for the sake of God' : category),
      dueDate,
      receipt: currentReceiptData,
      status: isDebt(type) ? (old.status || 'pending') : null,
      _updatedAt: Date.now()
    });
    showToast('The operation was modified successfully', 'success');
  } else {
    transactions.unshift(normalizeTransaction({
      id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      type, amount, date, time, client, category, paidAmount: 0,
      paymentMethod: isDebt(type) ? 'Pending' : paymentMethod, reference,
      notes: notes || (type === 'charity' ? 'Charity for the sake of God' : category),
      dueDate,
      receipt: currentReceiptData,
      status: isDebt(type) ? 'pending' : null,
      _updatedAt: Date.now()
    }));
    if (type === 'charity') {
      if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 80, origin: { y: .6 } });
      showToast('May God accept it from you and grant you blessings', 'success');
    } else showToast('The operation was registered successfully', 'success');
  }
  saveData();
  refreshAll();
  closeModal();
  try { checkCategoryBudgetAlert(type, category); } catch (e) { console.warn(e); }
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
  openConfirm('Delete process?', `Will be deleted:<strong>${escapeHTML(item.notes || item.category)}</strong>In an amount   <strong>${money(item.amount)}EGP</strong>.`, () => deleteTransaction(id));
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
  showToast('The operation was deleted — click Undo to restore it', 'info', true);
}

function undoDelete() {
  if (!lastDeletedId || !requireAuth()) return;
  const tx = transactions.find(t => t.id === lastDeletedId);
  if (tx) { tx._deleted = false; tx._updatedAt = Date.now(); }
  lastDeletedId = null;
  saveData();
  refreshAll();
  showToast('The operation was restored successfully', 'success');
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
  showToast(debt.status === 'paid' ? 'The debt is completely closed ✓' : 'The debt was reinstated as pending', 'success');
}

/* =========================================================
   BUDGET
   ========================================================= */
function getBudget() { return Number(lsGet(BUDGET_KEY) || 0); }

function openBudgetModal() {
  if (!requireAuth()) return;
  if (!hasFeature('budget')) { showToast('Budget is not available for your role', 'error'); return; }
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
  if (!isFinite(value) || value < 0 || value > 1e9) { showToast('The budget value is incorrect', 'error'); return; }
  lsSet(BUDGET_KEY, value);
  closeBudgetModal();
  updateBudget();
  syncToCloud();
  showToast('Monthly budget saved', 'success');
}
function clearBudget() {
  if (!requireAuth()) return;
  lsDel(BUDGET_KEY);
  closeBudgetModal();
  updateBudget();
  syncToCloud();
  showToast('The monthly budget has been deleted', 'info');
}

function updateBudget() {
  const budget = getBudget();
  const monthItems = getActiveTransactions().filter(t => isInPeriod(t.date, 'month'));
  let used = 0;
  monthItems.forEach(t => { if (t.type === 'expense' || t.type === 'charity') used += Number(t.amount || 0); });
  document.getElementById('budgetUsed').textContent = money(used);
  if (!budget) {
    document.getElementById('budgetTotal').textContent = 'Not specified';
    document.getElementById('budgetRemaining').textContent = 'Set a monthly budget';
    document.getElementById('budgetPercent').textContent = '0%';
    document.getElementById('budgetBar').style.width = '0%';
    return;
  }
  document.getElementById('budgetTotal').textContent = money(budget) + ' EGP';
  const percent = Math.min(100, (used / budget) * 100);
  const remaining = budget - used;
  document.getElementById('budgetPercent').textContent = percent.toFixed(1) + '%';
  document.getElementById('budgetBar').style.width = percent + '%';
  document.getElementById('budgetRemaining').textContent = remaining >= 0
    ? `remaining ${money(remaining)}EGP` : `transcended by ${money(Math.abs(remaining))}EGP`;
  document.getElementById('budgetRemaining').className = 'text-[10px] font-bold ' + (remaining >= 0 ? 'text-emerald-500' : 'text-rose-500');
}

/* =========================================================
   BACKUP & EXPORT
   ========================================================= */
function openBackupModal() {
  if (!requireAuth()) return;
  if (!hasFeature('backup')) { showToast('Backup is not available for your role', 'error'); return; }
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
  const backup = {
    app: 'Ehsebli Honda Financial Manager',
    version: '10.0',
    createdAt: new Date().toISOString(),
    transactions,
    budget: getBudget(),
    inventory: inventoryItems,
    recurring: recurringExpenses,
    categoryBudgets: sanitizeCatBudgets(categoryBudgets),
    chargeMachines: sanitizeMachines(chargeMachines),
    clientPhones: sanitizeClientPhones(clientPhones),
    count: transactions.length
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Calculate_a_backup_${todayString()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  lsSet(BACKUP_TS_KEY, String(Date.now()));
  showToast(`Backup downloaded (${transactions.length}practical)`, 'success');
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
      openConfirm('Restore version?', `The transactiones will be replaced by<strong>${restored.length}</strong>practical.`, () => {
        const now = Date.now();
        transactions = restored.map((item, i) => normalizeTransaction({ ...item, _updatedAt: now + i }));
        if (backup.budget !== undefined) lsSet(BUDGET_KEY, Number(backup.budget) || 0);
        if (Array.isArray(backup.inventory)) { inventoryItems = backup.inventory; lsSet(INVENTORY_KEY, JSON.stringify(inventoryItems)); }
        if (Array.isArray(backup.recurring)) { recurringExpenses = backup.recurring; lsSet(RECURRING_KEY, JSON.stringify(recurringExpenses)); }
        if (backup.clientPhones && typeof backup.clientPhones === 'object') { clientPhones = sanitizeClientPhones(backup.clientPhones); lsSet(CLIENT_PHONES_KEY, JSON.stringify(clientPhones)); }
        if (Array.isArray(backup.chargeMachines)) { chargeMachines = sanitizeMachines(backup.chargeMachines); lsSet(CHARGE_KEY, JSON.stringify(chargeMachines)); }
        if (backup.categoryBudgets && typeof backup.categoryBudgets === 'object') { categoryBudgets = sanitizeCatBudgets(backup.categoryBudgets); lsSet(CATBUDGET_KEY, JSON.stringify(categoryBudgets)); }
        saveData({ force: true });
        refreshAll();
        closeBackupModal();
        showToast('The backup has been restored successfully', 'success');
      });
    } catch (error) { showToast('The backup file is invalid Excellent! ', 'error'); }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function exportToCSV() {
  if (!requireAuth()) return;
  if (!hasFeature('export')) { showToast('Export is not available for your role', 'error'); return; }
  closeMenus();
  const list = getActiveTransactions();
  if (!list.length) { showToast('There is no data to export', 'error'); return; }
  let csv = '\uFEFF';
  csv += 'ID,Type,Amount,Customer,Classification,Payment Method,Date,Time,Reference,Description,Status\n';
  list.forEach(t => {
    const row = [t.id, typeName(t.type), t.amount, t.client || '', t.category, t.paymentMethod || '', t.date, t.time || '', t.reference || '', t.notes || '',
      t.status === 'paid' ? 'Settled' : t.status === 'pending' ? 'Pending' : 'Accomplished'];
    csv += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Calculate with me${todayString()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('Excel CSV file exported successfully', 'success');
}


/* =========================================================
   REPORT LIVE PREVIEW & DIRECT PDF GENERATOR
   ========================================================= */
function openReportModal() {
  if (!requireAuth()) return;
  if (!hasFeature('reports')) { showToast('Reports are not available for your role', 'error'); return; }
  closeControlCenter(); closeReportModal();
  closeMenus();
  renderReportPreview();
  const modal = document.getElementById('reportPrintModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeReportModal() {
  const modal = document.getElementById('reportPrintModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function renderReportPreview() {
  const paper = document.getElementById('reportA4Paper');
  if (!paper) return;

  const metrics = calculateMetrics();
  const periodName = document.getElementById('periodLabel')?.textContent || 'All data';
  const periodTransactions = getPeriodTransactions().sort((a,b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));

  let walletRows = '';
  Object.keys(metrics.wallets).forEach(w => {
    walletRows += `<div style="display:inline-block; margin-right:14px; margin-bottom:6px; font-size:11px; font-weight:bold;">
      <span style="color:#64748b;">${escapeHTML(w)}:</span> 
      <span style="color:${metrics.wallets[w] >= 0 ? '#10b981' : '#f43f5e'}; font-weight:900;">${money(metrics.wallets[w])} EGP</span>
    </div>`;
  });

  paper.innerHTML = `
    <!-- Report Header -->
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #f97316; padding-bottom:15px; margin-bottom:20px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="logo.png" style="width:55px; height:55px; border-radius:12px; object-fit:contain;" alt="a7sbly">
        <div>
          <h1 style="margin:0; font-size:24px; font-weight:900; color:#0f172a;">a7sbly | a7sbly</h1>
          <div style="font-size:11px; color:#f97316; font-weight:bold;">Approved financial report— ${escapeHTML(periodName)}</div>
        </div>
      </div>
      <div style="text-align:left; font-size:11px; color:#64748b;">
        <div>Report date:<strong>${todayString()}</strong></div>
        <div>time: <strong>${formatTimeTo12Hour(currentInputTimeString())}</strong></div>
      </div>
    </div>

    <!-- Summary KPI Boxes -->
    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:18px;">
      <div style="border:1px solid #bbf7d0; border-radius:12px; padding:12px; background:#f0fdf4;">
        <div style="font-size:10px; color:#166534; font-weight:bold;">totalRevenue</div>
        <div style="font-size:16px; font-weight:900; color:#15803d; margin-top:4px;">+${money(metrics.income)} EGP</div>
      </div>
      <div style="border:1px solid #fecdd3; border-radius:12px; padding:12px; background:#fff1f2;">
        <div style="font-size:10px; color:#9f1239; font-weight:bold;">The totalExpenseat</div>
        <div style="font-size:16px; font-weight:900; color:#be123c; margin-top:4px;">-${money(metrics.expense)} EGP</div>
      </div>
      <div style="border:1px solid #fed7aa; border-radius:12px; padding:12px; background:#fff7ed;">
        <div style="font-size:10px; color:#9a3412; font-weight:bold;">Charity And alms</div>
        <div style="font-size:16px; font-weight:900; color:#ea580c; margin-top:4px;">-${money(metrics.charity)} EGP</div>
      </div>
      <div style="border:2px solid #f97316; border-radius:12px; padding:12px; background:#fffbeb;">
        <div style="font-size:10px; color:#b45309; font-weight:bold;">NetAvailable balance</div>
        <div style="font-size:16px; font-weight:900; color:${metrics.available >= 0 ? '#15803d' : '#b91c1c'}; margin-top:4px;">${money(metrics.available)} EGP</div>
      </div>
    </div>

    <!-- Wallets Breakdown -->
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:10px 14px; margin-bottom:20px;">
      <div style="font-size:10px; font-weight:900; color:#334155; margin-bottom:6px;">Treasury balances Current:</div>
      ${walletRows || '<span style="font-size:10px; color:#94a3b8;">There are no movements recorded</span>'}
    </div>

    <!-- Transactions Table -->
    <h3 style="font-size:13px; font-weight:900; margin-bottom:8px; color:#1e293b;">tableTransactions (${periodTransactions.length} practical):</h3>
    <table style="width:100%; border-collapse:collapse; font-size:10px; text-align: left;">
      <thead>
        <tr style="background:#f97316; color:white;">
          <th style="padding:7px 8px; border:1px solid #ea580c;">Date</th>
          <th style="padding:7px 8px; border:1px solid #ea580c;">Type</th>
          <th style="padding:7px 8px; border:1px solid #ea580c;">Description/notes</th>
          <th style="padding:7px 8px; border:1px solid #ea580c;">Client / Party</th>
          <th style="padding:7px 8px; border:1px solid #ea580c;">Classification</th>
          <th style="padding:7px 8px; border:1px solid #ea580c;">Payment method</th>
          <th style="padding:7px 8px; border:1px solid #ea580c;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${periodTransactions.map(t => `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:bold;">${escapeHTML(t.date)}</td>
            <td style="padding:6px 8px; border:1px solid #e2e8f0;">${escapeHTML(typeName(t.type))}</td>
            <td style="padding:6px 8px; border:1px solid #e2e8f0;">${escapeHTML(t.notes || t.category)}</td>
            <td style="padding:6px 8px; border:1px solid #e2e8f0;">${escapeHTML(t.client || '-')}</td>
            <td style="padding:6px 8px; border:1px solid #e2e8f0;">${escapeHTML(t.category || '')}</td>
            <td style="padding:6px 8px; border:1px solid #e2e8f0;">${escapeHTML(normalizePaymentMethod(t.paymentMethod))}</td>
            <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:900; color:${t.type==='income'?'#10b981':'#f43f5e'};">
              ${t.type==='income'?'+':'-'}${money(t.amount)} EGP
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="margin-top:25px; text-align:center; font-size:10px; color:#94a3b8; border-top:1px dashed #cbd5e1; padding-top:10px;">
      This report was extracted automatically by the system<strong>a7sbly | a7sbly</strong> © ${new Date().getFullYear()} — Thank you for your kind cooperation.
    </div>
  `;
}

function downloadReportPDF() {
  const paper = document.getElementById('reportA4Paper');
  if (!paper) return;
  showToast('Creating and downloading a PDF file...', 'info');

  const opt = {
    margin: [8, 8, 8, 8],
    filename: `financial_report${todayString()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      scrollY: 0
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  if (typeof html2pdf !== 'undefined') {
    html2pdf().set(opt).from(paper).save().then(() => {
      showToast('The PDF financial report has been uploaded successfully 🎉', 'success');
    }).catch(err => {
      console.warn("html2pdf failed, fallback to print:", err);
      window.print();
    });
  } else {
    window.print();
  }
}

function printReport() {
  openReportModal();
}


function reportBox(title, value, color) {
  return `<div style="border:1px solid #ddd;border-radius:14px;padding:15px;">
    <div style="font-size:11px;color:#777;">${title}</div>
    <div style="font-size:20px;font-weight:900;color:${color};margin-top:5px;">${money(value)} EGP</div>
  </div>`;
}

/* =========================================================
   PIN SECURITY
   ========================================================= */
function confirmRemovePin() {
  if (!requireAuth()) return;
  closeMenus();
  openConfirm('Remove lock code?', 'The PIN app will be unlocked from all your devices.', async () => {
    try { await clearPinEverywhere(); }
    catch (e) { showToast('Unable to remove the code, check your internet connection', 'error'); return; }
    updatePinUI();
    showToast('The lock icon has been removed', 'success');
  });
}
/* =========================================================
   TABS & TOAST
   ========================================================= */
function switchTab(tab, shouldScroll = false) {
  if (tab === 'debts' && !hasFeature('debts')) { showToast('Debt book is not available for your role', 'error'); return; }
  currentTab = tab;
  const isTx = tab === 'transactions';
  const isDebts = tab === 'debts';
  const isClients = tab === 'clients';
  document.getElementById('panelTransactions').classList.toggle('hidden', !isTx);
  document.getElementById('panelDebts').classList.toggle('hidden', !isDebts);
  document.getElementById('panelClients').classList.toggle('hidden', !isClients);
  document.getElementById('tabBtnTransactions').classList.toggle('active', isTx);
  document.getElementById('tabBtnDebts').classList.toggle('active', isDebts);
  document.getElementById('tabBtnClients').classList.toggle('active', isClients);
  document.querySelectorAll('.mob-nav-btn[data-mob-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mobTab === tab);
  });

  if (isClients) renderClients();
  const isInventory = tab === 'inventory';
  const isAudit = tab === 'audit';
  document.getElementById('panelInventory').classList.toggle('hidden', !isInventory);
  document.getElementById('panelAudit').classList.toggle('hidden', !isAudit);
  if (isInventory) renderInventory();
  else if (isAudit) renderAuditLog();

  else if (isDebts) renderDebts();
  else if (isTx) renderTransactions();

  // When clicking from the mobile phone: it will automatically go down to the section and open it
  if (shouldScroll) {
    setTimeout(() => {
      const target = document.getElementById('tabBtnTransactions') || 
                     document.getElementById('panel' + tab.charAt(0).toUpperCase() + tab.slice(1));
      if (target) {
        const headerOffset = 60;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth'
        });
      }
    }, 50);
  }
}

let toastTimer = null;
let toastRemainingMs = 3500;
let toastStartTs = 0;

function dismissToast(direction = 'up') {
  const box = document.getElementById('toastBox');
  if (!box) return;
  clearTimeout(toastTimer);
  box.classList.remove('toast-dragging');
  if (direction === 'left') {
    box.style.transform = 'translateX(-160%) translateY(0)';
    box.style.opacity = '0';
  } else if (direction === 'right') {
    box.style.transform = 'translateX(60%) translateY(0)';
    box.style.opacity = '0';
  } else {
    box.style.transform = '';
    box.style.opacity = '';
    box.classList.remove('toast-visible');
  }
  setTimeout(() => {
    box.classList.remove('toast-visible');
    box.style.transform = '';
    box.style.opacity = '';
  }, 300);
}

function showToast(message, type = 'success', allowUndo = false) {
  const box = document.getElementById('toastBox');
  const inner = document.getElementById('toastInner');
  if (!box || !inner) return;

  const duration = allowUndo ? 6000 : 3600;
  toastRemainingMs = duration;

  let icon = 'fa-solid fa-circle-check';
  let titleText = 'Done successfully';
  let typeCls = 'success';
  if (type === 'error') {
    icon = 'fa-solid fa-circle-exclamation';
    titleText = 'Important warning';
    typeCls = 'error';
  } else if (type === 'info') {
    icon = 'fa-solid fa-bell';
    titleText = 'System notification';
    typeCls = 'info';
  }

  inner.className = `native-toast-card type-${typeCls}`;
  inner.innerHTML = `
    <div class="native-toast-icon ${typeCls}">
      <i class="${icon}"></i>
    </div>
    <div class="native-toast-body">
      <div class="native-toast-title">
        <span>a7sbly • ${titleText}</span>
        <span>Now</span>
      </div>
      <div id="toastMsgSpan" class="native-toast-msg"></div>
      <div class="native-toast-swipe-hint"></div>
    </div>
    ${allowUndo
      ? '<button onclick="undoDelete(); dismissToast(\'up\');" class="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-black shrink-0 shadow">to retreat</button>'
      : '<button onclick="dismissToast(\'up\')" aria-label="Close" class="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs opacity-70 shrink-0"><i class="fa-solid fa-xmark"></i></button>'
    }
    <div id="toastProgressBar" class="native-toast-progress"></div>
  `;
  document.getElementById('toastMsgSpan').textContent = message;

  // Reset position & show
  box.classList.remove('toast-dragging');
  box.style.transform = '';
  box.style.opacity = '';
  void box.offsetWidth;
  box.classList.add('toast-visible');

  // Animate progress bar
  const bar = document.getElementById('toastProgressBar');
  if (bar) {
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => {
      bar.style.transition = `transform ${duration}ms linear`;
      bar.style.transform = 'scaleX(0)';
    });
  }

  clearTimeout(toastTimer);
  toastStartTs = Date.now();
  toastTimer = setTimeout(() => dismissToast('up'), duration);
}

// Initialize Touch & Mouse Swipe-to-Dismiss on Toast
(function initSwipeableToast() {
  window.addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('toastBox');
    if (!box) return;

    let startX = 0, startY = 0, dx = 0, dy = 0, isDragging = false;

    const onStart = (x, y) => {
      if (!box.classList.contains('toast-visible')) return;
      isDragging = true;
      startX = x;
      startY = y;
      dx = 0;
      dy = 0;
      box.classList.add('toast-dragging');
      clearTimeout(toastTimer);
      const elapsed = Date.now() - toastStartTs;
      toastRemainingMs = Math.max(1200, toastRemainingMs - elapsed);
      const bar = document.getElementById('toastProgressBar');
      if (bar) {
        const computed = getComputedStyle(bar).transform;
        bar.style.transition = 'none';
        bar.style.transform = computed;
      }
    };

    const onMove = (x, y) => {
      if (!isDragging) return;
      dx = x - startX;
      dy = y - startY;
      // Allow upward swipe or horizontal swipe
      const effectiveY = dy < 0 ? dy : dy * 0.25;
      const dist = Math.max(Math.abs(dx), Math.abs(dy < 0 ? dy : 0));
      const opacity = Math.max(0.2, 1 - dist / 180);
      box.style.transform = `translateX(calc(-50% + ${dx}px)) translateY(${effectiveY}px)`;
      box.style.opacity = String(opacity);
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      box.classList.remove('toast-dragging');

      if (dy < -32) {
        dismissToast('up');
        return;
      }
      if (dx < -65) {
        dismissToast('left');
        return;
      }
      if (dx > 65) {
        dismissToast('right');
        return;
      }

      // Snap back & resume timer
      box.style.transform = '';
      box.style.opacity = '';
      toastStartTs = Date.now();
      const bar = document.getElementById('toastProgressBar');
      if (bar) {
        bar.style.transition = `transform ${toastRemainingMs}ms linear`;
        bar.style.transform = 'scaleX(0)';
      }
      toastTimer = setTimeout(() => dismissToast('up'), toastRemainingMs);
    };

    box.addEventListener('touchstart', e => {
      if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    box.addEventListener('touchmove', e => {
      if (isDragging && e.touches.length === 1) {
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    box.addEventListener('touchend', onEnd);
    box.addEventListener('touchcancel', onEnd);

    box.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      onStart(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', e => { if (isDragging) onMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { if (isDragging) onEnd(); });
  });
})();

function toggleMenu(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const menu = document.getElementById('dropMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
}
function closeMenus() {
  const menu = document.getElementById('dropMenu');
  if (menu) menu.classList.add('hidden');
}

window.addEventListener('click', event => {
  const btn = document.getElementById('menuBtn');
  const moreBtn = document.getElementById('mobileMoreBtn');
  const menu = document.getElementById('dropMenu');
  if (menu && !menu.classList.contains('hidden')) {
    const clickedInsideBtn = btn && btn.contains(event.target);
    const clickedInsideMore = moreBtn && moreBtn.contains(event.target);
    const clickedInsideMenu = menu.contains(event.target);
    if (!clickedInsideBtn && !clickedInsideMore && !clickedInsideMenu) {
      menu.classList.add('hidden');
    }
  }
});

function confirmClearData() {
  if (!requireAuth()) return;
  closeMenus();
  openConfirm('Zero all data?', 'All transactions and budget will be permanently deleted.', () => {
    transactions = [];
    window._a7ExplicitWipe = true;   // allow the sync to remove cloud documents too
    lsDel(BUDGET_KEY);
    saveData({ force: true });
    refreshAll();
    showToast('The data has been completely filtered', 'info');
  });
}

function loadDemoData() {
  if (!requireAuth()) return;
  closeMenus();
  openConfirm('Download experimental data?', 'Existing transactions will be replaced with sample data.', () => {
    const now = Date.now();
    transactions = JSON.parse(JSON.stringify(DEMO_ITEMS)).map((t, i) => normalizeTransaction({ ...t, _updatedAt: now + i }));
    saveData({ force: true });
    refreshAll();
    showToast('Experimental data has been uploaded', 'success');
  });
}

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
  applyRoleUI();
  updateQuickInsights();
  checkMoneyNotifications();
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
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  initTheme();
  registerServiceWorker();
  initInstallPrompt();
  initNetworkStatus();

  // Splash hide if element exists
  const splash = document.getElementById('pwaSplash');
  if (splash) {
    splash.style.display = 'none';
  }

  const isPortal = await checkPublicPortalMode();
  if (isPortal) return;

  initPrivacyMode();
  loadAllLocal();
  refreshAll();
  navigateSegmented('home');
  document.getElementById('formDate').value = todayString();
  const dueDateInput = document.getElementById('formDueDate');
  if (dueDateInput) dueDateInput.value = '';
  document.getElementById('formTime').value = currentInputTimeString();

  try {
    const cached = lsGet(PERMS_CACHE_KEY);
    if (cached) rolePermissions = JSON.parse(cached);
  } catch(e) {}
  applyRoleUI();
  updatePinUI();

  // PWA: Handle share target and file restore
  setTimeout(() => {
    handleShareTarget();
    handleFileRestore();
  }, 100);

  // PWA: Install banner check (after 3 visits)
  

  // PWA: Service Worker update detection
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
        });
      });
    });
  }

  showAuthLoading();
  await handleRedirectResult();

  setTimeout(() => {
    if (!authResolved) {
      hideAuthLoading();
      showLoginWall();
    }
  }, 3000);
});


/* =========================================================
   DUE DATE HELPER (Due dateDebts)
   ========================================================= */
function getDueDateBadge(debt) {
  if (!debt.dueDate || debt.status === 'paid') return '';
  const today = todayString();
  const diffDays = Math.round((new Date(debt.dueDate) - new Date(today)) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-500/15 text-rose-500 border border-rose-500/30 mr-1"><i class="fa-solid fa-triangle-exclamation"></i>Late   ${Math.abs(diffDays)}day  </span>`;
  } else if (diffDays === 0) {
    return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-500 border border-amber-500/30 mr-1"><i class="fa-solid fa-bell"></i>Due today!  </span>`;
  } else if (diffDays <= 3) {
    return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-orange-500/15 text-orange-400 border border-orange-500/30 mr-1"><i class="fa-regular fa-clock"></i>Worth through   ${diffDays}days  </span>`;
  }
  return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-400 mr-1"><i class="fa-regular fa-calendar"></i>Entitlement: ${debt.dueDate}</span>`;
}


/* =========================================================
   EXCEL XLSX EXPORT (SheetJS)
   ========================================================= */
function exportToExcel() {
  if (!requireAuth()) return;
  if (!hasFeature('export')) { showToast('Export is not available for your role', 'error'); return; }
  closeMenus();
  
  if (typeof XLSX === 'undefined') {
    showToast('Using regular CSV export...', 'info');
    exportToCSV();
    return;
  }
  
  const activeTxs = getActiveTransactions();
  if (!activeTxs.length) { showToast('There is no data to export', 'error'); return; }

  // 1. Transactions Sheet
  const txRows = activeTxs.map(t => ({
    "ID": t.id,
    "Type": typeName(t.type),
    "Amount (EGP)": Number(t.amount) || 0,
    "Paid": Number(t.paidAmount) || 0,
    "Client": t.client || '-',
    "Classification": t.category || '-',
    "Payment method": normalizePaymentMethod(t.paymentMethod),
    "Date": t.date,
    "time": t.time || '',
    "due date": t.dueDate || '-',
    "Description/notes": t.notes || '',
    "Status": t.status === 'paid' ? 'Settled' : (t.status === 'pending' ? 'Pending' : 'Accomplished')
  }));

  // 2. Debts Sheet
  const debts = activeTxs.filter(t => isDebt(t.type)).map(d => ({
    "Party": d.client || 'Not specified',
    "Type": d.type === 'debt_receivable' ? 'due to me (I ask)' : 'Due from me (required from me)',
    "Total debt": Number(d.amount) || 0,
    "He shot it": Number(d.paidAmount) || 0,
    "residual": Math.max(0, (Number(d.amount) || 0) - (Number(d.paidAmount) || 0)),
    "Registration date": d.date,
    "due date": d.dueDate || '-',
    "Description": d.notes || '',
    "Status": d.status === 'paid' ? 'Paid in full' : 'Pending'
  }));

  // 3. Wallets Summary Sheet
  const metrics = calculateMetrics();
  const walletRows = Object.keys(metrics.wallets).map(w => ({
    "Treasury/Payment Method": w,
    "Available balance (EGP)": metrics.wallets[w]
  }));

  const wb = XLSX.utils.book_new();
  const wsTx = XLSX.utils.json_to_sheet(txRows);
  const wsDebts = XLSX.utils.json_to_sheet(debts.length ? debts : [{ "alert": "There are no recorded debts" }]);
  const wsWallets = XLSX.utils.json_to_sheet(walletRows);

  XLSX.utils.book_append_sheet(wb, wsTx, "Financial transactions");
  XLSX.utils.book_append_sheet(wb, wsDebts, "Debt book");
  XLSX.utils.book_append_sheet(wb, wsWallets, "Treasury balances");

  XLSX.writeFile(wb, `a7sbly_a7sbly_${todayString()}.xlsx`);
  showToast('The comprehensive Excel file has been exported successfully 🎉', 'success');
}

/* =========================================================
   QUICK INSIGHTS (Financial intelligence and period comparison)
   ========================================================= */
function updateQuickInsights() {
  const insightText = document.getElementById('insightText');
  const insightBadge = document.getElementById('insightBadge');
  if (!insightText || !insightBadge) return;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let curExpenses = 0;
  let prevExpenses = 0;
  const categoryCount = {};

  getActiveTransactions().forEach(t => {
    if (t.type === 'expense' || t.type === 'charity') {
      const d = new Date(t.date + 'T12:00:00');
      const amt = Number(t.amount) || 0;
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        curExpenses += amt;
        const cat = t.category || 'Other';
        categoryCount[cat] = (categoryCount[cat] || 0) + amt;
      } else if (
        (currentMonth === 0 && d.getFullYear() === currentYear - 1 && d.getMonth() === 11) ||
        (d.getFullYear() === currentYear && d.getMonth() === currentMonth - 1)
      ) {
        prevExpenses += amt;
      }
    }
  });

  // Find top expense category
  let topCat = null;
  let topCatAmt = 0;
  Object.keys(categoryCount).forEach(c => {
    if (categoryCount[c] > topCatAmt) {
      topCatAmt = categoryCount[c];
      topCat = c;
    }
  });

  if (curExpenses === 0 && prevExpenses === 0) {
    insightText.textContent = 'Record your expenses this month to start tracking your financial analysis and exchange rate.';
    insightBadge.className = 'w-full sm:w-auto text-center shrink-0 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 text-xs font-black';
    insightBadge.innerHTML = '<i class="fa-solid fa-chart-simple"></i>The beginning of the month';
    return;
  }

  if (prevExpenses > 0) {
    const diff = curExpenses - prevExpenses;
    const pct = Math.abs(Math.round((diff / prevExpenses) * 100));
    if (diff > 0) {
      insightText.innerHTML = `Your expenses this month are higher by   <strong class="text-rose-400">${pct}%</strong>About last month ${topCat ? `• Most spent: <strong class="text-orange-400">${escapeHTML(topCat)}</strong>` : ''}`;
      insightBadge.className = 'w-full sm:w-auto text-center shrink-0 px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-black';
      insightBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i>more${pct}%`;
    } else {
      insightText.innerHTML = `I saved   <strong class="text-emerald-400">${pct}%</strong>Compared to the previous month ${topCat ? `• Highest: <strong class="text-orange-400">${escapeHTML(topCat)}</strong>` : ''}`;
      insightBadge.className = 'w-full sm:w-auto text-center shrink-0 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black';
      insightBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i>save${pct}%`;
    }
  } else {
    insightText.innerHTML = `Total expenses for the month so far: <strong class="text-orange-400">${money(curExpenses)}EGP</strong> ${topCat ? `(Highest: ${escapeHTML(topCat)})` : ''}`;
    insightBadge.className = 'w-full sm:w-auto text-center shrink-0 px-3 py-1.5 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-black';
    insightBadge.innerHTML = `<i class="fa-solid fa-calculator"></i> ${money(curExpenses)}EGP`;
  }
}

/* =========================================================
   CLIENT LEDGER PDF EXPORT (html2pdf.js)
   ========================================================= */
function exportClientLedgerPDF() {
  if (!activeClientName) return;
  const clientName = activeClientName;
  const txs = getActiveTransactions().filter(t => t.client && t.client.trim().toLowerCase() === clientName.toLowerCase())
    .sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));

  let totalIncome = 0, totalDebtRec = 0, totalDebtPay = 0;
  txs.forEach(t => {
    const amt = Number(t.amount) || 0;
    const paid = Number(t.paidAmount) || 0;
    if (t.type === 'income') totalIncome += amt;
    else if (t.type === 'debt_receivable' && t.status !== 'paid') totalDebtRec += Math.max(0, amt - paid);
    else if (t.type === 'debt_payable' && t.status !== 'paid') totalDebtPay += Math.max(0, amt - paid);
  });

  const pdfContainer = document.createElement('div');
  pdfContainer.style.padding = '30px';
  pdfContainer.style.fontFamily = 'Cairo, Arial, sans-serif';
  pdfContainer.style.direction = 'rtl';
  pdfContainer.style.color = '#0f172a';
  pdfContainer.style.backgroundColor = '#ffffff';

  pdfContainer.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #f97316; padding-bottom:15px; margin-bottom:20px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="logo.png" style="width:60px; height:60px; border-radius:14px; object-fit:contain;" alt="a7sbly">
        <div>
          <h1 style="margin:0; font-size:24px; font-weight:900; color:#0f172a;">a7sbly | a7sbly</h1>
          <div style="font-size:11px; color:#f97316; font-weight:bold;">Account statement Client Certified</div>
        </div>
      </div>
      <div style="text-align:left; font-size:11px; color:#64748b;">
        <div>Release date:<strong>${todayString()}</strong></div>
        <div>time: <strong>${formatTimeTo12Hour(currentInputTimeString())}</strong></div>
      </div>
    </div>

    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-size:11px; color:#64748b;">Client Respected:</div>
        <div style="font-size:20px; font-weight:900; color:#0f172a;">${escapeHTML(clientName)}</div>
      </div>
      <div style="display:flex; gap:15px;">
        <div style="text-align:center;">
          <div style="font-size:10px; color:#64748b;">Total services</div>
          <div style="font-size:14px; font-weight:900; color:#10b981;">${money(totalIncome)} EGP</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px; color:#64748b;">Remaining on him (for you)</div>
          <div style="font-size:14px; font-weight:900; color:#06b6d4;">${money(totalDebtRec)} EGP</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px; color:#64748b;">He deserves it (upon you)</div>
          <div style="font-size:14px; font-weight:900; color:#8b5cf6;">${money(totalDebtPay)} EGP</div>
        </div>
      </div>
    </div>

    <h3 style="font-size:14px; font-weight:900; margin-bottom:10px; color:#334155;">tableTransactions Detailed:</h3>
    <table style="width:100%; border-collapse:collapse; font-size:11px; text-align: left;">
      <thead>
        <tr style="background:#f97316; color:white;">
          <th style="padding:8px 10px; border:1px solid #ea580c;">Date</th>
          <th style="padding:8px 10px; border:1px solid #ea580c;">Type</th>
          <th style="padding:8px 10px; border:1px solid #ea580c;">Description andDetails</th>
          <th style="padding:8px 10px; border:1px solid #ea580c;">Payment method</th>
          <th style="padding:8px 10px; border:1px solid #ea580c;">Amount</th>
          <th style="padding:8px 10px; border:1px solid #ea580c;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${txs.map(t => `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 10px; border:1px solid #e2e8f0; font-weight:bold;">${escapeHTML(t.date)}</td>
            <td style="padding:8px 10px; border:1px solid #e2e8f0;">${escapeHTML(typeName(t.type))}</td>
            <td style="padding:8px 10px; border:1px solid #e2e8f0;">${escapeHTML(t.notes || t.category)}</td>
            <td style="padding:8px 10px; border:1px solid #e2e8f0;">${escapeHTML(normalizePaymentMethod(t.paymentMethod))}</td>
            <td style="padding:8px 10px; border:1px solid #e2e8f0; font-weight:900; color:${t.type==='income'?'#10b981':'#f43f5e'};">
              ${money(t.amount)} EGP
            </td>
            <td style="padding:8px 10px; border:1px solid #e2e8f0;">${t.status === 'paid' ? 'Settled' : (isDebt(t.type) ? 'Pending' : 'Accomplished')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="margin-top:35px; text-align:center; font-size:11px; color:#94a3b8; border-top:1px dashed #cbd5e1; padding-top:15px;">
      This report was extracted automatically by the system<strong>a7sbly | a7sbly</strong> — Thank youGeneralYou are fine with us✨
    </div>
  `;

  // Attach to DOM offscreen so html2canvas computes positive dimensions and fonts
  pdfContainer.style.position = 'fixed';
  pdfContainer.style.top = '0';
  pdfContainer.style.left = '0';
  pdfContainer.style.width = '794px';
  pdfContainer.style.zIndex = '-9999';
  pdfContainer.style.opacity = '1';
  pdfContainer.style.pointerEvents = 'none';
  document.body.appendChild(pdfContainer);

  if (typeof html2pdf !== 'undefined') {
    showToast('Creating a PDF statement...', 'info');
    const opt = {
      margin: 8,
      filename: `Description_of_account_${clientName}_${todayString()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(pdfContainer).save().then(() => {
      showToast('The PDF statement of account has been uploaded successfully ✓', 'success');
      pdfContainer.remove();
    }).catch(() => {
      pdfContainer.remove();
      window.print();
    });
  } else {
    pdfContainer.remove();
    window.print();
  }
}


/* =========================================================
   DEBT REMINDER CARD (generationClaim card And reminder)
   ========================================================= */
let currentCardDebt = null;

async function shareDebtCardWhatsApp() {
  if (!currentCardDebt) return;
  const d = currentCardDebt;
  const total = Number(d.amount) || 0;
  const paid = Number(d.paidAmount) || 0;
  const rem = Math.max(0, total - paid);

  const text = `May God’s peace and mercy be upon you,
Welcome, sir${d.client || 'So he regretted it'} 🤝

We inform you that the service has been completedNextSuccessfully:
📌 *Service:* ${d.notes || d.category || 'Maintenance service'}
📅 *Date:* ${d.date}
💰 *Total account:* ${money(total)} EGP
${paid > 0 ? `💵 *Settled:* ${money(paid)} EGP\n`: ''}🔴 *Amount required to be paid:*   ${money(rem)}EGP

Please kindly make payment forClose Transaction. We are very thankful for Hassan TGeneralYou are fine with us✨
— *a7sbly | a7sbly*`;

  const canvas = document.getElementById('debtCardCanvas');

  // The radical solution: use a systemShare Original for mobile (Web Share API with Files)
  // This system opens a menuShare And choose from themWhatsApp To send theImage And text together with the click of a button!
  if (canvas && navigator.canShare) {
    try {
      const blob = await new Promise(resolve => safeCanvasToBlob(canvas, resolve, 'image/png'));
      if (blob) {
        const file = new File([blob], `Claim_${d.client || 'Client'}.png`, { type: 'image/png' });
        const shareData = {
          files: [file],
          title: 'Financial claim card a7sbly',
          text: text
        };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          showToast('Image and text have been shared successfully ✓', 'success');
          return;
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn("Native share fallback:", err);
      } else {
        return; // User cancelled
      }
    }
  }

  // If your browser does not support direct file sharing (such as some computers):
  // We copy theImage For the portfolio+ downloadHa and direct theUser For WhatsApp
  let copiedImage = false;
  if (canvas && navigator.clipboard && window.ClipboardItem) {
    try {
      const blob = await new Promise(resolve => safeCanvasToBlob(canvas, resolve, 'image/png'));
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copiedImage = true;
      }
    } catch (e) {}
  }

  if (!copiedImage) {
    const downloadBtn = document.getElementById('downloadDebtCardBtn');
    if (downloadBtn && downloadBtn.href) downloadBtn.click();
  }

  showToast(copiedImage ? 'The image has been copied to the clipboard 📋! Click (Paste) on WhatsApp' : 'Image saved! Attach it from the gallery', 'info');
  setTimeout(() => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }, 400);
}

async function shareViaSystemSheet() {
  if (!currentCardDebt) return;
  const d = currentCardDebt;
  const total = Number(d.amount) || 0;
  const paid = Number(d.paidAmount) || 0;
  const rem = Math.max(0, total - paid);

  const text = `May God’s peace and mercy be upon you,
Welcome, sir${d.client || 'So he regretted it'} 🤝

We inform you that the service has been completedNextSuccessfully:
📌 *Service:* ${d.notes || d.category || 'Maintenance service'}
📅 *Date:* ${d.date}
💰 *Total account:* ${money(total)} EGP
${paid > 0 ? `💵 *Settled:* ${money(paid)} EGP\n`: ''}🔴 *Amount required to be paid:*   ${money(rem)}EGP

has been attachedImage Financial due notice card.
Please kindly make payment forClose Transaction. We are very thankful for Hassan TGeneralYou are fine with us✨
— *a7sbly | a7sbly*`;

  const canvas = document.getElementById('debtCardCanvas');
  if (canvas && navigator.canShare) {
    try {
      const blob = await new Promise(resolve => safeCanvasToBlob(canvas, resolve, 'image/png'));
      if (blob) {
        const file = new File([blob], `Claim_${d.client || 'Client'}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Financial claim card a7sbly',
            text: text
          });
          showToast('The sharing window has opened successfully ✓', 'success');
          return;
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn("Share API fallback:", err);
      } else {
        return;
      }
    }
  }

  // Fallback
  shareDebtCardWhatsApp();
}

// Utility to draw rounded rect on canvas
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}


/* =========================================================
   CLIENT PENDING REQUESTS & APPROVAL SYSTEM (Customer requests thePendingE)
   ========================================================= */
let pendingRequestsCache = [];

async function submitClientPendingRequest(event) {
  event.preventDefault();
  const params = new URLSearchParams(window.location.search);
  const clientName = (params.get('client') || document.getElementById('portalClientName')?.textContent || 'Client').slice(0, 100);
  const meta = window.portalMeta;
  if (!meta || !meta.ownerUid || !meta.portalId) { showToast('Invalid link, request a new link from the store', 'error'); return; }

  const type = document.getElementById('portalReqType').value;
  const amount = Number(document.getElementById('portalReqAmount').value);
  const notes = sanitizeString(document.getElementById('portalReqNotes').value, 200);

  if (!['income', 'debt_receivable', 'expense'].includes(type)) { showToast('Invalid type', 'error'); return; }
  if (!amount || amount <= 0 || amount >= 100000000) { showToast('Enter a valid amount', 'error'); return; }
  if (!notes) { showToast('Write a service or reason statement', 'error'); return; }

  const id = 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const newReq = {
    id, portalId: meta.portalId, client: clientName, type, amount,
    category: type === 'debt_receivable' ? 'A debt owed' : type === 'income' ? 'Income/payment' : 'Expense',
    notes, date: todayString(), time: formatTimeTo12Hour(currentInputTimeString()),
    paymentMethod: 'Pending/client request', status: 'pending_approval', createdAt: Date.now()
  };

  try {
    await db.collection('users').doc(meta.ownerUid).collection('requests').doc(id).set(newReq);
    showToast('Your order has been sent successfully, awaiting store review and approval ✓', 'success');
    event.target.reset();
  } catch (error) {
    console.error('Failed to submit client request:', error);
    showToast('Failed to send the request to the cloud', 'error');
  }
}

async function fetchPendingRequests() {
  if (!currentUser) return [];
  const snap = await db.collection('users').doc(currentUser.uid).collection('requests').get();
  const reqs = snap.docs.map(d => d.data()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  pendingRequestsCache = reqs;
  return reqs;
}

let requestsUnsubscribe = null;
function subscribeToRequests(uid) {
  if (requestsUnsubscribe) { try { requestsUnsubscribe(); } catch (e) {} requestsUnsubscribe = null; }
  requestsUnsubscribe = db.collection('users').doc(uid).collection('requests').onSnapshot(snap => {
    pendingRequestsCache = snap.docs.map(d => d.data());
    updateGlobalPendingAlert(pendingRequestsCache);
    const badge = document.getElementById('pendingReqBadge');
    if (badge) badge.textContent = pendingRequestsCache.length;
  }, err => console.warn('requests listener:', err));
}

async function approveRequestCore(req) {
  const uid = currentUser.uid;
  const newTx = normalizeTransaction({
    id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    type: req.type, amount: req.amount, date: req.date, time: req.time,
    client: req.client, category: req.category, paymentMethod: 'Accepted by the customer',
    notes: req.notes, status: isDebt(req.type) ? 'pending' : null, _updatedAt: Date.now()
  });
  const batch = db.batch();
  batch.set(txCol(uid).doc(newTx.id), JSON.parse(txJSON(newTx)));
  batch.delete(db.collection('users').doc(uid).collection('requests').doc(req.id));
  await batch.commit();
  cloudSnapshot.set(newTx.id, txJSON(newTx));
  transactions.unshift(newTx);
  saveLocalData();
  refreshSharedPortals();
}
async function rejectRequestCore(reqId) {
  await db.collection('users').doc(currentUser.uid).collection('requests').doc(reqId).delete();
}

function renderAdminRequests() {
  const container = document.getElementById('adminRequestsList');
  const badge = document.getElementById('pendingReqBadge');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-4 text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin"></i>Loading...</div>';

  if (!currentUser) return;
  fetchPendingRequests().then(reqs => {
    if (badge) badge.textContent = reqs.length;

    container.innerHTML = '';
    if (!reqs.length) {
      container.innerHTML = '<div class="text-center py-8 text-xs text-slate-400 font-bold"><i class="fa-solid fa-circle-check text-3xl mb-2 text-emerald-500 opacity-60"></i><p>There are no pending orders from customers</p></div>';
      return;
    }

    reqs.forEach(req => {
      const card = document.createElement('div');
      card.className = 'p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3';
      card.innerHTML = `
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-black">to requestClient new</span>
            <span class="text-xs font-black text-slate-800 dark:text-white">${escapeHTML(req.client)}</span>
          </div>
          <div class="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1">${escapeHTML(req.notes)}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">${escapeHTML(typeName(req.type))} • ${money(req.amount)} EGP • ${escapeHTML(req.date)}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="approveClientRequest('${jsAttr(req.id)}')" class="px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-black hover:bg-emerald-600 transition flex items-center gap-1">
            <i class="fa-solid fa-check"></i> OK
          </button>
          <button onclick="rejectClientRequest('${jsAttr(req.id)}')" class="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white text-xs font-black transition flex items-center gap-1">
            <i class="fa-solid fa-xmark"></i> to reject
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }).catch(err => {
    container.innerHTML = '<div class="text-center py-4 text-xs text-rose-500">Error fetching requests</div>';
  });
}

async function approveClientRequest(reqId) {
  if (!currentUser) return;
  const req = pendingRequestsCache.find(r => r.id === reqId);
  if (!req) return;
  openConfirm('Accept customer order?', `A transaction will be authorized for   <strong>${escapeHTML(req.client)}</strong>In an amount   <strong>${money(req.amount)}EGP</strong>And add them officially to your accounts.`, async () => {
    try {
      await approveRequestCore(req);
      showToast('The request was accepted and added to the transaction successfully 🎉', 'success');
      renderAdminRequests();
      refreshAll();
    } catch (error) {
      showToast('Failed to accept the request', 'error');
    }
  });
}

async function rejectClientRequest(reqId) {
  if (!currentUser) return;
  openConfirm('Reject and delete the request?', 'This request will be ignored and permanently deleted.', async () => {
    try {
      await rejectRequestCore(reqId);
      showToast('The request was rejected and deleted', 'info');
      renderAdminRequests();
    } catch (error) {
      showToast('Failed to reject the request', 'error');
    }
  });
}

function updateGlobalPendingAlert(reqs) {
  const alertEl = document.getElementById('globalPendingAlert');
  const countEl = document.getElementById('globalPendingCount');
  if (!alertEl || !countEl) return;
  
  const count = Array.isArray(reqs) ? reqs.length : 0;
  if (count > 0) {
    alertEl.classList.remove('hidden');
    alertEl.classList.add('flex');
    countEl.textContent = count;
  } else {
    alertEl.classList.add('hidden');
    alertEl.classList.remove('flex');
  }
}

/* =========================================================
   FREE CLIENT REQUESTS APPROVAL MODAL (Available for all accounts)
   ========================================================= */
function openClientRequestsModal() {
  if (!requireAuth()) return;
  const modal = document.getElementById('clientRequestsModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  renderGlobalClientRequests();
}

function closeClientRequestsModal() {
  const modal = document.getElementById('clientRequestsModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function renderGlobalClientRequests() {
  const container = document.getElementById('globalClientRequestsList');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-6 text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin text-orange-500 text-base"></i><p class="mt-2">Receiving orders...</p></div>';

  if (!currentUser) return;
  fetchPendingRequests().then(reqs => {

    container.innerHTML = '';
    if (!reqs.length) {
      container.innerHTML = '<div class="text-center py-10 text-xs text-slate-400 font-bold"><i class="fa-solid fa-circle-check text-3xl mb-2 text-emerald-500 opacity-80"></i><p>There are currently no pending orders from customers</p></div>';
      return;
    }

    reqs.forEach(req => {
      const card = document.createElement('div');
      card.className = 'p-3.5 rounded-2xl border border-amber-500/30 bg-black/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3';
      card.innerHTML = `
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-black">New order</span>
            <span class="text-xs font-black text-white">${escapeHTML(req.client)}</span>
          </div>
          <div class="text-xs font-bold text-slate-200 mt-1">${escapeHTML(req.notes)}</div>
          <div class="text-[10px] text-orange-400 mt-0.5 font-bold">${escapeHTML(typeName(req.type))} • ${money(req.amount)} EGP • ${escapeHTML(req.date)}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="approveGlobalClientRequest('${jsAttr(req.id)}')" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-1 shadow">
            <i class="fa-solid fa-check"></i> OK
          </button>
          <button onclick="rejectGlobalClientRequest('${jsAttr(req.id)}')" class="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white text-xs font-black transition flex items-center gap-1">
            <i class="fa-solid fa-xmark"></i> to reject
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }).catch(err => {
    container.innerHTML = '<div class="text-center py-6 text-xs text-rose-500 font-bold">Error fetching requests from the cloud</div>';
  });
}

async function approveGlobalClientRequest(reqId) {
  if (!currentUser) return;
  const req = pendingRequestsCache.find(r => r.id === reqId);
  if (!req) return;
  closeClientRequestsModal();
  openConfirm('Accept customer order?', `A transaction will be authorized for   <strong>${escapeHTML(req.client)}</strong>In an amount   <strong>${money(req.amount)}EGP</strong>And add them officially to your accounts.`, async () => {
    try {
      await approveRequestCore(req);
      showToast('The request was accepted and added to the transaction successfully 🎉', 'success');
      renderGlobalClientRequests();
      refreshAll();
    } catch (error) {
      showToast('Failed to accept the request', 'error');
    }
  });
}

async function rejectGlobalClientRequest(reqId) {
  if (!currentUser) return;
  closeClientRequestsModal();
  openConfirm('Reject and delete the request?', 'This request will be ignored and permanently deleted.', async () => {
    try {
      await rejectRequestCore(reqId);
      showToast('The request was rejected and deleted', 'info');
      renderGlobalClientRequests();
    } catch (error) {
      showToast('Failed to reject the request', 'error');
    }
  });
}

/* =========================================================
   PROFIT MARGIN CALCULATOR
   ========================================================= */
function openProfitModal() {
  closeMenus();
  document.getElementById('calcCost').value = '';
  document.getElementById('calcPrice').value = '';
  document.getElementById('resProfit').textContent = '0.00 EGP';
  document.getElementById('resMargin').textContent = '0%';
  const modal = document.getElementById('profitModal');
  if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}
function closeProfitModal() {
  const modal = document.getElementById('profitModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}
function calculateProfit() {
  const cost = Number(document.getElementById('calcCost').value) || 0;
  const price = Number(document.getElementById('calcPrice').value) || 0;
  const profit = price - cost;
  const margin = price > 0 ? ((profit / price) * 100).toFixed(1) : 0;
  document.getElementById('resProfit').textContent = money(profit) + ' EGP';
  document.getElementById('resMargin').textContent = margin + '%';
}

/* =========================================================
   INVENTORY / PARTS TRACKER (Spare parts store)
   ========================================================= */
function loadInventory() {
  try {
    const saved = lsGet(INVENTORY_KEY);
    inventoryItems = saved ? JSON.parse(saved) : [];
  } catch(e) { inventoryItems = []; }
}
function saveInventory() {
  lsSet(INVENTORY_KEY, JSON.stringify(inventoryItems));
  if (isRealCloudUser()) syncToCloud();
}
function openInventoryModal(id = null) {
  closeMenus();
  editingInvId = id;
  const modal = document.getElementById('inventoryModal');
  document.getElementById('invName').value = '';
  document.getElementById('invQty').value = '';
  document.getElementById('invPrice').value = '';
  document.getElementById('invNotes').value = '';
  document.getElementById('invEditId').value = '';
  if (id) {
    const item = inventoryItems.find(i => i.id === id);
    if (item) {
      document.getElementById('invModalTitle').textContent = 'Edit category';
      document.getElementById('invName').value = item.name;
      document.getElementById('invQty').value = item.qty;
      document.getElementById('invPrice').value = item.price || '';
      document.getElementById('invNotes').value = item.notes || '';
      document.getElementById('invEditId').value = item.id;
    }
  } else {
    document.getElementById('invModalTitle').textContent = 'Add an item to the warehouse';
  }
  if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}
function closeInventoryModal() {
  const modal = document.getElementById('inventoryModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  editingInvId = null;
}
function handleInventorySubmit(e) {
  e.preventDefault();
  const name = sanitizeString(document.getElementById('invName').value, 100);
  const qty = parseInt(document.getElementById('invQty').value, 10) || 0;
  const price = Number(document.getElementById('invPrice').value) || 0;
  const notes = sanitizeString(document.getElementById('invNotes').value, 150);
  const editId = document.getElementById('invEditId').value;

  if (!name) { showToast('Enter the item name', 'error'); return; }

  if (editId) {
    const item = inventoryItems.find(i => i.id === editId);
    if (item) {
      item.name = name; item.qty = qty; item.price = price; item.notes = notes;
      item._updatedAt = Date.now();
    }
    showToast('The item has been updated successfully', 'success');
  } else {
    const newItem = {
      id: 'inv-' + Date.now(),
      name, qty, price, notes,
      _updatedAt: Date.now()
    };
    inventoryItems.unshift(newItem);
    showToast('The item has been added to the store ✓', 'success');
  }
  saveInventory();
  renderInventory();
  closeInventoryModal();
  logAudit('Modify store', `Add/edit a category:   ${name}(Quantity: ${qty})`);
}
function deleteInventoryItem(id) {
  openConfirm('Delete item?', 'This item will be removed from stock.', () => {
    inventoryItems = inventoryItems.filter(i => i.id !== id);
    saveInventory();
    renderInventory();
    showToast('The item has been deleted', 'info');
    logAudit('Delete category', `An item has been deleted from the warehouse ID:${id}`);
  });
}
function renderInventory() {
  const container = document.getElementById('inventoryContainer');
  const empty = document.getElementById('emptyInventoryState');
  if (!container) return;
  container.innerHTML = '';
  if (!inventoryItems.length) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  inventoryItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'p-4 rounded-2xl border border-slate-200 dark:border-dark-750 bg-slate-50 dark:bg-dark-850 flex flex-col justify-between';
    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between gap-2">
          <h4 class="font-black text-sm text-slate-800 dark:text-slate-100">${escapeHTML(item.name)}</h4>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${item.qty > 2 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}">
            Quantity:${item.qty}
          </span>
        </div>
        ${item.price > 0 ? `<div class="text-xs font-bold text-orange-500 mt-1">Price: ${money(item.price)} EGP</div>` : ''}
        ${item.notes ? `<div class="text-[10px] text-slate-400 mt-1"><i class="fa-solid fa-location-dot"></i> ${escapeHTML(item.notes)}</div>` : ''}
      </div>
      <div class="mt-4 pt-3 border-t border-slate-200/60 dark:border-dark-800 flex items-center justify-between">
        <span class="text-[9px] text-slate-400">Spare parts store</span>
        <div class="flex items-center gap-1">
          <button onclick="openInventoryModal('${jsAttr(item.id)}')" class="p-2 rounded-xl text-slate-400 hover:text-orange-500 transition"><i class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="deleteInventoryItem('${jsAttr(item.id)}')" class="p-2 rounded-xl text-slate-400 hover:text-rose-500 transition"><i class="fa-solid fa-trash-can text-xs"></i></button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

/* =========================================================
   AUDIT LOG / ACTIVITY HISTORY (Activity log)
   ========================================================= */
function loadAuditLog() {
  try {
    const saved = lsGet(AUDIT_KEY);
    auditLogs = saved ? JSON.parse(saved) : [];
  } catch(e) { auditLogs = []; }
}
function saveAuditLog() {
  lsSet(AUDIT_KEY, JSON.stringify(auditLogs));
}
function logAudit(action, details) {
  const log = {
    id: 'audit-' + Date.now(),
    action,
    details,
    date: new Date().toLocaleString('en-US')
  };
  auditLogs.unshift(log);
  if (auditLogs.length > 100) auditLogs = auditLogs.slice(0, 100);
  saveAuditLog();
}
function clearAuditLog() {
  openConfirm('Clear activity log?', 'All records of modifications and events will be cleared.', () => {
    auditLogs = [];
    saveAuditLog();
    renderAuditLog();
    showToast('The history has been cleared', 'info');
  });
}
function renderAuditLog() {
  const tbody = document.getElementById('auditTbody');
  const empty = document.getElementById('emptyAuditState');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!auditLogs.length) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  auditLogs.forEach(log => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 dark:hover:bg-dark-850/60';
    tr.innerHTML = `
      <td class="py-3 px-3 font-bold text-slate-500 dark:text-slate-400">${escapeHTML(log.date)}</td>
      <td class="py-3 px-3"><span class="px-2 py-0.5 rounded-lg bg-orange-500/10 text-orange-500 font-black text-[10px]">${escapeHTML(log.action)}</span></td>
      <td class="py-3 px-3 text-slate-700 dark:text-slate-200 font-medium">${escapeHTML(log.details)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* =========================================================
   STARTUP OVERDUE DEBTS CHECK
   ========================================================= */
function checkOverdueDebtsAlert() {
  const overdue = getActiveTransactions().filter(t => isDebt(t.type) && t.status !== 'paid' && t.dueDate && t.dueDate < todayString());
  if (overdue.length > 0) {
    setTimeout(() => {
      showToast(`⚠️ Warning: You have (${overdue.length}) Overdue debts that require follow-up!`, 'error');
    }, 1200);
  }
}

/* =========================================================
   RECURRING EXPENSES (Expenses recurring and constant)
   ========================================================= */
const RECURRING_KEY = 'ehsebli_recurring_v1';
let recurringExpenses = [];

function loadRecurring() {
  try {
    const saved = lsGet(RECURRING_KEY);
    recurringExpenses = saved ? JSON.parse(saved) : [];
  } catch(e) { recurringExpenses = []; }
}
function saveRecurring() {
  lsSet(RECURRING_KEY, JSON.stringify(recurringExpenses));
  if (isRealCloudUser()) syncToCloud();
}
function openRecurringModal() {
  closeMenus();
  loadRecurring();
  renderRecurringList();
  const modal = document.getElementById('recurringModal');
  if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}
function closeRecurringModal() {
  const modal = document.getElementById('recurringModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}
function addRecurringExpense() {
  const name = sanitizeString(document.getElementById('recName').value, 100);
  const amount = Number(document.getElementById('recAmount').value) || 0;
  const period = document.getElementById('recPeriod').value;
  if (!name || amount <= 0) { showToast('Enter the expense name and amount correctly', 'error'); return; }

  recurringExpenses.push({
    id: 'rec-' + Date.now(),
    name, amount, period,
    lastApplied: todayString()
  });
  saveRecurring();
  renderRecurringList();
  document.getElementById('recName').value = '';
  document.getElementById('recAmount').value = '';
  showToast('Fixed expenses saved ✓', 'success');
}
function deleteRecurring(id) {
  recurringExpenses = recurringExpenses.filter(r => r.id !== id);
  saveRecurring();
  renderRecurringList();
  showToast('The expense has been deleted', 'info');
}
function renderRecurringList() {
  const container = document.getElementById('recurringList');
  if (!container) return;
  container.innerHTML = '';
  if (!recurringExpenses.length) {
    container.innerHTML = '<div class="text-center py-4 text-xs text-slate-400">There are no fixed expenses recorded</div>';
    return;
  }
  recurringExpenses.forEach(r => {
    const card = document.createElement('div');
    card.className = 'p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2';
    card.innerHTML = `
      <div>
        <div class="font-black text-xs text-white">${escapeHTML(r.name)}</div>
        <div class="text-[10px] text-orange-400 mt-0.5">${money(r.amount)} EGP (${r.period === 'monthly' ? 'monthly' : r.period === 'weekly' ? 'Weekly' : 'daily'})</div>
      </div>
      <button onclick="deleteRecurring('${jsAttr(r.id)}')" class="p-2 text-rose-400 hover:text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
    `;
    container.appendChild(card);
  });
}

/* =========================================================
   CASH DRAWER RECONCILIATION (Matching stairs)
   ========================================================= */
function openDrawerModal() {
  closeMenus();
  const metrics = calculateMetrics();
  const cashWallet = metrics.wallets['Cash'] || 0;
  document.getElementById('drawerExpected').textContent = money(cashWallet) + ' EGP';
  document.getElementById('drawerActual').value = '';
  document.getElementById('drawerDiff').textContent = '0.00 EGP';
  const modal = document.getElementById('drawerModal');
  if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}
function closeDrawerModal() {
  const modal = document.getElementById('drawerModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}
function calculateDrawerDiff() {
  const metrics = calculateMetrics();
  const expected = metrics.wallets['Cash'] || 0;
  const actual = Number(document.getElementById('drawerActual').value) || 0;
  const diff = actual - expected;
  const diffEl = document.getElementById('drawerDiff');
  diffEl.textContent = money(diff) + ' EGP ' + (diff === 0 ? '(Exactly matches ✓)' : diff > 0 ? '(Increase in stairs 📈)' : '(shortage of stairs 📉)');
  diffEl.className = 'text-base font-black ' + (diff === 0 ? 'text-emerald-400' : diff > 0 ? 'text-cyan-400' : 'text-rose-400');
}

/* =========================================================
   PERFORMANCE KPIs (Performance indicators advanced)
   ========================================================= */
function openKPIModal() {
  closeMenus();
  const activeTxs = getActiveTransactions();
  let totalIn = 0, totalExp = 0;
  const clientMap = {};
  const serviceMap = {};

  activeTxs.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      totalIn += amt;
      if (t.client) clientMap[t.client] = (clientMap[t.client] || 0) + amt;
      if (t.category) serviceMap[t.category] = (serviceMap[t.category] || 0) + amt;
    } else if (t.type === 'expense') {
      totalExp += amt;
    }
  });

  // Top client
  let topClient = 'There is no';
  let topClientAmt = 0;
  Object.keys(clientMap).forEach(c => {
    if (clientMap[c] > topClientAmt) { topClientAmt = clientMap[c]; topClient = c; }
  });

  // Top service
  let topService = 'There is no';
  let topServiceAmt = 0;
  Object.keys(serviceMap).forEach(s => {
    if (serviceMap[s] > topServiceAmt) { topServiceAmt = serviceMap[s]; topService = s; }
  });

  const netProfit = totalIn - totalExp;
  const profitMargin = totalIn > 0 ? ((netProfit / totalIn) * 100).toFixed(1) : 0;

  const content = document.getElementById('kpiContent');
  content.innerHTML = `
    <div class="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
      <div class="flex justify-between font-bold"><span>totalRevenue Registered:</span><span class="text-emerald-400 font-black">${money(totalIn)} EGP</span></div>
      <div class="flex justify-between font-bold"><span>totalExpenses Registered:</span><span class="text-rose-400 font-black">${money(totalExp)} EGP</span></div>
      <div class="flex justify-between font-bold"><span>Net net return:</span><span class="text-cyan-400 font-black">${money(netProfit)} EGP (${profitMargin}%)</span></div>
    </div>
    <div class="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
      <div class="flex justify-between font-bold"><span>moreClient TGeneralNo and profitability:</span><span class="text-orange-400 font-black">${escapeHTML(topClient)} (${money(topClientAmt)} EGP)</span></div>
      <div class="flex justify-between font-bold"><span>Service /Classification TopIncomeA:</span><span class="text-amber-400 font-black">${escapeHTML(topService)} (${money(topServiceAmt)} EGP)</span></div>
    </div>
  `;

  const modal = document.getElementById('kpiModal');
  if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}
function closeKPIModal() {
  const modal = document.getElementById('kpiModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}


/* =========================================================
   SERVICE WORKER REGISTRATION
   ========================================================= */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(err => {
        console.warn('ServiceWorker registration failed:', err);
      });
    });
  }
}

/* =========================================================
   CONTROL CENTER MODAL (Control center comprehensive)
   ========================================================= */
function openControlCenter() {
  if (!requireAuth()) return;
  const modal = document.getElementById('controlCenterModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeControlCenter() {
  const modal = document.getElementById('controlCenterModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

/* =========================================================
   EXTRA MODULES PLACEHOLDERS (Shift, cabinet conversion, maintenance equipment)
   ========================================================= */
function openShiftSettlementModal() {
  const metrics = calculateMetrics();
  const summary = `📊 *Summary of today’s shift closing | a7sbly*
📅 Date: ${todayString()}
💵 totalRevenue: ${money(metrics.income)} EGP
💸 The totalExpenseat:${money(metrics.expense)} EGP
🤲 accountCharity: ${money(metrics.charity)} EGP
💰 net theCashOhAvailableA:${money(metrics.available)} EGP
— Locked successfully`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(summary);
    showToast('The shift report has been copied to the clipboard 📋 ready to send on WhatsApp', 'success');
  } else {
    showToast(`Daily net:${money(metrics.available)}EGP`, 'info');
  }
}

function openWalletTransferModal() {
  showToast('The liquidity transfer feature between treasuries is being updated in the next release', 'info');
}

function openTicketsModal() {
  showToast('Maintenance devices tickets and receipts feature is being prepared', 'info');
}

/* =========================================================
   MONEY & PENDING ALERTS (systemalertThe money andDebts)
   ========================================================= */
function checkMoneyNotifications() {
  const alertEl = document.getElementById('globalPendingAlert');
  const countEl = document.getElementById('globalPendingCount');
  const textEl = document.getElementById('globalPendingText');
  if (!alertEl || !countEl) return;

  const today = todayString();
  
  // 1. Debts LateOr Due eventoday And did not pay
  const overdueDebts = getActiveTransactions().filter(t => 
    isDebt(t.type) && 
    t.status !== 'paid' && 
    t.dueDate && 
    t.dueDate <= today
  );

  // 2. Customer requests thePendingreceived from the cloud
  const clientReqsCount = pendingRequestsCache ? pendingRequestsCache.length : 0;
  const totalAlerts = overdueDebts.length + clientReqsCount;

  if (totalAlerts > 0) {
    alertEl.classList.remove('hidden');
    alertEl.classList.add('flex');
    countEl.textContent = totalAlerts;

    if (textEl) {
      if (overdueDebts.length > 0 && clientReqsCount > 0) {
        textEl.textContent = 'Debts and claims alert';
      } else if (overdueDebts.length > 0) {
        textEl.textContent = 'Debts payable';
      } else {
        textEl.textContent = 'Pending customer orders';
      }
    }
  } else {
    alertEl.classList.add('hidden');
    alertEl.classList.remove('flex');
  }
}

function handleMoneyAlertClick() {
  const today = todayString();
  const overdueDebts = getActiveTransactions().filter(t => 
    isDebt(t.type) && t.status !== 'paid' && t.dueDate && t.dueDate <= today
  );

  if (pendingRequestsCache && pendingRequestsCache.length > 0) {
    openClientRequestsModal();
  } else if (overdueDebts.length > 0) {
    switchTab('debts', true);
    showToast(`you have (${overdueDebts.length}) Debts that are due due and require follow-up ⚠️`, 'error');
  }
}



/* =========================================================
   MODERN SEGMENTED NAV + LAST 8 TRANSACTIONS + SHOW MORE (V15.0)
   ========================================================= */
const APP_MODE_KEY = 'a7sbly_app_mode_v1';
const DEMO_FLAG_KEY = 'a7sbly_is_demo_v1';
const TX_INITIAL_LIMIT = 8;
let showAllTransactions = false;
let homeRecentExpanded = false;
let currentActiveView = 'home';

// Extend updateMetrics to sync badges in the modern segmented bar & home cards
const _origUpdateMetrics = updateMetrics;
updateMetrics = function() {
  _origUpdateMetrics();
  const metrics = calculateMetrics();
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('heroCharityVal', money(metrics.charity));
  setTxt('mobCardDebtRec', money(metrics.debtRec) + ' EGP');
  setTxt('mobCardDebtPay', money(metrics.debtPay) + ' EGP');

  // Update Segmented Bar Badges
  const dailyCount = getPeriodTransactions().filter(t => !isDebt(t.type)).length;
  const debtCount = getActiveTransactions().filter(t => isDebt(t.type) && t.status !== 'paid').length;
  const clientCount = getAllClientNames().length;
  setTxt('segTxBadge', dailyCount);
  setTxt('segDebtBadge', debtCount);
  setTxt('segClientBadge', clientCount);

  if (currentUser) {
    const rawName = currentUser.displayName || '';
    const firstName = rawName ? rawName.split(' ')[0] : 'Honda  ';
    setTxt('headerUserGreeting', firstName);
  }

  // Horizontal swipeable wallets
  const strip = document.getElementById('mobileWalletsStrip');
  if (strip) {
    strip.innerHTML = '';
    const defaultMethods = ['Cash', 'InstaPay', 'Vodafone Cash/Wallet', 'Visa/bank card'];
    const allMethods = Array.from(new Set([...defaultMethods, ...Object.keys(metrics.wallets)]));
    allMethods.forEach(method => {
      const bal = metrics.wallets[method] || 0;
      let icon = 'fa-wallet';
      if (isCashMethod(method)) icon = 'fa-hand-holding-dollar';
      else if (method.includes('InstaPay')) icon = 'fa-bolt';
      else if (method.includes('Wallet')) icon = 'fa-mobile-screen-button';
      else if (method.includes('Visa')) icon = 'fa-credit-card';

      const chip = document.createElement('div');
      chip.className = 'ft-wallet-chip';
      chip.innerHTML = `
        <div class="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
          <i class="fa-solid ${icon} text-orange-400"></i>
          <span class="truncate">${escapeHTML(method.split(' ')[0])}</span>
        </div>
        <div class="money-val text-sm font-black mt-1.5 ${bal >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-400'}">
          ${money(bal)} <span class="text-[9px] text-slate-400">EGP</span>
        </div>
      `;
      strip.appendChild(chip);
    });
  }
};

function buildFeedCardHTML(item) {
  const isInc = item.type === 'income';
  const isChr = item.type === 'charity';
  const iconBg = isInc ? 'bg-emerald-500/15 text-emerald-400' : isChr ? 'bg-orange-500/15 text-orange-400' : 'bg-rose-500/15 text-rose-400';
  const iconCls = isInc ? 'fa-circle-arrow-down' : isChr ? 'fa-hand-holding-heart' : 'fa-circle-arrow-up';
  const amtColor = isInc ? 'text-emerald-400' : isChr ? 'text-orange-400' : 'text-rose-400';
  const sign = isInc ? '+' : '-';

  return `
    <div class="flex items-center gap-3 min-w-0 flex-1" onclick="editTransaction('${jsAttr(item.id)}')">
      <div class="w-10 h-10 rounded-2xl ${iconBg} flex items-center justify-center text-sm shrink-0">
        <i class="fa-solid ${iconCls}"></i>
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-xs font-black text-slate-900 dark:text-white truncate">
          ${escapeHTML(item.notes || item.category || 'practical')}
        </div>
        <div class="text-[10px] text-slate-400 font-bold mt-0.5 truncate">
          ${item.client ? `<span class="text-orange-400">${escapeHTML(item.client)}</span> • ` : ''}${payMethodHTML(item.paymentMethod)} • ${escapeHTML(item.date)}
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <div class="text-left">
        <div class="money-val text-sm font-black ${amtColor}">${sign}${money(item.amount)}</div>
        <div class="text-[9px] text-slate-500 font-bold text-left">EGP</div>
      </div>
    </div>
  `;
}

// Override renderTransactions to limit to last 8 items by default + Show More button
renderTransactions = function() {
  const tbody = document.getElementById('transactionsTbody');
  const feed = document.getElementById('mobileTransactionsFeed');
  const empty = document.getElementById('emptyTransactionsState');
  const showMoreWrap = document.getElementById('txShowMoreContainer');
  const showMoreBtn = document.getElementById('txShowMoreBtn');
  const search = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

  if (tbody) tbody.innerHTML = '';
  if (feed) feed.innerHTML = '';

  let fullList = getPeriodTransactions().filter(t => {
    if (isDebt(t.type)) return false;
    if (activeFilter !== 'all' && t.type !== activeFilter) return false;
    if (!search) return true;
    const text = [t.category, t.notes, t.client, t.paymentMethod, t.reference, t.time, typeName(t.type)].join(' ').toLowerCase();
    return text.includes(search);
  });
  fullList.sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));

  // Also update Home Recent Transactions (last 8 or expanded)
  renderHomeRecentFeed();

  if (!fullList.length) {
    if (empty) empty.classList.remove('hidden');
    if (showMoreWrap) showMoreWrap.classList.add('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  const isSearching = search.length > 0;
  const visibleList = (showAllTransactions || isSearching) ? fullList : fullList.slice(0, TX_INITIAL_LIMIT);
  const remainingCount = fullList.length - visibleList.length;

  // Show More / Show Less Button Control
  if (showMoreWrap && showMoreBtn) {
    if (fullList.length > TX_INITIAL_LIMIT && !isSearching) {
      showMoreWrap.classList.remove('hidden');
      if (showAllTransactions) {
        showMoreBtn.innerHTML = `<i class="fa-solid fa-chevron-up"></i> <span>Show less (latest${TX_INITIAL_LIMIT}transactions only)</span>`;
      } else {
        showMoreBtn.innerHTML = `<i class="fa-solid fa-chevron-down"></i> <span>Show more (+${remainingCount}other transaction)</span>`;
      }
    } else {
      showMoreWrap.classList.add('hidden');
    }
  }

  // Render Mobile Card Feed
  if (feed) {
    visibleList.forEach(item => {
      const card = document.createElement('div');
      card.className = 'ft-tx-feed-item';
      card.innerHTML = buildFeedCardHTML(item) + `
        <button onclick="requestDelete('${jsAttr(item.id)}')" class="w-8 h-8 rounded-xl bg-white/5 text-slate-400 hover:text-rose-400 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>`;
      feed.appendChild(card);
    });
  }

  // Render Desktop Table
  if (tbody) {
    visibleList.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 dark:hover:bg-dark-850/60 transition group';
      let badge = '', amount = '';
      if (item.type === 'income') {
        badge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><i class="fa-solid fa-arrow-trend-up"></i>Income  </span>`;
        amount = `<span class="money-val font-black text-emerald-500">+${money(item.amount)}EGP</span>`;
      } else if (item.type === 'charity') {
        badge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-orange-500/10 text-orange-500 border border-orange-500/20"><i class="fa-solid fa-heart"></i>Good  </span>`;
        amount = `<span class="money-val font-black text-orange-500">-${money(item.amount)}EGP</span>`;
      } else {
        badge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-rose-500/10 text-rose-500 border border-rose-500/20"><i class="fa-solid fa-arrow-trend-down"></i>Expense</span>`;
        amount = `<span class="money-val font-black text-rose-500">-${money(item.amount)}EGP</span>`;
      }
      const timeFormatted = item.time ? formatTimeTo12Hour(item.time) : '';
      tr.innerHTML = `
        <td class="py-3 px-4">
          <div class="flex items-center gap-2.5">
            ${badge}
            <div class="flex items-center gap-2">
              ${item.receipt ? `<img src="${safeReceiptURL(item.receipt)}" onclick="viewReceiptImage('${jsAttr(item.receipt)}')" class="w-9 h-9 rounded-xl object-cover border border-orange-500/40 cursor-pointer shrink-0" alt="Image">` : ''}
              <div>
                <div class="font-bold text-slate-800 dark:text-slate-100">${escapeHTML(item.notes || 'Without statement')}</div>
                ${item.reference ? `<div class="text-[9px] text-slate-400 mt-0.5">Reference: ${escapeHTML(item.reference)}</div>` : ''}
              </div>
            </div>
          </div>
        </td>
        <td class="py-3 px-4">
          ${item.client ? `<button onclick="openClientLedger('${jsAttr(item.client)}')" class="inline-flex items-center gap-1 text-xs font-black text-orange-500 hover:underline"><i class="fa-solid fa-user-circle"></i> ${escapeHTML(item.client)}</button>` : '<span class="text-slate-400 text-[10px]">-</span>'}
        </td>
        <td class="py-3 px-4"><span class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-300 font-bold text-[10px]">${escapeHTML(item.category)}</span></td>
        <td class="py-3 px-4 text-slate-500 dark:text-slate-400 font-semibold">${payMethodHTML(item.paymentMethod)}</td>
        <td class="py-3 px-4">
          <div class="font-bold text-slate-600 dark:text-slate-300 text-xs">${escapeHTML(item.date)}</div>
          <div class="text-[10px] text-orange-500 font-bold mt-0.5">${escapeHTML(timeFormatted)}</div>
        </td>
        <td class="py-3 px-4">${amount}</td>
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center gap-1">
            <button onclick="shareViaWhatsApp('${jsAttr(item.id)}')" class="p-2 rounded-xl text-emerald-500 hover:bg-emerald-500/10"><i class="fa-brands fa-whatsapp text-sm"></i></button>
            <button onclick="editTransaction('${jsAttr(item.id)}')" class="p-2 rounded-xl text-slate-400 hover:text-orange-500"><i class="fa-solid fa-pen text-xs"></i></button>
            <button onclick="requestDelete('${jsAttr(item.id)}')" class="p-2 rounded-xl text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
};

function toggleTransactionsLimit() {
  showAllTransactions = !showAllTransactions;
  renderTransactions();
}

function renderHomeRecentFeed() {
  const recentFeed = document.getElementById('mobileRecentFeed');
  const homeMoreWrap = document.getElementById('homeShowMoreWrap');
  const homeMoreBtn = document.getElementById('homeShowMoreBtn');
  if (!recentFeed) return;

  const allSorted = getActiveTransactions().filter(t => !isDebt(t.type))
    .sort((a, b) => new Date(`${b.date}T23:59:59`) - new Date(`${a.date}T23:59:59`));

  recentFeed.innerHTML = '';
  if (!allSorted.length) {
    recentFeed.innerHTML = '<div class="text-center py-6 text-xs text-slate-500 font-bold">There are no transactions recorded yet</div>';
    if (homeMoreWrap) homeMoreWrap.classList.add('hidden');
    return;
  }

  const visible = homeRecentExpanded ? allSorted : allSorted.slice(0, TX_INITIAL_LIMIT);
  const rem = allSorted.length - visible.length;

  if (homeMoreWrap && homeMoreBtn) {
    if (allSorted.length > TX_INITIAL_LIMIT) {
      homeMoreWrap.classList.remove('hidden');
      if (homeRecentExpanded) {
        homeMoreBtn.innerHTML = `<i class="fa-solid fa-chevron-up"></i> <span>Show less (latest${TX_INITIAL_LIMIT}transactions)</span>`;
      } else {
        homeMoreBtn.innerHTML = `<i class="fa-solid fa-chevron-down"></i> <span>Show more (+${rem}treatment)</span>`;
      }
    } else {
      homeMoreWrap.classList.add('hidden');
    }
  }

  visible.forEach(item => {
    const card = document.createElement('div');
    card.className = 'ft-tx-feed-item';
    card.innerHTML = buildFeedCardHTML(item);
    recentFeed.appendChild(card);
  });
}

function toggleHomeRecentExpand() {
  homeRecentExpanded = !homeRecentExpanded;
  renderHomeRecentFeed();
}

// Unified Modern Segmented Navigation (Works seamlessly on Mobile & Desktop!)
function navigateSegmented(target) {
  currentActiveView = target;

  // 1. Highlight active pill in the Segmented Bar
  document.querySelectorAll('.seg-pill-btn[data-seg]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.seg === target);
  });

  // 2. Highlight active pill in Mobile Bottom Nav
  document.querySelectorAll('.mob-nav-btn[data-mob-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mobTab === target);
  });

  // 3. Mobile Section Visibility
  document.querySelectorAll('[data-mob-view]').forEach(sec => {
    const views = (sec.getAttribute('data-mob-view') || '').split(' ');
    const displayType = sec.getAttribute('data-mob-display') || 'block';
    const isActive = views.includes(target);

    sec.classList.remove('mob-active-block', 'mob-active-grid');
    if (isActive) {
      sec.classList.add(displayType === 'grid' ? 'mob-active-grid' : 'mob-active-block');
    }
  });

  // 4. Desktop Panel Switching & Smooth Scroll
  if (target === 'transactions' || target === 'home') {
    _originalSwitchTab('transactions', false);
  } else if (target === 'debts') {
    _originalSwitchTab('debts', false);
  } else if (target === 'clients') {
    _originalSwitchTab('clients', false);
  } else if (target === 'manage') {
    renderInventory();
    renderAuditLog();
  }

  // On Desktop, if clicking Transactions / Debts / Clients, scroll smoothly to the active panel
  if (window.innerWidth >= 768 && target !== 'home') {
    const panelMap = { transactions: 'panelTransactions', debts: 'panelDebts', clients: 'panelClients' };
    const el = document.getElementById(panelMap[target]);
    if (el) {
      const topPos = el.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
    }
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

const _originalSwitchTab = switchTab;
switchTab = function(tab, shouldScroll = false) {
  _originalSwitchTab(tab, false);
  if (tab === 'transactions') navigateSegmented('transactions');
  else if (tab === 'debts') navigateSegmented('debts');
  else if (tab === 'clients') navigateSegmented('clients');
  else if (tab === 'inventory' || tab === 'audit') navigateSegmented('manage');
};

function initAppModeAndTabs() {
  if (currentUser) syncModeForCurrentUser(); else applyAppMode('business', false);
  updateDemoBanner();
  navigateSegmented('home');
  updateMetrics();
  renderTransactions();
}

// Apply mode(replace/Personal) theUser present,Or Show the selection screen ifOrFor once
function syncModeForCurrentUser() {
  if (!currentUser || window.isPortalModeActive) return;
  const saved = lsGet(APP_MODE_KEY);
  applyAppMode(saved || 'business', false);
  const modal = document.getElementById('modeOnboardingModal');
  if (modal) {
    modal.classList.toggle('hidden', !!saved);
    modal.classList.toggle('flex', !saved);
  }
  updateDemoBanner();
}

function selectInitialMode(mode) {
  applyAppMode(mode);
  const modal = document.getElementById('modeOnboardingModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  showToast(mode === 'business' ? 'Shop and trade mode has been activated 🏪' : 'Personal mode has been activated 👤', 'success');
  scheduleAppTour(350);
}

function applyAppMode(mode, persist = true) {
  document.body.setAttribute('data-mode', mode);
  if (persist) lsSet(APP_MODE_KEY, mode);

  const icon = document.getElementById('modeSwitchIcon');
  const label = document.getElementById('modeSwitchLabel');
  const manageLbl = document.getElementById('mobManageLabel');

  if (mode === 'personal') {
    if (icon) icon.className = 'fa-solid fa-user';
    if (label) label.textContent = 'Personal';
    if (manageLbl) manageLbl.textContent = 'Management';
  } else {
    if (icon) icon.className = 'fa-solid fa-store';
    if (label) label.textContent = 'The shop';
    if (manageLbl) manageLbl.textContent = 'The store';
  }
}

function toggleAppMode() {
  const current = document.body.getAttribute('data-mode') || 'business';
  const next = current === 'business' ? 'personal' : 'business';
  applyAppMode(next);
  showToast(next === 'business' ? 'Switched to shop mode 🏪' : 'Switched to personal mode 👤', 'info');
}

function startWithDemoMode() {
  selectInitialMode('business');
  const now = Date.now();
  transactions = JSON.parse(JSON.stringify(DEMO_ITEMS)).map((t, i) => normalizeTransaction({ ...t, _updatedAt: now + i }));
  lsSet(DEMO_FLAG_KEY, 'true');
  saveLocalData();
  refreshAll();
  updateDemoBanner();
  showToast('Experimental data uploaded for exploration ✨', 'success');
}

function exitDemoData() {
  openConfirm('Clear experimental data?', 'The demo data will be zeroed out to start recording your real accounts.', () => {
    transactions = [];
    window._a7ExplicitWipe = true;   // allow the sync to remove cloud documents too
    lsDel(DEMO_FLAG_KEY);
    saveData({ force: true });
    refreshAll();
    updateDemoBanner();
    showToast('Data has been filtered successfully, start now! 🚀', 'success');
  });
}

function updateDemoBanner() {
  const banner = document.getElementById('demoModeBanner');
  if (!banner) return;
  const isDemo = lsGet(DEMO_FLAG_KEY) === 'true';
  banner.classList.toggle('hidden', !isDemo);
}

function formatArabicDateTime(dateInput) {
  if (!dateInput) return 'Not available';
  try {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return 'Not available';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) + ' • ' + d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return 'Not available';
  }
}

function openUserProfileModal() {
  if (!requireAuth()) return;
  const modal = document.getElementById('userProfileModal');
  if (!modal) return;

  const avatarEl = document.getElementById('profileModalAvatar');
  const headerAvatar = document.getElementById('userAvatar');
  if (avatarEl && headerAvatar) avatarEl.src = headerAvatar.src;

  const isGuest = currentUser.isAnonymous || String(currentUser.uid || '').startsWith('guest-');
  const nameEl = document.getElementById('profileModalName');
  const emailEl = document.getElementById('profileModalEmail');
  const methodBadge = document.getElementById('profileModalMethodBadge');
  const rolePill = document.getElementById('profileModalRolePill');
  const createdEl = document.getElementById('profileModalCreated');
  const lastLoginEl = document.getElementById('profileModalLastLogin');
  const modeEl = document.getElementById('profileModalMode');
  const txCountEl = document.getElementById('profileModalTxCount');

  if (nameEl) nameEl.textContent = currentUser.displayName || (isGuest ? 'Guest' : 'Hesabli user');
  if (emailEl) emailEl.textContent = isGuest ? 'Local account without email' : (currentUser.email || currentUser.phoneNumber || '-');

  const method = isGuest ? 'guest' : getLoginMethod();
  if (methodBadge) {
    if (method === 'google') methodBadge.innerHTML = '<i class="fa-brands fa-google text-red-400"></i> Google';
    else if (method === 'guest') methodBadge.innerHTML = '<i class="fa-solid fa-user-secret text-orange-400"></i>Visitor';
    else methodBadge.innerHTML = '<i class="fa-solid fa-envelope text-cyan-400"></i>Account  ';
  }

  if (rolePill) {
    if (isSuperAdmin) {
      rolePill.className = 'mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black border border-amber-500/40 bg-amber-500/20 text-amber-400';
      rolePill.innerHTML = '<i class="fa-solid fa-crown"></i> Super Admin';
    } else {
      const meta = ROLES_META[userRole] || ROLES_META.free;
      rolePill.className = `mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black border ${meta.badgeClasses}`;
      rolePill.innerHTML = `<i class="fa-solid ${meta.icon}"></i>Package:${meta.name}`;
    }
  }

  if (createdEl) createdEl.textContent = isGuest ? 'Temporary session' : formatArabicDateTime(currentUser.metadata?.creationTime);
  if (lastLoginEl) lastLoginEl.textContent = isGuest ? 'Now' : formatArabicDateTime(currentUser.metadata?.lastSignInTime);
  if (modeEl) {
    const curMode = document.body.getAttribute('data-mode') || 'business';
    modeEl.textContent = curMode === 'business' ? 'Shop status 🏪  ' : 'Personal status 👤';
  }
  if (txCountEl) txCountEl.textContent = `${getActiveTransactions().length}Transaction  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeUserProfileModal() {
  const modal = document.getElementById('userProfileModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(initAppModeAndTabs, 200);
});




/* =========================================================
   V19.0: PERSONAL VS BUSINESS CATEGORIES, PROMPT & PROFILE SYNC
   ========================================================= */
const PERSONAL_CATEGORIES = {
  expense: ['Food and drinks', 'Transportation and gasoline', 'Bills and internet', 'Rent and housing', 'Clothes and purchases', 'Health and treatment', 'Entertainment and outings', 'Other'],
  income: ['Monthly salary', 'Reward/incentive', 'Freelancing', 'Gift/transfer', 'Other'],
  charity: ['ongoing charity', 'Need help', 'Feed food', 'Zakat on money', 'Other'],
  debt_receivable: ['An ancestor of a friend/relative', 'Personal due', 'Other'],
  debt_payable: ['An advance owed to me', 'Monthly installment', 'Deferred invoice', 'Other']
};

const BUSINESS_CATEGORIES = JSON.parse(JSON.stringify(CATEGORIES));

// Override onTypeChange to load Personal vs Business categories automatically
const _origOnTypeChange = onTypeChange;
onTypeChange = function() {
  const mode = document.body.getAttribute('data-mode') || 'business';
  const sourceCats = mode === 'personal' ? PERSONAL_CATEGORIES : BUSINESS_CATEGORIES;
  Object.keys(sourceCats).forEach(k => { CATEGORIES[k] = sourceCats[k]; });
  _origOnTypeChange();
};

// Update Profile Modal live labels when toggled
function updateProfileModalLabels() {
  const isDark = document.documentElement.classList.contains('dark');
  const curMode = document.body.getAttribute('data-mode') || 'business';
  const themeSub = document.getElementById('profileThemeSubtitle');
  const modeSub = document.getElementById('profileModeSubtitle');
  const modeEl = document.getElementById('profileModalMode');
  const avatarImg = document.getElementById('profileModalAvatar');

  if (themeSub) themeSub.textContent = isDark ? 'Dark night mode 🌙' : 'Quiet day mode ☀️';
  if (modeSub) modeSub.textContent = curMode === 'business' ? 'Trade and shop mode 🏪' : 'Simple personal mode 👤';
  if (modeEl) modeEl.textContent = curMode === 'business' ? 'Shop status 🏪  ' : 'Personal status 👤';
  if (typeof refreshProfileExtras === 'function') refreshProfileExtras();
}

const _origOpenUserProfileModal = openUserProfileModal;
openUserProfileModal = function() {
  _origOpenUserProfileModal();
  updateProfileModalLabels();
};

// Trigger Mode Selection Prompt on first login if not chosen yet
const _origApplyAppMode = applyAppMode;
applyAppMode = function(mode) {
  _origApplyAppMode(mode);
  const meta = document.querySelector('meta[name="theme-color"]');
  const isDark = document.documentElement.classList.contains('dark');
  if (meta) {
    meta.setAttribute('content', isDark ? '#07080c' : (mode === 'personal' ? '#f2f6fa' : '#f4f6f9'));
  }
};

// (to choosethe situation It is doneNow insidesyncModeForCurrentUser perUser separately)


/* =========================================================
   V20.3 — transferVisitor data,Category budget,alertSmart ones,
   Backup Periodic, index ofOrFlynn,download Libraries when needed
   ========================================================= */
const GUEST_UID = 'guest-local-user';
const GUEST_IMPORT_KEY = 'a7sbly_guest_import_v1';
const BACKUP_TS_KEY = 'a7sbly_last_backup_v1';
const BACKUP_SNOOZE_KEY = 'a7sbly_backup_snooze_v1';
const FIRST_SEEN_KEY = 'a7sbly_first_seen_v1';
const CATALERT_KEY = 'ehsebli_catalert_v1';
const HINTS_KEY = 'a7sbly_hints_seen_v1';

function _safeJSON(str, fallback) { try { const v = JSON.parse(str); return v == null ? fallback : v; } catch (e) { return fallback; } }

/* ---------- 1) download Heavy libraries when needed (xlsx / html2pdf) ---------- */
const LAZY_LIBS = {
  xlsx: { src: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
          integrity: 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw',
          ready: () => typeof XLSX !== 'undefined' },
  html2pdf: { src: 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
              integrity: 'sha384-Yv5O+t3uE3hunW8uyrbpPW3iw6/5/Y7HitWJBLgqfMoA36NogMmy+8wWZMpn3HWc',
              ready: () => typeof html2pdf !== 'undefined' }
};
const _libPromises = {};
function ensureLib(name) {
  const L = LAZY_LIBS[name];
  if (!L) return Promise.resolve(false);
  if (L.ready()) return Promise.resolve(true);
  if (_libPromises[name]) return _libPromises[name];
  _libPromises[name] = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = L.src; s.integrity = L.integrity; s.crossOrigin = 'anonymous';
    s.onload = () => resolve(L.ready());
    s.onerror = () => { delete _libPromises[name]; resolve(false); };
    document.head.appendChild(s);
  });
  return _libPromises[name];
}
[['exportToExcel', 'xlsx'], ['exportClientLedgerPDF', 'html2pdf'], ['downloadReportPDF', 'html2pdf']].forEach(([fnName, lib]) => {
  const orig = window[fnName];
  if (typeof orig !== 'function') return;
  window[fnName] = async function () {
    if (!LAZY_LIBS[lib].ready()) {
      showToast('Preparing the export tool...', 'info');
      const ok = await ensureLib(lib);
      if (!ok) showToast('The export tool could not be loaded (requires internet for the first time), we will use the available alternative', 'info');
    }
    return orig.apply(this, arguments);
  };
});
let _prefetchTimer = null;
function scheduleLibPrefetch() {
  clearTimeout(_prefetchTimer);
  _prefetchTimer = setTimeout(() => {
    const c = navigator.connection;
    if (!navigator.onLine || (c && (c.saveData || (c.effectiveType && c.effectiveType !== '4g')))) return;
    ensureLib('xlsx'); ensureLib('html2pdf'); // Because of theExport It works even if the internet is disconnected later
  }, 20000);
}

/* ---------- 2) Small notification system (hints/reminders) ----------*/
const _noticeQueue = [];
let _noticeActive = null;
let _noticeTimer = null;

function _anyModalOpen() {
  return Array.from(document.querySelectorAll('[id$="Modal"], #quickAddSheet')).some(el =>
    !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
}
function a7Notice(opts) {
  if (opts.id && (_noticeQueue.some(n => n.id === opts.id) || (_noticeActive && _noticeActive.id === opts.id))) return;
  _noticeQueue.push(opts);
  pumpNotices();
}
function pumpNotices() {
  if (_noticeActive || !_noticeQueue.length) return;
  if (!currentUser) { _noticeQueue.length = 0; return; }
  if (_tourDriver || _tourBlocked() || _anyModalOpen()) { setTimeout(pumpNotices, 2500); return; }
  const host = document.getElementById('a7NoticeHost');
  if (!host) return;
  const o = _noticeQueue.shift();
  _noticeActive = o;

  const card = document.createElement('div');
  card.className = 'a7n a7n-' + (o.tone || 'hint');
  card.setAttribute('role', 'status');
  const ic = document.createElement('div'); ic.className = 'a7n-ic';
  ic.innerHTML = `<i class="fa-solid ${escapeHTML(o.icon || 'fa-lightbulb')}"></i>`;
  const body = document.createElement('div'); body.className = 'a7n-body';
  const t = document.createElement('div'); t.className = 'a7n-t'; t.textContent = o.title || '';
  const d = document.createElement('div'); d.className = 'a7n-d'; d.textContent = o.text || '';
  body.append(t, d);
  const acts = document.createElement('div'); acts.className = 'a7n-acts';
  (o.actions && o.actions.length ? o.actions : [{ label: 'Okay', primary: true }]).forEach(a => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = a.label;
    b.className = a.primary ? 'a7n-btn a7n-btn-p' : 'a7n-btn';
    b.addEventListener('click', () => { closeNotice(); try { if (a.run) a.run(); } catch (e) { console.error(e); } });
    acts.appendChild(b);
  });
  body.appendChild(acts);
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'a7n-x'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '&times;';
  x.addEventListener('click', () => { closeNotice(); if (o.onDismiss) { try { o.onDismiss(); } catch (e) {} } });
  card.append(ic, body, x);
  host.replaceChildren(card);
  clearTimeout(_noticeTimer);
  if (o.ttl) _noticeTimer = setTimeout(() => { if (_noticeActive === o) { closeNotice(); if (o.onDismiss) { try { o.onDismiss(); } catch (e) {} } } }, o.ttl);
}
function closeNotice() {
  clearTimeout(_noticeTimer);
  _noticeActive = null;
  const host = document.getElementById('a7NoticeHost');
  if (host) host.replaceChildren();
  setTimeout(pumpNotices, 400);
}
function clearNotices() { _noticeQueue.length = 0; closeNotice(); }

/* ---------- 3) Contextual hints forOrFor a visit to each section ----------*/
const SECTION_HINTS = {
  transactions: { icon: 'fa-receipt', title: 'Transaction history',
    text: 'Here all your operations are sorted by the latest. You can modify or delete any operation, and if you delete it by mistake, there is an immediate rollback.' },
  debts: { icon: 'fa-handshake', title: 'Debts',
    text: 'Record a debt owed to you or owed you and set a due date, and you will be alerted when the due date approaches or delays.' },
  clients: { icon: 'fa-users', title: 'Clients',
    text: 'Each client has a complete account statement, which you can download in PDF with one click.' },
  manage: { icon: 'fa-boxes-stacked', title: 'Management',
    text: 'From here you manage the store and recurring expenses, and review the transaction log (audit).' }
};
function maybeShowHint(view) {
  const h = SECTION_HINTS[view];
  if (!h || !currentUser || !localStorage.getItem(TOUR_DONE_KEY)) return;
  const seen = _safeJSON(localStorage.getItem(HINTS_KEY), []);
  if (seen.includes(view)) return;
  setTimeout(() => {
    if (typeof currentActiveView !== 'undefined' && currentActiveView !== view) return;
    const again = _safeJSON(localStorage.getItem(HINTS_KEY), []);
    if (again.includes(view)) return;
    const mark = () => { const s = _safeJSON(localStorage.getItem(HINTS_KEY), []); if (!s.includes(view)) s.push(view); localStorage.setItem(HINTS_KEY, JSON.stringify(s)); };
    a7Notice({ id: 'hint-' + view, tone: 'hint', icon: h.icon, title: h.title, text: h.text, ttl: 14000,
      actions: [{ label: 'I understand', primary: true, run: mark }], onDismiss: mark });
  }, 800);
}
(function hookNavigationForHints() {
  const orig = window.navigateSegmented;
  if (typeof orig !== 'function') return;
  window.navigateSegmented = function (target) {
    const r = orig.apply(this, arguments);
    try { maybeShowHint(target); } catch (e) {}
    return r;
  };
})();

/* ---------- 4) Category budget ---------- */
function sanitizeCatBudgets(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  Object.keys(obj).slice(0, 40).forEach(k => {
    const v = Number(obj[k]);
    if (isFinite(v) && v > 0 && v <= 1e9) out[sanitizeString(k, 100)] = v;
  });
  return out;
}
function loadCatBudgets() { categoryBudgets = sanitizeCatBudgets(_safeJSON(lsGet(CATBUDGET_KEY), {})); }
function saveCatBudgets() {
  lsSet(CATBUDGET_KEY, JSON.stringify(categoryBudgets));
  if (isRealCloudUser()) syncToCloud();
}
function _expenseCategoriesForMode() {
  const personal = (document.body.getAttribute('data-mode') || 'business') === 'personal';
  const src = personal && typeof PERSONAL_CATEGORIES !== 'undefined' ? PERSONAL_CATEGORIES : (typeof BUSINESS_CATEGORIES !== 'undefined' ? BUSINESS_CATEGORIES : CATEGORIES);
  const list = (src.expense || []).filter(c => c !== 'Other');
  Object.keys(categoryBudgets || {}).forEach(c => { if (!list.includes(c)) list.push(c); });
  list.push('Other');
  return Array.from(new Set(list));
}
function monthSpentByCategory() {
  const m = {};
  getActiveTransactions().forEach(t => {
    if (t.type === 'expense' && isInPeriod(t.date, 'month')) m[t.category] = (m[t.category] || 0) + Number(t.amount || 0);
  });
  return m;
}
function renderCatBudgets() {
  const host = document.getElementById('catBudgetList');
  if (!host) return;
  const entries = Object.entries(categoryBudgets || {});
  if (!entries.length) { host.hidden = true; host.innerHTML = ''; return; }
  const spent = monthSpentByCategory();
  const rows = entries.map(([c, l]) => ({ c, l, u: spent[c] || 0, p: ((spent[c] || 0) / l) * 100 }))
    .sort((a, b) => b.p - a.p).slice(0, 6);
  host.innerHTML = '<div class="cb-list-h">Categories</div>' + rows.map(r => {
    const lvl = r.p >= 100 ? 'over' : (r.p >= 80 ? 'warn' : 'ok');
    return `<div class="cb-row cb-${lvl}"><div class="cb-row-top"><span class="cb-name">${escapeHTML(r.c)}</span>` +
      `<span class="cb-amt money-val">${money(r.u)} / ${money(r.l)}</span></div>` +
      `<div class="cb-bar"><i style="width:${Math.min(100, r.p).toFixed(0)}%"></i></div></div>`;
  }).join('');
  host.hidden = false;
}
(function hookBudgetUI() {
  const origUpdate = window.updateBudget;
  window.updateBudget = function () { origUpdate.apply(this, arguments); try { renderCatBudgets(); } catch (e) {} };
  const origOpen = window.openBudgetModal;
  window.openBudgetModal = function () {
    origOpen.apply(this, arguments);
    const box = document.getElementById('catBudgetInputs');
    if (!box) return;
    box.innerHTML = '';
    _expenseCategoriesForMode().forEach(c => {
      const row = document.createElement('label'); row.className = 'cb-in-row';
      const name = document.createElement('span'); name.textContent = c;
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.inputMode = 'numeric'; inp.placeholder = 'Without limit';
      inp.className = 'form-input cb-in'; inp.setAttribute('data-cat', c);
      if (categoryBudgets[c]) inp.value = categoryBudgets[c];
      row.append(name, inp); box.appendChild(row);
    });
  };
  const origSave = window.saveBudget;
  window.saveBudget = function () {
    const box = document.getElementById('catBudgetInputs');
    if (box && box.children.length) {
      const next = {};
      box.querySelectorAll('input[data-cat]').forEach(i => {
        const v = Number(i.value);
        if (isFinite(v) && v > 0) next[i.getAttribute('data-cat')] = v;
      });
      // We maintain category boundaries that are not visible inthe situation present
      Object.keys(categoryBudgets).forEach(k => { if (!box.querySelector(`input[data-cat="${CSS.escape(k)}"]`)) next[k] = categoryBudgets[k]; });
      categoryBudgets = sanitizeCatBudgets(next);
      lsSet(CATBUDGET_KEY, JSON.stringify(categoryBudgets));
    }
    return origSave.apply(this, arguments); // with meSave Total and syncs to the cloud
  };
})();
function checkCategoryBudgetAlert(type, category) {
  if (type !== 'expense') return;
  const limit = categoryBudgets[category];
  if (!limit) return;
  const used = monthSpentByCategory()[category] || 0;
  const pct = (used / limit) * 100;
  const level = pct >= 100 ? 2 : (pct >= 80 ? 1 : 0);
  const month = todayString().slice(0, 7);
  let st = _safeJSON(lsGet(CATALERT_KEY), {});
  if (st.month !== month) st = { month, levels: {} };
  const prev = st.levels[category] || 0;
  if (level > prev) {
    st.levels[category] = level;
    lsSet(CATALERT_KEY, JSON.stringify(st));
    showToast(level === 2
      ? `⚠️ Over budget »${category}» (${money(used)}Who   ${money(limit)})`
      : `Warning: It has arrived${pct.toFixed(0)}% of budget «${category}»`, level === 2 ? 'error' : 'info');
  } else if (level < prev) {
    st.levels[category] = level; lsSet(CATALERT_KEY, JSON.stringify(st));
  }
}

/* ---------- 5) transferVisitor data For the account ----------*/
function readGuestScope() {
  const rd = (k, def) => _safeJSON(localStorage.getItem(scopedKey(k, GUEST_UID)), def);
  const txAll = (rd(STORAGE_KEY, []) || []);
  const tx = Array.isArray(txAll) ? txAll.filter(validateTransaction).map(normalizeTransaction) : [];
  const inv = rd(INVENTORY_KEY, []); const rec = rd(RECURRING_KEY, []);
  return {
    tx, inv: Array.isArray(inv) ? inv : [], rec: Array.isArray(rec) ? rec : [],
    budget: Number(localStorage.getItem(scopedKey(BUDGET_KEY, GUEST_UID)) || 0),
    cat: sanitizeCatBudgets(rd(CATBUDGET_KEY, {})),
    machines: sanitizeMachines(rd(CHARGE_KEY, [])),
    phones: sanitizeClientPhones(rd(CLIENT_PHONES_KEY, {}))
  };
}
function guestHasData() {
  const g = readGuestScope();
  return g.tx.some(t => !t._deleted) || g.inv.length > 0 || g.rec.length > 0 || g.machines.length > 0 || Object.keys(g.phones).length > 0 || g.budget > 0 || Object.keys(g.cat).length > 0;
}
function openGuestImportModal() {
  if (!isRealCloudUser()) return;
  const g = readGuestScope();
  const list = document.getElementById('gimCounts');
  if (list) {
    list.innerHTML = '';
    const items = [[g.tx.filter(t => !t._deleted).length, 'Financial operation'], [g.inv.length, 'Item in stock'], [g.rec.length, 'Recurring expense'], [g.machines.length, 'Charging machine']].filter(x => x[0] > 0);
    if (g.budget > 0) items.push(['✓', 'Monthly budget']);
    items.forEach(([n, label]) => {
      const li = document.createElement('li');
      const b = document.createElement('b'); b.textContent = n;
      li.append(b, ' ' + label); list.appendChild(li);
    });
  }
  const m = document.getElementById('guestImportModal');
  if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
}
function closeGuestImportModal(dismiss) {
  const m = document.getElementById('guestImportModal');
  if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  if (dismiss && isRealCloudUser() && !lsGet(GUEST_IMPORT_KEY)) lsSet(GUEST_IMPORT_KEY, 'dismissed');
}
function maybeOfferGuestImport() {
  if (!isRealCloudUser() || window._guestUpgradeInProgress) return;
  if (lsGet(GUEST_IMPORT_KEY)) return;
  if (!guestHasData()) return;
  openGuestImportModal();
}
function importGuestData() {
  if (!isRealCloudUser()) return;
  const g = readGuestScope();
  transactions = mergeTransactions(transactions, g.tx);
  const keyOf = x => (x && x.id) ? String(x.id) : JSON.stringify(x);
  const invIds = new Set(inventoryItems.map(keyOf));
  g.inv.forEach(i => { if (i && !invIds.has(keyOf(i))) inventoryItems.push(i); });
  const recIds = new Set(recurringExpenses.map(keyOf));
  g.rec.forEach(r => { if (r && !recIds.has(keyOf(r))) recurringExpenses.push(r); });
  if (!getBudget() && g.budget > 0) lsSet(BUDGET_KEY, g.budget);
  categoryBudgets = sanitizeCatBudgets({ ...g.cat, ...categoryBudgets });
  const mIds = new Set(chargeMachines.map(m => m.id));
  g.machines.forEach(m => { if (!mIds.has(m.id)) chargeMachines.push(m); });
  chargeMachines = sanitizeMachines(chargeMachines);
  lsSet(CHARGE_KEY, JSON.stringify(chargeMachines));
  clientPhones = sanitizeClientPhones({ ...g.phones, ...clientPhones });
  lsSet(CLIENT_PHONES_KEY, JSON.stringify(clientPhones));
  lsSet(INVENTORY_KEY, JSON.stringify(inventoryItems));
  lsSet(RECURRING_KEY, JSON.stringify(recurringExpenses));
  lsSet(CATBUDGET_KEY, JSON.stringify(categoryBudgets));
  saveLocalData();
  lsSet(GUEST_IMPORT_KEY, 'imported');
  closeGuestImportModal(false);
  refreshAll();
  if (typeof renderInventory === 'function') renderInventory();
  updateBudget();
  syncToCloud();
  showToast('Visitor data has been transferred to your account ✓', 'success');
}
(function hookGuestUpgrade() {
  const orig = window.upgradeGuestToGoogle;
  if (typeof orig !== 'function') return;
  window.upgradeGuestToGoogle = async function () {
    window._guestUpgradeInProgress = true;      // This function is transferredDescriptionShe comes by herself, so we won’t ask again
    try { await orig.apply(this, arguments); if (isRealCloudUser()) lsSet(GUEST_IMPORT_KEY, 'imported'); }
    finally { window._guestUpgradeInProgress = false; }
  };
})();

/* ---------- 6) reminderBackup weekY ----------*/
let _backupCheckTimer = null;
function scheduleBackupCheck() { clearTimeout(_backupCheckTimer); _backupCheckTimer = setTimeout(checkBackupReminder, 9000); }
function checkBackupReminder() {
  if (!currentUser || !hasFeature('backup')) return;
  if (getActiveTransactions().length < 5) return;
  const now = Date.now(), DAY = 864e5;
  let first = Number(lsGet(FIRST_SEEN_KEY)) || 0;
  if (!first) { first = now; lsSet(FIRST_SEEN_KEY, String(now)); }
  const last = Number(lsGet(BACKUP_TS_KEY)) || 0;
  if (now < (Number(lsGet(BACKUP_SNOOZE_KEY)) || 0)) return;
  if (now - (last || first) < 7 * DAY) return;
  const guest = !isRealCloudUser();
  a7Notice({
    id: 'backup', tone: 'warn', icon: 'fa-cloud-arrow-down',
    title: guest ? 'Take a backup now' : 'Weekly backup time',
    text: guest ? 'Your data is saved on this device only, and if you delete your browser data, it will be lost. Download a copy now.'
      : (last ? 'It has been more than a week since the last backup. Copy on your device Added security for cloud sync.'
              : 'I haven’t made any backup yet. Copy on your device Added security for cloud sync.'),
    actions: [
      { label: 'Back up now', primary: true, run: () => downloadBackup() },
      { label: 'Remind me in 3 days', run: () => lsSet(BACKUP_SNOOZE_KEY, String(Date.now() + 3 * DAY)) }
    ]
  });
}

/* ---------- 7) Index ofOrFlynn ----------*/
let _pendingOfflineSync = false;
(function hookOfflineSync() {
  const orig = window.syncToCloud;
  if (typeof orig !== 'function') return;
  window.syncToCloud = function () {
    if (navigator.onLine === false && isRealCloudUser()) { _pendingOfflineSync = true; return Promise.resolve(); }
    return orig.apply(this, arguments);
  };
})();
function updateConnectivityUI(announce) {
  const off = navigator.onLine === false;
  document.documentElement.classList.toggle('is-offline', off);
  const bar = document.getElementById('a7OfflineBar');
  if (bar) {
    bar.hidden = !off;
    const txt = bar.querySelector('span');
    if (txt) txt.textContent = isRealCloudUser()
      ? 'You are offline - the application is running and your data is on your device, and it will sync when the internet returns'
      : 'You are offline - the application is working normally and your data is saved on your device';
  }
  if (announce && !off) {
    if (isRealCloudUser() && _pendingOfflineSync) {
      _pendingOfflineSync = false;
      showToast('Reconnect — Syncing your changes ☁️', 'success');
      syncToCloud();
    } else if (currentUser) showToast('Internet connection is back', 'success');
  }
  const pill = document.getElementById('profileSyncPill');
  if (pill && typeof refreshProfileExtras === 'function') refreshProfileExtras();
}
window.addEventListener('offline', () => updateConnectivityUI(true));
window.addEventListener('online', () => updateConnectivityUI(true));
window.addEventListener('DOMContentLoaded', () => updateConnectivityUI(false));

/* ---------- 8) The filePersonal ---------- */
function refreshProfileExtras() {
  const real = isRealCloudUser();
  const banner = document.getElementById('profileGuestBanner');
  if (banner) banner.hidden = real || !currentUser;
  const pill = document.getElementById('profileSyncPill');
  if (pill) {
    const off = navigator.onLine === false;
    pill.className = 'pf-pill ' + (!real ? 'pf-pill-local' : (off ? 'pf-pill-off' : 'pf-pill-ok'));
    pill.innerHTML = !real ? '<i class="fa-solid fa-mobile-screen"></i>Local on the device  '
      : (off ? '<i class="fa-solid fa-plane"></i>Offline' : '<i class="fa-solid fa-cloud"></i>synchronous');
  }
  const imp = document.getElementById('profileImportTile');
  if (imp) imp.hidden = !(real && guestHasData());
  const lbl = document.getElementById('profileLogoutLabel');
  if (lbl) lbl.textContent = real ? 'Sign out' : 'Exit visitor mode';
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const p = document.getElementById('userProfileModal');
  if (p && !p.classList.contains('hidden')) closeUserProfileModal();
  const g = document.getElementById('guestImportModal');
  if (g && !g.classList.contains('hidden')) closeGuestImportModal(false);
});

/* =========================================================
   V20.4 — "Cash"credit card for computer,Charge machines, control panelManager
   ========================================================= */

/* ---------- KnockPayment: Unification"Cash cash" → "Cash" ---------- */
function normalizePaymentMethod(m) {
  const v = String(m || '').trim();
  if (!v || v === 'Cash cash' || v === 'Cash' || v === 'Cash') return 'Cash';
  return v;
}
function isCashMethod(m) { return normalizePaymentMethod(m) === 'Cash'; }
// In tables: icon"Hand holding money" Next to the wordCash
function payMethodHTML(m) {
  const v = normalizePaymentMethod(m);
  return v === 'Cash'
    ? '<i class="fa-solid fa-hand-holding-dollar pay-cash-ic"></i>Cash  '
    : escapeHTML(v);
}
function walletIconFor(method) {
  if (isCashMethod(method)) return 'fa-hand-holding-dollar';
  if (String(method).includes('InstaPay')) return 'fa-bolt';
  if (String(method).includes('Wallet')) return 'fa-mobile-screen-button';
  if (String(method).includes('Visa')) return 'fa-credit-card';
  return 'fa-wallet';
}

/* ---------- Balance chip on the computer ----------*/
function renderDesktopHero() {
  const hero = document.getElementById('desktopHero');
  if (!hero) return;
  const m = calculateMetrics();
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('dkNet', money(m.available)); set('dkIncome', money(m.income));
  set('dkExpense', money(m.expense)); set('dkCharity', money(m.charity));
  const net = document.getElementById('dkNet');
  if (net) net.classList.toggle('dk-neg', m.available < 0);
  const strip = document.getElementById('desktopWalletsStrip');
  if (!strip) return;
  strip.innerHTML = '';
  const defaults = ['Cash', 'InstaPay', 'Vodafone Cash/Wallet', 'Visa/bank card'];
  Array.from(new Set([...defaults, ...Object.keys(m.wallets)])).forEach(method => {
    const bal = m.wallets[method] || 0;
    const chip = document.createElement('div');
    chip.className = 'ft-wallet-chip' + (isCashMethod(method) ? ' is-cash' : '');
    chip.innerHTML = `
      <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
        <i class="fa-solid ${walletIconFor(method)} text-orange-400"></i>
        <span class="truncate">${escapeHTML(method.split(' ')[0])}</span>
      </div>
      <div class="money-val text-base font-black mt-1.5 ${bal >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-400'}">
        ${money(bal)} <span class="text-[10px] text-slate-400">EGP</span>
      </div>`;
    strip.appendChild(chip);
  });
}
(function hookMetricsForV204() {
  const orig = window.updateMetrics;
  window.updateMetrics = function () {
    const r = orig.apply(this, arguments);
    try { renderDesktopHero(); renderMachineSummaries(); } catch (e) { console.warn(e); }
    return r;
  };
  const origPriv = window.applyPrivacyModeUI;
  window.applyPrivacyModeUI = function () {
    const r = origPriv.apply(this, arguments);
    const icon = document.getElementById('privacyIconDk');
    if (icon) icon.className = isPrivacyMode ? 'fa-solid fa-eye-slash text-rose-500' : 'fa-solid fa-eye text-orange-500';
    return r;
  };
})();

/* ---------- Charge machines ---------- */
const MC_MAX_MACHINES = 25;
const MC_MAX_HISTORY = 60;
let _mcId = null;
let _mcMode = 'add';

function _mcNum(v) { const n = Number(v); return isFinite(n) ? Math.round(Math.max(-1e9, Math.min(1e9, n)) * 100) / 100 : 0; }
function _mcHid() { return 'h-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function sanitizeMachines(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, MC_MAX_MACHINES).map(m => {
    if (!m || typeof m !== 'object') return null;
    const history = (Array.isArray(m.history) ? m.history : []).slice(0, MC_MAX_HISTORY).map(e => ({
      id: String((e && e.id) || _mcHid()).slice(0, 40),
      ts: Number(e && e.ts) || 0,
      type: ['create', 'add', 'sub', 'set', 'rename'].includes(e && e.type) ? e.type : 'set',
      delta: _mcNum(e && e.delta), before: _mcNum(e && e.before), after: _mcNum(e && e.after),
      note: sanitizeString((e && e.note) || '', 120)
    })).filter(e => e.ts > 0);
    return {
      id: String(m.id || ('mc-' + Date.now().toString(36))).slice(0, 40),
      name: sanitizeString(m.name || 'Machine', 60) || 'Machine',
      balance: _mcNum(m.balance),
      createdAt: Number(m.createdAt) || Date.now(),
      _updatedAt: Number(m._updatedAt) || Date.now(),
      history
    };
  }).filter(Boolean);
}
function loadChargeMachines() { chargeMachines = sanitizeMachines(_safeJSON(lsGet(CHARGE_KEY), [])); }
function saveChargeMachines() {
  lsSet(CHARGE_KEY, JSON.stringify(chargeMachines));
  if (isRealCloudUser()) syncToCloud();
  renderMachineSummaries();
}
function mcTotal() { return _mcNum(chargeMachines.reduce((s, m) => s + m.balance, 0)); }
function _mcCountLabel(n) { return n === 1 ? 'One machine' : n === 2 ? 'Two machines' : (n >= 3 && n <= 10) ? n + 'EGP   ' : n + 'Enabled  '; }
function _mcFmtDate(ts) {
  try { return new Date(ts).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
  catch (e) { return ''; }
}
function renderMachineSummaries() {
  const n = chargeMachines.length;
  document.querySelectorAll('.js-mc-total').forEach(e => { e.textContent = money(mcTotal()); });
  document.querySelectorAll('.js-mc-sub').forEach(e => { e.textContent = n ? _mcCountLabel(n) : 'Click to add the first machine'; });
}
function _mcFind() { return chargeMachines.find(m => m.id === _mcId) || null; }

function openChargeMachines() {
  if (!requireAuth()) return;
  if (typeof closeMenus === 'function') closeMenus();
  mcShowList();
  const m = document.getElementById('machinesModal');
  m.classList.remove('hidden'); m.classList.add('flex');
}
function closeChargeMachines() {
  const m = document.getElementById('machinesModal');
  if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  _mcId = null;
}
function mcShowList() {
  _mcId = null;
  document.getElementById('mcListView').hidden = false;
  document.getElementById('mcDetailView').hidden = true;
  document.getElementById('mcBack').hidden = true;
  document.getElementById('mcTitle').textContent = 'Charge machines';
  mcRenderList();
}
function mcRenderList() {
  document.getElementById('mcTotal').textContent = money(mcTotal());
  document.getElementById('mcCountLine').textContent = chargeMachines.length ? _mcCountLabel(chargeMachines.length) : 'There is no possibility yet';
  const list = document.getElementById('mcList');
  const empty = document.getElementById('mcEmpty');
  list.replaceChildren();
  empty.hidden = chargeMachines.length > 0;
  chargeMachines.forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mc-item';
    btn.addEventListener('click', () => mcOpenDetail(m.id));
    const last = m.history[0] ? _mcFmtDate(m.history[0].ts) : _mcFmtDate(m.createdAt);
    btn.innerHTML = `<span class="mc-item-ic"><i class="fa-solid fa-bolt"></i></span>
      <span class="mc-item-tx"><b></b><small>lastUpdate: ${escapeHTML(last)}</small></span>
      <span class="mc-item-bal money-val ${m.balance < 0 ? 'neg' : ''}">${money(m.balance)}</span>
      <i class="fa-solid fa-chevron-left mc-item-go"></i>`;
    btn.querySelector('b').textContent = m.name;
    list.appendChild(btn);
  });
}
function mcAddMachine() {
  const nameEl = document.getElementById('mcNewName');
  const balEl = document.getElementById('mcNewBal');
  const name = sanitizeString(nameEl.value, 60);
  if (!name) { showToast('Write the name of the machine', 'error'); nameEl.focus(); return; }
  if (chargeMachines.length >= MC_MAX_MACHINES) { showToast(`reached the maximum (${MC_MAX_MACHINES}machine)`, 'error'); return; }
  if (chargeMachines.some(m => m.name === name)) { showToast('There is a machine with the same name', 'error'); return; }
  const bal = balEl.value === '' ? 0 : _mcNum(balEl.value);
  const now = Date.now();
  chargeMachines.push({
    id: 'mc-' + now.toString(36) + Math.random().toString(36).slice(2, 5),
    name, balance: bal, createdAt: now, _updatedAt: now,
    history: [{ id: _mcHid(), ts: now, type: 'create', delta: bal, before: 0, after: bal, note: '' }]
  });
  saveChargeMachines();
  nameEl.value = ''; balEl.value = '';
  mcRenderList();
  showToast('Machine added ✓', 'success');
}
function mcOpenDetail(id) {
  _mcId = id;
  if (!_mcFind()) { mcShowList(); return; }
  document.getElementById('mcListView').hidden = true;
  document.getElementById('mcDetailView').hidden = false;
  document.getElementById('mcBack').hidden = false;
  _mcMode = 'add';
  document.getElementById('mcAmount').value = '';
  document.getElementById('mcNote').value = '';
  mcRenderDetail();
}
function mcSetMode(mode) {
  _mcMode = mode;
  document.querySelectorAll('.mc-seg button').forEach(b => b.classList.toggle('on', b.getAttribute('data-mode') === mode));
  const lbl = document.getElementById('mcAmountLabel');
  if (lbl) lbl.textContent = mode === 'set' ? 'New balance (final number)' : (mode === 'add' ? 'Amount added' : 'Discounted amount');
}
function mcRenderDetail() {
  const m = _mcFind();
  if (!m) return;
  document.getElementById('mcTitle').textContent = m.name;
  document.getElementById('mcName').value = m.name;
  const bal = document.getElementById('mcBalance');
  bal.textContent = money(m.balance);
  bal.classList.toggle('neg', m.balance < 0);
  document.getElementById('mcMeta').textContent = 'Created ' + _mcFmtDate(m.createdAt);
  mcSetMode(_mcMode);
  const host = document.getElementById('mcHistory');
  host.replaceChildren();
  document.getElementById('mcHistCount').textContent = m.history.length ? `(${m.history.length})` : '';
  if (!m.history.length) {
    const e = document.createElement('div'); e.className = 'mc-hist-empty'; e.textContent = 'There are no modifications yet'; host.appendChild(e);
    return;
  }
  m.history.forEach(e => host.appendChild(_mcHistRow(e)));
}
function _mcHistRow(e) {
  const meta = {
    create: ['fa-star', 'Create the machine'],
    add: ['fa-circle-plus', 'Add balance'],
    sub: ['fa-circle-minus', 'Deducted from the balance'],
    set: ['fa-pen-to-square', e.delta >= 0 ? 'Balance adjustment (increase)' : 'Balance adjustment (decrease)'],
    rename: ['fa-tag', 'Change name']
  }[e.type];
  const row = document.createElement('div');
  row.className = 'mc-h mc-h-' + e.type;
  const ic = document.createElement('span'); ic.className = 'mc-h-ic'; ic.innerHTML = `<i class="fa-solid ${meta[0]}"></i>`;
  const body = document.createElement('div'); body.className = 'mc-h-body';
  const t = document.createElement('b'); t.textContent = meta[1];
  const sub = document.createElement('small');
  let line = _mcFmtDate(e.ts);
  if (e.type === 'rename') line += ' • ' + e.note;
  else if (e.type !== 'create') line += `• Who   ${money(e.before)}To   ${money(e.after)}`;
  else line += `Machine  • With an opening balance   ${money(e.after)}`;
  if (e.type !== 'rename' && e.note) line += ' • ' + e.note;
  sub.textContent = line;
  body.append(t, sub);
  const chip = document.createElement('span');
  chip.className = 'mc-h-delta ' + (e.delta > 0 ? 'up' : e.delta < 0 ? 'down' : 'zero');
  chip.textContent = e.type === 'rename' ? '—' : (e.delta > 0 ? '+' : e.delta < 0 ? '−' : '') + money(Math.abs(e.delta));
  row.append(ic, body, chip);
  return row;
}
function mcApplyOp() {
  const m = _mcFind(); if (!m) return;
  const raw = document.getElementById('mcAmount').value;
  const amt = Number(raw);
  if (raw === '' || !isFinite(amt) || amt < 0 || amt > 1e9 || (_mcMode !== 'set' && amt === 0)) {
    showToast('Type the correct amount', 'error'); return;
  }
  const before = m.balance;
  const after = _mcNum(_mcMode === 'add' ? before + amt : _mcMode === 'sub' ? before - amt : amt);
  const delta = _mcNum(after - before);
  if (_mcMode === 'set' && delta === 0) { showToast('This is the same as the current balance', 'info'); return; }
  const now = Date.now();
  m.balance = after; m._updatedAt = now;
  m.history.unshift({ id: _mcHid(), ts: now, type: _mcMode, delta, before, after, note: sanitizeString(document.getElementById('mcNote').value, 120) });
  if (m.history.length > MC_MAX_HISTORY) m.history.length = MC_MAX_HISTORY;
  saveChargeMachines();
  document.getElementById('mcAmount').value = ''; document.getElementById('mcNote').value = '';
  mcRenderDetail();
  showToast(_mcMode === 'set' ? 'The balance has been modified and recorded in the register ✓' : (_mcMode === 'add' ? 'Added ✓' : 'Discounted ✓'), 'success');
}
function mcRenameCurrent() {
  const m = _mcFind(); if (!m) return;
  const name = sanitizeString(document.getElementById('mcName').value, 60);
  if (!name || name === m.name) { document.getElementById('mcName').value = m.name; return; }
  if (chargeMachines.some(x => x.id !== m.id && x.name === name)) { showToast('There is a machine with the same name', 'error'); return; }
  const now = Date.now();
  m.history.unshift({ id: _mcHid(), ts: now, type: 'rename', delta: 0, before: m.balance, after: m.balance, note: `From «${m.name}» to «${name}»` });
  if (m.history.length > MC_MAX_HISTORY) m.history.length = MC_MAX_HISTORY;
  m.name = name; m._updatedAt = now;
  saveChargeMachines(); mcRenderDetail();
  showToast('Name changed ✓', 'success');
}
function mcDeleteCurrent() {
  const m = _mcFind(); if (!m) return;
  openConfirm('Delete the machine?', `The machine will be removed<b>${escapeHTML(m.name)}</b>Record it completely and you will not be able to return it.`, () => {
    chargeMachines = chargeMachines.filter(x => x.id !== m.id);
    saveChargeMachines(); mcShowList();
    showToast('The machine has been deleted', 'info');
  });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const mm = document.getElementById('machinesModal');
    if (mm && !mm.classList.contains('hidden') && !(document.getElementById('confirmModal') && !document.getElementById('confirmModal').classList.contains('hidden'))) {
      if (_mcId) mcShowList(); else closeChargeMachines();
    }
  }
  if (e.key === 'Enter' && e.target && e.target.id) {
    if (e.target.id === 'mcNewName' || e.target.id === 'mcNewBal') { e.preventDefault(); mcAddMachine(); }
    else if (e.target.id === 'mcAmount' || e.target.id === 'mcNote') { e.preventDefault(); mcApplyOp(); }
    else if (e.target.id === 'mcName') { e.preventDefault(); mcRenameCurrent(); }
  }
});

/* ---------- Account statusSuspended ---------- */
function showSuspendedScreen(reason) {
  window._accountSuspended = true;
  const el = document.getElementById('suspendedScreen');
  const r = document.getElementById('susReason');
  if (r) r.textContent = reason ? ('Reason: ' + reason) : 'Contact management for details.';
  if (el) el.hidden = false;
  if (typeof hideLoginWall === 'function') hideLoginWall();
}
function hideSuspendedScreen() {
  window._accountSuspended = false;
  const el = document.getElementById('suspendedScreen');
  if (el) el.hidden = true;
}

/* =========================================================
   The control panelManager (V2): Overview + Useryen+ User details
   ========================================================= */
let admUsers = [];
let admUsersLoaded = false;
let admUsersStale = true;
let admRoleFilter = 'all';
let admStatusFilter = 'all';
let admSort = 'lastLogin';
let admShown = 80;
let admCurrentUid = null;

const ADM_TABS = ['overview', 'users', 'requests', 'permissions'];
const ADM_TAB_IDS = { overview: ['adminTabOverview', 'adminPanelOverview'], users: ['adminTabUsers', 'adminPanelUsers'],
  requests: ['adminTabRequests', 'adminPanelRequests'], permissions: ['adminTabPerms', 'adminPanelPerms'] };
const ADM_TAB_TITLES = { overview: 'Overview', users: 'Users', requests: 'Customer requests', permissions: 'Role permissions' };

function _admDate(v) { try { return v && v.toDate ? v.toDate() : (v instanceof Date ? v : null); } catch (e) { return null; } }
function _admFmt(d) { return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; }
function _admFmtFull(d) { return d ? d.toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }
function _admAgo(d) {
  if (!d) return 'Not logged in';
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `Who   ${days}day  `;
  if (days < 365) return `Who   ${Math.floor(days / 30)}A month  `;
  return `Who   ${Math.floor(days / 365)}year`;
}
function _admEl(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

async function admEnsureUsers(force) {
  if (admUsersLoaded && !admUsersStale && !force) return;
  const snap = await db.collection('users').get();
  admUsers = snap.docs.map(doc => {
    const data = doc.data() || {};
    const email = (data.email || '').toLowerCase().trim();
    const role = ROLES_META[data.role] ? data.role : 'free';
    return {
      id: doc.id, data, email, role,
      name: data.displayName || '', phone: data.phoneNumber || '',
      isSuper: isSuperAdminEmail(email) || data.isSuperAdmin === true,
      disabled: data.disabled === true,
      created: _admDate(data.createdAt), lastLogin: _admDate(data.lastLoginAt), synced: _admDate(data.updatedAt),
      hasOverride: !!(data.permissionsOverride && Object.keys(data.permissionsOverride).length)
    };
  });
  admUsersLoaded = true; admUsersStale = false;
}
function _admStatus(u) {
  if (u.disabled) return 'suspended';
  if (!u.lastLogin) return 'idle';
  const days = (Date.now() - u.lastLogin.getTime()) / 864e5;
  return days <= 7 ? 'active' : (days <= 30 ? 'month' : 'idle');
}
const ADM_STATUS_META = {
  active: ['Active', 'ok'], month: ['Active this month', 'info'], idle: ['Inactive', 'mut'], suspended: ['Suspended', 'bad']
};

function switchAdminTab(tab) {
  if (!ADM_TABS.includes(tab)) tab = 'overview';
  adminActiveTab = tab;
  ADM_TABS.forEach(t => {
    const [bId, pId] = ADM_TAB_IDS[t];
    const b = document.getElementById(bId), p = document.getElementById(pId);
    if (b) { b.classList.toggle('on', t === tab); b.setAttribute('aria-selected', t === tab ? 'true' : 'false'); }
    if (p) p.hidden = t !== tab;
  });
  const title = document.getElementById('admTitle');
  if (title) title.textContent = ADM_TAB_TITLES[tab];
  admCloseUser();
  if (tab === 'overview') renderAdminOverview();
  else if (tab === 'users') renderUsersList();
  else if (tab === 'requests') renderAdminRequests();
  else if (tab === 'permissions') renderPermissionsEditor();
}
async function admRefresh() {
  admUsersStale = true;
  const b = document.getElementById('admRefreshBtn');
  if (b) b.classList.add('spin');
  try { switchAdminTab(adminActiveTab); } finally { setTimeout(() => b && b.classList.remove('spin'), 700); }
}

async function renderAdminOverview() {
  const host = document.getElementById('admOverview');
  host.replaceChildren(_admEl('div', 'adm-loading', 'Loading...'));
  try { await admEnsureUsers(); } catch (e) { host.replaceChildren(_admEl('div', 'adm-loading err', 'Unable to load data (check administrator privileges)')); return; }
  const now = Date.now(), DAY = 864e5;
  const total = admUsers.length;
  const active7 = admUsers.filter(u => u.lastLogin && now - u.lastLogin.getTime() <= 7 * DAY).length;
  const new7 = admUsers.filter(u => u.created && now - u.created.getTime() <= 7 * DAY).length;
  const suspended = admUsers.filter(u => u.disabled).length;
  const pendingBadge = document.getElementById('pendingReqBadge');
  const pending = pendingBadge ? Number(pendingBadge.textContent) || 0 : 0;

  host.replaceChildren();
  const stats = _admEl('div', 'adm-stats');
  [['fa-users', 'Total users', total, '#06b6d4'], ['fa-bolt', 'Active last 7 days', active7, '#10b981'],
   ['fa-user-plus', 'Joined last 7 days', new7, '#f97316'], ['fa-user-lock', 'Suspended accounts', suspended, '#f43f5e'],
   ['fa-clock-rotate-left', 'Pending customer orders', pending, '#f59e0b']].forEach(([ic, label, val, c]) => {
    const card = _admEl('div', 'adm-stat'); card.style.setProperty('--c', c);
    card.innerHTML = `<span class="adm-stat-ic"><i class="fa-solid ${ic}"></i></span><div><b></b><small></small></div>`;
    card.querySelector('b').textContent = val; card.querySelector('small').textContent = label;
    stats.appendChild(card);
  });
  host.appendChild(stats);

  const grid = _admEl('div', 'adm-grid2');
  // Distribution of roles
  const roles = _admEl('div', 'adm-card'); roles.appendChild(_admEl('h4', 'adm-h', 'Distribution of roles'));
  Object.keys(ROLES_META).forEach(r => {
    const n = admUsers.filter(u => u.role === r).length; if (!n && r !== 'free') return;
    const row = _admEl('div', 'adm-bar-row');
    const pct = total ? Math.round((n / total) * 100) : 0;
    row.innerHTML = `<span class="adm-bar-l"></span><div class="adm-bar"><i style="width:${pct}%"></i></div><span class="adm-bar-n">${n}</span>`;
    row.querySelector('.adm-bar-l').textContent = ROLES_META[r].name;
    roles.appendChild(row);
  });
  grid.appendChild(roles);
  // Registrations last 14 days
  const chart = _admEl('div', 'adm-card'); chart.appendChild(_admEl('h4', 'adm-h', 'New registrations (last 14 days)'));
  const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d); }
  const counts = days.map(d => admUsers.filter(u => u.created && u.created >= d && u.created < new Date(d.getTime() + DAY)).length);
  const max = Math.max(1, ...counts);
  const bars = _admEl('div', 'adm-spark');
  counts.forEach((n, i) => {
    const b = _admEl('div', 'adm-spark-b'); b.title = `${days[i].toLocaleDateString('en-US')}: ${n}`;
    b.innerHTML = `<i style="height:${Math.max(4, (n / max) * 100)}%"></i><small>${days[i].getDate()}</small>`;
    bars.appendChild(b);
  });
  chart.appendChild(bars); grid.appendChild(chart);
  host.appendChild(grid);

  const recent = _admEl('div', 'adm-card'); recent.appendChild(_admEl('h4', 'adm-h', 'Latest joiners'));
  const latest = admUsers.filter(u => u.created).sort((a, b) => b.created - a.created).slice(0, 6);
  if (!latest.length) recent.appendChild(_admEl('div', 'adm-empty', 'There is no registration data'));
  latest.forEach(u => recent.appendChild(_admUserRow(u, true)));
  host.appendChild(recent);
}

function _admAvatar(u) {
  const a = _admEl('span', 'adm-av' + (u.isSuper ? ' super' : ''));
  const ch = (u.name || u.email || u.phone || '?').trim().charAt(0).toUpperCase();
  a.textContent = ch || '?';
  return a;
}
function _admUserRow(u, compact) {
  const row = _admEl('button', 'adm-row' + (compact ? ' compact' : '') + (u.disabled ? ' off' : ''));
  row.type = 'button';
  row.addEventListener('click', () => admOpenUser(u.id));
  const main = _admEl('div', 'adm-row-main');
  const name = _admEl('div', 'adm-row-name');
  name.append(_admEl('span', '', u.name || 'Unnamed'));
  if (u.isSuper) name.append(_admEl('em', 'adm-tag gold', 'Super'));
  if (u.hasOverride) name.append(_admEl('em', 'adm-tag cyan', 'Special powers'));
  if (u.id === (currentUser && currentUser.uid)) name.append(_admEl('em', 'adm-tag', 'You'));
  main.append(name, _admEl('small', '', u.email || (u.phone ? '📱 ' + u.phone : 'No ID')));
  row.append(_admAvatar(u), main);
  if (!compact) {
    const role = _admEl('span', 'adm-role r-' + u.role, ROLES_META[u.role].name);
    const [stTxt, stCls] = ADM_STATUS_META[_admStatus(u)];
    const st = _admEl('span', 'adm-st st-' + stCls, stTxt);
    const last = _admEl('span', 'adm-last', _admAgo(u.lastLogin));
    row.append(role, st, last);
  } else {
    row.append(_admEl('span', 'adm-last', _admFmt(u.created)));
  }
  row.append(Object.assign(document.createElement('i'), { className: 'fa-solid fa-chevron-left adm-go' }));
  return row;
}

async function renderUsersList() {
  const container = document.getElementById('usersList');
  const count = document.getElementById('usersSearchCount');
  container.replaceChildren(_admEl('div', 'adm-loading', 'Loading...'));
  try { await admEnsureUsers(); }
  catch (e) { container.replaceChildren(_admEl('div', 'adm-loading err', 'Error loading users')); return; }
  const q = ((document.getElementById('usersSearchInput') || {}).value || '').trim().toLowerCase();
  let list = admUsers.filter(u => {
    if (admRoleFilter !== 'all' && u.role !== admRoleFilter) return false;
    if (admStatusFilter !== 'all' && _admStatus(u) !== admStatusFilter) return false;
    if (!q) return true;
    return u.email.includes(q) || u.name.toLowerCase().includes(q) || u.phone.toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
  });
  const key = { lastLogin: u => -(u.lastLogin ? u.lastLogin.getTime() : 0), created: u => -(u.created ? u.created.getTime() : 0),
    name: u => (u.name || u.email || '').toLowerCase() }[admSort];
  list.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
  list.sort((a, b) => (b.isSuper - a.isSuper));
  if (count) count.textContent = `${list.length}Who   ${admUsers.length}User  `;
  // Filter strips
  const chips = document.getElementById('admRoleChips');
  if (chips) {
    chips.replaceChildren();
    [['all', 'All']].concat(Object.keys(ROLES_META).map(r => [r, ROLES_META[r].name])).forEach(([k, label]) => {
      const n = k === 'all' ? admUsers.length : admUsers.filter(u => u.role === k).length;
      const b = _admEl('button', 'adm-chip' + (admRoleFilter === k ? ' on' : ''), `${label} ${n}`);
      b.type = 'button'; b.addEventListener('click', () => { admRoleFilter = k; admShown = 80; renderUsersList(); });
      chips.appendChild(b);
    });
  }
  container.replaceChildren();
  if (!list.length) { container.appendChild(_admEl('div', 'adm-empty', 'No matching results found')); return; }
  list.slice(0, admShown).forEach(u => container.appendChild(_admUserRow(u, false)));
  if (list.length > admShown) {
    const more = _admEl('button', 'adm-more', `Show more (${list.length - admShown})`);
    more.type = 'button'; more.addEventListener('click', () => { admShown += 80; renderUsersList(); });
    container.appendChild(more);
  }
}
function filterUsersList() { admShown = 80; renderUsersList(); }
function admSetStatusFilter(v) { admStatusFilter = v; admShown = 80; renderUsersList(); }
function admSetSort(v) { admSort = v; renderUsersList(); }

function admExportUsersCSV() {
  if (!admUsers.length) { showToast('No data', 'error'); return; }
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['Name', 'mail', 'Phone', 'The role', 'Status', 'Creation date', 'Last entry', 'UID']]
    .concat(admUsers.map(u => [u.name, u.email, u.phone, ROLES_META[u.role].name, ADM_STATUS_META[_admStatus(u)][0], _admFmt(u.created), _admFmt(u.lastLogin), u.id]));
  const blob = new Blob(['\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `users_${todayString()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- User details ---------- */
async function admLog(action, uid, details) { return admWriteAudit(action, uid, details); }
function _admErrText(e, base) {
  const c = e && e.code;
  if (c === 'permission-denied') return base + ': New rules (admin_audit / admin_notes) You haven’t posted yetFirebase';
  if (c === 'unavailable') return base + ': There is no internet connection';
  if (c === 'failed-precondition') return base + ': Firestore I need an index (Index) — Open theConsole See the link in the error message';
  return base + (c ? ` (${c})` : '');
}
function admCloseUser() {
  if (typeof admCloseFullAccess === 'function') admCloseFullAccess();
  admCurrentUid = null;
  const d = document.getElementById('admUserDrawer');
  if (d) d.classList.remove('open');
  const m = document.getElementById('adminModal'); if (m) m.classList.remove('drawer-open');
}
async function admOpenUser(uid) {
  admCurrentUid = uid;
  try { await admEnsureUsers(); } catch (e) {}
  const u = admUsers.find(x => x.id === uid);
  if (!u) { showToast('User not found', 'error'); return; }
  const d = document.getElementById('admUserDrawer');
  d.classList.add('open');
  document.getElementById('adminModal').classList.add('drawer-open');
  admRenderDrawer(u);
  admLoadNote(uid); admLoadActivity(uid);
}
function admRenderDrawer(u) {
  const me = currentUser && u.id === currentUser.uid;
  const locked = me || u.isSuper;                       // There is no adjustment for yourselfOr onSuper Admin
  const adminLock = u.role === 'admin'&& !isSuperAdmin; // A normal admin cannot modify another admin  
  const head = document.getElementById('admDrawerHead');
  head.replaceChildren();
  const av = _admAvatar(u); av.classList.add('lg');
  const who = _admEl('div', 'adm-d-who');
  who.append(_admEl('b', '', u.name || 'Unnamed'), _admEl('small', '', u.email || u.phone || 'No ID'));
  const [stTxt, stCls] = ADM_STATUS_META[_admStatus(u)];
  const pills = _admEl('div', 'adm-d-pills');
  pills.append(_admEl('span', 'adm-role r-' + u.role, ROLES_META[u.role].name), _admEl('span', 'adm-st st-' + stCls, stTxt));
  if (u.isSuper) pills.append(_admEl('em', 'adm-tag gold', 'Super Admin'));
  who.appendChild(pills);
  head.append(av, who);

  const info = document.getElementById('admDrawerInfo');
  info.replaceChildren();
  const dd = u.data;
  const loginMethod = { google: 'Google', email: 'Email and password', phone: 'phone number' }[dd.loginMethod] || '—';
  const cnt = v => Array.isArray(v) ? v.length : '—';
  [['Creation date', _admFmt(u.created)], ['Last entry', _admFmtFull(u.lastLogin) + (u.lastLogin ? ` (${_admAgo(u.lastLogin)})` : '')],
   ['Last sync', _admFmtFull(u.synced)], ['Login method', loginMethod],
   ['numberTransactions', typeof dd.txCount === 'number' ? dd.txCount : '—'], ['VarietiesThe store', cnt(dd.inventory)],
   ['Charge machines', cnt(dd.chargeMachines)], ['Monthly budget', dd.budget ? money(dd.budget) + ' EGP' : '—']
  ].forEach(([k, v]) => { const c = _admEl('div', 'adm-kv'); c.append(_admEl('small', '', k), _admEl('b', '', String(v))); info.appendChild(c); });
  const uidRow = _admEl('div', 'adm-kv wide');
  const uidB = _admEl('b', 'mono', u.id);
  const cp = _admEl('button', 'adm-mini', 'copies'); cp.type = 'button'; cp.addEventListener('click', () => admCopy(u.id));
  uidRow.append(_admEl('small', '', 'UID'), uidB, cp); info.appendChild(uidRow);

  // Control
  const roleSel = document.getElementById('admRoleSelect');
  roleSel.replaceChildren();
  Object.keys(ROLES_META).forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = ROLES_META[r].name; if (r === u.role) o.selected = true; roleSel.appendChild(o); });
  roleSel.disabled = locked || adminLock;
  document.getElementById('admRoleSave').disabled = locked || adminLock;
  document.getElementById('admPermBtn').disabled = locked || adminLock;
  const sus = document.getElementById('admSuspendBtn');
  sus.disabled = locked || adminLock;
  sus.className = 'adm-btn ' + (u.disabled ? 'ok' : 'bad');
  sus.innerHTML = u.disabled ? '<i class="fa-solid fa-lock-open"></i> Reactivate the account' : '<i class="fa-solid fa-user-lock"></i> Account suspension';
  const reasonWrap = document.getElementById('admReasonWrap');
  reasonWrap.hidden = u.disabled || locked;
  document.getElementById('admReason').value = '';
  const warn = document.getElementById('admDrawerNote');
  warn.hidden = !(locked || adminLock);
  warn.textContent = me ? 'This is your account— You cannot change your roleOr Stop yourself.' : u.isSuper ? 'Super Admin Protected from any modification.' : 'A normal admin cannot modify another admin.';
  if (u.disabled && dd.disabledReason) {
    warn.hidden = false; warn.textContent = 'Reason for suspension:' + dd.disabledReason;
  }
  document.getElementById('admEmailCopy').onclick = () => admCopy(u.email || u.phone || u.id);
  const fullBtn = document.getElementById('admFullAccessBtn');
  if (fullBtn) fullBtn.hidden = !isSuperAdmin;
  const viewBtn = document.getElementById('admViewAsBtn');
  if (viewBtn) viewBtn.hidden = !isSuperAdmin || (!!currentUser && u.id === currentUser.uid);
}
function admCopy(text) {
  const done = () => showToast('Copied✓', 'success');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => showToast('Unable to copy', 'error'));
  else { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { showToast('Unable to copy', 'error'); } t.remove(); }
}
async function admSaveRole() {
  const u = admUsers.find(x => x.id === admCurrentUid); if (!u) return;
  const next = document.getElementById('admRoleSelect').value;
  if (next === u.role) { showToast('The role As it is', 'info'); return; }
  await changeUserRole(u.id, next);
}
function admOpenPerms() { if (admCurrentUid) openUserPermissionsModal(admCurrentUid); }
function admToggleSuspend() {
  const u = admUsers.find(x => x.id === admCurrentUid); if (!u) return;
  if (u.isSuper || u.id === currentUser.uid) return;
  const reactivating = u.disabled;
  const reason = sanitizeString(document.getElementById('admReason').value, 200);
  openConfirm(reactivating ? 'Reactivate the account?' : 'Account suspended?',
    reactivating ? `He will come back<b>${escapeHTML(u.name || u.email || 'theUser')}</b>He can use the application again.`  
                 : `<b>${escapeHTML(u.name || u.email || 'theUser')}</b>You will be prevented from using the application until you activate it again.`,  
    async () => {
      try {
        const patch = reactivating
          ? { disabled: false, disabledReason: null, disabledAt: null, disabledBy: null }
          : { disabled: true, disabledReason: reason || null, disabledAt: firebase.firestore.FieldValue.serverTimestamp(), disabledBy: currentUser.uid };
        await db.collection('users').doc(u.id).update(patch);
        admLog(reactivating ? 'unsuspend' : 'suspend', u.id, { reason: reason || '' });
        admUsersStale = true;
        showToast(reactivating ? 'The account has been reactivated✓' : 'The account has been suspended✓', 'success');
        await admEnsureUsers(true);
        const fresh = admUsers.find(x => x.id === u.id); if (fresh) admRenderDrawer(fresh);
        admLoadActivity(u.id);
        if (adminActiveTab === 'users') renderUsersList(); else if (adminActiveTab === 'overview') renderAdminOverview();
      } catch (e) { showToast('Execution failedTransaction', 'error'); }
    });
}
async function admLoadNote(uid) {
  const ta = document.getElementById('admNote'); ta.value = ''; ta.disabled = true;
  document.getElementById('admNoteStatus').textContent = '';
  try {
    const doc = await db.collection('admin_notes').doc(uid).get();
    if (admCurrentUid !== uid) return;
    ta.value = doc.exists ? (doc.data().text || '') : '';
    ta.disabled = false;
  } catch (e) {
    document.getElementById('admNoteStatus').textContent = _admErrText(e, 'Unable todownload Observation'); console.warn('admin_notes read failed:', e.code, e.message);
  }
}
async function admSaveNote() {
  const uid = admCurrentUid; if (!uid) return;
  const text = sanitizeString(document.getElementById('admNote').value, 1000);
  const st = document.getElementById('admNoteStatus');
  try {
    await db.collection('admin_notes').doc(uid).set({ text, by: currentUser.uid, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    st.textContent = 'DoneSave ✓';
    admLog('note', uid, {});
  } catch (e) { st.textContent = _admErrText(e, 'Unable toSave'); console.warn('admin_notes write failed:', e.code, e.message); }
}
const ADM_ACTION_LABELS = { role_change: 'Role changed', suspend: 'Account suspended', unsuspend: 'Account reactivated', permissions: 'Permissions updated', note: 'Note updated', open_full_access: 'Opened full access', view_full_access: 'Viewed document', save_full_access: 'Updated document', delete_full_access: 'Deleted document', create_full_access: 'Created document', export_full_access: 'Exported documents', open_view_as: 'Opened account as owner', close_view_as: 'Returned from account view', edit_as_owner: 'Edit during account view' };
async function admLoadActivity(uid) {
  const host = document.getElementById('admActivity');
  host.replaceChildren(_admEl('div', 'adm-loading', 'Loading...'));
  try {
    const snap = await db.collection('admin_audit').where('uid', '==', uid).limit(40).get();
    if (admCurrentUid !== uid) return;
    const items = snap.docs.map(d => d.data()).sort((a, b) => ((b.ts && b.ts.seconds) || 0) - ((a.ts && a.ts.seconds) || 0)).slice(0, 15);
    host.replaceChildren();
    if (!items.length) { host.appendChild(_admEl('div', 'adm-empty', 'NothingActions Registered administration')); return; }
    items.forEach(it => {
      const row = _admEl('div', 'adm-act');
      let extra = '';
      if (it.action === 'role_change' && it.details) extra = ` (${(ROLES_META[it.details.from] || {}).name || '—'} ← ${(ROLES_META[it.details.to] || {}).name || '—'})`;
      if ((it.action === 'suspend') && it.details && it.details.reason) extra = ` — ${it.details.reason}`;
      row.append(_admEl('b', '', (ADM_ACTION_LABELS[it.action] || it.action) + extra),
        _admEl('small', '', `${_admFmtFull(_admDate(it.ts))} • ${it.byEmail || ''}`));
      host.appendChild(row);
    });
  } catch (e) { host.replaceChildren(_admEl('div', 'adm-empty', _admErrText(e, 'Unable todownload Record theActions'))); console.warn('admin_audit read failed:', e.code, e.message); }
}


/* ---------- v20.10.5/v20.10.6 — Super admin data access + account view ---------- */
const ADMX = {
  noAccess: "Super admins only 🛡️",
  title: "Full data access",
  warning: "Super admin mode: you can view, edit and delete any document. Every action is written to the audit log.",
  userLabel: "User",
  collection: "Collection",
  newId: "New document ID (blank = auto)",
  add: "Add document",
  export: "Export JSON",
  refresh: "Refresh",
  docs: "Documents",
  noDocs: "No documents in this collection",
  editor: "Document content (JSON)",
  status: "Status",
  save: "Save document",
  delete: "Delete document",
  saved: "Document saved ✓",
  deleted: "Document deleted ✓",
  created: "Document created ✓",
  exported: "JSON exported ✓",
  invalidJson: "Invalid JSON",
  invalidData: "Content must be a JSON object",
  profileCreate: "The user profile already exists — open it and edit it here.",
  deleteAsk: "Delete this document permanently?",
  deleteBody: "<b>{id}</b> will be deleted from <b>{col}</b>. This action will be logged.",
  openLog: "Opened full access",
  viewLog: "Viewed document",
  saveLog: "Updated document",
  deleteLog: "Deleted document",
  createLog: "Created document",
  exportLog: "Exported documents",
  fullBtn: "Open full data (super admin)",
  cols: {"profile": "User profile", "transactions": "Transactions", "members": "Team members", "memberships": "Memberships", "portal_index": "Portal index", "security": "PIN lock", "requests": "Client requests", "client_portals": "Client portals", "admin_notes": "Admin notes"}
};
const ADM_EXPLORE_COLS = ['profile','transactions','members','memberships','portal_index','security','requests','client_portals','admin_notes'];
let admExploreUid = null;
let admExploreCol = 'profile';
let admExploreDocs = [];
let admExploreCurrent = null;

function _admJson(v) {
  if (v && typeof v.toDate === 'function') { try { return v.toDate().toISOString(); } catch (e) {} }
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(_admJson);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach(k => { out[k] = _admJson(v[k]); });
    return out;
  }
  return v;
}
function _admExploreRef(uid, col) {
  if (col === 'profile') return db.collection('users').doc(uid);
  if (col === 'admin_notes') return db.collection('admin_notes').doc(uid);
  if (col === 'client_portals') return db.collection('client_portals');
  return db.collection('users').doc(uid).collection(col);
}
function admCloseFullAccess() {
  const wrap = document.getElementById('admFullAccess');
  if (wrap) wrap.hidden = true;
  const drawer = document.getElementById('admUserDrawer');
  if (drawer) drawer.classList.remove('full-access');
  admExploreUid = null;
  admExploreCurrent = null;
  admExploreDocs = [];
}
function admOpenFullAccess() {
  if (!isSuperAdmin) { admCloseFullAccess(); showToast(ADMX.noAccess, 'error'); return; }
  if (!admCurrentUid) return;
  admExploreUid = admCurrentUid;
  admExploreCol = 'profile';
  admExploreCurrent = null;
  const wrap = document.getElementById('admFullAccess');
  const drawer = document.getElementById('admUserDrawer');
  if (!wrap || !drawer) return;
  wrap.hidden = false;
  drawer.classList.add('full-access');
  const u = admUsers.find(x => x.id === admExploreUid);
  const label = document.getElementById('admExpUser');
  if (label) label.textContent = ADMX.userLabel + ': ' + ((u && (u.name || u.email)) || admExploreUid);
  const sel = document.getElementById('admExpCol');
  if (sel) {
    sel.replaceChildren();
    ADM_EXPLORE_COLS.forEach(col => {
      const o = document.createElement('option');
      o.value = col;
      o.textContent = (ADMX.cols[col] || col) + '  ·  ' + col;
      sel.appendChild(o);
    });
    sel.value = admExploreCol;
  }
  const status = document.getElementById('admExpStatus');
  if (status) status.textContent = '';
  const editorWrap = document.getElementById('admExpEditorWrap');
  if (editorWrap) editorWrap.hidden = true;
  admLog(ADMX.openLog, admExploreUid, {});
  admLoadExplorerDocs();
}
function admExplorerChangeCol(col) {
  if (!ADM_EXPLORE_COLS.includes(col)) return;
  admExploreCol = col;
  admExploreCurrent = null;
  const editorWrap = document.getElementById('admExpEditorWrap');
  if (editorWrap) editorWrap.hidden = true;
  admLoadExplorerDocs();
}
async function admLoadExplorerDocs() {
  if (!admExploreUid || !isSuperAdmin) return;
  const host = document.getElementById('admExpDocs');
  if (!host) return;
  host.replaceChildren(_admEl('div', 'adm-loading', '...'));
  try {
    let docs = [];
    if (admExploreCol === 'profile' || admExploreCol === 'admin_notes') {
      const d = await _admExploreRef(admExploreUid, admExploreCol).get();
      if (d.exists) docs = [d];
    } else if (admExploreCol === 'client_portals') {
      const snap = await db.collection('client_portals').where('ownerUid', '==', admExploreUid).get();
      docs = snap.docs.slice();
    } else {
      const snap = await db.collection('users').doc(admExploreUid).collection(admExploreCol).get();
      docs = snap.docs.slice();
    }
    admExploreDocs = docs;
    host.replaceChildren();
    if (!docs.length) { host.appendChild(_admEl('div', 'adm-empty', ADMX.noDocs)); return; }
    docs.forEach(d => {
      const row = _admEl('button', 'adm-exp-doc' + (admExploreCurrent && admExploreCurrent.id === d.id ? ' on' : ''));
      row.type = 'button';
      const data = d.data() || {};
      let preview = '';
      try { preview = JSON.stringify(_admJson(data)).slice(0, 90); } catch (e) { preview = ''; }
      row.append(_admEl('b', '', d.id), _admEl('small', '', preview));
      row.addEventListener('click', () => {
        admSelectExplorerDoc(d);
        admLog(ADMX.viewLog, admExploreUid, { collection: admExploreCol, docId: d.id });
      });
      host.appendChild(row);
    });
  } catch (e) {
    host.replaceChildren(_admEl('div', 'adm-empty err', _admErrText(e, 'Load failed')));
  }
}
function admSelectExplorerDoc(doc) {
  admExploreCurrent = doc;
  const wrap = document.getElementById('admExpEditorWrap');
  const ta = document.getElementById('admExpEditor');
  const id = document.getElementById('admExpDocId');
  const status = document.getElementById('admExpStatus');
  if (!wrap || !ta) return;
  wrap.hidden = false;
  ta.value = JSON.stringify(_admJson(doc.data() || {}), null, 2);
  if (id) id.textContent = doc.id;
  if (status) status.textContent = '';
  document.querySelectorAll('.adm-exp-doc').forEach(b => {
    b.classList.toggle('on', !!b.querySelector('b') && b.querySelector('b').textContent === doc.id);
  });
}
async function admExplorerSave() {
  if (!isSuperAdmin || !admExploreCurrent) return;
  const ta = document.getElementById('admExpEditor');
  const status = document.getElementById('admExpStatus');
  let data;
  try { data = JSON.parse(ta.value); }
  catch (e) { if (status) status.textContent = ADMX.invalidJson; showToast(ADMX.invalidJson, 'error'); return; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    if (status) status.textContent = ADMX.invalidData;
    showToast(ADMX.invalidData, 'error');
    return;
  }
  try {
    await admExploreCurrent.ref.set(data);
    admLog(ADMX.saveLog, admExploreUid, { collection: admExploreCol, docId: admExploreCurrent.id });
    showToast(ADMX.saved, 'success');
    await admLoadExplorerDocs();
  } catch (e) {
    if (status) status.textContent = _admErrText(e, 'Save failed');
    showToast(_admErrText(e, 'Save failed'), 'error');
  }
}
async function admExplorerCreate() {
  if (!isSuperAdmin || !admExploreUid) return;
  try {
    const input = document.getElementById('admExpNewId');
    let id = (input && input.value || '').trim();
    if (admExploreCol === 'profile') { showToast(ADMX.profileCreate, 'info'); return; }
    if (admExploreCol === 'admin_notes') { id = admExploreUid; }
    if (!id) id = db.collection('_').doc().id;
    const payload = { createdByAdmin: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (admExploreCol === 'client_portals') payload.ownerUid = admExploreUid;
    await _admExploreRef(admExploreUid, admExploreCol).doc(id).set(payload);
    admLog(ADMX.createLog, admExploreUid, { collection: admExploreCol, docId: id });
    if (input) input.value = '';
    showToast(ADMX.created, 'success');
    await admLoadExplorerDocs();
  } catch (e) { showToast(_admErrText(e, 'Create failed'), 'error'); }
}
function admExplorerDelete() {
  if (!isSuperAdmin || !admExploreCurrent) return;
  const doc = admExploreCurrent;
  const colLabel = (ADMX.cols[admExploreCol] || admExploreCol);
  openConfirm(ADMX.deleteAsk, ADMX.deleteBody.replace('{id}', doc.id).replace('{col}', colLabel), async () => {
    try {
      await doc.ref.delete();
      admLog(ADMX.deleteLog, admExploreUid, { collection: admExploreCol, docId: doc.id });
      admExploreCurrent = null;
      const wrap = document.getElementById('admExpEditorWrap');
      if (wrap) wrap.hidden = true;
      showToast(ADMX.deleted, 'success');
      await admLoadExplorerDocs();
    } catch (e) { showToast(_admErrText(e, 'Delete failed'), 'error'); }
  });
}
function admExplorerExport() {
  if (!isSuperAdmin || !admExploreUid) return;
  const out = admExploreDocs.map(d => ({ id: d.id, data: _admJson(d.data() || {}) }));
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `a7sbly_${admExploreUid}_${admExploreCol}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  admLog(ADMX.exportLog, admExploreUid, { collection: admExploreCol, count: out.length });
  showToast(ADMX.exported, 'success');
}


/* =========================================================
   v20.10.6 — Super admin: open any registered account exactly
   as its owner sees it. Firebase Auth stays the admin account;
   only the in-app view context switches to the target uid.
   ========================================================= */
const VIEWX = {
  noAccess: "Super admins only 🛡️",
  self: "This is already your account — use the view bar to go back.",
  notFound: "User not found",
  confirmTitle: "Open this account as its owner?",
  confirmBody: "You will see everything in <b>{name}</b> exactly as the owner does. Any change is written to that account and logged under your super-admin identity. Use “Back to my account” in the top bar to return.",
  bannerTitle: "Viewing a user account — super admin mode",
  bannerSub: "You are seeing the account exactly as its owner does. Every change is logged under your name.",
  back: "Back to my account",
  exitTitle: "Back to your account?",
  exitBody: "You will return to your super-admin account. The user data you were viewing stays exactly as it is.",
  openLog: "Opened account as owner",
  closeLog: "Returned from account view",
  editLog: "Edit during account view",
  loaded: "Account opened exactly as its owner sees it ✓",
  backToast: "Back to your account ✓",
  btn: "Open account as its owner (super admin)",
  bannerWho: "Loading account..."
};
let _admRealUser = null;
let _admViewUid = null;
let _admViewName = '';

function admViewActive() { return !!(_admViewUid && _admRealUser); }
function admActor() { return admViewActive() ? (_admRealUser || currentUser) : currentUser; }

async function admWriteAudit(action, uid, details) {
  const actor = admActor();
  try {
    await db.collection('admin_audit').add({
      action, uid,
      by: actor && actor.uid ? actor.uid : '',
      byEmail: (actor && actor.email) || '',
      details: details || {},
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.warn('admin audit not saved:', e.code || e.message); }
}
function admAuditViewAction(action, details) {
  if (!admViewActive()) return;
  const payload = Object.assign({ viewAs: true }, details || {});
  try {
    const actor = admActor();
    db.collection('admin_audit').add({
      action, uid: _admViewUid,
      by: actor && actor.uid ? actor.uid : '',
      byEmail: (actor && actor.email) || '',
      details: payload,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  } catch (e) {}
}

function admEnsureViewBanner() {
  let b = document.getElementById('admViewBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'admViewBanner';
    b.className = 'adm-view-banner';
    b.innerHTML = '<div class="adm-view-b-in"><span class="adm-view-ic"><i class="fa-solid fa-user-eye"></i></span>' +
      '<div class="adm-view-tx"><b></b><small></small></div>' +
      '<button type="button" id="admViewExitBtn" class="adm-view-exit"><i class="fa-solid fa-arrow-turn-up"></i><span></span></button></div>';
    document.body.appendChild(b);
  }
  b.querySelector('b').textContent = VIEWX.bannerTitle;
  const small = b.querySelector('small');
  if (small && !small.textContent.trim()) small.textContent = VIEWX.bannerWho;
  const btn = document.getElementById('admViewExitBtn');
  if (btn) {
    btn.querySelector('span').textContent = VIEWX.back;
    btn.onclick = () => admExitViewAs();
  }
  return b;
}

function admPaintViewHeader(u) {
  const avatar = document.getElementById('userAvatar');
  if (avatar) {
    if (u.photoURL) avatar.src = u.photoURL;
    else {
      const initial = String(u.name || u.email || u.id || 'U').charAt(0).toUpperCase();
      avatar.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' rx='10' fill='%23f59e0b'/><text x='50%' y='55%' text-anchor='middle' dominant-baseline='middle' font-size='20' font-family='Cairo' fill='white' font-weight='bold'>${escapeHTML(initial)}</text></svg>`;
    }
  }
  const profile = document.getElementById('userProfile');
  if (profile) { profile.classList.remove('hidden'); profile.classList.add('flex'); }
  const footer = document.getElementById('footerSyncStatus');
  if (footer) footer.innerHTML = `<i class="fa-solid fa-user-eye text-amber-400"></i> ${escapeHTML(u.name || u.email || u.id)}`;
}

function admOpenViewAs() {
  if (!isSuperAdmin) { showToast(VIEWX.noAccess, 'error'); return; }
  if (admViewActive()) { showToast(VIEWX.self, 'error'); return; }
  const u = admUsers.find(x => x.id === admCurrentUid);
  if (!u) { showToast(VIEWX.notFound, 'error'); return; }
  const actor = admActor();
  if (actor && actor.uid && u.id === actor.uid) { showToast(VIEWX.self, 'error'); return; }
  openConfirm(
    VIEWX.confirmTitle,
    VIEWX.confirmBody.replace('{name}', escapeHTML(u.name || u.email || u.id)),
    () => admStartViewAs(u)
  );
}

async function admStartViewAs(u) {
  if (admViewActive() || !u || !u.id) return;
  const real = (auth.currentUser && auth.currentUser.uid) ? auth.currentUser : currentUser;
  if (!real || !isSuperAdmin) { showToast(VIEWX.noAccess, 'error'); return; }
  if (u.id === real.uid) { showToast(VIEWX.self, 'error'); return; }

  _admRealUser = real;
  _admViewUid = u.id;
  _admViewName = u.name || u.email || u.id;

  try { admCloseFullAccess(); } catch (e) {}
  admCloseUser();
  try { closeAdminPanel(); } catch (e) {}
  closeAllOverlays();

  [() => userDocUnsubscribe, () => transactionsUnsubscribe, () => requestsUnsubscribe, () => cloudUserMetaUnsubscribe]
    .forEach(get => { try { const fn = get(); if (typeof fn === 'function') fn(); } catch (e) {} });
  userDocUnsubscribe = null; transactionsUnsubscribe = null; requestsUnsubscribe = null; cloudUserMetaUnsubscribe = null;
  cloudSnapshot.clear(); portalIndex.clear(); portalPayloadCache.clear();

  const fake = {
    uid: u.id,
    email: u.email || null,
    displayName: u.name || '',
    photoURL: u.photoURL || null,
    phoneNumber: u.phone || null,
    emailVerified: true,
    providerData: (real.providerData || []).slice(),
    isAnonymous: false,
    __admViewAs: true
  };
  currentUser = fake;
  workspaceUid = null; teamPerms = null; teamOwnerName = '';
  userRole = 'free'; currentUserPermissionsOverride = null; isSuperAdmin = false;

  hideSuspendedScreen();
  hidePinLock();
  hideLoginWall();
  handleUserSwitch(u.id);
  document.body.classList.add('adm-view-mode');
  const banner = admEnsureViewBanner();
  banner.hidden = false;
  const who = banner.querySelector('small');
  if (who) who.textContent = `${_admViewName} · ${u.email || u.phone || u.id}`;
  admPaintViewHeader(u);

  try {
    const snap = await db.collection('users').doc(u.id).get();
    const d = snap.data() || {};
    if (ROLES_META[d.role]) userRole = d.role;
    currentUserPermissionsOverride = d.permissionsOverride || null;
  } catch (e) { userRole = 'free'; currentUserPermissionsOverride = null; }

  applyRoleUI();
  loadAllLocal();
  refreshAll();

  try { await resolveWorkspace(fake); } catch (e) {}
  applyTeamUI();
  subscribeToUserDoc(u.id);
  setSyncStatusUI('syncing');
  try { await loadCloudData(u.id); } catch (e) {}
  hidePinLock();

  navigateSegmented('home');
  window.scrollTo(0, 0);
  admAuditViewAction('open_view_as', { name: _admViewName });
  showToast(VIEWX.loaded, 'success');
}

function admExitViewAs(opts) {
  if (!admViewActive()) return;
  const targetUid = _admViewUid;
  const targetName = _admViewName;
  const real = _admRealUser;

  admAuditViewAction('close_view_as', { name: targetName });

  [() => userDocUnsubscribe, () => transactionsUnsubscribe, () => requestsUnsubscribe, () => cloudUserMetaUnsubscribe]
    .forEach(get => { try { const fn = get(); if (typeof fn === 'function') fn(); } catch (e) {} });
  userDocUnsubscribe = null; transactionsUnsubscribe = null; requestsUnsubscribe = null; cloudUserMetaUnsubscribe = null;
  cloudSnapshot.clear(); portalIndex.clear(); portalPayloadCache.clear();

  _admViewUid = null;
  _admRealUser = null;
  _admViewName = '';
  document.body.classList.remove('adm-view-mode');
  const banner = document.getElementById('admViewBanner');
  if (banner) banner.hidden = true;

  currentUser = real;
  if (opts && opts.silent) {
    isSuperAdmin = !!real && isSuperAdminEmail(String(real.email || '').toLowerCase().trim());
    userRole = isSuperAdmin ? 'admin' : 'free';
    currentUserPermissionsOverride = null;
    return;
  }

  isSuperAdmin = !!real && isSuperAdminEmail(String(real.email || '').toLowerCase().trim());
  userRole = isSuperAdmin ? 'admin' : 'free';
  currentUserPermissionsOverride = null;
  hideSuspendedScreen(); hidePinLock(); hideLoginWall();
  handleUserSwitch(real.uid);
  localStorage.setItem(LAST_UID_KEY, real.uid);

  const avatar = document.getElementById('userAvatar');
  if (avatar && real.photoURL) avatar.src = real.photoURL;
  const footer = document.getElementById('footerSyncStatus');
  if (footer) footer.innerHTML = `<i class="fa-solid fa-cloud text-emerald-500"></i> ${escapeHTML(real.email || real.phoneNumber || 'متصل بالسحاب')}`;

  loadAllLocal();
  refreshAll();
  applyRoleUI();
  try { resolveWorkspace(real).then(() => { applyTeamUI(); }); } catch (e) {}
  subscribeToUserDoc(real.uid);
  setSyncStatusUI('syncing');
  loadCloudData(wsUid()).catch(() => {});
  navigateSegmented('home');
  window.scrollTo(0, 0);
  showToast(VIEWX.backToast, 'success');
}

(function hookAdminActions() {
  const origRole = window.changeUserRole;
  window.changeUserRole = async function (uid, newRole) {
    const before = (admUsers.find(x => x.id === uid) || {}).role;
    await origRole.apply(this, arguments);
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists && doc.data().role === newRole && before !== newRole) { admLog('role_change', uid, { from: before || 'free', to: newRole }); }
    } catch (e) {}
    admUsersStale = true;
    try {
      await admEnsureUsers(true);
      const fresh = admUsers.find(x => x.id === uid);
      if (fresh && admCurrentUid === uid) { admRenderDrawer(fresh); admLoadActivity(uid); }
      if (adminActiveTab === 'users') renderUsersList();
    } catch (e) {}
  };
  const origSavePerms = window.saveUserPermissionsOverride;
  window.saveUserPermissionsOverride = async function () {
    const uid = editingUserPermissions && editingUserPermissions.uid;
    await origSavePerms.apply(this, arguments);
    if (uid) { admLog('permissions', uid, {}); admUsersStale = true; try { await admEnsureUsers(true); const f = admUsers.find(x => x.id === uid); if (f && admCurrentUid === uid) admRenderDrawer(f); } catch (e) {} }
  };
  const origOpen = window.openAdminPanel;
  window.openAdminPanel = async function () {
    admUsersStale = true; admRoleFilter = 'all'; admStatusFilter = 'all'; admShown = 80;
    const si = document.getElementById('usersSearchInput'); if (si) si.value = '';
    return origOpen.apply(this, arguments);
  };
  const origClose = window.closeAdminPanel;
  window.closeAdminPanel = function () { admCloseUser(); return origClose.apply(this, arguments); };
})();
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const m = document.getElementById('adminModal');
  if (!m || m.classList.contains('hidden')) return;
  const perm = document.getElementById('userPermissionsModal');
  if (perm && !perm.classList.contains('hidden')) return;
  const conf = document.getElementById('confirmModal');
  if (conf && !conf.classList.contains('hidden')) return;
  if (admCurrentUid) admCloseUser(); else closeAdminPanel();
});

/* =========================================================
   V20.5 — Lock thePIN For 10 minutes, list theAdd (+),Transactions,Clients
   ========================================================= */

/* ---------- 1) Lock thePIN: The code will not be requested again 10 minutes before the last activity ----------*/
const PIN_GRACE_MS = 10 * 60 * 1000;
const PIN_ACTIVE_KEY = 'a7sbly_pin_active_v1';
function markPinActive() { if (currentUser && getPin()) lsSet(PIN_ACTIVE_KEY, String(Date.now())); }
function pinStillUnlocked() {
  const t = Number(lsGet(PIN_ACTIVE_KEY)) || 0;
  const now = Date.now();
  return t > 0 && t <= now + 60000 && (now - t) < PIN_GRACE_MS;
}
function _lockVisible() { const l = document.getElementById('lockScreen'); return !!l && !l.classList.contains('hidden'); }
(function hookPinGrace() {
  const origUnlock = window.unlockApp;
  window.unlockApp = async function () {
    const r = await origUnlock.apply(this, arguments);
    if (!_lockVisible()) markPinActive();
    return r;
  };
  let lastMark = 0;
  const onActivity = () => {
    const now = Date.now();
    if (now - lastMark < 15000) return;
    lastMark = now;
    if (currentUser && getPin() && !_lockVisible()) markPinActive();
  };
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => document.addEventListener(ev, onActivity, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => {
    if (!currentUser || !getPin()) return;
    if (document.visibilityState === 'hidden') { if (!_lockVisible()) markPinActive(); }
    else if (!_lockVisible() && !pinStillUnlocked()) showPinLock();
  });
  window.addEventListener('pagehide', () => { if (!_lockVisible()) markPinActive(); });
  // Automatically locks if the application is open and idle for more than 10 minutes
  setInterval(() => {
    if (currentUser && getPin() && !_lockVisible() && !pinStillUnlocked()) showPinLock();
  }, 20000);
})();

/* ---------- 2) List ofAdd (+) ---------- */
let _qaLastFocus = null;
function openQuickAdd() {
  const s = document.getElementById('quickAddSheet');
  if (!s || !currentUser) return;
  if (!s.classList.contains('hidden') && s.classList.contains('open')) { closeQuickAdd(); return; }
  _qaLastFocus = document.activeElement;
  s.classList.remove('hidden');
  document.querySelectorAll('.qa-fab').forEach(b => { b.classList.add('open'); b.setAttribute('aria-expanded', 'true'); });
  requestAnimationFrame(() => {
    s.classList.add('open');
    const first = s.querySelector('.qa-tile:not([hidden])');
    if (first && first.offsetParent !== null) setTimeout(() => first.focus({ preventScroll: true }), 120);
  });
}
function closeQuickAdd(restoreFocus = true) {
  const s = document.getElementById('quickAddSheet');
  if (!s) return;
  s.classList.remove('open');
  document.querySelectorAll('.qa-fab').forEach(b => { b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); });
  setTimeout(() => { if (!s.classList.contains('open')) s.classList.add('hidden'); }, 220);
  if (restoreFocus && _qaLastFocus && _qaLastFocus.focus) { try { _qaLastFocus.focus({ preventScroll: true }); } catch (e) {} }
}
function quickAdd(kind) {
  closeQuickAdd(false);
  setTimeout(() => {
    if (kind === 'shift') openShiftSettlementModal();
    else if (kind === 'machines') openChargeMachines();
    else if (kind === 'budget') openBudgetModal();
    else openModal(kind);
  }, 230);
}
document.addEventListener('keydown', e => {
  const s = document.getElementById('quickAddSheet');
  if (!s || s.classList.contains('hidden')) return;
  if (e.key === 'Escape') { closeQuickAdd(); return; }
  if (e.key === 'Tab') { // Lock navigation within the list
    const items = Array.from(s.querySelectorAll('.qa-tile, .qa-x')).filter(x => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

/* ---------- 3) Transactions ---------- */
function _txStamp(t) {
  const tm = /^\d{1,2}:\d{2}/.test(t.time || '') ? String(t.time).slice(0, 5).padStart(5, '0') : '00:00';
  const v = Date.parse(`${t.date}T${tm}`);
  return isNaN(v) ? 0 : v;
}
function _txMeta(item) {
  if (item.type === 'income') return { cls: 'in', icon: 'fa-circle-arrow-down', sign: '+', label: 'revenue' };
  if (item.type === 'charity') return { cls: 'ch', icon: 'fa-hand-holding-heart', sign: '-', label: 'Good' };
  return { cls: 'out', icon: 'fa-circle-arrow-up', sign: '-', label: 'Expense' };
}
function _dayLabel(dateStr) {
  const today = todayString();
  const y = new Date(today + 'T12:00:00'); y.setDate(y.getDate() - 1);
  const yStr = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  if (dateStr === today) return 'today';
  if (dateStr === yStr) return 'Yesterday';
  try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }); }
  catch (e) { return dateStr; }
}
function _txFilteredList() {
  const search = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const list = getPeriodTransactions().filter(t => {
    if (isDebt(t.type)) return false;
    if (activeFilter !== 'all' && t.type !== activeFilter) return false;
    if (!search) return true;
    return [t.category, t.notes, t.client, t.paymentMethod, t.reference, t.time, typeName(t.type)].join(' ').toLowerCase().includes(search);
  });
  list.sort((a, b) => _txStamp(b) - _txStamp(a));
  return { list, search };
}
function _chip(label, valueHTML, tone) {
  return `<div class="tx-sum ${tone}"><small>${label}</small><b>${valueHTML}</b></div>`;
}
function renderTxSummary(list) {
  const host = document.getElementById('txSummary');
  if (!host) return;
  let inc = 0, out = 0;
  list.forEach(t => { const a = Number(t.amount) || 0; if (t.type === 'income') inc += a; else out += a; });
  host.innerHTML =
    _chip('Revenue', `<span class="money-val">${money(inc)}</span>`, 'in') +
    _chip('theExpenseat', `<span class="money-val">${money(out)}</span>`, 'out') +
    _chip('Net', `<span class="money-val">${inc - out >= 0 ? '' : '-'}${money(Math.abs(inc - out))}</span>`, inc - out >= 0 ? 'net' : 'out') +
    _chip('Transactions', String(list.length), 'cnt');
}
buildFeedCardHTML = function (item) {
  const m = _txMeta(item);
  const title = escapeHTML(item.notes || item.category || 'practical');
  const time = item.time ? formatTimeTo12Hour(item.time) : '';
  const sub = [item.client ? `<span class="tx-cl">${escapeHTML(item.client)}</span>` : '', payMethodHTML(item.paymentMethod), escapeHTML(time || item.date)].filter(Boolean).join(' <i class="tx-dot"></i> ');
  return `
    <div class="tx-m-left" onclick="editTransaction('${jsAttr(item.id)}')">
      <span class="tx-ic ${m.cls}"><i class="fa-solid ${m.icon}"></i></span>
      <div class="tx-t"><b>${title}</b><small>${sub}</small></div>
    </div>
    <div class="tx-m-right">
      <div class="tx-amt ${m.cls} money-val">${m.sign}${money(item.amount)}</div>
      <span class="tx-cat">${escapeHTML(item.category || m.label)}</span>
    </div>`;
};
renderTransactions = function () {
  const tbody = document.getElementById('transactionsTbody');
  const feed = document.getElementById('mobileTransactionsFeed');
  const empty = document.getElementById('emptyTransactionsState');
  const showMoreWrap = document.getElementById('txShowMoreContainer');
  const showMoreBtn = document.getElementById('txShowMoreBtn');
  if (tbody) tbody.innerHTML = '';
  if (feed) feed.innerHTML = '';

  const { list: fullList, search } = _txFilteredList();
  renderTxSummary(fullList);
  renderHomeRecentFeed();

  if (!fullList.length) {
    if (empty) empty.classList.remove('hidden');
    if (showMoreWrap) showMoreWrap.classList.add('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  const isSearching = search.length > 0;
  const visible = (showAllTransactions || isSearching) ? fullList : fullList.slice(0, TX_INITIAL_LIMIT);
  const remaining = fullList.length - visible.length;
  if (showMoreWrap && showMoreBtn) {
    if (fullList.length > TX_INITIAL_LIMIT && !isSearching) {
      showMoreWrap.classList.remove('hidden');
      showMoreBtn.innerHTML = showAllTransactions
        ? `<i class="fa-solid fa-chevron-up"></i> <span>Show less (latest${TX_INITIAL_LIMIT}transactions only)</span>`
        : `<i class="fa-solid fa-chevron-down"></i> <span>Show more (+${remaining} MGeneralfor himOther)</span>`;
    } else showMoreWrap.classList.add('hidden');
  }

  // Net every day (from full list)
  const dayNet = {};
  fullList.forEach(t => { const a = Number(t.amount) || 0; dayNet[t.date] = (dayNet[t.date] || 0) + (t.type === 'income' ? a : -a); });
  const groupHTML = (date) => {
    const n = dayNet[date] || 0;
    return `<span class="tx-g-l">${escapeHTML(_dayLabel(date))}</span><span class="tx-g-n ${n >= 0 ? 'pos' : 'neg'}"><span class="money-val">${n >= 0 ? '+' : '-'}${money(Math.abs(n))}</span>EGP</span>`;
  };

  let lastDate = null;
  visible.forEach(item => {
    if (item.date !== lastDate) {
      lastDate = item.date;
      if (feed) { const g = document.createElement('div'); g.className = 'tx-group'; g.innerHTML = groupHTML(item.date); feed.appendChild(g); }
      if (tbody) { const tr = document.createElement('tr'); tr.className = 'tx-group-row'; tr.innerHTML = `<td colspan="6"><div class="tx-group">${groupHTML(item.date)}</div></td>`; tbody.appendChild(tr); }
    }
    const m = _txMeta(item);
    if (feed) {
      const card = document.createElement('div');
      card.className = 'ft-tx-feed-item tx-card';
      card.innerHTML = `<div class="tx-m-row">${buildFeedCardHTML(item)}</div>
        <div class="tx-m-acts">
          <button type="button" onclick="shareViaWhatsApp('${jsAttr(item.id)}')" class="tx-ab wa" title="WhatsApp" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span></button>
          <button type="button" onclick="editTransaction('${jsAttr(item.id)}')" class="tx-ab" title="Edit" aria-label="Edit"><i class="fa-solid fa-pen"></i><span>Edit</span></button>
          <button type="button" onclick="requestDelete('${jsAttr(item.id)}')" class="tx-ab del" title="Delete" aria-label="Delete"><i class="fa-solid fa-trash-can"></i><span>Delete</span></button>
        </div>`;
      feed.appendChild(card);
    }
    if (tbody) {
      const tr = document.createElement('tr');
      tr.className = 'tx-row';
      const time = item.time ? formatTimeTo12Hour(item.time) : '';
      tr.innerHTML = `
        <td class="tx-c1"><div class="tx-main">
          <span class="tx-ic ${m.cls}"><i class="fa-solid ${m.icon}"></i></span>
          ${item.receipt ? `<img src="${safeReceiptURL(item.receipt)}" class="tx-rcpt" alt="Transaction image" title="Zoom inImage" onclick="viewReceiptImage(this.src)">` : ''}
          <div class="tx-t"><b>${escapeHTML(item.notes || item.category || 'Without statement')}</b>
            <small><span class="tx-cat">${escapeHTML(item.category || m.label)}</span>${item.reference ? ` <i class="tx-dot"></i> Reference: ${escapeHTML(item.reference)}` : ''}</small></div>
        </div></td>
        <td class="tx-c2">${item.client ? `<button type="button" class="tx-client" data-client><span class="tx-av">${escapeHTML(item.client.charAt(0).toUpperCase())}</span><span>${escapeHTML(item.client)}</span></button>` : '<span class="tx-none">—</span>'}</td>
        <td class="tx-c3"><span class="tx-pay">${payMethodHTML(item.paymentMethod)}</span></td>
        <td class="tx-c4"><div class="tx-time"><i class="fa-regular fa-clock"></i> ${escapeHTML(time || '—')}</div><small>${escapeHTML(item.date)}</small></td>
        <td class="tx-c5"><div class="tx-amt ${m.cls} money-val">${m.sign}${money(item.amount)} <small>EGP</small></div></td>
        <td class="tx-c6"><div class="tx-acts">
          <button type="button" onclick="shareViaWhatsApp('${jsAttr(item.id)}')" title="Share" class="wa"><i class="fa-brands fa-whatsapp"></i></button>
          <button type="button" onclick="editTransaction('${jsAttr(item.id)}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button type="button" onclick="requestDelete('${jsAttr(item.id)}')" title="Delete" class="del"><i class="fa-solid fa-trash-can"></i></button>
        </div></td>`;
      const cl = tr.querySelector('[data-client]');
      if (cl) cl.addEventListener('click', () => openClientLedger(item.client));
      tbody.appendChild(tr);
    }
  });
};

/* ---------- 4) Clients ---------- */
let clientFilter = 'all';
function _clientDataMap() {
  const names = new Map(getAllClientNames().map(n => [n.toLowerCase(), n]));
  const today = todayString();
  const map = new Map();
  getActiveTransactions().forEach(t => {
    if (!t.client || !t.client.trim()) return;
    const key = t.client.trim().toLowerCase();
    let s = map.get(key);
    if (!s) { s = { name: names.get(key) || t.client.trim(), count: 0, income: 0, rec: 0, pay: 0, debtTotal: 0, debtPaid: 0, last: 0, first: Infinity, overdue: false }; map.set(key, s); }
    const amt = Number(t.amount) || 0, paid = Math.min(Number(t.paidAmount) || 0, amt);
    const st = _txStamp(t);
    s.count++; if (st > s.last) s.last = st; if (st && st < s.first) s.first = st;
    if (t.type === 'income') s.income += amt;
    else if (t.type === 'debt_receivable') {
      s.debtTotal += amt; s.debtPaid += (t.status === 'paid' ? amt : paid);
      if (t.status !== 'paid') { s.rec += Math.max(0, amt - paid); if (t.dueDate && t.dueDate < today) s.overdue = true; }
    } else if (t.type === 'debt_payable' && t.status !== 'paid') s.pay += Math.max(0, amt - paid);
  });
  return map;
}
function _ago(ts) {
  if (!ts) return '—';
  const d = Math.floor((Date.now() - ts) / 864e5);
  if (d <= 0) return 'Today'; if (d === 1) return 'Yesterday'; if (d < 30) return `from${d}day`;
  if (d < 365) return `from${Math.floor(d / 30)} month`; return `from${Math.floor(d / 365)} year`;
}
function _clientStatus(s) {
  if (s.overdue) return ['Late payment', 'bad'];
  if (s.rec > 0) return ['He has a debt', 'warn'];
  if (s.pay > 0) return ['He deserves it', 'info'];
  if (s.debtTotal > 0) return ['Fully paid', 'ok'];
  return ['Without debt', 'mut'];
}
function setClientFilter(f) { clientFilter = f; renderClients(); }
function clientQuickAdd(name, type) {
  activeClientName = name;
  openModal(type);
  setTimeout(() => { const el = document.getElementById('formClient'); if (el) el.value = name; }, 120);
}
renderClients = function () {
  const container = document.getElementById('clientsContainer');
  const empty = document.getElementById('emptyClientsState');
  if (!container) return;
  const q = (document.getElementById('clientSearchInput')?.value || '').trim().toLowerCase();
  const sortBy = (document.getElementById('clientSort') || {}).value || 'debt';
  const all = Array.from(_clientDataMap().values());

  // summary
  const sum = document.getElementById('clientsSummary');
  if (sum) {
    const rec = all.reduce((a, c) => a + c.rec, 0), pay = all.reduce((a, c) => a + c.pay, 0);
    const late = all.filter(c => c.overdue).length;
    sum.innerHTML =
      _chip('Clients', String(all.length), 'cnt') +
      _chip('Worthy of you', `<span class="money-val">${money(rec)}</span>`, 'warn') +
      _chip('You deserve it', `<span class="money-val">${money(pay)}</span>`, 'info') +
      _chip('Late', String(late), late ? 'out' : 'mut');
  }
  // Filters
  const chips = document.getElementById('clientFilterChips');
  if (chips) {
    const counts = { all: all.length, owes: all.filter(c => c.rec > 0).length, owed: all.filter(c => c.pay > 0).length, settled: all.filter(c => c.rec === 0 && c.pay === 0).length };
    chips.replaceChildren();
    [['all', 'All'], ['owes', 'They have debts'], ['owed', 'He deserves itM'], ['settled', 'Without debt']].forEach(([k, label]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'filter-pill' + (clientFilter === k ? ' active' : '');
      b.textContent = `${label} ${counts[k]}`;
      b.addEventListener('click', () => setClientFilter(k));
      chips.appendChild(b);
    });
  }

  let list = all.filter(c => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    if (clientFilter === 'owes') return c.rec > 0;
    if (clientFilter === 'owed') return c.pay > 0;
    if (clientFilter === 'settled') return c.rec === 0 && c.pay === 0;
    return true;
  });
  const sorters = { debt: (a, b) => b.rec - a.rec || b.last - a.last, recent: (a, b) => b.last - a.last, count: (a, b) => b.count - a.count, name: (a, b) => a.name.localeCompare(b.name, 'ar') };
  list.sort(sorters[sortBy] || sorters.debt);

  container.replaceChildren();
  if (!list.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  list.forEach(c => {
    const [stTxt, stCls] = _clientStatus(c);
    const pct = c.debtTotal > 0 ? Math.round((c.debtPaid / c.debtTotal) * 100) : null;
    const card = document.createElement('div');
    card.className = 'cl-card' + (c.overdue ? ' late' : '');
    card.innerHTML = `
      <div class="cl-top">
        <span class="cl-av"></span>
        <div class="cl-id"><b class="cl-name"></b><small>${c.count} MGeneralfor him• last tGeneralto${escapeHTML(_ago(c.last))}</small><small class="cl-phone"></small></div>
        <span class="cl-st st-${stCls}">${stTxt}</span>
      </div>
      <div class="cl-stats">
        <div><small>Worthy of you</small><b class="money-val ${c.rec > 0 ? 'warn' : ''}">${money(c.rec)}</b></div>
        <div><small>You deserve it</small><b class="money-val ${c.pay > 0 ? 'info' : ''}">${money(c.pay)}</b></div>
        <div><small>Total services</small><b class="money-val ok">${money(c.income)}</b></div>
      </div>
      ${pct !== null ? `<div class="cl-prog" title="Repayment rate"><div class="cl-prog-h"><small>Repayment rateDebts</small><small>${pct}%</small></div><div class="cl-bar"><i style="width:${pct}%"></i></div></div>` : ''}
      <div class="cl-acts">
        <button type="button" class="cl-btn pri" data-a="ledger"><i class="fa-solid fa-folder-open"></i> Account statement</button>
        <button type="button" class="cl-btn" data-a="debt" title="New religion"><i class="fa-solid fa-plus"></i> religion</button>
        <button type="button" class="cl-btn wa" data-a="wa" title="WhatsAppClient" aria-label="WhatsAppClient"><i class="fa-brands fa-whatsapp"></i></button>
        <button type="button" class="cl-btn ic" data-a="phone" title="numberClient" aria-label="numberClient"><i class="fa-solid fa-phone"></i></button>
      </div>`;
    card.querySelector('.cl-av').textContent = c.name.charAt(0).toUpperCase();
    card.querySelector('.cl-name').textContent = c.name;
    { const ph = getClientPhone(c.name); const pe = card.querySelector('.cl-phone'); pe.textContent = ph ? '📞 ' + formatPhoneDisplay(ph) : 'There is no WhatsApp number'; if (!ph) pe.classList.add('none'); }
    card.addEventListener('click', e => {
      const b = e.target.closest('button[data-a]');
      if (!b) { openClientLedger(c.name); return; }
      const a = b.getAttribute('data-a');
      if (a === 'ledger') openClientLedger(c.name);
      else if (a === 'wa') remindClient(c.name);
      else if (a === 'phone') askClientPhone(c.name, null);
      else clientQuickAdd(c.name, 'debt_receivable');
    });
    container.appendChild(card);
  });
};
(function hookClientLedgerMeta() {
  const orig = window.openClientLedger;
  window.openClientLedger = function (clientName) {
    const r = orig.apply(this, arguments);
    try {
      const s = _clientDataMap().get(String(clientName).trim().toLowerCase());
      const host = document.getElementById('clientMetaStrip');
      if (host && s) {
        const fmt = ts => ts && isFinite(ts) ? new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        const [stTxt, stCls] = _clientStatus(s);
        const pct = s.debtTotal > 0 ? Math.round((s.debtPaid / s.debtTotal) * 100) + '%' : '—';
        const items = [['Status', `<span class="cl-st st-${stCls}">${stTxt}</span>`], ['numberTransactions', String(s.count)], ['OrLTGeneralto', fmt(s.first)],
          ['last tGeneralto', `${fmt(s.last)}<em>${_ago(s.last)}</em>`], ['Repayment rate', pct]];
        host.innerHTML = items.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
      }
    } catch (e) { console.warn(e); }
    return r;
  };
})();

/* =========================================================
   V20.6 — Settings The organization,Debts,Earnings Curve (Pro)
   ========================================================= */

/* ---------- 1) Settings (Control center) ---------- */
let _ccCat = 'ops';
function ccSetCat(cat) {
  _ccCat = cat;
  const q = (document.getElementById('ccSearch') || {}).value || '';
  if (q.trim()) { document.getElementById('ccSearch').value = ''; }
  ccFilter();
}
function _ccRowVisible(row) { return getComputedStyle(row).display !== 'none'; }
function ccFilter() {
  const q = ((document.getElementById('ccSearch') || {}).value || '').trim().toLowerCase();
  const groups = document.querySelectorAll('#controlCenterModal .cc-group');
  let anyVisible = false;
  groups.forEach(g => {
    const rows = g.querySelectorAll('.cc-row');
    let shown = 0;
    rows.forEach(r => {
      const match = !q || r.textContent.toLowerCase().includes(q);
      r.classList.toggle('cc-hide', !match);
      if (match && _ccRowVisible(r)) shown++;
    });
    const showGroup = q ? shown > 0 : g.getAttribute('data-cat') === _ccCat;
    g.hidden = !showGroup;
    if (showGroup && shown > 0) anyVisible = true;
  });
  document.querySelectorAll('#ccCats .cc-cat').forEach(b => b.classList.toggle('on', !q && b.getAttribute('data-cat') === _ccCat));
  const empty = document.getElementById('ccEmpty');
  if (empty) empty.hidden = anyVisible;
}
(function hookControlCenter() {
  const origOpen = window.openControlCenter;
  window.openControlCenter = function () {
    const r = origOpen.apply(this, arguments);
    const s = document.getElementById('ccSearch'); if (s) s.value = '';
    _ccCat = 'ops';
    const badge = document.getElementById('ccProBadge');
    if (badge) badge.hidden = hasFeature('profitCurve');
    const tb = document.getElementById('ccTeamBadge'); if (tb) tb.hidden = hasFeature('team');
    ccFilter();
    const main = document.querySelector('#controlCenterModal .cc-main'); if (main) main.scrollTop = 0;
    return r;
  };
})();
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const m = document.getElementById('controlCenterModal');
  if (m && !m.classList.contains('hidden')) closeControlCenter();
  const u = document.getElementById('proUpsellModal');
  if (u && !u.classList.contains('hidden')) closeProUpsell();
});
function ccOpenProfitCurve() {
  closeControlCenter();
  navigateSegmented('home');
  setTimeout(() => {
    const el = document.getElementById('profitCurveCard');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 250);
}

/* ---------- 2) Debts ---------- */
let debtFilter = 'all';
function _debtInfo(d) {
  const total = Number(d.amount) || 0;
  const isPaid = d.status === 'paid';
  const paid = isPaid ? total : Math.min(Number(d.paidAmount) || 0, total);
  const rem = isPaid ? 0 : Math.max(0, total - paid);
  const dueDiff = d.dueDate ? Math.round((new Date(d.dueDate) - new Date(todayString())) / 864e5) : null;
  return { total, paid, rem, isPaid, dueDiff, overdue: !isPaid && dueDiff !== null && dueDiff < 0, rec: d.type === 'debt_receivable' };
}
function setDebtFilter(f) { debtFilter = f; renderDebts(); }
renderDebts = function () {
  const container = document.getElementById('debtsContainer');
  const empty = document.getElementById('emptyDebtsState');
  if (!container) return;
  const all = getActiveTransactions().filter(t => isDebt(t.type)).map(d => ({ d, i: _debtInfo(d) }));

  // Summary
  const sum = document.getElementById('debtsSummary');
  if (sum) {
    const rec = all.filter(x => x.i.rec && !x.i.isPaid).reduce((a, x) => a + x.i.rem, 0);
    const pay = all.filter(x => !x.i.rec && !x.i.isPaid).reduce((a, x) => a + x.i.rem, 0);
    const late = all.filter(x => x.i.overdue);
    sum.innerHTML =
      _chip('Due to me', `<span class="money-val">${money(rec)}</span>`, 'in') +
      _chip('Due to me', `<span class="money-val">${money(pay)}</span>`, 'out') +
      _chip('Late', String(late.length), late.length ? 'out' : 'mut') +
      _chip('It has been paid', String(all.filter(x => x.i.isPaid).length), 'cnt');
  }
  // Filters
  const counts = { all: all.length, rec: all.filter(x => x.i.rec && !x.i.isPaid).length, pay: all.filter(x => !x.i.rec && !x.i.isPaid).length, overdue: all.filter(x => x.i.overdue).length, paid: all.filter(x => x.i.isPaid).length };
  const chips = document.getElementById('debtFilterChips');
  if (chips) {
    chips.replaceChildren();
    [['all', 'All'], ['rec', 'for me'], ['pay', 'on'], ['overdue', 'Late'], ['paid', 'SettledOh']].forEach(([k, label]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'filter-pill' + (debtFilter === k ? ' active' : '');
      b.textContent = `${label} ${counts[k]}`; b.addEventListener('click', () => setDebtFilter(k));
      chips.appendChild(b);
    });
  }
  let list = all.filter(x => {
    if (debtFilter === 'rec') return x.i.rec && !x.i.isPaid;
    if (debtFilter === 'pay') return !x.i.rec && !x.i.isPaid;
    if (debtFilter === 'overdue') return x.i.overdue;
    if (debtFilter === 'paid') return x.i.isPaid;
    return true;
  });
  const sortBy = (document.getElementById('debtSort') || {}).value || 'urgency';
  const newest = (a, b) => _txStamp(b.d) - _txStamp(a.d);
  const sorters = {
    urgency: (a, b) => (a.i.isPaid - b.i.isPaid) || (b.i.overdue - a.i.overdue)
      || ((a.i.dueDiff === null ? 1e9 : a.i.dueDiff) - (b.i.dueDiff === null ? 1e9 : b.i.dueDiff)) || newest(a, b),
    amount: (a, b) => b.i.rem - a.i.rem || newest(a, b),
    newest
  };
  list.sort(sorters[sortBy] || sorters.urgency);

  container.replaceChildren();
  if (!list.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  list.forEach(({ d, i }) => {
    const pct = i.total > 0 ? Math.min(100, Math.round((i.paid / i.total) * 100)) : 0;
    const tone = i.isPaid ? 'paid' : (i.rec ? 'rec' : 'pay');
    const card = document.createElement('div');
    card.className = `db-card db-${tone}${i.overdue ? ' late' : ''}`;
    card.innerHTML = `
      <div class="db-top">
        <span class="db-ic"><i class="fa-solid ${i.isPaid ? 'fa-circle-check' : (i.rec ? 'fa-hand-holding-dollar' : 'fa-file-invoice-dollar')}"></i></span>
        <div class="db-id">
          <b class="db-name"></b>
          <small class="db-sub"></small>
        </div>
        <div class="db-amt">
          <b class="money-val">${money(i.isPaid ? i.total : i.rem)}</b>
          <small>${i.isPaid ? 'Payment made✓' : (i.rec ? 'Due to me' : 'Due to me')}</small>
        </div>
      </div>
      <div class="db-meta"></div>
      ${i.total > 0 && (i.paid > 0 || i.isPaid) ? `
        <div class="db-prog">
          <div class="db-bar"><i style="width:${pct}%"></i></div>
          <div class="db-prog-t"><span>Paid ${money(i.paid)} from${money(i.total)}</span><span>${pct}%</span></div>
        </div>` : ''}
      <div class="db-acts">
        ${!i.isPaid ? `<button type="button" class="db-btn pri" data-a="pay"><i class="fa-solid fa-coins"></i> Payment</button>` : ''}
        ${!i.isPaid && i.rec ? `<button type="button" class="db-btn wa" data-a="remind"><i class="fa-brands fa-whatsapp"></i> reminder</button>` : ''}
        <button type="button" class="db-btn" data-a="toggle">${i.isPaid ? '<i class="fa-solid fa-rotate-left"></i> reopen' : '<i class="fa-solid fa-check-double"></i> Complete settlement'}</button>
        <button type="button" class="db-ib" data-a="card" title="claim card (Image)"><i class="fa-solid fa-image"></i></button>
        <button type="button" class="db-ib" data-a="edit" title="amendment"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="db-ib del" data-a="del" title="delete"><i class="fa-solid fa-trash-can"></i></button>
      </div>`;
    card.querySelector('.db-name').textContent = d.notes || 'Religion without statement';
    const sub = card.querySelector('.db-sub');
    if (d.client) {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'db-client'; c.innerHTML = '<i class="fa-solid fa-user"></i> ';
      c.append(document.createTextNode(d.client));
      if (getClientPhone(d.client)) { const w2 = document.createElement('i'); w2.className = 'fa-brands fa-whatsapp db-wa-ok'; c.appendChild(w2); }
      c.addEventListener('click', ev => { ev.stopPropagation(); openClientLedger(d.client); });
      sub.appendChild(c);
    }
    sub.append(document.createTextNode(`${d.category || ''} • ${d.date}${d.time ? ' • ' + formatTimeTo12Hour(d.time) : ''}`));
    const meta = card.querySelector('.db-meta');
    const badge = getDueDateBadge(d);
    if (badge) { const w = document.createElement('span'); w.innerHTML = badge; meta.appendChild(w); }
    if (d.receipt) {
      const img = document.createElement('img'); img.src = d.receipt; img.className = 'db-rcpt'; img.alt = 'Attached'; img.title = 'Preview theAttached';
      img.addEventListener('click', () => viewReceiptImage(img.src)); meta.appendChild(img);
    }
    if (!meta.childNodes.length) meta.remove();
    card.addEventListener('click', ev => {
      const b = ev.target.closest('button[data-a]'); if (!b) return;
      const a = b.getAttribute('data-a');
      if (a === 'pay') openDebtPaymentModal(d.id);
      else if (a === 'remind') sendDebtReminder(d.id);
      else if (a === 'card') openDebtCardModal(d.id);
      else if (a === 'toggle') toggleDebtStatus(d.id);
      else if (a === 'edit') editTransaction(d.id);
      else if (a === 'del') requestDelete(d.id);
    });
    container.appendChild(card);
  });
};

/* ---------- 3) Earnings Curve (Pro) ---------- */
const PRO_CONTACT_URL = '';  // Put here the WhatsApp/Telegram link to communicate if you want the “Contact for Promotion” button
let pcRange = '30';
let pcChart = null;
let pcTimer = null;

function openProUpsell() {
  const m = document.getElementById('proUpsellModal'); if (!m) return;
  const cta = document.getElementById('proUpCta'), txt = document.getElementById('proUpText');
  if (PRO_CONTACT_URL) { cta.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Continue to upgrade'; txt.textContent = 'Contact us and we will activate your subscriptionPro.'; }
  m.classList.remove('hidden'); m.classList.add('flex');
}
function closeProUpsell() { const m = document.getElementById('proUpsellModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }
function proUpsellAction() { if (PRO_CONTACT_URL) window.open(PRO_CONTACT_URL, '_blank', 'noopener'); closeProUpsell(); }

function pcSetRange(r) {
  pcRange = r;
  document.querySelectorAll('#pcRange button').forEach(b => b.classList.toggle('on', b.getAttribute('data-r') === r));
  renderProfitCurve();
}
function pcToggleTable() {
  const w = document.getElementById('pcTableWrap'); if (!w) return;
  w.hidden = !w.hidden;
  document.querySelector('#pcToggle span').textContent = w.hidden ? 'View follow-up schedule' : 'Hide follow-up schedule';
}
function _pcData() {
  const txs = getActiveTransactions().filter(t => t.type === 'income' || t.type === 'expense');
  const buckets = [];
  const monthly = pcRange === '12m';
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const fmtDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (monthly) {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1, 12);
      buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), income: 0, expense: 0 });
    }
  } else {
    const n = Number(pcRange);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      buckets.push({ key: fmtDay(d), label: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }), income: 0, expense: 0 });
    }
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  txs.forEach(t => {
    const k = monthly ? String(t.date).slice(0, 7) : String(t.date).slice(0, 10);
    const i = idx.get(k); if (i === undefined) return;
    const a = Number(t.amount) || 0;
    if (t.type === 'income') buckets[i].income += a; else buckets[i].expense += a;
  });
  let cum = 0;
  buckets.forEach(b => { b.profit = Math.round((b.income - b.expense) * 100) / 100; cum += b.profit; b.cum = Math.round(cum * 100) / 100; });
  return { buckets, monthly, hasData: buckets.some(b => b.income || b.expense) };
}
function renderProfitCurve() {
  const card = document.getElementById('profitCurveCard');
  if (!card) return;
  const allowed = typeof hasFeature === 'function' && hasFeature('profitCurve');
  const lock = document.getElementById('pcLock'), body = document.getElementById('pcBody'), range = document.getElementById('pcRange');
  lock.hidden = allowed; body.hidden = !allowed; range.hidden = !allowed;
  card.classList.toggle('locked', !allowed);
  if (!allowed) { if (pcChart) { pcChart.destroy(); pcChart = null; } return; }

  const { buckets, monthly, hasData } = _pcData();
  const total = buckets.reduce((s, b) => s + b.profit, 0);
  const income = buckets.reduce((s, b) => s + b.income, 0);
  const best = buckets.reduce((m, b) => (b.profit > m.profit ? b : m), buckets[0]);
  const worst = buckets.reduce((m, b) => (b.profit < m.profit ? b : m), buckets[0]);
  const avg = total / buckets.length;
  const half = Math.floor(buckets.length / 2);
  const a1 = buckets.slice(0, half).reduce((s, b) => s + b.profit, 0), a2 = buckets.slice(half).reduce((s, b) => s + b.profit, 0);
  const trendUp = a2 >= a1;
  const margin = income > 0 ? Math.round((total / income) * 100) : null;
  const unit = monthly ? 'month' : 'day';

  const stats = document.getElementById('pcStats');
  stats.innerHTML =
    _chip('totalProfit', `<span class="money-val">${total < 0 ? '-' : ''}${money(Math.abs(total))}</span>`, total >= 0 ? 'in' : 'out') +
    _chip('better' + unit, hasData ? `<span class="money-val">${money(best.profit)}</span> <i class="pc-sm">${escapeHTML(best.label)}</i>` : '—', 'cnt') +
    _chip('Average of' + unit, `<span class="money-val">${avg < 0 ? '-' : ''}${money(Math.abs(avg))}</span>`, avg >= 0 ? 'net' : 'out') +
    _chip('direction', hasData ? (trendUp ? '<i class="fa-solid fa-arrow-trend-up"></i> rising' : '<i class="fa-solid fa-arrow-trend-down"></i> Down') + (margin !== null ? ` <i class="pc-sm">Margin ${margin}%</i>` : '') : '—', trendUp ? 'in' : 'out');

  document.getElementById('pcEmpty').hidden = hasData;

  // The drawing
  const canvas = document.getElementById('profitCurveChart');
  if (typeof Chart !== 'undefined' && canvas) {
    const dark = document.documentElement.classList.contains('dark');
    const grid = dark ? 'rgba(255,255,255,.07)' : 'rgba(15,23,42,.07)', txt = dark ? '#98a4b8' : '#64748b';
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 240);
    grad.addColorStop(0, 'rgba(249,115,22,.35)'); grad.addColorStop(1, 'rgba(249,115,22,0)');
    const data = {
      labels: buckets.map(b => b.label),
      datasets: [
        { type: 'line', label: 'Profit Cumulative', data: buckets.map(b => b.cum), borderColor: '#f97316', backgroundColor: grad, fill: true, tension: .35, borderWidth: 3, pointRadius: buckets.length > 40 ? 0 : 3, pointHoverRadius: 5, pointBackgroundColor: '#f97316', yAxisID: 'y', order: 1 },
        { type: 'bar', label: monthly ? 'profitmonth' : 'profittoday', data: buckets.map(b => b.profit), backgroundColor: buckets.map(b => b.profit >= 0 ? 'rgba(16,185,129,.55)' : 'rgba(244,63,94,.55)'), borderRadius: 4, yAxisID: 'y1', order: 2, maxBarThickness: 18 }
      ]
    };
    const fmt = v => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(v)));
    const opts = {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { rtl: true, textDirection: 'rtl', callbacks: { label: c => ` ${c.dataset.label}: ${money(c.parsed.y)}EGP` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: txt, maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { family: 'Inter', size: 10 } } },
        y: { position: 'right', grid: { color: grid }, ticks: { color: txt, callback: fmt, font: { size: 10 } } },
        y1: { position: 'left', grid: { display: false }, ticks: { display: false } }
      }
    };
    if (pcChart) { pcChart.data = data; pcChart.options = opts; pcChart.update(); }
    else pcChart = new Chart(ctx, { data, options: opts });
  }

  // Follow-up schedule (Latest Orno)
  const tb = document.getElementById('pcTbody');
  tb.innerHTML = buckets.slice().reverse().map(b => `
    <tr><td>${escapeHTML(b.label)}</td>
      <td class="in money-val">${b.income ? money(b.income) : '—'}</td>
      <td class="out money-val">${b.expense ? money(b.expense) : '—'}</td>
      <td class="${b.profit >= 0 ? 'in' : 'out'} money-val"><b>${b.profit < 0 ? '-' : ''}${money(Math.abs(b.profit))}</b></td>
      <td class="money-val">${b.cum < 0 ? '-' : ''}${money(Math.abs(b.cum))}</td></tr>`).join('');
}
function _schedulePC() { clearTimeout(pcTimer); pcTimer = setTimeout(() => { try { renderProfitCurve(); } catch (e) { console.warn(e); } }, 150); }
(function hookProfitCurve() {
  const um = window.updateMetrics;
  window.updateMetrics = function () { const r = um.apply(this, arguments); _schedulePC(); return r; };
  const ar = window.applyRoleUI;
  window.applyRoleUI = function () { const r = ar.apply(this, arguments); _schedulePC(); return r; };
  const at = window.applyTheme;
  if (typeof at === 'function') window.applyTheme = function () { const r = at.apply(this, arguments); if (pcChart) { pcChart.destroy(); pcChart = null; } _schedulePC(); return r; };
})();

/* =========================================================
   V20.7 — Team (Pro): Invite members with powers you control
   - Team data= Account holder data (co-working space)
   - Invitation by email, and member meIncome On his own account
   - Permissions Applied to the interface+ In grammarFirestore
   ========================================================= */
const TEAM_MAX_MEMBERS = 5;   // Maximum number of members (Activeyen+ InvitationsPendingE)
const TEAM_PERMS = [
  { k: 'addIncome',  label: 'Add Revenue',            ic: 'fa-circle-arrow-down', g: 'Transactions' },
  { k: 'addExpense', label: 'Add an expenseAndGood',       ic: 'fa-circle-arrow-up',   g: 'Transactions' },
  { k: 'editTx',     label: 'amendmentTransactions',           ic: 'fa-pen',               g: 'Transactions' },
  { k: 'deleteTx',   label: 'delete Transactions',             ic: 'fa-trash-can',         g: 'Transactions' },
  { k: 'debts',      label: 'Debts (view and manage)',      ic: 'fa-handshake',         g: 'Management' },
  { k: 'clients',    label: 'Customer book',             ic: 'fa-users',             g: 'Management' },
  { k: 'machines',   label: 'Charge machines',                ic: 'fa-bolt',              g: 'Management' },
  { k: 'inventory',  label: 'The store',                   ic: 'fa-boxes-stacked',     g: 'Management' },
  { k: 'totals',     label: 'See balances and profits',    ic: 'fa-chart-line',        g: 'Reports' },
  { k: 'reports',    label: 'Reports andExport',        ic: 'fa-file-pdf',          g: 'Reports' }
];
const TEAM_PERM_KEYS = TEAM_PERMS.map(p => p.k);
const _allPerms = v => Object.fromEntries(TEAM_PERM_KEYS.map(k => [k, v]));
const TEAM_PRESETS = {
  manager:    { name: 'Manager a team', ic: 'fa-user-tie',   perms: _allPerms(true) },
  accountant: { name: 'accountant',     ic: 'fa-calculator', perms: { ..._allPerms(false), addIncome: true, addExpense: true, editTx: true, debts: true, clients: true, machines: true, inventory: true, totals: true, reports: true } },
  cashier:    { name: 'CashYer',     ic: 'fa-cash-register', perms: { ..._allPerms(false), addIncome: true, addExpense: true, debts: true, machines: true } },
  viewer:     { name: 'viewer',     ic: 'fa-eye',        perms: { ..._allPerms(false), totals: true, reports: true, clients: true } },
  custom:     { name: 'Custom',      ic: 'fa-sliders',    perms: null }
};
// Link old application features to team permissions (which are not linked= Member is prohibited)
const TEAM_FEATURE_MAP = { charity: 'addExpense', debts: 'debts', export: 'reports', reports: 'reports', profitCurve: 'totals' };

let teamMemberships = [];     // The teams I am a member of
let teamPendingInvites = [];  // InvitationsPendingWhy, why?
let teamOwnerName = '';

function isTeamMode() {
  return !!(workspaceUid && currentUser && workspaceUid !== currentUser.uid
    && Array.isArray(teamMemberships) && teamMemberships.some(x => x.ownerUid === workspaceUid));
}
function wsUid() { return isTeamMode() ? workspaceUid : (currentUser && currentUser.uid); }
function teamHas(f) {
  if (!teamPerms) return false;
  if (TEAM_PERM_KEYS.includes(f)) return teamPerms[f] === true;
  const k = TEAM_FEATURE_MAP[f];
  return !!(k && teamPerms[k] === true);
}
function teamDeny(perm) {
  if (!isTeamMode() || (teamPerms && teamPerms[perm] === true)) return false;
  showToast('You do not have permission to do thisTransaction', 'error');
  return true;
}
const _origHasFeature = hasFeature;
hasFeature = function (f) { return isTeamMode() ? teamHas(f) : _origHasFeature(f); };
const _origGetMax = getMaxTransactions;
getMaxTransactions = function () { return isTeamMode() ? -1 : _origGetMax(); };

function applyTeamUI() {
  if (workspaceUid && Array.isArray(teamMemberships) && !teamMemberships.some(x => x.ownerUid === workspaceUid)) {
    workspaceUid = null; teamPerms = null; teamOwnerName = '';
  }
  const b = document.body, team = isTeamMode();
  b.classList.toggle('team-member', team);
  TEAM_PERM_KEYS.forEach(k => b.classList.toggle('team-no-' + k, team && !(teamPerms && teamPerms[k] === true)));
  const canAdd = !team || ['addIncome', 'addExpense', 'debts', 'machines'].some(k => teamPerms && teamPerms[k] === true);
  b.classList.toggle('team-no-add', !canAdd);
  const chip = document.getElementById('teamChip');
  if (chip) { chip.hidden = !team; chip.innerHTML = team ? `<i class="fa-solid fa-people-group"></i> a team${escapeHTML(teamOwnerName || '')}` : ''; }
  if (team) {
    const badge = document.getElementById('roleBadge');
    if (badge) { badge.className = 'hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border border-violet-500/40 text-violet-400'; badge.innerHTML = '<i class="fa-solid fa-people-group"></i> team member'; }
  }
  else {
    const badge = document.getElementById('roleBadge');
    if (badge) {
      badge.className = 'hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border border-slate-500/30 text-slate-400';
      const roleName = (typeof ROLES_META !== 'undefined' && ROLES_META[userRole]) ? ROLES_META[userRole].name : '';
      badge.innerHTML = roleName ? '<i class="fa-solid fa-user"></i> ' + escapeHTML(roleName) : '';
    }
  }
  const homeCard = document.getElementById('teamHomeCard');
  if (homeCard) {
    homeCard.hidden = !(team && !(teamPerms && teamPerms.totals === true));
    const t = document.getElementById('teamHomeName'); if (t) t.textContent = teamOwnerName || 'team';
  }
  const tile = document.getElementById('profileWsTile');
  if (tile) tile.hidden = !(teamMemberships.length || team);
  if (typeof applyRoleUI === 'function') applyRoleUI();
  if (team) {
    const badge2 = document.getElementById('roleBadge');
    if (badge2) { badge2.className = 'hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border border-violet-500/40 text-violet-400'; badge2.innerHTML = '<i class="fa-solid fa-people-group"></i> team member'; }
  }
}

/* ---------- to setWorkspace afterLogin ---------- */
function _wsPrefKey(uid) { return 'a7sbly_ws_v1_' + uid; }
async function resolveWorkspace(user) {
  workspaceUid = null; teamPerms = null; teamOwnerName = ''; teamMemberships = []; teamPendingInvites = [];
  if (!isRealCloudUser()) return;
  const me = user.uid;
  try {
    const ptrs = await db.collection('users').doc(me).collection('memberships').get();
    for (const p of ptrs.docs) {
      const ownerUid = p.id;
      try {
        const m = await db.collection('users').doc(ownerUid).collection('members').doc(me).get();
        if (m.exists && m.data().active !== false) {
          teamMemberships.push({ ownerUid, ownerName: (p.data().ownerName || p.data().ownerEmail || 'a team'), perms: m.data().perms || {}, preset: m.data().preset || 'custom' });
        } else if (!m.exists) { p.ref.delete().catch(() => {}); }
      } catch (e) { /* No reading permission= Membership cancelled*/ }
    }
  } catch (e) { console.warn('memberships:', e.code || e.message); }
  try {
    const email = (user.email || '').toLowerCase();
    if (email && user.emailVerified !== false) {
      const q = await db.collection('team_invites').where('email', '==', email).where('status', '==', 'pending').get();
      teamPendingInvites = q.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) { console.warn('invites:', e.code || e.message); }
  const pref = localStorage.getItem(_wsPrefKey(me));
  if (pref && pref !== 'self') {
    const m = teamMemberships.find(x => x.ownerUid === pref);
    if (m) { workspaceUid = m.ownerUid; teamPerms = m.perms; teamOwnerName = m.ownerName; }
    else localStorage.removeItem(_wsPrefKey(me));
  }
}
function switchWorkspace(key) {
  if (!currentUser) return;
  localStorage.setItem(_wsPrefKey(currentUser.uid), key || 'self');
  location.reload();
}
function openWorkspaceSwitcher() {
  const m = document.getElementById('wsModal'); if (!m) return;
  const list = document.getElementById('wsList'); list.replaceChildren();
  const mk = (title, sub, key, active, icon) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ws-item' + (active ? ' on' : '');
    b.innerHTML = `<span class="ws-ic"><i class="fa-solid ${icon}"></i></span><span class="ws-tx"><b></b><small></small></span><i class="fa-solid ${active ? 'fa-circle-check' : 'fa-chevron-left'} ws-go"></i>`;
    b.querySelector('b').textContent = title; b.querySelector('small').textContent = sub;
    b.addEventListener('click', () => { if (!active) switchWorkspace(key); else closeWorkspaceSwitcher(); });
    return b;
  };
  list.appendChild(mk('My accountPersonal', 'Your private data', 'self', !isTeamMode(), 'fa-user'));
  teamMemberships.forEach(t => {
    const preset = (TEAM_PRESETS[t.preset] || TEAM_PRESETS.custom).name;
    list.appendChild(mk('a team' + t.ownerName, 'Your turn:' + preset, t.ownerUid, isTeamMode() && workspaceUid === t.ownerUid, 'fa-people-group'));
  });
  const leave = document.getElementById('wsLeave');
  leave.hidden = !isTeamMode();
  m.classList.remove('hidden'); m.classList.add('flex');
}
function closeWorkspaceSwitcher() { const m = document.getElementById('wsModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }
function leaveCurrentTeam() {
  if (!isTeamMode()) return;
  const owner = workspaceUid;
  openConfirm('Leaving the team?', `You will graduate from a team   <b>${escapeHTML(teamOwnerName)}</b>You cannot enter his data except with a new invitation.`, async () => {
    try {
      await db.collection('users').doc(owner).collection('members').doc(currentUser.uid).delete();
      await db.collection('users').doc(currentUser.uid).collection('memberships').doc(owner).delete();
    } catch (e) { showToast('Unable to leave', 'error'); return; }
    switchWorkspace('self');
  });
}

/* ---------- I received an invitation ----------*/
function maybeShowTeamInvites() {
  if (!teamPendingInvites.length || isTeamMode()) return;
  const inv = teamPendingInvites[0];
  const m = document.getElementById('teamInviteModal'); if (!m) return;
  document.getElementById('tiOwner').textContent = inv.ownerName || inv.ownerEmail || 'Account holder';
  const preset = (TEAM_PRESETS[inv.preset] || TEAM_PRESETS.custom).name;
  document.getElementById('tiPreset').textContent = preset;
  const ul = document.getElementById('tiPerms'); ul.replaceChildren();
  TEAM_PERMS.filter(p => inv.perms && inv.perms[p.k] === true).forEach(p => {
    const li = document.createElement('li'); li.innerHTML = '<i class="fa-solid fa-circle-check"></i> '; li.append(document.createTextNode(p.label)); ul.appendChild(li);
  });
  if (!ul.childNodes.length) { const li = document.createElement('li'); li.textContent = 'View only'; ul.appendChild(li); }
  m._invite = inv;
  m.classList.remove('hidden'); m.classList.add('flex');
}
async function acceptTeamInvite() {
  const m = document.getElementById('teamInviteModal'); const inv = m && m._invite; if (!inv) return;
  const me = currentUser;
  try {
    await db.collection('users').doc(inv.ownerUid).collection('members').doc(me.uid).set({
      uid: me.uid, email: (me.email || '').toLowerCase(), name: me.displayName || inv.name || '', preset: inv.preset || 'custom',
      perms: inv.perms || {}, active: true, joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('users').doc(me.uid).collection('memberships').doc(inv.ownerUid).set({
      ownerUid: inv.ownerUid, ownerName: inv.ownerName || '', ownerEmail: inv.ownerEmail || '', joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('team_invites').doc(inv.id).update({ status: 'accepted', memberUid: me.uid, acceptedAt: firebase.firestore.FieldValue.serverTimestamp() });
    localStorage.setItem(_wsPrefKey(me.uid), inv.ownerUid);
    showToast('Joined the team✓', 'success');
    setTimeout(() => location.reload(), 600);
  } catch (e) {
    console.warn(e);
    showToast(e.code === 'permission-denied' ? 'Unable to join: Make sure your email is activated and has rulesFirestore New published' : 'Unable to join the team', 'error');
  }
}
async function declineTeamInvite() {
  const m = document.getElementById('teamInviteModal'); const inv = m && m._invite;
  if (inv) { try { await db.collection('team_invites').doc(inv.id).update({ status: 'declined' }); } catch (e) {} }
  teamPendingInvites = teamPendingInvites.filter(x => !inv || x.id !== inv.id);
  m.classList.add('hidden'); m.classList.remove('flex');
  if (teamPendingInvites.length) setTimeout(maybeShowTeamInvites, 300);
}

/* ---------- Team management (for the account holderPro) ---------- */
let _tmData = { members: [], invites: [] };
let _tmEdit = null;   // { mode:'add'|'edit', uid?, inviteId? }
let _tmPerms = {};
let _tmPreset = 'cashier';

function openTeamModal() {
  if (!requireAuth()) return;
  if (!isRealCloudUser()) { showToast('The work team Requires a registered account (not visitor mode)', 'error'); return; }
  const m = document.getElementById('teamModal');
  m.classList.remove('hidden'); m.classList.add('flex');
  const allowed = hasFeature('team');
  document.getElementById('tmLocked').hidden = allowed;
  document.getElementById('tmMain').hidden = !allowed;
  if (allowed) teamRefresh();
}
function closeTeamModal() { const m = document.getElementById('teamModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }
async function teamRefresh() {
  const list = document.getElementById('tmList');
  list.replaceChildren(_admEl('div', 'adm-loading', 'Loading...'));
  try {
    const me = currentUser.uid;
    const [ms, is] = await Promise.all([
      db.collection('users').doc(me).collection('members').get(),
      db.collection('team_invites').where('ownerUid', '==', me).get()
    ]);
    _tmData.members = ms.docs.map(d => ({ id: d.id, ...d.data() }));
    _tmData.invites = is.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.status === 'pending');
  } catch (e) {
    list.replaceChildren(_admEl('div', 'adm-loading err', e.code === 'permission-denied' ? 'Need to publish rulesFirestore New (firestore.rules)' : 'Unable todownload team'));
    return;
  }
  renderTeamList();
}
function _permSummary(perms) {
  const n = TEAM_PERM_KEYS.filter(k => perms && perms[k] === true).length;
  return `${n} from${TEAM_PERM_KEYS.length} powers`;
}
function renderTeamList() {
  const list = document.getElementById('tmList'); list.replaceChildren();
  const used = _tmData.members.length + _tmData.invites.length;
  document.getElementById('tmSeatCount').textContent = `${used} / ${TEAM_MAX_MEMBERS}`;
  document.getElementById('tmSeatBar').style.width = Math.min(100, (used / TEAM_MAX_MEMBERS) * 100) + '%';
  document.getElementById('tmEmpty').hidden = used > 0;
  const row = (o) => {
    const el = document.createElement('div'); el.className = 'tm-row' + (o.off ? ' off' : '');
    const av = document.createElement('span'); av.className = 'adm-av'; av.textContent = (o.name || o.email || '?').charAt(0).toUpperCase();
    const body = document.createElement('div'); body.className = 'tm-row-b';
    const t = document.createElement('b'); t.textContent = o.name || o.email;
    const s = document.createElement('small'); s.textContent = o.name ? o.email : '';
    const pills = document.createElement('div'); pills.className = 'tm-pills';
    const preset = TEAM_PRESETS[o.preset] || TEAM_PRESETS.custom;
    pills.append(_admEl('span', 'adm-role r-pro', preset.name), _admEl('span', 'adm-st ' + o.stCls, o.stTxt), _admEl('em', 'tm-ps', _permSummary(o.perms)));
    body.append(t, s, pills);
    const acts = document.createElement('div'); acts.className = 'tm-acts';
    o.actions.forEach(a => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tm-act ' + (a.cls || ''); b.title = a.title; b.innerHTML = `<i class="fa-solid ${a.ic}"></i>`; b.addEventListener('click', a.fn); acts.appendChild(b); });
    el.append(av, body, acts);
    return el;
  };
  _tmData.members.forEach(m => {
    const active = m.active !== false;
    list.appendChild(row({
      name: m.name, email: m.email, preset: m.preset, perms: m.perms, off: !active,
      stCls: active ? 'st-ok' : 'st-mut', stTxt: active ? 'Active' : 'Suspended',
      actions: [
        { ic: 'fa-sliders', title: 'amendmentPermissions', fn: () => openMemberEditor('edit', m) },
        { ic: active ? 'fa-user-lock' : 'fa-lock-open', title: active ? 'Stop the member' : 'Activate the member', fn: () => teamToggleActive(m) },
        { ic: 'fa-user-xmark', title: 'remove From the team', cls: 'del', fn: () => teamRemoveMember(m) }
      ]
    }));
  });
  _tmData.invites.forEach(i => {
    list.appendChild(row({
      name: i.name, email: i.email, preset: i.preset, perms: i.perms, stCls: 'st-info', stTxt: 'Waiting for acceptance',
      actions: [
        { ic: 'fa-sliders', title: 'amendmentPermissions', fn: () => openMemberEditor('invite', i) },
        { ic: 'fa-xmark', title: 'Cancel Invitation', cls: 'del', fn: () => teamCancelInvite(i) }
      ]
    }));
  });
}

function openMemberEditor(mode, rec) {
  const used = _tmData.members.length + _tmData.invites.length;
  if (mode === 'add' || !mode) {
    if (used >= TEAM_MAX_MEMBERS) { showToast(`reached the maximum (${TEAM_MAX_MEMBERS} members)`, 'error'); return; }
    _tmEdit = { mode: 'add' }; _tmPreset = 'cashier'; _tmPerms = { ...TEAM_PRESETS.cashier.perms };
  } else {
    _tmEdit = { mode, rec }; _tmPreset = rec.preset || 'custom'; _tmPerms = { ..._allPerms(false), ...(rec.perms || {}) };
  }
  const isAdd = _tmEdit.mode === 'add';
  document.getElementById('tmEdTitle').textContent = isAdd ? 'Add a team member' : 'Modify member permissions';
  const nameEl = document.getElementById('tmName'), emailEl = document.getElementById('tmEmail');
  nameEl.value = isAdd ? '' : (rec.name || ''); emailEl.value = isAdd ? '' : (rec.email || ''); emailEl.disabled = !isAdd;
  document.getElementById('tmEdHint').textContent = isAdd ? 'The member isIncome With the same email (Google Or An activated email), and an invitation will appear when he logs in.' : '';
  renderMemberEditor();
  const m = document.getElementById('memberEditModal'); m.classList.remove('hidden'); m.classList.add('flex');
}
function closeMemberEditor() { const m = document.getElementById('memberEditModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }
function renderMemberEditor() {
  const presets = document.getElementById('tmPresets'); presets.replaceChildren();
  Object.entries(TEAM_PRESETS).forEach(([k, p]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tm-preset' + (_tmPreset === k ? ' on' : '');
    b.innerHTML = `<i class="fa-solid ${p.ic}"></i><span></span>`; b.querySelector('span').textContent = p.name;
    b.addEventListener('click', () => { _tmPreset = k; if (p.perms) _tmPerms = { ...p.perms }; renderMemberEditor(); });
    presets.appendChild(b);
  });
  const box = document.getElementById('tmPerms'); box.replaceChildren();
  let lastG = null;
  TEAM_PERMS.forEach(p => {
    if (p.g !== lastG) { lastG = p.g; box.appendChild(_admEl('div', 'tm-g', p.g)); }
    const row = document.createElement('button'); row.type = 'button'; row.className = 'tm-perm' + (_tmPerms[p.k] ? ' on' : '');
    row.setAttribute('role', 'switch'); row.setAttribute('aria-checked', _tmPerms[p.k] ? 'true' : 'false');
    row.innerHTML = `<span class="tm-perm-ic"><i class="fa-solid ${p.ic}"></i></span><span class="tm-perm-l"></span><span class="tm-sw"><i></i></span>`;
    row.querySelector('.tm-perm-l').textContent = p.label;
    row.addEventListener('click', () => { _tmPerms[p.k] = !_tmPerms[p.k]; _tmPreset = _detectPreset(); renderMemberEditor(); });
    box.appendChild(row);
  });
}
function _detectPreset() {
  for (const [k, p] of Object.entries(TEAM_PRESETS)) {
    if (p.perms && TEAM_PERM_KEYS.every(x => !!p.perms[x] === !!_tmPerms[x])) return k;
  }
  return 'custom';
}
async function saveMember() {
  if (!_tmEdit) return;
  const perms = Object.fromEntries(TEAM_PERM_KEYS.map(k => [k, !!_tmPerms[k]]));
  const name = sanitizeString(document.getElementById('tmName').value, 60);
  const me = currentUser;
  try {
    if (_tmEdit.mode === 'add') {
      const email = (document.getElementById('tmEmail').value || '').trim().toLowerCase();
      if (!/^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(email)) { showToast('Enter a valid email', 'error'); return; }
      if (email === (me.email || '').toLowerCase()) { showToast('This is your emailYou 😄', 'error'); return; }
      if (_tmData.members.some(m => (m.email || '').toLowerCase() === email)) { showToast('This member is already on the team', 'error'); return; }
      const id = me.uid + '_' + email;
      await db.collection('team_invites').doc(id).set({
        ownerUid: me.uid, ownerName: me.displayName || me.email || '', ownerEmail: (me.email || '').toLowerCase(),
        email, name, preset: _tmPreset, perms, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast('The invitation has been sent✓ — It will appear to him when he logs in with this email', 'success');
    } else if (_tmEdit.mode === 'edit') {
      const m = _tmEdit.rec;
      await db.collection('users').doc(me.uid).collection('members').doc(m.id).update({ perms, preset: _tmPreset, name: name || m.name || '' });
      showToast('It was completedSave permissions ✓', 'success');
    } else {
      const i = _tmEdit.rec;
      await db.collection('team_invites').doc(i.id).update({ perms, preset: _tmPreset, name });
      showToast('It was completedUpdate Invitation✓', 'success');
    }
    closeMemberEditor(); teamRefresh();
  } catch (e) {
    console.warn(e);
    showToast(e.code === 'permission-denied' ? 'not allowed— subscriptionPro required,Or rulesFirestore The new one has not yet been published' : 'Unable toSave', 'error');
  }
}
async function teamToggleActive(m) {
  try { await db.collection('users').doc(currentUser.uid).collection('members').doc(m.id).update({ active: m.active === false }); showToast(m.active === false ? 'The member has been activated' : 'The member has been suspended', 'success'); teamRefresh(); }
  catch (e) { showToast('Unable to execute', 'error'); }
}
function teamRemoveMember(m) {
  openConfirm('remove Member?', `<b>${escapeHTML(m.name || m.email)}</b>You will lose access to your data immediately.`, async () => {
    try {
      await db.collection('users').doc(currentUser.uid).collection('members').doc(m.id).delete();
      try { await db.collection('team_invites').doc(currentUser.uid + '_' + (m.email || '').toLowerCase()).delete(); } catch (e) {}
      showToast('Doneremove', 'info'); teamRefresh();
    } catch (e) { showToast('Unable toremove', 'error'); }
  });
}
function teamCancelInvite(i) {
  openConfirm('Cancel Invitation?', `You will cancel the invitation sent to <b>${escapeHTML(i.email)}</b>.`, async () => {
    try { await db.collection('team_invites').doc(i.id).delete(); showToast('It was completedCancel Invitation', 'info'); teamRefresh(); }
    catch (e) { showToast('Unable toCancel', 'error'); }
  });
}

/* ---------- protectionTransactions According toPermissions (Interface) ----------*/
(function hookTeamGuards() {
  const wrap = (name, permFn) => {
    const orig = window[name]; if (typeof orig !== 'function') return;
    window[name] = function () {
      if (isTeamMode()) { const p = permFn.apply(null, arguments); if (p && teamDeny(p)) return; }
      return orig.apply(this, arguments);
    };
  };
  const permForType = type => (type === 'income' ? 'addIncome' : (type === 'expense' || type === 'charity') ? 'addExpense' : isDebt(type) ? 'debts' : null);
  wrap('openModal', type => permForType(type));
  wrap('editTransaction', id => { const t = transactions.find(x => x.id === id); return t && isDebt(t.type) ? 'debts' : 'editTx'; });
  wrap('requestDelete', () => 'deleteTx');
  ['openDebtPaymentModal', 'openDebtCardModal', 'toggleDebtStatus'].forEach(n => wrap(n, () => 'debts'));
  wrap('openChargeMachines', () => 'machines');
  ['confirmClearData', 'loadDemoData', 'openBackupModal', 'openRecurringModal', 'openWalletTransferModal', 'openTicketsModal', 'openDrawerModal', 'openProfitModal', 'copyClientPortalLink', 'shareClientPortalWhatsApp', 'openTeamModal']
    .forEach(n => wrap(n, () => '__owner__'));
  wrap('openShiftSettlementModal', () => '__owner__');
  wrap('openBudgetModal', () => '__owner__');
})();
(function hookTeamLifecycle() {
  const orig = window.syncModeForCurrentUser;
  window.syncModeForCurrentUser = function () {
    if (isTeamMode() && !lsGet(APP_MODE_KEY)) { applyAppMode('business', false); const m = document.getElementById('modeOnboardingModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } return; }
    return orig.apply(this, arguments);
  };
  const origGuest = window.maybeOfferGuestImport;
  window.maybeOfferGuestImport = function () { if (isTeamMode()) return; return origGuest.apply(this, arguments); };
})();
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  [['memberEditModal', closeMemberEditor], ['teamModal', closeTeamModal], ['wsModal', closeWorkspaceSwitcher]].forEach(([id, fn]) => {
    const m = document.getElementById(id); if (m && !m.classList.contains('hidden')) fn();
  });
});

/* =========================================================
   V20.8 — Login page, lock thePIN-Install menu
   ========================================================= */
const GUEST_SESSION_KEY = 'a7sbly_guest_session_v1';
const PIN_FAIL_KEY = 'a7sbly_pin_fail_v1';
const INSTALL_DESKTOP_KEY = 'a7sbly_install_desktop_next_v1';
const INSTALL_DONE_KEY = 'a7sbly_installed_v1';
const INSTALL_DESKTOP_COOLDOWN = 30 * 24 * 3600 * 1000;   // Computer: Once every 30days
const PIN_MAX_TRIES = 5;
const PIN_LOCKOUT_MS = 30 * 1000;

/* ---------- Platform Tools ----------*/
function _plat() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|Twitter|TikTok|MicroMessenger/i.test(ua);
  const safariIOS = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo/.test(ua);
  return { ios, android, mobile: ios || android || /Mobi/i.test(ua), inApp, safariIOS, desktop: !(ios || android || /Mobi/i.test(ua)) };
}
function isAppStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://');
}
/* v20.10.8 — pop-ups do not return a result inside a TWA, Electron, or an
   in-app browser. Those environments must use Firebase redirect sign-in. */
function _needsAuthRedirect() {
  try {
    if (typeof isAppStandalone === 'function' && isAppStandalone()) return true;
    if (/Electron/i.test(navigator.userAgent || '')) return true;
    if (_plat().inApp) return true;
  } catch (e) {}
  return false;
}

/* =========================================================
   1) Login
   ========================================================= */
function showLoginError(msg) {
  const el = document.getElementById('loginError'); if (!el) return;
  el.textContent = msg; el.hidden = false;
}
function clearLoginError() { const el = document.getElementById('loginError'); if (el) { el.hidden = true; el.textContent = ''; } }
function setGoogleBusy(busy) {
  const btn = document.getElementById('googleLoginBtn'); if (!btn) return;
  btn.disabled = busy; btn.classList.toggle('busy', busy); btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  const t = btn.querySelector('.lg-g-t'); if (t) t.textContent = busy ? 'Connecting to Google...' : 'Log in with a Google account';
}
function _loginErrorText(code) {
  return ({
    'auth/network-request-failed': 'There is no internet connection. Check the network and try again.',
    'auth/unauthorized-domain': 'This domain is not added toFirebase (Authorized domains). Add it from settingsAuthentication.',
    'auth/operation-not-allowed': 'Login Google is not activatedFirebase.',
    'auth/too-many-requests': 'Many attempts. Wait a while and try again.',
    'auth/user-disabled': 'This accountSuspended. Connect withManagement.',
    'auth/web-storage-unsupported': 'The browser prevents cookies from being stored. Activate itOr Open the site in Another browser.',
    'auth/operation-not-supported-in-this-environment': 'This browser does not supportLogin With Google.Open the site in Chrome Or Safari.',
    'auth/account-exists-with-different-credential': 'This email is registered with a different login method.'
  })[code] || '';
}
async function handleRedirectResult() {
  try {
    const result = await auth.getRedirectResult();
    if (result && result.user) { _afterGoogleSuccess(); showToast(`Welcome, my friend${result.user.displayName || 'friend'} 👋`, 'success'); }
  } catch (error) {
    const t = _loginErrorText(error && error.code);
    if (t) { showLoginError(t); }
  }
}
(function hookLoginWall() {
  const orig = window.showLoginWall;
  window.showLoginWall = function () {
    const r = orig.apply(this, arguments);
    window._googleBusy = false; setGoogleBusy(false); clearLoginError();
    const ib = document.getElementById('loginInstallBtn'); if (ib) ib.hidden = isAppStandalone();
    return r;
  };
  const og = window.loginAsGuest;
  window.loginAsGuest = function () {
    localStorage.setItem(GUEST_SESSION_KEY, '1');
    return og.apply(this, arguments);
  };
  const oh = window.hideAuthLoading;
  window.hideAuthLoading = function () {
    const r = oh.apply(this, arguments);
    clearTimeout(window._authSlowT); clearTimeout(window._authFailT);
    const s = document.getElementById('authSlow'); if (s) s.hidden = true;
    if (typeof scheduleInstallPrompt === 'function') scheduleInstallPrompt(1400);
    return r;
  };
})();
// If the account verification is suspended (weak internet): We reassure theUserThen we insert it instead of what is preferred on the L screendownload
window._authSlowT = setTimeout(() => { const s = document.getElementById('authSlow'); if (s && document.body.classList.contains('auth-pending')) s.hidden = false; }, 6000);
window._authFailT = setTimeout(() => {
  if (!document.body.classList.contains('auth-pending')) return;
  hideAuthLoading();
  if (localStorage.getItem(GUEST_SESSION_KEY) === '1') { window._guestSilent = true; loginAsGuest(); window._guestSilent = false; }
  else { showLoginWall(); showLoginError('Connection is slow. You canIncome As a visitor nowOr Try again.'); }
}, 12000);

function closeAllOverlays() {
  document.querySelectorAll('[id$="Modal"]').forEach(m => {
    if (m.id === 'mobileInstallModal') return;
    m.classList.add('hidden'); m.classList.remove('flex');
  });
  try { closeQuickAdd(false); } catch (e) {}
}

/* =========================================================
   2) Unified number plate (lock+ create code)
   ========================================================= */
function createPinPad(host, opts) {
  const o = Object.assign({ maxLen: 6, minLen: 4, onSubmit() {}, onChange() {} }, opts);
  host.classList.add('pn');
  host.innerHTML =
    `<div class="pn-dots" aria-live="polite">${'<i></i>'.repeat(o.maxLen)}</div>` +
    `<div class="pn-keys">` +
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" class="pn-key" data-k="${n}" aria-label="${n}">${n}</button>`).join('') +
    `<button type="button" class="pn-key pn-aux" data-k="back" aria-label="to survey"><i class="fa-solid fa-delete-left"></i></button>` +
    `<button type="button" class="pn-key" data-k="0" aria-label="0">0</button>` +
    `<button type="button" class="pn-key pn-ok" data-k="ok" aria-label="to be sure" disabled><i class="fa-solid fa-check"></i></button>` +
    `</div>`;
  const dots = Array.from(host.querySelectorAll('.pn-dots i'));
  const okBtn = host.querySelector('.pn-ok');
  let value = '', locked = false, submitTimer = null;
  const api = {
    get value() { return value; },
    press(k) {
      if (locked) return;
      clearTimeout(submitTimer);
      if (k === 'back') value = value.slice(0, -1);
      else if (k === 'ok') { if (value.length >= o.minLen) o.onSubmit(value); return; }
      else if (/^\d$/.test(k) && value.length < o.maxLen) value += k;
      else return;
      render();
      if (value.length === o.maxLen) submitTimer = setTimeout(() => o.onSubmit(value), 140);
    },
    reset() { clearTimeout(submitTimer); value = ''; render(); },
    shake() {
      host.classList.remove('shake'); void host.offsetWidth; host.classList.add('shake');
      if (navigator.vibrate) { try { navigator.vibrate([60, 40, 60]); } catch (e) {} }
    },
    setLocked(b) { locked = !!b; host.classList.toggle('locked', locked); host.querySelectorAll('.pn-key').forEach(k => { k.disabled = locked || (k.classList.contains('pn-ok') && value.length < o.minLen); }); }
  };
  function render() {
    dots.forEach((d, i) => d.classList.toggle('on', i < value.length));
    okBtn.disabled = locked || value.length < o.minLen;
    o.onChange(value);
  }
  host.addEventListener('click', e => { const b = e.target.closest('.pn-key'); if (b && !b.disabled) api.press(b.getAttribute('data-k')); });
  render();
  return api;
}
let _lockPad = null, _setupPad = null;
function _activePad() {
  const lock = document.getElementById('lockScreen');
  if (lock && !lock.classList.contains('hidden')) return _lockPad;
  const m = document.getElementById('pinModal');
  if (m && !m.classList.contains('hidden')) return _setupPad;
  return null;
}
document.addEventListener('keydown', e => {
  const pad = _activePad(); if (!pad || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[0-9]$/.test(e.key)) { pad.press(e.key); e.preventDefault(); }
  else if (e.key === 'Backspace') { pad.press('back'); e.preventDefault(); }
  else if (e.key === 'Enter') { pad.press('ok'); e.preventDefault(); }
});

/* ---------- Lock screen ----------*/
let _lockTimer = null;
function _pinFailState() { try { return JSON.parse(lsGet(PIN_FAIL_KEY) || '{}'); } catch (e) { return {}; } }
function _renderLockState() {
  const err = document.getElementById('unlockError');
  const st = _pinFailState();
  const left = Math.ceil(((st.until || 0) - Date.now()) / 1000);
  clearInterval(_lockTimer);
  if (left > 0) {
    _lockPad && _lockPad.setLocked(true);
    err.hidden = false; err.textContent = `A lot of wrong attempts— Try again${left} second`;
    _lockTimer = setInterval(() => {
      const l = Math.ceil(((_pinFailState().until || 0) - Date.now()) / 1000);
      if (l <= 0) { clearInterval(_lockTimer); _lockPad && _lockPad.setLocked(false); err.hidden = true; }
      else err.textContent = `A lot of wrong attempts— Try again${l} second`;
    }, 500);
  } else { _lockPad && _lockPad.setLocked(false); }
}
function showPinLock() {
  if (isPortalModeActive) return;
  lsDel(PIN_ACTIVE_KEY);
  const el = document.getElementById('lockScreen');
  if (!_lockPad) _lockPad = createPinPad(document.getElementById('lkPad'), {
    onSubmit: pin => { document.getElementById('unlockPinInput').value = pin; unlockApp(); },
    onChange: v => { const e = document.getElementById('unlockError'); if (v && v.length && e && !(_pinFailState().until > Date.now())) e.hidden = true; }
  });
  _lockPad.reset();
  el.classList.remove('hidden'); el.classList.add('flex');
  const name = document.getElementById('lkUser');
  if (name) name.textContent = (currentUser && (currentUser.displayName || currentUser.email)) || '';
  const av = document.getElementById('lkAvatar');
  if (av) av.src = (currentUser && currentUser.photoURL) ? currentUser.photoURL : 'logo.png';
  const fb = document.getElementById('lkForgot'); if (fb) fb.innerHTML = '<i class="fa-solid fa-key"></i> Forgot the code?';
  document.getElementById('unlockError').hidden = true;
  _renderLockState();
}
async function unlockApp() {
  const input = document.getElementById('unlockPinInput');
  const entered = (input.value || '').trim();
  const stored = getPin();
  if (!stored) { hidePinLock(); return; }
  const st0 = _pinFailState();
  if ((st0.until || 0) > Date.now()) { _renderLockState(); return; }
  let ok = false;
  try { ok = await verifyPin(entered); } catch (e) { ok = false; }
  const err = document.getElementById('unlockError');
  if (ok) {
    lsDel(PIN_FAIL_KEY);
    input.value = ''; if (_lockPad) _lockPad.reset();
    hidePinLock();
    if (!parsePinRecord(stored)) { try { await savePinEverywhere(entered); updatePinUI(); } catch (e) { /* He will be promoted next time*/ } }
    return true;
  }
  const st = _pinFailState();
  const count = (st.count || 0) + 1;
  input.value = '';
  if (count >= PIN_MAX_TRIES) {
    lsSet(PIN_FAIL_KEY, JSON.stringify({ count: 0, until: Date.now() + PIN_LOCKOUT_MS }));
    if (_lockPad) { _lockPad.reset(); _lockPad.shake(); }
    _renderLockState();
  } else {
    lsSet(PIN_FAIL_KEY, JSON.stringify({ count, until: 0 }));
    err.hidden = false; { const rem = PIN_MAX_TRIES - count; err.textContent = 'The code is incorrect— ' + (rem === 1 ? 'One attempt left' : rem === 2 ? 'Two attempts remaining' : `Remaining ${rem} attempts`); }
    if (_lockPad) { _lockPad.reset(); _lockPad.shake(); }
  }
  return false;
}
async function forgotPinUnlock() {
  if (!currentUser) return;
  const user = currentUser;
  if (!isRealCloudUser()) {   // Visitor: There is no identity to verify→ Remove the lock You wipeVisitor data
    openConfirm('Forgot the code?', 'Remove the lock In visitor mode<b>You will erase everythingVisitor data</b> Saved on the device, because there is no account to verify. Continue?', () => {
      const suffix = '::' + user.uid;
      Object.keys(localStorage).filter(k => k.endsWith(suffix)).forEach(k => localStorage.removeItem(k));
      transactions = []; inventoryItems = []; recurringExpenses = []; chargeMachines = []; categoryBudgets = {};
      hidePinLock(); loadAllLocal(); refreshAll(); updatePinUI();
      showToast('has been erasedVisitor data andRemove the lock', 'info');
    });
    return;
  }
  const providers = (user.providerData || []).map(p => p.providerId);
  try {
    if (providers.includes('google.com')) {
      const res = await user.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
      if (res.user && res.user.uid === user.uid) { await clearPinEverywhere(); updatePinUI(); hidePinLock(); showToast('Verified— The lock was removed', 'success'); }
    } else {
      const pwd = prompt('AIncome Password forto be sure Your ID:');
      if (!pwd) return;
      await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, pwd));
      await clearPinEverywhere(); updatePinUI(); hidePinLock(); showToast('Verified— The lock was removed', 'success');
    }
  } catch (error) {
    const c = error && error.code;
    if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return;
    showToast(c === 'auth/popup-blocked' ? 'The browser blocks the verification window. Allow pop-ups and try again.' : 'Identity verification failed. Try logging outIncome Again.', 'error');
  }
}

/* ---------- Create/change the code (two steps: write and thento be sure) ---------- */
let _setupStep = 1, _setupFirst = '';
function _setupUI() {
  const s1 = document.getElementById('pnStep1'), s2 = document.getElementById('pnStep2');
  if (s1) s1.classList.toggle('on', true); if (s2) s2.classList.toggle('on', _setupStep === 2);
  const had = !!getPin();
  document.getElementById('pinTitle').textContent = _setupStep === 1 ? (had ? 'Change the lock code' : 'Create a lock code') : 'Confirm the code';
  document.getElementById('pinSub').textContent = _setupStep === 1 ? 'Choose a 4 to 6 digit code' : 'Type the same code again forto be sure';
}
function _setupError(msg) { const e = document.getElementById('pinError'); e.textContent = msg || ''; e.hidden = !msg; }
function openPinModal() {
  if (!requireAuth()) return;
  closeMenus();
  const m = document.getElementById('pinModal');
  if (!_setupPad) _setupPad = createPinPad(document.getElementById('pinPadHost'), { onSubmit: pinSetupSubmit, onChange: v => { if (v && v.length) _setupError(''); } });
  _setupStep = 1; _setupFirst = ''; _setupPad.reset(); _setupError('');
  _setupUI();
  document.getElementById('pinRemoveBtn').hidden = !getPin();
  m.classList.remove('hidden'); m.classList.add('flex');
}
function closePinModal() {
  const m = document.getElementById('pinModal');
  if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}
async function pinSetupSubmit(pin) {
  if (!/^\d{4,6}$/.test(pin)) { _setupError('The code must be 4To 6 numbers'); _setupPad.shake(); return; }
  if (_setupStep === 1) { _setupFirst = pin; _setupStep = 2; _setupPad.reset(); _setupUI(); return; }
  if (pin !== _setupFirst) {
    _setupError('The two symbols are not identical— Start from theOrto');
    _setupPad.shake(); _setupStep = 1; _setupFirst = ''; _setupPad.reset(); _setupUI(); return;
  }
  try { await savePinEverywhere(pin); }
  catch (e) { _setupError('Unable toSave code, check the connection and try again'); _setupPad.reset(); return; }
  closePinModal(); updatePinUI(); markPinActive();
  showToast('App lock is activated✓', 'success');
}
function handlePinAction() { if (_setupPad) _setupPad.press('ok'); }
function removePinFlow() {
  openConfirm('remove App lock?', 'The application will open without a code on all your devices.', async () => {
    try { await clearPinEverywhere(); } catch (e) { showToast('I could not remove the lock', 'error'); return; }
    updatePinUI(); closePinModal(); showToast('DoneRemove the lock', 'info');
  });
}

/* =========================================================
   3) existingInstall the application
   - Computer: Once every 30days
   - Mobile: every time you open the website (as long as it is not installed)
   ========================================================= */
let _installTimer = null, _installShownThisLoad = false;
function installEligible() {
  if (isAppStandalone()) return false;
  if (localStorage.getItem(INSTALL_DONE_KEY) === '1') return false;
  if (isPortalModeActive || new URLSearchParams(location.search).has('client')) return false;
  const p = _plat();
  return p.mobile ? true : !!deferredInstallPrompt;
}
function _installBlocked() {
  if (document.body.classList.contains('auth-pending')) return true;
  const vis = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; };
  const sus = document.getElementById('suspendedScreen');
  return vis('lockScreen') || vis('modeOnboardingModal') || vis('teamInviteModal') || vis('guestImportModal') || (sus && !sus.hidden) || !!(typeof _tourDriver !== 'undefined' && _tourDriver) || (!!currentUser && typeof TOUR_DONE_KEY !== 'undefined' && localStorage.getItem(TOUR_DONE_KEY) !== 'true');
}
function scheduleInstallPrompt(delay = 1200) {
  clearTimeout(_installTimer);
  if (_installShownThisLoad || !installEligible()) return;
  const p = _plat();
  if (!p.mobile && Date.now() < Number(localStorage.getItem(INSTALL_DESKTOP_KEY) || 0)) return;
  const deadline = Date.now() + 60000;
  const tick = () => {
    if (_installShownThisLoad || !installEligible()) return;
    if (_installBlocked()) { if (Date.now() < deadline) _installTimer = setTimeout(tick, 900); return; }
    _installShownThisLoad = true;
    if (!p.mobile) localStorage.setItem(INSTALL_DESKTOP_KEY, String(Date.now() + INSTALL_DESKTOP_COOLDOWN));
    showMobileInstallModal();
  };
  _installTimer = setTimeout(tick, delay);
}
function showMobileInstallModal() {
  const modal = document.getElementById('mobileInstallModal'); if (!modal) return;
  const p = _plat();
  const set = (id, fn) => { const e = document.getElementById(id); if (e) fn(e); };
  set('insDevice', e => { e.textContent = p.ios ? 'iPhone' : p.android ? 'Mobile' : 'Computer'; });
  const hasPrompt = !!deferredInstallPrompt;
  set('insIos', e => { e.hidden = !p.ios; });
  set('insIosWarn', e => { e.hidden = !(p.ios && !p.safariIOS); });
  set('insManual', e => { e.hidden = p.ios || hasPrompt; });
  set('insManualText', e => {
    e.innerHTML = p.android
      ? 'From the browser menu<b>⋮</b> to choose <b>«Install the application»</b> Or <b>«Add to home screen»</b>.'
      : 'Press Installation icon<b>⊕</b> In the address bar,Or From the browser menuto choose <b>«stabilizinga7sbly»</b>.';
  });
  set('mobileInstallAcceptBtn', btn => {
    btn.hidden = !hasPrompt;
    btn.innerHTML = `<i class="fa-solid fa-download"></i> <span>Install on${p.android ? 'Mobile' : 'Computer'} now</span>`;
  });
  set('insLater', e => { e.textContent = (p.ios || (!hasPrompt)) ? 'Okay,I understand' : 'Not now'; });
  modal.classList.remove('hidden'); modal.classList.add('flex');
  requestAnimationFrame(() => modal.classList.add('open'));
}
function dismissMobileInstall() {
  const modal = document.getElementById('mobileInstallModal'); if (!modal) return;
  modal.classList.remove('open');
  setTimeout(() => { if (!modal.classList.contains('open')) { modal.classList.add('hidden'); modal.classList.remove('flex'); } }, 230);
}
async function triggerMobileAppInstall() {
  if (!deferredInstallPrompt) return;
  try {
    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') { localStorage.setItem(INSTALL_DONE_KEY, '1'); showToast('My neighborInstall the application 🎉', 'success'); }
    else showToast('You can install it at any timeSettings', 'info');
  } catch (err) { console.warn('install prompt error', err); }
  deferredInstallPrompt = null;
  dismissMobileInstall();
}
function installApp() { showMobileInstallModal(); }
function checkForcedInstallDialog() { scheduleInstallPrompt(600); }
function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    scheduleInstallPrompt(900);
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    localStorage.setItem(INSTALL_DONE_KEY, '1');
    dismissMobileInstall();
    showToast('It was completedInstall the application Successfully🎉', 'success');
  });
  if (isAppStandalone()) {
    document.body.classList.add('pwa-standalone');
    localStorage.setItem(INSTALL_DONE_KEY, '1');   //Already installed on this device  
  } else {
    scheduleInstallPrompt(1500);
  }
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const m = document.getElementById('mobileInstallModal');
  if (m && !m.classList.contains('hidden')) dismissMobileInstall();
  const pm = document.getElementById('pinModal');
  if (pm && !pm.classList.contains('hidden')) closePinModal();
});

/* =========================================================
   V20.9 — windowRecord the process (Simplified and smooth interface)
   ========================================================= */
function txAddAmount(n) {
  const el = document.getElementById('formAmount'); if (!el) return;
  el.value = n === 0 ? '' : String(Math.round(((Number(el.value) || 0) + n) * 100) / 100);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus({ preventScroll: true });
}
function _txChips(hostId, select, onPick) {
  const host = document.getElementById(hostId); if (!host || !select) return;
  host.replaceChildren();
  Array.from(select.options).forEach(o => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tx-chip' + (o.value === select.value ? ' on' : '');
    b.textContent = o.textContent; b.setAttribute('aria-pressed', o.value === select.value ? 'true' : 'false');
    b.addEventListener('click', () => {
      select.value = o.value;
      host.querySelectorAll('.tx-chip').forEach(c => { const on = c === b; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      if (onPick) onPick(o.value);
    });
    host.appendChild(b);
  });
}
function txSyncUI() {
  const modal = document.getElementById('transactionModal'); if (!modal) return;
  const sheet = modal.querySelector('.tx-sheet');
  const sel = document.querySelector('input[name="txType"]:checked');
  if (sheet && sel) sheet.setAttribute('data-type', sel.value);
  _txChips('txCatChips', document.getElementById('formCategory'));
  _txChips('txPayChips', document.getElementById('formPaymentMethod'));
  const more = document.getElementById('txMore');
  if (more) more.open = !!((document.getElementById('formReference') || {}).value || currentReceiptData);
}
(function hookTransactionModal() {
  const otc = window.onTypeChange;
  window.onTypeChange = function () { const r = otc.apply(this, arguments); try { txSyncUI(); } catch (e) { console.warn(e); } return r; };
  const om = window.openModal;
  window.openModal = function () {
    const r = om.apply(this, arguments);
    const m = document.getElementById('transactionModal');
    if (m && !m.classList.contains('hidden')) { try { txSyncUI(); } catch (e) { console.warn(e); } }
    return r;
  };
})();
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const m = document.getElementById('transactionModal');
  if (!m || m.classList.contains('hidden')) return;
  const c = document.getElementById('confirmModal');
  if (c && !c.classList.contains('hidden')) return;
  closeModal();
});

/* ---------- Browser/system bar color depending onAppearance ---------- */
function syncThemeColorMeta() {
  const dark = document.documentElement.classList.contains('dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0f1117' : '#f1f5f9');
}
(function hookThemeColor() {
  const at = window.applyTheme;
  if (typeof at === 'function') window.applyTheme = function () { const r = at.apply(this, arguments); syncThemeColorMeta(); return r; };
  document.addEventListener('DOMContentLoaded', syncThemeColorMeta);
  syncThemeColorMeta();
})();

/* =========================================================
   V20.10 — numbersClients + Direct WhatsApp reminder+ New claim card+ Google logging stability
   ========================================================= */
const CLIENT_PHONES_KEY = 'ehsebli_client_phones_v1';

/* ---------- numbersClients ---------- */
function _ckey(name) { return String(name || '').trim().toLowerCase().slice(0, 80); }
function normalizePhone(raw) {
  let d = String(raw || '').replace(/[0-9]/g, c => String('0123456789'.indexOf(c))).replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '20' + d.slice(1);            // 010... → 2010...
  else if (d.length === 10 && d.startsWith('1')) d = '20'+ d;   // 10xxxxxxxxx (without zero)  
  return /^\d{10,15}$/.test(d) ? d : '';
}
function formatPhoneDisplay(intl) { return (intl && intl.startsWith('20') && intl.length === 12) ? '0' + intl.slice(2) : (intl ? '+' + intl : ''); }
function getClientPhone(name) { const p = clientPhones[_ckey(name)]; return p ? p.phone : ''; }
function sanitizeClientPhones(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  Object.keys(obj).slice(0, 500).forEach(k => {
    const v = obj[k]; const phone = normalizePhone(v && v.phone);
    if (phone && k) out[String(k).slice(0, 80)] = { name: sanitizeString((v && v.name) || k, 60), phone };
  });
  return out;
}
function loadClientPhones() { clientPhones = sanitizeClientPhones(_safeJSON(lsGet(CLIENT_PHONES_KEY), {})); }
function saveClientPhones() {
  lsSet(CLIENT_PHONES_KEY, JSON.stringify(clientPhones));
  if (isRealCloudUser()) syncToCloud();
}
function setClientPhone(name, raw) {
  const phone = normalizePhone(raw);
  if (!name || !String(name).trim() || !phone) return false;
  clientPhones[_ckey(name)] = { name: String(name).trim().slice(0, 60), phone };  // key capped by _ckey()
  saveClientPhones();
  return true;
}
function removeClientPhone(name) { delete clientPhones[_ckey(name)]; saveClientPhones(); }

/* ---------- Window NoClient ---------- */
let _cpName = '', _cpCallback = null;
function askClientPhone(name, callback) {
  _cpName = name; _cpCallback = callback || null;
  const m = document.getElementById('clientPhoneModal'); if (!m) return;
  document.getElementById('cpSub').textContent = 'Client: ' + name;
  const cur = getClientPhone(name);
  const input = document.getElementById('cpInput'); input.value = cur ? formatPhoneDisplay(cur) : '';
  document.getElementById('cpError').hidden = true;
  document.getElementById('cpSend').hidden = !callback;
  document.getElementById('cpSave').className = 'gim-btn' + (callback ? '' : ' gim-btn-p');
  m.classList.remove('hidden'); m.classList.add('flex');
  setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) {} }, 120);
}
function closeClientPhoneModal() { const m = document.getElementById('clientPhoneModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } _cpCallback = null; }
function saveClientPhoneFromModal(andSend) {
  const input = document.getElementById('cpInput'); const err = document.getElementById('cpError');
  const raw = input.value.trim();
  if (!raw && getClientPhone(_cpName)) { removeClientPhone(_cpName); const cb0 = null; closeClientPhoneModal(); refreshClientViews(); showToast('It was completeddelete Number', 'info'); return cb0; }
  if (!setClientPhone(_cpName, raw)) { err.textContent = 'Enter a valid number (example: 01012345678)'; err.hidden = false; return; }
  const cb = _cpCallback;
  closeClientPhoneModal(); refreshClientViews();
  showToast('It was completedSave numberClient ✓', 'success');
  if (andSend && cb) setTimeout(cb, 200);
}
document.addEventListener('keydown', e => {
  const m = document.getElementById('clientPhoneModal');
  if (!m || m.classList.contains('hidden')) return;
  if (e.key === 'Escape') closeClientPhoneModal();
  else if (e.key === 'Enter' && e.target && e.target.id === 'cpInput') { e.preventDefault(); saveClientPhoneFromModal(!document.getElementById('cpSend').hidden); }
});
function refreshClientViews() { try { renderClients(); renderDebts(); } catch (e) {} }

/* ---------- Direct WhatsApp ----------*/
function openWhatsAppTo(phone, text) {
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  const w = window.open(url, '_blank', 'noopener');
  if (!w) location.href = url;
}
function _shopSignature() { return (currentUser && currentUser.displayName) ? currentUser.displayName : 'a7sbly'; }
function _fmtDueAr(dateStr) { try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return dateStr; } }
function buildDebtReminderText(d) {
  const i = _debtInfo(d);
  const name = d.client || 'you';
  const lines = [`Peace be upon you${name} 🌸`];
  if (i.overdue) lines.push(`We will inform you of the date of payment of the due past due date${_fmtDueAr(d.dueDate)}.`);
  else lines.push('A friendly reminder about what’s dueNext:');
  lines.push('', `📌 ${d.notes || d.category || 'service'}`, `📅 dated${_fmtDueAr(d.date)}`);
  if (i.paid > 0) lines.push(`💵 I shoot:${money(i.paid)} EGP from${money(i.total)} EGP`);
  lines.push(`💰 *residual: ${money(i.rem)} EGP*`);
  if (!i.overdue && d.dueDate) lines.push(`⏰ Payment deadline: ${_fmtDueAr(d.dueDate)}`);
  lines.push('', 'If you have already paid, ignore the message🙏If you have any questions, I am at your disposal.', `— ${_shopSignature()}`);
  return lines.join('\n');
}
function sendDebtReminder(debtId) {
  const d = transactions.find(t => t.id === debtId);
  if (!d) return;
  if (!d.client || !d.client.trim()) { showToast('WriteCustomer name In religionOrl (edit←  Customer name)', 'error'); return; }
  const phone = getClientPhone(d.client);
  if (!phone) { askClientPhone(d.client, () => sendDebtReminder(debtId)); return; }
  openWhatsAppTo(phone, buildDebtReminderText(d));
}
function remindClient(name) {
  const phone = getClientPhone(name);
  if (!phone) { askClientPhone(name, () => remindClient(name)); return; }
  const pending = getActiveTransactions().filter(t => t.type === 'debt_receivable' && t.client && _ckey(t.client) === _ckey(name) && t.status !== 'paid')
    .map(t => ({ t, i: _debtInfo(t) })).filter(x => x.i.rem > 0);
  if (!pending.length) { openWhatsAppTo(phone, `Peace be upon you${name} 🌸\nHow are you?${_shopSignature()}`); return; }
  const total = pending.reduce((s, x) => s + x.i.rem, 0);
  const lines = [`Peace be upon you${name} 🌸`, 'A friendly reminder of the following dues:', ''];
  pending.slice(0, 5).forEach(x => lines.push(`• ${x.t.notes || x.t.category || 'service'} (${x.t.date}): ${money(x.i.rem)}EGP${x.i.overdue ?' ⚠️ late' : ''}`));
  if (pending.length > 5) lines.push(`… and${pending.length - 5} OperationsOther`);
  lines.push('', `💰 *Total remaining:   ${money(total)}EGP*`,   '', 'If you have already paid, ignore the message🙏', `— ${_shopSignature()}`);
  openWhatsAppTo(phone, lines.join('\n'));
}

/* ---------- Claim card (Image New professionalism) ----------*/
/* =========================================================
   v20.10.7 — guaranteed debt-reminder card image.
   If the rich canvas cannot be exported (tainted receipt, missing
   logo, slow font load), redraw a clean untainted card so the
   preview and WhatsApp share always contain a real image.
   ========================================================= */
function _drawFallbackDebtCard(d, canvas) {
  const total = Number((d && d.amount) || 0);
  const paid = Number((d && d.paidAmount) || 0);
  const rem = Math.max(0, total - paid);
  canvas.width = 900; canvas.height = 620;
  const c = canvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, 900, 620);
  c.direction = 'rtl'; c.textBaseline = 'alphabetic';
  const g = c.createLinearGradient(0, 0, 900, 250);
  g.addColorStop(0, '#ea580c'); g.addColorStop(.55, '#f97316'); g.addColorStop(1, '#fbbf24');
  c.fillStyle = g; c.fillRect(0, 0, 900, 250);
  c.fillStyle = 'rgba(255,255,255,.13)';
  c.beginPath(); c.arc(130, 45, 155, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(860, 235, 115, 0, Math.PI * 2); c.fill();
  c.textAlign = 'right'; c.fillStyle = '#fff';
  c.font = '900 46px Cairo, "Segoe UI", sans-serif'; c.fillText('تذكير بالسداد', 820, 108);
  c.font = '700 22px Cairo, "Segoe UI", sans-serif'; c.fillText((typeof _shopSignature === 'function' ? _shopSignature() : 'احسبلي | a7sbly'), 820, 148);
  c.save(); c.shadowColor = 'rgba(15,23,42,.18)'; c.shadowBlur = 35; c.shadowOffsetY = 12;
  c.fillStyle = '#fff'; _rr(c, 40, 210, 820, 340, 38); c.fill(); c.restore();
  c.textAlign = 'right'; c.fillStyle = '#0f172a';
  c.font = '900 36px Cairo, "Segoe UI", sans-serif'; c.fillText(_fit(c, 'العميل: ' + ((d && d.client) || 'عميل'), 620), 810, 300);
  c.fillStyle = '#64748b'; c.font = '700 22px Cairo, "Segoe UI", sans-serif';
  c.fillText(_fit(c, (d && (d.notes || d.category)) || 'مستحقات', 620), 810, 342);
  c.fillStyle = i_color(total, paid);
  c.font = '900 64px Cairo, "Segoe UI", sans-serif'; c.fillText(money(rem) + ' EGP', 810, 425);
  c.textAlign = 'center'; c.fillStyle = '#475569'; c.font = '700 20px Cairo, "Segoe UI", sans-serif';
  c.fillText('يرجى التكرم بالسداد في أقرب وقت ممكن', 450, 510);
  c.fillStyle = '#ea580c'; c.font = '800 20px Cairo, "Segoe UI", sans-serif';
  c.fillText('شكراً لحسن تعاملكم 🤍  |  احسبلي | a7sbly', 450, 548);
  return canvas;
}
function i_color(total, paid) {
  if (paid > 0 && paid >= total) return '#059669';
  return '#ea580c';
}
function _canvasExportable(canvas) {
  try { const u = canvas && canvas.toDataURL('image/png'); return !!(u && u.length > 60); }
  catch (e) { return false; }
}

function safeCanvasToBlob(canvas, cb, type, quality) {
  let retried = false;
  const done = blob => {
    if (!blob && !retried && currentCardDebt && canvas) {
      retried = true;
      try { _drawFallbackDebtCard(currentCardDebt, canvas); canvas.toBlob(done, type, quality); return; }
      catch (e) {}
    }
    cb(blob);
  };
  try { canvas.toBlob(done, type, quality); }
  catch (e) {
    console.warn('Canvas export blocked (cross-origin image):', e);
    if (!retried && currentCardDebt && canvas) {
      retried = true;
      try { _drawFallbackDebtCard(currentCardDebt, canvas); canvas.toBlob(done, type, quality); return; }
      catch (e2) {}
    }
    cb(null);
  }
}
function safeCanvasToDataURL(canvas, type, quality) {
  let retried = false;
  const attempt = () => {
    try {
      const url = canvas.toDataURL(type, quality);
      if (url && url.length > 60) return url;
    } catch (e) { console.warn('Canvas export blocked (cross-origin image):', e); }
    if (!retried && currentCardDebt && canvas) {
      retried = true;
      try { _drawFallbackDebtCard(currentCardDebt, canvas); return attempt(); }
      catch (e2) {}
    }
    return '';
  };
  return attempt();
}
function _loadImg(src) {
  return new Promise(res => {
    if (!src) return res(null);
    const im = new Image();
    // Firebase Storage receipts are cross-origin: without this the canvas is tainted
    // and toBlob()/toDataURL() throw SecurityError on real phones.
    if (/^https?:\/\//i.test(String(src))) im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}
function _fit(ctx, text, maxW) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function _rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
async function drawDebtCardCanvas(d, canvas) {
  const i = _debtInfo(d);
  try { await Promise.all([document.fonts.load('900 40px Cairo'), document.fonts.load('700 24px Cairo')]); } catch (e) {}
  const [logo, receipt] = await Promise.all([_loadImg('logo.png'), _loadImg(d.receipt)]);
  const W = 900, PAD = 40, CX = 40, CW = W - 80;
  const rows = [['Service /Description', d.notes || d.category || '—'], ['dateTransaction', _fmtDueAr(d.date)]];
  if (d.dueDate) rows.push(['Payment deadline', _fmtDueAr(d.dueDate)]);
  rows.push(['Total amount', `${money(i.total)}EGP`]);  
  if (i.paid > 0) rows.push(['Settled', `${money(i.paid)}EGP`]);  
  const phone = getClientPhone(d.client);
  const rcptH = receipt ? 230 : 0;
  const cardTop = 175, innerTop = cardTop + 40;
  const H = innerTop + 100 + 40 + 220 + 70 + rows.length * 64 + (receipt ? rcptH + 20 : 0) + 130 + 100;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.direction = 'rtl'; ctx.textBaseline = 'alphabetic';
  const F = (w, s) => `${w} ${s}px Cairo, "Segoe UI", sans-serif`;

  // Background
  ctx.fillStyle = '#eef2f7'; ctx.fillRect(0, 0, W, H);
  // Top bar
  const g = ctx.createLinearGradient(0, 0, W, 240); g.addColorStop(0, '#ea580c'); g.addColorStop(.55, '#f97316'); g.addColorStop(1, '#fbbf24');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 250);
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(120, 40, 150, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(W - 40, 230, 110, 0, Math.PI * 2); ctx.fill();
  // Logo+ the address
  const lx = W - PAD - 92;
  if (logo) { ctx.save(); _rr(ctx, lx, 38, 92, 92, 26); ctx.clip(); ctx.fillStyle = '#0c0d13'; ctx.fillRect(lx, 38, 92, 92); ctx.drawImage(logo, lx, 38, 92, 92); ctx.restore(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.8)'; _rr(ctx, lx, 38, 92, 92, 26); ctx.stroke(); }
  ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = F(900, 44); ctx.fillText('Payment reminder', lx - 22, 84);
  ctx.font = F(700, 22); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(_shopSignature(), lx - 22, 120);
  ctx.textAlign = 'left'; ctx.font = F(700, 20); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }), PAD, 70);

  // White card
  ctx.save(); ctx.shadowColor = 'rgba(15,23,42,.18)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#fff'; _rr(ctx, CX, cardTop, CW, H - cardTop - 90, 40); ctx.fill(); ctx.restore();

  let y = innerTop;
  // Client
  const ax = CX + CW - 38 - 36;
  ctx.fillStyle = '#fed7aa'; ctx.beginPath(); ctx.arc(ax, y + 38, 38, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c2410c'; ctx.textAlign = 'center'; ctx.font = F(900, 36); ctx.fillText((d.client || '?').charAt(0).toUpperCase(), ax, y + 51);
  ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = F(900, 34); ctx.fillText(_fit(ctx, d.client || 'Client', 430), ax - 54, y + 36);
  ctx.font = F(700, 20); ctx.fillStyle = '#64748b'; ctx.fillText(phone ? '📞 ' + formatPhoneDisplay(phone) : (d.category || 'Dues'), ax - 54, y + 70);
  // Status
  const st = i.isPaid ? ['Payment made✓', '#059669', '#d1fae5'] : i.overdue ? [`Late${Math.abs(i.dueDiff)}day`,'#be123c', '#ffe4e6']
    : (i.dueDiff !== null ? (i.dueDiff === 0 ? ['He deservestoday', '#b45309', '#fef3c7'] : [` is due within${i.dueDiff}day`,'#b45309', '#fef3c7']) : ['Payable', '#475569', '#e2e8f0']);
  ctx.font = F(800, 22); const pw = ctx.measureText(st[0]).width + 44;
  ctx.fillStyle = st[2]; _rr(ctx, CX + 36, y + 22, pw, 52, 26); ctx.fill();
  ctx.fillStyle = st[1]; ctx.textAlign = 'center'; ctx.fillText(st[0], CX + 36 + pw / 2, y + 57);
  y += 100;
  ctx.fillStyle = '#e2e8f0'; ctx.fillRect(CX + 36, y, CW - 72, 2); y += 50;

  // Amount residual
  ctx.textAlign = 'center'; ctx.font = F(700, 24); ctx.fillStyle = '#64748b'; ctx.fillText(i.isPaid ? 'Total amount' : 'Amount residual', W / 2, y);
  y += 86; const amtCol = i.isPaid ? '#059669' : (i.overdue ? '#e11d48' : '#ea580c');
  ctx.font = F(900, 92); ctx.fillStyle = amtCol; ctx.fillText(money(i.isPaid ? i.total : i.rem), W / 2 + 28, y);
  ctx.font = F(900, 30); ctx.fillStyle = '#94a3b8'; const aw = (ctx.font = F(900, 92), ctx.measureText(money(i.isPaid ? i.total : i.rem)).width); ctx.font = F(900, 30); ctx.fillText('EGP', W / 2 + 28 - aw / 2 - 40, y - 4);
  y += 50;
  // Payment bar
  const pct = i.total > 0 ? Math.min(100, Math.round((i.paid / i.total) * 100)) : 0;
  const bx = CX + 60, bw = CW - 120;
  ctx.fillStyle = '#e2e8f0'; _rr(ctx, bx, y, bw, 20, 10); ctx.fill();
  if (pct > 0) { const bg2 = ctx.createLinearGradient(bx, 0, bx + bw, 0); bg2.addColorStop(0, '#10b981'); bg2.addColorStop(1, '#34d399'); ctx.fillStyle = bg2; _rr(ctx, bx, y, Math.max(20, bw * pct / 100), 20, 10); ctx.fill(); }
  ctx.font = F(700, 20); ctx.fillStyle = '#64748b'; ctx.textAlign = 'right'; ctx.fillText(`Paid${money(i.paid)}Who   ${money(i.total)}EGP`, bx + bw, y + 52);
  ctx.textAlign = 'left'; ctx.fillStyle = '#059669'; ctx.font = F(900, 22); ctx.fillText(`${pct}%`, bx, y + 52);
  y += 90;

  // details
  rows.forEach((r, idx) => {
    if (idx % 2 === 0) { ctx.fillStyle = '#f8fafc'; _rr(ctx, CX + 30, y - 8, CW - 60, 58, 16); ctx.fill(); }
    ctx.textAlign = 'right'; ctx.font = F(700, 22); ctx.fillStyle = '#64748b'; ctx.fillText(r[0], CX + CW - 54, y + 30);
    ctx.textAlign = 'left'; ctx.font = F(800, 23); ctx.fillStyle = '#0f172a'; ctx.fillText(_fit(ctx, r[1], 430), CX + 54, y + 30);
    y += 64;
  });
  if (receipt) {
    y += 14; const rw = CW - 120, rh = rcptH - 10;
    ctx.save(); _rr(ctx, CX + 60, y, rw, rh, 20); ctx.clip();
    const sc = Math.max(rw / receipt.width, rh / receipt.height); ctx.drawImage(receipt, CX + 60 + (rw - receipt.width * sc) / 2, y + (rh - receipt.height * sc) / 2, receipt.width * sc, receipt.height * sc); ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = '#e2e8f0'; _rr(ctx, CX + 60, y, rw, rh, 20); ctx.stroke(); y += rcptH;
  }
  // conclusion
  y += 40; ctx.textAlign = 'center'; ctx.font = F(700, 22); ctx.fillStyle = '#475569';
  ctx.fillText('Please kindly make payment as soon as possible', W / 2, y); ctx.font = F(800, 22); ctx.fillStyle = '#ea580c'; ctx.fillText('Thank you Hassan TGeneralYou are with us🤍', W / 2, y + 40);
  ctx.font = F(800, 18); ctx.fillStyle = 'rgba(71,85,105,.7)'; ctx.fillText('a7sbly | a7sbly', W / 2, H - 38);
  return canvas;
}
async function openDebtCardModal(debtId) {
  const debt = transactions.find(t => t.id === debtId);
  if (!debt) return;
  currentCardDebt = debt;
  showToast('Design in progressClaim card...', 'info');
  const canvas = document.getElementById('debtCardCanvas');
  try { await drawDebtCardCanvas(debt, canvas); }
  catch (e) { console.warn(e); _drawFallbackDebtCard(debt, canvas); showToast('تم عرض البطاقة بصورة بسيطة', 'info'); }
  let dataUrl = safeCanvasToDataURL(canvas, 'image/png');
  if (!dataUrl) { _drawFallbackDebtCard(debt, canvas); dataUrl = safeCanvasToDataURL(canvas, 'image/png'); }
  const img = document.getElementById('debtCardImg'); if (img) img.src = dataUrl;
  const dl = document.getElementById('downloadDebtCardBtn');
  if (dl) { dl.href = dataUrl; dl.download = `Claim_${debt.client || 'Client'}_${debt.date}.png`; }
  const modal = document.getElementById('debtCardModal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
}
function closeDebtCardModal() {
  const m = document.getElementById('debtCardModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  currentCardDebt = null;
}
async function shareDebtCardImage() {
  const d = currentCardDebt, canvas = document.getElementById('debtCardCanvas'); if (!d || !canvas) return;
  if (!_canvasExportable(canvas)) _drawFallbackDebtCard(d, canvas);
  const blob = await new Promise(r => safeCanvasToBlob(canvas, r, 'image/png'));
  if (!blob) return;
  const file = new File([blob], `Claim_${d.client || 'Client'}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Claim card', text: buildDebtReminderText(d) }); return; }
  } catch (err) { if (err && err.name === 'AbortError') return; }
  let copied = false;
  try { if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); copied = true; } } catch (e) {}
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  showToast(copied ? 'TheImage andSaveHa— Paste it into WhatsApp' : 'It was completedSave theImage — Attach it to WhatsApp', 'success');
}

/* ---------- Number field on a formTransaction + Bar number on the account statement ----------*/
(function hookClientPhoneUI() {
  const bind = () => {
    const nameEl = document.getElementById('formClient'), phEl = document.getElementById('formClientPhone');
    if (!nameEl || !phEl || nameEl._phBound) return; nameEl._phBound = true;
    const fill = () => { const p = getClientPhone(nameEl.value); if (p && !phEl.value) phEl.value = formatPhoneDisplay(p); };
    nameEl.addEventListener('change', fill); nameEl.addEventListener('blur', fill); nameEl.addEventListener('input', () => { if (clientPhones[_ckey(nameEl.value)]) fill(); });
  };
  document.addEventListener('DOMContentLoaded', bind); bind();
  const om = window.openModal;
  window.openModal = function () {
    const r = om.apply(this, arguments);
    try { const nameEl = document.getElementById('formClient'), phEl = document.getElementById('formClientPhone'); if (phEl) { phEl.value = ''; if (nameEl && nameEl.value) { const p = getClientPhone(nameEl.value); if (p) phEl.value = formatPhoneDisplay(p); } } } catch (e) {}
    return r;
  };
  const hs = window.handleFormSubmit;
  window.handleFormSubmit = async function (e) {
    const nameEl = document.getElementById('formClient'), phEl = document.getElementById('formClientPhone');
    const name = nameEl && nameEl.value.trim(), raw = phEl && phEl.value.trim();
    const r = await hs.apply(this, arguments);
    try {
      const m = document.getElementById('transactionModal');
      if (name && raw && m && m.classList.contains('hidden')) {
        if (!setClientPhone(name, raw)) showToast('atSaveTTransaction — But a numberClient Not true, so we ignored it', 'info');
      }
    } catch (err) { console.warn(err); }
    return r;
  };
  const ol = window.openClientLedger;
  window.openClientLedger = function (clientName) {
    const r = ol.apply(this, arguments);
    try {
      const bar = document.getElementById('clientPhoneBar'); if (!bar) return r;
      const phone = getClientPhone(clientName);
      bar.replaceChildren();
      const info = document.createElement('div'); info.className = 'cl-pb-i';
      info.innerHTML = `<i class="fa-brands fa-whatsapp"></i><span></span>`;
      info.querySelector('span').textContent = phone ? formatPhoneDisplay(phone) : 'There is no WhatsApp number forClient';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'cl-pb-b'; edit.innerHTML = phone ? '<i class="fa-solid fa-pen"></i> amendment' : '<i class="fa-solid fa-plus"></i> Add number';
      edit.addEventListener('click', () => askClientPhone(clientName, null));
      bar.append(info, edit);
      if (phone) { const wa = document.createElement('button'); wa.type = 'button'; wa.className = 'cl-pb-b wa'; wa.innerHTML = '<i class="fa-brands fa-whatsapp"></i> reminder'; wa.addEventListener('click', () => remindClient(clientName)); bar.appendChild(wa); }
    } catch (e) { console.warn(e); }
    return r;
  };
})();

/* =========================================================
   Google Recording: Higher stability (Cancel Commentary, screendownload immediate, alternative method)
   ========================================================= */
let _googleFails = 0, _googleAttempt = 0;
(function hookAuthLoadingText() {
  const o = window.showAuthLoading;
  window.showAuthLoading = function (txt) {
    const r = o.apply(this, arguments);
    const s = document.querySelector('#authLoading .al-sub'); if (s) s.textContent = txt || 'Preparing your account...';
    return r;
  };
})();
function showAltLogin(show) { const b = document.getElementById('loginAltBtn'); if (b) b.hidden = !show; }
function _afterGoogleSuccess() {
  localStorage.removeItem(GUEST_SESSION_KEY);
  showAuthLoading('My neighborLogin...');
  setTimeout(() => {   // If the account processor does not respond, we will return the login page instead of a blank screen
    if (document.body.classList.contains('auth-pending') && !currentUser) { hideAuthLoading(); showLoginWall(); showLoginError('Account processing was delayed. Try again.'); showAltLogin(true); }
  }, 15000);
}
async function loginWithGoogle() {
  const now = Date.now();
  if (window._googleBusy && now - (window._googleStartedAt || 0) < 1500) return;   // Prevent rapid double pressing
  const p = _plat();
  if (_needsAuthRedirect()) {
    clearLoginError();
    showToast('Opening Google inside this window...', 'info');
    return loginWithGoogleRedirect();
  }
  const attempt = ++_googleAttempt;
  window._googleBusy = true; window._googleStartedAt = now; setGoogleBusy(true); clearLoginError();
  const guard = setTimeout(() => {
    if (attempt === _googleAttempt && window._googleBusy) { window._googleBusy = false; setGoogleBusy(false); showAltLogin(true); showLoginError('Google did not return any results. Try againOr Use the alternative method.'); }
  }, 60000);
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await auth.signInWithPopup(provider);
    if (attempt !== _googleAttempt) return;
    _googleFails = 0; _afterGoogleSuccess();
    showToast(`Welcome, my friend${(result.user && result.user.displayName) || 'friend'} 👋`, 'success');
  } catch (error) {
    if (attempt !== _googleAttempt) return;
    const code = error && error.code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') {
      // Sometimes the window closes after the login is actually successful— Wait a moment and make sure
      await new Promise(r => setTimeout(r, 1600));
      if (auth.currentUser) { _afterGoogleSuccess(); }
      else { _googleFails++; if (_googleFails >= 2) showAltLogin(true); }
    } else if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      // v20.10.8 — do not leave the user stuck: retry automatically in the same window.
      showToast('Pop-up unavailable — signing in inside this window...', 'info');
      return loginWithGoogleRedirect();
    } else {
      showAltLogin(true);
      showLoginError(_loginErrorText(code) || ('Unable toLogin' + (code ? ` (${code})` : '')));
    }
  } finally {
    clearTimeout(guard);
    if (attempt === _googleAttempt) { window._googleBusy = false; setGoogleBusy(false); }
  }
}
async function loginWithGoogleRedirect() {
  const now = Date.now();
  if (window._googleBusy && now - (window._googleStartedAt || 0) < 1500) return;
  window._googleBusy = true; window._googleStartedAt = now; setGoogleBusy(true); clearLoginError();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  showAuthLoading('Redirecting you to Google...');
  try { await auth.signInWithRedirect(provider); }
  catch (e) {
    window._googleBusy = false; setGoogleBusy(false);
    hideAuthLoading(); showLoginWall(); showAltLogin(true);
    showLoginError(_loginErrorText(e && e.code) || 'Unable to startLogin');
  }
}


/* =========================================================
   MOBILE LAYOUT FAILSAFE — v20.10.2-en
   The mobile CSS hides [data-mob-view] sections and relies on JS to reveal them.
   If any init code throws, the screen goes blank. This gate keeps sections visible
   by default and only enables the hide/show system once JS is confirmed alive.
   ========================================================= */
(function initMobileFailsafe() {
  const activeSel = '[data-mob-view].mob-active-block, [data-mob-view].mob-active-grid';
  function enable() { try { document.body.classList.add('mob-js-ready'); } catch (e) {} }
  function activate(target) {
    try { if (typeof navigateSegmented === 'function') { navigateSegmented(target); return true; } } catch (e) {}
    return false;
  }
  function boot() {
    if (!document.querySelector(activeSel)) {
      const t = (typeof currentActiveView === 'string' && currentActiveView) || 'home';
      if (!activate(t)) activate('home');
    }
    enable();
    setTimeout(() => {
      if (!document.querySelector(activeSel)) {
        document.body.classList.remove('mob-js-ready');   // show everything rather than a blank screen
      }
    }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
