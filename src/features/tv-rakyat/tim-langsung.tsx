"use client";

// ============================================================
// Tim Langsung — TV Rakyat Official sebagai MODUL BERSAMA (7 Okt 2026).
//
// • useTvLangsung: satu kanal Realtime `tv-official` (lib/tv-langsung) —
//   siaran "ada yang berubah" dari server + kehadiran (presence) anggota
//   yang sedang membuka modul. Setiap siaran → layar memuat ulang data
//   (stok, antrean, riwayat, lonceng) dan aktivitas/pesan baru muncul
//   sebagai notifikasi. Realtime putus → cadangan polling 20 detik.
// • IndikatorHadir: foto anggota yang sedang aktif di modul.
// • PanelTimLangsung: Obrolan Tim (grup chat Divisi TV Rakyat, sama dengan
//   modul Chat) + Aktivitas tim (siapa mengedit/mengirim/memposting).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Loader2, MessageCircle, Send, Wifi, WifiOff } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { kanalLangsung } from "@/lib/realtime-klien";
import { cn } from "@/lib/utils";
import { getTvLangsung, kirimObrolanTv, type PesanTimTv, type RuangTv } from "@/services";

const TOPIK = "tv-official";
const EVENT = "berubah";

export type StatusLangsung = "menyambung" | "tersambung" | "gagal";

export type TvLangsung = {
  ruang: RuangTv | null;
  hadir: string[];
  status: StatusLangsung;
  /** Pesan baru yang belum dilihat (tab Obrolan tidak sedang dibuka). */
  belumDibaca: number;
  setObrolanTerbuka: (buka: boolean) => void;
  kirim: (isi: string) => Promise<void>;
};

