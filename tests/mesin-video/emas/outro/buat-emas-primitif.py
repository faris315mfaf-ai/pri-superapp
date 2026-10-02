"""Emas (golden) untuk port Pillow di src/mesin-video/outro (gambar.ts, kuas.ts).

Tiap kasus: parameter operasi + md5 byte hasil Pillow. Uji TS mengulang
operasi yang sama dan wajib menghasilkan md5 yang SAMA - inilah bukti bahwa
port resize/blur/rotate/alpha_composite/ImageDraw identik bit-per-bit.

Jalankan (Pillow 12.x, numpy):
  python tests/mesin-video/emas/outro/buat-emas-primitif.py
Menulis primitif.json di folder yang sama.
"""

from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

FILTER = {"lanczos": Image.LANCZOS, "bicubic": Image.BICUBIC, "bilinear": Image.BILINEAR, "nearest": Image.NEAREST}


def md5(im: Image.Image) -> str:
    return hashlib.md5(im.tobytes()).hexdigest()


def gambar_acak(rnd: random.Random, mode: str, w: int, h: int) -> tuple[Image.Image, int]:
    """Gambar uji dari seed kecil - TS membangun ulang dengan rumus yang sama."""
    seed = rnd.randrange(1, 1_000_000)
    return buat_gambar(mode, w, h, seed), seed


def buat_gambar(mode: str, w: int, h: int, seed: int) -> Image.Image:
    # LCG 32-bit sederhana supaya TS bisa meniru tanpa random.Random.
    b = 4 if mode == "RGBA" else 1
    data = bytearray(w * h * b)
    s = seed
    for i in range(len(data)):
        s = (s * 1103515245 + 12345) & 0xFFFFFFFF
        data[i] = (s >> 16) & 0xFF
    if mode == "RGBA":
        # Sebagian piksel dibuat transparan penuh / buram penuh, seperti lapisan nyata.
        for i in range(3, len(data), 4):
            if data[i] < 60:
                data[i] = 0
            elif data[i] > 200:
                data[i] = 255
    return Image.frombytes(mode, (w, h), bytes(data))


