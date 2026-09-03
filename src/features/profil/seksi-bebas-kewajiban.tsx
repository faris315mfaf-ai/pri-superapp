"use client";

// ============================================================
// SeksiBebasKewajiban (Panel Master, 3 Sep 2026) — cari nama anggota lalu
// SEMBUNYIKAN seluruh KPI, absensi, kepatuhan komentar, kewajiban upload
// video, dsb. dari orang itu (kolom app_user.sembunyi_kewajiban; dibaca
// klien lewat lib/jabatan.bebasKewajiban). Bisa dipulihkan kapan saja.
// ============================================================

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Search } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, SectionTitle } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import { cariKewajiban, setSembunyiKewajiban, type PenggunaKewajiban } from "@/services";

function BarisOrang({
  p,
  sibuk,
  onUbah,
}: {
  p: PenggunaKewajiban;
  sibuk: boolean;
  onUbah: (nilai: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
      {p.avatar_url ? <FotoBulat src={p.avatar_url} ukuran={32} /> : <AvatarInisial nama={p.nama} ukuran={32} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold text-teks-utama">{p.nama}</span>
        <span className="block truncate text-[10.5px] text-teks-sekunder">
          {p.username ? `@${p.username}` : "tanpa username"}
          {p.jabatan ? ` · ${p.jabatan}` : ""}
          {p.divisi ? ` · ${p.divisi}` : ""}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onUbah(!p.sembunyi)}
        disabled={sibuk}
        className="btn-tekan flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[10.5px] font-bold text-white disabled:opacity-50"
        style={{ background: p.sembunyi ? "linear-gradient(135deg, #10B981, #059669)" : "linear-gradient(135deg, #DC2626, #B91C1C)" }}
      >
        {sibuk ? <Loader2 className="h-3 w-3 animate-spin" /> : p.sembunyi ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        {p.sembunyi ? "Tampilkan lagi" : "Sembunyikan"}
      </button>
    </div>
  );
}

export function SeksiBebasKewajiban() {
  const [cari, setCari] = useState("");
  const [hasil, setHasil] = useState<PenggunaKewajiban[]>([]);
  const [dibebaskan, setDibebaskan] = useState<PenggunaKewajiban[] | null>(null);
  const [mencari, setMencari] = useState(false);
  const [sibuk, setSibuk] = useState("");

  // Pencarian ditunda 300 ms setelah ketikan terakhir.
  useEffect(() => {
    let hidup = true;
    const t = setTimeout(() => {
      setMencari(true);
      cariKewajiban(cari.trim())
        .then((d) => {
          if (!hidup) return;
          setHasil(d.hasil);
          setDibebaskan(d.dibebaskan);
        })
        .catch((e) => hidup && toast("error", "Gagal mencari", e instanceof Error ? e.message : ""))
        .finally(() => hidup && setMencari(false));
    }, 300);
    return () => {
      hidup = false;
      clearTimeout(t);
    };
  }, [cari]);

  async function ubah(p: PenggunaKewajiban, nilai: boolean) {
    if (sibuk) return;
    setSibuk(p.id);
    try {
      const baru = await setSembunyiKewajiban(p.id, nilai);
      toast(
        "sukses",
        nilai ? `${baru.nama} dibebaskan` : `${baru.nama} diaktifkan lagi`,
        nilai
          ? "KPI, absensi, kepatuhan komentar & kewajiban upload disembunyikan darinya."
          : "Semua kewajibannya tampil kembali.",
      );
      setHasil((s) => s.map((x) => (x.id === baru.id ? baru : x)));
      setDibebaskan((s) => {
        const tanpa = (s ?? []).filter((x) => x.id !== baru.id);
        return baru.sembunyi ? [...tanpa, baru].sort((a, b) => a.nama.localeCompare(b.nama)) : tanpa;
      });
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  return (
    <>
      <SectionTitle judul="Bebas Kewajiban" className="mt-6" />
      <GlassCard className="p-4">
        <p className="text-[11.5px] leading-relaxed text-teks-sekunder">
          Cari nama anggota, lalu <b>Sembunyikan</b>: seluruh KPI, absensi, kepatuhan komentar, kewajiban upload video,
          dan target harian tidak lagi ditampilkan kepada orang itu. Berlaku saat aplikasinya menyegarkan data akun
          (paling lama beberapa menit). Bisa dipulihkan kapan saja.
        </p>
        <div className="glass-input mt-3 flex h-10 items-center gap-2 rounded-xl px-3">
          {mencari ? <Loader2 className="h-4 w-4 animate-spin text-teks-sekunder" /> : <Search className="h-4 w-4 text-teks-sekunder" />}
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama atau username anggota…"
            className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-teks-utama outline-none"
          />
        </div>
        {cari.trim().length >= 2 ? (
          <div className="mt-2 flex flex-col gap-0.5">
            {hasil.length === 0 && !mencari ? (
              <p className="px-2 py-2 text-[11.5px] text-teks-sekunder">Tidak ada anggota aktif dengan nama itu.</p>
            ) : (
              hasil.map((p) => <BarisOrang key={p.id} p={p} sibuk={sibuk === p.id} onUbah={(v) => void ubah(p, v)} />)
            )}
          </div>
        ) : (
          <p className="mt-2 px-2 text-[11px] text-teks-sekunder">Ketik minimal 2 huruf untuk mencari.</p>
        )}

        <p className="mt-4 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
          Sedang dibebaskan ({dibebaskan?.length ?? 0})
        </p>
        <div className="mt-1 flex flex-col gap-0.5">
          {dibebaskan === null ? (
            <p className="px-2 py-2 text-[11.5px] text-teks-sekunder">Memuat…</p>
          ) : dibebaskan.length === 0 ? (
            <p className="px-2 py-2 text-[11.5px] text-teks-sekunder">Belum ada. Ketua Umum otomatis bebas kewajiban tanpa perlu didaftarkan di sini.</p>
          ) : (
            dibebaskan.map((p) => <BarisOrang key={p.id} p={p} sibuk={sibuk === p.id} onUbah={(v) => void ubah(p, v)} />)
          )}
        </div>
      </GlassCard>
    </>
  );
}
