#!/usr/bin/env bash
# =====================================================================
# LANGKAH 22 — DEPLOY MENYELURUH KE VPS (18 Sep 2026)
#
# Satu perintah untuk menurunkan SEMUANYA: kode terbaru, seluruh
# perubahan database yang belum pernah dijalankan, lalu membangun dan
# mengganti aplikasi yang sedang berjalan.
#
# MASALAH YANG DIPECAHKAN
# Sampai sekarang berkas SQL dijalankan satu per satu dengan tangan
# (`pri-sql 53_...`), dan TIDAK ADA catatan mana yang sudah dijalankan.
# Akibatnya menumpuk pertanyaan "sql/48 sudah belum?" yang tidak bisa
# dijawab siapa pun, dan fitur yang kodenya sudah live diam-diam tidak
# bekerja karena kolomnya belum ada di database. Gejalanya bukan galat
# merah, melainkan layar kosong.
#
# Skrip ini membuat BUKU CATATAN di database (tabel _migrasi_sql):
# tiap berkas yang berhasil dijalankan dicatat beserta sidik jari isinya.
# Sejak sekarang pertanyaan itu punya jawaban, dan menjalankan skrip ini
# berkali-kali aman — yang sudah tercatat dilewati.
#
# KENAPA AMAN MENJALANKAN SEMUA DARI AWAL
# Seluruh 53 berkas migrasi sudah diperiksa: tidak ada satu pun perintah
# yang menghapus (drop/truncate/delete), semuanya memakai IF NOT EXISTS,
# ON CONFLICT, atau penjaga WHERE NOT EXISTS. Jadi pada jalan pertama —
# ketika buku catatannya masih kosong dan sebagian besar sebenarnya sudah
# pernah dijalankan — mengulangnya tidak mengubah apa pun.
#
# HUBUNGANNYA DENGAN DEPLOY OTOMATIS (17-pasang-deploy-otomatis.sh)
# Sejak 18 Sep, push ke main membuat GitHub menyambung SSH ke server dan
# menjalankan `pri-perbarui` sendiri. Itu mengurus KODE, bukan database.
# Skrip ini melengkapi bagian yang belum tertutup: perubahan database.
# Jadi pemakaian yang wajar adalah menjalankannya setelah ada migrasi
# baru, atau sekali sekarang untuk menutup semua yang tertunggak.
#
# URUTANNYA DISENGAJA: database dulu, aplikasi belakangan. Semua
# perubahan skema di proyek ini bersifat menambah, jadi kode LAMA tetap
# jalan di atas skema BARU. Sebaliknya tidak: kode baru di atas skema
# lama langsung rusak.
#
# YANG TIDAK DIJALANKAN DI SINI
#   rls.sql   — berkas itu sendiri menyatakan harus dijalankan manual
#               oleh pemilik proyek. Aturan keamanan baris terlalu
#               berbahaya untuk dipasang tanpa orang yang mengawasi.
#   index.sql — aman diulang, tapi membuat indeks pada database yang
#               sedang dipakai bisa mengunci tabel sesaat. Dijalankan
#               hanya bila diminta: --dengan-index
#
# CARA PAKAI (root, di VPS):
#   pri-deploy                  # kode + SQL + aplikasi
#   pri-deploy --coba           # hanya menampilkan apa yang AKAN dijalankan
#   pri-deploy --lewati-sql     # hanya bangun ulang aplikasi
#   pri-deploy --lewati-aplikasi# hanya jalankan SQL yang tertunda
#   pri-deploy --dengan-index   # sekalian pasang indeks tambahan
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || [ -n "${PRI_UJI:-}" ] || { echo "Jalankan sebagai root: sudo bash $0 $*" >&2; exit 1; }

# Jalurnya bisa ditimpa lewat env — dipakai pengujian di luar VPS
# (tests/uji-deploy-penuh.sh). Di server, ketiganya memakai bawaan.
SUMBER="${PRI_SUMBER:-/opt/pri-superapp/sumber}"
KUNCI="${PRI_KUNCI:-/opt/pri-superapp/kunci.env}"
SKRIP="${PRI_SKRIP:-/opt/pri-superapp/skrip}"

COBA=0
LEWATI_SQL=0
LEWATI_APLIKASI=0
DENGAN_INDEX=0
for arg in "$@"; do
  case "$arg" in
    --coba) COBA=1 ;;
    --lewati-sql) LEWATI_SQL=1 ;;
    --lewati-aplikasi) LEWATI_APLIKASI=1 ;;
    --dengan-index) DENGAN_INDEX=1 ;;
    *) echo "Pilihan tidak dikenal: $arg" >&2; exit 1 ;;
  esac
