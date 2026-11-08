#!/usr/bin/env bash
# install.sh — dijalankan DI VPS (sebagai root). Aman dijalankan ulang untuk update.
#   DOMAIN=mahjong.rupaone.io EMAIL=kamu@email.com bash deploy/install.sh
set -euo pipefail

DOMAIN="${DOMAIN:-mahjong.rupaone.io}"
EMAIL="${EMAIL:-}"
PORT="${PORT:-3100}"
APP_DIR=/opt/mahjong-nusantara
SRC="$(cd "$(dirname "$0")/.." && pwd)"

say()  { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || die "Jalankan sebagai root (atau dengan sudo)."
[ -f "$SRC/server/server.js" ] || die "File aplikasi tidak ditemukan di $SRC."

# 1) Node.js — butuh 22.13+ agar database SQLite bawaan (node:sqlite) bisa dipakai.
#    Versi lebih lama (18+) tetap jalan dengan penyimpanan file, tapi kita naikkan ke Node 24 LTS bila bisa.
say "Memeriksa Node.js"
node_ok() { node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null; }
node_min() { node -e 'process.exit(+process.versions.node.split(".")[0]>=18?0:1)' 2>/dev/null; }
if ! command -v node >/dev/null 2>&1 || ! node_ok; then
  if command -v apt-get >/dev/null 2>&1; then
    say "Memasang/menaikkan Node.js ke 24 LTS (NodeSource) — dibutuhkan untuk database SQLite"
    if apt-get update -y && apt-get install -y ca-certificates curl gnupg \
       && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs; then :
    else warn "Gagal memasang Node.js 24."; fi
  fi
  command -v node >/dev/null 2>&1 && node_min || die "Node.js 18+ belum ada dan tidak bisa dipasang otomatis. Pasang Node.js 24 manual lalu jalankan ulang."
  node_ok || warn "Node $(node -v) belum mendukung SQLite — aplikasi memakai penyimpanan file sampai Node dinaikkan ke 22.13+."
fi
NODE_BIN="$(command -v node)"
echo "Node $("$NODE_BIN" -v) di $NODE_BIN"

# 2) Port bebas?
if ! systemctl is-active --quiet mahjong 2>/dev/null; then
  if ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q .; then
    die "Port $PORT sudah dipakai aplikasi lain. Jalankan ulang dengan PORT=3200 (atau port bebas lain)."
  fi
fi

# 3) Salin aplikasi
say "Menyalin aplikasi ke $APP_DIR"
id mahjong >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin mahjong
mkdir -p "$APP_DIR"
rm -rf "$APP_DIR/css" "$APP_DIR/js" "$APP_DIR/server" "$APP_DIR/assets"
cp -r "$SRC/index.html" "$SRC/css" "$SRC/js" "$SRC/assets" "$SRC/server" "$SRC/package.json" "$SRC/sw.js" "$SRC/manifest.webmanifest" "$SRC/privacy.html" "$APP_DIR/"
# versi cache PWA otomatis berganti setiap deploy → pemain langsung dapat versi terbaru
REL="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || date +%s)"
sed -i "s/const VERSION = 'mjn-[^']*'/const VERSION = 'mjn-$REL'/" "$APP_DIR/sw.js"
chown -R root:root "$APP_DIR"
chmod -R a+rX,go-w "$APP_DIR"

# 3b) Login Google: simpan Client ID (jika diberikan) ke /etc/mahjong-nusantara.env
ENV_FILE=/etc/mahjong-nusantara.env
if [ -n "${GOOGLE_CLIENT_ID:-}" ]; then
  case "$GOOGLE_CLIENT_ID" in
    *.apps.googleusercontent.com) ;;
    *) die "GOOGLE_CLIENT_ID tidak valid (harus berakhiran .apps.googleusercontent.com).";;
  esac
  touch "$ENV_FILE"; chmod 644 "$ENV_FILE"
  grep -v '^GOOGLE_CLIENT_ID=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
  echo "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" >> "$ENV_FILE.tmp"; mv "$ENV_FILE.tmp" "$ENV_FILE"
  say "Client ID Google disimpan."
