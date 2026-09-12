#!/usr/bin/env bash
# =====================================================================
# LANGKAH 8 (nanti, opsional) — pindah dari nama sementara ke domain
# sendiri, misalnya dari srv1954653.hstgr.cloud ke db.domainanda.com.
#
# Yang dikerjakan:
#   1. Memastikan domain baru sudah menunjuk ke server ini.
#   2. Mengubah pengaturan Supabase ke nama baru.
#   3. Membuat HTTPS untuk nama BARU, sambil TETAP melayani nama LAMA
#      (supaya alamat berkas lama tidak mati di tengah peralihan).
#   4. Menulis ulang alamat berkas yang tersimpan di database.
#   5. Menampilkan nilai baru untuk disalin ke Vercel.
#
# CARA PAKAI (root, di VPS):
#   DOMAIN_LAMA=srv1954653.hstgr.cloud DOMAIN_BARU=db.domainanda.com \
#     bash /opt/pri/skrip/08-ganti-domain.sh
#
# Setelah aplikasi di Vercel memakai nama baru dan semua normal
# (tunggu beberapa hari), nama lama boleh dihapus dari /etc/caddy/Caddyfile.
# =====================================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root." >&2; exit 1; }
: "${DOMAIN_LAMA:?Isi DOMAIN_LAMA, nama yang dipakai sekarang}"
: "${DOMAIN_BARU:?Isi DOMAIN_BARU, domain baru Anda}"
DIR=/opt/pri/supabase
# shellcheck disable=SC1091
. /opt/pri/kunci.env
TUJUAN="postgresql://postgres:${PG_PASS}@localhost:5432/postgres"
cd "$DIR"

echo "== 1/5 Memeriksa DNS domain baru =="
IP_LOKAL="$( (ip -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1; curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null; echo) | sort -u | grep -v '^$' || true)"
IP_DOM="$(getent ahosts "$DOMAIN_BARU" | awk '{print $1}' | sort -u || true)"
COCOK=0
for a in $IP_DOM; do for b in $IP_LOKAL; do [ "$a" = "$b" ] && COCOK=1; done; done
[ "$COCOK" -eq 1 ] || { echo "$DOMAIN_BARU belum menunjuk ke server ini." >&2; exit 1; }
echo "DNS cocok."

echo "== 2/5 Mengubah pengaturan Supabase =="
DOMAIN_BARU="$DOMAIN_BARU" python3 - <<'PY'
import os, re, pathlib
berkas = pathlib.Path("/opt/pri/supabase/.env")
baru = f"https://{os.environ['DOMAIN_BARU']}"
ubah = {"SITE_URL": baru, "API_EXTERNAL_URL": baru, "SUPABASE_PUBLIC_URL": baru}
keluar = []
for b in berkas.read_text().splitlines():
    m = re.match(r"^([A-Z0-9_]+)=", b)
    keluar.append(f"{m.group(1)}={ubah[m.group(1)]}" if m and m.group(1) in ubah else b)
berkas.write_text("\n".join(keluar) + "\n")
print("  .env diperbarui ke", baru)
PY
docker compose up -d
sleep 5

echo "== 3/5 HTTPS untuk nama baru (nama lama tetap dilayani) =="
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN_BARU, $DOMAIN_LAMA {
	encode zstd gzip
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
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
sleep 8
curl -s -o /dev/null -w "HTTPS nama baru: %{http_code}\n" -H "apikey: $ANON_KEY" "https://$DOMAIN_BARU/rest/v1/"
curl -s -o /dev/null -w "HTTPS nama lama: %{http_code}\n" -H "apikey: $ANON_KEY" "https://$DOMAIN_LAMA/rest/v1/"

echo "== 4/5 Menulis ulang alamat berkas di database =="
docker compose exec -T db psql "$TUJUAN" -v ON_ERROR_STOP=1 \
  -v lama="https://$DOMAIN_LAMA" -v baru="https://$DOMAIN_BARU" <<'SQL'
begin;
update public.tvrku_post        set video_url  = replace(video_url,  :'lama', :'baru') where video_url  like '%' || :'lama' || '%';
update public.studio_proyek_item set sumber_url = replace(sumber_url, :'lama', :'baru') where sumber_url like '%' || :'lama' || '%';
update public.studio_proyek      set sumber_url = replace(sumber_url, :'lama', :'baru') where sumber_url like '%' || :'lama' || '%';
update public.app_user           set avatar_url = replace(avatar_url, :'lama', :'baru') where avatar_url like '%' || :'lama' || '%';
update public.tvr_banned         set bukti_url  = replace(bukti_url,  :'lama', :'baru') where bukti_url  like '%' || :'lama' || '%';
update public.profil_foto        set url        = replace(url,        :'lama', :'baru') where url        like '%' || :'lama' || '%';
select 'sisa alamat lama' as cek,
  (select count(*) from public.tvrku_post where video_url like '%' || :'lama' || '%')
+ (select count(*) from public.studio_proyek_item where sumber_url like '%' || :'lama' || '%')
+ (select count(*) from public.studio_proyek where sumber_url like '%' || :'lama' || '%')
+ (select count(*) from public.app_user where avatar_url like '%' || :'lama' || '%')
+ (select count(*) from public.tvr_banned where bukti_url like '%' || :'lama' || '%')
+ (select count(*) from public.profil_foto where url like '%' || :'lama' || '%') as jumlah;
commit;
SQL

echo "== 5/5 Nilai baru untuk Vercel =="
cat <<EOF

SUPABASE_URL=https://$DOMAIN_BARU
SUPABASE_SECRET_KEY=$SERVICE_KEY
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY

Ganti di Vercel > Settings > Environment Variables (Production), lalu
tayangkan ulang aplikasinya. Nama lama masih dilayani, jadi aplikasi
tetap hidup selama peralihan.
EOF
