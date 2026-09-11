#!/usr/bin/env bash
# =====================================================================
# PEMASANG BLOK CADDY — dipakai bersama skrip 02 (Supabase) dan 11
# (aplikasi).
#
# Kenapa ada berkas tersendiri: server ini melayani LEBIH DARI SATU
# situs. Menulis ulang Caddyfile berarti mematikan situs tetangga.
# Karena dua skrip sama-sama perlu menambah situsnya sendiri, caranya
# ditulis SEKALI di sini — kalau tersebar, cepat atau lambat salah
# satunya akan berbeda dan yang satu lagi merusak.
#
# DUA BENTUK CADDY (12 Sep 2026): di VPS ini Caddy ternyata berjalan
# sebagai CONTAINER milik aplikasi lain, bukan layanan sistem. Dua-duanya
# harus didukung, karena yang salah pilih berakibat perubahan ditulis ke
# berkas yang tidak dipakai siapa pun — tampak berhasil, padahal tidak
# terjadi apa-apa.
#
# Cara pakai:
#   . /opt/pri-skrip/blok-caddy.sh
#   kenali_caddy                       # mengisi CADDY_MODE, CADDYFILE, CADDY_CT
#   pasang_blok_caddy "PRI Supabase" /tmp/blok.caddy
# =====================================================================

CADDY_MODE=""   # "container" | "sistem"
CADDYFILE=""    # jalur Caddyfile DI SERVER (bukan di dalam container)
CADDY_CT=""     # nama container, bila berbentuk container

# Cari Caddy yang BENAR-BENAR memegang port 80/443.
kenali_caddy() {
  # Sudah ditentukan dari luar (dipakai saat pengujian) — hormati.
  if [ -n "${CADDYFILE:-}" ] && [ -n "${CADDY_MODE:-}" ]; then
    return 0
  fi

  CADDY_CT="$(docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null \
    | awk -F'\t' 'tolower($2) ~ /caddy/ && $3 ~ /:(80|443)->/ {print $1; exit}')"

  if [ -n "$CADDY_CT" ]; then
    CADDY_MODE="container"
    CADDYFILE="$(docker inspect "$CADDY_CT" \
      --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' 2>/dev/null)"
    if [ -z "$CADDYFILE" ]; then
      echo "Container Caddy ($CADDY_CT) tidak memasang /etc/caddy/Caddyfile dari server." >&2
      echo "Pengaturannya tidak bisa diubah dari luar container." >&2
      return 1
    fi
    echo "  Caddy berupa container: $CADDY_CT"
    echo "  pengaturannya di server: $CADDYFILE"
    return 0
  fi

  if systemctl is-active --quiet caddy 2>/dev/null; then
    CADDY_MODE="sistem"
    CADDYFILE="/etc/caddy/Caddyfile"
    echo "  Caddy berupa layanan sistem"
    return 0
  fi

  echo "Tidak ada Caddy yang melayani port 80/443 di server ini." >&2
  echo "Periksa: docker ps | grep -i caddy   dan   systemctl status caddy" >&2
  return 1
}

# Periksa keabsahan konfigurasi — lewat container bila perlu.
_caddy_periksa() {
  if [ "$CADDY_MODE" = "container" ]; then
    docker exec "$CADDY_CT" caddy validate --config /etc/caddy/Caddyfile
  else
    caddy validate --config "$CADDYFILE"
  fi
}

# Muat ulang tanpa memutus sambungan yang sedang berjalan.
_caddy_muat_ulang() {
  if [ "$CADDY_MODE" = "container" ]; then
    # `caddy reload` memuat ulang di tempat; container tidak dimulai
    # ulang, jadi situs tetangga tidak pernah putus.
    docker exec "$CADDY_CT" caddy reload --config /etc/caddy/Caddyfile --force
  else
    systemctl reload caddy
  fi
}

