#!/usr/bin/env bash
# =====================================================================
# LANGKAH 27 — APAKAH DATA 12-19 SEPTEMBER MASIH BISA DISELAMATKAN?
# (19 Sep 2026)
#
# DUDUK PERKARANYA
# 12 Sep data dipindah dari Supabase Cloud ke Supabase di VPS, dan
# migrasi itu terbukti berhasil. Sejak itu SEMUA tulisan baru masuk ke
# VPS, dan proyek Cloud berhenti diperbarui.
# Lalu entah kapan aplikasi dikembalikan ke Cloud — sekarang env-nya
# menunjuk ke sana. Sementara Supabase di VPS sudah tidak ada lagi:
# tidak ada containernya, tidak ada volumenya.
#
# Artinya data yang lahir antara 12 Sep dan saat pengembalian itu tidak
# ada di Cloud. Pertanyaannya cuma satu: masih tersimpan di mana pun?
#
# HARAPAN TERBESAR ADA DI SINI. `07-cadangan-harian.sh` menyimpan dump
# database + storage ke /opt/pri-superapp/cadangan dan MENAHANNYA 14
# HARI. Dari 12 Sep ke hari ini baru 7 hari — jadi kalau cadangan itu
# memang berjalan, isinya masih lengkap. (Yang tertua baru akan terhapus
# sendiri sekitar 26 Sep, jadi ada waktu, tapi jangan ditunda.)
#
# Skrip ini MEMBACA SAJA. Tidak memulihkan, tidak menghapus, tidak
# menimpa apa pun. Memulihkan adalah keputusan tersendiri dan harus
# dilakukan sadar, bukan sebagai efek samping pemeriksaan.
#
# CARA PAKAI (root, di VPS):
#   bash /opt/pri-superapp/skrip/27-cari-cadangan.sh
# =====================================================================
set -uo pipefail

[ "$(id -u)" -eq 0 ] || [ -n "${PRI_UJI:-}" ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

# Jalur lama DAN baru dua-duanya diperiksa: folder VPS pernah berganti
# nama dari /opt/pri ke /opt/pri-superapp, dan cadangan lama bisa saja
# tertinggal di jalur yang lama.
DIRS="${PRI_DIR_CADANGAN:-/opt/pri-superapp/cadangan /opt/pri/cadangan /opt/cadangan /var/backups/pri}"
MIGRASI="${PRI_TGL_MIGRASI:-2026-09-12}"
TEMUAN=()
catat() { TEMUAN+=("$1"); }
garis() { printf '%s\n' "------------------------------------------------------------"; }

echo "MENCARI CADANGAN DATA VPS (12 Sep - sekarang)"
echo "Server : $(hostname) — $(date -Is)"
echo "Catatan: skrip ini TIDAK memulihkan dan TIDAK menghapus apa pun."
garis

# ---------------------------------------------------------------------
echo "== 1/4 Folder cadangan =="
KETEMU=""
for D in $DIRS; do
  if [ -d "$D" ]; then
    JML="$(find "$D" -maxdepth 1 -type f 2>/dev/null | wc -l)"
    echo "  ADA : $D  ($JML berkas, $(du -sh "$D" 2>/dev/null | cut -f1))"
    [ "$JML" -gt 0 ] && KETEMU="$KETEMU $D"
  else
    echo "  -   : $D (tidak ada)"
  fi
done
if [ -z "$KETEMU" ]; then
  catat "TIDAK ADA satu pun folder cadangan berisi berkas. Kemungkinan skrip cadangan harian belum pernah dipasang."
fi
garis

# ---------------------------------------------------------------------
echo "== 2/4 Isi cadangan: tanggal & ukuran =="
ADA_DB=0
for D in $KETEMU; do
  echo "  di $D:"
  # Diurutkan dari yang TERBARU supaya yang paling relevan terlihat lebih dulu.
  find "$D" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'db-*.sql*' -o -name 'storage-*.tar.gz' \) \
       -printf '%T@\t%TY-%Tm-%Td %TH:%TM\t%s\t%f\n' 2>/dev/null \
    | sort -rn | head -20 \
    | awk -F'\t' '{
        mb = $3/1048576;
        printf "      %s  %8.1f MB  %s\n", $2, mb, $4;
      }'
  N="$(find "$D" -maxdepth 1 -type f -name 'db-*' 2>/dev/null | wc -l)"
  [ "$N" -gt 0 ] && ADA_DB=1
