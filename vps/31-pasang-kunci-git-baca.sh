#!/usr/bin/env bash
# =====================================================================
# KUNCI BACA GITHUB UNTUK VPS (25 Sep 2026)
#
# Masalah: repo privat. `pri-perbarui` / `git pull` lewat HTTPS gagal
# dengan "could not read Username for 'https://github.com'".
#
# Deploy otomatis (GitHub Actions) sudah diperbaiki: token job dipakai
# hanya saat fetch, lalu `pri-perbarui --tanpa-tarik`. Skrip INI untuk
# pull MANUAL di server tanpa bergantung pada Actions.
#
# CARA:
#   1. sudo bash vps/31-pasang-kunci-git-baca.sh
#   2. Salin baris "ssh-ed25519 …" yang dicetak
#   3. GitHub → repo → Settings → Deploy keys → Add deploy key
#      (read-only), tempel kunci publik
#   4. Uji: sudo pri-perbarui
# =====================================================================
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

DIR=/opt/pri-superapp/kunci-git
PRIV="$DIR/github-baca"
PUB="$PRIV.pub"
SUMBER=/opt/pri-superapp/sumber
REPO_SSH=git@github.com:faris315mfaf-ai/pri-superapp.git

mkdir -p "$DIR"
chmod 700 "$DIR"
if [ ! -f "$PRIV" ]; then
  ssh-keygen -t ed25519 -f "$PRIV" -N "" -C "pri-superapp-vps-baca"
fi
chmod 600 "$PRIV"
chmod 644 "$PUB"

mkdir -p /root/.ssh
chmod 700 /root/.ssh
ssh-keyscan -t ed25519,rsa github.com >> /root/.ssh/known_hosts 2>/dev/null || true
cat > /root/.ssh/config <<EOF
Host github.com
  HostName github.com
  User git
  IdentityFile $PRIV
  IdentitiesOnly yes
EOF
chmod 600 /root/.ssh/config

if [ -d "$SUMBER/.git" ]; then
  git -C "$SUMBER" remote set-url origin "$REPO_SSH"
fi

echo
echo "=== Kunci publik (salin ke GitHub → Deploy keys, read-only) ==="
cat "$PUB"
echo
echo "Setelah kunci dipasang di GitHub, uji:"
echo "  git -C $SUMBER fetch origin main && sudo pri-perbarui"
