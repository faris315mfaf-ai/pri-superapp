"use client";

// ============================================================
// PENCARI VIDEO ASLI (Lacak Sumber, 15 Okt 2026) — hook data.
//
// Semua permintaan lewat penerus Auto Edit (useApiAutoEdit): "/api/lacak/..."
// diubah urlApi menjadi "/api/autoedit/lacak/...", jadi token SuperApp dan
// header akun tim/bot ikut terkirim seperti alat Auto Edit lain.
//
//  • useLacakJob      — mulai pelacakan, pantau tiap 2 detik selama antre/berjalan
//                       (hanya saat halaman & tab terlihat), kirim keputusan.
//  • useRiwayatLacak  — daftar pelacakan terbaru (master: semua; lainnya: milik sendiri).
//  • useKoleksiLacak  — akun koleksi + statistik (master).
//  • usePengaturanLacak — ambang & sakelar (dibaca semua akun Auto Edit, disimpan master).
//
// Jawaban yang datang terlambat (job sudah diganti/ditutup, komponen sudah
// dilepas) diabaikan lewat penghitung generasi.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { bacaJson, pesanGalat } from "@/features/auto-edit/api";
import { useApiAutoEdit } from "@/features/auto-edit/tim";
import { useRefTabAktif } from "@/hooks/use-tab-aktif";
import type {
  AkunKoleksi,
  AksiKeputusan,
  HasilLacak,
  JenisAkunKoleksi,
  PengaturanLacak,
  RingkasLacak,
  StatistikLacak,
} from "@/lib/lacak-tipe";

type ApiAutoEdit = ReturnType<typeof useApiAutoEdit>;

const JEDA_PANTAU_MS = 2000;

/** Kalimat cadangan per kode status (bila server tidak mengirim detail). */
function cadangan(status: number, umum: string): string {
  if (status === 429) return "Terlalu banyak pelacakan sedang berjalan. Tunggu yang sebelumnya selesai, lalu coba lagi.";
  if (status === 403) return "Hanya master yang boleh melakukan ini.";
  return umum;
}

