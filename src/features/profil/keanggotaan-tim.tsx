"use client";

// ============================================================
// Seksi profil: KEANGGOTAAN TIM + menu Update Aplikasi.
//
// Tim: atasan menambahkan anggota (hanya role "anggota" yang bisa
// dijadikan bawahan), memantau ringkas kehadiran/KPI/video mereka,
// dan mengirim penugasan yang langsung masuk ke Rencana Kerja
// bawahan (harian atau besar) berikut notifikasinya.
//
// Update Aplikasi: membandingkan versi build yang sedang berjalan
// dengan rilis terbaru di server. Bila server lebih baru, muncul
// menu update — web cukup dimuat ulang, APK diarahkan ke tautan
// unduhan bila disediakan.
// ============================================================

import { useEffect, useState } from "react";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ClipboardList,
  Download,
  Loader2,
  Plus,
  Send,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FotoBulat } from "@/components/foto-bulat";
import { AvatarInisial, FadeInUp, SectionTitle, StatusBadge } from "@/components/pri-ui";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { bolehFitur } from "@/lib/fitur";
import {
  getPengajuanTim,
  getTim,
  getVersiTerbaru,
  keluarkanAnggotaTim,
  kirimTugas,
  putuskanPengajuanTim,
  tambahAnggotaTim,
  type AnggotaTimPantau,
  type BalasanTim,
  type PengajuanTim,
  type RilisAplikasi,
} from "@/services";
import { VERSI_APLIKASI } from "@/lib/versi";
import type { User } from "@/types";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Modal kirim tugas ke satu bawahan
// ------------------------------------------------------------

