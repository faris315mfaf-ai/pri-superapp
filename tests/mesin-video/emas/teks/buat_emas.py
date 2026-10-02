"""Pembuat data emas (golden) paritas perender teks, komposit, deteksi, dan
_rapikan_gambar — dijalankan di container produksi (Pillow 12.3 + libraqm),
BUKAN di venv Windows lokal (Pillow tanpa raqm memberi lebar teks bulat).

Cara pakai (hanya-baca terhadap layanan; semua keluaran di /tmp/paritas-teks):

    ssh -o BatchMode=yes pri-vps 'mkdir -p /tmp/paritas-teks && docker exec -i \
        -e MEDIA_DIR=/tmp/paritas-teks/media -w /app pri-autoedit-api python -' \
        < tests/mesin-video/emas/teks/buat_emas.py
    ssh pri-vps 'docker exec pri-autoedit-api tar -C /tmp/paritas-teks/emas -cf - .' \
        | tar -xf - -C tests/mesin-video/emas/teks
    ssh pri-vps 'docker exec pri-autoedit-api rm -rf /tmp/paritas-teks'

Fungsi asli dipanggil apa adanya. Tata letak direkam dengan membungkus
ImageDraw.text/rectangle selama pemanggilan (posisi, isi, ukuran font, warna),
jadi yang dibandingkan adalah keluaran kode produksi, bukan salinannya.
"""

from __future__ import annotations

import ast
import json
import logging
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, "/app")
assert os.environ.get("MEDIA_DIR", "").startswith("/tmp/paritas-teks"), "MEDIA_DIR wajib di /tmp/paritas-teks"

from PIL import Image, ImageDraw, ImageFont, features  # noqa: E402

import video_edit as ve  # noqa: E402

AKAR = Path("/tmp/paritas-teks")
KELUAR = AKAR / "emas"
shutil.rmtree(KELUAR, ignore_errors=True)
KELUAR.mkdir(parents=True)
(KELUAR / "png").mkdir()
KERJA = AKAR / "kerja"
shutil.rmtree(KERJA, ignore_errors=True)
KERJA.mkdir(parents=True)

FONT = ve._font()

# ------------------------------------------------------------------
#  Perekam panggilan ImageDraw
# ------------------------------------------------------------------
REKAM: list[dict] = []
_teks_asli = ImageDraw.ImageDraw.text
_kotak_asli = ImageDraw.ImageDraw.rectangle


def _daftar(v):
    return list(v) if isinstance(v, (tuple, list)) else v


def teks_rekam(self, xy, text, fill=None, font=None, *a, **k):
    REKAM.append({
        "op": "text",
        "xy": [float(xy[0]), float(xy[1])],
        "teks": text,
        "ukuran": getattr(font, "size", None),
        "fill": _daftar(fill),
        "stroke": k.get("stroke_width", 0),
        "stroke_fill": _daftar(k.get("stroke_fill")),
    })
    return _teks_asli(self, xy, text, fill, font, *a, **k)


def kotak_rekam(self, xy, *a, **k):
    REKAM.append({"op": "rect", "xy": [float(v) for v in xy], "fill": _daftar(k.get("fill"))})
    return _kotak_asli(self, xy, *a, **k)


ImageDraw.ImageDraw.text = teks_rekam
ImageDraw.ImageDraw.rectangle = kotak_rekam


class Tangkap(logging.Handler):
    def __init__(self):
        super().__init__()
        self.pesan: list[str] = []

    def emit(self, record):
        self.pesan.append(record.getMessage())


TANGKAP = Tangkap()
ve.logger.addHandler(TANGKAP)

# ------------------------------------------------------------------
#  Kasus lapisan teks
# ------------------------------------------------------------------
PANJANG = (
    "VIRAL! KONTROVERSI KARNAVAL DI PEKALONGAN: WARGA MENILAI KOSTUM PESERTA TERLALU "
    "BERLEBIHAN, PANITIA MINTA MAAF DAN BERJANJI MENGEVALUASI SELURUH RANGKAIAN ACARA TAHUN DEPAN"
)
SANGAT_PANJANG = (PANJANG + " ") * 3
KOTAK = {"x": 60, "y": 1380, "w": 960, "h": 320}

KASUS: list[dict] = []


