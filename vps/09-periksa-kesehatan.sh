#!/usr/bin/env bash
# =====================================================================
# LANGKAH 9 — PEMERIKSA KESEHATAN (jalankan kapan saja setelah pindah).
#
# Supabase Cloud dulu mengurus banyak hal diam-diam: cadangan otomatis,
# pemantauan, peringatan penuh disk. Di VPS, semua itu tanggung jawab
# sendiri. Skrip ini merangkum keadaan server dalam satu layar, dengan
# penilaian BAIK / PERHATIKAN / BAHAYA supaya tidak perlu menafsirkan
# angka mentah.
#
# Aman dijalankan kapan pun: hanya MEMBACA, tidak mengubah apa pun.
#
# CARA PAKAI (root, di VPS):
#   bash 09-periksa-kesehatan.sh
# =====================================================================
set -uo pipefail

DIR=/opt/pri/supabase
CADANGAN=/opt/pri/cadangan
MERAH=0
KUNING=0

nilai() { # nilai "<judul>" "<isi>" "<status>"
  case "$3" in
    baik)       printf '  [ BAIK      ] %-34s %s\n' "$1" "$2" ;;
    perhatikan) KUNING=$((KUNING + 1)); printf '  [ PERHATIKAN] %-34s %s\n' "$1" "$2" ;;
    bahaya)     MERAH=$((MERAH + 1));   printf '  [ BAHAYA    ] %-34s %s\n' "$1" "$2" ;;
    *)          printf '  [ info      ] %-34s %s\n' "$1" "$2" ;;
  esac
}

sql() { docker compose -f "$DIR/docker-compose.yml" exec -T db \
  psql -U postgres -d postgres -tAc "$1" 2>/dev/null | tr -d '\r'; }

echo "=================================================="
echo " KESEHATAN SERVER PRI SUPERAPP — $(date '+%d %b %Y %H:%M WIB')"
echo "=================================================="

echo
echo "1. RUANG DISK"
PAKAI=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')
SISA=$(df -Ph / | awk 'NR==2 {print $4}')
if   [ "$PAKAI" -ge 90 ]; then nilai "Pemakaian disk" "${PAKAI}% terpakai, sisa $SISA" bahaya
elif [ "$PAKAI" -ge 75 ]; then nilai "Pemakaian disk" "${PAKAI}% terpakai, sisa $SISA" perhatikan
else                           nilai "Pemakaian disk" "${PAKAI}% terpakai, sisa $SISA" baik; fi
nilai "Ukuran data Supabase" "$(du -sh /opt/pri/supabase/volumes 2>/dev/null | cut -f1 || echo '?')" info

echo
echo "2. MEMORI"
RAM_TOTAL=$(free -m | awk '/^Mem:/ {print $2}')
RAM_PAKAI=$(free -m | awk '/^Mem:/ {print $3}')
RAM_PERSEN=$(( RAM_PAKAI * 100 / RAM_TOTAL ))
SWAP_PAKAI=$(free -m | awk '/^Swap:/ {print $3}')
if   [ "$RAM_PERSEN" -ge 92 ]; then nilai "Pemakaian RAM" "${RAM_PERSEN}% (${RAM_PAKAI}/${RAM_TOTAL} MB)" bahaya
elif [ "$RAM_PERSEN" -ge 85 ]; then nilai "Pemakaian RAM" "${RAM_PERSEN}% (${RAM_PAKAI}/${RAM_TOTAL} MB)" perhatikan
else                                nilai "Pemakaian RAM" "${RAM_PERSEN}% (${RAM_PAKAI}/${RAM_TOTAL} MB)" baik; fi
# Swap terpakai banyak = database mulai terlempar ke disk; itu pelan sekali.
if [ "${SWAP_PAKAI:-0}" -gt 512 ]; then nilai "Swap terpakai" "${SWAP_PAKAI} MB — database mulai melambat" perhatikan
else                                    nilai "Swap terpakai" "${SWAP_PAKAI:-0} MB" baik; fi

