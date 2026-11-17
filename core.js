/* =========================================================
   PUBLIC PORTAL INSTANT LOCK (الحل الجذري القاطع لصفحة العميل)
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
   PWA Edition + Push Notifications (Clean Edition)
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
  free:     { name: 'مجاني',  icon: 'fa-user',           badgeClasses: 'bg-slate-500/10 border-slate-500/30 text-slate-400' },
  personal: { name: 'شخصي',   icon: 'fa-user-circle',    badgeClasses: 'bg-purple-500/10 border-purple-500/30 text-purple-400' },
  work:     { name: 'شغل',    icon: 'fa-briefcase',      badgeClasses: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' },
  pro:      { name: 'برو',    icon: 'fa-crown',          badgeClasses: 'bg-orange-500/10 border-orange-500/30 text-orange-400' },
  admin:    { name: 'مدير',   icon: 'fa-shield-halved',  badgeClasses: 'bg-rose-500/10 border-rose-500/30 text-rose-400' }
};

const FEATURE_LIST = [
  { key: 'charity', label: 'باب الخير',      icon: 'fa-hand-holding-heart' },
  { key: 'debts',   label: 'دفتر الديون',    icon: 'fa-handshake' },
  { key: 'budget',  label: 'الميزانية',      icon: 'fa-wallet' },
  { key: 'export',  label: 'تصدير CSV',      icon: 'fa-file-excel' },
  { key: 'backup',  label: 'نسخ احتياطي',    icon: 'fa-database' },
  { key: 'reports', label: 'تقارير PDF',     icon: 'fa-file-pdf' }
];

const DEFAULT_PERMISSIONS = {
  free:     { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true },
  personal: { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true },
  work:     { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true },
  pro:      { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true },
  admin:    { maxTransactions: -1, charity: true, debts: true, budget: true, export: true, backup: true, reports: true }
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
    dueDate: t.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ? t.dueDate : null,
    status: (t.status === 'paid' || t.status === 'pending') ? t.status : null,
    _deleted: t._deleted === true,
    _updatedAt: Number(t._updatedAt) || Date.now()
  };
}

/* =========================================================
   PWA: MANDATORY MOBILE INSTALL DIALOG (إجباري عند الفتح)
   ========================================================= */
function isAppStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || 
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://');
}

function checkForcedInstallDialog() {
  // إذا كان التطبيق مثبت ومفتوح بالفعل كتطبيق، لا تظهر الرسالة
  if (isAppStandalone()) {
    document.body.classList.add('pwa-standalone');
    const hBtn = document.getElementById('headerInstallBtn');
    if (hBtn) hBtn.classList.add('hidden');
    return;
  }

  // إظهار زر التثبيت في الهيدر والقائمة دائماً
  const hBtn = document.getElementById('headerInstallBtn');
  if (hBtn) {
    hBtn.classList.remove('hidden');
    hBtn.classList.add('flex');
  }

  // إظهار النافذة إجبارياً بعد نصف ثانية من فتح الموقع
  setTimeout(() => {
    showMobileInstallModal();
  }, 600);
}

