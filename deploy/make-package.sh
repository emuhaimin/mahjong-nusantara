#!/usr/bin/env bash
# make-package.sh — dijalankan DI MAC. Membuat mahjong-nusantara.tar.gz untuk diupload lewat File Manager (Hestia/hPanel).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=mahjong-nusantara.tar.gz
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf "$OUT" index.html css js server package.json deploy README.md 2>/dev/null \
  || COPYFILE_DISABLE=1 tar -czf "$OUT" index.html css js server package.json deploy README.md
echo "Paket siap: $(pwd)/$OUT ($(wc -c < "$OUT" | tr -d ' ') byte)"
