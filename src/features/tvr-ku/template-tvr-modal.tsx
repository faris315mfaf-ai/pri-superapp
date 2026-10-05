"use client";

// ============================================================
// Editor template Edit Otomatis TVR Saya (30 Sep 2026).
//
// Bahan yang dipilih langsung diunggah ke DRAF di server; template yang
// berlaku belum berubah sampai "Simpan & Tetapkan" ditekan. Menutup tanpa
// menyimpan membuang draf itu. Letak tulisan digambar dengan menyeret di
// pratinjau (atau dideteksi otomatis), dan pratinjaunya digambar server
// dengan perender yang sama dengan pembuatan video.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ImagePlus, Loader2, ScanSearch, Trash2, Undo2, X } from "lucide-react";
import { toast } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";
import { bacaJson, pesanGalat } from "@/features/auto-edit/api";
import { useApiAutoEdit } from "@/features/auto-edit/tim";
import {
  INFO_SLOT,
  PILIHAN_RATA,
  URUTAN_SLOT,
  akhiranBerkas,
  tebakanBadge,
  type BatasTvr,
  type KeadaanTemplateTvr,
  type KotakTeks,
  type RataTeks,
  type SlotTvr,
} from "./edit-otomatis-tipe";

const LEBAR = 720;
const TINGGI = 1280;

