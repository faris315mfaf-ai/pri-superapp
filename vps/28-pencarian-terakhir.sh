#!/usr/bin/env bash
# =====================================================================
# LANGKAH 28 — PENCARIAN TERAKHIR DATA 12-18 SEPTEMBER (19 Sep 2026)
#
# Langkah 27 sudah menjawab: TIDAK ADA cadangan harian, dan skrip
# pencadangan memang belum pernah dipasang. Jadi sebelum menyatakan
# data seminggu itu hilang, semua kemungkinan yang TERSISA di server
# ini diperiksa satu per satu — bukan disimpulkan dari satu pemeriksaan
# yang gagal.
#
# Yang dicari, dari yang paling mungkin ke yang paling tipis:
#   1. Volume docker yatim — `docker volume ls` biasa menyembunyikan
#      volume yang tidak lagi dipakai container mana pun, padahal
#      DATANYA MASIH ADA. Ini harapan paling nyata.
#   2. Folder data PostgreSQL di mana pun di disk. Ditandai berkas
#      `PG_VERSION` — kalau berkas itu ada, di situ ada database.
#   3. Berkas dump/arsip besar yang tercecer di luar folder cadangan.
#   4. Sisa folder pemasangan Supabase beserta pengaturannya.
#   5. Ruang disk: kalau data ~277 MB + storage beberapa GB memang
#      sudah terhapus, ruangnya kembali — dan itu petunjuk sendiri.
#
# YANG TIDAK BISA DIPERIKSA DARI SINI: cadangan/snapshot tingkat VPS
# milik Hostinger. Itu ada di panel Hostinger, bukan di dalam server,
# dan justru itulah harapan terbesar yang tersisa bila pencarian ini
# kosong. Dicetak sebagai pengingat di akhir.
#
# Skrip ini MEMBACA SAJA. Tidak menghapus, memindahkan, atau memulihkan.
#
# CARA PAKAI (root, di VPS):
#   bash /opt/pri-superapp/skrip/28-pencarian-terakhir.sh
# =====================================================================
set -uo pipefail

