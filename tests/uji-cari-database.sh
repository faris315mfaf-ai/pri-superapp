#!/usr/bin/env bash
# =====================================================================
# Uji vps/25-cari-database.sh tanpa server.
#
# Yang dikunci di sini adalah KESIMPULANNYA, karena kesimpulan yang
# salah di skrip ini berakibat mahal: kalau ia bilang "tidak ada
# Supabase" padahal cuma MATI, orang akan memindahkan semuanya ke cloud
# dan meninggalkan data yang sebenarnya masih utuh.
# =====================================================================
set -uo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
SKRIP="$AKAR/vps/25-cari-database.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

lulus=0; gagal=0
cek() {
  if [ "$2" = "1" ]; then lulus=$((lulus+1)); echo "  ✔ $1"
  else gagal=$((gagal+1)); echo "  ✘ $1 ${3:-}"; fi
}

mkdir -p "$T/bin"
ENVAPP="$T/env.txt"

cat > "$T/bin/docker" <<'SH'
#!/usr/bin/env bash
if [ "$1" = "ps" ]; then
  # UJI_MODE: tanpa | mati | hidup
  case "${UJI_MODE:-tanpa}" in
    mati)
      printf 'supabase-db\tsupabase/postgres:15.8\texited\n'
      printf 'supabase-envoy\tsupabase/envoy:1.2\texited\n'
      ;;
    hidup)
      printf 'supabase-db\tsupabase/postgres:15.8\trunning\n'
      ;;
  esac
  printf 'pri-aplikasi\tpri-aplikasi:terbaru\trunning\n'
  printf 'pri-redis\tredis:7-alpine\trunning\n'
  printf 'pri-jadwal\tpri-jadwal:terbaru\trunning\n'
  exit 0
fi
if [ "$1" = "volume" ]; then
  [ "${UJI_VOLUME:-1}" = "1" ] && { echo "supabase_db-data"; echo "pri_redis-data"; }
  exit 0
fi
exit 0
SH
cat > "$T/bin/curl" <<'SH'
#!/usr/bin/env bash
case "$*" in
  *rest/v1*) echo "${UJI_HTTP:-401}"; exit 0 ;;
  *api/sehat*) [ "${UJI_SEHAT:-1}" = "1" ] && echo '{"sehat":true,"database":"ok"}'; exit 0 ;;
esac
exit 1
SH
chmod +x "$T/bin"/*

jalankan() {
  PATH="$T/bin:$PATH" PRI_UJI=1 PRI_ENV_APP="$ENVAPP" bash "$SKRIP" 2>&1
}

printf 'SUPABASE_URL=https://pichnkyjepsirpclofhs.supabase.co\nDATABASE_URL=file:./dev.db\n' > "$ENVAPP"

echo
echo "[A] Supabase ADA tapi MATI — kesalahan paling mahal kalau salah baca"
OUT="$(UJI_MODE=mati jalankan)"
cek "container mati tetap terlihat" "$(echo "$OUT" | grep -q 'supabase-db' && echo 1 || echo 0)" "$(echo "$OUT" | head -8)"
cek "dinyatakan ADA tapi MATI" "$(echo "$OUT" | grep -q 'ADA tapi MATI' && echo 1 || echo 0)"
cek "MELARANG buru-buru pindah ke cloud" "$(echo "$OUT" | grep -q 'JANGAN buru-buru pindah' && echo 1 || echo 0)"
cek "menyarankan menyalakan dulu" "$(echo "$OUT" | grep -q 'Nyalakan dulu' && echo 1 || echo 0)" "$(echo "$OUT" | tail -5)"
cek "TIDAK menyuruh menambah MIGRASI_DB_URL" "$(echo "$OUT" | grep -q 'Tambahkan satu baris' && echo 0 || echo 1)"

echo
echo "[B] Tidak ada Supabase sama sekali"
OUT="$(UJI_MODE=tanpa jalankan)"
cek "dinyatakan tidak ada, hidup maupun mati" "$(echo "$OUT" | grep -q 'hidup maupun mati' && echo 1 || echo 0)"
cek "dibedakan dari 'sedang mati'" "$(echo "$OUT" | grep -q 'bukan sekadar sedang mati' && echo 1 || echo 0)"
cek "mengarahkan ke MIGRASI_DB_URL" "$(echo "$OUT" | grep -q 'MIGRASI_DB_URL' && echo 1 || echo 0)" "$(echo "$OUT" | tail -6)"
cek "mengingatkan port 5432" "$(echo "$OUT" | grep -q '5432' && echo 1 || echo 0)"

echo
echo "[C] Supabase HIDUP — berarti pri-deploy yang salah mengenali"
OUT="$(UJI_MODE=hidup jalankan)"
cek "dinyatakan masih hidup" "$(echo "$OUT" | grep -q 'MASIH HIDUP' && echo 1 || echo 0)" "$(echo "$OUT" | tail -6)"
cek "melarang pindah ke cloud" "$(echo "$OUT" | grep -q 'JANGAN pindah ke cloud' && echo 1 || echo 0)"

echo
echo "[D] Sisa data dilaporkan walau containernya tidak ada"
OUT="$(UJI_MODE=tanpa UJI_VOLUME=1 jalankan)"
cek "volume supabase disebut" "$(echo "$OUT" | grep -q 'supabase_db-data' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/2\/5/,/3\/5/p')"
OUT="$(UJI_MODE=tanpa UJI_VOLUME=0 jalankan)"
cek "kalau tidak ada volume, dikatakan terang-terangan" "$(echo "$OUT" | grep -q 'tidak ada volume docker' && echo 1 || echo 0)"

echo
echo "[E] Ke mana aplikasi menyambung"
OUT="$(UJI_MODE=tanpa jalankan)"
cek "alamat Supabase disebut" "$(echo "$OUT" | grep -q 'pichnkyjepsirpclofhs.supabase.co' && echo 1 || echo 0)"
cek "dikenali sebagai cloud" "$(echo "$OUT" | grep -q 'Supabase CLOUD' && echo 1 || echo 0)"
cek "nama variabel disebut TANPA nilainya" "$(echo "$OUT" | grep -q 'DATABASE_URL' && echo 1 || echo 0)"
cek "nilai file:./dev.db TIDAK dicetak" "$(echo "$OUT" | grep -q 'dev.db' && echo 0 || echo 1)" "NILAI ENV BOCOR"
cek "401 dijelaskan sebagai wajar" "$(echo "$OUT" | grep -q '401/400 itu WAJAR' && echo 1 || echo 0)"

echo
echo "[F] Alamat tidak menjawab sama sekali"
OUT="$(UJI_MODE=tanpa UJI_HTTP=000 jalankan)"
cek "diperingatkan tidak menjawab" "$(echo "$OUT" | grep -q 'TIDAK MENJAWAB' && echo 1 || echo 0)" "$(echo "$OUT" | sed -n '/4\/5/,/5\/5/p')"

echo
echo "HASIL: $lulus lulus, $gagal gagal"
[ "$gagal" -eq 0 ] || exit 1
