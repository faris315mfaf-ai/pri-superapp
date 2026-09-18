#!/usr/bin/env bash
# =====================================================================
# MEMASANG DEPLOY OTOMATIS DARI GITHUB (18 Sep 2026)
#
# Sekali jalan di VPS. Hasilnya: setiap push ke branch main di GitHub
# membuat GitHub Actions masuk lewat SSH dan menjalankan `pri-perbarui`.
#
# Kunci yang dibuat HANYA boleh menjalankan pri-perbarui — tidak bisa
# dipakai untuk membuka shell, menyalin berkas, atau perintah lain.
# Jadi bocornya kunci di GitHub tidak langsung berarti penguasaan server.
#
# CARA PAKAI (root, di VPS):
#   bash /opt/pri/sumber/vps/17-pasang-deploy-otomatis.sh
#   # atau, setelah skrip perawatan disalin:
#   bash /opt/pri-skrip/17-pasang-deploy-otomatis.sh
#
# Lalu tempel tiga nilai yang dicetak ke GitHub
# (Settings → Secrets and variables → Actions).
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

DIR=/opt/pri/kunci-deploy
NAMA=github-actions-pri-superapp
PRIV="$DIR/github-actions"
PUB="$PRIV.pub"
AUTH=/root/.ssh/authorized_keys
PERINTAH=/usr/local/bin/pri-perbarui
CADANGAN=/opt/pri-skrip/12-perbarui.sh

echo "== 1/4 Memeriksa syarat =="
if [ ! -x "$PERINTAH" ] && [ ! -x "$CADANGAN" ]; then
  echo "pri-perbarui belum terpasang." >&2
  echo "Pasang aplikasi dulu (vps/11-pasang-aplikasi.sh), atau jalankan" >&2
  echo "sekali: bash /opt/pri/sumber/vps/12-perbarui.sh --skrip-saja" >&2
  exit 1
fi
command -v ssh-keygen >/dev/null || { echo "ssh-keygen tidak ada." >&2; exit 1; }
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch "$AUTH"
chmod 600 "$AUTH"

echo "== 2/4 Menyiapkan kunci SSH =="
mkdir -p "$DIR"
chmod 700 "$DIR"
if [ ! -f "$PRIV" ]; then
  ssh-keygen -t ed25519 -f "$PRIV" -N "" -C "$NAMA" >/dev/null
  chmod 600 "$PRIV"
  echo "  kunci baru dibuat di $PRIV"
else
  echo "  kunci yang sudah ada dipakai ulang ($PRIV)"
fi
[ -f "$PUB" ] || { echo "Berkas publik hilang: $PUB" >&2; exit 1; }

echo "== 3/4 Memasang kunci di authorized_keys (hanya pri-perbarui) =="
# Kalau pintasan belum ada, kunci menunjuk ke skrip aslinya. Isi
# command= dipasang di sisi SSH, jadi klien GitHub tidak bisa mengganti
# perintah yang dijalankan.
if [ -x "$PERINTAH" ]; then
  JALAN="$PERINTAH"
else
  JALAN="bash $CADANGAN"
fi
PUBLIK="$(tr -d '\n' < "$PUB")"
BARIS="command=\"$JALAN\",no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty $PUBLIK"
TMP="$(mktemp)"
# Baris lama dengan komentar yang sama dibuang, yang lain dibiarkan.
if [ -s "$AUTH" ]; then
  grep -vF "$NAMA" "$AUTH" > "$TMP" || true
else
  : > "$TMP"
fi
printf '%s\n' "$BARIS" >> "$TMP"
mv "$TMP" "$AUTH"
chmod 600 "$AUTH"
echo "  kunci dipasang; SSH dengan kunci ini HANYA menjalankan pri-perbarui"

echo "== 4/4 Nilai untuk GitHub =="
HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
HOST="${HOST:-187.77.113.63}"

echo
echo "=========================================================="
echo "  SALIN TIGA RAHASIA INI KE GITHUB"
echo "  Settings → Secrets and variables → Actions → New secret"
echo "=========================================================="
echo
echo "  Nama : VPS_HOST"
echo "  Isi  : $HOST"
echo
echo "  Nama : VPS_USER"
echo "  Isi  : root"
echo
echo "  Nama : VPS_SSH_KEY"
echo "  Isi  : (seluruh blok di bawah, termasuk baris BEGIN/END)"
echo
cat "$PRIV"
echo
echo "----------------------------------------------------------"
echo "  Jangan kirim kunci privat lewat chat. Setelah tersimpan"
echo "  di GitHub, uji lewat tab Actions → Deploy VPS → Run workflow."
echo "----------------------------------------------------------"
echo
echo "SELESAI. Push berikutnya ke branch main akan men-deploy sendiri."
echo "Migrasi database TETAP manual: pri-sql <berkas.sql> dulu, baru push."
