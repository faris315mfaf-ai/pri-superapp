#!/usr/bin/env bash
# =====================================================================
# LANGKAH 29 — APAKAH ADA LUBANG DATA 12-18 SEPTEMBER? (19 Sep 2026)
#
# Semua kesimpulan sejauh ini bertumpu pada satu kalimat: "data di
# Supabase tidak update lagi sejak migrasi 12 September". Itu masuk akal
# dan cocok dengan bukti lain, tapi BELUM PERNAH DIUJI LANGSUNG ke
# databasenya. Sebelum menyatakan data seminggu hilang — dan sebelum
# menempuh pemulihan snapshot yang berisiko — pernyataan itu harus
# dibuktikan atau dibantah.
#
# CARANYA: hitung jumlah baris PER HARI pada beberapa tabel yang setiap
# hari terisi. Kalau memang ada lubang, ia akan terlihat sebagai deretan
# angka NOL di antara tanggal yang ramai. Kalau ternyata isinya utuh,
# berarti tidak ada yang hilang dan rencana pemulihan bisa dibatalkan.
#
# Menghitung dipakai, bukan sekadar "baris terbaru": baris terbaru saja
# menyesatkan. Setelah aplikasi kembali ke Cloud, baris baru terus masuk
# — jadi "terbaru = hari ini" bisa benar SEKALIGUS menyembunyikan lubang
# seminggu di tengahnya.
#
# Skrip ini MEMBACA SAJA (hanya permintaan hitung, HEAD-only). Tidak
# menulis, tidak menghapus. KUNCI TIDAK PERNAH DICETAK, dan ISI BARIS
# tidak pernah diambil — yang diminta hanya jumlahnya.
#
# CARA PAKAI (root, di VPS):
#   bash /opt/pri-superapp/skrip/29-isi-database-per-hari.sh
#   bash ... 29-isi-database-per-hari.sh 2026-09-08 14   # mulai, jumlah hari
# =====================================================================
set -uo pipefail

[ "$(id -u)" -eq 0 ] || [ -n "${PRI_UJI:-}" ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

ENV_APP="${PRI_ENV_APP:-/opt/pri-superapp/aplikasi/env.txt}"
MULAI="${1:-2026-09-08}"
HARI="${2:-14}"
MIGRASI="${PRI_TGL_MIGRASI:-2026-09-12}"

nilai_env() { grep -m1 "^$1=" "$ENV_APP" 2>/dev/null | cut -d= -f2- | tr -d '\r"' || true; }

SB="$(nilai_env SUPABASE_URL)"
KEY="$(nilai_env SUPABASE_SECRET_KEY)"
[ -z "$KEY" ] && KEY="$(nilai_env SUPABASE_SERVICE_ROLE_KEY)"
[ -z "$KEY" ] && KEY="$(nilai_env SUPABASE_KEY)"

echo "ISI DATABASE PER HARI — mencari lubang data"
echo "Server : $(hostname) — $(date -Is)"
echo "Catatan: hanya MENGHITUNG baris. Isi baris tidak pernah diambil."
echo "------------------------------------------------------------"

if [ -z "$SB" ] || [ -z "$KEY" ]; then
  echo "Alamat atau kunci Supabase tidak terbaca dari $ENV_APP." >&2
  exit 1
fi
echo "Database : $SB"
echo "Rentang  : $MULAI, $HARI hari  (migrasi: $MIGRASI)"
echo

# tabel:kolom_waktu — dipilih yang terisi tiap hari saat aplikasi dipakai.
TABEL="tvrku_post:dibuat_pada kerja_item:tanggal_wib absensi:waktu tvr_siaran:dibuat_pada"

# Jumlah baris pada satu hari. PostgREST mengembalikannya di header
# Content-Range (mis. "0-0/57") bila diminta count=exact — jadi tidak
# ada satu pun isi baris yang ikut terkirim.
hitung() { # $1=tabel $2=kolom $3=tanggal
  local CR
  CR="$(curl -s -m 30 -D - -o /dev/null \
        -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
        -H "Prefer: count=exact" -H "Range: 0-0" \
        "${SB%/}/rest/v1/$1?select=id&$2=gte.$3&$2=lt.$(date -d "$3 +1 day" +%F)" 2>/dev/null \
        | tr -d '\r' | sed -n 's/^[Cc]ontent-[Rr]ange:[[:space:]]*//p' | head -1)"
  case "$CR" in
    */*) printf '%s' "${CR##*/}" ;;
    *)   printf '?' ;;
  esac
}

ADA_LUBANG=0
for TK in $TABEL; do
  T="${TK%%:*}"; K="${TK##*:}"
  # Tabel yang tidak ada di database ini dilewati, bukan bikin gagal.
  KODE="$(curl -s -o /dev/null -m 20 -w '%{http_code}' \
          -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
          "${SB%/}/rest/v1/$T?select=id&limit=1" 2>/dev/null || echo 000)"
  if [ "$KODE" != "200" ]; then
    printf "%-14s  (dilewati — HTTP %s)\n" "$T" "$KODE"
    continue
  fi

  printf "%-14s " "$T"
  BARIS=""
  NOL_SETELAH_MIGRASI=0
  ADA_SEBELUM=0
  for i in $(seq 0 $((HARI - 1))); do
    TGL="$(date -d "$MULAI +$i day" +%F 2>/dev/null)" || break
    # Jangan menghitung masa depan.
    [ "$TGL" \> "$(date +%F)" ] && break
    N="$(hitung "$T" "$K" "$TGL")"
    BARIS="$BARIS $(printf '%s:%s' "${TGL#2026-}" "$N")"
    if [ "$TGL" \< "$MIGRASI" ] && [ "$N" != "0" ] && [ "$N" != "?" ]; then ADA_SEBELUM=1; fi
    if [ "$TGL" \> "$MIGRASI" ] && [ "$N" = "0" ]; then NOL_SETELAH_MIGRASI=$((NOL_SETELAH_MIGRASI + 1)); fi
  done
  echo
  printf '%s\n' "$BARIS" | tr ' ' '\n' | grep -v '^$' | sed 's/^/     /'
  if [ "$ADA_SEBELUM" = "1" ] && [ "$NOL_SETELAH_MIGRASI" -ge 3 ]; then
    echo "     ^^ ada $NOL_SETELAH_MIGRASI hari KOSONG setelah tanggal migrasi, padahal sebelumnya terisi"
    ADA_LUBANG=1
  fi
  echo
done

echo "------------------------------------------------------------"
echo "KESIMPULAN"
if [ "$ADA_LUBANG" = "1" ]; then
  echo "  TERBUKTI ADA LUBANG. Hari-hari setelah $MIGRASI kosong padahal"
  echo "  sebelumnya terisi — data periode itu memang tidak ada di sini."
  echo "  Pemulihan dari snapshot Hostinger jadi masuk akal untuk ditempuh."
else
  echo "  TIDAK terlihat lubang pada tabel yang diperiksa."
  echo "  Artinya data periode 12-18 Sep kemungkinan ADA di database ini,"
  echo "  dan rencana pemulihan snapshot TIDAK PERLU dilanjutkan."
  echo "  Periksa sekali lagi angkanya di atas sebelum memutuskan."
fi
echo
echo "Angka '?' berarti jumlahnya tidak terbaca (biasanya kehabisan waktu"
echo "karena database sedang lambat) — ulangi saja, bukan berarti nol."
