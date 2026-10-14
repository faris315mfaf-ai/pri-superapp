"""Penyimpanan SQLite (WAL): job pelacakan, akun koleksi, video koleksi, pengaturan.

Satu sambungan per panggilan (murah di SQLite) + kunci tulis proses, supaya aman dipakai utas API & utas kerja.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from typing import Any, Iterator

from . import konfig

_kunci_tulis = threading.Lock()

PENGATURAN_BAWAAN: dict[str, Any] = {
    "ambang_yakin": 0.85,
    "ambang_acc": 0.60,
    "lacak_bot": True,
    "tombol_pengguna": True,
    "cari_lens": False,
    "simpan_ke_koleksi": True,
}

SKEMA = """
CREATE TABLE IF NOT EXISTS job (
  id TEXT PRIMARY KEY,
  pengguna TEXT NOT NULL,
  sumber TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  dibuat REAL NOT NULL,
  selesai REAL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_dibuat ON job(dibuat);
CREATE INDEX IF NOT EXISTS idx_job_pengguna ON job(pengguna, dibuat);
CREATE TABLE IF NOT EXISTS akun (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL,
  platform TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  jenis TEXT NOT NULL,
  aktif INTEGER NOT NULL DEFAULT 1,
  terakhir_panen REAL,
  galat TEXT NOT NULL DEFAULT '',
  jadi_sumber INTEGER NOT NULL DEFAULT 0,
  dibuat REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS video (
  id TEXT PRIMARY KEY,
  akun_id INTEGER,
  url TEXT NOT NULL,
  info TEXT NOT NULL,
  identitas TEXT NOT NULL DEFAULT '[]',
  epoch REAL,
  suara BLOB,
  frame INTEGER NOT NULL DEFAULT 0,
  dibuat REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_akun ON video(akun_id);
CREATE TABLE IF NOT EXISTS pengaturan (kunci TEXT PRIMARY KEY, nilai TEXT NOT NULL);
"""


def _sambung() -> sqlite3.Connection:
    konfig.DATA.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(konfig.DB), timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA busy_timeout=30000")
    return c


@contextmanager
def baca() -> Iterator[sqlite3.Connection]:
    c = _sambung()
    try:
        yield c
    finally:
        c.close()


@contextmanager
def tulis() -> Iterator[sqlite3.Connection]:
    with _kunci_tulis:
        c = _sambung()
        try:
            yield c
            c.commit()
        except BaseException:
            c.rollback()
            raise
        finally:
            c.close()


def siapkan() -> None:
    with tulis() as c:
        c.executescript(SKEMA)


# ---------------------------------------------------------------- job


def simpan_job(job: dict) -> None:
    with tulis() as c:
        c.execute(
            "INSERT INTO job(id, pengguna, sumber, url, status, dibuat, selesai, data) VALUES(?,?,?,?,?,?,?,?)"
            " ON CONFLICT(id) DO UPDATE SET status=excluded.status, selesai=excluded.selesai, data=excluded.data",
            (
                job["id"],
                job["diminta_oleh"],
                job["sumber"],
                (job.get("saduran") or {}).get("url") or job.get("_url", ""),
                job["status"],
                job["_dibuat_epoch"],
                job.get("_selesai_epoch"),
                json.dumps(job, ensure_ascii=False),
            ),
        )


def ambil_job(id_: str) -> dict | None:
    with baca() as c:
        r = c.execute("SELECT data FROM job WHERE id=?", (id_,)).fetchone()
    return json.loads(r["data"]) if r else None


def daftar_job(pengguna: str | None, batas: int) -> list[dict]:
    with baca() as c:
        if pengguna is None:
            rows = c.execute("SELECT data FROM job ORDER BY dibuat DESC LIMIT ?", (batas,)).fetchall()
        else:
            rows = c.execute("SELECT data FROM job WHERE pengguna=? ORDER BY dibuat DESC LIMIT ?", (pengguna, batas)).fetchall()
    return [json.loads(r["data"]) for r in rows]


def job_dengan_status(status: tuple[str, ...]) -> list[dict]:
    tanda = ",".join("?" * len(status))
    with baca() as c:
        rows = c.execute(f"SELECT data FROM job WHERE status IN ({tanda}) ORDER BY dibuat", status).fetchall()
    return [json.loads(r["data"]) for r in rows]


def hitung_job(pengguna: str, sejak: float, status: tuple[str, ...] | None = None) -> int:
    with baca() as c:
        if status:
            tanda = ",".join("?" * len(status))
            r = c.execute(
                f"SELECT COUNT(*) n FROM job WHERE pengguna=? AND dibuat>=? AND status IN ({tanda})",
                (pengguna, sejak, *status),
            ).fetchone()
        else:
            r = c.execute("SELECT COUNT(*) n FROM job WHERE pengguna=? AND dibuat>=?", (pengguna, sejak)).fetchone()
    return int(r["n"])


def statistik_job(sejak: float) -> dict[str, int]:
    with baca() as c:
        rows = c.execute("SELECT data FROM job WHERE dibuat>=? AND status='selesai'", (sejak,)).fetchall()
    total = ditemukan = diputus = disetujui = 0
    for r in rows:
        d = json.loads(r["data"])
        total += 1
        if d.get("zona") in ("yakin", "perlu_acc"):
            ditemukan += 1
        k = d.get("keputusan")
        if k:
            diputus += 1
            if k.get("aksi") in ("pakai_asli", "pakai_kredit"):
                disetujui += 1
    return {"total_30h": total, "ditemukan_30h": ditemukan, "diputus_30h": diputus, "disetujui_30h": disetujui}


def buang_job_lama(sebelum: float) -> int:
    with tulis() as c:
        return c.execute("DELETE FROM job WHERE dibuat<? AND status IN ('selesai','gagal')", (sebelum,)).rowcount


# ---------------------------------------------------------------- akun koleksi


def _akun(r: sqlite3.Row, jumlah_video: int) -> dict:
    return {
        "id": int(r["id"]),
        "handle": r["handle"],
        "platform": r["platform"],
        "url": r["url"],
        "jenis": r["jenis"],
        "aktif": bool(r["aktif"]),
        "video": jumlah_video,
        "jadi_sumber": int(r["jadi_sumber"]),
        "terakhir_panen": _iso(r["terakhir_panen"]),
        "galat_panen": r["galat"] or "",
    }


def _iso(epoch: float | None) -> str | None:
    if epoch is None:
        return None
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def daftar_akun() -> list[dict]:
    with baca() as c:
        jml = {int(r["akun_id"]): int(r["n"]) for r in c.execute("SELECT akun_id, COUNT(*) n FROM video WHERE akun_id IS NOT NULL GROUP BY akun_id")}
        rows = c.execute("SELECT * FROM akun ORDER BY jenis, handle").fetchall()
    return [_akun(r, jml.get(int(r["id"]), 0)) for r in rows]


def ambil_akun(id_: int) -> dict | None:
    with baca() as c:
        r = c.execute("SELECT * FROM akun WHERE id=?", (id_,)).fetchone()
        if not r:
            return None
        n = c.execute("SELECT COUNT(*) n FROM video WHERE akun_id=?", (id_,)).fetchone()["n"]
    return _akun(r, int(n))


def akun_dari_url(url: str) -> dict | None:
    with baca() as c:
        r = c.execute("SELECT id FROM akun WHERE url=?", (url,)).fetchone()
    return ambil_akun(int(r["id"])) if r else None


def tambah_akun(handle: str, platform: str, url: str, jenis: str) -> dict:
    with tulis() as c:
        ada = c.execute("SELECT id FROM akun WHERE url=?", (url,)).fetchone()
        if ada:
            id_ = int(ada["id"])
        else:
            id_ = int(
                c.execute(
                    "INSERT INTO akun(handle, platform, url, jenis, aktif, dibuat) VALUES(?,?,?,?,1,?)",
                    (handle, platform, url, jenis, time.time()),
                ).lastrowid
            )
    hasil = ambil_akun(id_)
    assert hasil is not None
    return hasil


def ubah_akun(id_: int, aktif: bool | None = None, jenis: str | None = None) -> dict | None:
    with tulis() as c:
        if aktif is not None:
            c.execute("UPDATE akun SET aktif=? WHERE id=?", (1 if aktif else 0, id_))
        if jenis is not None:
            c.execute("UPDATE akun SET jenis=? WHERE id=?", (jenis, id_))
    return ambil_akun(id_)


def video_akun(id_: int) -> list[str]:
    with baca() as c:
        return [r["id"] for r in c.execute("SELECT id FROM video WHERE akun_id=?", (id_,))]


def hapus_akun(id_: int) -> list[str]:
    """Hapus akun + videonya. Mengembalikan id video yang dibuang (untuk dihapus dari indeks vektor)."""
    with tulis() as c:
        ids = [r["id"] for r in c.execute("SELECT id FROM video WHERE akun_id=?", (id_,))]
        c.execute("DELETE FROM video WHERE akun_id=?", (id_,))
        c.execute("DELETE FROM akun WHERE id=?", (id_,))
    return ids


def akun_perlu_panen(sebelum: float) -> dict | None:
    with baca() as c:
        r = c.execute(
            "SELECT id FROM akun WHERE aktif=1 AND (terakhir_panen IS NULL OR terakhir_panen<?) ORDER BY COALESCE(terakhir_panen,0) LIMIT 1",
            (sebelum,),
        ).fetchone()
    return ambil_akun(int(r["id"])) if r else None


def tandai_panen(id_: int, galat: str) -> None:
    with tulis() as c:
        c.execute("UPDATE akun SET terakhir_panen=?, galat=? WHERE id=?", (time.time(), galat[:300], id_))


def tambah_jadi_sumber(akun_id: int) -> None:
    with tulis() as c:
        c.execute("UPDATE akun SET jadi_sumber=jadi_sumber+1 WHERE id=?", (akun_id,))


def jenis_akun_untuk(identitas: list[str]) -> tuple[str | None, int | None]:
    """Jenis koleksi (media_resmi/kreator/instansi) bila salah satu identitas cocok dengan handle akun koleksi."""
    from .skor import rapikan_handle

    kunci = {rapikan_handle(x) for x in identitas if rapikan_handle(x)}
    if not kunci:
        return None, None
    with baca() as c:
        for r in c.execute("SELECT id, handle, jenis FROM akun"):
            if rapikan_handle(r["handle"]) in kunci:
                return r["jenis"], int(r["id"])
    return None, None


# ---------------------------------------------------------------- video koleksi


def video_ada(id_: str) -> bool:
    with baca() as c:
        return c.execute("SELECT 1 FROM video WHERE id=?", (id_,)).fetchone() is not None


def simpan_video(id_: str, akun_id: int | None, url: str, info: dict, identitas: list[str], epoch: float | None, suara: bytes | None, frame: int) -> None:
    with tulis() as c:
        c.execute(
            "INSERT INTO video(id, akun_id, url, info, identitas, epoch, suara, frame, dibuat) VALUES(?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT(id) DO UPDATE SET akun_id=COALESCE(excluded.akun_id, video.akun_id), info=excluded.info,"
            " identitas=excluded.identitas, epoch=excluded.epoch, suara=COALESCE(excluded.suara, video.suara), frame=excluded.frame",
            (id_, akun_id, url, json.dumps(info, ensure_ascii=False), json.dumps(identitas, ensure_ascii=False), epoch, suara, frame, time.time()),
        )


def ambil_video(id_: str) -> dict | None:
    with baca() as c:
        r = c.execute("SELECT * FROM video WHERE id=?", (id_,)).fetchone()
    if not r:
        return None
    return {
        "id": r["id"],
        "akun_id": r["akun_id"],
        "url": r["url"],
        "info": json.loads(r["info"]),
        "identitas": json.loads(r["identitas"]),
        "epoch": r["epoch"],
        "suara": r["suara"],
        "frame": int(r["frame"]),
    }


def hitung_video() -> int:
    with baca() as c:
        return int(c.execute("SELECT COUNT(*) n FROM video").fetchone()["n"])


def video_lama(sebelum: float) -> list[str]:
    with baca() as c:
        return [r["id"] for r in c.execute("SELECT id FROM video WHERE dibuat<?", (sebelum,))]


def hapus_video(ids: list[str]) -> None:
    if not ids:
        return
    with tulis() as c:
        c.executemany("DELETE FROM video WHERE id=?", [(i,) for i in ids])


# ---------------------------------------------------------------- pengaturan


def pengaturan() -> dict[str, Any]:
    hasil = dict(PENGATURAN_BAWAAN)
    with baca() as c:
        for r in c.execute("SELECT kunci, nilai FROM pengaturan"):
            if r["kunci"] in hasil:
                try:
                    hasil[r["kunci"]] = json.loads(r["nilai"])
                except json.JSONDecodeError:
                    pass
    return hasil


def simpan_pengaturan(baru: dict[str, Any]) -> dict[str, Any]:
    with tulis() as c:
        for k, v in baru.items():
            if k in PENGATURAN_BAWAAN:
                c.execute(
                    "INSERT INTO pengaturan(kunci, nilai) VALUES(?,?) ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai",
                    (k, json.dumps(v)),
                )
    return pengaturan()
