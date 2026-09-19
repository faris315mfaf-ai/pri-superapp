#!/usr/bin/env bash
# =====================================================================
# LANGKAH 25 — DI MANA SEBENARNYA DATABASE APLIKASI INI? (19 Sep 2026)
#
# KENAPA PERTANYAAN INI MUNCUL
# `pri-deploy` berhenti karena tidak menemukan container Supabase, dan
# panel Docker Hostinger memang hanya menampilkan satu proyek ("pri",
# 3 container). Tapi dua-duanya belum cukup untuk menyimpulkan apa pun:
#
#   • `docker ps` hanya menampilkan container yang HIDUP. Supabase bisa
#     saja masih terpasang lengkap tapi sedang MATI — dan kalau begitu,
#     datanya kemungkinan besar masih utuh dan tinggal dinyalakan.
#   • Panel Hostinger hanya menampilkan proyek yang DIBUAT LEWAT PANEL
#     ITU. Tumpukan yang dipasang lewat SSH tidak muncul di sana, jadi
#     "tidak ada di panel" bukan berarti "tidak ada di server".
#
# Salah menyimpulkan di sini mahal: kalau Supabase sebenarnya masih ada
# beserta datanya, memindahkan semuanya ke cloud berarti membuang data
# yang sudah ada. Sebaliknya kalau memang sudah tidak ada, menyalakan
# ulang yang kosong akan menimpa sambungan yang sekarang berjalan.
#
# Skrip ini MEMBACA SAJA. Tidak menyalakan, mematikan, atau mengubah
# satu pun container.
#
# CARA PAKAI (root, di VPS):
#   bash /opt/pri-superapp/skrip/25-cari-database.sh
# =====================================================================
set -uo pipefail

[ "$(id -u)" -eq 0 ] || [ -n "${PRI_UJI:-}" ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

ENV_APP="${PRI_ENV_APP:-/opt/pri-superapp/aplikasi/env.txt}"
TEMUAN=()
catat() { TEMUAN+=("$1"); }
garis() { printf '%s\n' "------------------------------------------------------------"; }

echo "MENCARI DATABASE PRI SUPERAPP"
echo "Server : $(hostname) — $(date -Is)"
echo "Catatan: skrip ini TIDAK mengubah apa pun."
garis

# ---------------------------------------------------------------------
echo "== 1/5 SEMUA container — yang hidup MAUPUN yang mati =="
# -a inilah bedanya dengan pemeriksaan sebelumnya.
SEMUA="$(docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.State}}' 2>/dev/null || true)"
if [ -z "$SEMUA" ]; then
  echo "  (tidak ada container sama sekali)"
else
  printf '%s\n' "$SEMUA" | awk -F'\t' '{printf "    %-28s %-40s %s\n", $1, substr($2,1,40), $3}'
fi
HIDUP="$(printf '%s\n' "$SEMUA" | awk -F'\t' '$3=="running"' | wc -l)"
MATI="$(printf '%s\n' "$SEMUA" | awk -F'\t' '$3!="running" && NF>0' | wc -l)"
echo "  ringkas: $HIDUP hidup, $MATI tidak hidup"

SB_CT="$(printf '%s\n' "$SEMUA" | awk -F'\t' 'index($2,"supabase/") || index($1,"supabase-") {print $1"("$3")"}' | tr '\n' ' ')"
if [ -n "$SB_CT" ]; then
  echo "  CONTAINER SUPABASE DITEMUKAN: $SB_CT"
  case "$SB_CT" in
    *"(running)"*) catat "Supabase MASIH HIDUP di server ini — pri-deploy seharusnya menemukannya. Periksa nama image-nya." ;;
    *) catat "Supabase ADA tapi MATI. JANGAN buru-buru pindah ke cloud — datanya kemungkinan masih utuh (lihat langkah 2)." ;;
  esac
else
  echo "  tidak ada container Supabase, hidup maupun mati."
  catat "Tidak ada container Supabase sama sekali — bukan sekadar sedang mati."
fi
garis

# ---------------------------------------------------------------------
echo "== 2/5 Sisa DATA Supabase (volume & folder) =="
# Container bisa dihapus tanpa menghapus datanya. Kalau datanya masih
# ada, memasang ulang Supabase mengembalikan isinya.
VOL="$(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -iE 'supabase|postgres|pri' | head -10 || true)"
if [ -n "$VOL" ]; then
  echo "  volume docker yang mungkin berisi data:"
  printf '%s\n' "$VOL" | sed 's/^/      /'
else
  echo "  tidak ada volume docker bernama supabase/postgres/pri."
