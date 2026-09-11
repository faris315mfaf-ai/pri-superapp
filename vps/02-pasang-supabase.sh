#!/usr/bin/env bash
# =====================================================================
# LANGKAH 2 — Memasang Supabase (open source) di VPS + HTTPS.
#
# Hasil akhir: https://DOMAIN melayani REST, Storage, Realtime, dan
# Studio — persis seperti Supabase Cloud, tapi milik sendiri.
#
# CARA PAKAI (root, di VPS):
#   DOMAIN=db.domainanda.com bash 02-pasang-supabase.sh
#
# Syarat: DNS A record DOMAIN sudah menunjuk ke IP VPS ini (dicek di
# bawah — kalau belum, skrip berhenti supaya sertifikat HTTPS tidak
# gagal terbit dan kena batas percobaan Let's Encrypt).
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root." >&2; exit 1; }
: "${DOMAIN:?Isi DOMAIN, contoh: DOMAIN=db.domainanda.com bash $0}"

DIR=/opt/pri/supabase
SRC=/opt/pri/supabase-src

echo "== 1/8 Memeriksa DNS =="
# Nama boleh apa saja asal menunjuk ke server ini: nama bawaan Hostinger
# (srvXXXXXXX.hstgr.cloud), subdomain sendiri, atau nama gratis. Yang
# penting cocok, karena sertifikat HTTPS diterbitkan berdasarkan nama.
IP_LOKAL="$( (ip -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1; curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null; echo) | sort -u | grep -v '^$' || true)"
IP_DOM="$(getent ahosts "$DOMAIN" | awk '{print $1}' | sort -u || true)"
echo "Alamat server ini :" $IP_LOKAL
echo "Alamat $DOMAIN :" ${IP_DOM:-'(belum diarahkan)'}
COCOK=0
for a in $IP_DOM; do
  for b in $IP_LOKAL; do [ "$a" = "$b" ] && COCOK=1; done
done
if [ "$COCOK" -ne 1 ]; then
  echo >&2
  echo "DNS belum menunjuk ke server ini, sertifikat HTTPS pasti gagal terbit." >&2
  echo "Arahkan $DOMAIN ke salah satu alamat di atas, tunggu 5-15 menit, lalu ulangi." >&2
  exit 1
fi
# Kalau ada alamat IPv6 milik orang lain, Let's Encrypt bisa mencobanya
# lebih dulu lalu gagal. Cukup diperingatkan, bukan dihentikan.
for a in $IP_DOM; do
  case "$a" in
    *:*)
      punya=0
      for b in $IP_LOKAL; do [ "$a" = "$b" ] && punya=1; done
      [ "$punya" -eq 0 ] && echo "PERINGATAN: alamat IPv6 $a bukan milik server ini — hapus AAAA record bila HTTPS gagal." >&2
      ;;
  esac
done

echo "== 2/8 Mengunduh paket Supabase =="
if [ ! -d "$DIR" ]; then
  rm -rf "$SRC"
  git clone --filter=blob:none --no-checkout --depth 1 https://github.com/supabase/supabase "$SRC"
  git -C "$SRC" sparse-checkout set --cone docker
  git -C "$SRC" checkout
  cp -r "$SRC/docker" "$DIR"
  cp "$DIR/.env.example" "$DIR/.env"
fi
cd "$DIR"

echo "== 3/8 Menentukan versi PostgreSQL 17 (samakan dengan Supabase Cloud) =="
# Supabase Cloud proyek ini memakai PostgreSQL 17.6. Kalau VPS memakai
# versi lebih rendah, hasil pg_dump 17 GAGAL dipulihkan. Tag diambil
# otomatis dari Docker Hub supaya tidak salah tulis.
PG_TAG="$(curl -fsS 'https://hub.docker.com/v2/repositories/supabase/postgres/tags?page_size=100&name=17.' \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
def kunci(t):
    return [int(x) for x in t.split('.') if x.isdigit()]
