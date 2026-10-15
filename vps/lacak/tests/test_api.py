import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def klien(monkeypatch):
    from lacak import api, pekerja, simpan

    monkeypatch.setattr(pekerja, "mulai", lambda: simpan.siapkan())  # tanpa utas pekerja (tanpa jaringan)
    with TestClient(api.app) as c:
        yield c


UMUM = {"x-pengguna": "176"}
LAIN = {"x-pengguna": "177"}
MASTER = {"x-pengguna": "4", "x-peran": "master"}
BOT = {"x-pengguna": "900", "x-bot": "1"}
URL = "https://www.tiktok.com/@viralnusantara_/video/7425519034128"


def test_tanpa_identitas_ditolak(klien):
    assert klien.post("/jobs", json={"url": URL}).status_code == 401
    assert klien.get("/pengaturan", headers={"x-pengguna": "abc"}).status_code == 401


def test_buat_job_dan_jatah_berjalan(klien):
    r = klien.post("/jobs", json={"url": URL}, headers=UMUM)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["status"] == "antre" and j["sumber"] == "pengguna" and len(j["tahap"]) == 6
    assert not any(k.startswith("_") for k in j)
    r2 = klien.post("/jobs", json={"url": URL}, headers=UMUM)
    assert r2.status_code == 429 and "berjalan" in r2.json()["detail"]
    assert klien.post("/jobs", json={"url": URL}, headers=MASTER).status_code == 200


def test_lihat_job_hanya_pemilik_atau_master(klien):
    j = klien.post("/jobs", json={"url": URL}, headers=UMUM).json()
    assert klien.get(f"/jobs/{j['id']}", headers=UMUM).status_code == 200
    assert klien.get(f"/jobs/{j['id']}", headers=LAIN).status_code == 404
    assert klien.get(f"/jobs/{j['id']}", headers=MASTER).status_code == 200
    assert klien.get("/jobs/../../etc", headers=MASTER).status_code == 404
    # belum selesai -> keputusan ditolak
    r = klien.post(f"/jobs/{j['id']}/keputusan", json={"aksi": "pakai_asli", "kandidat": 0}, headers=UMUM)
    assert r.status_code == 400


def test_url_ditolak(klien):
    for u in [
        "http://127.0.0.1/x",
        "http://10.0.0.5/video",
        "ftp://contoh.com/a",
        "https://localhost/x",
        "http://lacak-qdrant:6333/collections",  # layanan internal tanpa titik
        "http://2130706433/",  # 127.0.0.1 dalam bentuk angka
        "http://rebind.contoh-jahat.com/x",  # nama publik yang menunjuk ke alamat privat
        "https://tidak-ada.invalid/x",
    ]:
        assert klien.post("/jobs", json={"url": u}, headers=MASTER).status_code == 400, u


def test_sakelar_pengguna_dan_bot(klien):
    p = klien.get("/pengaturan", headers=UMUM).json()
    assert p["tombol_pengguna"] is True and p["cari_lens"] is False
    baru = {**p, "tombol_pengguna": False, "lacak_bot": False}
    assert klien.put("/pengaturan", json=baru, headers=UMUM).status_code == 403
    assert klien.put("/pengaturan", json=baru, headers=MASTER).status_code == 200
    assert klien.post("/jobs", json={"url": URL}, headers=UMUM).status_code == 403
    assert klien.post("/jobs", json={"url": URL}, headers=BOT).status_code == 409
    assert klien.post("/jobs", json={"url": URL}, headers=MASTER).status_code == 200


def test_pengaturan_validasi(klien):
    p = klien.get("/pengaturan", headers=MASTER).json()
    assert klien.put("/pengaturan", json={**p, "ambang_yakin": 0.62, "ambang_acc": 0.6}, headers=MASTER).status_code == 400
    # Lens menyala hanya bila SERPAPI_KEY terpasang di mesin.
    r = klien.put("/pengaturan", json={**p, "ambang_yakin": 0.9, "ambang_acc": 0.65, "cari_lens": True}, headers=MASTER)
    assert r.status_code == 400 and "SerpApi" in r.json()["detail"]
    r = klien.put("/pengaturan", json={**p, "ambang_yakin": 0.9, "ambang_acc": 0.65, "cari_lens": False}, headers=MASTER)
    assert r.status_code == 200 and r.json()["ambang_yakin"] == 0.9 and r.json()["cari_lens"] is False
    assert klien.put("/pengaturan", json={**p, "ambang_yakin": 1.5}, headers=MASTER).status_code == 422


def test_pengaturan_lens_menyala_dengan_kunci(klien, monkeypatch):
    monkeypatch.setenv("SERPAPI_KEY", "kunci-uji")
    p = klien.get("/pengaturan", headers=MASTER).json()
    r = klien.put("/pengaturan", json={**p, "cari_lens": True}, headers=MASTER)
    assert r.status_code == 200 and r.json()["cari_lens"] is True
    s = klien.get("/koleksi", headers=MASTER).json()["statistik"]
    assert s["lens_kuota"] > 0 and s["lens_bulan_ini"] == 0


