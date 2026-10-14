from lacak import teks


def test_ekstrak_handle_frekuensi():
    frame = [
        [("DETIK-DETIK JEMBATAN PUTUS", 0.99), ("@kabarpesisir.tv", 0.98)],
        [("@kabarpesisir.tv", 0.95), ("00:00:10", 0.9)],
        [("@viralnusantara_", 0.9)],
        [],
    ]
    h = teks.ekstrak_handle(frame)
    assert h[0]["handle"] == "@kabarpesisir.tv" and h[0]["frame"] == 2 and h[0]["total"] == 4
    assert abs(h[0]["yakin"] - 0.965) < 1e-3
    assert h[1]["handle"] == "@viralnusantara"


def test_ekstrak_handle_spasi_ocr_dan_sampah():
    h = teks.ekstrak_handle([[("TikTok @ kabar_pesisir.", 0.9), ("email@gmail.com", 0.9), ("@a", 0.9)]])
    assert [x["handle"] for x in h] == ["@kabar_pesisir"]


def test_kata_kunci_frasa_dahulu():
    k = teks.kata_kunci(
        judul="Jembatan gantung putus diterjang banjir #viral @akun",
        deskripsi="Jembatan gantung di Desa Sungai Rampah putus https://t.co/x",
        teks_layar=["DETIK-DETIK JEMBATAN PUTUS"],
        transkrip="warga diminta menjauh dari jembatan gantung desa sungai rampah",
    )
    assert k[0] == "jembatan gantung"
    assert "desa sungai rampah" in k
    assert "viral" not in k and "akun" not in k and len(k) <= 6


def test_kata_kunci_kosong():
    assert teks.kata_kunci() == []


def test_ekstrak_handle_gabung_salah_baca():
    frame = [[("@kabarpesisir.tv", 0.98)], [("@kabarpesisir.tv", 0.97)], [("@kabarpesisir.ty", 0.6)], [("@lain_sekali", 0.9)]]
    h = teks.ekstrak_handle(frame)
    assert h[0] == {"handle": "@kabarpesisir.tv", "frame": 3, "total": 4, "yakin": round((0.98 + 0.97 + 0.6) / 3, 3)}
    assert [x["handle"] for x in h] == ["@kabarpesisir.tv", "@lain_sekali"]