tag = [t['name'] for t in d.get('results', []) if t['name'].startswith('17.')]
print(sorted(tag, key=kunci)[-1] if tag else '')
")"
[ -n "$PG_TAG" ] || { echo "Gagal membaca versi PostgreSQL 17 dari Docker Hub." >&2; exit 1; }
echo "Memakai supabase/postgres:$PG_TAG"

echo "== 4/8 Membuat kunci rahasia =="
acak() { openssl rand -hex "$1"; }
buat_jwt() {
  python3 - "$1" "$2" <<'PY'
import base64, hmac, hashlib, json, sys, time
peran, rahasia = sys.argv[1], sys.argv[2]
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
kepala = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
kini = int(time.time())
isi = b64(json.dumps({"role": peran, "iss": "supabase", "iat": kini,
                      "exp": kini + 10 * 365 * 24 * 3600}, separators=(",", ":")).encode())
pesan = f"{kepala}.{isi}".encode()
tanda = b64(hmac.new(rahasia.encode(), pesan, hashlib.sha256).digest())
print(f"{kepala}.{isi}.{tanda}")
PY
}
if [ -f /opt/pri/kunci.txt ]; then
  echo "Kunci sudah pernah dibuat — memakai yang lama (/opt/pri/kunci.txt)."
  # shellcheck disable=SC1091
  . /opt/pri/kunci.env
else
  PG_PASS="$(acak 24)"
  JWT_SECRET="$(acak 32)"
  ANON_KEY="$(buat_jwt anon "$JWT_SECRET")"
  SERVICE_KEY="$(buat_jwt service_role "$JWT_SECRET")"
  SECRET_KEY_BASE="$(acak 32)"
  VAULT_ENC_KEY="$(acak 16)"
  DASH_PASS="$(acak 12)"
  umask 077
  cat > /opt/pri/kunci.env <<EOF
PG_PASS='$PG_PASS'
JWT_SECRET='$JWT_SECRET'
ANON_KEY='$ANON_KEY'
SERVICE_KEY='$SERVICE_KEY'
SECRET_KEY_BASE='$SECRET_KEY_BASE'
VAULT_ENC_KEY='$VAULT_ENC_KEY'
DASH_PASS='$DASH_PASS'
EOF
fi
export PG_PASS JWT_SECRET ANON_KEY SERVICE_KEY SECRET_KEY_BASE VAULT_ENC_KEY DASH_PASS DOMAIN

echo "== 5/8 Menulis konfigurasi (.env) =="
python3 - <<'PY'
import os, re, pathlib
berkas = pathlib.Path("/opt/pri/supabase/.env")
domain = os.environ["DOMAIN"]
ubah = {
    "POSTGRES_PASSWORD": os.environ["PG_PASS"],
    "JWT_SECRET": os.environ["JWT_SECRET"],
    "ANON_KEY": os.environ["ANON_KEY"],
    "SERVICE_ROLE_KEY": os.environ["SERVICE_KEY"],
    "SECRET_KEY_BASE": os.environ["SECRET_KEY_BASE"],
    "VAULT_ENC_KEY": os.environ["VAULT_ENC_KEY"],
    "DASHBOARD_USERNAME": "admin",
    "DASHBOARD_PASSWORD": os.environ["DASH_PASS"],
    "SITE_URL": f"https://{domain}",
    "API_EXTERNAL_URL": f"https://{domain}",
    "SUPABASE_PUBLIC_URL": f"https://{domain}",
    # Batas unggah 200 MB. Bawaan self-host cuma 50 MB, dan aplikasi ini
    # sudah memakai video sampai 75 MB (bucket tvrku).
    "FILE_SIZE_LIMIT": "209715200",
    # Login pengguna TIDAK memakai Auth Supabase (aplikasi punya sesi
    # sendiri), jadi pendaftaran lewat GoTrue dimatikan.
    "DISABLE_SIGNUP": "true",
    "ENABLE_EMAIL_SIGNUP": "false",
    "ENABLE_ANONYMOUS_USERS": "false",
    "STUDIO_DEFAULT_ORGANIZATION": "PRI",
    "STUDIO_DEFAULT_PROJECT": "PRI SuperApp",
    "POOLER_TENANT_ID": "pri",
    "KONG_HTTP_PORT": "8000",
}
baris, sudah, keluar = berkas.read_text().splitlines(), set(), []
for b in baris:
    m = re.match(r"^([A-Z0-9_]+)=", b)
    if m and m.group(1) in ubah:
        keluar.append(f"{m.group(1)}={ubah[m.group(1)]}")
        sudah.add(m.group(1))
    else:
        keluar.append(b)
