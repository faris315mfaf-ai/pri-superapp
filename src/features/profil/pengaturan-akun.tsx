"use client";

// ============================================================
// Pengaturan akun yang dipakai semua peran:
//   • TombolAkunSosmed / ModalAkunSosmed — kelola username IG/TikTok
//     (boleh lebih dari satu per platform), acuan pemeriksaan QC
//   • ModalGantiFoto  — pilih foto, potong, kecilkan ke ~100 KB
//   • ModalGantiSandi — ganti sandi lewat OTP WhatsApp, 1x seminggu
// ============================================================

import { useEffect, useRef, useState } from "react";
import type { KomponenIkon } from "@/types";
import { AnimatePresence, motion } from "framer-motion";
import {
  AtSign,
  Camera,
  ChevronRight,
  Instagram,
  Loader2,
  Lock,
  Music2,
  Pencil,
  Plus,
  Trash2,
  Twitter,
  X,
  Youtube,
  ZoomIn,
} from "lucide-react";
import { toast, useAppStore } from "@/hooks/use-app-store";
import {
  gantiFotoProfil,
  gantiSandi,
  getAkunSosmed,
  hapusAkunSosmed,
  kirimKodeVerifikasiWa,
  kirimKodeWaBaru,
  mintaOtpGantiSandi,
  tambahAkunSosmed,
  verifikasiWaBaru,
  verifikasiWaSaya,
  ubahAkunSosmed,
  type AkunSosmed,
} from "@/services";
import {
  bacaBerkas,
  muatGambar,
  potongDanKecilkan,
  ukuranDataUrl,
  type AreaPotong,
} from "@/lib/gambar";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Akun media sosial — tombol pembuka + pop-up kelola
// ------------------------------------------------------------

// QC multi-platform (fitur 1.22.x/2): kader mendaftarkan username untuk
// Instagram, TikTok, X, Threads, dan YouTube. Warna dipilih yang jelas
// terbaca di tema terang maupun gelap (X/Threads memakai aksen, bukan
// hitam murni yang lenyap di mode gelap).
type PlatformId = "instagram" | "tiktok" | "twitter" | "threads" | "youtube";
const PLATFORM: {
  id: PlatformId;
  label: string;
  ikon: KomponenIkon;
  warna: string;
}[] = [
  { id: "instagram", label: "Instagram", ikon: Instagram, warna: "#E1306C" },
  { id: "tiktok", label: "TikTok", ikon: Music2, warna: "#0EA5E9" },
  { id: "twitter", label: "X", ikon: Twitter, warna: "#1D9BF0" },
  { id: "threads", label: "Threads", ikon: AtSign, warna: "#4F46E5" },
  { id: "youtube", label: "YouTube", ikon: Youtube, warna: "#FF0000" },
];

/** Facebook sengaja TIDAK didukung: pengomentar Facebook hanya punya nama
 *  tampilan, bukan @username stabil yang bisa dicocokkan ke kader. */
const PLATFORM_TAK_DIDUKUNG = "Facebook (komentarnya tak bisa dicocokkan ke akun kader).";

function labelPlatform(id: string): string {
  return PLATFORM.find((p) => p.id === id)?.label ?? id;
}

/** Baris ringkas di daftar pengaturan; membuka pop-up saat ditekan. */
export function TombolAkunSosmed({
  onBuka,
  versiData,
}: {
  onBuka: () => void;
  /** Dinaikkan setelah pop-up ditutup, agar jumlahnya ikut diperbarui */
  versiData: number;
}) {
  const [jumlah, setJumlah] = useState<number | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const data = await getAkunSosmed();
        if (hidup) setJumlah(data.length);
      } catch {
        // Gagal memuat bukan alasan menyembunyikan pintu masuknya.
        if (hidup) setJumlah(null);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [versiData]);

  return (
    <button
      type="button"
      onClick={onBuka}
      className="glass btn-tekan flex min-h-[54px] w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
        style={{
          backgroundColor: "#E1306C1a",
          borderColor: "#E1306C38",
          color: "#E1306C",
        }}
        aria-hidden="true"
      >
        <AtSign className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-teks-utama">
          Akun Media Sosial Saya
        </span>
        <span className="block text-[11.5px] text-teks-sekunder">
          {jumlah === null
            ? "Untuk pemeriksaan kepatuhan QC"
            : jumlah === 0
              ? "Belum ada akun — ketuk untuk menambah"
              : `${jumlah} akun terdaftar`}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-teks-sekunder" />
    </button>
  );
}