def kasus(nama, gaya, teks, isi, lebar=1080, tinggi=1920, png=False):
    t = dict(teks)
    if gaya:
        t["style"] = gaya
    KASUS.append({"id": nama, "teks": t, "isi": isi, "lebar": lebar, "tinggi": tinggi, "png": png})


# --- berita (tata letak) ---
kasus("berita-pendek-kotak", "berita", {"box": KOTAK}, "VIRAL! WARGA HEBOH", png=True)
kasus("berita-panjang-kotak", "berita", {"box": KOTAK}, PANJANG, png=True)
kasus("berita-sangat-panjang-kotak", "berita", {"box": KOTAK}, SANGAT_PANJANG)
kasus("berita-rata-kiri", "berita", {"box": KOTAK, "align": "left"}, PANJANG)
kasus("berita-rata-tengah", "berita", {"box": KOTAK, "align": "center"}, PANJANG, png=True)
kasus("berita-rata-kanan", "berita", {"box": KOTAK, "align": "RIGHT "}, PANJANG)
kasus("berita-justify-eksplisit", "berita", {"box": KOTAK, "align": "justify"}, PANJANG)
kasus("berita-rata-tak-dikenal", "berita", {"box": KOTAK, "align": "middle"}, PANJANG)
kasus("berita-tanpa-kotak-xy", "berita", {"x": 80, "y": 1500, "width": 900, "color": "white"}, PANJANG, png=True)
kasus("berita-tanpa-kotak-tengah", "berita", {"x": 40}, PANJANG)
kasus("berita-tanpa-x", "berita", {}, "BERITA TANPA POSISI APA PUN")
kasus("berita-size60-max2", "berita", {"box": KOTAK, "size": 60, "max_lines": 2}, PANJANG)
kasus("berita-lh14", "berita", {"box": KOTAK, "line_height": 1.4}, PANJANG)
kasus("berita-lh10-min30", "berita", {"box": KOTAK, "line_height": 1.0, "min_size": 30}, PANJANG)
kasus("berita-lh-tak-valid", "berita", {"box": KOTAK, "line_height": "abc"}, PANJANG)
kasus("berita-kata-raksasa", "berita", {"box": {"x": 100, "y": 1400, "w": 400, "h": 200}},
      "SUPERKALIFRAGILISTIKEKSPIALIDOSIUSBANGETSEKALI ADALAH KATA")
kasus("berita-max1-potong", "berita", {"x": 50, "y": 100, "width": 600, "max_lines": 1, "name": "hook"}, PANJANG)
kasus("berita-kotak-kecil-susut", "berita", {"box": {"x": 40, "y": 1500, "w": 500, "h": 120}}, SANGAT_PANJANG)
kasus("berita-kotak-string", "berita", {"box": {"x": "60", "y": "1380", "w": "960", "h": "320"}}, PANJANG)
kasus("berita-kotak-rusak", "berita", {"box": {"x": 60, "y": 1380, "w": 960}, "x": 30, "y": 300}, PANJANG)
kasus("berita-size-string", "berita", {"box": KOTAK, "size": "44"}, PANJANG)
kasus("berita-unicode", "berita", {"box": KOTAK, "kicker_color": "#1e90ff"},
      "ÉKSKLUSIF! “Kami tidak tahu” — kata warga… Rp 2.500.000, café & résumé ½ ©2026")
kasus("berita-spasi-campur", "berita", {"box": KOTAK}, "  VIRAL!\tKATA \n\n DIPISAH SPASI   ANEH  ")
kasus("berita-kanvas-720", "berita", {"box": {"x": 40, "y": 900, "w": 640, "h": 220}}, PANJANG, 720, 1280)
kasus("berita-width-raksasa", "berita", {"x": 100, "width": 5000, "y": 50}, PANJANG)
kasus("berita-angka", "berita", {"box": KOTAK, "size": 30}, "2026: 1.234 KASUS, 56% NAIK (DATA 12/09) — #CEKFAKTA?")
kasus("berita-max3-tinggi", "berita", {"box": {"x": 60, "y": 1000, "w": 960, "h": 700}, "max_lines": 3}, SANGAT_PANJANG)
kasus("berita-contoh-pratinjau", "berita", {"box": KOTAK, "color": "white"},
      "VIRAL! CONTOH TULISAN BERITA UNTUK MELIHAT LETAK DAN UKURANNYA")
