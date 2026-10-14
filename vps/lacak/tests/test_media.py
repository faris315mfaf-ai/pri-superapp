import json
import stat

from lacak import konfig, media


def _skrip(tmp_path, isi: str, kode: int):
    p = tmp_path / "fpcalc"
    p.write_text(f"#!/bin/sh\necho '{isi}'\necho 'ERROR: Error decoding audio frame (End of file)' >&2\nexit {kode}\n")
    p.chmod(p.stat().st_mode | stat.S_IEXEC)
    return str(p)


def test_sidik_suara_kode_keluar_bukan_nol_tetap_dipakai(tmp_path, monkeypatch):
    sidik = list(range(1, 61))
    monkeypatch.setattr(konfig, "FPCALC", _skrip(tmp_path, json.dumps({"duration": 7.5, "fingerprint": sidik}), 3))
    hasil = media.sidik_suara(tmp_path / "x.mp4", 120)
    assert hasil is not None and hasil.tolist() == sidik and str(hasil.dtype) == "uint32"


def test_sidik_suara_rusak_atau_pendek(tmp_path, monkeypatch):
    monkeypatch.setattr(konfig, "FPCALC", _skrip(tmp_path, "bukan json", 1))
    assert media.sidik_suara(tmp_path / "x.mp4", 120) is None
    monkeypatch.setattr(konfig, "FPCALC", _skrip(tmp_path, json.dumps({"fingerprint": [1, 2, 3]}), 0))
    assert media.sidik_suara(tmp_path / "x.mp4", 120) is None
    monkeypatch.setattr(konfig, "FPCALC", _skrip(tmp_path, json.dumps([1, 2]), 0))
    assert media.sidik_suara(tmp_path / "x.mp4", 120) is None
