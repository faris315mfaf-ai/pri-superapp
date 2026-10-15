"""Pekerja pelacakan: satu utas, satu pekerjaan sekaligus (CPU dibagi dengan render Auto Edit).

Antrean berisi ("job", id) atau ("masuk", url, akun_id) — yang kedua memasukkan video asli pilihan master ke
koleksi. Saat antrean kosong: panen satu akun koleksi, lalu bersih-bersih data lama.
"""

from __future__ import annotations

import queue
import shutil
import threading
import time
import traceback
import uuid
from contextlib import contextmanager
from pathlib import Path

import numpy as np

from . import cari, indeks, konfig, lens, media, sidik, simpan, skor, teks
from .media import GalatLacak

TAHAP = [
    ("ambil", "Ambil video"),
    ("frame", "Frame kunci"),
    ("teks", "Baca teks"),
    ("ucapan", "Teks ucapan"),
    ("cari", "Cari kandidat"),
    ("cocok", "Cocokkan"),
]
MAKS_ANALISIS_KANDIDAT = max(konfig.MAKS_ANALISIS_DETIK * 2, 360)
MAKS_FRAME_KANDIDAT = 180
PRIORITAS_LEWAT = {"koleksi": 0, "akun": 1, "youtube": 2, "web": 3, "lens": 4}

_antrean: "queue.Queue[tuple]" = queue.Queue()
_kunci_job = threading.Lock()
_minta_batal: set[str] = set()
# Kandidat per sumber sebelum disaring sampul (supaya satu sumber tidak menghabiskan semua slot).
MAKS_PER_SUMBER = 8
_utas: threading.Thread | None = None
_sedang: dict[str, str] = {}


def _kini_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def job_baru(url: str, pengguna: str, sumber: str) -> dict:
    kini = time.time()
    job = {
        "id": uuid.uuid4().hex[:16],
        "status": "antre",
        "pesan": "",
        "sumber": sumber,
        "diminta_oleh": pengguna,
        "dibuat": _kini_iso(),
        "selesai": None,
        "tahap": [{"kunci": k, "nama": n, "status": "tunggu", "detik": None, "catatan": ""} for k, n in TAHAP],
        "saduran": None,
        "petunjuk": None,
        "kandidat": [],
        "terpilih": None,
        "zona": None,
        "kredit": "",
        "keputusan": None,
        "_url": url,
        "_dibuat_epoch": kini,
        "_selesai_epoch": None,
    }
    simpan.simpan_job(job)
    _antrean.put(("job", job["id"]))
    return job


def masukkan_koleksi_nanti(url: str, akun_id: int | None) -> None:
    _antrean.put(("masuk", url, akun_id))


def publik(job: dict) -> dict:
    """Buang kunci internal (diawali _) sebelum dikirim ke luar."""
    hasil = {k: v for k, v in job.items() if not k.startswith("_")}
    hasil["kandidat"] = [{k: v for k, v in c.items() if not k.startswith("_")} for c in job.get("kandidat") or []]
    return hasil


def posisi_antrean() -> int:
    return _antrean.qsize()


def batalkan(job: dict) -> dict:
    """Antre -> langsung dibatalkan. Berjalan -> ditandai; berhenti di batas tahap/kandidat berikutnya."""
    if job["status"] == "antre":
        job["status"] = "gagal"
        job["pesan"] = "Dibatalkan."
        job["_selesai_epoch"] = time.time()
        job["selesai"] = _kini_iso()
        simpan.simpan_job(job)
    elif job["status"] == "berjalan":
        _minta_batal.add(job["id"])
    return job


def _cek_batal(job: dict) -> None:
    if job["id"] in _minta_batal:
        raise GalatLacak("Dibatalkan.")


def sedang_dikerjakan() -> str | None:
    return _sedang.get("id")


def utas_hidup() -> bool:
    return _utas is not None and _utas.is_alive()


# ------------------------------------------------------------------ utas


