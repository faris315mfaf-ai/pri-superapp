"""Uji PRI Auto Edit: keamanan, pemisahan akun, dan render ujung-ke-ujung.

Jalankan dari folder autoedit:  python -m pytest -q tests
Butuh ffmpeg/ffprobe di PATH. Redis diganti tiruan di memori; render dan
outro dijalankan SUNGGUHAN dengan ffmpeg.
"""

from __future__ import annotations

import io
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import pytest

AKAR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AKAR))
MEDIA = Path(tempfile.mkdtemp(prefix="autoedit-uji-"))
os.environ.update(
    {
        "MEDIA_DIR": str(MEDIA),
        "OUTRO_VIDEO_W": "360",
        "OUTRO_VIDEO_H": "640",
        "VIDEO_THREADS": "1",
    }
)
os.environ.pop("REDIS_URL", None)

import fakeredis  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import video_api  # noqa: E402
import video_edit as ve  # noqa: E402
import video_tasks as vt  # noqa: E402

vt._redis_klien = fakeredis.FakeRedis(decode_responses=True)
vt.worker_hidup = lambda paksa=False: True  # tidak ada broker di uji ini

TUGAS: list[tuple[tuple[Any, ...], dict[str, Any]]] = []
vt.render_video.delay = lambda *a, **k: TUGAS.append((a, k))

# Semua nama situs video dianggap beralamat publik, kecuali yang sengaja
# disiapkan menunjuk ke alamat privat untuk menguji penjaga SSRF.
_getaddrinfo_asli = socket.getaddrinfo


def _getaddrinfo_tiruan(host: str, *args: Any, **kwargs: Any):
    if host == "jebakan.instagram.com":
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", 0))]
    if host.endswith(("instagram.com", "tiktok.com", "youtube.com")):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("157.240.1.1", 0))]
    return _getaddrinfo_asli(host, *args, **kwargs)


ve.socket.getaddrinfo = _getaddrinfo_tiruan

import main  # noqa: E402  (setelah tiruan terpasang)

KLIEN = TestClient(main.app)


def akun(id_akun: str) -> str:
    """Identitas yang diteruskan rute /api/autoedit SuperApp: id akun."""
    return id_akun


def h(id_akun: str) -> dict[str, str]:
    return {"X-Autoedit-Pengguna": id_akun}


def png(w: int, h_: int, warna=(255, 255, 255, 200)) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGBA", (w, h_), warna).save(buf, format="PNG")
    return buf.getvalue()


def video_sumber(detik: int = 3) -> bytes:
    keluaran = MEDIA / f"sumber-{detik}.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-f", "lavfi", "-i", f"testsrc=size=720x1280:rate=30:duration={detik}",
         "-f", "lavfi", "-i", f"sine=frequency=440:duration={detik}",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(keluaran)],
        check=True,
    )
    return keluaran.read_bytes()


def template_uji(token: str, nama: str = "Uji TV") -> str:
    r = KLIEN.post(
        "/api/video/templates",
        headers=h(token),
        json={
            "name": nama, "width": 720, "height": 1280, "fps": 30,
            "overlays": [{"file": "assets/bingkai.png", "x": 0, "y": "main_h-h", "w": 720, "crop": "720:300:0:0"}],
            "texts": [{"name": "hook", "style": "berita", "size": 44}],
            "text_box": {"x": 40, "y": 960, "w": 640, "h": 240},
        },
    )
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    r = KLIEN.post(
        f"/api/video/templates/{tid}/assets",
        headers=h(token),
        files={"file": ("bingkai.png", png(720, 300, (10, 60, 200, 230)), "image/png")},
    )
    assert r.status_code == 200, r.text
    return tid


# ------------------------------------------------------------------
#  1. Identitas dari SuperApp
# ------------------------------------------------------------------


@pytest.mark.parametrize("nilai", ["", "abc", "12; rm", "1" * 13, "../1"])
def test_identitas_tidak_sah_ditolak(nilai):
    r = KLIEN.get("/api/video/templates", headers={"X-Autoedit-Pengguna": nilai})
    assert r.status_code == 401


def test_semua_rute_video_dan_outro_wajib_identitas():
    import outro_api

    diperiksa = 0
    for rute in [r for m in (video_api, outro_api) for r in m.router.routes]:
        jalur = getattr(rute, "path", "")
        assert jalur.startswith(("/api/video", "/api/outro")), jalur
        contoh = (jalur.replace("{template_id}", "abc").replace("{job_id}", "abc")
                  .replace("{nama}", "a.png"))
        for metode in rute.methods - {"HEAD", "OPTIONS"}:
            r = KLIEN.request(metode, contoh)
            assert r.status_code in (401, 404), f"{metode} {contoh} -> {r.status_code}"
            diperiksa += 1
    assert diperiksa >= 20


