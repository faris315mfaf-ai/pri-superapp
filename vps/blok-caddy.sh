#!/usr/bin/env bash
# =====================================================================
# PEMASANG BLOK CADDY (11 Sep 2026) — dipakai bersama oleh skrip 02
# (Supabase) dan 11 (aplikasi).
#
# Kenapa ada berkas tersendiri: server ini melayani LEBIH DARI SATU
# situs. Menulis ulang /etc/caddy/Caddyfile berarti mematikan situs
# tetangga. Karena dua skrip sama-sama perlu menambah situsnya sendiri,
# caranya ditulis SEKALI di sini — kalau tersebar, cepat atau lambat
# salah satunya akan berbeda dan yang satu lagi merusak.
#
# Cara pakai (dari skrip lain):
#   . /opt/pri-skrip/blok-caddy.sh
#   pasang_blok_caddy "PRI Supabase" /tmp/blok.caddy
#
# Berkas isi berisi blok situs lengkap, contoh:
#   db.pri-superapp.com {
#       reverse_proxy 127.0.0.1:8000
#   }
# =====================================================================

# pasang_blok_caddy <nama-blok> <berkas-isi>
pasang_blok_caddy() {
  local nama="${1:?nama blok}"
  local isi="${2:?berkas isi}"
  local cf="${CADDYFILE:-/etc/caddy/Caddyfile}"
  local awal="# >>> ${nama} — dikelola skrip, jangan diedit tangan >>>"
  local akhir="# <<< ${nama} <<<"

  [ -s "$isi" ] || { echo "Berkas isi blok kosong: $isi" >&2; return 1; }

  mkdir -p "$(dirname "$cf")"
  touch "$cf"
  local cadangan="${cf}.cadangan-$(date +%Y%m%d-%H%M%S)"
  cp -a "$cf" "$cadangan"
  echo "  salinan konfigurasi lama: $cadangan"

  # Blok lama milik NAMA YANG SAMA dibuang dulu, jadi menjalankan skrip
  # berkali-kali tidak menumpuk. Blok milik situs lain tidak disentuh.
  if grep -qF "$awal" "$cf"; then
    echo "  blok \"$nama\" yang lama ditemukan — diganti, bukan ditumpuk."
    awk -v a="$awal" -v b="$akhir" '
      index($0, a) { lewat = 1 }
      !lewat       { print }
      index($0, b) { lewat = 0 }
    ' "$cadangan" > "$cf"
  fi

  {
    printf '%s\n' "$awal"
    cat "$isi"
    printf '%s\n' "$akhir"
  } >> "$cf"

  # Kalau hasil gabungannya tidak sah, KEMBALIKAN yang lama. Lebih baik
  # situs baru belum bisa dibuka daripada situs lama ikut mati.
  if ! caddy validate --config "$cf" >/tmp/caddy-validate.log 2>&1; then
    echo "Konfigurasi Caddy tidak sah — mengembalikan yang lama:" >&2
    sed 's/^/  /' /tmp/caddy-validate.log >&2
    cp -a "$cadangan" "$cf"
    systemctl reload caddy 2>/dev/null || true
    return 1
  fi
  systemctl reload caddy
  echo "  blok \"$nama\" terpasang, Caddy dimuat ulang."
  return 0
}

# lapor_situs_caddy <domain-yang-baru>
# Memastikan situs LAIN di server ini masih menjawab setelah perubahan.
lapor_situs_caddy() {
  local baru="${1:-}"
  local cf="${CADDYFILE:-/etc/caddy/Caddyfile}"
  local d
  for d in $(grep -oE '^[a-zA-Z0-9.*-]+\.[a-zA-Z]{2,}' "$cf" | sort -u | head -6); do
    [ "$d" = "$baru" ] && continue
    printf '  situs lain %-32s -> %s\n' "$d" \
      "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$d/" 2>/dev/null || echo gagal)"
  done
}