def mulai() -> None:
    """Dipanggil sekali saat layanan menyala."""
    global _utas
    simpan.siapkan()
    for j in simpan.job_dengan_status(("berjalan",)):
        j["status"] = "gagal"
        j["pesan"] = "Layanan dimulai ulang saat melacak. Silakan coba lagi."
        j["_selesai_epoch"] = time.time()
        j["selesai"] = _kini_iso()
        simpan.simpan_job(j)
    for j in simpan.job_dengan_status(("antre",)):
        _antrean.put(("job", j["id"]))
    if _utas is None or not _utas.is_alive():
        _utas = threading.Thread(target=_putaran, name="lacak-pekerja", daemon=True)
        _utas.start()


def _putaran() -> None:
    bersih_terakhir = 0.0
    while True:
        try:
            tugas = _antrean.get(timeout=60)
        except queue.Empty:
            try:
                panen_satu()
                if time.time() - bersih_terakhir > 6 * 3600:
                    bersih_terakhir = time.time()
                    bersih()
            except Exception:  # noqa: BLE001
                traceback.print_exc()
            continue
        try:
            if tugas[0] == "job":
                jalankan(tugas[1])
            elif tugas[0] == "masuk":
                masukkan_video(tugas[1], tugas[2])
        except Exception:  # noqa: BLE001 — utas pekerja tidak boleh mati
            traceback.print_exc()


# ------------------------------------------------------------------ satu pelacakan


class _BatasWaktu(GalatLacak):
    pass


@contextmanager
def _tahap(job: dict, kunci: str, batas_akhir: float, cek_batas: bool = True):
    _cek_batal(job)
    t = next(x for x in job["tahap"] if x["kunci"] == kunci)
    t["status"] = "jalan"
    simpan.simpan_job(job)
    mulai_t = time.time()
    try:
        yield t
        t["status"] = "selesai" if t["status"] == "jalan" else t["status"]
    except BaseException:
        t["status"] = "gagal"
        raise
    finally:
        t["detik"] = round(time.time() - mulai_t, 1)
        simpan.simpan_job(job)
    # Tahap terakhir (cocok) sudah mengatur waktunya sendiri: hasilnya tidak dibuang karena lewat sedikit.
    if cek_batas and time.time() > batas_akhir:
        raise _BatasWaktu("Waktu pelacakan habis. Coba lagi nanti.")


def jalankan(id_: str) -> None:
    job = simpan.ambil_job(id_)
    if not job or job["status"] != "antre":
        return
    _sedang["id"] = id_
    job["status"] = "berjalan"
    simpan.simpan_job(job)
    folder = konfig.KERJA / id_
    try:
        proses(job, folder)
        job["status"] = "selesai"
    except GalatLacak as e:
        job["status"] = "gagal"
        job["pesan"] = str(e)
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        job["status"] = "gagal"
        job["pesan"] = f"Terjadi kesalahan saat melacak ({type(e).__name__}). Coba lagi."
    finally:
        _sedang.pop("id", None)
        _minta_batal.discard(id_)
        shutil.rmtree(folder, ignore_errors=True)
        for t in job["tahap"]:
            if t["status"] in ("tunggu", "jalan"):
                t["status"] = "lewati" if job["status"] == "selesai" else t["status"]
        job["_selesai_epoch"] = time.time()
        job["selesai"] = _kini_iso()
        simpan.simpan_job(job)


def _fitur_video(
    berkas: Path, folder: Path, waktu: list[float], cermin: bool = True
) -> tuple[np.ndarray, np.ndarray | None, list[np.ndarray], list[float], list[Path]]:
    frame = media.ambil_frame(berkas, waktu, folder)
    sah = [(t, f) for t, f in zip(waktu, frame) if f and str(f) and f.is_file()]
    if not sah:
        raise GalatLacak("Gambar video tidak bisa dibaca.")
    w = [t for t, _ in sah]
    f = [p for _, p in sah]
    return sidik.vektor(f), (sidik.vektor(f, cermin=True) if cermin else None), sidik.pdq(f), w, f