for k, v in ubah.items():
    if k not in sudah:
        keluar.append(f"{k}={v}")
berkas.write_text("\n".join(keluar) + "\n")
print("  .env ditulis:", len(ubah), "nilai")
PY

echo "== 6/8 Mengunci port ke localhost =="
# PENTING: port yang dipublikasikan Docker MENEMBUS ufw. Kalau dibiarkan,
# Postgres dan Kong terbuka ke internet. Berkas override ini memaksa
# semua port hanya mendengar di 127.0.0.1; internet cuma lewat Caddy.
PG_TAG="$PG_TAG" python3 - <<'PY'
import json, os, subprocess, pathlib
cfg = json.loads(subprocess.check_output(
    ["docker", "compose", "config", "--format", "json"], cwd="/opt/pri/supabase"))
layanan = {}
for nama, s in cfg.get("services", {}).items():
    port = s.get("ports") or []
    if not port:
        continue
    daftar = []
    for p in port:
        if isinstance(p, dict):
            daftar.append(f"127.0.0.1:{p.get('published')}:{p.get('target')}/{p.get('protocol', 'tcp')}")
        else:
            daftar.append(f"127.0.0.1:{p}")
    layanan.setdefault(nama, {})["ports"] = daftar
# Versi PostgreSQL disamakan dengan Supabase Cloud. Ditulis ke layanan
# "db" yang SAMA dengan blok port di atas — kalau ditulis terpisah, YAML
# punya dua kunci "db" dan penguncian portnya hilang diam-diam.
layanan.setdefault("db", {})["image"] = f"supabase/postgres:{os.environ['PG_TAG']}"
# Gerbang (Kong) menolak unggahan besar dengan galat 413 kalau batas
# bawaannya dibiarkan. Video di aplikasi ini bisa 75 MB.
layanan.setdefault("kong", {})["environment"] = {"KONG_NGINX_PROXY_CLIENT_MAX_BODY_SIZE": "210m"}

# ---------------------------------------------------------------
# PENYETELAN MEMORI POSTGRESQL (11 Sep 2026)
#
# Bawaan paket Supabase self-host disetel untuk mesin kecil. Di VPS
# 32 GB, PostgreSQL yang tidak disetel hanya memakai sebagian kecil
# RAM: kueri jadi membaca disk padahal seluruh database (277 MB)
# sebenarnya muat di memori berkali-kali lipat.
#
# Angka dihitung dari RAM yang BENAR-BENAR terpasang, bukan ditulis
# mati, supaya skrip ini tetap benar kalau VPS-nya diganti ukuran.
# Sisakan ruang untuk layanan lain (Kong, Storage, Realtime, Studio)
# dan untuk cache berkas milik kernel.
# ---------------------------------------------------------------
with open("/proc/meminfo") as f:
    ram_mb = int([b for b in f if b.startswith("MemTotal")][0].split()[1]) // 1024
