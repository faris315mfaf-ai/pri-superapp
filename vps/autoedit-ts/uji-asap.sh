#!/usr/bin/env bash
# =====================================================================
# Uji asap mesin Auto Edit TS di VPS SEBELUM dinyalakan untuk pengguna.
#
# Menjalankan API + worker TS sementara yang TERPISAH dari produksi:
# disk media volume sementara, socket sendiri, Redis db 9 (produksi db 0),
# lalu tests/mesin-video/asap-vps.mjs (render video, TVR Saya, outro
# sungguhan). Semua yang dibuat dibuang lagi. Container produksi (Python
# maupun TS) tidak disentuh.
#
#   sudo bash vps/autoedit-ts/uji-asap.sh
# =====================================================================
set -euo pipefail

SUMBER="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$(cd "$SUMBER/../aplikasi" 2>/dev/null && pwd || true)"
IMG="pri-autoedit-ts:terbaru"
NAMA="pri-autoedit-ts-uji"
VOL_MEDIA="${NAMA}-media"
VOL_SOK="${NAMA}-sock"
REDIS_UJI="redis://autoedit-redis:6379/9"

bersih() {
  docker rm -f "${NAMA}-api" "${NAMA}-worker" >/dev/null 2>&1 || true
  docker volume rm -f "$VOL_MEDIA" "$VOL_SOK" >/dev/null 2>&1 || true
  docker exec pri-autoedit-redis redis-cli -n 9 FLUSHDB >/dev/null 2>&1 || true
}
trap bersih EXIT

if [ -n "$APP" ] && [ -f "$APP/docker-compose.yml" ]; then
  echo "== Membangun image mesin TS =="
  (cd "$APP" && docker compose --profile ts build autoedit-ts-api)
fi
docker image inspect "$IMG" >/dev/null

bersih
docker volume create "$VOL_MEDIA" >/dev/null
docker volume create "$VOL_SOK" >/dev/null
# Volume baru milik root; mesin berjalan sebagai uid 10001.
docker run --rm -u 0 -v "$VOL_MEDIA:/m" -v "$VOL_SOK:/s" --entrypoint chown "$IMG" -R 10001:10001 /m /s

UMUM=(--network pri-autoedit -e "REDIS_URL=$REDIS_UJI" -e MEDIA_DIR=/data/media -e TZ=Asia/Jakarta
      -e VIDEO_THREADS=2 -v "$VOL_MEDIA:/data/media")
docker run -d --name "${NAMA}-api" "${UMUM[@]}" -e AUTOEDIT_PERAN=api -e AUTOEDIT_SOCKET=/run/uji/api.sock \
  -v "$VOL_SOK:/run/uji" "$IMG" node utama.mjs >/dev/null
docker run -d --name "${NAMA}-worker" "${UMUM[@]}" -e AUTOEDIT_PERAN=worker "$IMG" node pekerja.mjs >/dev/null

echo -n "== Menunggu API uji"
for i in $(seq 1 30); do
  if docker exec "${NAMA}-api" env AUTOEDIT_SOCKET=/run/uji/api.sock node sehat.mjs >/dev/null 2>&1; then echo " OK"; break; fi
  echo -n "."; sleep 2
done

docker cp "$SUMBER/tests/mesin-video/asap-vps.mjs" "${NAMA}-api:/tmp/asap-vps.mjs"
echo "== Uji asap =="
HASIL=0
docker exec "${NAMA}-api" node /tmp/asap-vps.mjs /run/uji/api.sock || HASIL=$?
if [ "$HASIL" -ne 0 ]; then
  echo "--- log API ---";    docker logs --tail 40 "${NAMA}-api" 2>&1
  echo "--- log worker ---"; docker logs --tail 40 "${NAMA}-worker" 2>&1
fi
exit "$HASIL"
