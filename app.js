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
    } catch(e) { console.warn("Cloud load failed:", e); }
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
  }).catch(() => prompt('انسخ هذا الرابط وأرسله للعميل:', link));
}

function shareClientPortalWhatsApp() {
  if (!activeClientName) return;
  const link = getClientPortalLink(activeClientName);
  const text = `مرحباً يا ${activeClientName}، تفضل رابط صفحة كشف حسابك المباشر لمتابعة كافة المعاملات المشتركة بيننا أولاً بأول:\n${link}\n\n— Honda Store`;
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
    localStorage.setItem(PERMS_CACHE_KEY, JSON.stringify(rolePermissions));
  } catch (error) {
    try {
      const cached = localStorage.getItem(PERMS_CACHE_KEY);
      if (cached) rolePermissions = JSON.parse(cached);
    } catch(e) {}
  }
  applyRoleUI();
  updateQuickInsights();
}
async function saveRolePermissionsToCloud() {
  if (!currentUser || userRole !== 'admin') { showToast('غير مصرح', 'error'); return false; }
  try {
    await db.collection('config').doc('roles').set({
      permissions: rolePermissions,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.uid
    }, { merge: true });
    localStorage.setItem(PERMS_CACHE_KEY, JSON.stringify(rolePermissions));
    return true;
  } catch (error) { showToast('فشل الحفظ في السحابة', 'error'); return false; }
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
function switchAdminTab(tab) {
  adminActiveTab = tab;
  const isUsers = tab === 'users';
  const isReqs = tab === 'requests';
  const isPerms = tab === 'permissions';
  
  const tabUsr = document.getElementById('adminTabUsers');
  const tabReq = document.getElementById('adminTabRequests');
  const tabPrm = document.getElementById('adminTabPerms');
  
  if (tabUsr) tabUsr.classList.toggle('active', isUsers);
  if (tabReq) tabReq.classList.toggle('active', isReqs);
  if (tabPrm) tabPrm.classList.toggle('active', isPerms);
  
  const panUsr = document.getElementById('adminPanelUsers');
  const panReq = document.getElementById('adminPanelRequests');
  const panPrm = document.getElementById('adminPanelPerms');
  
  if (panUsr) panUsr.classList.toggle('hidden', !isUsers);
  if (panReq) panReq.classList.toggle('hidden', !isReqs);
  if (panPrm) panPrm.classList.toggle('hidden', !isPerms);

  if (isUsers) renderUsersList();
  else if (isReqs) renderAdminRequests();
  else if (isPerms) renderPermissionsEditor();
}

async function openAdminPanel() {
  if (userRole !== 'admin') { showToast('هذه الصفحة للمدير فقط', 'error'); return; }
  closeMenus();
  const modal = document.getElementById('adminModal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
  await loadRolePermissions();
  switchAdminTab('users');
}

function closeAdminPanel() {
  const modal = document.getElementById('adminModal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
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
    if (q) users = users.filter(u => u.emailLower.includes(q) || u.nameLower.includes(q) || u.phoneLower.includes(q));
    users.sort((a, b) => a.priority - b.priority);
    if (searchCount) searchCount.textContent = q ? `${users.length} نتيجة` : `${users.length} مستخدم`;

    if (!users.length) {
      container.innerHTML = `<div class="text-center py-8 text-xs text-slate-400"><i class="fa-solid fa-magnifying-glass text-3xl mb-3 opacity-30"></i><p class="font-bold">لا توجد نتائج مطابقة</p></div>`;
      return;
    }

    users.forEach(({ doc, data, isSuper, isMe, roleKey, hasOverride }) => {
      const meta = ROLES_META[roleKey] || ROLES_META.free;
      const card = document.createElement('div');
      card.className = 'p-3 rounded-xl border flex items-center justify-between gap-2 ' + (
        isSuper ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/40'
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
          <select onchange="changeUserRole('${doc.id}', this.value)" ${disabled ? 'disabled' : ''}
                  class="text-[10px] font-black rounded-lg px-2 py-1.5 border border-slate-200 dark:border-dark-750 bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
            ${optionsHtml}
          </select>
          <button onclick="openUserPermissionsModal('${doc.id}')" title="صلاحيات مخصصة"
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
      renderUsersList(); return;
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
   USER PERMISSIONS OVERRIDE
   ========================================================= */
async function openUserPermissionsModal(uid) {
  if (userRole !== 'admin') { showToast('غير مصرح', 'error'); return; }
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) { showToast('المستخدم غير موجود', 'error'); return; }
    const data = doc.data();
    if (isSuperAdminEmail(data.email)) { showToast('لا يمكن تعديل صلاحيات Super Admin 🛡️', 'error'); return; }
    editingUserPermissions = { uid, data };
    document.getElementById('userPermTitle').textContent = `صلاحيات: ${data.displayName || 'بدون اسم'}`;
    document.getElementById('userPermEmail').textContent = data.email || data.phoneNumber || '';
    const roleSelect = document.getElementById('userPermRole');
    const currentRole = data.role || 'free';
    Array.from(roleSelect.options).forEach(opt => { opt.selected = opt.value === currentRole; });
    renderUserPermOverrides(data.permissionsOverride || {});
    const modal = document.getElementById('userPermissionsModal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
  } catch (error) { showToast('فشل تحميل بيانات المستخدم', 'error'); }
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
        <option value="inherit" ${state === 'inherit' ? 'selected' : ''}>🔵 حسب الدور</option>
        <option value="allow" ${state === 'allow' ? 'selected' : ''}>🟢 مفعّل</option>
        <option value="deny" ${state === 'deny' ? 'selected' : ''}>🔴 معطّل</option>
      </select>
    `;
    container.appendChild(row);
  });
  const maxVal = override.maxTransactions;
  const maxDisplay = typeof maxVal === 'number' ? maxVal : '';
  const maxRow = document.createElement('div');
  maxRow.className = 'perm-row';
  maxRow.innerHTML = `
    <div class="perm-row-label"><i class="fa-solid fa-list-ol"></i><span>حد العمليات</span></div>
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
    showToast('تم حفظ الصلاحيات بنجاح ✓', 'success');
    closeUserPermissionsModal();
    renderUsersList();
  } catch (error) { showToast('فشل حفظ الصلاحيات', 'error'); }
}

function subscribeToUserDoc(uid) {
  if (userDocUnsubscribe) { try { userDocUnsubscribe(); } catch(e) {} userDocUnsubscribe = null; }
  userDocUnsubscribe = db.collection('users').doc(uid).onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();
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
        <div class="perm-row-label"><i class="fa-solid fa-list-ol"></i><span>حد العمليات</span></div>
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
   LOGIN & AUTH
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
  document.getElementById('emailModeSignin').classList.toggle('active', mode === 'signin');
  document.getElementById('emailModeSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('signupOnlyFields').classList.toggle('hidden', mode !== 'signup');
  document.getElementById('confirmPasswordWrapper').classList.toggle('hidden', mode !== 'signup');
  document.getElementById('forgotPasswordBtn').classList.toggle('hidden', mode === 'signup');
  const submitText = document.getElementById('emailSubmitText');
  const submitIcon = document.getElementById('emailSubmitIcon');
  submitText.textContent = mode === 'signup' ? 'إنشاء الحساب' : 'تسجيل الدخول';
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
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showEmailError('❌ يرجى إدخال إيميل صحيح'); return; }
  if (!password || password.length < 6) { showEmailError('❌ كلمة السر لازم تكون 6 أحرف على الأقل'); return; }
  if (emailMode === 'signup') {
    if (!displayName || displayName.length < 2) { showEmailError('❌ يرجى إدخال اسمك الكامل'); return; }
    if (password !== confirmPassword) { showEmailError('❌ كلمتي السر مش متطابقتين'); return; }
  }
  const btn = document.getElementById('emailSubmitBtn');
  btn.disabled = true;
  try {
    if (emailMode === 'signup') {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      if (cred.user && displayName) { try { await cred.user.updateProfile({ displayName }); } catch(e) {} }
      showToast(`أهلاً بك يا ${displayName || 'صديقنا'} 🎉`, 'success');
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      showToast(`أهلاً بعودتك 👋`, 'success');
    }
  } catch (error) { showEmailError('❌ ' + (error.message || error.code)); }
  finally { btn.disabled = false; }
}

async function sendPasswordReset() {
  hideEmailError();
  const email = (document.getElementById('emailInput').value || '').trim().toLowerCase();
  if (!email) { showEmailError('❌ اكتب الإيميل أولاً'); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    showToast('تم إرسال رابط استعادة كلمة السر للإيميل', 'success');
  } catch (error) { showEmailError('❌ ' + (error.message || error.code)); }
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
  if (!number || number.length < 7) { showPhoneError('❌ رقم موبايل غير صحيح'); return; }
  if (code === '+20' && number.startsWith('0')) number = number.slice(1);
  const fullNumber = code + number;
  const btn = document.getElementById('sendOtpBtn');
  btn.disabled = true;
  try {
    const appVerifier = initRecaptcha();
    confirmationResult = await auth.signInWithPhoneNumber(fullNumber, appVerifier);
    document.getElementById('phoneStep1').classList.add('hidden');
    document.getElementById('phoneStep2').classList.remove('hidden');
    showToast('تم إرسال الكود ✓', 'success');
  } catch (error) {
    showPhoneError('❌ ' + (error.message || error.code));
    if (recaptchaVerifier) { try { recaptchaVerifier.clear(); } catch(e) {} recaptchaVerifier = null; }
  } finally { btn.disabled = false; }
}

async function verifyPhoneOTP() {
  hidePhoneError();
  const code = (document.getElementById('otpInput').value || '').trim();
  if (!code || !/^\d{4,6}$/.test(code)) { showPhoneError('❌ الكود مكوّن من 6 أرقام'); return; }
  if (!confirmationResult) { changePhoneNumber(); return; }
  const btn = document.getElementById('verifyOtpBtn');
  btn.disabled = true;
  try {
    const result = await confirmationResult.confirm(code);
    showToast(`أهلاً بك يا ${result.user.phoneNumber} 👋`, 'success');
  } catch (error) { showPhoneError('❌ كود غير صحيح أو منتهي'); }
  finally { btn.disabled = false; }
}

function changePhoneNumber() {
  document.getElementById('phoneStep1').classList.remove('hidden');
  document.getElementById('phoneStep2').classList.add('hidden');
  document.getElementById('otpInput').value = '';
}

async function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await auth.signInWithPopup(provider);
    showToast(`أهلاً بك يا ${result.user.displayName || 'صديقنا'} 👋`, 'success');
  } catch (error) {
    if (error.code === 'auth/popup-blocked') await auth.signInWithRedirect(provider);
    else showToast('تعذر تسجيل الدخول: ' + error.message, 'error');
  }
}

async function handleRedirectResult() {
  try {
    const result = await auth.getRedirectResult();
    if (result && result.user) showToast(`أهلاً بك يا ${result.user.displayName || 'صديقنا'} 👋`, 'success');
  } catch (error) {}
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
  { id:'demo-1', type:'income', amount:1200, category:'خدمات سوفت وير وصيانة', client:'أحمد', paymentMethod:'كاش نقدي', notes:'إصلاح بوت لودر وفلاش 3 أجهزة', reference:'INV-1001', date:offsetDate(-1), time:'02:30 PM' },
  { id:'demo-2', type:'charity', amount:150, category:'مساعدة محتاج وتفريج كربة', client:'', paymentMethod:'كاش نقدي', notes:'صدقة شكر', reference:'', date:offsetDate(-1), time:'03:15 PM' },
  { id:'demo-3', type:'expense', amount:380, category:'تفعيل وسيرفرات وكريدت', client:'موزع سيرفر محمد', paymentMethod:'إنستاباي (InstaPay)', notes:'تفعيل باقة دونجل', reference:'EXP-3001', date:offsetDate(-2), time:'05:40 PM' },
  { id:'demo-4', type:'income', amount:950, category:'شغل ريموت أونلاين', client:'محل المنصورة', paymentMethod:'إنستاباي (InstaPay)', notes:'خدمة ريموت', reference:'INV-1002', date:offsetDate(-2), time:'08:10 PM' },
  { id:'demo-5', type:'expense', amount:90, category:'أكل ومشروبات', client:'', paymentMethod:'فودافون كاش / محفظة', notes:'غداء', reference:'', date:offsetDate(-3), time:'01:00 PM' },
  { id:'demo-6', type:'debt_receivable', amount:650, paidAmount:200, category:'حساب محل صيانة', client:'أحمد', paymentMethod:'آجل / معلق', notes:'باقي حساب فلاش 4 أجهزة', reference:'', status:'pending', date:offsetDate(-4), time:'11:20 AM' },
  { id:'demo-7', type:'debt_payable', amount:400, paidAmount:0, category:'دين لمورد / موزّع سيرفر', client:'موزع سيرفر محمد', paymentMethod:'آجل / معلق', notes:'كريدت سيرفر', reference:'', status:'pending', date:offsetDate(-5), time:'04:15 PM' }
];

/* =========================================================
   AUTH GUARDS & PIN
   ========================================================= */
function requireAuth() {
  if (!currentUser) { showToast('يجب تسجيل الدخول أولاً', 'error'); return false; }
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
function showPinLock() {
  if (isPortalModeActive) return;
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
  if (window.isPortalModeActive || new URLSearchParams(window.location.search).has('client')) return;
  if (isPortalModeActive) return;
  hideAuthLoading();
  authResolved = true;

  const avatar = document.getElementById('userAvatar');
  const footerSync = document.getElementById('footerSyncStatus');
  const userProfile = document.getElementById('userProfile');

  if (user) {
    currentUser = user;
    handleUserSwitch(user.uid);
    hideLoginWall();
    if (userProfile) {
      userProfile.classList.remove('hidden');
      userProfile.classList.add('flex');
    }

    if (avatar) {
      if (user.photoURL) avatar.src = user.photoURL;
      else {
        const initial = (user.displayName || user.email || user.phoneNumber || 'U').charAt(0).toUpperCase();
        avatar.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' rx='10' fill='%23f97316'/><text x='50%' y='55%' text-anchor='middle' dominant-baseline='middle' font-size='20' font-family='Cairo' fill='white' font-weight='bold'>${escapeHTML(initial)}</text></svg>`;
      }
    }

    const userIdentifier = user.email || user.phoneNumber || 'مستخدم';
    if (footerSync) {
      footerSync.innerHTML = `<i class="fa-solid fa-cloud-check text-emerald-500"></i> متصل بالسحاب (${escapeHTML(userIdentifier)})`;
    }

    await loadUserRole(user.uid);
    await loadRolePermissions();

    loadLocalData();
    refreshAll();
    switchTab('transactions');

    subscribeToUserDoc(user.uid);
    subscribeToCloudTransactions(user.uid);
    updatePinUI();
    updateNotificationUI(localStorage.getItem('ehsebli_notif_enabled') === 'true');

    // Process pending share target if exists
    checkPendingShare();

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
    if (userDocUnsubscribe) { try { userDocUnsubscribe(); } catch(e) {} userDocUnsubscribe = null; }
    if (transactionsUnsubscribe) { try { transactionsUnsubscribe(); } catch(e) {} transactionsUnsubscribe = null; }
    hidePinLock();
    showLoginWall();
    footerSync.innerHTML = `<i class="fa-solid fa-database text-amber-500"></i> سجّل الدخول للمزامنة`;
    loadLocalData();
    applyRoleUI();
  }
});

function logout() {
  if (!currentUser) return;
  openConfirm('تسجيل الخروج؟', 'سيتم إنهاء الجلسة. بياناتك محفوظة في السحابة بأمان.', () => auth.signOut());
}
function logoutFromLock() { auth.signOut(); }

/* =========================================================
   REALTIME LISTENER
   ========================================================= */
function subscribeToCloudTransactions(uid) {
  if (transactionsUnsubscribe) { try { transactionsUnsubscribe(); } catch(e) {} transactionsUnsubscribe = null; }
  transactionsUnsubscribe = db.collection('users').doc(uid)
    .onSnapshot({ includeMetadataChanges: false }, doc => {
      if (!doc.exists) return;
      if (doc.metadata && doc.metadata.hasPendingWrites) return;
      const data = doc.data();
      if (Array.isArray(data.transactions)) {
        transactions = data.transactions.map(normalizeTransaction);
        if (data.budget !== undefined) localStorage.setItem(BUDGET_KEY, data.budget);
        saveLocalData();
        refreshAll();
      }
    }, err => console.warn("Realtime sync warning:", err));
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
    console.error("Cloud sync error:", error);
    showToast('فشل المزامنة للسحابة: ' + (error.code || error.message), 'error');
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
  } catch (error) { console.error("Force sync error:", error); }
}

async function loadCloudData(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      const cloudTx = Array.isArray(data.transactions) ? data.transactions : [];
      transactions = mergeTransactions(transactions, cloudTx);
      if (data.budget !== undefined) localStorage.setItem(BUDGET_KEY, data.budget);
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
function loadLocalData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const arr = saved ? JSON.parse(saved) : [];
    transactions = Array.isArray(arr) ? arr.filter(validateTransaction).map(normalizeTransaction) : [];
  } catch (error) { transactions = []; }
}
function saveLocalData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }
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
  const labels = { all:'كل البيانات', today:'اليوم', week:'هذا الأسبوع', month:'هذا الشهر', year:'هذه السنة' };
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
    const method = t.paymentMethod || 'كاش نقدي';
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
  const net = document.getElementById('statNet');
  net.textContent = money(metrics.available);
  net.className = 'money-val text-lg sm:text-3xl font-black ' + (metrics.available >= 0 ? 'text-emerald-500' : 'text-rose-500');
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
      badge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><i class="fa-solid fa-arrow-trend-up"></i> دخل</span>`;
      amount = `<span class="money-val font-black text-emerald-500">+${money(item.amount)} ج.م</span>`;
    } else if (item.type === 'charity') {
      badge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-orange-500/10 text-orange-500 border border-orange-500/20"><i class="fa-solid fa-heart"></i> خير</span>`;
      amount = `<span class="money-val font-black text-orange-500">-${money(item.amount)} ج.م</span>`;
    } else {
      badge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-rose-500/10 text-rose-500 border border-rose-500/20"><i class="fa-solid fa-arrow-trend-down"></i> مصروف</span>`;
      amount = `<span class="money-val font-black text-rose-500">-${money(item.amount)} ج.م</span>`;
    }
    const timeFormatted = item.time ? formatTimeTo12Hour(item.time) : '';
    tr.innerHTML = `
      <td class="py-3 px-4">
        <div class="flex items-center gap-2.5">
          ${badge}
          <div>
            <div class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span>${escapeHTML(item.notes || 'بدون بيان')}</span>
              ${item.receipt ? `<button onclick="viewReceiptImage('${item.receipt}')" title="عرض الفاتورة" class="text-orange-500 hover:text-orange-400"><i class="fa-solid fa-paperclip text-xs"></i></button>` : ''}
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
          <button onclick="shareViaWhatsApp('${item.id}')" title="مشاركة" class="p-2 rounded-xl text-emerald-500 hover:bg-emerald-500/10 transition"><i class="fa-brands fa-whatsapp text-sm"></i></button>
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
            <h4 class="text-sm font-black truncate flex items-center gap-1.5">
              <span>${escapeHTML(d.notes || 'دين بدون بيان')}</span>
              ${d.receipt ? `<button onclick="viewReceiptImage('${d.receipt}')" class="text-orange-500"><i class="fa-solid fa-paperclip text-xs"></i></button>` : ''}
            </h4>
            <p class="text-[10px] text-slate-400 font-semibold mt-0.5">
              ${d.client ? `<span class="text-orange-500 font-black cursor-pointer" onclick="openClientLedger('${escapeHTML(d.client)}')"><i class="fa-solid fa-user"></i> ${escapeHTML(d.client)} • </span>` : ''}
              ${escapeHTML(d.category)} • ${escapeHTML(d.date)} ${d.time ? '• ' + escapeHTML(formatTimeTo12Hour(d.time)) : ''}
              ${getDueDateBadge(d)}
            </p>
          </div>
        </div>
        <div class="text-left shrink-0">
          <div class="money-val text-base font-black ${isReceivable ? 'text-emerald-500' : 'text-rose-500'}">${money(remainingAmt)} ج.م</div>
          ${paidAmt > 0 && !paid ? `<div class="text-[9px] text-slate-400">سُدد ${money(paidAmt)} من ${money(totalAmount)}</div>` : ''}
        </div>
      </div>
      ${!paid && paidAmt > 0 ? `
        <div class="mt-3">
          <div class="h-1.5 rounded-full bg-slate-200 dark:bg-dark-750 overflow-hidden">
            <div class="h-full bg-emerald-500 rounded-full" style="width: ${progressPercent}%"></div>
          </div>
          <div class="flex justify-between text-[9px] text-slate-400 mt-1 font-bold">
            <span>مدفوع ${progressPercent}%</span>
            <span>متبقي ${money(remainingAmt)} ج.م</span>
          </div>
        </div>
      ` : ''}
      <div class="mt-4 pt-3 border-t border-slate-200/60 dark:border-dark-800 flex flex-wrap items-center justify-between gap-2">
        <span class="text-[10px] font-black ${paid ? 'text-slate-400' : isReceivable ? 'text-emerald-500' : 'text-rose-500'}">
          <i class="fa-solid ${paid ? 'fa-circle-check' : 'fa-clock'}"></i>
          ${paid ? 'تم السداد بالكامل ✓' : isReceivable ? 'مستحق لي - معلق' : 'مستحق عليّ - معلق'}
        </span>
        <div class="flex flex-wrap items-center gap-1.5">
          <button onclick="openDebtCardModal('${d.id}')" title="بطاقة مطالبة وتذكير بالدين" class="px-2.5 py-1.5 rounded-xl bg-orange-500/15 text-orange-400 hover:bg-orange-500 hover:text-white text-[10px] font-black transition flex items-center gap-1 border border-orange-500/30">
            <i class="fa-solid fa-receipt"></i> <span>بطاقة مطالبة</span>
          </button>
          ${!paid ? `<button onclick="openDebtPaymentModal('${d.id}')" class="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white text-[10px] font-black transition"><i class="fa-solid fa-hand-holding-dollar"></i> دفعة جزئية</button>` : ''}
          <button onclick="toggleDebtStatus('${d.id}')" class="px-2.5 py-1.5 rounded-xl ${paid ? 'bg-slate-200 dark:bg-dark-750 text-slate-700 dark:text-slate-300' : 'bg-orange-500 text-white'} text-[10px] font-black">${paid ? 'إعادة كمعلق' : 'تم السداد ✓'}</button>
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
  const total = Number(debt.amount) || 0;
  const paid = Number(debt.paidAmount) || 0;
  const rem = Math.max(0, total - paid);
  document.getElementById('debtPayModalSubtitle').textContent = `الدين: ${debt.notes} (المتبقي: ${money(rem)} ج.م)`;
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
  if (!amt || amt <= 0) { showToast('أدخل مبلغ دفعة صحيح', 'error'); return; }
  const currentPaid = Number(debt.paidAmount) || 0;
  const total = Number(debt.amount) || 0;
  const newPaid = currentPaid + amt;
  debt.paidAmount = newPaid;
  if (newPaid >= total) { debt.status = 'paid'; showToast('تم اكتمال سداد كامل الدين 🎉', 'success'); }
  else showToast(`تم تسجيل دفعة بقيمة ${money(amt)} ج.م ✓`, 'success');
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
      </div>
      <div class="mt-3 pt-2 text-[10px] font-black text-orange-500 flex items-center justify-between">
        <span>فتح كشف الحساب والرابط</span>
        <i class="fa-solid fa-folder-open"></i>
      </div>
    `;
    container.appendChild(card);
  });
}

