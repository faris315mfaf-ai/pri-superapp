"use client";

// ============================================================
// PEMBARUAN 2.1 (7 Okt 2026) — layar wajib saat aplikasi dibuka.
//
//   1. Sambutan
//   2. Verifikasi nomor WhatsApp (OTP arah masuk: pengguna mengirim kode
//      ke nomor gateway — aman dari blokir walau ratusan orang bersamaan)
//   3. Konfirmasi data diri: nama lengkap, username, email (opsional)
//   4. Tutorial wajib, sekali saja: Edit Otomatis → kompres otomatis →
//      mencoba keempat tema (Pagi, Sore, Malam, Klasik)
//
// Tidak bisa dilewati. Kemajuan disimpan di server (sql/66), jadi menutup
// aplikasi di tengah jalan melanjutkan dari langkah terakhir. Lihat
// lib/rilis untuk siapa & kapan.
// ============================================================

import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, CheckCircle2, Loader2, MessageCircle, Minimize2, Palette, Sparkles, Wand2 } from "lucide-react";
import { PanelWaMasuk } from "@/components/verifikasi-wa-masuk";
import { GambarMiniLatar } from "@/components/latar-apple";
import { useAppStore } from "@/hooks/use-app-store";
import { useLatarApple, type Latar } from "@/hooks/use-latar-apple";
import { cn } from "@/lib/utils";
import {
  selesaiTutorial21,
  siapkanWa21,
  simpanProfil21,
  verifikasiWa21,
  type OtpWaMasuk,
} from "@/services";
import type { User } from "@/types";

type Langkah = "sambut" | "wa" | "profil" | "autoedit" | "kompres" | "tema" | "akhir";

const TEMA: { id: Latar; nama: string; ket: string }[] = [
  { id: "pagi", nama: "Pagi", ket: "Gunung & danau" },
  { id: "sore", nama: "Sore", ket: "Pantai senja" },
  { id: "malam", nama: "Malam", ket: "Bulan & bintang" },
  { id: "classic", nama: "Klasik", ket: "Tampilan lama" },
];

const URUTAN: Langkah[] = ["sambut", "wa", "profil", "autoedit", "kompres", "tema", "akhir"];

/** "6281234567890" → "081234567890" untuk kolom isian. */
function nomorLokal(n: string | null | undefined): string {
  const d = String(n ?? "").replace(/\D/g, "");
  return d.startsWith("62") ? `0${d.slice(2)}` : d;
}

const pesanDari = (e: unknown, cadangan: string) => (e instanceof Error && e.message ? e.message : cadangan);

