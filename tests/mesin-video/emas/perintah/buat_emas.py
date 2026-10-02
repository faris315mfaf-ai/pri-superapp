"""Pembuat berkas "emas" (keluaran acuan) mesin Python untuk uji kesetaraan TS.

Jalankan dengan Python yang punya dependensi autoedit (Pillow, yt-dlp):

    C:\\Users\\Admin\\godam-autoedit\\.venv-uji\\Scripts\\python.exe tests/mesin-video/emas/perintah/buat_emas.py

Hasilnya (dibaca tests/mesin-video/uji-media.mts):
  emas/media/*            media uji kecil (dibuat sekali dengan ffmpeg lavfi)
  emas/perintah/<kasus>.json   argumen _bangun_perintah + total + panggilan teks
  emas/angka.json         format angka Python (.3f/.1f/.0f, repr, round)
  emas/ip.json            ipaddress.ip_address + is_global
  emas/url.json           periksa_url (DNS ditiru)
  emas/ytdlp.json         download_source/preview_source dengan yt-dlp palsu
  emas/fungsi.json        _posisi, _escape_filter, _situs, _pesan_ramah

Path sementara dinormalkan jadi {MEDIA}/{KUKI} supaya bisa dibandingkan.
Kode autoedit/ hanya DIBACA, tidak diubah.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

DIR = Path(__file__).resolve().parent
EMAS = DIR.parent
UJI = EMAS.parent
REPO = UJI.parents[1]
MEDIA_UJI = EMAS / "media"
PALSU = UJI / "palsu-ytdlp.mjs"

AKAR = Path(os.path.realpath(tempfile.mkdtemp(prefix="emas-mesin-video-")))
os.environ["MEDIA_DIR"] = str(AKAR / "media")
os.environ["VIDEO_IG_SESSIONID"] = "sesi-uji"
os.environ["VIDEO_UNDUH_PROXY"] = "http://proxy.uji:8080"
os.environ.pop("REDIS_URL", None)
sys.path.insert(0, str(REPO / "autoedit"))

import video_edit as ve  # noqa: E402

MEDIA = Path(os.path.realpath(ve.MEDIA_DIR))
MEDIA.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------
#  MEDIA UJI
# ------------------------------------------------------------------

X264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p"]
RESEP: dict[str, list[str]] = {
    "sumber.mp4": ["-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=4",
                   "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=4",
                   *X264, "-c:a", "aac", "-shortest"],
    "sumber_bisu.mp4": ["-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=3", *X264],
    "sumber_panjang.mp4": ["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30:duration=8",
                           "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=8",
                           *X264, "-c:a", "aac", "-shortest"],
    "logo.png": ["-f", "lavfi", "-i", "testsrc=size=200x100:rate=1", "-frames:v", "1"],
    "stiker.mp4": ["-f", "lavfi", "-i", "testsrc=size=160x160:rate=30:duration=1.5", *X264],
    "besar.mp4": ["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=1", *X264],
    "besar_alpha.mov": ["-f", "lavfi", "-i", "testsrc=size=1280x720:rate=10:duration=0.5",
                        "-vf", "format=rgba,colorchannelmixer=aa=0.5", "-c:v", "png"],
    "hijau.mp4": ["-f", "lavfi", "-i",
                  "color=c=0x00FF00:size=200x200:rate=30:duration=1,"
                  "drawbox=x=50:y=50:w=100:h=100:color=red:t=fill", *X264],
    "intro.mp4": ["-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30:duration=1.2",
                  "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=44100:duration=1.2",
                  *X264, "-c:a", "aac", "-shortest"],
    "outro_bisu.mp4": ["-f", "lavfi", "-i", "testsrc=size=480x854:rate=30:duration=1", *X264],
    "audio.m4a": ["-f", "lavfi", "-i", "sine=frequency=550:sample_rate=44100:duration=3", "-c:a", "aac"],
}


def siapkan_media_uji() -> None:
    MEDIA_UJI.mkdir(parents=True, exist_ok=True)
    for nama, resep in RESEP.items():
        tujuan = MEDIA_UJI / nama
        if tujuan.is_file():
            continue
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *resep, str(tujuan)], check=True)
    rusak = MEDIA_UJI / "rusak.png"
    if not rusak.is_file():
        rusak.write_bytes(b"bukan gambar sama sekali\n")


def normal(nilai: str) -> str:
    teks = str(nilai)
    for akar in {str(MEDIA), str(MEDIA.resolve())}:
        teks = teks.replace(akar, "{MEDIA}")
    teks = re.sub(r"[^\s\"']*godam-kuki-[^\\/\s\"']+", "{KUKI}", teks)
    # Garis miring terbalik hanya diseragamkan pada PATH. Di filtergraph ia
    # bagian dari sintaks ("between(t\,0.5\,2.0)") dan harus tetap utuh.
    if "{MEDIA}" in teks or "{KUKI}" in teks:
        teks = teks.replace("\\", "/")
    return teks


# ------------------------------------------------------------------
#  PERINTAH FFMPEG
# ------------------------------------------------------------------


def siapkan_template(nama: str, isi: dict) -> dict:
    folder = ve.template_path(nama)
    shutil.rmtree(folder, ignore_errors=True)
    (folder / "assets").mkdir(parents=True)
    for berkas in MEDIA_UJI.iterdir():
        if berkas.is_file():
            shutil.copy2(berkas, folder / "assets" / berkas.name)
    (folder / "template.json").write_text(json.dumps(isi, indent=2), encoding="utf-8")
    return ve.load_template(nama)


def siapkan_sumber() -> Path:
    folder = MEDIA / "sumber"
    folder.mkdir(parents=True, exist_ok=True)
    for nama in ("sumber.mp4", "sumber_bisu.mp4", "sumber_panjang.mp4"):
        shutil.copy2(MEDIA_UJI / nama, folder / nama)
    return folder


def emas_perintah() -> None:
    kasus = json.loads((DIR / "kasus.json").read_text(encoding="utf-8"))["kasus"]
    folder_sumber = siapkan_sumber()
    asli = ve._gambar_teks
    for k in kasus:
        nama = k["nama"]
        template = siapkan_template(nama, k["template"])
        kerja = MEDIA / "kerja" / nama
        shutil.rmtree(kerja, ignore_errors=True)
        kerja.mkdir(parents=True)
        panggilan: list[dict] = []

        def rekam(teks, isi, lebar, tinggi, tujuan):
            panggilan.append({"teks": teks, "isi": isi, "lebar": lebar, "tinggi": tinggi, "tujuan": tujuan.name})
            return asli(teks, isi, lebar, tinggi, tujuan)

        ve._gambar_teks = rekam
        hasil: dict = {"nama": nama}
        try:
            args, total = ve._bangun_perintah(
                template, folder_sumber / k["sumber"], kerja / "output.mp4", k.get("texts") or {}, kerja
            )
            hasil.update({"args": [normal(a) for a in args], "total": total})
        except Exception as error:  # noqa: BLE001 - pesan galat ikut dibandingkan
            hasil.update({"error": str(error), "jenis": type(error).__name__})
        finally:
            ve._gambar_teks = asli
        hasil["teks"] = panggilan
        (DIR / f"{nama}.json").write_text(json.dumps(hasil, indent=1, ensure_ascii=False), encoding="utf-8")
        print("perintah", nama, "galat" if "error" in hasil else len(hasil["args"]))


# ------------------------------------------------------------------
#  ANGKA, IP, URL, FUNGSI KECIL
# ------------------------------------------------------------------

ANGKA = [0.0, -0.0, 0.0625, 0.0005, 0.0015, 2.675, 10.5, 11.5, 12.5, 630 / 60, 750 / 60, 1e16, 1.5e16,
         1e-5, 123456.789, 2.5, 3.5, -2.5, -0.04, 4.0045, 1 / 3, 2 / 3, 0.1 + 0.2, 9.9995, 600 / 60, 1e22,
         5e-324, 1e300, 12.345678, 10.026667, 100.0, 0.25, 1234.5, 99.95, 7.0000000001]


def emas_angka() -> None:
    hasil = []
    for x in ANGKA:
        hasil.append({
            "x": repr(x), "f3": f"{x:.3f}", "f1": f"{x:.1f}", "f0": f"{x:.0f}", "repr": repr(x),
            "round": str(round(x)),
        })
    (EMAS / "angka.json").write_text(json.dumps(hasil, indent=1), encoding="utf-8")


IP = ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.32.0.1", "192.168.1.1", "100.64.0.1", "100.127.255.255",
      "100.128.0.1", "169.254.1.1", "0.0.0.0", "255.255.255.255", "224.0.0.1", "240.0.0.1", "192.0.0.9",
      "192.0.0.8", "192.0.0.171", "192.0.2.1", "198.18.0.1", "203.0.113.5", "8.8.8.8", "157.240.1.1", "::1", "::",
      "::ffff:127.0.0.1", "::ffff:8.8.8.8", "::ffff:100.64.0.1", "fe80::1", "fc00::1", "fd12:3456::1", "2001:db8::1",
      "2002::1", "2001:4860:4860::8888", "ff02::1", "fec0::1", "64:ff9b::808:808", "64:ff9b:1::1", "2001:1::1",
      "2001:1::3", "2001:3::5", "2001::1", "2001:20::1", "3fff::1", "100::1", "::7f00:1", "fe80::1%eth0",
      "fe80::1%", "01.2.3.4", "1.2.3", "1.2.3.4.5", "256.1.1.1", "1::2::3", "::ffff:1.2.3", "1:2:3:4:5:6:7:8",
      "1:2:3:4:5:6:7:8:9", ":1:2:3:4:5:6:7", "1:2:3:4:5:6:7::", "::1.2.3.4", "12345::", "g::1", "2130706433",
      " 1.2.3.4", "1.2.3.4/32", "::1:2:3:4:5:6:7", "1::", "::FFFF:7F00:1", "1.2.3.\u0664"]


def emas_ip() -> None:
    import ipaddress

    hasil = []
    for teks in IP:
        try:
            ip = ipaddress.ip_address(teks)
            hasil.append({"ip": teks, "sah": True, "versi": ip.version, "global": ip.is_global})
        except ValueError:
            hasil.append({"ip": teks, "sah": False})
    (EMAS / "ip.json").write_text(json.dumps(hasil, indent=1, ensure_ascii=False), encoding="utf-8")


DNS = {
    "jebakan.instagram.com": ["10.0.0.5"],
    "cgnat.tiktok.com": ["100.64.1.1"],
    "v6.tiktok.com": ["::1"],
    "mapped.tiktok.com": ["::ffff:127.0.0.1"],
    "ula.tiktok.com": ["fd00::1"],
    "campur.tiktok.com": ["157.240.1.1", "192.168.0.1"],
    "publik6.tiktok.com": ["2a03:2880:f12f:83:face:b00c:0:25de"],
    "mc.tiktok.com": ["224.0.0.1"],
    "localhost": ["127.0.0.1", "::1"],
    "evil.example": ["93.184.216.34"],
    "mati.tiktok.com": None,
}

URL = ["http://127.0.0.1:8000/health", "http://10.0.0.1/a.mp4", "http://localhost/a.mp4", "http://supabase-db:5432/",
       "http://pri-redis:6379/", "file:///etc/passwd", "ftp://instagram.com/a.mp4", "https://evil.example/a.mp4",
       "https://instagram.com.evil.example/reel/x", "https://user:pass@www.instagram.com/reel/x", "http://[::1]/a.mp4",
       "https://jebakan.instagram.com/reel/x", "https://www.instagram.com/reel/ABC123/", "https://vt.tiktok.com/ZS123/",
       "HTTPS://WWW.Instagram.COM/reel/x", "https://instagram.com./reel/x", "https://cgnat.tiktok.com/x",
       "https://v6.tiktok.com/x", "https://mapped.tiktok.com/x", "https://ula.tiktok.com/x",
       "https://campur.tiktok.com/x", "https://publik6.tiktok.com/x", "https://mati.tiktok.com/x",
       "https://mc.tiktok.com/x", "http://[::ffff:127.0.0.1]/", "http://[::1", "http://::1]/", "http://2130706433/",
       "https://www.youtube.com:443/watch?v=1", "  https://vt.tiktok.com/ZS123/  ", "javascript:alert(1)", "", None,
       "https://@instagram.com/reel/x", "https://user@instagram.com/x", "https://instagram.com:pass@evil.example/",
       "//instagram.com/reel/x", "https://\uff49\uff4e\uff53\uff54\uff41\uff47\uff52\uff41\uff4d.com/x",
       "https://instagram.com\u2100.evil/", "https://[v1.abc]/x", "https://[v1.]/x", "https://[1.2.3.4]/x",
       "https://x[::1]/", "https://[::1]x/", "https://www.tik\ttok.com/x", "https://WWW.TIKTOK.COM.:8080/x",
       "https:/www.tiktok.com/x", "https:www.tiktok.com", "1https://www.tiktok.com/x", "\x00\x1f https://youtu.be/x",
       "https://[fe80::1%25eth0]/x", "https://instagram.com#@evil.example/", "https://evil.example\\@instagram.com/"]


def getaddrinfo_tiruan(host, *args, **kwargs):
    alamat = DNS.get(host, ["157.240.1.1"])
    if alamat is None:
        raise socket.gaierror(-2, "Name or service not known")
    return [
        (socket.AF_INET6 if ":" in a else socket.AF_INET, socket.SOCK_STREAM, 6, "", (a, 0))
        for a in alamat
    ]


def coba_url(url) -> dict:
    try:
        return {"url": url, "ok": ve.periksa_url(url)}
    except ve.VideoError as error:
        return {"url": url, "error": str(error)}


def emas_url() -> None:
    hasil = {"bawaan": [coba_url(u) for u in URL]}
    lama = ve.SITUS_DIIZINKAN
    ve.SITUS_DIIZINKAN = ("*",)
    try:
        hasil["semua"] = [coba_url(u) for u in URL]
    finally:
        ve.SITUS_DIIZINKAN = lama
    hasil["dns"] = DNS
    (EMAS / "url.json").write_text(json.dumps(hasil, indent=1, ensure_ascii=False), encoding="utf-8")


POSISI = [None, "W-w", " (H-h)/2 ", "12.7", " -7 ", "1e2", "1_0", "+5", ".5", "5.", "abc", "1;drawtext", "nan",
          "inf", "", 33.9, -5.5, 0, True, 1e20]


def emas_fungsi() -> None:
    posisi = []
    for p in POSISI:
        try:
            posisi.append({"nilai": p, "hasil": ve._posisi(p, "(W-w)/2")})
        except Exception as error:  # noqa: BLE001
            posisi.append({"nilai": p, "error": str(error)})
    escape = [{"nilai": s, "hasil": ve._escape_filter(s)} for s in
              ["C:\\a\\b.png", "a:b'c", "biasa", "x\\:y"]]
    situs = [{"url": u, "hasil": ve._situs(u)} for u in
             ["https://www.instagram.com/reel/x", "https://m.tiktok.com/x", "https://vt.tiktok.com/x",
              "https://youtu.be/x", "https://localhost:8000/", "upload://abc", "https://WWW.X.COM:443/a",
              "http://[::1/", "https://a.b.c.d.example.co.id/"]]
    ramah = [{"teks": t, "hasil": ve._pesan_ramah(t)} for t in
             ["ERROR: Private video", "This account is private", "Video unavailable", "Age-restricted video",
              "ERROR: login required", "Unable to download webpage: x", "Connection refused",
              "content isn't available", "biasa saja", "Sign in to confirm your age"]]
    klip = ve._klip(Path("x.mp4"), 720, 1280, 30, 3, "introv")
    probe = []
    for berkas in sorted(MEDIA_UJI.iterdir()):
        try:
            probe.append({"nama": berkas.name, "hasil": ve.probe(berkas), "alpha": ve._punya_alpha(berkas)})
        except ve.VideoError as error:
            probe.append({"nama": berkas.name, "error": normal(str(error))})
    (EMAS / "fungsi.json").write_text(
        json.dumps({"posisi": posisi, "escape": escape, "situs": situs, "ramah": ramah, "klip": klip, "probe": probe},
                   indent=1, ensure_ascii=False),
        encoding="utf-8",
    )


# ------------------------------------------------------------------
#  yt-dlp PALSU
# ------------------------------------------------------------------


class _Jam:
    """Pengganti modul time di video_edit: sleep dicatat, tidak ditunggu."""

    def __init__(self) -> None:
        self.tidur: list[float] = []

    def __getattr__(self, nama):
        return getattr(time, nama)

    def sleep(self, detik: float) -> None:
        self.tidur.append(detik)


def emas_ytdlp() -> None:
    kasus = json.loads((EMAS / "ytdlp-kasus.json").read_text(encoding="utf-8"))["kasus"]
    kerja = AKAR / "palsu"
    kerja.mkdir(parents=True, exist_ok=True)
    os.environ["PALSU_MEDIA"] = str(MEDIA_UJI)
    os.environ["PALSU_LOG"] = str(kerja / "log.jsonl")
    os.environ["PALSU_STATUS"] = str(kerja / "status")
    os.environ["PALSU_SKENARIO"] = str(kerja / "skenario.json")
    ve._perintah_ytdlp = lambda: ["node", str(PALSU)]
    jam = _Jam()
    ve.time = jam
    unggahan = ve.uploads_dir() / "abc123"
    unggahan.mkdir(parents=True, exist_ok=True)
    shutil.copy2(MEDIA_UJI / "sumber.mp4", unggahan / "source.mp4")

    hasil_semua = []
    for k in kasus:
        (kerja / "skenario.json").write_text(json.dumps(k["respon"]), encoding="utf-8")
        (kerja / "log.jsonl").write_text("", encoding="utf-8")
        (kerja / "status").write_text("0", encoding="utf-8")
        jam.tidur.clear()
        log: list[str] = []
        hasil: dict = {"nama": k["nama"]}
        try:
            if k["aksi"] == "unduh":
                tujuan = ve.jobs_dir() / k["nama"]
                berkas = ve.download_source(k["url"], tujuan, log.append)
                hasil["berkas"] = normal(str(berkas))
                hasil["audio"] = ve.probe(berkas)["has_audio"]
            else:
                hasil["pratinjau"] = ve.preview_source(k["url"])
        except ve.VideoError as error:
            hasil["error"] = str(error)
        argv = [json.loads(b) for b in (kerja / "log.jsonl").read_text(encoding="utf-8").splitlines() if b]
        hasil["argv"] = [[normal(a) for a in baris] for baris in argv]
        hasil["tidur"] = list(jam.tidur)
        hasil["log"] = [normal(b) for b in log]
        hasil_semua.append(hasil)
        print("ytdlp", k["nama"], hasil.get("error", "ok")[:70])
    ve.time = time
    (EMAS / "ytdlp.json").write_text(json.dumps(hasil_semua, indent=1, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    siapkan_media_uji()
    socket_asli = ve.socket.getaddrinfo
    ve.socket.getaddrinfo = getaddrinfo_tiruan
    try:
        emas_perintah()
        emas_angka()
        emas_ip()
        emas_url()
        emas_fungsi()
        emas_ytdlp()
    finally:
        ve.socket.getaddrinfo = socket_asli
        shutil.rmtree(AKAR, ignore_errors=True)
    print("selesai")


if __name__ == "__main__":
    main()
