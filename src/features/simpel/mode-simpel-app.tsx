"use client";

// ============================================================
// MODE SIMPEL PRI SUPERAPP — akar aplikasi ringan (4 Sep 2026).
//
// Tata letak mengikuti mockup: judul, baris ikon (lonceng, toa, mahkota,
// tombol Keluar), lalu tombol-tombol besar: KPI VIDEO | KPI KOMEN,
// ABSEN | KAITKAN AKUN, KOMEN VIDEO, LAPORAN VIDEO, UPLOAD VIDEO,
// POSTINGAN TERBARU, PENGATURAN.
//
// Ringan karena: (1) halaman /simpel tidak memuat pohon aplikasi utama
// sama sekali — robot, running text, kembang api, tutorial, chat realtime,
// polling notifikasi/izin tidak ada; (2) animasi & kaca buram dimatikan
// lewat atribut html[data-mode-simpel] (globals.css) + MotionConfig
// reducedMotion; (3) penyegaran otomatis berkala dimatikan (use-segar-otomatis).
// Modul berat yang dipakai ulang (absen, laporan/unggah TVR Saya, akun
// komen, notifikasi, postingan) hanya dimuat saat tombolnya ditekan.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { MotionConfig } from "framer-motion";
import { Bell, Crown, LogOut, Megaphone } from "lucide-react";
import { PagarGalat } from "@/components/pagar-galat";
import { AbsensiScreen } from "@/features/absensi/absensi-screen";
import { NotifikasiScreen } from "@/features/notifikasi/notifikasi-screen";
import { ModalAkunSosmed } from "@/features/profil/pengaturan-akun";
import { EmbedTerbaru } from "@/features/tv-rakyat/embed-terbaru";
import { TvrKuScreen } from "@/features/tvr-ku/tvrku-screen";
import { useAppStore } from "@/hooks/use-app-store";
import { bebasKewajiban } from "@/lib/jabatan";
import { matikanModeSimpel, tandaiModeSimpel } from "@/lib/mode-simpel";
import { getKomentarSaya, getLaporanVideo, getNotifikasi, masukOtomatis } from "@/services";
import type { User } from "@/types";
import { BIRU_SIMPEL, KepalaSimpel, KomenVideoSimpel, LeaderboardSimpel, PengaturanSimpel, PengumumanSimpel } from "./layar-simpel";

type Layar = "beranda" | "notifikasi" | "pengumuman" | "leaderboard" | "absen" | "komen" | "laporan" | "upload" | "postingan" | "pengaturan";

type Ringkas = {
  video: { jumlah: number; target: number; persen: number | null; dibebaskan: string | null } | null;
  komen: { sudah: number; total: number } | null;
};

const KELAS_TOMBOL =
  "flex min-h-[64px] w-full flex-col items-center justify-center rounded-2xl px-3 py-2 text-center text-[17px] font-extrabold uppercase leading-tight tracking-wide text-white active:opacity-80";

