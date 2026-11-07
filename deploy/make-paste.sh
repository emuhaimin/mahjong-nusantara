#!/usr/bin/env bash
# make-paste.sh — dijalankan DI MAC. Membuat paket game dalam beberapa potongan teks
# untuk ditempel ke Browser Terminal VPS (hPanel) — tanpa SSH, tanpa GitHub.
#   ./deploy/make-paste.sh                 → hasil di folder deploy-paste/
#   EMAIL=kamu@email.com ./deploy/make-paste.sh
set -euo pipefail
cd "$(dirname "$0")/.."
EMAIL="${EMAIL:-}"
DOMAIN="${DOMAIN:-mahjong.rupaone.io}"
LINES_PER_PART="${LINES_PER_PART:-180}"   # ±14 KB per potongan
OUT=deploy-paste
rm -rf "$OUT"; mkdir -p "$OUT"

TMP="$(mktemp -d)"
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf "$TMP/app.tgz" index.html css js assets server package.json sw.js manifest.webmanifest deploy 2>/dev/null \
  || COPYFILE_DISABLE=1 tar -czf "$TMP/app.tgz" index.html css js assets server package.json sw.js manifest.webmanifest deploy
base64 < "$TMP/app.tgz" | fold -w 76 > "$TMP/app.b64"
SUM="$(shasum -a 256 "$TMP/app.b64" | awk '{print $1}')"
split -l "$LINES_PER_PART" "$TMP/app.b64" "$TMP/chunk-"
CHUNKS=("$TMP"/chunk-*)
N=${#CHUNKS[@]}
TOTAL=$((N + 1))

i=1
for c in "${CHUNKS[@]}"; do
  f="$OUT/$i.txt"
  {
    echo "# Bagian $i dari $TOTAL — tempel seluruh isi ini ke Browser Terminal VPS, lalu tekan Enter"
    [ "$i" = 1 ] && echo "rm -f /root/mj.b64"
    echo "cat >> /root/mj.b64 <<'MJ_END'"
    cat "$c"
    echo "MJ_END"
    echo "echo \"✓ Bagian $i dari $TOTAL tersimpan\""
  } > "$f"
  i=$((i + 1))
done

cat > "$OUT/$TOTAL.txt" <<EOF
# Bagian $TOTAL dari $TOTAL (terakhir) — memeriksa, membongkar, dan memasang game
cd /root && echo "$SUM  mj.b64" | sha256sum -c - && \\
rm -rf /root/mahjong-nusantara && mkdir -p /root/mahjong-nusantara && \\
base64 -d /root/mj.b64 | tar xzf - -C /root/mahjong-nusantara 2>/dev/null && rm -f /root/mj.b64 && \\
cd /root/mahjong-nusantara && DOMAIN='$DOMAIN' EMAIL='$EMAIL' bash deploy/install.sh
EOF
rm -rf "$TMP"

echo "Selesai: $TOTAL potongan di folder $OUT/"
for f in $(ls "$OUT" | sort -n); do printf '  %-7s %6s byte\n' "$f" "$(wc -c < "$OUT/$f" | tr -d ' ')"; done
echo
echo "Salin tiap potongan ke clipboard, misalnya:  pbcopy < $OUT/1.txt"
