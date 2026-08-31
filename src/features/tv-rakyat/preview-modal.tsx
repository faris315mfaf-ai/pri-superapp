"use client";

// ============================================================
// PreviewModal — popup pratinjau video setelah proses 100%.
// Bottom sheet slide-up: pemutar 9:16 yang memutar berkas ASLI
// hasil render Creatomate, metadata, pilih platform tujuan
// (switch kaca), lalu unggah satu per satu platform atau buang.
// ============================================================

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  Pause,
  Play,
  Rocket,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import {
  jadwalkanPosting,
  putuskanVideo,
  simpanSuntinganVideo,
  unggahVideoSosmed,
  type HasilUnggahPlatform,
} from "@/services";
import type { HasilProsesVideo } from "@/types";
import { cn } from "@/lib/utils";

type PreviewModalProps = {
  hasil: HasilProsesVideo;
  onTutup: () => void;
  onSelesaiUnggah: (jumlahPlatform: number) => void;
  /** Pemanggil adalah Pimpinan Redaksi / master — boleh memutus persetujuan */
  bolehSetujui?: boolean;
  /** Dibuka dari daftar riwayat, bukan dari proses yang baru selesai */
  modeTinjau?: boolean;
  /** Video ini sudah pernah diunggah ke sosmed */
  sudahDiunggah?: boolean;
  /** Tautan postingan bila sudah diunggah */
  linkPostingan?: string;
};

type PlatformTujuan = {
  platform: string;
  label: string;
  aktifAwal: boolean;
};

const PLATFORM_TUJUAN: PlatformTujuan[] = [
  { platform: "instagram", label: "Instagram", aktifAwal: true },
  { platform: "tiktok", label: "TikTok", aktifAwal: true },
  { platform: "youtube", label: "YouTube Shorts", aktifAwal: true },
  { platform: "facebook", label: "Facebook", aktifAwal: false },
  { platform: "twitter", label: "Twitter/X", aktifAwal: false },
  { platform: "threads", label: "Threads", aktifAwal: false },
];

/**
 * Batas karakter caption RESMI tiap platform. Caption yang melebihi
 * batas akan DITOLAK atau terpotong diam-diam oleh platformnya, jadi
 * tombol unggah dikunci sampai semua caption platform aktif muat.
 *
 * - Instagram: 2.200; hanya ±125 pertama tampil sebelum "...more".
 * - X (Twitter): 280 akun standar; 25.000 bila X Premium (saklar).
 * - Threads: 500 per unggahan standar.
 * - YouTube Short: 5.000 (kolom deskripsi).
 * - Facebook Page: 63.206.
 * - TikTok: 2.200.
 */
const BATAS_CAPTION: Record<string, { maks: number; pratinjau?: number }> = {
  instagram: { maks: 2200, pratinjau: 125 },
  tiktok: { maks: 2200 },
  youtube: { maks: 5000 },
  facebook: { maks: 63206 },
  twitter: { maks: 280 },
  threads: { maks: 500 },
};
const BATAS_X_PREMIUM = 25000;

/** Ubah detik menjadi "m:dd" untuk penanda waktu pemutar */
function jamVideo(detik: number): string {
  if (!Number.isFinite(detik) || detik < 0) return "0:00";
  const m = Math.floor(detik / 60);
  const d = Math.floor(detik % 60);
  return `${m}:${String(d).padStart(2, "0")}`;
}

/** Salin teks ke clipboard dengan fallback untuk konteks non-secure */
async function salinTeks(teks: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(teks);
      return true;
    }
    const area = document.createElement("textarea");
    area.value = teks;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const berhasil = document.execCommand("copy");
    document.body.removeChild(area);
    return berhasil;
  } catch {
    return false;
  }
}

