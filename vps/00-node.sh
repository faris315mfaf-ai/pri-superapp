#!/usr/bin/env bash
# =====================================================================
# Pembantu: menjalankan skrip .mjs migrasi di dalam container Node,
# supaya VPS tidak perlu dipasangi Node.js sama sekali.
#
# CARA PAKAI:
#   bash 00-node.sh 04-pindah-storage.mjs
#   bash 00-node.sh 06-uji-migrasi.mjs
#
# CATATAN 11 Sep 2026 — CARA YANG LEBIH MUDAH ADA SEKARANG:
#   bash 10-migrasi.sh
# Satu perintah itu menjalankan langkah 3 sampai 6 sekaligus di dalam
# satu container yang sudah berisi semua alatnya. Berkas ini dibiarkan
# sebagai cara manual, untuk kalau ingin menjalankan satu langkah saja
# tanpa container.
#
# Membaca kunci dari /opt/pri/skrip/env-migrasi.txt (buat dari contoh).
# =====================================================================
set -euo pipefail

SKRIP="${1:?Sebutkan berkas .mjs, contoh: bash 00-node.sh 04-pindah-storage.mjs}"
DIR=/opt/pri/skrip
[ -f "$DIR/$SKRIP" ] || { echo "Tidak ada $DIR/$SKRIP" >&2; exit 1; }
[ -s "$DIR/env-migrasi.txt" ] || { echo "Isi dulu $DIR/env-migrasi.txt (contoh: env-migrasi.contoh.txt)" >&2; exit 1; }

docker run --rm --network host \
  -v "$DIR:/app" -w /app \
  --env-file "$DIR/env-migrasi.txt" \
  node:22-alpine \
  sh -c "npm install --no-audit --no-fund --silent @supabase/supabase-js >/dev/null 2>&1 && node $SKRIP"