export function Pembaruan21({ user }: { user: User }) {
  const setUser = useAppStore((s) => s.setUser);
  const [langkah, setLangkah] = useState<Langkah>(user.verifikasi_21_pada ? "autoedit" : "sambut");

  if (typeof document === "undefined") return null;
  const posisi = URUTAN.indexOf(langkah);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/35 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Pembaruan PRI SuperApp 2.1"
    >
      <div className="glass relative flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-pri/15 px-2 py-0.5 text-[10.5px] font-bold text-pri">Update 2.1</span>
            <span className="ml-auto text-[10.5px] text-teks-sekunder">
              Langkah {posisi + 1} dari {URUTAN.length}
            </span>
          </div>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {URUTAN.map((l, i) => (
              <span key={l} className={cn("h-1 flex-1 rounded-full", i <= posisi ? "bg-pri" : "bg-black/10 dark:bg-white/15")} />
            ))}
          </div>
        </div>
        <div className="scrollbar-tipis flex-1 overflow-y-auto px-5 pt-4 pb-5">
          {langkah === "sambut" && <Sambut onLanjut={() => setLangkah("wa")} />}
          {langkah === "wa" && (
            <VerifikasiWa
              user={user}
              onSelesai={(u) => {
                setUser(u);
                setLangkah("profil");
              }}
            />
          )}
          {langkah === "profil" && (
            <DataDiri
              user={user}
              onSelesai={(u) => {
                setUser(u);
                setLangkah("autoedit");
              }}
            />
          )}
          {langkah === "autoedit" && <SlideAutoEdit onLanjut={() => setLangkah("kompres")} />}
          {langkah === "kompres" && <SlideKompres onLanjut={() => setLangkah("tema")} />}
          {langkah === "tema" && <CobaTema onLanjut={() => setLangkah("akhir")} />}
          {langkah === "akhir" && <Akhir onSelesai={setUser} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---- Bagian bersama ---------------------------------------------------------

function Judul({ ikon: Ikon, judul, ket }: { ikon: typeof Sparkles; judul: string; ket: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
        style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        aria-hidden="true"
      >
        <Ikon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h2 className="font-heading text-[17px] leading-tight font-extrabold text-teks-utama">{judul}</h2>
        <p className="mt-1 text-[12.5px] leading-snug text-teks-sekunder">{ket}</p>
      </div>
    </div>
  );
}

function TombolUtama({
  children,
  onClick,
  disabled,
  memuat,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  memuat?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || memuat}
      className="btn-tekan mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-bold text-white disabled:opacity-50"
      style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
    >
      {memuat ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function Galat({ pesan }: { pesan: string }) {
  if (!pesan) return null;
  return (
    <p className="mt-3 rounded-xl border border-gagal/30 bg-gagal/10 p-2.5 text-[12px] text-teks-utama" role="alert">
      {pesan}
    </p>
  );
}

function Poin({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-[12.5px] leading-snug text-teks-utama">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

// ---- 1. Sambutan --------------------------------------------------------------

function Sambut({ onLanjut }: { onLanjut: () => void }) {
  return (
    <>
      <Judul ikon={Sparkles} judul="PRI SuperApp 2.1 sudah tiba" ket="Tampilan baru, lebih cepat, dan alat video baru." />
      <ul className="mt-4 flex flex-col gap-2">
        <Poin>Verifikasi ulang akun lewat WhatsApp (±1 menit)</Poin>
        <Poin>Periksa nama lengkap, username, dan email Anda</Poin>
        <Poin>Kenalan singkat dengan Edit Otomatis, kompres otomatis, dan 4 tema baru</Poin>
      </ul>
      <p className="mt-4 text-[11.5px] leading-snug text-teks-sekunder">
        Langkah ini wajib dan hanya sekali. Setelah selesai, Anda bisa masuk memakai username, email, atau nomor
        WhatsApp yang terverifikasi.
      </p>
      <TombolUtama onClick={onLanjut}>
        Mulai <ArrowRight className="h-4 w-4" />
      </TombolUtama>
    </>
  );
}

// ---- 2. Verifikasi WhatsApp -------------------------------------------------------

function VerifikasiWa({ user, onSelesai }: { user: User; onSelesai: (u: User) => void }) {
  const [nomor, setNomor] = useState(nomorLokal(user.nomor_wa));
  const [wa, setWa] = useState<OtpWaMasuk | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [pesan, setPesan] = useState("");

  async function minta() {
    setMemuat(true);
    setPesan("");
    try {
      setWa(await siapkanWa21(nomor));
    } catch (e) {
      setPesan(pesanDari(e, "Gagal menyiapkan verifikasi."));
    } finally {
      setMemuat(false);
    }
  }

  async function cocokkan(kode: string) {
    setMemuat(true);
    setPesan("");
    try {
      onSelesai(await verifikasiWa21(nomor, kode));
    } catch (e) {
      setPesan(pesanDari(e, "Verifikasi gagal. Coba lagi."));
    } finally {
      setMemuat(false);
    }
  }

  return (
    <>
      <Judul ikon={MessageCircle} judul="Verifikasi nomor WhatsApp" ket="Pastikan nomor ini aktif dan ada di HP Anda." />
      {!wa ? (
        <>
          <label className="mt-4 block text-[12px] font-semibold text-teks-utama" htmlFor="nomor-21">
            Nomor WhatsApp
          </label>
          <input
            id="nomor-21"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={nomor}
            onChange={(e) => setNomor(e.target.value)}
            placeholder="08123456789"
            className="glass mt-1.5 h-12 w-full rounded-xl px-3.5 text-[15px] font-semibold text-teks-utama outline-none"
          />
          <Galat pesan={pesan} />
          <TombolUtama onClick={() => void minta()} disabled={nomor.replace(/\D/g, "").length < 9} memuat={memuat}>
            Lanjut verifikasi
          </TombolUtama>
        </>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <PanelWaMasuk
            key={wa.token}
            wa={wa}
            keterangan={
              <>
                Kirim dari WhatsApp nomor <b>{nomor}</b>. Setelah terkirim, kembali ke aplikasi ini — layar lanjut sendiri.
              </>
            }
            onTerkonfirmasi={(k) => void cocokkan(k)}
            onUlang={() => void minta()}
          />
          <Galat pesan={pesan} />
          {pesan && (
            <button
              type="button"
              onClick={() => void cocokkan(wa.kode)}
              disabled={memuat}
              className="self-center text-[12px] font-semibold text-pri underline-offset-4 hover:underline disabled:opacity-50"
            >
              Coba simpan lagi
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setWa(null);
              setPesan("");
            }}
            className="self-center text-[12px] font-semibold text-teks-sekunder underline-offset-4 hover:underline"
          >
            Ganti nomor
          </button>
        </div>
      )}
    </>
  );
}

// ---- 3. Data diri --------------------------------------------------------------

function DataDiri({ user, onSelesai }: { user: User; onSelesai: (u: User) => void }) {
  const emailAwal = user.email && !user.email.endsWith("@pri.internal") ? user.email : "";
  const [nama, setNama] = useState(user.nama ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [email, setEmail] = useState(emailAwal);
  const [memuat, setMemuat] = useState(false);
  const [pesan, setPesan] = useState("");

  async function simpan() {
    setMemuat(true);
    setPesan("");
    try {
      onSelesai(await simpanProfil21({ nama, username, email }));
    } catch (e) {
      setPesan(pesanDari(e, "Gagal menyimpan."));
    } finally {
      setMemuat(false);
    }
  }

  const kolom = "glass mt-1.5 h-12 w-full rounded-xl px-3.5 text-[14px] text-teks-utama outline-none";
  return (
    <>
      <Judul ikon={CheckCircle2} judul="Periksa data diri" ket="WhatsApp terverifikasi. Pastikan data di bawah ini benar." />
      <label className="mt-4 block text-[12px] font-semibold text-teks-utama" htmlFor="nama-21">
        Nama lengkap
      </label>
      <input id="nama-21" value={nama} onChange={(e) => setNama(e.target.value)} autoComplete="name" className={kolom} />
      <label className="mt-3 block text-[12px] font-semibold text-teks-utama" htmlFor="username-21">
        Username <span className="font-normal text-teks-sekunder">(untuk masuk)</span>
      </label>
      <input
        id="username-21"
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
        autoComplete="username"
        autoCapitalize="none"
        className={kolom}
      />
      <p className="mt-1 text-[10.5px] text-teks-sekunder">3–20 karakter: huruf kecil, angka, titik, garis bawah.</p>
      <label className="mt-3 block text-[12px] font-semibold text-teks-utama" htmlFor="email-21">
        Email <span className="font-normal text-teks-sekunder">(opsional)</span>
      </label>
      <input
        id="email-21"
        type="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        autoCapitalize="none"
        placeholder="nama@contoh.com"
        className={kolom}
      />
      <Galat pesan={pesan} />
      <TombolUtama onClick={() => void simpan()} disabled={nama.trim().length < 3 || username.length < 3} memuat={memuat}>
        Simpan & lanjut
      </TombolUtama>
    </>
  );
}

// ---- 4. Tutorial ---------------------------------------------------------------

function SlideAutoEdit({ onLanjut }: { onLanjut: () => void }) {
  return (
    <>
      <Judul ikon={Wand2} judul="Edit Otomatis" ket="Video berita siap unggah tanpa aplikasi edit." />
      <img
        src="/tur/template-hasil.svg"
        alt="Contoh hasil Edit Otomatis: video dengan bingkai, kotak judul, dan logo"
        className="mx-auto mt-4 max-h-56 w-auto rounded-2xl"
      />
      <ol className="mt-4 flex flex-col gap-2">
        <Poin>
          Buka <b>TVR Saya → Edit Otomatis</b>.
        </Poin>
        <Poin>Buat template sekali: kotak monas, bingkai, dan animasi Boom.</Poin>
        <Poin>Tempel link video atau unggah dari HP, lalu tulis judul beritanya.</Poin>
        <Poin>
          Video jadi otomatis masuk <b>Stok Video</b> — tinggal unggah ke sosmed.
        </Poin>
      </ol>
      <TombolUtama onClick={onLanjut}>
        Lanjut <ArrowRight className="h-4 w-4" />
      </TombolUtama>
    </>
  );
}

function SlideKompres({ onLanjut }: { onLanjut: () => void }) {
  return (
    <>
      <Judul ikon={Minimize2} judul="Kompres otomatis" ket="Ukuran video lebih kecil, kualitas tetap terjaga." />
      <div className="glass-soft mt-4 rounded-2xl p-3.5">
        <p className="text-[12.5px] leading-snug text-teks-utama">
          Setiap video hasil Edit Otomatis <b>dikompres otomatis</b> sebelum masuk Stok — rata-rata{" "}
          <b>30–50% lebih kecil</b> dengan skor kualitas VMAF 90 (tidak terlihat bedanya di HP).
        </p>
        <p className="mt-2 text-[11.5px] text-teks-sekunder">
          Di Stok Video tertulis “Hasil Edit Otomatis · dikompres X%”.
        </p>
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        <Poin>
          <b>Kompres Video</b>: perkecil video dari HP sendiri (4 pilihan kualitas).
        </Poin>
        <Poin>
          <b>Blur Watermark</b>: samarkan watermark di video milik sendiri.
        </Poin>
        <Poin>
          <b>Hapus latar Boom</b>: buang latar animasi Boom di editor template.
        </Poin>
      </ul>
      <p className="mt-3 text-[11.5px] text-teks-sekunder">Semuanya ada di tab TVR Saya.</p>
      <TombolUtama onClick={onLanjut}>
        Lanjut <ArrowRight className="h-4 w-4" />
      </TombolUtama>
    </>
  );
}

function CobaTema({ onLanjut }: { onLanjut: () => void }) {
  const [latar, aturLatar] = useLatarApple();
  const setTema = useAppStore((s) => s.setTema);
  const [dicoba, setDicoba] = useState<Set<Latar>>(() => new Set());
  const semua = dicoba.size === TEMA.length;

  function coba(t: Latar) {
    // Malam hanya tampil di mode gelap; Pagi & Sore paling indah di mode terang.
    setTema(t === "malam" ? "dark" : "light");
    aturLatar(t);
    setDicoba((s) => new Set(s).add(t));
  }

  return (
    <>
      <Judul ikon={Palette} judul="Coba 4 tema baru" ket="Ketuk keempat tema untuk melihat tampilannya langsung." />
      <div role="radiogroup" aria-label="Tema tampilan" className="mt-4 grid grid-cols-4 gap-2">
        {TEMA.map((t) => {
          const terpilih = latar === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={terpilih}
              onClick={() => coba(t.id)}
              className="btn-tekan flex min-w-0 flex-col gap-1.5 text-left"
            >
              <span
                className="relative block aspect-[3/4] overflow-hidden rounded-xl"
                style={{
                  boxShadow: terpilih
                    ? "0 0 0 3px #007AFF, 0 8px 20px rgba(0,0,0,0.18)"
                    : "0 0 0 0.5px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.12)",
                }}
              >
                <GambarMiniLatar latar={t.id} />
                {dicoba.has(t.id) && (
                  <span className="absolute top-1.5 right-1.5 flex h-[20px] w-[20px] items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                )}
              </span>
              <span className="block text-center text-[12.5px] font-semibold text-teks-utama">{t.nama}</span>
              <span className="block text-center text-[10px] leading-tight text-teks-sekunder">{t.ket}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11.5px] leading-snug text-teks-sekunder" aria-live="polite">
        {semua
          ? "Mantap! Tema yang terakhir Anda ketuk akan dipakai — bisa diganti kapan saja di Profil › Display."
          : `Sudah dicoba ${dicoba.size} dari 4 tema. Tema Malam otomatis menyalakan mode gelap.`}
      </p>
      <TombolUtama onClick={onLanjut} disabled={!semua}>
        {semua ? "Lanjut" : "Coba semua tema dulu"}
      </TombolUtama>
    </>
  );
}

function Akhir({ onSelesai }: { onSelesai: (u: User) => void }) {
  const [memuat, setMemuat] = useState(false);
  const [pesan, setPesan] = useState("");

  async function selesai() {
    setMemuat(true);
    setPesan("");
    try {
      onSelesai(await selesaiTutorial21());
    } catch (e) {
      setPesan(pesanDari(e, "Gagal menyimpan. Coba lagi."));
      setMemuat(false);
    }
  }

  return (
    <>
      <Judul ikon={CheckCircle2} judul="Semua siap!" ket="Akun Anda sudah terverifikasi dan tampilan baru aktif." />
      <ul className="mt-4 flex flex-col gap-2">
        <Poin>Masuk berikutnya bisa pakai username, email, atau nomor WhatsApp.</Poin>
        <Poin>Edit Otomatis, Kompres, dan Blur Watermark ada di tab TVR Saya.</Poin>
        <Poin>Ganti tema kapan saja di Profil › Display.</Poin>
      </ul>
      <Galat pesan={pesan} />
      <TombolUtama onClick={() => void selesai()} memuat={memuat}>
        Mulai pakai PRI SuperApp 2.1
      </TombolUtama>
    </>
  );
}