echo
echo "3. LAYANAN DOCKER"
if ! docker compose -f "$DIR/docker-compose.yml" ps --format json >/dev/null 2>&1; then
  nilai "Docker Compose" "tidak bisa dibaca — Supabase mati?" bahaya
else
  MATI=$(docker compose -f "$DIR/docker-compose.yml" ps -a --format '{{.Service}} {{.State}}' 2>/dev/null | awk '$2 != "running" {print $1}' | tr '\n' ' ')
  HIDUP=$(docker compose -f "$DIR/docker-compose.yml" ps --format '{{.Service}}' 2>/dev/null | wc -l)
  if [ -n "$MATI" ]; then nilai "Layanan tidak jalan" "$MATI" bahaya
  else                    nilai "Semua layanan jalan" "${HIDUP} kontainer" baik; fi
  SAKIT=$(docker ps --filter health=unhealthy --format '{{.Names}}' | tr '\n' ' ')
  [ -n "$SAKIT" ] && nilai "Kontainer tidak sehat" "$SAKIT" bahaya
fi

echo
echo "4. DATABASE"
UKURAN=$(sql "select pg_size_pretty(pg_database_size(current_database()))")
if [ -z "$UKURAN" ]; then
  nilai "PostgreSQL" "tidak menjawab" bahaya
