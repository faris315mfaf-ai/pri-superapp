"use client";

// ============================================================
// TombolPeringkat (1 Sep 2026) — MAHKOTA BERAPI di header (kiri
// lonceng notifikasi), untuk SEMUA pengguna. Diklik → pop-up penuh
// leaderboard TV Rakyat pengguna:
//   • podium 3 besar dengan cincin "Mythical" bercahaya
//     (#1 Immortal, #2 Glory, #3 Honor — ala Mobile Legends),
//   • filter per sosial media × per indikator,
//   • klik nama → langsung ke profil sosmed orang itu.
// Data disegarkan otomatis (30 dtk) — se-realtime insight platformnya.
// Komponen ini mandiri (tombol + popup) supaya tinggal ditaruh di
// header mana pun tanpa pengkabelan tambahan.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, ExternalLink, X } from "lucide-react";
import { AvatarInisial, GlassSkeleton } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import {
  getKepatuhanKomenLeaderboard,
  getPeringkatTvr,
  type KepatuhanKomenLeaderboard,
  type MetrikNasional,
  type PeringkatTvr,
} from "@/services";
import { formatAngkaRingkas, urlProfilSosmed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CincinMythic, FITUR_PERINGKAT_AKTIF, LabelMythic } from "./cincin-mythic";

const LABEL_INDIKATOR: Record<keyof MetrikNasional, string> = {
  pengikut: "Pengikut",
  tayangan: "Tayangan",
  jangkauan: "Jangkauan",
  suka: "Suka",
  komentar: "Komentar",
  bagikan: "Dibagikan",
};
const LABEL_PLATFORM: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
};

/** Handle bernama-tampilan (berspasi, mis. dari Facebook) tak diberi "@". */
function tampilkanUsername(handle: string): string {
  return handle.includes(" ") ? handle : `@${handle.replace(/^@+/, "")}`;
}

export function TombolPeringkat() {
  const [buka, setBuka] = useState(false);
  // Fitur leaderboard DIMATIKAN (1 Sep 2026 — hemat RAM, permintaan
  // user): mahkota tidak dirender sama sekali. Sakelar di cincin-mythic.
  if (!FITUR_PERINGKAT_AKTIF) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        aria-label="Buka leaderboard TV Rakyat"
        className="glass btn-tekan relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      >
        {/* Mahkota STATIS (mode ringan 1 Sep 2026 — animasi api dicabut
            karena memberatkan; leaderboard-nya tetap lengkap). */}
        <Crown className="h-[18px] w-[18px] text-amber-500" fill="#F59E0B" />
      </button>
      <AnimatePresence>{buka && <PopupPeringkat onTutup={() => setBuka(false)} />}</AnimatePresence>
    </>
  );
}

function Avatar({ src, nama, ukuran }: { src: string; nama: string; ukuran: number }) {
  return src ? (
    <FotoBulat src={src} ukuran={ukuran} />
  ) : (
    <AvatarInisial nama={nama} ukuran={ukuran} />
  );
}

