"use client";

// ============================================================
// SiaranAnggotaView (15 Okt 2026) — Ruang Bot → Koordinator → Siaran Anggota (master, mode nyata).
//
// Wizard empat langkah untuk menyiarkan SATU video ke akun sosmed anggota yang tertaut di upload-post:
//   1. Video   — Antrean ACC / Stok Video tim / Bahan Video Wajib / unggah baru (diunggah saat Siarkan).
//   2. Penerima — daftar anggota + status kesiapan dari server; hanya yang "siap" bisa dicentang.
//   3. Caption & jadwal — caption utama, variasi oleh Nara (opsional), cara kirim, jeda, waktu mulai.
//   4. Tinjau  — ubin ringkasan, pagar, Tampilkan di Ruang Bot, konfirmasi SIARKAN untuk siaran besar.
//
// Panel "Nara" di kiri BUKAN chat dan bukan LLM: ringkasan rencana yang disusun dari keadaan layar.
// Server tetap menghitung ulang penerima, platform, dan konfirmasi — layar ini hanya mengusulkan.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, Send, Sparkles, UploadCloud, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { SwitchKaca } from "@/features/profil/switch-kaca";
import { toast } from "@/hooks/use-app-store";
import { adalahPembatalanUnggah, BATAS_BERKAS_MB, unggahVideoTvrku } from "@/lib/unggah-video-klien";
import {
  getPenerimaSiaran,
  getSumberVideoSiaran,
  siarkanKoordinator,
  variasiCaptionNara,
  type IsianSiaranKoordinator,
  type PenerimaSiaran,
  type PilihanVideo,
} from "@/services";
import {
  KATA_KONFIRMASI,
  KEBIJAKAN_SIARAN,
  LABEL_MODE,
  LABEL_STATUS_PENERIMA,
  LABEL_SUMBER_VIDEO,
  MODE_SIARAN,
  jadwalKirim,
  konfirmasiSah,
  perkiraanSelesai,
  perluKonfirmasi,
  type ModeSiaran,
  type StatusPenerima,
  type SumberVideoSiaran,
} from "@/lib/siaran-koordinator-murni";
import { cn } from "@/lib/utils";

type SumberDaftar = Exclude<SumberVideoSiaran, "unggah">;
type DataSumber = Record<SumberDaftar, PilihanVideo[]>;
type JenisPagar = "ok" | "warn" | "info";

/** Enam platform tujuan (sama dengan PLATFORM_KPI server; kpi-video khusus server, jadi disalin di sini). */
const PLATFORM_SIARAN = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"] as const;
/** Batas panjang caption yang lebih ketat dari CAPTION_MAKS. */
const BATAS_CAPTION_PLATFORM: { platform: string; batas: number }[] = [
  { platform: "twitter", batas: 280 },
  { platform: "threads", batas: 500 },
];
const SUMBER_URUT: SumberVideoSiaran[] = ["acc", "stok_tim", "video_wajib", "unggah"];
const KET_SUMBER: Record<SumberVideoSiaran, string> = {
  acc: "Hasil bot di Antrean ACC (2 hari terakhir)",
  stok_tim: "Hasil Edit Otomatis tim, 48 jam",
  video_wajib: "Bahan perintah Pimred yang aktif",
  unggah: `Berkas dari perangkat, maks ${BATAS_BERKAS_MB} MB`,
};
const KOSONG_SUMBER: Record<SumberDaftar, string> = {
  acc: "Belum ada video bot di Antrean ACC dalam 2 hari terakhir.",
  stok_tim: "Stok Video tim kosong (video terhapus otomatis setelah 48 jam).",
  video_wajib: "Tidak ada perintah Video Wajib aktif yang punya berkas bahan.",
};
const KET_MODE: Record<ModeSiaran, string> = {
  bertahap: "Satu akun tiap jeda dengan simpangan acak. Lebih pelan, lebih aman dari deteksi spam platform.",
  serentak: "Sebanyak mungkin akun sekaligus (upload-post asinkron, ±150 akun per menit). Boleh menumpuk; platform bisa menandai posting identik yang bersamaan.",
  terjadwal: "Mulai pada jam yang Anda pilih, lalu bertahap dengan jeda yang sama.",
};
const LANGKAH: [string, string][] = [
  ["Video", "Pilih yang disiarkan"],
  ["Penerima", "Akun anggota"],
  ["Caption & jadwal", "Variasi dan jeda"],
  ["Tinjau", "Pagar dan konfirmasi"],
];
const KELAS_STATUS: Record<StatusPenerima, string> = {
  siap: "bg-sukses/15 text-emerald-700 dark:text-emerald-400",
  login_ulang: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  batas_harian: "bg-black/10 text-teks-sekunder dark:bg-white/10",
  tanpa_akun: "bg-black/10 text-teks-sekunder dark:bg-white/10",
};
const KELAS_PAGAR: Record<JenisPagar, string> = {
  ok: "border-sukses/30 bg-sukses/[0.07]",
  warn: "border-amber-500/40 bg-amber-500/[0.08]",
  info: "border-glass-border bg-black/[0.03] dark:bg-white/[0.04]",
};
const HURUF_VARIAN = ["A", "B", "C", "D", "E"];
const RENDER_PER = 100;
const JUDUL_BAGIAN = "m-0 font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-teks-sekunder";
const KELAS_INPUT = "glass-input w-full rounded-xl px-3 text-base text-teks-utama sm:text-[13px]";
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const dua = (n: number) => String(n).padStart(2, "0");

/** "16 Okt, 08.00 WIB" (atau "08.00 WIB" bila hari ini). */
function teksWib(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const d = new Date(ms + 7 * 3600_000);
  const k = new Date(Date.now() + 7 * 3600_000);
  const jam = `${dua(d.getUTCHours())}.${dua(d.getUTCMinutes())} WIB`;
  const hariIni = d.getUTCFullYear() === k.getUTCFullYear() && d.getUTCMonth() === k.getUTCMonth() && d.getUTCDate() === k.getUTCDate();
  return hariIni ? jam : `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}, ${jam}`;
}

