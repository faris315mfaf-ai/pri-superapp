#!/bin/sh
# Menyusun jadwal lalu menyalakan penjadwal. Jadwalnya disamakan dengan
# vercel.json supaya perilaku aplikasi tidak berubah setelah pindah.
set -eu
: "${APP_URL:?APP_URL belum diisi}"
: "${CRON_SECRET:?CRON_SECRET belum diisi — tanpa ini tugas berkala akan ditolak 403}"

mkdir -p /etc/crontabs
cat > /etc/crontabs/root <<'JADWAL'
# menit  jam  tanggal  bulan  hari
*/5  * * * * /panggil.sh sinkron-komen
*/10 * * * * /panggil.sh pantau-server
*/15 * * * * /panggil.sh rekonsiliasi-kpi
# Rekaman angka nasional TV Rakyat (12 Sep 2026). Sekali sehari sudah
# cukup: yang dibutuhkan panel kenaikan adalah SATU titik pembanding
# per hari. Pukul 23.50 WIB = 16.50 UTC — hampir tutup hari, jadi
# rekamannya mewakili hasil hari itu, bukan hasil setengah hari.
50 16 * * * /panggil.sh rekam-metrik
JADWAL

echo "Penjadwal siap. Waktu server: $(date '+%d/%m/%Y %H:%M:%S %Z')"
echo "Sasaran: ${APP_URL}"
sed 's/^/  /' /etc/crontabs/root

# Menunggu aplikasi benar-benar siap sebelum tugas pertama, supaya
# panggilan pertama tidak gagal hanya karena aplikasinya masih memuat.
i=0
while [ "$i" -lt 60 ]; do
  curl -fsS --max-time 5 "${APP_URL}/api/hidup" >/dev/null 2>&1 && break
  i=$((i + 1))
  sleep 5
done
[ "$i" -lt 60 ] && echo "Aplikasi menjawab — jadwal mulai berjalan." \
                || echo "PERINGATAN: aplikasi belum menjawab, jadwal tetap dijalankan."

# -f: tetap di depan (supaya Docker bisa memantau), -l 8: catat semuanya.
exec crond -f -l 8
