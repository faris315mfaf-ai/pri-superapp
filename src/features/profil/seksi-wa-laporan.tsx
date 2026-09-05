"use client";

// ============================================================
// Panel Master → KIRIM LAPORAN KE WHATSAPP (5 Sep 2026): tujuan kiriman
// laporan video anggota. Grup WhatsApp hanya bisa lewat gateway Fonnte
// (WABA resmi/Convia tidak mendukung grup); Convia dipakai untuk kirim ke
// NOMOR (mis. nomor pribadi master) sebagai cadangan.
// ============================================================

import { useEffect, useState } from "react";
import { MessageCircle, Save } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { SectionTitle } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { aksiMaster } from "@/services";

export function SeksiWaLaporan({ pengaturan, sedangProses, onSelesai }: { pengaturan: Record<string, string>; sedangProses: boolean; onSelesai: () => void }) {
  const [grup, setGrup] = useState(pengaturan.wa_grup_laporan ?? "");
  const [nomor, setNomor] = useState(pengaturan.wa_nomor_laporan ?? "");
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setGrup(pengaturan.wa_grup_laporan ?? "");
      setNomor(pengaturan.wa_nomor_laporan ?? "");
    }, 0);
    return () => clearTimeout(t);
  }, [pengaturan.wa_grup_laporan, pengaturan.wa_nomor_laporan]);

  async function simpan() {
    if (sibuk) return;
    setSibuk(true);
    try {
      await aksiMaster("wa_laporan", { grup: grup.trim(), nomor: nomor.trim() });
      toast("sukses", "Tujuan WhatsApp disimpan");
      onSelesai();
    } catch (e) {
      toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  const berubah = grup.trim() !== (pengaturan.wa_grup_laporan ?? "") || nomor.trim() !== (pengaturan.wa_nomor_laporan ?? "");
  return (
    <div className="mt-6">
      <SectionTitle judul="Kirim Laporan ke WhatsApp" />
      <GlassCard className="mt-2.5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-teks-utama">Tujuan laporan video anggota</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-teks-sekunder">
              Tombol &quot;Kirim ke WA&quot; di TV Rakyat Saya mengirim daftar video hari ini lewat bot (maks 2× per orang per hari, jeda 1 jam). Ke GRUP hanya bisa lewat gateway Fonnte (isi ID grup, mis. 1203…@g.us). WhatsApp Business resmi (Convia) tidak mendukung grup — isi nomor sebagai tujuan/cadangan.
            </p>
          </div>
        </div>
        <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-teks-sekunder">ID grup WhatsApp (Fonnte)</label>
        <input value={grup} onChange={(e) => setGrup(e.target.value)} placeholder="1203630xxxxxxxx@g.us" aria-label="ID grup WhatsApp" className="glass-input mt-1 h-11 w-full rounded-xl px-3 text-[13px] text-teks-utama" />
        <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-teks-sekunder">Nomor tujuan (Convia)</label>
        <input value={nomor} onChange={(e) => setNomor(e.target.value)} placeholder="628xxxxxxxxxx" inputMode="tel" aria-label="Nomor WhatsApp tujuan" className="glass-input mt-1 h-11 w-full rounded-xl px-3 text-[13px] text-teks-utama" />
        <button type="button" onClick={() => void simpan()} disabled={sedangProses || sibuk || !berubah} className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}>
          <Save className="h-4 w-4" aria-hidden="true" /> {sibuk ? "Menyimpan…" : "Simpan tujuan"}
        </button>
      </GlassCard>
    </div>
  );
}
