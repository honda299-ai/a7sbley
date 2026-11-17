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

async function doSyncToCloud() {
  if (!currentUser) return;
  const uid = currentUser.uid;
  try {
    const ops = [];
    const localIds = new Set();
    transactions.forEach(t => {
      if (!t || !t.id || !validateTransaction(t)) return;
      localIds.add(t.id);
      const j = txJSON(t);
      if (cloudSnapshot.get(t.id) !== j) ops.push({ kind: 'set', id: t.id, json: j });
    });
    cloudSnapshot.forEach((_, id) => { if (!localIds.has(id)) ops.push({ kind: 'del', id }); });

    for (let i = 0; i < ops.length; i += 400) {
      const batch = db.batch();
      ops.slice(i, i + 400).forEach(op => {
        const ref = txCol(uid).doc(op.id);
        if (op.kind === 'set') batch.set(ref, JSON.parse(op.json));
        else batch.delete(ref);
      });
      await batch.commit();
      ops.slice(i, i + 400).forEach(op => { if (op.kind === 'set') cloudSnapshot.set(op.id, op.json); else cloudSnapshot.delete(op.id); });
    }

    await db.collection('users').doc(uid).set({
      budget: getBudget() || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    refreshSharedPortals();
  } catch (error) {
    console.error('Cloud sync error:', error);
    showToast('فشل المزامنة للسحابة: ' + (error.code || error.message), 'error');
  }
}

async function forceSyncToCloud() { return syncToCloud(); }

async function loadCloudData(uid) {
  try {
    const userRef = db.collection('users').doc(uid);
    const [userDoc, txSnap] = await Promise.all([userRef.get(), txCol(uid).get()]);
    const cloudTx = [];
    cloudSnapshot.clear();
    txSnap.forEach(d => { const v = d.data(); if (validateTransaction(v)) { cloudTx.push(v); cloudSnapshot.set(d.id, txJSON(v)); } });

    let legacyTx = [], legacyReqs = [];
    if (userDoc.exists) {
      const data = userDoc.data();
      if (Array.isArray(data.transactions)) legacyTx = data.transactions;          // old single-document format
      if (Array.isArray(data.pendingRequests)) legacyReqs = data.pendingRequests;
      if (data.budget !== undefined) localStorage.setItem(BUDGET_KEY, data.budget);
    }

    transactions = mergeTransactions(mergeTransactions(transactions, cloudTx), legacyTx);
    saveLocalData();
    refreshAll();
    await doSyncToCloud();

    // One-time migration cleanup: move legacy arrays out of the user document (1MB limit)
    if (legacyTx.length || legacyReqs.length) {
      const b = db.batch();
      legacyReqs.forEach(r => { if (r && r.id) b.set(userRef.collection('requests').doc(r.id), r); });
      b.update(userRef, {
        transactions: firebase.firestore.FieldValue.delete(),
        pendingRequests: firebase.firestore.FieldValue.delete()
      });
      await b.commit();
    }
    await loadPortalIndex(uid);
    subscribeToRequests(uid);
    showToast('تمت مزامنة بياناتك من السحابة ✓', 'success');
  } catch (error) {
    console.error('loadCloudData failed:', error);
    loadAllLocal();
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
function loadAllLocal() {
  loadLocalData();
  loadInventory();
  loadRecurring();
  loadAuditLog();
  checkOverdueDebtsAlert();
}

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
  const heroSet = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  heroSet('heroNet', money(metrics.available)); heroSet('heroIncome', money(metrics.income));
  heroSet('heroExpense', money(metrics.expense)); heroSet('heroDebt', money(metrics.debtRec));
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
          <div class="flex items-center gap-2">
            ${item.receipt ? `
              <img src="${item.receipt}" 
                   onclick="viewReceiptImage('${item.receipt}')" 
                   title="اضغط لتكبير الصورة"
                   class="w-9 h-9 rounded-xl object-cover border border-orange-500/40 cursor-pointer hover:scale-110 hover:border-orange-500 transition shadow-sm shrink-0" 
                   alt="صورة العملية">
            ` : ''}
            <div>
              <div class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <span>${escapeHTML(item.notes || 'بدون بيان')}</span>
              </div>
              ${item.reference ? `<div class="text-[9px] text-slate-400 mt-0.5">مرجع: ${escapeHTML(item.reference)}</div>` : ''}
            </div>
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
            <h4 class="text-sm font-black truncate flex items-center gap-2">
              ${d.receipt ? `
                <img src="${d.receipt}" 
                     onclick="viewReceiptImage('${d.receipt}')" 
                     title="معاينة الفاتورة / صورة الجهاز" 
                     class="w-7 h-7 rounded-lg object-cover border border-orange-500/50 cursor-pointer hover:scale-105 transition shrink-0" 
                     alt="مرفق">
              ` : ''}
              <span>${escapeHTML(d.notes || 'دين بدون بيان')}</span>
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

