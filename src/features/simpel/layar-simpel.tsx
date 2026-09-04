"use client";

// ============================================================
// Layar-layar RINGAN Mode Simpel (4 Sep 2026): kepala layar, pengumuman,
// leaderboard kepatuhan komen, komen video (postingan wajib + embed),
// dan pengaturan. Sengaja tanpa framer-motion & tanpa kaca buram —
// hanya useState/useEffect + Tailwind, mengincar akselerasi.
// ============================================================

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Crown, ExternalLink, KeyRound, LogOut, Megaphone, MessageCircle, Moon, Play, RefreshCw, Sun, X } from "lucide-react";
import { AvatarInisial } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { ModalGantiSandi } from "@/features/profil/pengaturan-akun";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { urlEmbedDari } from "@/lib/embed-sosmed";
import { waktuJelasWIB } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getKepatuhanKomenLeaderboard,
  getPengumuman,
  getWajibKomen,
  keluar as keluarService,
  type KepatuhanKomenLeaderboard,
  type Pengumuman,
  type WajibKomenItem,
} from "@/services";

/** Warna biru tombol Mode Simpel (mengikuti mockup). */
export const BIRU_SIMPEL = "#1E4E8C";

// ------------------------------------------------------------
// Kepala layar: tombol kembali + judul (+ aksi kanan opsional)
// ------------------------------------------------------------
export function KepalaSimpel({
  judul,
  onKembali,
  kanan,
}: {
  judul: string;
  onKembali: () => void;
  kanan?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 bg-white/95 px-3 py-2.5 dark:bg-slate-950/95">
      <button
        type="button"
        onClick={onKembali}
        aria-label="Kembali ke menu Mode Simpel"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-900 active:opacity-70 dark:bg-slate-800 dark:text-white"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-base font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">{judul}</h1>
      {kanan}
    </header>
  );
}

function TombolSegar({ onClick, sibuk }: { onClick: () => void; sibuk: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={sibuk}
      aria-label="Muat ulang"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-900 disabled:opacity-50 dark:bg-slate-800 dark:text-white"
    >
      <RefreshCw className={cn("h-4.5 w-4.5", sibuk && "animate-spin")} aria-hidden="true" />
    </button>
  );
}

function Kosong({ teks }: { teks: string }) {
  return <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">{teks}</p>;
}