done
[ "$ADA_DB" = "0" ] && [ -n "$KETEMU" ] && catat "Foldernya ada, tapi TIDAK ADA berkas dump database di dalamnya."
garis

# ---------------------------------------------------------------------
echo "== 3/4 Apakah rentang 12 Sep - sekarang tertutup =="
if [ "$ADA_DB" = "1" ]; then
  TERBARU=""; TERTUA=""
  for D in $KETEMU; do
    B="$(find "$D" -maxdepth 1 -type f -name 'db-*' -printf '%TY-%Tm-%Td\n' 2>/dev/null | sort)"
    [ -n "$B" ] || continue
    T1="$(printf '%s\n' "$B" | head -1)"; T2="$(printf '%s\n' "$B" | tail -1)"
    [ -z "$TERTUA" ] && TERTUA="$T1"
    [ "$T1" \< "$TERTUA" ] && TERTUA="$T1"
    [ "$T2" \> "$TERBARU" ] && TERBARU="$T2"
  done
  echo "  cadangan tertua  : ${TERTUA:-?}"
  echo "  cadangan terbaru : ${TERBARU:-?}"
  echo "  tanggal migrasi  : $MIGRASI"
  if [ -n "$TERBARU" ] && [ "$TERBARU" \> "$MIGRASI" ]; then
    catat "ADA cadangan yang dibuat SETELAH migrasi ($TERBARU) — data pasca-12 Sep kemungkinan besar MASIH BISA diselamatkan."
  elif [ -n "$TERBARU" ]; then
    catat "Cadangan terbaru ($TERBARU) TIDAK lebih baru dari tanggal migrasi — kemungkinan cadangan berhenti saat Supabase VPS dimatikan."
  fi
  echo
  echo "  tanggal yang tercakup:"
  for D in $KETEMU; do
    find "$D" -maxdepth 1 -type f -name 'db-*' -printf '%TY-%Tm-%Td\n' 2>/dev/null
  done | sort -u | sed 's/^/      /'
else
  echo "  tidak bisa dinilai — tidak ada dump database."
fi
garis

# ---------------------------------------------------------------------
echo "== 4/4 Apakah pencadangan masih dijadwalkan =="
CRON="$( { crontab -l 2>/dev/null; cat /etc/cron.d/* 2>/dev/null; } | grep -i 'cadangan' | head -3 || true)"
if [ -n "$CRON" ]; then
  echo "  terjadwal:"; printf '%s\n' "$CRON" | sed 's/^/      /'
else
  echo "  tidak ada jadwal pencadangan yang terpasang."
  catat "Pencadangan harian TIDAK terjadwal lagi — apa pun yang ada sekarang tidak akan bertambah."
fi
garis

echo "== KESIMPULAN =="
if [ ${#TEMUAN[@]} -eq 0 ]; then
  echo "  Tidak ada yang menonjol dari yang terbaca."
else
  for t in "${TEMUAN[@]}"; do echo "  • $t"; done
fi
echo
echo "PENTING SOAL WAKTU"
echo "  Cadangan disimpan 14 HARI lalu terhapus sendiri. Yang dibuat"
echo "  12 Sep akan hilang sekitar 26 Sep. Kalau ada yang berharga di"
echo "  sana, SALIN KELUAR dulu sekarang — menyalin tidak mengubah"
echo "  apa pun dan selalu bisa dibatalkan, tidak seperti menunggu."
echo
echo "  Contoh menyalin ke folder aman (jalankan sendiri bila perlu):"
echo "    mkdir -p /root/selamatkan && cp -a /opt/pri-superapp/cadangan/* /root/selamatkan/"
echo
echo "Kirimkan seluruh keluaran ini sebelum memulihkan apa pun."
echo "Memulihkan ke database yang sedang dipakai bisa MENIMPA data baru,"
echo "jadi urutannya harus ditentukan dulu, bukan dikerjakan spontan."