def test_akun_baru_dapat_template_awal_dari_bawaan():
    ve.save_template({"name": "TV Rakyat", "width": 720, "height": 1280}, "bawaan-tv-rakyat", owner="")
    daftar = KLIEN.get("/api/video/templates", headers=h(akun("7001"))).json()["templates"]
    milik = [t for t in daftar if t.get("owner") == "pri-7001"]
    assert len(milik) == 1 and milik[0]["aset_dari"] == "bawaan-tv-rakyat"
    # Permintaan berikutnya tidak menambah template lagi.
    daftar = KLIEN.get("/api/video/templates", headers=h(akun("7001"))).json()["templates"]
    assert len([t for t in daftar if t.get("owner") == "pri-7001"]) == 1


# ------------------------------------------------------------------
#  3. Penjaga SSRF & validasi template
# ------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:8000/health",
        "http://10.0.0.1/a.mp4",
        "http://localhost/a.mp4",
        "http://supabase-db:5432/",
        "http://pri-redis:6379/",
        "file:///etc/passwd",
        "ftp://instagram.com/a.mp4",
        "https://evil.example/a.mp4",
        "https://instagram.com.evil.example/reel/x",
        "https://user:pass@www.instagram.com/reel/x",
        "http://[::1]/a.mp4",
        "https://jebakan.instagram.com/reel/x",
    ],
)
def test_periksa_url_menolak(url):
    with pytest.raises(ve.VideoError):
        ve.periksa_url(url)


def test_periksa_url_menerima_situs_video():
    assert ve.periksa_url("https://www.instagram.com/reel/ABC123/").startswith("https://")
    assert ve.periksa_url("https://vt.tiktok.com/ZS123/")


def test_job_dengan_link_internal_ditolak_400():
    token = akun("1001")
    tid = template_uji(token, "SSRF")
    r = KLIEN.post("/api/video/jobs", headers=h(token),
                   json={"url": "http://127.0.0.1:3000/x.mp4", "template_id": tid, "texts": {"hook": "UJI"}})
    assert r.status_code == 400
    assert not TUGAS or all(a[1] != "http://127.0.0.1:3000/x.mp4" for a, _ in TUGAS)


@pytest.mark.parametrize(
    "overlay",
    [
        {"file": "assets/a.png", "crop": "100:100:0:0,movie=/etc/passwd"},
        {"file": "assets/a.png", "crop": "iw/2:ih:0:0"},
        {"file": "assets/a.png", "w": 99999},
        {"file": "assets/a.png", "x": "1;drawtext=text=x"},
    ],
)
def test_template_berisi_nilai_berbahaya_ditolak(overlay):
    token = akun(str(2000 + abs(hash(str(overlay))) % 1000))
    r = KLIEN.post("/api/video/templates", headers=h(token),
                   json={"name": "Jahat", "overlays": [overlay]})
    assert r.status_code == 422, r.text


def test_teks_berukuran_raksasa_ditolak():
    token = akun("1002")
    r = KLIEN.post("/api/video/templates", headers=h(token),
                   json={"name": "Besar", "texts": [{"name": "hook", "size": 100000}]})
    assert r.status_code == 422


# ------------------------------------------------------------------
#  4. Pemisahan antar-akun
# ------------------------------------------------------------------


def test_akun_lain_tidak_bisa_melihat_atau_memakai_milik_orang():
    a, b = akun("1003"), akun("1004")
    tid = template_uji(a, "Milik A")
    r = KLIEN.post("/api/video/sources", headers=h(a), files={"file": ("s.mp4", video_sumber(2), "video/mp4")})
    assert r.status_code == 200, r.text
    unggahan = r.json()["url"]
    assert KLIEN.get(f"/api/video/templates/{tid}", headers=h(b)).status_code == 404
    assert KLIEN.delete(f"/api/video/templates/{tid}", headers=h(b)).status_code == 404
    assert all(t["id"] != tid for t in KLIEN.get("/api/video/templates", headers=h(b)).json()["templates"])
    tid_b = template_uji(b, "Milik B")
    r = KLIEN.post("/api/video/jobs", headers=h(b), json={"url": unggahan, "template_id": tid_b, "texts": {"hook": "UJI"}})
    assert r.status_code == 404, "unggahan milik A tidak boleh dipakai B"
    r = KLIEN.post("/api/video/jobs", headers=h(a), json={"url": unggahan, "template_id": tid, "texts": {"hook": "UJI"}})
    assert r.status_code == 200
    job = r.json()["job_id"]
    assert KLIEN.get(f"/api/video/jobs/{job}", headers=h(b)).status_code == 404
    assert KLIEN.get(f"/api/video/jobs/{job}/file", headers=h(b)).status_code == 404
    assert KLIEN.post("/api/video/jobs/cleanup", headers=h(b), json={"job_ids": [job]}).json()["dihapus"] == 0