function Memuat() {
  return (
    <div className="flex flex-col gap-2 px-3 pt-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// PENGUMUMAN (ikon toa)
// ------------------------------------------------------------
export function PengumumanSimpel({ onKembali }: { onKembali: () => void }) {
  const [daftar, setDaftar] = useState<Pengumuman[] | null>(null);
  const [versi, setVersi] = useState(0);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    getPengumuman()
      .then((r) => hidup && setDaftar(r.data))
      .catch((e) => {
        if (!hidup) return;
        setDaftar([]);
        toast("error", "Pengumuman gagal dimuat", e instanceof Error ? e.message : "");
      })
      .finally(() => hidup && setSibuk(false));
    return () => {
      hidup = false;
    };
  }, [versi]);

  return (
    <div className="mode-simpel-layar">
      <KepalaSimpel
        judul="Pengumuman"
        onKembali={onKembali}
        kanan={
          <TombolSegar
            sibuk={sibuk}
            onClick={() => {
              setSibuk(true);
              setVersi((v) => v + 1);
            }}
          />
        }
      />
      {daftar === null ? (
        <Memuat />
      ) : daftar.length === 0 ? (
        <Kosong teks="Belum ada pengumuman untuk Anda." />
      ) : (
        <div className="flex flex-col gap-2 px-3 pb-8 pt-3">
          {daftar.map((p) => (
            <article key={p.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: BIRU_SIMPEL }} aria-hidden="true">
                  <Megaphone className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold leading-snug text-slate-900 dark:text-white">{p.judul}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {p.pengirim_nama} · {waktuJelasWIB(p.dibuat_pada)}
                  </p>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">{p.isi}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// LEADERBOARD kepatuhan komen (ikon mahkota)
// ------------------------------------------------------------
const PLATFORM_LB = ["", "instagram", "tiktok", "twitter", "threads", "youtube"] as const;

export function LeaderboardSimpel({ onKembali, namaSaya }: { onKembali: () => void; namaSaya: string }) {
  const [data, setData] = useState<KepatuhanKomenLeaderboard | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [versi, setVersi] = useState(0);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    getKepatuhanKomenLeaderboard(platform)
      .then((r) => hidup && setData(r))
      .catch((e) => {
        if (!hidup) return;
        setData({ periode: "", daftar: [] } as unknown as KepatuhanKomenLeaderboard);
        toast("error", "Leaderboard gagal dimuat", e instanceof Error ? e.message : "");
      })
      .finally(() => hidup && setSibuk(false));
    return () => {
      hidup = false;
    };
  }, [platform, versi]);

  const daftar = data?.daftar ?? [];
  return (
    <div className="mode-simpel-layar">
      <KepalaSimpel
        judul="Leaderboard Komen"
        onKembali={onKembali}
        kanan={
          <TombolSegar
            sibuk={sibuk}
            onClick={() => {
              setSibuk(true);
              setVersi((v) => v + 1);
            }}
          />
        }
      />
      <div className="tanpa-scrollbar flex gap-1.5 overflow-x-auto px-3 pt-2">
        {PLATFORM_LB.map((p) => (
          <button
            key={p || "semua"}
            type="button"
            onClick={() => {
              setData(null);
              setPlatform(p);
            }}
            aria-pressed={platform === p}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
              platform === p ? "text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
            )}
            style={platform === p ? { background: BIRU_SIMPEL } : undefined}
          >
            {p ? <PlatformIcon platform={p} size={12} /> : null}
            {p ? labelPlatform(p) : "Semua"}
          </button>
        ))}
      </div>
      {data?.periode ? <p className="px-3 pt-2 text-[11px] text-slate-500 dark:text-slate-400">Periode {data.periode}</p> : null}
      {data === null ? (
        <Memuat />
      ) : daftar.length === 0 ? (
        <Kosong teks="Belum ada data kepatuhan komen di periode ini." />
      ) : (
        <ol className="flex flex-col gap-1.5 px-3 pb-8 pt-2">
          {daftar.map((o, i) => {
            const saya = o.nama === namaSaya;
            return (
              <li
                key={`${o.nama}-${i}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-2.5 py-2",
                  saya ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold",
                    i < 3 ? "text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
                  )}
                  style={i < 3 ? { background: i === 0 ? "#F59E0B" : i === 1 ? "#9CA3AF" : "#B45309" } : undefined}
                >
                  {i < 3 ? <Crown className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                </span>
                {o.avatar_url ? <FotoBulat src={o.avatar_url} ukuran={32} alt={o.nama} /> : <AvatarInisial nama={o.nama} ukuran={32} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-slate-900 dark:text-white">
                    {o.nama}
                    {saya ? " (Anda)" : ""}
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    {o.sudah}/{o.total} postingan dikomentari
                  </span>
                </span>
                <span className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-extrabold text-white" style={{ background: o.persen >= 100 ? "#16A34A" : o.persen >= 50 ? BIRU_SIMPEL : "#DC2626" }}>
                  {o.persen}%
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// KOMEN VIDEO: postingan TV Rakyat yang wajib dikomentari + embed + status
// ------------------------------------------------------------
export function KomenVideoSimpel({ onKembali }: { onKembali: () => void }) {
  const [data, setData] = useState<WajibKomenItem[] | null>(null);
  const [periode, setPeriode] = useState("");
  const [dimuat, setDimuat] = useState<Set<string>>(() => new Set());
  const [versi, setVersi] = useState(0);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    getWajibKomen()
      .then((r) => {
        if (!hidup) return;
        // Terbaru di atas; yang belum dikomentari didahulukan.
        const urut = [...r.data].sort(
          (a, b) => Number(a.sudah_komentar) - Number(b.sudah_komentar) || Date.parse(b.waktu_posting ?? "") - Date.parse(a.waktu_posting ?? ""),
        );
        setData(urut);
        setPeriode(r.periode);
      })
      .catch((e) => {
        if (!hidup) return;
        setData([]);
        toast("error", "Daftar postingan gagal dimuat", e instanceof Error ? e.message : "");
      })
      .finally(() => hidup && setSibuk(false));
    return () => {
      hidup = false;
    };
  }, [versi]);

  const belum = (data ?? []).filter((d) => !d.sudah_komentar).length;
  return (
    <div className="mode-simpel-layar">
      <KepalaSimpel
        judul="Komen Video"
        onKembali={onKembali}
        kanan={
          <TombolSegar
            sibuk={sibuk}
            onClick={() => {
              setSibuk(true);
              setVersi((v) => v + 1);
            }}
          />
        }
      />
      <div className="flex items-center gap-2 px-3 pt-2 text-[11.5px] text-slate-600 dark:text-slate-300">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">{data?.length ?? 0} postingan</span>
        {belum > 0 ? <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">{belum} belum komen</span> : null}
        {periode ? <span className="truncate">Periode {periode}</span> : null}
      </div>
      {data === null ? (
        <Memuat />
      ) : data.length === 0 ? (
        <Kosong teks="Tidak ada postingan wajib komen di periode ini." />
      ) : (
        <div className="flex flex-col gap-2.5 px-3 pb-8 pt-2">
          {data.map((item) => {
            const kunci = `${item.platform}-${item.id_postingan}`;
            const embed = urlEmbedDari(item.platform, item.url);
            const terbuka = dimuat.has(kunci) && Boolean(embed);
            return (
              <article key={kunci} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                {terbuka ? (
                  <iframe
                    src={embed ?? undefined}
                    title={`Video ${item.platform} ${item.akun}`}
                    className="aspect-[4/5] w-full border-0"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (embed) setDimuat((s) => new Set(s).add(kunci));
                      else window.open(item.url, "_blank", "noopener,noreferrer");
                    }}
                    aria-label={embed ? "Putar video di sini" : "Buka video"}
                    className="relative block w-full bg-slate-100 dark:bg-slate-800"
                  >
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="flex aspect-[4/3] w-full items-center justify-center text-slate-400">
                        <MessageCircle className="h-10 w-10" aria-hidden="true" />
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
                        <Play className="h-6 w-6" aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                )}
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={item.platform} size={14} />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-900 dark:text-white">@{item.akun}</span>
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold",
                        item.sudah_komentar ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
                      )}
                    >
                      {item.sudah_komentar ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
                      {item.sudah_komentar ? "Sudah komen" : "Belum komen"}
                    </span>
                  </div>
                  {item.caption ? <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-slate-700 dark:text-slate-300">{item.caption}</p> : null}
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Tayang: {item.waktu_posting ? waktuJelasWIB(item.waktu_posting) : "-"}</p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-[13px] font-extrabold text-white"
                    style={{ background: item.sudah_komentar ? "#64748B" : BIRU_SIMPEL }}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    {item.sudah_komentar ? "Lihat postingan" : "Komentari sekarang"}
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// PENGATURAN: mode siang/malam, ganti sandi, keluar akun
// ------------------------------------------------------------
export function PengaturanSimpel({ onKembali, namaUser }: { onKembali: () => void; namaUser: string }) {
  const tema = useAppStore((s) => s.tema);
  const toggleTema = useAppStore((s) => s.toggleTema);
  const [modalSandi, setModalSandi] = useState(false);
  const [konfirmasiKeluar, setKonfirmasiKeluar] = useState(false);
  const [sedangKeluar, setSedangKeluar] = useState(false);

  async function keluarAkun() {
    if (sedangKeluar) return;
    setSedangKeluar(true);
    try {
      await keluarService();
    } finally {
      useAppStore.getState().logout();
      useAppStore.getState().setNotifikasi([]);
      // Mode simpel tetap tercatat di perangkat: setelah masuk lagi,
      // pengguna kembali ke tampilan simpel — bukan versi berat.
      window.location.replace("/");
    }
  }

  const gelap = tema === "dark";
  const kelasTombol = "flex h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-[15px] font-extrabold uppercase tracking-wide text-white active:opacity-80";
  return (
    <div className="mode-simpel-layar">
      <KepalaSimpel judul="Pengaturan" onKembali={onKembali} />
      <p className="px-4 pt-2 text-[12px] text-slate-500 dark:text-slate-400">Masuk sebagai {namaUser}</p>
      <div className="flex flex-col gap-2.5 px-4 pb-8 pt-3">
        <button type="button" onClick={toggleTema} className={kelasTombol} style={{ background: BIRU_SIMPEL }} aria-pressed={gelap}>
          {gelap ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
          <span className="flex-1">Mode {gelap ? "malam" : "siang"}</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] normal-case tracking-normal">ketuk untuk {gelap ? "siang" : "malam"}</span>
        </button>
        <button type="button" onClick={() => setModalSandi(true)} className={kelasTombol} style={{ background: BIRU_SIMPEL }}>
          <KeyRound className="h-5 w-5" aria-hidden="true" />
          Ganti kata sandi
        </button>
        {konfirmasiKeluar ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-[13px] font-bold text-slate-900 dark:text-white">Keluar dari akun di perangkat ini?</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setKonfirmasiKeluar(false)} className="h-11 rounded-lg bg-slate-200 text-[13px] font-extrabold text-slate-900 dark:bg-slate-700 dark:text-white">
                Batal
              </button>
              <button type="button" onClick={() => void keluarAkun()} disabled={sedangKeluar} className="h-11 rounded-lg bg-red-600 text-[13px] font-extrabold text-white disabled:opacity-60">
                {sedangKeluar ? "Keluar…" : "Ya, keluar"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setKonfirmasiKeluar(true)} className={kelasTombol} style={{ background: "#B91C1C" }}>
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Keluar akun (logout)
          </button>
        )}
      </div>
      {modalSandi ? <ModalGantiSandi onTutup={() => setModalSandi(false)} /> : null}
    </div>
  );
}
