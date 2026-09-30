#!/usr/bin/env bash
# =====================================================================
# Cadangan harian template Auto Edit (berkas desain yang dibuat master).
# Hasil render & unggahan TIDAK dicadangkan: umurnya memang pendek.
# Salinan harian memakai hardlink ke salinan sebelumnya, jadi tiap hari
# hanya berkas yang berubah yang memakan ruang. Disimpan 14 hari.
# Jadwal: /etc/cron.d/pri-autoedit (dipasang 12-perbarui.sh).
# =====================================================================
set -euo pipefail
SUMBER=/srv/godam/media/templates
TUJUAN=/opt/pri-cadangan/autoedit-template
IMG=/srv/godam/media.img
CAP=$(date +%Y%m%d-%H%M)

if mountpoint -q /srv/godam/media && [ -d "$SUMBER" ]; then
  mkdir -p "$TUJUAN"
  chmod 700 /opt/pri-cadangan "$TUJUAN"
  TERAKHIR=$(find "$TUJUAN" -mindepth 1 -maxdepth 1 -type d ! -name '*.sementara' | sort | tail -1)
  rsync -a --delete ${TERAKHIR:+--link-dest="$TERAKHIR"} "$SUMBER/" "$TUJUAN/$CAP.sementara/"
  mv "$TUJUAN/$CAP.sementara" "$TUJUAN/$CAP"
  touch "$TUJUAN/$CAP"
  find "$TUJUAN" -mindepth 1 -maxdepth 1 -type d -mtime +14 ! -name "$CAP" -exec rm -rf {} +
  echo "[$(date '+%F %T')] cadangan template $CAP: $(du -sh "$TUJUAN" | cut -f1)"
fi

# fstrim mingguan melubangi berkas image disk media; pesan ulang ruangnya
# supaya 60 GB-nya tetap benar-benar tersedia saat disk utama penuh.
[ -f "$IMG" ] && fallocate -l "$(stat -c%s "$IMG")" "$IMG"
exit 0
