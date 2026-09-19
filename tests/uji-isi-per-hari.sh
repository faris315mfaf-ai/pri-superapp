#!/usr/bin/env bash
# =====================================================================
# Uji vps/29-isi-database-per-hari.sh tanpa database.
#
# Skrip ini dipakai memutuskan apakah menempuh pemulihan snapshot —
# tindakan berisiko yang bisa membuang data lain. Maka dua arah
# kesimpulannya harus sama-sama benar:
#   • ada lubang  -> harus dinyatakan TERBUKTI, jangan ragu-ragu;
#   • tidak ada   -> harus dinyatakan TIDAK PERLU, jangan menakut-nakuti
#     orang menempuh pemulihan yang tidak dibutuhkan.
# Ditambah satu hal yang tidak boleh gagal: kunci tidak boleh tercetak.
# =====================================================================
set -uo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
SKRIP="$AKAR/vps/29-isi-database-per-hari.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

lulus=0; gagal=0
cek() {
  if [ "$2" = "1" ]; then lulus=$((lulus+1)); echo "  ✔ $1"
  else gagal=$((gagal+1)); echo "  ✘ $1 ${3:-}"; fi
}

mkdir -p "$T/bin"
ENVAPP="$T/env.txt"
KUNCI="sb_secret_JANGAN-SAMPAI-TERCETAK"
printf 'SUPABASE_URL=https://contoh.supabase.co\nSUPABASE_SECRET_KEY=%s\n' "$KUNCI" > "$ENVAPP"

# curl palsu: mengembalikan Content-Range sesuai pola yang diminta uji.
cat > "$T/bin/curl" <<'SH'
#!/usr/bin/env bash
ARG="$*"
# Pemeriksaan "tabel ada atau tidak" (pakai -w '%{http_code}')
case "$ARG" in
  *"%{http_code}"*)
    case "$ARG" in
      *tvr_siaran*) echo "${UJI_HTTP_SIARAN:-404}"; exit 0 ;;
      *) echo "200"; exit 0 ;;
    esac ;;
esac
# Permintaan hitung: ambil tanggal dari parameter gte.
TGL="$(printf '%s' "$ARG" | grep -oE 'gte\.[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1 | cut -d. -f2)"
N=0
case "${UJI_POLA:-lubang}" in
  lubang)
    # Ramai sebelum 12 Sep, KOSONG 13-18, ramai lagi 19.
    case "$TGL" in
      2026-09-08|2026-09-09|2026-09-10|2026-09-11|2026-09-12) N=40 ;;
      2026-09-19|2026-09-20) N=12 ;;
      *) N=0 ;;
    esac ;;
  utuh)
    N=33 ;;
  kosong_semua)
    N=0 ;;
esac
echo "HTTP/1.1 206 Partial Content"
echo "content-range: 0-0/$N"
echo
exit 0
SH
chmod +x "$T/bin/curl"

jalankan() {
  PATH="$T/bin:$PATH" PRI_UJI=1 PRI_ENV_APP="$ENVAPP" PRI_TGL_MIGRASI=2026-09-12 \
    bash "$SKRIP" 2026-09-08 12 2>&1
}

echo
echo "[A] Ada lubang 13-18 Sep — harus dinyatakan TERBUKTI"
OUT="$(UJI_POLA=lubang jalankan)"
cek "angka per hari ditampilkan" "$(echo "$OUT" | grep -q '09-10:40' && echo 1 || echo 0)" "$(echo "$OUT" | head -14)"
cek "hari kosong terlihat sebagai 0" "$(echo "$OUT" | grep -q '09-15:0' && echo 1 || echo 0)"
cek "lubangnya ditandai" "$(echo "$OUT" | grep -q 'hari KOSONG setelah tanggal migrasi' && echo 1 || echo 0)"
cek "kesimpulan: TERBUKTI ADA LUBANG" "$(echo "$OUT" | grep -q 'TERBUKTI ADA LUBANG' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -4)"
cek "menyebut pemulihan snapshot masuk akal" "$(echo "$OUT" | grep -q 'masuk akal untuk ditempuh' && echo 1 || echo 0)"

echo
echo "[B] Data UTUH — jangan menakut-nakuti, harus bilang TIDAK PERLU"
OUT="$(UJI_POLA=utuh jalankan)"
cek "tidak mengeklaim ada lubang" "$(echo "$OUT" | grep -q 'TERBUKTI ADA LUBANG' && echo 0 || echo 1)"
cek "kesimpulan: tidak terlihat lubang" "$(echo "$OUT" | grep -q 'TIDAK terlihat lubang' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -4)"
cek "menyatakan pemulihan TIDAK PERLU" "$(echo "$OUT" | grep -q 'TIDAK PERLU dilanjutkan' && echo 1 || echo 0)"
cek "tetap menyuruh memeriksa angkanya sendiri" "$(echo "$OUT" | grep -q 'Periksa sekali lagi angkanya' && echo 1 || echo 0)"

echo
echo "[C] Semua nol — jangan salah sebut lubang (tidak ada pembanding)"
OUT="$(UJI_POLA=kosong_semua jalankan)"
cek "tidak mengeklaim lubang saat tak ada data sebelum migrasi" "$(echo "$OUT" | grep -q 'TERBUKTI ADA LUBANG' && echo 0 || echo 1)" "$(echo "$OUT" | sed -n '/KESIMPULAN/,$p' | head -3)"

echo
echo "[D] Tabel yang tidak ada dilewati, bukan menggagalkan"
OUT="$(UJI_POLA=lubang UJI_HTTP_SIARAN=404 jalankan)"; KODE=$?
cek "selesai tanpa galat" "$([ "$KODE" = "0" ] && echo 1 || echo 0)" "kode=$KODE"
cek "tabel hilang ditandai dilewati" "$(echo "$OUT" | grep -q 'dilewati — HTTP 404' && echo 1 || echo 0)" "$(echo "$OUT" | grep tvr_siaran)"
cek "tabel lain tetap diperiksa" "$(echo "$OUT" | grep -q 'tvrku_post' && echo 1 || echo 0)"

echo
echo "[E] KUNCI tidak boleh tercetak"
OUT="$(UJI_POLA=lubang jalankan)"
cek "kunci layanan tidak muncul di layar" "$(echo "$OUT" | grep -q "$KUNCI" && echo 0 || echo 1)" "KUNCI BOCOR"

echo
echo "HASIL: $lulus lulus, $gagal gagal"
[ "$gagal" -eq 0 ] || exit 1
