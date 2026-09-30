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
