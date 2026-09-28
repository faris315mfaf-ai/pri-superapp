#!/bin/sh
# Memanggil satu tugas berkala di aplikasi, lalu mencatat hasilnya.
# Dipanggil oleh penjadwal; jangan dijalankan sendiri.
set -u
TUGAS="$1"
# Berkas jawaban SENDIRI per panggilan (28 Sep 2026). Dulu semua tugas
# menulis ke /tmp/jawaban.txt yang sama; tugas yang berjalan bersamaan
# saling menimpa, sehingga log "metrik-video GAGAL" ternyata berisi
# jawaban sinkron-komen. Diagnosa jadi menyesatkan.
JAWABAN=$(mktemp "/tmp/jawaban-${TUGAS}.XXXXXX")
trap 'rm -f "$JAWABAN"' EXIT
MULAI=$(date +%s)
# curl sudah mencetak 000 sendiri saat gagal tersambung/kehabisan waktu;
# "|| true" menjaga agar kodenya tidak menjadi "000000".
KODE=$(curl -s -o "$JAWABAN" -w '%{http_code}' \
  --max-time 280 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "User-Agent: pri-jadwal" \
  "${APP_URL}/api/cron/${TUGAS}" 2>/dev/null || true)
[ -n "$KODE" ] || KODE="000"
DETIK=$(( $(date +%s) - MULAI ))
if [ "$KODE" = "200" ]; then
  # Tugas yang sengaja DITUNDA (database macet) tetap tercatat, supaya
  # "OK" tidak menyembunyikan bahwa pekerjaannya tidak berjalan.
  if grep -q '"ditunda":true' "$JAWABAN" 2>/dev/null; then
    echo "$(date '+%d/%m %H:%M:%S') $TUGAS DITUNDA ${DETIK}s (database macet)"
  else
    echo "$(date '+%d/%m %H:%M:%S') $TUGAS OK ${DETIK}s"
  fi
else
  # Sengaja dicetak lengkap: kalau tugas berkala gagal, tidak ada
  # pengguna yang melapor — catatan inilah satu-satunya jejaknya.
  echo "$(date '+%d/%m %H:%M:%S') $TUGAS GAGAL kode=$KODE ${DETIK}s $(head -c 200 "$JAWABAN" 2>/dev/null)"
fi