// ===== Mode KEPATUHAN KOMEN (2 Sep 2026): peringkat kepatuhan komentar
// periode berjalan + penjelasan aturan (jam postingan 17.00–16.59 WIB &
// wajib pakai akun yang sudah didaftarkan).
function PanelKomen({ data }: { data: KepatuhanKomenLeaderboard | null }) {
  if (!data) {
    return (
      <div className="flex flex-col gap-3 pt-2">
        <GlassSkeleton className="h-28 rounded-2xl" />
        <GlassSkeleton className="h-56 rounded-2xl" />
      </div>
    );
  }
  return (
    <>
      <div className="mt-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-[11px] leading-relaxed text-teks-utama">
        <p className="font-bold">Cara penilaian kepatuhan komen</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-teks-sekunder">
          <li>
            Dihitung berdasarkan <b>jam postingan</b>: periode <b>17.00 WIB</b> sampai{" "}
            <b>16.59 WIB</b> hari berikutnya (periode ini: {data.periode}).
          </li>
          <li>Wajib berkomentar di <b>setiap</b> postingan akun wajib dalam periode itu.</li>
          <li>
            <b>Jangan berkomentar dengan akun yang belum didaftarkan</b> — sistem tidak bisa
            membaca komentar dari akun yang tidak terdaftar, jadi tidak dihitung.
          </li>
        </ul>
      </div>
      {data.daftar.length === 0 ? (
        <p className="mt-5 text-center text-[12px] text-teks-sekunder">
          Belum ada postingan wajib di periode ini.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {data.daftar.map((a, i) => (
            <div
              key={a.nama}
              className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-2", i < 3 && "glass")}
            >
              <span
                className={cn(
                  "angka-tab w-6 shrink-0 text-center text-[12px] font-extrabold",
                  i === 0
                    ? "text-amber-500"
                    : i === 1
                      ? "text-slate-400"
                      : i === 2
                        ? "text-orange-500"
                        : "text-teks-sekunder",
                )}
              >
                {i + 1}
              </span>
              {a.avatar_url ? (
                <FotoBulat src={a.avatar_url} ukuran={32} />
              ) : (
                <AvatarInisial nama={a.nama} ukuran={32} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold text-teks-utama">{a.nama}</p>
                <p className="text-[10px] text-teks-sekunder">
                  {a.sudah}/{a.total} postingan dikomentari
                </p>
              </div>
              <span
                className={cn(
                  "angka-tab shrink-0 text-[13px] font-extrabold",
                  a.persen >= 100 ? "text-emerald-500" : a.persen >= 50 ? "text-amber-500" : "text-gagal",
                )}
              >
                {a.persen}%
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-[10px] text-teks-sekunder">
        Urutan: persentase tertinggi, lalu jumlah komentar · menyegar otomatis
      </p>
    </>
  );
}

function PopupPeringkat({ onTutup }: { onTutup: () => void }) {
  const [mode, setMode] = useState<"tvr" | "komen">("tvr");
  const [komen, setKomen] = useState<KepatuhanKomenLeaderboard | null>(null);
  const [data, setData] = useState<PeringkatTvr | null>(null);
  const [platformPilih, setPlatformPilih] = useState("instagram");
  const [indikatorPilih, setIndikatorPilih] = useState<keyof MetrikNasional>("pengikut");

  useEffect(() => {
    let hidup = true;
    void getPeringkatTvr()
      .then((r) => hidup && setData(r))
      .catch(() => hidup && toast("error", "Gagal memuat leaderboard", "Coba lagi sebentar."));
    return () => {
      hidup = false;
    };
  }, []);
  useSegarOtomatis(() => {
    void getPeringkatTvr()
      .then(setData)
      .catch(() => {});
    if (mode === "komen") {
      void getKepatuhanKomenLeaderboard()
        .then(setKomen)
        .catch(() => {});
    }
  });
  // Data kepatuhan komen dimuat saat mode-nya dibuka (hemat: tak semua
  // orang membukanya).
  useEffect(() => {
    if (mode !== "komen") return;
    let hidup = true;
    void getKepatuhanKomenLeaderboard()
      .then((r) => hidup && setKomen(r))
      .catch(() => hidup && toast("error", "Gagal memuat kepatuhan", "Coba lagi sebentar."));
    return () => {
      hidup = false;
    };
  }, [mode]);

  const baris = useMemo(() => {
    if (!data) return [];
    return data.anggota
      .map((a) => ({ ...a, nilai: a.platform[platformPilih]?.[indikatorPilih] ?? null }))
      .filter((a): a is typeof a & { nilai: number } => a.nilai !== null && a.nilai > 0)
      .sort((x, y) => y.nilai - x.nilai);
  }, [data, platformPilih, indikatorPilih]);

  /** Klik nama → profil sosmed. Prioritas: platform yang sedang dipilih. */
  function bukaProfil(akun: Record<string, string>, nama: string) {
    const platform = akun[platformPilih]
      ? platformPilih
      : Object.keys(akun).find((p) => akun[p]);
    if (!platform || !akun[platform]) {
      toast("info", "Belum tertaut", `${nama} belum menautkan akun sosmed.`);
      return;
    }
    window.open(urlProfilSosmed(platform, akun[platform]), "_blank", "noopener,noreferrer");
  }

  // Podium = juara 1-2-3 KATEGORI YANG SEDANG DIPILIH (permintaan
  // user: border diberikan per kategori), ditata 2-1-3 — juara 1 di
  // tengah, paling tinggi & besar.
  const podium: { juara: (typeof baris)[number]; tier: number }[] = [];
  if (baris[1]) podium.push({ juara: baris[1], tier: 2 });
  if (baris[0]) podium.push({ juara: baris[0], tier: 1 });
  if (baris[2]) podium.push({ juara: baris[2], tier: 3 });

  return (
    <motion.div
      className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Leaderboard TV Rakyat"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onTutup} />
      <motion.div
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="glass relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
      >
        {/* Kepala */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <Crown className="h-5 w-5 text-amber-500" fill="#F59E0B" />
          <p className="font-heading text-[16px] font-extrabold text-teks-utama">
            {mode === "komen" ? "Leaderboard Kepatuhan Komen" : "Leaderboard TV Rakyat"}
          </p>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup leaderboard"
            className="glass btn-tekan ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-teks-utama"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode: TV Rakyat | Kepatuhan Komen (2 Sep 2026) */}
        <div className="mx-4 mb-1 grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
          {(
            [
              ["tvr", "TV Rakyat"],
              ["komen", "Kepatuhan Komen"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              aria-pressed={mode === k}
              className={cn(
                "btn-tekan rounded-lg py-1.5 text-[12px] font-bold",
                mode === k ? "bg-white text-teks-utama shadow-sm dark:bg-white/15" : "text-teks-sekunder",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="scrollbar-tipis flex-1 overflow-y-auto px-4 pb-6">
          {mode === "komen" ? (
            <PanelKomen data={komen} />
          ) : !data ? (
            <div className="flex flex-col gap-3 pt-2">
              <GlassSkeleton className="h-40 rounded-2xl" />
              <GlassSkeleton className="h-56 rounded-2xl" />
            </div>
          ) : (
            <>
              {/* ===== Podium juara 1-2-3 kategori terpilih (border Mythical) ===== */}
              {podium.length > 0 && (
                <div className="mt-2 flex items-end justify-center gap-5 pt-12 pb-3">
                  {podium.map(({ juara, tier }) => (
                    <button
                      key={juara.user_id}
                      type="button"
                      onClick={() => bukaProfil(juara.akun, juara.nama)}
                      className={cn(
                        "btn-tekan flex w-[30%] flex-col items-center gap-1.5",
                        tier === 1 ? "-translate-y-3" : "",
                      )}
                      aria-label={`Buka profil sosmed ${juara.nama}`}
                    >
                      <CincinMythic tier={tier} ukuran={tier === 1 ? 68 : 52}>
                        <Avatar
                          src={juara.avatar_url}
                          nama={juara.nama}
                          ukuran={tier === 1 ? 68 : 52}
                        />
                      </CincinMythic>
                      <p className="mt-2 w-full truncate text-center text-[11.5px] font-bold text-teks-utama">
                        {juara.nama}
                      </p>
                      {/* Username sosmed yang dimaksud (1 Sep 2026) */}
                      {juara.akun[platformPilih] && (
                        <p className="w-full truncate text-center text-[10px] font-semibold text-pri">
                          {tampilkanUsername(juara.akun[platformPilih])}
                        </p>
                      )}
                      <LabelMythic tier={tier} kecil />
                      <p className="angka-tab text-[10.5px] text-teks-sekunder">
                        {formatAngkaRingkas(juara.nilai)} {LABEL_INDIKATOR[indikatorPilih].toLowerCase()}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {/* ===== Filter sosmed & indikator ===== */}
              <div className="tanpa-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
                {data.platforms.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatformPilih(p)}
                    aria-pressed={platformPilih === p}
                    className={cn(
                      "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                      platformPilih === p ? "text-white" : "glass text-teks-sekunder",
                    )}
                    style={
                      platformPilih === p
                        ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                        : undefined
                    }
                  >
                    <PlatformIcon platform={p} size={12} />
                    {LABEL_PLATFORM[p] ?? p}
                  </button>
                ))}
              </div>
              <div className="tanpa-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
                {(Object.keys(LABEL_INDIKATOR) as (keyof MetrikNasional)[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setIndikatorPilih(k)}
                    aria-pressed={indikatorPilih === k}
                    className={cn(
                      "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                      indikatorPilih === k ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
                    )}
                  >
                    {LABEL_INDIKATOR[k]}
                  </button>
                ))}
              </div>

              {/* ===== Daftar peringkat ===== */}
              {baris.length === 0 ? (
                <p className="mt-4 text-[12px] leading-relaxed text-teks-sekunder">
                  Belum ada akun dengan data {LABEL_INDIKATOR[indikatorPilih]} di{" "}
                  {LABEL_PLATFORM[platformPilih]}. Angka muncul setelah anggota menautkan
                  akunnya di TV Rakyat Saya.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-1.5">
                  {baris.map((a, i) => {
                    // Border per KATEGORI: 3 teratas kategori ini bersinar.
                    const tier = i < 3 ? i + 1 : undefined;
                    return (
                      <button
                        key={a.user_id}
                        type="button"
                        onClick={() => bukaProfil(a.akun, a.nama)}
                        aria-label={`Buka profil sosmed ${a.nama}`}
                        className={cn(
                          "glass-soft btn-tekan flex items-center gap-2.5 rounded-xl px-2.5 text-left",
                          // Beri ruang napas untuk border ornamen 3 teratas.
                          tier ? "py-4" : "py-2",
                        )}
                      >
                        <span className="angka-tab w-6 shrink-0 text-center text-[12px] font-extrabold text-teks-sekunder">
                          {i + 1}
                        </span>
                        {tier ? (
                          <CincinMythic tier={tier} ukuran={32} denganMahkota={false}>
                            <Avatar src={a.avatar_url} nama={a.nama} ukuran={32} />
                          </CincinMythic>
                        ) : (
                          <Avatar src={a.avatar_url} nama={a.nama} ukuran={32} />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold text-teks-utama">
                            {a.nama}
                          </span>
                          {/* Username sosmed platform terpilih (1 Sep 2026) */}
                          <span className="block truncate text-[10.5px] font-semibold text-pri">
                            {a.akun[platformPilih]
                              ? tampilkanUsername(a.akun[platformPilih])
                              : "belum tertaut di sini"}
                          </span>
                          {tier && (
                            <span className="mt-0.5 block">
                              <LabelMythic tier={tier} kecil />
                            </span>
                          )}
                        </span>
                        <span className="angka-tab shrink-0 text-[13px] font-extrabold text-teks-utama">
                          {formatAngkaRingkas(a.nilai)}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-teks-sekunder" />
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="mt-3 text-center text-[10px] text-teks-sekunder">
                Border Mythical = juara 1–3 di tiap kategori · border di avatar
                memakai peringkat terbaik yang diraih · angka menyegar otomatis
              </p>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
