#!/usr/bin/env bash
# =====================================================================
# MEMPERBAIKI ALAMAT FOTO & BERKAS (12 Sep 2026)
#
# Saat pindah server, alamat berkas di dalam database hanya diganti pada
# enam kolom yang sudah didaftarkan. Aplikasi menulis alamat berkas dari
# sebelas tempat — sisanya masih menunjuk ke server lama. Selama server
# lama masih hidup, foto-foto itu masih tampil, jadi kesalahannya belum
# terlihat; begitu server lama dimatikan, foto-fotonya hilang serentak.
#
# Skrip ini menyisir SELURUH kolom di seluruh tabel, jadi tidak ada
# kolom yang bisa terlewat — termasuk kolom yang dibuat nanti.
#
# CARA PAKAI (root, di VPS):
#   bash 14-perbaiki-foto.sh              <- periksa DULU, tidak mengubah
#   bash 14-perbaiki-foto.sh --perbaiki   <- benar-benar memperbaiki
#
# Pilihan lain:
#   --lama NAMA   nama server lama  (bawaan: pichnkyjepsirpclofhs.supabase.co)
#   --baru NAMA   nama server baru  (bawaan: dibaca dari .env aplikasi)
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

SUMBER=/opt/pri/sumber
APP=/opt/pri/aplikasi
SQL="$SUMBER/sql/45_perbaiki-alamat-berkas.sql"

LAMA=pichnkyjepsirpclofhs.supabase.co
BARU=""
KERJAKAN=tidak

while [ $# -gt 0 ]; do
  case "$1" in
    --perbaiki) KERJAKAN=ya ;;
    --periksa)  KERJAKAN=tidak ;;
    --lama)     LAMA="${2:-}"; shift ;;
    --baru)     BARU="${2:-}"; shift ;;
    *) echo "Pilihan tidak dikenal: $1" >&2; exit 1 ;;
  esac
  shift
done

[ -f "$SQL" ] || { echo "Berkas tidak ada: $SQL — jalankan pri-perbarui dulu." >&2; exit 1; }

# Nama server baru dibaca dari setelan aplikasi yang sedang jalan, bukan
# ditebak. Kalau aplikasi memakai alamat X, alamat di database harus X
# juga — kalau tidak, foto tetap tidak muncul walau sudah "diperbaiki".
if [ -z "$BARU" ]; then
  # "|| true" di ujung penting: tanpa itu, berkas .env yang kebetulan
  # tidak memuat SUPABASE_URL membuat skrip berhenti diam-diam di baris
  # ini (set -e + pipefail) — gagal tanpa satu pun penjelasan ke layar.
  BARU="$(grep -m1 '^SUPABASE_URL=' "$APP/.env" 2>/dev/null | cut -d= -f2- \
          | tr -d '"' | sed 's#^https\?://##; s#/.*$##' || true)"
fi
[ -n "$BARU" ] || {
  echo "Nama server baru tidak terbaca dari $APP/.env — sebutkan sendiri:" >&2
  echo "  bash $0 --baru db.pri-superapp.com --perbaiki" >&2
  exit 1
}
[ "$LAMA" != "$BARU" ] || { echo "Nama server lama dan baru sama ($LAMA) — tidak ada yang perlu dikerjakan."; exit 0; }

DB_CT="$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' 'index($2, "supabase/postgres") {print $1; exit}')"
[ -n "$DB_CT" ] || { echo "Container database Supabase tidak ditemukan." >&2; exit 1; }

echo "Database   : $DB_CT"
echo "Server lama: $LAMA"
echo "Server baru: $BARU"
if [ "$KERJAKAN" = ya ]; then
  echo "Mode       : MEMPERBAIKI"
else
  echo "Mode       : hanya memeriksa (tambahkan --perbaiki untuk mengubah)"
fi
echo

# Semua di dalam satu transaksi di dalam berkas SQL-nya: kalau
# pemeriksaan akhir gagal, tidak ada satu pun perubahan yang tersimpan.
if ! docker exec -i "$DB_CT" psql -U postgres -d postgres -q \
      -v ON_ERROR_STOP=1 -v lama="$LAMA" -v baru="$BARU" -v kerjakan="$KERJAKAN" \
      < "$SQL"; then
  echo >&2
  echo "GAGAL — tidak ada perubahan yang tersimpan." >&2
  exit 1
fi

[ "$KERJAKAN" = ya ] || {
  echo
  echo "Belum ada yang diubah. Kalau daftar di atas sudah masuk akal, jalankan:"
  echo "  bash $0 --perbaiki"
  exit 0
}

# ---------------------------------------------------------------------
# Pembuktian: satu foto diambil sungguhan dari server baru.
#
# Database yang "bersih" belum tentu berarti fotonya tampil — berkasnya
# harus benar-benar ada di server baru. Lebih baik ketahuan sekarang
# daripada oleh anggota besok pagi.
# ---------------------------------------------------------------------
echo
echo "== Membuktikan satu foto benar-benar bisa diambil =="
CONTOH="$(docker exec "$DB_CT" psql -U postgres -d postgres -tAc \
  "select avatar_url from public.app_user
    where avatar_url like 'http%://$BARU/%' limit 1" 2>/dev/null || true)"

if [ -z "$CONTOH" ]; then
  echo "  (tidak ada foto profil untuk diuji — dilewati)"
else
  KODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$CONTOH" || echo 000)"
  echo "  $CONTOH"
  if [ "$KODE" = 200 ]; then
    echo "  -> BISA DIAMBIL (200). Foto akan tampil."
  else
    echo "  -> TIDAK BISA DIAMBIL (kode $KODE)." >&2
    echo "     Alamatnya sudah benar, tapi berkasnya belum ada di server baru." >&2
    echo "     Jalankan pemindahan berkas: bash $(dirname "$0")/10-migrasi.sh berkas" >&2
    exit 1
  fi
fi

echo
echo "SELESAI."
