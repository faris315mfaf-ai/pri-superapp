#!/usr/bin/env bash
# =====================================================================
# PERBARUI APLIKASI DI VPS (12 Sep 2026)
#
# Satu perintah untuk menerapkan perubahan kode: ambil versi terbaru,
# bangun, ganti, uji, dan KEMBALIKAN sendiri kalau hasilnya tidak sehat.
#
# Dipasang juga sebagai perintah pendek:  pri-perbarui
#
# Kenapa ada pengembalian otomatis: versi lama SELALU disimpan sebagai
# cadangan sebelum yang baru dinyalakan. Kalau yang baru tidak menjawab,
# yang lama dihidupkan lagi dalam hitungan detik — tanpa perlu menunggu
# siapa pun sadar dan tanpa perlu tahu perintah pemulihan.
#
# CARA PAKAI (root, di VPS):
#   pri-perbarui                # ambil kode terbaru lalu terapkan
#   pri-perbarui --tanpa-tarik  # bangun ulang saja, tanpa git pull
#   pri-perbarui --skrip-saja   # ambil kode & segarkan skrip perawatan
#                               # saja: tidak membangun, tidak menyentuh
#                               # aplikasi yang sedang melayani orang.
#                               # Dipakai kalau yang ditambahkan hanya
#                               # skrip di folder vps/ (mis. perbaikan
#                               # database), bukan kode aplikasi.
# =====================================================================
set -euo pipefail

# --- Melindungi diri dari ditimpa saat sedang berjalan ----------------
# Langkah 2 menyalin seluruh isi vps/ ke /opt/pri-superapp/skrip — termasuk berkas
# skrip INI kalau ia dijalankan dari sana. Bash membaca skrip sambil
# menjalankannya, jadi berkas yang ditimpa di tengah jalan membuat sisa
# perintahnya terbaca ngawur: yang dijalankan bukan lagi yang tertulis,
# dan kacaunya baru terasa di tengah pembaruan.
#
# Karena itu skrip menyalin dirinya ke berkas sementara lebih dulu, lalu
# menjalankan salinan itu. Berkas aslinya boleh ditimpa sesuka hati.
if [ -z "${PRI_BERKAS_ASLI:-}" ]; then
  __salinan="$(mktemp -t pri-perbarui.XXXXXX)"
  cat "$0" > "$__salinan"
  PRI_BERKAS_ASLI="$(readlink -f "$0")" exec bash "$__salinan" "$@"
