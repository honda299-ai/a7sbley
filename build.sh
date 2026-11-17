#!/bin/sh
# Rebuild app.js from the source parts (order matters)
cd "$(dirname "$0")"
cat src/core.js src/auth-permissions.js src/data-sync.js src/ui-features.js src/extras.js > app.js
echo "app.js rebuilt: $(wc -l < app.js) lines"