kasus("berita-size-besar", "berita", {"box": KOTAK, "size": 90, "min_size": 50}, PANJANG)
kasus("berita-kosong", "berita", {"box": KOTAK}, "   ")
kasus("berita-warna-alpha", "berita", {"box": KOTAK, "color": "white@0.5", "kicker_color": "yellow"}, "VIRAL! WARNA SETENGAH")

# --- kategori ---
for i, (tb, kata) in enumerate([
    ({"x": 60, "y": 1380, "w": 960, "h": 320}, "news"),
    ({"x": 60, "y": 1380, "w": 960, "h": 320}, "HIBURAN"),
    ({"x": 40, "y": 1500, "w": 600, "h": 200}, "SHOWBIZ"),
    ({"x": 40, "y": 1500, "w": 600, "h": 140}, "OLAHRAGA"),
    ({"x": 30, "y": 900, "w": 660, "h": 220}, "POLITIK"),
    ({"x": 60, "y": 1380, "w": 960, "h": 260}, "BREAKING NEWS"),
    ({"x": 60, "y": 1380, "w": 960, "h": 320}, "INTERNASIONAL"),
    ({"x": 60, "y": 1380, "w": 400, "h": 300}, "KESEHATAN"),
    ({"x": 60, "y": 1380, "w": 960, "h": 320}, "cek fakta!"),
    ({"x": 60, "y": 1380, "w": 960, "h": 320}, "2026"),
]):
    kasus(f"kategori-{i}", "kategori", {"box": ve.kotak_kategori_bawaan(tb), "color": "white"}, kata,
          png=(i in (0, 3)))
kasus("kategori-size", "kategori", {"box": {"x": 100, "y": 200, "w": 300, "h": 70}, "size": 40}, "VIRAL")
kasus("kategori-tanpa-kotak", "kategori", {}, "NEWS")
kasus("kategori-badge-besar", "kategori", {"box": {"x": 100, "y": 200, "w": 700, "h": 90}}, "DAERAH")

# --- teks biasa ---
kasus("biasa-tengah", "", {"size": 56, "y": 200}, "Judul Biasa Di Tengah Layar", png=True)
kasus("biasa-garis", "", {"size": 64, "stroke": 4, "stroke_color": "black", "color": "yellow", "y": 400},
      "TEKS DENGAN GARIS TEPI TEBAL YANG PANJANG SEKALI", png=True)
kasus("biasa-kotak", "", {"size": 40, "box": True, "box_color": "#000000@0.6", "box_padding": 20, "y": 1600},
      "SUMBER: KOMPAS.COM", png=True)
kasus("biasa-kiri-multibaris", "", {"size": 36, "align": "left", "line_spacing": 20, "max_width": 0.5},
      "Baris pertama cukup panjang untuk dipenggal\nBaris kedua\n\nBaris keempat sesudah kosong")
kasus("biasa-kanan", "", {"size": 48, "align": "right", "y": 50}, "Rata kanan")
kasus("biasa-x-kotak", "", {"size": 30, "x": 100, "y": 300, "box": True}, "Kotak dengan x tetap\nDua baris")
kasus("biasa-garis-sama-warna", "", {"size": 50, "stroke": 3, "stroke_color": "white", "y": 700}, "GARIS SEWARNA")

hasil_kasus = []
for k in KASUS:
    REKAM.clear()
    TANGKAP.pesan.clear()
    tujuan = KERJA / f"{k['id']}.png"
    ve._gambar_teks(dict(k["teks"]), k["isi"], k["lebar"], k["tinggi"], tujuan)
    entri = {**k, "rekam": list(REKAM), "log": list(TANGKAP.pesan)}
    if k["png"]:
        shutil.copy(tujuan, KELUAR / "png" / f"{k['id']}.png")
    # Kotak tinta (textbbox) badge kategori pada ukuran akhir — untuk cek ±1 px.
    if k["teks"].get("style") == "kategori" and REKAM:
        r = REKAM[0]
        font = ImageFont.truetype(FONT, r["ukuran"])
        kanvas = Image.new("RGBA", (10, 10))
        entri["kotak_tinta"] = list(ImageDraw.Draw(kanvas).textbbox((0, 0), r["teks"], font=font))
    hasil_kasus.append(entri)

