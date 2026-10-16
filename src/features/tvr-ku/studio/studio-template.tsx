"use client";

// ============================================================
// STUDIO TEMPLATE (16 Okt 2026, uji coba akun Faris) — editor visual template
// Edit Otomatis TVR Saya: tata letak logo, kotak berita (+ area tulisan),
// kotak kategori, footer, boom like share, pernak-pernik (gambar, bisa hapus
// latar), dan outro; atur waktu tampil di timeline; buat video pratinjau;
// lalu Simpan & Tetapkan. Berdampingan dengan editor 4-slot (template-tvr-modal).
//
// Desktop: daftar elemen | kanvas | pengaturan, timeline di bawah.
// HP: kanvas di atas, lembar bawah bertab Elemen / Atur / Waktu.
// Layanan: /api/tvr/studio* (src/mesin-video/server/tvr.ts).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Eye, EyeOff, Image as IkonGambar, Loader2, Play, Plus, Redo2, Undo2 } from "lucide-react";
import { toast } from "@/hooks/use-app-store";
import { bacaJson, pesanGalat } from "@/features/auto-edit/api";
import { useApiAutoEdit } from "@/features/auto-edit/tim";
import {
  MAKS_ELEMEN,
  MAKS_PERNAK,
  WARNA_JENIS,
  periksaAturan,
  teksPatok,
  type DokStudio,
  type JenisElemen,
} from "@/mesin-video/studio-model";
import { cn } from "@/lib/utils";
import { KanvasStudio, PILIH_OUTRO, PILIH_TEKS } from "./kanvas-studio";
import { PanelProperti } from "./panel-properti";
import { PratinjauStudio } from "./pratinjau-studio";
import { PRATINJAU_AKTIF, useGambarAset, type AsetStudio, type DataStudio, type RingkasPratinjau } from "./studio-tipe";
import {
  catatRiwayat,
  elemenBaru,
  fmtDurasi,
  jepitKanvas,
  jepitRect,
  namaElemen,
  perluCatat,
  pindahUrutan,
  sesuaikanTinggi,
  ubahElemen,
  ulangi,
  urungkan,
  type Riwayat,
} from "./studio-murni";
import { TimelineStudio } from "./timeline-studio";

type Props = { onTutup: () => void; onTersimpan: () => void };
type TargetBerkas = { mode: "baru"; jenis: JenisElemen } | { mode: "ganti"; id: string } | { mode: "outro" };
type TabPonsel = "elemen" | "atur" | "waktu";