def proses(job: dict, folder: Path) -> None:
    atur = simpan.pengaturan()
    batas_akhir = time.time() + konfig.BATAS_WAKTU_JOB
    url = media.url_sah(job["_url"])
    folder.mkdir(parents=True, exist_ok=True)

    # 1. Ambil video saduran
    with _tahap(job, "ambil", batas_akhir) as t:
        info = media.info_video(url)
        durasi = float(info.get("duration") or 0)
        if durasi > konfig.MAKS_SUMBER_DETIK:
            raise GalatLacak(f"Video lebih dari {konfig.MAKS_SUMBER_DETIK // 60} menit; pelacakan hanya untuk video pendek.")
        berkas = media.unduh(url, folder / "saduran", konfig.MAKS_ANALISIS_DETIK, durasi or None)
        saduran = media.video_info(info, url)
        if not saduran["lebar"]:
            saduran["lebar"], saduran["tinggi"] = media.ukuran_berkas(berkas)
        if not saduran["durasi"]:
            saduran["durasi"] = media.durasi_berkas(berkas)
        job["saduran"] = saduran
        epoch_saduran = media.epoch_dari_info(info)
        t["catatan"] = f"{saduran['platform']} · {round(saduran['durasi'])} dtk"

    # 2. Frame kunci + sidik gambar
    with _tahap(job, "frame", batas_akhir) as t:
        dur_berkas = media.durasi_berkas(berkas) or saduran["durasi"]
        waktu = media.waktu_adegan(berkas, dur_berkas, konfig.MAKS_FRAME_SADURAN)
        vek_s, vek_sc, pdq_s, waktu_s, frame_s = _fitur_video(berkas, folder / "fs", waktu)
        job["petunjuk"] = {"watermark": [], "kata_kunci": [], "transkrip": "", "frame_kunci": waktu_s}
        t["catatan"] = f"{len(waktu_s)} frame"

    # 3. Teks di layar (OCR) -> watermark & kata
    with _tahap(job, "teks", batas_akhir) as t:
        pilih_ocr = np.linspace(0, len(frame_s) - 1, min(12, len(frame_s))).round().astype(int)
        baca = teks.baca_teks([str(frame_s[i]) for i in sorted(set(pilih_ocr.tolist()))])
        handle = teks.ekstrak_handle(baca)
        # Watermark akun pengunggah video ini sendiri (TikTok menempelkannya) bukan petunjuk sumber lain.
        identitas_sad = media.identitas_akun(info)
        handle = [h for h in handle if skor.nilai_wm([h["handle"]], identitas_sad) < 1.0]
        job["petunjuk"]["watermark"] = handle
        teks_layar = sorted({x for fr in baca for x, s in fr if s >= 0.6 and "@" not in x and not any(c.isdigit() for c in x[:3])})
        t["catatan"] = (handle[0]["handle"] if handle else "tanpa watermark")

    # 4. Ucapan + sidik suara
    with _tahap(job, "ucapan", batas_akhir) as t:
        try:
            ucap = teks.transkrip(media.audio_16k(berkas, 90))
        except Exception as e:  # noqa: BLE001
            print(f"[lacak] whisper gagal: {e}", flush=True)
            ucap = ""
        suara_s = media.sidik_suara(berkas, konfig.MAKS_ANALISIS_DETIK)
        job["petunjuk"]["transkrip"] = ucap[:1200]
        kata = teks.kata_kunci(str(info.get("title") or ""), str(info.get("description") or ""), teks_layar, ucap)
        job["petunjuk"]["kata_kunci"] = kata
        t["catatan"] = "ada ucapan" if ucap else "tanpa ucapan"

    # 5. Cari kandidat
    with _tahap(job, "cari", batas_akhir) as t:
        kunci_sad = cari.kunci_video(saduran["url"]) or cari.rapikan_url(saduran["url"])
        dari_kol = _kandidat_koleksi(np.vstack([vek_s, vek_sc]), kunci_sad)
        dari_akun: list[dict] = []
        for h in handle[:2]:
            for platform in ("TikTok", "YouTube") if konfig.YOUTUBE else ("TikTok",):
                dari_akun += cari.dari_akun(h["handle"], platform)
        dari_akun = cari.gabung(dari_akun)[:MAKS_PER_SUMBER]
        dari_yt = cari.dari_youtube(kata)[:MAKS_PER_SUMBER]
        dari_web = cari.dari_web(kata)[:MAKS_PER_SUMBER]
        # Cari balik gambar (Google Lens): berbayar/terbatas, jadi hanya bila koleksi & akun watermark
        # tidak menemukan apa pun (atau LACAK_LENS_SELALU=1 untuk uji).
        dari_lens, catatan_lens = lens.dari_frame(list(frame_s), atur, butuh=not dari_kol and not dari_akun)
        dari_lens = dari_lens[:MAKS_PER_SUMBER]
        semua = cari.gabung(dari_kol, dari_akun, dari_yt, dari_web, dari_lens, kecuali={kunci_sad})
        calon = _saring_sampul(semua[: konfig.MAKS_KANDIDAT_AWAL], vek_s, folder / "sampul")
        t["catatan"] = (
            f"{len(calon)} diperiksa dari {len(semua)} · koleksi {len(dari_kol)}, akun {len(dari_akun)}, "
            f"YouTube {len(dari_yt)}, web {len(dari_web)}, {catatan_lens}"
        )

    # 6. Cocokkan
    with _tahap(job, "cocok", batas_akhir, cek_batas=False) as t:
        hasil: list[dict] = []
        fitur_per_url: dict[str, tuple] = {}
        for i, c in enumerate(calon):
            _cek_batal(job)
            if time.time() > batas_akhir - 30:
                t["catatan"] = "sebagian kandidat dilewati karena waktu habis"
                break
            try:
                k, fitur = _periksa(c, folder / f"k{i}", vek_s, vek_sc, pdq_s, waktu_s, suara_s, handle, saduran)
            except GalatLacak as e:
                print(f"[lacak] kandidat dilewati {c['url']}: {e}", flush=True)
                continue
            except Exception:  # noqa: BLE001
                traceback.print_exc()
                continue
            if k:
                hasil.append(k)
                if fitur is not None:
                    fitur_per_url[k["url"]] = fitur
            shutil.rmtree(folder / f"k{i}", ignore_errors=True)
        _nilai_akhir(hasil, epoch_saduran, atur, handle)
        hasil.sort(key=lambda x: -x["skor"])
        terpilih = skor.pilih(hasil)
        for j, k in enumerate(hasil):
            k["label"] = skor.label_kandidat(k, j == terpilih, [h["handle"] for h in handle])
        job["kandidat"] = hasil
        job["terpilih"] = terpilih
        if terpilih is not None:
            job["zona"] = "yakin"
            job["kredit"] = skor.kredit(hasil[terpilih]["akun"])
        elif hasil and hasil[0]["zona"] == "perlu_acc":
            job["zona"] = "perlu_acc"
            job["kredit"] = skor.kredit(hasil[0]["akun"])
        else:
            job["zona"] = "bukan"
            job["kredit"] = ""
        t["catatan"] = f"{len(hasil)} kandidat dinilai"
        if terpilih is not None and atur.get("simpan_ke_koleksi"):
            _simpan_terpilih(hasil[terpilih], fitur_per_url.get(hasil[terpilih]["url"]))