# ------------------------------------------------------------------
#  Metrik font mentah
# ------------------------------------------------------------------
HURUF = [chr(c) for c in range(32, 127)] + list("éèáàüöÉÀ“”‘’—–…©®°±×÷€£¥ñÑçÇ")
metrik = {"asc": {}, "lebar": {}, "huruf": HURUF}
for s in range(6, 201):
    f = ImageFont.truetype(FONT, s)
    metrik["asc"][s] = f.getmetrics()[0]
for s in (8, 10, 13, 17, 22, 28, 30, 34, 38, 45, 56, 64, 80, 100, 128, 160):
    f = ImageFont.truetype(FONT, s)
    metrik["lebar"][s] = [round(f.getlength(c) * 64) for c in HURUF]
KATA_BADGE = ["NEWS", "HIBURAN", "SHOWBIZ", "POLITIK", "OLAHRAGA", "EKONOMI", "VIRAL", "BREAKING NEWS",
              "DAERAH", "INTERNASIONAL", "KESEHATAN", "TV RAKYAT"]
metrik["kata_badge"] = KATA_BADGE
metrik["kotak_badge"] = {}
for s in range(10, 121):
    f = ImageFont.truetype(FONT, s)
    metrik["kotak_badge"][s] = [list(f.getbbox(w)) for w in KATA_BADGE]

# ------------------------------------------------------------------
#  Template uji untuk komposit_statis + deteksi_kotak_teks
# ------------------------------------------------------------------
TPL = ve.templates_dir()


def buat_template(tid, data, aset):
    folder = TPL / tid
    shutil.rmtree(folder, ignore_errors=True)
    (folder / "assets").mkdir(parents=True)
    for nama, (im, fmt, opsi) in aset.items():
        im.save(folder / nama, format=fmt, **opsi)
    (folder / "template.json").write_text(json.dumps({**ve.TEMPLATE_CONTOH, **data, "id": tid, "owner": ""}, indent=2))


def gradasi(w, h, a, b, alpha=255):
    im = Image.new("RGBA", (w, h))
    px = im.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c + (alpha if isinstance(alpha, int) else alpha(x, y),)
    return im


# T1: lower-third realistis 1080x1920 + teks contoh
bingkai = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0))
d = ImageDraw.Draw(bingkai)
d.rounded_rectangle([50, 1360, 1030, 1720], radius=28, fill=(250, 250, 248, 255))
d.rectangle([56, 1290, 420, 1356], fill=(211, 45, 39, 255))
d.rectangle([0, 0, 1079, 120], fill=(20, 40, 90, 230))
d.ellipse([900, 20, 1060, 100], fill=(255, 255, 255, 255))
buat_template("uji-t1", {
    "name": "Uji T1", "width": 1080, "height": 1920, "teks_warna": "black", "kategori": "news",
    "overlays": [
        {"file": "assets/bingkai.png", "x": 0, "y": 0},
        {"file": "assets/klip.mp4", "x": 0, "y": 0},
        {"file": "assets/hilang.png", "x": 0, "y": 0},
    ],
    "text_box": {"x": 70, "y": 1380, "w": 940, "h": 320},
    "texts": [
        {"name": "hook", "style": "berita"},
        {"name": "kategori", "style": "kategori", "source": "kategori"},
        {"name": "sumber", "size": 30, "y": 1760, "color": "white", "stroke": 2},
    ],
}, {"assets/bingkai.png": (bingkai, "PNG", {})})

# T2: rumus posisi, w/h kosong, JPEG, pinggiran transparan
a = gradasi(300, 120, (255, 200, 0), (255, 80, 0))
b = Image.new("RGBA", (400, 300), (0, 0, 0, 0))
ImageDraw.Draw(b).ellipse([60, 50, 340, 250], fill=(30, 200, 120, 200))
c = gradasi(240, 180, (10, 30, 200), (200, 220, 255)).convert("RGB")
buat_template("uji-t2", {
    "name": "Uji T2", "width": 540, "height": 960,
    "overlays": [
        {"file": "assets/a.png", "x": "(W-w)/2", "y": "main_h-h"},
        {"file": "assets/b.png", "x": "main_w-w", "y": 40, "w": 200, "h": None},
        {"file": "assets/c.jpg", "x": None, "y": None, "w": None, "h": 150},
        {"file": "assets/a.png", "x": "W-w", "y": "(main_h-h)/2", "w": 77, "h": 333},
    ],
}, {"assets/a.png": (a, "PNG", {}), "assets/b.png": (b, "PNG", {}), "assets/c.jpg": (c, "JPEG", {"quality": 88})})

