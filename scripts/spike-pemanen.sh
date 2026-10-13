#!/usr/bin/env bash
# =====================================================================
# UJIAN LAPANGAN PEMANEN (spike) — Bot Redaksi, 13 Okt 2026.
#
# Dijalankan MANUSIA di VPS MESIN (IP yang sama dengan runner) SEBELUM
# runner dinyalakan. Untuk tiap URL profil, menjalankan persis yang akan
# dijalankan pemanen: yt-dlp --flat-playlist --dump-json --playlist-end 5,
# lalu mencetak tabel ringkas: URL, hasil, jumlah item, galat singkat, waktu.
# Hasilnya menentukan bentuk URL profil (tabel PROFIL di src/bot-runner/pemanen.ts)
# dan apakah cookies akun tumbal diperlukan.
#
# TIDAK mengirim data ke mana pun (hanya yt-dlp -> situs sumber). TIDAK pernah
# mencetak isi cookies; hanya menyebut apakah cookies dipakai.
#
# Pemakaian:
#   scripts/spike-pemanen.sh URL [URL ...]
#   BOT_COOKIES_FILE=/srv/godam/bot-cookies/cookies.txt scripts/spike-pemanen.sh URL ...
#
# Contoh URL profil:
#   https://www.youtube.com/@NTVNews/videos
#   https://www.tiktok.com/@ntvnews
#   https://www.instagram.com/ntvnews/
#
# Lingkungan (semua opsional):
#   YTDLP_BIN        biner yt-dlp (bawaan: yt-dlp di PATH, lalu /usr/local/bin/yt-dlp)
#   BOT_COOKIES_FILE berkas cookies Netscape (akun tumbal)
#   SPIKE_DOCKER     nama kontainer; bila diisi, yt-dlp dijalankan lewat
#                    `docker exec` di kontainer itu (mis. pri-autoedit-ts-api,
#                    yang membawa yt-dlp). BOT_COOKIES_FILE lalu adalah jalur
#                    DI DALAM kontainer.
#   SPIKE_BATAS      batas waktu per URL dalam detik (bawaan 90)
#   SPIKE_JEDA       jeda antar-URL dalam detik (bawaan 4)
# =====================================================================
set -u

if [ "$#" -lt 1 ]; then
  echo "Pemakaian: $0 URL_PROFIL [URL_PROFIL ...]" >&2
  exit 2
fi

BATAS="${SPIKE_BATAS:-90}"
JEDA="${SPIKE_JEDA:-4}"
COOKIES="${BOT_COOKIES_FILE:-}"

# Perintah yt-dlp (array; tanpa eval/shell).
if [ -n "${SPIKE_DOCKER:-}" ]; then
  YT=(docker exec -i "$SPIKE_DOCKER" "${YTDLP_BIN:-/usr/local/bin/yt-dlp}")
elif [ -n "${YTDLP_BIN:-}" ]; then
  YT=("$YTDLP_BIN")
elif command -v yt-dlp >/dev/null 2>&1; then
  YT=(yt-dlp)
elif [ -x /usr/local/bin/yt-dlp ]; then
  YT=(/usr/local/bin/yt-dlp)
else
  echo "yt-dlp tidak ditemukan. Isi YTDLP_BIN atau SPIKE_DOCKER." >&2
  exit 2
fi

# `timeout` (GNU coreutils) tersedia di Linux; di macOS mungkin tidak ada.
if command -v timeout >/dev/null 2>&1; then
  PEMBATAS=(timeout "$BATAS")
elif command -v gtimeout >/dev/null 2>&1; then
  PEMBATAS=(gtimeout "$BATAS")
else
  PEMBATAS=()
  echo "PERINGATAN: perintah timeout tidak ada; tanpa batas waktu per URL." >&2
fi

if [ -n "$COOKIES" ] && [ -z "${SPIKE_DOCKER:-}" ] && [ ! -r "$COOKIES" ]; then
  echo "BOT_COOKIES_FILE tidak terbaca: $COOKIES" >&2
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "yt-dlp: $("${YT[@]}" --version 2>/dev/null || echo '?')  |  cookies: $([ -n "$COOKIES" ] && echo 'dipakai' || echo 'tidak')  |  batas: ${BATAS} dtk"
echo
printf '%-52s %-12s %5s %6s  %s\n' "URL" "HASIL" "ITEM" "DETIK" "GALAT SINGKAT"
printf '%-52s %-12s %5s %6s  %s\n' "----------------------------------------------------" "------------" "-----" "------" "-------------"

ADA=0
for URL in "$@"; do
  # Hanya URL https penuh; tolak yang bisa terbaca sebagai opsi atau berspasi/berkendali.
  case "$URL" in
    https://*) ;;
    *)
      printf '%-52s %-12s %5s %6s  %s\n' "${URL:0:52}" "DITOLAK" "-" "-" "bukan URL https://"
      continue
      ;;
  esac
  if printf '%s' "$URL" | grep -q '[[:space:][:cntrl:]]'; then
    printf '%-52s %-12s %5s %6s  %s\n' "${URL:0:52}" "DITOLAK" "-" "-" "URL mengandung spasi/karakter kendali"
    continue
  fi

  ARGS=(--flat-playlist --dump-json --playlist-end 5 --no-warnings --socket-timeout 20 --ignore-no-formats-error)
  [ -n "$COOKIES" ] && ARGS+=(--cookies "$COOKIES")

  MULAI="$(date +%s)"
  # ${PEMBATAS[@]+...}: aman untuk array kosong di bash lama (macOS) dengan `set -u`.
  ${PEMBATAS[@]+"${PEMBATAS[@]}"} "${YT[@]}" "${ARGS[@]}" "$URL" >"$TMP/out" 2>"$TMP/err"
  KODE=$?
  DETIK=$(( $(date +%s) - MULAI ))

  ITEM="$(grep -c '^{' "$TMP/out" 2>/dev/null || true)"
  ITEM="${ITEM:-0}"
  GALAT="$(grep -v '^[[:space:]]*$' "$TMP/err" | tail -n 1 | tr -d '\r' | cut -c1-70)"

  if [ "$KODE" -eq 124 ]; then
    HASIL="WAKTU-HABIS"
  elif [ "$ITEM" -gt 0 ]; then
    HASIL="BERHASIL"
  elif [ "$KODE" -eq 0 ]; then
    HASIL="KOSONG"
  else
    HASIL="GAGAL"
  fi

  # Petunjuk umum dari pesan galat (bukan isi cookies).
  if grep -qiE 'HTTP Error 429|too many requests|rate[- ]?limit' "$TMP/err"; then
    GALAT="[DIBATASI] ${GALAT}"
  elif grep -qiE 'sign in|log ?in|--cookies|not a bot' "$TMP/err"; then
    GALAT="[BUTUH-LOGIN] ${GALAT}"
  fi
  [ "$ITEM" -gt 0 ] && ADA=$((ADA + 1))

  printf '%-52s %-12s %5s %6s  %s\n' "${URL:0:52}" "$HASIL" "$ITEM" "$DETIK" "${GALAT:0:70}"
  sleep "$JEDA"
done

echo
echo "Selesai: $ADA dari $# URL menghasilkan item. Catat hasilnya; jangan jalankan berulang cepat (menghindari pembatasan)."
