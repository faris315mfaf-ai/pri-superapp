import numpy as np

from lacak import skor


def _vek(n, d=512, benih=0):
    r = np.random.default_rng(benih).standard_normal((n, d)).astype(np.float32)
    return r / np.linalg.norm(r, axis=1, keepdims=True)


def test_cocok_gambar_potongan_dengan_geser_waktu():
    asli = _vek(36, benih=1)  # frame tiap 2 dtk, 0..70
    waktu_asli = [i * 2.0 for i in range(36)]
    # saduran = detik 18..64 asli (frame 9..32), diberi sedikit gangguan
    idx = list(range(9, 33, 2))
    sad = asli[idx] + 0.05 * _vek(len(idx), benih=2)
    sad /= np.linalg.norm(sad, axis=1, keepdims=True)
    waktu_sad = [(i - 9) * 2.0 for i in idx]
    h = skor.cocok_gambar(sad, waktu_sad, asli, waktu_asli, jarak_frame=2.0)
    assert h.nilai == 1.0 and h.cocok == len(idx)
    assert h.bagian is not None and 16.0 <= h.bagian[0] <= 19.0 and 61.0 <= h.bagian[1] <= 66.0


def test_cocok_gambar_tidak_terkait():
    h = skor.cocok_gambar(_vek(10, benih=3), list(range(10)), _vek(30, benih=4), list(range(30)))
    assert h.nilai == 0 and h.bagian is None and h.strip == [0] * 10


def test_cocok_gambar_frame_menyimpang_diturunkan():
    asli = _vek(20, benih=5)
    waktu_asli = [i * 2.0 for i in range(20)]
    sad = asli[[2, 3, 4, 5, 15]].copy()  # frame terakhir melompat jauh (adegan lain)
    waktu_sad = [0.0, 2.0, 4.0, 6.0, 8.0]
    h = skor.cocok_gambar(sad, waktu_sad, asli, waktu_asli)
    assert h.strip[:4] == [2, 2, 2, 2] and h.strip[4] == 1


def test_cocok_gambar_kosong():
    h = skor.cocok_gambar(np.zeros((0, 512), np.float32), [], _vek(3), [0, 1, 2])
    assert h.nilai == 0 and h.strip == []


def test_cocok_suara_offset_dan_beda():
    rng = np.random.default_rng(7)
    a = rng.integers(0, 2**32, 500, dtype=np.uint64).astype(np.uint32)
    b = a[145:145 + 300].copy()
    b ^= (rng.random(300) < 0.03).astype(np.uint32)  # sedikit bit berubah (musik latar)
    ber, k = skor.cocok_suara(a, b)
    assert k == 145 and ber < 0.05
    acak = rng.integers(0, 2**32, 300, dtype=np.uint64).astype(np.uint32)
    ber2, _ = skor.cocok_suara(a, acak)
    assert ber2 > 0.35
    assert skor.cocok_suara(a[:10], b) is None


def test_nilai_suara_batas():
    assert skor.nilai_suara(0.06) == 1.0
    assert skor.nilai_suara(0.40) == 0.0
    assert 0.4 < skor.nilai_suara(0.25) < 0.6
    assert skor.nilai_suara(None) is None


def test_wm_cocok_mirip_tidak():
    assert skor.nilai_wm(["@kabarpesisir.tv"], ["kabarpesisir.tv"]) == 1.0
    assert skor.nilai_wm(["@KabarPesisir.TV"], ["Kabar Pesisir TV"]) == 1.0
    assert skor.nilai_wm(["@kabarpesisir"], ["kabarpesisirtv_official"]) == 0.5
    assert skor.nilai_wm(["@abc"], ["xyz"]) == 0.0
    assert skor.nilai_wm([], ["xyz"]) == 0.0


def test_waktu_paling_awal_dan_sesudah_saduran():
    w = skor.nilai_waktu([1000.0, 1000.0 + 25 * 60, 5000.0, None], [True, True, True, False], 4000.0)
    assert w[0] == 1.0 and 0.98 < w[1] < 1.0 and w[2] == 0.0 and w[3] == 0.5


def test_gabung_bobot_dan_musik_diganti():
    s = skor.gabung({"gambar": 0.96, "suara": 0.97, "wm": 1, "waktu": 1, "durasi": 1, "akun": 0.6})
    assert abs(s.total - 0.9565) < 1e-4
    s2 = skor.gabung({"gambar": 0.9, "suara": 0.1, "wm": 0, "waktu": 1, "durasi": 1, "akun": 0})
    assert s2.bobot["suara"] == 0 and abs(s2.bobot["gambar"] - 0.65) < 1e-9
    s3 = skor.gabung({"gambar": 0.5, "suara": None, "wm": 0, "waktu": 0, "durasi": 0, "akun": 0})
    assert s3.komponen["suara"] == 0 and s3.bobot["suara"] == 0


def test_zona_dan_pilih_paling_awal():
    assert skor.zona(0.9, 0.85, 0.6) == "yakin"
    assert skor.zona(0.7, 0.85, 0.6) == "perlu_acc"
    assert skor.zona(0.5, 0.85, 0.6) == "bukan"
    k = [
        {"zona": "yakin", "skor": 0.95, "_epoch": 2000.0},
        {"zona": "yakin", "skor": 0.88, "_epoch": 1000.0},
        {"zona": "perlu_acc", "skor": 0.7, "_epoch": 10.0},
    ]
    assert skor.pilih(k) == 1
    assert skor.pilih([{"zona": "bukan", "skor": 0.3}]) is None
    assert skor.pilih([{"zona": "yakin", "skor": 0.9, "_epoch": None}, {"zona": "yakin", "skor": 0.86, "_epoch": 5.0}]) == 1


def test_kredit_dan_label():
    assert skor.kredit("@kabarpesisir.tv") == "SUMBER: @KABARPESISIR.TV"
    assert skor.kredit("") == ""
    k = {"zona": "bukan", "komponen": {"gambar": 0.8, "suara": 0.1}, "akun": "@x"}
    assert skor.label_kandidat(k, False, []) == "Saduran lain, musik diganti"
    assert skor.label_kandidat({"zona": "bukan", "komponen": {"gambar": 0.05}}, False, []) == "Kejadian lain"


def test_penyelarasan_waktu_menaikkan_frame_berat_disunting():
    asli = _vek(30, benih=11)
    waktu_asli = [i * 2.0 for i in range(30)]
    idx = list(range(5, 25))
    sad = asli[idx].copy()
    # 6 frame diberi sunting berat: kemiripan ke frame aslinya tinggal ±0.65 (di bawah ambang cocok).
    gangguan = _vek(6, benih=12)
    for n, i in enumerate([1, 4, 7, 10, 13, 16]):
        v = 0.65 * sad[i] + 0.76 * gangguan[n]
        sad[i] = v / np.linalg.norm(v)
    waktu_sad = [(i - 5) * 2.0 for i in idx]
    h = skor.cocok_gambar(sad, waktu_sad, asli, waktu_asli, jarak_frame=2.0)
    assert h.nilai == 1.0 and h.cocok == 20, h.strip


def test_penyelarasan_tidak_berlaku_tanpa_bukti_cukup():
    asli = _vek(30, benih=13)
    sad = _vek(10, benih=14)
    sad[0] = asli[3]  # hanya satu frame kuat: selisih belum terbukti
    h = skor.cocok_gambar(sad, [i * 2.0 for i in range(10)], asli, [i * 2.0 for i in range(30)])
    assert h.cocok == 1 and h.strip.count(0) == 9
