#!/usr/bin/env bash
# =====================================================================
# Uji LOGIKA vps/22-deploy-penuh.sh tanpa VPS, tanpa Docker, tanpa
# database sungguhan.
#
# Yang diuji adalah bagian yang paling mahal kalau salah: keputusan
# BERKAS MANA yang dijalankan. Salah di sini berarti migrasi dilewati
# diam-diam (fitur mati tanpa galat) atau dijalankan berulang-ulang.
#
# Caranya: `docker` dan `git` palsu ditaruh di depan PATH. Yang palsu
# meniru psql secukupnya untuk mengelola buku catatan dalam sebuah
# berkas teks.
# =====================================================================
set -uo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
SKRIP_UJI="$AKAR/vps/22-deploy-penuh.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

lulus=0
gagal=0
cek() {
  if [ "$2" = "1" ]; then lulus=$((lulus+1)); echo "  ✔ $1"
  else gagal=$((gagal+1)); echo "  ✘ $1 ${3:-}"; fi
}

# ---------------------------------------------------------------
# Lingkungan palsu
# ---------------------------------------------------------------
mkdir -p "$T/bin" "$T/sumber/sql" "$T/sumber/.git" "$T/sumber/vps" "$T/skrip"
echo "PG_PASS=rahasia-uji" > "$T/kunci.env"
LEDGER="$T/ledger.txt"
: > "$LEDGER"

# docker palsu — hanya memahami perintah yang dipakai skrip.
cat > "$T/bin/docker" <<'SH'
#!/usr/bin/env bash
LEDGER="${UJI_LEDGER:?}"
if [ "$1" = "ps" ]; then
  [ "${UJI_TANPA_SUPABASE:-0}" = "1" ] || printf 'supabase-db\tsupabase/postgres:15.8\n'
  printf 'pri-aplikasi\tpri-aplikasi:terbaru\n'
  exit 0
fi
if [ "$1" = "run" ]; then set -- exec "$@"; fi
if [ "$1" = "exec" ]; then
  # Cari argumen setelah -c (bila ada). Tanpa -c berarti SQL dari stdin.
  SQL=""; PUNYA_C=0
  while [ $# -gt 0 ]; do
    if [ "$1" = "-c" ]; then PUNYA_C=1; SQL="$2"; break; fi
    shift
  done
  # SQL dari skrip bisa MULTI-BARIS; sed bekerja per baris, jadi
  # diratakan dulu jadi satu baris sebelum dicocokkan.
  SQL="$(printf '%s' "$SQL" | tr '
' ' ' | tr -s ' ')"
  if [ "$PUNYA_C" = "0" ]; then
    ISI="$(cat)"
    # Berkas uji yang sengaja dibuat gagal.
    case "$ISI" in *GAGALKAN_UJI*) echo "ERROR: sengaja gagal untuk pengujian" >&2; exit 1;; esac
    exit 0
  fi
  case "$SQL" in
    *"create table if not exists public._migrasi_sql"*) exit 0 ;;
    *"select count(*) from public._migrasi_sql"*)
      awk 'END{print NR}' "$LEDGER"; exit 0 ;;
    *"select sidik from public._migrasi_sql where berkas"*)
      NAMA="$(printf '%s' "$SQL" | sed "s/.*berkas = '\([^']*\)'.*/\1/")"
      awk -F'|' -v n="$NAMA" '$1==n{print $2; found=1} END{if(!found) exit 0}' "$LEDGER"
      exit 0 ;;
    *"insert into public._migrasi_sql"*)
      NAMA="$(printf '%s' "$SQL" | sed "s/.*values ('\([^']*\)', *'\([^']*\)').*/\1/")"
      SIDIK="$(printf '%s' "$SQL" | sed "s/.*values ('\([^']*\)', *'\([^']*\)').*/\2/")"
      TMP="$(mktemp)"
      awk -F'|' -v n="$NAMA" '$1!=n' "$LEDGER" > "$TMP"
      printf '%s|%s\n' "$NAMA" "$SIDIK" >> "$TMP"
      mv "$TMP" "$LEDGER"
      exit 0 ;;
  esac
  exit 0
fi
exit 0
SH

# git palsu — skrip hanya butuh fetch/pull diam dan rev-parse/log.
cat > "$T/bin/git" <<'SH'
#!/usr/bin/env bash
for a in "$@"; do
  case "$a" in
    rev-parse) echo "abc1234"; exit 0 ;;
    log) echo "abc1234 commit uji"; exit 0 ;;
  esac