fi
# Salinan sementara dibersihkan sendiri, apa pun hasil pembaruannya.
case "$0" in /tmp/*) trap 'rm -f "$0"' EXIT ;; esac

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root: sudo $PRI_BERKAS_ASLI" >&2; exit 1; }

# Folder lama /opt/pri → /opt/pri-superapp, sekali. Dilakukan SEBELUM
# path di bawah dipakai, supaya git pull & docker compose melihat tempat baru.
if [ ! -d /opt/pri-superapp ] && [ -d /opt/pri ]; then
  echo "== 0/6 Mengganti nama folder /opt/pri -> /opt/pri-superapp =="
  if [ -f /opt/pri/aplikasi/docker-compose.yml ]; then
    docker compose -f /opt/pri/aplikasi/docker-compose.yml stop || true
  fi
  if [ -f /opt/pri/supabase/docker-compose.yml ]; then
    echo "  database dihentikan sebentar — datanya tidak dihapus"
    docker compose -f /opt/pri/supabase/docker-compose.yml stop || true
  fi
  mv /opt/pri /opt/pri-superapp
  mkdir -p /opt/pri-superapp/skrip
  if [ -d /opt/pri-skrip ]; then
    cp -a /opt/pri-skrip/. /opt/pri-superapp/skrip/ || true
    rm -rf /opt/pri-skrip
  fi
  if [ -f /etc/cron.d/pri-cadangan ]; then
    sed -i 's|/opt/pri-skrip|/opt/pri-superapp/skrip|g; s|/opt/pri/|/opt/pri-superapp/|g' /etc/cron.d/pri-cadangan || true
  fi
  if [ -f /opt/pri-superapp/supabase/docker-compose.yml ]; then
    docker compose -f /opt/pri-superapp/supabase/docker-compose.yml up -d
  fi
  echo "  folder sekarang /opt/pri-superapp"
fi

SUMBER=/opt/pri-superapp/sumber
APP=/opt/pri-superapp/aplikasi
SKRIP=/opt/pri-superapp/skrip
PORT="$(grep -m1 '^PORT_APLIKASI=' "$APP/.env" 2>/dev/null | cut -d= -f2- || echo 3001)"
PORT="${PORT:-3001}"
TARIK=1
SKRIP_SAJA=0
case "${1:-}" in
  --tanpa-tarik) TARIK=0 ;;
  --skrip-saja)  SKRIP_SAJA=1 ;;
  "")            ;;
  *) echo "Pilihan tidak dikenal: $1 (yang ada: --tanpa-tarik, --skrip-saja)" >&2; exit 1 ;;
esac

cd "$SUMBER"

if [ "$TARIK" = "1" ]; then
  echo "== 1/6 Mengambil versi terbaru =="
  LAMA="$(git rev-parse --short HEAD)"
  git fetch --quiet origin main
  BARU="$(git rev-parse --short origin/main)"
  if [ "$LAMA" = "$BARU" ]; then
    echo "  sudah versi terbaru ($LAMA) — tidak ada yang perlu diambil"
  else
    echo "  $LAMA -> $BARU"
    git --no-pager log --oneline "$LAMA..origin/main" | sed 's/^/    /'
  fi
  git pull --quiet --ff-only origin main
else
  echo "== 1/6 Melewati pengambilan kode (--tanpa-tarik) =="
fi

echo "== 2/6 Menyegarkan skrip & susunan container =="
mkdir -p "$SKRIP" "$APP/jadwal"
cp -r "$SUMBER/vps/"* "$SKRIP/"
cp "$SUMBER/vps/aplikasi/Dockerfile" "$SUMBER/vps/aplikasi/docker-compose.yml" "$APP/"
cp "$SUMBER/vps/aplikasi/jadwal/"* "$APP/jadwal/"
chmod +x "$APP/jadwal/"*.sh "$SKRIP/"*.sh 2>/dev/null || true

# Pintasan "pri-perbarui" dipasang DI SINI, bukan di awal: barulah pasti
# ada salinan skrip di $SKRIP untuk ditunjuk. Sebelumnya pintasan
# menunjuk ke tempat skrip kebetulan dijalankan — dan kalau pemasangan
# pertama dijalankan langsung dari folder sumber, perintah pendeknya
# tidak pernah ada sampai seseorang menebak sendiri jalurnya.
PINTASAN=/usr/local/bin/pri-perbarui
# Izin jalan dipastikan SEBELUM pintasannya dibuat. Git di Windows tidak
# pernah mencatat tanda "boleh dijalankan", jadi berkas yang baru ditarik
# datang tanpa izin itu — dan pintasan yang menunjuk ke sana gagal dengan
# "Permission denied", pesan yang sama sekali tidak menyebut git.
chmod +x "$SKRIP/12-perbarui.sh" 2>/dev/null || true
if [ "$(readlink -f "$PINTASAN" 2>/dev/null || true)" != "$SKRIP/12-perbarui.sh" ]; then
  # "|| true": gagal memasang pintasan itu hal kecil — pembaruan tetap
  # harus jalan, bukan berhenti diam-diam di baris ini.
  { ln -sf "$SKRIP/12-perbarui.sh" "$PINTASAN" 2>/dev/null \
    && echo "  perintah pendek dipasang: pri-perbarui"; } || true
fi

# Berhenti di sini kalau yang dibutuhkan memang cuma skripnya. Membangun
# ulang aplikasi memakan menit dan sempat memutus layanan — tidak pantas
# dibayar hanya untuk menyalin beberapa berkas skrip.
if [ "$SKRIP_SAJA" = "1" ]; then
  echo
  echo "Skrip perawatan sudah yang terbaru di $SKRIP:"
  ls -1 "$SKRIP"/*.sh | sed 's#.*/#  #'
  echo
  echo "Aplikasi TIDAK disentuh (masih versi $(docker image inspect -f '{{.Id}}' pri-aplikasi:terbaru 2>/dev/null | cut -c8-19 || echo '?'))."
  echo "Untuk menerapkan perubahan kode aplikasi, jalankan: pri-perbarui"
  exit 0
