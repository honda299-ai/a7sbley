/* =========================================================
   CLIENT PENDING REQUESTS & APPROVAL SYSTEM (طلبات العملاء المعلقة)
   ========================================================= */
let pendingRequestsCache = [];

async function submitClientPendingRequest(event) {
  event.preventDefault();
  const params = new URLSearchParams(window.location.search);
  const clientName = (params.get('client') || document.getElementById('portalClientName')?.textContent || 'عميل').slice(0, 100);
  const meta = window.portalMeta;
  if (!meta || !meta.ownerUid || !meta.portalId) { showToast('رابط غير صالح، اطلب رابطًا جديدًا من المتجر', 'error'); return; }

  const type = document.getElementById('portalReqType').value;
  const amount = Number(document.getElementById('portalReqAmount').value);
  const notes = sanitizeString(document.getElementById('portalReqNotes').value, 200);

  if (!['income', 'debt_receivable', 'expense'].includes(type)) { showToast('نوع غير صالح', 'error'); return; }
  if (!amount || amount <= 0 || amount >= 100000000) { showToast('أدخل مبلغ صحيح', 'error'); return; }
  if (!notes) { showToast('اكتب بيان الخدمة أو السبب', 'error'); return; }

  const id = 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const newReq = {
    id, portalId: meta.portalId, client: clientName, type, amount,
    category: type === 'debt_receivable' ? 'دين مستحق' : type === 'income' ? 'إيراد / دفعة' : 'مصروف',
    notes, date: todayString(), time: formatTimeTo12Hour(currentInputTimeString()),
    paymentMethod: 'معلق / طلب عميل', status: 'pending_approval', createdAt: Date.now()
  };

  try {
    await db.collection('users').doc(meta.ownerUid).collection('requests').doc(id).set(newReq);
    showToast('تم إرسال طلبك بنجاح، في انتظار مراجعة وقبول المتجر ✓', 'success');
    event.target.reset();
  } catch (error) {
    console.error('Failed to submit client request:', error);
    showToast('فشل إرسال الطلب للسحابة', 'error');
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
    client: req.client, category: req.category, paymentMethod: 'مقبول من العميل',
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
  container.innerHTML = '<div class="text-center py-4 text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>';

  if (!currentUser) return;
  fetchPendingRequests().then(reqs => {
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
      await approveRequestCore(req);
      showToast('تم قبول الطلب وإضافته للمعاملات بنجاح 🎉', 'success');
      renderAdminRequests();
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
      await rejectRequestCore(reqId);
      showToast('تم رفض وحذف الطلب', 'info');
      renderAdminRequests();
    } catch (error) {
      showToast('فشل رفض الطلب', 'error');
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
   FREE CLIENT REQUESTS APPROVAL MODAL (متاح لكل الحسابات)
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
  container.innerHTML = '<div class="text-center py-6 text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin text-orange-500 text-base"></i><p class="mt-2">جاري جلب الطلبات...</p></div>';

  if (!currentUser) return;
  fetchPendingRequests().then(reqs => {

    container.innerHTML = '';
    if (!reqs.length) {
      container.innerHTML = '<div class="text-center py-10 text-xs text-slate-400 font-bold"><i class="fa-solid fa-circle-check text-3xl mb-2 text-emerald-500 opacity-80"></i><p>لا توجد طلبات معلقة من العملاء حالياً</p></div>';
      return;
    }

    reqs.forEach(req => {
      const card = document.createElement('div');
      card.className = 'p-3.5 rounded-2xl border border-amber-500/30 bg-black/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3';
      card.innerHTML = `
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-black">طلب جديد</span>
            <span class="text-xs font-black text-white">${escapeHTML(req.client)}</span>
          </div>
          <div class="text-xs font-bold text-slate-200 mt-1">${escapeHTML(req.notes)}</div>
          <div class="text-[10px] text-orange-400 mt-0.5 font-bold">${escapeHTML(typeName(req.type))} • ${money(req.amount)} ج.م • ${escapeHTML(req.date)}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="approveGlobalClientRequest('${req.id}')" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-1 shadow">
            <i class="fa-solid fa-check"></i> موافق
          </button>
          <button onclick="rejectGlobalClientRequest('${req.id}')" class="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white text-xs font-black transition flex items-center gap-1">
            <i class="fa-solid fa-xmark"></i> رفض
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }).catch(err => {
    container.innerHTML = '<div class="text-center py-6 text-xs text-rose-500 font-bold">خطأ في جلب الطلبات من السحابة</div>';
  });
}

async function approveGlobalClientRequest(reqId) {
  if (!currentUser) return;
  const req = pendingRequestsCache.find(r => r.id === reqId);
  if (!req) return;
  closeClientRequestsModal();
  openConfirm('قبول طلب العميل؟', `سيتم اعتماد معاملة لـ <strong>${escapeHTML(req.client)}</strong> بمبلغ <strong>${money(req.amount)} ج.م</strong> وإضافتها لحساباتك رسمياً.`, async () => {
    try {
      await approveRequestCore(req);
      showToast('تم قبول الطلب وإضافته للمعاملات بنجاح 🎉', 'success');
      renderGlobalClientRequests();
      refreshAll();
    } catch (error) {
      showToast('فشل قبول الطلب', 'error');
    }
  });
}

async function rejectGlobalClientRequest(reqId) {
  if (!currentUser) return;
  closeClientRequestsModal();
  openConfirm('رفض وحذف الطلب؟', 'سيتم تجاهل هذا الطلب وحذفه نهائياً.', async () => {
    try {
      await rejectRequestCore(reqId);
      showToast('تم رفض وحذف الطلب', 'info');
      renderGlobalClientRequests();
    } catch (error) {
      showToast('فشل رفض الطلب', 'error');
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
  document.getElementById('resProfit').textContent = '0.00 ج.م';
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
  document.getElementById('resProfit').textContent = money(profit) + ' ج.م';
  document.getElementById('resMargin').textContent = margin + '%';
}

/* =========================================================
   INVENTORY / PARTS TRACKER (مخزن قطع الغيار)
   ========================================================= */
function loadInventory() {
  try {
    const saved = localStorage.getItem(INVENTORY_KEY);
    inventoryItems = saved ? JSON.parse(saved) : [];
  } catch(e) { inventoryItems = []; }
}
function saveInventory() {
  localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventoryItems));
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
      document.getElementById('invModalTitle').textContent = 'تعديل صنف';
      document.getElementById('invName').value = item.name;
      document.getElementById('invQty').value = item.qty;
      document.getElementById('invPrice').value = item.price || '';
      document.getElementById('invNotes').value = item.notes || '';
      document.getElementById('invEditId').value = item.id;
    }
  } else {
    document.getElementById('invModalTitle').textContent = 'إضافة صنف للمخزن';
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

  if (!name) { showToast('أدخل اسم الصنف', 'error'); return; }

  if (editId) {
    const item = inventoryItems.find(i => i.id === editId);
    if (item) {
      item.name = name; item.qty = qty; item.price = price; item.notes = notes;
      item._updatedAt = Date.now();
    }
    showToast('تم تحديث الصنف بنجاح', 'success');
  } else {
    const newItem = {
      id: 'inv-' + Date.now(),
      name, qty, price, notes,
      _updatedAt: Date.now()
    };
    inventoryItems.unshift(newItem);
    showToast('تم إضافة الصنف للمخزن ✓', 'success');
  }
  saveInventory();
  renderInventory();
  closeInventoryModal();
  logAudit('تعديل مخزن', `إضافة/تعديل صنف: ${name} (كمية: ${qty})`);
}
function deleteInventoryItem(id) {
  openConfirm('حذف الصنف؟', 'سيتم إزالة هذا الصنف من المخزن.', () => {
    inventoryItems = inventoryItems.filter(i => i.id !== id);
    saveInventory();
    renderInventory();
    showToast('تم حذف الصنف', 'info');
    logAudit('حذف صنف', `تم حذف صنف من المخزن ID: ${id}`);
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
            الكمية: ${item.qty}
          </span>
        </div>
        ${item.price > 0 ? `<div class="text-xs font-bold text-orange-500 mt-1">السعر: ${money(item.price)} ج.م</div>` : ''}
        ${item.notes ? `<div class="text-[10px] text-slate-400 mt-1"><i class="fa-solid fa-location-dot"></i> ${escapeHTML(item.notes)}</div>` : ''}
      </div>
      <div class="mt-4 pt-3 border-t border-slate-200/60 dark:border-dark-800 flex items-center justify-between">
        <span class="text-[9px] text-slate-400">مخزن قطع الغيار</span>
        <div class="flex items-center gap-1">
          <button onclick="openInventoryModal('${item.id}')" class="p-2 rounded-xl text-slate-400 hover:text-orange-500 transition"><i class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="deleteInventoryItem('${item.id}')" class="p-2 rounded-xl text-slate-400 hover:text-rose-500 transition"><i class="fa-solid fa-trash-can text-xs"></i></button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

/* =========================================================
   AUDIT LOG / ACTIVITY HISTORY (سجل النشاطات)
   ========================================================= */
function loadAuditLog() {
  try {
    const saved = localStorage.getItem(AUDIT_KEY);
    auditLogs = saved ? JSON.parse(saved) : [];
  } catch(e) { auditLogs = []; }
}
function saveAuditLog() {
  localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
}
function logAudit(action, details) {
  const log = {
    id: 'audit-' + Date.now(),
    action,
    details,
    date: new Date().toLocaleString('ar-EG')
  };
  auditLogs.unshift(log);
  if (auditLogs.length > 100) auditLogs = auditLogs.slice(0, 100);
  saveAuditLog();
}
function clearAuditLog() {
  openConfirm('مسح سجل النشاطات؟', 'سيتم مسح كافة سجلات التعديلات والأحداث.', () => {
    auditLogs = [];
    saveAuditLog();
    renderAuditLog();
    showToast('تم مسح السجل', 'info');
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
      showToast(`⚠️ تنبيه: لديك (${overdue.length}) ديون متأخرة الموعد تستوجب المتابعة!`, 'error');
    }, 1200);
  }
}

/* =========================================================
   RECURRING EXPENSES (المصاريف المتكررة والثابتة)
   ========================================================= */
const RECURRING_KEY = 'ehsebli_recurring_v1';
let recurringExpenses = [];

function loadRecurring() {
  try {
    const saved = localStorage.getItem(RECURRING_KEY);
    recurringExpenses = saved ? JSON.parse(saved) : [];
  } catch(e) { recurringExpenses = []; }
}
function saveRecurring() {
  localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringExpenses));
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
  if (!name || amount <= 0) { showToast('أدخل اسم المصروف والمبلغ بشكل صحيح', 'error'); return; }

  recurringExpenses.push({
    id: 'rec-' + Date.now(),
    name, amount, period,
    lastApplied: todayString()
  });
  saveRecurring();
  renderRecurringList();
  document.getElementById('recName').value = '';
  document.getElementById('recAmount').value = '';
  showToast('تم حفظ المصروف الثابت ✓', 'success');
}
function deleteRecurring(id) {
  recurringExpenses = recurringExpenses.filter(r => r.id !== id);
  saveRecurring();
  renderRecurringList();
  showToast('تم حذف المصروف', 'info');
}
function renderRecurringList() {
  const container = document.getElementById('recurringList');
  if (!container) return;
  container.innerHTML = '';
  if (!recurringExpenses.length) {
    container.innerHTML = '<div class="text-center py-4 text-xs text-slate-400">لا توجد مصاريف ثابتة مسجلة</div>';
    return;
  }
  recurringExpenses.forEach(r => {
    const card = document.createElement('div');
    card.className = 'p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2';
    card.innerHTML = `
      <div>
        <div class="font-black text-xs text-white">${escapeHTML(r.name)}</div>
        <div class="text-[10px] text-orange-400 mt-0.5">${money(r.amount)} ج.م (${r.period === 'monthly' ? 'شهرياً' : r.period === 'weekly' ? 'أسبوعياً' : 'يومياً'})</div>
      </div>
      <button onclick="deleteRecurring('${r.id}')" class="p-2 text-rose-400 hover:text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
    `;
    container.appendChild(card);
  });
}

/* =========================================================
   CASH DRAWER RECONCILIATION (مطابقة الدرج)
   ========================================================= */
function openDrawerModal() {
  closeMenus();
  const metrics = calculateMetrics();
  const cashWallet = metrics.wallets['كاش نقدي'] || 0;
  document.getElementById('drawerExpected').textContent = money(cashWallet) + ' ج.م';
  document.getElementById('drawerActual').value = '';
  document.getElementById('drawerDiff').textContent = '0.00 ج.م';
  const modal = document.getElementById('drawerModal');
  if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}
function closeDrawerModal() {
  const modal = document.getElementById('drawerModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}
function calculateDrawerDiff() {
  const metrics = calculateMetrics();
  const expected = metrics.wallets['كاش نقدي'] || 0;
  const actual = Number(document.getElementById('drawerActual').value) || 0;
  const diff = actual - expected;
  const diffEl = document.getElementById('drawerDiff');
  diffEl.textContent = money(diff) + ' ج.م ' + (diff === 0 ? '(مطابق تماماً ✓)' : diff > 0 ? '(زيادة في الدرج 📈)' : '(عجز في الدرج 📉)');
  diffEl.className = 'text-base font-black ' + (diff === 0 ? 'text-emerald-400' : diff > 0 ? 'text-cyan-400' : 'text-rose-400');
}

/* =========================================================
   PERFORMANCE KPIs (مؤشرات الأداء المتقدمة)
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
  let topClient = 'لا يوجد';
  let topClientAmt = 0;
  Object.keys(clientMap).forEach(c => {
    if (clientMap[c] > topClientAmt) { topClientAmt = clientMap[c]; topClient = c; }
  });

  // Top service
  let topService = 'لا يوجد';
  let topServiceAmt = 0;
  Object.keys(serviceMap).forEach(s => {
    if (serviceMap[s] > topServiceAmt) { topServiceAmt = serviceMap[s]; topService = s; }
  });

  const netProfit = totalIn - totalExp;
  const profitMargin = totalIn > 0 ? ((netProfit / totalIn) * 100).toFixed(1) : 0;

  const content = document.getElementById('kpiContent');
  content.innerHTML = `
    <div class="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
      <div class="flex justify-between font-bold"><span>إجمالي الإيرادات المسجلة:</span><span class="text-emerald-400 font-black">${money(totalIn)} ج.م</span></div>
      <div class="flex justify-between font-bold"><span>إجمالي المصاريف المسجلة:</span><span class="text-rose-400 font-black">${money(totalExp)} ج.م</span></div>
      <div class="flex justify-between font-bold"><span>صافي العائد الصافي:</span><span class="text-cyan-400 font-black">${money(netProfit)} ج.م (${profitMargin}%)</span></div>
    </div>
    <div class="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
      <div class="flex justify-between font-bold"><span>أكثر عميل تعاملاً وربحية:</span><span class="text-orange-400 font-black">${escapeHTML(topClient)} (${money(topClientAmt)} ج.م)</span></div>
      <div class="flex justify-between font-bold"><span>الخدمة / التصنيف الأعلى دخلاً:</span><span class="text-amber-400 font-black">${escapeHTML(topService)} (${money(topServiceAmt)} ج.م)</span></div>
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
   CONTROL CENTER MODAL (مركز التحكم الشامل)
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
   EXTRA MODULES PLACEHOLDERS (وردية، تحويل خزائن، أجهزة صيانة)
   ========================================================= */
function openShiftSettlementModal() {
  const metrics = calculateMetrics();
  const summary = `📊 *ملخص تقفيل وردية اليوم | احسبلي*
📅 التاريخ: ${todayString()}
💵 إجمالي الإيرادات: ${money(metrics.income)} ج.م
💸 إجمالي المصروفات: ${money(metrics.expense)} ج.م
🤲 رصيد الخير: ${money(metrics.charity)} ج.م
💰 صافي النقدية المتاحة: ${money(metrics.available)} ج.م
— تم التقفيل بنجاح`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(summary);
    showToast('تم نسخ تقرير الوردية للحافظة 📋 جاهز للإرسال على واتساب', 'success');
  } else {
    showToast(`صافي اليومية: ${money(metrics.available)} ج.م`, 'info');
  }
}

function openWalletTransferModal() {
  showToast('ميزة تحويل السيولة بين الخزائن قيد التحديث في الإصدار القادم', 'info');
}

function openTicketsModal() {
  showToast('ميزة تذاكر وإيصالات أجهزة الصيانة قيد التجهيز', 'info');
}

/* =========================================================
   MONEY & PENDING ALERTS (نظام تنبيهات الفلوس والديون)
   ========================================================= */
function checkMoneyNotifications() {
  const alertEl = document.getElementById('globalPendingAlert');
  const countEl = document.getElementById('globalPendingCount');
  const textEl = document.getElementById('globalPendingText');
  if (!alertEl || !countEl) return;

  const today = todayString();
  
  // 1. الديون المتأخرة أو المستحقة حتى اليوم ولم تسدد
  const overdueDebts = getActiveTransactions().filter(t => 
    isDebt(t.type) && 
    t.status !== 'paid' && 
    t.dueDate && 
    t.dueDate <= today
  );

  // 2. طلبات العملاء المعلقة الواردة من السحابة
  const clientReqsCount = pendingRequestsCache ? pendingRequestsCache.length : 0;
  const totalAlerts = overdueDebts.length + clientReqsCount;

  if (totalAlerts > 0) {
    alertEl.classList.remove('hidden');
    alertEl.classList.add('flex');
    countEl.textContent = totalAlerts;

    if (textEl) {
      if (overdueDebts.length > 0 && clientReqsCount > 0) {
        textEl.textContent = 'تنبيه ديون وطلبات';
      } else if (overdueDebts.length > 0) {
        textEl.textContent = 'ديون مستحقة السداد';
      } else {
        textEl.textContent = 'طلبات عملاء معلقة';
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
    showToast(`لديك (${overdueDebts.length}) ديون مستحقة الموعد تتطلب المتابعة ⚠️`, 'error');
  }
}



/* ---------- Quick add sheet (mobile FAB) ---------- */
function openQuickAdd() {
  const s = document.getElementById('quickAddSheet');
  if (!s) return;
  s.classList.remove('hidden');
  requestAnimationFrame(() => s.classList.add('open'));
}
function closeQuickAdd() {
  const s = document.getElementById('quickAddSheet');
  if (!s) return;
  s.classList.remove('open');
  setTimeout(() => s.classList.add('hidden'), 200);
}
function quickAdd(kind) {
  closeQuickAdd();
  setTimeout(() => openModal(kind), 210);
}
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeQuickAdd(); });
