# =====================================================================
# MESIN AUTO EDIT VERSI TYPESCRIPT (2 Okt 2026) — pengganti image Python
# autoedit/. Satu image, dua peran lewat AUTOEDIT_PERAN: "api" (HTTP di
# socket Unix) atau "worker" (render dari antrean).
#
# Kode mesin ada di src/mesin-video/ (repo SuperApp yang sama), dibundel
# esbuild jadi dua berkas. Hanya paket native/berkas-luar yang dipasang di
# image jadi: sharp & @napi-rs/canvas (biner), bullmq (membaca skrip Lua
# dari foldernya), ioredis (dipakai bersama bullmq).
# Debian 13 + ffmpeg 7.1 dari apt: SAMA dengan image Python, supaya hasil
# render kedua mesin identik selama peralihan.
# =====================================================================

# --- Tahap 1: bundel -------------------------------------------------
# Baris-baris awal sengaja sama dengan vps/aplikasi/Dockerfile supaya
# lapisan npm ci-nya terpakai ulang dari cache build aplikasi.
FROM node:22-bookworm-slim AS paket
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS bangun
WORKDIR /app
COPY --from=paket /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src/mesin-video ./src/mesin-video
COPY vps/autoedit-ts/paket-jalan.mjs ./
RUN npx esbuild src/mesin-video/server/utama.ts src/mesin-video/pekerja.ts \
      --bundle --platform=node --target=node22 --format=esm \
      --outdir=dist --entry-names=[name] --out-extension:.js=.mjs \
      --external:sharp --external:@napi-rs/canvas --external:bullmq --external:ioredis \
      --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);" \
 && node paket-jalan.mjs > dist/package.json

# --- Tahap 2: yang benar-benar jalan ---------------------------------
FROM node:22-trixie-slim AS jalan
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    TZ=Asia/Jakarta \
    MEDIA_DIR=/data/media \
    AUTOEDIT_ASET_DIR=/app/assets \
    YTDLP_BIN=/usr/local/bin/yt-dlp
WORKDIR /app
# ffmpeg untuk menyusun video; fonts-dejavu cadangan kalau font bawaan hilang.
# yt-dlp versi mandiri (tanpa Python) dari rilis resminya, dicocokkan dengan
# daftar SHA-256 rilis yang sama. SENGAJA versi terbaru: Instagram/TikTok
# berubah kapan saja dan yt-dlp menambalnya lewat rilis baru.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates curl tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && cd /tmp \
 && curl -fsSLO https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
 && curl -fsSLO https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS \
 && grep " yt-dlp_linux$" SHA2-256SUMS | sha256sum -c - \
 && install -m 755 yt-dlp_linux /usr/local/bin/yt-dlp \
 && rm -f yt-dlp_linux SHA2-256SUMS \
 && /usr/local/bin/yt-dlp --version
COPY --from=bangun /app/dist/package.json ./
RUN npm install --omit=dev --no-audit --no-fund --no-package-lock && npm cache clean --force
COPY --from=bangun /app/dist/*.mjs ./
COPY autoedit/assets ./assets
COPY vps/autoedit-ts/sehat.mjs ./
# Pengguna biasa, bukan root: ffmpeg dan yt-dlp memproses berkas dari
# internet. uid 10001 = pemilik disk media & folder socket di server (sama
# dengan image Python).
RUN useradd --uid 10001 --create-home autoedit \
 && mkdir -p /data/media /run/autoedit \
 && chown -R autoedit:autoedit /data /run/autoedit
USER autoedit
CMD ["node", "--enable-source-maps", "utama.mjs"]