# T3: keluar kanvas, alpha gradasi, posisi teks aneh
e = gradasi(400, 300, (255, 255, 255), (180, 220, 255), alpha=lambda x, y: int(255 * x / 399))
buat_template("uji-t3", {
    "name": "Uji T3", "width": 540, "height": 960,
    "overlays": [
        {"file": "assets/e.png", "x": -50, "y": 900},
        {"file": "assets/e.png", "x": "12.7", "y": "abc", "w": 501},
        {"file": "assets/e.png", "x": 600, "y": 10},
    ],
}, {"assets/e.png": (e, "PNG", {})})

# T4: kotak biru muda bergradasi (kandidat deteksi) + latar gelap + logo putih
latar = gradasi(540, 960, (10, 10, 40), (60, 20, 30))
biru = gradasi(480, 200, (200, 230, 255), (150, 200, 250))
logo = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
ImageDraw.Draw(logo).rectangle([5, 5, 75, 75], fill=(255, 255, 255, 255))
buat_template("uji-t4", {
    "name": "Uji T4", "width": 540, "height": 960,
    "overlays": [
        {"file": "assets/latar.png", "x": 0, "y": 0},
        {"file": "assets/biru.png", "x": 30, "y": 700},
        {"file": "assets/logo.webp", "x": 440, "y": 20},
    ],
}, {"assets/latar.png": (latar, "PNG", {}), "assets/biru.png": (biru, "PNG", {}),
    "assets/logo.webp": (logo, "WEBP", {"lossless": True})})

# T5: tidak ada bidang terang (deteksi -> None) + aset dipinjam dari T1
gelap = gradasi(540, 960, (40, 40, 40), (90, 90, 90))
buat_template("uji-t5", {
    "name": "Uji T5", "width": 540, "height": 960, "aset_dari": "uji-t1",
    "overlays": [
        {"file": "assets/gelap.png", "x": 0, "y": 0},
        {"file": "assets/bingkai.png", "x": 0, "y": 0, "w": 270},
    ],
}, {"assets/gelap.png": (gelap, "PNG", {})})

# T6: hanya bidang gelap/pekat -> deteksi tidak menemukan apa-apa (None)
merah = Image.new("RGBA", (300, 300), (200, 20, 20, 255))
buat_template("uji-t6", {
    "name": "Uji T6", "width": 540, "height": 960,
    "overlays": [{"file": "assets/gelap.png", "x": 0, "y": 0}, {"file": "assets/merah.png", "x": 100, "y": 300}],
}, {"assets/gelap.png": (gelap, "PNG", {}), "assets/merah.png": (merah, "PNG", {})})

komposit = {}
for tid in ("uji-t1", "uji-t2", "uji-t3", "uji-t4", "uji-t5", "uji-t6"):
    t = ve.load_template(tid)
    kanvas = ve.komposit_statis(t)
    kanvas.save(KELUAR / "png" / f"komposit-{tid}.png")
    komposit[tid] = {"deteksi": ve.deteksi_kotak_teks(kanvas)}
t1 = ve.load_template("uji-t1")
ve.komposit_statis(t1, {"hook": "VIRAL! CONTOH TULISAN BERITA UNTUK MELIHAT LETAK DAN UKURANNYA",
                        "sumber": "SUMBER: CONTOH"}).save(KELUAR / "png" / "komposit-uji-t1-contoh.png")
shutil.copytree(TPL, KELUAR / "templates")

# ------------------------------------------------------------------
#  _rapikan_gambar & _pastikan_isi_media (diambil dari video_api.py tanpa
#  mengimpor modulnya — impor itu ikut memuat Celery/Redis/kuota)
# ------------------------------------------------------------------
sumber_api = Path("/app/video_api.py").read_text()
modul = ast.parse(sumber_api)
fungsi = [n for n in modul.body if isinstance(n, ast.FunctionDef) and n.name in ("_rapikan_gambar", "_pastikan_isi_media")]
assert len(fungsi) == 2