function openClientLedger(clientName) {
  activeClientName = clientName;
  document.getElementById('clientModalName').textContent = `كشف حساب: ${clientName}`;
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
          <div class="text-[9px] text-slate-400">${escapeHTML(typeName(t.type))} ${t.status === 'paid' ? '• مسدد' : ''}</div>
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
    });
  }
  document.getElementById('clientTotalIncome').textContent = money(income) + ' ج.م';
  document.getElementById('clientTotalReceivable').textContent = money(debtRec) + ' ج.م';
  document.getElementById('clientTotalPayable').textContent = money(debtPay) + ' ج.م';
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
  const text = `🧾 *إشعار عملية مالية | Honda Financial Manager*
----------------------------------------
👤 *العميل:* ${item.client || 'عميل محترم'}
📌 *البيان:* ${item.notes || item.category}
💰 *المبلغ:* ${money(item.amount)} ج.م
📅 *التاريخ:* ${item.date} ${timeStr ? `(${timeStr})` : ''}
💳 *طريقة الدفع:* ${item.paymentMethod || 'كاش'}
${item.reference ? `🔖 *المرجع:* ${item.reference}\n` : ''}----------------------------------------
شكراً لتعاملكم معنا ✨`;
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
        datasets: [{ data: amounts, backgroundColor: ['#ea580c','#f97316','#fb923c','#f59e0b','#10b981','#06b6d4','#8b5cf6','#64748b','#ef4444'], borderWidth: 2, borderColor: isDark ? '#0f1117' : '#ffffff' }]
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
      datasets: [{ data: [metrics.income, metrics.expense, metrics.charity], backgroundColor: ['rgba(16,185,129,.85)','rgba(244,63,94,.85)','rgba(249,115,22,.9)'], borderRadius: 10, borderSkipped: false }]
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
   TRANSACTION MODAL
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
    document.getElementById('formPaymentMethod').value = item.paymentMethod || 'كاش نقدي';
    document.getElementById('formReference').value = item.reference || '';
    document.getElementById('formNotes').value = item.notes || '';
    const dueDateInput = document.getElementById('formDueDate');
    if (dueDateInput) dueDateInput.value = item.dueDate || '';
    if (item.receipt) { currentReceiptData = item.receipt; setReceiptUI(item.receipt); }
    document.getElementById('submitText').textContent = 'حفظ التعديل';
  } else {
    const radio = document.querySelector(`input[name="txType"][value="${type}"]`);
    if (radio) radio.checked = true;
    onTypeChange();
    document.getElementById('submitText').textContent = 'حفظ العملية';
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
  (CATEGORIES[type] || ['عام']).forEach(c => {
    const option = document.createElement('option');
    option.value = c; option.textContent = c;
    select.appendChild(option);
  });
  baraka.classList.toggle('hidden', type !== 'charity');
  const dueDateWrapper = document.getElementById('debtDueDateWrapper');
  if (dueDateWrapper) dueDateWrapper.classList.toggle('hidden', !isDebt(type));
  if (type === 'charity') { title.textContent = editingId ? 'تعديل باب الخير' : 'تسجيل صدقة أو عمل خير'; notes.textContent = 'النية / الملاحظات'; icon.innerHTML = '<i class="fa-solid fa-heart text-orange-500"></i>'; }
  else if (type === 'income') { title.textContent = editingId ? 'تعديل الدخل' : 'تسجيل دخل / إيراد جديد'; notes.textContent = 'بيان الخدمة بالتفصيل'; icon.innerHTML = '<i class="fa-solid fa-arrow-trend-up text-emerald-500"></i>'; }
  else if (type === 'debt_receivable') { title.textContent = editingId ? 'تعديل دين مستحق لي' : 'تسجيل دين مستحق لي'; notes.textContent = 'بيان الدين والخدمة *'; icon.innerHTML = '<i class="fa-solid fa-user-plus text-cyan-500"></i>'; }
  else if (type === 'debt_payable') { title.textContent = editingId ? 'تعديل دين عليّ' : 'تسجيل دين مستحق عليّ'; notes.textContent = 'بيان الدين والالتزام *'; icon.innerHTML = '<i class="fa-solid fa-user-minus text-purple-500"></i>'; }
  else { title.textContent = editingId ? 'تعديل مصروف' : 'تسجيل مصروف جديد'; notes.textContent = 'بيان المصروف'; icon.innerHTML = '<i class="fa-solid fa-arrow-trend-down text-rose-500"></i>'; }
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

  if (!amount || amount <= 0 || amount > 1e9) { showToast('يرجى إدخال مبلغ صحيح', 'error'); return; }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { showToast('يرجى اختيار تاريخ صحيح', 'error'); return; }
  if (isDebt(type) && !notes && !client) { showToast('اكتب اسم العميل أو البيان لحفظ الدين', 'error'); return; }
  if (!wasEditing && !canAddMoreTransactions()) { showToast(`وصلت للحد الأقصى (${getMaxTransactions()} عملية)`, 'error'); return; }

  if (wasEditing) {
    const index = transactions.findIndex(t => t.id === editingId);
    if (index === -1) return;
    const old = transactions[index];
    transactions[index] = normalizeTransaction({
      ...old, type, amount, date, time, client, category,
      paymentMethod: isDebt(type) ? 'آجل / معلق' : paymentMethod, reference,
      notes: notes || (type === 'charity' ? 'صدقة لوجه الله' : category),
      dueDate,
      receipt: currentReceiptData,
      status: isDebt(type) ? (old.status || 'pending') : null,
      _updatedAt: Date.now()
    });
    showToast('تم تعديل العملية بنجاح', 'success');
  } else {
    transactions.unshift(normalizeTransaction({
      id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      type, amount, date, time, client, category, paidAmount: 0,
      paymentMethod: isDebt(type) ? 'آجل / معلق' : paymentMethod, reference,
      notes: notes || (type === 'charity' ? 'صدقة لوجه الله' : category),
      dueDate,
      receipt: currentReceiptData,
      status: isDebt(type) ? 'pending' : null,
      _updatedAt: Date.now()
    }));
    if (type === 'charity') {
      if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 80, origin: { y: .6 } });
      showToast('تقبل الله منك وأخلف عليك بالبركة 🤲', 'success');
    } else showToast('تم تسجيل العملية بنجاح', 'success');
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
  openConfirm('حذف العملية؟', `سيتم حذف: <strong>${escapeHTML(item.notes || item.category)}</strong> بمبلغ <strong>${money(item.amount)} ج.م</strong>.`, () => deleteTransaction(id));
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
  showToast(debt.status === 'paid' ? 'تم إغلاق الدين بالكامل ✓' : 'تمت إعادة الدين كمعلق', 'success');
}

