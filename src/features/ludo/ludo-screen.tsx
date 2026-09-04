"use client";

// ============================================================
// LudoScreen (percobaan, 3 Sep 2026) — LUDO ROBOT multipemain.
//   LOBI  : buat ruang (siapa pun), gabung dengan kode, ruang saya, undangan.
//   RUANG : kode + salin, daftar pemain (robot pet), undang lewat cari nama
//           (host), Mulai (≥2), Batalkan/Keluar.
//   MAIN  : papan + dadu + panel pemain + catatan; polling 1,5 dtk memakai
//           `versi` (server otoritatif). Selesai → papan kemenangan.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Copy,
  Crown,
  Dice5,
  DoorOpen,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import {
  AvatarInisial,
  GlassSkeleton,
  ScreenHeader,
  StatusBadge,
} from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast, useAppStore } from "@/hooks/use-app-store";
import {
  cariPemainLudo,
  getLudoDaftar,
  getLudoRuang,
  ludoAksi,
  type CalonPemainLudo,
  type RuangLudo,
} from "@/services";
import { POS_RUMAH, WARNA, type Pemain } from "@/lib/ludo";
import { RobotSvg } from "@/features/pet/robot-svg";
import { cn } from "@/lib/utils";
import { Dadu, PapanLudo } from "./papan-ludo";

const MERAH = "linear-gradient(135deg, #DC2626, #B91C1C)";
const POLL_MAIN_MS = 1500;
const POLL_LOBI_MS = 5000;

function KartuPemain({
  p,
  giliran,
  sisaDetik,
  rumah,
  saya,
}: {
  p: Pemain;
  giliran: boolean;
  sisaDetik: number | null;
  rumah: number;
  saya: boolean;
}) {
  const w = WARNA[p.warna];
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border-2 px-2 py-1.5",
        giliran ? "ludo-giliran" : "",
      )}
      style={{ borderColor: w.utama, background: `${w.utama}14` }}
    >
      <div className="h-11 w-9 shrink-0 overflow-hidden">
        <RobotSvg
          jenis={p.robot.jenis}
          suasana="senang"
          terpasang={p.robot.terpasang}
          sparepart={p.robot.sparepart}
          skin={p.robot.skin ?? null}
          warna={p.robot.warna ?? null}
          ukuran={36}
          animasi={giliran}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px] font-bold text-teks-utama">
          {p.nama}
          {saya ? <span className="text-teks-sekunder"> (Anda)</span> : null}
        </p>
        <p className="text-[10px] text-teks-sekunder">
          {w.nama} · {rumah}/4 di rumah
          {giliran && sisaDetik !== null ? ` · ${sisaDetik}s` : ""}
        </p>
      </div>
      {giliran ? <Dice5 className="h-4 w-4 shrink-0 text-amber-500" /> : null}
    </div>
  );
}

