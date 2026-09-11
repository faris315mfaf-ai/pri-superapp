#!/usr/bin/env bash
# =====================================================================
# MENYOLIDKAN DATABASE (12 Sep 2026)
#
# Dijalankan SETELAH pemindahan data selesai. Aman diulang kapan saja,
# dan tidak menyentuh satu pun baris data.
#
# Dua bagian:
#   1. sql/44 — penomoran otomatis diselaraskan, hak akses dipastikan,
#      fungsi ukuran database dibuat, lalu keadaannya dilaporkan.
#      Dijalankan dalam SATU transaksi: kalau ada satu saja yang gagal,
#      tidak ada perubahan yang tertinggal setengah jalan.
#   2. Perapian (VACUUM ANALYZE) — harus di luar transaksi, karena
#      PostgreSQL memang tidak mengizinkannya di dalam.
#
# CARA PAKAI (root, di VPS):
#   bash 13-solidkan-database.sh
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

SUMBER=/opt/pri/sumber
SQL="$SUMBER/sql/44_solidkan.sql"
[ -f "$SQL" ] || { echo "Berkas tidak ada: $SQL (jalankan git pull dulu)" >&2; exit 1; }

DB_CT="$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' 'index($2, "supabase/postgres") {print $1; exit}')"
[ -n "$DB_CT" ] || { echo "Container database Supabase tidak ditemukan." >&2; exit 1; }
echo "Database: $DB_CT"
echo

echo "== 1/3 Menyelaraskan penomoran, hak akses, & fungsi =="
# --single-transaction: kalau ada galat, SEMUA dibatalkan. Lebih baik
# tidak berubah sama sekali daripada berubah separuh.
if ! docker exec -i "$DB_CT" psql -U postgres -d postgres \
      --single-transaction -v ON_ERROR_STOP=1 < "$SQL"; then
  echo >&2
  echo "GAGAL — tidak ada perubahan yang tersimpan (semua dibatalkan)." >&2
  exit 1
fi

echo
echo "== 2/3 Merapikan & menyegarkan statistik =="
# VACUUM membuang sisa baris mati; ANALYZE memperbarui perkiraan yang
# dipakai PostgreSQL untuk memilih cara tercepat menjalankan kueri.
# Sesudah pemindahan besar, perkiraan itu biasanya masih kosong.
docker exec "$DB_CT" psql -U postgres -d postgres -c 'vacuum analyze' \
  && echo "  selesai"

echo
echo "== 3/3 Memastikan cadangan harian terpasang =="
if [ -f /etc/cron.d/pri-cadangan ] || crontab -l 2>/dev/null | grep -q 'cadangan'; then
  echo "  sudah terpasang"
  TERBARU="$(ls -t /opt/pri/cadangan/*.sql.gz 2>/dev/null | head -1 || true)"
  if [ -n "$TERBARU" ]; then
    echo "  cadangan terakhir: $(basename "$TERBARU") ($(du -h "$TERBARU" | cut -f1), $(( ( $(date +%s) - $(stat -c %Y "$TERBARU") ) / 3600 )) jam lalu)"
  else
    echo "  PERINGATAN: belum ada berkas cadangan satu pun." >&2
  fi
else
  echo "  BELUM TERPASANG — ini satu-satunya jaring pengaman data Anda." >&2
  echo "  Pasang dengan: bash $(dirname "$0")/07-cadangan-harian.sh" >&2
fi

echo
echo "SELESAI."
