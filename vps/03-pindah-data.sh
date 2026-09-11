#!/usr/bin/env bash
# =====================================================================
# LANGKAH 3 — Menyalin ISI DATABASE dari Supabase Cloud ke VPS.
#
# Yang disalin: seluruh skema public (82 tabel, 29 view, 13 fungsi,
# 10 trigger, aturan RLS, urutan/sequence, dan semua barisnya).
# Yang TIDAK disalin di sini: berkas Storage (langkah 4) — karena
# berkas ikut terbawa saat diunggah ulang lewat API di langkah itu.
#
# Aman diulang: setiap kali dijalankan, database tujuan dibersihkan
# lebih dulu lalu diisi ulang dari hasil dump terbaru.
#
# SYARAT: tulis dulu alamat koneksi Supabase Cloud ke satu berkas
#   nano /opt/pri/sumber-db.txt
# Isinya satu baris, ambil dari Supabase Dashboard > Connect >
# "Session pooler", contoh bentuknya:
#   postgresql://postgres.abcdefghij:SANDI@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
#
# CARA PAKAI (root, di VPS):
#   bash 03-pindah-data.sh
#
# CATATAN 11 Sep 2026 — CARA YANG LEBIH MUDAH ADA SEKARANG:
#   bash 10-migrasi.sh
# Satu perintah itu menjalankan langkah 3 sampai 6 sekaligus di dalam
# satu container yang sudah berisi semua alatnya. Berkas ini dibiarkan
# sebagai cara manual, untuk kalau ingin menjalankan satu langkah saja
# tanpa container.
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root." >&2; exit 1; }
DIR=/opt/pri/supabase
[ -f /opt/pri/kunci.env ] || { echo "Belum ada kunci. Jalankan 02-pasang-supabase.sh dulu." >&2; exit 1; }
# shellcheck disable=SC1091
. /opt/pri/kunci.env
[ -s /opt/pri/sumber-db.txt ] || { echo "Isi dulu /opt/pri/sumber-db.txt (lihat keterangan di atas)." >&2; exit 1; }
SUMBER="$(tr -d '[:space:]' < /opt/pri/sumber-db.txt)"
TUJUAN="postgresql://postgres:${PG_PASS}@localhost:5432/postgres"
CAP="/opt/pri/dump/public-$(date +%Y%m%d-%H%M).dump"
cd "$DIR"

jalankan_sql() { docker compose exec -T db psql "$TUJUAN" -v ON_ERROR_STOP=1 -tAc "$1"; }

echo "== 1/6 Menguji koneksi ke Supabase Cloud =="
VER_SUMBER="$(docker compose exec -T db psql "$SUMBER" -tAc "show server_version" | tr -d '\r')"
VER_TUJUAN="$(jalankan_sql "show server_version" | tr -d '\r')"
echo "PostgreSQL sumber: $VER_SUMBER | tujuan: $VER_TUJUAN"
if [ "${VER_SUMBER%%.*}" -gt "${VER_TUJUAN%%.*}" ]; then
  echo "Versi tujuan lebih tua dari sumber — pemulihan bisa gagal. Hentikan." >&2
  exit 1
fi

echo "== 2/6 Mengambil salinan (pg_dump) =="
docker compose exec -T db pg_dump "$SUMBER" \
  --schema=public --no-owner --format=custom --compress=6 > "$CAP"
BYTE=$(stat -c%s "$CAP")
echo "Berkas salinan: $CAP ($((BYTE / 1024 / 1024)) MB)"
[ "$BYTE" -gt 100000 ] || { echo "Salinan terlalu kecil — kemungkinan gagal. Hentikan." >&2; exit 1; }

echo "== 3/6 Memulihkan ke database VPS =="
LOG=/opt/pri/dump/restore.log
set +e
docker compose exec -T db pg_restore --dbname "$TUJUAN" --no-owner --clean --if-exists < "$CAP" > "$LOG" 2>&1
set -e
# "does not exist, skipping" itu normal pada database yang masih kosong.
GALAT=$(grep -c "^pg_restore: error" "$LOG" || true)
echo "Baris galat pg_restore: $GALAT (rincian: $LOG)"
if [ "$GALAT" -gt 0 ]; then
  grep "^pg_restore: error" "$LOG" | grep -v "does not exist" | head -10
fi

echo "== 4/6 Menyalakan ekstensi pg_net =="
# Dipakai fungsi kirim_push_notifikasi() untuk memanggil /api/push/kirim
# lewat trigger. Tanpa ini, notifikasi dorong berhenti diam-diam.
jalankan_sql "create extension if not exists pg_net with schema extensions" >/dev/null
jalankan_sql "select count(*) from pg_extension where extname='pg_net'" | sed 's/^/pg_net terpasang: /'

echo "== 5/6 Mendaftarkan tabel Realtime =="
# Publication tidak ikut terbawa pg_dump per-skema, jadi didaftarkan ulang.
for T in feed_konten notifikasi postingan rekap video_antrian; do
  jalankan_sql "do \$\$ begin
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='$T') then
      execute 'alter publication supabase_realtime add table public.$T';
    end if;
  end \$\$;" >/dev/null
done
jalankan_sql "select count(*) from pg_publication_tables where pubname='supabase_realtime'" | sed 's/^/tabel realtime: /'

echo "== 6/6 Merapikan statistik & memeriksa hasil =="
jalankan_sql "analyze" >/dev/null
echo "Jumlah objek di VPS:"
jalankan_sql "select 'tabel=' || count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
jalankan_sql "select 'view=' || count(*) from information_schema.views where table_schema='public'"
jalankan_sql "select 'fungsi=' || count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
jalankan_sql "select 'pengguna=' || count(*) from app_user"
jalankan_sql "select 'laporan_video=' || count(*) from laporan_video"

echo
echo "SELESAI. Lanjut LANGKAH 4 — pindahkan berkas Storage."
