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

DEPLOY_USER="${SUDO_USER:-${DEPLOY_USER:-adminportalpri}}"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  DEPLOY_USER=root
fi

mkdir -p "$DIR"
chmod 700 "$DIR"
if [ ! -f "$PRIV" ]; then
  ssh-keygen -t ed25519 -f "$PRIV" -N "" -C "pri-superapp-vps-baca"
fi
chmod 600 "$PRIV"
chmod 644 "$PUB"
# adminportalpri (Actions / pri-deploy-actions) harus bisa baca kunci ini
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DIR"
chmod 700 "$DIR"
chmod 600 "$PRIV"

HOME_USER="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
mkdir -p "$HOME_USER/.ssh" /root/.ssh
chmod 700 "$HOME_USER/.ssh" /root/.ssh
ssh-keyscan -t ed25519,rsa github.com >> "$HOME_USER/.ssh/known_hosts" 2>/dev/null || true
ssh-keyscan -t ed25519,rsa github.com >> /root/.ssh/known_hosts 2>/dev/null || true
# Jangan paksa IdentityFile di config root/user jika path salah — GIT_SSH_COMMAND
# di 32-deploy-dari-actions.sh yang menunjuk kunci. Kosongkan IdentityFile rusak.
for CFG in /root/.ssh/config "$HOME_USER/.ssh/config"; do
  if [ -f "$CFG" ] && grep -q '/kunci/github-baca' "$CFG" 2>/dev/null; then
    printf '%s\n' "Host github.com" "  HostName github.com" "  User git" > "$CFG"
    chmod 600 "$CFG"
  fi
done
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$HOME_USER/.ssh"

if [ -d "$SUMBER/.git" ]; then
  git -C "$SUMBER" remote set-url origin "$REPO_SSH"
fi

echo
echo "=== Kunci publik (salin ke GitHub → Deploy keys, read-only) ==="
cat "$PUB"
echo
echo "Setelah kunci dipasang di GitHub, uji:"
echo "  sudo -u $DEPLOY_USER GIT_SSH_COMMAND=\"ssh -i $PRIV -o IdentitiesOnly=yes\" git -C $SUMBER fetch origin main"
echo "  sudo pri-perbarui --tanpa-tarik"
