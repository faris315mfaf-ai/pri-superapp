#!/usr/bin/env bash
# =====================================================================
# Uji vps/27-cari-cadangan.sh tanpa server.
#
# Skrip itu dipakai untuk memutuskan apakah data seminggu masih bisa
# diselamatkan. Dua kesalahan yang paling mahal:
#   1. bilang "tidak ada cadangan" padahal ada  -> orang menyerah,
#      lalu cadangannya terhapus sendiri setelah 14 hari;
#   2. bilang "ada cadangan setelah migrasi" padahal tidak -> orang
#      merasa aman, lalu baru sadar saat sudah terlambat.
# Jadi yang diuji terutama KESIMPULANNYA untuk tiap keadaan.
# =====================================================================
set -uo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
SKRIP="$AKAR/vps/27-cari-cadangan.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

lulus=0; gagal=0
cek() {
  if [ "$2" = "1" ]; then lulus=$((lulus+1)); echo "  ✔ $1"
  else gagal=$((gagal+1)); echo "  ✘ $1 ${3:-}"; fi
}

mkdir -p "$T/bin" "$T/cadangan"
# crontab palsu supaya langkah 4 bisa diuji dua arah.
cat > "$T/bin/crontab" <<'SH'
#!/usr/bin/env bash
[ "${UJI_CRON:-1}" = "1" ] && echo "0 2 * * * bash /opt/pri-superapp/skrip/07-cadangan-harian.sh"
exit 0
SH
chmod +x "$T/bin/crontab"

# Berkas cadangan dengan TANGGAL tertentu (waktu ubah berkas = tanggalnya).
buat() { : > "$T/cadangan/$1"; touch -d "$2" "$T/cadangan/$1"; }

jalankan() {
  PATH="$T/bin:$PATH" PRI_UJI=1 PRI_DIR_CADANGAN="$T/cadangan" PRI_TGL_MIGRASI=2026-09-12 \
    bash "$SKRIP" 2>&1
}

echo
echo "[A] Folder kosong — jangan bilang aman"
OUT="$(jalankan)"
cek "dinyatakan tidak ada berkas cadangan" "$(echo "$OUT" | grep -qE 'TIDAK ADA satu pun folder cadangan|TIDAK ADA berkas dump' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -4)"
cek "TIDAK mengeklaim data bisa diselamatkan" "$(echo "$OUT" | grep -q 'MASIH BISA diselamatkan' && echo 0 || echo 1)"

echo
echo "[B] Ada cadangan SETELAH migrasi — inilah harapan itu"
buat "db-20260913-0200.dump" "2026-09-13 02:00"
buat "db-20260916-0200.dump" "2026-09-16 02:00"
buat "db-20260918-0200.dump" "2026-09-18 02:00"
buat "storage-20260918-0200.tar.gz" "2026-09-18 02:05"
OUT="$(jalankan)"
cek "dinyatakan MASIH BISA diselamatkan" "$(echo "$OUT" | grep -q 'MASIH BISA diselamatkan' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -4)"
cek "cadangan terbaru benar (18 Sep)" "$(echo "$OUT" | grep -q 'cadangan terbaru : 2026-09-18' && echo 1 || echo 0)" "$(echo "$OUT" | grep 'cadangan terbaru')"
cek "cadangan tertua benar (13 Sep)" "$(echo "$OUT" | grep -q 'cadangan tertua  : 2026-09-13' && echo 1 || echo 0)"
cek "tanggal yang tercakup didaftar" "$(echo "$OUT" | grep -q '2026-09-16' && echo 1 || echo 0)"
cek "berkas storage ikut terlihat" "$(echo "$OUT" | grep -q 'storage-20260918' && echo 1 || echo 0)"
cek "diurutkan dari yang TERBARU" "$(echo "$OUT" | grep -A1 'di .*cadangan:' | grep -q '2026-09-18' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/2\/4/,/3\/4/p')"

echo
echo "[C] Cadangan hanya SEBELUM migrasi — jangan memberi harapan palsu"
rm -f "$T/cadangan"/*
buat "db-20260910-0200.dump" "2026-09-10 02:00"
buat "db-20260911-0200.dump" "2026-09-11 02:00"
OUT="$(jalankan)"
cek "TIDAK mengeklaim bisa diselamatkan" "$(echo "$OUT" | grep -q 'MASIH BISA diselamatkan' && echo 0 || echo 1)"
cek "diperingatkan cadangan berhenti" "$(echo "$OUT" | grep -q 'TIDAK lebih baru dari tanggal migrasi' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -4)"

echo
echo "[D] Jadwal pencadangan"
OUT="$(UJI_CRON=1 jalankan)"
cek "jadwal yang ada ditampilkan" "$(echo "$OUT" | grep -q '07-cadangan-harian' && echo 1 || echo 0)"
OUT="$(UJI_CRON=0 jalankan)"
cek "jadwal hilang diperingatkan" "$(echo "$OUT" | grep -q 'TIDAK terjadwal lagi' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/4\/4/,/KESIMPULAN/p')"

echo
echo "[E] Peringatan waktu & keselamatan selalu muncul"
OUT="$(jalankan)"
cek "menyebut batas 14 hari" "$(echo "$OUT" | grep -q '14 HARI' && echo 1 || echo 0)"
cek "menyarankan MENYALIN keluar dulu" "$(echo "$OUT" | grep -q 'SALIN KELUAR' && echo 1 || echo 0)"
cek "memperingatkan memulihkan bisa MENIMPA" "$(echo "$OUT" | grep -q 'MENIMPA data baru' && echo 1 || echo 0)"
cek "tidak memulihkan apa pun sendiri" "$(echo "$OUT" | grep -qE '^ *(pg_restore|psql) ' && echo 0 || echo 1)"

echo
echo "[F] Berkas cadangan TIDAK tersentuh oleh pemeriksaan"
SEBELUM="$(ls -1 "$T/cadangan" | sort | md5sum)"
jalankan >/dev/null
SESUDAH="$(ls -1 "$T/cadangan" | sort | md5sum)"
cek "isi folder cadangan sama persis sesudahnya" "$([ "$SEBELUM" = "$SESUDAH" ] && echo 1 || echo 0)"

echo
echo "HASIL: $lulus lulus, $gagal gagal"
[ "$gagal" -eq 0 ] || exit 1
