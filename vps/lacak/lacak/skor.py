"""Penilaian kandidat — MURNI (tanpa jaringan / model), diuji di tests/test_skor.py.

Skor 0..1 dari enam komponen berbobot (BOBOT). Ambang zona diatur master (pengaturan):
  >= ambang_yakin -> "yakin" (dipakai otomatis; bila beberapa, yang diunggah paling awal)
  >= ambang_acc   -> "perlu_acc"
  lainnya         -> "bukan"
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

import numpy as np

BOBOT = {"gambar": 0.40, "suara": 0.25, "wm": 0.15, "waktu": 0.10, "durasi": 0.05, "akun": 0.05}

# SSCD (sscd_disc_mixup): kosinus > 0.75 = salinan dengan presisi ±90% (README SSCD).
SSCD_COCOK = 0.75
SSCD_SEBAGIAN = 0.60
# Frame yang letaknya tepat sejalan dengan selisih waktu terbukti: cukup segini untuk "sebagian".
SSCD_SELARAS_SEBAGIAN = 0.45
# PDQ: jarak Hamming <= 31 dari 256 bit = gambar yang sama (rekomendasi PDQ Meta).
PDQ_COCOK = 31

# Chromaprint: rasio bit berbeda (BER). <= 0.15 jelas sama, >= 0.35 tidak terkait.
BER_SAMA = 0.15
BER_BEDA = 0.35
DETIK_PER_ITEM_SUARA = 0.1238  # 4096 sampel / 3 pada 11025 Hz (chromaprint)

# Kandidat dianggap "cocok gambar" (ikut bersaing soal waktu unggah) bila gambar >= ini.
GAMBAR_LAYAK = 0.60


@dataclass
class HasilGambar:
    nilai: float
    strip: list[int]
    bagian: tuple[float, float] | None
    cocok: int
    sebagian: int


def cocok_gambar(
    vek_saduran: np.ndarray,
    waktu_saduran: list[float],
    vek_kandidat: np.ndarray,
    waktu_kandidat: list[float],
    pdq_saduran: list[np.ndarray] | None = None,
    pdq_kandidat: list[np.ndarray] | None = None,
    jarak_frame: float = 2.0,
) -> HasilGambar:
    """Cocokkan setiap frame kunci saduran ke frame kandidat terbaik.

    vek_* : matriks [n, d] vektor SSCD ternormalisasi L2. Urutan waktu harus sejalan: selisih waktu
    (kandidat - saduran) dari frame yang cocok dihitung mediannya; frame yang menyimpang jauh dari median
    diturunkan jadi "sebagian" (potongan adegan lain yang kebetulan mirip).
    """
    n = len(waktu_saduran)
    if n == 0 or len(waktu_kandidat) == 0:
        return HasilGambar(0.0, [0] * n, None, 0, 0)
    sim = vek_saduran @ vek_kandidat.T  # [n, m]
    terbaik = sim.argmax(axis=1)
    nilai_sim = sim[np.arange(n), terbaik]
    tingkat: list[int] = []
    for i in range(n):
        s = float(nilai_sim[i])
        cocok_pdq = False
        if pdq_saduran is not None and pdq_kandidat is not None:
            j = int(terbaik[i])
            cocok_pdq = int(np.count_nonzero(pdq_saduran[i] != pdq_kandidat[j])) <= PDQ_COCOK
        if s >= SSCD_COCOK or cocok_pdq:
            tingkat.append(2)
        elif s >= SSCD_SEBAGIAN:
            tingkat.append(1)
        else:
            tingkat.append(0)

    selisih = [waktu_kandidat[int(terbaik[i])] - waktu_saduran[i] for i in range(n) if tingkat[i] == 2]
    bagian: tuple[float, float] | None = None
    if selisih:
        median = float(np.median(selisih))
        toleransi = max(3.0, 2.5 * jarak_frame)
        # Penyelarasan waktu: bila selisih waktu sudah terbukti dari banyak frame kuat, frame lain dinilai
        # ulang terhadap frame kandidat DI POSISI YANG DIHARAPKAN (bukan sekadar yang termirip). Frame yang
        # diberi teks/filter berat sering hanya "sebagian" mirip padahal letaknya tepat.
        if len(selisih) >= max(3, int(0.3 * n)):
            wk = np.asarray(waktu_kandidat, dtype=np.float64)
            for i in range(n):
                if tingkat[i] == 2:
                    continue
                harap = waktu_saduran[i] + median
                j = int(np.abs(wk - harap).argmin())
                if abs(wk[j] - harap) > jarak_frame:
                    continue
                s_selaras = float(sim[i, j])
                if s_selaras >= SSCD_SEBAGIAN:
                    tingkat[i] = 2
                    terbaik[i] = j
                elif s_selaras >= SSCD_SELARAS_SEBAGIAN and tingkat[i] == 0:
                    tingkat[i] = 1
                    terbaik[i] = j
        waktu_cocok: list[float] = []
        for i in range(n):
            if tingkat[i] == 0:
                continue
            d = waktu_kandidat[int(terbaik[i])] - waktu_saduran[i]
            if abs(d - median) > toleransi:
                tingkat[i] = min(tingkat[i], 1) if tingkat[i] == 2 else 0
            elif tingkat[i] == 2:
                waktu_cocok.append(waktu_saduran[i] + median)
        if waktu_cocok:
            mulai = max(0.0, min(waktu_cocok) - jarak_frame / 2)
            akhir = max(waktu_cocok) + jarak_frame / 2
            akhir = min(akhir, max(waktu_kandidat) + jarak_frame)
            bagian = (round(mulai, 1), round(akhir, 1))
    cocok = tingkat.count(2)
    sebagian = tingkat.count(1)
    return HasilGambar(round((cocok + 0.5 * sebagian) / n, 4), tingkat, bagian, cocok, sebagian)


_POP = np.array([bin(i).count("1") for i in range(1 << 16)], dtype=np.uint8)


def _popcount(x: np.ndarray) -> np.ndarray:
    return _POP[x & 0xFFFF].astype(np.int32) + _POP[(x >> 16) & 0xFFFF]


def cocok_suara(a: np.ndarray, b: np.ndarray, min_tumpang: int = 40) -> tuple[float, int] | None:
    """Sidik chromaprint mentah (uint32) -> (BER terkecil, geser item `b` relatif `a`). None = terlalu pendek."""
    a = np.asarray(a, dtype=np.uint32)
    b = np.asarray(b, dtype=np.uint32)
    if len(a) < min_tumpang or len(b) < min_tumpang:
        return None
    terbaik = (1.0, 0)
    for k in range(-len(b) + min_tumpang, len(a) - min_tumpang + 1):
        i0 = max(0, k)
        j0 = max(0, -k)
        n = min(len(a) - i0, len(b) - j0)
        if n < min_tumpang:
            continue
        ber = float(_popcount(a[i0 : i0 + n] ^ b[j0 : j0 + n]).mean()) / 32.0
        if ber < terbaik[0]:
            terbaik = (ber, k)
    return terbaik


def nilai_suara(ber: float | None) -> float | None:
    if ber is None:
        return None
    return round(min(1.0, max(0.0, (BER_BEDA - ber) / (BER_BEDA - BER_SAMA))), 4)


_RAPI = re.compile(r"[^a-z0-9]")


def rapikan_handle(h: str) -> str:
    """'@Kabar.Pesisir_TV ' -> 'kabarpesisirtv' (untuk membandingkan, bukan untuk ditampilkan)."""
    return _RAPI.sub("", (h or "").lower().lstrip("@"))


def nilai_wm(handle_saduran: list[str], identitas_kandidat: list[str]) -> float:
    """1 = username watermark sama dengan pemilik kandidat; 0.5 = mirip (satu memuat yang lain); 0 = tidak."""
    a = {rapikan_handle(h) for h in handle_saduran if len(rapikan_handle(h)) >= 3}
    b = {rapikan_handle(h) for h in identitas_kandidat if len(rapikan_handle(h)) >= 3}
    if not a or not b:
        return 0.0
    if a & b:
        return 1.0
    for x in a:
        for y in b:
            if len(x) >= 5 and len(y) >= 5 and (x in y or y in x):
                return 0.5
    return 0.0


def nilai_durasi(durasi_k: float, durasi_s: float, piksel_k: int, piksel_s: int) -> float:
    n = 0.0
    if durasi_k > 0 and durasi_s > 0 and durasi_k >= durasi_s - 1:
        n += 0.5
    if piksel_k > 0 and piksel_s > 0 and piksel_k >= piksel_s:
        n += 0.5
    return n


def nilai_akun(jenis_koleksi: str | None, terverifikasi: bool) -> float:
    if jenis_koleksi in ("media_resmi", "instansi") or terverifikasi:
        return 1.0
    if jenis_koleksi == "kreator":
        return 0.6
    return 0.0


def nilai_waktu(waktu_kandidat: list[float | None], layak: list[bool], waktu_saduran: float | None) -> list[float]:
    """Waktu unggah (epoch detik). Yang paling awal di antara kandidat LAYAK (gambar cocok) = 1, makin
    lambat makin kecil (habis dalam 48 jam). Sesudah saduran = 0. Tidak diketahui = 0.5."""
    awal = [t for t, ok in zip(waktu_kandidat, layak) if ok and t is not None]
    paling_awal = min(awal) if awal else None
    hasil: list[float] = []
    for t in waktu_kandidat:
        if t is None:
            hasil.append(0.5)
            continue
        if waktu_saduran is not None and t > waktu_saduran + 60:
            hasil.append(0.0)
            continue
        if paling_awal is None:
            hasil.append(0.5)
            continue
        jam = max(0.0, (t - paling_awal) / 3600.0)
        hasil.append(round(max(0.0, 1.0 - jam / 48.0), 4))
    return hasil


@dataclass
class Skor:
    total: float
    komponen: dict[str, float]
    bobot: dict[str, float] = field(default_factory=lambda: dict(BOBOT))


def gabung(komponen: dict[str, float | None]) -> Skor:
    """Jumlah berbobot. Suara tidak bisa dibandingkan (None), atau musik diganti (suara rendah padahal gambar
    cocok) -> bobot suara dipindah ke gambar."""
    bobot = dict(BOBOT)
    suara = komponen.get("suara")
    gambar = float(komponen.get("gambar") or 0.0)
    if suara is None or (suara < 0.3 and gambar >= GAMBAR_LAYAK):
        bobot["gambar"] += bobot["suara"]
        bobot["suara"] = 0.0
    nilai = {k: float(komponen.get(k) or 0.0) for k in BOBOT}
    total = sum(bobot[k] * nilai[k] for k in BOBOT)
    return Skor(round(total, 4), {k: round(v, 4) for k, v in nilai.items()}, {k: round(v, 4) for k, v in bobot.items()})


def zona(skor: float, ambang_yakin: float, ambang_acc: float) -> str:
    if skor >= ambang_yakin:
        return "yakin"
    if skor >= ambang_acc:
        return "perlu_acc"
    return "bukan"


def pilih(kandidat: list[dict]) -> int | None:
    """Indeks kandidat zona 'yakin' yang diunggah paling awal (waktu tak diketahui dianggap paling akhir);
    seri -> skor tertinggi."""
    yakin = [(i, k) for i, k in enumerate(kandidat) if k.get("zona") == "yakin"]
    if not yakin:
        return None

    def kunci(p: tuple[int, dict]) -> tuple[float, float]:
        t = p[1].get("_epoch")
        return (t if t is not None else math.inf, -float(p[1].get("skor") or 0))

    return min(yakin, key=kunci)[0]


def label_kandidat(k: dict, terpilih: bool, handle_saduran: list[str]) -> str:
    if terpilih:
        return "Kemungkinan asli"
    z = k.get("zona")
    gambar = float(k.get("komponen", {}).get("gambar") or 0)
    if z == "yakin":
        if handle_saduran and nilai_wm(handle_saduran, [k.get("akun", "")]) >= 0.5:
            return "Pemilik sama, unggahan lain"
        return "Cocok, bukan yang paling awal"
    if gambar >= GAMBAR_LAYAK:
        suara = k.get("komponen", {}).get("suara")
        if suara is not None and suara < 0.3:
            return "Saduran lain, musik diganti"
        return "Saduran lain"
    if gambar >= 0.25:
        return "Mirip sebagian"
    return "Kejadian lain"


def kredit(akun: str) -> str:
    a = (akun or "").strip()
    if not a:
        return ""
    return f"SUMBER: {a.upper()}"