export function LudoScreen({ onKembali }: { onKembali: () => void }) {
  const user = useAppStore((s) => s.user);
  const uid = user?.id ?? "";
  const [lobi, setLobi] = useState<{
    boleh_buat: boolean;
    daftar: RuangLudo[];
  } | null>(null);
  const [ruang, setRuang] = useState<RuangLudo | null>(null);
  const [kode, setKode] = useState("");
  const [cari, setCari] = useState("");
  const [hasilCari, setHasilCari] = useState<CalonPemainLudo[]>([]);
  const [sibuk, setSibuk] = useState("");
  const [berputar, setBerputar] = useState(false);
  // Naik tiap lempar → Dadu memutar ulang animasi melambung (4 Sep 2026).
  const [lemparan, setLemparan] = useState(0);
  const [detik, setDetik] = useState<number | null>(null);
  // Salinan ruang untuk dibaca callback polling (tanpa memicu render ulang).
  const ruangRef = useRef<RuangLudo | null>(null);
  useEffect(() => {
    ruangRef.current = ruang;
  }, [ruang]);

  // Ludo dimatikan master / mode hemat (4 Sep 2026) → tampilkan pemberitahuan.
  const [nonaktif, setNonaktif] = useState(false);
  const muatLobi = useCallback(() => {
    return getLudoDaftar()
      .then((d) => {
        setNonaktif(false);
        setLobi(d);
      })
      .catch((e) => {
        const pesan = e instanceof Error ? e.message : "";
        if (/dinonaktifkan/i.test(pesan)) {
          setNonaktif(true);
          setLobi({ boleh_buat: false, daftar: [] });
          return;
        }
        toast("error", "Gagal memuat lobi", pesan);
      });
  }, []);

  // Lobi: muat + polling pelan (undangan baru masuk).
  useEffect(() => {
    if (ruang) return;
    void muatLobi();
    const t = setInterval(() => void muatLobi(), POLL_LOBI_MS);
    return () => clearInterval(t);
  }, [ruang, muatLobi]);

  // Ruang: polling cepat, hanya set state bila versi berubah.
  useEffect(() => {
    if (!ruang || ruang.status === "selesai") return;
    const id = ruang.id;
    let hidup = true;
    const t = setInterval(() => {
      getLudoRuang(id)
        .then((r) => {
          if (!hidup) return;
          if (r.versi !== ruangRef.current?.versi) setRuang(r);
        })
        .catch(() => {
          // jaringan sesaat — coba lagi di tik berikutnya
        });
    }, POLL_MAIN_MS);
    return () => {
      hidup = false;
      clearInterval(t);
    };
  }, [ruang?.id, ruang?.status]);

  // Hitung mundur giliran.
  useEffect(() => {
    if (!ruang?.state || ruang.status !== "berjalan") return;
    const batas = Date.parse(ruang.state.batas);
    const tik = () =>
      setDetik(Math.max(0, Math.ceil((batas - Date.now()) / 1000)));
    tik();
    const t = setInterval(tik, 1000);
    return () => clearInterval(t);
  }, [ruang?.state?.batas, ruang?.status]);

  // Cari pemain untuk diundang (host memakai pencarian pengguna).
  useEffect(() => {
    if (!ruang?.saya_host || cari.trim().length < 2) return;
    let hidup = true;
    const t = setTimeout(() => {
      cariPemainLudo(cari.trim())
        .then((d) => hidup && setHasilCari(d))
        .catch(() => hidup && setHasilCari([]));
    }, 300);
    return () => {
      hidup = false;
      clearTimeout(t);
    };
  }, [cari, ruang?.saya_host]);

  async function jalankan(
    kunci: string,
    aksi: string,
    data: Record<string, unknown> = {},
    pesan?: string,
  ) {
    if (sibuk) return null;
    setSibuk(kunci);
    try {
      const r = await ludoAksi(aksi, data);
      if (pesan) toast("sukses", pesan);
      return r;
    } catch (e) {
      const teks = e instanceof Error ? e.message : "";
      toast(
        teks.includes("berubah") ? "info" : "peringatan",
        teks.includes("berubah") ? "Papan diperbarui" : "Tidak bisa",
        teks,
      );
      // Konflik versi → ambil keadaan terbaru.
      if (ruangRef.current)
        getLudoRuang(ruangRef.current.id)
          .then(setRuang)
          .catch(() => {});
      return null;
    } finally {
      setSibuk("");
    }
  }

  async function lempar() {
    if (!ruang) return;
    setBerputar(true);
    setLemparan((n) => n + 1);
    const mulai = Date.now();
    const r = await jalankan("lempar", "lempar", { id: ruang.id });
    // Biar animasi melambung + berguling terlihat utuh (minimal 800 ms).
    const sisa = Math.max(0, 800 - (Date.now() - mulai));
    setTimeout(() => {
      setBerputar(false);
      if (r) setRuang(r);
    }, sisa);
  }

  async function gerak(token: number) {
    if (!ruang) return;
    const r = await jalankan("gerak", "gerak", { id: ruang.id, token });
    if (r) setRuang(r);
  }

  async function salinKode(k: string) {
    try {
      await navigator.clipboard.writeText(k);
      toast("sukses", "Kode ruang disalin", k);
    } catch {
      toast("info", "Kode ruang", k);
    }
  }

  const saya = ruang?.pemain.findIndex((p) => p.user_id === Number(uid)) ?? -1;

  // ==================== LOBI ====================
  if (!ruang && nonaktif) {
    return (
      <div className="kolom-aplikasi px-4 pb-32">
        <ScreenHeader judul="Ludo Robot" onKembali={onKembali} />
        <GlassCard className="mt-2 p-5 text-center">
          <p className="text-3xl" aria-hidden="true">
            🎲
          </p>
          <p className="mt-2 text-sm font-bold text-teks-utama">
            Ludo sedang dinonaktifkan sementara
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-teks-sekunder">
            Master mematikannya untuk menjaga server tetap ringan (mode
            hemat). Coba lagi nanti.
          </p>
        </GlassCard>
      </div>
    );
  }

  if (!ruang) {
    return (
      <div className="kolom-aplikasi px-4 pb-32">
        <ScreenHeader judul="Ludo Robot" onKembali={onKembali} />
        <p className="mb-3 text-[11px] text-teks-sekunder">
          Robot pet tiap pemain jadi bidaknya · 2–4 pemain.
        </p>
        {lobi === null ? (
          <GlassSkeleton className="h-40 rounded-2xl" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {lobi.boleh_buat ? (
                <button
                  type="button"
                  onClick={() =>
                    void jalankan(
                      "buat",
                      "buat",
                      {},
                      "Ruang dibuat — undang temanmu!",
                    ).then((r) => r && setRuang(r))
                  }
                  disabled={Boolean(sibuk)}
                  className="btn-tekan flex h-14 items-center justify-center gap-2 rounded-2xl text-[13.5px] font-bold text-white disabled:opacity-50"
                  style={{ background: MERAH }}
                >
                  {sibuk === "buat" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}{" "}
                  Buat ruang baru
                </button>
              ) : null}
              <div className="glass flex h-14 items-center gap-2 rounded-2xl px-3">
                <input
                  value={kode}
                  onChange={(e) =>
                    setKode(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 6),
                    )
                  }
                  placeholder="Kode ruang (6 huruf)"
                  className="h-full min-w-0 flex-1 bg-transparent font-mono text-[15px] font-extrabold tracking-[0.2em] text-teks-utama outline-none"
                  aria-label="Kode ruang"
                />
                <button
                  type="button"
                  onClick={() =>
                    void jalankan(
                      "gabung",
                      "gabung",
                      { kode },
                      "Bergabung!",
                    ).then((r) => r && setRuang(r))
                  }
                  disabled={Boolean(sibuk) || kode.length !== 6}
                  className="btn-tekan h-9 rounded-xl px-3 text-[12px] font-bold text-white disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, #10B981, #059669)",
                  }}
                >
                  Gabung
                </button>
              </div>
            </div>

            <GlassCard className="mt-3 p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
                  <Users className="h-4 w-4 text-pri" /> Ruang & undangan saya
                </p>
                <button
                  type="button"
                  onClick={() => void muatLobi()}
                  aria-label="Segarkan"
                  className="btn-tekan p-1 text-teks-sekunder"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              {lobi.daftar.length === 0 ? (
                <p className="mt-2 text-[11.5px] text-teks-sekunder">
                  Belum ada ruang.{" "}
                  {lobi.boleh_buat
                    ? "Buat ruang lalu undang pemain lain."
                    : "Tunggu undangan atau masukkan kode ruang."}
                </p>
              ) : (
                <div className="mt-2 flex flex-col gap-1.5">
                  {lobi.daftar.map((r) => {
                    const diundang = !r.saya_ikut && !r.saya_host;
                    return (
                      <div
                        key={r.id}
                        className="glass-soft flex items-center gap-2 rounded-xl px-3 py-2"
                      >
                        <span className="font-mono text-[13px] font-extrabold tracking-widest text-teks-utama">
                          {r.kode}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-teks-sekunder">
                          {r.pemain.map((p) => p.nama.split(" ")[0]).join(", ")}{" "}
                          · {r.pemain.length} pemain
                        </span>
                        <StatusBadge
                          label={
                            r.status === "berjalan"
                              ? "berjalan"
                              : r.status === "selesai"
                                ? "selesai"
                                : diundang
                                  ? "diundang"
                                  : "menunggu"
                          }
                          warna={
                            r.status === "berjalan"
                              ? "hijau"
                              : r.status === "selesai"
                                ? "netral"
                                : "kuning"
                          }
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (diundang && r.status === "menunggu")
                              void jalankan(
                                `gabung:${r.id}`,
                                "gabung",
                                { kode: r.kode },
                                "Bergabung!",
                              ).then((x) => x && setRuang(x));
                            else setRuang(r);
                          }}
                          disabled={Boolean(sibuk)}
                          className="btn-tekan h-8 rounded-lg px-2.5 text-[11px] font-bold text-white disabled:opacity-50"
                          style={{ background: MERAH }}
                        >
                          {diundang && r.status === "menunggu"
                            ? "Gabung"
                            : "Buka"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>

            <GlassCard className="mt-3 p-4">
              <p className="text-[12.5px] font-bold text-teks-utama">
                Aturan singkat
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-teks-sekunder">
                <li>
                  Keluar markas butuh dadu 6. Dadu 6, memakan lawan, atau sampai
                  rumah = giliran lagi (tiga kali 6 = hangus).
                </li>
                <li>
                  Petak berbintang dan petak awal aman dari tangkapan. Masuk
                  rumah harus pas.
                </li>
                <li>
                  Giliran maksimal 60 detik; lewat itu server menjalankan
                  langkah otomatis.
                </li>
              </ul>
            </GlassCard>
          </>
        )}
      </div>
    );
  }

  // ==================== RUANG TUNGGU ====================
  if (ruang.status === "menunggu") {
    return (
      <div className="kolom-aplikasi px-4 pb-32">
        <ScreenHeader judul="Ruang Ludo" onKembali={() => setRuang(null)} />
        <GlassCard className="p-4 text-center">
          <p className="text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
            Kode ruang
          </p>
          <button
            type="button"
            onClick={() => void salinKode(ruang.kode)}
            className="btn-tekan mt-1 inline-flex items-center gap-2 font-mono text-[28px] font-extrabold tracking-[0.3em] text-teks-utama"
          >
            {ruang.kode} <Copy className="h-4 w-4 text-teks-sekunder" />
          </button>
          <p className="text-[11px] text-teks-sekunder">
            Bagikan kode ini, atau undang lewat nama di bawah.
          </p>
        </GlassCard>

        <GlassCard className="mt-3 p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">
            Pemain ({ruang.pemain.length}/4)
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {ruang.pemain.map((p) => (
              <div
                key={p.user_id}
                className="flex flex-col items-center rounded-xl border-2 p-2"
                style={{
                  borderColor: WARNA[p.warna].utama,
                  background: `${WARNA[p.warna].utama}14`,
                }}
              >
                <RobotSvg
                  jenis={p.robot.jenis}
                  suasana="senang"
                  terpasang={p.robot.terpasang}
                  sparepart={p.robot.sparepart}
                  skin={p.robot.skin ?? null}
                  warna={p.robot.warna ?? null}
                  ukuran={64}
                />
                <p className="mt-1 truncate text-[11.5px] font-bold text-teks-utama">
                  {p.nama}
                </p>
                <p className="text-[10px] text-teks-sekunder">
                  {WARNA[p.warna].nama} · {p.robot.nama}
                  {Number(p.user_id) === Number(ruang.host_id) ? " · host" : ""}
                </p>
              </div>
            ))}
            {Array.from({ length: Math.max(0, 4 - ruang.pemain.length) }).map(
              (_, i) => (
                <div
                  key={`kosong-${i}`}
                  className="flex min-h-[110px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-teks-sekunder/30 text-[11px] text-teks-sekunder"
                >
                  <UserPlus className="mb-1 h-5 w-5" /> menunggu pemain
                </div>
              ),
            )}
          </div>
          {ruang.undangan.length > 0 ? (
            <p className="mt-2 text-[11px] text-teks-sekunder">
              Diundang, belum gabung:{" "}
              {ruang.undangan.map((u) => u.nama).join(", ")}
            </p>
          ) : null}
        </GlassCard>

        {ruang.saya_host ? (
          <GlassCard className="mt-3 p-4">
            <p className="text-[12.5px] font-bold text-teks-utama">
              Undang pemain
            </p>
            <div className="glass-input mt-2 flex h-10 items-center gap-2 rounded-xl px-3">
              <Search className="h-4 w-4 text-teks-sekunder" />
              <input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari nama anggota…"
                className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-teks-utama outline-none"
              />
            </div>
            {cari.trim().length >= 2 ? (
              <div className="mt-2 flex flex-col gap-1">
                {hasilCari.length === 0 ? (
                  <p className="px-1 text-[11px] text-teks-sekunder">
                    Tidak ada anggota dengan nama itu.
                  </p>
                ) : (
                  hasilCari.slice(0, 8).map((o) => {
                    const sudah =
                      ruang.pemain.some((p) => String(p.user_id) === o.id) ||
                      ruang.undangan.some((u) => u.user_id === o.id);
                    return (
                      <div
                        key={o.id}
                        className="flex items-center gap-2 rounded-lg px-1.5 py-1"
                      >
                        {o.avatar_url ? (
                          <FotoBulat src={o.avatar_url} ukuran={28} />
                        ) : (
                          <AvatarInisial nama={o.nama} ukuran={28} />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-teks-utama">
                          {o.nama}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void jalankan(
                              `undang:${o.id}`,
                              "undang",
                              { id: ruang.id, user_id: o.id },
                              `${o.nama} diundang (notifikasi terkirim)`,
                            ).then((r) => r && setRuang(r))
                          }
                          disabled={
                            Boolean(sibuk) || sudah || ruang.pemain.length >= 4
                          }
                          className="btn-tekan h-8 rounded-lg bg-pri/12 px-2.5 text-[11px] font-bold text-pri disabled:opacity-50"
                        >
                          {sudah ? "sudah" : "Undang"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}
          </GlassCard>
        ) : null}

        <div className="mt-3 flex gap-2">
          {ruang.saya_host ? (
            <>
              <button
                type="button"
                onClick={() =>
                  void jalankan(
                    "mulai",
                    "mulai",
                    { id: ruang.id },
                    "Permainan dimulai!",
                  ).then((r) => r && setRuang(r))
                }
                disabled={Boolean(sibuk) || ruang.pemain.length < 2}
                className="btn-tekan flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #10B981, #059669)",
                }}
              >
                {sibuk === "mulai" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}{" "}
                Mulai ({ruang.pemain.length} pemain)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Batalkan ruang ini?"))
                    void jalankan(
                      "batal",
                      "batalkan",
                      { id: ruang.id },
                      "Ruang dibatalkan",
                    ).then((r) => r && setRuang(null));
                }}
                disabled={Boolean(sibuk)}
                className="btn-tekan h-12 rounded-xl bg-gagal/12 px-4 text-[12.5px] font-bold text-gagal disabled:opacity-50"
              >
                Batalkan
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() =>
                void jalankan(
                  "keluar",
                  "keluar",
                  { id: ruang.id },
                  "Keluar dari ruang",
                ).then((r) => r && setRuang(null))
              }
              disabled={Boolean(sibuk)}
              className="btn-tekan flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gagal/12 text-[12.5px] font-bold text-gagal disabled:opacity-50"
            >
              <DoorOpen className="h-4 w-4" /> Keluar ruang
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[10.5px] text-teks-sekunder">
          {ruang.saya_host
            ? "Menunggu pemain bergabung… daftar diperbarui otomatis."
            : "Menunggu host memulai permainan…"}
        </p>
      </div>
    );
  }

  // ==================== MAIN / SELESAI ====================
  const st = ruang.state;
  if (!st) {
    return (
      <div className="kolom-aplikasi px-4 pb-32">
        <ScreenHeader judul="Ludo Robot" onKembali={() => setRuang(null)} />
        <GlassSkeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  const giliranPemain = ruang.pemain[st.giliran];
  const giliranSaya = st.giliran === saya && ruang.status === "berjalan";
  const pemenang = st.pemenang !== null ? ruang.pemain[st.pemenang] : null;
  const warnaSaya =
    saya >= 0 ? WARNA[ruang.pemain[saya].warna].utama : "#334155";

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <ScreenHeader judul="Ludo Robot" onKembali={() => setRuang(null)} />

      {/* Panel pemain */}
      <div className="grid grid-cols-2 gap-1.5">
        {ruang.pemain.map((p, j) => (
          <KartuPemain
            key={p.user_id}
            p={p}
            giliran={ruang.status === "berjalan" && st.giliran === j}
            sisaDetik={detik}
            rumah={st.token[j]?.filter((x) => x >= POS_RUMAH).length ?? 0}
            saya={j === saya}
          />
        ))}
      </div>

      {/* Papan */}
      <div className="mt-3 flex justify-center">
        <PapanLudo
          pemain={ruang.pemain}
          state={st}
          sayaIndeks={saya}
          onGerak={(t) => void gerak(t)}
          sibuk={Boolean(sibuk)}
        />
      </div>

      {/* Dadu + status giliran */}
      <GlassCard className="mt-3 flex items-center gap-3 p-3">
        <Dadu
          nilai={st.dadu}
          berputar={berputar}
          lemparan={lemparan}
          warna={WARNA[giliranPemain?.warna ?? 0].utama}
          onLempar={() => void lempar()}
          boleh={giliranSaya && st.fase === "lempar" && !sibuk}
        />
        <div className="min-w-0 flex-1">
          {ruang.status === "selesai" ? (
            <p className="text-[13px] font-extrabold text-teks-utama">
              Permainan selesai
            </p>
          ) : giliranSaya ? (
            <p
              className="text-[13px] font-extrabold"
              style={{ color: warnaSaya }}
            >
              {st.fase === "lempar"
                ? "Giliran Anda — ketuk dadu!"
                : "Pilih robot yang mau digerakkan (yang berdenyut)."}
            </p>
          ) : (
            <p className="text-[13px] font-bold text-teks-utama">
              Giliran{" "}
              <span style={{ color: WARNA[giliranPemain?.warna ?? 0].utama }}>
                {giliranPemain?.nama}
              </span>
              {st.fase === "pilih"
                ? " — sedang memilih token"
                : " — sedang melempar"}
            </p>
          )}
          <div className="mt-1 max-h-16 overflow-y-auto text-[10.5px] leading-snug text-teks-sekunder">
            {[...st.log]
              .slice(-4)
              .reverse()
              .map((l, i) => (
                <p
                  key={i}
                  className={cn(i === 0 && "font-semibold text-teks-utama")}
                >
                  {l}
                </p>
              ))}
          </div>
        </div>
      </GlassCard>

      {ruang.status === "berjalan" ? (
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Keluar = menyerah. Yakin?"))
              void jalankan("keluar", "keluar", { id: ruang.id }).then(
                (r) => r && setRuang(r),
              );
          }}
          disabled={Boolean(sibuk)}
          className="btn-tekan mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-bold text-gagal disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" /> Keluar / menyerah
        </button>
      ) : null}

      {/* Papan kemenangan */}
      <AnimatePresence>
        {ruang.status === "selesai" ? (
          <motion.div
            key="menang"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Hasil permainan"
          >
            <motion.div
              initial={{ scale: 0.9, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="glass-strong w-full max-w-sm rounded-3xl p-5 text-center"
            >
              {pemenang ? (
                <>
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/20 text-amber-500">
                    <Trophy className="h-8 w-8" />
                  </span>
                  <p className="mt-2 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
                    Pemenang
                  </p>
                  <div className="mx-auto mt-1 w-fit">
                    <RobotSvg
                      jenis={pemenang.robot.jenis}
                      suasana="senang"
                      vitalitas="semangat"
                      terpasang={pemenang.robot.terpasang}
                      sparepart={pemenang.robot.sparepart}
                      skin={pemenang.robot.skin ?? null}
                      warna={pemenang.robot.warna ?? null}
                      ukuran={120}
                    />
                  </div>
                  <p className="font-heading text-[20px] font-extrabold text-teks-utama">
                    {pemenang.nama}{" "}
                    <Crown className="inline h-5 w-5 text-amber-500" />
                  </p>
                  <p className="text-[12px] text-teks-sekunder">
                    bersama {pemenang.robot.nama} ({WARNA[pemenang.warna].nama})
                    {Number(pemenang.user_id) === Number(uid)
                      ? " — selamat, itu Anda! 🎉"
                      : ""}
                  </p>
                </>
              ) : (
                <p className="font-heading text-[18px] font-extrabold text-teks-utama">
                  Permainan berakhir
                </p>
              )}
              <button
                type="button"
                onClick={() => setRuang(null)}
                className="btn-tekan mt-4 h-11 w-full rounded-xl text-[13px] font-bold text-white"
                style={{ background: MERAH }}
              >
                Kembali ke lobi
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