def test_batas_job_aktif_per_akun(monkeypatch):
    monkeypatch.setattr(video_api, "MAX_AKTIF_PER_AKUN", 2)
    token = akun("1005")
    tid = template_uji(token, "Rakus")
    kirim = lambda: KLIEN.post("/api/video/jobs", headers=h(token), json={
        "url": "https://www.instagram.com/reel/ABC/", "template_id": tid, "texts": {"hook": "UJI"}})
    assert kirim().status_code == 200
    assert kirim().status_code == 200
    assert kirim().status_code == 429


# ------------------------------------------------------------------
#  5. Render ujung-ke-ujung dengan ffmpeg sungguhan
# ------------------------------------------------------------------


def _probe(berkas: Path) -> dict[str, Any]:
    return ve.probe(berkas)


def test_render_video_sampai_jadi():
    token = akun("1006")
    t1 = template_uji(token, "Render Satu")
    t2 = template_uji(token, "Render Dua")
    r = KLIEN.post("/api/video/sources", headers=h(token), files={"file": ("s.mp4", video_sumber(3), "video/mp4")})
    assert r.status_code == 200, r.text
    sumber = r.json()["url"]
    TUGAS.clear()
    r = KLIEN.post("/api/video/jobs/batch", headers=h(token), json={
        "url": sumber, "template_ids": [t1, t2], "texts": {"hook": "VIRAL! UJI RENDER AUTO EDIT BERJALAN MULUS"},
        "teks_warna": "black",
    })
    assert r.status_code == 200, r.text
    assert len(TUGAS) == 2
    for args, kwargs in TUGAS:
        hasil = vt.render_video(*args, **kwargs)
        assert hasil["status"] == "done", hasil
    for job in r.json()["jobs"]:
        st = KLIEN.get(f"/api/video/jobs/{job['job_id']}", headers=h(token)).json()
        assert st["status"] == "done" and st["progress"] == 100
        unduh = KLIEN.get(f"/api/video/jobs/{job['job_id']}/file", headers=h(token))
        assert unduh.status_code == 200 and len(unduh.content) > 10_000
        berkas = MEDIA / f"hasil-{job['job_id']}.mp4"
        berkas.write_bytes(unduh.content)
        info = _probe(berkas)
        assert (info["width"], info["height"]) == (720, 1280)
        assert 2.5 < info["duration"] < 3.6
        assert info["has_audio"]
    # Tugas yang dikirim ulang (acks_late) setelah selesai tidak dirender dua kali.
    args, kwargs = TUGAS[0]
    assert vt.render_video(*args, **kwargs)["status"] == "done"
    import kuota

    # Template + dua hasil render terhitung ke jatah akun ini (hitung ulang, tanpa cache).
    assert kuota.pemakaian_byte("pri-1006", paksa=True) > 50_000
    assert KLIEN.get("/api/video/info", headers=h(token)).json()["kuota"]["tamu"] is False


def test_tugas_ulangan_setelah_gagal_dilewati():
    job = vt.buat_job("upload://tidakada", "x", {"hook": "a"}, owner="siapa")
    vt.tulis_status(job, status="error", log="worker mati")
    assert vt.render_video(job, "upload://tidakada", "x", {"hook": "a"})["status"] == "error"


def test_hentikan_dan_hapus_job():
    token = akun("1007")
    tid = template_uji(token, "Henti")
    r = KLIEN.post("/api/video/jobs", headers=h(token), json={
        "url": "https://www.instagram.com/reel/XYZ/", "template_id": tid, "texts": {"hook": "UJI"}})
    job = r.json()["job_id"]
    assert KLIEN.post(f"/api/video/jobs/{job}/stop", headers=h(token)).status_code == 200
    assert KLIEN.get(f"/api/video/jobs/{job}", headers=h(token)).json()["status"] == "dibatalkan"
    assert KLIEN.delete(f"/api/video/jobs/{job}", headers=h(token)).json()["ok"]
    assert KLIEN.get(f"/api/video/jobs/{job}", headers=h(token)).status_code == 404