done

# Pintasan pri-deploy, dipasang saat pertama kali dijalankan.
PINTASAN=/usr/local/bin/pri-deploy
if [ -z "${PRI_UJI:-}" ] && [ -f "$SKRIP/22-deploy-penuh.sh" ] \
   && [ "$(readlink -f "$PINTASAN" 2>/dev/null || true)" != "$SKRIP/22-deploy-penuh.sh" ]; then
  chmod +x "$SKRIP/22-deploy-penuh.sh" 2>/dev/null || true
  { ln -sf "$SKRIP/22-deploy-penuh.sh" "$PINTASAN" 2>/dev/null \
    && echo "  perintah pendek dipasang: pri-deploy"; } || true
fi

echo "== 1/6 Mengambil kode terbaru =="
command -v docker >/dev/null || { echo "Docker belum ada." >&2; exit 1; }
[ -d "$SUMBER/.git" ] || { echo "Kode sumber tidak ada di $SUMBER." >&2; exit 1; }
SEBELUM="$(git -C "$SUMBER" rev-parse --short HEAD 2>/dev/null || echo '?')"
git -C "$SUMBER" fetch --quiet origin main
git -C "$SUMBER" pull --quiet --ff-only origin main
SESUDAH="$(git -C "$SUMBER" rev-parse --short HEAD)"
if [ "$SEBELUM" = "$SESUDAH" ]; then
  echo "  sudah versi terbaru: $(git -C "$SUMBER" log --oneline -1)"
else
  echo "  $SEBELUM -> $SESUDAH"
  git -C "$SUMBER" log --oneline "$SEBELUM..$SESUDAH" | sed 's/^/    /' | head -20