def _kandidat_koleksi(vek: np.ndarray, kunci_sad: str) -> list[dict]:
    try:
        temu = indeks.cari(vek, batas=20, ambang=skor.SSCD_SEBAGIAN)
    except Exception as e:  # noqa: BLE001
        print(f"[lacak] cari koleksi gagal: {e}", flush=True)
        return []
    n_q = max(1, len(vek) // 2)
    nilai: list[tuple[float, str]] = []
    for vid, hits in temu.items():
        if vid == kunci_sad:
            continue
        frame_kuat = {i % n_q for i, s, _t in hits if s >= skor.SSCD_COCOK}
        terbaik = max(s for _i, s, _t in hits)
        if len(frame_kuat) >= 2 or terbaik >= 0.85:
            nilai.append((len(frame_kuat) + terbaik, vid))
    hasil: list[dict] = []
    for _n, vid in sorted(nilai, reverse=True)[:5]:
        v = simpan.ambil_video(vid)
        if not v:
            continue
        info = v["info"]
        hasil.append(
            {"url": v["url"], "judul": info.get("judul", ""), "durasi": info.get("durasi"), "epoch": v["epoch"], "akun": info.get("akun", ""), "gambar": info.get("gambar", ""), "lewat": "koleksi", "_video": vid}
        )
    return hasil


def _saring_sampul(calon: list[dict], vek_s: np.ndarray, folder: Path) -> list[dict]:
    """Urutkan kandidat internet dengan kemiripan sampulnya; buang yang jelas lain. Koleksi tidak disaring."""
    nilai: list[tuple[int, float, int, dict]] = []
    for i, c in enumerate(calon):
        prior = PRIORITAS_LEWAT.get(c["lewat"], 9)
        if c["lewat"] == "koleksi":
            nilai.append((prior, -1.0, i, c))
            continue
        mirip = 0.4  # tanpa sampul: netral
        p = media.unduh_gambar(c.get("gambar", ""), folder / f"{i}.img")
        if p:
            v = sidik.vektor([p])
            if np.any(v[0]):
                mirip = float((vek_s @ v[0]).max())
        if mirip < 0.2 and c["lewat"] != "akun":
            continue
        nilai.append((prior, -mirip, i, c))
    nilai.sort(key=lambda x: (x[0] if x[0] == 0 else 1, x[1], x[0], x[2]))
    return [c for *_r, c in nilai[: konfig.MAKS_KANDIDAT]]


def _periksa(c, folder, vek_s, vek_sc, pdq_s, waktu_s, suara_s, handle, saduran) -> tuple[dict | None, tuple | None]:
    """-> (kandidat untuk JSON job, fitur mentah untuk disimpan ke koleksi | None bila dari koleksi)."""
    if c["lewat"] == "koleksi" and c.get("_video"):
        data = indeks.ambil(c["_video"])
        v = simpan.ambil_video(c["_video"])
        if not data or not v:
            return None, None
        vek_k, waktu_k, pdq_hex = data
        pdq_k = [sidik.pdq_dari_hex(h) for h in pdq_hex]
        info_v = v["info"]
        identitas = v["identitas"]
        suara_k = np.frombuffer(v["suara"], dtype=np.uint32) if v["suara"] else None
        terverifikasi = bool(info_v.get("_terverifikasi"))
        vi = {k2: info_v.get(k2) for k2 in ("url", "judul", "akun", "platform", "diunggah", "durasi", "lebar", "tinggi", "gambar")}
        epoch = v["epoch"]
        fitur = None
    else:
        media.url_sah(c["url"])
        info = media.info_video(c["url"])
        dur = float(info.get("duration") or 0)
        if dur and dur > konfig.MAKS_SUMBER_DETIK * 6:
            raise GalatLacak("kandidat terlalu panjang")
        berkas = media.unduh(c["url"], folder, MAKS_ANALISIS_KANDIDAT, dur or None)
        dur_b = media.durasi_berkas(berkas) or dur
        waktu = media.waktu_rata(dur_b, konfig.JARAK_FRAME_KANDIDAT, MAKS_FRAME_KANDIDAT)
        vek_k, _vc, pdq_k, waktu_k, _f = _fitur_video(berkas, folder / "f", waktu, cermin=False)
        suara_k = media.sidik_suara(berkas, MAKS_ANALISIS_KANDIDAT)
        vi = media.video_info(info, c["url"])
        if not vi["lebar"]:
            vi["lebar"], vi["tinggi"] = media.ukuran_berkas(berkas)
        identitas = media.identitas_akun(info)
        terverifikasi = bool(info.get("channel_is_verified") or info.get("uploader_is_verified"))
        epoch = media.epoch_dari_info(info)
        fitur = (vek_k, waktu_k, [sidik.pdq_hex(h) for h in pdq_k], suara_k, info)

    g_biasa = skor.cocok_gambar(vek_s, waktu_s, vek_k, waktu_k, pdq_s, pdq_k, konfig.JARAK_FRAME_KANDIDAT)
    g_cermin = skor.cocok_gambar(vek_sc, waktu_s, vek_k, waktu_k, None, None, konfig.JARAK_FRAME_KANDIDAT)
    g = g_cermin if g_cermin.nilai > g_biasa.nilai + 0.1 else g_biasa

    suara = None
    offset = None
    if suara_s is not None and suara_k is not None:
        cs = skor.cocok_suara(suara_k, suara_s)
        if cs is not None:
            suara = skor.nilai_suara(cs[0])
            if suara and suara > 0:
                offset = round(cs[1] * skor.DETIK_PER_ITEM_SUARA, 1)

    # Rentang yang dipakai saduran: titik mulai dari selisih suara (paling presisi) atau median selisih frame,
    # panjangnya = durasi saduran. Bila kurang dari separuh frame cocok (pemakaian sebagian): rentang frame.
    bagian = None
    if g.bagian:
        if g.cocok >= max(2, len(waktu_s) // 2):
            mulai_b = offset if (offset is not None and suara is not None and suara >= 0.5) else g.bagian[0]
            panjang = float(saduran["durasi"] or 0) or (g.bagian[1] - g.bagian[0])
            dur_k = float(vi.get("durasi") or 0) or (max(waktu_k) + konfig.JARAK_FRAME_KANDIDAT)
            mulai_b = max(0.0, float(mulai_b))
            bagian = {"mulai": round(mulai_b, 1), "akhir": round(min(dur_k, mulai_b + panjang), 1)}
        else:
            bagian = {"mulai": g.bagian[0], "akhir": g.bagian[1]}

    jenis, akun_id = simpan.jenis_akun_untuk(identitas)
    komponen = {
        "gambar": g.nilai,
        "suara": suara,
        "wm": skor.nilai_wm([h["handle"] for h in handle], identitas),
        "waktu": 0.0,  # diisi _nilai_akhir (bergantung kandidat lain)
        "durasi": skor.nilai_durasi(float(vi.get("durasi") or 0), float(saduran["durasi"] or 0), int(vi.get("lebar") or 0) * int(vi.get("tinggi") or 0), int(saduran["lebar"] or 0) * int(saduran["tinggi"] or 0)),
        "akun": skor.nilai_akun(jenis, terverifikasi),
    }
    hasil = dict(vi)
    hasil.update(
        {
            "url": vi.get("url") or c["url"],
            "skor": 0.0,
            "komponen": komponen,
            "bobot": dict(skor.BOBOT),
            "zona": "bukan",
            "label": "",
            "strip": g.strip,
            "bagian": bagian,
            "offset_suara": offset,
            "ditemukan_lewat": c["lewat"],
            "_epoch": epoch,
            "_akun_id": akun_id,
            "_identitas": identitas,
            "_video": c.get("_video"),
        }
    )
    return hasil, fitur


def _nilai_akhir(hasil: list[dict], epoch_saduran: float | None, atur: dict, handle: list[dict]) -> None:
    layak = [float(k["komponen"]["gambar"]) >= skor.GAMBAR_LAYAK for k in hasil]
    waktu = skor.nilai_waktu([k["_epoch"] for k in hasil], layak, epoch_saduran)
    for k, w in zip(hasil, waktu):
        k["komponen"]["waktu"] = w
        s = skor.gabung(k["komponen"])
        k["skor"] = s.total
        k["bobot"] = s.bobot
        # komponen suara None -> tampil 0 (bobotnya sudah 0)
        k["komponen"] = {**s.komponen}
        k["zona"] = skor.zona(s.total, float(atur["ambang_yakin"]), float(atur["ambang_acc"]))


def _simpan_terpilih(k: dict, fitur: tuple | None) -> None:
    """Video asli yang dipilih otomatis masuk koleksi (fitur sudah dihitung, tanpa unduh ulang)."""
    try:
        akun_id = k.get("_akun_id")
        if akun_id is None:
            akun_id = _tambah_akun_dari(k)
        if akun_id is not None:
            simpan.tambah_jadi_sumber(akun_id)
        if fitur is None:
            return  # sudah ada di koleksi
        vek_k, waktu_k, pdq_hex, suara_k, info = fitur
        vid = _id_video(info, k["url"])
        indeks.simpan(vid, vek_k, waktu_k, pdq_hex)
        simpan.simpan_video(vid, akun_id, k["url"], _info_simpan(info, k["url"]), k.get("_identitas") or [], k.get("_epoch"), suara_k.tobytes() if suara_k is not None else None, len(waktu_k))
    except Exception:  # noqa: BLE001 — gagal menyimpan ke koleksi tidak menggagalkan pelacakan
        traceback.print_exc()


def _tambah_akun_dari(k: dict) -> int | None:
    handle = str(k.get("akun") or "")
    platform = str(k.get("platform") or "")
    if not handle.startswith("@") or platform not in ("TikTok", "YouTube", "Instagram"):
        return None
    url = cari.url_profil(handle, platform)
    if not url:
        return None
    return int(simpan.tambah_akun(handle, platform, url, "kreator")["id"])


def _id_video(info: dict, url: str) -> str:
    vid = str(info.get("id") or "")
    if vid:
        return f"{media.platform_dari(info, url)}:{vid}"
    return cari.kunci_video(url) or cari.rapikan_url(url)


def _info_simpan(info: dict, url: str) -> dict:
    vi = media.video_info(info, url)
    vi["_terverifikasi"] = bool(info.get("channel_is_verified") or info.get("uploader_is_verified"))
    return vi


# ------------------------------------------------------------------ koleksi


def masukkan_video(url: str, akun_id: int | None, mengalah: bool = False) -> str | None:
    """Unduh, hitung sidik, simpan ke koleksi. None = gagal / sudah ada / mengalah.
    `mengalah` (panen): berhenti sebelum unduhan bila ada pelacakan yang menunggu."""
    kunci = cari.kunci_video(url)
    if kunci and simpan.video_ada(kunci):
        return None
    folder = konfig.KERJA / f"masuk-{uuid.uuid4().hex[:8]}"
    try:
        media.url_sah(url)
        info = media.info_video(url)
        if mengalah and not _antrean.empty():
            return None
        vid = _id_video(info, url)
        if simpan.video_ada(vid):
            return None
        dur = float(info.get("duration") or 0)
        if dur and dur > konfig.MAKS_SUMBER_DETIK * 6:
            return None
        berkas = media.unduh(url, folder, MAKS_ANALISIS_KANDIDAT, dur or None)
        dur_b = media.durasi_berkas(berkas) or dur
        waktu = media.waktu_rata(dur_b, konfig.JARAK_FRAME_KANDIDAT, MAKS_FRAME_KANDIDAT)
        vek, _vc, pdq_k, waktu_k, _f = _fitur_video(berkas, folder / "f", waktu, cermin=False)
        suara = media.sidik_suara(berkas, MAKS_ANALISIS_KANDIDAT)
        indeks.simpan(vid, vek, waktu_k, [sidik.pdq_hex(h) for h in pdq_k])
        simpan.simpan_video(vid, akun_id, media.video_info(info, url)["url"], _info_simpan(info, url), media.identitas_akun(info), media.epoch_dari_info(info), suara.tobytes() if suara is not None else None, len(waktu_k))
        return vid
    except GalatLacak as e:
        print(f"[lacak] masuk koleksi gagal {url}: {e}", flush=True)
        return None
    finally:
        shutil.rmtree(folder, ignore_errors=True)


def panen_satu() -> bool:
    """Panen satu akun koleksi yang sudah waktunya. True bila ada yang dikerjakan."""
    akun = simpan.akun_perlu_panen(time.time() - konfig.PANEN_JAM * 3600)
    if not akun:
        return False
    galat = ""
    try:
        daftar = cari.daftar_profil(akun["url"], konfig.PANEN_DAFTAR)
        if not daftar:
            galat = "Daftar video akun tidak terbaca (akun pribadi, butuh login, atau link salah)."
        baru = 0
        for e in daftar:
            if baru >= konfig.PANEN_UNDUH:
                break
            k = cari.kunci_video(e["url"])
            if k and simpan.video_ada(k):
                continue
            if not _antrean.empty():
                break  # ada pelacakan menunggu: panen dilanjutkan putaran berikutnya
            if masukkan_video(e["url"], akun["id"], mengalah=True):
                baru += 1
    except Exception as e:  # noqa: BLE001
        galat = f"Panen gagal: {type(e).__name__}"
        traceback.print_exc()
    simpan.tandai_panen(akun["id"], galat)
    return True


def bersih() -> None:
    simpan.buang_job_lama(time.time() - konfig.RETENSI_HARI * 86400)
    lama = simpan.video_lama(time.time() - konfig.SIMPAN_VIDEO_HARI * 86400)
    if lama:
        try:
            indeks.hapus(lama)
            simpan.hapus_video(lama)
        except Exception:  # noqa: BLE001 — dicoba lagi pada pembersihan berikutnya
            traceback.print_exc()
    if konfig.KERJA.exists():
        for p in konfig.KERJA.iterdir():
            try:
                if time.time() - p.stat().st_mtime > 6 * 3600 and p.name != sedang_dikerjakan():
                    shutil.rmtree(p, ignore_errors=True)
            except OSError:
                pass


# ------------------------------------------------------------------ keputusan


def putuskan(job: dict, aksi: str, kandidat: int | None, oleh: str, ubah_koleksi: bool = False) -> dict:
    """Simpan keputusan. `ubah_koleksi` (master/bot saja): pilihan memasukkan/mengeluarkan video dari koleksi
    bersama. Keputusan pengguna biasa hanya tercatat di job-nya sendiri."""
    if job["status"] != "selesai":
        raise GalatLacak("Pelacakan belum selesai.")
    if aksi not in ("pakai_asli", "pakai_kredit", "bukan", "tanpa_sumber"):
        raise GalatLacak("Aksi tidak dikenal.")
    daftar = job.get("kandidat") or []
    if aksi != "tanpa_sumber":
        if kandidat is None or not (0 <= kandidat < len(daftar)):
            raise GalatLacak("Kandidat tidak ada.")
    job["keputusan"] = {"aksi": aksi, "kandidat": kandidat, "oleh": oleh, "pada": _kini_iso()}
    if aksi in ("pakai_asli", "pakai_kredit") and kandidat is not None:
        k = daftar[kandidat]
        job["kredit"] = skor.kredit(k.get("akun", ""))
        atur = simpan.pengaturan()
        if ubah_koleksi and kandidat != job.get("terpilih") and atur.get("simpan_ke_koleksi"):
            jenis, akun_id = simpan.jenis_akun_untuk(k.get("_identitas") or [k.get("akun", "")])
            if akun_id is None:
                akun_id = _tambah_akun_dari(k)
            if akun_id is not None:
                simpan.tambah_jadi_sumber(akun_id)
            masukkan_koleksi_nanti(k["url"], akun_id)
    elif aksi == "bukan" and kandidat is not None and kandidat == job.get("terpilih"):
        k = daftar[kandidat]
        kunci = cari.kunci_video(k["url"])
        # Pilihan otomatis dinyatakan salah oleh master: keluarkan dari koleksi bila pelacakan ini yang
        # memasukkannya (video yang memang dari koleksi tidak disentuh).
        if ubah_koleksi and kunci and k.get("ditemukan_lewat") != "koleksi":
            try:
                indeks.hapus([kunci])
                simpan.hapus_video([kunci])
            except Exception:  # noqa: BLE001 — Qdrant mati: keputusan tetap tersimpan
                traceback.print_exc()
        job["kredit"] = ""
    simpan.simpan_job(job)
    return job