/* =========================================================
   BUDGET
   ========================================================= */
function getBudget() { return Number(localStorage.getItem(BUDGET_KEY) || 0); }

function openBudgetModal() {
  if (!requireAuth()) return;
  if (!hasFeature('budget')) { showToast('الميزانية غير متاحة لدورك', 'error'); return; }
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
  monthItems.forEach(t => { if (t.type === 'expense' || t.type === 'charity') used += Number(t.amount || 0); });
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
  document.getElementById('budgetRemaining').className = 'text-[10px] font-bold ' + (remaining >= 0 ? 'text-emerald-500' : 'text-rose-500');
}

/* =========================================================
   BACKUP & EXPORT
   ========================================================= */
function openBackupModal() {
  if (!requireAuth()) return;
  if (!hasFeature('backup')) { showToast('النسخ الاحتياطي غير متاح لدورك', 'error'); return; }
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
    version: '9.3',
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
    } catch (error) { showToast('ملف النسخة الاحتياطية غير صالح', 'error'); }
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
    const row = [t.id, typeName(t.type), t.amount, t.client || '', t.category, t.paymentMethod || '', t.date, t.time || '', t.reference || '', t.notes || '',
      t.status === 'paid' ? 'مسدد' : t.status === 'pending' ? 'معلق' : 'منجز'];
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
  const metrics = calculateMetrics();
  const periodName = document.getElementById('periodLabel').textContent;
  const report = document.getElementById('printReport');
  report.innerHTML = `
    <div style="font-family:Cairo,Tajawal,sans-serif;direction:rtl;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #f97316;padding-bottom:18px;">
        <div><h1 style="font-size:30px;margin:0;font-weight:900;">احسبلي</h1><div style="font-size:12px;color:#666;">Honda Financial Manager</div></div>
        <div style="text-align:left;font-size:12px;color:#555;"><div>تقرير مالي</div><div>${escapeHTML(periodName)}</div><div>${todayString()}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:25px;">
        ${reportBox('الإيرادات', metrics.income, '#059669')}
        ${reportBox('المصاريف', metrics.expense, '#e11d48')}
        ${reportBox('باب الخير', metrics.charity, '#ea580c')}
        ${reportBox('الرصيد المتاح', metrics.available, metrics.available >= 0 ? '#059669' : '#e11d48')}
      </div>
      <div style="margin-top:30px;">
        <h2 style="font-size:18px;">تفاصيل العمليات</h2>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr style="background:#f97316;color:white;">
            <th style="padding:9px;border:1px solid #ddd;">التاريخ والوقت</th>
            <th style="padding:9px;border:1px solid #ddd;">العميل</th>
            <th style="padding:9px;border:1px solid #ddd;">النوع</th>
            <th style="padding:9px;border:1px solid #ddd;">البيان</th>
            <th style="padding:9px;border:1px solid #ddd;">التصنيف</th>
            <th style="padding:9px;border:1px solid #ddd;">المبلغ</th>
          </tr></thead>
          <tbody>
            ${getPeriodTransactions().sort((a,b) => new Date(b.date) - new Date(a.date)).map(t => `
              <tr>
                <td style="padding:8px;border:1px solid #ddd;">${escapeHTML(t.date)}${escapeHTML(t.time || '')}</td>
                <td style="padding:8px;border:1px solid #ddd;">${escapeHTML(t.client || '-')}</td>
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
   PIN SECURITY
   ========================================================= */
