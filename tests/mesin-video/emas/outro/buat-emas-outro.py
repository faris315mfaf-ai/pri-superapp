"""Emas (golden) outro: hasil outro.py untuk dibandingkan dengan port TS.

Isi outro.json per kasus (seed x mode):
- gaya    : seluruh nilai pilih_gaya(seed) - wajib identik di TS;
- frame   : md5 frame RGB penuh + gambar kecil 1/4 (rata-rata 4x4, bulat)
            untuk PSNR - diambil dengan mencegat pipa ffmpeg outro.py;
- probe   : durasi/ukuran/audio hasil akhir outro.py (ffmpeg sungguhan);
- indeks  : indeks.json yang ditulis outro.py (uji pulang-pergi format).

Jalankan dengan Python yang punya numpy + Pillow 12:
  python tests/mesin-video/emas/outro/buat-emas-outro.py [--penuh DIR]
--penuh DIR menyimpan juga frame resolusi penuh (PNG) untuk uji PSNR lokal
(tidak di-commit). Ukuran video uji 360x640 supaya cepat.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

W, H = 360, 640
os.environ["OUTRO_VIDEO_W"] = str(W)
os.environ["OUTRO_VIDEO_H"] = str(H)
MEDIA = Path(tempfile.mkdtemp(prefix="emas-outro-"))
os.environ["MEDIA_DIR"] = str(MEDIA)
AKAR = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(AKAR / "autoedit"))

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, features  # noqa: E402

import outro  # noqa: E402

DI_SINI = Path(__file__).resolve().parent
AKUN = {
    "instagram": "@tvrakyat.aceh",
    "youtube": "TV Rakyat Aceh",
    "facebook": "TVR Aceh Barat",
    "tiktok": "@tvr_aceh",
    "x": "",
    "threads": "@tvrakyat",
}
KASUS = [
    {"mode": "biasa", "seed": s, "channel": c}
    for s, c in ((1, "Aceh Barat"), (2, "Kabupaten Pegunungan Bintang"), (4, "TV Rakyat"),
                 (10, "Jakarta"), (22, "Kepulauan Bangka Belitung"), (44, "Papua Selatan"))
] + [
    {"mode": "dpp", "seed": 1, "channel": c}
    for c in ("Aceh Barat", "Kabupaten Pegunungan Bintang", "Ternate")
]


def kecil(rgb: np.ndarray) -> np.ndarray:
    """Rata-rata blok 4x4 dibulatkan: floor((jumlah + 8) / 16) - sama di TS."""
    h, w, _ = rgb.shape
    blok = rgb[: h - h % 4, : w - w % 4].astype(np.int64).reshape(h // 4, 4, w // 4, 4, 3).sum(axis=(1, 3))
    return ((blok + 8) // 16).astype(np.uint8)


def indeks_frame(total: int, fps: int, mode: str) -> list[int]:
    detik = (1.2, 2.3) if mode == "biasa" else (1.2, 3.2)
    return sorted({0, min(total - 1, int(detik[0] * fps)), min(total - 1, int(detik[1] * fps)), total - 1})


def tangkap_frame(job: dict, mode: str, simpan_penuh: Path | None, nama: str, tanpa_glyph: bool = False) -> list[dict]:
    """Render lewat outro.py dengan Popen palsu yang menyimpan frame terpilih.

    tanpa_glyph: ImageDraw.text dimatikan (kotak teks tetap dihitung) - frame
    yang tersisa harus identik dengan versi TS tanpa glyph.
    """
    durasi = outro.DPP_DETIK if mode == "dpp" else outro.pilih_gaya(job["seed"])["durasi"]
    total = max(1, int(outro.FPS * durasi))
    pilih = indeks_frame(total, outro.FPS, mode)
    hasil: list[dict] = []

    class PipaPalsu:
        def __init__(self, args, **_):
            self.keluaran = Path(args[-1])
            self.n = 0
            self.returncode = None
            self.stdin = self

        def write(self, data: bytes) -> None:
            if self.n in pilih:
                rgb = np.frombuffer(data, np.uint8).reshape(H, W, 3)
                awalan = "pyb" if tanpa_glyph else "py"
                if simpan_penuh:
                    Image.fromarray(rgb, "RGB").save(simpan_penuh / f"{awalan}-{nama}-{self.n}.png")
                isi = {"n": self.n, "md5": hashlib.md5(data).hexdigest()}
                if not tanpa_glyph and self.n == pilih[-1]:
                    # Hanya frame terakhir (komposisi lengkap) yang disimpan kecil untuk
                    # PSNR; frame lain cukup md5 (frame 0 dan versi tanpa glyph wajib identik).
                    berkas = f"{nama}-{self.n}.png"
                    Image.fromarray(kecil(rgb), "RGB").save(DI_SINI / "bingkai" / berkas, optimize=True)
                    isi["kecil"] = berkas
                hasil.append(isi)
            self.n += 1

        def close(self) -> None:
            pass

        def wait(self) -> int:
            self.keluaran.write_bytes(b"palsu")
            self.returncode = 0
            return 0

        def kill(self) -> None:
            pass

    asli = outro.subprocess.Popen
    outro.subprocess.Popen = PipaPalsu
    teks_asli = ImageDraw.ImageDraw.text
    if tanpa_glyph:
        ImageDraw.ImageDraw.text = lambda *a, **k: None
    try:
        folder = MEDIA / "tangkap" / nama
        folder.mkdir(parents=True, exist_ok=True)
        ev = outro.threading.Event()
        if mode == "dpp":
            outro.render_dpp(job, folder, ev, lambda p: None)
        else:
            outro.render_video(job, outro.pilih_gaya(job["seed"]), folder, ev, lambda p: None)
    finally:
        outro.subprocess.Popen = asli
        ImageDraw.ImageDraw.text = teks_asli
    return hasil


def probe(berkas: str) -> dict:
    keluar = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,duration",
         "-of", "json", berkas], capture_output=True, text=True, check=True)
    data = json.loads(keluar.stdout)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    audio = [s for s in data["streams"] if s["codec_type"] == "audio"]
    return {"durasi": float(data["format"]["duration"]), "w": video["width"], "h": video["height"],
            "audio": bool(audio)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--penuh", type=Path, default=None)
    arg = ap.parse_args()
    if arg.penuh:
        arg.penuh.mkdir(parents=True, exist_ok=True)
    (DI_SINI / "bingkai").mkdir(exist_ok=True)
    for lama in (DI_SINI / "bingkai").glob("*.png"):
        lama.unlink()
    keluaran = []
    for k in KASUS:
        nama = f"{k['mode']}-{k['seed']}-{k['channel'].split()[0].lower()}"
        job = {"channel": k["channel"], "akun": dict(AKUN), "seed": k["seed"], "mode": k["mode"], "logo": ""}
        frame = tangkap_frame(job, k["mode"], arg.penuh, nama)
        kosong = tangkap_frame(job, k["mode"], arg.penuh, nama, tanpa_glyph=True)
        for f, b in zip(frame, kosong):
            f["md5_tanpa_glyph"] = b["md5"]
        # Jalur sungguhan (thread + ffmpeg + audio) lewat API job outro.py.
        jid = outro.mulai_job(k["channel"], AKUN, k["seed"], mode=k["mode"])
        for _ in range(1200):
            st = outro.baca_job(jid)
            if st["status"] in ("done", "error", "dibatalkan"):
                break
            time.sleep(0.25)
        if st["status"] != "done":
            raise SystemExit(f"outro.py gagal: {st['message']}")
        g = outro.pilih_gaya(k["seed"])
        keluaran.append({
            **k, "nama": nama, "akun": AKUN, "gaya": g, "ringkas": outro.ringkas_gaya(g),
            "gaya_job": st["gaya"], "frame": frame, "probe": probe(st["video"]),
        })
        print(nama, st["message"], flush=True)
    indeks = json.loads((MEDIA / "outro" / "indeks.json").read_text(encoding="utf-8"))
    emas = {
        "pillow": Image.__version__, "numpy": np.__version__, "raqm": features.check("raqm"),
        "w": W, "h": H, "fps": outro.FPS, "kasus": keluaran,
        # Jalur video diganti penanda supaya uji bisa memetakannya ke folder sementara.
        "indeks": [{**j, "video": j["video"].replace(str(MEDIA), "<MEDIA>")} for j in indeks],
        "indeks_mentah": (MEDIA / "outro" / "indeks.json").read_text(encoding="utf-8").replace(
            json.dumps(str(MEDIA))[1:-1], "<MEDIA>"),
    }
    (DI_SINI / "outro.json").write_text(json.dumps(emas, ensure_ascii=False, indent=1), encoding="utf-8")
    shutil.rmtree(MEDIA, ignore_errors=True)
    print("selesai:", DI_SINI / "outro.json")


if __name__ == "__main__":
    main()