fi

# --- Auto Edit (modul khusus master, 30 Sep 2026) ------------------
# Disk media, folder socket, firewall keluar, dan kuncinya disiapkan
# SEBELUM aplikasi dinyalakan ulang: container aplikasi memasang folder
# socket-nya. Semua langkah Auto Edit boleh gagal tanpa menghentikan
# pembaruan aplikasi — yang terganggu hanya modul itu sendiri.
AUTOEDIT_SIAP=1
siapkan_autoedit() {
  bash "$SKRIP/autoedit/siapkan-disk.sh" 60 >/dev/null || return 1
  install -m 755 "$SKRIP/autoedit/firewall-keluar.sh" /usr/local/sbin/pri-autoedit-firewall || return 1
  cat > /etc/systemd/system/pri-autoedit-firewall.service <<'UNIT' || return 1
[Unit]
Description=Firewall keluar container Auto Edit PRI
After=docker.service
PartOf=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/pri-autoedit-firewall

[Install]
WantedBy=multi-user.target docker.service
UNIT
  systemctl daemon-reload || return 1
  systemctl enable --quiet pri-autoedit-firewall.service || return 1
  systemctl restart pri-autoedit-firewall.service || return 1
  # Container Auto Edit hanya menerima kunci DeepSeek (hook berita) dan sesi
  # Instagram untuk pengunduh (opsional) — bukan seluruh env.txt.
  ( umask 077; grep -E '^(DEEPSEEK_(API_KEY|BASE_URL|MODEL)|VIDEO_IG_SESSIONID)=' "$APP/env.txt" > "$APP/autoedit.env" || true )
  {
    echo 'SHELL=/bin/bash'
    echo 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    echo "50 2 * * * root bash $SKRIP/autoedit/cadangan-template.sh >> /var/log/pri-autoedit-cadangan.log 2>&1"
  } > /etc/cron.d/pri-autoedit || return 1
  chmod 644 /etc/cron.d/pri-autoedit
}
echo "== Auto Edit: disk, socket, firewall =="
if siapkan_autoedit; then
  echo "  siap ($(df -h --output=avail /srv/godam/media | tail -1 | tr -d ' ') bebas di disk media)"
else
  AUTOEDIT_SIAP=0
  echo "  PERINGATAN: persiapan Auto Edit gagal — aplikasi tetap diperbarui, modul Auto Edit menunggu." >&2
fi

echo "== 3/6 Menyimpan versi sekarang sebagai cadangan =="
# Kalau yang baru bermasalah, inilah yang dihidupkan kembali.
if docker image inspect pri-aplikasi:terbaru >/dev/null 2>&1; then
  docker tag pri-aplikasi:terbaru pri-aplikasi:sebelumnya
  echo "  cadangan siap (pri-aplikasi:sebelumnya)"
  ADA_CADANGAN=1
else
  echo "  belum ada versi sebelumnya — pemasangan pertama"
  ADA_CADANGAN=0
fi

echo "== 4/6 Membangun =="
cd "$APP"
docker compose build aplikasi
# Penjadwal ikut dibangun ulang (14 Sep 2026): daftar tugas berkalanya
# (jalankan.sh) dipanggang ke dalam image, jadi tugas baru — mis.
# sinkron-absensi SADAR — tidak akan jalan bila image-nya tidak dibuat ulang.
docker compose build jadwal

echo "== 5/6 Mengganti yang sedang jalan =="
docker compose up -d --force-recreate aplikasi jadwal
# Gateway WhatsApp OTP (7 Okt 2026): dinyalakan bila belum jalan, TIDAK
# dibuat ulang tiap deploy — sesi WhatsApp-nya tetap tersambung.
docker compose up -d wa || echo "  (gateway WA tidak bisa dinyalakan — OTP memakai cadangan)"
echo -n "  menunggu aplikasi menjawab"
SIAP=0
for i in $(seq 1 40); do
  if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/hidup" >/dev/null 2>&1; then SIAP=1; echo " OK"; break; fi
  echo -n "."; sleep 3
