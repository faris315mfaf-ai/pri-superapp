"""Pembuat src/mesin-video/outro/metrik-font.ts: metrik glyph ASCII hasil
FreeType BERHINTING (Pillow), untuk ketujuh font outro + Poppins Regular.

Kenapa: Pillow memakai FreeType dengan hinting. Autohinter (Poppins, Oswald,
Righteous) menggeser lebar huruf ke kisi piksel dengan aturan yang tidak bisa
ditiru Skia - selisih 1-2 px per huruf di ukuran kecil - dan bytecode hinting
(Archivo, Anton, Bebas, Montserrat) menggeser tepi atas/bawah glyph. Metrik
inilah yang menentukan tata letak: ukuran font nama melengkung di logo DPP
dan panjang garis lengkungnya, tinggi tagline DPP (posisi pil dan semua baris
sosmed di bawahnya), teks yang ditengahkan, dan kotak teks lain. Dengan tabel
ini tata letak TS sama dengan Python untuk huruf ASCII; huruf lain memakai
pengukuran Skia.

Isi per font, untuk ukuran 1..160 dan huruf ASCII 32..126:
  advance (piksel bulat), atas = max(0, tepi atas glyph), bawah = max(0, -tepi
  bawah glyph) - persis yang dipakai textbbox (titik asal ikut dihitung).
Disimpan sebagai selisih antarukuran (int8) per huruf, dikompres zlib, base64.

Metrik satu huruf tidak dipengaruhi libraqm (raqm hanya menambah kerning
antarpasangan dan bentuk), jadi tabel ini berlaku juga untuk produksi.

Jalankan (Pillow 12.x, numpy): python tests/mesin-video/emas/outro/buat-metrik-font.py
"""

from __future__ import annotations

import base64
import os
import sys
import tempfile
import zlib
from pathlib import Path

os.environ.setdefault("MEDIA_DIR", tempfile.mkdtemp(prefix="metrik-font-"))
AKAR = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(AKAR / "autoedit"))

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, __version__ as versi_pillow  # noqa: E402

import outro  # noqa: E402

FONT = ("poppins", "poppins-regular", "montserrat", "oswald", "bebas", "anton", "righteous", "archivo")
UKURAN_MAKS = 160
HURUF = [chr(c) for c in range(32, 127)]


def kemas(larik: np.ndarray) -> str:
    """[ukuran][huruf] -> selisih antarukuran (int8) -> zlib -> base64."""
    selisih = np.diff(np.vstack([np.zeros((1, larik.shape[1]), np.int16), larik]), axis=0)
    if selisih.min() < -128 or selisih.max() > 127:
        raise SystemExit("selisih tidak muat int8")
    return base64.b64encode(zlib.compress(selisih.astype(np.int8).tobytes(), 9)).decode()


def main() -> None:
    d = ImageDraw.Draw(Image.new("L", (1, 1)))
    baris = []
    for nama in FONT:
        adv = np.zeros((UKURAN_MAKS, len(HURUF)), np.int16)
        atas = np.zeros_like(adv)
        bawah = np.zeros_like(adv)
        for uk in range(1, UKURAN_MAKS + 1):
            f = outro._font(uk, nama)
            for i, c in enumerate(HURUF):
                lebar = d.textlength(c, font=f)
                if lebar != int(lebar):
                    raise SystemExit(f"advance {nama} {uk} {c!r} = {lebar} bukan bilangan bulat")
                _, y0, _, y1 = d.textbbox((0, 0), c, font=f, anchor="ls")
                adv[uk - 1, i] = int(lebar)
                atas[uk - 1, i] = -y0
                bawah[uk - 1, i] = y1
        berkas = Path(outro.FONT.get(nama) or outro.FONT_LAIN[nama]).name
        baris.append(f'  "{berkas}": ["{kemas(adv)}", "{kemas(atas)}", "{kemas(bawah)}"],')
    teks = (
        "// DIBUAT OTOMATIS oleh tests/mesin-video/emas/outro/buat-metrik-font.py\n"
        f"// (Pillow {versi_pillow} + FreeType berhinting) - jangan diubah tangan.\n"
        "// Per berkas font: [advance, atas, bawah] untuk ukuran 1..UKURAN_MAKS_METRIK dan\n"
        "// huruf ASCII 32..126; tiap tabel = selisih antarukuran (int8) per huruf,\n"
        "// dikompres zlib lalu base64. Lihat alasan di skrip pembuatnya.\n"
        f"export const UKURAN_MAKS_METRIK = {UKURAN_MAKS};\n"
        "export const METRIK_BERHINTING: Readonly<Record<string, readonly [string, string, string]>> = {\n"
        + "\n".join(baris)
        + "\n};\n"
    )
    tujuan = AKAR / "src" / "mesin-video" / "outro" / "metrik-font.ts"
    tujuan.write_text(teks, encoding="utf-8")
    print("ditulis", tujuan, len(teks), "byte")


if __name__ == "__main__":
    main()
