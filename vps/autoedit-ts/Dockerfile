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

# --- Tahap 1b: alat Kompres Video (5 Okt 2026) ----------------------
# ab-av1 mencari CRF terkecil yang masih memenuhi target VMAF; ia butuh
# ffmpeg ber-libvmaf, yang TIDAK ada di ffmpeg apt Debian. Maka: ffmpeg statis
# BtbN (GPL, libvmaf + libx264) di /opt/vmaf/bin — terpisah dari ffmpeg apt
# yang dipakai render, supaya hasil render tidak berubah. Versi DIKUNCI dan
# dicocokkan SHA-256 (dihitung 5 Okt 2026 dari rilis resmi).
FROM debian:trixie-slim AS kompres
ARG FFMPEG_VMAF_URL=https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-04-20-51/ffmpeg-n8.1.3-14-g330caae0c1-linux64-gpl-8.1.tar.xz
ARG FFMPEG_VMAF_SHA256=7e594ca6a9b11df570db21b6ba0f437d4483c94208df4bcf3660524f1a3c75da
ARG AB_AV1_URL=https://github.com/alexheretic/ab-av1/releases/download/v0.11.7/ab-av1-v0.11.7-x86_64-unknown-linux-musl.tar.zst
ARG AB_AV1_SHA256=40c035df608162fcb1c991d1474bc9bc8817e0354ac7aef5be5314d3efd64069
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils zstd \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /alat
RUN curl -fsSL -o ffmpeg.tar.xz "$FFMPEG_VMAF_URL" \
 && echo "$FFMPEG_VMAF_SHA256  ffmpeg.tar.xz" | sha256sum -c - \
 && tar -xJf ffmpeg.tar.xz --strip-components=2 --wildcards '*/bin/ffmpeg' \
 && curl -fsSL -o ab-av1.tar.zst "$AB_AV1_URL" \
 && echo "$AB_AV1_SHA256  ab-av1.tar.zst" | sha256sum -c - \
 && tar --zstd -xf ab-av1.tar.zst \
 && rm -f ffmpeg.tar.xz ab-av1.tar.zst \
 && ./ffmpeg -hide_banner -filters | grep -q " libvmaf " \
 && ./ab-av1 --version

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
# Hanya ffmpeg: ffprobe apt cukup untuk ab-av1 membaca info video.
COPY --from=kompres /alat/ffmpeg /opt/vmaf/bin/
COPY --from=kompres /alat/ab-av1 /usr/local/bin/ab-av1
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
