"use client";

// ============================================================
// PengumumanScreen (fitur 1.22.x/1) — HR mengirim pengumuman/
// notifikasi ke SEMUA pengguna atau ke satu DIVISI, dengan opsi
// MENGECUALIKAN pengguna tertentu.
//
// Dibuka dari HR Center (tab qc) untuk orang HR (peran admin_hr /
// Divisi HR). Wewenang & penargetan tetap ditegakkan di server.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Megaphone, Search, Send, UserMinus, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import {
  getPengguna,
  getPengumuman,
  kirimPengumuman,
  type CakupanPengumuman,
  type PenggunaAdmin,
} from "@/services";
import { DIVISI } from "@/lib/struktur";
import type { User } from "@/types";
import { cn } from "@/lib/utils";

const LABEL_CAKUPAN: Record<CakupanPengumuman, string> = {
  semua: "Semua Pengguna",
  divisi: "Per Divisi",
  jabatan: "Per Jabatan",
  tim: "Tim Saya",
};

export function PengumumanScreen({
  user: _user,
  onKembali,
}: {
  user: User;
  onKembali: () => void;
}) {
  const [judul, setJudul] = useState("");
  const [isi, setIsi] = useState("");
  const [cakupanBoleh, setCakupanBoleh] = useState<CakupanPengumuman[]>([]);
  const [jabatanPilihan, setJabatanPilihan] = useState<readonly string[]>([]);
  const [cakupan, setCakupan] = useState<CakupanPengumuman>("semua");
  const [divisiTarget, setDivisiTarget] = useState("");
  const [jabatanTarget, setJabatanTarget] = useState("");

  const [roster, setRoster] = useState<PenggunaAdmin[] | null>(null);
  const [kecuali, setKecuali] = useState<Set<string>>(() => new Set());
  const [cariKecuali, setCariKecuali] = useState("");
  const [memuat, setMemuat] = useState(true);
  const [kirim, setKirim] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [p, r] = await Promise.all([getPengumuman(), getPengguna().catch(() => null)]);
        if (!hidup) return;
        setCakupanBoleh(p.cakupan_boleh);
        setJabatanPilihan(p.jabatan_pilihan);
        setCakupan((c) => (p.cakupan_boleh.includes(c) ? c : (p.cakupan_boleh[0] ?? "semua")));
        if (r) setRoster(r.data.filter((u) => u.role !== "master"));
      } catch (e) {
        if (hidup) toast("error", "Gagal memuat", e instanceof Error ? e.message : "");
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  const rosterCocok = useMemo(() => {
    if (!roster) return [];
    const q = cariKecuali.trim().toLowerCase();
    const dasar = q
      ? roster.filter(
          (u) => u.nama.toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q),
        )
      : roster;
    return dasar.slice(0, 40);
  }, [roster, cariKecuali]);

  function toggleKecuali(id: string) {
    setKecuali((lama) => {
      const baru = new Set(lama);
      if (baru.has(id)) baru.delete(id);
      else baru.add(id);
      return baru;
    });
  }

  const sah =
    judul.trim().length >= 3 &&
    isi.trim().length >= 3 &&
    (cakupan !== "divisi" || Boolean(divisiTarget)) &&
    (cakupan !== "jabatan" || Boolean(jabatanTarget));

  async function kirimSekarang() {
    if (!sah || kirim) return;
    setKirim(true);
    try {
      const jumlah = await kirimPengumuman({
        judul: judul.trim(),
        isi: isi.trim(),
        cakupan,
        divisi_target: cakupan === "divisi" ? divisiTarget : undefined,
        jabatan_target: cakupan === "jabatan" ? jabatanTarget : undefined,
        kecuali: Array.from(kecuali),
      });
      toast(
        "sukses",
        "Pengumuman terkirim",
        `Sampai ke ${jumlah} pengguna${kecuali.size > 0 ? ` (${kecuali.size} dikecualikan)` : ""}.`,
      );
      setJudul("");
      setIsi("");
      setKecuali(new Set());
    } catch (e) {
      toast("error", "Gagal mengirim", e instanceof Error ? e.message : "");
    } finally {
      setKirim(false);
    }
  }

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 items-center justify-center rounded-xl text-teks-utama"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </button>
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pri/10 text-pri">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-heading text-lg font-bold text-teks-utama">Kirim Pengumuman</h1>
            <p className="text-[11px] text-teks-sekunder">Ke semua atau satu divisi</p>
          </div>
        </div>
      </header>

      {/* Isi pengumuman */}
      <GlassCard className="mt-4 p-4">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-teks-sekunder">Judul</span>
          <input
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            maxLength={120}
            placeholder="Mis. Rapat koordinasi Sabtu"
            className="glass-input h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[11.5px] font-semibold text-teks-sekunder">Isi</span>
          <textarea
            value={isi}
            onChange={(e) => setIsi(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Tulis isi pengumuman…"
            className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-teks-utama"
          />
        </label>
      </GlassCard>

      {/* Kirim ke */}
      <GlassCard className="mt-3 p-4">
        <p className="text-sm font-bold text-teks-utama">Kirim ke</p>
        {memuat ? (
          <GlassSkeleton className="mt-2 h-10 rounded-xl" />
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {cakupanBoleh.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCakupan(c)}
                aria-pressed={cakupan === c}
                className={cn(
                  "btn-tekan rounded-full px-3.5 py-1.5 text-xs font-semibold",
                  cakupan === c ? "text-white" : "glass text-teks-sekunder",
                )}
                style={
                  cakupan === c
                    ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                    : undefined
                }
              >
                {LABEL_CAKUPAN[c]}
              </button>
            ))}
          </div>
        )}

        {cakupan === "divisi" && (
          <select
            value={divisiTarget}
            onChange={(e) => setDivisiTarget(e.target.value)}
            className="glass-input mt-3 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
          >
            <option value="">— Pilih divisi tujuan —</option>
            {DIVISI.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        {cakupan === "jabatan" && (
          <select
            value={jabatanTarget}
            onChange={(e) => setJabatanTarget(e.target.value)}
            className="glass-input mt-3 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
          >
            <option value="">— Pilih jabatan tujuan —</option>
            {jabatanPilihan.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        )}
      </GlassCard>

      {/* Kecualikan pengguna */}
      <GlassCard className="mt-3 p-4">
        <div className="flex items-center gap-2">
          <UserMinus className="h-4 w-4 text-teks-sekunder" aria-hidden="true" />
          <p className="text-sm font-bold text-teks-utama">Kecualikan (opsional)</p>
          {kecuali.size > 0 && (
            <span className="angka-tab rounded-full bg-pri/15 px-2 text-[11px] font-bold text-pri">
              {kecuali.size}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-teks-sekunder">
          Orang yang dipilih di sini TIDAK akan menerima pengumuman ini.
        </p>

        <div className="relative mt-2.5">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-teks-sekunder" />
          <input
            value={cariKecuali}
            onChange={(e) => setCariKecuali(e.target.value)}
            placeholder="Cari nama/username…"
            className="glass-input h-10 w-full rounded-xl pr-3 pl-9 text-sm text-teks-utama"
          />
        </div>

        {/* Chip yang sudah dipilih */}
        {kecuali.size > 0 && roster && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {roster
              .filter((u) => kecuali.has(u.id))
              .map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleKecuali(u.id)}
                  className="glass-soft btn-tekan inline-flex items-center gap-1 rounded-full py-1 pr-2 pl-1 text-[11px] font-semibold text-teks-utama"
                >
                  {u.avatar_url ? (
                    <FotoBulat src={u.avatar_url} ukuran={18} />
                  ) : (
                    <AvatarInisial nama={u.nama} ukuran={18} />
                  )}
                  {u.nama.split(" ")[0]}
                  <X className="h-3 w-3 text-teks-sekunder" aria-hidden="true" />
                </button>
              ))}
          </div>
        )}

        <div className="scrollbar-tipis mt-2.5 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {roster === null ? (
            <GlassSkeleton className="h-10 rounded-xl" />
          ) : rosterCocok.length === 0 ? (
            <p className="py-3 text-center text-[12px] text-teks-sekunder">Tak ada yang cocok.</p>
          ) : (
            rosterCocok.map((u) => {
              const dipilih = kecuali.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleKecuali(u.id)}
                  className={cn(
                    "btn-tekan flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left",
                    dipilih ? "bg-pri/10" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]",
                  )}
                >
                  {u.avatar_url ? (
                    <FotoBulat src={u.avatar_url} ukuran={30} />
                  ) : (
                    <AvatarInisial nama={u.nama} ukuran={30} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-teks-utama">
                      {u.nama}
                    </span>
                    <span className="block truncate text-[10.5px] text-teks-sekunder">
                      {u.divisi || u.jabatan || u.role}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      dipilih ? "border-pri bg-pri text-white" : "border-glass-border",
                    )}
                    aria-hidden="true"
                  >
                    {dipilih && <X className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </GlassCard>

      {/* Kirim */}
      <motion.button
        type="button"
        onClick={() => void kirimSekarang()}
        disabled={!sah || kirim}
        whileTap={{ scale: 0.98 }}
        className="btn-tekan mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-2xl font-heading text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, #DC2626, #B91C1C)",
          boxShadow: "0 10px 24px rgba(220, 38, 38, 0.35)",
          height: "3.25rem",
        }}
      >
        {kirim ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        Kirim Pengumuman
      </motion.button>
    </div>
  );
}