const KUERI_DESKTOP = "(min-width: 1024px)";
function langgan(cb: () => void) {
  const m = window.matchMedia(KUERI_DESKTOP);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
const useDesktop = () => useSyncExternalStore(langgan, () => window.matchMedia(KUERI_DESKTOP).matches, () => true);

const jenisUnggah = (t: TargetBerkas, dok: DokStudio): "gambar" | "boom" | "outro" => {
  if (t.mode === "outro") return "outro";
  const jenis = t.mode === "baru" ? t.jenis : dok.elemen.find((e) => e.id === t.id)?.jenis;
  return jenis === "boom" ? "boom" : "gambar";
};

export function StudioTemplate({ onTutup, onTersimpan }: Props) {
  const api = useApiAutoEdit();
  const desktop = useDesktop();
  const [data, setData] = useState<DataStudio | null>(null);
  const [galat, setGalat] = useState("");
  const [dok, setDok] = useState<DokStudio | null>(null);
  // Garis dasar "Tersimpan" = JSON dokumen terakhir yang dimuat/disimpan (bukan "" — itu membuat lencana
  // "Belum disimpan" & konfirmasi tutup muncul tanpa satu pun perubahan).
  const [tersimpan, setTersimpan] = useState("");
  // Template Studio belum pernah ditetapkan (dok hasil konversi editor lama): Simpan tetap boleh tanpa perubahan.
  const [belumDitetapkan, setBelumDitetapkan] = useState(false);
  const [riwayat, setRiwayat] = useState<Riwayat>({ lalu: [], nanti: [] });
  const [pilih, setPilih] = useState<string | null>(null);
  const [aset, setAset] = useState<Record<string, AsetStudio>>({});
  const [durasi, setDurasi] = useState(40);
  const [putar, setPutar] = useState(1);
  const [contohLebar, setContohLebar] = useState(false);
  const [areaAman, setAreaAman] = useState(true);
  const [tempel, setTempel] = useState(true);
  const [rasioBebas, setRasioBebas] = useState<Set<string>>(() => new Set());
  const [asli, setAsli] = useState<Record<string, string>>({});
  const [mengolah, setMengolah] = useState<string | null>(null);
  const [unggah, setUnggah] = useState<{ label: string; persen: number } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [pratinjauBuka, setPratinjauBuka] = useState(false);
  const [pratinjau, setPratinjau] = useState<RingkasPratinjau | null>(null);
  const [konfirmasiTutup, setKonfirmasiTutup] = useState(false);
  const [tab, setTab] = useState<TabPonsel>("elemen");
  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<TargetBerkas | null>(null);
  const dokRef = useRef<DokStudio | null>(null);
  /** JSON keadaan saat gerakan dimulai; dicatat ke riwayat hanya bila dokumen benar-benar berubah. */
  const tundaRef = useRef<string | null>(null);
  useEffect(() => {
    dokRef.current = dok;
  }, [dok]);

  // ---------- muat ----------
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const res = await api.fetch("/api/tvr/studio", { cache: "no-store" });
        const d = await bacaJson(res);
        if (!res.ok) throw new Error(pesanGalat(res.status, d, "Studio gagal dimuat."));
        if (!hidup) return;
        const isi = d as DataStudio;
        setData(isi);
        setDok(isi.dok);
        setTersimpan(JSON.stringify(isi.dok));
        setBelumDitetapkan(!isi.studio_tersimpan);
        setAset(Object.fromEntries(isi.aset.map((a) => [a.ref, a])));
        setPratinjau(isi.pratinjau);
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : "Studio gagal dimuat.");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [api]);

  const refsGambar = useMemo(() => {
    if (!dok) return [];
    const r = dok.elemen.map((e) => e.file).filter((f): f is string => Boolean(f));
    if (dok.outro.file) r.push(dok.outro.file);
    return r;
  }, [dok]);
  const gambar = useGambarAset(api.fetch, refsGambar);

  // ---------- perubahan & riwayat ----------
  // mulaiUbah (pointerdown/fokus) hanya menyiapkan snapshot; `ubah` mencatatnya pada perubahan nyata pertama.
  // Klik elemen setelah Ctrl+Z tidak lagi membuang tumpukan ulangi atau menambah langkah kosong.
  const mulaiUbah = useCallback(() => {
    const d = dokRef.current;
    tundaRef.current = d ? JSON.stringify(d) : null;
  }, []);
  const ubah = useCallback((fn: (d: DokStudio) => DokStudio) => {
    const d = dokRef.current;
    if (!d) return;
    const baru = fn(d);
    if (baru === d) return;
    // dokRef dimutakhirkan langsung supaya beberapa `ubah` sebelum render berikutnya saling melihat hasilnya.
    dokRef.current = baru;
    const tunda = tundaRef.current;
    if (perluCatat(tunda, baru)) {
      tundaRef.current = null;
      setRiwayat((r) => catatRiwayat(r, tunda));
    }
    setDok(baru);
  }, []);
  const ubahTercatat = useCallback(
    (fn: (d: DokStudio) => DokStudio) => {
      mulaiUbah();
      ubah(fn);
    },
    [mulaiUbah, ubah],
  );
  const lakukanUrung = useCallback(() => {
    const d = dokRef.current;
    if (!d) return;
    const h = urungkan(riwayat, d);
    if (!h) return;
    tundaRef.current = null;
    dokRef.current = h.dok;
    setRiwayat(h.riwayat);
    setDok(h.dok);
  }, [riwayat]);
  const lakukanUlang = useCallback(() => {
    const d = dokRef.current;
    if (!d) return;
    const h = ulangi(riwayat, d);
    if (!h) return;
    tundaRef.current = null;
    dokRef.current = h.dok;
    setRiwayat(h.riwayat);
    setDok(h.dok);
  }, [riwayat]);

  const berubah = dok !== null && JSON.stringify(dok) !== tersimpan;
  const masalah = dok ? periksaAturan(dok) : null;

  // ---------- berkas ----------
  const pilihBerkas = (t: TargetBerkas) => {
    if (!dok || !data) return;
    targetRef.current = t;
    const j = jenisUnggah(t, dok);
    const el = inputRef.current;
    if (!el) return;
    el.accept = data.batas.jenis_aset[j].join(",");
    el.value = "";
    el.click();
  };

  async function berkasDipilih(file: File | null) {
    const t = targetRef.current;
    if (!file || !t || !dokRef.current || unggah) return;
    const j = jenisUnggah(t, dokRef.current);
    setUnggah({ label: file.name, persen: 0 });
    try {
      const { ok, status, data: d } = await api.unggah(`/api/tvr/studio/aset?jenis=${j}`, file, (persen) => setUnggah({ label: file.name, persen }));
      if (!ok) throw new Error(pesanGalat(status, d, "Berkas gagal diunggah."));
      const info = d.aset as AsetStudio;
      setAset((a) => ({ ...a, [info.ref]: info }));
      const ukuran = info.w > 0 && info.h > 0 ? { w: info.w, h: info.h } : null;
      if (t.mode === "outro") {
        ubahTercatat((x) => ({ ...x, outro: { file: info.ref, durasi: null } }));
        setPilih(PILIH_OUTRO);
      } else if (t.mode === "baru") {
        const el = elemenBaru(dokRef.current, t.jenis, info.ref, ukuran);
        ubahTercatat((x) => ({ ...x, elemen: t.jenis === "footer" ? [el, ...x.elemen] : [...x.elemen, el] }));
        setPilih(el.id);
      } else {
        ubahTercatat((x) =>
          ubahElemen(x, t.id, (e) => {
            // Rasio berkas baru: lebar tetap, tinggi menyesuaikan (bila rasio dikunci).
            const rect = ukuran && !rasioBebas.has(e.id) ? sesuaikanTinggi(e.rect, (e.rect.w * ukuran.h) / ukuran.w) : e.rect;
            return { ...e, file: info.ref, rect };
          }),
        );
        setAsli((a) => {
          const salin = { ...a };
          delete salin[t.id];
          return salin;
        });
      }
    } catch (e) {
      toast("error", "Gagal mengunggah", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setUnggah(null);
    }
  }

  async function hapusLatar(id: string) {
    const el = dokRef.current?.elemen.find((e) => e.id === id);
    if (!el?.file || mengolah) return;
    setMengolah(id);
    try {
      const res = await api.fetch("/api/tvr/studio/aset/hapus-latar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: el.file }),
      });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Latar gagal dihapus."));
      const info = d.aset as AsetStudio;
      setAset((a) => ({ ...a, [info.ref]: info }));
      const lama = el.file;
      setAsli((a) => ({ ...a, [id]: a[id] ?? lama }));
      ubahTercatat((x) =>
        ubahElemen(x, id, (e) => {
          // Hasil dipangkas ke objeknya: tinggi menyesuaikan rasio baru.
          const rect = info.w > 0 ? sesuaikanTinggi(e.rect, (e.rect.w * info.h) / info.w) : e.rect;
          return { ...e, file: info.ref, rect };
        }),
      );
      toast("sukses", "Latar dihapus", "Gambar tanpa latar dipakai. Tekan Pakai asli untuk kembali.");
    } catch (e) {
      toast("error", "Hapus latar gagal", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setMengolah(null);
    }
  }

  function pakaiAsli(id: string) {
    const ref = asli[id];
    if (!ref) return;
    const info = aset[ref];
    ubahTercatat((x) =>
      ubahElemen(x, id, (e) => ({ ...e, file: ref, rect: info && info.w > 0 ? sesuaikanTinggi(e.rect, (e.rect.w * info.h) / info.w) : e.rect })),
    );
    setAsli((a) => {
      const s = { ...a };
      delete s[id];
      return s;
    });
  }

  // ---------- simpan & tutup ----------
  async function simpan() {
    if (!dok || menyimpan) return;
    if (masalah) {
      toast("peringatan", "Belum bisa disimpan", masalah);
      return;
    }
    setMenyimpan(true);
    try {
      const res = await api.fetch("/api/tvr/studio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dok }),
      });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Template gagal disimpan."));
      setTersimpan(JSON.stringify(dok));
      setBelumDitetapkan(false);
      toast("sukses", "Template tersimpan", "Video berikutnya memakai template ini.");
      onTersimpan();
    } catch (e) {
      toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setMenyimpan(false);
    }
  }

  const tutup = () => {
    if (berubah && !konfirmasiTutup) {
      setKonfirmasiTutup(true);
      return;
    }
    onTutup();
  };

  // ---------- papan ketik ----------
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Event sintetis React ikut naik dari portal anak (dialog Video pratinjau): abaikan yang asalnya di luar
    // pohon DOM editor ini, juga kolom isian & kontrol video.
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target)) return;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "VIDEO" || tag === "AUDIO" || target.isContentEditable) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) lakukanUlang();
      else lakukanUrung();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      lakukanUlang();
      return;
    }
    if (e.key === "Escape") {
      setPilih(null);
      return;
    }
    const arah: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const g = arah[e.key];
    if (g && pilih && pilih !== PILIH_OUTRO) {
      e.preventDefault();
      const n = e.shiftKey ? 10 : 1;
      ubahTercatat((d) =>
        pilih === PILIH_TEKS
          ? { ...d, elemen: d.elemen.map((x) => (x.jenis === "berita" && x.teks ? { ...x, teks: jepitKanvas({ ...x.teks, x: x.teks.x + g[0] * n, y: x.teks.y + g[1] * n }) } : x)) }
          : ubahElemen(d, pilih, (x) => ({ ...x, rect: jepitRect({ ...x.rect, x: x.rect.x + g[0] * n, y: x.rect.y + g[1] * n }) })),
      );
    }
  };

  // ---------- tampilan ----------
  const kosong = !dok || !data;
  const elTerpilih = dok?.elemen.find((e) => e.id === pilih) ?? null;
  const namaTerpilih = pilih === PILIH_TEKS ? "area tulisan berita" : pilih === PILIH_OUTRO ? "outro" : elTerpilih ? namaElemen(elTerpilih) : "";
  const pr = pratinjau;
  const prAktif = pr !== null && PRATINJAU_AKTIF.includes(pr.status);
  const ada = (j: JenisElemen) => Boolean(dok?.elemen.some((e) => e.jenis === j));
  const jumlahPernak = dok?.elemen.filter((e) => e.jenis === "pernak").length ?? 0;
  const penuh = (dok?.elemen.length ?? 0) >= MAKS_ELEMEN;

  const panel = dok && (
    <PanelProperti
      dok={dok}
      pilih={pilih}
      aset={aset}
      gambar={gambar}
      durasi={durasi}
      mulaiUbah={mulaiUbah}
      ubah={ubah}
      kunciRasio={(id) => !rasioBebas.has(id)}
      setKunciRasio={(id, v) =>
        setRasioBebas((s) => {
          const b = new Set(s);
          if (v) b.delete(id);
          else b.add(id);
          return b;
        })
      }
      onGantiBerkas={(id) => pilihBerkas(id === PILIH_OUTRO ? { mode: "outro" } : { mode: "ganti", id })}
      onHapusLatar={(id) => void hapusLatar(id)}
      onPakaiAsli={pakaiAsli}
      adaAsli={(id) => Boolean(asli[id])}
      mengolah={mengolah}
      onHapus={(id) => {
        ubahTercatat((d) => ({ ...d, elemen: d.elemen.filter((e) => e.id !== id) }));
        setPilih(null);
      }}
      onPindah={(id, arah) => ubahTercatat((d) => pindahUrutan(d, id, arah))}
      onPilih={setPilih}
    />
  );

  const daftarElemen = dok && (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="font-heading text-[14px] font-extrabold text-teks-utama">Elemen</span>
        <span className="text-[11px] text-teks-sekunder">atas = paling depan</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {[...dok.elemen].reverse().map((e) => {
          const dipilih = pilih === e.id || (e.jenis === "berita" && pilih === PILIH_TEKS);
          return (
            <li key={e.id}>
              <div
                className={cn("flex items-center gap-2 rounded-xl border px-2.5 py-1.5", dipilih ? "border-2" : "border-black/10 dark:border-white/10")}
                style={dipilih ? { borderColor: WARNA_JENIS[e.jenis], background: `${WARNA_JENIS[e.jenis]}14` } : undefined}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: WARNA_JENIS[e.jenis] }} aria-hidden="true" />
                <button type="button" onClick={() => setPilih(e.id)} className="flex min-w-0 flex-1 flex-col text-left">
                  <b className={cn("truncate text-[13px] text-teks-utama", e.tersembunyi && "line-through opacity-60")}>{namaElemen(e)}</b>
                  <span className="truncate text-[11px] text-teks-sekunder">
                    {e.jenis === "kategori" ? "tulisan kategori tiap video" : e.file ? (aset[e.file]?.nama ?? "berkas") : "tanpa gambar"} · {teksPatok(e.waktu.mulai)} → {teksPatok(e.waktu.selesai)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => ubahTercatat((d) => ubahElemen(d, e.id, (x) => ({ ...x, tersembunyi: !x.tersembunyi })))}
                  aria-label={`${e.tersembunyi ? "Tampilkan" : "Sembunyikan"} ${namaElemen(e)}`}
                  className="btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-teks-sekunder"
                >
                  {e.tersembunyi ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-teks-sekunder">Disambung setelah video</span>
        <button
          type="button"
          onClick={() => (dok.outro.file ? setPilih(PILIH_OUTRO) : pilihBerkas({ mode: "outro" }))}
          className={cn("flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left", pilih === PILIH_OUTRO ? "border-2 border-[#6d28d9]" : "border-black/10 dark:border-white/10")}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-[#6d28d9]" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="text-[13px] text-teks-utama">Outro</b>
            <span className="truncate text-[11px] text-teks-sekunder">
              {dok.outro.file ? `${aset[dok.outro.file]?.nama ?? "video"}${dok.outro.durasi ? ` · dipendekkan ${fmtDurasi(dok.outro.durasi)}` : ""}` : "belum ada — ketuk untuk memilih video"}
            </span>
          </span>
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-teks-sekunder">Tambah</span>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ["logo", "Logo", !ada("logo")],
              ["footer", "Footer", !ada("footer")],
              ["boom", "Boom like share", !ada("boom")],
              ["kategori", "Kotak kategori", !ada("kategori")],
            ] as const
          ).map(([j, n, boleh]) =>
            boleh ? (
              <button
                key={j}
                type="button"
                disabled={penuh}
                onClick={() => {
                  if (j === "kategori") {
                    const el = elemenBaru(dok, "kategori", null, null);
                    ubahTercatat((d) => ({ ...d, elemen: [...d.elemen, el] }));
                    setPilih(el.id);
                  } else pilihBerkas({ mode: "baru", jenis: j });
                }}
                className="btn-tekan min-h-10 rounded-xl border border-dashed border-black/25 text-[12px] font-semibold text-teks-utama disabled:opacity-40 dark:border-white/25"
              >
                + {n}
              </button>
            ) : null,
          )}
        </div>
        <button
          type="button"
          disabled={penuh || jumlahPernak >= MAKS_PERNAK}
          onClick={() => pilihBerkas({ mode: "baru", jenis: "pernak" })}
          className="btn-tekan flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-black/30 text-[13px] font-bold text-teks-utama disabled:opacity-40 dark:border-white/30"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Tambah pernak-pernik (gambar)
        </button>
        <span className="text-[11px] leading-snug text-teks-sekunder">
          PNG / JPG / WEBP · latar bisa dihapus otomatis · {dok.elemen.length} dari maks. {MAKS_ELEMEN} elemen
        </span>
      </div>
    </div>
  );

  const timeline = dok && (
    <TimelineStudio
      dok={dok}
      durasi={durasi}
      onDurasi={(d) => {
        setDurasi(d);
        setPutar((t) => Math.min(t, d));
      }}
      putar={putar}
      onPutar={setPutar}
      pilih={pilih}
      onPilih={setPilih}
      mulaiUbah={mulaiUbah}
      ubah={ubah}
      outroAsli={dok.outro.file ? (aset[dok.outro.file]?.durasi ?? null) : null}
      ringkas={!desktop}
    />
  );

  const kanvas = dok && (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["Area aman", areaAman, setAreaAman],
            ["Tempel ke garis", tempel, setTempel],
            ["Contoh 16:9", contohLebar, setContohLebar],
          ] as const
        ).map(([n, v, set]) => (
          <button
            key={n}
            type="button"
            aria-pressed={v}
            onClick={() => set(!v)}
            className={cn("btn-tekan h-8 rounded-lg border px-2.5 text-[11.5px] font-semibold", v ? "border-teks-utama bg-teks-utama text-app-bg" : "border-black/15 text-teks-utama dark:border-white/15")}
          >
            {n}
          </button>
        ))}
        <span className="flex-1" />
        <span className="font-mono text-[11px] font-semibold text-teks-sekunder">720×1280 · detik {putar.toFixed(1).replace(".", ",")}</span>
      </div>
      <div className="min-h-0 flex-1 rounded-2xl bg-black/[.06] dark:bg-white/[.05]">
        <KanvasStudio
          dok={dok}
          gambar={gambar}
          pilih={pilih}
          onPilih={setPilih}
          mulaiUbah={mulaiUbah}
          ubah={ubah}
          kunciRasio={(id) => !rasioBebas.has(id)}
          rasioAset={(ref) => {
            const a = ref ? aset[ref] : undefined;
            return a && a.w > 0 && a.h > 0 ? a.w / a.h : null;
          }}
          putar={putar}
          durasi={durasi}
          contohLebar={contohLebar}
          areaAman={areaAman}
          tempel={tempel}
        />
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[96] flex flex-col bg-app-bg text-teks-utama" role="dialog" aria-modal="true" aria-label="Studio Template" tabIndex={-1} onKeyDown={onKeyDown}>
      {/* bilah atas */}
      <header className="flex shrink-0 items-center gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10 lg:px-5">
        <button type="button" onClick={tutup} aria-label="Tutup Studio" className="btn-tekan flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 dark:border-white/15">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-teks-sekunder">Studio Template · uji coba</span>
          <div className="flex items-center gap-2">
            <span className="truncate font-heading text-[16px] font-extrabold">Template Edit Otomatis</span>
            {dok && (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-bold",
                  berubah || belumDitetapkan ? "border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" : "border-emerald-300 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
                )}
              >
                {berubah ? "Belum disimpan" : belumDitetapkan ? "Belum ditetapkan" : "Tersimpan"}
              </span>
            )}
          </div>
        </div>
        <div className="hidden gap-1.5 sm:flex" role="group" aria-label="Riwayat">
          <button type="button" onClick={lakukanUrung} disabled={riwayat.lalu.length === 0} aria-label="Urungkan (Ctrl/⌘+Z)" className="btn-tekan flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 disabled:opacity-35 dark:border-white/15">
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={lakukanUlang} disabled={riwayat.nanti.length === 0} aria-label="Ulangi (Ctrl/⌘+Shift+Z)" className="btn-tekan flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 disabled:opacity-35 dark:border-white/15">
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setPratinjauBuka(true)}
          disabled={kosong || Boolean(masalah)}
          className="btn-tekan flex h-10 items-center gap-1.5 rounded-xl bg-teks-utama px-3 text-[12.5px] font-bold text-app-bg disabled:opacity-40"
        >
          {prAktif ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          <span className="hidden sm:inline">Video pratinjau</span>
        </button>
        <button
          type="button"
          onClick={() => void simpan()}
          disabled={kosong || menyimpan || (!berubah && !belumDitetapkan)}
          className="btn-tekan flex h-10 items-center gap-1.5 rounded-xl bg-pri px-3 text-[12.5px] font-bold text-white disabled:opacity-40"
        >
          {menyimpan && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Simpan<span className="hidden sm:inline">&nbsp;&amp; Tetapkan</span>
        </button>
      </header>

      {konfirmasiTutup && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-100" role="alert">
          <span className="flex-1">Perubahan belum disimpan. Tutup Studio tanpa menyimpan?</span>
          <button type="button" onClick={() => setKonfirmasiTutup(false)} className="btn-tekan h-9 rounded-lg border border-amber-400 px-3 font-semibold">
            Lanjut menata
          </button>
          <button type="button" onClick={onTutup} className="btn-tekan h-9 rounded-lg bg-amber-600 px-3 font-semibold text-white">
            Tutup tanpa menyimpan
          </button>
        </div>
      )}

      {masalah && dok && (
        <p className="m-0 shrink-0 border-b border-gagal/30 bg-gagal/10 px-4 py-1.5 text-[12px] font-semibold text-teks-utama" role="status">
          {masalah}
        </p>
      )}

      {unggah && (
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 px-4 py-1.5 text-[12px] dark:border-white/10" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin text-pri" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Mengunggah {unggah.label}…</span>
          <span className="font-mono">{Math.round(unggah.persen)}%</span>
        </div>
      )}

      {kosong ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          {galat ? (
            <div className="flex max-w-sm flex-col items-center gap-3">
              <IkonGambar className="h-8 w-8 text-teks-sekunder" aria-hidden="true" />
              <p className="m-0 text-[13px] text-teks-utama">{galat}</p>
              <button type="button" onClick={onTutup} className="btn-tekan h-10 rounded-xl border border-black/15 px-4 text-[13px] font-semibold dark:border-white/15">
                Kembali
              </button>
            </div>
          ) : (
            <span className="flex items-center gap-2 text-[13px] text-teks-sekunder" role="status">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Menyiapkan Studio…
            </span>
          )}
        </div>
      ) : desktop ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-cols-[288px_minmax(0,1fr)_340px]">
            <aside className="min-h-0 overflow-y-auto border-r border-black/10 p-4 dark:border-white/10" aria-label="Elemen template">
              {daftarElemen}
            </aside>
            <main className="min-h-0 p-3">{kanvas}</main>
            <aside className="min-h-0 overflow-y-auto border-l border-black/10 p-4 dark:border-white/10" aria-label="Pengaturan elemen">
              {panel}
            </aside>
          </div>
          <section className="max-h-[34vh] shrink-0 overflow-y-auto border-t border-black/10 px-5 py-3 dark:border-white/10" aria-label="Timeline">
            {timeline}
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 p-2">{kanvas}</div>
          <section className="flex max-h-[52dvh] shrink-0 flex-col rounded-t-3xl border-t border-black/10 bg-app-bg shadow-[0_-6px_20px_rgba(15,23,42,.08)] dark:border-white/10" aria-label="Pengaturan">
            <div role="tablist" aria-label="Bagian Studio" className="mx-3 mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-black/5 p-1 dark:bg-white/10">
              {(
                [
                  ["elemen", "Elemen"],
                  ["atur", "Atur"],
                  ["waktu", "Waktu"],
                ] as const
              ).map(([k, n]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={cn("btn-tekan min-h-10 rounded-xl text-[13px] font-bold", tab === k ? "bg-app-bg text-pri shadow-sm" : "text-teks-sekunder")}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {tab === "elemen" && daftarElemen}
              {tab === "atur" && panel}
              {tab === "waktu" && timeline}
            </div>
          </section>
        </div>
      )}

      <input ref={inputRef} type="file" className="hidden" onChange={(e) => void berkasDipilih(e.target.files?.[0] ?? null)} aria-hidden="true" tabIndex={-1} />

      {pratinjauBuka && dok && (
        <PratinjauStudio
          dok={dok}
          awal={pratinjau}
          menyimpan={menyimpan}
          onSimpan={() => void simpan()}
          onTutup={(terakhir) => {
            setPratinjau(terakhir);
            setPratinjauBuka(false);
          }}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {namaTerpilih ? `Terpilih: ${namaTerpilih}` : ""}
      </span>
    </div>,
    document.body,
  );
}
