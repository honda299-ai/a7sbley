/* =========================================================
   MOBILE SMOOTH SCROLL & MENU HANDLERS
   ========================================================= */

// التبديل بين التبويبات والنزول الساحر الانسيابي للوحة المحددة
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

  // تحديث أزرار الكمبيوتر
  document.getElementById('tabBtnTransactions')?.classList.toggle('active', isTx);
  document.getElementById('tabBtnDebts')?.classList.toggle('active', isDebts);
  document.getElementById('tabBtnClients')?.classList.toggle('active', isClients);

  // تحديث شريط الموبايل السفلي
  document.getElementById('mNavTx')?.classList.toggle('active', isTx);
  document.getElementById('mNavDebts')?.classList.toggle('active', isDebts);
  document.getElementById('mNavClients')?.classList.toggle('active', isClients);

  if (isClients) renderClients();

  // النزول الساحر للوحة المطلوبة في الموبايل بدون القفز لأعلى الشاشة
  let targetPanel = isTx ? panelTx : (isDebts ? panelDebts : panelClients);
  if (targetPanel && window.innerWidth < 768) {
    targetPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// تشغيل زر المزيد في الشريط السفلي وفتحه للقائمة كاملة
function toggleMobileMoreMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('dropMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
  
  // في الموبايل، جعل القائمة تفتح في المنتصف كقائمة خيارات منبثقة
  if (window.innerWidth < 768) {
    menu.classList.add('fixed', 'bottom-20', 'right-4', 'left-4', 'w-auto');
  }
}

// إغلاق القوائم عند لمس أي مكان خارجها
window.addEventListener('click', event => {
  const btn = document.getElementById('menuBtn');
  const mNavBtn = document.getElementById('mNavMore');
  const menu = document.getElementById('dropMenu');
  if (menu && !menu.contains(event.target) && !btn?.contains(event.target) && !mNavBtn?.contains(event.target)) {
    menu.classList.add('hidden');
  }
});