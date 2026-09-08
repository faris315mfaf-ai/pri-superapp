#!/usr/bin/env bash
# =====================================================================
# LANGKAH 7 — Cadangan otomatis.
#
# PENTING: Supabase Cloud mencadangkan database sendiri setiap hari.
# VPS TIDAK. Begitu pindah, satu-satunya jaring pengaman adalah skrip
# ini. Jangan lewati langkah ini.
#
# Isi cadangan: database (pg_dump) + seluruh berkas Storage.
# Disimpan 14 hari terakhir di /opt/pri/cadangan.
#
# CARA PAKAI:
#   bash 07-cadangan-harian.sh              -> cadangkan sekarang
#   bash 07-cadangan-harian.sh --pasang-cron -> pasang jadwal 02.30 WIB
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root." >&2; exit 1; }
DIR=/opt/pri/supabase
TUJUAN_DIR=/opt/pri/cadangan
SIMPAN_HARI=14

if [ "${1:-}" = "--pasang-cron" ]; then
  cat > /etc/cron.d/pri-cadangan <<'EOF'
# Cadangan harian PRI SuperApp — 02.30 WIB (server memakai zona Asia/Jakarta).
30 2 * * * root /usr/bin/env bash /opt/pri/skrip/07-cadangan-harian.sh >> /var/log/pri-cadangan.log 2>&1
EOF
  chmod 644 /etc/cron.d/pri-cadangan
  systemctl restart cron 2>/dev/null || systemctl restart crond 2>/dev/null || true
  echo "Jadwal terpasang: tiap hari 02.30 WIB. Log: /var/log/pri-cadangan.log"
  exit 0
fi

# shellcheck disable=SC1091
. /opt/pri/kunci.env
mkdir -p "$TUJUAN_DIR"
CAP="$(date +%Y%m%d-%H%M)"
cd "$DIR"

echo "[$(date '+%F %T')] mulai cadangan $CAP"

# 1. Database
docker compose exec -T db pg_dump \
  "postgresql://postgres:${PG_PASS}@localhost:5432/postgres" \
  --schema=public --no-owner --format=custom --compress=6 \
  > "$TUJUAN_DIR/db-$CAP.dump"
BYTE=$(stat -c%s "$TUJUAN_DIR/db-$CAP.dump")
[ "$BYTE" -gt 100000 ] || { echo "GAGAL: hasil dump terlalu kecil ($BYTE byte)" >&2; exit 1; }
echo "  database: $((BYTE / 1024 / 1024)) MB"

# 2. Berkas Storage (folder volume milik container storage)
if [ -d "$DIR/volumes/storage" ]; then
  tar -czf "$TUJUAN_DIR/storage-$CAP.tar.gz" -C "$DIR/volumes" storage
  echo "  storage: $(du -h "$TUJUAN_DIR/storage-$CAP.tar.gz" | cut -f1)"
else
  echo "  storage: folder $DIR/volumes/storage tidak ditemukan — dilewati" >&2
fi

# 3. Buang cadangan yang lebih tua dari 14 hari
find "$TUJUAN_DIR" -name 'db-*.dump' -mtime +$SIMPAN_HARI -delete
find "$TUJUAN_DIR" -name 'storage-*.tar.gz' -mtime +$SIMPAN_HARI -delete

echo "[$(date '+%F %T')] selesai. Sisa ruang disk:"
df -h /opt | tail -1
echo "Isi folder cadangan: $(ls -1 "$TUJUAN_DIR" | wc -l) berkas, $(du -sh "$TUJUAN_DIR" | cut -f1)"