def test_statistik_lens_nol_tanpa_kunci(klien, monkeypatch):
    monkeypatch.delenv("SERPAPI_KEY", raising=False)
    s = klien.get("/koleksi", headers=MASTER).json()["statistik"]
    assert s["lens_kuota"] == 0


def test_koleksi_crud(klien):
    assert klien.get("/koleksi", headers=UMUM).status_code == 403
    r = klien.post("/koleksi", json={"url": "https://www.tiktok.com/@kabarpesisir.tv?lang=id", "jenis": "media_resmi"}, headers=MASTER)
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["handle"] == "@kabarpesisir.tv" and a["platform"] == "TikTok" and a["url"] == "https://www.tiktok.com/@kabarpesisir.tv" and a["aktif"]
    # dobel -> akun yang sama
    assert klien.post("/koleksi", json={"url": "https://tiktok.com/@kabarpesisir.tv", "jenis": "kreator"}, headers=MASTER).json()["id"] == a["id"]
    assert klien.post("/koleksi", json={"url": "https://www.tiktok.com/video/1"}, headers=MASTER).status_code == 400
    u = klien.patch(f"/koleksi/{a['id']}", json={"aktif": False, "jenis": "instansi"}, headers=MASTER).json()
    assert u["aktif"] is False and u["jenis"] == "instansi"
    k = klien.get("/koleksi", headers=MASTER).json()
    assert len(k["akun"]) == 1 and k["statistik"]["akun"] == 1 and k["statistik"]["lens_kuota"] == 0
    assert klien.delete(f"/koleksi/{a['id']}", headers=MASTER).json() == {"sukses": True}
    assert klien.delete(f"/koleksi/{a['id']}", headers=MASTER).status_code == 404


@pytest.mark.parametrize(
    "url,harap",
    [
        ("https://www.instagram.com/warga.kotaku/", ("@warga.kotaku", "Instagram", "https://www.instagram.com/warga.kotaku/")),
        ("https://m.youtube.com/@KanalHulu", ("@KanalHulu", "YouTube", "https://www.youtube.com/@KanalHulu/shorts")),
        ("https://www.youtube.com/channel/UCabc", ("UCabc", "YouTube", "https://www.youtube.com/channel/UCabc/shorts")),
        ("https://www.facebook.com/InfoKotaHarian", ("InfoKotaHarian", "Facebook", "https://www.facebook.com/InfoKotaHarian/videos")),
    ],
)
def test_akun_dari_url(url, harap):
    from lacak.api import akun_dari_url

    assert akun_dari_url(url) == harap


def test_riwayat_pemilik_vs_master(klien):
    klien.post("/jobs", json={"url": URL}, headers=UMUM)
    klien.post("/jobs", json={"url": URL}, headers=LAIN)
    assert len(klien.get("/riwayat", headers=UMUM).json()["item"]) == 1
    item = klien.get("/riwayat", headers=MASTER).json()["item"]
    assert len(item) == 2 and {"id", "status", "judul", "skor", "zona", "kredit"} <= set(item[0])


def test_sehat(klien):
    r = klien.get("/sehat").json()
    assert r["sehat"] is True and "qdrant" in r


def test_hidup_dangkal(klien):
    assert klien.get("/hidup").status_code == 200


def test_batal_job_antre(klien):
    j = klien.post("/jobs", json={"url": URL}, headers=UMUM).json()
    assert klien.post(f"/jobs/{j['id']}/batal", headers=LAIN).status_code == 404
    r = klien.post(f"/jobs/{j['id']}/batal", headers=UMUM).json()
    assert r["status"] == "gagal" and r["pesan"] == "Dibatalkan."
    # slot berjalan kembali kosong -> boleh mulai lagi
    assert klien.post("/jobs", json={"url": URL}, headers=UMUM).status_code == 200


def test_antrean_cadangan_bot(klien, monkeypatch):
    from lacak import pekerja

    monkeypatch.setattr(pekerja, "posisi_antrean", lambda: 55)
    assert klien.post("/jobs", json={"url": URL}, headers=MASTER).status_code == 503
    assert klien.post("/jobs", json={"url": URL}, headers=BOT).status_code == 200


def test_keputusan_pengguna_biasa_tidak_mengubah_koleksi():
    from lacak import pekerja, simpan

    job = pekerja.job_baru(URL, "176", "pengguna")
    antre_awal = pekerja.posisi_antrean()
    job.update(
        status="selesai",
        terpilih=None,
        kandidat=[{"url": "https://www.tiktok.com/@baru/video/5", "akun": "@baru", "platform": "TikTok", "ditemukan_lewat": "web", "_identitas": ["baru"]}],
    )
    simpan.simpan_job(job)
    pekerja.putuskan(job, "pakai_asli", 0, "176", ubah_koleksi=False)
    assert simpan.daftar_akun() == [] and pekerja.posisi_antrean() == antre_awal  # tidak ada unduhan koleksi
    pekerja.putuskan(job, "pakai_asli", 0, "4", ubah_koleksi=True)
    assert [a["handle"] for a in simpan.daftar_akun()] == ["@baru"] and pekerja.posisi_antrean() == antre_awal + 1
