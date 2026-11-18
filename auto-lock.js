/* =========================================================
   A7SBLEY — AUTO LOCK + PIN RECOVERY  v15.2
   1) قفل تلقائي: عند الخروج من التطبيق أو بعد فترة خمول
   2) انتظار متزايد بعد المحاولات الغلط
   3) شاشة "نسيت الرمز": تأكيد الهوية (Google / كلمة سر / إعادة دخول)
   تعتمد على app.js: getPin, showPinLock, hidePinLock, updatePinUI,
   openPinModal, showToast, currentUser, auth, PIN_KEY
   ========================================================= */
(function () {
  'use strict';

  var SETTINGS_KEY = 'a7sbley_autolock_v1';
  var ATTEMPTS_KEY = 'a7sbley_pin_attempts_v1';
  var RESET_KEY    = 'a7sbley_pin_reset_v1';

  var MODES = { now: 0, m1: 60000, m5: 300000, m15: 900000 }; // "off" = بدون قفل تلقائي
  var DEFAULT_MODE = 'm5';
  var TICK_MS = 10000;          // فحص الخمول كل 10 ثواني (عملية رخيصة جدًا)
  var FREE_TRIES = 5;           // محاولات قبل بدء الانتظار
  var MAX_COOLDOWN_S = 300;
  var RESET_TTL_MS = 15 * 60 * 1000;

  var lastActive = Date.now();
  var hiddenAt = 0;
  var cooldownTimer = null;

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type || 'info'); }
  function readJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } }
  function removeKey(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  function pinKey() { return typeof PIN_KEY !== 'undefined' ? PIN_KEY : 'ehsebli_pin_v2'; }
  function user() { return typeof currentUser !== 'undefined' ? currentUser : null; }

  /* ---------- auto-lock settings ---------- */
  function getMode() {
    var m = null;
    try { m = localStorage.getItem(SETTINGS_KEY); } catch (e) { /* ignore */ }
    return (m === 'off' || Object.prototype.hasOwnProperty.call(MODES, m)) ? m : DEFAULT_MODE;
  }
  function setMode(m) {
    try { localStorage.setItem(SETTINGS_KEY, m); } catch (e) { /* ignore */ }
    lastActive = Date.now();
  }

  /* ---------- lock state ---------- */
  function isLocked() {
    var el = $('lockScreen');
    return !!el && !el.classList.contains('hidden');
  }
  function canLock() {
    if (typeof getPin !== 'function' || !getPin()) return false;
    if (!user()) return false;
    if (typeof isPortalModeActive !== 'undefined' && isPortalModeActive) return false;
    return true;
  }
  function lockNow() {
    if (!isLocked() && canLock() && typeof showPinLock === 'function') showPinLock();
  }
  window.isAppLocked = isLocked;

  /* ---------- idle + visibility ---------- */
  function touch() { lastActive = Date.now(); }

  function tick() {
    var m = getMode();
    if (m === 'off' || m === 'now') return;
    if (document.visibilityState === 'visible' && Date.now() - lastActive >= MODES[m]) lockNow();
  }

  function onHidden() {
    hiddenAt = Date.now();
    // "فور الخروج": نقفل لحظة الخروج عشان لقطة التبديل بين التطبيقات متظهرش بيانات
    if (getMode() === 'now') lockNow();
  }
  function onVisible() {
    var m = getMode();
    if (hiddenAt && m !== 'off' && Date.now() - hiddenAt >= MODES[m]) lockNow();
    hiddenAt = 0;
    lastActive = Date.now();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') onHidden(); else onVisible();
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) onVisible(); });
  ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(function (ev) {
    document.addEventListener(ev, touch, { passive: true, capture: true });
  });
  setInterval(tick, TICK_MS);

  /* ---------- attempts limiter ---------- */
  function readAttempts() {
    var s = readJSON(ATTEMPTS_KEY, {});
    return { fails: Number(s.fails) || 0, until: Number(s.until) || 0 };
  }
  function cooldownLeft() {
    var left = Math.ceil((readAttempts().until - Date.now()) / 1000);
    return Math.max(0, Math.min(left, MAX_COOLDOWN_S)); // حد أقصى حتى لو الساعة اتغيّرت
  }
  window.pinCooldownActive = function () { return cooldownLeft() > 0; };

  function renderLockState(failedNow) {
    var s = readAttempts();
    var left = cooldownLeft();
    var err = $('unlockError'), input = $('unlockPinInput'), btn = $('unlockBtn'), forgot = $('lockForgotBtn');

    if (forgot) forgot.classList.toggle('lk-pulse', s.fails > 0 || left > 0);
    if (input) input.disabled = left > 0;
    if (btn) btn.disabled = left > 0;

    if (err) {
      var msg = '';
      if (left > 0) {
        msg = 'محاولات كتير غلط. جرّب تاني بعد ' + left + ' ثانية';
      } else if (failedNow) {
        var rem = FREE_TRIES - s.fails;
        msg = 'الرمز غلط' + (rem === 1 ? ' — فاضل محاولة واحدة' : rem === 2 ? ' — فاضل محاولتين' : '') +
              '. لو نسيته اضغط «نسيت الرمز؟»';
      }
      err.textContent = msg;
      err.classList.toggle('hidden', !msg);
    }
    if (failedNow && input) {
      input.classList.remove('lk-shake');
      void input.offsetWidth; // إعادة تشغيل الأنيميشن
      input.classList.add('lk-shake');
    }

    if (left > 0) {
      if (!cooldownTimer) cooldownTimer = setInterval(function () { renderLockState(false); }, 1000);
    } else if (cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      if (input && isLocked()) input.focus();
    }
  }

  window.onPinFailed = function () {
    var s = readAttempts();
    s.fails += 1;
    if (s.fails >= FREE_TRIES) {
      s.until = Date.now() + Math.min(MAX_COOLDOWN_S, 30 * Math.pow(2, s.fails - FREE_TRIES)) * 1000;
    }
    writeJSON(ATTEMPTS_KEY, s);
    renderLockState(true);
  };

  window.onPinUnlocked = function () {
    removeKey(ATTEMPTS_KEY);
    lastActive = Date.now();
    if (typeof onDebtRemindersDataChanged === 'function') onDebtRemindersDataChanged();
  };

  window.onPinLockShown = function () {
    showMainView();
    renderLockState(false);
  };

  /* ---------- views: main lock / forgot PIN ---------- */
  function showMainView() {
    var main = $('lockMainView'), forgot = $('lockForgotView');
    if (!main || !forgot) return;
    forgot.classList.add('hidden');
    main.classList.remove('hidden');
    setForgotError('');
    var pwd = $('lockForgotPwd'); if (pwd) pwd.value = '';
  }

  function setForgotError(msg) {
    var el = $('lockForgotError');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  function setBusy(busy) {
    var view = $('lockForgotView');
    if (!view) return;
    var btns = view.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = !!busy;
  }

  window.openForgotPinView = function () {
    var u = user();
    var main = $('lockMainView'), view = $('lockForgotView');
    if (!main || !view) return;
    var provs = (u && u.providerData ? u.providerData : []).map(function (p) { return p.providerId; });
    var hasGoogle = provs.indexOf('google.com') !== -1;
    var hasEmail = provs.indexOf('password') !== -1 && !!(u && u.email);

    $('lockForgotGoogle').classList.toggle('hidden', !hasGoogle);
    $('lockForgotEmail').classList.toggle('hidden', !hasEmail);
    var note = $('lockForgotReloginNote');
    if (note) note.textContent = (hasGoogle || hasEmail)
      ? 'لو التأكيد اللي فوق مش شغال، سجّل خروج وادخل من جديد، وهنشيل القفل أول ما تدخل.'
      : 'حسابك مسجّل بالموبايل: سجّل خروج وادخل من جديد بكود SMS، وهنشيل القفل أول ما تدخل.';

    setForgotError('');
    setBusy(false);
    main.classList.add('hidden');
    view.classList.remove('hidden');
    var focusEl = hasEmail ? $('lockForgotPwd') : view.querySelector('button');
    if (focusEl) focusEl.focus();
  };

  window.closeForgotPinView = function () {
    showMainView();
    var input = $('unlockPinInput');
    if (input && !input.disabled) input.focus();
  };

  document.addEventListener('keydown', function (e) {
    var view = $('lockForgotView');
    if (e.key === 'Escape' && view && !view.classList.contains('hidden')) window.closeForgotPinView();
  });

  /* ---------- recovery ---------- */
  function resetPinState() {
    removeKey(pinKey());
    removeKey(ATTEMPTS_KEY);
    if (typeof updatePinUI === 'function') updatePinUI();
  }

  function finishRecovery() {
    resetPinState();
    if (typeof hidePinLock === 'function') hidePinLock();
    showMainView();
    lastActive = Date.now();
    toast('تم التأكيد ✓ اتشال القفل. حط رمز جديد', 'success');
    setTimeout(function () { if (typeof openPinModal === 'function') openPinModal(); }, 350);
  }

  function authErrorMessage(err) {
    switch (err && err.code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials': return 'كلمة السر غلط';
      case 'auth/too-many-requests': return 'محاولات كتير. جرّب بعد شوية';
      case 'auth/network-request-failed': return 'مفيش اتصال بالإنترنت';
      case 'auth/popup-blocked': return 'المتصفح منع نافذة Google. جرّب «تسجيل الخروج والدخول من جديد»';
      case 'auth/user-mismatch': return 'ده مش نفس الحساب المسجّل دخوله';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request': return '';
      default: return 'فشل التحقق، جرّب تاني';
    }
  }

  window.forgotWithGoogle = function () {
    var u = user();
    if (!u) return;
    setForgotError('');
    setBusy(true);
    u.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider())
      .then(function (res) {
        if (res && res.user && res.user.uid === u.uid) finishRecovery();
        else setForgotError('ده مش نفس الحساب المسجّل دخوله');
      })
      .catch(function (err) { setForgotError(authErrorMessage(err)); })
      .then(function () { setBusy(false); });
  };

  window.forgotWithPassword = function () {
    var u = user();
    var input = $('lockForgotPwd');
    var pwd = input ? input.value : '';
    if (!u || !u.email) return;
    if (!pwd) { setForgotError('اكتب كلمة سر الحساب'); if (input) input.focus(); return; }
    setForgotError('');
    setBusy(true);
    u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, pwd))
      .then(finishRecovery)
      .catch(function (err) {
        setForgotError(authErrorMessage(err));
        if (input) { input.value = ''; input.focus(); }
      })
      .then(function () { setBusy(false); });
  };

  // سجّل خروج، ولما يدخل المستخدم تاني بنفس الحساب بنشيل القفل (الدخول نفسه هو إثبات الهوية)
  window.forgotViaRelogin = function () {
    var u = user();
    if (!u || typeof auth === 'undefined') return;
    var uid = u.uid;
    setBusy(true);
    auth.signOut()
      .then(function () {
        writeJSON(RESET_KEY, { uid: uid, exp: Date.now() + RESET_TTL_MS });
        toast('سجّل دخولك من جديد وهنشيل القفل', 'info');
      })
      .catch(function () { setForgotError('تعذّر تسجيل الخروج، جرّب تاني'); })
      .then(function () { setBusy(false); });
  };

  // بتتنادى من app.js بعد أي تسجيل دخول: true = القفل اتشال ومحتاجش شاشة قفل
  window.consumePinResetFlag = function (uid) {
    var f = readJSON(RESET_KEY, null);
    if (!f) return false;
    removeKey(RESET_KEY);
    if (f.uid !== uid || !(f.exp > Date.now())) return false;
    resetPinState();
    toast('تم التأكيد بتسجيل الدخول ✓ اتشال القفل. حط رمز جديد', 'success');
    setTimeout(function () { if (typeof openPinModal === 'function') openPinModal(); }, 1200);
    return true;
  };

  /* ---------- settings select (داخل نافذة PIN) ---------- */
  var sel = $('autoLockSelect');
  if (sel) {
    sel.value = getMode();
    sel.addEventListener('change', function () {
      setMode(sel.value);
      toast('تم حفظ إعداد القفل التلقائي', 'success');
    });
  }
})();
