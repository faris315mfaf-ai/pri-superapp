"use client";

// ============================================================
// ProfilAnalisisPanel — "Tambahkan Sosmed yang Dianalisis" (1.17).
//
// 1 profil penyedia = 1 kumpulan sosmed. Menambah sosmed yang
// dianalisis = buat profil baru di sini, lalu tautkan akunnya lewat
// halaman penautan white-label (tab baru) — tanpa membuka dashboard
// Ayrshare. Analisis otomatis membaca SEMUA profil.
// ============================================================

import { useEffect, useState } from "react";
import { ExternalLink, Link2, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import {
  getProfilAnalisis,
  hapusProfilAnalisis,
  tambahProfilAnalisis,
  tautanProfilAnalisis,
  type ProfilAnalisis,
} from "@/services";

export function ProfilAnalisisPanel() {
  const [data, setData] = useState<{ penautan_siap: boolean; data: ProfilAnalisis[] } | null>(
    null,
  );
  const [muatUlang, setMuatUlang] = useState(0);
  const [judulBaru, setJudulBaru] = useState("");
  const [sedang, setSedang] = useState<string | null>(null);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<ProfilAnalisis | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getProfilAnalisis();
        if (hidup) setData({ penautan_siap: hasil.penautan_siap, data: hasil.data });
      } catch {
        if (hidup) setData({ penautan_siap: false, data: [] });
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  async function tambah() {
    const judul = judulBaru.trim();
    if (judul.length < 3 || sedang) return;
    setSedang("tambah");
    try {
      await tambahProfilAnalisis(judul);
      toast("sukses", "Profil dibuat", `Sekarang tautkan sosmed untuk "${judul}".`);
      setJudulBaru("");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal membuat profil", e instanceof Error ? e.message : "");
    } finally {
      setSedang(null);
    }
  }

  async function bukaTautan(p: ProfilAnalisis) {
    if (sedang) return;
    setSedang(p.id);
    try {
      const url = await tautanProfilAnalisis(p.id);
      window.open(url, "_blank", "noopener,noreferrer");
      toast(
        "info",
        "Halaman penautan dibuka",
        "Login sosmed di tab baru, lalu kembali & tekan segarkan.",
      );
    } catch (e) {
      toast("error", "Gagal membuat tautan", e instanceof Error ? e.message : "");
    } finally {
      setSedang(null);
    }
  }

  async function hapus(p: ProfilAnalisis) {
    if (sedang) return;
    setSedang(p.id);
    try {
      await hapusProfilAnalisis(p.id);
      toast("sukses", "Profil dihapus", "Akun tertautnya ikut dilepas.");
      setKonfirmasiHapus(null);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    } finally {
      setSedang(null);
    }
  }

  return (
    <>
      <div className="mt-6 flex items-center justify-between">
        <SectionTitle judul="Sosmed yang Dianalisis" className="!mt-0" />
        <button
          type="button"
          onClick={() => setMuatUlang((n) => n + 1)}
          aria-label="Segarkan daftar profil"
          className="btn-tekan p-1.5 text-teks-sekunder"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-teks-sekunder">
        Satu profil = satu kumpulan sosmed. Tambah profil untuk menganalisis
        akun lain (mis. dpp.pri), lalu tautkan sosmednya — analisis otomatis
        membaca semua profil.
      </p>

      {data !== null && !data.penautan_siap && (
        <div className="mb-2 rounded-xl border border-emas/40 bg-emas/10 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-teks-utama">
            <b>Penautan belum aktif:</b> unduh Private Key di dashboard Ayrshare
            (Account → API Key) lalu isi <code>AYRSHARE_PRIVATE_KEY</code> dan{" "}
            <code>AYRSHARE_DOMAIN</code> di pengaturan lingkungan. Membuat &
            menghapus profil tetap bisa.
          </p>
        </div>
      )}

      <GlassCard className="p-3">
        {/* Tambah profil */}
        <div className="flex gap-2">
          <input
            value={judulBaru}
            onChange={(e) => setJudulBaru(e.target.value.slice(0, 60))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void tambah();
            }}
            placeholder="Nama profil baru (mis. DPP PRI)…"
            aria-label="Nama profil baru"
            className="glass h-10 min-w-0 flex-1 rounded-xl px-3.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void tambah()}
            disabled={judulBaru.trim().length < 3 || sedang === "tambah"}
            className="btn-tekan flex items-center gap-1 rounded-xl px-3.5 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {sedang === "tambah" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Tambah
          </button>
        </div>

        {/* Daftar profil */}
        {data === null ? (
          <GlassSkeleton className="mt-2 h-16 rounded-xl" />
        ) : data.data.length === 0 ? (
          <p className="py-4 text-center text-[11.5px] text-teks-sekunder">
            Belum ada profil tambahan — analisis memakai profil utama TV Rakyat.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {data.data.map((p) => (
              <div key={p.id} className="glass-soft rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-teks-utama">
                    {p.judul}
                    {p.gagal && (
                      <span className="ml-1.5 text-[10px] font-semibold text-gagal">
                        gagal dibaca
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    disabled={sedang === p.id}
                    onClick={() => void bukaTautan(p)}
                    className="btn-tekan flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                  >
                    {sedang === p.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <Link2 className="h-3 w-3" aria-hidden="true" />
                    )}
                    Tautkan Sosmed
                  </button>
                  <button
                    type="button"
                    disabled={sedang === p.id}
                    onClick={() => setKonfirmasiHapus(p)}
                    aria-label={`Hapus profil ${p.judul}`}
                    className="btn-tekan p-1.5 text-teks-sekunder/70 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {p.akun.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.akun.map((a) => (
                      <span
                        key={`${a.platform}-${a.username}`}
                        className="glass flex items-center gap-1 rounded-full px-2 py-1"
                      >
                        <PlatformIcon platform={a.platform} size={12} />
                        <span className="text-[10.5px] font-semibold text-teks-utama">
                          @{a.username}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[10.5px] text-teks-sekunder">
                    Belum ada sosmed tertaut — tekan "Tautkan Sosmed".
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Konfirmasi hapus — melepas semua akun tertautnya */}
      {konfirmasiHapus && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center px-8"
          role="dialog"
          aria-modal="true"
          aria-label="Hapus profil analisis"
        >
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setKonfirmasiHapus(null)}
          />
          <div className="glass-strong relative w-full max-w-[320px] rounded-2xl p-5 text-center">
            <p className="text-sm font-bold text-teks-utama">
              Hapus profil "{konfirmasiHapus.judul}"?
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-teks-sekunder">
              Semua sosmed yang tertaut di profil ini ikut dilepas dan berhenti
              dianalisis.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setKonfirmasiHapus(null)}
                className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void hapus(konfirmasiHapus)}
                className="btn-tekan flex-1 rounded-xl py-2.5 text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
