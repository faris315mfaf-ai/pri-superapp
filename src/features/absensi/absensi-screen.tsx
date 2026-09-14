"use client";

// ============================================================
// AbsensiScreen — PENAMPIL absensi (14 Sep 2026).
//
// SuperApp tidak lagi menjadi alat absen. Absen masuk/pulang, sakit,
// dan izin dilakukan di aplikasi SADAR (sadar-pri.id); yang tampil di
// sini adalah cerminannya — disegarkan dari SADAR tiap kali layar
// dibuka (paling cepat 60 dtk). Kamera, GPS, dan verifikasi wajah
// dibuang bersama tombol absennya: dua alat absen untuk satu orang hanya
// melahirkan dua catatan yang saling bertentangan.
//
// Yang tetap di sini: pengajuan izin/sakit SuperApp (surat) beserta
// antrean persetujuannya — alur HR yang tidak disentuh integrasi ini.
// ============================================================

import { useEffect, useState } from "react";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarCheck,
  Check,
  ExternalLink,
  FileText,
  HeartPulse,
  Loader2,
  MapPin,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sunrise,
  Sunset,
  Users,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import {
  EmptyState,
  FadeInUp,
  GlassSkeleton,
  ScreenHeader,
  SectionTitle,
  StatusBadge,
} from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import {
  ajukanPerizinan,
  getAbsensi,
  getPerizinan,
  putuskanPerizinan,
  type AbsensiBaris,
  type InfoSadar,
  type Perizinan,
} from "@/services";
import { bacaBerkas } from "@/lib/gambar";
import { jamWIB, tanggalIndonesia } from "@/lib/format";
import { labelSadar } from "@/lib/sadar";
import { statusTelat, tepatWaktu } from "@/lib/absensi-status";
import type { KomponenIkon, User } from "@/types";
import { cn } from "@/lib/utils";
import { PanelAbsensiSadar } from "./panel-absensi-sadar";

/**
 * Dua tampilan (14 Sep 2026):
 *  • "SuperApp" — cerminan yang sudah dicocokkan ke akun (jam masuk/pulang,
 *    tepat waktu/telat, izin SuperApp) — bentuk yang dipakai beranda & KPI.
 *  • "SADAR"    — seluruh isinya apa adanya dari SADAR, per tanggal.
 */
type TampilanAbsensi = "superapp" | "sadar";

const PERAN_HR = new Set(["admin_hr", "super_admin", "master"]);

type Jenis = "masuk" | "pulang";

const KONFIG_JENIS: Record<
  Jenis,
  { label: string; ikon: KomponenIkon; warna: string }
> = {
  masuk: { label: "Masuk", ikon: Sunrise, warna: "#10B981" },
  pulang: { label: "Pulang", ikon: Sunset, warna: "#F59E0B" },
};

// ------------------------------------------------------------
// Modal ajukan izin / sakit — surat WAJIB (JPG/PNG/PDF ≤ 1 MB)
// ------------------------------------------------------------

