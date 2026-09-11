# =====================================================================
# CONTAINER MIGRASI PRI SUPERAPP (11 Sep 2026)
#
# Satu wadah berisi SEMUA alat yang dibutuhkan migrasi:
#   - pg_dump / pg_restore / psql versi 17 (harus >= versi Supabase Cloud)
#   - Node.js + supabase-js (untuk memindahkan berkas Storage & menguji)
#   - seluruh skrip langkah 3 sampai 6
#
# Kenapa dijadikan satu container:
# Sebelumnya tiap langkah butuh alat berbeda di tempat berbeda — psql
# dipinjam dari container database, Node diunduh ulang tiap kali skrip
# dijalankan. Akibatnya migrasi bergantung pada keadaan VPS dan pada
# internet yang harus lancar di tengah jalan. Dengan satu wadah, semua
# alat dikunci versinya sekali di awal, lalu migrasi berjalan tanpa
# mengunduh apa pun lagi.
# =====================================================================
FROM node:22-bookworm-slim

# Klien PostgreSQL 17 dari repo resmi PostgreSQL. Versi klien TIDAK
# BOLEH lebih tua dari server sumber — pg_dump 16 menolak database 17.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && apt-get purge -y gnupg \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dipasang saat membangun, bukan saat migrasi berjalan — supaya migrasi
# tidak bisa gagal gara-gara jaringan tersendat di tengah jalan.
RUN npm install --no-audit --no-fund --omit=dev @supabase/supabase-js@2

COPY 04-pindah-storage.mjs 05-ganti-url.sql 06-uji-migrasi.mjs jalankan.sh ./
RUN chmod +x jalankan.sh

ENTRYPOINT ["/app/jalankan.sh"]
CMD ["semua"]
