#!/usr/bin/env bash
# =====================================================================
# Isi container migrasi — menjalankan langkah 3 sampai 6 berurutan.
#
# Dipanggil lewat 10-migrasi.sh di VPS, bukan langsung. Semua nilai
# datang dari environment yang disiapkan skrip itu:
#   SUMBER_DB   alamat koneksi PostgreSQL Supabase Cloud
#   SUMBER_URL  alamat REST Supabase Cloud
#   SUMBER_KEY  secret key Supabase Cloud
#   TUJUAN_DB   alamat koneksi PostgreSQL di VPS
#   TUJUAN_URL  alamat REST di VPS (https://domain)
#   TUJUAN_KEY  service role key VPS
#   TUJUAN_ANON_KEY  anon key VPS (untuk menguji Realtime)
#
# Perintah: data | izin | berkas | url | uji | semua
# Berhenti pada kegagalan pertama — migrasi setengah jalan lebih
# berbahaya daripada migrasi yang jelas-jelas gagal.
# =====================================================================
set -euo pipefail

PERINTAH="${1:-semua}"
# Folder kerja bisa diarahkan lain saat diuji tanpa container.
DUMP="${DUMP_DIR:-/kerja/dump}"
mkdir -p "$DUMP"

wajib() {
  for k in "$@"; do
    if [ -z "${!k:-}" ]; then
      echo "Nilai $k belum diisi. Periksa /opt/pri/migrasi.txt di VPS." >&2
      exit 1
    fi
  done
}

judul() { echo; echo "=============== $* ==============="; }

# ---------------------------------------------------------------------
# LANGKAH 3 — isi database
# ---------------------------------------------------------------------
langkah_data() {
  wajib SUMBER_DB TUJUAN_DB
  judul "1/4 DATABASE"

  echo "-- memeriksa versi kedua server"
  VER_SUMBER="$(psql "$SUMBER_DB" -tAc 'show server_version' | tr -d '\r')"
  VER_TUJUAN="$(psql "$TUJUAN_DB" -tAc 'show server_version' | tr -d '\r')"
  echo "   Cloud: $VER_SUMBER   VPS: $VER_TUJUAN"
  if [ "${VER_SUMBER%%.*}" -gt "${VER_TUJUAN%%.*}" ]; then
    echo "PostgreSQL di VPS lebih tua dari Cloud — pemulihan pasti gagal." >&2
    exit 1
  fi

  CAP="$DUMP/public-$(date +%Y%m%d-%H%M).dump"
  echo "-- mengambil salinan skema public"
  pg_dump "$SUMBER_DB" --schema=public --no-owner --no-privileges --format=custom --file="$CAP"
  echo "   berkas: $CAP ($(( $(stat -c %s "$CAP") / 1024 / 1024 )) MB)"

  echo "-- memulihkan ke database VPS"
  LOG="$DUMP/restore-$(date +%Y%m%d-%H%M).log"
  # --clean --if-exists membuat langkah ini aman diulang: isi lama
  # dibuang dulu, jadi tidak pernah ada gabungan data lama & baru.
  pg_restore --dbname "$TUJUAN_DB" --no-owner --clean --if-exists "$CAP" > "$LOG" 2>&1 || true
  GALAT=$(grep -c '^pg_restore: error' "$LOG" || true)
  echo "   baris galat: $GALAT (rincian: $LOG)"
  if [ "$GALAT" -gt 0 ]; then
    # Galat "does not exist" wajar pada database yang masih kosong:
    # --clean mencoba menghapus yang memang belum ada.
    NYATA=$(grep '^pg_restore: error' "$LOG" | grep -vc 'does not exist' || true)
    if [ "$NYATA" -gt 0 ]; then
      echo "Ada $NYATA galat yang bukan sekadar 'does not exist':" >&2
      grep '^pg_restore: error' "$LOG" | grep -v 'does not exist' | head -10 >&2
      exit 1
    fi
    echo "   semuanya cuma 'does not exist' (wajar di database kosong)"
  fi

  langkah_izin

  echo "-- menyalakan ekstensi pg_net (dipakai kirim_push_notifikasi)"
  psql "$TUJUAN_DB" -v ON_ERROR_STOP=1 -tAc 'create extension if not exists pg_net' >/dev/null
  psql "$TUJUAN_DB" -tAc "select extname from pg_extension where extname in ('pg_net','pgcrypto','uuid-ossp')" | sed 's/^/   ekstensi: /'

  echo "-- mendaftarkan tabel Realtime"
  # Publication tidak ikut terbawa pg_dump per-skema, jadi didaftarkan
  # ulang di sini. Tanpa ini, siaran Realtime diam-diam tidak jalan.
  for T in ludo_game pet_pasar tvr_siaran tvr_siaran_item notifikasi; do
    psql "$TUJUAN_DB" -v ON_ERROR_STOP=1 -tAc "
do \$\$ begin
  if to_regclass('public.$T') is not null
     and not exists (select 1 from pg_publication_tables
                     where pubname='supabase_realtime' and schemaname='public' and tablename='$T') then
    execute 'alter publication supabase_realtime add table public.$T';
  end if;
end \$\$;" >/dev/null
  done
  psql "$TUJUAN_DB" -tAc "select count(*) from pg_publication_tables where pubname='supabase_realtime'" \
    | sed 's/^/   tabel realtime terdaftar: /'

  echo "-- merapikan statistik (analyze)"
  psql "$TUJUAN_DB" -tAc 'analyze' >/dev/null
  psql "$TUJUAN_DB" -tAc "
select 'tabel ' || count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
union all select 'view ' || count(*) from information_schema.views where table_schema='public'
union all select 'fungsi ' || count(*) from information_schema.routines where routine_schema='public'" \
    | sed 's/^/   /'
}

