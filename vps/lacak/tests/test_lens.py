"""Uji cari balik gambar (Google Lens via SerpApi) — tanpa internet: httpx diganti MockTransport."""

import httpx
import numpy as np
import pytest
from PIL import Image

from lacak import konfig, lens, simpan

TIKTOK = "https://www.tiktok.com/@akunasli/video/7425519034128111111"
TIKTOK2 = "https://www.tiktok.com/@akunlain/video/7425519034128222222"
IG = "https://www.instagram.com/reel/AbCdEfGh123/"
BUKAN_VIDEO = "https://www.tiktok.com/@akunasli"
BERITA = "https://contoh.com/berita/123"

ATUR = {"cari_lens": True}


def _frame(tmp_path, nama, besar=False):
    rng = np.random.default_rng(1)
    ukuran = (1600, 900) if besar else (120, 80)
    arr = rng.integers(0, 255, (ukuran[1], ukuran[0], 3), dtype=np.uint8)
    p = tmp_path / nama
    Image.fromarray(arr).save(p, "PNG")
    return str(p)


class Server:
    """Meniru SerpApi: /account, /image, /search. Mencatat permintaan."""

    def __init__(self, sisa=100, status_cari=200, hasil=None):
        self.sisa = sisa
        self.status_cari = status_cari
        self.hasil = hasil if hasil is not None else {
            "visual_matches": [
                {"link": TIKTOK, "title": "Video asli", "thumbnail": "https://tiktokcdn.com/a.jpg"},
                {"link": BERITA, "title": "Artikel"},
                {"link": BUKAN_VIDEO, "title": "Profil"},
                {"link": TIKTOK, "title": "Duplikat"},
                {"link": IG, "title": "Reel"},
            ]
        }
        self.permintaan: list[str] = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.permintaan.append(req.url.path)
        if req.url.path == "/account":
            return httpx.Response(200, json={"total_searches_left": self.sisa})
        if req.url.path == "/image":
            return httpx.Response(200, json={"message": "ok", "image_id": "abc123"})
        if req.url.path == "/search":
            assert req.url.params["engine"] == "google_lens"
            assert req.url.params["image_id"] == "abc123"
            assert req.url.params["type"] == "visual_matches"
            if self.status_cari != 200:
                return httpx.Response(self.status_cari, json={"error": "x"})
            return httpx.Response(200, json=self.hasil)
        return httpx.Response(404)


@pytest.fixture
def pasang(monkeypatch):
    monkeypatch.setenv("SERPAPI_KEY", "kunci-uji")

    def _pasang(server: Server):
        asli = httpx.Client

        def klien(*a, **k):
            k["transport"] = httpx.MockTransport(server)
            return asli(*a, **k)

        monkeypatch.setattr(httpx, "Client", klien)
        return server

    return _pasang


def test_kandidat_hanya_link_video_tanpa_duplikat():
    k = lens.kandidat_dari_hasil(Server().hasil)
    assert [x["url"] for x in k] == [TIKTOK, IG]
    assert all(x["lewat"] == "lens" for x in k)
    assert k[0]["gambar"].endswith("a.jpg")


def test_kandidat_tahan_data_rusak():
    assert lens.kandidat_dari_hasil({}) == []
    assert lens.kandidat_dari_hasil({"visual_matches": [None, "x", {"link": 5}]}) == []


def test_pilih_frame_merata_di_tengah():
    f = list(range(10))
    p = lens.pilih_frame(f, 2)
    assert len(p) == 2 and 0 not in p and 9 not in p and p == sorted(p)
    assert lens.pilih_frame([1, 2], 3) == [1, 2]
    assert lens.pilih_frame([], 2) == []
    # daftar kecil: tetap n frame berbeda (dulu pembulatan menggabungkannya jadi satu)
    for ukuran in range(3, 30):
        for n in (1, 2, 3, 4):
            p = lens.pilih_frame(list(range(ukuran)), n)
            assert len(p) == min(n, ukuran) and len(set(p)) == len(p), (ukuran, n, p)


def test_jpeg_muat_batas_unggah(tmp_path):
    data = lens.siapkan_jpeg(_frame(tmp_path, "besar.png", besar=True))
    assert len(data) <= lens.MAKS_BYTE
    assert data[:2] == b"\xff\xd8"


