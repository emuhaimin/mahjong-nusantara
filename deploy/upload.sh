#!/usr/bin/env bash
# upload.sh — dijalankan DI MAC/PC KAMU. Mengunggah game ke VPS lalu menjalankan install.sh di sana.
#   ./deploy/upload.sh root@187.77.115.96
#   EMAIL=kamu@email.com ./deploy/upload.sh root@187.77.115.96      (email untuk notifikasi HTTPS, opsional)
#   SSH_OPTS="-i $HOME/.ssh/rupaone_vps" ./deploy/upload.sh root@187.77.115.96   (pakai kunci SSH tertentu)
#   SSH_OPTS="-o PubkeyAuthentication=no" ./deploy/upload.sh root@187.77.115.96  (login pakai password root)
set -euo pipefail

TARGET="${1:-}"
[ -n "$TARGET" ] || { echo "Pakai: ./deploy/upload.sh user@IP-VPS   (contoh: root@187.77.115.96)"; exit 1; }
DOMAIN="${DOMAIN:-mahjong.rupaone.io}"
EMAIL="${EMAIL:-}"
PORT="${PORT:-3100}"
SSH_OPTS="${SSH_OPTS:-}"
cd "$(dirname "$0")/.."

echo "▶ Mengunggah ke $TARGET (domain: $DOMAIN)…"
COPYFILE_DISABLE=1 tar czf - index.html css js assets server package.json deploy | \
  ssh $SSH_OPTS "$TARGET" "rm -rf /tmp/mahjong-src && mkdir -p /tmp/mahjong-src && tar xzf - -C /tmp/mahjong-src && \
    if [ \"\$(id -u)\" = 0 ]; then SUDO=; else SUDO=sudo; fi; \
    \$SUDO env DOMAIN='$DOMAIN' EMAIL='$EMAIL' PORT='$PORT' bash /tmp/mahjong-src/deploy/install.sh"
