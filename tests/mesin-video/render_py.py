"""Render satu template dengan mesin PYTHON asli, untuk uji kesetaraan render.

Dipanggil uji-media.mts:  python render_py.py <template_id> <sumber> <keluar_dir> <texts_json>
MEDIA_DIR diwariskan lewat environment (folder yang sama dengan mesin TS).
Mencetak satu baris JSON: {"ok": path} atau {"error": pesan}.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "autoedit"))

import video_edit as ve  # noqa: E402


def main() -> None:
    template_id, sumber, keluar, texts = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), json.loads(sys.argv[4])
    kemajuan: list[int] = []
    try:
        hasil = ve.render(ve.load_template(template_id), sumber, keluar, texts, progress=kemajuan.append)
        print(json.dumps({"ok": str(hasil), "progress": kemajuan}))
    except ve.VideoError as error:
        print(json.dumps({"error": str(error), "jenis": type(error).__name__}))


if __name__ == "__main__":
    main()
