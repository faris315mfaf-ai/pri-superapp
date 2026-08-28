"use client";

// ============================================================
// PanelTugasLink — modul distribusi tugas Pimpinan Redaksi.
//
// Pimred membagikan LINK (dari panel Berita hasil pindaian, atau
// link manual) ke anggota tertentu untuk dibuat video. Tugas
// menempel di profil anggota (muncul di TVR Saya miliknya), dan:
// - anggota WAJIB menautkan unggahan videonya ke tugas ini;
// - begitu videonya tayang di sosmed, status otomatis SELESAI dan
//   kewajiban anggota gugur (diurus /api/tv/unggah).
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList, ExternalLink, Link2, Loader2, Newspaper, Send, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import {
  batalkanTugasLink,
  beriTugasLink,
  getBeritaTerbaru,
  getKandidatTugasTv,
  getTugasLink,
  type KandidatTugasTv,
  type TugasLink,
} from "@/services";
import type { Berita } from "@/types";
import { tanggalIndonesia } from "@/lib/format";
import { cn } from "@/lib/utils";

const WARNA_STATUS: Record<string, { label: string; warna: "hijau" | "kuning" | "merah" | "netral" }> = {
  baru: { label: "baru", warna: "kuning" },
  dikerjakan: { label: "dikerjakan", warna: "kuning" },
  selesai: { label: "selesai", warna: "hijau" },
  batal: { label: "batal", warna: "netral" },
};

// Sumber tugas (fitur 1.22/bug 7): berita hasil scraping atau link
// yang diketik sendiri.
type SumberTugas = "berita" | "custom";

