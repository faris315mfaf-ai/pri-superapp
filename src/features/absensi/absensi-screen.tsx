"use client";

// ============================================================
// AbsensiScreen — absen masuk/pulang dengan swafoto + GPS.
//
// Anti-akal-akalan, dari sisi layar:
// - Foto DIPAKSA dari kamera depan hidup (getUserMedia). Tidak ada
//   tombol pilih dari galeri, jadi tidak bisa memakai foto lama.
// - GPS wajib terkunci sebelum tombol kirim menyala.
// - Jam yang tercatat adalah jam SERVER; jam yang tampil di sini
//   hanya pratinjau. Mengubah jam ponsel tidak berpengaruh.
//
// Data (foto + lokasi) terhapus otomatis setelah 7 hari — penjelasan
// ini ditampilkan ke pengguna supaya tidak ada yang kaget.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CameraOff,
  CalendarCheck,
  Check,
  ExternalLink,
  FileText,
  HeartPulse,
  Loader2,
  MapPin,
  RefreshCcw,
  Send,
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
  kirimAbsen,
  putuskanPerizinan,
  type AbsensiBaris,
  type Perizinan,
} from "@/services";
import { bacaBerkas } from "@/lib/gambar";
import { jamWIB, tanggalIndonesia } from "@/lib/format";
import type { KomponenIkon, User } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Filter kamera ala B612 (spek 1.15). CSS filter murni supaya efek
 * yang terlihat di pratinjau PERSIS sama dengan yang terpanggang ke
 * foto (ctx.filter memakai sintaks yang sama). Tanpa blur — foto
 * absensi tetap harus bisa dipakai verifikasi wajah.
 */
const FILTER_KAMERA: { id: string; label: string; css: string }[] = [
  { id: "normal", label: "Normal", css: "none" },
  { id: "cerah", label: "Cerah", css: "brightness(1.15) contrast(1.05)" },
  { id: "halus", label: "Halus", css: "brightness(1.1) saturate(0.9) contrast(0.95)" },
  { id: "hangat", label: "Hangat", css: "sepia(0.25) saturate(1.2) brightness(1.05)" },
  { id: "sejuk", label: "Sejuk", css: "hue-rotate(15deg) saturate(1.1) brightness(1.02)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.1)" },
];

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
// Modal kamera + GPS
// ------------------------------------------------------------

type StatusGps =
  | { tahap: "meminta" }
  | { tahap: "dapat"; lat: number; lng: number; akurasi: number }
  | { tahap: "gagal"; pesan: string };

type ModalAbsenProps = {
  jenis: Jenis;
  onTutup: () => void;
  onSukses: (baris: AbsensiBaris) => void;
};

