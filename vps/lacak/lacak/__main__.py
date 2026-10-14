"""python -m lacak : satu proses (pekerja & antrean ada di memori proses ini), port LACAK_PORT."""

import uvicorn

from . import konfig

if __name__ == "__main__":
    uvicorn.run("lacak.api:app", host="0.0.0.0", port=konfig.PORT, workers=1, log_level="warning", access_log=False)