done

if [ "$SIAP" -ne 1 ]; then
  echo
  echo "VERSI BARU TIDAK MENJAWAB — mengembalikan versi sebelumnya." >&2
  docker compose logs --tail=30 aplikasi >&2
  if [ "$ADA_CADANGAN" = "1" ]; then
    docker tag pri-aplikasi:sebelumnya pri-aplikasi:terbaru
    docker compose up -d --force-recreate aplikasi
    echo -n "  menunggu versi lama hidup" >&2
    for i in $(seq 1 40); do
      curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/hidup" >/dev/null 2>&1 && { echo " OK" >&2; break; }
      echo -n "." >&2; sleep 3
    done
    echo "Versi lama sudah jalan lagi. Perbaiki kodenya, lalu ulangi." >&2
  else
    echo "Tidak ada cadangan untuk dikembalikan." >&2
  fi
  exit 1
fi

tunggu_sehat() {
  # $1 = nama container; jawab 0 bila healthcheck-nya sehat dalam 90 detik.
  local sehat=""
  for i in $(seq 1 30); do
    sehat="$(docker inspect -f '{{.State.Health.Status}}' "$1" 2>/dev/null || true)"
    [ "$sehat" = "healthy" ] && return 0
    sleep 3
  done
  echo "  status $1: ${sehat:-tidak ada}" >&2
  return 1
}

nyalakan_autoedit_python() {
  # Image yang sama untuk API dan worker; compose hanya membuat ulang
  # container yang image/susunannya berubah. Render yang sedang berjalan
  # ikut terputus saat worker diganti — job itu ditandai gagal, bisa diulang.
  docker compose --profile ts stop autoedit-ts-api autoedit-ts-worker >/dev/null 2>&1 || true
  docker compose --profile ts rm -f autoedit-ts-api autoedit-ts-worker >/dev/null 2>&1 || true
  docker compose build autoedit-api && docker compose up -d autoedit-redis autoedit-api autoedit-worker     && tunggu_sehat pri-autoedit-api
}

nyalakan_autoedit_ts() {
  # Mesin TypeScript (src/mesin-video). Socket & disk sama dengan Python,
  # jadi pasangan Python dimatikan dulu sebelum yang TS menyala.
  docker compose --profile ts build autoedit-ts-api || return 1
  docker compose stop autoedit-api autoedit-worker >/dev/null 2>&1 || true
  docker compose rm -f autoedit-api autoedit-worker >/dev/null 2>&1 || true
  docker compose --profile ts up -d autoedit-redis autoedit-ts-api autoedit-ts-worker     && tunggu_sehat pri-autoedit-ts-api
}

# --- Mode "jauh" (5 Okt 2026): mesin Auto Edit di VPS kedua ---------
# Kode sumber ada di sini, jadi image DIBANGUN di sini lalu dikirim lewat
# jalur privat WireGuard ke VPS mesin (10.77.0.2) — hanya bila berubah.
# Di sini cukup jembatan socket -> TCP. Kunci SSH /root/.ssh/pri-mesin
# hanya diterima VPS mesin bila datang dari 10.77.0.1 (jalur privat).
MESIN_HOST=root@10.77.0.2
MESIN_DIR=/opt/pri-mesin
MESIN_SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10 -i /root/.ssh/pri-mesin "$MESIN_HOST")
MESIN_SCP=(scp -q -o BatchMode=yes -o ConnectTimeout=10 -i /root/.ssh/pri-mesin)