[ "$(id -u)" -eq 0 ] || [ -n "${PRI_UJI:-}" ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

TEMUAN=()
catat() { TEMUAN+=("$1"); }
garis() { printf '%s\n' "------------------------------------------------------------"; }
AKAR_CARI="${PRI_AKAR_CARI:-/opt /var/lib/docker /root /home /srv /mnt}"

echo "PENCARIAN TERAKHIR — DATA 12-18 SEPTEMBER"
echo "Server : $(hostname) — $(date -Is)"
echo "Catatan: skrip ini TIDAK menghapus, memindahkan, atau memulihkan."
garis

# ---------------------------------------------------------------------
echo "== 1/5 Volume docker YATIM (harapan paling nyata) =="
# `docker volume ls` polos tidak menyoroti yang yatim. Volume yatim =
# tidak dipakai container mana pun, TAPI datanya masih utuh di disk.
YATIM="$(docker volume ls -qf dangling=true 2>/dev/null || true)"
if [ -n "$YATIM" ]; then
  echo "  volume yang tidak dipakai container mana pun:"
  for V in $YATIM; do
    JALUR="$(docker volume inspect "$V" --format '{{.Mountpoint}}' 2>/dev/null || true)"
    UK="$( [ -n "$JALUR" ] && du -sh "$JALUR" 2>/dev/null | cut -f1 || echo '?')"
    ISI_PG=""
    [ -n "$JALUR" ] && [ -f "$JALUR/PG_VERSION" ] && ISI_PG="  <-- BERISI DATABASE POSTGRESQL"
    printf "      %-34s %6s%s\n" "$V" "$UK" "$ISI_PG"
    [ -n "$ISI_PG" ] && catat "ADA volume yatim berisi database PostgreSQL: $V (di $JALUR). INI KEMUNGKINAN DATA YANG DICARI."
  done
else
  echo "  tidak ada volume yatim."
fi
echo "  semua volume yang terdaftar:"
docker volume ls --format '      {{.Name}}' 2>/dev/null | head -15 || true
garis

# ---------------------------------------------------------------------
echo "== 2/5 Folder data PostgreSQL di mana pun =="
# PG_VERSION hanya ada di dalam folder data PostgreSQL. Mencarinya jauh
# lebih tepat daripada menebak nama folder.
echo "  (mencari berkas PG_VERSION — penanda pasti folder database)"
PGDIRS="$(find $AKAR_CARI -xdev -maxdepth 8 -name PG_VERSION -type f 2>/dev/null | head -20 || true)"
if [ -n "$PGDIRS" ]; then
  printf '%s\n' "$PGDIRS" | while read -r f; do
    D="$(dirname "$f")"
    printf "      %-58s %6s  versi %s  diubah %s\n" "$D" \
      "$(du -sh "$D" 2>/dev/null | cut -f1)" \
      "$(cat "$f" 2>/dev/null | tr -d '\n')" \
      "$(date -r "$D" '+%Y-%m-%d' 2>/dev/null)"
  done
  catat "Ditemukan folder data PostgreSQL di disk — periksa tanggal ubahnya; yang berubah setelah 12 Sep berarti berisi data yang dicari."
else
  echo "      tidak ada satu pun."
fi
garis

# ---------------------------------------------------------------------
echo "== 3/5 Berkas dump / arsip besar yang tercecer =="
BESAR="$(find $AKAR_CARI -xdev -maxdepth 6 -type f \
  \( -name '*.dump' -o -name '*.sql' -o -name '*.sql.gz' -o -name '*.tar.gz' -o -name '*.backup' \) \
  -size +5M 2>/dev/null | head -20 || true)"
if [ -n "$BESAR" ]; then
  printf '%s\n' "$BESAR" | while read -r f; do
    printf "      %-58s %6s  %s\n" "$f" "$(du -h "$f" 2>/dev/null | cut -f1)" "$(date -r "$f" '+%Y-%m-%d' 2>/dev/null)"
  done
  catat "Ada berkas dump/arsip besar di luar folder cadangan — periksa tanggalnya."
else
  echo "      tidak ada berkas dump/arsip di atas 5 MB."
fi
garis

# ---------------------------------------------------------------------
echo "== 4/5 Sisa pemasangan Supabase =="
ADA_SISA=0
for D in /opt/pri-superapp/supabase /opt/pri/supabase /opt/supabase /root/supabase; do
  if [ -d "$D" ]; then
    ADA_SISA=1
    echo "      $D  ($(du -sh "$D" 2>/dev/null | cut -f1), diubah $(date -r "$D" '+%Y-%m-%d' 2>/dev/null))"
    [ -f "$D/.env" ] && echo "          berisi .env — pengaturan lamanya masih ada"
    [ -d "$D/volumes/db/data" ] && { echo "          BERISI FOLDER DATA DATABASE"; catat "Folder data Supabase lama masih ada di $D/volumes/db/data."; }
  fi
done
[ "$ADA_SISA" = "0" ] && echo "      tidak ada sisa folder pemasangan Supabase."
echo "  berkas compose Supabase yang tertinggal:"
find /opt -xdev -maxdepth 4 -name 'docker-compose*.y*ml' 2>/dev/null | head -8 | while read -r f; do
  grep -qi 'supabase' "$f" 2>/dev/null && echo "      $f  (menyebut supabase, diubah $(date -r "$f" '+%Y-%m-%d' 2>/dev/null))"
done
garis

# ---------------------------------------------------------------------
echo "== 5/5 Ruang disk =="
df -h / 2>/dev/null | awk 'NR==1{print "      "$0} NR==2{print "      "$0}'
echo "  pemakaian terbesar di /opt dan /var/lib/docker:"
du -sh /opt/* /var/lib/docker 2>/dev/null | sort -h | tail -6 | sed 's/^/      /'
garis

echo "== KESIMPULAN =="
if [ ${#TEMUAN[@]} -eq 0 ]; then
  echo "  Tidak ditemukan sisa data Supabase VPS di server ini."
  echo "  Pencarian sudah mencakup volume yatim, folder data PostgreSQL"
  echo "  di seluruh disk, berkas dump besar, dan sisa pemasangan."
else
  for t in "${TEMUAN[@]}"; do echo "  • $t"; done
fi
echo
echo "HARAPAN YANG TERSISA — TIDAK BISA DIPERIKSA DARI DALAM SERVER"
echo "  Hostinger menyediakan cadangan/snapshot tingkat VPS. Kalau ada"
echo "  snapshot bertanggal ANTARA 12 dan 18 September, seluruh isi disk"
echo "  saat itu bisa dikembalikan — termasuk Supabase beserta datanya."
echo
echo "  Cara melihatnya: panel Hostinger -> VPS -> Backups / Snapshots."
echo
echo "  PENTING: JANGAN memulihkan snapshot menimpa server yang sekarang."
echo "  Itu akan membuang semua perubahan sejak snapshot dibuat, termasuk"
echo "  data yang masuk setelah aplikasi kembali ke Cloud. Yang benar:"
echo "  pulihkan ke server/salinan TERPISAH, ambil datanya dari sana,"
echo "  baru gabungkan."
echo
echo "  Dan mulai sekarang pasang pencadangan harian supaya kejadian ini"
echo "  tidak terulang:  bash /opt/pri-superapp/skrip/07-cadangan-harian.sh"