/** fetch JSON + galat yang ramah pengguna. */
async function minta<T>(api: ApiAutoEdit, path: string, init: RequestInit, umum: string): Promise<T> {
  const res = await api.fetch(path, { cache: "no-store", ...init });
  const d = await bacaJson(res);
  if (!res.ok) throw new Error(pesanGalat(res.status, d, cadangan(res.status, umum)));
  return d as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const teksGalat = (e: unknown, umum: string) => (e instanceof Error && e.message ? e.message : umum);

export const masihBerjalan = (h: HasilLacak | null): boolean => !!h && (h.status === "antre" || h.status === "berjalan");

// ------------------------------------------------------------ satu pelacakan

export function useLacakJob(opsi: { onAkhir?: (h: HasilLacak) => void } = {}) {
  const api = useApiAutoEdit();
  const tabAktifRef = useRefTabAktif();
  const [hasil, setHasil] = useState<HasilLacak | null>(null);
  const [galat, setGalat] = useState("");
  const [memulai, setMemulai] = useState(false);
  const [memutus, setMemutus] = useState(false);
  const [urlTerakhir, setUrlTerakhir] = useState("");
  /** Naik setiap job diganti/ditutup: jawaban dari generasi lama dibuang. */
  const generasiRef = useRef(0);
  const onAkhirRef = useRef(opsi.onAkhir);
  useEffect(() => {
    onAkhirRef.current = opsi.onAkhir;
  }, [opsi.onAkhir]);
  useEffect(
    () => () => {
      generasiRef.current++;
    },
    [],
  );

  const mulai = useCallback(
    async (url: string): Promise<boolean> => {
      const gen = ++generasiRef.current;
      setHasil(null); // hasil lama tidak boleh tampil seolah milik link baru
      setMemulai(true);
      setGalat("");
      setUrlTerakhir(url);
      try {
        const d = await minta<HasilLacak>(api, "/api/lacak/jobs", json("POST", { url }), "Pelacakan gagal dimulai.");
        if (gen !== generasiRef.current) return false;
        setHasil(d);
        if (!masihBerjalan(d)) onAkhirRef.current?.(d);
        return true;
      } catch (e) {
        if (gen === generasiRef.current) setGalat(teksGalat(e, "Pelacakan gagal dimulai."));
        return false;
      } finally {
        if (gen === generasiRef.current) setMemulai(false);
      }
    },
    [api],
  );

  /** Buka pelacakan lama (mis. dari riwayat). Bila masih berjalan, pemantauan ikut jalan. */
  const buka = useCallback(
    async (id: string): Promise<boolean> => {
      const gen = ++generasiRef.current;
      setMemulai(true);
      setGalat("");
      try {
        const d = await minta<HasilLacak>(api, `/api/lacak/jobs/${encodeURIComponent(id)}`, {}, "Pelacakan gagal dibuka.");
        if (gen !== generasiRef.current) return false;
        setHasil(d);
        return true;
      } catch (e) {
        if (gen === generasiRef.current) setGalat(teksGalat(e, "Pelacakan gagal dibuka."));
        return false;
      } finally {
        if (gen === generasiRef.current) setMemulai(false);
      }
    },
    [api],
  );

  /** Batalkan pelacakan yang sedang antre/berjalan di server, lalu tutup. Galat diabaikan (job habis sendiri). */
  const batal = useCallback(async (): Promise<void> => {
    const id = hasil && masihBerjalan(hasil) ? hasil.id : null;
    generasiRef.current++;
    setHasil(null);
    setGalat("");
    setMemulai(false);
    setMemutus(false);
    if (!id) return;
    try {
      await minta<HasilLacak>(api, `/api/lacak/jobs/${encodeURIComponent(id)}/batal`, { method: "POST" }, "Pembatalan gagal.");
    } catch {
      // Pelacakan tetap berhenti sendiri paling lama 15 menit.
    }
  }, [api, hasil]);

  const tutup = useCallback(() => {
    generasiRef.current++;
    setHasil(null);
    setGalat("");
    setMemulai(false);
    setMemutus(false);
  }, []);

  /** Kirim keputusan; mengembalikan hasil terbaru, atau null bila gagal (galat terisi). */
  const putuskan = useCallback(
    async (aksi: AksiKeputusan, kandidat: number | null): Promise<HasilLacak | null> => {
      if (!hasil) return null;
      const id = hasil.id;
      const gen = generasiRef.current;
      setMemutus(true);
      setGalat("");
      try {
        const d = await minta<HasilLacak>(
          api,
          `/api/lacak/jobs/${encodeURIComponent(id)}/keputusan`,
          json("POST", { aksi, kandidat }),
          "Keputusan gagal disimpan.",
        );
        if (gen !== generasiRef.current) return null;
        setHasil(d);
        return d;
      } catch (e) {
        if (gen === generasiRef.current) setGalat(teksGalat(e, "Keputusan gagal disimpan."));
        return null;
      } finally {
        if (gen === generasiRef.current) setMemutus(false);
      }
    },
    [api, hasil],
  );

  // Pantau tiap 2 detik selama antre/berjalan; satu permintaan pada satu waktu.
  const idPantau = masihBerjalan(hasil) ? hasil!.id : null;
  useEffect(() => {
    if (!idPantau) return undefined;
    const gen = generasiRef.current;
    let hidup = true;
    let t: number | undefined;
    const detak = async () => {
      if (!hidup || gen !== generasiRef.current) return;
      if (document.visibilityState === "visible" && tabAktifRef.current) {
        try {
          const d = await minta<HasilLacak>(api, `/api/lacak/jobs/${encodeURIComponent(idPantau)}`, {}, "Pelacakan gagal dibaca.");
          if (!hidup || gen !== generasiRef.current || d.id !== idPantau) return;
          setHasil(d);
          if (!masihBerjalan(d)) {
            onAkhirRef.current?.(d);
            return;
          }
        } catch {
          // Jaringan putus sesaat — dicoba lagi pada detak berikutnya.
        }
      }
      if (hidup) t = window.setTimeout(() => void detak(), JEDA_PANTAU_MS);
    };
    t = window.setTimeout(() => void detak(), JEDA_PANTAU_MS);
    return () => {
      hidup = false;
      window.clearTimeout(t);
    };
  }, [idPantau, api, tabAktifRef]);

  return { hasil, galat, memulai, memutus, urlTerakhir, mulai, buka, tutup, batal, putuskan };
}

// ------------------------------------------------------------ riwayat

export function useRiwayatLacak(limit = 50) {
  const api = useApiAutoEdit();
  const [item, setItem] = useState<RingkasLacak[] | null>(null);
  const [galat, setGalat] = useState("");
  const [tik, setTik] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await minta<{ item?: RingkasLacak[] }>(api, `/api/lacak/riwayat?limit=${limit}`, {}, "Riwayat pelacakan gagal dimuat.");
        if (!hidup) return;
        setItem(Array.isArray(d.item) ? d.item : []);
        setGalat("");
      } catch (e) {
        if (hidup) setGalat(teksGalat(e, "Riwayat pelacakan gagal dimuat."));
      }
    })();
    return () => {
      hidup = false;
    };
  }, [api, limit, tik]);

  const muatUlang = useCallback(() => setTik((n) => n + 1), []);
  return { item, galat, muatUlang };
}

// ------------------------------------------------------------ koleksi (master)

export type DataKoleksi = { akun: AkunKoleksi[]; statistik: StatistikLacak };