function showMobileInstallModal() {
  const modal = document.getElementById('mobileInstallModal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const iosHelper = document.getElementById('iosInstallHelper');
  const androidHelper = document.getElementById('androidInstallHelper');
  const acceptBtn = document.getElementById('mobileInstallAcceptBtn');

  if (isIOS) {
    if (iosHelper) iosHelper.classList.remove('hidden');
    if (androidHelper) androidHelper.classList.add('hidden');
    if (acceptBtn) {
      acceptBtn.innerHTML = '<i class="fa-solid fa-arrow-up-from-bracket"></i> <span>طريقة التثبيت على الآيفون</span>';
      acceptBtn.onclick = () => {
        showToast('اضغط زر المشاركة ⬆️ أسفل الشاشة ثم اختر "إضافة إلى الشاشة الرئيسية"', 'info');
      };
    }
  } else {
    if (iosHelper) iosHelper.classList.add('hidden');
    // On Android
    if (acceptBtn) {
      acceptBtn.innerHTML = '<i class="fa-solid fa-download text-base"></i> <span>تثبيت التطبيق الآن</span>';
      acceptBtn.onclick = triggerMobileAppInstall;
    }
  }
}

function dismissMobileInstall() {
  const modal = document.getElementById('mobileInstallModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function triggerMobileAppInstall() {
  if (deferredInstallPrompt) {
    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        showToast('جاري تثبيت التطبيق على جهازك بنجاح 🎉', 'success');
        dismissMobileInstall();
      } else {
        showToast('تم إلغاء التثبيت، يمكنك التثبيت لاحقاً من القائمة', 'info');
      }
    } catch(err) {
      console.warn("Prompt error:", err);
    }
    deferredInstallPrompt = null;
    return;
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    showToast('على الآيفون: اضغط زر المشاركة ⬆️ ثم "إضافة إلى الشاشة الرئيسية"', 'info');
  } else {
    // If browser didn't fire prompt yet or user needs guidance:
    const androidHelper = document.getElementById('androidInstallHelper');
    if (androidHelper) androidHelper.classList.remove('hidden');
    showToast('من قائمة المتصفح (⋮) بالأعلى اختر [تثبيت التطبيق] أو [إضافة للشاشة الرئيسية]', 'info');
  }
}

function installApp() {
  showMobileInstallModal();
}

function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('installAppBtn');
    if (btn) btn.classList.remove('hidden');
    // Call forced dialog
    checkForcedInstallDialog();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const btn = document.getElementById('installAppBtn');
    if (btn) btn.classList.add('hidden');
    const hBtn = document.getElementById('headerInstallBtn');
    if (hBtn) hBtn.classList.add('hidden');
    dismissMobileInstall();
    showToast('تم تثبيت التطبيق بنجاح 🎉', 'success');
  });

  if (isAppStandalone()) {
    document.body.classList.add('pwa-standalone');
  } else {
    // Always trigger forced dialog on load
    checkForcedInstallDialog();
  }
}

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
  showToast('اسحب ملف النسخة الاحتياطية في التطبيق للاستعادة', 'info');
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
    showToast('التنبيهات مرفوضة - افتح إعدادات المتصفح', 'error');
    return false;
  }
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

async function subscribeToPushNotifications() {
  if (!currentUser) { showToast('سجّل الدخول أولاً', 'error'); return; }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('الإشعارات غير مدعومة في هذا المتصفح', 'error');
    return;
  }
  const granted = await requestNotificationPermission();
  if (!granted) return;
  showToast('تم تفعيل الإشعارات بنجاح 🔔', 'success');
  updateNotificationUI(true);
  localStorage.setItem('ehsebli_notif_enabled', 'true');
}

async function unsubscribeFromPushNotifications() {
  if (!currentUser) return;
  localStorage.setItem('ehsebli_notif_enabled', 'false');
  showToast('تم إيقاف الإشعارات', 'info');
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
    if (label) label.textContent = 'إيقاف الإشعارات';
  } else {
    if (icon) icon.className = 'fa-solid fa-bell-slash text-slate-400';
    if (label) label.textContent = 'تفعيل الإشعارات';
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
  if (!('Notification' in window)) { showToast('الإشعارات غير مدعومة', 'error'); return; }
  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermission();
    if (!granted) return;
  }
  showLocalNotification(
    'احسبلي — اختبار الإشعارات 🔔',
    'لو وصلتك الرسالة دي، يعني الإشعارات شغالة تمام!',
    './'
  );
}

/* =========================================================
   PWA: NETWORK STATUS
   ========================================================= */