done
exit 0
SH
cat > "$T/bin/stat" <<'SH'
#!/usr/bin/env bash
# Kalau UJI_PEMILIK diisi, laporkan pemilik itu; kalau tidak, teruskan
# ke stat asli supaya perilaku normal tetap apa adanya.
if [ -n "${UJI_PEMILIK:-}" ] && [ "$1" = "-c" ] && [ "$2" = "%U" ]; then
  echo "$UJI_PEMILIK"; exit 0
fi
exec /usr/bin/stat "$@"
SH
chmod +x "$T/bin/docker" "$T/bin/git" "$T/bin/stat"

buat_sql() { printf -- "-- uji\nselect %s;\n" "$1" > "$T/sumber/sql/$2"; }
buat_sql 1 "01_awal.sql"
buat_sql 2 "02_kedua.sql"
buat_sql 3 "10_kesepuluh.sql"
buat_sql 4 "09_kesembilan.sql"
printf -- "-- indeks uji\nselect 99;\n" > "$T/sumber/sql/index.sql"
printf -- "-- RLS: JANGAN otomatis\nselect 98;\n" > "$T/sumber/sql/rls.sql"

jalankan() {
  PATH="$T/bin:$PATH" UJI_LEDGER="$LEDGER" PRI_UJI=1 \
    PRI_SUMBER="$T/sumber" PRI_KUNCI="$T/kunci.env" PRI_SKRIP="$T/skrip" \
    bash "$SKRIP_UJI" "$@" 2>&1
}

echo
echo "[A] Percobaan (--coba) tidak boleh mengubah apa pun"
OUT="$(jalankan --coba)"
cek "keluar tanpa galat" "$([ $? -eq 0 ] && echo 1 || echo 0)"
cek "buku catatan tetap kosong" "$([ ! -s "$LEDGER" ] && echo 1 || echo 0)" "$(cat "$LEDGER")"
cek "menyebut 4 berkas akan dijalankan" "$([ "$(echo "$OUT" | grep -c 'akan dijalankan')" = "4" ] && echo 1 || echo 0)" "$(echo "$OUT" | grep -c 'akan dijalankan')"
cek "rls.sql TIDAK ikut" "$(echo "$OUT" | grep -qc 'rls.sql' >/dev/null && echo 0 || echo 1)"
cek "index.sql TIDAK ikut tanpa --dengan-index" "$(echo "$OUT" | grep -q 'index.sql *(' && echo 0 || echo 1)"

echo
echo "[B] Urutan nomor harus benar (9 sebelum 10, bukan urut huruf)"
URUT="$(echo "$OUT" | grep 'akan dijalankan' | sed 's/.*: *//; s/ .*//' | tr '\n' ' ')"
cek "urutannya 01, 02, 09, 10" "$([ "$URUT" = "01_awal.sql 02_kedua.sql 09_kesembilan.sql 10_kesepuluh.sql " ] && echo 1 || echo 0)" "$URUT"

echo
echo "[C] Jalan pertama sungguhan"
OUT="$(jalankan --lewati-aplikasi)"
cek "empat berkas tercatat" "$([ "$(wc -l < "$LEDGER")" = "4" ] && echo 1 || echo 0)" "$(wc -l < "$LEDGER")"
cek "laporannya: 4 dijalankan, 0 dilewati" "$(echo "$OUT" | grep -q '4 dijalankan, 0 dilewati' && echo 1 || echo 0)" "$(echo "$OUT" | grep 'selesai:')"
# Buku catatan kosong berarti SEMUANYA baru. Kalau di sini muncul
# "isinya berubah", artinya pembacaan buku catatan salah membaca
# "tidak ada barisnya" sebagai "ada tapi beda" — dan seluruh 53 berkas
# akan dilaporkan berubah tiap kali, membuat laporannya tidak berguna.
cek "jalan pertama TIDAK melabeli apa pun 'isinya berubah'" "$(echo "$OUT" | grep -q 'isinya berubah' && echo 0 || echo 1)" "$(echo "$OUT" | grep 'isinya berubah')"

echo
echo "[D] Jalan kedua — tidak boleh mengulang apa pun"
OUT="$(jalankan --lewati-aplikasi)"
cek "laporannya: 0 dijalankan, 4 dilewati" "$(echo "$OUT" | grep -q '0 dijalankan, 4 dilewati' && echo 1 || echo 0)" "$(echo "$OUT" | grep 'selesai:')"
cek "buku catatan tetap 4 baris" "$([ "$(wc -l < "$LEDGER")" = "4" ] && echo 1 || echo 0)"

