#!/bin/sh
# Memanggil satu tugas berkala di aplikasi, lalu mencatat hasilnya.
# Dipanggil oleh penjadwal; jangan dijalankan sendiri.
set -u
TUGAS="$1"
MULAI=$(date +%s)
KODE=$(curl -s -o /tmp/jawaban.txt -w '%{http_code}' \
  --max-time 280 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "User-Agent: pri-jadwal" \
  "${APP_URL}/api/cron/${TUGAS}" 2>/dev/null || echo "000")
DETIK=$(( $(date +%s) - MULAI ))
if [ "$KODE" = "200" ]; then
  echo "$(date '+%d/%m %H:%M:%S') $TUGAS OK ${DETIK}s"
else
  # Sengaja dicetak lengkap: kalau tugas berkala gagal, tidak ada
  # pengguna yang melapor — catatan inilah satu-satunya jejaknya.
  echo "$(date '+%d/%m %H:%M:%S') $TUGAS GAGAL kode=$KODE ${DETIK}s $(head -c 200 /tmp/jawaban.txt 2>/dev/null)"
fi