fi
for D in /opt/pri-superapp/supabase /opt/pri/supabase /opt/supabase; do
  if [ -d "$D" ]; then
    echo "  folder $D ADA — ukuran: $(du -sh "$D" 2>/dev/null | cut -f1)"
    [ -f "$D/.env" ] && echo "      (berisi .env — pengaturan lamanya masih tersimpan)"
    catat "Folder pemasangan Supabase lama masih ada di $D."
  fi
done
DATA="$(find /opt /var/lib/docker/volumes -maxdepth 4 -type d -name 'pgdata' -o -maxdepth 4 -type d -name 'postgres-data' 2>/dev/null | head -4 || true)"
[ -n "$DATA" ] && { echo "  folder data Postgres:"; printf '%s\n' "$DATA" | sed 's/^/      /'; }
garis

# ---------------------------------------------------------------------
echo "== 3/5 Ke mana aplikasi menyambung =="
if [ -r "$ENV_APP" ]; then
  # Hanya NAMA variabel + host-nya yang dicetak. Nilai penuh tidak
  # pernah ditampilkan: di situ ada kunci layanan.
  SB="$(grep -m1 -E '^(NEXT_PUBLIC_)?SUPABASE_URL=' "$ENV_APP" 2>/dev/null | cut -d= -f2- | tr -d '\r"' || true)"
  echo "  SUPABASE_URL : ${SB:-(tidak ada)}"
  case "$SB" in
    *supabase.co*) catat "Aplikasi menyambung ke Supabase CLOUD: $SB" ;;
    *db.pri-superapp.com*) catat "Aplikasi masih menyambung ke db.pri-superapp.com — yaitu Supabase SWAKELOLA di server ini." ;;
    "") catat "SUPABASE_URL tidak ada di env aplikasi — periksa nama berkas envnya." ;;
  esac
  echo "  variabel alamat database yang ada (nilainya TIDAK dicetak):"
  grep -oE '^(MIGRASI_DB_URL|DATABASE_URL|POSTGRES_URL|SUPABASE_DB_URL|DIRECT_URL|POSTGRES_URL_NON_POOLING)=' "$ENV_APP" 2>/dev/null \
    | sed 's/=$//' | sed 's/^/      /' || echo "      (tidak ada satu pun)"
else
  echo "  berkas env tidak terbaca: $ENV_APP"
  catat "Env aplikasi tidak terbaca di $ENV_APP."
fi
garis

# ---------------------------------------------------------------------
echo "== 4/5 Apakah alamat itu benar-benar menjawab =="
if [ -n "${SB:-}" ]; then
  KODE="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "${SB%/}/rest/v1/" 2>/dev/null || echo 000)"
  echo "  ${SB%/}/rest/v1/  -> HTTP $KODE"
  case "$KODE" in
    000) catat "Alamat database TIDAK MENJAWAB dari server ini. Kalau aplikasi tetap sehat, berarti ia memakai jalur lain — periksa lagi env-nya." ;;
    401|400) echo "      (401/400 itu WAJAR: artinya hidup, cuma menolak permintaan tanpa kunci)" ;;
  esac
fi
# Aplikasi sendiri yang paling tahu: /api/sehat memang memeriksa database.
SEHAT="$(curl -s -m 15 http://127.0.0.1:3001/api/sehat 2>/dev/null || curl -s -m 15 https://pri-superapp.com/api/sehat 2>/dev/null || true)"
[ -n "$SEHAT" ] && echo "  jawaban /api/sehat: $(printf '%s' "$SEHAT" | head -c 200)"
printf '%s' "$SEHAT" | grep -q '"database":"ok"' && catat "Aplikasi BISA memakai databasenya sekarang — apa pun lokasinya, sambungannya jalan."
garis

# ---------------------------------------------------------------------
echo "== 5/5 KESIMPULAN =="
if [ ${#TEMUAN[@]} -eq 0 ]; then
  echo "  Tidak ada yang bisa disimpulkan dari data yang terbaca."
else
  for t in "${TEMUAN[@]}"; do echo "  • $t"; done
fi
echo
echo "ARTINYA UNTUK MIGRASI SQL"
if [ -n "$SB_CT" ]; then
  echo "  Supabase masih ada di server ini. JANGAN pindah ke cloud."
  echo "  Nyalakan dulu tumpukannya, lalu jalankan: pri-deploy --status"
else
  echo "  Databasenya memang di luar server. Migrasi hanya bisa dijalankan"
  echo "  setelah ada alamat sambungan Postgres-nya. Tambahkan satu baris"
  echo "  MIGRASI_DB_URL=... di $ENV_APP (port 5432, bukan 6543),"
  echo "  lalu: pri-deploy --status"
fi
