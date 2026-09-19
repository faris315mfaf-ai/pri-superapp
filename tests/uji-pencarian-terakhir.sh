#!/usr/bin/env bash
# =====================================================================
# Uji vps/28-pencarian-terakhir.sh tanpa server.
#
# Ini pencarian TERAKHIR sebelum menyatakan data seminggu hilang. Dua
# kesalahan yang sama-sama fatal:
#   1. melewatkan data yang sebenarnya ADA (volume yatim / folder
#      PostgreSQL yang tercecer) — orang menyerah padahal masih bisa;
#   2. menyatakan "ketemu" padahal bukan — orang berhenti mencari di
#      tempat yang benar, yaitu snapshot Hostinger.
# =====================================================================
set -uo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
SKRIP="$AKAR/vps/28-pencarian-terakhir.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

lulus=0; gagal=0
cek() {
  if [ "$2" = "1" ]; then lulus=$((lulus+1)); echo "  ✔ $1"
  else gagal=$((gagal+1)); echo "  ✘ $1 ${3:-}"; fi
}

mkdir -p "$T/bin" "$T/cari"

cat > "$T/bin/docker" <<'SH'
#!/usr/bin/env bash
if [ "$1" = "volume" ]; then
  case "$*" in
    *"dangling=true"*) [ "${UJI_YATIM:-0}" = "1" ] && echo "supabase_db-data"; exit 0 ;;
    *inspect*)
      # Mountpoint diarahkan ke folder tiruan yang disiapkan uji.
      echo "${UJI_MOUNT:-/tidak/ada}"; exit 0 ;;
    *ls*) echo "pri_redis-data"; [ "${UJI_YATIM:-0}" = "1" ] && echo "supabase_db-data"; exit 0 ;;
  esac
fi
exit 0
SH
cat > "$T/bin/df" <<'SH'
#!/usr/bin/env bash
echo "Filesystem      Size  Used Avail Use% Mounted on"
echo "/dev/sda1       400G  120G  280G  31% /"
SH
chmod +x "$T/bin"/*

jalankan() {
  PATH="$T/bin:$PATH" PRI_UJI=1 PRI_AKAR_CARI="$T/cari" bash "$SKRIP" 2>&1
}

echo
echo "[A] Tidak ada sisa apa pun — jangan berhenti di situ"
OUT="$(jalankan)"
cek "dinyatakan tidak ditemukan" "$(echo "$OUT" | grep -q 'Tidak ditemukan sisa data' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -4)"
cek "MENGARAHKAN ke snapshot Hostinger" "$(echo "$OUT" | grep -q 'Backups / Snapshots' && echo 1 || echo 0)"
cek "memperingatkan jangan menimpa server sekarang" "$(echo "$OUT" | grep -q 'JANGAN memulihkan snapshot menimpa' && echo 1 || echo 0)"
cek "menyarankan pasang pencadangan harian" "$(echo "$OUT" | grep -q '07-cadangan-harian' && echo 1 || echo 0)"

echo
echo "[B] Ada VOLUME YATIM berisi database — temuan paling berharga"
mkdir -p "$T/volyatim"
echo "15" > "$T/volyatim/PG_VERSION"
OUT="$(UJI_YATIM=1 UJI_MOUNT="$T/volyatim" jalankan)"
cek "volume yatim terdaftar" "$(echo "$OUT" | grep -q 'supabase_db-data' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/1\/5/,/2\/5/p')"
cek "ditandai BERISI DATABASE" "$(echo "$OUT" | grep -q 'BERISI DATABASE POSTGRESQL' && echo 1 || echo 0)"
cek "masuk kesimpulan sebagai kemungkinan data yang dicari" "$(echo "$OUT" | grep -q 'INI KEMUNGKINAN DATA YANG DICARI' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -4)"
cek "TIDAK lagi bilang tidak ditemukan" "$(echo "$OUT" | grep -q 'Tidak ditemukan sisa data' && echo 0 || echo 1)"

echo
echo "[C] Folder data PostgreSQL tercecer di disk"
mkdir -p "$T/cari/pri/supabase/volumes/db/data"
echo "15" > "$T/cari/pri/supabase/volumes/db/data/PG_VERSION"
OUT="$(jalankan)"
cek "folder datanya ditemukan" "$(echo "$OUT" | grep -q 'volumes/db/data' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/2\/5/,/3\/5/p')"
cek "versi PostgreSQL ikut dilaporkan" "$(echo "$OUT" | grep -q 'versi 15' && echo 1 || echo 0)"
cek "disarankan memeriksa tanggal ubahnya" "$(echo "$OUT" | grep -q 'periksa tanggal ubahnya' && echo 1 || echo 0)"

echo
echo "[D] Berkas dump besar yang tercecer"
mkdir -p "$T/cari/lain"
dd if=/dev/zero of="$T/cari/lain/db-lama.dump" bs=1M count=6 status=none 2>/dev/null
OUT="$(jalankan)"
cek "dump besar ditemukan" "$(echo "$OUT" | grep -q 'db-lama.dump' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/3\/5/,/4\/5/p')"
cek "berkas kecil tidak ikut (ambang 5 MB)" "$(dd if=/dev/zero of="$T/cari/lain/kecil.dump" bs=1K count=10 status=none 2>/dev/null; jalankan | grep -q 'kecil.dump' && echo 0 || echo 1)"

echo
echo "[E] Ruang disk dilaporkan"
OUT="$(jalankan)"
cek "sisa disk ditampilkan" "$(echo "$OUT" | grep -q '280G' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/5\/5/,/KESIMPULAN/p')"

echo
echo "[F] Tidak menyentuh apa pun"
SEBELUM="$(find "$T/cari" "$T/volyatim" -type f 2>/dev/null | sort | md5sum)"
jalankan >/dev/null
SESUDAH="$(find "$T/cari" "$T/volyatim" -type f 2>/dev/null | sort | md5sum)"
cek "berkas di disk sama persis sesudahnya" "$([ "$SEBELUM" = "$SESUDAH" ] && echo 1 || echo 0)"

echo
echo "HASIL: $lulus lulus, $gagal gagal"
[ "$gagal" -eq 0 ] || exit 1