/** Nilai input datetime-local (zona waktu perangkat). */
function nilaiLokal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}T${dua(d.getHours())}:${dua(d.getMinutes())}`;
}

function teksUkuran(b: number | null | undefined): string {
  if (!b || !Number.isFinite(b)) return "";
  return `${(b / 1_048_576).toFixed(1).replace(".", ",")} MB`;
}

function teksDurasi(d: number | null): string {
  if (!d || !Number.isFinite(d)) return "";
  const s = Math.round(d);
  return `${Math.floor(s / 60)}:${dua(s % 60)}`;
}

function teksDurasiPanjang(ms: number): string {
  const menit = Math.max(0, Math.round(ms / 60_000));
  if (menit < 1) return "kurang dari 1 menit";
  if (menit < 60) return `±${menit} menit`;
  const jam = Math.floor(menit / 60);
  const sisa = menit % 60;
  return `±${jam} jam${sisa ? ` ${sisa} menit` : ""}`;
}

export function SiaranAnggotaView({ onTerkirim }: { onTerkirim: (id: string) => void }) {
  const [langkah, setLangkah] = useState(0);
  const [tunjukKurang, setTunjukKurang] = useState(false);

  // ---- Langkah 1: video ----
  const [dataSumber, setDataSumber] = useState<DataSumber | null>(null);
  const [galatSumber, setGalatSumber] = useState("");
  const [sumber, setSumber] = useState<SumberVideoSiaran>("acc");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [judul, setJudul] = useState("");
  const [judulOtomatis, setJudulOtomatis] = useState("");

  // ---- Langkah 2: penerima ----
  const [penerima, setPenerima] = useState<PenerimaSiaran[] | null>(null);
  const [penerimaUntuk, setPenerimaUntuk] = useState<string | null>(null);
  const [memuatPenerima, setMemuatPenerima] = useState(false);
  const [galatPenerima, setGalatPenerima] = useState("");
  const [cari, setCari] = useState("");
  const [wilayah, setWilayah] = useState("");
  const [saringPlatform, setSaringPlatform] = useState("");
  const [saringStatus, setSaringStatus] = useState<"siap" | "semua">("siap");
  const [lewatiSudah, setLewatiSudah] = useState(true);
  const [dipilih, setDipilih] = useState<Set<string>>(() => new Set());
  const [platforms, setPlatforms] = useState<Set<string>>(() => new Set(PLATFORM_SIARAN));
  const [batasTampil, setBatasTampil] = useState(RENDER_PER);

  // ---- Langkah 3: caption & jadwal ----
  const [caption, setCaption] = useState("");
  // Bawaan menyala: siaran serentak sebaiknya tidak identik di semua akun.
  const [pakaiVariasi, setPakaiVariasi] = useState(true);
  const [variasi, setVariasi] = useState<string[]>([]);
  const [captionVariasi, setCaptionVariasi] = useState("");
  const [pesanVariasi, setPesanVariasi] = useState("");
  const [memintaVariasi, setMemintaVariasi] = useState(false);
  // Bawaan SERENTAK (15 Okt 2026, permintaan pemilik: sebanyak mungkin akun sekaligus).
  const [mode, setMode] = useState<ModeSiaran>("serentak");
  const [mulaiLokal, setMulaiLokal] = useState("");
  const [jedaTeks, setJedaTeks] = useState(String(KEBIJAKAN_SIARAN.JEDA_BAWAAN));

  // ---- Langkah 4: tinjau & kirim ----
  const [tampilRuang, setTampilRuang] = useState(true);
  const [konfirmasi, setKonfirmasi] = useState("");
  const [tahapKirim, setTahapKirim] = useState<"" | "unggah" | "siapkan">("");
  const [persen, setPersen] = useState(0);

  const hidup = useRef(true);
  const nomorSumber = useRef(0);
  const nomorPenerima = useRef(0);
  const kunciDimuat = useRef<string | null>(null);
  const sudahUsul = useRef(false);
  const sibukRef = useRef(false);
  const batalRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const muatSumber = useCallback(async () => {
    const ini = ++nomorSumber.current;
    try {
      const d = await getSumberVideoSiaran();
      if (ini !== nomorSumber.current || !hidup.current) return;
      setDataSumber(d);
      setGalatSumber("");
    } catch (e) {
      if (ini !== nomorSumber.current || !hidup.current) return;
      setGalatSumber(e instanceof Error ? e.message : "Gagal memuat daftar video.");
    }
  }, []);

  useEffect(() => {
    hidup.current = true;
    return () => {
      hidup.current = false;
      batalRef.current?.abort();
    };
  }, []);
  // Muatan awal (ditunda satu tick: tanpa setState sinkron di effect).
  useEffect(() => {
    void Promise.resolve().then(muatSumber);
  }, [muatSumber]);

  // ------------------------------------------------------------
  // Turunan keadaan
  // ------------------------------------------------------------
  const daftarVideo: PilihanVideo[] = sumber === "unggah" ? [] : (dataSumber?.[sumber] ?? []);
  const video = sumber === "unggah" ? null : (daftarVideo.find((v) => v.id === videoId) ?? null);
  const perintahId: string | null = video ? (video.sumber === "video_wajib" ? video.id : video.perintah_id) : null;
  const kunciPerintah = perintahId ?? "";
  const kategori = video?.kategori ?? "";

  const penerimaCocok = penerima !== null && penerimaUntuk === kunciPerintah;
  const lewati = lewatiSudah && kunciPerintah !== "" && penerimaCocok;
  const bisaDipilih = (p: PenerimaSiaran) => p.status === "siap" && !(lewati && p.sudah_perintah);

  const semuaPenerima = penerima ?? [];
  const daftarWilayah = [...new Set(semuaPenerima.map((p) => p.wilayah).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
  const lingkup = semuaPenerima.filter((p) => (!wilayah || p.wilayah === wilayah) && (!saringPlatform || p.platform_siap.includes(saringPlatform)));
  const q = cari.trim().toLowerCase();
  const tersaringDasar = q ? lingkup.filter((p) => p.nama.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)) : lingkup;
  const tersaring = saringStatus === "siap" ? tersaringDasar.filter(bisaDipilih) : tersaringDasar;

  const perAkun = semuaPenerima.filter((p) => dipilih.has(p.user_id) && bisaDipilih(p)).map((p) => ({ p, pf: p.platform_siap.filter((x) => platforms.has(x)) }));
  const akunKirim = perAkun.filter((a) => a.pf.length > 0);
  const jumlahAkun = akunKirim.length;
  const jumlahPosting = akunKirim.reduce((n, a) => n + a.pf.length, 0);
  const tanpaPlatform = perAkun.length - jumlahAkun;

  const rincianLewat: [string, number][] = [
    [LABEL_STATUS_PENERIMA.login_ulang.toLowerCase(), lingkup.filter((p) => p.status === "login_ulang").length],
    [LABEL_STATUS_PENERIMA.batas_harian.toLowerCase(), lingkup.filter((p) => p.status === "batas_harian").length],
    [LABEL_STATUS_PENERIMA.tanpa_akun.toLowerCase(), lingkup.filter((p) => p.status === "tanpa_akun").length],
    [`sudah memposting perintah #${kunciPerintah}`, lewati ? lingkup.filter((p) => p.status === "siap" && p.sudah_perintah).length : 0],
    ["tanpa platform terpilih", tanpaPlatform],
  ];
  const jumlahDilewati = rincianLewat.reduce((n, [, x]) => n + x, 0);
  const teksRincian = rincianLewat
    .filter(([, n]) => n > 0)
    .map(([l, n]) => `${l} ${n}`)
    .join(" · ");

  const variasiTerpakai = pakaiVariasi ? variasi : [];
  const variasiBasi = pakaiVariasi && variasi.length > 0 && captionVariasi !== caption.trim();
  const panjangTerpanjang = Math.max(caption.trim().length, ...variasiTerpakai.map((v) => v.length));
  const lewatBatas = BATAS_CAPTION_PLATFORM.filter((b) => platforms.has(b.platform) && panjangTerpanjang > b.batas);

  const sekarang = Date.now();
  const minMulai = sekarang + KEBIJAKAN_SIARAN.JADWAL_MIN_MENIT * 60_000;
  const maksMulai = sekarang + KEBIJAKAN_SIARAN.JADWAL_MAKS_HARI * 86_400_000;
  const mulaiTerjadwal = mode === "terjadwal" && mulaiLokal ? new Date(mulaiLokal).getTime() : Number.NaN;
  const mulaiOk = mode !== "terjadwal" || (Number.isFinite(mulaiTerjadwal) && mulaiTerjadwal >= minMulai - 30_000 && mulaiTerjadwal <= maksMulai);
  const jedaAngka = Number(jedaTeks);
  const jedaOk = mode === "serentak" || (jedaTeks.trim() !== "" && Number.isInteger(jedaAngka) && jedaAngka >= KEBIJAKAN_SIARAN.JEDA_MIN && jedaAngka <= KEBIJAKAN_SIARAN.JEDA_MAKS);
  const jedaDipakai = mode === "serentak" ? 0 : jedaOk ? jedaAngka : KEBIJAKAN_SIARAN.JEDA_BAWAAN;
  const mulaiRencana = mode === "terjadwal" ? (Number.isFinite(mulaiTerjadwal) ? mulaiTerjadwal : null) : sekarang + 15_000;
  const jadwal = mulaiRencana != null && jumlahAkun > 0 ? jadwalKirim({ jumlah: jumlahAkun, mode, mulaiMs: mulaiRencana, jedaDetik: jedaDipakai, benih: 1 }) : [];
  const mulaiMs = jadwal[0] ?? mulaiRencana;
  const selesaiMs = perkiraanSelesai(jadwal);

  const wajibKonfirmasi = perluKonfirmasi(jumlahAkun);
  const konfirmasiOk = !wajibKonfirmasi || konfirmasiSah(konfirmasi);
  const sibuk = tahapKirim !== "";

  const kurang: string[][] = [
    [
      ...(sumber === "unggah" ? (berkas ? [] : ["Pilih berkas video dari perangkat."]) : video ? [] : ["Pilih satu video dari daftar."]),
      ...(judul.trim().length >= 3 ? [] : ["Isi judul video (minimal 3 huruf)."]),
    ],
    [
      ...(!penerimaCocok ? [memuatPenerima ? "Daftar akun penerima masih dimuat." : "Daftar akun penerima belum dimuat — tekan Muat ulang."] : []),
      ...(platforms.size > 0 ? [] : ["Pilih minimal satu platform tujuan."]),
      ...(penerimaCocok && jumlahAkun === 0 ? ["Centang minimal satu akun berstatus Siap yang punya platform terpilih."] : []),
      ...(jumlahAkun > KEBIJAKAN_SIARAN.MAKS_PENERIMA ? [`Maksimal ${KEBIJAKAN_SIARAN.MAKS_PENERIMA} akun per siaran.`] : []),
    ],
    [
      ...(caption.length > KEBIJAKAN_SIARAN.CAPTION_MAKS ? [`Caption maksimal ${KEBIJAKAN_SIARAN.CAPTION_MAKS} karakter.`] : []),
      ...(jedaOk ? [] : [`Jeda antar akun harus bilangan bulat ${KEBIJAKAN_SIARAN.JEDA_MIN}–${KEBIJAKAN_SIARAN.JEDA_MAKS} detik.`]),
      ...(mulaiOk ? [] : [`Pilih waktu mulai antara ${KEBIJAKAN_SIARAN.JADWAL_MIN_MENIT} menit dan ${KEBIJAKAN_SIARAN.JADWAL_MAKS_HARI} hari dari sekarang.`]),
    ],
    [...(konfirmasiOk ? [] : [`Ketik ${KATA_KONFIRMASI} untuk mengonfirmasi siaran ke ${jumlahAkun} akun.`])],
  ];
  const semuaKurang = kurang.flat();

  // ------------------------------------------------------------
  // Aksi
  // ------------------------------------------------------------
  async function muatPenerima(kunci: string) {
    const ini = ++nomorPenerima.current;
    kunciDimuat.current = kunci;
    setMemuatPenerima(true);
    setGalatPenerima("");
    // Nilai saat muat dipanggil: dipakai untuk usulan awal / merapikan pilihan.
    const lewatiSaatIni = lewatiSudah && kunci !== "";
    const platformSaatIni = platforms;
    try {
      const d = await getPenerimaSiaran(kunci || null);
      if (ini !== nomorPenerima.current || !hidup.current) return;
      const layak = d.filter((p) => p.status === "siap" && !(lewatiSaatIni && p.sudah_perintah));
      setPenerima(d);
      setPenerimaUntuk(kunci);
      setBatasTampil(RENDER_PER);
      if (!sudahUsul.current) {
        // Usulan awal Nara: semua akun siap yang punya platform terpilih (maks batas per siaran).
        sudahUsul.current = true;
        setDipilih(
          new Set(
            layak
              .filter((p) => p.platform_siap.some((x) => platformSaatIni.has(x)))
              .slice(0, KEBIJAKAN_SIARAN.MAKS_PENERIMA)
              .map((p) => p.user_id),
          ),
        );
      } else {
        const boleh = new Set(layak.map((p) => p.user_id));
        setDipilih((s) => new Set([...s].filter((id) => boleh.has(id))));
      }
    } catch (e) {
      if (ini !== nomorPenerima.current || !hidup.current) return;
      kunciDimuat.current = null;
      setGalatPenerima(e instanceof Error ? e.message : "Gagal memuat daftar akun.");
    } finally {
      if (ini === nomorPenerima.current && hidup.current) setMemuatPenerima(false);
    }
  }

  function pastikanPenerima() {
    if (penerimaUntuk === kunciPerintah && penerima !== null) return;
    if (memuatPenerima && kunciDimuat.current === kunciPerintah) return;
    void muatPenerima(kunciPerintah);
  }

  function pindahKe(target: number) {
    if (sibuk) return;
    if (target <= langkah) {
      setLangkah(target);
      setTunjukKurang(false);
      return;
    }
    let tujuan = langkah;
    while (tujuan < target && kurang[tujuan]!.length === 0) tujuan += 1;
    if (tujuan >= 1) pastikanPenerima();
    setLangkah(tujuan);
    setTunjukKurang(tujuan < target);
  }

  function gantiSumber(s: SumberVideoSiaran) {
    if (s === sumber) return;
    setSumber(s);
    setVideoId(null);
  }

  function pilihVideo(v: PilihanVideo) {
    setVideoId(v.id);
    if (judul.trim() === "" || judul === judulOtomatis) {
      const j = v.judul.slice(0, 100);
      setJudul(j);
      setJudulOtomatis(j);
    }
  }

  function pilihBerkas(f: File | null) {
    if (f && f.size > BATAS_BERKAS_MB * 1024 * 1024) {
      toast("peringatan", `Video ${Math.round(f.size / 1_048_576)} MB — maksimal ${BATAS_BERKAS_MB} MB`, "Kecilkan dulu sampai di bawah batas.");
      if (inputRef.current) inputRef.current.value = "";
      setBerkas(null);
      return;
    }
    setBerkas(f);
    if (f && (judul.trim() === "" || judul === judulOtomatis)) {
      const j = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 100);
      setJudul(j);
      setJudulOtomatis(j);
    }
  }

  function tukarPilih(p: PenerimaSiaran) {
    if (!bisaDipilih(p) || sibuk) return;
    if (!dipilih.has(p.user_id) && dipilih.size >= KEBIJAKAN_SIARAN.MAKS_PENERIMA) {
      toast("peringatan", `Maksimal ${KEBIJAKAN_SIARAN.MAKS_PENERIMA} akun per siaran`, "Hapus centang akun lain dulu, atau bagi menjadi beberapa siaran.");
      return;
    }
    setDipilih((s) => {
      const n = new Set(s);
      if (n.has(p.user_id)) n.delete(p.user_id);
      else n.add(p.user_id);
      return n;
    });
  }

  function pilihSemuaTampil() {
    const n = new Set(dipilih);
    let terpotong = false;
    for (const p of tersaring) {
      if (!bisaDipilih(p) || n.has(p.user_id)) continue;
      if (n.size >= KEBIJAKAN_SIARAN.MAKS_PENERIMA) {
        terpotong = true;
        break;
      }
      n.add(p.user_id);
    }
    setDipilih(n);
    if (terpotong) toast("peringatan", `Dibatasi ${KEBIJAKAN_SIARAN.MAKS_PENERIMA} akun per siaran`, "Sisanya tidak dicentang. Siarkan sisanya di siaran berikutnya.");
  }

  function tukarLewati() {
    const baru = !lewatiSudah;
    setLewatiSudah(baru);
    if (baru && penerima) {
      const sudah = new Set(penerima.filter((p) => p.sudah_perintah).map((p) => p.user_id));
      setDipilih((s) => new Set([...s].filter((id) => !sudah.has(id))));
    }
  }

  function tukarPlatform(p: string) {
    setPlatforms((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  }

  async function mintaVariasi() {
    if (memintaVariasi) return;
    const c = caption.trim();
    if (c.length < 10) {
      toast("peringatan", "Caption utama terlalu pendek", "Tulis caption utama dulu (minimal 10 huruf), lalu minta variasi.");
      return;
    }
    setMemintaVariasi(true);
    try {
      const r = await variasiCaptionNara(judul.trim(), c);
      if (!hidup.current) return;
      setVariasi(r.variasi.slice(0, KEBIJAKAN_SIARAN.VARIAN_MAKS));
      setCaptionVariasi(c);
      setPesanVariasi(r.pesan);
      if (!r.tersedia) toast("peringatan", "Variasi belum tersedia", r.pesan);
    } catch (e) {
      toast("error", "Variasi gagal dibuat", e instanceof Error ? e.message : "");
    } finally {
      if (hidup.current) setMemintaVariasi(false);
    }
  }

  function aturUlang() {
    setLangkah(0);
    setTunjukKurang(false);
    setVideoId(null);
    setBerkas(null);
    if (inputRef.current) inputRef.current.value = "";
    setJudul("");
    setJudulOtomatis("");
    setPenerima(null);
    setPenerimaUntuk(null);
    kunciDimuat.current = null;
    sudahUsul.current = false;
    setDipilih(new Set());
    setCari("");
    setWilayah("");
    setSaringPlatform("");
    setSaringStatus("siap");
    setLewatiSudah(true);
    setPlatforms(new Set(PLATFORM_SIARAN));
    setCaption("");
    setPakaiVariasi(true);
    setVariasi([]);
    setCaptionVariasi("");
    setPesanVariasi("");
    setMode("serentak");
    setMulaiLokal("");
    setJedaTeks(String(KEBIJAKAN_SIARAN.JEDA_BAWAAN));
    setTampilRuang(true);
    setKonfirmasi("");
    void muatSumber();
  }

  async function siarkan() {
    if (sibukRef.current) return;
    if (semuaKurang.length > 0) {
      setTunjukKurang(true);
      toast("peringatan", "Belum bisa menyiarkan", semuaKurang[0]);
      return;
    }
    sibukRef.current = true;
    const ctrl = new AbortController();
    batalRef.current = ctrl;
    try {
      let isiVideo: IsianSiaranKoordinator["video"];
      if (sumber === "unggah") {
        if (!berkas) throw new Error("Pilih berkas video dulu.");
        setTahapKirim("unggah");
        setPersen(0);
        const h = await unggahVideoTvrku(berkas, {
          onProgres: (p) => {
            if (hidup.current) setPersen(p);
          },
          signal: ctrl.signal,
        });
        isiVideo = { sumber: "unggah", ...(h.cara === "r2" ? { r2_key: h.r2_key } : { path: h.path }), ukuran: h.ukuran };
      } else {
        if (!videoId) throw new Error("Pilih videonya dulu.");
        isiVideo = { sumber, id: videoId };
      }
      if (!hidup.current) return;
      setTahapKirim("siapkan");
      const r = await siarkanKoordinator({
        video: isiVideo,
        judul: judul.trim(),
        caption: caption.trim(),
        variasi: variasiTerpakai,
        platforms: [...platforms],
        penerima: akunKirim.map((a) => a.p.user_id),
        mode,
        jeda_detik: jedaDipakai,
        mulai: mode === "terjadwal" ? new Date(mulaiTerjadwal).toISOString() : undefined,
        konfirmasi: wajibKonfirmasi ? konfirmasi.trim() : undefined,
        tampil_ruang: tampilRuang,
        perintah_id: perintahId,
      });
      const selesai = r.selesai ? Date.parse(r.selesai) : null;
      toast(
        "sukses",
        mode === "terjadwal" ? "Siaran dijadwalkan" : "Siaran dimulai",
        `${r.jumlah} akun masuk antrean${r.dilewati ? `, ${r.dilewati} dilewati server` : ""}. Mulai ${teksWib(Date.parse(r.mulai))}${selesai ? `, perkiraan selesai ${teksWib(selesai)}` : ""}.`,
      );
      if (!hidup.current) return;
      aturUlang();
      onTerkirim(r.id);
    } catch (e) {
      if (adalahPembatalanUnggah(e)) toast("info", "Unggahan dibatalkan", "Siaran tidak dibuat.");
      else toast("error", "Siaran gagal dibuat", e instanceof Error ? e.message : "");
    } finally {
      sibukRef.current = false;
      batalRef.current = null;
      if (hidup.current) {
        setTahapKirim("");
        setPersen(0);
      }
    }
  }

  // ------------------------------------------------------------
  // Ringkasan Nara (disusun dari keadaan, bukan LLM)
  // ------------------------------------------------------------
  const daftarPlatformTeks = PLATFORM_SIARAN.filter((p) => platforms.has(p)).map(labelPlatform).join(", ") || "belum ada platform";
  const ringkasVideo = (): string => {
    let t: string;
    if (sumber === "unggah") {
      t = berkas
        ? `Video: berkas “${berkas.name}” (${teksUkuran(berkas.size)}). Berkas baru diunggah saat Anda menekan Siarkan.`
        : `Pilih berkas video dari perangkat (maks ${BATAS_BERKAS_MB} MB). Berkas baru diunggah saat Anda menekan Siarkan.`;
    } else if (!dataSumber) {
      t = galatSumber ? `Daftar video gagal dimuat: ${galatSumber}` : "Saya sedang memuat daftar video…";
    } else if (!video) {
      t = `Pilih video yang akan disiarkan. Tersedia ${dataSumber.acc.length} di Antrean ACC, ${dataSumber.stok_tim.length} di Stok Video tim, dan ${dataSumber.video_wajib.length} bahan Video Wajib aktif — atau unggah berkas baru.`;
    } else {
      t = `Video: “${video.judul}” dari ${LABEL_SUMBER_VIDEO[sumber]}${kategori ? `, kategori ${kategori}` : ""}.`;
      if (perintahId) t += ` Terikat ke Video Wajib #${perintahId}, jadi posting anggota dihitung di Pantau & Insight.`;
    }
    if (judul.trim().length < 3 && (video || berkas)) t += " Judul masih kosong.";
    return t;
  };
  const naraPesan: string[] = [ringkasVideo()];
  if (langkah >= 1) {
    if (memuatPenerima && !penerimaCocok) naraPesan.push("Saya sedang memeriksa akun anggota yang tertaut di upload-post…");
    else if (galatPenerima && !penerimaCocok) naraPesan.push(`Daftar akun gagal dimuat: ${galatPenerima}`);
    else if (jumlahAkun === 0) naraPesan.push(`Belum ada akun yang dipilih. Centang akun berstatus Siap; ${jumlahDilewati} tidak bisa dipilih${teksRincian ? ` (${teksRincian})` : ""}.`);
    else
      naraPesan.push(
        `Saya pilih ${jumlahAkun} akun siap, ${jumlahPosting} posting${wilayah ? ` di ${wilayah}` : ""}; ${jumlahDilewati} dilewati${teksRincian ? ` (${teksRincian})` : ""}. Dari ${semuaPenerima.length} anggota berprofil upload-post.`,
      );
  }
  if (langkah >= 2) {
    const v = variasiTerpakai.length
      ? `${variasiTerpakai.length} variasi + caption utama, dipakai bergiliran per akun; fakta dan kredit sumber dikunci`
      : "tidak dipakai — caption utama untuk semua akun";
    let t = `Variasi caption: ${v}. Cara kirim ${LABEL_MODE[mode].toLowerCase()}${mode !== "serentak" ? `, jeda ±${jedaDipakai} dtk` : ""}`;
    t += mulaiMs != null ? `; mulai ${teksWib(mulaiMs)}${selesaiMs != null && mode !== "serentak" ? `, perkiraan selesai ${teksWib(selesaiMs)}` : ""}.` : "; waktu mulai belum dipilih.";
    if (mode === "serentak") t += " Semua akun dikirim sekaligus secepat mungkin; bila platform mulai menandai spam, pakai bertahap.";
    naraPesan.push(t);
  }
  if (langkah >= 3) {
    naraPesan.push(
      `Ringkasan: “${judul.trim() || "tanpa judul"}” ke ${jumlahAkun} akun (${jumlahPosting} posting) di ${daftarPlatformTeks}, ${LABEL_MODE[mode].toLowerCase()}.` +
        (wajibKonfirmasi ? ` Karena lebih dari ${KEBIJAKAN_SIARAN.KONFIRMASI_DI_ATAS} akun, ketik ${KATA_KONFIRMASI} dulu.` : "") +
        " Periksa pagar, lalu tekan Siarkan.",
    );
  }

  // ------------------------------------------------------------
  // Tampilan
  // ------------------------------------------------------------
  const panelNara = (
    <GlassCard className="p-3.5">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fb7185]/20 font-heading text-[15px] font-bold text-[#fb7185]" aria-hidden="true">
          N
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[14px] text-[#fb7185]">Nara</b>
          <span className="block text-[11px] text-teks-sekunder">Koordinator Redaksi · ringkasan rencana</span>
        </span>
      </div>
      <ol className="m-0 mt-3 grid list-none gap-2 p-0" aria-live="polite">
        {naraPesan.map((t, i) => (
          <li
            key={i}
            className={cn(
              "rounded-xl border px-3 py-2 text-[12px] leading-relaxed",
              i === langkah ? "border-[#fb7185]/40 bg-[#fb7185]/[0.07] text-teks-utama" : "border-glass-border text-teks-sekunder",
            )}
          >
            <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-teks-sekunder">
              {i + 1}. {LANGKAH[i]![0]}
            </span>
            {t}
          </li>
        ))}
      </ol>
      <p className="m-0 mt-2.5 text-[10.5px] leading-relaxed text-teks-sekunder">Nara hanya mengusulkan; siaran berjalan setelah Anda menekan Siarkan.</p>
    </GlassCard>
  );

  const navLangkah = (
    <ol className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4" aria-label="Langkah siaran">
      {LANGKAH.map(([nama, ket], i) => {
        const kini = i === langkah;
        const lewat = i < langkah;
        return (
          <li key={nama} className="min-w-0">
            <button
              type="button"
              onClick={() => pindahKe(i)}
              disabled={sibuk}
              aria-current={kini ? "step" : undefined}
              className={cn(
                "btn-tekan flex min-h-14 w-full items-center gap-2.5 rounded-2xl border px-3 py-2 text-left disabled:opacity-60",
                kini ? "border-2 border-teks-utama/70 bg-white/60 dark:bg-white/10" : "border-glass-border",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold",
                  kini ? "bg-teks-utama text-white dark:text-black" : lewat ? "bg-sukses/20 text-emerald-700 dark:text-emerald-400" : "bg-black/5 text-teks-sekunder dark:bg-white/10",
                )}
              >
                {lewat ? <Check className="h-3.5 w-3.5" aria-label="selesai" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-bold text-teks-utama">{nama}</span>
                <span className="block truncate text-[10.5px] text-teks-sekunder">{ket}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  // ---- Langkah 1 ----
  const langkahVideo = () => (
    <div className="space-y-3.5">
      <h2 className={JUDUL_BAGIAN}>Video yang disiarkan</h2>
      <div role="radiogroup" aria-label="Sumber video" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {SUMBER_URUT.map((s) => {
          const aktif = s === sumber;
          const n = s === "unggah" ? null : (dataSumber?.[s]?.length ?? null);
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={aktif}
              onClick={() => gantiSumber(s)}
              className={cn(
                "btn-tekan flex min-h-[76px] flex-col items-start gap-1 rounded-2xl border p-3 text-left",
                aktif ? "border-2 border-pri/70 bg-pri/[0.06]" : "border-glass-border",
              )}
            >
              <span className="text-[13px] font-bold text-teks-utama">
                {LABEL_SUMBER_VIDEO[s]}
                {n !== null ? <span className="ml-1 text-[11px] font-semibold text-teks-sekunder">({n})</span> : null}
              </span>
              <span className="text-[11px] leading-snug text-teks-sekunder">{KET_SUMBER[s]}</span>
            </button>
          );
        })}
      </div>

      {sumber === "unggah" ? (
        <div>
          <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => pilihBerkas(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={sibuk}
            className="glass btn-tekan flex w-full items-center justify-center gap-2 rounded-xl px-3 py-5 text-[13px] font-bold text-teks-utama disabled:opacity-60"
          >
            <UploadCloud className="h-5 w-5 shrink-0 text-pri" />
            <span className="min-w-0 truncate">{berkas ? `${berkas.name} (${teksUkuran(berkas.size)})` : "Pilih berkas video"}</span>
          </button>
          <p className="m-0 mt-1 text-[10.5px] text-teks-sekunder">
            Maksimal {BATAS_BERKAS_MB} MB (MP4/MOV/WebM). Berkas diunggah saat Anda menekan Siarkan di langkah terakhir.
          </p>
        </div>
      ) : dataSumber === null ? (
        galatSumber ? (
          <div className="rounded-xl border border-gagal/30 bg-gagal/[0.06] p-3 text-[12.5px] text-teks-utama">
            Daftar video gagal dimuat: {galatSumber}{" "}
            <button type="button" onClick={() => void muatSumber()} className="btn-tekan font-bold text-pri underline">
              Coba lagi
            </button>
          </div>
        ) : (
          <GlassSkeleton className="h-40 rounded-2xl" />
        )
      ) : daftarVideo.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-glass-border p-4 text-center text-[12.5px] text-teks-sekunder">{KOSONG_SUMBER[sumber as SumberDaftar]}</p>
      ) : (
        <div role="radiogroup" aria-label={`Pilihan video ${LABEL_SUMBER_VIDEO[sumber]}`} className="grid max-h-[420px] gap-1.5 overflow-y-auto pr-0.5">
          {daftarVideo.map((v) => {
            const aktif = v.id === videoId;
            const meta = [teksDurasi(v.durasi), teksUkuran(v.ukuran), v.waktu ? teksWib(Date.parse(v.waktu)) : ""].filter(Boolean).join(" · ");
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={aktif}
                onClick={() => pilihVideo(v)}
                className={cn(
                  "btn-tekan flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left",
                  aktif ? "border-2 border-pri/70 bg-pri/[0.06]" : "border-glass-border",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2", aktif ? "border-pri" : "border-teks-sekunder/50")}
                >
                  {aktif && <span className="h-2 w-2 rounded-full bg-pri" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[13px] font-bold text-teks-utama">{v.judul}</span>
                  <span className="block break-words text-[11px] text-teks-sekunder">{v.keterangan}</span>
                  {(v.kategori || meta) && (
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-teks-sekunder">
                      {v.kategori && <span className="rounded-[3px] bg-[#c2413b] px-1.5 py-px font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-white">{v.kategori}</span>}
                      {meta}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div>
        <label htmlFor="sa-judul" className="mb-1 block text-xs text-teks-sekunder">
          Judul video (wajib, minimal 3 huruf)
        </label>
        <input
          id="sa-judul"
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          maxLength={100}
          disabled={sibuk}
          placeholder="Judul yang tampil di sosmed anggota"
          className={cn(KELAS_INPUT, "h-11")}
        />
      </div>

      {perintahId && (
        <p className="m-0 flex flex-wrap items-center gap-1.5 text-[11.5px] text-teks-sekunder">
          {kategori && <span className="rounded-[3px] bg-[#c2413b] px-1.5 py-px font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-white">{kategori}</span>}
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 dark:text-amber-300">terikat ke Video Wajib #{perintahId}</span>
          posting anggota dihitung di Pantau & Insight.
        </p>
      )}
    </div>
  );

  // ---- Langkah 2 ----
  const langkahPenerima = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className={JUDUL_BAGIAN}>Pilih akun penerima</h2>
          <p className="m-0 mt-0.5 text-[11px] text-teks-sekunder">Hanya anggota terdaftar yang sudah menautkan sosmed lewat upload-post.</p>
        </div>
        <button
          type="button"
          onClick={() => void muatPenerima(kunciPerintah)}
          disabled={memuatPenerima || sibuk}
          className="btn-tekan inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-glass-border px-3 text-[12px] font-bold text-teks-utama disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", memuatPenerima && "animate-spin")} /> Muat ulang
        </button>
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1.5 text-xs text-teks-sekunder">Platform tujuan</legend>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORM_SIARAN.map((p) => {
            const aktif = platforms.has(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={aktif}
                onClick={() => tukarPlatform(p)}
                disabled={sibuk}
                className={cn(
                  "btn-tekan inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-[12px] font-bold",
                  aktif ? "border-teks-utama/60 bg-white/60 text-teks-utama dark:bg-white/10" : "border-glass-border text-teks-sekunder opacity-70",
                )}
              >
                <PlatformIcon platform={p} size={14} />
                {labelPlatform(p)}
                {aktif && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="sa-cari" className="sr-only">
            Cari nama atau username anggota
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teks-sekunder" aria-hidden="true" />
          <input id="sa-cari" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama atau username" className={cn(KELAS_INPUT, "h-11 pl-9")} />
        </div>
        <label className="block text-[11px] text-teks-sekunder">
          <span className="sr-only">Wilayah</span>
          <select value={wilayah} onChange={(e) => setWilayah(e.target.value)} className={cn(KELAS_INPUT, "h-11")} aria-label="Saring wilayah">
            <option value="">Semua wilayah</option>
            {daftarWilayah.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-teks-sekunder">
          <span className="sr-only">Platform tertaut</span>
          <select value={saringPlatform} onChange={(e) => setSaringPlatform(e.target.value)} className={cn(KELAS_INPUT, "h-11")} aria-label="Saring platform tertaut">
            <option value="">Semua platform</option>
            {PLATFORM_SIARAN.map((p) => (
              <option key={p} value={p}>
                {labelPlatform(p)} siap
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-teks-sekunder">
          <span className="sr-only">Status akun</span>
          <select value={saringStatus} onChange={(e) => setSaringStatus(e.target.value as "siap" | "semua")} className={cn(KELAS_INPUT, "h-11")} aria-label="Saring status akun">
            <option value="siap">Hanya yang siap</option>
            <option value="semua">Semua status</option>
          </select>
        </label>
      </div>

      {kunciPerintah !== "" && (
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-[12.5px] text-teks-utama">
          <input type="checkbox" checked={lewatiSudah} onChange={tukarLewati} disabled={sibuk} className="h-4 w-4 accent-[#DC2626]" />
          Lewati yang sudah memposting perintah #{kunciPerintah}
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={pilihSemuaTampil}
          disabled={!penerimaCocok || sibuk}
          className="btn-tekan min-h-10 rounded-xl border border-glass-border px-3 text-[12px] font-bold text-teks-utama disabled:opacity-50"
        >
          Pilih semua yang tampil & siap
        </button>
        <button
          type="button"
          onClick={() => setDipilih(new Set())}
          disabled={dipilih.size === 0 || sibuk}
          className="btn-tekan min-h-10 rounded-xl border border-glass-border px-3 text-[12px] font-bold text-teks-sekunder disabled:opacity-50"
        >
          Kosongkan
        </button>
        <span className="ml-auto text-[12px] font-bold text-teks-utama" aria-live="polite">
          {jumlahAkun} akun dipilih · {jumlahPosting} posting
        </span>
      </div>

      {!penerimaCocok ? (
        galatPenerima && !memuatPenerima ? (
          <div className="rounded-xl border border-gagal/30 bg-gagal/[0.06] p-3 text-[12.5px] text-teks-utama">
            Daftar akun gagal dimuat: {galatPenerima}{" "}
            <button type="button" onClick={() => void muatPenerima(kunciPerintah)} className="btn-tekan font-bold text-pri underline">
              Coba lagi
            </button>
          </div>
        ) : (
          <GlassSkeleton className="h-56 rounded-2xl" />
        )
      ) : semuaPenerima.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-glass-border p-4 text-center text-[12.5px] text-teks-sekunder">
          Belum ada anggota yang menautkan sosmed lewat upload-post.
        </p>
      ) : tersaring.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-glass-border p-4 text-center text-[12.5px] text-teks-sekunder">
          Tidak ada akun yang cocok dengan saringan ini.{saringStatus === "siap" ? " Pilih “Semua status” untuk melihat akun yang belum siap." : ""}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-glass-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="bg-black/[0.03] text-[10.5px] uppercase tracking-[0.06em] text-teks-sekunder dark:bg-white/[0.04]">
                  <th scope="col" className="w-10 px-3 py-2">
                    <span className="sr-only">Pilih</span>
                  </th>
                  <th scope="col" className="px-2 py-2 font-bold">Anggota</th>
                  <th scope="col" className="px-2 py-2 font-bold">Wilayah</th>
                  <th scope="col" className="px-2 py-2 font-bold">Akun tertaut</th>
                  <th scope="col" className="px-2 py-2 font-bold">Siaran hari ini</th>
                  <th scope="col" className="px-2 py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {tersaring.slice(0, batasTampil).map((p) => {
                  const bisa = bisaDipilih(p);
                  const sudahLewat = lewati && p.sudah_perintah && p.status === "siap";
                  return (
                    <tr key={p.user_id} className={cn("border-t border-glass-border", !bisa && "text-teks-sekunder opacity-75")}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={bisa && dipilih.has(p.user_id)}
                          disabled={!bisa || sibuk}
                          onChange={() => tukarPilih(p)}
                          aria-label={`Pilih ${p.nama || p.username}`}
                          className="h-4 w-4 accent-[#DC2626]"
                        />
                      </td>
                      <td className="max-w-[200px] px-2 py-2">
                        <span className="block truncate font-bold text-teks-utama">{p.nama || "—"}</span>
                        {p.username && <span className="block truncate text-[11px] text-teks-sekunder">@{p.username.replace(/^@/, "")}</span>}
                      </td>
                      <td className="max-w-[160px] truncate px-2 py-2">{p.wilayah || "—"}</td>
                      <td className="px-2 py-2">
                        {p.platform.length === 0 ? (
                          <span className="text-[11px] text-teks-sekunder">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {p.platform.map((x) => {
                              const ulang = p.perlu_ulang.includes(x);
                              const tujuan = platforms.has(x);
                              return (
                                <span
                                  key={x}
                                  title={`${labelPlatform(x)}${ulang ? " — perlu login ulang" : tujuan ? "" : " — bukan platform tujuan"}`}
                                  className={cn(
                                    "relative inline-flex h-6 w-6 items-center justify-center rounded-md border",
                                    ulang ? "border-amber-500/70 bg-amber-500/10" : "border-glass-border",
                                    !tujuan && !ulang && "opacity-40",
                                  )}
                                >
                                  <PlatformIcon platform={x} size={13} />
                                  {ulang && <AlertTriangle className="absolute -right-1 -top-1 h-3 w-3 text-amber-600" aria-hidden="true" />}
                                  <span className="sr-only">{ulang ? `${labelPlatform(x)} perlu login ulang` : labelPlatform(x)}</span>
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {p.siaran_hari_ini}/{KEBIJAKAN_SIARAN.BATAS_HARIAN}
                      </td>
                      <td className="px-2 py-2">
                        <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold", sudahLewat ? KELAS_STATUS.batas_harian : KELAS_STATUS[p.status])}>
                          {sudahLewat ? `Sudah memposting #${kunciPerintah}` : LABEL_STATUS_PENERIMA[p.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {tersaring.length > batasTampil && (
            <button
              type="button"
              onClick={() => setBatasTampil((n) => n + RENDER_PER)}
              className="btn-tekan min-h-10 w-full rounded-xl border border-glass-border text-[12px] font-bold text-teks-utama"
            >
              Tampilkan lebih banyak ({tersaring.length - batasTampil} lagi)
            </button>
          )}
        </>
      )}

      <p className="m-0 text-[10.5px] leading-relaxed text-teks-sekunder">
        Menampilkan {Math.min(batasTampil, tersaring.length)} dari {tersaring.length} akun sesuai saringan ({semuaPenerima.length} anggota berprofil upload-post). Anggota sudah
        menyetujui siaran koordinator saat mendaftar; akun yang perlu login ulang, mencapai batas {KEBIJAKAN_SIARAN.BATAS_HARIAN} siaran per hari, atau belum menautkan sosmed
        tidak bisa dipilih. Maksimal {KEBIJAKAN_SIARAN.MAKS_PENERIMA} akun per siaran.
      </p>
    </div>
  );

  // ---- Langkah 3 ----
  const langkahCaption = () => (
    <div className="space-y-3.5">
      <h2 className={JUDUL_BAGIAN}>Caption dan jadwal</h2>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <div className="min-w-0 space-y-2.5">
          <div>
            <label htmlFor="sa-caption" className="mb-1 block text-xs text-teks-sekunder">
              Caption utama
            </label>
            <textarea
              id="sa-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              maxLength={KEBIJAKAN_SIARAN.CAPTION_MAKS}
              disabled={sibuk}
              placeholder="Tulis caption. Cantumkan kredit sumber bila ada (mis. Sumber: ANTARA)."
              className="glass-input min-h-[110px] w-full resize-y rounded-xl px-3 py-2 text-base text-teks-utama sm:text-[13px]"
            />
            <div className="mt-1 flex flex-wrap gap-1.5 text-[10.5px] font-bold">
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-teks-sekunder dark:bg-white/10">
                {caption.length}/{KEBIJAKAN_SIARAN.CAPTION_MAKS}
              </span>
              {BATAS_CAPTION_PLATFORM.filter((b) => platforms.has(b.platform)).map((b) => {
                const lebih = panjangTerpanjang > b.batas;
                return (
                  <span
                    key={b.platform}
                    className={cn("rounded-full px-2 py-0.5", lebih ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-sukses/15 text-emerald-700 dark:text-emerald-400")}
                  >
                    {labelPlatform(b.platform)} {panjangTerpanjang}/{b.batas}
                  </span>
                );
              })}
            </div>
            {lewatBatas.length > 0 && (
              <p role="status" className="m-0 mt-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                Caption{variasiTerpakai.length ? " atau salah satu variasi" : ""} melebihi batas {lewatBatas.map((b) => `${labelPlatform(b.platform)} (${b.batas})`).join(" dan ")}:
                posting di platform itu berisiko ditolak. Pendekkan caption atau hapus platform itu di langkah Penerima.
              </p>
            )}
            {caption.trim() === "" && <p className="m-0 mt-1.5 text-[11px] text-teks-sekunder">Caption kosong: hanya judul yang ikut terkirim.</p>}
          </div>

          <div className="rounded-xl border border-glass-border p-3">
            <div className="flex items-start gap-3">
              <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-teks-sekunder">
                <b className="text-teks-utama">Variasi oleh Nara</b> · tiap akun mendapat susunan kalimat berbeda secara bergiliran; fakta, angka, dan kredit sumber tetap.
              </span>
              <SwitchKaca aktif={pakaiVariasi} onUbah={() => setPakaiVariasi((v) => !v)} labelAria="Variasi caption oleh Nara" disabled={sibuk} />
            </div>
            {pakaiVariasi && (
              <div className="mt-2.5 space-y-2">
                <button
                  type="button"
                  onClick={() => void mintaVariasi()}
                  disabled={memintaVariasi || sibuk}
                  className="btn-tekan inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#fb7185]/50 bg-[#fb7185]/10 px-3 text-[12px] font-bold text-[#e11d48] disabled:opacity-50 dark:text-[#fb7185]"
                >
                  {memintaVariasi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {variasi.length ? "Minta variasi lagi" : "Minta variasi"}
                </button>
                {pesanVariasi && <p className="m-0 text-[11px] leading-relaxed text-teks-sekunder">{pesanVariasi}</p>}
                {variasiBasi && (
                  <p role="status" className="m-0 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                    Caption utama berubah setelah variasi dibuat. Minta variasi lagi; server membuang variasi yang angka atau sumbernya tidak cocok.
                  </p>
                )}
                {variasi.length > 0 ? (
                  <ul className="m-0 grid list-none gap-1.5 p-0">
                    {variasi.map((v, i) => (
                      <li key={`${i}-${v.slice(0, 20)}`} className="flex items-start gap-2 rounded-lg bg-black/[0.03] px-2.5 py-2 text-[12px] leading-relaxed text-teks-utama dark:bg-white/[0.05]">
                        <b className="shrink-0 text-[#e11d48] dark:text-[#fb7185]">{HURUF_VARIAN[i]}</b>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{v}</span>
                        <button
                          type="button"
                          onClick={() => setVariasi((d) => d.filter((_, j) => j !== i))}
                          disabled={sibuk}
                          aria-label={`Hapus variasi ${HURUF_VARIAN[i]}`}
                          className="btn-tekan -m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-teks-sekunder"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-[11px] text-teks-sekunder">Belum ada variasi — tanpa variasi, caption utama dipakai semua akun.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-2.5">
          <span className="block text-xs text-teks-sekunder" id="sa-cara-label">
            Cara mengirim
          </span>
          <div role="radiogroup" aria-labelledby="sa-cara-label" className="grid gap-1.5">
            {MODE_SIARAN.map((m) => {
              const aktif = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={aktif}
                  onClick={() => setMode(m)}
                  disabled={sibuk}
                  className={cn(
                    "btn-tekan flex w-full flex-col items-start gap-1 rounded-xl border p-3 text-left",
                    aktif ? "border-2 border-pri/70 bg-pri/[0.06]" : "border-glass-border",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-teks-utama">
                    {LABEL_MODE[m]}
                    {m === "serentak" && <span className="rounded-full bg-sukses/15 px-2 py-px text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400">Tercepat</span>}
                    {m === "bertahap" && <span className="rounded-full bg-black/5 px-2 py-px text-[10px] font-extrabold text-teks-sekunder dark:bg-white/10">Lebih aman</span>}
                  </span>
                  <span className="text-[11px] leading-snug text-teks-sekunder">{KET_MODE[m]}</span>
                </button>
              );
            })}
          </div>

          {mode === "terjadwal" && (
            <div>
              <label htmlFor="sa-mulai" className="mb-1 block text-xs text-teks-sekunder">
                Waktu mulai (paling cepat {KEBIJAKAN_SIARAN.JADWAL_MIN_MENIT} menit, paling lambat {KEBIJAKAN_SIARAN.JADWAL_MAKS_HARI} hari lagi)
              </label>
              <input
                id="sa-mulai"
                type="datetime-local"
                value={mulaiLokal}
                min={nilaiLokal(minMulai)}
                max={nilaiLokal(maksMulai)}
                onChange={(e) => setMulaiLokal(e.target.value)}
                disabled={sibuk}
                className={cn(KELAS_INPUT, "h-11")}
              />
            </div>
          )}
          {mode !== "serentak" && (
            <div>
              <label htmlFor="sa-jeda" className="mb-1 block text-xs text-teks-sekunder">
                Jeda antar akun (detik, {KEBIJAKAN_SIARAN.JEDA_MIN}–{KEBIJAKAN_SIARAN.JEDA_MAKS}; ditambah simpangan acak ±{KEBIJAKAN_SIARAN.JITTER} dtk)
              </label>
              <input
                id="sa-jeda"
                type="number"
                inputMode="numeric"
                min={KEBIJAKAN_SIARAN.JEDA_MIN}
                max={KEBIJAKAN_SIARAN.JEDA_MAKS}
                step={1}
                value={jedaTeks}
                onChange={(e) => setJedaTeks(e.target.value)}
                disabled={sibuk}
                className={cn(KELAS_INPUT, "h-11", !jedaOk && "ring-2 ring-amber-500/60")}
              />
            </div>
          )}

          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-glass-border p-3 text-[12px]">
            <dt className="text-teks-sekunder">Mulai</dt>
            <dd className="m-0 font-bold text-teks-utama">{mulaiMs != null ? teksWib(mulaiMs) : "pilih waktu mulai"}</dd>
            {mode !== "serentak" && (
              <>
                <dt className="text-teks-sekunder">Jeda antar akun</dt>
                <dd className="m-0 font-bold text-teks-utama">
                  {jedaDipakai} dtk ± acak{!jedaOk ? " (bawaan, isian belum sah)" : ""}
                </dd>
              </>
            )}
            <dt className="text-teks-sekunder">Perkiraan selesai</dt>
            <dd className="m-0 font-bold text-teks-utama">
              {selesaiMs != null && mulaiMs != null ? `±${teksWib(selesaiMs)} (${teksDurasiPanjang(selesaiMs - mulaiMs)})` : jumlahAkun === 0 ? "belum ada akun dipilih" : "—"}
            </dd>
            <dt className="text-teks-sekunder">Jam tenang</dt>
            <dd className="m-0 text-teks-utama">{mode === "serentak" ? "tidak berlaku untuk serentak" : "22.00–06.00 WIB dilewati"}</dd>
          </dl>
          {mode === "serentak" && (
            <p role="status" className="m-0 rounded-xl bg-amber-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-300">
              <b>Serentak.</b> {jumlahAkun} akun dikirim sekaligus.{" "}
              {variasiTerpakai.length > 0
                ? `Caption bergiliran dalam ${variasiTerpakai.length + 1} susunan, jadi postingan tidak identik.`
                : "Nyalakan variasi caption Nara supaya postingan tidak identik; platform bisa menandai atau membatasi akun yang memposting konten sama bersamaan."}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  // ---- Langkah 4 ----
  const pagar: { jenis: JenisPagar; judul: string; ket: string }[] = [
    { jenis: "ok", judul: "Persetujuan anggota", ket: "Disetujui saat pendaftaran SuperApp; koordinator bertindak setingkat superadmin atas akun tertaut." },
    {
      jenis: "ok",
      judul: "Akun siap",
      ket: `Hanya akun tertaut dan di bawah batas ${KEBIJAKAN_SIARAN.BATAS_HARIAN} siaran per hari; server memeriksa ulang saat menyiarkan.${teksRincian ? ` Dilewati: ${teksRincian}.` : ""}`,
    },
    lewatBatas.length
      ? { jenis: "warn", judul: "Batas caption", ket: `Melebihi batas ${lewatBatas.map((b) => labelPlatform(b.platform)).join(" dan ")}; posting di sana berisiko ditolak.` }
      : { jenis: "ok", judul: "Batas caption", ket: `Caption${variasiTerpakai.length ? " dan semua variasi" : ""} muat di batas tiap platform terpilih.` },
    mode === "serentak"
      ? { jenis: "warn", judul: "Laju kirim", ket: "Serentak: sebanyak mungkin akun sekaligus; platform bisa menandai posting identik yang bersamaan." }
      : { jenis: "ok", judul: "Laju kirim", ket: `${LABEL_MODE[mode]} ±${jedaDipakai} dtk dengan jeda acak; jam tenang 22.00–06.00 WIB dihormati.` },
    { jenis: "ok", judul: "Kabar ke pemilik akun", ket: "Tiap anggota menerima kabar dan bisa melihat riwayat siaran di TV Rakyat Saya." },
    tampilRuang
      ? { jenis: "ok", judul: "Ruang Bot", ket: "Karakter tiap anggota terpilih dipanggil ke Kotak Post sesuai giliran kirim." }
      : { jenis: "info", judul: "Ruang Bot", ket: "Siaran tidak ditampilkan di Ruang Bot." },
  ];

  const langkahTinjau = () => (
    <div className="space-y-3.5">
      <h2 className={JUDUL_BAGIAN}>Tinjau sebelum menyiarkan</h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Akun", nilai: String(jumlahAkun), ket: "" },
          { label: "Posting (akun × platform)", nilai: String(jumlahPosting), ket: daftarPlatformTeks },
          { label: "Dilewati", nilai: String(jumlahDilewati), ket: teksRincian || "tidak ada" },
          { label: "Cara kirim", nilai: LABEL_MODE[mode], ket: mode === "serentak" ? "sekaligus, secepat mungkin" : `mulai ${teksWib(mulaiMs)}` },
        ].map((u) => (
          <div key={u.label} className="min-w-0 rounded-2xl border border-glass-border p-3">
            <span className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-teks-sekunder">{u.label}</span>
            <span className="block font-heading text-[22px] font-extrabold leading-tight text-teks-utama">{u.nilai}</span>
            {u.ket && <span className="block break-words text-[10.5px] leading-snug text-teks-sekunder">{u.ket}</span>}
          </div>
        ))}
      </div>

      <ul className="m-0 grid list-none gap-1.5 p-0" aria-label="Pagar siaran">
        {pagar.map((g) => (
          <li key={g.judul} className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed", KELAS_PAGAR[g.jenis])}>
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold",
                g.jenis === "ok" ? "bg-sukses/20 text-emerald-700 dark:text-emerald-400" : g.jenis === "warn" ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-black/10 text-teks-sekunder dark:bg-white/10",
              )}
            >
              {g.jenis === "ok" ? "✓" : g.jenis === "warn" ? "!" : "i"}
            </span>
            <span className="min-w-0 text-teks-sekunder">
              <span className="sr-only">{g.jenis === "ok" ? "Lolos: " : g.jenis === "warn" ? "Perhatian: " : "Info: "}</span>
              <b className="text-teks-utama">{g.judul}</b> · {g.ket}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-start gap-3 rounded-xl border border-glass-border p-3">
        <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-teks-sekunder">
          <b className="text-teks-utama">Tampilkan di Ruang Bot.</b> Nara memanggil karakter tiap anggota terpilih; karakter membawa video dari rak dan memasukkannya ke Kotak Post
          sesuai giliran kirim.
        </span>
        <SwitchKaca aktif={tampilRuang} onUbah={() => setTampilRuang((v) => !v)} labelAria="Tampilkan siaran di Ruang Bot" disabled={sibuk} />
      </div>

      {wajibKonfirmasi && (
        <div className="rounded-xl border border-gagal/30 bg-gagal/[0.05] p-3">
          <label htmlFor="sa-konfirmasi" className="block text-[12px] leading-relaxed text-teks-utama">
            <b>Posting tidak bisa ditarik otomatis dari sosmed.</b> Ketik <b>{KATA_KONFIRMASI}</b> untuk mengonfirmasi siaran ke {jumlahAkun} akun.
          </label>
          <input
            id="sa-konfirmasi"
            value={konfirmasi}
            onChange={(e) => setKonfirmasi(e.target.value)}
            disabled={sibuk}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={KATA_KONFIRMASI}
            className={cn(KELAS_INPUT, "mt-2 h-11 font-bold tracking-[0.12em]", konfirmasiOk && "ring-2 ring-sukses/50")}
          />
        </div>
      )}

      {tahapKirim === "unggah" && (
        <div role="status" className="rounded-xl border border-glass-border p-3">
          <div className="flex items-center justify-between gap-2 text-[12px] font-bold text-teks-utama">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mengunggah berkas… {persen}%
            </span>
            <button type="button" onClick={() => batalRef.current?.abort()} className="btn-tekan min-h-9 rounded-lg px-2.5 text-[11.5px] font-bold text-red-600 dark:text-red-400">
              Batalkan unggahan
            </button>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" role="progressbar" aria-label="Kemajuan unggahan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={persen}>
            <div className="h-full rounded-full bg-pri transition-[width] duration-300" style={{ width: `${Math.max(2, Math.min(100, persen))}%` }} />
          </div>
        </div>
      )}
      {tahapKirim === "siapkan" && (
        <p role="status" className="m-0 inline-flex items-center gap-1.5 text-[12px] font-bold text-teks-utama">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyiapkan siaran… (menyalin video & menyusun giliran kirim)
        </p>
      )}
    </div>
  );

  const isiLangkah = [langkahVideo, langkahPenerima, langkahCaption, langkahTinjau][langkah]!();
  const terakhir = langkah === 3;
  const kurangKini = terakhir ? semuaKurang : kurang[langkah]!;
  const tampilkanKurang = (tunjukKurang || terakhir) && kurangKini.length > 0;

  return (
    <div className="grid gap-3.5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-3 lg:self-start" aria-label="Ringkasan rencana dari Nara">
        {panelNara}
      </aside>

      <section className="min-w-0 space-y-3" aria-label="Langkah siaran anggota">
        {navLangkah}
        <GlassCard className="p-3.5 sm:p-4">{isiLangkah}</GlassCard>

        <GlassCard className="p-3">
          {tampilkanKurang && (
            <ul role="alert" className="m-0 mb-2.5 grid list-none gap-1 rounded-xl bg-amber-500/10 p-2.5 text-[11.5px] leading-relaxed text-amber-800 dark:text-amber-300">
              {kurangKini.map((k) => (
                <li key={k} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {k}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 basis-full text-[11.5px] text-teks-sekunder sm:basis-auto">
              Rencana: {jumlahAkun} akun · {jumlahPosting} posting · {LABEL_MODE[mode].toLowerCase()}
            </span>
            <button
              type="button"
              onClick={() => pindahKe(langkah - 1)}
              disabled={langkah === 0 || sibuk}
              className="btn-tekan inline-flex min-h-11 items-center gap-1 rounded-xl border border-glass-border px-3.5 text-[13px] font-bold text-teks-utama disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> Kembali
            </button>
            {terakhir ? (
              <button
                type="button"
                onClick={() => void siarkan()}
                disabled={sibuk || semuaKurang.length > 0}
                className="btn-tekan inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-pri px-4 text-[13px] font-extrabold text-white disabled:opacity-50 sm:flex-none"
              >
                {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {tahapKirim === "unggah" ? `Mengunggah ${persen}%` : tahapKirim === "siapkan" ? "Menyiapkan siaran…" : `Siarkan ke ${jumlahAkun} akun`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => pindahKe(langkah + 1)}
                disabled={sibuk}
                className="btn-tekan inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-teks-utama px-4 text-[13px] font-extrabold text-white disabled:opacity-50 dark:text-black sm:flex-none"
              >
                Lanjut <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
