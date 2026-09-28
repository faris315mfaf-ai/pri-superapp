#!/bin/sh
# =====================================================================
# PENGUMPUL LOG BEBAN (28 Sep 2026) — pasang sekali di VPS (sebagai root).
#
# Aplikasi mencatat ringkasan beban tiap menit ([supabase/menit]: kueri
# Supabase per rute, orang online, beban per orang) dan penjadwal mencatat
# hasil tiap tugas berkala. Keduanya hanya ada di log kontainer — yang
# TERHAPUS setiap kali aplikasi dirilis ulang (bisa tiap jam). Tanpa
# salinan tetap, data jam sibuk hilang sebelum sempat dibaca.
#
# Skrip ini memasang:
#   /usr/local/bin/pri-kumpul-log   penyalin (hanya MEMBACA log kontainer)
#   /etc/cron.d/pri-kumpul-log      menjalankannya tiap 2 menit
# Hasil: /var/log/pri/supabase-menit-YYYY-MM-DD.log dan
#        /var/log/pri/jadwal-YYYY-MM-DD.log (tanggal UTC), disimpan 14 hari.
#
# Aman diulang (idempoten). Lepas: rm /etc/cron.d/pri-kumpul-log.
# =====================================================================
set -eu

cat > /usr/local/bin/pri-kumpul-log <<'PENYALIN'
#!/bin/sh
# Salin baris log penting dari kontainer ke berkas harian tetap (hanya baca).
# PRI_LOG_DIR & PRI_UJI_MASUKAN (folder berisi <nama>.txt) hanya untuk uji
# (tests/uji-pengumpul-log.sh) — tanpa keduanya, log dibaca dari docker.
set -u
DIR="${PRI_LOG_DIR:-/var/log/pri}"
mkdir -p "$DIR"

# $1 = nama (awalan berkas), $2 = pola grep, $3 = kontainer
salin() {
  nama="$1"; pola="$2"; kontainer="$3"
  status="$DIR/.terakhir-$nama"
  terakhir=$(cat "$status" 2>/dev/null || true)
  if [ -n "${PRI_UJI_MASUKAN:-}" ]; then
    mentah=$(cat "$PRI_UJI_MASUKAN/$nama.txt" 2>/dev/null || true)
  else
    # 6 menit ke belakang: menutup jeda antar-putaran (2 menit) dengan longgar;
    # baris yang sudah tersalin disaring lewat stempel waktunya.
    mentah=$(docker logs -t --since 6m "$kontainer" 2>&1 || true)
  fi
  baru=$(printf '%s\n' "$mentah" | grep -E "$pola" | awk -v t="$terakhir" '$1 > t' || true)
  [ -n "$baru" ] || return 0
  printf '%s\n' "$baru" | awk -v d="$DIR" -v n="$nama" '{ f = d "/" n "-" substr($1, 1, 10) ".log"; print >> f; close(f) }'
  printf '%s\n' "$baru" | tail -1 | cut -d' ' -f1 > "$status"
}

salin supabase-menit '\[supabase/menit\]' pri-aplikasi
# Hasil tugas berkala (panggil.sh): OK / GAGAL / DITUNDA.
salin jadwal '[0-9]{2}/[0-9]{2} [0-9:]{8} [a-z-]+ (OK|GAGAL|DITUNDA)' pri-jadwal

# Simpan 14 hari.
find "$DIR" -maxdepth 1 -name '*.log' -type f -mtime +14 -delete 2>/dev/null || true
PENYALIN
chmod 755 /usr/local/bin/pri-kumpul-log

cat > /etc/cron.d/pri-kumpul-log <<'JADWAL'
# Salin log beban aplikasi ke /var/log/pri tiap 2 menit (vps/33-pasang-pengumpul-log.sh).
*/2 * * * * root /usr/local/bin/pri-kumpul-log >/dev/null 2>&1
JADWAL
chmod 644 /etc/cron.d/pri-kumpul-log

# Jalankan sekali sekarang supaya langsung terlihat hasilnya.
/usr/local/bin/pri-kumpul-log
echo "Terpasang. Berkas:"
ls -la /var/log/pri/