fi
# Skrip di /opt/pri-superapp/skrip ikut disegarkan supaya perbaikan pada skrip
# deploy ini sendiri ikut turun tanpa langkah terpisah.
if [ -d "$SUMBER/vps" ]; then
  mkdir -p "$SKRIP"
  cp -f "$SUMBER"/vps/*.sh "$SKRIP"/ 2>/dev/null || true
  chmod +x "$SKRIP"/*.sh 2>/dev/null || true
fi

if [ "$LEWATI_SQL" = "1" ]; then
  echo
  echo "== 2-4/6 SQL DILEWATI (--lewati-sql) =="
else

echo "== 2/6 Mencari database =="
# Dicari lewat NAMA IMAGE, bukan nama container: nama container berbeda
# tergantung cara Supabase dipasang, imagenya tetap.
CT="$(docker ps --format '{{.Names}}\t{{.Image}}' \
      | awk -F'\t' 'index($2, "supabase/postgres") { print $1; exit }')"
[ -n "$CT" ] || { echo "Container database tidak ditemukan (image supabase/postgres)." >&2; docker ps --format '  {{.Names}}  ({{.Image}})' >&2; exit 1; }
[ -f "$KUNCI" ] || { echo "Berkas kunci tidak ada: $KUNCI" >&2; exit 1; }
# shellcheck disable=SC1090
. "$KUNCI"
[ -n "${PG_PASS:-}" ] || { echo "PG_PASS tidak ada di $KUNCI" >&2; exit 1; }
URL="postgresql://postgres:${PG_PASS}@127.0.0.1:5432/postgres"
echo "  container: $CT"

# Menjalankan satu perintah SQL pendek dan mengembalikan hasilnya.
psql_nilai() { docker exec -i "$CT" psql -qtAX -v ON_ERROR_STOP=1 "$URL" -c "$1"; }

echo "== 3/6 Buku catatan migrasi =="
psql_nilai "
create table if not exists public._migrasi_sql (
  berkas          text primary key,
  sidik           text not null,
  dijalankan_pada timestamptz not null default now()
);
comment on table public._migrasi_sql is
  'Catatan berkas sql/ yang sudah dijalankan di database ini. Diisi oleh vps/22-deploy-penuh.sh — jangan diubah tangan.';
" >/dev/null
SUDAH="$(psql_nilai "select count(*) from public._migrasi_sql;")"
echo "  $SUDAH berkas tercatat pernah dijalankan"
[ "$SUDAH" = "0" ] && echo "  (buku catatan baru dibuat — jalan pertama akan menelusuri semuanya dari awal)"

echo "== 4/6 Menjalankan perubahan database yang tertunda =="
DAFTAR="$(ls -1 "$SUMBER"/sql/[0-9]*_*.sql 2>/dev/null | sort -V || true)"
[ "$DENGAN_INDEX" = "1" ] && [ -f "$SUMBER/sql/index.sql" ] && DAFTAR="$DAFTAR
$SUMBER/sql/index.sql"
[ -n "$DAFTAR" ] || { echo "Tidak ada berkas SQL di $SUMBER/sql." >&2; exit 1; }

JALAN=0
LEWAT=0
BERUBAH=0
while IFS= read -r JALUR; do
  [ -n "$JALUR" ] || continue
  NAMA="$(basename "$JALUR")"
  SIDIK="$(sha256sum "$JALUR" | cut -c1-16)"
  TERCATAT="$(psql_nilai "select sidik from public._migrasi_sql where berkas = $(printf "%s" "'$NAMA'");" || true)"

  if [ "$TERCATAT" = "$SIDIK" ]; then
    LEWAT=$((LEWAT + 1))
    continue
  fi
  SEBAB="baru"
  if [ -n "$TERCATAT" ]; then
    SEBAB="ISINYA BERUBAH sejak terakhir dijalankan"
    BERUBAH=$((BERUBAH + 1))
  fi

  if [ "$COBA" = "1" ]; then
    printf "  akan dijalankan: %-38s (%s)\n" "$NAMA" "$SEBAB"
    JALAN=$((JALAN + 1))
    continue
  fi

  printf "  %-38s " "$NAMA"
  # --single-transaction: satu perintah gagal -> SEMUA isi berkas itu
  # dibatalkan. Skema setengah jadi jauh lebih sulit diperbaiki
  # daripada skema yang belum disentuh.
  if docker exec -i "$CT" psql -v ON_ERROR_STOP=1 --single-transaction "$URL" \
       < "$JALUR" > /tmp/deploy-sql.log 2>&1; then
    psql_nilai "
      insert into public._migrasi_sql (berkas, sidik)
      values ($(printf "%s" "'$NAMA'"), $(printf "%s" "'$SIDIK'"))
      on conflict (berkas) do update
        set sidik = excluded.sidik, dijalankan_pada = now();
    " >/dev/null
    echo "OK"
    JALAN=$((JALAN + 1))
  else
    echo "GAGAL"
    echo >&2
    echo "Berhenti di $NAMA. TIDAK ada perubahan dari berkas itu yang tersimpan," >&2
    echo "dan aplikasi TIDAK diganti — supaya kode baru tidak berjalan di atas" >&2
    echo "skema yang belum lengkap." >&2
    echo >&2
    sed 's/^/  /' /tmp/deploy-sql.log >&2
    exit 1
  fi
done <<< "$DAFTAR"

echo "  selesai: $JALAN dijalankan, $LEWAT dilewati (sudah tercatat)"
[ "$BERUBAH" -gt 0 ] && echo "  $BERUBAH berkas isinya berubah sejak terakhir dijalankan — dijalankan ulang"

fi  # akhir blok SQL

if [ "$LEWATI_APLIKASI" = "1" ] || [ "$COBA" = "1" ]; then
  echo
  if [ "$COBA" = "1" ]; then
    echo "== 5-6/6 PERCOBAAN SAJA — tidak ada yang diubah =="
    echo "Jalankan tanpa --coba untuk benar-benar memasang."
  else
    echo "== 5-6/6 APLIKASI DILEWATI (--lewati-aplikasi) =="
  fi
  exit 0
fi

echo "== 5/6 Membangun & mengganti aplikasi =="
# Sengaja memanggil 12-perbarui.sh, bukan menyalin isinya: di sanalah
# cadangan versi lama dan pengembalian otomatis kalau versi baru tidak
# menjawab. Dua salinan logika itu cepat atau lambat akan berbeda.
[ -x "$SKRIP/12-perbarui.sh" ] || chmod +x "$SKRIP/12-perbarui.sh" 2>/dev/null || true
bash "$SKRIP/12-perbarui.sh"

echo "== 6/6 Ringkasan =="
echo
echo "SELESAI."
echo "  Versi kode : $(git -C "$SUMBER" log --oneline -1)"
if [ "$LEWATI_SQL" != "1" ]; then
  echo "  Database   : $(docker exec -i "$CT" psql -qtAX "$URL" -c 'select count(*) from public._migrasi_sql;' 2>/dev/null || echo '?') berkas SQL tercatat"
  echo "  Riwayatnya : docker exec -i $CT psql \"\$URL\" -c 'select * from _migrasi_sql order by dijalankan_pada desc limit 10;'"
fi
echo
echo "Yang TETAP manual (disengaja):"
echo "  sql/rls.sql   — aturan keamanan baris, jalankan sendiri bila memang mau"
[ "$DENGAN_INDEX" != "1" ] && echo "  sql/index.sql — indeks tambahan, pakai: pri-deploy --dengan-index"
