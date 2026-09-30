#!/usr/bin/env bash
# Satu image, dua peran: ROLE=api (FastAPI di socket Unix) atau ROLE=worker
# (render Celery).
set -euo pipefail

ROLE="${ROLE:-api}"
LOG_LEVEL="${LOG_LEVEL:-INFO}"
SOCKET="${AUTOEDIT_SOCKET:-/run/autoedit/api.sock}"

case "$ROLE" in
  api)
    # Socket, bukan port: hanya container yang memasang foldernya (aplikasi
    # SuperApp) yang bisa memanggil. Sisa socket dari proses lama dibuang
    # dulu, kalau tidak bind gagal "Address already in use".
    rm -f "$SOCKET"
    # SATU worker uvicorn: penyapu disk dan riwayat outro hidup di memori proses.
    exec uvicorn main:app --uds "$SOCKET" --workers 1 --no-server-header \
      --log-level "$(echo "$LOG_LEVEL" | tr '[:upper:]' '[:lower:]')"
    ;;
  worker)
    # "threads", bukan "prefork": prefork menyalin seluruh proses Python per
    # worker, padahal kerja beratnya ada di ffmpeg yang memang proses terpisah.
    exec celery -A celery_app.celery_app worker --loglevel="$LOG_LEVEL" \
      --pool=threads --concurrency="${CELERY_CONCURRENCY:-1}"
    ;;
  *)
    echo "ROLE tidak dikenal: $ROLE (pakai api atau worker)" >&2
    exit 64
    ;;
esac