def main() -> None:
    rnd = random.Random(20261002)
    kasus = []
    W, H = 97, 83

    def tambah(jenis: str, **param):
        kasus.append({"jenis": jenis, **param})

    # ---------- ImageDraw ----------
    for i in range(40):
        n = rnd.choice([3, 4, 5, 6, 8, 16])
        pts = [(round(rnd.uniform(-20, W + 20), 3), round(rnd.uniform(-20, H + 20), 3)) for _ in range(n)]
        mode = rnd.choice(["RGBA", "L"])
        im = Image.new(mode, (W, H), (0, 0, 0, 0) if mode == "RGBA" else 0)
        d = ImageDraw.Draw(im)
        isi = (rnd.randrange(256), rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)) if mode == "RGBA" else rnd.randrange(1, 256)
        garis = rnd.random() < 0.3
        if garis:
            d.polygon(pts, outline=isi)
        else:
            d.polygon(pts, fill=isi)
        tambah("polygon", mode=mode, pts=pts, isi=isi, garis=garis, md5=md5(im))
    # poligon reguler seperti bentuk badge
    for r in (10.5, 23.7, 40.2):
        for n in (4, 6, 8, 16):
            c = 48.5
            pts = []
            import math
            for k in range(n):
                rr = r if (n != 16 or k % 2 == 0) else r * 0.82
                a = math.radians(360 / n * k + 22.5)
                pts.append((c + rr * math.cos(a), c + rr * math.sin(a)))
            im = Image.new("L", (W, H), 0)
            ImageDraw.Draw(im).polygon(pts, fill=255)
            tambah("polygon", mode="L", pts=pts, isi=255, garis=False, md5=md5(im))
    for i in range(30):
        n = rnd.choice([2, 3, 5, 9])
        pts = [(round(rnd.uniform(-10, W + 10), 2), round(rnd.uniform(-10, H + 10), 2)) for _ in range(n)]
        lebar = rnd.choice([1, 2, 3, 4, 5, 9, 13, 21])
        joint = rnd.choice([None, "curve"])
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        isi = (rnd.randrange(256), rnd.randrange(256), rnd.randrange(256), 255)
        ImageDraw.Draw(im).line(pts, fill=isi, width=lebar, joint=joint)
        tambah("line", pts=pts, isi=isi, lebar=lebar, joint=joint, md5=md5(im))
    for i in range(40):
        x0, y0 = rnd.uniform(-15, W - 5), rnd.uniform(-15, H - 5)
        kotak = [round(x0, 2), round(y0, 2), round(x0 + rnd.uniform(0, 70), 2), round(y0 + rnd.uniform(0, 70), 2)]
        mode = rnd.choice(["RGBA", "L"])
        im = Image.new(mode, (W, H), (0, 0, 0, 0) if mode == "RGBA" else 0)
        isi = (rnd.randrange(256), 40, 200, rnd.randrange(256)) if mode == "RGBA" else 255
        lebar = rnd.choice([0, 1, 2, 3, 4, 6])
        if lebar == 0:
            ImageDraw.Draw(im).ellipse(kotak, fill=isi)
        else:
            ImageDraw.Draw(im).ellipse(kotak, outline=isi, width=lebar)
        tambah("ellipse", mode=mode, kotak=kotak, isi=isi, lebar=lebar, md5=md5(im))
    for i in range(12):
        x0, y0 = rnd.uniform(-15, W - 5), rnd.uniform(-15, H - 5)
        kotak = [round(x0, 2), round(y0, 2), round(x0 + rnd.uniform(0, 70), 2), round(y0 + rnd.uniform(0, 70), 2)]
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        lebar = rnd.choice([0, 1, 3])
        if lebar == 0:
            ImageDraw.Draw(im).rectangle(kotak, fill=(255, 255, 255, 8))
        else:
            ImageDraw.Draw(im).rectangle(kotak, outline=(1, 2, 3, 200), width=lebar)
        tambah("rectangle", kotak=kotak, lebar=lebar, md5=md5(im))
    for i in range(36):
        x0, y0 = rnd.uniform(-5, 40), rnd.uniform(-5, 30)
        kotak = [round(x0, 2), round(y0, 2), round(x0 + rnd.uniform(2, 60), 2), round(y0 + rnd.uniform(2, 50), 2)]
        radius = rnd.choice([0, 3, 7.5, 12, 30, 100])
        mode = rnd.choice(["RGBA", "L"])
        im = Image.new(mode, (W, H), (0, 0, 0, 0) if mode == "RGBA" else 0)
        isi = (10, 200, 30, 60) if mode == "RGBA" else 255
        garis = (220, 220, 225, 140) if mode == "RGBA" else 128
        pilihan = rnd.choice(["isi", "garis", "keduanya"])
        lebar = rnd.choice([1, 2, 6])
        d = ImageDraw.Draw(im)
        if pilihan == "isi":
            d.rounded_rectangle(kotak, radius, fill=isi)
        elif pilihan == "garis":
            d.rounded_rectangle(kotak, radius, outline=garis, width=lebar)
        else:
            d.rounded_rectangle(kotak, radius, fill=isi, outline=garis, width=lebar)
        tambah("rounded", mode=mode, kotak=kotak, radius=radius, isi=isi, garis=garis, pilihan=pilihan, lebar=lebar, md5=md5(im))
    for i in range(36):
        x0, y0 = rnd.uniform(-5, 40), rnd.uniform(-5, 30)
        kotak = [round(x0, 2), round(y0, 2), round(x0 + rnd.uniform(2, 70), 2), round(y0 + rnd.uniform(2, 60), 2)]
        a0 = round(rnd.uniform(-400, 400), 3)
        a1 = round(a0 + rnd.uniform(-90, 380), 3)
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        jenis = rnd.choice(["arc", "pieslice"])
        lebar = rnd.choice([1, 2, 5, 9])
        if jenis == "arc":
            ImageDraw.Draw(im).arc(kotak, a0, a1, fill=(232, 232, 232, 255), width=lebar)
        else:
            ImageDraw.Draw(im).pieslice(kotak, a0, a1, fill=(232, 232, 232, 255))
        tambah(jenis, kotak=kotak, a0=a0, a1=a1, lebar=lebar, md5=md5(im))

    # ---------- filter & geometri ----------
    for mode in ("RGBA", "L"):
        for radius in (0.5, 1, 1.5, 4.5, 6, 17.5, 33.3):
            w, h = rnd.choice([(40, 30), (61, 47), (7, 90)])
            im, seed = gambar_acak(rnd, mode, w, h)
            tambah("blur", mode=mode, w=w, h=h, seed=seed, radius=radius, md5=md5(im.filter(ImageFilter.GaussianBlur(radius))))
    for mode in ("RGBA", "L"):
        for nama in ("lanczos", "bicubic", "bilinear"):
            for (w, h, w2, h2) in ((40, 30, 13, 11), (21, 17, 64, 50), (64, 64, 63, 65), (30, 30, 30, 9)):
                im, seed = gambar_acak(rnd, mode, w, h)
                tambah("resize", mode=mode, w=w, h=h, seed=seed, filter=nama, w2=w2, h2=h2,
                       md5=md5(im.resize((w2, h2), FILTER[nama])))
    for nama in ("bicubic", "bilinear", "nearest"):
        for sudut in (0, 13.7, 90, 180, 270, -45.25, 359.9):
            for expand in (False, True):
                w, h = rnd.choice([(31, 23), (24, 24)])
                im, seed = gambar_acak(rnd, "RGBA", w, h)
                hasil = im.rotate(sudut, resample=FILTER[nama], expand=expand)
                tambah("rotate", mode="RGBA", w=w, h=h, seed=seed, filter=nama, sudut=sudut, expand=expand,
                       w2=hasil.width, h2=hasil.height, md5=md5(hasil))
    for data, nama, mode in (((1, 0, 0, 0, 1, -3.37), "nearest", "L"), ((1, 0.22, -4, 0, 1, 0), "bicubic", "RGBA"),
                             ((0.9, 0.1, 2, -0.2, 1.1, -1), "bilinear", "RGBA"), ((1, 0.3, 1, 0.1, 1, 0), "nearest", "RGBA")):
        im, seed = gambar_acak(rnd, mode, 33, 29)
        hasil = im.transform((33, 29), Image.AFFINE, data, resample=FILTER[nama])
        tambah("affine", mode=mode, w=33, h=29, seed=seed, data=list(data), filter=nama, md5=md5(hasil))
    for i in range(10):
        a, s1 = gambar_acak(rnd, "RGBA", 30, 20)
        b, s2 = gambar_acak(rnd, "RGBA", 17, 13)
        dx, dy = rnd.randrange(-8, 25), rnd.randrange(-6, 18)
        a2 = a.copy()
        # potong manual seperti _tempel, lalu alpha_composite
        sx0, sy0 = max(0, -dx), max(0, -dy)
        sx1, sy1 = min(b.width, a.width - dx), min(b.height, a.height - dy)
        if sx1 > sx0 and sy1 > sy0:
            lap = b.crop((sx0, sy0, sx1, sy1))
            a2.alpha_composite(lap, dest=(dx + sx0, dy + sy0))
        tambah("komposit", s1=s1, s2=s2, dx=dx, dy=dy, md5=md5(a2))
    for (w, h, mw, mh) in ((1220, 1223, 201, 201), (1220, 1223, 604, 604), (512, 512, 77, 77)):
        im, seed = gambar_acak(rnd, "RGBA", w // 8, h // 8)
        im2 = im.resize((w, h), Image.NEAREST)
        im2.thumbnail((mw, mh), Image.LANCZOS)
        tambah("thumbnail", w=w // 8, h=h // 8, besar=[w, h], seed=seed, maks=[mw, mh], w2=im2.width, h2=im2.height, md5=md5(im2))

    keluar = Path(__file__).with_name("primitif.json")
    keluar.write_text(json.dumps({"pillow": Image.__version__, "kasus": kasus}), encoding="utf-8")
    print(f"{len(kasus)} kasus -> {keluar}")


if __name__ == "__main__":
    main()