nyalakan_autoedit_jauh() {
  docker compose --profile ts build autoedit-ts-api || return 1
  # Socket di sini milik jembatan: mesin lokal (TS & Python) tidak boleh menyala.
  docker compose --profile ts stop autoedit-ts-api autoedit-ts-worker autoedit-api autoedit-worker autoedit-redis >/dev/null 2>&1 || true
  docker compose --profile ts rm -f autoedit-ts-api autoedit-ts-worker autoedit-api autoedit-worker autoedit-redis >/dev/null 2>&1 || true
  # Susunan, skrip, dan kunci DeepSeek ikut versi terbaru.
  "${MESIN_SSH[@]}" "mkdir -p $MESIN_DIR/autoedit && chmod 700 $MESIN_DIR" || return 1
  "${MESIN_SCP[@]}" "$SKRIP/mesin/docker-compose.yml" "$SKRIP/mesin/pasang.sh" "$MESIN_HOST:$MESIN_DIR/" || return 1
  "${MESIN_SCP[@]}" "$SKRIP/autoedit/siapkan-disk.sh" "$SKRIP/autoedit/firewall-keluar.sh" \
    "$SKRIP/autoedit/cadangan-template.sh" "$MESIN_HOST:$MESIN_DIR/autoedit/" || return 1
  "${MESIN_SCP[@]}" "$APP/autoedit.env" "$MESIN_HOST:$MESIN_DIR/autoedit.env" || return 1
  "${MESIN_SSH[@]}" "chmod 600 $MESIN_DIR/autoedit.env && bash $MESIN_DIR/pasang.sh" || return 1
  # Image dikirim hanya bila berbeda dari yang sudah ada di sana.
  local lokal jauh
  lokal="$(docker image inspect -f '{{.Id}}' pri-autoedit-ts:terbaru)"
  jauh="$("${MESIN_SSH[@]}" "docker image inspect -f '{{.Id}}' pri-autoedit-ts:terbaru 2>/dev/null" || true)"
  if [ "$lokal" != "$jauh" ]; then
    echo "  mengirim image mesin ke VPS mesin ..."
    docker save pri-autoedit-ts:terbaru | gzip -1 | "${MESIN_SSH[@]}" "gunzip | docker load -q" >/dev/null || return 1
  fi
  "${MESIN_SSH[@]}" "cd $MESIN_DIR && docker compose up -d >/dev/null 2>&1 \
    && for i in \$(seq 1 30); do [ \"\$(docker inspect -f '{{.State.Health.Status}}' pri-autoedit-ts-api 2>/dev/null)\" = healthy ] && exit 0; sleep 3; done; exit 1" || return 1
  docker compose --profile jauh up -d autoedit-jembatan >/dev/null 2>&1 || return 1
  # Ujung ke ujung, lewat socket yang sama dengan yang dipakai aplikasi.
  for i in $(seq 1 10); do
    curl -fsS --max-time 10 --unix-socket /srv/godam/sock/api.sock http://mesin/health >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

if [ "$AUTOEDIT_SIAP" = "1" ]; then
  # Mesin dipilih lewat berkas $APP/autoedit-mesin ("python" | "ts" | "jauh").
  # Tanpa berkas itu tetap Python — peralihan ke TS dilakukan sengaja.
  MESIN_AUTOEDIT="$(tr -dc 'a-z' < "$APP/autoedit-mesin" 2>/dev/null || true)"
  case "$MESIN_AUTOEDIT" in ts|jauh) ;; *) MESIN_AUTOEDIT="python" ;; esac
  echo "== Auto Edit: membangun & menyalakan (mesin $MESIN_AUTOEDIT) =="
  if [ "$MESIN_AUTOEDIT" = "jauh" ]; then
    # TIDAK jatuh ke mesin lokal bila gagal: data (template, stok, antrean)
    # ada di VPS mesin; mesin lokal yang kosong hanya membingungkan anggota.
    if nyalakan_autoedit_jauh; then
      echo "  Auto Edit jalan di VPS mesin (${MESIN_HOST#root@})."
    else
      echo "  PERINGATAN: Auto Edit di VPS mesin gagal diperbarui/dihubungi — aplikasi tetap jalan. Periksa: ssh -i /root/.ssh/pri-mesin $MESIN_HOST 'cd $MESIN_DIR && docker compose ps'" >&2
    fi
  elif [ "$MESIN_AUTOEDIT" = "ts" ]; then
    if nyalakan_autoedit_ts; then
      echo "  Auto Edit (TS) jalan."
    else
      echo "  PERINGATAN: mesin TS gagal — kembali ke mesin Python. Log: docker logs --tail 50 pri-autoedit-ts-api" >&2
      if nyalakan_autoedit_python; then echo "  Auto Edit (Python) jalan."; else echo "  PERINGATAN: Auto Edit Python juga gagal — aplikasi tetap jalan." >&2; fi
    fi
  else
    if nyalakan_autoedit_python; then
      echo "  Auto Edit jalan."
    else
      echo "  PERINGATAN: Auto Edit gagal dibangun/sehat — aplikasi tetap jalan. Log: docker logs --tail 50 pri-autoedit-api" >&2
    fi
  fi