export function useKoleksiLacak() {
  const api = useApiAutoEdit();
  const [data, setData] = useState<DataKoleksi | null>(null);
  const [galat, setGalat] = useState("");
  const [tik, setTik] = useState(0);
  const [sibuk, setSibuk] = useState<ReadonlySet<number>>(() => new Set());
  /** Salinan data terbaru untuk mengembalikan perubahan optimis yang ditolak server. */
  const dataRef = useRef<DataKoleksi | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await minta<Partial<DataKoleksi>>(api, "/api/lacak/koleksi", {}, "Koleksi gagal dimuat.");
        if (!hidup) return;
        setData({
          akun: Array.isArray(d.akun) ? d.akun : [],
          statistik: d.statistik ?? {
            akun: 0,
            video: 0,
            vektor: 0,
            ditemukan_30h: 0,
            total_30h: 0,
            disetujui_30h: 0,
            diputus_30h: 0,
            lens_bulan_ini: 0,
            lens_kuota: 0,
          },
        });
        setGalat("");
      } catch (e) {
        if (hidup) setGalat(teksGalat(e, "Koleksi gagal dimuat."));
      }
    })();
    return () => {
      hidup = false;
    };
  }, [api, tik]);

  const muatUlang = useCallback(() => setTik((n) => n + 1), []);

  const tandai = (id: number, nyala: boolean) =>
    setSibuk((s) => {
      const b = new Set(s);
      if (nyala) b.add(id);
      else b.delete(id);
      return b;
    });

  /** Tambah akun; mengembalikan pesan galat, atau null bila berhasil. */
  const tambah = useCallback(
    async (url: string, jenis: JenisAkunKoleksi): Promise<string | null> => {
      try {
        const a = await minta<AkunKoleksi>(api, "/api/lacak/koleksi", json("POST", { url, jenis }), "Akun gagal ditambahkan.");
        setData((d) => (d ? { ...d, akun: [a, ...d.akun.filter((x) => x.id !== a.id)] } : d));
        setTik((n) => n + 1); // statistik ikut disegarkan
        return null;
      } catch (e) {
        return teksGalat(e, "Akun gagal ditambahkan.");
      }
    },
    [api],
  );

  /** Ubah aktif/jenis secara optimis; dikembalikan bila server menolak. */
  const ubah = useCallback(
    async (id: number, patch: { aktif?: boolean; jenis?: JenisAkunKoleksi }): Promise<string | null> => {
      const lama = dataRef.current?.akun.find((x) => x.id === id);
      setData((d) => (d ? { ...d, akun: d.akun.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : d));
      tandai(id, true);
      try {
        const a = await minta<AkunKoleksi>(api, `/api/lacak/koleksi/${id}`, json("PATCH", patch), "Perubahan gagal disimpan.");
        setData((d) => (d ? { ...d, akun: d.akun.map((x) => (x.id === id ? a : x)) } : d));
        return null;
      } catch (e) {
        const awal = lama;
        if (awal) setData((d) => (d ? { ...d, akun: d.akun.map((x) => (x.id === id ? awal : x)) } : d));
        return teksGalat(e, "Perubahan gagal disimpan.");
      } finally {
        tandai(id, false);
      }
    },
    [api],
  );

  const hapus = useCallback(
    async (id: number): Promise<string | null> => {
      tandai(id, true);
      try {
        await minta<{ sukses?: boolean }>(api, `/api/lacak/koleksi/${id}`, { method: "DELETE" }, "Akun gagal dihapus.");
        setData((d) => (d ? { ...d, akun: d.akun.filter((x) => x.id !== id) } : d));
        setTik((n) => n + 1);
        return null;
      } catch (e) {
        return teksGalat(e, "Akun gagal dihapus.");
      } finally {
        tandai(id, false);
      }
    },
    [api],
  );

  return { data, galat, sibuk, muatUlang, tambah, ubah, hapus };
}

// ------------------------------------------------------------ pengaturan

export function usePengaturanLacak() {
  const api = useApiAutoEdit();
  const [data, setData] = useState<PengaturanLacak | null>(null);
  const [galat, setGalat] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [tik, setTik] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await minta<PengaturanLacak>(api, "/api/lacak/pengaturan", {}, "Pengaturan pelacak gagal dimuat.");
        if (!hidup) return;
        setData(d);
        setGalat("");
      } catch (e) {
        if (hidup) setGalat(teksGalat(e, "Pengaturan pelacak gagal dimuat."));
      }
    })();
    return () => {
      hidup = false;
    };
  }, [api, tik]);

  const muatUlang = useCallback(() => setTik((n) => n + 1), []);

  /** Simpan (master); mengembalikan pesan galat, atau null bila berhasil. */
  const simpan = useCallback(
    async (p: PengaturanLacak): Promise<string | null> => {
      setMenyimpan(true);
      try {
        const d = await minta<PengaturanLacak>(api, "/api/lacak/pengaturan", json("PUT", p), "Pengaturan gagal disimpan.");
        setData(d);
        return null;
      } catch (e) {
        return teksGalat(e, "Pengaturan gagal disimpan.");
      } finally {
        setMenyimpan(false);
      }
    },
    [api],
  );

  return { data, galat, menyimpan, muatUlang, simpan };
}