export function PanelTugasLink({ linkAwal }: { linkAwal?: string }) {
  const [daftar, setDaftar] = useState<TugasLink[] | null>(null);
  const [anggota, setAnggota] = useState<KandidatTugasTv[]>([]);
  const [berita, setBerita] = useState<Berita[]>([]);
  const [sumber, setSumber] = useState<SumberTugas>("berita");
  const [beritaId, setBeritaId] = useState("");
  const [url, setUrl] = useState("");
  const [judul, setJudul] = useState("");
  const [targetId, setTargetId] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [muatUlang, setMuatUlang] = useState(0);
  const [lihatSemua, setLihatSemua] = useState(false);

  // Link dari panel Berita (video yang baru dipindai) mengisi kolom URL
  // otomatis — pimred tinggal memilih anggotanya. Datangnya link manual
  // berarti pimred sedang memakai mode "Link Custom". Pola "sesuaikan
  // state saat prop berubah" dilakukan SAAT render, bukan lewat effect.
  const [linkSebelumnya, setLinkSebelumnya] = useState(linkAwal);
  if (linkAwal !== linkSebelumnya) {
    setLinkSebelumnya(linkAwal);
    if (linkAwal) {
      setUrl(linkAwal);
      setSumber("custom");
    }
  }

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [tugas, kandidat, brt] = await Promise.all([
          getTugasLink(),
          getKandidatTugasTv(),
          getBeritaTerbaru().catch(() => [] as Berita[]),
        ]);
        if (!hidup) return;
        setDaftar(tugas);
        setAnggota(kandidat);
        setBerita(brt);
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  // Saat memilih berita dari hasil scraping, link & judulnya otomatis
  // terisi dari data berita itu.
  function pilihBerita(id: string) {
    setBeritaId(id);
    const b = berita.find((x) => x.id === id);
    if (b) {
      setUrl(b.link_video);
      setJudul(b.judul.slice(0, 160));
    }
  }

  async function kirim() {
    if (mengirim) return;
    if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      toast("peringatan", "Link belum benar", "Awali dengan http(s)://");
      return;
    }
    if (!targetId) {
      toast("peringatan", "Pilih anggota penerimanya");
      return;
    }
    setMengirim(true);
    try {
      await beriTugasLink({
        url: url.trim(),
        judul: judul.trim() || undefined,
        untuk_user_id: targetId,
      });
      toast("sukses", "Tugas terkirim", "Anggota tersebut sudah diberi tahu.");
      setUrl("");
      setJudul("");
      setTargetId("");
      setBeritaId("");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal mengirim tugas", e instanceof Error ? e.message : "");
    } finally {
      setMengirim(false);
    }
  }

  async function batalkan(id: string) {
    try {
      await batalkanTugasLink(id);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal membatalkan", e instanceof Error ? e.message : "");
    }
  }

  const tampil = (daftar ?? []).filter(
    (t) => lihatSemua || t.status === "baru" || t.status === "dikerjakan",
  );

  return (
    <GlassCard className="mt-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4.5 w-4.5 text-pri" aria-hidden="true" />
          <p className="font-heading text-sm font-bold text-teks-utama">
            Tugas Link ke Anggota
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLihatSemua((v) => !v)}
          className="text-[11px] font-semibold text-teks-sekunder underline-offset-4 hover:underline"
        >
          {lihatSemua ? "Yang aktif saja" : "Semua riwayat"}
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-teks-sekunder">
        Tugaskan berita hasil scraping atau link video ke anggota{" "}
        <b>Divisi TV Rakyat</b> untuk dijadikan video. Selesai otomatis saat
        videonya tayang.
      </p>

      {/* Form beri tugas */}
      <div className="mt-3 flex flex-col gap-2">
        {/* Pemilih sumber tugas (fitur 1.22/bug 7): berita scraping vs
            link yang diketik sendiri. */}
        <div className="glass-soft flex gap-1 rounded-xl p-1">
          {(
            [
              { id: "berita" as const, label: "Dari Berita", ikon: Newspaper },
              { id: "custom" as const, label: "Link Custom", ikon: Link2 },
            ]
          ).map((s) => {
            const aktif = sumber === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSumber(s.id)}
                aria-pressed={aktif}
                className={cn(
                  "btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold",
                  aktif ? "text-white" : "text-teks-sekunder",
                )}
                style={aktif ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
              >
                <s.ikon className="h-3.5 w-3.5" aria-hidden="true" />
                {s.label}
              </button>
            );
          })}
        </div>

        {sumber === "berita" ? (
          <select
            value={beritaId}
            onChange={(e) => pilihBerita(e.target.value)}
            aria-label="Pilih berita hasil scraping"
            className="glass-soft h-11 w-full rounded-xl px-3 text-[13px] text-teks-utama outline-none focus:ring-2 focus:ring-pri/50"
          >
            <option value="">
              {berita.length === 0 ? "— Belum ada berita ter-scrape —" : "— Pilih berita —"}
            </option>
            {berita.map((b) => (
              <option key={b.id} value={b.id}>
                {b.judul.slice(0, 70)} · {b.sumber}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://link video/berita yang ditugaskan"
            aria-label="Link tugas"
            className="glass-soft h-11 w-full rounded-xl px-3.5 text-[13px] text-teks-utama outline-none placeholder:text-teks-sekunder/60 focus:ring-2 focus:ring-pri/50"
          />
        )}

        <div className="flex gap-2">
          <input
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            placeholder="Judul singkat (opsional)"
            aria-label="Judul tugas"
            maxLength={160}
            className="glass-soft h-11 min-w-0 flex-1 rounded-xl px-3.5 text-[13px] text-teks-utama outline-none placeholder:text-teks-sekunder/60 focus:ring-2 focus:ring-pri/50"
          />
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            aria-label="Anggota penerima"
            className="glass-soft h-11 w-40 rounded-xl px-2.5 text-[13px] text-teks-utama outline-none focus:ring-2 focus:ring-pri/50"
          >
            <option value="">
              {anggota.length === 0 ? "— Tak ada anggota —" : "— Anggota —"}
            </option>
            {anggota.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nama}
              </option>
            ))}
          </select>
        </div>
        {anggota.length === 0 && (
          <p className="text-[10.5px] leading-snug text-teks-sekunder">
            Belum ada anggota berdivisi Divisi TV Rakyat. Atur divisi anggota di
            HR Center dulu agar bisa ditugaskan.
          </p>
        )}
        <button
          type="button"
          onClick={() => void kirim()}
          disabled={mengirim}
          className="btn-tekan flex h-11 items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {mengirim ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          Bagikan Tugas
        </button>
      </div>

      {/* Daftar tugas */}
      <div className="mt-4 flex flex-col gap-2">
        {daftar === null ? (
          <GlassSkeleton className="h-16 rounded-xl" />
        ) : tampil.length === 0 ? (
          <EmptyState
            ikon={ClipboardList}
            judul={lihatSemua ? "Belum ada tugas" : "Tidak ada tugas aktif"}
            keterangan="Tugas yang Anda bagikan akan tampil di sini."
          />
        ) : (
          <AnimatePresence initial={false}>
            {tampil.map((t) => {
              const st = WARNA_STATUS[t.status] ?? WARNA_STATUS.baru;
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="glass-soft flex items-center gap-3 rounded-xl p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-teks-utama">
                      {t.judul || t.url}
                    </p>
                    <p className="mt-0.5 text-[11px] text-teks-sekunder">
                      Untuk <b>{t.nama_penerima}</b> ·{" "}
                      {tanggalIndonesia(t.dibuat_pada)}
                      {t.video_kode ? " · video tertaut" : ""}
                    </p>
                  </div>
                  <StatusBadge label={st.label} warna={st.warna} />
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Buka link tugas"
                    className="btn-tekan text-teks-sekunder"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  {(t.status === "baru" || t.status === "dikerjakan") && (
                    <button
                      type="button"
                      onClick={() => void batalkan(t.id)}
                      aria-label="Batalkan tugas"
                      className={cn("btn-tekan text-gagal")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </GlassCard>
  );
}