def test_template_bawaan_tidak_bisa_diubah_tapi_bisa_diduplikat():
    # Template bawaan (pemilik kosong) dibuat langsung di disk seperti seed awal.
    ve.save_template({"name": "Bawaan TV", "width": 720, "height": 1280}, "bawaan-tv-rakyat", owner="")
    token = akun("1008")
    assert KLIEN.get("/api/video/templates/bawaan-tv-rakyat", headers=h(token)).status_code == 200
    assert KLIEN.delete("/api/video/templates/bawaan-tv-rakyat", headers=h(token)).status_code == 403
    r = KLIEN.post("/api/video/templates/bawaan-tv-rakyat/duplicate", headers=h(token), json={"name": "Salinanku"})
    assert r.status_code == 200 and r.json()["can_edit"] is True


# ------------------------------------------------------------------
#  6. Outro dan penyapu disk
# ------------------------------------------------------------------


def test_outro_dpp_jadi_lalu_tersapu():
    dev = akun("1009")
    r = KLIEN.post("/api/outro/jobs", headers=h(dev), json={
        "channel": "TV Uji", "mode": "dpp",
        "akun": {"instagram": "tvuji", "tiktok": "tvuji"},
    })
    assert r.status_code == 200, r.text
    job = r.json()["job_id"]
    batas = time.time() + 240
    while time.time() < batas:
        st = KLIEN.get(f"/api/outro/jobs/{job}", headers=h(dev)).json()
        if st["status"] in ("done", "error", "dibatalkan"):
            break
        time.sleep(1)
    assert st["status"] == "done", st
    unduh = KLIEN.get(f"/api/outro/jobs/{job}/video", headers=h(dev))
    assert unduh.status_code == 200 and len(unduh.content) > 5_000
    import outro

    assert (outro.outro_dir() / "indeks.json").is_file()
    # Sapuan dengan umur 0: folder outro terbuang, entrinya ikut dilupakan.
    ve.bersihkan_volume(0)
    assert KLIEN.get(f"/api/outro/jobs/{job}", headers=h(dev)).status_code == 404


# ------------------------------------------------------------------
#  7. Edit Otomatis TVR Saya: template pribadi, draf, antrean
# ------------------------------------------------------------------

import hashlib  # noqa: E402

import tvr_api  # noqa: E402


def _png_kotak(latar=(20, 20, 60, 255)) -> bytes:
    """Panel bawah 720x300: latar gelap dengan bidang putih polos untuk tulisan."""
    from PIL import Image, ImageDraw

    im = Image.new("RGBA", (720, 300), latar)
    ImageDraw.Draw(im).rectangle((20, 40, 700, 280), fill=(255, 255, 255, 255))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _berkas_video(nama: str, *argumen: str) -> bytes:
    tujuan = MEDIA / nama
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *argumen, str(tujuan)], check=True)
    return tujuan.read_bytes()


def _hijau() -> bytes:
    return _berkas_video(
        "boom-hijau.mp4", "-f", "lavfi",
        "-i", "color=c=0x00C040:s=280x158:d=2,drawbox=x=90:y=40:w=100:h=80:color=red:t=fill",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
    )


def _gif() -> bytes:
    return _berkas_video(
        "boom.gif", "-f", "lavfi", "-i", "testsrc=s=120x80:d=1:r=10",
        "-vf", "split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse",
    )


def _webm_alpha() -> bytes:
    return _berkas_video(
        "boom-alpha.webm", "-f", "lavfi",
        "-i", "color=c=black@0.0:s=200x100:d=1,format=yuva420p,drawbox=x=50:y=25:w=100:h=50:color=red@1:t=fill",
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
    )


def _penutup() -> bytes:
    return _berkas_video(
        "penutup.mp4", "-f", "lavfi", "-i", "color=c=navy:s=720x1280:d=2:r=30",
        "-f", "lavfi", "-i", "sine=frequency=880:duration=2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
    )


def _draf(id_akun: str, slot: str, nama: str, isi: bytes):
    return KLIEN.post(
        f"/api/tvr/template/draf/{slot}",
        headers=h(id_akun),
        files={"file": (nama, isi, "application/octet-stream")},
    )