# pasang_blok_caddy <nama-blok> <berkas-isi>
pasang_blok_caddy() {
  local nama="${1:?nama blok}"
  local isi="${2:?berkas isi}"
  local awal="# >>> ${nama} — dikelola skrip, jangan diedit tangan >>>"
  local akhir="# <<< ${nama} <<<"

  [ -n "${CADDYFILE:-}" ] || { echo "Panggil kenali_caddy dulu." >&2; return 1; }
  [ -s "$isi" ] || { echo "Berkas isi blok kosong: $isi" >&2; return 1; }

  mkdir -p "$(dirname "$CADDYFILE")"
  touch "$CADDYFILE"
  local cadangan="${CADDYFILE}.cadangan-$(date +%Y%m%d-%H%M%S)"
  cp -a "$CADDYFILE" "$cadangan"
  echo "  salinan konfigurasi lama: $cadangan"

  # Blok lama milik NAMA YANG SAMA dibuang dulu, jadi menjalankan skrip
  # berkali-kali tidak menumpuk. Blok milik situs lain tidak disentuh.
  if grep -qF "$awal" "$CADDYFILE"; then
    echo "  blok \"$nama\" yang lama ditemukan — diganti, bukan ditumpuk."
    awk -v a="$awal" -v b="$akhir" '
      index($0, a) { lewat = 1 }
      !lewat       { print }
      index($0, b) { lewat = 0 }
    ' "$cadangan" > "$CADDYFILE"
  fi

  {
    printf '%s\n' "$awal"
    cat "$isi"
    printf '%s\n' "$akhir"
  } >> "$CADDYFILE"

  # Kalau hasil gabungannya tidak sah, KEMBALIKAN yang lama. Lebih baik
  # situs baru belum bisa dibuka daripada situs lama ikut mati.
  if ! _caddy_periksa >/tmp/caddy-validate.log 2>&1; then
    echo "Konfigurasi Caddy tidak sah — mengembalikan yang lama:" >&2
    sed 's/^/  /' /tmp/caddy-validate.log >&2
    cp -a "$cadangan" "$CADDYFILE"
    _caddy_muat_ulang >/dev/null 2>&1 || true
    return 1
  fi
  if ! _caddy_muat_ulang >/tmp/caddy-reload.log 2>&1; then
    echo "Caddy gagal dimuat ulang — mengembalikan konfigurasi lama:" >&2
    sed 's/^/  /' /tmp/caddy-reload.log >&2
    cp -a "$cadangan" "$CADDYFILE"
    _caddy_muat_ulang >/dev/null 2>&1 || true
    return 1
  fi
  echo "  blok \"$nama\" terpasang, Caddy dimuat ulang."
  return 0
}

# lapor_situs_caddy <domain-yang-baru>
# Memastikan situs LAIN di server ini masih menjawab setelah perubahan.
lapor_situs_caddy() {
  local baru="${1:-}"
  local d
  for d in $(grep -oE '^[a-zA-Z0-9.*-]+\.[a-zA-Z]{2,}' "$CADDYFILE" | sort -u | head -6); do
    [ "$d" = "$baru" ] && continue
    printf '  situs lain %-32s -> %s\n' "$d" \
      "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$d/" 2>/dev/null || echo gagal)"
  done
}

# alamat_dalam_untuk_caddy <nama-container-tujuan> <port-dalam>
# Alamat yang bisa dijangkau Caddy untuk menghubungi layanan kita.
#
# Ini bagian yang mudah salah: kalau Caddy berupa container, "127.0.0.1"
# baginya berarti DIRINYA SENDIRI, bukan server. Sementara Supabase
# sengaja hanya mendengar di 127.0.0.1 server supaya tidak terbuka ke
# internet — jadi lewat alamat itu container Caddy tidak akan pernah
# menyambung. Jalan keluarnya: sambungkan container Caddy ke jaringan
# Supabase, lalu panggil layanannya dengan NAMA container.
alamat_dalam_untuk_caddy() {
  local tujuan="${1:?nama container tujuan}"
  local port="${2:?port di dalam container}"
  if [ "$CADDY_MODE" != "container" ]; then
    echo "127.0.0.1:$port"
    return 0
  fi
  local jaringan
  jaringan="$(docker inspect "$tujuan" \
    --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print $1}')"
  if [ -z "$jaringan" ]; then
    echo "Jaringan container $tujuan tidak terbaca." >&2
    return 1
  fi
  if ! docker inspect "$CADDY_CT" \
        --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | grep -qw "$jaringan"; then
    docker network connect "$jaringan" "$CADDY_CT" >&2 || {
      echo "Gagal menyambungkan $CADDY_CT ke jaringan $jaringan." >&2
      return 1
    }
    echo "  $CADDY_CT disambungkan ke jaringan $jaringan" >&2
  else
    echo "  $CADDY_CT sudah tersambung ke jaringan $jaringan" >&2
  fi
  echo "$tujuan:$port"
}