# ---------------------------------------------------------------------
# HAK AKSES — WAJIB, dan paling mudah terlewat (12 Sep 2026)
#
# Salinan dibuat dengan --no-privileges supaya tidak membawa daftar hak
# akses milik Supabase Cloud (isinya menyebut peran yang belum tentu ada
# di server sendiri). Konsekuensinya: di server baru tabelnya ADA tapi
# peran anon/authenticated/service_role belum punya izin apa pun atasnya.
#
# Gejalanya menyesatkan: API menjawab "permission denied for schema
# public", dan jumlah baris tiap tabel terbaca KOSONG — seolah datanya
# tidak ikut pindah, padahal datanya utuh.
# ---------------------------------------------------------------------
langkah_izin() {
  wajib TUJUAN_DB
  echo "-- mengembalikan hak akses peran Supabase"
  psql "$TUJUAN_DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all privileges on all tables    in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all routines  in schema public to postgres, anon, authenticated, service_role;
-- Tabel yang dibuat SETELAH ini pun ikut terbuka, jadi tidak perlu
-- diulang setiap kali aplikasi menambah tabel.
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to postgres, anon, authenticated, service_role;
SQL

  # PostgREST menyimpan gambaran skema di memori. Tanpa diberi tahu, ia
  # masih memakai gambaran lama dan tetap menolak walau izinnya sudah
  # benar — kebingungan yang mudah dikira izinnya gagal dipasang.
  echo "-- memberi tahu API bahwa skema berubah"
  psql "$TUJUAN_DB" -tAc "notify pgrst, 'reload schema'" >/dev/null
  sleep 3
  BISA="$(psql "$TUJUAN_DB" -tAc "
    select count(*) from information_schema.role_table_grants
    where grantee = 'service_role' and table_schema = 'public'" | tr -d '\r')"
  echo "   tabel yang kini boleh dibaca API: ${BISA:-0}"
}

# ---------------------------------------------------------------------
# LANGKAH 4 — berkas Storage
# ---------------------------------------------------------------------
langkah_berkas() {
  wajib SUMBER_URL SUMBER_KEY TUJUAN_URL TUJUAN_KEY
  judul "2/4 BERKAS STORAGE"
  node /app/04-pindah-storage.mjs
}

# ---------------------------------------------------------------------
# LANGKAH 5 — alamat berkas di dalam database
# ---------------------------------------------------------------------
langkah_url() {
  wajib TUJUAN_DB SUMBER_URL TUJUAN_URL
  judul "3/4 ALAMAT BERKAS"
  psql "$TUJUAN_DB" -v ON_ERROR_STOP=1 \
    -v lama="$SUMBER_URL" -v baru="$TUJUAN_URL" -f /app/05-ganti-url.sql
  SISA=$(psql "$TUJUAN_DB" -tAc \
    "select count(*) from public.tvrku_post where video_url like '%' || '${SUMBER_URL}' || '%'" | tr -d '\r')
  echo "   tautan yang masih menunjuk Cloud: ${SISA:-?}"
  if [ "${SISA:-0}" -gt 0 ]; then
    echo "Masih ada tautan lama — periksa 05-ganti-url.sql." >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------
# LANGKAH 6 — pemeriksaan akhir
# ---------------------------------------------------------------------
langkah_uji() {
  wajib SUMBER_URL SUMBER_KEY TUJUAN_URL TUJUAN_KEY TUJUAN_ANON_KEY
  judul "4/4 PEMERIKSAAN"
  node /app/06-uji-migrasi.mjs
}

case "$PERINTAH" in
  data)   langkah_data ;;
  izin)   langkah_izin ;;
  berkas) langkah_berkas ;;
  url)    langkah_url ;;
  uji)    langkah_uji ;;
  semua)
    langkah_data
    langkah_berkas
    langkah_url
    langkah_uji
    judul "SELESAI"
    echo "Semua langkah lulus. Sekarang boleh mengganti 3 nilai env di Vercel."
    ;;
  *)
    echo "Perintah tidak dikenal: $PERINTAH (pilih: data | izin | berkas | url | uji | semua)" >&2
    exit 1
    ;;
esac