function openPinModal() {
  if (!requireAuth()) return;
  closeMenus();
  const modal = document.getElementById('pinModal');
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError').classList.add('hidden');
  document.getElementById('pinTitle').textContent = !getPin() ? 'إنشاء PIN' : 'تغيير PIN';
  document.getElementById('pinActionBtn').textContent = !getPin() ? 'تفعيل القفل' : 'تغيير الرمز';
  modal.classList.remove('hidden'); modal.classList.add('flex');
  setTimeout(() => document.getElementById('pinInput').focus(), 100);
}
function closePinModal() {
  document.getElementById('pinModal').classList.add('hidden');
  document.getElementById('pinModal').classList.remove('flex');
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
    document.getElementById('unlockError').classList.remove('hidden');
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
  } catch (error) { showToast('فشل التحقق من الهوية', 'error'); }
}

/* =========================================================
   TABS & TOAST
   ========================================================= */
function switchTab(tab, shouldScroll = false) {
  if (tab === 'debts' && !hasFeature('debts')) { showToast('دفتر الديون غير متاح لدورك', 'error'); return; }
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
  document.querySelectorAll('.mob-nav-btn[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  if (isClients) renderClients();
  else if (isDebts) renderDebts();
  else if (isTx) renderTransactions();

  // عند الضغط من الموبايل: النزول تلقائياً للقسم وفتحه
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
  loadLocalData();
  refreshAll();
  switchTab('transactions');
  document.getElementById('formDate').value = todayString();
  const dueDateInput = document.getElementById('formDueDate');
  if (dueDateInput) dueDateInput.value = '';
  document.getElementById('formTime').value = currentInputTimeString();

  try {
    const cached = localStorage.getItem(PERMS_CACHE_KEY);
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
   DUE DATE HELPER (تاريخ استحقاق الديون)
   ========================================================= */
function getDueDateBadge(debt) {
  if (!debt.dueDate || debt.status === 'paid') return '';
  const today = todayString();
  const diffDays = Math.round((new Date(debt.dueDate) - new Date(today)) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-500/15 text-rose-500 border border-rose-500/30 mr-1"><i class="fa-solid fa-triangle-exclamation"></i> متأخر ${Math.abs(diffDays)} يوم</span>`;
  } else if (diffDays === 0) {
    return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-500 border border-amber-500/30 mr-1"><i class="fa-solid fa-bell"></i> مستحق اليوم!</span>`;
  } else if (diffDays <= 3) {
    return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-orange-500/15 text-orange-400 border border-orange-500/30 mr-1"><i class="fa-regular fa-clock"></i> يستحق خلال ${diffDays} أيام</span>`;
  }
  return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-400 mr-1"><i class="fa-regular fa-calendar"></i> استحقاق: ${debt.dueDate}</span>`;
}


/* =========================================================
   EXCEL XLSX EXPORT (SheetJS)
   ========================================================= */
function exportToExcel() {
  if (!requireAuth()) return;
  if (!hasFeature('export')) { showToast('التصدير غير متاح لدورك', 'error'); return; }
  closeMenus();
  
  if (typeof XLSX === 'undefined') {
    showToast('جاري استخدام تصدير CSV العادي...', 'info');
    exportToCSV();
    return;
  }
  
  const activeTxs = getActiveTransactions();
  if (!activeTxs.length) { showToast('لا توجد بيانات لتصديرها', 'error'); return; }

  // 1. Transactions Sheet
  const txRows = activeTxs.map(t => ({
    "المعرف": t.id,
    "النوع": typeName(t.type),
    "المبلغ (ج.م)": Number(t.amount) || 0,
    "المدفوع": Number(t.paidAmount) || 0,
    "العميل": t.client || '-',
    "التصنيف": t.category || '-',
    "طريقة الدفع": t.paymentMethod || 'كاش نقدي',
    "التاريخ": t.date,
    "الوقت": t.time || '',
    "تاريخ الاستحقاق": t.dueDate || '-',
    "البيان / الملاحظات": t.notes || '',
    "الحالة": t.status === 'paid' ? 'مسدد' : (t.status === 'pending' ? 'معلق' : 'منجز')
  }));

  // 2. Debts Sheet
  const debts = activeTxs.filter(t => isDebt(t.type)).map(d => ({
    "الطرف": d.client || 'غير محدد',
    "النوع": d.type === 'debt_receivable' ? 'مستحق لي (أطلب)' : 'مستحق عليّ (مطلوب مني)',
    "إجمالي الدين": Number(d.amount) || 0,
    "سدد منه": Number(d.paidAmount) || 0,
    "المتبقي": Math.max(0, (Number(d.amount) || 0) - (Number(d.paidAmount) || 0)),
    "تاريخ التسجيل": d.date,
    "تاريخ الاستحقاق": d.dueDate || '-',
    "البيان": d.notes || '',
    "الحالة": d.status === 'paid' ? 'مسدد بالكامل' : 'معلق'
  }));

  // 3. Wallets Summary Sheet
  const metrics = calculateMetrics();
  const walletRows = Object.keys(metrics.wallets).map(w => ({
    "الخزينة / طريقة الدفع": w,
    "الرصيد المتاح (ج.م)": metrics.wallets[w]
  }));

  const wb = XLSX.utils.book_new();
  const wsTx = XLSX.utils.json_to_sheet(txRows);
  const wsDebts = XLSX.utils.json_to_sheet(debts.length ? debts : [{ "تنبيه": "لا توجد ديون مسجلة" }]);
  const wsWallets = XLSX.utils.json_to_sheet(walletRows);

  XLSX.utils.book_append_sheet(wb, wsTx, "المعاملات المالية");
  XLSX.utils.book_append_sheet(wb, wsDebts, "دفتر الديون");
  XLSX.utils.book_append_sheet(wb, wsWallets, "أرصدة الخزائن");

  XLSX.writeFile(wb, `احسبلي_a7sbley_${todayString()}.xlsx`);
  showToast('تم تصدير ملف Excel الشامل بنجاح 🎉', 'success');
}

/* =========================================================
   QUICK INSIGHTS (الذكاء المالي ومقارنة الفترات)
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
        const cat = t.category || 'أخرى';
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
    insightText.textContent = 'سجل مصاريفك هذا الشهر للبدء في تتبع تحليلاتك المالية ومعدل الصرف.';
    insightBadge.className = 'w-full sm:w-auto text-center shrink-0 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 text-xs font-black';
    insightBadge.innerHTML = '<i class="fa-solid fa-chart-simple"></i> بداية الشهر';
    return;
  }

  if (prevExpenses > 0) {
    const diff = curExpenses - prevExpenses;
    const pct = Math.abs(Math.round((diff / prevExpenses) * 100));
    if (diff > 0) {
      insightText.innerHTML = `مصروفاتك هذا الشهر أعلى بـ <strong class="text-rose-400">${pct}%</strong> عن الشهر الماضي ${topCat ? `• الأكثر استهلاكاً: <strong class="text-orange-400">${escapeHTML(topCat)}</strong>` : ''}`;
      insightBadge.className = 'w-full sm:w-auto text-center shrink-0 px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-black';
      insightBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> زيادة ${pct}%`;
    } else {
      insightText.innerHTML = `ممتاز! وفرت <strong class="text-emerald-400">${pct}%</strong> مقارنة بالشهر السابق ${topCat ? `• الأعلى: <strong class="text-orange-400">${escapeHTML(topCat)}</strong>` : ''}`;
      insightBadge.className = 'w-full sm:w-auto text-center shrink-0 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black';
      insightBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i> وفر ${pct}%`;
    }
  } else {
    insightText.innerHTML = `إجمالي مصروفات الشهر حتى الآن: <strong class="text-orange-400">${money(curExpenses)} ج.م</strong> ${topCat ? `(الأعلى: ${escapeHTML(topCat)})` : ''}`;
    insightBadge.className = 'w-full sm:w-auto text-center shrink-0 px-3 py-1.5 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-black';
    insightBadge.innerHTML = `<i class="fa-solid fa-calculator"></i> ${money(curExpenses)} ج.م`;
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
        <img src="logo.png" style="width:60px; height:60px; border-radius:14px; object-fit:contain;" alt="احسبلي">
        <div>
          <h1 style="margin:0; font-size:24px; font-weight:900; color:#0f172a;">احسبلي | a7sbley</h1>
          <div style="font-size:11px; color:#f97316; font-weight:bold;">كشف حساب عميل معتمد</div>
        </div>
      </div>
      <div style="text-align:left; font-size:11px; color:#64748b;">
        <div>تاريخ الإصدار: <strong>${todayString()}</strong></div>
        <div>الوقت: <strong>${formatTimeTo12Hour(currentInputTimeString())}</strong></div>
      </div>
    </div>

    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-size:11px; color:#64748b;">العميل المحترم:</div>
        <div style="font-size:20px; font-weight:900; color:#0f172a;">${escapeHTML(clientName)}</div>
      </div>
      <div style="display:flex; gap:15px;">
        <div style="text-align:center;">
          <div style="font-size:10px; color:#64748b;">إجمالي الخدمات</div>
          <div style="font-size:14px; font-weight:900; color:#10b981;">${money(totalIncome)} ج.م</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px; color:#64748b;">متبقي عليه (لك)</div>
          <div style="font-size:14px; font-weight:900; color:#06b6d4;">${money(totalDebtRec)} ج.م</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px; color:#64748b;">مستحق له (عليك)</div>
          <div style="font-size:14px; font-weight:900; color:#8b5cf6;">${money(totalDebtPay)} ج.م</div>
        </div>
      </div>
    </div>

    <h3 style="font-size:14px; font-weight:900; margin-bottom:10px; color:#334155;">جدول المعاملات التفصيلي:</h3>
    <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:right;">
      <thead>
        <tr style="background:#f97316; color:white;">
          <th style="padding:8px 10px; border:1px solid #ea580c;">التاريخ</th>
          <th style="padding:8px 10px; border:1px solid #ea580c;">النوع</th>
          <th style="padding:8px 10px; border:1px solid #ea580c;">البيان والتفاصيل</th>
          <th style="padding:8px 10px; border:1px solid #ea580c;">طريقة الدفع</th>
          <th style="padding:8px 10px; border:1px solid #ea580c;">المبلغ</th>
          <th style="padding:8px 10px; border:1px solid #ea580c;">الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${txs.map(t => `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 10px; border:1px solid #e2e8f0; font-weight:bold;">${escapeHTML(t.date)}</td>
            <td style="padding:8px 10px; border:1px solid #e2e8f0;">${escapeHTML(typeName(t.type))}</td>
            <td style="padding:8px 10px; border:1px solid #e2e8f0;">${escapeHTML(t.notes || t.category)}</td>
            <td style="padding:8px 10px; border:1px solid #e2e8f0;">${escapeHTML(t.paymentMethod || 'كاش')}</td>
            <td style="padding:8px 10px; border:1px solid #e2e8f0; font-weight:900; color:${t.type==='income'?'#10b981':'#f43f5e'};">
              ${money(t.amount)} ج.م
            </td>
            <td style="padding:8px 10px; border:1px solid #e2e8f0;">${t.status === 'paid' ? 'مسدد' : (isDebt(t.type) ? 'معلق' : 'منجز')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="margin-top:35px; text-align:center; font-size:11px; color:#94a3b8; border-top:1px dashed #cbd5e1; padding-top:15px;">
      تم استخراج هذا التقرير تلقائياً بواسطة نظام <strong>احسبلي | a7sbley</strong> — شكراً لتعاملكم الراقي معنا ✨
    </div>
  `;

  if (typeof html2pdf !== 'undefined') {
    showToast('جاري إنشاء ملف PDF...', 'info');
    const opt = {
      margin: 8,
      filename: `كشف_حساب_${clientName}_${todayString()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(pdfContainer).save().then(() => {
      showToast('تم تحميل كشف الحساب PDF بنجاح ✓', 'success');
    }).catch(() => {
      window.print();
    });
  } else {
    window.print();
  }
}


/* =========================================================
   DEBT REMINDER CARD (توليد بطاقة المطالبة والتذكير)
   ========================================================= */
let currentCardDebt = null;

async function openDebtCardModal(debtId) {
  const debt = transactions.find(t => t.id === debtId);
  if (!debt) return;
  currentCardDebt = debt;
  showToast('جاري تصميم بطاقة المطالبة...', 'info');

  const canvas = document.getElementById('debtCardCanvas');
  const ctx = canvas.getContext('2d');
  
  // High-res canvas for crystal clear quality
  const W = 800;
  const hasImage = !!debt.receipt;
  const H = hasImage ? 1080 : 880;
  canvas.width = W;
  canvas.height = H;

  // Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#11141c');
  bgGrad.addColorStop(0.5, '#090a0f');
  bgGrad.addColorStop(1, '#050608');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Outer Glowing Border
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 6;
  ctx.strokeRect(15, 15, W - 30, H - 30);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // Ambient top light
  const ambientGrad = ctx.createRadialGradient(W / 2, 0, 10, W / 2, 0, 450);
  ambientGrad.addColorStop(0, 'rgba(249, 115, 22, 0.25)');
  ambientGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = ambientGrad;
  ctx.fillRect(0, 0, W, 400);

  // Load Logo
  try {
    const logoImg = new Image();
    logoImg.src = 'logo.png';
    await new Promise((resolve) => {
      logoImg.onload = resolve;
      logoImg.onerror = resolve;
    });
    if (logoImg.complete && logoImg.naturalWidth !== 0) {
      ctx.drawImage(logoImg, 50, 45, 90, 90);
    }
  } catch (e) {}

  // Header Title
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';

  ctx.font = '900 34px Cairo, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('احسبلي | a7sbley', W - 50, 80);

  ctx.font = '700 18px Cairo, sans-serif';
  ctx.fillStyle = '#f97316';
  ctx.fillText('إشعار استحقاق مالي ومطالبة خدمة', W - 50, 115);

  // Divider
  ctx.strokeStyle = 'rgba(249, 115, 22, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 155);
  ctx.lineTo(W - 50, 155);
  ctx.stroke();

  // Meta row (Date & Reference)
  ctx.font = '700 15px Cairo, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`تاريخ التسجيل: ${debt.date} ${debt.time ? `(${debt.time})` : ''}`, W - 50, 195);
  
  ctx.textAlign = 'left';
  ctx.fillText(`المرجع: #${debt.id.slice(-6).toUpperCase()}`, 50, 195);

  // Client Box
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, 50, 225, W - 100, 95, 16, true, true);

  ctx.font = '700 15px Cairo, sans-serif';
  ctx.fillStyle = '#f97316';
  ctx.fillText('العميل / الطرف المحترم:', W - 75, 260);

  ctx.font = '900 24px Cairo, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(debt.client || 'عميل محترم', W - 75, 295);

  // Service Details Box
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  roundRect(ctx, 50, 335, W - 100, 105, 16, true, true);

  ctx.font = '700 15px Cairo, sans-serif';
  ctx.fillStyle = '#f97316';
  ctx.fillText('تفاصيل الخدمة / العملية:', W - 75, 370);

  ctx.font = '800 21px Cairo, sans-serif';
  ctx.fillStyle = '#f1f5f9';
  const notesText = debt.notes || debt.category || 'خدمة صيانة وسوفت وير';
  ctx.fillText(notesText.slice(0, 50), W - 75, 410);

  let currentY = 460;

  // Optional: Image of Device / Receipt
  if (hasImage) {
    try {
      const receiptImg = new Image();
      receiptImg.crossOrigin = 'anonymous';
      receiptImg.src = debt.receipt;
      await new Promise((resolve) => {
        receiptImg.onload = resolve;
        receiptImg.onerror = resolve;
      });

      if (receiptImg.complete && receiptImg.naturalWidth !== 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.3)';
        roundRect(ctx, 50, currentY, W - 100, 200, 16, true, true);

        // Draw image clipped inside
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, 55, currentY + 5, W - 110, 190, 12, false, false);
        ctx.clip();
        
        // draw cover
        const imgRatio = receiptImg.width / receiptImg.height;
        const boxW = W - 110;
        const boxH = 190;
        let dw = boxW;
        let dh = boxW / imgRatio;
        if (dh < boxH) {
          dh = boxH;
          dw = boxH * imgRatio;
        }
        const dx = 55 + (boxW - dw) / 2;
        const dy = (currentY + 5) + (boxH - dh) / 2;
        ctx.drawImage(receiptImg, dx, dy, dw, dh);
        ctx.restore();

        // Badge on image
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        roundRect(ctx, W - 190, currentY + 15, 120, 30, 8, true, false);
        ctx.font = '800 13px Cairo, sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('📷 صورة الجهاز', W - 85, currentY + 36);

        currentY += 215;
      }
    } catch (e) {
      console.warn("Failed drawing card receipt image:", e);
    }
  }

  // Financial Big Box
  const total = Number(debt.amount) || 0;
  const paidAmt = Number(debt.paidAmount) || 0;
  const remaining = Math.max(0, total - paidAmt);

  const finGrad = ctx.createLinearGradient(50, currentY, W - 50, currentY + 140);
  finGrad.addColorStop(0, 'rgba(234, 88, 12, 0.25)');
  finGrad.addColorStop(1, 'rgba(249, 115, 22, 0.08)');
  ctx.fillStyle = finGrad;
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2;
  roundRect(ctx, 50, currentY, W - 100, 140, 20, true, true);

  // Labels inside financial box
  ctx.font = '700 15px Cairo, sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('إجمالي المبلغ:', W - 80, currentY + 45);
  ctx.fillText('المسدد منه:', W - 80, currentY + 95);

  ctx.textAlign = 'left';
  ctx.font = '800 18px Cairo, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${money(total)} ج.م`, W / 2 + 30, currentY + 45);
  ctx.fillText(`${money(paidAmt)} ج.م`, W / 2 + 30, currentY + 95);

  // Big Highlight for Remaining Amount
  ctx.fillStyle = '#ea580c';
  roundRect(ctx, 65, currentY + 20, (W / 2) - 80, 100, 16, true, false);

  ctx.textAlign = 'center';
  ctx.font = '700 14px Cairo, sans-serif';
  ctx.fillStyle = '#ffedd5';
  ctx.fillText('المتبقي المطلوب سداده', 65 + ((W / 2) - 80) / 2, currentY + 52);

  ctx.font = '900 28px Cairo, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${money(remaining)} ج.م`, 65 + ((W / 2) - 80) / 2, currentY + 95);

  currentY += 160;

  // Formal polite footer text
  ctx.textAlign = 'right';
  ctx.font = '700 13px Cairo, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('• يرجى التكرم بسداد المبلغ المستحق أعلاه لإغلاق حساب العملية، شاكرين ومقدرين حسن تعاونكم معنا.', W - 50, currentY);

  if (debt.dueDate) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`• موعد الاستحقاق المتفق عليه: ${debt.dueDate}`, W - 50, currentY + 28);
  }

  // Watermark footer
  ctx.textAlign = 'center';
  ctx.font = '800 12px Cairo, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillText('احسبلي | a7sbley Financial Management System', W / 2, H - 25);

  // Convert canvas to image
  const dataUrl = canvas.toDataURL('image/png', 0.95);
  const previewImg = document.getElementById('debtCardImg');
  const downloadBtn = document.getElementById('downloadDebtCardBtn');
  
  if (previewImg) previewImg.src = dataUrl;
  if (downloadBtn) {
    downloadBtn.href = dataUrl;
    downloadBtn.download = `مطالبة_${debt.client || 'عميل'}_${debt.date}.png`;
  }

  // Open modal
  const modal = document.getElementById('debtCardModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeDebtCardModal() {
  const modal = document.getElementById('debtCardModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  currentCardDebt = null;
}

async function shareDebtCardWhatsApp() {
  if (!currentCardDebt) return;
  const d = currentCardDebt;
  const total = Number(d.amount) || 0;
  const paid = Number(d.paidAmount) || 0;
  const rem = Math.max(0, total - paid);

  const text = `السلام عليكم ورحمة الله،
أهلاً بحضرتك يا ${d.client || 'فندم'} 🤝

نحيطكم علماً بأنه تم إنجاز الخدمة التالية بنجاح:
📌 *الخدمة:* ${d.notes || d.category || 'خدمة صيانة'}
📅 *التاريخ:* ${d.date}
💰 *إجمالي الحساب:* ${money(total)} ج.م
${paid > 0 ? `💵 *المسدد:* ${money(paid)} ج.م\n` : ''}🔴 *المبلغ المطلوب سداده:* ${money(rem)} ج.م

يرجى التكرم بالسداد لإغلاق العملية. شاكرين جداً لحسن تعاملكم الراقي معنا ✨
— *احسبلي | a7sbley*`;

  const canvas = document.getElementById('debtCardCanvas');

  // الحل الجذري: استخدام نظام المشاركة الأصلية للموبايل (Web Share API with Files)
  // هذا النظام يفتح قائمة المشاركة وتختار منها WhatsApp ليقوم بإرسال الصورة والنص معاً بضغطة زر واحدة!
  if (canvas && navigator.canShare) {
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const file = new File([blob], `مطالبة_${d.client || 'عميل'}.png`, { type: 'image/png' });
        const shareData = {
          files: [file],
          title: 'بطاقة مطالبة مالية | احسبلي',
          text: text
        };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          showToast('تمت مشاركة الصورة والنص بنجاح ✓', 'success');
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

  // إذا لم يدعم المتصفح مشاركة الملفات مباشرة (مثل بعض أجهزة الكمبيوتر):
  // نقوم بنسخ الصورة للحافظة + تحميلها وتوجيه المستخدم للواتساب
  let copiedImage = false;
  if (canvas && navigator.clipboard && window.ClipboardItem) {
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
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

  showToast(copiedImage ? 'تم نسخ الصورة للحافظة 📋! اضغط (لصق) في الواتساب' : 'تم حفظ الصورة! أرفقها من المعرض', 'info');
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

  const text = `السلام عليكم ورحمة الله،
أهلاً بحضرتك يا ${d.client || 'فندم'} 🤝

نحيطكم علماً بأنه تم إنجاز الخدمة التالية بنجاح:
📌 *الخدمة:* ${d.notes || d.category || 'خدمة صيانة'}
📅 *التاريخ:* ${d.date}
💰 *إجمالي الحساب:* ${money(total)} ج.م
${paid > 0 ? `💵 *المسدد:* ${money(paid)} ج.م\n` : ''}🔴 *المبلغ المطلوب سداده:* ${money(rem)} ج.م

تم إرفاق صورة بطاقة إشعار الاستحقاق المالي.
يرجى التكرم بالسداد لإغلاق العملية. شاكرين جداً لحسن تعاملكم الراقي معنا ✨
— *احسبلي | a7sbley*`;

  const canvas = document.getElementById('debtCardCanvas');
  if (canvas && navigator.canShare) {
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const file = new File([blob], `مطالبة_${d.client || 'عميل'}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'بطاقة مطالبة مالية | احسبلي',
            text: text
          });
          showToast('تم فتح نافذة المشاركة بنجاح ✓', 'success');
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
   CLIENT PENDING REQUESTS & APPROVAL SYSTEM (طلبات العملاء المعلقة)
   ========================================================= */
let pendingRequestsCache = [];

async function submitClientPendingRequest(event) {
  event.preventDefault();
  const params = new URLSearchParams(window.location.search);
  const clientName = params.get('client') || document.getElementById('portalClientName')?.textContent || 'عميل';
  const uidParam = params.get('uid');
  if (!uidParam) { showToast('معرّف المتجر غير صالح', 'error'); return; }

  const type = document.getElementById('portalReqType').value;
  const amount = Number(document.getElementById('portalReqAmount').value);
  const notes = sanitizeString(document.getElementById('portalReqNotes').value, 200);

  if (!amount || amount <= 0) { showToast('أدخل مبلغ صحيح', 'error'); return; }
  if (!notes) { showToast('اكتب بيان الخدمة أو السبب', 'error'); return; }

  const newReq = {
    id: 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    client: clientName,
    type,
    amount,
    category: type === 'debt_receivable' ? 'دين مستحق' : type === 'income' ? 'إيراد / دفعة' : 'مصروف',
    notes,
    date: todayString(),
    time: formatTimeTo12Hour(currentInputTimeString()),
    paymentMethod: 'معلق / طلب عميل',
    status: 'pending_approval',
    createdAt: Date.now()
  };

  try {
    const userRef = db.collection('users').doc(uidParam);
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(userRef);
      let currentReqs = [];
      if (doc.exists && Array.isArray(doc.data().pendingRequests)) {
        currentReqs = doc.data().pendingRequests;
      }
      currentReqs.unshift(newReq);
      transaction.set(userRef, { pendingRequests: currentReqs }, { merge: true });
    });

    showToast('تم إرسال طلبك بنجاح، في انتظار مراجعة وقبول المتجر ✓', 'success');
    event.target.reset();
  } catch (error) {
    console.error("Failed to submit client request:", error);
    showToast('فشل إرسال الطلب للسحابة', 'error');
  }
}

function renderAdminRequests() {
  const container = document.getElementById('adminRequestsList');
  const badge = document.getElementById('pendingReqBadge');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-4 text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>';

  if (!currentUser) return;
  db.collection('users').doc(currentUser.uid).get().then(doc => {
    if (!doc.exists) { container.innerHTML = '<div class="text-center py-4 text-xs text-slate-400">لا توجد طلبات</div>'; return; }
    const data = doc.data();
    const reqs = Array.isArray(data.pendingRequests) ? data.pendingRequests : [];
    pendingRequestsCache = reqs;
    if (badge) badge.textContent = reqs.length;

    container.innerHTML = '';
    if (!reqs.length) {
      container.innerHTML = '<div class="text-center py-8 text-xs text-slate-400 font-bold"><i class="fa-solid fa-circle-check text-3xl mb-2 text-emerald-500 opacity-60"></i><p>لا توجد طلبات معلقة من العملاء</p></div>';
      return;
    }

    reqs.forEach(req => {
      const card = document.createElement('div');
      card.className = 'p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3';
      card.innerHTML = `
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-black">طلب عميل جديد</span>
            <span class="text-xs font-black text-slate-800 dark:text-white">${escapeHTML(req.client)}</span>
          </div>
          <div class="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1">${escapeHTML(req.notes)}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">${escapeHTML(typeName(req.type))} • ${money(req.amount)} ج.م • ${escapeHTML(req.date)}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="approveClientRequest('${req.id}')" class="px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-black hover:bg-emerald-600 transition flex items-center gap-1">
            <i class="fa-solid fa-check"></i> موافق
          </button>
          <button onclick="rejectClientRequest('${req.id}')" class="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white text-xs font-black transition flex items-center gap-1">
            <i class="fa-solid fa-xmark"></i> رفض
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }).catch(err => {
    container.innerHTML = '<div class="text-center py-4 text-xs text-rose-500">خطأ في جلب الطلبات</div>';
  });
}

async function approveClientRequest(reqId) {
  if (!currentUser) return;
  const req = pendingRequestsCache.find(r => r.id === reqId);
  if (!req) return;

  openConfirm('قبول طلب العميل؟', `سيتم اعتماد معاملة لـ <strong>${escapeHTML(req.client)}</strong> بمبلغ <strong>${money(req.amount)} ج.م</strong> وإضافتها لحساباتك رسمياً.`, async () => {
    try {
      const userRef = db.collection('users').doc(currentUser.uid);
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(userRef);
        if (!doc.exists) return;
        const data = doc.data();
        let reqs = Array.isArray(data.pendingRequests) ? data.pendingRequests : [];
        let txs = Array.isArray(data.transactions) ? data.transactions : [];

        // Remove from pending
        reqs = reqs.filter(r => r.id !== reqId);

        // Add to verified transactions
        const newTx = normalizeTransaction({
          id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          type: req.type,
          amount: req.amount,
          date: req.date,
          time: req.time,
          client: req.client,
          category: req.category,
          paymentMethod: 'مقبول من العميل',
          notes: req.notes,
          status: isDebt(req.type) ? 'pending' : null,
          _updatedAt: Date.now()
        });
        txs.unshift(newTx);

        transaction.set(userRef, { pendingRequests: reqs, transactions: txs }, { merge: true });
      });

      showToast('تم قبول الطلب وإضافته للمعاملات بنجاح 🎉', 'success');
      renderAdminRequests();
      loadLocalData();
      refreshAll();
    } catch (error) {
      showToast('فشل قبول الطلب', 'error');
    }
  });
}

async function rejectClientRequest(reqId) {
  if (!currentUser) return;
  openConfirm('رفض وحذف الطلب؟', 'سيتم تجاهل هذا الطلب وحذفه نهائياً.', async () => {
    try {
      const userRef = db.collection('users').doc(currentUser.uid);
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(userRef);
        if (!doc.exists) return;
        let reqs = Array.isArray(doc.data().pendingRequests) ? doc.data().pendingRequests : [];
        reqs = reqs.filter(r => r.id !== reqId);
        transaction.set(userRef, { pendingRequests: reqs }, { merge: true });
      });

      showToast('تم رفض وحذف الطلب', 'info');
      renderAdminRequests();
    } catch (error) {
      showToast('فشل رفض الطلب', 'error');
    }
  });
}
