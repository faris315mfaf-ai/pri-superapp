#!/usr/bin/env bash
# =====================================================================
# Uji vps/26-periksa-lambat.sh tanpa server.
#
# Dua hal yang dikunci di sini:
#   1. KUNCI DAN SANDI TIDAK PERNAH IKUT TERCETAK. Skrip ini memakai
#      kunci layanan Supabase dan URL Redis bersandi; satu baris salah
#      cetak = kunci produksi ada di riwayat terminal dan di chat.
#   2. Kesimpulannya menunjuk tersangka yang BENAR, karena obat untuk
#      "Redis mati" dan "database lambat" sama sekali berbeda.
# =====================================================================
set -uo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
SKRIP="$AKAR/vps/26-periksa-lambat.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

lulus=0; gagal=0
cek() {
  if [ "$2" = "1" ]; then lulus=$((lulus+1)); echo "  ✔ $1"
  else gagal=$((gagal+1)); echo "  ✘ $1 ${3:-}"; fi
}

mkdir -p "$T/bin"
ENVAPP="$T/env.txt"
KUNCI_RAHASIA="sb_secret_INI-KUNCI-LAYANAN-JANGAN-BOCOR"
SANDI_REDIS="SANDIREDIS123"

cat > "$T/bin/docker" <<'SH'
#!/usr/bin/env bash
if [ "$1" = "ps" ]; then
  [ "${UJI_APP_JALAN:-1}" = "1" ] && echo "pri-aplikasi"
  echo "pri-redis"
  exit 0
fi
if [ "$1" = "exec" ]; then
  case "${UJI_REDIS:-ok}" in
    ok)     echo "SAMBUNG_OK 3ms ke redis:6379" ;;
    gagal)  echo "GAGAL ECONNREFUSED ke redis:6379"; exit 1 ;;
  esac
  exit 0
fi
if [ "$1" = "logs" ]; then
  printf 'GET /api/detak 200\nGET /api/detak 200\nGET /api/sesi 200\nPOST /api/login 500\nerror: fetch failed\n'
  exit 0
fi
exit 0
SH
cat > "$T/bin/curl" <<'SH'
#!/usr/bin/env bash
# Tulis berkas keluaran bila -o diminta.
OUT=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && OUT="$a"; prev="$a"; done
case "$*" in
  *app_user*)
    [ -n "$OUT" ] && printf '%s' "${UJI_BADAN:-[{\"id\":1}]}" > "$OUT"
    echo "${UJI_HTTP:-200} ${UJI_DETIK:-0.08}"
    exit 0 ;;
  *rest/v1/*)
    echo "      dns:0.004  sambung:0.05  tls:0.12  byte_pertama:${UJI_TTFB:-0.15}  total:${UJI_TTFB:-0.15}"
    exit 0 ;;
esac
exit 0
SH
chmod +x "$T/bin"/*

tulis_env() {
  : > "$ENVAPP"
  [ "${1:-ada}" = "ada" ] && echo "REDIS_URL=redis://bawaan:${SANDI_REDIS}@redis-host.internal:6379/0" >> "$ENVAPP"
  echo "SUPABASE_URL=https://pichnkyjepsirpclofhs.supabase.co" >> "$ENVAPP"
  echo "SUPABASE_SECRET_KEY=${KUNCI_RAHASIA}" >> "$ENVAPP"
}

jalankan() {
  PATH="$T/bin:$PATH" PRI_UJI=1 PRI_ENV_APP="$ENVAPP" PRI_CT_APP=pri-aplikasi bash "$SKRIP" 2>&1
}

echo
echo "[A] KUNCI & SANDI tidak boleh bocor ke layar"
tulis_env ada
OUT="$(jalankan)"
cek "kunci layanan Supabase TIDAK tercetak" "$(echo "$OUT" | grep -q "$KUNCI_RAHASIA" && echo 0 || echo 1)" "KUNCI BOCOR"
cek "sandi Redis TIDAK tercetak" "$(echo "$OUT" | grep -q "$SANDI_REDIS" && echo 0 || echo 1)" "SANDI BOCOR"
cek "host Redis tetap terlihat (berguna, tidak rahasia)" "$(echo "$OUT" | grep -q 'redis-host.internal' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/1\/5/,/2\/5/p')"
cek "alamat Supabase boleh tampil" "$(echo "$OUT" | grep -q 'pichnkyjepsirpclofhs' && echo 1 || echo 0)"

echo
echo "[B] Redis tidak bisa disambung — tersangka utama"
OUT="$(UJI_REDIS=gagal jalankan)"
cek "kegagalannya dilaporkan" "$(echo "$OUT" | grep -q 'TIDAK BISA menyambung ke Redis' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/5\/5/,$p')"
cek "dijelaskan akibatnya ke database" "$(echo "$OUT" | grep -q 'beban jatuh semua ke database' && echo 1 || echo 0)"

echo
echo "[C] REDIS_URL kosong — sebab yang berbeda, pesan yang berbeda"
tulis_env kosong
OUT="$(jalankan)"
cek "dinyatakan tidak ada" "$(echo "$OUT" | grep -q 'TIDAK ADA di env aplikasi' && echo 1 || echo 0)"
cek "dijelaskan tiap cek sesi jatuh ke database" "$(echo "$OUT" | grep -q 'SETIAP cek sesi jatuh ke database' && echo 1 || echo 0)"

echo
echo "[D] Kueri tabel pengguna LAMBAT"
tulis_env ada
OUT="$(UJI_DETIK=9.4 jalankan)"
cek "waktunya dilaporkan" "$(echo "$OUT" | grep -q '9.4' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/3\/5/,/4\/5/p')"
cek "dinyatakan cukup membuat login gagal" "$(echo "$OUT" | grep -q 'membuat login gagal' && echo 1 || echo 0)"

echo
echo "[E] Supabase mengirim pesan pembatasan jatah"
OUT="$(UJI_HTTP=402 UJI_BADAN='{"message":"Project exceeded quota, paused"}' jalankan)"
cek "pesannya ditampilkan" "$(echo "$OUT" | grep -q 'exceeded quota' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/3\/5/,/4\/5/p')"
cek "disimpulkan sebagai pembatasan" "$(echo "$OUT" | grep -q 'sedang DIBATASI' && echo 1 || echo 0)"

echo
echo "[F] Data normal TIDAK ikut dicetak (hanya pesan galat yang ditampilkan)"
OUT="$(UJI_BADAN='[{"id":42,"nama":"Budi Santoso"}]' jalankan)"
cek "isi baris data tidak muncul di layar" "$(echo "$OUT" | grep -q 'Budi Santoso' && echo 0 || echo 1)" "DATA PENGGUNA BOCOR"

echo
echo "[G] Container aplikasi mati — jangan macet"
OUT="$(UJI_APP_JALAN=0 jalankan)"; KODE=$?
cek "tetap selesai tanpa galat" "$([ "$KODE" = "0" ] && echo 1 || echo 0)" "kode=$KODE"
cek "dinyatakan dilewati" "$(echo "$OUT" | grep -q 'tidak sedang jalan' && echo 1 || echo 0)"

echo
echo "HASIL: $lulus lulus, $gagal gagal"
[ "$gagal" -eq 0 ] || exit 1
