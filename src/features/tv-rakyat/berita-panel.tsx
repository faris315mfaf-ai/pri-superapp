"use client";

// ============================================================
// BeritaPanel — panel "Cek Berita Terbaru" modul TV Rakyat.
//
// Tombol memicu workflow n8n "TV Rakyat - Cek Berita Terbaru"
// (Apify → Supabase, batas 5 video terbaru), lalu daftarnya
// dibaca dari database.
//
// Hasilnya TIDAK ditampilkan sebagai satu daftar panjang, melainkan
// dipecah jadi seksi per sumber: Nusantara TV, Indozone, Lambe Turah.
// Alasannya: satu sumber bisa punya beberapa akun sekaligus (mis.
// Nusantara TV punya 3 akun di 2 platform), jadi tanpa pengelompokan
// admin harus memindai daftar campur aduk untuk tahu sumber mana yang
// sudah/belum keluar berita baru.
//
// Memilih sebuah video TIDAK langsung menyalin linknya ke form
// bawah. Video itu ditandai "Akan Direplikasi" supaya admin tahu
// video mana yang perlu dicarikan doksli-nya; doksli tetap diisi
// admin sendiri di form berikutnya.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Copy, ExternalLink, Newspaper, Radar, RefreshCw } from "lucide-react";
import { EmptyState, FadeInUp, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { getBeritaTerbaru, pindaiBeritaBaru } from "@/services";
import { toast } from "@/hooks/use-app-store";
import type { Berita } from "@/types";
import { cn } from "@/lib/utils";

type StatusPindai = "idle" | "memindai" | "selesai";

/** Durasi animasi pemindaian radar (milidetik) */
const DURASI_RADAR_MS = 1500;

// ------------------------------------------------------------
// Pengelompokan berita per sumber
// ------------------------------------------------------------

type DefinisiKelompok = {
  id: string;
  label: string;
  /** Username akun yang dianggap milik sumber ini (huruf kecil semua) */
  akun: string[];
  /**
   * Ejaan NAMA REDAKSI yang mungkin muncul di kolom `sumber` (huruf kecil).
   *
   * JARING PENGAMAN, bukan jalur utama. Diperiksa 24 Agustus 2026 langsung ke
   * Supabase: seluruh 14 baris `berita` mengisi `sumber` dengan USERNAME yang
   * sama persis dengan `sumber_akun` ('official.ntv', 'indozone.id', ...),
   * jadi pencocokan sehari-hari terjadi lewat daftar `akun` di atas.
   *
   * Daftar ini tetap ada karena `sumber` bertipe text bebas tanpa constraint:
   * data contoh lama (src/data/beritaNtv.ts) memakai "Nusantara TV", dan
   * n8n bisa saja suatu saat menulis nama redaksi. Tanpa jaring ini, baris
   * seperti itu diam-diam jatuh ke "Lainnya".
   */
  alias: string[];
  /** Warna aksen batang penanda seksi */
  batang: string;
  /** Warna aksen lencana jumlah berita */
  lencana: string;
};

/**
 * Peta akun → kelompok kartu.
 *
 * Dua kolom bisa menyimpan asal berita, jadi keduanya dipetakan:
 * - `sumber_akun` berisi username MENTAH hasil scraping ("official.ntv").
 *   Kolom ini baru ditambahkan di sql/07, jadi baris lama bisa NULL.
 * - `sumber` bertipe text bebas tanpa constraint. Di data produksi saat ini
 *   isinya username juga (sama persis dengan `sumber_akun`), tetapi data
 *   contoh lama memakai nama redaksi ("Nusantara TV") — karena itu nama
 *   redaksi tetap didaftarkan di `alias` sebagai jaring pengaman.
 *
 * Satu redaksi juga bisa punya lebih dari satu akun. Karena itu
 * pengelompokan dilakukan lewat peta ini, bukan lewat perbandingan
 * string apa adanya — kalau admin menambah akun baru di n8n, cukup
 * tambahkan username-nya di daftar `akun` yang sesuai (atau ejaan nama
 * redaksinya di `alias`).
 */
const KELOMPOK_SUMBER: DefinisiKelompok[] = [
  {
    id: "nusantara-tv",
    label: "Nusantara TV",
    akun: ["official.ntv", "officialnusantaratv", "news.nusantaratv"],
    alias: ["nusantara tv", "nusantaratv", "ntv"],
    batang: "bg-pri",
    lencana: "bg-pri/15 text-pri",
  },
  {
    id: "indozone",
    label: "Indozone",
    akun: ["indozone.id"],
    alias: ["indozone", "indozone id"],
    batang: "bg-info",
    lencana: "bg-info/15 text-info",
  },
  {
    id: "lambe-turah",
    label: "Lambe Turah",
    akun: ["lambe_turah", "officiallambeturah"],
    alias: ["lambe turah", "lambeturah"],
    batang: "bg-emas",
    lencana: "bg-emas/15 text-emas",
  },
];

/**
 * Kelompok cadangan untuk berita yang akunnya belum terdaftar di peta.
 * Sengaja TIDAK ikut dirender kalau isinya kosong — seksi kosong bernama
 * "Lainnya" hanya bikin admin bertanya-tanya, beda dengan tiga sumber
 * resmi yang memang harus selalu kelihatan.
 */
const KELOMPOK_LAINNYA: DefinisiKelompok = {
  id: "lainnya",
  label: "Lainnya",
  akun: [],
  alias: [],
  batang: "bg-teks-sekunder/60",
  lencana: "bg-black/5 text-teks-sekunder dark:bg-white/10",
};

/** Indeks pencarian username DAN nama redaksi → id kelompok, dibangun sekali */
const PETA_AKUN: Map<string, string> = new Map(
  KELOMPOK_SUMBER.flatMap((k) =>
    [...k.akun, ...k.alias].map((a) => [a.toLowerCase(), k.id] as const),
  ),
);

/**
 * Kunci pencocokan sumber sebuah berita, sudah dirapikan.
 *
 * `sumber_akun` didahulukan karena itu kolom yang paling spesifik
 * (username akun sumber); `sumber` dipakai hanya sebagai cadangan bila
 * kolom pertama kosong. Huruf kecil supaya "Official.NTV" dan
 * "official.ntv" tidak dianggap dua akun berbeda.
 */
function kunciSumber(berita: Berita): string {
  return (berita.sumber_akun || berita.sumber || "").trim().toLowerCase();
}

/** Tentukan berita ini milik kelompok mana. */
function idKelompokBerita(berita: Berita): string {
  return PETA_AKUN.get(kunciSumber(berita)) ?? KELOMPOK_LAINNYA.id;
}

/**
 * Sederhanakan judul agar dua judul yang sama persis tapi beda tanda
 * baca/kapitalisasi bisa dikenali sebagai satu berita.
 *
 * Sengaja hanya membuang tanda baca dan merapikan spasi — TIDAK memotong
 * kata atau mengukur kemiripan. Dua berita berbeda yang kebetulan mirip
 * temanya harus tetap tampil dua-duanya; menyembunyikan berita sah jauh
 * lebih merugikan daripada sesekali menampilkan kembaran.
 */
function normalkanJudul(judul: string): string {
  return (judul ?? "")
    .toLowerCase()
    .replace(/[^0-9a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Buang kembaran lintas platform DI DALAM satu kelompok.
 *
 * Satu video yang sama sering diunggah ke TikTok dan Instagram sekaligus
 * (mis. official.ntv + officialnusantaratv), jadi setelah dikelompokkan
 * per sumber dua kartu kembar itu berdampingan dan terlihat seperti bug.
 *
 * Aturan pemenangnya, berurutan:
 * 1. Video yang sedang dipilih admin selalu menang — kalau tidak, penanda
 *    "Akan Direplikasi" bisa lenyap sendiri setelah daftar dimuat ulang.
 * 2. Yang paling baru (`selisih_menit` terkecil).
 * 3. Kalau umurnya tidak diketahui: yang lebih dulu muncul, karena
 *    /api/berita sudah mengurutkan dari yang terbaru.
 *
 * Judul yang normalisasinya kosong (mis. judul cuma emoji) tidak pernah
 * digabung — tidak ada dasar yang cukup untuk menyebutnya kembar.
 *
 * Begitu juga dua unggahan dari AKUN YANG SAMA: kembaran lintas platform
 * menurut definisinya datang dari akun berbeda, jadi judul yang sama dari
 * satu akun hampir pasti dua video berbeda (segmen berulang seperti
 * "BERITA TERKINI"), bukan kembaran. Menggabungkannya akan menyembunyikan
 * berita yang sah. Sumber yang tidak diketahui diperlakukan sama: kalau
 * tidak bisa dibuktikan akunnya berbeda, jangan gabungkan.
 */
function buangKembaran(daftar: Berita[], idTerpilih?: string | null): Berita[] {
  const pemenang = new Map<string, Berita>();
  const akunTerpakai = new Map<string, Set<string>>();
  const urutanKunci: string[] = [];

  daftar.forEach((berita, i) => {
    const judul = normalkanJudul(berita.judul);
    const akun = kunciSumber(berita);
    const sendiri = `tunggal:${berita.id}:${i}`;
    // Akun kosong ("") ikut aturan ini juga: bila kunci judul ini sudah
    // memuat entri tanpa akun, yang berikutnya berdiri sendiri.
    const bentrokAkun = judul ? (akunTerpakai.get(`judul:${judul}`)?.has(akun) ?? false) : false;
    const kunci = judul && !bentrokAkun ? `judul:${judul}` : sendiri;

    const lama = pemenang.get(kunci);
    if (!lama) {
      pemenang.set(kunci, berita);
      urutanKunci.push(kunci);
      if (judul) {
        const set = akunTerpakai.get(`judul:${judul}`);
        if (set) set.add(akun);
        else akunTerpakai.set(`judul:${judul}`, new Set([akun]));
      }
      return;
    }

    if (lama.id === idTerpilih) return;
    if (berita.id === idTerpilih) {
      pemenang.set(kunci, berita);
      return;
    }

    const umurLama = lama.selisih_menit;
    const umurBaru = berita.selisih_menit;
    if (typeof umurBaru === "number" && (typeof umurLama !== "number" || umurBaru < umurLama)) {
      pemenang.set(kunci, berita);
    }
  });

  return urutanKunci.map((k) => pemenang.get(k)!);
}

type SeksiBerita = DefinisiKelompok & {
  daftar: Berita[];
  /**
   * Nomor kartu pertama seksi ini bila semua seksi dianggap satu daftar
   * panjang. Dipakai untuk jeda animasi: kalau tiap seksi menghitung
   * ulang dari nol, kartu-kartu di seksi bawah muncul barengan dengan
   * yang di atas dan efek mengalirnya hilang.
   */
  urutanAwal: number;
};

/**
 * Susun daftar datar menjadi seksi per sumber.
 *
 * Tiga sumber resmi SELALU dikembalikan walaupun kosong: /api/berita
 * mengambil 30 berita terbaru diurut global, jadi satu sumber yang jarang
 * mengunggah bisa kalah bersaing dan tidak kebagian slot. Seksi kosong
 * dengan keterangannya sendiri lebih jujur daripada sumber yang hilang
 * diam-diam — admin jadi tahu itu bukan error aplikasi.
 */
function susunSeksi(daftar: Berita[], idTerpilih?: string | null): SeksiBerita[] {
  const ember = new Map<string, Berita[]>();
  for (const berita of daftar) {
    const id = idKelompokBerita(berita);
    const isi = ember.get(id);
    if (isi) isi.push(berita);
    else ember.set(id, [berita]);
  }

  const dipakai: DefinisiKelompok[] = [...KELOMPOK_SUMBER];
  const sisa = ember.get(KELOMPOK_LAINNYA.id) ?? [];
  if (sisa.length > 0) dipakai.push(KELOMPOK_LAINNYA);

  let urutanAwal = 0;
  return dipakai.map((k) => {
    const isi = buangKembaran(ember.get(k.id) ?? [], idTerpilih);
    const seksi: SeksiBerita = { ...k, daftar: isi, urutanAwal };
    urutanAwal += isi.length;
    return seksi;
  });
}

/** Nama sumber tiga kelompok resmi untuk kalimat di layar */
const NAMA_SUMBER_RESMI = KELOMPOK_SUMBER.map((k) => k.label).join(", ");

/**
 * Platform asal berita.
 *
 * `platform_asal` dan `jenis` mengisi informasi yang sama dari dua kolom
 * berbeda; ambil mana pun yang terisi supaya lencana platform tidak
 * jatuh ke nilai bawaan hanya karena satu kolom kosong.
 */
function platformBerita(berita: Berita): string {
  return (berita.platform_asal || berita.jenis || "").trim().toLowerCase();
}

/**
 * Buka video di aplikasi TikTok/Instagram, atau di peramban bila
 * aplikasinya tidak terpasang.
 *
 * Cara kerjanya bertumpu pada Universal Links (iOS) dan App Links
 * (Android): tautan https resmi kedua layanan itu SUDAH didaftarkan
 * oleh aplikasinya, jadi sistem operasi yang mengalihkannya ke aplikasi
 * bila terpasang, dan ke peramban bila tidak.
 *
 * Skema khusus seperti `tiktok://` sengaja TIDAK dipakai: bila
 * aplikasinya tidak ada, layar hanya diam tanpa pesan apa pun — lebih
 * buruk daripada terbuka di peramban.
 */
function bukaDiAplikasi(link: string): void {
  const bersih = (link ?? "").trim();
  if (!bersih) {
    toast("peringatan", "Link video tidak tersedia");
    return;
  }
  window.open(bersih, "_blank", "noopener,noreferrer");
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

export function BeritaPanel({
  onPilihVideo,
  idTerpilih,
}: {
  onPilihVideo: (berita: Berita) => void;
  idTerpilih?: string | null;
}) {
  const [status, setStatus] = useState<StatusPindai>("idle");
  const [daftar, setDaftar] = useState<Berita[]>([]);
  // Seksi sumber mana saja yang sedang dibuka (akordeon). Bawaannya
  // semua terlipat: yang tampil cukup nama sumber + jumlah beritanya,
  // supaya panel tidak menjadi daftar panjang yang harus digulir.
  const [seksiBuka, setSeksiBuka] = useState<Record<string, boolean>>({});
  const aktifRef = useRef(true);

  // Pengelompokan dihitung ulang hanya saat daftarnya berubah atau admin
  // memilih video lain — bukan tiap render — supaya urutan kartu tidak
  // bergeser sendiri saat panel lain di layar ini ikut berubah.
  const seksi = useMemo(() => susunSeksi(daftar, idTerpilih), [daftar, idTerpilih]);
  const jumlahTampil = seksi.reduce((total, s) => total + s.daftar.length, 0);

  useEffect(() => {
    aktifRef.current = true;
    return () => {
      aktifRef.current = false;
    };
  }, []);

  // Tampilkan berita yang sudah tersimpan di database saat panel dibuka,
  // supaya admin tidak wajib memindai ulang (dan membakar kuota Apify)
  // hanya untuk melihat hasil pindaian sebelumnya.
  useEffect(() => {
    let aktif = true;
    getBeritaTerbaru()
      .then((hasil) => {
        if (!aktif || hasil.length === 0) return;
        setDaftar(hasil);
        setStatus("selesai");
      })
      .catch(() => {
        // Diam saja — tombol pindai tetap tersedia.
      });
    return () => {
      aktif = false;
    };
  }, []);

  async function pindai() {
    if (status === "memindai") return;
    setStatus("memindai");

    // Scraping asli memakan sekitar satu menit. Beri tahu sejak awal
    // supaya admin tidak mengira aplikasinya macet lalu menekan ulang.
    toast(
      "info",
      "Pemindaian dimulai",
      "Mengambil video terbaru dari TikTok & Instagram, sekitar 1 menit.",
    );

    try {
      // Radar berjalan minimal 1,5 detik; kalau n8n lebih cepat pun
      // animasinya tidak berkedip sekejap.
      const [hasil] = await Promise.all([
        pindaiBeritaBaru(),
        new Promise<void>((selesai) => setTimeout(selesai, DURASI_RADAR_MS)),
      ]);
      if (!aktifRef.current) return;
      setDaftar(hasil.data);
      setStatus("selesai");

      if (hasil.jumlah_baru > 0) {
        toast(
          "sukses",
          "Pemindaian selesai",
          `${hasil.jumlah_baru} video baru ditemukan dan disimpan.`,
        );
      } else if (hasil.selesai) {
        toast("info", "Tidak ada video baru", "Semua video terbaru sudah tercatat.");
      } else {
        // Lewat batas tunggu: n8n mungkin masih bekerja. Jangan bilang
        // gagal — itu tidak jujur, karena hasilnya bisa muncul sebentar lagi.
        toast(
          "info",
          "Pemindaian masih berjalan",
          "Belum ada video baru yang masuk. Coba pindai ulang sebentar lagi.",
        );
      }
    } catch (err) {
      if (!aktifRef.current) return;
      setStatus(daftar.length > 0 ? "selesai" : "idle");
      toast(
        "error",
        "Gagal memindai berita",
        err instanceof Error ? err.message : "Coba pindai ulang beberapa saat lagi.",
      );
    }
  }

  const labelTombol =
    status === "memindai"
      ? "Memindai..."
      : status === "selesai"
        ? "Pindai Ulang"
        : "Cek Berita Terbaru";

  return (
    <GlassCard className="p-4 sm:p-5">
      {/* Kepala panel */}
      <div className="flex items-center gap-3">
        <span
          className="glass-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-pri"
          aria-hidden="true"
        >
          <Newspaper className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-[15px] font-bold text-teks-utama">
            Cek Berita Terbaru
          </h2>
          <p className="text-[11px] text-teks-sekunder">
            Dikelompokkan per sumber: {NAMA_SUMBER_RESMI}
          </p>
        </div>
      </div>

      {/* Tombol pindai lebar penuh */}
      <button
        type="button"
        onClick={() => void pindai()}
        disabled={status === "memindai"}
        className={cn(
          "btn-tekan mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl",
          "font-heading text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-70",
        )}
        style={{
          background: "linear-gradient(135deg, #DC2626, #B91C1C)",
          boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
        }}
      >
        {status === "memindai" ? (
          <Radar className="h-4.5 w-4.5 animate-spin" />
        ) : status === "selesai" ? (
          <RefreshCw className="h-4.5 w-4.5" />
        ) : (
          <Radar className="h-4.5 w-4.5" />
        )}
        {labelTombol}
      </button>

      {/* Isi panel menyesuaikan status */}
      <AnimatePresence mode="wait" initial={false}>
        {status === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <EmptyState
              ikon={Newspaper}
              judul="Belum ada berita"
              keterangan={`Tekan tombol untuk memindai berita terbaru dari ${NAMA_SUMBER_RESMI}.`}
              className="py-6"
            />
          </motion.div>
        )}

        {status === "memindai" && (
          <motion.div
            key="memindai"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {/* Lingkaran radar kaca */}
            <div className="flex flex-col items-center pt-4">
              <div className="relative h-32 w-32">
                <div className="glass absolute inset-0 overflow-hidden rounded-full">
                  <div className="absolute inset-0 rounded-full border border-pri/25" />
                  <div className="absolute inset-[22%] rounded-full border border-pri/20" />
                  <div className="absolute inset-[44%] rounded-full border border-pri/15" />
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "conic-gradient(from 0deg, rgba(220,38,38,0.55), rgba(220,38,38,0.12) 22%, transparent 46%)",
                      animation: "radar-sapu 1.2s linear infinite",
                    }}
                  />
                  <span className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pri shadow-[0_0_12px_rgba(220,38,38,0.9)]" />
                  <span className="absolute top-[30%] left-[64%] h-1.5 w-1.5 animate-ping rounded-full bg-emas" />
                  <span className="absolute top-[62%] left-[33%] h-1.5 w-1.5 animate-ping rounded-full bg-emas [animation-delay:0.6s]" />
                </div>
              </div>
              <p className="mt-3 animate-pulse text-sm font-medium text-teks-sekunder">
                Memindai berita dari {KELOMPOK_SUMBER.length} sumber...
              </p>
            </div>

            {/* Skeleton selama radar berjalan */}
            <div className="mt-4 flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <GlassSkeleton className="h-[72px] w-[72px] shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-2 py-1">
                    <GlassSkeleton className="h-4 w-4/5" />
                    <GlassSkeleton className="h-3 w-2/5" />
                    <GlassSkeleton className="h-3 w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {status === "selesai" && (
          <motion.div
            key="selesai"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mt-4 flex flex-col gap-5"
          >
            {seksi.map((s) => (
              <SeksiSumber
                key={s.id}
                seksi={s}
                onPilihVideo={onPilihVideo}
                idTerpilih={idTerpilih}
                terbuka={
                  (seksiBuka[s.id] ??
                    // Belum pernah disentuh admin: seksi yang memuat video
                    // terpilih otomatis terbuka supaya penandanya tak lenyap.
                    s.daftar.some((b) => b.id === idTerpilih))
                }
                onToggle={() =>
                  setSeksiBuka((k) => ({ ...k, [s.id]: !(k[s.id] ?? s.daftar.some((b) => b.id === idTerpilih)) }))
                }
              />
            ))}

            {jumlahTampil > 0 && (
              <p className="text-center text-[11px] text-teks-sekunder">
                <span className="angka-tab font-semibold">{jumlahTampil}</span> berita
                ditampilkan dari hasil pindaian terakhir
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ------------------------------------------------------------
// SeksiSumber — satu seksi berita milik satu sumber
// ------------------------------------------------------------

function SeksiSumber({
  seksi,
  onPilihVideo,
  idTerpilih,
  terbuka,
  onToggle,
}: {
  seksi: SeksiBerita;
  onPilihVideo: (berita: Berita) => void;
  idTerpilih?: string | null;
  terbuka: boolean;
  onToggle: () => void;
}) {
  const kosong = seksi.daftar.length === 0;

  return (
    <section aria-label={`Berita ${seksi.label}`}>
      {/* Kepala seksi = tombol lipat/buka. Saat terlipat, nama sumber +
          jumlah berita tetap terlihat — cukup untuk tahu ada apa tanpa
          menggulir daftar panjang. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={terbuka}
        className="btn-tekan flex w-full items-center gap-2 rounded-xl py-1 text-left"
      >
        <span
          className={cn("h-4 w-1 shrink-0 rounded-full", seksi.batang)}
          aria-hidden="true"
        />
        <h3 className="font-heading text-[12px] font-extrabold tracking-wide text-teks-utama uppercase">
          {seksi.label}
        </h3>
        <span
          className={cn(
            "angka-tab rounded-full px-2 py-px text-[10px] font-extrabold",
            seksi.lencana,
          )}
        >
          {seksi.daftar.length}
        </span>
        <span className="h-px flex-1 bg-black/5 dark:bg-white/10" aria-hidden="true" />
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-teks-sekunder transition-transform",
            terbuka && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {terbuka && (
          <motion.div
            key="isi"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {kosong ? (
              <p className="px-3 py-3 text-xs leading-relaxed text-teks-sekunder">
                Tidak ada video {seksi.label} di antara berita terbaru. Coba
                pindai ulang nanti.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3 pb-1">
                {seksi.daftar.map((berita, i) => (
                  <KartuBerita
                    key={berita.id}
                    berita={berita}
                    urutan={seksi.urutanAwal + i}
                    onPilihVideo={onPilihVideo}
                    terpilih={berita.id === idTerpilih}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ------------------------------------------------------------
// KartuBerita — satu kartu berita (kaca tipis)
// ------------------------------------------------------------

function KartuBerita({
  berita,
  urutan,
  onPilihVideo,
  terpilih,
}: {
  berita: Berita;
  urutan: number;
  onPilihVideo: (berita: Berita) => void;
  terpilih: boolean;
}) {
  const [menyalin, setMenyalin] = useState(false);
  const platform = platformBerita(berita);
  // Kalau kedua kolom platform kosong, lencananya disembunyikan saja —
  // pil kosong tanpa tulisan lebih membingungkan daripada tidak ada.
  const labelPlat = platform ? labelPlatform(platform) : "aplikasi sumbernya";
  // Username akun ditampilkan apa adanya karena nama redaksinya sudah
  // jadi judul seksi — yang belum diketahui admin justru akun mana dari
  // redaksi itu yang mengunggah videonya.
  //
  // Awalan "@" HANYA dipakai untuk username asli (`sumber_akun`). Kolom
  // `sumber` berisi nama redaksi ("Nusantara TV"), jadi menuliskannya
  // sebagai "@Nusantara TV" akan memunculkan handle yang tidak pernah ada.
  const namaAkun = (berita.sumber_akun || "").trim();
  const labelAkun = namaAkun ? `@${namaAkun}` : (berita.sumber || "").trim();

  async function salin() {
    if (menyalin) return;
    setMenyalin(true);
    const berhasil = await salinTeks(berita.link_video);
    setMenyalin(false);
    if (berhasil) toast("sukses", "Link disalin");
    else toast("error", "Gagal menyalin link");
  }

  function gunakan() {
    onPilihVideo(berita);
    toast(
      "info",
      "Video dipilih untuk direplikasi",
      "Sekarang cari link doksli-nya, lalu isikan di form di bawah.",
    );
  }

  return (
    <FadeInUp delay={Math.min(urutan * 0.06, 0.35)}>
      {/* Video yang sudah dipilih diberi bingkai merah + badge, supaya
          admin jelas melihat video mana yang akan direplikasi. */}
      <div
        className={cn(
          "glass-soft rounded-2xl p-3 transition-colors",
          terpilih && "ring-2 ring-pri/70",
        )}
      >
        {/* Sampul + judul dapat diklik untuk menonton sumbernya langsung
            di aplikasi TikTok/Instagram. Memakai div ber-role button
            karena di bawahnya masih ada tombol lain dalam kartu yang sama. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => bukaDiAplikasi(berita.link_video)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              bukaDiAplikasi(berita.link_video);
            }
          }}
          aria-label={`Buka "${berita.judul}" di ${labelPlat}`}
          className="btn-tekan flex cursor-pointer gap-3 rounded-xl text-left focus:ring-2 focus:ring-pri/50 focus:outline-none"
        >
          <div className="relative h-[72px] w-[72px] shrink-0">
            <img
              src={berita.thumbnail_url}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.opacity = "0";
              }}
              className="h-[72px] w-[72px] rounded-xl bg-black/10 object-cover dark:bg-white/10"
            />
            {/* Penanda bahwa sampul ini membuka sesuatu di luar aplikasi */}
            <span className="absolute right-1 bottom-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/55 backdrop-blur-sm">
              <ExternalLink className="h-2.5 w-2.5 text-white" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm leading-snug font-semibold text-teks-utama">
              {berita.judul}
            </p>
            <p className="mt-1 truncate text-[11px] text-teks-sekunder">
              {labelAkun ? `${labelAkun} · ` : ""}
              {berita.waktu_relatif}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {platform && (
                <>
                  <PlatformIcon platform={platform} size={12} />
                  <StatusBadge label={labelPlatform(platform)} warna="netral" />
                </>
              )}
              {terpilih && (
                <StatusBadge label="Akan Direplikasi" warna="merah" />
              )}
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="glass-soft flex h-8 min-w-0 flex-1 items-center rounded-lg px-2.5 font-mono text-[10.5px] text-teks-sekunder">
              <span className="truncate">{berita.link_video}</span>
            </span>
            <button
              type="button"
              onClick={() => void salin()}
              aria-label="Salin link video"
              className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-teks-sekunder hover:text-teks-utama"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => bukaDiAplikasi(berita.link_video)}
              aria-label={`Tonton di ${labelPlat}`}
              className="glass btn-tekan flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[10.5px] font-semibold text-teks-sekunder hover:text-teks-utama"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Tonton
            </button>
          </div>
          <button
            type="button"
            onClick={gunakan}
            aria-pressed={terpilih}
            className={cn(
              "btn-tekan flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold",
              terpilih ? "glass text-teks-utama" : "text-white",
            )}
            style={
              terpilih
                ? undefined
                : {
                    background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                    boxShadow: "0 6px 14px rgba(220, 38, 38, 0.3)",
                  }
            }
          >
            {terpilih && <Check className="h-3.5 w-3.5 text-sukses" />}
            {terpilih ? "Dipilih untuk Direplikasi" : "Pilih untuk Direplikasi"}
          </button>
        </div>
      </div>
    </FadeInUp>
  );
}