type Sunting = { id?: string; platform: PlatformId; username: string };

/** Pop-up kelola: tambah, ubah, hapus. Bisa lebih dari satu per platform. */
export function ModalAkunSosmed({ onTutup }: { onTutup: () => void }) {
  const [daftar, setDaftar] = useState<AkunSosmed[] | null>(null);
  const [sunting, setSunting] = useState<Sunting | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const data = await getAkunSosmed();
        if (hidup) setDaftar(data);
      } catch (err) {
        if (!hidup) return;
        setDaftar([]);
        setError(err instanceof Error ? err.message : "Gagal memuat akun.");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  async function simpan() {
    if (!sunting || sibuk) return;
    const bersih = sunting.username.trim();
    if (bersih.length < 2) {
      setError("Username minimal 2 karakter.");
      return;
    }
    setSibuk(true);
    setError(null);
    try {
      if (sunting.id) {
        await ubahAkunSosmed({
          id: sunting.id,
          platform: sunting.platform,
          username: bersih,
        });
        toast("sukses", "Akun diperbarui");
      } else {
        await tambahAkunSosmed({ platform: sunting.platform, username: bersih });
        toast(
          "sukses",
          "Akun ditambahkan",
          "Komentar dari akun ini akan dihitung untuk Anda.",
        );
      }
      setSunting(null);
      setMuatUlang((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSibuk(false);
    }
  }

  async function hapus(a: AkunSosmed) {
    if (sibuk) return;
    setSibuk(true);
    setError(null);
    try {
      await hapusAkunSosmed(a.id);
      toast("info", "Akun dihapus", `@${a.username} tidak lagi dihitung.`);
      setMuatUlang((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Sheet judul="Akun Media Sosial Saya" onTutup={sibuk ? undefined : onTutup}>
      <p className="mb-3 text-[12.5px] leading-relaxed text-teks-sekunder">
        Daftarkan akun Anda agar komentar di postingan resmi partai terhitung
        sebagai kepatuhan. Boleh lebih dari satu akun per platform.
      </p>

      {error && (
        <div className="mb-3">
          <PesanError pesan={error} />
        </div>
      )}

      {daftar === null ? (
        <p className="py-4 text-center text-[12.5px] text-teks-sekunder">Memuat…</p>
      ) : daftar.length === 0 ? (
        <p className="rounded-xl border border-dashed border-teks-sekunder/30 py-5 text-center text-[12.5px] text-teks-sekunder">
          Belum ada akun terdaftar.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {daftar.map((a) => {
            const p = PLATFORM.find((x) => x.id === a.platform);
            const Ikon = p?.ikon ?? AtSign;
            return (
              <div
                key={a.id}
                className="glass-soft flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              >
                <Ikon
                  className="h-4.5 w-4.5 shrink-0"
                  style={{ color: p?.warna ?? "#94A3B8" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-teks-utama">
                    @{a.username}
                  </span>
                  <span className="block text-[11px] text-teks-sekunder">
                    {labelPlatform(a.platform)}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() =>
                    setSunting({ id: a.id, platform: a.platform, username: a.username })
                  }
                  aria-label={`Ubah @${a.username}`}
                  className="glass btn-tekan flex h-8 w-8 items-center justify-center rounded-lg text-teks-sekunder disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() => void hapus(a)}
                  aria-label={`Hapus @${a.username}`}
                  className="btn-tekan flex h-8 w-8 items-center justify-center rounded-lg border border-gagal/40 bg-gagal/5 text-gagal disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {sunting ? (
        <div className="glass-soft mt-3 rounded-xl p-3">
          <p className="mb-2 text-[12px] font-semibold text-teks-sekunder">
            {sunting.id ? "Ubah akun" : "Tambah akun"}
          </p>
          <div className="mb-2 flex gap-2">
            {PLATFORM.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSunting({ ...sunting, platform: p.id })}
                className={cn(
                  "btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-semibold",
                  sunting.platform === p.id ? "text-white" : "glass text-teks-sekunder",
                )}
                style={sunting.platform === p.id ? { background: p.warna } : undefined}
              >
                <p.ikon className="h-4 w-4" />
                {p.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-teks-sekunder">
              @
            </span>
            <input
              value={sunting.username}
              onChange={(e) => setSunting({ ...sunting, username: e.target.value })}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={sibuk}
              className="glass-soft h-11 w-full rounded-xl pr-3 pl-7 text-[14px] text-teks-utama outline-none focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={sibuk}
              onClick={() => {
                setSunting(null);
                setError(null);
              }}
              className="glass btn-tekan h-10 rounded-xl text-[13px] font-bold text-teks-utama disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={sibuk}
              onClick={() => void simpan()}
              className="btn-tekan flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
            >
              {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSunting({ platform: "instagram", username: "" })}
          className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          <Plus className="h-4.5 w-4.5" />
          Tambah Akun
        </button>
      )}

      <div className="mt-4 rounded-xl border border-dashed border-teks-sekunder/25 p-3">
        <p className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
          Belum didukung
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-teks-sekunder">
          {PLATFORM_TAK_DIDUKUNG}
        </p>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------
// Ganti foto profil (pilih → potong → kecilkan)
// ------------------------------------------------------------

export function ModalGantiFoto({
  onTutup,
  onSelesai,
}: {
  onTutup: () => void;
  onSelesai: (avatarUrl: string) => void;
}) {
  const [sumber, setSumber] = useState<string>("");
  const [gambar, setGambar] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [geser, setGeser] = useState({ x: 0, y: 0 });
  const [memproses, setMemproses] = useState(false);
  const berkasRef = useRef<HTMLInputElement>(null);
  const seretRef = useRef<{ x: number; y: number } | null>(null);

  async function pilih(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const dataUrl = await bacaBerkas(f);
      const img = await muatGambar(dataUrl);
      setSumber(dataUrl);
      setGambar(img);
      setZoom(1);
      setGeser({ x: 0, y: 0 });
    } catch (err) {
      toast("error", "Gagal membaca foto", err instanceof Error ? err.message : "");
    }
  }

  /** Hitung area potong dari zoom & geseran, dalam piksel gambar asli */
  function areaPotong(): AreaPotong {
    if (!gambar) return { x: 0, y: 0, sisi: 1 };
    const sisiPenuh = Math.min(gambar.width, gambar.height);
    const sisi = sisiPenuh / zoom;
    const maksX = gambar.width - sisi;
    const maksY = gambar.height - sisi;
    const x = Math.max(0, Math.min(maksX, (gambar.width - sisi) / 2 - geser.x));
    const y = Math.max(0, Math.min(maksY, (gambar.height - sisi) / 2 - geser.y));
    return { x, y, sisi };
  }

  async function simpan() {
    if (!sumber || memproses) return;
    setMemproses(true);
    try {
      const hasil = await potongDanKecilkan(sumber, areaPotong());
      const user = await gantiFotoProfil(hasil);
      toast(
        "sukses",
        "Foto profil diperbarui",
        `Ukuran akhir ${Math.round(ukuranDataUrl(hasil) / 1024)} KB.`,
      );
      onSelesai(user.avatar_url);
    } catch (err) {
      toast(
        "error",
        "Gagal menyimpan foto",
        err instanceof Error ? err.message : "Coba lagi sebentar.",
      );
    } finally {
      setMemproses(false);
    }
  }

  return (
    <Sheet judul="Ganti Foto Profil" onTutup={memproses ? undefined : onTutup}>
      {!sumber ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            <Camera className="h-7 w-7" />
          </span>
          <p className="text-center text-[13px] leading-relaxed text-teks-sekunder">
            Pilih foto dari galeri. Ukuran bebas — foto akan otomatis dipotong
            dan dikecilkan sampai sekitar 100 KB.
          </p>
          <button
            type="button"
            onClick={() => berkasRef.current?.click()}
            className="btn-tekan h-12 w-full rounded-xl text-[15px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            Pilih Foto
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            className="relative mx-auto aspect-square w-full max-w-[280px] touch-none overflow-hidden rounded-2xl bg-black/80"
            onPointerDown={(e) => {
              seretRef.current = { x: e.clientX, y: e.clientY };
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!seretRef.current || !gambar) return;
              const dx = e.clientX - seretRef.current.x;
              const dy = e.clientY - seretRef.current.y;
              seretRef.current = { x: e.clientX, y: e.clientY };
              const skala = Math.min(gambar.width, gambar.height) / 280;
              setGeser((g) => ({ x: g.x + dx * skala, y: g.y + dy * skala }));
            }}
            onPointerUp={() => {
              seretRef.current = null;
            }}
          >
            <img
              src={sumber}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
              style={{
                width: `${zoom * 100}%`,
                transform: `translate(calc(-50% + ${geser.x / 4}px), calc(-50% + ${geser.y / 4}px))`,
              }}
            />
            <div className="pointer-events-none absolute inset-0 ring-[9999px] ring-black/55 [clip-path:circle(46%_at_50%_50%)]" />
            <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/70 [clip-path:circle(46%_at_50%_50%)]" />
          </div>

          <label className="flex items-center gap-2 text-[12px] text-teks-sekunder">
            <ZoomIn className="h-4 w-4 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1.5 flex-1 accent-pri"
              aria-label="Perbesar foto"
            />
          </label>

          <p className="text-center text-[11.5px] text-teks-sekunder">
            Geser foto untuk mengatur posisi
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => berkasRef.current?.click()}
              disabled={memproses}
              className="glass btn-tekan h-11 rounded-xl text-[13px] font-bold text-teks-utama disabled:opacity-50"
            >
              Pilih Ulang
            </button>
            <button
              type="button"
              onClick={() => void simpan()}
              disabled={memproses}
              className="btn-tekan flex h-11 items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
            >
              {memproses ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan"}
            </button>
          </div>
        </div>
      )}

      <input
        ref={berkasRef}
        type="file"
        accept="image/*"
        onChange={pilih}
        className="hidden"
      />
    </Sheet>
  );
}

// ------------------------------------------------------------
// Ganti kata sandi (OTP WhatsApp)
// ------------------------------------------------------------

export function ModalGantiSandi({
  nomorWa,
  onTutup,
}: {
  nomorWa: string | null;
  onTutup: () => void;
}) {
  const [langkah, setLangkah] = useState<"nomor" | "kode">("nomor");
  const [nomor, setNomor] = useState("");
  const [kode, setKode] = useState("");
  const [sandiBaru, setSandiBaru] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function minta(e: React.FormEvent) {
    e.preventDefault();
    if (memuat) return;
    setError(null);
    setMemuat(true);
    try {
      await mintaOtpGantiSandi(nomor.trim());
      toast("sukses", "Kode terkirim", "Cek WhatsApp Anda.");
      setLangkah("kode");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim kode.");
    } finally {
      setMemuat(false);
    }
  }

  async function ganti(e: React.FormEvent) {
    e.preventDefault();
    if (memuat) return;
    setError(null);
    setMemuat(true);
    try {
      await gantiSandi({ nomor_wa: nomor.trim(), kode, sandi_baru: sandiBaru });
      toast(
        "sukses",
        "Kata sandi diganti",
        "Perangkat lain otomatis dikeluarkan demi keamanan.",
      );
      onTutup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengganti sandi.");
    } finally {
      setMemuat(false);
    }
  }

  const nomorSamar = nomorWa
    ? nomorWa.replace(/^(62\d{3})\d+(\d{3})$/, "$1••••$2")
    : "(belum ada)";

  return (
    <Sheet judul="Ganti Kata Sandi" onTutup={memuat ? undefined : onTutup}>
      {langkah === "nomor" ? (
        <form onSubmit={minta} className="flex flex-col gap-3" noValidate>
          <p className="text-[13px] leading-relaxed text-teks-sekunder">
            Demi keamanan, kode verifikasi dikirim ke nomor WhatsApp yang
            terdaftar pada akun ini:{" "}
            <span className="font-semibold text-teks-utama">{nomorSamar}</span>.
            Ketik nomor tersebut untuk melanjutkan.
          </p>
          <input
            value={nomor}
            onChange={(e) => setNomor(e.target.value)}
            inputMode="numeric"
            placeholder="0812xxxxxxx"
            disabled={memuat}
            className="glass-soft h-12 w-full rounded-xl px-3.5 text-[15px] text-teks-utama outline-none focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
          />
          {error && <PesanError pesan={error} />}
          <p className="text-[11.5px] leading-relaxed text-teks-sekunder">
            Kata sandi hanya boleh diganti sekali dalam seminggu.
          </p>
          <TombolMerah memuat={memuat} disabled={nomor.trim().length < 9}>
            Kirim Kode
          </TombolMerah>
        </form>
      ) : (
        <form onSubmit={ganti} className="flex flex-col gap-3" noValidate>
          <input
            value={kode}
            onChange={(e) => setKode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="······"
            aria-label="Kode 6 angka"
            disabled={memuat}
            className="glass-soft h-14 w-full rounded-xl text-center font-mono text-[26px] tracking-[0.45em] text-teks-utama outline-none placeholder:text-teks-sekunder/40 focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
          />
          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-teks-sekunder" />
            <input
              type="password"
              value={sandiBaru}
              onChange={(e) => setSandiBaru(e.target.value)}
              placeholder="Kata sandi baru (min. 8)"
              autoComplete="new-password"
              disabled={memuat}
              className="glass-soft h-12 w-full rounded-xl pr-3.5 pl-11 text-[15px] text-teks-utama outline-none focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
            />
          </div>
          {error && <PesanError pesan={error} />}
          <TombolMerah
            memuat={memuat}
            disabled={kode.length !== 6 || sandiBaru.length < 8}
          >
            Ganti Kata Sandi
          </TombolMerah>
        </form>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------
// Bagian bersama
// ------------------------------------------------------------

export function ModalVerifikasiWa({ onTutup }: { onTutup: () => void }) {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  // Akun tanpa nomor WA harus MENGISI nomornya dulu (fitur 1.22.x/1);
  // yang sudah punya nomor langsung ke tahap kirim kode.
  const punyaNomor = Boolean(user?.nomor_wa);
  const [tahap, setTahap] = useState<"nomor" | "minta" | "kode">(
    punyaNomor ? "minta" : "nomor",
  );
  const [nomor, setNomor] = useState("");
  const [kode, setKode] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState("");

  const nomorSamar = (user?.nomor_wa ?? "").replace(/^(\d{4})\d+(\d{3})$/, "$1••••$2");

  // Kirim kode: ke nomor TERDAFTAR (punya nomor) atau ke nomor yang BARU
  // diketik (belum punya nomor).
  async function kirim() {
    if (memuat) return;
    setError("");
    if (!punyaNomor && nomor.trim().length < 9) {
      setError("Isi nomor WhatsApp yang benar dulu.");
      return;
    }
    setMemuat(true);
    try {
      if (punyaNomor) await kirimKodeVerifikasiWa();
      else await kirimKodeWaBaru(nomor.trim());
      setTahap("kode");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim kode.");
    } finally {
      setMemuat(false);
    }
  }

  async function cocokkan() {
    if (memuat || kode.length !== 6) return;
    setError("");
    setMemuat(true);
    try {
      const segar = punyaNomor
        ? await verifikasiWaSaya(kode)
        : await verifikasiWaBaru(nomor.trim(), kode);
      setUser(segar);
      toast("sukses", "WhatsApp terverifikasi \u2705", "Terima kasih!");
      onTutup();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kode tidak diterima.");
      setKode("");
    } finally {
      setMemuat(false);
    }
  }

  return (
    <Sheet judul="Verifikasi WhatsApp" onTutup={onTutup}>
      {tahap === "nomor" ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-teks-sekunder">
            Akun Anda belum punya nomor WhatsApp. Masukkan nomor Anda untuk
            menerima kode verifikasi — nomor ini juga dipakai untuk notifikasi
            & pemulihan sandi.
          </p>
          <input
            value={nomor}
            onChange={(e) => setNomor(e.target.value.replace(/[^0-9+]/g, ""))}
            inputMode="tel"
            autoComplete="tel"
            aria-label="Nomor WhatsApp"
            placeholder="08123456789"
            disabled={memuat}
            className="glass-soft h-12 w-full rounded-xl px-3.5 text-[15px] text-teks-utama outline-none placeholder:text-teks-sekunder/50 focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
          />
          <PesanError pesan={error} />
          <button
            type="button"
            onClick={() => void kirim()}
            disabled={memuat || nomor.trim().length < 9}
            className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {memuat && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Kirim Kode
          </button>
        </div>
      ) : tahap === "minta" ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-teks-sekunder">
            Nomor WhatsApp akun Anda (<b>{nomorSamar}</b>) belum terverifikasi.
            Verifikasi memastikan notifikasi & pemulihan sandi sampai ke Anda.
            Kode 6 angka akan dikirim ke nomor itu.
          </p>
          <PesanError pesan={error} />
          <button
            type="button"
            onClick={() => void kirim()}
            disabled={memuat}
            className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {memuat && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Kirim Kode ke WhatsApp Saya
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-teks-sekunder">
            Masukkan 6 angka yang kami kirim ke WhatsApp{" "}
            <b>{punyaNomor ? nomorSamar : nomor.trim()}</b>.
          </p>
          <input
            value={kode}
            onChange={(e) => setKode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Kode verifikasi 6 angka"
            placeholder="\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7"
            disabled={memuat}
            className="glass-soft h-14 w-full rounded-2xl text-center font-mono text-[26px] tracking-[0.45em] text-teks-utama outline-none placeholder:text-teks-sekunder/40 focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
          />
          <PesanError pesan={error} />
          <button
            type="button"
            onClick={() => void cocokkan()}
            disabled={memuat || kode.length !== 6}
            className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
          >
            {memuat && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Verifikasi
          </button>
          <button
            type="button"
            onClick={() => void kirim()}
            disabled={memuat}
            className="self-center text-[12px] font-semibold text-pri underline-offset-4 hover:underline disabled:opacity-50"
          >
            Kirim ulang kode
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Sheet({
  judul,
  onTutup,
  children,
}: {
  judul: string;
  onTutup?: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[75] flex flex-col justify-end"
        role="dialog"
        aria-modal="true"
        aria-label={judul}
      >
        <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
        <motion.div
          initial={{ y: "102%" }}
          animate={{ y: 0 }}
          exit={{ y: "102%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="glass-strong relative mx-auto max-h-[92dvh] w-full max-w-[440px] overflow-y-auto rounded-t-[2rem] px-5 pt-3 pb-8"
        >
          <div className="mb-3 flex justify-center">
            <span
              className="h-1.5 w-12 rounded-full bg-teks-sekunder/40"
              aria-hidden="true"
            />
          </div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-bold text-teks-utama">{judul}</h2>
            {onTutup && (
              <button
                type="button"
                onClick={onTutup}
                aria-label="Tutup"
                className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-full text-teks-utama"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function PesanError({ pesan }: { pesan: string }) {
  return (
    <p className="rounded-xl border border-gagal/40 bg-gagal/10 px-3 py-2 text-[12.5px] leading-snug text-gagal">
      {pesan}
    </p>
  );
}

function TombolMerah({
  memuat,
  disabled,
  children,
}: {
  memuat?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || memuat}
      className={cn(
        "btn-tekan flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
      style={{
        background: "linear-gradient(135deg, #DC2626, #B91C1C)",
        boxShadow: "0 8px 20px rgba(220, 38, 38, 0.3)",
      }}
    >
      {memuat ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}