else
  nilai "Ukuran database" "$UKURAN" info
  KON=$(sql "select count(*) from pg_stat_activity")
  KON_MAKS=$(sql "select setting from pg_settings where name='max_connections'")
  KON_PERSEN=$(( KON * 100 / (KON_MAKS > 0 ? KON_MAKS : 1) ))
  if   [ "$KON_PERSEN" -ge 85 ]; then nilai "Koneksi terpakai" "$KON dari $KON_MAKS" bahaya
  elif [ "$KON_PERSEN" -ge 70 ]; then nilai "Koneksi terpakai" "$KON dari $KON_MAKS" perhatikan
  else                                nilai "Koneksi terpakai" "$KON dari $KON_MAKS" baik; fi

  # Cache hit: berapa persen pembacaan dilayani dari memori, bukan disk.
  # Di bawah 99% berarti shared_buffers kurang atau data sudah membengkak.
  HIT=$(sql "select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit + blks_read), 0), 1) from pg_stat_database where datname = current_database()")
  HIT_BULAT=${HIT%%.*}
  if   [ "${HIT_BULAT:-0}" -ge 99 ]; then nilai "Data dilayani dari memori" "${HIT}%" baik
  elif [ "${HIT_BULAT:-0}" -ge 95 ]; then nilai "Data dilayani dari memori" "${HIT}% — pertimbangkan naikkan shared_buffers" perhatikan
  else                                    nilai "Data dilayani dari memori" "${HIT}% — kueri banyak membaca disk" bahaya; fi

  LAMA=$(sql "select coalesce(max(extract(epoch from (now() - query_start)))::int, 0) from pg_stat_activity where state = 'active' and query not like '%pg_stat_activity%'")
  if [ "${LAMA:-0}" -ge 60 ]; then nilai "Kueri terlama berjalan" "${LAMA} detik" perhatikan
  else                             nilai "Kueri terlama berjalan" "${LAMA:-0} detik" baik; fi

  MATI_TUP=$(sql "select coalesce(sum(n_dead_tup), 0) from pg_stat_user_tables")
  if [ "${MATI_TUP:-0}" -ge 500000 ]; then nilai "Baris mati menumpuk" "$MATI_TUP — jalankan VACUUM" perhatikan
  else                                     nilai "Baris mati menumpuk" "${MATI_TUP:-0}" baik; fi

  TABEL=$(sql "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
  nilai "Jumlah tabel" "${TABEL:-?}" info
fi

echo
echo "5. CADANGAN"
if [ -d "$CADANGAN" ]; then
  BARU=$(ls -t "$CADANGAN"/*.sql.gz 2>/dev/null | head -1)
  if [ -z "$BARU" ]; then
    nilai "Cadangan terakhir" "BELUM ADA SATU PUN" bahaya
  else
    UMUR_JAM=$(( ( $(date +%s) - $(stat -c %Y "$BARU") ) / 3600 ))
    BESAR=$(du -h "$BARU" | cut -f1)
    if   [ "$UMUR_JAM" -ge 48 ]; then nilai "Cadangan terakhir" "${UMUR_JAM} jam lalu ($BESAR)" bahaya
    elif [ "$UMUR_JAM" -ge 30 ]; then nilai "Cadangan terakhir" "${UMUR_JAM} jam lalu ($BESAR)" perhatikan
    else                              nilai "Cadangan terakhir" "${UMUR_JAM} jam lalu ($BESAR)" baik; fi
    nilai "Jumlah cadangan tersimpan" "$(ls "$CADANGAN"/*.sql.gz 2>/dev/null | wc -l) berkas" info
  fi
else
  nilai "Folder cadangan" "belum dibuat — pasang 07-cadangan-harian.sh" bahaya
fi

echo
echo "6. HTTPS & KECEPATAN"
DOMAIN=$(grep -m1 -oP '^\S+(?= \{)' /etc/caddy/Caddyfile 2>/dev/null || true)
if [ -z "$DOMAIN" ]; then
  nilai "Domain" "tidak terbaca dari Caddyfile" perhatikan
else
  nilai "Domain" "$DOMAIN" info
  AKHIR=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$AKHIR" ]; then
    SISA_HARI=$(( ( $(date -d "$AKHIR" +%s) - $(date +%s) ) / 86400 ))
    if   [ "$SISA_HARI" -le 7 ];  then nilai "Sertifikat HTTPS" "habis dalam ${SISA_HARI} hari" bahaya
    elif [ "$SISA_HARI" -le 20 ]; then nilai "Sertifikat HTTPS" "habis dalam ${SISA_HARI} hari" perhatikan
    else                               nilai "Sertifikat HTTPS" "aman ${SISA_HARI} hari lagi" baik; fi
  else
    nilai "Sertifikat HTTPS" "tidak terbaca" perhatikan
  fi
  WAKTU=$(curl -s -o /dev/null -w '%{time_total}' --max-time 20 "https://$DOMAIN/rest/v1/" 2>/dev/null || echo "99")
  MS=$(awk "BEGIN{printf \"%d\", $WAKTU * 1000}")
  if   [ "$MS" -ge 3000 ]; then nilai "Waktu jawab REST" "${MS} ms" bahaya
  elif [ "$MS" -ge 800 ];  then nilai "Waktu jawab REST" "${MS} ms" perhatikan
  else                          nilai "Waktu jawab REST" "${MS} ms" baik; fi
fi

echo
echo "7. KEAMANAN"
TERBUKA=$(ss -tlnp 2>/dev/null | awk 'NR>1 {print $4}' | grep -v '^127\.0\.0\.1' | grep -v '^\[::1\]' | grep -vE ':(80|443|22)$' | tr '\n' ' ')
if [ -n "$TERBUKA" ]; then nilai "Port terbuka ke luar" "$TERBUKA — seharusnya hanya 22/80/443" bahaya
else                       nilai "Port terbuka ke luar" "hanya 22, 80, 443" baik; fi
if ufw status 2>/dev/null | grep -q "Status: active"; then nilai "Firewall (ufw)" "aktif" baik
else                                                       nilai "Firewall (ufw)" "TIDAK aktif" bahaya; fi

echo
echo "=================================================="
if   [ "$MERAH" -gt 0 ];  then echo " KESIMPULAN: $MERAH masalah BAHAYA, $KUNING perlu diperhatikan."
elif [ "$KUNING" -gt 0 ]; then echo " KESIMPULAN: aman, tapi $KUNING hal perlu diperhatikan."
else                           echo " KESIMPULAN: semua sehat."; fi
echo "=================================================="
exit 0