echo
echo "[E] Berkas BARU ditambahkan — hanya itu yang dijalankan"
buat_sql 5 "11_baru.sql"
OUT="$(jalankan --lewati-aplikasi)"
cek "1 dijalankan, 4 dilewati" "$(echo "$OUT" | grep -q '1 dijalankan, 4 dilewati' && echo 1 || echo 0)" "$(echo "$OUT" | grep 'selesai:')"

echo
echo "[F] Isi berkas lama DIUBAH — dijalankan ulang & diberi tahu"
buat_sql 999 "02_kedua.sql"
OUT="$(jalankan --lewati-aplikasi)"
cek "1 dijalankan, 4 dilewati" "$(echo "$OUT" | grep -q '1 dijalankan, 4 dilewati' && echo 1 || echo 0)" "$(echo "$OUT" | grep 'selesai:')"
cek "memberi tahu isinya berubah" "$(echo "$OUT" | grep -q 'isinya berubah' && echo 1 || echo 0)"
cek "buku catatan tetap 5 baris (bukan bertambah dobel)" "$([ "$(wc -l < "$LEDGER")" = "5" ] && echo 1 || echo 0)" "$(wc -l < "$LEDGER")"

echo
echo "[G] Satu berkas GAGAL — berhenti, tidak dicatat, aplikasi tidak disentuh"
printf -- "-- GAGALKAN_UJI\nselect 1/0;\n" > "$T/sumber/sql/12_rusak.sql"
OUT="$(jalankan --lewati-aplikasi)"; KODE=$?
cek "keluar dengan kode galat" "$([ "$KODE" != "0" ] && echo 1 || echo 0)" "kode=$KODE"
cek "berkas rusak TIDAK masuk buku catatan" "$(grep -q '12_rusak' "$LEDGER" && echo 0 || echo 1)"
cek "menjelaskan aplikasi tidak diganti" "$(echo "$OUT" | grep -q 'aplikasi TIDAK diganti' && echo 1 || echo 0)"
rm -f "$T/sumber/sql/12_rusak.sql"

echo
echo "[H] --dengan-index memasukkan index.sql, TETAP tanpa rls.sql"
OUT="$(jalankan --lewati-aplikasi --dengan-index)"
cek "index.sql dijalankan" "$(grep -q '^index.sql|' "$LEDGER" && echo 1 || echo 0)"
cek "rls.sql tetap tidak pernah dijalankan" "$(grep -q '^rls.sql|' "$LEDGER" && echo 0 || echo 1)"

echo
echo "[I] --lewati-sql tidak menyentuh database"
SEBELUM="$(wc -l < "$LEDGER")"
rm -f "$T/sumber/sql/11_baru.sql"
OUT="$(jalankan --lewati-sql --lewati-aplikasi)"
cek "buku catatan tidak berubah" "$([ "$(wc -l < "$LEDGER")" = "$SEBELUM" ] && echo 1 || echo 0)"
cek "menyebut SQL dilewati" "$(echo "$OUT" | grep -q 'SQL DILEWATI' && echo 1 || echo 0)"

