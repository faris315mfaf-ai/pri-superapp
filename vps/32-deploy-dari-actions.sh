#!/usr/bin/env bash
# =====================================================================
# DEPLOY DARI GITHUB ACTIONS (kunci SSH terbatas)
#
# Dipanggil lewat `command=` di authorized_keys untuk kunci
# github-actions-pri-superapp. Klien Actions TIDAK bisa mengganti
# perintah ini — jadi skrip di workflow hanya pemicu SSH; yang benar-
# benar jalan di server adalah skrip ini.
#
# Alur: fetch main → merge ff-only → pri-perbarui --tanpa-tarik.
#
# Kredensial fetch (salah satu):
#   1. /opt/pri-superapp/rahasia/github-fetch.token  (PAT/fine-grained,
#      isi token saja satu baris; mode 600, milik adminportalpri)
#   2. /opt/pri-superapp/kunci-git/github-baca         (deploy key baca
#      yang sudah ditambahkan di GitHub → Deploy keys)
#
# Pemasangan: bash vps/17-pasang-deploy-otomatis.sh
#             + vps/31 (opsional) atau tempel token di rahasia/
# =====================================================================
set -euo pipefail

SUMBER=/opt/pri-superapp/sumber
KEY=/opt/pri-superapp/kunci-git/github-baca
TOKEN_FILE=/opt/pri-superapp/rahasia/github-fetch.token
REPO_HTTPS=https://github.com/faris315mfaf-ai/pri-superapp.git
REPO_SSH=git@github.com:faris315mfaf-ai/pri-superapp.git

if [ ! -d "$SUMBER/.git" ]; then
  echo "Folder sumber belum ada di $SUMBER" >&2
  exit 1
fi

cd "$SUMBER"
LAMA="$(git rev-parse --short HEAD)"

echo "== Actions: mengambil main =="
if [ -f "$TOKEN_FILE" ] && [ -s "$TOKEN_FILE" ]; then
  TOKEN="$(tr -d '\n\r ' < "$TOKEN_FILE")"
  git remote set-url origin "$REPO_HTTPS"
  AUTH="$(printf 'x-access-token:%s' "$TOKEN" | base64 -w0 2>/dev/null || printf 'x-access-token:%s' "$TOKEN" | base64)"
  git -c http.extraHeader="AUTHORIZATION: basic ${AUTH}" fetch --quiet origin main
elif [ -f "$KEY" ]; then
  git remote set-url origin "$REPO_SSH"
  GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
    git fetch --quiet origin main
else
  echo "Tidak ada kredensial fetch." >&2
  echo "  - Tempel PAT baca di $TOKEN_FILE (chmod 600), atau" >&2
  echo "  - Pasang deploy key: bash /opt/pri-superapp/skrip/31-pasang-kunci-git-baca.sh" >&2
  exit 1
fi

BARU="$(git rev-parse --short origin/main)"
if [ "$LAMA" != "$BARU" ]; then
  echo "  $LAMA -> $BARU"
  git --no-pager log --oneline "$LAMA..origin/main" | sed 's/^/    /'
  git merge --ff-only --quiet origin/main
else
  echo "  sudah versi terbaru ($LAMA)"
fi

if [ -x /usr/local/bin/pri-perbarui ]; then
  sudo -n /usr/local/bin/pri-perbarui --tanpa-tarik
elif [ -x /opt/pri-superapp/skrip/12-perbarui.sh ]; then
  sudo -n bash /opt/pri-superapp/skrip/12-perbarui.sh --tanpa-tarik
else
  echo "pri-perbarui belum ada di server." >&2
  exit 1
fi