export function ModeSimpelApp() {
  const tema = useAppStore((s) => s.tema);
  const setUser = useAppStore((s) => s.setUser);
  const setNotifikasi = useAppStore((s) => s.setNotifikasi);
  const belumBaca = useAppStore((s) => s.notifikasi.reduce((n, item) => (item.dibaca ? n : n + 1), 0));

  const [user, setUserLokal] = useState<User | null>(null);
  const [keadaan, setKeadaan] = useState<"memeriksa" | "siap" | "perbaikan" | "menunggu">("memeriksa");
  const [layar, setLayar] = useState<Layar>("beranda");
  const [modalAkun, setModalAkun] = useState(false);
  const [ringkas, setRingkas] = useState<Ringkas>({ video: null, komen: null });
  const ringkasPada = useRef(0);

  // Tema mengikuti pilihan pengguna (tersimpan di store) — di "/" ini
  // dilakukan page.tsx; di sini harus diulang karena pohon itu tak dimuat.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "dark");
  }, [tema]);

  // Penanda global: CSS mematikan animasi/kaca buram, hook penyegar
  // berkala berhenti memasang interval.
  useEffect(() => {
    document.documentElement.dataset.modeSimpel = "1";
    tandaiModeSimpel(true);
    return () => {
      delete document.documentElement.dataset.modeSimpel;
    };
  }, []);

  const muatRingkas = useCallback(async () => {
    ringkasPada.current = Date.now();
    const [v, k] = await Promise.allSettled([getLaporanVideo(), getKomentarSaya()]);
    setRingkas({
      video:
        v.status === "fulfilled"
          ? { jumlah: v.value.data.length, target: v.value.kpi_target, persen: v.value.kpi_persen ?? null, dibebaskan: v.value.dibebaskan ?? null }
          : null,
      komen: k.status === "fulfilled" && k.value ? { sudah: k.value.sudah, total: k.value.total } : null,
    });
  }, []);

  const muatNotifikasi = useCallback(async () => {
    try {
      setNotifikasi(await getNotifikasi());
    } catch {
      // lonceng tetap tampil tanpa angka
    }
  }, [setNotifikasi]);

  // Sesi: token perangkat → /api/sesi. Tanpa sesi → ke "/" (layar masuk).
  useEffect(() => {
    let hidup = true;
    void (async () => {
      const u = await masukOtomatis();
      if (!hidup) return;
      if (u === "perbaikan") {
        setKeadaan("perbaikan");
        return;
      }
      if (!u) {
        window.location.replace("/");
        return;
      }
      if (u.status === "menunggu") {
        setKeadaan("menunggu");
        return;
      }
      setUser(u);
      setUserLokal(u);
      setKeadaan("siap");
      void muatRingkas();
      void muatNotifikasi();
    })();
    return () => {
      hidup = false;
    };
  }, [setUser, muatRingkas, muatNotifikasi]);

  // Kembali ke menu: segarkan angka KPI bila sudah > 1 menit.
  function keBeranda() {
    setLayar("beranda");
    if (Date.now() - ringkasPada.current > 60_000) void muatRingkas();
  }

  if (keadaan === "perbaikan" || keadaan === "menunggu") {
    return (
      <main className="mode-simpel min-h-screen px-5 pt-16 text-center">
        <p className="text-lg font-extrabold text-slate-900 dark:text-white">
          {keadaan === "perbaikan" ? "Aplikasi sedang diperbaiki" : "Akun menunggu persetujuan pengurus"}
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {keadaan === "perbaikan" ? "Coba lagi beberapa saat lagi." : "Begitu disetujui, Anda bisa langsung masuk."}
        </p>
        <button type="button" onClick={() => window.location.reload()} className="mt-6 h-12 w-full rounded-xl text-[15px] font-extrabold text-white" style={{ background: BIRU_SIMPEL }}>
          Coba lagi
        </button>
        <button type="button" onClick={matikanModeSimpel} className="mt-2 h-12 w-full rounded-xl bg-slate-200 text-[15px] font-extrabold text-slate-900 dark:bg-slate-700 dark:text-white">
          Keluar Mode Simpel
        </button>
      </main>
    );
  }

  if (keadaan === "memeriksa" || !user) {
    return (
      <main className="mode-simpel min-h-screen px-4 pt-4">
        <p className="text-xl font-extrabold text-slate-900 dark:text-white">MODE SIMPEL - SUPERAPP</p>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Memeriksa sesi…</p>
      </main>
    );
  }

  const bebas = bebasKewajiban(user);
  const v = ringkas.video;
  const k = ringkas.komen;

  return (
    <MotionConfig reducedMotion="always">
      <div className="mode-simpel min-h-screen">
        <PagarGalat nama="mode-simpel">
          {layar === "beranda" ? (
            <main className="mx-auto w-full max-w-md px-3 pb-10 pt-3">
              <h1 className="text-[21px] font-extrabold leading-tight text-slate-900 dark:text-white">MODE SIMPEL - SUPERAPP</h1>

              {/* Baris ikon: lonceng, toa, mahkota, Keluar */}
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    void muatNotifikasi();
                    setLayar("notifikasi");
                  }}
                  aria-label={belumBaca > 0 ? `Notifikasi, ${belumBaca} belum dibaca` : "Notifikasi"}
                  className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-900 active:opacity-70 dark:bg-slate-800 dark:text-white"
                >
                  <Bell className="h-5.5 w-5.5" aria-hidden="true" />
                  {belumBaca > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white" aria-hidden="true">
                      {belumBaca > 99 ? "99+" : belumBaca}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setLayar("pengumuman")}
                  aria-label="Pengumuman"
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-900 active:opacity-70 dark:bg-slate-800 dark:text-white"
                >
                  <Megaphone className="h-5.5 w-5.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setLayar("leaderboard")}
                  aria-label="Leaderboard kepatuhan komen"
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-amber-500 active:opacity-70 dark:bg-slate-800"
                >
                  <Crown className="h-5.5 w-5.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={matikanModeSimpel}
                  className="ml-auto flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-[14px] font-extrabold text-white active:opacity-80"
                  style={{ background: "#3B6FB6" }}
                  title="Kembali ke aplikasi lengkap"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Keluar
                </button>
              </div>

              {/* Dashboard singkat */}
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => setLayar("laporan")} className={KELAS_TOMBOL} style={{ background: BIRU_SIMPEL }} aria-label="KPI video, buka laporan video">
                  KPI Video
                  <span className="mt-0.5 text-[12px] font-bold normal-case tracking-normal text-white/90">
                    {bebas ? "Bebas kewajiban" : v ? (v.dibebaskan ? `Dibebaskan (${v.dibebaskan})` : `${v.jumlah}/${v.target} video${v.persen != null ? ` · ${v.persen}%` : ""}`) : "…"}
                  </span>
                </button>
                <button type="button" onClick={() => setLayar("komen")} className={KELAS_TOMBOL} style={{ background: BIRU_SIMPEL }} aria-label="KPI komen, buka komen video">
                  KPI Komen
                  <span className="mt-0.5 text-[12px] font-bold normal-case tracking-normal text-white/90">
                    {bebas ? "Bebas kewajiban" : k ? `${k.sudah}/${k.total} postingan${k.total > 0 ? ` · ${Math.round((100 * k.sudah) / k.total)}%` : ""}` : "…"}
                  </span>
                </button>
                <button type="button" onClick={() => setLayar("absen")} className={KELAS_TOMBOL} style={{ background: "linear-gradient(180deg, #2E6FBF 0%, #1E4E8C 55%, #163B6B 100%)" }}>
                  Absen
                </button>
                <button type="button" onClick={() => setModalAkun(true)} className={KELAS_TOMBOL} style={{ background: "linear-gradient(180deg, #2E6FBF 0%, #1E4E8C 55%, #163B6B 100%)" }}>
                  Kaitkan Akun
                </button>
              </div>

              {/* Modul utama */}
              <div className="mt-2.5 flex flex-col gap-2.5">
                <button type="button" onClick={() => setLayar("komen")} className={KELAS_TOMBOL} style={{ background: BIRU_SIMPEL }}>
                  Komen Video
                </button>
                <button type="button" onClick={() => setLayar("laporan")} className={KELAS_TOMBOL} style={{ background: BIRU_SIMPEL }}>
                  Laporan Video
                </button>
                <button type="button" onClick={() => setLayar("upload")} className={KELAS_TOMBOL} style={{ background: BIRU_SIMPEL }}>
                  Upload Video
                </button>
                <button type="button" onClick={() => setLayar("postingan")} className={KELAS_TOMBOL} style={{ background: BIRU_SIMPEL }}>
                  Postingan Terbaru
                </button>
                <button type="button" onClick={() => setLayar("pengaturan")} className={KELAS_TOMBOL} style={{ background: BIRU_SIMPEL }}>
                  Pengaturan
                </button>
              </div>
              <p className="mt-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
                {user.nama} · Mode ringan: animasi & proses latar dimatikan
              </p>
            </main>
          ) : layar === "notifikasi" ? (
            <div className="mode-simpel-layar">
              <NotifikasiScreen onTarget={keBeranda} onUltah={keBeranda} onKembali={keBeranda} />
            </div>
          ) : layar === "pengumuman" ? (
            <PengumumanSimpel onKembali={keBeranda} />
          ) : layar === "leaderboard" ? (
            <LeaderboardSimpel onKembali={keBeranda} namaSaya={user.nama} />
          ) : layar === "absen" ? (
            <div className="mode-simpel-layar">
              <AbsensiScreen user={user} onKembali={keBeranda} />
            </div>
          ) : layar === "komen" ? (
            <KomenVideoSimpel onKembali={keBeranda} />
          ) : layar === "laporan" ? (
            <div className="mode-simpel-layar">
              <KepalaSimpel judul="Laporan Video" onKembali={keBeranda} />
              <TvrKuScreen user={user} hanyaSeksi={["kpi", "laporan"]} tanpaHeader />
            </div>
          ) : layar === "upload" ? (
            <div className="mode-simpel-layar">
              <KepalaSimpel judul="Upload Video" onKembali={keBeranda} />
              <TvrKuScreen user={user} hanyaSeksi={["request-video", "akun", "unggah-sosmed"]} tanpaHeader />
            </div>
          ) : layar === "postingan" ? (
            <div className="mode-simpel-layar">
              <KepalaSimpel judul="Postingan Terbaru" onKembali={keBeranda} />
              <div className="mx-auto w-full max-w-md px-3 pb-10">
                <EmbedTerbaru />
              </div>
            </div>
          ) : (
            <PengaturanSimpel onKembali={keBeranda} namaUser={user.nama} />
          )}
          {modalAkun ? <ModalAkunSosmed onTutup={() => setModalAkun(false)} /> : null}
        </PagarGalat>
      </div>
    </MotionConfig>
  );
}
