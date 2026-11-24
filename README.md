# احسبلي / a7sbley — v20.10.1

تطبيق إدارة مالية (PWA) يعمل بالـ Firebase. كل ملفات التطبيق موجودة في جذر الريبو —
لا يوجد مجلد داخلي. ارفع محتوى هذا المجلد مباشرةً إلى GitHub.

## الملفات الأساسية
- `index.html` — الصفحة الرئيسية (تحمّل `app.js?v=20.10.1` فقط).
- `app.js` — كل منطق التطبيق (المصدر الوحيد وقت التشغيل).
- `styles.css` — التنسيقات + إصلاحات الموبايل.
- `tailwind.css` — أدوات Tailwind.
- `service-worker.js` — PWA / offline (الإصدار `20.10.1`).
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
git commit -m "a7sbley v20.10.1 - mobile fixes + security patches"
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```
