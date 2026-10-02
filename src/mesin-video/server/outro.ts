// Rute /api/outro/* (cermin outro_api.py): video penutup berisi nama channel
// dan akun sosmednya, dirender sendiri (latar prosedural + teks). Validasi
// & bentuk jawaban ada di outro/index.ts; di sini hanya identitas & HTTP.
import * as outro from "../outro";
import { bacaJson, GalatHttp, kirimBerkas, type Penangan, type Router } from "./dasar";
import { penggunaWajib } from "./video";
import { z } from "zod";

/** Galat outro (status + detail persis FastAPI) diteruskan apa adanya. */
const terjemah =
  (fn: Penangan): Penangan =>
  async (pm) => {
    try {
      return await fn(pm);
    } catch (e) {
      if (e instanceof outro.GalatHttpOutro) throw new GalatHttp(e.status, e.detail);
      throw e;
    }
  };

export function pasangRuteOutro(r: Router): void {
  const A = "/api/outro";

  r.get(
    `${A}/jobs`,
    terjemah(async (pm) => {
      // Halaman memantau banyak outro sekaligus lewat satu permintaan ini.
      penggunaWajib(pm);
      return outro.daftarOutro(pm.query.get("batas") ?? undefined);
    }),
  );

  r.post(
    `${A}/jobs`,
    terjemah(async (pm) => {
      penggunaWajib(pm);
      // Bentuknya divalidasi outro.validasiBody (gaya pydantic); di sini cukup JSON.
      return outro.buatOutro(await bacaJson(pm, z.unknown()));
    }),
  );

  r.get(
    `${A}/jobs/{job_id}`,
    terjemah(async (pm) => {
      penggunaWajib(pm);
      return outro.statusOutro(pm.params.job_id);
    }),
  );

  r.post(
    `${A}/jobs/{job_id}/stop`,
    terjemah(async (pm) => {
      penggunaWajib(pm);
      return outro.hentikanOutro(pm.params.job_id);
    }),
  );

  r.get(
    `${A}/jobs/{job_id}/video`,
    terjemah(async (pm) => {
      penggunaWajib(pm);
      const v = outro.videoOutro(pm.params.job_id);
      return kirimBerkas(pm, v.jalur, v.mediaType, v.namaBerkas);
    }),
  );
}
