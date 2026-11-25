# احسبلي / a7sbly — v20.10.2-ar

تطبيق إدارة مالية (PWA) يعمل بالـ Firebase. كل ملفات التطبيق موجودة في جذر الريبو —
لا يوجد مجلد داخلي. ارفع محتوى هذا المجلد مباشرةً إلى GitHub.

## الملفات الأساسية
- `index.html` — الصفحة الرئيسية (تحمّل `app.js?v=20.10.2-ar` فقط).
- `app.js` — كل منطق التطبيق (المصدر الوحيد وقت التشغيل).
- `styles.css` — التنسيقات + إصلاحات الموبايل.
- `tailwind.css` — أدوات Tailwind.
- `service-worker.js` — PWA / offline (الإصدار `20.10.2-ar`).
- `firestore.rules`, `storage.rules`, `database.rules.json` — قواعد الأمان.

## قبل النشر على الإنترنت
1. غيّر `firebaseConfig` في `app.js` إلى مشروعك.
2. غيّر `SUPER_ADMIN_EMAILS` في `app.js` والبريد في `firestore.rules`
   من `hondastore299@gmail.com` إلى بريدك.
3. انشر القواعد:
   ```bash
   firebase deploy --only firestore:rules,storage,database
   ```

## ملاحظة الموبايل
نظام العرض على الموبايل يخفي الأقسام ثم يظهرها عبر `navigateSegmented()`.
في هذه النسخة أضفنا «قاطع أمان»: إذا فشل أي كود أثناء التهيئة تظهر كل الأقسام
بدل شاشة فارغة. كمان اتصلحت أزرار التنقل السفلية (`data-mob-tab`) وتمت إضافة
`safe-area` وتمرير داخلي للنوافذ على الشاشات القصيرة.

## رفع على GitHub
```bash
git init
git checkout -b main
git add .
git commit -m "a7sbly v20.10.2-ar - mobile fixes + security patches"
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```


## Languages / اللغات

- Open `index.html` — it remembers your choice in `localStorage.a7sbly_lang`.
- Use the floating **EN / ع** button to switch language at any time. Data is preserved.
- Arabic: `index-ar.html`, English: `index-en.html`.


## Guided tour / الجولة التعريفية (v20.10.4)

- The interactive tour now covers the language switch, profile, mode switcher, control center and its search, balances, privacy eye, quick add, transactions, debts, clients, inventory, activity log, budget, profit curve, sync status and a final quick-start step.
- It adapts to mobile and desktop, skips controls not available for the current role/mode, and can be replayed from Profile → Guided tour.
- Use Next / Back, `Esc`, or the Skip button at any time.
- Previous tour completion is reset once so the expanded guide appears automatically on first open.
- Driver.js 1.0.1 is bundled locally with SHA384-verified files, so the tour also works offline and is not blocked by CDN execution policies.


## v20.10.5 — mobile language fix + super admin full access

- The language switch now sits inside the header on mobile and desktop; it no longer overlays the settings/control-center button or modals.
- Super admins can open any registered user from Admin → Users → the user row → **Open full data**. The explorer lists the profile document plus transactions, team members, memberships, portal index, PIN lock, requests, client portals and admin notes. Documents can be viewed, created, edited, deleted and exported as JSON.
- Every explorer action is appended to `admin_audit` with the admin uid/email, target uid, collection and document id.
- Firestore rules grant this full access only to the verified `isSuperAdmin()` email. **Replace the hard-coded email in `app.js` outputs and `firestore.rules`, then deploy the rules before going public.**

## Extra fixes in v20.10.5

- The mobile language switch is now part of the sticky header, so it never covers the settings/control-center button or dialogs.
- The "working within a team" banner now requires a verified, active membership; stale workspace preferences can no longer show it to a user who has no team.
- Mobile transaction cards now show three clear actions — WhatsApp, Edit and Delete — with larger touch targets and a tidy separated row instead of a lone delete icon.
