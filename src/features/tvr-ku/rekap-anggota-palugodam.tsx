"use client";

// ============================================================
// RekapAnggotaPalugodam — Admin PALUGODAM merekap laporan PER ANGGOTA
// divisinya (6 Sep 2026): pilih anggota → Rangkuman Link Harian persis
// seperti yang dilihat anggota di akunnya sendiri (Generate → teks bisa
// diedit → Salin / Bagikan), plus daftar link hari itu yang bisa DITAMBAH,
// DIUBAH, atau DIHAPUS oleh admin (anggota mendapat notifikasi).
// Server: /api/tvr/rangkuman?user_id= dan /api/tvr/laporan-anggota
// (POST/PATCH/DELETE) — hanya untuk anggota Divisi PALUGODAM.
// ============================================================

import { useEffect, useState } from "react";
import { Check, ExternalLink, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { getKendaliAkun, getLaporanAnggotaDetail, hapusLaporanAnggota, tambahLaporanAnggota, ubahLaporanAnggota, type AnggotaKendali, type LaporanAnggotaBaris } from "@/services";
import { jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RangkumanLink } from "./rangkuman-link";

const PLATFORM = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter", "bilibili"];

function tanggalWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function Avatar({ a, ukuran }: { a: AnggotaKendali; ukuran: number }) {
  return a.avatar_url ? <FotoBulat src={a.avatar_url} ukuran={ukuran} alt={a.nama} /> : <AvatarInisial nama={a.nama} ukuran={ukuran} />;
}

/** Daftar link laporan seorang anggota pada satu tanggal + tambah/ubah/hapus. */
function DaftarLinkAnggota({ anggota }: { anggota: AnggotaKendali }) {
  const [tanggal, setTanggal] = useState(tanggalWib);
  const [laporan, setLaporan] = useState<LaporanAnggotaBaris[] | null>(null);
  // Tanggal yang datanya sudah dimuat — beda dari `tanggal` = sedang memuat (tanpa setState di effect).
  const [dimuatUntuk, setDimuatUntuk] = useState("");
  const [versi, setVersi] = useState(0);
  const [edit, setEdit] = useState<{ id: string; url: string; platform: string } | null>(null);
  const [tambah, setTambah] = useState<{ platform: string; url: string } | null>(null);
  const [sibuk, setSibuk] = useState("");

  useEffect(() => {
    let hidup = true;
    getLaporanAnggotaDetail(tanggal, anggota.id)
      .then((d) => {
        if (!hidup) return;
        setLaporan(d.laporan);
        setDimuatUntuk(tanggal);
      })
      .catch((e) => {
        if (!hidup) return;
        setLaporan([]);
        setDimuatUntuk(tanggal);
        toast("error", "Gagal memuat link", e instanceof Error ? e.message : "");
      });
    return () => {
      hidup = false;
    };
  }, [tanggal, anggota.id, versi]);

  async function simpanTambah() {
    if (!tambah || sibuk) return;
    setSibuk("tambah");
    try {
      await tambahLaporanAnggota({ user_id: anggota.id, platform: tambah.platform, url_video: tambah.url.trim(), tanggal });
      setTambah(null);
      setVersi((v) => v + 1);
      toast("sukses", "Link ditambahkan", `${anggota.nama} mendapat notifikasi.`);
    } catch (e) {
      toast("error", "Gagal menambah", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }
  async function simpanEdit() {
    if (!edit || sibuk) return;
    setSibuk(`edit:${edit.id}`);
    try {
      const b = await ubahLaporanAnggota(edit.id, edit.url.trim(), edit.platform);
      setLaporan((l) => (l ?? []).map((x) => (x.id === b.id ? b : x)));
      setEdit(null);
      toast("sukses", "Link diubah", `${anggota.nama} mendapat notifikasi.`);
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
      await hapusLaporanAnggota(id, "dihapus admin PALUGODAM");
      setLaporan((l) => (l ?? []).filter((x) => x.id !== id));
      toast("sukses", "Link dihapus", `${anggota.nama} mendapat notifikasi.`);
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  return (
    <GlassCard className="mt-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-bold text-teks-utama">Link video {anggota.nama.split(" ")[0]}</p>
        <div className="flex items-center gap-1.5">
          <input type="date" value={tanggal} max={tanggalWib()} onChange={(e) => e.target.value && setTanggal(e.target.value)} aria-label="Tanggal link" className="glass-input h-9 rounded-lg px-2 text-[12px] text-teks-utama" />
          <button type="button" onClick={() => setTambah(tambah ? null : { platform: "instagram", url: "" })} aria-label="Tambah link" className="btn-tekan flex h-9 items-center gap-1 rounded-lg px-2.5 text-[11.5px] font-bold text-white" style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Tambah
          </button>
        </div>
      </div>
      {tambah ? (
        <div className="mt-2 rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {PLATFORM.map((p) => (
              <button key={p} type="button" onClick={() => setTambah({ ...tambah, platform: p })} aria-pressed={tambah.platform === p} className={cn("flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold", tambah.platform === p ? "bg-pri text-white" : "glass text-teks-utama")}>
                <PlatformIcon platform={p} size={12} /> {labelPlatform(p)}
              </button>
            ))}
          </div>
          <input value={tambah.url} onChange={(e) => setTambah({ ...tambah, url: e.target.value })} placeholder="https://… link video anggota" aria-label="Link video baru" className="glass-input mt-2 h-10 w-full rounded-lg px-3 text-[12.5px] text-teks-utama" />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setTambah(null)} className="btn-tekan glass h-9 flex-1 rounded-lg text-[12px] font-bold text-teks-utama">Batal</button>
            <button type="button" onClick={() => void simpanTambah()} disabled={Boolean(sibuk) || tambah.url.trim().length < 8} className="btn-tekan h-9 flex-1 rounded-lg text-[12px] font-bold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}>
              {sibuk === "tambah" ? "…" : "Simpan link"}
            </button>
          </div>
        </div>
      ) : null}
      {laporan === null || dimuatUntuk !== tanggal ? (
        <GlassSkeleton className="mt-2 h-16 rounded-xl" />
      ) : laporan.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-teks-sekunder">Belum ada link tercatat pada tanggal ini.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {laporan.map((b, i) => {
            const sedangEdit = edit?.id === b.id;
            return (
              <div key={b.id} className="glass-soft flex items-center gap-2 rounded-xl px-2.5 py-2">
                <span className="angka-tab flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pri/10 text-[10.5px] font-extrabold text-pri">{i + 1}</span>
                <PlatformIcon platform={b.platform} size={14} />
                <div className="min-w-0 flex-1">
                  {sedangEdit ? (
                    <div className="flex flex-col gap-1">
                      <select value={edit.platform} onChange={(e) => setEdit({ ...edit, platform: e.target.value })} aria-label="Platform" className="glass-input h-8 w-full rounded-lg px-2 text-[11.5px] text-teks-utama">
                        {PLATFORM.map((p) => (
                          <option key={p} value={p}>{labelPlatform(p)}</option>
                        ))}
                      </select>
                      <input value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} aria-label="Link video" className="glass-input h-8 w-full rounded-lg px-2 text-[11.5px] text-teks-utama" />
                    </div>
                  ) : (
                    <>
                      <a href={b.url_video} target="_blank" rel="noopener noreferrer" className="block truncate text-[12px] font-semibold text-teks-utama">{b.url_video}</a>
                      <p className="text-[10px] text-teks-sekunder">{labelPlatform(b.platform)} · {b.sumber === "otomatis" ? "otomatis" : b.sumber === "admin" ? "ditambah admin" : "manual"} · {jamWIB(b.dibuat_pada)}</p>
                    </>
                  )}
                </div>
                {sedangEdit ? (
                  <>
                    <button type="button" onClick={() => void simpanEdit()} disabled={Boolean(sibuk)} aria-label="Simpan" className="btn-tekan flex h-8 w-8 items-center justify-center rounded-lg text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}><Check className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setEdit(null)} aria-label="Batal" className="glass btn-tekan flex h-8 w-8 items-center justify-center rounded-lg text-teks-utama"><X className="h-4 w-4" /></button>
                  </>
                ) : (
                  <>
                    <a href={b.url_video} target="_blank" rel="noopener noreferrer" aria-label="Buka link" className="btn-tekan p-1 text-teks-sekunder"><ExternalLink className="h-4 w-4" /></a>
                    <button type="button" onClick={() => setEdit({ id: b.id, url: b.url_video, platform: b.platform })} aria-label="Ubah link" className="btn-tekan p-1 text-teks-sekunder/80"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => void hapus(b.id)} disabled={Boolean(sibuk)} aria-label="Hapus link" className="btn-tekan p-1 text-gagal/80 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}

export function RekapAnggotaPalugodam() {
  const versiSegar = useVersiSegar();
  const [daftar, setDaftar] = useState<AnggotaKendali[] | null>(null);
  const [pilih, setPilih] = useState<AnggotaKendali | null>(null);

  useEffect(() => {
    let hidup = true;
    getKendaliAkun()
      .then((d) => hidup && setDaftar(d))
      .catch((e) => {
        if (!hidup) return;
        setDaftar([]);
        toast("error", "Daftar anggota PALUGODAM gagal dimuat", e instanceof Error ? e.message : "");
      });
    return () => {
      hidup = false;
    };
  }, [versiSegar]);

  return (
    <section>
      <SectionTitle judul="Rekap Laporan Anggota PALUGODAM" />
      <GlassCard className="mt-2.5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg, #7C3AED, #4F46E5)" }}>
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-teks-utama">Generate laporan per anggota</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-teks-sekunder">
              Pilih anggota → susun Rangkuman Link Harian persis seperti di akunnya (teks bisa diedit, lalu Salin / Bagikan), dan tambah, ubah, atau hapus link videonya. Anggota mendapat notifikasi setiap perubahan link.
            </p>
          </div>
        </div>
        {daftar === null ? (
          <GlassSkeleton className="mt-3 h-20 rounded-2xl" />
        ) : daftar.length === 0 ? (
          <p className="mt-3 text-center text-[11.5px] text-teks-sekunder">Belum ada anggota aktif di Divisi PALUGODAM.</p>
        ) : (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {daftar.map((a) => {
              const aktif = pilih?.id === a.id;
              return (
                <button key={a.id} type="button" onClick={() => setPilih(aktif ? null : a)} aria-pressed={aktif} aria-label={`Rekap ${a.nama}`} className="btn-tekan flex w-16 shrink-0 flex-col items-center gap-1">
                  <span className={cn("rounded-full p-[2px] transition-transform duration-200", aktif ? "scale-110 bg-[linear-gradient(135deg,#7C3AED,#4F46E5)]" : "bg-black/10 dark:bg-white/15")}>
                    <span className="block rounded-full bg-[var(--app-bg)] p-[2px]">
                      <Avatar a={a} ukuran={40} />
                    </span>
                  </span>
                  <span className={cn("w-full truncate text-center text-[9.5px] font-semibold leading-tight", aktif ? "text-pri" : "text-teks-utama")}>{a.nama.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
        )}
      </GlassCard>
      {pilih ? (
        <div className="mt-3">
          <RangkumanLink key={pilih.id} userId={pilih.id} judul={`Rangkuman ${pilih.nama.split(" ")[0]}`} />
          <DaftarLinkAnggota key={`link-${pilih.id}`} anggota={pilih} />
        </div>
      ) : null}
    </section>
  );
}
