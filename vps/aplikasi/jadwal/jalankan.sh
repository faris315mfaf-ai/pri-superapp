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
