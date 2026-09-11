# =====================================================================
# CONTAINER APLIKASI PRI SUPERAPP (11 Sep 2026)
#
# Membungkus aplikasi Next.js supaya bisa jalan di VPS sendiri, bukan di
# Vercel. Dibuat bertahap (multi-stage) supaya wadah yang BENAR-BENAR
# jalan hanya berisi hasil build — bukan seluruh node_modules dan kode
# sumber. Bedanya besar: ratusan MB vs beberapa GB, dan makin sedikit
# isinya makin sedikit pula yang bisa bermasalah.
#
# Aplikasi ini sudah mendukung mode "standalone" saat tidak di Vercel
# (lihat next.config.ts), jadi hasil build-nya berupa satu server kecil
# yang membawa hanya paket yang benar-benar dipakai.
# =====================================================================

# --- Tahap 1: paket ---------------------------------------------------
FROM node:22-bookworm-slim AS paket
WORKDIR /app
# prisma/ ikut disalin SEBELUM npm ci: paket prisma menjalankan
# `prisma generate` saat pemasangan, dan itu gagal kalau skemanya belum
# ada — kegagalan yang pesannya tidak menjelaskan apa-apa.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# --- Tahap 2: membangun ----------------------------------------------
FROM node:22-bookworm-slim AS bangun
WORKDIR /app
COPY --from=paket /app/node_modules ./node_modules
COPY . .
# Dibutuhkan SAAT BUILD (bukan saat jalan): daftar host yang boleh
# dioptimalkan next/image ditentukan di next.config.ts saat build.
ARG SUPABASE_URL=""
ENV SUPABASE_URL=$SUPABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Skrip build proyek ini sekaligus menyalin static/ dan public/ ke dalam
# folder standalone, jadi hasilnya sudah lengkap untuk dijalankan.
RUN npm run build

# --- Tahap 3: yang benar-benar jalan ---------------------------------
FROM node:22-bookworm-slim AS jalan
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Asia/Jakarta
# Jalan sebagai pengguna biasa, bukan root: kalau suatu saat ada celah di
# aplikasi, penyerang tidak langsung memegang seluruh isi container.
RUN groupadd -r pri && useradd -r -g pri pri \
 && apt-get update && apt-get install -y --no-install-recommends curl tzdata \
 && rm -rf /var/lib/apt/lists/*
COPY --from=bangun --chown=pri:pri /app/.next/standalone ./
USER pri
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Dipakai Docker untuk tahu container ini sehat atau tidak; kalau tidak
# sehat, container dimulai ulang sendiri.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/hidup || exit 1
CMD ["node", "server.js"]
