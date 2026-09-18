#!/usr/bin/env bash
# =====================================================================
# GANTI NAMA FOLDER /opt/pri -> /opt/pri-superapp (sekali)
#
# Server yang sudah jalan memakai /opt/pri. Skrip ini memindahkannya
# tanpa menghapus data. Database dihentikan sebentar, lalu dinyalakan
# lagi dari path baru.
#
# pri-perbarui juga melakukan pemindahan ini sendiri. Skrip ini untuk
# kalau ingin mengganti namanya sekarang, tanpa menunggu deploy.
#
# CARA PAKAI (root, di VPS):
#   bash /opt/pri/sumber/vps/20-ganti-nama-folder.sh
#   # sesudah folder pindah:
#   bash /opt/pri-superapp/sumber/vps/20-ganti-nama-folder.sh
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

BARU=/opt/pri-superapp
LAMA=/opt/pri

if [ -d "$BARU" ]; then
  echo "Sudah memakai $BARU — tidak ada yang dipindahkan."
  exit 0
fi
if [ ! -d "$LAMA" ]; then
  echo "Tidak ada $LAMA maupun $BARU. Pasang dulu dengan vps/01-siapkan-vps.sh." >&2
  exit 1
fi

echo "== Menghentikan aplikasi & database sebentar =="
if [ -f "$LAMA/aplikasi/docker-compose.yml" ]; then
  docker compose -f "$LAMA/aplikasi/docker-compose.yml" stop || true
fi
if [ -f "$LAMA/supabase/docker-compose.yml" ]; then
  docker compose -f "$LAMA/supabase/docker-compose.yml" stop || true
fi

echo "== Memindahkan $LAMA -> $BARU =="
mv "$LAMA" "$BARU"
mkdir -p "$BARU/skrip"
if [ -d /opt/pri-skrip ]; then
  cp -a /opt/pri-skrip/. "$BARU/skrip/" || true
  rm -rf /opt/pri-skrip
  echo "  /opt/pri-skrip disatukan ke $BARU/skrip"
fi
if [ -f /etc/cron.d/pri-cadangan ]; then
  sed -i "s|/opt/pri-skrip|$BARU/skrip|g; s|/opt/pri/|$BARU/|g" /etc/cron.d/pri-cadangan || true
fi

if [ -f "$BARU/supabase/docker-compose.yml" ]; then
  echo "== Menyalakan database dari path baru =="
  docker compose -f "$BARU/supabase/docker-compose.yml" up -d
fi

if [ -x /usr/local/bin/pri-perbarui ] || [ -x "$BARU/skrip/12-perbarui.sh" ]; then
  ln -sf "$BARU/skrip/12-perbarui.sh" /usr/local/bin/pri-perbarui 2>/dev/null || true
  ln -sf "$BARU/skrip/16-jalankan-sql.sh" /usr/local/bin/pri-sql 2>/dev/null || true
fi

echo
echo "SELESAI. Folder sekarang:"
echo "  $BARU/sumber     kode Git"
echo "  $BARU/aplikasi   Docker + env.txt"
echo "  $BARU/skrip      pri-perbarui / pri-sql"
echo "  $BARU/supabase   database"
echo
echo "Nyalakan aplikasi: pri-perbarui --tanpa-tarik"
echo "  atau: docker compose -f $BARU/aplikasi/docker-compose.yml up -d"
