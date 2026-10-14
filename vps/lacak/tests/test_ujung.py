"""Uji ujung-ke-ujung pipeline dengan model & ffmpeg SUNGGUHAN (tanpa internet: yt-dlp & pencarian dipalsukan).

Video uji dibuat ffmpeg: "asli" 72 dtk (6 adegan berbeda + suara derau berpola + watermark @kabarpesisir.tv),
"saduran" = detik 18–66 asli, diperkecil, warna digeser, judul kuning ditempel, musik latar dicampur,
"lain" = video tak terkait. Jalankan: pytest -m berat  (butuh model di LACAK_MODEL atau tests/model).
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.berat

ASLI = "https://www.tiktok.com/@kabarpesisir.tv/video/7425000000000000001"
SADURAN = "https://www.tiktok.com/@viralnusantara_/video/7425000000000000002"
LAIN = "https://www.youtube.com/watch?v=AAAAAAAAAAA"
SADURAN_KEDUA = "https://www.tiktok.com/@akunlain/video/7425000000000000003"


def _ff(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


@pytest.fixture(scope="session")
def video(tmp_path_factory) -> dict[str, Path]:
    from PIL import Image, ImageDraw, ImageFont

    d = tmp_path_factory.mktemp("video")
    wm = Image.new("RGBA", (540, 960), (0, 0, 0, 0))
    ImageDraw.Draw(wm).text((20, 870), "@kabarpesisir.tv", font=ImageFont.load_default(size=34), fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
    wm.save(d / "wm.png")
    judul = Image.new("RGBA", (360, 640), (0, 0, 0, 0))
    g = ImageDraw.Draw(judul)
    g.rectangle((15, 30, 345, 90), fill=(250, 220, 40, 245))
    g.text((30, 45), "DETIK-DETIK JEMBATAN PUTUS", font=ImageFont.load_default(size=20), fill=(0, 0, 0, 255))
    judul.save(d / "judul.png")
    sumber = [
        "testsrc2=s=540x960:r=25:d=12",
        "mandelbrot=s=540x960:r=25,trim=duration=12",
        "life=s=135x240:r=25:mold=10:ratio=0.1:death_color=#C83232:life_color=#00ff00,scale=540:960:flags=neighbor,trim=duration=12",
        "cellauto=s=540x960:r=25:rule=110,trim=duration=12",
        "smptehdbars=s=540x960:r=25:d=12",
        "gradients=s=540x960:r=25:speed=0.05:n=5,trim=duration=12",
    ]
    masuk: list[str] = []
    for s in sumber:
        masuk += ["-f", "lavfi", "-i", s]
    # Suara: derau merah muda bersuara naik-turun (sidik chromaprint butuh isi yang berubah).
    masuk += ["-f", "lavfi", "-i", "anoisesrc=color=pink:seed=42:d=72:a=0.4,volume='0.3+0.7*abs(sin(t*1.7))':eval=frame"]
    masuk += ["-i", str(d / "wm.png")]
    _ff(*masuk, "-filter_complex", "[0:v][1:v][2:v][3:v][4:v][5:v]concat=n=6:v=1:a=0,format=yuv420p[c];[c][7:v]overlay=0:0,format=yuv420p[v]",
        "-map", "[v]", "-map", "6:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-c:a", "aac", "-t", "72", str(d / "asli.mp4"))
    _ff("-ss", "18", "-t", "48", "-i", str(d / "asli.mp4"), "-f", "lavfi", "-i", "sine=f=330:d=48,volume=0.25", "-i", str(d / "judul.png"),
        "-filter_complex", "[0:v]scale=360:640,eq=saturation=1.3:brightness=0.03[s];[s][2:v]overlay=0:0,format=yuv420p[v];[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.6[a]",
        "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-c:a", "aac", str(d / "saduran.mp4"))
    _ff("-f", "lavfi", "-i", "rgbtestsrc=s=540x960:r=25:d=30", "-f", "lavfi", "-i", "yuvtestsrc=s=540x960:r=25:d=30",
        "-f", "lavfi", "-i", "anoisesrc=color=brown:seed=7:d=60:a=0.4",
        "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0,hue=h=90,format=yuv420p[v]", "-map", "[v]", "-map", "2:a",
        "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-t", "60", str(d / "lain.mp4"))
    return {ASLI: d / "asli.mp4", SADURAN: d / "saduran.mp4", LAIN: d / "lain.mp4", SADURAN_KEDUA: d / "saduran.mp4"}


INFO = {
    ASLI: {"id": "7425000000000000001", "title": "Jembatan gantung Desa Sungai Rampah putus", "uploader_id": "kabarpesisir.tv", "uploader": "Kabar Pesisir TV",
           "timestamp": 1_791_890_000, "duration": 72.0, "width": 540, "height": 960, "extractor_key": "TikTok", "webpage_url": ASLI},
    SADURAN: {"id": "7425000000000000002", "title": "Detik-detik jembatan gantung putus diterjang banjir", "uploader_id": "viralnusantara_",
              "timestamp": 1_791_944_000, "duration": 48.0, "width": 360, "height": 640, "extractor_key": "TikTok", "webpage_url": SADURAN,
              "description": "Jembatan gantung putus di Desa Sungai Rampah #viral"},
    LAIN: {"id": "AAAAAAAAAAA", "title": "Panen raya padi organik", "uploader_id": "@sawahkita", "channel": "Sawah Kita",
           "timestamp": 1_791_800_000, "duration": 60.0, "width": 540, "height": 960, "extractor_key": "Youtube", "webpage_url": LAIN},
    SADURAN_KEDUA: {"id": "7425000000000000003", "title": "Jembatan putus", "uploader_id": "akunlain", "timestamp": 1_791_950_000,
                    "duration": 48.0, "width": 360, "height": 640, "extractor_key": "TikTok", "webpage_url": SADURAN_KEDUA},
}


@pytest.fixture
def palsu(monkeypatch, video):
    from lacak import cari, konfig, media

    model = Path(os.environ.get("LACAK_MODEL_UJI", Path(__file__).parent / "model"))
    monkeypatch.setattr(konfig, "SSCD", model / "sscd_disc_mixup.torchscript.pt")
    monkeypatch.setattr(konfig, "WHISPER_DIR", model / "whisper")
    assert konfig.SSCD.exists(), f"model SSCD tidak ada di {konfig.SSCD}"

    def info_video(url, batas=60):
        if url not in INFO:
            raise media.GalatLacak("Video sudah dihapus atau tidak tersedia.")
        return dict(INFO[url])

    def unduh(url, folder, maks_detik, durasi=None, batas=240):
        folder.mkdir(parents=True, exist_ok=True)
        tujuan = folder / "video.mp4"
        shutil.copy(video[url], tujuan)
        return tujuan

    monkeypatch.setattr(media, "info_video", info_video)
    monkeypatch.setattr(media, "unduh", unduh)
    monkeypatch.setattr(media, "unduh_gambar", lambda url, tujuan, batas=20: None)
    ent = lambda u, lewat: {"url": u, "judul": INFO[u]["title"], "durasi": INFO[u]["duration"], "epoch": None, "akun": INFO[u]["uploader_id"], "gambar": "", "lewat": lewat}  # noqa: E731
    panggilan: dict[str, list] = {"akun": [], "youtube": [], "web": []}

    def dari_akun(h, platform, batas=30):
        panggilan["akun"].append((h, platform))
        return [ent(ASLI, "akun")] if h == "@kabarpesisir.tv" and platform == "TikTok" else []

    def dari_youtube(kata, batas=10):
        panggilan["youtube"].append(list(kata))
        return [ent(LAIN, "youtube")]

    def dari_web(kata, batas_per_situs=6):
        panggilan["web"].append(list(kata))
        return [ent(SADURAN_KEDUA, "web")]

    monkeypatch.setattr(cari, "dari_akun", dari_akun)
    monkeypatch.setattr(cari, "dari_youtube", dari_youtube)
    monkeypatch.setattr(cari, "dari_web", dari_web)
    return panggilan


def _lacak(url: str) -> dict:
    from lacak import pekerja, simpan

    job = pekerja.job_baru(url, "176", "pengguna")
    pekerja.jalankan(job["id"])
    return simpan.ambil_job(job["id"])


def test_jalur_internet_menemukan_asli(palsu):
    from lacak import simpan

    j = _lacak(SADURAN)
    assert j["status"] == "selesai", j["pesan"]
    assert [t["status"] for t in j["tahap"]] == ["selesai"] * 6
    assert j["petunjuk"]["watermark"][0]["handle"] == "@kabarpesisir.tv"
    assert ("@kabarpesisir.tv", "TikTok") in palsu["akun"]
    k = j["kandidat"]
    urut = [x["url"] for x in k]
    assert urut[0] == ASLI and j["terpilih"] == 0 and j["zona"] == "yakin"
    asli = k[0]
    assert asli["skor"] >= 0.85, asli
    assert asli["komponen"]["wm"] == 1.0 and asli["komponen"]["waktu"] == 1.0
    assert asli["bagian"] and 15 <= asli["bagian"]["mulai"] <= 21 and 63 <= asli["bagian"]["akhir"] <= 69, asli["bagian"]
    assert asli["offset_suara"] is not None and abs(asli["offset_suara"] - 18) <= 1.0, asli["offset_suara"]
    assert j["kredit"] == "SUMBER: @KABARPESISIR.TV"
    lain = next(x for x in k if x["url"] == LAIN)
    assert lain["zona"] == "bukan" and lain["label"] == "Kejadian lain"
    kedua = next(x for x in k if x["url"] == SADURAN_KEDUA)
    assert kedua["zona"] != "yakin" or kedua["skor"] < asli["skor"]
    # Asli masuk koleksi (pengaturan bawaan simpan_ke_koleksi) beserta akunnya.
    assert simpan.video_ada("TikTok:7425000000000000001")
    assert any(a["handle"] == "@kabarpesisir.tv" for a in simpan.daftar_akun())


def test_jalur_koleksi_tanpa_internet(palsu, monkeypatch):
    from lacak import cari, pekerja

    assert pekerja.masukkan_video(ASLI, None) == "TikTok:7425000000000000001"
    monkeypatch.setattr(cari, "dari_akun", lambda *a, **k: [])
    monkeypatch.setattr(cari, "dari_youtube", lambda *a, **k: [])
    monkeypatch.setattr(cari, "dari_web", lambda *a, **k: [])
    j = _lacak(SADURAN)
    assert j["status"] == "selesai", j["pesan"]
    assert j["kandidat"] and j["kandidat"][0]["ditemukan_lewat"] == "koleksi"
    assert j["terpilih"] == 0 and j["zona"] == "yakin" and j["kandidat"][0]["skor"] >= 0.85


def test_keputusan_bukan_mengeluarkan_dari_koleksi(palsu):
    from lacak import pekerja, simpan

    j = _lacak(SADURAN)
    assert simpan.video_ada("TikTok:7425000000000000001")
    # pengguna biasa: keputusan tercatat, koleksi bersama tidak berubah
    j1 = pekerja.putuskan(j, "bukan", 0, "176", ubah_koleksi=False)
    assert j1["keputusan"]["aksi"] == "bukan" and simpan.video_ada("TikTok:7425000000000000001")
    # master: video dikeluarkan dari koleksi
    j2 = pekerja.putuskan(j, "bukan", 0, "4", ubah_koleksi=True)
    assert j2["keputusan"]["aksi"] == "bukan" and j2["kredit"] == ""
    assert not simpan.video_ada("TikTok:7425000000000000001")


def test_watermark_milik_pengunggah_sendiri_diabaikan(palsu, monkeypatch):
    """Saduran yang watermark-nya akun pengunggahnya sendiri: tidak dianggap petunjuk sumber lain."""
    monkeypatch.setitem(INFO, SADURAN, {**INFO[SADURAN], "uploader_id": "kabarpesisir.tv"})
    j = _lacak(SADURAN)
    assert j["status"] == "selesai", j["pesan"]
    assert j["petunjuk"]["watermark"] == [] and palsu["akun"] == []


def test_link_mati_jadi_gagal_ramah(palsu):
    j = _lacak("https://www.tiktok.com/@x/video/9999999999")
    assert j["status"] == "gagal" and "dihapus" in j["pesan"]