function initNetworkStatus() {
  window.addEventListener('online', () => {
    showToast('عاد الاتصال بالإنترنت ✓', 'success');
    document.body.classList.remove('offline');
  });
  window.addEventListener('offline', () => {
    showToast('انقطع الاتصال — العمل في الوضع المحلي', 'info');
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
    <span><i class="fa-solid fa-rocket"></i> إصدار جديد متوفر!</span>
    <button onclick="applyUpdate()">تحديث الآن</button>
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
  if (!file.type.startsWith('image/')) { showToast('يرجى اختيار ملف صورة صالح', 'error'); return; }

  showToast('جاري معالجة الصورة...', 'info');
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
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
      
      // Upload to Firebase Storage if online
      if (currentUser && navigator.onLine) {
        try {
          showToast('جاري رفع الفاتورة إلى السحابة ☁️...', 'info');
          const fileRef = storage.ref(`receipts/${currentUser.uid}/${Date.now()}_receipt.jpg`);
          await fileRef.putString(compressedDataUrl, 'data_url');
          currentReceiptData = await fileRef.getDownloadURL();
          setReceiptUI(currentReceiptData);
          showToast('تم رفع الفاتورة إلى السحابة ✓', 'success');
          return;
        } catch(storageErr) {
          console.warn("Storage upload failed, fallback to local:", storageErr);
        }
      }
      
      currentReceiptData = compressedDataUrl;
      setReceiptUI(currentReceiptData);
      showToast('تم إرفاق الصورة محلياً ✓', 'success');
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
    text.textContent = 'تم اختيار صورة (اضغط للتغيير)';
  } else {
    img.src = '';
    box.classList.add('hidden');
    removeBtn.classList.add('hidden');
    text.textContent = 'تصوير أو اختيار صورة';
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
  showToast(isPrivacyMode ? 'تم تفعيل وضع الخصوصية وإخفاء الأرقام 🔒' : 'تم إظهار الأرقام 👁️', 'info');
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
    showToast('رابط قديم أو غير صالح، اطلب من المتجر رابطًا جديدًا', 'error');
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
          <div class="text-[10px] text-slate-400 mt-0.5">${escapeHTML(typeName(t.type))} ${t.status === 'paid' ? '• مسدد بالكامل' : ''}</div>
        </td>
        <td class="py-3 px-4 text-slate-500 dark:text-slate-400">${escapeHTML(t.paymentMethod || 'كاش')}</td>
        <td class="py-3 px-4 font-black ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">
          ${t.type === 'income' ? '+' : '-'}${money(t.amount)} ج.م
        </td>
        <td class="py-3 px-4 text-center">
          ${t.receipt ? `
            <img src="${t.receipt}" 
                 onclick="viewReceiptImage('${t.receipt}')" 
                 title="معاينة" 
                 class="w-7 h-7 rounded-lg object-cover border border-orange-500/40 inline-block cursor-pointer hover:scale-110 transition shadow-sm" 
                 alt="صورة">
          ` : '<span class="text-slate-400">-</span>'}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('portalTotalIncome').textContent = money(income) + ' ج.م';
  document.getElementById('portalTotalDue').textContent = money(debtRec) + ' ج.م';
  document.getElementById('portalTotalPayable').textContent = money(debtPay) + ' ج.م';
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
  if (!currentUser) { showToast('سجّل الدخول لمشاركة صفحة العميل', 'error'); return; }
  let link;
  try { link = await getClientPortalLink(activeClientName); }
  catch (e) { showToast('تعذر إنشاء رابط العميل', 'error'); return; }
  navigator.clipboard.writeText(link).then(() => {
    showToast('تم نسخ رابط صفحة العميل بنجاح ✓', 'success');
  }).catch(() => prompt('انسخ هذا الرابط وأرسله للعميل:', link));
}

async function shareClientPortalWhatsApp() {
  if (!activeClientName) return;
  if (!currentUser) { showToast('سجّل الدخول لمشاركة صفحة العميل', 'error'); return; }
  let link;
  try { link = await getClientPortalLink(activeClientName); }
  catch (e) { showToast('تعذر إنشاء رابط العميل', 'error'); return; }
  const text = `مرحباً يا ${activeClientName}، تفضل رابط صفحة كشف حسابك المباشر لمتابعة كافة المعاملات المشتركة بيننا أولاً بأول:\n${link}\n\n— Honda Store`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

