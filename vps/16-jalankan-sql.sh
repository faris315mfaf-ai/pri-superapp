#!/usr/bin/env bash
# =====================================================================
# MENJALANKAN SATU BERKAS SQL KE DATABASE (12 Sep 2026)
#
# Kenapa perlu skrip sendiri: perintah psql yang ditulis tangan gampang
# gagal karena hal-hal yang tidak ada hubungannya dengan SQL-nya —
# nama container ditebak salah, sandi database tidak ikut, atau berkasnya
# memang belum sampai ke server karena kode terbaru belum diambil.
# Ketiganya memberi pesan galat yang tidak menunjuk ke sebabnya.
#
# Skrip ini mengurus ketiganya, lalu menjalankan SQL-nya dalam satu
# transaksi: kalau ada satu perintah yang gagal, TIDAK ADA yang berubah.
#
# CARA PAKAI (root, di VPS):
#   pri-sql 46_tvr_nasional.sql        # cukup nama berkasnya
#   pri-sql --tanpa-tarik 46_...sql    # jangan ambil kode terbaru dulu
#   pri-sql /jalur/penuh/berkas.sql
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo $0 $*" >&2; exit 1; }

SUMBER=/opt/pri/sumber
KUNCI=/opt/pri/kunci.env
SKRIP=/opt/pri-skrip
TARIK=1

if [ "${1:-}" = "--tanpa-tarik" ]; then
  TARIK=0
  shift
fi

BERKAS="${1:-}"
if [ -z "$BERKAS" ]; then
  echo "Sebutkan berkas SQL-nya. Contoh:" >&2
  echo "  pri-sql 46_tvr_nasional.sql" >&2
  exit 1
fi

# Pintasan, dipasang saat pertama kali dijalankan.
PINTASAN=/usr/local/bin/pri-sql
if [ "$(readlink -f "$PINTASAN" 2>/dev/null || true)" != "$SKRIP/16-jalankan-sql.sh" ] \
   && [ -f "$SKRIP/16-jalankan-sql.sh" ]; then
  { ln -sf "$SKRIP/16-jalankan-sql.sh" "$PINTASAN" 2>/dev/null \
    && echo "  perintah pendek dipasang: pri-sql"; } || true
fi

# --- 1. Kode terbaru ---------------------------------------------------
# Berkas SQL baru hanya sampai ke server lewat git. Tanpa langkah ini,
# galat yang muncul adalah "No such file or directory" — yang terbaca
# seperti kesalahan mengetik, padahal berkasnya memang belum ada.
if [ "$TARIK" = "1" ] && [ -d "$SUMBER/.git" ]; then
  echo "== Mengambil kode terbaru =="
  git -C "$SUMBER" fetch --quiet origin main || true
  git -C "$SUMBER" pull --quiet --ff-only origin main || true
  echo "  versi: $(git -C "$SUMBER" log --oneline -1)"
fi

# --- 2. Menemukan berkasnya -------------------------------------------
if [ -f "$BERKAS" ]; then
  JALUR="$BERKAS"
elif [ -f "$SUMBER/sql/$BERKAS" ]; then
  JALUR="$SUMBER/sql/$BERKAS"
elif [ -f "$SUMBER/$BERKAS" ]; then
  JALUR="$SUMBER/$BERKAS"
else
  echo "Berkas SQL tidak ditemukan: $BERKAS" >&2
  echo "Yang tersedia di $SUMBER/sql:" >&2
  ls -1 "$SUMBER/sql" 2>/dev/null | sed 's/^/  /' >&2 || echo "  (folder sql tidak ada)" >&2
  exit 1
fi
echo "== Berkas: $JALUR =="

# --- 3. Menemukan container database ----------------------------------
# Dicari lewat NAMA IMAGE, bukan nama container: namanya berbeda-beda
# tergantung bagaimana Supabase dipasang, sedangkan imagenya tetap.
#
# awk dengan index(), bukan regex: nama image memuat garis miring, dan
# garis miring di dalam pola regex awk pernah membuat "awk: syntax error".
CT="$(docker ps --format '{{.Names}}\t{{.Image}}' \
      | awk -F'\t' 'index($2, "supabase/postgres") { print $1; exit }')"
if [ -z "$CT" ]; then
  echo "Container database tidak ditemukan (image supabase/postgres)." >&2
  echo "Container yang sedang jalan:" >&2
  docker ps --format '  {{.Names}}  ({{.Image}})' >&2
  exit 1
fi
echo "== Database: container $CT =="

# --- 4. Sandi ----------------------------------------------------------
[ -f "$KUNCI" ] || { echo "Berkas kunci tidak ada: $KUNCI" >&2; exit 1; }
# shellcheck disable=SC1090
. "$KUNCI"
[ -n "${PG_PASS:-}" ] || { echo "PG_PASS tidak ada di $KUNCI" >&2; exit 1; }

# --- 5. Menjalankan ----------------------------------------------------
# --single-transaction: satu perintah gagal -> SEMUA dibatalkan. Skema
# yang setengah jadi jauh lebih sulit diperbaiki daripada yang belum
# dijalankan sama sekali.
echo "== Menjalankan =="
if docker exec -i "$CT" psql \
     -v ON_ERROR_STOP=1 \
     --single-transaction \
     "postgresql://postgres:${PG_PASS}@127.0.0.1:5432/postgres" < "$JALUR"; then
  echo
  echo "SELESAI. Semua perintah berhasil dijalankan."
else
  echo >&2
  echo "GAGAL — tidak ada satu pun perubahan yang tersimpan." >&2
  echo "Kirimkan pesan galat di atas apa adanya." >&2
  exit 1
fi
