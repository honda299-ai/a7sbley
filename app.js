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
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="https://l.top4top.io/p_3926i5al91.jpg" style="width:52px;height:52px;border-radius:14px;object-fit:cover;border:1px solid #f97316;" alt="Logo" />
          <div>
            <h1 style="font-size:28px;margin:0;font-weight:900;">احسبلي</h1>
            <div style="font-size:12px;color:#666;font-weight:bold;">Honda Financial Manager</div>
          </div>
        </div>
        <div style="text-align:left;font-size:12px;color:#555;">
          <div style="font-weight:bold;color:#f97316;">تقرير مالي معتمد</div>
          <div>${escapeHTML(periodName)}</div>
          <div>${todayString()}</div>
        </div>
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
          <thead>
            <tr style="background:#f97316;color:white;">
              <th style="padding:9px;border:1px solid #ddd;">التاريخ والوقت</th>
              <th style="padding:9px;border:1px solid #ddd;">العميل</th>
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