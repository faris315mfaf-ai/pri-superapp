"use client";

// ============================================================
// RUANG DUNIA v2 — kanvas gedung 8 ruang pixel art (tile 64×32) dengan
// kamera (geser / zoom / lompat ke ruang). Pengganti RuangIsometrik untuk
// dunia v2: props & tanggung jawab sama (memajukan simulasi di loop rAF,
// overlay tag/gelembung via style, klik memilih Nara / anggota / bot).
//
// Kamera: tampilan awal "Pas" (seluruh gedung; di layar sempit langsung ke
// `ruangAwal`). Tombol & chip ruang meluncur halus ke tujuan (tanpa animasi
// bila pengguna memilih gerak dikurangi); seret, pinch, dan ctrl/⌘ + gulir
// langsung. Memilih orang dari luar kanvas (panel Online) membawa kamera ke
// orang itu bila ia di luar layar. Klik ≠ seret (ambang 5 px).
// ============================================================

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useTabAktif } from "@/hooks/use-tab-aktif";
import type { PenghuniDunia } from "@/lib/dunia-murni";
import { konfigDariRupaBot, type KonfigKarakter } from "@/lib/karakter-murni";
import { cn } from "@/lib/utils";
import { WARNA_TEMPAT } from "./data-contoh";
import { LABEL_RUANG2, RUANG2, zonaDari2, type KunciRuang2 } from "./denah2";
import { muatAsetDunia2, type AsetDunia2 } from "./dunia2-aset";
import { ID_NARA2, gambarFrame2, type PosisiLayar2 } from "./dunia2-gambar";
import {
  LEBAR_LATAR,
  TINGGI_LATAR,
  ZOOM_MAKS2,
  dariLayar,
  dekatiKamera,
  jepitKamera,
  keLayar,
  latarKeWadah,
  petaRupaAnggota,
  pusatRuang,
  rupaAnggota,
  skalaPas,
  skalaRuang,
  terlihatDiKamera,
  zoomDiJangkar,
  type Kamera2,
  type ModeDinding,
} from "./dunia2-murni";
import type { SimulasiBot } from "./simulasi-bot";
import { WARNA_NARA } from "./simulasi-nara";
import type { Penghuni, SimulasiPenghuni } from "./simulasi-penghuni";
import type { BotContoh } from "./tipe";

const DT_MAKS = 0.1;
const SELANG_GAMBAR_DIKURANGI = 250;
const WAKTU_BEKU = 100;
const AMBANG_SERET = 5;
/** Tinggi tag nama di atas kaki (px latar). */
const ATAS_KEPALA = 64;
/** Wadah lebih sempit dari skala Pas ini (ponsel) → mulai di ruangAwal, bukan seluruh gedung. */
const PAS_TERLALU_KECIL = 0.42;
/** Pilihan tampilan dinding dalam disimpan per peramban (kenyamanan saja). */
const KUNCI_DINDING = "ruangbot:dinding";

function bacaModeDinding(): ModeDinding {
  try {
    return window.localStorage.getItem(KUNCI_DINDING) === "penuh" ? "penuh" : "rendah";
  } catch {
    return "rendah";
  }
}

/** Batas waktu menunggu posisi orang yang dipilih dari luar kanvas (baru masuk ruangan). */
const TUNGGU_IKUTI_MS = 3000;