class HTTPException(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


ruang = {
    "Path": Path, "logger": logging.getLogger("video_api"), "ve": ve, "HTTPException": HTTPException,
    "MAX_SISI_GAMBAR": int(os.getenv("VIDEO_MAX_IMAGE_SIDE", "1600")),
    "JENIS_GAMBAR": {".png", ".jpg", ".jpeg", ".webp"}, "Any": object,
}
exec(compile(ast.Module(body=fungsi, type_ignores=[]), "video_api.py", "exec"), ruang)

MASUK = KELUAR / "rapikan" / "masuk"
HASIL = KELUAR / "rapikan" / "keluar"
MASUK.mkdir(parents=True)
HASIL.mkdir(parents=True)
besar = Image.new("RGBA", (2200, 1300), (0, 0, 0, 0))
d = ImageDraw.Draw(besar)
d.rounded_rectangle([150, 100, 2050, 1150], radius=60, fill=(255, 255, 255, 230))
d.ellipse([300, 200, 900, 800], fill=(211, 45, 39, 128))
d.rectangle([1000, 300, 1900, 1000], fill=(20, 60, 200, 255))
d.line([150, 1150, 2050, 100], fill=(0, 0, 0, 200), width=9)
besar.save(MASUK / "besar.png")
foto = gradasi(1000, 1700, (240, 200, 160), (40, 80, 120)).convert("RGB")
ImageDraw.Draw(foto).ellipse([200, 300, 800, 1100], fill=(250, 250, 250))
foto.save(MASUK / "foto.jpg", quality=85)
pinggir = Image.new("RGBA", (500, 400), (0, 0, 0, 0))
ImageDraw.Draw(pinggir).rectangle([40, 30, 459, 349], fill=(0, 200, 0, 255))
pinggir.save(MASUK / "pinggir.png")
Image.new("RGBA", (300, 200), (10, 20, 30, 255)).save(MASUK / "utuh.png")
Image.new("RGBA", (300, 200), (0, 0, 0, 0)).save(MASUK / "bening.png")
gradasi(1800, 600, (0, 0, 0), (255, 255, 255), alpha=lambda x, y: 40 + (x * 200) // 1799).save(MASUK / "lebar.webp", lossless=True)

rapikan = {}
for berkas in sorted(MASUK.iterdir()):
    salinan = HASIL / berkas.name
    shutil.copy(berkas, salinan)
    ukuran = ruang["_rapikan_gambar"](salinan)
    with Image.open(salinan) as im:
        rapikan[berkas.name] = {"berubah": ukuran is not None, "w": im.width, "h": im.height}
    if ukuran is None:
        salinan.unlink()

CEK = KELUAR / "pastikan"
CEK.mkdir()
shutil.copy(MASUK / "utuh.png", CEK / "benar.png")
shutil.copy(MASUK / "foto.jpg", CEK / "benar.jpg")
data = bytearray((MASUK / "utuh.png").read_bytes())
data[40] ^= 0xFF
(CEK / "crc-rusak.png").write_bytes(bytes(data))
(CEK / "terpotong.png").write_bytes((MASUK / "utuh.png").read_bytes()[:60])
(CEK / "teks.png").write_text("ini bukan gambar")
(CEK / "svg.png").write_text('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
Image.new("RGB", (20, 20), (1, 2, 3)).save(CEK / "gif-asli.png", format="GIF")
pastikan = {}
for berkas in sorted(CEK.iterdir()):
    try:
        ruang["_pastikan_isi_media"](berkas)
        pastikan[berkas.name] = None
    except HTTPException as e:
        pastikan[berkas.name] = e.detail

(KELUAR / "emas.json").write_text(json.dumps({
    "lingkungan": {
        "pillow": Image.__version__ if hasattr(Image, "__version__") else __import__("PIL").__version__,
        "raqm": features.version("raqm"), "freetype": features.version("freetype2"), "font": FONT,
    },
    "kasus": hasil_kasus,
    "metrik": metrik,
    "komposit": komposit,
    "rapikan": rapikan,
    "pastikan": pastikan,
}, ensure_ascii=False))
shutil.rmtree(KERJA, ignore_errors=True)
print("selesai", len(hasil_kasus), "kasus")