echo
echo "[J] Pilihan yang salah ketik ditolak, bukan diabaikan"
OUT="$(jalankan --lewati-sqll 2>&1)"; KODE=$?
cek "keluar dengan kode galat" "$([ "$KODE" != "0" ] && echo 1 || echo 0)" "kode=$KODE"
cek "menyebut pilihannya tidak dikenal" "$(echo "$OUT" | grep -q 'tidak dikenal' && echo 1 || echo 0)"
echo
echo "[K] Folder sumber milik pengguna LAIN — jangan menarik kode sebagai root"
# Ini persis galat yang muncul di server: "detected dubious ownership".
# Menarik kode sebagai root di folder milik orang lain meninggalkan
# berkas milik root dan mematikan deploy otomatis berikutnya.
OUT="$(UJI_PEMILIK=pengguna-deploy jalankan --lewati-aplikasi --coba)"; KODE=$?
cek "tidak berhenti karena kepemilikan" "$([ "$KODE" = "0" ] && echo 1 || echo 0)" "kode=$KODE"
cek "memberi tahu penarikan kode dilewati" "$(echo "$OUT" | grep -q "penarikan kode dilewati" && echo 1 || echo 0)"
cek "menyebut nama pemiliknya" "$(echo "$OUT" | grep -q "pengguna-deploy" && echo 1 || echo 0)"
cek "tetap lanjut ke langkah SQL" "$(echo "$OUT" | grep -q "Buku catatan migrasi" && echo 1 || echo 0)" "$(echo "$OUT" | tail -3)"
buat_sql 7 "13_setelah.sql"
OUT2="$(UJI_PEMILIK=pengguna-deploy jalankan --lewati-aplikasi --coba)"
cek "berkas baru setelah itu tetap terdeteksi" "$(echo "$OUT2" | grep -q "13_setelah.sql" && echo 1 || echo 0)" "$(echo "$OUT2" | tail -4)"
echo
echo "[L] --status hanya melaporkan, tidak boleh mengubah apa pun"
SEBELUM_STATUS="$(cat "$LEDGER")"
buat_sql 8 "14_belum.sql"   # satu berkas sengaja belum pernah dijalankan
OUT="$(jalankan --status)"; KODE=$?
cek "keluar tanpa galat" "$([ "$KODE" = "0" ] && echo 1 || echo 0)" "kode=$KODE"
cek "buku catatan TIDAK berubah" "$([ "$(cat "$LEDGER")" = "$SEBELUM_STATUS" ] && echo 1 || echo 0)"
cek "menyebut yang BELUM dijalankan" "$(echo "$OUT" | grep -q "14_belum.sql" && echo 1 || echo 0)" "$(echo "$OUT" | tail -5)"
cek "menyatakan tidak ada yang diubah" "$(echo "$OUT" | grep -q "Tidak ada yang diubah" && echo 1 || echo 0)"
cek "TIDAK membangun ulang aplikasi" "$(echo "$OUT" | grep -q "Membangun" && echo 0 || echo 1)"
rm -f "$T/sumber/sql/14_belum.sql" "$T/sumber/sql/13_setelah.sql"
OUT="$(jalankan --status)"
cek "kalau semua sudah jalan, dikatakan terang-terangan" "$(echo "$OUT" | grep -q "semuanya sudah dijalankan" && echo 1 || echo 0)" "$(echo "$OUT" | tail -5)"
echo
echo "[M] Database DI LUAR server (tidak ada container Supabase)"
ENVAPP="$T/env-aplikasi.txt"
printf 'SUPABASE_URL=https://abc.supabase.co\nDATABASE_URL=postgresql://postgres:SANDI-RAHASIA@db.abc.supabase.co:5432/postgres\n' > "$ENVAPP"
jalankan_luar() {
  PATH="$T/bin:$PATH" UJI_LEDGER="$LEDGER" PRI_UJI=1 UJI_TANPA_SUPABASE=1 \
    PRI_SUMBER="$T/sumber" PRI_KUNCI="$T/kunci.env" PRI_SKRIP="$T/skrip" PRI_ENV_APP="$ENVAPP" \
    bash "$SKRIP_UJI" "$@" 2>&1
}
OUT="$(jalankan_luar --status)"; KODE=$?
cek "tidak berhenti walau tanpa container Supabase" "$([ "$KODE" = "0" ] && echo 1 || echo 0)" "kode=$KODE"
cek "menyatakan database di luar server" "$(echo "$OUT" | grep -q "DI LUAR server" && echo 1 || echo 0)" "$(echo "$OUT" | head -6)"
cek "menyebut tujuannya" "$(echo "$OUT" | grep -q "db.abc.supabase.co:5432" && echo 1 || echo 0)"
cek "menyebut dari mana alamatnya dibaca" "$(echo "$OUT" | grep -q "env:DATABASE_URL" && echo 1 || echo 0)"
cek "SANDI TIDAK ikut tercetak" "$(echo "$OUT" | grep -q "SANDI-RAHASIA" && echo 0 || echo 1)" "SANDI BOCOR DI LAYAR"

echo
echo "[N] Tanpa container DAN tanpa alamat — berhenti dengan penjelasan berguna"
printf 'SUPABASE_URL=https://abc.supabase.co\n' > "$ENVAPP"
OUT="$(jalankan_luar --status)"; KODE=$?
cek "berhenti dengan kode galat" "$([ "$KODE" != "0" ] && echo 1 || echo 0)" "kode=$KODE"
cek "TIDAK sekadar bilang container tidak ditemukan" "$(echo "$OUT" | grep -q "Container database tidak ditemukan" && echo 0 || echo 1)"
cek "menjelaskan databasenya ada di luar" "$(echo "$OUT" | grep -q "di luar server ini" && echo 1 || echo 0)" "$(echo "$OUT" | tail -5)"
cek "memberi contoh baris yang harus ditambahkan" "$(echo "$OUT" | grep -q "DATABASE_URL=postgresql" && echo 1 || echo 0)"
cek "memperingatkan pooler 6543 tidak untuk skema" "$(echo "$OUT" | grep -q "6543" && echo 1 || echo 0)"




echo
echo "HASIL: $lulus lulus, $gagal gagal"
[ "$gagal" -eq 0 ] || exit 1