function ModalTugas({
  anggota,
  onTutup,
  onTerkirim,
}: {
  anggota: AnggotaTimPantau;
  onTutup: () => void;
  onTerkirim: () => void;
}) {
  const [deskripsi, setDeskripsi] = useState("");
  const [kategori, setKategori] = useState<"harian" | "besar">("harian");
  const [tenggat, setTenggat] = useState("");
  const [sedangKirim, setSedangKirim] = useState(false);

  async function kirim() {
    if (deskripsi.trim().length < 3 || sedangKirim) return;
    setSedangKirim(true);
    try {
      await kirimTugas({
        anggotaId: anggota.user_id,
        deskripsi: deskripsi.trim(),
        kategori,
        tenggat: kategori === "besar" && tenggat ? tenggat : undefined,
      });
      toast(
        "sukses",
        "Tugas terkirim",
        `${anggota.nama.split(" ")[0]} menerima notifikasi dan tugasnya masuk ke Rencana Kerja-nya.`,
      );
      onTerkirim();
    } catch (e) {
      toast("error", "Gagal mengirim tugas", e instanceof Error ? e.message : "");
      setSedangKirim(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onTutup}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Kirim tugas ke ${anggota.nama}`}
        className="glass-strong w-full max-w-[340px] rounded-2xl p-5"
        initial={{ scale: 0.92, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-base font-bold text-teks-utama">
          Tugas untuk {anggota.nama.split(" ")[0]}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-teks-sekunder">
          Tugas masuk langsung ke Rencana Kerja-nya beserta notifikasi, dan
          realisasinya bisa Anda pantau dari kartu tim.
        </p>

        <div className="mt-3.5 flex gap-2">
          {(
            [
              { kunci: "harian", label: "Harian" },
              { kunci: "besar", label: "Rencana Besar" },
            ] as const
          ).map((k) => (
            <button
              key={k.kunci}
              type="button"
              onClick={() => setKategori(k.kunci)}
              className={cn(
                "btn-tekan flex-1 rounded-xl py-2 text-xs font-bold",
                kategori === k.kunci ? "text-white" : "glass text-teks-sekunder",
              )}
              style={
                kategori === k.kunci
                  ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                  : undefined
              }
            >
              {k.label}
            </button>
          ))}
        </div>

        <textarea
          value={deskripsi}
          onChange={(e) => setDeskripsi(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Tulis isi tugas / pesan penugasan…"
          className="glass mt-3 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />

        {kategori === "besar" && (
          <label className="mt-2.5 block">
            <span className="text-[11px] font-semibold text-teks-sekunder">
              Tenggat (opsional)
            </span>
            <input
              type="date"
              value={tenggat}
              onChange={(e) => setTenggat(e.target.value)}
              className="glass mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm text-teks-utama focus:outline-none"
            />
          </label>
        )}

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onTutup}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void kirim()}
            disabled={deskripsi.trim().length < 3 || sedangKirim}
            className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
            }}
          >
            {sedangKirim ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Kirim Tugas
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// KartuTim — seksi KEANGGOTAAN TIM di profil
// ------------------------------------------------------------

export function KartuTim({ user }: { user: User }) {
  const izin = useAppStore((s) => s.izinFitur);
  const bolehTambah = bolehFitur(izin, "tim.tambah", user.role);
  const [data, setData] = useState<BalasanTim | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);
  const versiSegar = useVersiSegar();
  const [modalTambah, setModalTambah] = useState(false);
  const [tugasUntuk, setTugasUntuk] = useState<AnggotaTimPantau | null>(null);
  const [sedangProses, setSedangProses] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getTim();
        if (hidup) setData(hasil);
      } catch {
        // Seksi tim gagal dimuat tidak merusak profil — diamkan.
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang, versiSegar]);

  if (!data) return null;

  // Bukan atasan: cukup tampilkan siapa atasannya (bila ada).
  if (!data.boleh_punya_tim) {
    if (!data.atasan) return null;
    return (
      <FadeInUp delay={0.05}>
        <SectionTitle judul="Keanggotaan Tim" className="mt-6" />
        <GlassCard className="flex items-center gap-3 p-3.5">
          <Users className="h-4.5 w-4.5 shrink-0 text-pri" aria-hidden="true" />
          <p className="text-sm text-teks-utama">
            Anda anggota tim <span className="font-bold">{data.atasan.nama}</span>
          </p>
        </GlassCard>
      </FadeInUp>
    );
  }

  async function tambah(id: string, nama: string) {
    if (sedangProses) return;
    setSedangProses(true);
    try {
      await tambahAnggotaTim(id);
      toast("sukses", `${nama} bergabung ke tim Anda`);
      setModalTambah(false);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menambahkan", e instanceof Error ? e.message : "");
    } finally {
      setSedangProses(false);
    }
  }

  return (
    <FadeInUp delay={0.05}>
      <div className="mt-6 flex items-center justify-between">
        <SectionTitle judul="Keanggotaan Tim" className="!mt-0" />
        {bolehTambah && (
          <button
            type="button"
            onClick={() => setModalTambah(true)}
            className="btn-tekan flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Tambahkan Anggota
          </button>
        )}
      </div>

      {data.tim.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-center text-xs leading-relaxed text-teks-sekunder">
            Belum ada anggota tim. Ajukan anggota (khusus role Anggota);
            keanggotaan aktif setelah di-ACC super admin / admin HR.
          </p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:items-start">
          {data.tim.map((t) => (
            <GlassCard key={t.user_id} className="p-3.5">
              <div className="flex items-center gap-3">
                {t.avatar_url ? (
                  <FotoBulat src={t.avatar_url} ukuran={40} />
                ) : (
                  <AvatarInisial nama={t.nama} ukuran={40} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-teks-utama">{t.nama}</p>
                  <p className="mt-0.5 text-[11px] text-teks-sekunder">
                    Video {t.video_hari_ini}/5 · Rencana {t.rencana_selesai}/{t.rencana_total}
                    {t.kpi_persen !== null ? ` (${t.kpi_persen}%)` : ""}
                  </p>
                </div>
                {t.status_tim === "menunggu" ? (
                  <StatusBadge label="menunggu ACC" warna="kuning" berkedip />
                ) : (
                  <StatusBadge
                    label={t.kehadiran}
                    warna={
                      t.kehadiran === "masuk"
                        ? "hijau"
                        : t.kehadiran === "alfa"
                          ? "merah"
                          : t.kehadiran === "menunggu izin"
                            ? "kuning"
                            : "biru"
                    }
                  />
                )}
              </div>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  disabled={t.status_tim === "menunggu"}
                  onClick={() => setTugasUntuk(t)}
                  title={
                    t.status_tim === "menunggu"
                      ? "Menunggu ACC super admin / admin HR"
                      : undefined
                  }
                  className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                >
                  <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                  Beri Tugas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void keluarkanAnggotaTim(t.user_id)
                      .then(() => setMuatUlang((n) => n + 1))
                      .catch((e) =>
                        toast("error", "Gagal mengeluarkan", e instanceof Error ? e.message : ""),
                      );
                  }}
                  aria-label={`Keluarkan ${t.nama} dari tim`}
                  className="btn-tekan flex items-center justify-center rounded-xl border border-gagal/40 bg-gagal/5 px-3 py-2 text-gagal"
                >
                  <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Modal pilih kandidat (hanya role anggota yang belum bertim) */}
      <AnimatePresence>
        {modalTambah && (
          <motion.div
            className="fixed inset-0 z-[80] flex flex-col justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-md"
              onClick={() => setModalTambah(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Tambahkan anggota tim"
              className="glass-strong relative mx-auto flex max-h-[80dvh] w-full max-w-[440px] flex-col rounded-t-[2rem] px-5 pt-3 pb-8"
              initial={{ y: "102%" }}
              animate={{ y: 0 }}
              exit={{ y: "102%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <div className="mb-3 flex shrink-0 justify-center">
                <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
              </div>
              <h2 className="shrink-0 font-heading text-lg font-bold text-teks-utama">
                Tambahkan Anggota Tim
              </h2>
              <p className="mt-1 shrink-0 text-[12.5px] leading-relaxed text-teks-sekunder">
                Hanya pengguna berjabatan Anggota yang bisa ditambahkan, dan
                setiap anggota hanya bisa tergabung di satu tim.
              </p>
              <div className="scrollbar-tipis mt-4 flex flex-col gap-2 overflow-y-auto">
                {data.kandidat.length === 0 ? (
                  <p className="py-6 text-center text-xs text-teks-sekunder">
                    Tidak ada anggota yang bisa ditambahkan — semuanya sudah
                    tergabung di tim.
                  </p>
                ) : (
                  data.kandidat.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      disabled={sedangProses}
                      onClick={() => void tambah(k.id, k.nama)}
                      className="glass-soft btn-tekan flex items-center gap-3 rounded-2xl p-3 text-left disabled:opacity-50"
                    >
                      {k.avatar_url ? (
                        <FotoBulat src={k.avatar_url} ukuran={40} />
                      ) : (
                        <AvatarInisial nama={k.nama} ukuran={40} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-teks-utama">
                          {k.nama}
                        </span>
                        {k.jabatan && (
                          <span className="block text-[11px] text-teks-sekunder">{k.jabatan}</span>
                        )}
                      </span>
                      <Plus className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {tugasUntuk && (
          <ModalTugas
            anggota={tugasUntuk}
            onTutup={() => setTugasUntuk(null)}
            onTerkirim={() => {
              setTugasUntuk(null);
              setMuatUlang((n) => n + 1);
            }}
          />
        )}
      </AnimatePresence>
    </FadeInUp>
  );
}

// ------------------------------------------------------------
// MenuUpdateAplikasi — tampil hanya bila server punya versi lebih baru
// ------------------------------------------------------------

/** Banding versi "2.4.0" — positif bila a lebih baru dari b */
function bandingVersi(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const beda = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (beda !== 0) return beda;
  }
  return 0;
}

export function MenuUpdateAplikasi() {
  const [rilis, setRilis] = useState<RilisAplikasi | null>(null);
  const [modalBuka, setModalBuka] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const terbaru = await getVersiTerbaru();
      if (!hidup || !terbaru) return;
      if (bandingVersi(terbaru.versi, VERSI_APLIKASI) > 0) setRilis(terbaru);
    })();
    return () => {
      hidup = false;
    };
  }, []);

  if (!rilis) return null;

  return (
    <>
      <FadeInUp delay={0.04}>
        <button
          type="button"
          onClick={() => setModalBuka(true)}
          className="btn-tekan mt-6 flex w-full items-center gap-3 rounded-2xl border border-pri/40 bg-pri/10 px-4 py-3 text-left"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            aria-hidden="true"
          >
            <Download className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-teks-utama">
              Update Tersedia — v{rilis.versi}
            </span>
            <span className="block text-[11px] text-teks-sekunder">
              {rilis.wajib ? "Wajib diperbarui. " : ""}Ketuk untuk melihat fitur baru
            </span>
          </span>
          <StatusBadge label="baru" warna="pri" berkedip />
        </button>
      </FadeInUp>

      <AnimatePresence>
        {modalBuka && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-6 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModalBuka(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Fitur baru"
              className="glass-strong w-full max-w-[340px] rounded-2xl p-5"
              initial={{ scale: 0.92, opacity: 0, y: 14 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-heading text-base font-bold text-teks-utama">
                PRI SuperApp v{rilis.versi}
              </h3>
              <p className="mt-1 text-xs text-teks-sekunder">
                Anda memakai v{VERSI_APLIKASI}. Fitur baru:
              </p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {rilis.catatan.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-teks-utama">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sukses" aria-hidden="true" />
                    {c}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalBuka(false)}
                  className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
                >
                  <X className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  Nanti
                </button>
                {rilis.url_unduhan ? (
                  <a
                    href={rilis.url_unduhan}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Unduh
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                  >
                    Muat Ulang
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ------------------------------------------------------------
// AntreanAccTim — pengajuan keanggotaan tim yang menunggu keputusan
// super admin / admin HR. Hanya dua peran itu (plus master) yang
// bisa meng-ACC; ketua mengajukan, pusat yang mengesahkan.
// ------------------------------------------------------------

const PERAN_PENGACC = new Set(["super_admin", "admin_hr", "master"]);

export function AntreanAccTim({ user }: { user: User }) {
  const [daftar, setDaftar] = useState<PengajuanTim[] | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);
  const versiSegar = useVersiSegar();
  const [sedangPutus, setSedangPutus] = useState<string | null>(null);

  const bolehAcc = PERAN_PENGACC.has(user.role);

  useEffect(() => {
    if (!bolehAcc) return;
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getPengajuanTim();
        if (hidup) setDaftar(hasil);
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [bolehAcc, muatUlang, versiSegar]);

  if (!bolehAcc || !daftar || daftar.length === 0) return null;

  async function putuskan(id: string, setuju: boolean) {
    if (sedangPutus) return;
    setSedangPutus(id);
    try {
      await putuskanPengajuanTim(id, setuju);
      toast("sukses", setuju ? "Keanggotaan tim disetujui" : "Pengajuan ditolak");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menyimpan keputusan", e instanceof Error ? e.message : "");
    } finally {
      setSedangPutus(null);
    }
  }

  return (
    <FadeInUp delay={0.04}>
      <SectionTitle judul="ACC Keanggotaan Tim" className="mt-6" />
      <div className="flex flex-col gap-2">
        {daftar.map((p) => (
          <GlassCard key={p.id} className="p-3.5">
            <p className="text-sm font-semibold leading-snug text-teks-utama">
              <b>{p.atasan_nama}</b>
              {p.atasan_jabatan ? ` (${p.atasan_jabatan})` : ""} mengajukan{" "}
              <b>{p.anggota_nama}</b> sebagai anggota timnya.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                disabled={sedangPutus === p.id}
                onClick={() => void putuskan(p.id, true)}
                className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Setujui
              </button>
              <button
                type="button"
                disabled={sedangPutus === p.id}
                onClick={() => void putuskan(p.id, false)}
                className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gagal/40 bg-gagal/5 py-2 text-xs font-semibold text-gagal disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Tolak
              </button>
            </div>
          </GlassCard>
        ))}
      </div>
    </FadeInUp>
  );
}
