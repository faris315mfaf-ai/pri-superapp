#!/usr/bin/env bash
# ============================================================
# Disk media khusus Auto Edit: berkas image ext4 berukuran TETAP, dipasang di
# /srv/godam/media. Template, unggahan, cache unduhan, dan hasil render
# tinggal di sini. Kalau penuh, yang berhenti hanya Auto Edit - disk utama
# (tempat database produksi PRI) tidak ikut terisi.
#
#   bash vps/autoedit/siapkan-disk.sh [UKURAN_GB]   (bawaan 60; dipanggil 12-perbarui.sh)
# Aman diulang: disk yang sudah ada tidak diformat ulang.
# ============================================================
set -euo pipefail
UKURAN_GB="${1:-60}"
AKAR=/srv/godam
IMG="$AKAR/media.img"
MNT="$AKAR/media"
[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root." >&2; exit 1; }
mkdir -p "$AKAR" "$MNT"
chmod 755 "$AKAR"

if [ ! -f "$IMG" ]; then
  sisa_gb=$(df -BG --output=avail "$AKAR" | tail -1 | tr -dc 0-9)
  # Sisakan minimal 50 GB untuk sistem & database produksi.
  if [ "$sisa_gb" -lt $((UKURAN_GB + 50)) ]; then
    echo "Ruang tersisa ${sisa_gb} GB, tidak cukup untuk disk ${UKURAN_GB} GB + cadangan 50 GB." >&2
    exit 1
  fi
  echo "Membuat disk media ${UKURAN_GB} GB di $IMG ..."
  fallocate -l "${UKURAN_GB}G" "$IMG"
  chmod 600 "$IMG"
  # nodiscard: tanpa itu mkfs melubangi lagi ruang yang baru dipesan.
  mkfs.ext4 -q -m 1 -E nodiscard -L autoedit-media "$IMG"
fi

# Pesan ruangnya sungguhan (bukan berkas bolong): kalau disk utama suatu saat
# penuh, disk media tetap punya ruang yang sudah dijanjikan. Isi tidak berubah.
fallocate -l "$(stat -c%s "$IMG")" "$IMG"

# noexec/nosuid/nodev: disk ini hanya menyimpan berkas, tidak pernah menjalankan
# apa pun. nofail: kalau berkas image bermasalah, server tetap menyala.
if ! grep -q "^$IMG " /etc/fstab; then
  cp -a /etc/fstab "/etc/fstab.sebelum-autoedit-$(date +%Y%m%d%H%M%S)"
  echo "$IMG $MNT ext4 loop,nofail,noatime,nodev,nosuid,noexec 0 2" >> /etc/fstab
  systemctl daemon-reload
fi
mountpoint -q "$MNT" || mount "$MNT"

mkdir -p "$MNT"/{templates,jobs,uploads,cache,outro}
# Container berjalan sebagai uid 10001 (lihat autoedit/Dockerfile).
chown 10001:10001 "$MNT" "$MNT"/{templates,jobs,uploads,cache,outro}
chmod 750 "$MNT"
# Folder socket API: dipasang ke container API (menulis) dan aplikasi
# SuperApp (memanggil). Di disk utama, bukan di disk media, supaya aplikasi
# tidak ikut melihat isi disk media.
mkdir -p "$AKAR/sock"
chown 10001:10001 "$AKAR/sock"
chmod 755 "$AKAR/sock"
echo "Disk media siap:"
df -h "$MNT" | tail -1