def _aset_tvr(id_akun: str) -> list[str]:
    folder = ve.template_path(f"tvr-{id_akun}") / "assets"
    return sorted(p.name for p in folder.iterdir() if p.is_file()) if folder.is_dir() else []


KOTAK_UJI = {"x": 30, "y": 1000, "w": 660, "h": 230}


def _tetapkan(id_akun: str, **tambahan: Any):
    return KLIEN.put("/api/tvr/template", headers=h(id_akun), json={"text_box": KOTAK_UJI, **tambahan})


def _template_siap(id_akun: str) -> None:
    assert _draf(id_akun, "kotak", "kotak.png", _png_kotak()).status_code == 200
    assert _draf(id_akun, "bingkai", "bingkai.png", png(720, 120, (200, 0, 0, 255))).status_code == 200
    r = _tetapkan(id_akun)
    assert r.status_code == 200, r.text


def test_tvr_wajib_identitas():
    assert KLIEN.get("/api/tvr/ringkas").status_code == 401
    assert KLIEN.get("/api/tvr/ringkas", headers=h("abc")).status_code == 401


def test_tvr_template_draf_validasi_dan_tetapkan():
    a = "8001"
    awal = KLIEN.get("/api/tvr/ringkas", headers=h(a)).json()
    assert awal["template"]["ada"] is False and awal["job"] is None
    # Kotak monas wajib PNG: ekstensi lain ditolak, begitu juga JPG yang diganti namanya.
    r = _draf(a, "kotak", "kotak.jpg", b"\xff\xd8\xff\xe0isi-jpeg")
    assert r.status_code == 415 and "wajib PNG" in r.json()["detail"]
    r = _draf(a, "kotak", "kotak.png", b"\xff\xd8\xff\xe0bukan-png")
    assert r.status_code == 415 and "bukan PNG asli" in r.json()["detail"]
    assert _draf(a, "bingkai", "b.gif", _gif()).status_code == 415
    assert _draf(a, "tidakada", "x.png", _png_kotak()).status_code == 404
    # PNG asli masuk DRAF; template dibuat tapi belum ditetapkan.
    r = _draf(a, "kotak", "kotak.png", _png_kotak())
    assert r.status_code == 200, r.text
    t = r.json()["template"]
    assert t["ada"] and not t["siap"]
    assert t["slot"]["kotak"] == {"ada": False, "draf": True, "jenis": "gambar"}
    # Belum lengkap: bingkai wajib, dan tidak ada yang dipindahkan.
    r = _tetapkan(a)
    assert r.status_code == 400 and "Bingkai teratas" in r.json()["detail"]
    assert _aset_tvr(a) == []
    assert _draf(a, "bingkai", "bingkai.png", png(720, 120, (200, 0, 0, 255))).status_code == 200
    r = KLIEN.put("/api/tvr/template", headers=h(a), json={})
    assert r.status_code == 400 and "posisi tulisan" in r.json()["detail"]
    r = KLIEN.put("/api/tvr/template", headers=h(a), json={"text_box": {"x": 600, "y": 0, "w": 300, "h": 100}})
    assert r.status_code == 422
    # Pratinjau & deteksi memakai draf.
    r = KLIEN.get("/api/tvr/template/pratinjau.png?kotak=30,1000,660,230&warna=black&teks=HALO", headers=h(a))
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content[:4] == b"\x89PNG"
    tvr_api._deteksi_terakhir.clear()
    r = KLIEN.post("/api/tvr/template/deteksi", headers=h(a))
    assert r.status_code == 200, r.text
    kotak = r.json()["text_box"]
    assert kotak["y"] > 900 and kotak["w"] > 500
    assert KLIEN.post("/api/tvr/template/deteksi", headers=h(a)).status_code == 429
    r = KLIEN.put("/api/tvr/template", headers=h(a), json={"text_box": kotak, "teks_warna": "black"})
    assert r.status_code == 200, r.text
    t = r.json()["template"]
    assert t["siap"] and t["slot"]["kotak"]["ada"] and not t["slot"]["kotak"]["draf"]
    assert t["text_box"] == kotak and t["teks_warna"] == "black"
    assert _aset_tvr(a) == ["bingkai.png", "kotak.png"]
    assert not (ve.template_path(f"tvr-{a}") / "assets" / ".draf").exists()