def test_tersedia_syarat(monkeypatch):
    monkeypatch.delenv("SERPAPI_KEY", raising=False)
    assert lens.tersedia({"cari_lens": False}) == (False, "dimatikan")
    assert lens.tersedia(ATUR) == (False, "kunci SerpApi belum dipasang")
    monkeypatch.setenv("SERPAPI_KEY", "k")
    assert lens.tersedia(ATUR) == (True, "")
    simpan.lens_tambah(lens.bulan_ini(), konfig.LENS_KUOTA)
    assert lens.tersedia(ATUR) == (False, "kuota bulan ini habis")


def test_kuota_tampil_nol_tanpa_kunci(monkeypatch):
    monkeypatch.delenv("SERPAPI_KEY", raising=False)
    assert lens.kuota() == 0
    monkeypatch.setenv("SERPAPI_KEY", "k")
    assert lens.kuota() == konfig.LENS_KUOTA


def test_jalur_normal_dua_pencarian(tmp_path, pasang):
    s = pasang(Server())
    frame = [_frame(tmp_path, f"f{i}.png") for i in range(6)]
    hasil, catatan = lens.dari_frame(frame, ATUR)
    assert [x["url"] for x in hasil] == [TIKTOK, IG]  # dua frame mengembalikan hasil sama -> digabung
    assert s.permintaan.count("/search") == konfig.LENS_FRAME
    assert s.permintaan.count("/image") == konfig.LENS_FRAME
    assert lens.terpakai() == konfig.LENS_FRAME
    assert "kandidat" in catatan


def test_dilewati_bila_sumber_lain_ada(tmp_path, pasang):
    s = pasang(Server())
    hasil, catatan = lens.dari_frame([_frame(tmp_path, "a.png")], ATUR, butuh=False)
    assert hasil == [] and "dilewati" in catatan
    assert s.permintaan == [] and lens.terpakai() == 0


def test_sisa_serpapi_membatasi_jumlah_pencarian(tmp_path, pasang):
    s = pasang(Server(sisa=1))
    frame = [_frame(tmp_path, f"f{i}.png") for i in range(6)]
    lens.dari_frame(frame, ATUR)
    assert s.permintaan.count("/search") == 1


def test_sisa_nol_tidak_memanggil_pencarian(tmp_path, pasang):
    s = pasang(Server(sisa=0))
    hasil, catatan = lens.dari_frame([_frame(tmp_path, "a.png")], ATUR)
    assert hasil == [] and "habis" in catatan
    assert "/search" not in s.permintaan and lens.terpakai() == 0


def test_kuota_habis_429_berhenti_tanpa_melempar(tmp_path, pasang):
    pasang(Server(status_cari=429))
    hasil, catatan = lens.dari_frame([_frame(tmp_path, f"f{i}.png") for i in range(5)], ATUR)
    assert hasil == [] and "berhenti" in catatan
    assert lens.terpakai() == 0  # pencarian gagal tidak dihitung


def test_kunci_ditolak_401(tmp_path, pasang):
    pasang(Server(status_cari=401))
    hasil, catatan = lens.dari_frame([_frame(tmp_path, f"f{i}.png") for i in range(5)], ATUR)
    assert hasil == [] and "ditolak" in catatan


def test_galat_satu_frame_tidak_menghentikan_yang_lain(tmp_path, pasang):
    s = pasang(Server(status_cari=500))
    hasil, catatan = lens.dari_frame([_frame(tmp_path, f"f{i}.png") for i in range(5)], ATUR)
    assert hasil == [] and s.permintaan.count("/search") == konfig.LENS_FRAME
    assert lens.terpakai() == 0


def test_tanpa_hasil_tetap_dihitung(tmp_path, pasang):
    pasang(Server(hasil={"error": "Google hasn't returned any results for this query."}))
    hasil, _ = lens.dari_frame([_frame(tmp_path, f"f{i}.png") for i in range(5)], ATUR)
    assert hasil == [] and lens.terpakai() == konfig.LENS_FRAME


def test_frame_rusak_tidak_melempar(tmp_path, pasang):
    pasang(Server())
    rusak = tmp_path / "rusak.png"
    rusak.write_bytes(b"bukan gambar")
    hasil, catatan = lens.dari_frame([str(rusak)], ATUR)
    assert hasil == [] and isinstance(catatan, str)