function ModalAbsen({ jenis, onTutup, onSukses }: ModalAbsenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Filter kamera ala B612 (spek 1.15) — indeks ke FILTER_KAMERA;
  // CSS-nya dipakai di pratinjau DAN dipanggang ke hasil jepretan.
  const [filterKamera, setFilterKamera] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [kameraGagal, setKameraGagal] = useState("");
  const [gps, setGps] = useState<StatusGps>({ tahap: "meminta" });
  const [foto, setFoto] = useState("");
  const [sedangKirim, setSedangKirim] = useState(false);
  const konfig = KONFIG_JENIS[jenis];

  // Nyalakan kamera DEPAN. Sengaja tanpa fallback unggah berkas:
  // celah "pilih foto lama dari galeri" itulah yang mau ditutup.
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false,
        });
        if (!hidup) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      } catch {
        if (hidup) {
          setKameraGagal(
            "Kamera tidak bisa diakses. Izinkan kamera di pengaturan peramban, lalu buka lagi.",
          );
        }
      }
    })();
    return () => {
      hidup = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Kunci lokasi GPS — wajib sebelum bisa kirim. setState di sini
  // sengaja ditunda ke belakang microtask: aturan lint proyek ini
  // melarang setState sinkron di dalam badan effect.
  const mintaGps = useCallback(() => {
    void (async () => {
      await Promise.resolve();
      setGps({ tahap: "meminta" });
      if (!navigator.geolocation) {
        setGps({ tahap: "gagal", pesan: "Perangkat ini tidak mendukung GPS." });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setGps({
            tahap: "dapat",
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            akurasi: Math.round(pos.coords.accuracy),
          }),
        () =>
          setGps({
            tahap: "gagal",
            pesan: "Lokasi tidak terbaca. Nyalakan GPS dan izinkan akses lokasi.",
          }),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    })();
  }, []);
  useEffect(mintaGps, [mintaGps]);

  /**
   * Jepret dari video ke JPEG maksimal ~100 KB, supaya penyimpanan
   * tidak membengkak (server menolak di atas 150 KB sebagai penjaga).
   * Mutu diturunkan bertahap; kalau masih besar, dimensinya diperkecil.
   */
  function jepret() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    // panjang base64 ≈ 4/3 ukuran byte
    const BATAS_PANJANG = 100 * 1024 * (4 / 3);

    function kompres(sisiMaks: number): string | null {
      const v = videoRef.current;
      if (!v) return null;
      const skala = Math.min(1, sisiMaks / Math.max(v.videoWidth, v.videoHeight));
      const kanvas = document.createElement("canvas");
      kanvas.width = Math.round(v.videoWidth * skala);
      kanvas.height = Math.round(v.videoHeight * skala);
      const ctx = kanvas.getContext("2d");
      if (!ctx) return null;
      // MIRROR (spek 1.15): hasil jepretan dibalik horizontal sama
      // seperti pratinjau — yang tersimpan persis yang dilihat pengguna.
      ctx.translate(kanvas.width, 0);
      ctx.scale(-1, 1);
      // Filter pilihan ikut terpanggang ke foto.
      ctx.filter = FILTER_KAMERA[filterKamera]?.css ?? "none";
      ctx.drawImage(v, 0, 0, kanvas.width, kanvas.height);
      for (const mutu of [0.7, 0.6, 0.5, 0.4, 0.35, 0.3]) {
        const hasil = kanvas.toDataURL("image/jpeg", mutu);
        if (hasil.length <= BATAS_PANJANG) return hasil;
      }
      return null;
    }

    // 640 px cukup tajam untuk verifikasi wajah; 480/360 cadangan
    // untuk kamera yang gambarnya sulit dikompres.
    const hasil = kompres(640) ?? kompres(480) ?? kompres(360);
    if (hasil) setFoto(hasil);
    else toast("error", "Foto gagal dikompres", "Coba jepret ulang.");
  }

  async function kirim() {
    if (gps.tahap !== "dapat" || !foto || sedangKirim) return;
    setSedangKirim(true);
    try {
      const baris = await kirimAbsen({
        jenis,
        lat: gps.lat,
        lng: gps.lng,
        akurasi: gps.akurasi,
        fotoDataUrl: foto,
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      toast("sukses", `Absen ${konfig.label.toLowerCase()} tercatat`, jamWIB(baris.waktu) + " WIB");
      onSukses(baris);
    } catch (e) {
      toast("error", "Absen gagal", e instanceof Error ? e.message : "Coba lagi.");
      setSedangKirim(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Absen ${konfig.label}`}
        className="glass-strong w-full max-w-[340px] rounded-2xl p-4"
        initial={{ scale: 0.92, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-base font-bold text-teks-utama">
            Absen {konfig.label}
          </h3>
          <konfig.ikon className="h-5 w-5" style={{ color: konfig.warna }} aria-hidden="true" />
        </div>

        {/* Bingkai kamera / hasil jepretan */}
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-black/70">
          {kameraGagal ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <CameraOff className="h-8 w-8 text-white/60" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-white/80">{kameraGagal}</p>
            </div>
          ) : foto ? (
            // Hasil jepretan — inilah yang akan terkirim
            <img src={foto} alt="Hasil swafoto absen" className="h-full w-full object-cover" />
          ) : (
            // TIDAK dicerminkan — sengaja. Dulu pratinjau dibalik seperti
            // cermin sementara foto tersimpan tidak dibalik, sehingga
            // hasilnya terasa "berbeda dari yang tadi dilihat" (mis.
            // tulisan di kaus terbaca terbalik saat memotret). Untuk
            // foto absen yang gunanya verifikasi, pratinjau dan hasil
            // wajib sama persis.
            <video
              ref={videoRef}
              playsInline
              muted
              // Mirror ala cermin (spek 1.15) + filter live
              className="h-full w-full -scale-x-100 object-cover"
              style={{ filter: FILTER_KAMERA[filterKamera]?.css ?? "none" }}
            />
          )}

          {/* Baris status GPS di atas bingkai */}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-6">
            <MapPin
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                gps.tahap === "dapat"
                  ? "text-emerald-400"
                  : gps.tahap === "gagal"
                    ? "text-red-400"
                    : "text-white/70",
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/90">
              {gps.tahap === "meminta" && "Mengunci lokasi GPS…"}
              {gps.tahap === "dapat" &&
                `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (±${gps.akurasi} m)`}
              {gps.tahap === "gagal" && gps.pesan}
            </span>
            {gps.tahap === "gagal" && (
              <button
                type="button"
                onClick={mintaGps}
                className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white"
              >
                Ulangi
              </button>
            )}
          </div>
        </div>

        <p className="mt-2.5 text-center text-[11px] leading-relaxed text-teks-sekunder">
          Waktu dan tanggal dicatat oleh server, lengkap dengan titik lokasi.
          Foto terhapus otomatis setelah 7 hari.
        </p>

        {/* Pilihan filter ala B612 (spek 1.15) — hanya saat kamera hidup */}
        {!foto && !kameraGagal && (
          <div className="scrollbar-tipis mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {FILTER_KAMERA.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterKamera(i)}
                aria-pressed={filterKamera === i}
                className={
                  "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold " +
                  (filterKamera === i ? "text-white" : "glass-soft text-teks-sekunder")
                }
                style={
                  filterKamera === i
                    ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                    : undefined
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Tombol aksi */}
        <div className="mt-3.5 flex gap-2.5">
          <button
            type="button"
            onClick={() => {
              streamRef.current?.getTracks().forEach((t) => t.stop());
              onTutup();
            }}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
          >
            Batal
          </button>
          {foto ? (
            <>
              <button
                type="button"
                onClick={() => setFoto("")}
                disabled={sedangKirim}
                className="glass btn-tekan flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-teks-utama"
              >
                <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                Ulangi
              </button>
              <button
                type="button"
                onClick={() => void kirim()}
                disabled={gps.tahap !== "dapat" || sedangKirim}
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
                Kirim
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={jepret}
              disabled={Boolean(kameraGagal)}
              className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
              }}
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              Ambil Foto
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

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
// Kartu satu baris absensi (riwayat)
// ------------------------------------------------------------

function BarisRiwayat({
  baris,
  tampilkanNama,
  onPerbesar,
}: {
  baris: AbsensiBaris;
  tampilkanNama: boolean;
  onPerbesar: () => void;
}) {
  const konfig = KONFIG_JENIS[baris.jenis];
  return (
    <GlassCard className="flex items-center gap-3 p-3">
      {baris.foto_url ? (
        <button
          type="button"
          onClick={onPerbesar}
          aria-label="Perbesar foto absen"
          className="btn-tekan shrink-0"
        >
          <img
            src={baris.foto_url}
            alt=""
            className="h-14 w-14 rounded-xl object-cover"
            loading="lazy"
          />
        </button>
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-black/10">
          <Camera className="h-5 w-5 text-teks-sekunder" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <konfig.ikon className="h-4 w-4 shrink-0" style={{ color: konfig.warna }} aria-hidden="true" />
          <span className="text-sm font-bold text-teks-utama">
            {konfig.label} · {jamWIB(baris.waktu)}
          </span>
        </div>
        {tampilkanNama && (
          <p className="mt-0.5 truncate text-xs font-semibold text-teks-utama">{baris.nama}</p>
        )}
        <p className="mt-0.5 truncate text-[11px] text-teks-sekunder">
          {baris.alamat ?? `${baris.lat.toFixed(5)}, ${baris.lng.toFixed(5)}`}
        </p>
      </div>
      <a
        href={`https://maps.google.com/?q=${baris.lat},${baris.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        aria-label="Lihat titik absen di peta"
      >
        <MapPin className="h-4 w-4 text-pri" aria-hidden="true" />
      </a>
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
  const [modeSemua, setModeSemua] = useState(false);
  const [memuat, setMemuat] = useState(true);
  const [daftar, setDaftar] = useState<AbsensiBaris[]>([]);
  const [hariIni, setHariIni] = useState("");
  const [modalJenis, setModalJenis] = useState<Jenis | null>(null);
  // Foto absen yang sedang diperbesar (lightbox)
  const [fotoBesar, setFotoBesar] = useState<AbsensiBaris | null>(null);
  // Perizinan: pengajuan sendiri + antrean yang menunggu keputusan saya
  const [izinSaya, setIzinSaya] = useState<Perizinan[]>([]);
  const [antreanIzin, setAntreanIzin] = useState<Perizinan[]>([]);
  const [modalIzin, setModalIzin] = useState(false);
  const [muatUlangIzin, setMuatUlangIzin] = useState(0);
  const versiSegar = useVersiSegar();
  const [sedangPutus, setSedangPutus] = useState<string | null>(null);

  // Muat riwayat tiap kali saklar mode berubah. setState hanya
  // dilakukan setelah await (aturan lint react-hooks proyek ini),
  // dan penanda `hidup` mencegah setState setelah layar ditutup.
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
  }, [modeSemua]);

  // Muat data perizinan: pengajuan sendiri, dan (bila saya atasan/HR)
  // pengajuan bawahan yang menunggu keputusan. Server yang menentukan
  // siapa boleh melihat apa — anggota tanpa bawahan menerima [].
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
        // Perizinan gagal dimuat tidak menghalangi absen — diamkan.
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

      {/* Kartu absen hari ini */}
      <FadeInUp>
        <GlassCard className="p-4">
          <p className="text-xs font-semibold text-teks-sekunder">
            {hariIni ? tanggalIndonesia(`${hariIni}T00:00:00+07:00`) : "…"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {(["masuk", "pulang"] as const).map((jenis) => {
              const konfig = KONFIG_JENIS[jenis];
              const sudah = absenHariIni(jenis);
              return (
                <button
                  key={jenis}
                  type="button"
                  disabled={Boolean(sudah) || memuat}
                  onClick={() => setModalJenis(jenis)}
                  className={cn(
                    "glass rounded-2xl p-3.5 text-left",
                    sudah ? "opacity-90" : "btn-tekan",
                  )}
                >
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
                    {sudah ? "Sudah tercatat" : "Kamera depan + GPS"}
                  </p>
                </button>
              );
            })}
          </div>
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
            Foto, lokasi, dan waktu diverifikasi server · data terhapus otomatis setelah 7 hari
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
        </FadeInUp>
      )}

      {/* Riwayat 7 hari */}
      <FadeInUp delay={0.1}>
        <SectionTitle judul="Riwayat 7 Hari Terakhir" className="mt-5" />
        {memuat ? (
          <div className="flex flex-col gap-2">
            <GlassSkeleton className="h-20 rounded-2xl" />
            <GlassSkeleton className="h-20 rounded-2xl" />
          </div>
        ) : kelompok.size === 0 ? (
          <EmptyState
            ikon={CalendarCheck}
            judul="Belum Ada Absensi"
            keterangan="Absen pertama Anda akan tampil di sini. Data tersimpan 7 hari."
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
                    <BarisRiwayat
                      key={b.id}
                      baris={b}
                      tampilkanNama={modeSemua}
                      onPerbesar={() => setFotoBesar(b)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </FadeInUp>

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
        {modalJenis && (
          <ModalAbsen
            jenis={modalJenis}
            onTutup={() => setModalJenis(null)}
            onSukses={(baris) => {
              setModalJenis(null);
              setDaftar((d) => [baris, ...d]);
            }}
          />
        )}
      </AnimatePresence>

      {/* Lightbox foto absen — foto + bukti waktu/lokasi dalam satu layar */}
      <AnimatePresence>
        {fotoBesar && (
          <motion.div
            className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-5 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFotoBesar(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Foto absen diperbesar"
          >
            <motion.div
              className="w-full max-w-[380px]"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={fotoBesar.foto_url}
                alt="Foto absen"
                className="max-h-[65dvh] w-full rounded-2xl object-contain"
              />
              <div className="glass-strong mt-3 rounded-2xl p-3.5">
                <p className="text-sm font-bold text-teks-utama">
                  {KONFIG_JENIS[fotoBesar.jenis].label} · {jamWIB(fotoBesar.waktu)} ·{" "}
                  {tanggalIndonesia(fotoBesar.waktu)}
                </p>
                {fotoBesar.nama && (
                  <p className="mt-0.5 text-xs font-semibold text-teks-utama">
                    {fotoBesar.nama}
                  </p>
                )}
                <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
                  {fotoBesar.alamat ??
                    `${fotoBesar.lat.toFixed(5)}, ${fotoBesar.lng.toFixed(5)}`}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <a
                    href={`https://maps.google.com/?q=${fotoBesar.lat},${fotoBesar.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-teks-utama"
                  >
                    <MapPin className="h-3.5 w-3.5 text-pri" aria-hidden="true" />
                    Lihat Peta
                  </a>
                  <button
                    type="button"
                    onClick={() => setFotoBesar(null)}
                    className="btn-tekan flex flex-1 items-center justify-center rounded-xl py-2 text-xs font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