def test_tvr_edit_template_menggantikan_bukan_menumpuk():
    a = "8002"
    _template_siap(a)
    folder = ve.template_path(f"tvr-{a}") / "assets"
    sidik = hashlib.md5((folder / "bingkai.png").read_bytes()).hexdigest()
    # BATAL: draf dibuang, template lama utuh.
    assert _draf(a, "bingkai", "baru.png", png(720, 200, (0, 200, 0, 255))).status_code == 200
    r = KLIEN.delete("/api/tvr/template/draf", headers=h(a))
    assert r.status_code == 200 and not r.json()["template"]["slot"]["bingkai"]["draf"]
    assert hashlib.md5((folder / "bingkai.png").read_bytes()).hexdigest() == sidik
    # GIF lalu diganti MP4 hijau: hanya satu berkas boom yang tersisa.
    assert _draf(a, "boom", "boom.gif", _gif()).status_code == 200
    assert _tetapkan(a).status_code == 200
    assert "boom.gif" in _aset_tvr(a)
    r = _draf(a, "boom", "boom.mp4", _hijau())
    assert r.status_code == 200
    assert r.json()["template"]["slot"]["boom"]["alpha"] is False
    assert _tetapkan(a, kunci_hijau=True).status_code == 200
    assert _aset_tvr(a) == ["bingkai.png", "boom.mp4", "kotak.png"]
    boom = ve.load_template(f"tvr-{a}")["overlays"][1]
    assert boom["file"] == "assets/boom.mp4" and boom["loop"] and boom["kunci_hijau"]
    # WEBM transparan diubah jadi MOV beralpha supaya transparansinya terbaca.
    r = _draf(a, "boom", "boom.webm", _webm_alpha())
    assert r.status_code == 200, r.text
    assert r.json()["template"]["slot"]["boom"]["alpha"] is True
    assert _tetapkan(a).status_code == 200
    assert _aset_tvr(a) == ["bingkai.png", "boom.mov", "kotak.png"]
    # Kosongkan boom: berkasnya ikut dibuang. Kotak wajib tidak bisa dikosongkan.
    assert _tetapkan(a, kosongkan=["boom"]).status_code == 200
    assert _aset_tvr(a) == ["bingkai.png", "kotak.png"]
    assert _tetapkan(a, kosongkan=["kotak"]).status_code == 422


def test_tvr_penutup_dibatasi_durasinya(monkeypatch):
    a = "8003"
    monkeypatch.setattr(tvr_api, "MAKS_ANIMASI_DETIK", 1.0)
    r = _draf(a, "penutup", "penutup.mp4", _penutup())
    assert r.status_code == 413 and "maksimal" in r.json()["detail"]
    assert not list((ve.template_path(f"tvr-{a}") / "assets" / ".draf").glob("*"))