export function TemplateTvrModal({
  awal,
  batas,
  onTutup,
  onTersimpan,
}: {
  awal: KeadaanTemplateTvr;
  batas: BatasTvr;
  onTutup: () => void;
  onTersimpan: (t: KeadaanTemplateTvr) => void;
}) {
  const api = useApiAutoEdit();
  const [tpl, setTpl] = useState<KeadaanTemplateTvr>(awal);
  const [kotak, setKotak] = useState<KotakTeks | null>(awal.text_box);
  const [warna, setWarna] = useState<"white" | "black">(awal.teks_warna);
  // Badge kategori & perataan: sama dengan editor template GODAM.
  const [badge, setBadge] = useState<KotakTeks | null>(awal.badge_box);
  // Kategori (teks badge) kini diisi PER VIDEO di langkah Buat Video, bukan di
  // template. Di sini hanya contoh supaya letak badge terlihat saat diatur.
  const KATEGORI_CONTOH = "NEWS";
  const [rata, setRata] = useState<RataTeks>(awal.rata);
  const [modeGambar, setModeGambar] = useState<"teks" | "kategori">("teks");
  const [kunciHijau, setKunciHijau] = useState(Boolean(awal.slot.boom.kunci_hijau));
  const [kosongkan, setKosongkan] = useState<Set<SlotTvr>>(() => new Set());
  const [unggah, setUnggah] = useState<{ slot: SlotTvr; persen: number } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [menutup, setMenutup] = useState(false);
  const [mendeteksi, setMendeteksi] = useState(false);
  const [pesan, setPesan] = useState("");
  const [versi, setVersi] = useState(0);
  const [gambar, setGambar] = useState<{ url: string; kunci: string } | null>(null);
  const [galatGambar, setGalatGambar] = useState("");
  const [seret, setSeret] = useState<KotakTeks | null>(null);
  const titikAwal = useRef<{ x: number; y: number } | null>(null);
  const pratinjauRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<Record<SlotTvr, HTMLInputElement | null>>({ kotak: null, boom: null, bingkai: null, penutup: null });

  const sibuk = unggah !== null || menyimpan || menutup;
  const adaDraf = URUTAN_SLOT.some((s) => tpl.slot[s].draf);
  const kotakKunci = kotak ? `${kotak.x},${kotak.y},${kotak.w},${kotak.h}` : "";
  const badgeKunci = badge ? `${badge.x},${badge.y},${badge.w},${badge.h}` : "";
  const kategoriBersih = KATEGORI_CONTOH;
  const kunciGambar = `${versi}|${kotakKunci}|${badgeKunci}|${kategoriBersih}|${rata}|${warna}`;
  const adaGambarLayer = tpl.slot.kotak.ada || tpl.slot.kotak.draf || tpl.slot.bingkai.ada || tpl.slot.bingkai.draf;

  // Pratinjau: diambil ulang (dengan jeda) setiap bahan/kotak/warna berubah.
  // Gambarnya butuh token, jadi diambil sebagai blob, bukan <img src> biasa.
  useEffect(() => {
    if (!adaGambarLayer) return;
    let hidup = true;
    let alamat = "";
    const t = window.setTimeout(async () => {
      try {
        const q = new URLSearchParams({ warna, rata, kategori: kategoriBersih });
        if (kotakKunci) q.set("kotak", kotakKunci);
        if (badgeKunci) q.set("badge", badgeKunci);
        const res = await api.fetch(`/api/tvr/template/pratinjau.png?${q.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Pratinjau gagal dimuat."));
        const blob = await res.blob();
        if (!hidup) return;
        alamat = URL.createObjectURL(blob);
        setGambar((lama) => {
          if (lama) URL.revokeObjectURL(lama.url);
          return { url: alamat, kunci: kunciGambar };
        });
        setGalatGambar("");
      } catch (e) {
        if (hidup) setGalatGambar(e instanceof Error ? e.message : "Pratinjau gagal dimuat.");
      }
    }, 250);
    return () => {
      hidup = false;
      window.clearTimeout(t);
    };
  }, [kunciGambar, kotakKunci, badgeKunci, kategoriBersih, rata, warna, adaGambarLayer]);

  // Blob pratinjau terakhir dilepas saat editor ditutup.
  const gambarRef = useRef(gambar);
  useEffect(() => {
    gambarRef.current = gambar;
  }, [gambar]);
  useEffect(() => () => {
    if (gambarRef.current) URL.revokeObjectURL(gambarRef.current.url);
  }, []);

  function bolehDipakai(slot: SlotTvr, file: File): string {
    const akhiran = akhiranBerkas(file.name);
    const jenis = batas.jenis_slot[slot] ?? [];
    if (!jenis.includes(akhiran)) {
      const daftar = jenis.map((j) => j.slice(1).toUpperCase()).join(", ");
      return `${INFO_SLOT[slot].judul} ${jenis.length === 1 ? "wajib" : "harus"} ${daftar}.`;
    }
    const maksMb = akhiran === ".gif" ? batas.maks_gif_mb : batas.maks_aset_mb;
    if (file.size > maksMb * 1024 * 1024) return `${INFO_SLOT[slot].judul} melebihi ${maksMb} MB.`;
    return "";
  }

  async function pilihBerkas(slot: SlotTvr, file: File | null) {
    const input = inputRef.current[slot];
    if (input) input.value = "";
    if (!file || sibuk) return;
    const salah = bolehDipakai(slot, file);
    if (salah) {
      setPesan(salah);
      return;
    }
    setPesan("");
    setUnggah({ slot, persen: 0 });
    try {
      const { ok, status, data } = await api.unggah(`/api/tvr/template/draf/${slot}`, file, (persen) =>
        setUnggah((u) => (u && u.slot === slot ? { ...u, persen } : u)),
      );
      if (!ok) throw new Error(pesanGalat(status, data, `${INFO_SLOT[slot].judul} gagal diunggah.`));
      const baru = data.template as KeadaanTemplateTvr;
      setTpl(baru);
      setKosongkan((k) => {
        const s = new Set(k);
        s.delete(slot);
        return s;
      });
      // Video tanpa transparansi hampir pasti green screen: hapus hijaunya.
      if (slot === "boom") setKunciHijau(baru.slot.boom.jenis === "video" && baru.slot.boom.alpha === false);
      setVersi((v) => v + 1);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Unggah gagal.");
    } finally {
      setUnggah(null);
    }
  }

  function aturKosong(slot: SlotTvr) {
    setKosongkan((k) => {
      const s = new Set(k);
      if (s.has(slot)) s.delete(slot);
      else s.add(slot);
      return s;
    });
  }

  // ===== Letak tulisan =====
  function titik(e: React.PointerEvent<HTMLDivElement>) {
    const r = pratinjauRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    const x = Math.round(((e.clientX - r.left) / r.width) * LEBAR);
    const y = Math.round(((e.clientY - r.top) / r.height) * TINGGI);
    return { x: Math.max(0, Math.min(LEBAR, x)), y: Math.max(0, Math.min(TINGGI, y)) };
  }
  function mulaiSeret(e: React.PointerEvent<HTMLDivElement>) {
    if (sibuk) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = titik(e);
    titikAwal.current = p;
    setSeret({ x: p.x, y: p.y, w: 0, h: 0 });
  }
  function gerakSeret(e: React.PointerEvent<HTMLDivElement>) {
    const a = titikAwal.current;
    if (!a) return;
    const p = titik(e);
    setSeret({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
  }
  function selesaiSeret() {
    const k = seret;
    titikAwal.current = null;
    setSeret(null);
    // Seretan kecil dianggap sentuhan tak sengaja.
    if (!k || k.w < 20 || k.h < 20) return;
    if (modeGambar === "kategori") setBadge(k);
    else setKotak(k);
  }

  async function deteksi() {
    setMendeteksi(true);
    setPesan("");
    try {
      const res = await api.fetch("/api/tvr/template/deteksi", { method: "POST" });
      const data = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, data, "Kotak tulisan tidak ditemukan."));
      setKotak(data.text_box as KotakTeks);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Kotak tulisan tidak ditemukan.");
    } finally {
      setMendeteksi(false);
    }
  }

  // ===== Simpan / tutup =====
  const efektif = (s: SlotTvr) => !kosongkan.has(s) && (tpl.slot[s].ada || tpl.slot[s].draf);
  const kurang: string[] = [];
  if (!efektif("kotak")) kurang.push("Kotak monas");
  if (!efektif("bingkai")) kurang.push("Bingkai teratas");
  if (!kotak) kurang.push("Posisi tulisan");
  const boomVideoTanpaAlpha =
    efektif("boom") && tpl.slot.boom.jenis === "video" && tpl.slot.boom.alpha === false;

  async function simpan() {
    if (sibuk || kurang.length > 0) return;
    setMenyimpan(true);
    setPesan("");
    try {
      const res = await api.fetch("/api/tvr/template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text_box: kotak,
          badge_box: badge,
          // Kategori dipindah ke langkah Buat Video; template tak menyimpannya lagi.
          kategori: "",
          rata,
          teks_warna: warna,
          kunci_hijau: boomVideoTanpaAlpha && kunciHijau,
          kosongkan: [...kosongkan].filter((s) => s === "boom" || s === "penutup"),
        }),
      });
      const data = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, data, "Template gagal disimpan."));
      toast("sukses", "Template tersimpan", "Template ditetapkan. Edit otomatis siap dipakai.");
      onTersimpan(data.template as KeadaanTemplateTvr);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Template gagal disimpan.");
      setMenyimpan(false);
    }
  }

  async function tutup() {
    if (sibuk) return;
    if (adaDraf) {
      setMenutup(true);
      // Draf yang tidak disimpan dibuang; gagal pun tidak menahan penutupan —
      // draf lama akan tertimpa unggahan berikutnya.
      await api.fetch("/api/tvr/template/draf", { method: "DELETE" }).catch(() => undefined);
    }
    onTutup();
  }

  function statusSlot(s: SlotTvr): { teks: string; kelas: string } {
    if (kosongkan.has(s)) return { teks: "Akan dikosongkan", kelas: "text-gagal" };
    if (tpl.slot[s].draf) return { teks: "Baru — belum disimpan", kelas: "text-amber-600 dark:text-amber-400" };
    if (tpl.slot[s].ada) return { teks: "Terpasang", kelas: "text-emerald-600 dark:text-emerald-400" };
    return { teks: "Belum ada", kelas: "text-teks-sekunder" };
  }

  const gaya = (k: KotakTeks) => ({
    left: `${(k.x / LEBAR) * 100}%`,
    top: `${(k.y / TINGGI) * 100}%`,
    width: `${(k.w / LEBAR) * 100}%`,
    height: `${(k.h / TINGGI) * 100}%`,
  });
  const tampilKotak = modeGambar === "teks" && seret ? seret : kotak;
  const badgeTebakan = !badge && !(modeGambar === "kategori" && seret);
  const tampilBadge = modeGambar === "kategori" && seret ? seret : (badge ?? tebakanBadge(kotak));

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Template Edit Otomatis">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => void tutup()} />
      <div className="glass relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <ImagePlus className="h-5 w-5 text-pri" aria-hidden="true" />
          <p className="font-heading text-[15px] font-extrabold text-teks-utama">
            {awal.siap ? "Edit Template" : "Buat Template"}
          </p>
          <button
            type="button"
            onClick={() => void tutup()}
            disabled={sibuk}
            aria-label="Tutup tanpa menyimpan"
            className="glass btn-tekan ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-teks-utama disabled:opacity-40"
          >
            {menutup ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </button>
        </div>

        <div className="scrollbar-tipis flex-1 overflow-y-auto px-4 pb-4">
          <p className="text-[11px] leading-relaxed text-teks-sekunder">
            Satu akun satu template. Bahan yang diganti menggantikan yang lama — tidak menumpuk.
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {URUTAN_SLOT.map((s) => {
              const st = statusSlot(s);
              const sedang = unggah?.slot === s;
              const bisaKosong = !INFO_SLOT[s].wajib && (tpl.slot[s].ada || tpl.slot[s].draf);
              return (
                <div key={s} className="glass-soft rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-teks-utama">
                        {INFO_SLOT[s].judul}
                        {INFO_SLOT[s].wajib && <span className="ml-1 text-gagal">*</span>}
                      </p>
                      <p className="mt-0.5 text-[10.5px] leading-snug text-teks-sekunder">{INFO_SLOT[s].keterangan}</p>
                      <p className={cn("mt-1 text-[11px] font-semibold", st.kelas)}>{st.teks}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <input
                        ref={(el) => {
                          inputRef.current[s] = el;
                        }}
                        type="file"
                        accept={(batas.jenis_slot[s] ?? []).join(",")}
                        className="hidden"
                        onChange={(e) => void pilihBerkas(s, e.target.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        onClick={() => inputRef.current[s]?.click()}
                        disabled={sibuk}
                        className="btn-tekan rounded-lg bg-pri/15 px-3 py-1.5 text-[11.5px] font-bold text-pri disabled:opacity-50"
                      >
                        {sedang ? `${unggah?.persen ?? 0}%` : tpl.slot[s].ada || tpl.slot[s].draf ? "Ganti" : "Pilih"}
                      </button>
                      {bisaKosong && (
                        <button
                          type="button"
                          onClick={() => aturKosong(s)}
                          disabled={sibuk}
                          className="btn-tekan flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold text-teks-sekunder disabled:opacity-50"
                        >
                          {kosongkan.has(s) ? <Undo2 className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                          {kosongkan.has(s) ? "Batal kosongkan" : "Kosongkan"}
                        </button>
                      )}
                    </div>
                  </div>
                  {sedang && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div className="h-full rounded-full bg-pri transition-[width]" style={{ width: `${unggah?.persen ?? 0}%` }} />
                    </div>
                  )}
                  {s === "boom" && boomVideoTanpaAlpha && (
                    <label className="mt-2 flex items-center gap-2 text-[11.5px] text-teks-utama">
                      <input
                        type="checkbox"
                        checked={kunciHijau}
                        onChange={(e) => setKunciHijau(e.target.checked)}
                        disabled={sibuk}
                        className="h-4 w-4 accent-red-600"
                      />
                      Latar hijau (green screen) — hapus warna hijaunya
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          {/* Letak tulisan */}
          <p className="mt-4 text-[13px] font-bold text-teks-utama">
            Posisi tulisan <span className="text-gagal">*</span>
          </p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-teks-sekunder">
            Pilih kotak yang mau diatur, lalu seret di gambar. Hijau = tulisan berita, oranye = kategori
            (putus-putus = tebakan otomatis).
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Kotak yang diatur">
            {(["teks", "kategori"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModeGambar(m)}
                disabled={sibuk}
                aria-pressed={modeGambar === m}
                className={cn(
                  "btn-tekan rounded-lg py-1.5 text-[11.5px] font-bold disabled:opacity-50",
                  modeGambar === m ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
                )}
              >
                {m === "teks" ? "Kotak tulisan" : "Kotak kategori"}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void deteksi()}
              disabled={sibuk || mendeteksi || !adaGambarLayer}
              className="glass btn-tekan flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-teks-utama disabled:opacity-50"
            >
              {mendeteksi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
              Deteksi otomatis
            </button>
            {modeGambar === "kategori" && badge && (
              <button
                type="button"
                onClick={() => setBadge(null)}
                disabled={sibuk}
                className="glass btn-tekan flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-teks-utama disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" /> Pakai tebakan
              </button>
            )}
            <div className="ml-auto flex overflow-hidden rounded-lg" role="group" aria-label="Warna tulisan">
              {(["black", "white"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWarna(w)}
                  disabled={sibuk}
                  aria-pressed={warna === w}
                  className={cn(
                    "btn-tekan px-3 py-1.5 text-[11.5px] font-bold disabled:opacity-50",
                    warna === w ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
                  )}
                >
                  {w === "black" ? "Tulisan hitam" : "Tulisan putih"}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
            Atur <b className="text-teks-utama">letak</b> badge kategori di sini (mode “Kotak kategori”). Teksnya
            (mis. NEWS) diisi nanti per video di langkah Buat Video.
          </p>
          <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label="Perataan tulisan berita">
            {PILIHAN_RATA.map((r) => (
              <button
                key={r.nilai}
                type="button"
                onClick={() => setRata(r.nilai)}
                disabled={sibuk}
                aria-pressed={rata === r.nilai}
                title={r.judul}
                className={cn(
                  "btn-tekan rounded-lg py-1.5 text-[10.5px] font-bold disabled:opacity-50",
                  rata === r.nilai ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
                )}
              >
                {r.judul.replace("Rata ", "")}
              </button>
            ))}
          </div>

          {adaGambarLayer ? (
            <div
              ref={pratinjauRef}
              className="relative mx-auto mt-3 aspect-[9/16] w-full max-w-[260px] touch-none overflow-hidden rounded-xl bg-neutral-900 select-none"
              onPointerDown={mulaiSeret}
              onPointerMove={gerakSeret}
              onPointerUp={selesaiSeret}
              onPointerCancel={selesaiSeret}
            >
              {gambar && (
                // Blob lokal ber-token: bukan untuk next/image.
                <img src={gambar.url} alt="Pratinjau template" draggable={false} className="h-full w-full object-contain" />
              )}
              {!gambar && !galatGambar && (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-white/70" />
                </div>
              )}
              {gambar && gambar.kunci !== kunciGambar && !seret && (
                <div className="absolute top-2 right-2 rounded-full bg-black/60 p-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                </div>
              )}
              {tampilKotak && (
                <div className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-400/15" style={gaya(tampilKotak)} />
              )}
              {tampilBadge && (
                <div
                  className={cn(
                    "pointer-events-none absolute border-2 border-amber-400 bg-amber-400/15",
                    badgeTebakan && "border-dashed",
                  )}
                  style={gaya(tampilBadge)}
                />
              )}
              {galatGambar && (
                <p className="absolute inset-x-2 bottom-2 rounded-lg bg-black/70 p-2 text-[10.5px] text-white">{galatGambar}</p>
              )}
            </div>
          ) : (
            <p className="glass-soft mt-3 rounded-xl p-3 text-[11.5px] text-teks-sekunder">
              Unggah kotak monas atau bingkai teratas dulu untuk melihat pratinjaunya.
            </p>
          )}

          {pesan && (
            <p className="mt-3 rounded-xl border border-gagal/30 bg-gagal/10 p-2.5 text-[11.5px] text-teks-utama" role="alert">
              {pesan}
            </p>
          )}
          {kurang.length > 0 && (
            <p className="mt-3 text-[11px] text-teks-sekunder">Belum lengkap: {kurang.join(", ")}.</p>
          )}
        </div>

        <div className="flex gap-2 border-t border-black/5 px-4 py-3 dark:border-white/10">
          <button
            type="button"
            onClick={() => void tutup()}
            disabled={sibuk}
            className="glass btn-tekan h-11 flex-1 rounded-xl text-[13px] font-bold text-teks-utama disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void simpan()}
            disabled={sibuk || kurang.length > 0}
            className="btn-tekan flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {menyimpan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Simpan &amp; Tetapkan
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