fi
if grep -q '^GOOGLE_CLIENT_ID=.' "$ENV_FILE" 2>/dev/null; then echo "Login Google: AKTIF"; else warn "Login Google belum aktif (jalankan ulang dengan GOOGLE_CLIENT_ID=...)."; fi

# 4) Layanan systemd
say "Menyiapkan layanan systemd 'mahjong'"
sed -e "s|__PORT__|$PORT|g" -e "s|__NODE__|$NODE_BIN|g" "$SRC/deploy/mahjong.service" > /etc/systemd/system/mahjong.service
systemctl daemon-reload
systemctl enable mahjong >/dev/null
systemctl restart mahjong
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null || { journalctl -u mahjong -n 30 --no-pager; die "Aplikasi gagal menyala (log di atas)."; }
echo "Aplikasi berjalan di 127.0.0.1:$PORT"

# 5H) HestiaCP terdeteksi → domain, proxy & SSL diatur lewat Hestia (bukan certbot)
if [ -d /usr/local/hestia/bin ]; then
  say "HestiaCP terdeteksi — memakai template proxy Hestia"
  export HESTIA=/usr/local/hestia
  HBIN=$HESTIA/bin
  # shellcheck disable=SC1091
  . "$HESTIA/conf/hestia.conf"
  # pemilik domain: HESTIA_USER, atau pemilik rupaone.io / domain induk, atau 'admin'
  PARENT="${DOMAIN#*.}"
  HUSER="${HESTIA_USER:-}"
  if [ -z "$HUSER" ]; then
    for u in $("$HBIN/v-list-users" plain | cut -f1); do
      if "$HBIN/v-list-web-domains" "$u" plain 2>/dev/null | cut -f1 | grep -qx -e "$DOMAIN" -e "$PARENT"; then HUSER="$u"; break; fi
    done
  fi
  HUSER="${HUSER:-admin}"
  "$HBIN/v-list-user" "$HUSER" >/dev/null 2>&1 || die "User Hestia '$HUSER' tidak ada. Jalankan ulang dengan HESTIA_USER=namauser."
  echo "User Hestia: $HUSER"

  if [ "${PROXY_SYSTEM:-}" = "nginx" ]; then
    TPL_DIR=$HESTIA/data/templates/web/nginx; LP='%proxy_port%'; LSP='%proxy_ssl_port%'; MODE=proxy
  elif [ "${WEB_SYSTEM:-}" = "nginx" ]; then
    TPL_DIR=$HESTIA/data/templates/web/nginx/php-fpm; LP='%web_port%'; LSP='%web_ssl_port%'; MODE=web
  else
    die "Hestia ini tidak memakai nginx (WEB_SYSTEM=${WEB_SYSTEM:-?}). Kirim info ini ke saya untuk konfigurasi lain."
  fi
  TPL=mahjong-node
  for ext in tpl stpl; do
    sed -e "s|__PORT__|$PORT|g" -e "s|__LISTEN_PORT__|$LP|g" -e "s|__LISTEN_SSL_PORT__|$LSP|g" \
      "$SRC/deploy/hestia/$TPL.$ext" > "$TPL_DIR/$TPL.$ext"
  done
  echo "Template $TPL dipasang di $TPL_DIR"

  if ! "$HBIN/v-list-web-domain" "$HUSER" "$DOMAIN" >/dev/null 2>&1; then
    say "Menambahkan web domain $DOMAIN di Hestia"
    "$HBIN/v-add-web-domain" "$HUSER" "$DOMAIN"
  fi
  # alias www.mahjong… tidak punya DNS → hapus agar Let's Encrypt tidak gagal
  "$HBIN/v-delete-web-domain-alias" "$HUSER" "$DOMAIN" "www.$DOMAIN" >/dev/null 2>&1 || true
  if [ "$MODE" = proxy ]; then "$HBIN/v-change-web-domain-proxy-tpl" "$HUSER" "$DOMAIN" "$TPL"
  else "$HBIN/v-change-web-domain-tpl" "$HUSER" "$DOMAIN" "$TPL"; fi
  echo "Domain $DOMAIN sekarang diteruskan ke game (port $PORT)"

  say "Memeriksa DNS $DOMAIN"
  MYIP="$(curl -fsS -4 https://api.ipify.org 2>/dev/null || true)"
  DNSIP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}')"
  echo "IP VPS: ${MYIP:-?}   DNS $DOMAIN: ${DNSIP:-belum ada}"
  if [ -z "$DNSIP" ] || { [ -n "$MYIP" ] && [ "$DNSIP" != "$MYIP" ]; }; then
    warn "DNS $DOMAIN belum mengarah ke VPS ini. Tambahkan A record 'mahjong' → ${MYIP:-IP VPS}, tunggu beberapa menit, lalu jalankan ulang skrip ini untuk HTTPS."
    exit 0
  fi
  if [ -f "$HESTIA/data/users/$HUSER/ssl/$DOMAIN.crt" ]; then
    say "SSL sudah aktif."
  else
    say "Meminta sertifikat Let's Encrypt lewat Hestia"
    "$HBIN/v-add-letsencrypt-domain" "$HUSER" "$DOMAIN" || die "Let's Encrypt gagal. Pastikan DNS sudah benar, lalu jalankan ulang."
  fi
  "$HBIN/v-add-web-domain-ssl-force" "$HUSER" "$DOMAIN" >/dev/null 2>&1 || true
  say "Selesai! Buka https://$DOMAIN"
  echo "Domain ini terlihat di panel Hestia (user $HUSER) dengan template proxy '$TPL'."
  echo "Perintah berguna:  systemctl status mahjong   |   journalctl -u mahjong -f"
  exit 0
