/* =========================================================
   A7SBLEY — DEBT REMINDERS (تذكير الديون) v15.1
   - فحص الديون المستحقة (متأخرة / النهارده / قريبة)
   - إشعار جهاز + تنبيه داخل التطبيق (مرة واحدة يوميًا لكل دين)
   - شاشة "التذكيرات" + رسالة واتساب جاهزة
   يعتمد على دوال app.js: getActiveTransactions, isDebt, todayString,
   money, escapeHTML, showToast, showLocalNotification,
   requestNotificationPermission, toggleDebtStatus, openDebtPaymentModal
   ========================================================= */
(function () {
  'use strict';

  var SETTINGS_KEY = 'a7sbley_debt_reminders_v1';
  var NOTIFIED_KEY = 'a7sbley_debt_reminders_notified_v1';
  var DEFAULTS = { enabled: true, daysBefore: 2 };
  var CHECK_EVERY_MS = 30 * 60 * 1000;
  var DAY_OPTIONS = [1, 2, 3, 5, 7];

  /* ---------- storage ---------- */
  function loadSettings() {
    try {
      var raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return Object.assign({}, DEFAULTS);
      var days = Number(raw.daysBefore);
      return {
        enabled: raw.enabled !== false,
        daysBefore: DAY_OPTIONS.indexOf(days) !== -1 ? days : DEFAULTS.daysBefore
      };
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  function loadNotified() {
    try {
      var raw = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (e) { return {}; }
  }
  function saveNotified(map, today) {
    var out = {};
    Object.keys(map).forEach(function (k) { if (map[k] === today) out[k] = today; });
    try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(out)); } catch (e) { /* ignore */ }
  }

  /* ---------- date helpers ---------- */
  function parseLocalDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function daysUntil(dueStr) {
    var due = parseLocalDate(dueStr);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!due) return null;
    return Math.round((due - today) / 86400000);
  }
  function arDays(n) {
    if (n === 1) return 'يوم';
    if (n === 2) return 'يومين';
    if (n <= 10) return n + ' أيام';
    return n + ' يوم';
  }
  function dueLabel(diff) {
    if (diff < 0) return 'متأخر ' + arDays(Math.abs(diff));
    if (diff === 0) return 'مستحق النهارده';
    if (diff === 1) return 'يستحق بكرة';
    return 'يستحق بعد ' + arDays(diff);
  }

  /* ---------- environment guards ---------- */
  function canRun() {
    if (typeof getActiveTransactions !== 'function' || typeof isDebt !== 'function') return false;
    if (typeof isPortalModeActive !== 'undefined' && isPortalModeActive) return false;
    if (typeof hasFeature === 'function' && !hasFeature('debts')) return false;
    return true;
  }
  function notifGranted() {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  /* ---------- core: collect reminder items ---------- */
  function getReminderItems(settings) {
    var s = settings || loadSettings();
    var overdue = [], today = [], soon = [];
    var pendingNoDue = 0;
    getActiveTransactions().forEach(function (t) {
      if (!isDebt(t.type) || t.status === 'paid') return;
      var rem = Math.max(0, (Number(t.amount) || 0) - (Number(t.paidAmount) || 0));
      if (rem <= 0) return;
      var diff = daysUntil(t.dueDate);
      if (diff === null) { pendingNoDue++; return; }
      var item = { id: t.id, debt: t, remaining: rem, diff: diff };
      if (diff < 0) overdue.push(item);
      else if (diff === 0) today.push(item);
      else if (diff <= s.daysBefore) soon.push(item);
    });
    overdue.sort(function (a, b) { return a.diff - b.diff; });
    soon.sort(function (a, b) { return a.diff - b.diff; });
    return { overdue: overdue, today: today, soon: soon, pendingNoDue: pendingNoDue,
             all: overdue.concat(today, soon) };
  }

  /* ---------- notifications ---------- */
  function who(item) {
    var d = item.debt;
    return (d.client && String(d.client).trim()) || (d.notes && String(d.notes).trim()) || 'دين';
  }
  function describe(item) {
    var isRec = item.debt.type === 'debt_receivable';
    return (isRec ? 'ليك عند ' : 'عليك لـ ') + who(item) + ' — ' +
      money(item.remaining) + ' ج.م (' + dueLabel(item.diff) + ')';
  }
  function buildSummary(items, hideNames) {
    var n = items.length;
    var title = '🔔 احسبلي — ' + (n === 1 ? 'عندك دين محتاج متابعة' : 'عندك ' + n + ' ديون محتاجة متابعة');
    if (hideNames) return { title: title, body: 'افتح التطبيق لمراجعة التفاصيل' };
    var lines = items.slice(0, 3).map(describe);
    if (n > 3) lines.push('و ' + (n - 3) + ' كمان…');
    return { title: title, body: lines.join('\n') };
  }

  function runCheck() {
    if (!canRun()) return;
    var s = loadSettings();
    var r = getReminderItems(s);
    updateBadge(r);
    renderIfOpen();
    if (!s.enabled || !r.all.length) return;

    var hidden = document.visibilityState === 'hidden';
    // مفيش تنبيهات بتظهر فوق شاشة القفل
    if (!hidden && typeof isAppLocked === 'function' && isAppLocked()) return;

    var today = todayString();
    var notified = loadNotified();
    var fresh = r.all.filter(function (it) { return notified[it.id] !== today; });
    if (!fresh.length) return;

    var delivered = false;

    if (hidden) {
      if (notifGranted() && typeof showLocalNotification === 'function') {
        // إشعار الجهاز بيظهر على شاشة القفل: نخفي الأسماء لو وضع الخصوصية أو قفل الـ PIN شغال
        var hideNames = (typeof isPrivacyMode !== 'undefined' && isPrivacyMode) ||
                        (typeof getPin === 'function' && !!getPin());
        var sum = buildSummary(fresh, hideNames);
        showLocalNotification(sum.title, sum.body, './');
        delivered = true;
      }
    } else {
      // المتأخر بيظهر أصلًا في تنبيه بداية التطبيق؛ هنا بننبّه على المستحق النهارده والقريب
      var upcoming = fresh.filter(function (it) { return it.diff >= 0; });
      if (upcoming.length && typeof showToast === 'function') {
        var hide = typeof isPrivacyMode !== 'undefined' && isPrivacyMode;
        var msg = hide
          ? '🔔 عندك ' + upcoming.length + ' ديون قربت مواعيدها'
          : '🔔 ' + describe(upcoming[0]) + (upcoming.length > 1 ? ' + ' + (upcoming.length - 1) + ' كمان' : '');
        showToast(msg, 'info');
      }
      delivered = true;
    }

    if (delivered) {
      fresh.forEach(function (it) { notified[it.id] = today; });
      saveNotified(notified, today);
    }
  }

  /* ---------- WhatsApp reminder ---------- */
  function buildReminderText(debt) {
    var rem = Math.max(0, (Number(debt.amount) || 0) - (Number(debt.paidAmount) || 0));
    var diff = daysUntil(debt.dueDate);
    var line = '';
    if (diff !== null) {
      if (diff < 0) line = '⏰ الميعاد عدّى من ' + arDays(Math.abs(diff)) + '، يا ريت نرتب السداد في أقرب وقت.';
      else if (diff === 0) line = '⏰ ميعاد السداد النهارده.';
      else if (diff === 1) line = '⏰ ميعاد السداد بكرة.';
      else line = '⏰ فاضل ' + arDays(diff) + ' على ميعاد السداد.';
    }
    return 'السلام عليكم ورحمة الله 🌷\n' +
      'أهلاً بحضرتك يا ' + (debt.client || 'فندم') + '\n\n' +
      'تذكير ودّي بخصوص: ' + (debt.notes || debt.category || 'الحساب المستحق') + '\n' +
      '💰 *المتبقي:* ' + money(rem) + ' ج.م\n' +
      (debt.dueDate ? '📅 *ميعاد الاستحقاق:* ' + debt.dueDate + '\n' : '') +
      (line ? line + '\n' : '') +
      '\nلو اتسدد خلاص تجاهل الرسالة دي، ومتشكرين جدًا لحضرتك 🙏\n' +
      '— *احسبلي | a7sbley*';
  }

  window.sendDebtReminderWhatsApp = function (id) {
    var debt = (typeof transactions !== 'undefined' ? transactions : []).find(function (t) { return t.id === id; });
    if (!debt) return;
    window.open('https://wa.me/?text=' + encodeURIComponent(buildReminderText(debt)), '_blank', 'noopener');
  };

  /* ---------- badge on the debts panel ---------- */
  function updateBadge(r) {
    var btn = document.getElementById('debtRemindersBtn');
    var cnt = document.getElementById('debtRemindersCount');
    if (!btn || !cnt) return;
    var n = r.all.length;
    cnt.textContent = n;
    cnt.classList.toggle('dr-hidden', n === 0);
    btn.classList.toggle('dr-urgent', r.overdue.length + r.today.length > 0);
  }

  /* ---------- reminders sheet ---------- */
  var lastFocus = null;

  function ensureModal() {
    var el = document.getElementById('drModal');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'drModal';
    el.className = 'dr-overlay no-print';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'drTitle');
    el.innerHTML =
      '<div class="dr-sheet">' +
        '<div class="dr-head">' +
          '<div><h3 id="drTitle">🔔 تذكيرات الديون</h3><p id="drSub"></p></div>' +
          '<button type="button" class="dr-x" data-dr-act="close" aria-label="إغلاق">×</button>' +
        '</div>' +
        '<div id="drSettings" class="dr-settings"></div>' +
        '<div id="drBody" class="dr-body"></div>' +
      '</div>';
    document.body.appendChild(el);

    el.addEventListener('click', function (e) {
      if (e.target === el) { closeReminders(); return; }
      var b = e.target.closest('[data-dr-act]');
      if (!b) return;
      var act = b.getAttribute('data-dr-act');
      var id = b.getAttribute('data-id');
      if (act === 'close') closeReminders();
      else if (act === 'wa') window.sendDebtReminderWhatsApp(id);
      else if (act === 'paid') { if (typeof toggleDebtStatus === 'function') toggleDebtStatus(id); }
      else if (act === 'pay') {
        closeReminders();
        if (typeof openDebtPaymentModal === 'function') openDebtPaymentModal(id);
      }
      else if (act === 'perm') enableDeviceNotifications();
      else if (act === 'test' && typeof sendTestNotification === 'function') sendTestNotification();
    });
    el.addEventListener('change', function (e) {
      var s = loadSettings();
      if (e.target.id === 'drEnabled') s.enabled = !!e.target.checked;
      else if (e.target.id === 'drDays') s.daysBefore = Number(e.target.value) || DEFAULTS.daysBefore;
      else return;
      saveSettings(s);
      runCheck();
    });
    return el;
  }

  function enableDeviceNotifications() {
    if (typeof requestNotificationPermission !== 'function') return;
    requestNotificationPermission().then(function (ok) {
      if (ok) {
        try { localStorage.setItem('ehsebli_notif_enabled', 'true'); } catch (e) { /* ignore */ }
        if (typeof showToast === 'function') showToast('تم تفعيل إشعارات الديون 🔔', 'success');
      }
      renderSettings();
    });
  }

  function renderSettings() {
    var box = document.getElementById('drSettings');
    if (!box) return;
    var s = loadSettings();
    var notifHtml;
    if (!('Notification' in window)) {
      notifHtml = '<p class="dr-note">الإشعارات مش مدعومة على الجهاز ده، والتنبيهات هتظهرلك جوه التطبيق بس.</p>';
    } else if (Notification.permission === 'granted') {
      notifHtml = '<div class="dr-row"><span class="dr-ok">✓ إشعارات الجهاز شغالة</span>' +
        '<button type="button" class="dr-link" data-dr-act="test">جرّب إشعار</button></div>';
    } else if (Notification.permission === 'denied') {
      notifHtml = '<p class="dr-note">إشعارات الجهاز مرفوضة. فعّلها من إعدادات المتصفح للموقع ده.</p>';
    } else {
      notifHtml = '<div class="dr-row"><span class="dr-note">عشان توصلك إشعارات حتى والتطبيق مقفول.</span>' +
        '<button type="button" class="dr-btn-sm" data-dr-act="perm">فعّل إشعارات الجهاز</button></div>';
    }
    var opts = DAY_OPTIONS.map(function (d) {
      return '<option value="' + d + '"' + (d === s.daysBefore ? ' selected' : '') + '>قبلها بـ ' + arDays(d) + '</option>';
    }).join('');
    box.innerHTML =
      '<label class="dr-row dr-switch"><span>تفعيل تذكيرات الديون</span>' +
        '<input type="checkbox" id="drEnabled"' + (s.enabled ? ' checked' : '') + '></label>' +
      '<label class="dr-row"><span>فكّرني</span>' +
        '<select id="drDays" class="dr-select">' + opts + '</select></label>' +
      notifHtml +
      '<p class="dr-note">على الآيفون: لازم تثبّت التطبيق على الشاشة الرئيسية عشان الإشعارات تشتغل.</p>';
  }

  function card(item) {
    var d = item.debt;
    var isRec = d.type === 'debt_receivable';
    var cls = item.diff < 0 ? 'dr-late' : item.diff === 0 ? 'dr-today' : 'dr-soon';
    var id = escapeHTML(item.id);
    var actions = '';
    if (isRec) actions += '<button type="button" class="dr-act dr-wa" data-dr-act="wa" data-id="' + id + '">ذكّره واتساب</button>';
    else actions += '<button type="button" class="dr-act dr-pay" data-dr-act="pay" data-id="' + id + '">سجّل دفعة</button>';
    actions += '<button type="button" class="dr-act dr-done" data-dr-act="paid" data-id="' + id + '">تم السداد ✓</button>';
    return '<div class="dr-card ' + cls + '">' +
      '<div class="dr-card-top">' +
        '<div class="dr-card-info">' +
          '<div class="dr-card-name">' + escapeHTML(isRec ? 'ليك عند ' : 'عليك لـ ') + escapeHTML(who(item)) + '</div>' +
          '<div class="dr-card-sub">' + escapeHTML(d.notes || d.category || '') + '</div>' +
        '</div>' +
        '<div class="dr-card-amt">' + escapeHTML(money(item.remaining)) + ' ج.م</div>' +
      '</div>' +
      '<div class="dr-card-meta"><span class="dr-chip">' + escapeHTML(dueLabel(item.diff)) + '</span>' +
        '<span class="dr-date">' + escapeHTML(d.dueDate) + '</span></div>' +
      '<div class="dr-actions">' + actions + '</div>' +
    '</div>';
  }

  function section(title, items) {
    if (!items.length) return '';
    return '<h4 class="dr-sec">' + title + ' <span>(' + items.length + ')</span></h4>' + items.map(card).join('');
  }

  function renderBody() {
    var body = document.getElementById('drBody');
    var sub = document.getElementById('drSub');
    if (!body) return;
    var r = getReminderItems();
    if (sub) sub.textContent = r.all.length ? r.all.length + ' دين محتاج متابعة' : 'مفيش حاجة مستعجلة';
    var html = section('⚠️ متأخرة', r.overdue) + section('⏰ مستحقة النهارده', r.today) + section('🕒 قريبة', r.soon);
    if (!r.all.length) {
      html = '<div class="dr-empty"><div class="dr-empty-ico">🎉</div>' +
        '<p>مفيش ديون متأخرة أو قريبة من ميعادها.</p></div>';
    }
    if (r.pendingNoDue > 0) {
      html += '<p class="dr-note dr-hint">فيه ' + r.pendingNoDue +
        ' دين من غير تاريخ استحقاق. ضيف تاريخ لكل دين عشان التذكير يشتغل عليه.</p>';
    }
    body.innerHTML = html;
  }

  function renderIfOpen() {
    var el = document.getElementById('drModal');
    if (el && el.classList.contains('open')) { renderSettings(); renderBody(); }
  }

  function openReminders() {
    if (typeof hasFeature === 'function' && !hasFeature('debts')) {
      if (typeof showToast === 'function') showToast('دفتر الديون غير متاح لدورك', 'error');
      return;
    }
    var el = ensureModal();
    lastFocus = document.activeElement;
    renderSettings();
    renderBody();
    el.classList.add('open');
    var x = el.querySelector('.dr-x');
    if (x) x.focus();
  }
  function closeReminders() {
    var el = document.getElementById('drModal');
    if (!el) return;
    el.classList.remove('open');
    if (lastFocus && typeof lastFocus.focus === 'function') { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
  }
  window.openDebtReminders = openReminders;
  window.closeDebtReminders = closeReminders;

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeReminders();
  });

  /* ---------- scheduling ---------- */
  var debounceTimer = null;
  window.onDebtRemindersDataChanged = function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runCheck, 1200);
  };

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') runCheck();
  });
  setInterval(runCheck, CHECK_EVERY_MS);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(runCheck, 3000); });
  } else {
    setTimeout(runCheck, 3000);
  }
})();