def test_tvr_antrean_satu_video_per_akun_dan_render():
    a, b = "8101", "8102"
    # Antrean bersih: job uji lain yang tak pernah dirender ditutup dulu.
    for sisa in vt._r().zrange(vt.KUNCI_AKTIF, 0, -1):
        vt.tulis_status(sisa, status="error", log="dibereskan uji")
    # Belum punya template yang ditetapkan: ditolak.
    r = KLIEN.post("/api/tvr/jobs", headers=h(a), json={"url": "https://www.instagram.com/reel/X/", "hook": "UJI"})
    assert r.status_code == 409
    _template_siap(a)
    _template_siap(b)
    assert _draf(a, "boom", "boom.mp4", _hijau()).status_code == 200
    assert _draf(a, "penutup", "penutup.mp4", _penutup()).status_code == 200
    assert _tetapkan(a, kunci_hijau=True).status_code == 200
    r = KLIEN.post("/api/tvr/jobs", headers=h(a), json={"url": "https://www.instagram.com/reel/X/", "hook": "   "})
    assert r.status_code == 422

    # Unggah sumber; unggahan orang lain tidak bisa dipakai.
    r = KLIEN.post("/api/tvr/sumber", headers=h(a), files={"file": ("s.mp4", video_sumber(3), "video/mp4")})
    assert r.status_code == 200, r.text
    sumber_a = r.json()["url"]
    r = KLIEN.post("/api/tvr/jobs", headers=h(b), json={"url": sumber_a, "hook": "UJI"})
    assert r.status_code == 404

    TUGAS.clear()
    r = KLIEN.post("/api/tvr/jobs", headers=h(a), json={
        "url": sumber_a, "hook": "VIRAL! UJI EDIT OTOMATIS TVR SAYA", "sumber": "SUMBER: @uji"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["job"]["status"] == "queued" and d["antrean"]["posisi"] == 1
    # Satu akun satu video: kiriman kedua ditolak selama belum dituntaskan.
    r = KLIEN.post("/api/tvr/jobs", headers=h(a), json={"url": sumber_a, "hook": "LAGI"})
    assert r.status_code == 409 and "masih diproses" in r.json()["detail"]
    # Akun lain mengantre di belakangnya, dengan perkiraan waktu tunggu.
    r = KLIEN.post("/api/tvr/jobs", headers=h(b), json={"url": "https://www.instagram.com/reel/B/", "hook": "UJI B"})
    assert r.status_code == 200, r.text
    antre_b = r.json()["antrean"]
    assert antre_b["posisi"] == 2 and antre_b["di_depan"] == 1
    assert antre_b["perkiraan_detik"] >= 2 * vt.rata_durasi() - 1

    # Worker mengerjakan video A (render ffmpeg sungguhan).
    args, kwargs = TUGAS[0]
    hasil = vt.render_video(*args, **kwargs)
    assert hasil["status"] == "done", hasil
    st = KLIEN.get("/api/tvr/jobs/saya", headers=h(a)).json()
    assert st["job"]["status"] == "done" and st["antrean"] is None
    assert KLIEN.get("/api/tvr/jobs/saya", headers=h(b)).json()["antrean"]["posisi"] == 1
    unduh = KLIEN.get("/api/tvr/jobs/saya/berkas", headers=h(a))
    assert unduh.status_code == 200 and unduh.headers["content-type"] == "video/mp4"
    berkas = MEDIA / "hasil-tvr.mp4"
    berkas.write_bytes(unduh.content)
    info = ve.probe(berkas)
    assert (info["width"], info["height"]) == (720, 1280) and info["has_audio"]
    # 3 detik video sumber + 2 detik video penutup.
    assert 4.5 < info["duration"] < 5.6
    assert KLIEN.get("/api/tvr/jobs/saya/berkas", headers=h(b)).status_code == 409
    r = KLIEN.post("/api/tvr/jobs", headers=h(a), json={"url": sumber_a, "hook": "LAGI"})
    assert r.status_code == 409 and "sudah jadi" in r.json()["detail"]

    # EDIT ULANG: hasil dihapus, sumber unggahan disimpan untuk dipakai lagi.
    folder_job = vt.job_path(d["job"]["job_id"])
    assert folder_job.is_dir()
    assert KLIEN.delete("/api/tvr/jobs/saya", headers=h(a)).json()["ok"]
    assert not folder_job.exists()
    assert KLIEN.get("/api/tvr/jobs/saya", headers=h(a)).json()["job"] is None
    assert ve.folder_unggahan(sumber_a).is_dir()
    r = KLIEN.post("/api/tvr/jobs", headers=h(a), json={"url": sumber_a, "hook": "ULANG"})
    assert r.status_code == 200
    job_ulang = r.json()["job"]["job_id"]
    # Batal selagi mengantre + buang sumbernya (seperti sesudah diunggah ke sosmed).
    assert KLIEN.delete("/api/tvr/jobs/saya?hapus_sumber=1", headers=h(a)).json()["ok"]
    assert vt.posisi_antrean(job_ulang) is None
    assert not ve.folder_unggahan(sumber_a).exists()
    # Tugas yang terlanjur di broker dilewati worker karena job-nya sudah tiada.
    args, kwargs = TUGAS[-1]
    assert vt.render_video(*args, **kwargs)["status"] == "hilang"


def test_tvr_render_dengan_gif_berulang():
    a = "8103"
    _template_siap(a)
    assert _draf(a, "boom", "boom.gif", _gif()).status_code == 200
    assert _tetapkan(a).status_code == 200
    r = KLIEN.post("/api/tvr/sumber", headers=h(a), files={"file": ("s.mp4", video_sumber(3), "video/mp4")})
    TUGAS.clear()
    r = KLIEN.post("/api/tvr/jobs", headers=h(a), json={"url": r.json()["url"], "hook": "UJI GIF"})
    assert r.status_code == 200, r.text
    args, kwargs = TUGAS[0]
    assert vt.render_video(*args, **kwargs)["status"] == "done"
    assert KLIEN.get("/api/tvr/jobs/saya", headers=h(a)).json()["job"]["status"] == "done"


def test_tvr_unggahan_baru_membuang_unggahan_lama():
    a = "8104"
    r1 = KLIEN.post("/api/tvr/sumber", headers=h(a), files={"file": ("1.mp4", video_sumber(2), "video/mp4")}).json()
    r2 = KLIEN.post("/api/tvr/sumber", headers=h(a), files={"file": ("2.mp4", video_sumber(2), "video/mp4")}).json()
    assert not ve.folder_unggahan(r1["url"]).exists()
    assert ve.folder_unggahan(r2["url"]).is_dir()


def test_tvr_identitas_tidak_membuat_template_awal():
    a = "8105"
    KLIEN.get("/api/tvr/ringkas", headers=h(a))
    assert ve.list_templates(owner=f"pri-{a}") == []


def test_tvr_template_persis_susunan_godam():
    a = "8106"
    assert _draf(a, "kotak", "kotak.png", _png_kotak()).status_code == 200
    assert _draf(a, "bingkai", "bingkai.png", png(720, 120, (200, 0, 0, 255))).status_code == 200
    assert _draf(a, "boom", "boom.gif", _gif()).status_code == 200
    # Bawaan sama dengan GODAM: tulisan putih, rata kiri-kanan, tanpa kategori.
    t = KLIEN.get("/api/tvr/ringkas", headers=h(a)).json()["template"]
    assert t["teks_warna"] == "white" and t["rata"] == "justify" and t["kategori"] == ""
    badge = {"x": 36, "y": 950, "w": 260, "h": 48}
    r = KLIEN.put("/api/tvr/template", headers=h(a), json={
        "text_box": KOTAK_UJI, "badge_box": badge, "kategori": "  news  ", "rata": "center", "teks_warna": "black"})
    assert r.status_code == 200, r.text
    t = r.json()["template"]
    assert t["kategori"] == "NEWS" and t["badge_box"] == badge and t["rata"] == "center"
    assert t["badge_box_default"] is not None
    tpl = ve.load_template(f"tvr-{a}")
    # Layer, teks, dan ukuran persis susunanBawaan GODAM.
    assert [o["label"] for o in tpl["overlays"]] == ["kotak monas", "boom like share", "bingkai teratas"]
    boom = tpl["overlays"][1]
    assert (boom["x"], boom["y"], boom["w"], boom["h"], boom["loop"]) == (45, 55, 280, 158, True)
    assert [x["name"] for x in tpl["texts"]] == ["hook", "kategori", "sumber"]
    assert tpl["texts"][0]["align"] == "center" and tpl["texts"][1]["source"] == "kategori"
    assert (tpl["width"], tpl["height"], tpl["fps"]) == (720, 1280, 30)
    # Kategori terlalu panjang ditolak; perataan asing ditolak.
    assert KLIEN.put("/api/tvr/template", headers=h(a), json={"text_box": KOTAK_UJI, "kategori": "X" * 31}).status_code == 422
    assert KLIEN.put("/api/tvr/template", headers=h(a), json={"text_box": KOTAK_UJI, "rata": "miring"}).status_code == 422
    # Pratinjau menerima pilihan yang belum disimpan.
    r = KLIEN.get("/api/tvr/template/pratinjau.png?badge=36,950,260,48&kategori=hiburan&rata=left", headers=h(a))
    assert r.status_code == 200 and r.content[:4] == b"\x89PNG"
    # Badge benar-benar tergambar di video: render lalu periksa pikselnya.
    r = KLIEN.post("/api/tvr/sumber", headers=h(a), files={"file": ("s.mp4", video_sumber(3), "video/mp4")})
    TUGAS.clear()
    assert KLIEN.post("/api/tvr/jobs", headers=h(a), json={"url": r.json()["url"], "hook": "UJI BADGE"}).status_code == 200
    args, kwargs = TUGAS[0]
    assert vt.render_video(*args, **kwargs)["status"] == "done"
    berkas = MEDIA / "hasil-badge.mp4"
    berkas.write_bytes(KLIEN.get("/api/tvr/jobs/saya/berkas", headers=h(a)).content)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "1", "-i", str(berkas),
                    "-frames:v", "1", "-update", "1", str(MEDIA / "badge.png")], check=True)
    from PIL import Image

    im = Image.open(MEDIA / "badge.png").convert("RGB")
    # Huruf badge (putih) tergambar di dalam kotaknya; video sumber di bagian
    # itu tidak punya piksel putih murni.
    putih = sum(
        1
        for x in range(100, badge["x"] + badge["w"])
        for y in range(badge["y"], badge["y"] + badge["h"])
        if min(im.getpixel((x, y))) > 235
    )
    assert putih > 150, putih
