"use client";

// ============================================================
// KelolaLaporanKpiScreen — KELOLA LAPORAN KPI VIDEO ANGGOTA (5 Sep 2026).
// Untuk admin HR, Pimpinan Redaksi TV Rakyat, master, super admin: pilih
// tanggal → daftar anggota + jumlah laporan → buka anggota → ubah link atau
// hapus. Tiap perubahan mengirim notifikasi ke anggota bersangkutan (server).
// ============================================================

import { useEffect, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Pencil, Search, Trash2, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, EmptyState, GlassSkeleton, ScreenHeader, ThemeToggle } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { getLaporanAnggota, getLaporanAnggotaDetail, hapusLaporanAnggota, ubahLaporanAnggota, type AnggotaLaporan, type LaporanAnggotaBaris } from "@/services";
import { jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

function tanggalWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
const PLATFORM = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"];

export function KelolaLaporanKpiScreen({ onKembali }: { onKembali: () => void }) {
  const [tanggal, setTanggal] = useState(tanggalWib);
  const [cari, setCari] = useState("");
  const [daftar, setDaftar] = useState<AnggotaLaporan[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pilih, setPilih] = useState<AnggotaLaporan | null>(null);
  const [laporan, setLaporan] = useState<LaporanAnggotaBaris[] | null>(null);
  const [edit, setEdit] = useState<{ id: string; url: string; platform: string } | null>(null);
  const [hapusId, setHapusId] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState("");
  const [versi, setVersi] = useState(0);

  useEffect(() => {
    let hidup = true;
    getLaporanAnggota(tanggal)
      .then((d) => {
        if (!hidup) return;
        setDaftar(d.daftar);
        setTotal(d.total);
      })
      .catch((e) => hidup && toast("error", "Gagal memuat", e instanceof Error ? e.message : ""));
    return () => {
      hidup = false;
    };
  }, [tanggal, versi]);

  useEffect(() => {
    if (!pilih) return;
    let hidup = true;
    getLaporanAnggotaDetail(tanggal, pilih.id)
      .then((d) => hidup && setLaporan(d.laporan))
      .catch((e) => hidup && toast("error", "Gagal memuat laporan", e instanceof Error ? e.message : ""));
    return () => {
      hidup = false;
    };
  }, [pilih, tanggal, versi]);

  async function simpanEdit() {
    if (!edit || sibuk) return;
    setSibuk(`edit:${edit.id}`);
    try {
      const b = await ubahLaporanAnggota(edit.id, edit.url.trim(), edit.platform);
      setLaporan((l) => (l ?? []).map((x) => (x.id === b.id ? b : x)));
      setEdit(null);
      toast("sukses", "Link diubah", "Anggota mendapat notifikasi perubahan.");
    } catch (e) {
      toast("error", "Gagal mengubah", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  async function hapus(id: string) {
    if (sibuk) return;
    setSibuk(`hapus:${id}`);
    try {
      await hapusLaporanAnggota(id, alasan);
      setLaporan((l) => (l ?? []).filter((x) => x.id !== id));
      setHapusId(null);
      setAlasan("");
      setVersi((v) => v + 1);
      toast("sukses", "Laporan dihapus", "Anggota mendapat notifikasi.");
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  const q = cari.trim().toLowerCase();
  const tampil = (daftar ?? []).filter((a) => !q || a.nama.toLowerCase().includes(q) || a.divisi.toLowerCase().includes(q)).sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama));

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <ScreenHeader judul="Kelola Laporan KPI" onKembali={pilih ? () => setPilih(null) : onKembali} kanan={<ThemeToggle />} />
      <p className="mb-3 text-[11.5px] text-teks-sekunder">Ubah atau hapus link laporan video anggota. Setiap perubahan memberi notifikasi ke orangnya.</p>
      <div className="flex gap-2">
        <input type="date" value={tanggal} max={tanggalWib()} onChange={(e) => e.target.value && setTanggal(e.target.value)} aria-label="Tanggal laporan" className="glass-input h-11 flex-1 rounded-xl px-3 text-sm text-teks-utama" />
        <span className="glass flex h-11 items-center rounded-xl px-3 text-[12px] font-bold text-teks-utama">{total} laporan</span>
      </div>

      {!pilih ? (
        <>
          <label className="glass-input mt-2 flex h-11 items-center gap-2 rounded-xl px-3">
            <Search className="h-4 w-4 text-teks-sekunder" aria-hidden="true" />
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama / divisi" aria-label="Cari anggota" className="min-w-0 flex-1 bg-transparent text-[13px] text-teks-utama outline-none" />
          </label>
          {daftar === null ? (
            <GlassSkeleton className="mt-3 h-40 rounded-2xl" />
          ) : tampil.length === 0 ? (
            <GlassCard className="mt-3 p-1">
              <EmptyState ikon={Search} judul="Tidak ada anggota" keterangan="Coba kata kunci lain." className="py-8" />
            </GlassCard>
          ) : (
            <div className="mt-3 flex flex-col gap-1.5">
              {tampil.map((a) => (
                <button key={a.id} type="button" onClick={() => setPilih(a)} className="glass-soft btn-tekan flex items-center gap-3 rounded-xl px-3 py-2 text-left">
                  {a.avatar_url ? <FotoBulat src={a.avatar_url} ukuran={36} alt={a.nama} /> : <AvatarInisial nama={a.nama} ukuran={36} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-teks-utama">{a.nama}</span>
                    <span className="block truncate text-[10.5px] text-teks-sekunder">{a.divisi || "—"}</span>
                  </span>
                  <span className={cn("rounded-full px-2.5 py-1 text-[11.5px] font-extrabold", a.jumlah > 0 ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-black/5 text-teks-sekunder dark:bg-white/10")}>{a.jumlah} video</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <GlassCard className="mt-3 flex items-center gap-3 p-3">
            <button type="button" onClick={() => setPilih(null)} aria-label="Kembali ke daftar anggota" className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-teks-utama">
              <ArrowLeft className="h-4 w-4" />
            </button>
            {pilih.avatar_url ? <FotoBulat src={pilih.avatar_url} ukuran={40} alt={pilih.nama} /> : <AvatarInisial nama={pilih.nama} ukuran={40} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold text-teks-utama">{pilih.nama}</p>
              <p className="text-[11px] text-teks-sekunder">{pilih.divisi || "—"} · {tanggal}</p>
            </div>
          </GlassCard>
          {laporan === null ? (
            <GlassSkeleton className="mt-3 h-32 rounded-2xl" />
          ) : laporan.length === 0 ? (
            <GlassCard className="mt-3 p-1">
              <EmptyState ikon={Pencil} judul="Belum ada laporan" keterangan="Anggota ini belum punya laporan video pada tanggal itu." className="py-8" />
            </GlassCard>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {laporan.map((b, i) => {
                const sedangEdit = edit?.id === b.id;
                const sedangHapus = hapusId === b.id;
                return (
                  <GlassCard key={b.id} className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pri/10 text-[11px] font-extrabold text-pri">{i + 1}</span>
                      <PlatformIcon platform={b.platform} size={16} />
                      <div className="min-w-0 flex-1">
                        {sedangEdit ? (
                          <div className="flex flex-col gap-1.5">
                            <select value={edit.platform} onChange={(e) => setEdit({ ...edit, platform: e.target.value })} aria-label="Platform" className="glass-input h-9 w-full rounded-lg px-2 text-[12px] text-teks-utama">
                              {PLATFORM.map((p) => (
                                <option key={p} value={p}>
                                  {labelPlatform(p)}
                                </option>
                              ))}
                            </select>
                            <input value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} aria-label="Link video" className="glass-input h-9 w-full rounded-lg px-2 text-[12px] text-teks-utama" />
                          </div>
                        ) : (
                          <>
                            <a href={b.url_video} target="_blank" rel="noopener noreferrer" className="block truncate text-[12.5px] font-bold text-teks-utama">
                              {b.url_video}
                            </a>
                            <p className="text-[10.5px] text-teks-sekunder">
                              {labelPlatform(b.platform)} · {b.sumber === "otomatis" ? "otomatis" : "manual"} · {jamWIB(b.dibuat_pada)}
                              {b.keyword ? ` · ${b.keyword}` : ""}
                            </p>
                          </>
                        )}
                      </div>
                      {sedangEdit ? (
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => void simpanEdit()} disabled={Boolean(sibuk)} aria-label="Simpan" className="btn-tekan flex h-9 w-9 items-center justify-center rounded-lg text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}>
                            <Check className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setEdit(null)} aria-label="Batal" className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-lg text-teks-utama">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 gap-1">
                          <a href={b.url_video} target="_blank" rel="noopener noreferrer" aria-label="Buka link" className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-lg text-teks-utama">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <button type="button" onClick={() => setEdit({ id: b.id, url: b.url_video, platform: b.platform })} aria-label="Ubah link" className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-lg text-teks-utama">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setHapusId(sedangHapus ? null : b.id)} aria-label="Hapus laporan" className="btn-tekan flex h-9 w-9 items-center justify-center rounded-lg bg-gagal/10 text-gagal">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    {sedangHapus ? (
                      <div className="mt-2 rounded-xl border border-gagal/30 bg-gagal/5 p-2.5">
                        <p className="text-[12px] font-bold text-teks-utama">Hapus laporan ini? Anggota akan diberi tahu.</p>
                        <input value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={200} placeholder="Alasan (opsional)" aria-label="Alasan penghapusan" className="glass-input mt-1.5 h-9 w-full rounded-lg px-2 text-[12px] text-teks-utama" />
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => setHapusId(null)} className="btn-tekan glass h-9 flex-1 rounded-lg text-[12px] font-bold text-teks-utama">
                            Batal
                          </button>
                          <button type="button" onClick={() => void hapus(b.id)} disabled={Boolean(sibuk)} className="btn-tekan h-9 flex-1 rounded-lg bg-gagal text-[12px] font-bold text-white disabled:opacity-50">
                            {sibuk === `hapus:${b.id}` ? "…" : "Ya, hapus"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </GlassCard>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
