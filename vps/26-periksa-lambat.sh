#!/usr/bin/env bash
# =====================================================================
# LANGKAH 26 — KENAPA DATABASE PENGGUNA LAMBAT / TIDAK BISA DIAKSES
# (19 Sep 2026)
#
# GEJALA: /api/sehat melaporkan waktu jawab database
#     71 ms (pagi)  ->  2.917 ms  ->  13.708 ms
# Pada 13 detik hampir semua permintaan kehabisan waktu, dan itu
# terlihat persis seperti "database pengguna tidak bisa diakses".
#
# DUA TERSANGKA, dan obatnya BERBEDA — makanya harus dipisahkan dulu:
#
#   A. CACHE SESI TIDAK TERPAKAI. Tanpa cache bersama, SETIAP
#      pemeriksaan sesi jatuh ke database. Ini persis insiden 7 Sep 2026
#      (35 permintaan/detik, 55%-nya cuma cek sesi).
#      JANGAN salah baca petunjuknya: `"batas_terpusat":"memori"` di
#      /api/sehat melaporkan PEMBATAS LAJU, yang memang butuh Upstash
#      (REST). Di VPS tanpa Upstash, "memori" di situ NORMAL dan BUKAN
#      tanda Redis rusak. Cache sesi memakai jalur lain (REDIS_URL, TCP)
#      dan kini dilaporkan terpisah sebagai `cache_bersama`.
#
#   B. DATABASENYA SENDIRI yang lambat. Sejak aplikasi kembali memakai
#      Supabase CLOUD, tiap kueri menyeberang internet. Kalau proyek
#      cloud itu juga sedang dibatasi/kehabisan jatah, lambatnya
#      berlipat.
#
# Skrip ini MEMBACA SAJA. Tidak mengubah pengaturan, tidak memulai
# ulang apa pun. KUNCI TIDAK PERNAH DICETAK.
#
# CARA PAKAI (root, di VPS):
#   bash /opt/pri-superapp/skrip/26-periksa-lambat.sh
# =====================================================================
set -uo pipefail

[ "$(id -u)" -eq 0 ] || [ -n "${PRI_UJI:-}" ] || { echo "Jalankan sebagai root: sudo bash $0" >&2; exit 1; }

ENV_APP="${PRI_ENV_APP:-/opt/pri-superapp/aplikasi/env.txt}"
CT_APP="${PRI_CT_APP:-pri-aplikasi}"
TEMUAN=()
catat() { TEMUAN+=("$1"); }
garis() { printf '%s\n' "------------------------------------------------------------"; }

# Ambil satu nilai dari env TANPA menampilkannya.
nilai_env() { grep -m1 "^$1=" "$ENV_APP" 2>/dev/null | cut -d= -f2- | tr -d '\r"' || true; }

echo "MENCARI SEBAB DATABASE LAMBAT"
echo "Server : $(hostname) — $(date -Is)"
echo "Catatan: skrip ini TIDAK mengubah apa pun. Kunci tidak dicetak."
garis

# ---------------------------------------------------------------------
echo "== 1/5 Redis — dipakai atau tidak =="
RURL="$(nilai_env REDIS_URL)"
if [ -z "$RURL" ]; then
  echo "  REDIS_URL : TIDAK ADA di env aplikasi"
  catat "REDIS_URL tidak diisi — aplikasi terpaksa memakai cache di memori, dan SETIAP cek sesi jatuh ke database."
else
  # Host saja, tanpa sandi.
  echo "  REDIS_URL : ada (tujuan: $(printf '%s' "$RURL" | sed 's#.*@##; s#/.*##'))"
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CT_APP"; then
  # Diuji DARI DALAM container aplikasi — di situlah yang menentukan.
  # Dari luar container, nama "redis" tidak berarti apa-apa.
  UJI="$(docker exec "$CT_APP" sh -lc 'node -e "