function langganVisibilitas(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const useHalamanTerlihat = () => useSyncExternalStore(langganVisibilitas, () => document.visibilityState === "visible", () => true);
const KUERI_GERAK = "(prefers-reduced-motion: reduce)";
function langganGerak(cb: () => void) {
  const mql = window.matchMedia(KUERI_GERAK);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
const useGerakDikurangi = () => useSyncExternalStore(langganGerak, () => window.matchMedia(KUERI_GERAK).matches, () => false);

export type RuangDunia2Props = {
  sim: SimulasiBot;
  bots: BotContoh[];
  malam: boolean;
  kecepatan: number;
  terpilihId: string | null;
  onPilih: (id: string | null) => void;
  onPilihNara?: () => void;
  penghuni: SimulasiPenghuni;
  daftarPenghuni: readonly PenghuniDunia[];
  terpilihPenghuniId: number | null;
  onPilihPenghuni: (id: number | null) => void;
  /** Rupa anggota; bawaan: `rupa` dari daftarPenghuni (Karakter Saya), lalu rupa bawaan stabil per akun. */
  konfigPenghuni?: (p: Penghuni) => KonfigKarakter;
  /** Rupa akun sendiri yang baru disimpan — tampil langsung sebelum status dunia berikutnya tiba. */
  rupaSaya?: KonfigKarakter;
  onBukaZona?: Partial<Record<KunciRuang2, () => void>>;
  /** Id akun sendiri: tombol "Saya" memusatkan kamera ke karakter ini. */
  sayaId?: number;
  /** Ruang pembuka di layar sempit (seluruh gedung terlalu kecil). */
  ruangAwal?: KunciRuang2;
  /** Pil status di pojok kiri atas (di atas chip ruang). */
  hud?: ReactNode;
  children?: ReactNode;
  className?: string;
};

type Kena = { jenis: "nara" } | { jenis: "anggota"; id: number } | { jenis: "bot"; id: string };
type Ikuti = { jenis: "anggota"; id: number; sampai: number } | { jenis: "bot"; id: string; sampai: number };

export function RuangDunia2({
  sim,
  bots,
  malam,
  kecepatan,
  terpilihId,
  onPilih,
  onPilihNara,
  penghuni,
  daftarPenghuni,
  terpilihPenghuniId,
  onPilihPenghuni,
  konfigPenghuni,
  rupaSaya,
  onBukaZona,
  sayaId,
  ruangAwal,
  hud,
  children,
  className,
}: RuangDunia2Props) {
  const tabAktif = useTabAktif();
  const halamanTerlihat = useHalamanTerlihat();
  const gerakDikurangi = useGerakDikurangi();
  const jalan = tabAktif && halamanTerlihat;

  const wadahRef = useRef<HTMLDivElement>(null);
  const kanvasRef = useRef<HTMLCanvasElement>(null);
  const [aset, setAset] = useState<AsetDunia2 | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [zoomTampil, setZoomTampil] = useState<number | "pas">("pas");
  const [ruangAktif, setRuangAktif] = useState<KunciRuang2 | null>(null);
  const [modeDinding, setModeDinding] = useState<ModeDinding>("rendah");
  const pilihDinding = (m: ModeDinding) => {
    setModeDinding(m);
    try {
      window.localStorage.setItem(KUNCI_DINDING, m);
    } catch {
      // penyimpanan peramban diblokir: pilihan berlaku sampai halaman ditutup
    }
  };

  const kameraRef = useRef<Kamera2>({ cx: LEBAR_LATAR / 2, cy: TINGGI_LATAR / 2, s: 0.5 });
  /** Tujuan animasi kamera (null = diam). */
  const tujuanRef = useRef<Kamera2 | null>(null);
  const pasRef = useRef(true);
  const awalRef = useRef(false);
  const ikutiRef = useRef<Ikuti | null>(null);
  /** performance.now() klik terakhir di kanvas: pilihan dari kanvas tidak menggerakkan kamera. */
  const klikKanvasRef = useRef(-1e9);
  const gerakRef = useRef(gerakDikurangi);
  const ukuranRef = useRef({ w: 0, h: 0, dpr: 1 });
  const kotorRef = useRef(true);
  const terlihatRef = useRef(true);
  const zonaKursorRef = useRef<KunciRuang2 | null>(null);
  const tanpaHoverRef = useRef(false);
  const posisiRef = useRef<Map<string, PosisiLayar2>>(new Map());
  const posisiPenghuniRef = useRef<Map<number, PosisiLayar2>>(new Map());

  const tagRef = useRef<Map<string, { tag: HTMLDivElement | null; gel: HTMLDivElement | null; teks: HTMLSpanElement | null }>>(new Map());
  const tagPenghuniRef = useRef<Map<number, { tag: HTMLDivElement | null; gel: HTMLDivElement | null; teks: HTMLSpanElement | null }>>(new Map());
  const zonaRef = useRef<(HTMLElement | null)[]>([]);

  const konfigBot = useMemo(() => new Map(bots.map((b) => [b.id, konfigDariRupaBot(b.rupa)])), [bots]);
  const petaRupa = useMemo(() => petaRupaAnggota(daftarPenghuni, sayaId, rupaSaya), [daftarPenghuni, sayaId, rupaSaya]);
  const konfigAnggota = useMemo(() => konfigPenghuni ?? ((p: Penghuni) => rupaAnggota(petaRupa, p.id)), [konfigPenghuni, petaRupa]);
  const terbaru = useRef({ malam, kecepatan, terpilihId, terpilihPenghuniId, onPilih, onPilihNara, onPilihPenghuni, konfigBot, konfigAnggota, modeDinding });
  useEffect(() => {
    terbaru.current = { malam, kecepatan, terpilihId, terpilihPenghuniId, onPilih, onPilihNara, onPilihPenghuni, konfigBot, konfigAnggota, modeDinding };
    kotorRef.current = true;
  }, [malam, kecepatan, terpilihId, terpilihPenghuniId, onPilih, onPilihNara, onPilihPenghuni, konfigBot, konfigAnggota, modeDinding]);

  useEffect(() => {
    gerakRef.current = gerakDikurangi;
    sim.setGerakKurang(gerakDikurangi);
  }, [sim, gerakDikurangi]);
  useEffect(() => { tanpaHoverRef.current = window.matchMedia("(hover: none)").matches; }, []);
  // Pilihan dinding tersimpan dibaca setelah pasang (server selalu "rendah" → tanpa beda hidrasi).
  useEffect(() => {
    const tersimpan = bacaModeDinding();
    if (tersimpan !== "rendah") queueMicrotask(() => setModeDinding(tersimpan));
  }, []);

  useEffect(() => {
    let batal = false;
    muatAsetDunia2()
      .then((a) => { if (!batal) setAset(a); })
      .catch((e: unknown) => { if (!batal) setGalat(e instanceof Error ? e.message : "Gagal memuat dunia."); });
    return () => { batal = true; };
  }, []);

  // Dipilih dari luar kanvas (panel Online / daftar bot) → kamera menyusul bila orangnya di luar layar.
  useEffect(() => {
    if (performance.now() - klikKanvasRef.current < 400) return;
    const sampai = performance.now() + TUNGGU_IKUTI_MS;
    if (terpilihPenghuniId !== null) ikutiRef.current = { jenis: "anggota", id: terpilihPenghuniId, sampai };
    else if (terpilihId) ikutiRef.current = { jenis: "bot", id: terpilihId, sampai };
  }, [terpilihId, terpilihPenghuniId]);

  // ---------- kamera ----------

  /** Kamera yang sedang dituju (tujuan animasi, atau posisi kini). */
  const kameraAkhir = () => tujuanRef.current ?? kameraRef.current;
  const tampilkanZoom = (s: number) => setZoomTampil(pasRef.current ? "pas" : Math.round(s * 10) / 10);

  /** Pindah kamera: meluncur halus, atau langsung bila gerak dikurangi / wadah belum berukuran. */
  const pasang = (k: Kamera2, meluncur = true) => {
    const { w, h } = ukuranRef.current;
    const t = jepitKamera(k, w, h);
    if (meluncur && !gerakRef.current && w > 0) tujuanRef.current = t;
    else {
      kameraRef.current = t;
      tujuanRef.current = null;
    }
    kotorRef.current = true;
    tampilkanZoom(t.s);
  };
  /** Ubah kamera langsung (seret / pinch / roda): animasi berjalan dibatalkan. */
  const geserLangsung = (k: Kamera2) => {
    const { w, h } = ukuranRef.current;
    tujuanRef.current = null;
    kameraRef.current = jepitKamera(k, w, h);
    kotorRef.current = true;
  };

  const aturPas = () => {
    const { w, h } = ukuranRef.current;
    pasRef.current = true;
    setRuangAktif(null);
    pasang({ cx: LEBAR_LATAR / 2, cy: TINGGI_LATAR / 2, s: skalaPas(w, h) });
  };
  const zoomBertahap = (arah: 1 | -1) => {
    const { w, h } = ukuranRef.current;
    const k = kameraAkhir();
    if (arah > 0) {
      pasRef.current = false;
      pasang({ ...k, s: Math.min(ZOOM_MAKS2, Math.floor(k.s + 1e-6) + 1) });
      return;
    }
    const turun = Math.ceil(k.s - 1e-6) - 1;
    if (turun >= 1 && turun > skalaPas(w, h)) {
      pasRef.current = false;
      pasang({ ...k, s: turun });
    } else aturPas();
  };
  const keRuang = (kunci: KunciRuang2, meluncur = true) => {
    const r = RUANG2.find((x) => x.kunci === kunci);
    if (!r) return;
    const { w, h } = ukuranRef.current;
    const c = pusatRuang(r);
    pasRef.current = false;
    setRuangAktif(kunci);
    pasang({ cx: c.x, cy: c.y, s: Math.max(skalaRuang(w, h), kameraAkhir().s) }, meluncur);
  };
  /** Skala dekat untuk memusatkan satu orang: satu tingkat di atas skala ruang. */
  const skalaOrang = () => {
    const { w, h } = ukuranRef.current;
    const sr = skalaRuang(w, h);
    return sr >= 1 ? Math.min(ZOOM_MAKS2, sr + 1) : Math.min(1, sr * 2);
  };
  const keOrang = (pos: PosisiLayar2, sMin: number) => {
    pasRef.current = false;
    setRuangAktif(null);
    pasang({ cx: pos.sx, cy: pos.sy - 30, s: Math.max(kameraAkhir().s, sMin) });
  };
  const keSaya = () => {
    const pos = sayaId === undefined ? undefined : posisiPenghuniRef.current.get(sayaId);
    if (pos) keOrang(pos, skalaOrang());
  };

  // Ukuran wadah → resolusi kanvas (× devicePixelRatio) & kamera awal.
  useEffect(() => {
    const el = wadahRef.current;
    const kanvas = kanvasRef.current;
    if (!el || !kanvas) return;
    const ukur = () => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = el.clientWidth, h = el.clientHeight;
      ukuranRef.current = { w, h, dpr };
      kanvas.width = Math.max(1, Math.round(w * dpr));
      kanvas.height = Math.max(1, Math.round(h * dpr));
      if (w <= 0 || h <= 0) return;
      if (!awalRef.current) {
        awalRef.current = true;
        if (ruangAwal && skalaPas(w, h) < PAS_TERLALU_KECIL) {
          keRuang(ruangAwal, false);
          return;
        }
      }
      if (pasRef.current) pasang({ cx: LEBAR_LATAR / 2, cy: TINGGI_LATAR / 2, s: skalaPas(w, h) }, false);
      else {
        kameraRef.current = jepitKamera(kameraRef.current, w, h);
        if (tujuanRef.current) tujuanRef.current = jepitKamera(tujuanRef.current, w, h);
        kotorRef.current = true;
      }
    };
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = wadahRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      terlihatRef.current = !!e?.isIntersecting;
      if (e?.isIntersecting) kotorRef.current = true;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Zoom roda: hanya dengan ctrl/⌘ (pinch trackpad) — gulir biasa tetap menggulir halaman.
  useEffect(() => {
    const el = wadahRef.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const { w, h } = ukuranRef.current;
      const k = kameraRef.current;
      const s = Math.min(ZOOM_MAKS2, Math.max(skalaPas(w, h), k.s * Math.exp(-e.deltaY * 0.01)));
      pasRef.current = false;
      setRuangAktif(null);
      geserLangsung(zoomDiJangkar(k, s, e.clientX - r.left, e.clientY - r.top, w, h));
      tampilkanZoom(kameraRef.current.s);
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, []);

  // ---------- loop ----------

  useEffect(() => {
    if (!jalan || !aset) return;
    const kanvas = kanvasRef.current;
    const ctx = kanvas?.getContext("2d");
    if (!kanvas || !ctx) return;
    let id = 0;
    let terakhir = performance.now();
    let akhirGambar = 0;
    const ukuranGelembung = (s: number) => `${Math.max(9, Math.min(12, 9 + s * 1.2)).toFixed(1)}px`;
    const keWadah = (sx: number, sy: number) => {
      const { w, h } = ukuranRef.current;
      return latarKeWadah(kameraRef.current, sx, sy, w, h);
    };

    const taruh = (el: HTMLElement, sx: number, sy: number, z: number) => {
      const p = keWadah(sx, sy);
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
      el.style.zIndex = String(Math.round(z * 10) + 10);
      el.style.visibility = "visible";
    };
    const tampilDi = (x: number, y: number, dipilih: boolean) => tanpaHoverRef.current || dipilih || zonaKursorRef.current === zonaDari2(x, y);
    const isiGelembung = (gel: HTMLDivElement | null, isi: HTMLSpanElement | null, teks: string, warna: string, s: number) => {
      if (!gel || !isi) return;
      if (teks) {
        if (isi.textContent !== teks) isi.textContent = teks;
        gel.style.setProperty("--c", warna);
        gel.style.fontSize = ukuranGelembung(s);
        gel.style.display = "block";
      } else gel.style.display = "none";
    };

    const taruhOverlay = () => {
      const s = kameraRef.current.s;
      const { terpilihId: tId, terpilihPenghuniId: tpId } = terbaru.current;
      for (const b of sim.bots) {
        const el = tagRef.current.get(b.id);
        const pos = posisiRef.current.get(b.id);
        if (!el?.tag || !pos) continue;
        taruh(el.tag, pos.sx, pos.sy - ATAS_KEPALA, b.x + b.y);
        isiGelembung(el.gel, el.teks, tampilDi(b.x, b.y, tId === b.id) ? sim.teksTampil(b) : "", WARNA_TEMPAT[b.tempat], s);
      }
      const n = sim.nara;
      const elN = tagRef.current.get(ID_NARA2);
      const posN = posisiRef.current.get(ID_NARA2);
      if (elN?.tag && posN) {
        taruh(elN.tag, posN.sx, posN.sy - ATAS_KEPALA, n.x + n.y);
        isiGelembung(elN.gel, elN.teks, tampilDi(n.x, n.y, false) ? n.teksTampil() : "", WARNA_NARA, s);
      }
      for (const p of penghuni.penghuni) {
        const el = tagPenghuniRef.current.get(p.id);
        const pos = posisiPenghuniRef.current.get(p.id);
        if (!el?.tag || !pos) continue;
        taruh(el.tag, pos.sx, pos.sy - ATAS_KEPALA, p.x + p.y);
        el.tag.style.visibility = p.alfa > 0.05 ? "visible" : "hidden";
        el.tag.style.opacity = Math.max(0, Math.min(1, p.alfa)).toFixed(2);
        const teks = penghuni.teksChat(p.id) || tampilDi(p.x, p.y, tpId === p.id) ? penghuni.teksTampil(p, tpId) : "";
        isiGelembung(el.gel, el.teks, teks, p.warna, s);
      }
      LABEL_RUANG2.forEach((z, i) => {
        const el = zonaRef.current[i];
        if (!el) return;
        const p = keLayar(z.titik[0], z.titik[1]);
        const q = keWadah(p.x, p.y);
        el.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px) translate(-50%, -50%)`;
        el.style.visibility = "visible";
        const nampak = tanpaHoverRef.current || zonaKursorRef.current === z.kunci || s >= 1;
        el.style.opacity = nampak ? "1" : "0";
        el.style.pointerEvents = nampak ? "auto" : "none";
      });
    };

    /** Orang yang dipilih dari luar kanvas: begitu posisinya diketahui, kamera menyusul bila perlu. */
    const susulPilihan = (now: number) => {
      const ik = ikutiRef.current;
      if (!ik) return;
      const pos = ik.jenis === "bot" ? posisiRef.current.get(ik.id) : posisiPenghuniRef.current.get(ik.id);
      if (!pos) {
        if (now > ik.sampai) ikutiRef.current = null;
        return;
      }
      ikutiRef.current = null;
      const { w, h } = ukuranRef.current;
      const k = kameraAkhir();
      const kecil = k.s < 0.75;
      if (kecil || !terlihatDiKamera(k, pos.sx, pos.sy - 30, w, h, 0.12)) keOrang(pos, kecil ? Math.min(1, skalaOrang()) : k.s);
    };

    const langkah = (now: number) => {
      id = requestAnimationFrame(langkah);
      const dt = Math.min(DT_MAKS, Math.max(0, (now - terakhir) / 1000));
      terakhir = now;
      sim.maju(dt * terbaru.current.kecepatan, dt);
      penghuni.maju(dt);
      if (!terlihatRef.current || ukuranRef.current.w <= 0) return;
      const tujuan = tujuanRef.current;
      if (tujuan) {
        const l = dekatiKamera(kameraRef.current, tujuan, dt);
        kameraRef.current = l.kamera;
        if (l.selesai) tujuanRef.current = null;
        kotorRef.current = true;
      }
      if (gerakDikurangi && !kotorRef.current && now - akhirGambar < SELANG_GAMBAR_DIKURANGI) return;
      kotorRef.current = false;
      akhirGambar = now;
      const { w, h, dpr } = ukuranRef.current;
      const k = kameraRef.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0b0912";
      ctx.fillRect(0, 0, kanvas.width, kanvas.height);
      ctx.setTransform(k.s * dpr, 0, 0, k.s * dpr, (w / 2 - k.cx * k.s) * dpr, (h / 2 - k.cy * k.s) * dpr);
      const t = terbaru.current;
      gambarFrame2({
        c: ctx,
        aset,
        t: gerakDikurangi ? WAKTU_BEKU : now,
        sim,
        penghuni,
        konfigBot: t.konfigBot,
        konfigPenghuni: t.konfigAnggota,
        terpilihId: t.terpilihId,
        terpilihPenghuniId: t.terpilihPenghuniId,
        malam: t.malam,
        dinding: t.modeDinding,
        posisi: posisiRef.current,
        posisiPenghuni: posisiPenghuniRef.current,
        pandang: { x0: k.cx - w / 2 / k.s, y0: k.cy - h / 2 / k.s, x1: k.cx + w / 2 / k.s, y1: k.cy + h / 2 / k.s },
      });
      taruhOverlay();
      susulPilihan(now);
    };
    id = requestAnimationFrame(langkah);
    return () => cancelAnimationFrame(id);
  }, [jalan, aset, sim, penghuni, gerakDikurangi]);

  // ---------- masukan: seret, pinch, klik, hover ----------

  const penunjuk = useRef(new Map<number, { x: number; y: number }>());
  const seret = useRef<{ x: number; y: number; cx: number; cy: number; jauh: number; pinch?: { d: number; s: number } } | null>(null);

  const titikLatar = (e: { clientX: number; clientY: number }) => {
    const r = wadahRef.current!.getBoundingClientRect();
    const k = kameraRef.current;
    return { x: (e.clientX - r.left - r.width / 2) / k.s + k.cx, y: (e.clientY - r.top - r.height / 2) / k.s + k.cy };
  };

  /** Karakter di bawah titik latar (x, y). Kotak kena membesar saat kamera jauh supaya tetap mudah diketuk. */
  const cariDi = (x: number, y: number): Kena | null => {
    const f = Math.max(1, 0.6 / kameraRef.current.s);
    const jarak = (p: PosisiLayar2 | undefined) =>
      p && Math.abs(x - p.sx) < 14 * f && y < p.sy + 4 * f && y > p.sy - 62 * f ? Math.abs(x - p.sx) + Math.abs(y - (p.sy - 30)) * 0.5 : Infinity;
    if (jarak(posisiRef.current.get(ID_NARA2)) < Infinity) return { jenis: "nara" };
    let anggota: number | null = null;
    let dAnggota = Infinity;
    for (const p of penghuni.penghuni) {
      const d = p.alfa > 0.3 ? jarak(posisiPenghuniRef.current.get(p.id)) : Infinity;
      if (d < dAnggota) { dAnggota = d; anggota = p.id; }
    }
    if (anggota !== null) return { jenis: "anggota", id: anggota };
    let bot: string | null = null;
    let dBot = Infinity;
    for (const b of sim.bots) {
      const d = jarak(posisiRef.current.get(b.id));
      if (d < dBot) { dBot = d; bot = b.id; }
    }
    return bot !== null ? { jenis: "bot", id: bot } : null;
  };

  const pilihDi = (x: number, y: number) => {
    const t = terbaru.current;
    const kena = cariDi(x, y);
    klikKanvasRef.current = performance.now();
    if (kena?.jenis === "nara") { t.onPilihNara?.(); return; }
    if (kena?.jenis === "anggota") { t.onPilihPenghuni(t.terpilihPenghuniId === kena.id ? null : kena.id); return; }
    if (kena?.jenis === "bot") { t.onPilih(t.terpilihId === kena.id ? null : kena.id); return; }
    t.onPilih(null);
    t.onPilihPenghuni(null);
  };

  const turun = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button,[data-kendali]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    penunjuk.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const k = kameraRef.current;
    if (penunjuk.current.size === 2) {
      const [a, b] = [...penunjuk.current.values()];
      seret.current = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2, cx: k.cx, cy: k.cy, jauh: 99, pinch: { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), s: k.s } };
    } else seret.current = { x: e.clientX, y: e.clientY, cx: k.cx, cy: k.cy, jauh: 0 };
  };
  const gerak = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = titikLatar(e);
    const [gx, gy] = dariLayar(p.x, p.y);
    zonaKursorRef.current = zonaDari2(gx, gy);
    if (!penunjuk.current.has(e.pointerId)) {
      if (e.pointerType === "mouse" && kanvasRef.current) kanvasRef.current.style.cursor = cariDi(p.x, p.y) ? "pointer" : "";
      return;
    }
    penunjuk.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = seret.current;
    if (!s) return;
    const { w, h } = ukuranRef.current;
    if (s.pinch && penunjuk.current.size >= 2) {
      const [a, b] = [...penunjuk.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const r = wadahRef.current!.getBoundingClientRect();
      const sBaru = Math.min(ZOOM_MAKS2, Math.max(skalaPas(w, h), (s.pinch.s * d) / Math.max(1, s.pinch.d)));
      pasRef.current = false;
      geserLangsung(zoomDiJangkar(kameraRef.current, sBaru, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top, w, h));
      tampilkanZoom(kameraRef.current.s);
      return;
    }
    const sebelum = s.jauh;
    s.jauh = Math.max(s.jauh, Math.hypot(e.clientX - s.x, e.clientY - s.y));
    if (s.jauh < AMBANG_SERET) return;
    if (sebelum < AMBANG_SERET) {
      pasRef.current = false;
      setRuangAktif(null);
      tampilkanZoom(kameraRef.current.s);
    }
    const k = kameraRef.current;
    geserLangsung({ cx: s.cx - (e.clientX - s.x) / k.s, cy: s.cy - (e.clientY - s.y) / k.s, s: k.s });
  };
  const naik = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = seret.current;
    const klik = e.type === "pointerup" && penunjuk.current.size === 1 && s && !s.pinch && s.jauh < AMBANG_SERET;
    penunjuk.current.delete(e.pointerId);
    if (penunjuk.current.size === 0) seret.current = null;
    if (klik) {
      const p = titikLatar(e);
      pilihDi(p.x, p.y);
    }
  };

  const tombol = "btn-tekan pointer-events-auto flex h-9 min-w-9 items-center justify-center rounded-lg border border-white/15 bg-[rgba(14,11,20,.82)] px-2 text-[12px] font-bold text-[#f4efe8] hover:bg-[rgba(40,32,58,.95)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#fde68a]";

  return (
    <div
      ref={wadahRef}
      className={cn("relative h-[min(70vh,640px)] min-h-[360px] w-full touch-none select-none overflow-hidden rounded-xl bg-[#0b0912]", className)}
      onPointerDown={turun}
      onPointerMove={gerak}
      onPointerUp={naik}
      onPointerCancel={naik}
      onPointerLeave={() => { zonaKursorRef.current = null; }}
    >
      <canvas
        ref={kanvasRef}
        role="img"
        aria-label="Gedung Ruang Bot pixel art: ruang kerja, koordinator, meeting, aula, istirahat, database, alat, dan kotak post. Seret untuk menggeser, klik karakter untuk memilih."
        className={cn("absolute inset-0 block h-full w-full cursor-grab transition-opacity duration-300 active:cursor-grabbing", aset ? "opacity-100" : "opacity-0")}
        style={{ imageRendering: "pixelated" }}
      />
      {!aset && (
        <div role="status" className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold text-[#f4efe8]/80">
          {galat ? `Dunia gagal dimuat: ${galat}` : <span className="animate-pulse">Memuat gedung…</span>}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {[...bots.map((b) => ({ id: b.id, nama: b.nama, warna: b.warna })), { id: ID_NARA2, nama: sim.nara.nama, warna: WARNA_NARA }].map((b) => (
          <div
            key={b.id}
            ref={(el) => { const m = tagRef.current; m.set(b.id, { ...(m.get(b.id) ?? { gel: null, teks: null }), tag: el }); }}
            className="absolute left-0 top-0 flex flex-col items-center gap-[3px]"
            style={{ visibility: "hidden", "--c": b.warna } as CSSProperties}
          >
            <div
              ref={(el) => { const m = tagRef.current; m.set(b.id, { ...(m.get(b.id) ?? { tag: null, teks: null }), gel: el }); }}
              className="relative hidden rounded-md border-2 border-[var(--c)] bg-[#f6f0e2] px-[7px] py-[3px] font-mono font-bold leading-tight text-[#2a2118] shadow-[0_2px_0_rgba(0,0,0,.35)] after:absolute after:-bottom-[6px] after:left-1/2 after:-ml-1 after:border-4 after:border-transparent after:border-t-[var(--c)] after:content-['']"
            >
              <span ref={(el) => { const m = tagRef.current; m.set(b.id, { ...(m.get(b.id) ?? { tag: null, gel: null }), teks: el }); }} className="block max-w-[170px] truncate whitespace-nowrap sm:max-w-[260px]" />
            </div>
            <div className={cn("inline-flex items-center gap-1 rounded-full border bg-[rgba(14,11,20,.85)] py-px pl-[5px] pr-[7px] text-[10.5px] font-bold text-[#f4efe8]", terpilihId === b.id ? "border-[#fde68a]" : "border-white/10")}>
              <i className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--c)]" />
              {b.nama}
            </div>
          </div>
        ))}
        {daftarPenghuni.map((p) => (
          <div
            key={p.id}
            ref={(el) => { const m = tagPenghuniRef.current; m.set(p.id, { ...(m.get(p.id) ?? { gel: null, teks: null }), tag: el }); }}
            className="absolute left-0 top-0 flex flex-col items-center gap-[2px]"
            style={{ visibility: "hidden", "--c": "#94a3b8" } as CSSProperties}
          >
            <div
              ref={(el) => { const m = tagPenghuniRef.current; m.set(p.id, { ...(m.get(p.id) ?? { tag: null, teks: null }), gel: el }); }}
              className="relative hidden rounded-md border-2 border-[var(--c)] bg-[#f6f0e2] px-[6px] py-[2px] font-mono font-bold leading-tight text-[#2a2118] shadow-[0_2px_0_rgba(0,0,0,.35)] after:absolute after:-bottom-[6px] after:left-1/2 after:-ml-1 after:border-4 after:border-transparent after:border-t-[var(--c)] after:content-['']"
            >
              <span ref={(el) => { const m = tagPenghuniRef.current; m.set(p.id, { ...(m.get(p.id) ?? { tag: null, gel: null }), teks: el }); }} className="block max-w-[170px] truncate whitespace-nowrap sm:max-w-[300px]" />
            </div>
            <div className={cn("inline-flex items-center gap-1 rounded-full border bg-[rgba(14,11,20,.85)] py-px pl-[4px] pr-[6px] text-[9.5px] font-bold text-[#f4efe8]", terpilihPenghuniId === p.id ? "border-[#fde68a]" : sayaId === p.id ? "border-[#f87171]" : "border-white/10")}>
              <span className="max-w-[110px] truncate">{p.nama.split(" ")[0] || p.username}</span>
            </div>
          </div>
        ))}
        {LABEL_RUANG2.map((z, i) => {
          const buka = onBukaZona?.[z.kunci];
          const kelas = "absolute left-0 top-0 inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] border border-[var(--c)] bg-[rgba(14,11,20,.82)] px-[6px] py-[2px] font-mono text-[9.5px] font-bold leading-none tracking-[.5px] text-[#f4efe8] transition-opacity duration-150";
          const gaya = { visibility: "hidden", "--c": z.warna } as CSSProperties;
          return buka ? (
            <button key={z.kunci} type="button" ref={(el) => { zonaRef.current[i] = el; }} onClick={buka} aria-label={`Buka ${z.nama.toLowerCase()}`} className={cn(kelas, "pointer-events-auto cursor-pointer underline decoration-dotted underline-offset-2")} style={gaya}>
              <i className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--c)]" />
              {z.nama}
            </button>
          ) : (
            <div key={z.kunci} ref={(el) => { zonaRef.current[i] = el; }} className={kelas} style={gaya}>
              <i className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--c)]" />
              {z.nama}
            </div>
          );
        })}
      </div>

      {/* Pil status + chip lompat ruang (satu baris, bisa digulir di layar sempit) */}
      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-col items-start gap-1.5">
        {hud}
        <div data-kendali className="pointer-events-auto flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Lompat ke ruang">
          {RUANG2.map((r) => (
            <button
              key={r.kunci}
              type="button"
              onClick={() => keRuang(r.kunci)}
              aria-pressed={ruangAktif === r.kunci}
              className={cn(tombol, "h-7 shrink-0 px-2 text-[10.5px]", ruangAktif === r.kunci && "border-white/40 bg-[rgba(52,42,74,.95)]")}
              style={{ boxShadow: `inset 3px 0 0 ${r.warna}` }}
              aria-label={`Lihat ${r.nama.replace(" · ONLINE", "").toLowerCase()}`}
            >
              {r.nama.replace(/^RUANG /, "").replace(" · ONLINE", "")}
            </button>
          ))}
        </div>
      </div>
      <div data-kendali className="pointer-events-auto absolute bottom-2 left-2 flex items-center gap-0.5 rounded-lg border border-white/15 bg-[rgba(14,11,20,.82)] p-0.5" role="radiogroup" aria-label="Tampilan dinding ruang">
        <span className="px-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-[#f4efe8]/70 max-sm:hidden">Dinding</span>
        {(["rendah", "penuh"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={modeDinding === m}
            onClick={() => pilihDinding(m)}
            title={m === "rendah" ? "Dinding dalam dipotong rendah: isi semua ruang terlihat" : "Dinding dalam setinggi aslinya: ruang di belakang banyak tertutup"}
            className={cn(
              "btn-tekan h-8 rounded-md px-2.5 text-[11.5px] font-bold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#fde68a]",
              modeDinding === m ? "bg-[#f4efe8] text-[#1a1422]" : "text-[#f4efe8] hover:bg-white/10",
            )}
          >
            {m === "rendah" ? "Rendah" : "Penuh"}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1">
        {sayaId !== undefined && daftarPenghuni.some((p) => p.id === sayaId) && (
          <button type="button" onClick={keSaya} className={tombol} aria-label="Pusatkan kamera ke karakter saya">Saya</button>
        )}
        <button type="button" onClick={() => zoomBertahap(-1)} className={tombol} aria-label="Perkecil"><Minus size={15} /></button>
        <span className="pointer-events-none min-w-10 rounded-lg bg-[rgba(14,11,20,.82)] px-2 py-1.5 text-center font-mono text-[11px] font-bold tabular-nums text-[#f4efe8]" aria-live="polite">
          {zoomTampil === "pas" ? "Pas" : `${zoomTampil}×`}
        </span>
        <button type="button" onClick={() => zoomBertahap(1)} className={tombol} aria-label="Perbesar"><Plus size={15} /></button>
        <button type="button" onClick={aturPas} className={tombol} aria-label="Tampilkan seluruh gedung"><Maximize2 size={14} /></button>
      </div>
      {children}
    </div>
  );
}
