"use client";

// ============================================================
// GaleriMomen — "Momen Terbaik PRI" (spek 4.3, ala profil ML).
//
// Maksimal 5 foto, tiap file dikompres otomatis di peramban sampai
// <=300KB. Saat galeri penuh dan menambah foto ke-6, PENGGUNA memilih
// foto lama yang diganti (bukan sistem menghapus yang tertua).
// Pengguna lain bisa like tiap foto (toggle, 1 like per orang).
// Dipakai di profil sendiri (bisa kelola) & profil orang (lihat+like).
// ============================================================

import { useRef, useState } from "react";
import { Heart, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-app-store";
import { kompresGambar } from "@/lib/gambar-kompres";
import { hapusFotoMomen, sukaFoto, unggahFotoMomen, type FotoMomen } from "@/services";
import { cn } from "@/lib/utils";

export function GaleriMomen({
  foto,
  milikSendiri,
  onBerubah,
}: {
  foto: FotoMomen[];
  milikSendiri: boolean;
  onBerubah: () => void;
}) {
  const [sedangUnggah, setSedangUnggah] = useState(false);
  const [pilihGanti, setPilihGanti] = useState<string | null>(null); // data URL menunggu pilihan
  const [fotoPenuh, setFotoPenuh] = useState<FotoMomen | null>(null);
  const [sedangSuka, setSedangSuka] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function pilihBerkas(file: File | null) {
    if (!file || sedangUnggah) return;
    setSedangUnggah(true);
    try {
      // Batas momen 300KB (spek 4.3) — beda dengan chat yang 100KB.
      const dataUrl = await kompresGambar(file, 300);
      if (foto.length >= 5) {
        // Galeri penuh: tampilkan pemilih foto yang diganti.
        setPilihGanti(dataUrl);
      } else {
        await unggahFotoMomen(dataUrl);
        toast("sukses", "Foto momen ditambahkan");
        onBerubah();
      }
    } catch (e) {
      toast("error", "Foto tidak bisa dipakai", e instanceof Error ? e.message : "");
    } finally {
      setSedangUnggah(false);
    }
  }

  async function gantiFoto(fotoLama: FotoMomen) {
    if (!pilihGanti) return;
    try {
      await unggahFotoMomen(pilihGanti, fotoLama.id);
      toast("sukses", "Foto momen diganti");
      setPilihGanti(null);
      onBerubah();
    } catch (e) {
      toast("error", "Gagal mengganti foto", e instanceof Error ? e.message : "");
    }
  }

  async function hapus(f: FotoMomen) {
    try {
      await hapusFotoMomen(f.id);
      toast("sukses", "Foto dihapus");
      setFotoPenuh(null);
      onBerubah();
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    }
  }

  async function toggleSuka(f: FotoMomen) {
    if (sedangSuka) return;
    setSedangSuka(f.id);
    try {
      await sukaFoto(f.id);
      onBerubah();
    } catch (e) {
      toast("error", "Gagal menyukai", e instanceof Error ? e.message : "");
    } finally {
      setSedangSuka(null);
    }
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {foto.map((f) => (
          <div key={f.id} className="relative">
            <button
              type="button"
              onClick={() => setFotoPenuh(f)}
              aria-label="Buka foto momen"
              className="btn-tekan block aspect-square w-full overflow-hidden rounded-xl"
            >
              <img
                src={f.url}
                alt="Momen Terbaik PRI"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
            {/* Like foto (spek 4.3): toggle, angka tampil publik */}
            <button
              type="button"
              disabled={sedangSuka === f.id}
              onClick={() => void toggleSuka(f)}
              aria-label={f.ku_suka ? "Batalkan suka" : "Sukai foto"}
              className="btn-tekan absolute right-1 bottom-1 flex items-center gap-0.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm"
            >
              <Heart
                className={cn("h-3 w-3", f.ku_suka && "text-red-400")}
                style={f.ku_suka ? { fill: "#f87171" } : undefined}
                aria-hidden="true"
              />
              {f.suka > 0 && <span className="angka-tab">{f.suka}</span>}
            </button>
          </div>
        ))}

        {/* Slot tambah (milik sendiri saja) */}
        {milikSendiri && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Pilih foto momen"
              onChange={(e) => {
                void pilihBerkas(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={sedangUnggah}
              onClick={() => inputRef.current?.click()}
              aria-label="Tambah foto momen"
              className="glass btn-tekan flex aspect-square items-center justify-center rounded-xl text-teks-sekunder disabled:opacity-60"
            >
              {sedangUnggah ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ImagePlus className="h-5 w-5" />
              )}
            </button>
          </>
        )}
      </div>
      {milikSendiri && (
        <p className="mt-1.5 text-[10.5px] text-teks-sekunder/80">
          Maksimal 5 foto · terkompresi otomatis sampai 300KB.
        </p>
      )}

      {/* Pemilih foto yang diganti saat galeri penuh (spek: user memilih) */}
      {pilihGanti && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center px-6"
          role="dialog"
          aria-modal="true"
          aria-label="Pilih foto yang diganti"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPilihGanti(null)}
          />
          <div className="glass-strong relative w-full max-w-[340px] rounded-2xl p-5">
            <p className="text-sm font-bold text-teks-utama">Galeri penuh (5 foto)</p>
            <p className="mt-1 text-[12px] leading-relaxed text-teks-sekunder">
              Ketuk foto lama yang ingin DIGANTI dengan foto barumu.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {foto.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => void gantiFoto(f)}
                  aria-label="Ganti foto ini"
                  className="btn-tekan aspect-square overflow-hidden rounded-xl border-2 border-transparent hover:border-pri"
                >
                  <img src={f.url} alt="Foto lama" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPilihGanti(null)}
              className="glass btn-tekan mt-4 w-full rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Lightbox foto penuh + aksi */}
      {fotoPenuh && (
        <div
          className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Foto momen ukuran penuh"
          onClick={() => setFotoPenuh(null)}
        >
          <button
            type="button"
            onClick={() => setFotoPenuh(null)}
            aria-label="Tutup foto"
            className="btn-tekan absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={fotoPenuh.url}
            alt="Momen Terbaik PRI"
            className="max-h-[80dvh] max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="mt-3 flex items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => void toggleSuka(fotoPenuh)}
              className="btn-tekan flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white"
            >
              <Heart
                className={cn("h-4 w-4", fotoPenuh.ku_suka && "text-red-400")}
                style={fotoPenuh.ku_suka ? { fill: "#f87171" } : undefined}
                aria-hidden="true"
              />
              {fotoPenuh.suka}
            </button>
            {milikSendiri && (
              <button
                type="button"
                onClick={() => void hapus(fotoPenuh)}
                className="btn-tekan flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-red-300"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Hapus
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