fi

# 5) nginx
command -v nginx >/dev/null 2>&1 || die "nginx tidak ditemukan di VPS ini. Hubungi saya untuk konfigurasi proxy lain (Caddy/Traefik/Docker)."
if [ -d /etc/nginx/sites-available ]; then
  CONF="/etc/nginx/sites-available/$DOMAIN.conf"; LINK="/etc/nginx/sites-enabled/$DOMAIN.conf"
else
  CONF="/etc/nginx/conf.d/$DOMAIN.conf"; LINK=""
fi
if [ -f "$CONF" ]; then
  say "Konfigurasi nginx $CONF sudah ada — dibiarkan (mode update)."
else
  say "Menambahkan situs nginx untuk $DOMAIN"
  sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__PORT__|$PORT|g" "$SRC/deploy/nginx-mahjong.conf" > "$CONF"
  [ -n "$LINK" ] && ln -sf "$CONF" "$LINK"
  if ! nginx -t; then
    rm -f "$CONF" ${LINK:+"$LINK"}
    die "Konfigurasi nginx tidak valid — sudah dibatalkan, situs lain tidak tersentuh."
  fi
  systemctl reload nginx
fi

# 6) HTTPS (Let's Encrypt)
say "Memeriksa DNS $DOMAIN"
MYIP="$(curl -fsS -4 https://api.ipify.org 2>/dev/null || true)"
DNSIP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}')"
echo "IP VPS: ${MYIP:-?}   DNS $DOMAIN: ${DNSIP:-belum ada}"
if [ -z "$DNSIP" ] || { [ -n "$MYIP" ] && [ "$DNSIP" != "$MYIP" ]; }; then
  warn "DNS $DOMAIN belum mengarah ke VPS ini. Tambahkan A record 'mahjong' → ${MYIP:-IP VPS} di hPanel, tunggu beberapa menit, lalu jalankan ulang skrip ini untuk HTTPS."
  echo "Sementara bisa dicek: http://$DOMAIN (setelah DNS aktif)"
  exit 0
fi
if grep -q "listen 443" "$CONF" 2>/dev/null; then
  say "HTTPS sudah aktif."
else
  if ! command -v certbot >/dev/null 2>&1; then
    command -v apt-get >/dev/null 2>&1 || die "certbot belum terpasang. Pasang certbot lalu jalankan ulang."
    say "Memasang certbot"
    apt-get install -y certbot python3-certbot-nginx
  fi
  say "Meminta sertifikat HTTPS (Let's Encrypt — dengan ini kamu menyetujui ketentuan Let's Encrypt)"
  if [ -n "$EMAIL" ]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
  else
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
  fi
fi

say "Selesai! Buka https://$DOMAIN"
echo "Perintah berguna:  systemctl status mahjong   |   journalctl -u mahjong -f"