const net=require(\"net\");const u=process.env.REDIS_URL||\"redis://redis:6379\";
const m=u.match(/^redis:\/\/(?:[^@]*@)?([^:\/]+):?([0-9]*)/);
const host=m?m[1]:\"redis\";const port=m&&m[2]?+m[2]:6379;
const t=Date.now();const s=net.connect(port,host);
s.setTimeout(4000);
s.on(\"connect\",()=>{console.log(\"SAMBUNG_OK \"+(Date.now()-t)+\"ms ke \"+host+\":\"+port);s.end();process.exit(0)});
s.on(\"timeout\",()=>{console.log(\"TIMEOUT ke \"+host+\":\"+port);process.exit(1)});
s.on(\"error\",e=>{console.log(\"GAGAL \"+e.code+\" ke \"+host+\":\"+port);process.exit(1)});
"' 2>&1 | tail -2)"
  echo "  dari dalam container aplikasi: ${UJI:-(tidak terbaca)}"
  case "$UJI" in
    *SAMBUNG_OK*) catat "Redis BISA disambung dari container aplikasi. Kalau /api/sehat tetap melaporkan cache_bersama=memori, masalahnya di pengaturan (REDIS_URL), bukan jaringan." ;;
    *GAGAL*|*TIMEOUT*) catat "Container aplikasi TIDAK BISA menyambung ke Redis. Inilah kenapa cache bersama mati dan beban jatuh semua ke database." ;;
  esac
else
  echo "  container $CT_APP tidak sedang jalan — pemeriksaan dilewati"
fi
garis

# ---------------------------------------------------------------------
echo "== 2/5 Perjalanan ke Supabase: jaringan vs database =="
SB="$(nilai_env SUPABASE_URL)"
if [ -z "$SB" ]; then
  echo "  SUPABASE_URL tidak ada — tidak bisa diukur."
else
  echo "  tujuan: $SB"
  echo "  (nama_tahap: detik)"
  curl -s -o /dev/null -m 30 \
    -w "      dns:%{time_namelookup}  sambung:%{time_connect}  tls:%{time_appconnect}  byte_pertama:%{time_starttransfer}  total:%{time_total}\n" \
    "${SB%/}/rest/v1/" 2>/dev/null || echo "      (gagal diukur)"
  echo "  Cara membacanya: kalau 'tls' kecil tapi 'byte_pertama' besar,"
  echo "  yang lambat adalah DATABASE-nya, bukan jaringan."
fi
garis

# ---------------------------------------------------------------------
echo "== 3/5 Kueri sungguhan ke tabel PENGGUNA (app_user) =="
KEY="$(nilai_env SUPABASE_SECRET_KEY)"
[ -z "$KEY" ] && KEY="$(nilai_env SUPABASE_SERVICE_ROLE_KEY)"
[ -z "$KEY" ] && KEY="$(nilai_env SUPABASE_KEY)"
if [ -z "$SB" ] || [ -z "$KEY" ]; then
  echo "  dilewati (alamat atau kunci layanan tidak terbaca dari env)"
else
  for i in 1 2 3; do
    HASIL="$(curl -s -m 40 -o /tmp/q.json -w '%{http_code} %{time_total}' \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
      "${SB%/}/rest/v1/app_user?select=id&limit=1" 2>/dev/null || echo "000 -")"
    echo "  percobaan $i: HTTP ${HASIL%% *}  waktu ${HASIL##* } detik"
  done
  # Isi jawaban hanya ditampilkan bila BUKAN data (yaitu pesan galat).
  if grep -q '"message"' /tmp/q.json 2>/dev/null; then
    echo "  pesan dari Supabase: $(head -c 200 /tmp/q.json)"
    grep -qi 'paused\|exceeded\|quota\|limit' /tmp/q.json 2>/dev/null \
      && catat "Supabase mengirim pesan soal jatah/pembatasan — proyek cloud ini kemungkinan sedang DIBATASI."
  fi
  DETIK="${HASIL##* }"
  case "$DETIK" in
    -|0.0*|1.*|0.*) : ;;
    *) catat "Kueri ke tabel pengguna butuh ${DETIK} detik — itu sendiri sudah cukup membuat login gagal." ;;
  esac
fi
garis

# ---------------------------------------------------------------------
echo "== 4/5 Berapa sering aplikasi menembak database =="
# Pola insiden 7 Sep: mayoritas permintaan cuma memeriksa sesi.
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CT_APP"; then
  echo "  100 baris catatan terakhir, dikelompokkan per jalur:"
  docker logs --tail 400 "$CT_APP" 2>&1 \
    | grep -oE '(GET|POST) /api/[a-z0-9/_-]+' | sort | uniq -c | sort -rn | head -8 | sed 's/^/      /' \
    || echo "      (tidak ada pola yang terbaca)"
  echo "  galat terakhir:"
  docker logs --tail 400 "$CT_APP" 2>&1 | grep -iE 'error|timeout|ECONN|fetch failed' | tail -4 | cut -c1-160 | sed 's/^/      /' \
    || echo "      (tidak ada)"
fi
garis

# ---------------------------------------------------------------------
echo "== 5/5 KESIMPULAN =="
if [ ${#TEMUAN[@]} -eq 0 ]; then
  echo "  Tidak ada sebab yang menonjol dari yang terbaca."
else
  for t in "${TEMUAN[@]}"; do echo "  • $t"; done
fi
echo
echo "URUTAN PERBAIKAN YANG MASUK AKAL"
echo "  1. Kalau Redis yang mati: itu yang PALING murah diperbaiki dan"
echo "     paling besar efeknya — beban database langsung turun drastis"
echo "     karena cek sesi tidak lagi menembak database tiap permintaan."
echo "  2. Kalau databasenya sendiri yang lambat: yang menentukan adalah"
echo "     apakah proyek cloud itu sedang dibatasi. Itu terlihat di"
echo "     dashboard Supabase -> Reports."
echo
echo "Kirimkan seluruh keluaran ini. Jangan mengubah pengaturan dulu —"
echo "menebak di database produksi yang sedang sakit memperburuk keadaan."