inti = os.cpu_count() or 2
# Layanan non-database di server ini kira-kira butuh segini.
sisa_layanan_mb = 4096
ram_db_mb = max(1024, ram_mb - sisa_layanan_mb)
shared_mb = max(256, int(ram_db_mb * 0.25))          # halaman data yang dipegang PostgreSQL
cache_mb = max(512, int(ram_db_mb * 0.70))           # perkiraan cache total (dipakai perencana kueri)
maint_mb = min(2048, max(128, ram_db_mb // 16))      # untuk VACUUM, CREATE INDEX, pg_restore
maks_koneksi = 200
# Patokan umum: (RAM x 25%) dibagi jumlah koneksi maksimum. Dibatasi
# 32 MB supaya lonjakan kueri berat serentak tidak menghabiskan RAM.
work_mb = max(4, min(32, (ram_db_mb // 4) // maks_koneksi))
paralel = max(1, min(8, inti))
setelan = {
    "max_connections": str(maks_koneksi),
    "shared_buffers": f"{shared_mb}MB",
    "effective_cache_size": f"{cache_mb}MB",
    "maintenance_work_mem": f"{maint_mb}MB",
    "work_mem": f"{work_mb}MB",
    # Penyimpanan VPS memakai SSD/NVMe: membaca acak hampir semurah berurutan.
    "random_page_cost": "1.1",
    "effective_io_concurrency": "200",
    "max_worker_processes": str(paralel),
    "max_parallel_workers": str(paralel),
    "max_parallel_workers_per_gather": str(max(2, paralel // 2)),
    "max_parallel_maintenance_workers": str(max(2, paralel // 2)),
    # Checkpoint lebih jarang & lebih halus = tidak ada hentakan tulis.
    "wal_buffers": "16MB",
    "min_wal_size": "1GB",
    "max_wal_size": "4GB",
    "checkpoint_completion_target": "0.9",
    # Kueri yang lebih lambat dari 2 detik dicatat supaya bisa ditelusuri.
    "log_min_duration_statement": "2000",
}
perintah = list(cfg["services"].get("db", {}).get("command") or [])
if not perintah:
    # Jaga-jaga bila paket Supabase berubah: jalankan postgres apa adanya.
    perintah = ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
for k, v in setelan.items():
    perintah += ["-c", f"{k}={v}"]
layanan.setdefault("db", {})["command"] = perintah
# /dev/shm bawaan Docker hanya 64 MB. Kueri paralel PostgreSQL memakai
# memori bersama ini dan akan gagal dengan galat "No space left on
# device" yang menyesatkan kalau dibiarkan sekecil itu.
layanan["db"]["shm_size"] = "2gb"
print(f"  RAM terbaca {ram_mb} MB, {inti} inti -> shared_buffers {shared_mb}MB, "
      f"cache {cache_mb}MB, work_mem {work_mb}MB, maks koneksi {maks_koneksi}")
isi = ["# Dibuat otomatis oleh 02-pasang-supabase.sh — jangan diedit tangan.",
       "services:"]
for nama, nilai in layanan.items():
    isi.append(f"  {nama}:")
    if "image" in nilai:
        isi.append(f"    image: {nilai['image']}")
    if "shm_size" in nilai:
        isi.append(f"    shm_size: \"{nilai['shm_size']}\"")
    if "environment" in nilai:
        isi.append("    environment:")
        for k, v in nilai["environment"].items():
            isi.append(f'      {k}: "{v}"')
    if "command" in nilai:
        isi.append("    command: !override")
        for c in nilai["command"]:
            isi.append(f'      - "{c}"')
    if "ports" in nilai:
        isi.append("    ports: !override")
        for d in nilai["ports"]:
            isi.append(f'      - "{d}"')
isi.append("")
pathlib.Path("/opt/pri/supabase/docker-compose.override.yml").write_text("\n".join(isi))
kunci_port = [n for n, v in layanan.items() if "ports" in v]
print("  layanan yang portnya dikunci:", ", ".join(kunci_port) or "(tidak ada)")
PY
docker compose config >/dev/null || {
  echo "Konfigurasi Docker tidak valid. Cek versi Compose (butuh v2.24+ untuk '!override'):" >&2
  docker compose version >&2
  exit 1
}
# Verifikasi: tidak boleh ada port yang mendengar selain 127.0.0.1
docker compose config --format json | python3 -c "
import json, sys
cfg = json.load(sys.stdin)
buruk = []
for nama, s in cfg.get('services', {}).items():
    for p in s.get('ports') or []:
        ip = p.get('host_ip') if isinstance(p, dict) else ''
        if ip not in ('127.0.0.1',):
            buruk.append(f\"{nama}:{p}\")
if buruk:
    print('PORT TERBUKA KE INTERNET:', buruk); sys.exit(1)
print('  semua port aman (127.0.0.1 saja)')
"

echo "== 7/8 Menyalakan Supabase =="
# Server ini bisa sudah memakai port yang sama untuk aplikasi lain
# (mis. PostgreSQL sendiri di 5432). Kalau bentrok, `docker compose up`
# gagal dengan pesan yang membingungkan — jadi diperiksa lebih dulu,
# lengkap dengan siapa pemakainya.
BENTROK=""
for P in 5432 8000 8443 4000; do
  PEMAKAI="$(ss -tlnp 2>/dev/null | awk -v p=":$P\$" '$4 ~ p {print $NF}' | head -1)"
  if [ -n "$PEMAKAI" ]; then
    # Milik Supabase sendiri (sisa percobaan sebelumnya) tidak dihitung.
    if docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -q "supabase.*:$P->"; then
      echo "  port $P sudah dipakai Supabase sendiri — tidak apa-apa."
    else
      BENTROK="$BENTROK $P($PEMAKAI)"
    fi
  fi
done
if [ -n "$BENTROK" ]; then
  echo >&2
  echo "Port berikut sudah dipakai program lain di server ini:$BENTROK" >&2
  echo "Supabase butuh 5432, 8000, 8443, dan 4000 di dalam server." >&2
  echo "Hentikan program itu, atau pindahkan portnya, lalu ulangi." >&2
  exit 1
fi
echo "  port yang dibutuhkan semuanya bebas"
docker compose pull
docker compose up -d
echo -n "Menunggu API siap"
for i in $(seq 1 60); do
  kode="$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON_KEY" http://127.0.0.1:8000/rest/v1/ || true)"
  if [ "$kode" = "200" ]; then echo " OK"; break; fi
  echo -n "."; sleep 5
  [ "$i" = "60" ] && { echo; echo "API belum siap. Cek: docker compose -f $DIR/docker-compose.yml logs --tail=50" >&2; exit 1; }
done

echo "== 8/8 HTTPS (Caddy) =="
# Server ini melayani lebih dari satu situs, jadi Caddyfile TIDAK boleh
# ditimpa. Caranya ditulis sekali di blok-caddy.sh dan dipakai bersama
# skrip pemasang aplikasi.
. "$(dirname "$0")/blok-caddy.sh"
cat > /tmp/blok-supabase.caddy <<EOF
$DOMAIN {
	encode zstd gzip
	# Video sampai 200 MB harus lolos (bucket tvrku).
	request_body {
		max_size 210MB
	}
	reverse_proxy 127.0.0.1:8000 {
		transport http {
			read_timeout 600s
			write_timeout 600s
		}
	}
}
EOF
pasang_blok_caddy "PRI Supabase" /tmp/blok-supabase.caddy || exit 1
lapor_situs_caddy "$DOMAIN"
sleep 5
curl -s -o /dev/null -w "HTTPS %{http_code}\n" -H "apikey: $ANON_KEY" "https://$DOMAIN/rest/v1/"

umask 077
cat > /opt/pri/kunci.txt <<EOF
=== ISI KE VERCEL (Environment Variables) ===
SUPABASE_URL=https://$DOMAIN
SUPABASE_SECRET_KEY=$SERVICE_KEY
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY

=== UNTUK ADMIN (jangan dibagikan) ===
Studio     : https://$DOMAIN  (user: admin, sandi: $DASH_PASS)
Sandi DB   : $PG_PASS
JWT secret : $JWT_SECRET
EOF
echo
echo "SELESAI. Kunci tersimpan di /opt/pri/kunci.txt (tampilkan: cat /opt/pri/kunci.txt)"
echo "Lanjut: LANGKAH 3 — pindahkan data (03-pindah-data.sh)."