function ModalIzin({
  onTutup,
  onSukses,
}: {
  onTutup: () => void;
  onSukses: () => void;
}) {
  const [jenis, setJenis] = useState<"izin" | "sakit">("izin");
  const [keterangan, setKeterangan] = useState("");
  const [namaBerkas, setNamaBerkas] = useState("");
  const [suratDataUrl, setSuratDataUrl] = useState("");
  const [sedangKirim, setSedangKirim] = useState(false);

  async function pilihBerkas(e: React.ChangeEvent<HTMLInputElement>) {
    const berkas = e.target.files?.[0];
    if (!berkas) return;
    if (berkas.size > 1024 * 1024) {
      toast("peringatan", "Berkas terlalu besar", "Maksimal 1 MB (JPG/PNG/PDF).");
      return;
    }
    try {
      const dataUrl = await bacaBerkas(berkas);
      setSuratDataUrl(dataUrl);
      setNamaBerkas(berkas.name);
    } catch {
      toast("error", "Berkas tidak bisa dibaca");
    }
  }

  async function kirim() {
    if (!suratDataUrl || sedangKirim) return;
    setSedangKirim(true);
    try {
      await ajukanPerizinan({ jenis, keterangan, suratDataUrl });
      toast(
        "sukses",
        "Pengajuan terkirim",
        "Atasan dan Admin HR sudah diberi tahu beserta tautan suratnya.",
      );
      onSukses();
    } catch (e) {
      toast("error", "Pengajuan gagal", e instanceof Error ? e.message : "Coba lagi.");
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
        aria-label="Ajukan izin atau sakit"
        className="glass-strong w-full max-w-[340px] rounded-2xl p-5"
        initial={{ scale: 0.92, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-base font-bold text-teks-utama">
          Ajukan Izin / Sakit
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-teks-sekunder">
          Untuk hari ini. Bila disetujui atasan atau Admin HR, status kehadiran
          menjadi {jenis} dan kewajiban 5 video dibebaskan.
        </p>

        <div className="mt-3.5 flex gap-2">
          {(
            [
              { kunci: "izin", label: "Izin", Ikon: FileText, warna: "#3B82F6" },
              { kunci: "sakit", label: "Sakit", Ikon: HeartPulse, warna: "#EF4444" },
            ] as const
          ).map(({ kunci, label, Ikon, warna }) => (
            <button
              key={kunci}
              type="button"
              onClick={() => setJenis(kunci)}
              className={cn(
                "btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold",
                jenis === kunci ? "text-white" : "glass text-teks-sekunder",
              )}
              style={
                jenis === kunci
                  ? { background: warna, borderColor: warna }
                  : { borderColor: "transparent" }
              }
            >
              <Ikon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <textarea
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="Keterangan singkat (opsional)…"
          className="glass mt-3 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />

        {/* Surat WAJIB — tanpa bukti, tidak ada dasar persetujuan */}
        <label className="glass btn-tekan mt-2.5 flex cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-3">
          <FileText className="h-4.5 w-4.5 shrink-0 text-pri" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-teks-utama">
            {namaBerkas || `Unggah surat ${jenis} (wajib) — JPG/PNG/PDF`}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={(e) => void pilihBerkas(e)}
            className="hidden"
          />
        </label>

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
            disabled={!suratDataUrl || sedangKirim}
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
            Ajukan
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// Kartu satu baris absensi (riwayat) — dari SADAR: jam + status;
// baris lama era swafoto masih menampilkan foto & petanya.
// ------------------------------------------------------------

function BarisRiwayat({
  baris,
  tampilkanNama,
}: {
  baris: AbsensiBaris;
  tampilkanNama: boolean;
}) {
  const konfig = KONFIG_JENIS[baris.jenis];
  const dariSadar = baris.sumber === "sadar";
  const keterangan = dariSadar
    ? labelSadar(baris.status_sadar, baris.tipe_sadar)
    : (baris.alamat ?? (baris.lat != null && baris.lng != null ? `${baris.lat.toFixed(5)}, ${baris.lng.toFixed(5)}` : ""));
  return (
    <GlassCard className="flex items-center gap-3 p-3">
      {baris.foto_url ? (
        <img src={baris.foto_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" loading="lazy" />
      ) : (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${konfig.warna}1a`, color: konfig.warna }}
        >
          <konfig.ikon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <span className="text-sm font-bold text-teks-utama">
          {konfig.label} · {jamWIB(baris.waktu)}
        </span>
        {tampilkanNama && (
          <p className="mt-0.5 truncate text-xs font-semibold text-teks-utama">{baris.nama}</p>
        )}
        <p className="mt-0.5 truncate text-[11px] text-teks-sekunder">
          {baris.jenis === "masuk" ? (
            <span className={cn("font-semibold", tepatWaktu(baris.waktu) ? "text-sukses" : "text-gagal")}>
              {statusTelat(baris.waktu)}
            </span>
          ) : null}
          {baris.jenis === "masuk" && keterangan ? " · " : ""}
          {keterangan}
        </p>
      </div>
      {dariSadar ? (
        <span className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-full" title="Tercatat di SADAR">
          <ShieldCheck className="h-4 w-4 text-pri" aria-hidden="true" />
        </span>
      ) : baris.lat != null && baris.lng != null ? (
        <a
          href={`https://maps.google.com/?q=${baris.lat},${baris.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          aria-label="Lihat titik absen di peta"
        >
          <MapPin className="h-4 w-4 text-pri" aria-hidden="true" />
        </a>
      ) : null}
    </GlassCard>
  );
}

// ------------------------------------------------------------
// AbsensiScreen
// ------------------------------------------------------------

type AbsensiScreenProps = {
  user: User;
  onKembali: () => void;
};

export function AbsensiScreen({ user, onKembali }: AbsensiScreenProps) {
  const bolehLihatSemua = PERAN_HR.has(user.role);
  const [tampilan, setTampilan] = useState<TampilanAbsensi>("superapp");
  const [modeSemua, setModeSemua] = useState(false);
  const [memuat, setMemuat] = useState(true);
  const [daftar, setDaftar] = useState<AbsensiBaris[]>([]);
  const [hariIni, setHariIni] = useState("");
  const [sadar, setSadar] = useState<InfoSadar | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);
  // Perizinan: pengajuan sendiri + antrean yang menunggu keputusan saya
  const [izinSaya, setIzinSaya] = useState<Perizinan[]>([]);
  const [antreanIzin, setAntreanIzin] = useState<Perizinan[]>([]);
  const [modalIzin, setModalIzin] = useState(false);
  const [muatUlangIzin, setMuatUlangIzin] = useState(0);
  const versiSegar = useVersiSegar();
  const [sedangPutus, setSedangPutus] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      await Promise.resolve();
      if (!hidup) return;
      setMemuat(true);
      try {
        const hasil = await getAbsensi(modeSemua);
        if (!hidup) return;
        setDaftar(hasil.data);
        setHariIni(hasil.tanggal_hari_ini);
        setSadar(hasil.sadar);
      } catch (e) {
        if (hidup) {
          toast("error", "Gagal memuat absensi", e instanceof Error ? e.message : "");
        }
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [modeSemua, muatUlang, versiSegar]);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [sendiri, antrean] = await Promise.all([
          getPerizinan(false),
          getPerizinan(true).catch(() => [] as Perizinan[]),
        ]);
        if (!hidup) return;
        setIzinSaya(sendiri);
        setAntreanIzin(antrean.filter((a) => a.status === "menunggu"));
      } catch {
        // Perizinan gagal dimuat tidak menghalangi layar — diamkan.
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlangIzin, versiSegar]);

  async function putuskan(id: string, keputusan: "disetujui" | "ditolak") {
    if (sedangPutus) return;
    setSedangPutus(id);
    try {
      await putuskanPerizinan({ id, keputusan });
      toast("sukses", keputusan === "disetujui" ? "Pengajuan disetujui" : "Pengajuan ditolak");
      setMuatUlangIzin((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menyimpan keputusan", e instanceof Error ? e.message : "");
    } finally {
      setSedangPutus(null);
    }
  }

  const izinHariIni = izinSaya.find((i) => i.tanggal_wib === hariIni) ?? null;

  // Status hari ini SELALU milik sendiri, juga saat HR sedang
  // melihat mode semua anggota.
  const milikSendiri = daftar.filter((b) => b.user_id === user.id);
  const absenHariIni = (jenis: Jenis) =>
    milikSendiri.find((b) => b.tanggal_wib === hariIni && b.jenis === jenis) ?? null;
  const masukHariIni = absenHariIni("masuk");
  const statusSadarHariIni = masukHariIni ? labelSadar(masukHariIni.status_sadar, masukHariIni.tipe_sadar) : "";

  // Riwayat dikelompokkan per tanggal (terbaru dulu)
  const kelompok = new Map<string, AbsensiBaris[]>();
  for (const b of modeSemua ? daftar : milikSendiri) {
    const ada = kelompok.get(b.tanggal_wib);
    if (ada) ada.push(b);
    else kelompok.set(b.tanggal_wib, [b]);
  }

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-16">
      <ScreenHeader judul="Absensi" onKembali={onKembali} />

      {/* Dua pilihan tampilan */}
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Tampilan absensi">
        {(
          [
            ["superapp", "Absensi SuperApp"],
            ["sadar", "Absensi SADAR"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tampilan === k}
            onClick={() => setTampilan(k)}
            className={cn(
              "btn-tekan flex-1 rounded-full px-3 py-2 text-xs font-bold",
              tampilan === k ? "text-white" : "glass text-teks-sekunder",
            )}
            style={tampilan === k ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {tampilan === "sadar" ? (
        <>
          {bolehLihatSemua && (
            <div className="mb-3 flex gap-2">
              {[
                { kunci: false, label: "Saya" },
                { kunci: true, label: "Semua Anggota" },
              ].map((s) => (
                <button
                  key={String(s.kunci)}
                  type="button"
                  onClick={() => setModeSemua(s.kunci)}
                  className={cn(
                    "btn-tekan flex-1 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                    modeSemua === s.kunci ? "bg-pri text-white" : "glass-soft text-teks-sekunder",
                  )}
                >
                  {s.kunci && <Users className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <PanelAbsensiSadar semua={bolehLihatSemua && modeSemua} />
          <p className="mt-3 text-center text-[10px] text-teks-sekunder/80">
            Seluruh data di tampilan ini apa adanya dari SADAR (sadar-pri.id)
          </p>
        </>
      ) : (
      <>
      {/* Kartu hari ini — cerminan SADAR */}
      <FadeInUp>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-teks-sekunder">
              {hariIni ? tanggalIndonesia(`${hariIni}T00:00:00+07:00`) : "…"}
            </p>
            <button
              type="button"
              onClick={() => setMuatUlang((n) => n + 1)}
              disabled={memuat}
              aria-label="Segarkan dari SADAR"
              className="btn-tekan flex items-center gap-1 text-[11px] font-semibold text-pri disabled:opacity-60"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", memuat && "animate-spin")} aria-hidden="true" />
              Segarkan
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {(["masuk", "pulang"] as const).map((jenis) => {
              const konfig = KONFIG_JENIS[jenis];
              const sudah = absenHariIni(jenis);
              return (
                <div key={jenis} className="glass rounded-2xl p-3.5">
                  <div className="flex items-center justify-between">
                    <konfig.ikon className="h-5 w-5" style={{ color: konfig.warna }} aria-hidden="true" />
                    {sudah ? (
                      <StatusBadge label={jamWIB(sudah.waktu)} warna="hijau" />
                    ) : (
                      <StatusBadge label="belum" warna="netral" />
                    )}
                  </div>
                  <p className="mt-2.5 font-heading text-sm font-bold text-teks-utama">
                    Absen {konfig.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
                    {sudah
                      ? jenis === "masuk"
                        ? statusTelat(sudah.waktu)
                        : "Tercatat di SADAR"
                      : "Belum tercatat di SADAR"}
                  </p>
                </div>
              );
            })}
          </div>
          {statusSadarHariIni && (
            <p className="mt-2 text-center text-[11px] text-teks-sekunder">
              Status SADAR: <b className="font-semibold text-teks-utama">{statusSadarHariIni}</b>
              {masukHariIni?.verifikasi_sadar ? ` · ${labelSadar(masukHariIni.verifikasi_sadar, "")}` : ""}
            </p>
          )}

          {/* Pintu ke SADAR — di sinilah absen dilakukan */}
          <a
            href={sadar?.url || "https://sadar-pri.id"}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-tekan mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Absen di Aplikasi SADAR
          </a>

          {/* Perizinan hari ini: status pengajuan, atau tombol ajukan */}
          {izinHariIni ? (
            <div className="glass mt-3 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5">
              {izinHariIni.jenis === "sakit" ? (
                <HeartPulse className="h-4 w-4 shrink-0 text-gagal" aria-hidden="true" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 text-xs font-semibold text-teks-utama">
                Pengajuan {izinHariIni.jenis} hari ini
              </span>
              <StatusBadge
                label={izinHariIni.status}
                warna={
                  izinHariIni.status === "disetujui"
                    ? "hijau"
                    : izinHariIni.status === "ditolak"
                      ? "merah"
                      : "kuning"
                }
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setModalIzin(true)}
              className="glass btn-tekan mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-teks-utama"
            >
              <FileText className="h-4 w-4 text-pri" aria-hidden="true" />
              Ajukan Izin / Sakit (wajib surat)
            </button>
          )}
          <p className="mt-3 text-center text-[10px] text-teks-sekunder/80">
            {sadar && !sadar.siap
              ? "Integrasi SADAR belum diatur di server — hubungi admin."
              : sadar?.galat
                ? `SADAR sedang tidak terjangkau (${sadar.galat}) — menampilkan data terakhir.`
                : "Data absensi ditarik dari SADAR · SuperApp hanya menampilkan"}
          </p>
        </GlassCard>
      </FadeInUp>

      {/* Antrean persetujuan izin/sakit — hanya tampil bila ada */}
      {antreanIzin.length > 0 && (
        <FadeInUp delay={0.04}>
          <SectionTitle judul="Menunggu Persetujuan Anda" className="mt-5" />
          <div className="flex flex-col gap-2">
            {antreanIzin.map((a) => (
              <GlassCard key={a.id} className="p-3.5">
                <div className="flex items-start gap-2.5">
                  {a.jenis === "sakit" ? (
                    <HeartPulse className="mt-0.5 h-4.5 w-4.5 shrink-0 text-gagal" aria-hidden="true" />
                  ) : (
                    <FileText className="mt-0.5 h-4.5 w-4.5 shrink-0 text-info" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-teks-utama">
                      {a.nama} · {a.jenis}
                    </p>
                    <p className="mt-0.5 text-[11px] text-teks-sekunder">
                      {tanggalIndonesia(`${a.tanggal_wib}T00:00:00+07:00`)}
                      {a.keterangan ? ` · ${a.keterangan}` : ""}
                    </p>
                    {a.surat_url && (
                      <a
                        href={a.surat_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-pri underline-offset-4 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        Lihat Surat
                      </a>
                    )}
                  </div>
                </div>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    disabled={sedangPutus === a.id}
                    onClick={() => void putuskan(a.id, "disetujui")}
                    className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Setujui
                  </button>
                  <button
                    type="button"
                    disabled={sedangPutus === a.id}
                    onClick={() => void putuskan(a.id, "ditolak")}
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
      )}

      {/* Saklar HR: riwayat saya / semua anggota */}
      {bolehLihatSemua && (
        <FadeInUp delay={0.05}>
          <div className="mt-4 flex gap-2">
            {[
              { kunci: false, label: "Riwayat Saya" },
              { kunci: true, label: "Semua Anggota" },
            ].map((s) => (
              <button
                key={String(s.kunci)}
                type="button"
                onClick={() => setModeSemua(s.kunci)}
                className={cn(
                  "btn-tekan flex-1 rounded-full px-3 py-2 text-xs font-bold",
                  modeSemua === s.kunci
                    ? "text-white"
                    : "glass text-teks-sekunder",
                )}
                style={
                  modeSemua === s.kunci
                    ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                    : undefined
                }
              >
                {s.kunci && <Users className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
                {s.label}
              </button>
            ))}
          </div>
          {modeSemua && sadar && sadar.tidak_cocok > 0 && (
            <p className="mt-2 text-[11px] text-teks-sekunder">
              {sadar.tidak_cocok} orang di SADAR hari ini belum punya akun SuperApp dengan email yang
              sama — absennya tidak bisa ditampilkan di sini.
            </p>
          )}
        </FadeInUp>
      )}

      {/* Riwayat */}
      <FadeInUp delay={0.1}>
        <SectionTitle judul={modeSemua ? "Riwayat 7 Hari Terakhir" : "Riwayat 60 Hari Terakhir"} className="mt-5" />
        {memuat ? (
          <div className="flex flex-col gap-2">
            <GlassSkeleton className="h-20 rounded-2xl" />
            <GlassSkeleton className="h-20 rounded-2xl" />
          </div>
        ) : kelompok.size === 0 ? (
          <EmptyState
            ikon={CalendarCheck}
            judul="Belum Ada Absensi"
            keterangan="Absen yang tercatat di SADAR akan tampil di sini. Pastikan email akun SADAR sama dengan email akun SuperApp."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {Array.from(kelompok.entries()).map(([tanggal, barisan]) => (
              <div key={tanggal}>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-teks-sekunder">
                  {tanggalIndonesia(`${tanggal}T00:00:00+07:00`)}
                </p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {barisan.map((b) => (
                    <BarisRiwayat key={b.id} baris={b} tampilkanNama={modeSemua} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </FadeInUp>

      </>
      )}

      <AnimatePresence>
        {modalIzin && (
          <ModalIzin
            onTutup={() => setModalIzin(false)}
            onSukses={() => {
              setModalIzin(false);
              setMuatUlangIzin((n) => n + 1);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
