"use client";

// ============================================================
// ModalPengaturanTv (12 Sep 2026) — pengaturan khusus TV Rakyat
// Official, dibuka lewat tombol gerigi di kepala modul.
//
// Isinya tiga pengaturan yang dulu tergeletak sebagai panel besar di
// tengah alur kerja: siaran otomatis ke ruang chat, kartu "Video Baru
// TV Rakyat" di modul Konten, dan batas unggahan. Ketiganya disetel
// sekali lalu ditinggalkan berbulan-bulan — memakan layar setiap hari
// untuk sesuatu yang jarang disentuh. Di balik gerigi, alur produksi
// jadi lapang tanpa satu pun pengaturan hilang.
//
// Panel "anggota yang ditunjuk" TIDAK ikut pindah ke sini: fitur itu
// dihapus. Penunjukan satu per satu justru menghalangi orang mengunggah,
// padahal yang diinginkan sebaliknya.
// ============================================================

import { useEffect, useState } from "react";
import { Loader2, Settings, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { SwitchKaca } from "@/features/profil/switch-kaca";
import { toast } from "@/hooks/use-app-store";
import {
  getKelolaTimTv,
  setAutoBroadcastTv,
  setPengaturanTv,
  setVideoBaruTampilTv,
} from "@/services";
import { cn } from "@/lib/utils";

export function ModalPengaturanTv({ onTutup }: { onTutup: () => void }) {
  const [siap, setSiap] = useState(false);
  const [siaran, setSiaran] = useState(true);
  const [sedangSiaran, setSedangSiaran] = useState(false);
  const [videoBaru, setVideoBaru] = useState(false);
  const [sedangVideoBaru, setSedangVideoBaru] = useState(false);
  const [batasMb, setBatasMb] = useState("100");
  const [retensiJam, setRetensiJam] = useState("24");
  const [sedangSimpanAngka, setSedangSimpanAngka] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getKelolaTimTv();
        if (!hidup) return;
        setSiaran(hasil.auto_broadcast);
        setVideoBaru(hasil.video_baru_tampil);
        setBatasMb(String(hasil.maks_upload_mb));
        setRetensiJam(String(hasil.retensi_jam));
        setSiap(true);
      } catch (e) {
        if (!hidup) return;
        setSiap(true);
        toast("error", "Gagal memuat pengaturan", e instanceof Error ? e.message : "");
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onTutup();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onTutup]);

  /** Satu tempat untuk kedua angka: aturannya sama, hanya batasnya beda. */
  function simpanAngka(kunci: "maks_upload" | "retensi", nilai: string, min: number, maks: number, satuan: string) {
    const n = Math.floor(Number(nilai));
    if (!Number.isFinite(n) || n < min || n > maks) {
      toast("peringatan", `Nilainya harus ${min}–${maks} ${satuan}`);
      return;
    }
    if (sedangSimpanAngka) return;
    setSedangSimpanAngka(true);
    void setPengaturanTv(kunci, n)
      .then(() => toast("sukses", `Tersimpan: ${n} ${satuan}`))
      .catch((e) => toast("error", "Gagal menyimpan", e instanceof Error ? e.message : ""))
      .finally(() => setSedangSimpanAngka(false));
  }

  return (
    <div
      className="fixed inset-0 z-[85] flex flex-col justify-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan TV Rakyat Official"
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={onTutup}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        className={cn(
          "glass-strong relative mx-auto flex max-h-[88dvh] w-full max-w-[520px] flex-col",
          "rounded-t-[2rem] px-5 pt-3 pb-7 sm:rounded-[2rem]",
        )}
      >
        <div className="mb-3 flex shrink-0 justify-center sm:hidden">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>

        <div className="mb-3 flex shrink-0 items-center gap-2">
          <Settings className="h-4.5 w-4.5 shrink-0 text-pri" aria-hidden="true" />
          <h2 className="min-w-0 flex-1 font-heading text-lg font-bold text-teks-utama">
            Pengaturan TV Rakyat Official
          </h2>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="glass btn-tekan flex h-8 w-8 items-center justify-center rounded-full text-teks-utama"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="scrollbar-tipis min-h-0 flex-1 overflow-y-auto pr-1">
          {!siap ? (
            <div className="flex items-center justify-center py-10 text-teks-sekunder">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
          ) : (
            <>
              <GlassCard className="mb-3 flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-teks-utama">
                    Kirim notifikasi upload video ke ruangan chat
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
                    Setiap video tayang, tautannya otomatis disiarkan ke grup chat
                    Divisi TV Rakyat atas nama TV Rakyat Official.
                  </p>
                </div>
                <SwitchKaca
                  aktif={siaran}
                  onUbah={() => {
                    if (sedangSiaran) return;
                    setSedangSiaran(true);
                    const baru = !siaran;
                    void setAutoBroadcastTv(baru)
                      .then(() => {
                        setSiaran(baru);
                        toast("sukses", baru ? "Siaran otomatis MENYALA" : "Siaran otomatis DIMATIKAN");
                      })
                      .catch((e) => toast("error", "Gagal menyimpan", e instanceof Error ? e.message : ""))
                      .finally(() => setSedangSiaran(false));
                  }}
                  labelAria="Siaran otomatis upload ke ruang chat"
                />
              </GlassCard>

              <GlassCard className="mb-3 flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-teks-utama">
                    Tampilkan &ldquo;Video Baru TV Rakyat&rdquo; di modul Konten
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
                    Bila MENYALA, kartu kewajiban komentar &amp; share video baru muncul di
                    modul Konten semua anggota. Bawaan tersembunyi.
                  </p>
                </div>
                <SwitchKaca
                  aktif={videoBaru}
                  onUbah={() => {
                    if (sedangVideoBaru) return;
                    setSedangVideoBaru(true);
                    const baru = !videoBaru;
                    void setVideoBaruTampilTv(baru)
                      .then(() => {
                        setVideoBaru(baru);
                        toast(
                          "sukses",
                          baru ? "Video Baru DITAMPILKAN" : "Video Baru DISEMBUNYIKAN",
                          baru
                            ? "Kartunya kini muncul di modul Konten semua anggota."
                            : "Kartunya kini tersembunyi dari modul Konten.",
                        );
                      })
                      .catch((e) => toast("error", "Gagal menyimpan", e instanceof Error ? e.message : ""))
                      .finally(() => setSedangVideoBaru(false));
                  }}
                  labelAria="Tampilkan video baru TV Rakyat di modul Konten"
                />
              </GlassCard>

              <GlassCard className="mb-1 p-4">
                <p className="text-sm font-bold text-teks-utama">Pengaturan Unggahan</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-teks-sekunder">
                      Ukuran video maksimal (1–200 MB)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={batasMb}
                      onChange={(e) => setBatasMb(e.target.value)}
                      onBlur={() => simpanAngka("maks_upload", batasMb, 1, 200, "MB")}
                      aria-label="Ukuran video maksimal dalam MB"
                      className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-teks-sekunder">
                      Video tampil di aplikasi selama (1–24 jam)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={retensiJam}
                      onChange={(e) => setRetensiJam(e.target.value)}
                      onBlur={() => simpanAngka("retensi", retensiJam, 1, 24, "jam")}
                      aria-label="Umur tayang video dalam jam"
                      className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] leading-snug text-teks-sekunder">
                  Lewat umur tayang, video hilang dari Konten &amp; Beranda dan berkasnya
                  dibersihkan dari penyimpanan. Postingan yang sudah naik di sosmed
                  tidak disentuh; riwayat &amp; statistik tetap utuh.
                </p>
              </GlassCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
