#!/bin/sh
# app.js هو الملف الفعلي المستخدم. مجلد src/ غير موجود في هذه النسخة،
# فمش هنعيد توليد app.js (لتجنب مسحه بالغلط). عدّل app.js مباشرة.
cd "$(dirname "$0")"
if [ -d src ]; then
  cat src/core.js src/auth-permissions.js src/data-sync.js src/ui-features.js src/extras.js > app.js
  echo "app.js rebuilt: $(wc -l < app.js) lines"
else
  echo "src/ غير موجود - لا حاجة لإعادة البناء. app.js هو المصدر."
fi