fi

echo "== 6/6 Memeriksa hasil =="
curl -s --max-time 30 "http://127.0.0.1:$PORT/api/sehat" | head -c 200; echo

# --- Daftar host gambar --------------------------------------------
# Diperiksa sejak 12 Sep 2026, setelah kejadian ini: aplikasi terbangun
# tanpa SUPABASE_URL, next/image menolak SEMUA foto dari server sendiri,
# dan yang terlihat pengguna hanyalah foto kosong di mana-mana — tanpa
# satu pun galat di log. Nyaris mustahil ditebak dari gejalanya.
#
# Alamat berkas palsu sengaja dipakai: yang ditanyakan bukan ada atau
# tidaknya berkas, melainkan boleh atau tidaknya HOST itu.
HOST_DB="$(grep -m1 '^SUPABASE_URL=' "$APP/.env" 2>/dev/null | cut -d= -f2- \
           | tr -d '"' | sed 's#^https\?://##; s#/.*$##' || true)"
if [ -n "$HOST_DB" ]; then
  UJI="https%3A%2F%2F$HOST_DB%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fuji%2Fuji.jpg"
  JAWAB="$(curl -s --max-time 20 "http://127.0.0.1:$PORT/_next/image?url=$UJI&w=64&q=75" | head -c 200 || true)"
  case "$JAWAB" in
    *"is not allowed"*)
      echo >&2
      echo "  PERINGATAN BESAR: foto TIDAK AKAN TAMPIL." >&2
      echo "  next/image menolak gambar dari $HOST_DB." >&2
      # Sengaja TIDAK menyebut satu sebab saja: pesan penolakan Next sama
      # persis untuk dua hal yang sangat berbeda — host tidak terdaftar,
      # atau host mengarah ke alamat jaringan dalam. Menebak salah satu
      # di sini pernah mengirim pencarian ke arah yang keliru.
      echo "  Cari sebabnya (hanya membaca, tidak mengubah apa pun):" >&2
      echo "    bash $SKRIP/15-periksa-gambar.sh" >&2
      ;;
    *) echo "  daftar host gambar: $HOST_DB diterima" ;;
  esac
fi
# "|| true": tanpa itu, env.txt yang tidak ada membuat pembaruan yang
# SUDAH BERHASIL berakhir dengan status gagal di baris terakhir ini —
# tanpa pesan "SELESAI" dan tanpa petunjuk pengembalian.
DOMAIN_APP="$(grep -m1 '^APP_URL=' "$APP/env.txt" 2>/dev/null | cut -d= -f2- | sed 's#^https\?://##; s#/.*$##' || true)"
if [ -n "$DOMAIN_APP" ]; then
  curl -s -o /dev/null -m 30 -w "  https://$DOMAIN_APP -> %{http_code}\n" "https://$DOMAIN_APP/api/hidup" || true
fi
echo "  versi kode: $(git -C "$SUMBER" rev-parse --short HEAD) ($(git -C "$SUMBER" log -1 --format=%s | head -c 60))"

echo
echo "SELESAI. Kalau ternyata ada yang salah, kembalikan dengan:"
echo "  docker tag pri-aplikasi:sebelumnya pri-aplikasi:terbaru && docker compose -f $APP/docker-compose.yml up -d --force-recreate aplikasi"