export function PreviewModal({
  hasil,
  onTutup,
  onSelesaiUnggah,
  bolehSetujui = false,
  modeTinjau = false,
  sudahDiunggah = false,
  linkPostingan = "",
}: PreviewModalProps) {
  // Pemutar video asli (berkas hasil render Creatomate)
  const videoRef = useRef<HTMLVideoElement>(null);
  const [main, setMain] = useState(false);
  const [posisi, setPosisi] = useState(0); // persen, untuk bar progres
  const [durasi, setDurasi] = useState(0);
  const [waktuKini, setWaktuKini] = useState(0);
  const [videoSiap, setVideoSiap] = useState(false);
  const [videoGagal, setVideoGagal] = useState(false);

  const urlVideo = hasil.hasil_render_url?.trim() ?? "";
  const adaVideo = urlVideo.length > 0;

  // Metadata — judul & caption dapat disunting admin sebelum diunggah.
  // Nilai awal berasal dari hasil AI, tapi bukan harga mati.
  const [captionBuka, setCaptionBuka] = useState(false);
  const [menyalin, setMenyalin] = useState(false);
  const [judulEdit, setJudulEdit] = useState(hasil.judul_overlay);
  const [captionEdit, setCaptionEdit] = useState(hasil.caption_asli);
  const [statusSimpan, setStatusSimpan] = useState("");
  // Nilai yang terakhir benar-benar tersimpan, supaya tidak mengirim
  // permintaan simpan berulang kali padahal tidak ada yang berubah.
  const tersimpanRef = useRef({
    judul: hasil.judul_overlay,
    caption: hasil.caption_asli,
  });

  // Platform tujuan
  const [aktif, setAktif] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PLATFORM_TUJUAN.map((p) => [p.platform, p.aktifAwal])),
  );

  // Caption per platform tujuan. Kunci yang tidak ada = platform itu
  // memakai caption utama. Nilai awal dari database (suntingan lama).
  const [captionPlatform, setCaptionPlatform] = useState<Record<string, string>>(
    () => ({ ...(hasil.caption_platform ?? {}) }),
  );
  // Akun X Premium menaikkan batas 280 → 25.000. Pilihan sesi ini saja.
  const [xPremium, setXPremium] = useState(false);
  // Editor caption platform mana yang sedang terbuka (akordeon)
  const [captionTerbuka, setCaptionTerbuka] = useState<string | null>(null);
  const tersimpanCaptionRef = useRef(JSON.stringify(hasil.caption_platform ?? {}));

  // Persetujuan Pimpinan Redaksi — video hanya boleh tayang setelah
  // disetujui; tim TV melihat statusnya, Pimred melihat tombol putusan.
  const [persetujuan, setPersetujuan] = useState(hasil.persetujuan ?? "menunggu");
  const [sedangPutus, setSedangPutus] = useState(false);

  // Alur unggah
  const [modeUnggah, setModeUnggah] = useState(false);
  const [unggahSelesai, setUnggahSelesai] = useState(0);
  // Hasil nyata per platform dari Ayrshare (null = belum ada hasil)
  const [hasilUnggah, setHasilUnggah] = useState<HasilUnggahPlatform[] | null>(null);
  const [konfirmasiBuang, setKonfirmasiBuang] = useState(false);
  // Jadwal tayang (fitur 1.22.x/3, digabung ke sini) — bila diisi, video
  // tidak diposting sekarang melainkan dijadwalkan lewat Ayrshare.
  const [jadwalMode, setJadwalMode] = useState(false);
  const [jadwalWaktu, setJadwalWaktu] = useState("");
  const [sedangJadwal, setSedangJadwal] = useState(false);
  // Sampul kustom (fitur 31 Agu 2026) — data URL jpg/png < 2 MB;
  // dipasang ke YouTube/Instagram/TikTok/Facebook saat posting.
  const [sampul, setSampul] = useState<string | null>(null);
  const sampulInputRef = useRef<HTMLInputElement>(null);

  function pilihSampul(f: File | null | undefined) {
    if (!f) return;
    if (!/^image\/(jpeg|png)$/.test(f.type)) {
      toast("peringatan", "Sampul harus JPG/PNG");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast("peringatan", "Sampul terlalu besar", "Maksimal 2 MB (syarat YouTube).");
      return;
    }
    const r = new FileReader();
    r.onload = () => setSampul(String(r.result ?? "") || null);
    r.readAsDataURL(f);
  }

  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const platformAktif = useMemo(
    () => PLATFORM_TUJUAN.filter((p) => aktif[p.platform]),
    [aktif],
  );

  // Kunci scroll body selama modal terbuka
  useEffect(() => {
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = sebelumnya;
    };
  }, []);

  // Bersihkan seluruh timer saat dilepas
  useEffect(() => {
    return () => {
      timerRef.current.forEach((t) => clearTimeout(t));
      timerRef.current = [];
    };
  }, []);

  /**
   * Ikuti keadaan elemen <video> yang sebenarnya.
   *
   * Posisi bar progres, tombol putar/jeda, dan penanda waktu semuanya
   * mengikuti berkas asli — bukan timer tiruan — sehingga apa yang
   * dilihat admin memang isi video yang akan diunggah.
   */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const saatWaktuBerubah = () => {
      setWaktuKini(v.currentTime);
      setPosisi(v.duration > 0 ? (v.currentTime / v.duration) * 100 : 0);
    };
    const saatSiap = () => {
      setDurasi(v.duration || 0);
      setVideoSiap(true);
      setVideoGagal(false);
    };
    const saatMain = () => setMain(true);
    const saatJeda = () => setMain(false);
    const saatSelesai = () => setMain(false);
    const saatGagal = () => {
      setVideoGagal(true);
      setVideoSiap(false);
      setMain(false);
    };

    v.addEventListener("timeupdate", saatWaktuBerubah);
    v.addEventListener("loadedmetadata", saatSiap);
    v.addEventListener("play", saatMain);
    v.addEventListener("pause", saatJeda);
    v.addEventListener("ended", saatSelesai);
    v.addEventListener("error", saatGagal);

    return () => {
      v.removeEventListener("timeupdate", saatWaktuBerubah);
      v.removeEventListener("loadedmetadata", saatSiap);
      v.removeEventListener("play", saatMain);
      v.removeEventListener("pause", saatJeda);
      v.removeEventListener("ended", saatSelesai);
      v.removeEventListener("error", saatGagal);
    };
  }, [urlVideo]);

  function toggleMain() {
    const v = videoRef.current;
    if (!v) return;

    if (v.paused || v.ended) {
      // Sudah di ujung video: ulang dari awal, bukan diam saja.
      if (v.ended || v.currentTime >= v.duration) v.currentTime = 0;
      void v.play().catch(() => {
        // Peramban bisa menolak autoplay; beri tahu, jangan diam.
        toast("info", "Tekan sekali lagi untuk memutar");
      });
    } else {
      v.pause();
    }
  }

  /** Lompat ke posisi tertentu saat bar progres diklik */
  function lompatKe(e: MouseEvent<HTMLDivElement>) {
    const v = videoRef.current;
    if (!v || !videoSiap || !v.duration) return;
    const kotak = e.currentTarget.getBoundingClientRect();
    const rasio = Math.min(1, Math.max(0, (e.clientX - kotak.left) / kotak.width));
    v.currentTime = rasio * v.duration;
  }

  function gantiAktif(platform: string) {
    if (modeUnggah) return;
    setAktif((sebelumnya) => ({ ...sebelumnya, [platform]: !sebelumnya[platform] }));
  }

  async function salinCaption() {
    if (menyalin) return;
    setMenyalin(true);
    const berhasil = await salinTeks(captionEdit);
    setMenyalin(false);
    if (berhasil) toast("sukses", "Caption disalin");
    else toast("error", "Gagal menyalin caption");
  }

  /**
   * Simpan suntingan judul/caption ke Supabase.
   * Dipanggil saat kolom kehilangan fokus (onBlur), bukan tiap ketikan,
   * supaya tidak membanjiri server dengan permintaan.
   */
  function simpanSuntingan() {
    const judulBaru = judulEdit.trim();
    const captionBaru = captionEdit.trim();

    const berubah =
      judulBaru !== tersimpanRef.current.judul ||
      captionBaru !== tersimpanRef.current.caption;
    if (!berubah) return;

    // Tanpa kode antrian tidak ada baris yang bisa diperbarui —
    // ini terjadi bila video diproses sebelum integrasi Supabase.
    if (!hasil.kode) {
      setStatusSimpan("Perubahan hanya berlaku di layar ini");
      return;
    }

    tersimpanRef.current = { judul: judulBaru, caption: captionBaru };
    setStatusSimpan("Menyimpan…");

    void simpanSuntinganVideo(hasil.kode, {
      judul_overlay: judulBaru,
      caption_asli: captionBaru,
    })
      .then(() => setStatusSimpan("Tersimpan"))
      .catch((err: unknown) => {
        setStatusSimpan("Gagal menyimpan");
        toast(
          "error",
          "Gagal menyimpan perubahan",
          err instanceof Error ? err.message : "Coba lagi sebentar.",
        );
      });
  }

  function buang() {
    setKonfirmasiBuang(false);
    toast("info", "Video dibuang");
    onTutup();
  }

  /** Caption efektif sebuah platform: khusus bila ada, kalau tidak caption utama */
  function captionUntuk(platform: string): string {
    const khusus = captionPlatform[platform];
    return khusus !== undefined ? khusus : captionEdit;
  }

  function batasUntuk(platform: string): number {
    if (platform === "twitter" && xPremium) return BATAS_X_PREMIUM;
    return BATAS_CAPTION[platform]?.maks ?? 100000;
  }

  // Platform aktif yang caption-nya masih melebihi batas → unggah terkunci
  const platformKelebihan = platformAktif.filter(
    (p) => captionUntuk(p.platform).length > batasUntuk(p.platform),
  );

  /**
   * Simpan caption per platform ke Supabase (onBlur, seperti caption
   * utama). Hanya mengirim bila isinya benar-benar berubah.
   */
  function simpanCaptionPlatform() {
    const kini = JSON.stringify(captionPlatform);
    if (kini === tersimpanCaptionRef.current) return;
    if (!hasil.kode) {
      setStatusSimpan("Perubahan hanya berlaku di layar ini");
      return;
    }
    tersimpanCaptionRef.current = kini;
    setStatusSimpan("Menyimpan…");
    void simpanSuntinganVideo(hasil.kode, { caption_platform: captionPlatform })
      .then(() => setStatusSimpan("Tersimpan"))
      .catch(() => setStatusSimpan("Gagal menyimpan"));
  }

  async function putuskan(keputusan: "disetujui" | "ditolak") {
    if (sedangPutus || !hasil.kode) return;
    setSedangPutus(true);
    try {
      await putuskanVideo(hasil.kode, keputusan);
      setPersetujuan(keputusan);
      toast(
        keputusan === "disetujui" ? "sukses" : "info",
        keputusan === "disetujui" ? "Video disetujui" : "Video ditolak",
        keputusan === "disetujui"
          ? "Video kini boleh diunggah ke sosmed."
          : hasil.sumber_upload === "manual"
            ? "Pengunggahnya diberi tahu dan medianya dihapus dari penyimpanan."
            : "Tim TV Rakyat diberi tahu.",
      );
    } catch (e) {
      toast("error", "Gagal menyimpan keputusan", e instanceof Error ? e.message : "");
    } finally {
      setSedangPutus(false);
    }
  }

  function mulaiUnggah() {
    if (modeUnggah) return;
    // Hirarki: tanpa persetujuan Pimred, video tidak boleh tayang.
    // Pimred sendiri boleh langsung (server mencatatnya sebagai ACC).
    if (!bolehSetujui && persetujuan !== "disetujui") {
      toast(
        "peringatan",
        "Belum disetujui Pimpinan Redaksi",
        persetujuan === "ditolak"
          ? "Video ini ditolak dan tidak boleh diunggah."
          : "Minta persetujuan Pimred dulu sebelum mengunggah.",
      );
      return;
    }
    if (platformAktif.length === 0) {
      toast("peringatan", "Pilih minimal satu platform tujuan");
      return;
    }
    // Kunci pengaman batas caption: platform akan menolak/memotong
    // caption kepanjangan, jadi lebih baik dicegat di sini.
    if (platformKelebihan.length > 0) {
      toast(
        "peringatan",
        "Caption melebihi batas platform",
        "Perbaiki dulu: " + platformKelebihan.map((p) => p.label).join(", "),
      );
      return;
    }
    if (!hasil.kode) {
      toast("error", "Video tidak bisa diunggah", "Kode antrian video tidak ditemukan.");
      return;
    }

    setModeUnggah(true);
    setHasilUnggah(null);
    setUnggahSelesai(0);

    void (async () => {
      try {
        const balasan = await unggahVideoSosmed(
          hasil.kode!,
          platformAktif.map((p) => p.platform),
          sampul ?? undefined,
        );
        setHasilUnggah(balasan.hasil);
        setUnggahSelesai(balasan.berhasil);

        if (balasan.berhasil === 0) {
          toast(
            "error",
            "Semua platform menolak",
            balasan.hasil.find((h) => h.pesan)?.pesan ?? "Periksa daftar di bawah.",
          );
        } else if (balasan.berhasil < balasan.total) {
          // Sebagian tayang, sebagian ditolak. Jangan bilang sukses
          // penuh — admin perlu tahu mana yang masih harus diurus.
          toast(
            "peringatan",
            `Tayang di ${balasan.berhasil} dari ${balasan.total} platform`,
            "Sisanya ditolak — lihat rinciannya di bawah.",
          );
        } else {
          toast("sukses", `Video tayang di ${balasan.berhasil} platform`);
        }

        if (balasan.catatan_simpan) {
          toast("peringatan", "Catatan", balasan.catatan_simpan);
        }

        // Beri jeda supaya admin sempat membaca hasil per platform
        // sebelum modalnya tertutup sendiri.
        if (balasan.berhasil > 0) {
          timerRef.current.push(
            setTimeout(() => onSelesaiUnggah(balasan.berhasil), 2600),
          );
        }
      } catch (e) {
        setModeUnggah(false);
        const pesan = e instanceof Error ? e.message : "Coba lagi sebentar.";
        // Unggah video besar bisa memakan beberapa menit. Bila panggilan
        // terputus (jaringan/waktu habis) videonya BISA JADI tetap tayang
        // di sosmed — arahkan admin memeriksa Riwayat Video, bukan mengira
        // gagal lalu mengunggah ulang (yang aman karena anti-dobel, tapi
        // membuat bingung). Statusnya tersimpan benar di server.
        const mungkinTerputus =
          /waktu|tidak menjawab|jaringan|server|fetch|timeout|gagal memuat/i.test(pesan);
        toast(
          "error",
          "Gagal mengunggah",
          mungkinTerputus
            ? `${pesan} Jika video ternyata sudah tayang, cek Riwayat Video — statusnya akan benar sendiri.`
            : pesan,
        );
      }
    })();
  }

  // Jadwalkan tayang lewat Ayrshare (fitur 1.22.x/3, kini bagian dari
  // komposer ini) — pakai video, caption, & platform yang sama, hanya
  // ditambah waktu tayang. Gerbangnya sama dengan Unggah Sekarang.
  function jadwalkanTayang() {
    if (sedangJadwal || modeUnggah) return;
    if (!bolehSetujui && persetujuan !== "disetujui") {
      toast(
        "peringatan",
        "Belum disetujui Pimpinan Redaksi",
        persetujuan === "ditolak"
          ? "Video ini ditolak dan tidak boleh dijadwalkan."
          : "Minta persetujuan Pimred dulu sebelum menjadwalkan.",
      );
      return;
    }
    if (platformAktif.length === 0) {
      toast("peringatan", "Pilih minimal satu platform tujuan");
      return;
    }
    if (platformKelebihan.length > 0) {
      toast(
        "peringatan",
        "Caption melebihi batas platform",
        "Perbaiki dulu: " + platformKelebihan.map((p) => p.label).join(", "),
      );
      return;
    }
    if (!urlVideo) {
      toast("error", "Video belum siap", "Render video belum tersedia.");
      return;
    }
    const t = new Date(jadwalWaktu);
    if (!jadwalWaktu || Number.isNaN(t.getTime())) {
      toast("peringatan", "Tentukan waktu tayang dulu");
      return;
    }
    if (t.getTime() < Date.now() + 5 * 60 * 1000) {
      toast("peringatan", "Jadwal minimal 5 menit dari sekarang");
      return;
    }

    setSedangJadwal(true);
    void (async () => {
      try {
        await jadwalkanPosting({
          caption: captionEdit.trim(),
          media_url: urlVideo,
          is_video: true,
          platforms: platformAktif.map((p) => p.platform),
          judul_youtube: judulEdit.trim() || undefined,
          jadwal_pada: t.toISOString(),
          sampulDataUrl: sampul ?? undefined,
        });
        toast(
          "sukses",
          "Posting dijadwalkan",
          "Ayrshare akan menayangkannya pada waktu yang Anda tentukan.",
        );
        onSelesaiUnggah(platformAktif.length);
      } catch (e) {
        toast("error", "Gagal menjadwalkan", e instanceof Error ? e.message : "Coba lagi.");
      } finally {
        setSedangJadwal(false);
      }
    })();
  }

  const platformSumber = hasil.jenis === "TIKTOK" ? "tiktok" : "instagram";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[60] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau video"
    >
      {/* Latar belakang */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />

      {/* Kartu bottom sheet */}
      <motion.div
        initial={{ y: "102%" }}
        animate={{ y: 0 }}
        exit={{ y: "102%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="glass-strong relative mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-[2rem]"
      >
        {/* Handle bar */}
        <div className="flex shrink-0 justify-center pt-2.5 pb-1">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>

        {/* Kepala modal */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2">
          <h2 className="font-heading text-lg font-bold text-teks-utama">
            Video Siap Ditinjau
          </h2>
          <button
            type="button"
            onClick={onTutup}
            disabled={modeUnggah}
            aria-label="Tutup pratinjau"
            className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-full text-teks-utama disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Konten scrollable */}
        <div className="scrollbar-tipis flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-1 pb-8">
          {/* Pemutar video vertikal 9:16 — memutar berkas ASLI hasil
              render Creatomate. Judul & highlight TIDAK ditumpuk di atas
              video, karena keduanya sudah menyatu di dalam gambar hasil
              render; menumpuknya lagi akan membuat teks tampil ganda. */}
          {/* CATATAN TATA LETAK — jangan diganti ke aspect-ratio.
              Kotak ini adalah item flex di dalam kolom ber-scroll, dan
              SELURUH isinya position:absolute sehingga tinggi isinya nol.
              Dalam kondisi itu browser mengabaikan aspect-ratio (bahkan
              height eksplisit ikut diremas), sehingga kotaknya runtuh jadi
              2px — setebal garis tepinya, dan videonya tak terlihat.
              min-height adalah satu-satunya yang tidak bisa diremas oleh
              algoritma flex, jadi tinggi dikunci lewat min-h dan lebar
              diturunkan dari tinggi itu supaya rasionya tetap 9:16. */}
          <div
            className="relative mx-auto h-[46dvh] max-h-[46dvh] min-h-[46dvh] w-[calc(46dvh*9/16)] max-w-full overflow-hidden rounded-2xl border border-white/10 shadow-xl"
            style={{ background: "linear-gradient(135deg, #7F1D1D, #B45309, #0B1120)" }}
          >
            {adaVideo && !videoGagal ? (
              <>
                <video
                  ref={videoRef}
                  src={urlVideo}
                  poster={hasil.thumbnail_url || undefined}
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 h-full w-full object-contain bg-black"
                />

                {/* Penanda sumber tetap ditampilkan — ini info aplikasi,
                    bukan bagian dari gambar video. */}
                <span className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/35 backdrop-blur-md">
                  <PlatformIcon platform={platformSumber} size={14} />
                </span>

                {/* Tombol putar/jeda menutupi seluruh bidang video.
                    Saat sedang berjalan, tombolnya dibuat samar supaya
                    tidak menghalangi tontonan. */}
                <button
                  type="button"
                  onClick={toggleMain}
                  aria-label={main ? "Jeda video" : "Putar video"}
                  className="btn-tekan absolute inset-0 flex items-center justify-center"
                >
                  <span
                    className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white shadow-2xl backdrop-blur-md transition-all duration-200",
                      main && "scale-90 opacity-0 hover:opacity-100",
                    )}
                  >
                    {main ? (
                      <Pause className="h-7 w-7" />
                    ) : (
                      <Play className="h-7 w-7 translate-x-0.5" />
                    )}
                  </span>
                </button>

                {/* Penanda waktu */}
                {videoSiap && (
                  <span className="absolute bottom-3 left-3 rounded-md bg-black/50 px-1.5 py-0.5 font-mono text-[10.5px] text-white/90 backdrop-blur-sm">
                    {jamVideo(waktuKini)} / {jamVideo(durasi)}
                  </span>
                )}

                {/* Bar progres — bisa diklik untuk melompat */}
                <div
                  onClick={lompatKe}
                  role="presentation"
                  className="absolute inset-x-0 bottom-0 h-2 cursor-pointer bg-white/20"
                >
                  <div
                    className="h-full bg-white/90"
                    style={{ width: `${posisi}%` }}
                  />
                </div>
              </>
            ) : (
              /* Belum ada berkas hasil render, atau berkasnya gagal dimuat.
                 Tampilkan keterangan jujur, bukan pemutar kosong yang
                 membuat admin mengira aplikasinya rusak. */
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center">
                <p className="font-heading text-sm font-extrabold tracking-wide text-white uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
                  {judulEdit}
                </p>
                <p className="text-[11px] leading-snug text-white/85">
                  {videoGagal
                    ? "Video hasil render tidak bisa dimuat. Coba buka lewat tombol di bawah."
                    : "Video hasil render belum tersedia untuk video ini."}
                </p>
                {adaVideo && (
                  <a
                    href={urlVideo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 rounded-lg border border-white/35 bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md"
                  >
                    Buka video di tab baru
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Kartu metadata — judul & caption BISA DIEDIT admin sebelum
              diunggah. Hasil AI hanyalah usulan; keputusan akhir di tangan
              manusia. Perubahan disimpan ke Supabase saat kolom dilepas. */}
          <div className="glass rounded-2xl p-4">
            <div className="flex flex-col gap-3">
              {/* Judul video (judul overlay) — dapat diubah */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="edit-judul"
                    className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase"
                  >
                    Judul Video
                  </label>
                  <span className="text-[10.5px] text-teks-sekunder">
                    {judulEdit.length}/60
                  </span>
                </div>
                <input
                  id="edit-judul"
                  type="text"
                  value={judulEdit}
                  maxLength={60}
                  disabled={modeUnggah}
                  onChange={(e) => setJudulEdit(e.target.value)}
                  onBlur={simpanSuntingan}
                  className="glass-soft mt-1 w-full rounded-xl px-3 py-2 font-heading text-[15px] leading-snug font-bold text-teks-utama outline-none focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
                />
              </div>

              {/* Highlight (badge emas) */}
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
                  Highlight
                </p>
                <span className="mt-1 inline-flex max-w-full items-start rounded-xl border border-emas/30 bg-emas/15 px-2.5 py-1.5 text-xs leading-snug font-medium text-amber-700 dark:text-amber-300">
                  {hasil.highlight}
                </span>
              </div>

              {/* Caption — dapat diubah */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="edit-caption"
                    className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase"
                  >
                    Caption
                  </label>
                  <button
                    type="button"
                    onClick={() => void salinCaption()}
                    className="btn-tekan inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-pri hover:bg-pri/10"
                  >
                    <Copy className="h-3 w-3" />
                    Salin Caption
                  </button>
                </div>
                <textarea
                  id="edit-caption"
                  value={captionEdit}
                  rows={captionBuka ? 8 : 3}
                  disabled={modeUnggah}
                  onChange={(e) => setCaptionEdit(e.target.value)}
                  onBlur={simpanSuntingan}
                  className="glass-soft mt-1 w-full resize-none rounded-xl px-3 py-2 text-sm leading-relaxed text-teks-utama/90 outline-none focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
                />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setCaptionBuka((v) => !v)}
                    className="text-xs font-semibold text-pri underline-offset-4 hover:underline"
                  >
                    {captionBuka ? "Perkecil" : "Perbesar"}
                  </button>
                  <span
                    className={cn(
                      "text-[10.5px] transition-opacity",
                      statusSimpan ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {statusSimpan}
                  </span>
                </div>
              </div>

              {/* Sumber */}
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
                  Sumber
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-teks-sekunder">
                  {hasil.sumber}
                </p>
              </div>
            </div>
          </div>

          {/* Persetujuan Pimpinan Redaksi */}
          <div
            className={cn(
              "rounded-2xl border p-3.5",
              persetujuan === "disetujui"
                ? "border-sukses/40 bg-sukses/10"
                : persetujuan === "ditolak"
                  ? "border-gagal/40 bg-gagal/10"
                  : "border-emas/40 bg-emas/10",
            )}
          >
            <div className="flex items-center gap-2.5">
              {persetujuan === "disetujui" ? (
                <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-sukses" aria-hidden="true" />
              ) : persetujuan === "ditolak" ? (
                <XCircle className="h-4.5 w-4.5 shrink-0 text-gagal" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-500" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-bold text-teks-utama">
                  {persetujuan === "disetujui"
                    ? "Disetujui Pimpinan Redaksi"
                    : persetujuan === "ditolak"
                      ? "Ditolak Pimpinan Redaksi"
                      : "Menunggu persetujuan Pimpinan Redaksi"}
                </p>
                {hasil.sumber_upload === "manual" && hasil.diupload_oleh && (
                  <p className="text-[10.5px] text-teks-sekunder">
                    Unggahan manual dari {hasil.diupload_oleh}
                  </p>
                )}
              </div>
            </div>
            {bolehSetujui && persetujuan === "menunggu" && !modeUnggah && (
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  disabled={sedangPutus}
                  onClick={() => void putuskan("disetujui")}
                  className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Setujui
                </button>
                <button
                  type="button"
                  disabled={sedangPutus}
                  onClick={() => void putuskan("ditolak")}
                  className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gagal/40 bg-gagal/5 py-2 text-xs font-semibold text-gagal disabled:opacity-60"
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Tolak
                </button>
              </div>
            )}
          </div>

          {/* Panel platform tujuan */}
          <div className="glass-soft rounded-2xl p-1.5">
            <div className="px-2.5 pt-1.5 pb-0.5">
              <p className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
                Platform Tujuan
              </p>
            </div>
            {PLATFORM_TUJUAN.map((p) => (
              <div key={p.platform} className="flex items-center gap-3 px-2 py-1.5">
                <PlatformIcon platform={p.platform} size={16} denganWadah />
                <span className="flex-1 text-sm font-medium text-teks-utama">{p.label}</span>
                <SwitchKaca
                  aktif={aktif[p.platform] ?? false}
                  disabled={modeUnggah}
                  onUbah={() => gantiAktif(p.platform)}
                  label={`Aktifkan unggah ke ${p.label}`}
                />
              </div>
            ))}
          </div>

          {/* Panel caption per platform — tiap platform punya batas
              karakter resmi yang berbeda; unggah terkunci sampai semua
              caption platform aktif muat di batasnya. */}
          {platformAktif.length > 0 && (
            <div className="glass-soft rounded-2xl p-1.5">
              <div className="flex items-center justify-between px-2.5 pt-1.5 pb-0.5">
                <p className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
                  Caption per Platform
                </p>
                {platformKelebihan.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-gagal">
                    <AlertTriangle className="h-3 w-3" />
                    {platformKelebihan.length} melebihi batas
                  </span>
                )}
              </div>
              {platformAktif.map((p) => {
                const teks = captionUntuk(p.platform);
                const batas = batasUntuk(p.platform);
                const lebih = teks.length > batas;
                const terbuka = captionTerbuka === p.platform;
                const pratinjau = BATAS_CAPTION[p.platform]?.pratinjau;
                const pakaiKhusus = captionPlatform[p.platform] !== undefined;
                return (
                  <div key={p.platform} className="px-2 py-1">
                    <button
                      type="button"
                      onClick={() =>
                        setCaptionTerbuka((k) => (k === p.platform ? null : p.platform))
                      }
                      className="btn-tekan flex w-full items-center gap-2.5 rounded-xl px-1 py-1.5 text-left"
                      aria-expanded={terbuka}
                    >
                      <PlatformIcon platform={p.platform} size={14} denganWadah />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-teks-utama">
                        {p.label}
                        {!pakaiKhusus && (
                          <span className="ml-1.5 text-[10px] text-teks-sekunder">
                            (caption utama)
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "angka-tab shrink-0 rounded-full px-2 py-px text-[10px] font-bold",
                          lebih
                            ? "bg-gagal/15 text-gagal"
                            : "bg-sukses/10 text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {teks.length.toLocaleString("id-ID")}/{batas.toLocaleString("id-ID")}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-teks-sekunder transition-transform",
                          terbuka && "rotate-180",
                        )}
                        aria-hidden="true"
                      />
                    </button>

                    {terbuka && (
                      <div className="px-1 pb-1.5">
                        <textarea
                          value={teks}
                          rows={4}
                          disabled={modeUnggah}
                          onChange={(e) =>
                            setCaptionPlatform((c) => ({
                              ...c,
                              [p.platform]: e.target.value,
                            }))
                          }
                          onBlur={simpanCaptionPlatform}
                          aria-label={`Caption untuk ${p.label}`}
                          className={cn(
                            "glass-soft mt-1 w-full resize-none rounded-xl px-3 py-2 text-[12.5px] leading-relaxed text-teks-utama/90 outline-none focus:ring-2 disabled:opacity-60",
                            lebih ? "ring-2 ring-gagal/60" : "focus:ring-pri/50",
                          )}
                        />
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {p.platform === "instagram" && pratinjau && (
                            <span
                              className={cn(
                                "text-[10.5px]",
                                teks.length > pratinjau
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-teks-sekunder",
                              )}
                            >
                              ±{pratinjau} karakter pertama tampil sebelum &quot;…more&quot;
                            </span>
                          )}
                          {p.platform === "twitter" && (
                            <label className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-teks-sekunder">
                              <input
                                type="checkbox"
                                checked={xPremium}
                                onChange={(e) => setXPremium(e.target.checked)}
                                className="h-3.5 w-3.5 accent-[#DC2626]"
                              />
                              Akun X Premium (batas 25.000)
                            </label>
                          )}
                          <span className="flex-1" />
                          {lebih && (
                            <button
                              type="button"
                              onClick={() => {
                                setCaptionPlatform((c) => ({
                                  ...c,
                                  [p.platform]: teks.slice(0, batas),
                                }));
                              }}
                              className="btn-tekan inline-flex items-center gap-1 rounded-lg bg-gagal/10 px-2 py-1 text-[10.5px] font-bold text-gagal"
                            >
                              <Scissors className="h-3 w-3" />
                              Potong ke {batas.toLocaleString("id-ID")}
                            </button>
                          )}
                          {pakaiKhusus && !lebih && (
                            <button
                              type="button"
                              onClick={() => {
                                setCaptionPlatform((c) => {
                                  const salinan = { ...c };
                                  delete salinan[p.platform];
                                  return salinan;
                                });
                              }}
                              className="btn-tekan rounded-lg px-2 py-1 text-[10.5px] font-semibold text-teks-sekunder hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              Pakai caption utama
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tombol aksi / progress unggah */}
          {modeUnggah ? (
            <div className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teks-sekunder">
                  {hasilUnggah ? "Hasil unggahan" : "Mengunggah video ke sosmed…"}
                </p>
                <p className="text-xs font-semibold text-teks-utama angka-tab">
                  {unggahSelesai}/{platformAktif.length}
                </p>
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                {platformAktif.map((p) => {
                  // Sebelum Ayrshare menjawab: semuanya masih berjalan.
                  const r = hasilUnggah?.find((h) => h.platform === p.platform);
                  const gagal = r?.status === "error";
                  const sukses = Boolean(r) && !gagal;
                  return (
                    <div key={p.platform} className="flex items-start gap-3">
                      {!r ? (
                        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-pri" />
                      ) : gagal ? (
                        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-gagal" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sukses" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-teks-utama">{p.label}</span>
                        {gagal && r?.pesan && (
                          <p className="mt-0.5 text-[11px] leading-snug text-gagal">
                            {r.pesan}
                          </p>
                        )}
                      </div>
                      {sukses &&
                        (r?.postUrl ? (
                          <a
                            href={r.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-[11px] font-semibold text-sukses underline-offset-4 hover:underline"
                          >
                            Lihat
                          </a>
                        ) : (
                          <span className="shrink-0 text-[11px] font-semibold text-sukses">
                            Tayang
                          </span>
                        ))}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${platformAktif.length ? (unggahSelesai / platformAktif.length) * 100 : 0}%`,
                    background: "linear-gradient(90deg, #10B981, #059669)",
                  }}
                />
              </div>
            </div>
          ) : sudahDiunggah ? (
            /* Video ini sudah pernah diposting. Menawarkan "Unggah" lagi
               hanya akan memancing unggahan ganda, jadi yang ditampilkan
               adalah jalan ke postingannya. */
            <div className="glass-soft flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-sukses" />
                <p className="text-sm font-semibold text-teks-utama">
                  Video ini sudah diposting
                </p>
              </div>
              {linkPostingan && (
                <a
                  href={linkPostingan}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-tekan flex h-11 items-center justify-center gap-2 rounded-xl border border-pri/45 bg-pri/5 text-sm font-semibold text-pri"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  Lihat Postingan
                </a>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Sekarang atau jadwalkan (fitur 1.22.x/3, digabung) */}
              <div className="glass-soft flex gap-1 rounded-xl p-1">
                {(
                  [
                    [false, "Sekarang", Rocket] as const,
                    [true, "Jadwalkan", CalendarClock] as const,
                  ]
                ).map(([v, label, Ikon]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setJadwalMode(v)}
                    aria-pressed={jadwalMode === v}
                    className={cn(
                      "btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-bold",
                      jadwalMode === v ? "text-white" : "text-teks-sekunder",
                    )}
                    style={
                      jadwalMode === v
                        ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                        : undefined
                    }
                  >
                    <Ikon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {jadwalMode && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-teks-sekunder">
                    Waktu tayang (waktu perangkat Anda)
                  </span>
                  <input
                    type="datetime-local"
                    value={jadwalWaktu}
                    onChange={(e) => setJadwalWaktu(e.target.value)}
                    className="glass-soft h-11 w-full rounded-xl px-3 text-[13px] text-teks-utama outline-none focus:ring-2 focus:ring-pri/50"
                  />
                </label>
              )}

              {/* Sampul kustom (fitur 31 Agu 2026): dipasang ke YouTube,
                  Instagram, TikTok, Facebook — Threads & X tak mendukung. */}
              <div className="glass-soft flex items-center gap-2.5 rounded-xl p-2.5">
                <input
                  ref={sampulInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => pilihSampul(e.target.files?.[0])}
                />
                {sampul ? (
                  <img
                    src={sampul}
                    alt="Sampul video"
                    className="h-12 w-9 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md bg-black/5 text-teks-sekunder dark:bg-white/10">
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-bold text-teks-utama">
                    Sampul video {sampul ? "" : "(opsional)"}
                  </p>
                  <p className="text-[10px] leading-snug text-teks-sekunder">
                    JPG/PNG &lt; 2 MB · dipasang ke YT, IG, TikTok, FB
                  </p>
                </div>
                {sampul ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSampul(null);
                      if (sampulInputRef.current) sampulInputRef.current.value = "";
                    }}
                    className="btn-tekan shrink-0 rounded-lg p-1.5 text-gagal"
                    aria-label="Hapus sampul"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => sampulInputRef.current?.click()}
                    className="glass btn-tekan shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-teks-utama"
                  >
                    Pilih
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => (modeTinjau ? onTutup() : setKonfirmasiBuang(true))}
                  className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-xl border border-pri/45 bg-pri/5 px-2 text-sm font-semibold text-pri"
                >
                  {modeTinjau ? (
                    <X className="h-4.5 w-4.5 shrink-0" />
                  ) : (
                    <Trash2 className="h-4.5 w-4.5 shrink-0" />
                  )}
                  {modeTinjau ? "Tutup" : "Buang"}
                </button>
                <button
                  type="button"
                  onClick={jadwalMode ? jadwalkanTayang : mulaiUnggah}
                  disabled={
                    !adaVideo ||
                    (!bolehSetujui && persetujuan !== "disetujui") ||
                    sedangJadwal
                  }
                  title={
                    !adaVideo
                      ? "Video belum selesai diproses"
                      : !bolehSetujui && persetujuan !== "disetujui"
                        ? "Menunggu persetujuan Pimpinan Redaksi"
                        : undefined
                  }
                  className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-xl px-2 text-sm leading-tight font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
                  style={{
                    background: jadwalMode
                      ? "linear-gradient(135deg, #DC2626, #B91C1C)"
                      : "linear-gradient(135deg, #10B981, #059669)",
                    boxShadow: jadwalMode
                      ? "0 8px 20px rgba(220, 38, 38, 0.35)"
                      : "0 8px 20px rgba(16, 185, 129, 0.35)",
                  }}
                >
                  {sedangJadwal ? (
                    <Loader2 className="h-4.5 w-4.5 shrink-0 animate-spin" />
                  ) : jadwalMode ? (
                    <CalendarClock className="h-4.5 w-4.5 shrink-0" />
                  ) : (
                    <Rocket className="h-4.5 w-4.5 shrink-0" />
                  )}
                  {jadwalMode ? "Jadwalkan Tayang" : "Unggah Sekarang"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal konfirmasi buang */}
        <AnimatePresence>
          {konfirmasiBuang && (
            <motion.div
              key="konfirmasi-buang"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[80] flex items-center justify-center p-6"
              role="dialog"
              aria-modal="true"
              aria-label="Konfirmasi buang video"
            >
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-xl"
                onClick={() => setKonfirmasiBuang(false)}
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="glass-strong relative w-full max-w-[340px] rounded-3xl p-5"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-pri/30 bg-pri/15 text-pri"
                    aria-hidden="true"
                  >
                    <Trash2 className="h-5 w-5" />
                  </span>
                  <h3 className="font-heading text-base font-bold text-teks-utama">
                    Buang Video?
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-teks-sekunder">
                  Yakin membuang video ini? Proses tidak bisa diulang.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setKonfirmasiBuang(false)}
                    className="glass btn-tekan h-11 w-full rounded-xl text-sm font-semibold text-teks-utama"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={buang}
                    className="btn-tekan h-11 w-full rounded-xl text-sm font-bold text-white"
                    style={{
                      background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                      boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
                    }}
                  >
                    Buang
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// SwitchKaca — toggle switch custom (track kaca, knob putih,
// aktif = gradient merah)
// ------------------------------------------------------------

function SwitchKaca({
  aktif,
  disabled,
  onUbah,
  label,
}: {
  aktif: boolean;
  disabled?: boolean;
  onUbah: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aktif}
      aria-label={label}
      disabled={disabled}
      onClick={onUbah}
      className={cn(
        "btn-tekan relative h-7 w-12 shrink-0 rounded-full border disabled:cursor-not-allowed disabled:opacity-60",
        aktif
          ? "border-transparent"
          : "border-black/10 bg-black/5 dark:border-white/15 dark:bg-white/10",
      )}
      style={aktif ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
    >
      <span
        className={cn(
          "absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-200",
          aktif ? "left-[calc(100%-1.5rem)]" : "left-1",
        )}
      />
    </button>
  );
}