function waktuPendek(iso: string): string {
  const menit = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} mnt`;
  const jam = Math.round(menit / 60);
  if (jam < 24) return `${jam} jam`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
}

/**
 * Sambungan langsung modul TV Official. `onBerubah` dipanggil setiap ada
 * aksi anggota lain (pemanggil memuat ulang panel-panelnya).
 */
export function useTvLangsung({
  userId,
  aktif,
  onBerubah,
}: {
  userId: string;
  aktif: boolean;
  onBerubah: (jenis: string) => void;
}): TvLangsung {
  const [ruang, setRuang] = useState<RuangTv | null>(null);
  const [hadir, setHadir] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusLangsung>("menyambung");
  const [belumDibaca, setBelumDibaca] = useState(0);
  const obrolanTerbuka = useRef(false);
  const terakhir = useRef<{ aktivitas: number; pesan: number } | null>(null);
  const hadirRef = useRef<string[]>([]);
  const onBerubahRef = useRef(onBerubah);
  useEffect(() => {
    onBerubahRef.current = onBerubah;
  });

  const muat = useCallback(async () => {
    try {
      const r = await getTvLangsung({ hadir: hadirRef.current });
      setRuang(r);
      const maksA = r.aktivitas.reduce((m, a) => Math.max(m, a.id), 0);
      const maksP = r.pesan.reduce((m, p) => Math.max(m, p.id), 0);
      const lalu = terakhir.current;
      terakhir.current = { aktivitas: Math.max(maksA, lalu?.aktivitas ?? 0), pesan: Math.max(maksP, lalu?.pesan ?? 0) };
      if (!lalu) return; // muatan pertama: tanpa notifikasi
      const nama = (id: string) => r.orang[id]?.nama?.split(" ")[0] || "Anggota tim";
      for (const a of r.aktivitas.filter((x) => x.id > lalu.aktivitas && x.user_id !== r.saya).slice(0, 2)) {
        toast(a.gagal.length > 0 ? "peringatan" : "info", nama(a.user_id), a.ringkasan);
      }
      const pesanBaru = r.pesan.filter((p) => p.id > lalu.pesan && p.user_id !== r.saya);
      if (pesanBaru.length > 0 && (!obrolanTerbuka.current || document.visibilityState !== "visible")) {
        setBelumDibaca((n) => n + pesanBaru.length);
        const p = pesanBaru[pesanBaru.length - 1];
        toast("info", `💬 ${nama(p.user_id)}`, p.isi.slice(0, 140));
      }
    } catch {
      // jaringan sesaat — putaran berikut mencoba lagi
    }
  }, []);

  // Kanal Realtime: siaran + kehadiran.
  useEffect(() => {
    if (!aktif || !userId) return;
    let stop: (() => void) | null = null;
    let batal = false;
    let jedaMuat: ReturnType<typeof setTimeout> | null = null;
    void kanalLangsung(TOPIK, {
      event: EVENT,
      kunciHadir: userId,
      onPesan: (p) => {
        onBerubahRef.current(String(p.jenis ?? ""));
        // Catatan aktivitas ditulis sesaat setelah siaran — beri jeda kecil.
        if (jedaMuat) clearTimeout(jedaMuat);
        jedaMuat = setTimeout(() => void muat(), 900);
      },
      onHadir: (kunci) => {
        hadirRef.current = kunci;
        setHadir(kunci);
      },
      onStatus: (s) => {
        if (!batal) setStatus(s);
      },
    }).then((f) => {
      if (batal) f();
      else stop = f;
    });
    return () => {
      batal = true;
      if (jedaMuat) clearTimeout(jedaMuat);
      stop?.();
    };
  }, [aktif, userId, muat]);

  // Muatan awal + cadangan polling (20 dtk saat Realtime putus, 90 dtk saat tersambung).
  useEffect(() => {
    if (!aktif) return;
    void Promise.resolve().then(muat);
    const id = window.setInterval(
      () => {
        if (document.visibilityState !== "visible") return;
        if (status !== "tersambung") onBerubahRef.current("polling");
        void muat();
      },
      status === "tersambung" ? 90_000 : 20_000,
    );
    return () => window.clearInterval(id);
  }, [aktif, status, muat]);

  // Orang baru hadir yang namanya belum dikenal → muat ulang direktori.
  useEffect(() => {
    if (!ruang || hadir.every((id) => ruang.orang[id])) return;
    const t = setTimeout(() => void muat(), 300);
    return () => clearTimeout(t);
  }, [hadir, ruang, muat]);

  const kirim = useCallback(
    async (isi: string) => {
      await kirimObrolanTv(isi);
      await muat();
    },
    [muat],
  );

  const setObrolanTerbuka = useCallback((b: boolean) => {
    obrolanTerbuka.current = b;
    if (b) setBelumDibaca(0);
  }, []);

  return { ruang, hadir, status, belumDibaca, setObrolanTerbuka, kirim };
}

function Foto({ nama, url, ukuran = 28, className }: { nama: string; url?: string; ukuran?: number; className?: string }) {
  return url ? (
    <img src={url} alt={nama} title={nama} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: ukuran, height: ukuran }} />
  ) : (
    <span title={nama} className={cn("shrink-0 rounded-full", className)}>
      <AvatarInisial nama={nama || "?"} ukuran={ukuran} />
    </span>
  );
}

/** Deretan foto anggota tim yang sedang membuka modul. */
export function IndikatorHadir({ langsung }: { langsung: TvLangsung }) {
  const { hadir, ruang, status } = langsung;
  const orang = hadir.map((id) => ({ id, ...(ruang?.orang[id] ?? { nama: "", avatar_url: "" }) }));
  return (
    <div className="flex items-center gap-2" title={status === "tersambung" ? "Tersambung langsung" : "Menyambung ulang…"}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", status === "tersambung" ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]" : "bg-amber-500")} />
      <div className="flex -space-x-2">
        {orang.slice(0, 5).map((o) => (
          <Foto key={o.id} nama={o.nama} url={o.avatar_url} ukuran={26} className="ring-2 ring-white dark:ring-neutral-900" />
        ))}
      </div>
      <span className="text-[11.5px] font-semibold whitespace-nowrap text-teks-sekunder">
        {orang.length === 0
          ? "menghubungkan…"
          : `${orang.length > 5 ? `+${orang.length - 5} · ` : ""}${orang.length} aktif`}
      </span>
    </div>
  );
}

export function PanelTimLangsung({ langsung }: { langsung: TvLangsung }) {
  const [tab, setTab] = useState<"obrolan" | "aktivitas">("obrolan");
  const { ruang, status, belumDibaca, setObrolanTerbuka } = langsung;

  useEffect(() => {
    setObrolanTerbuka(tab === "obrolan");
    return () => setObrolanTerbuka(false);
  }, [tab, setObrolanTerbuka]);

  return (
    <GlassCard className="flex flex-col rounded-[24px] p-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-heading text-[16px] font-bold tracking-tight text-teks-utama">Tim Langsung</h2>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
            status === "tersambung" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
          )}
        >
          {status === "tersambung" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {status === "tersambung" ? "Langsung" : "Menyambung…"}
        </span>
      </div>
      <div className="mt-2.5">
        <IndikatorHadir langsung={langsung} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-teks-utama/[0.06] p-1">
        {(["obrolan", "aktivitas"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-colors",
              tab === t ? "bg-white text-teks-utama shadow-sm dark:bg-white/15" : "text-teks-sekunder",
            )}
          >
            {t === "obrolan" ? <MessageCircle className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
            {t === "obrolan" ? "Obrolan" : "Aktivitas"}
            {t === "obrolan" && belumDibaca > 0 && (
              <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{belumDibaca}</span>
            )}
          </button>
        ))}
      </div>

      {!ruang ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-teks-sekunder" />
        </div>
      ) : tab === "obrolan" ? (
        <Obrolan langsung={langsung} ruang={ruang} />
      ) : (
        <DaftarAktivitas ruang={ruang} />
      )}
    </GlassCard>
  );
}

function Obrolan({ langsung, ruang }: { langsung: TvLangsung; ruang: RuangTv }) {
  const [teks, setTeks] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [sementara, setSementara] = useState<PesanTimTv | null>(null);
  const gulirRef = useRef<HTMLDivElement>(null);
  const pesan = sementara ? [...ruang.pesan, sementara] : ruang.pesan;

  useEffect(() => {
    const el = gulirRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pesan.length]);

  async function kirim() {
    const isi = teks.trim();
    if (!isi || mengirim) return;
    setMengirim(true);
    setTeks("");
    // Tampil seketika (redup); diganti pesan asli begitu tersimpan.
    setSementara({ id: 0, user_id: ruang.saya, isi, gambar_url: null, waktu: new Date().toISOString() });
    try {
      await langsung.kirim(isi);
    } catch (e) {
      setTeks(isi);
      toast("error", "Pesan gagal dikirim", e instanceof Error ? e.message : "");
    } finally {
      setSementara(null);
      setMengirim(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      <div ref={gulirRef} className="flex max-h-[340px] min-h-[160px] flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
        {pesan.length === 0 ? (
          <p className="m-auto text-center text-[12.5px] text-teks-sekunder">Belum ada obrolan. Sapa tim di sini 👋</p>
        ) : (
          pesan.map((p) => {
            const milikSaya = p.user_id === ruang.saya;
            const o = ruang.orang[p.user_id];
            return (
              <div key={p.id || "sementara"} className={cn("flex items-end gap-2", milikSaya && "flex-row-reverse")}>
                {!milikSaya && <Foto nama={o?.nama ?? ""} url={o?.avatar_url} ukuran={24} />}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug",
                    milikSaya ? "rounded-br-md bg-pri text-white" : "rounded-bl-md bg-white/70 text-teks-utama dark:bg-white/10",
                    p.id === 0 && "opacity-60",
                  )}
                >
                  {!milikSaya && <p className="mb-0.5 text-[10.5px] font-bold opacity-70">{o?.nama?.split(" ")[0] ?? "Anggota"}</p>}
                  {p.gambar_url && <img src={p.gambar_url} alt="" className="mb-1 max-h-40 rounded-lg" />}
                  <p className="break-words whitespace-pre-wrap">{p.isi}</p>
                  <p className={cn("mt-0.5 text-right text-[9.5px]", milikSaya ? "text-white/70" : "text-teks-sekunder")}>{waktuPendek(p.waktu)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void kirim();
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={teks}
          onChange={(e) => setTeks(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void kirim();
            }
          }}
          rows={1}
          placeholder="Tulis pesan ke tim…"
          aria-label="Pesan untuk tim"
          className="glass-soft max-h-28 min-h-10 flex-1 resize-none rounded-xl px-3 py-2.5 text-[13px] text-teks-utama outline-none placeholder:text-teks-sekunder/60 focus:ring-2 focus:ring-pri/40"
        />
        <button
          type="submit"
          disabled={!teks.trim() || mengirim}
          aria-label="Kirim pesan"
          className="btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pri text-white disabled:opacity-50"
        >
          {mengirim ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

function DaftarAktivitas({ ruang }: { ruang: RuangTv }) {
  if (ruang.aktivitas.length === 0) {
    return <p className="mt-6 mb-4 text-center text-[12.5px] text-teks-sekunder">Belum ada aktivitas tim 7 hari terakhir.</p>;
  }
  return (
    <ul className="mt-3 flex max-h-[400px] flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
      {ruang.aktivitas.map((a) => {
        const o = ruang.orang[a.user_id];
        return (
          <li key={a.id} className="flex items-start gap-2.5 rounded-xl bg-white/45 p-2.5 dark:bg-white/[0.05]">
            <Foto nama={o?.nama ?? ""} url={o?.avatar_url} ukuran={28} />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] leading-snug text-teks-utama">
                <b>{o?.nama?.split(" ")[0] ?? "Anggota"}</b> {a.ringkasan.charAt(0).toLowerCase() + a.ringkasan.slice(1)}
              </p>
              {a.gagal.length > 0 && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  Gagal di {a.gagal.join(", ")}
                </p>
              )}
            </div>
            <span className="shrink-0 text-[10.5px] text-teks-sekunder">{waktuPendek(a.waktu)}</span>
          </li>
        );
      })}
    </ul>
  );
}
