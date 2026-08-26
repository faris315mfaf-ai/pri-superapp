"use client";

// ============================================================
// ChatScreen — komunikasi internal, bergaya WhatsApp.
//
// Aturan pokok:
// - Teks + emoji SAJA (tanpa foto/video) — dijaga server juga.
// - Chat baru butuh ACCEPT dari pihak yang diajak; sebelum diterima,
//   pengirim hanya bisa menaruh satu pesan perkenalan.
// - Pesan baru membunyikan push, tapi TIDAK menumpuk di daftar
//   notifikasi (riwayatnya di sini).
//
// Ditambah panel PENGUMUMAN berjenjang: atasan → bawahan, Ketua
// Umum bisa ke semua atau per divisi (lihat /api/pengumuman).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Eye,
  ImagePlus,
  Loader2,
  Megaphone,
  MessagesSquare,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Smile,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FotoBulat } from "@/components/foto-bulat";
import {
  AvatarInisial,
  EmptyState,
  FadeInUp,
  GlassSkeleton,
  StatusBadge,
  ThemeToggle,
} from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { kompresGambar } from "@/lib/gambar-kompres";
import { IkonStreak } from "@/components/ikon-streak";
import { PanelGrup } from "./panel-grup";
import { getGrupDivisiku, type InfoGrupDivisi } from "@/services";
import {
  getDaftarChat,
  getKandidatChat,
  getPantauChat,
  getPengumuman,
  getPesanChat,
  getPesanPantau,
  hapusChat,
  jawabChat,
  hapusPesanChat,
  kirimPengumuman,
  kirimPesanChat,
  mulaiChatLengkap,
  setModeChat as setModeChatService,
  setSakelarChat,
  tandaiChatDibaca,
  type ChatKontak,
  type ChatPantau,
  type ChatPesan,
  type KandidatChat,
  type Pengumuman,
} from "@/services";
import { jamWIB, tanggalIndonesia } from "@/lib/format";
import type { User } from "@/types";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { cn } from "@/lib/utils";

const EMOJI = [
  "😀", "😂", "🥰", "😎", "🤝", "🙏", "👍", "👏",
  "💪", "🔥", "⭐", "✅", "❤️", "🎉", "🚀", "📌",
  "😢", "😡", "🤔", "😴", "🫡", "🙌", "☕", "📣",
  "⏰", "📍", "🤝", "✊", "🇮🇩", "📈", "🗳️", "🎯",
];

// ------------------------------------------------------------
// Panel percakapan (bubble ala WA)
// ------------------------------------------------------------

function PanelPercakapan({
  kontak,
  idKu,
  onKembali,
  onSegarkanDaftar,
}: {
  kontak: ChatKontak;
  idKu: string;
  onKembali: () => void;
  onSegarkanDaftar: () => void;
}) {
  const [pesan, setPesan] = useState<ChatPesan[]>([]);
  const [statusKontak, setStatusKontak] = useState(kontak.status);
  const [dimintaOleh, setDimintaOleh] = useState(kontak.diminta_oleh);
  const [tulisan, setTulisan] = useState("");
  const [emojiBuka, setEmojiBuka] = useState(false);
  const [sedangKirim, setSedangKirim] = useState(false);
  // Gambar yang siap dikirim (data URL hasil kompresi <=100KB)
  const [gambarSiap, setGambarSiap] = useState<string | null>(null);
  const [sedangKompres, setSedangKompres] = useState(false);
  // Pesan yang dipilih untuk ditarik (long-press / klik-kanan)
  const [pesanDipilih, setPesanDipilih] = useState<ChatPesan | null>(null);
  // Gambar yang sedang dibuka ukuran penuh
  const [gambarPenuh, setGambarPenuh] = useState<string | null>(null);
  const inputGambarRef = useRef<HTMLInputElement | null>(null);
  const timerTekanRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ujungRef = useRef<HTMLDivElement | null>(null);
  const idTerakhirRef = useRef<string>("0");

  // Muat awal + polling tambahan tiap 4 detik. `sejak` membuat polling
  // hanya membawa pesan BARU — bukan mengunduh ulang seluruh riwayat.
  useEffect(() => {
    let hidup = true;

    async function tarik(awal: boolean) {
      try {
        const hasil = await getPesanChat(kontak.id, awal ? undefined : idTerakhirRef.current);
        if (!hidup) return;
        setStatusKontak(hasil.status as ChatKontak["status"]);
        setDimintaOleh(hasil.diminta_oleh);
        // Ceklis biru hidup: tandai biru semua pesan milikku sampai id
        // yang server laporkan sudah dibaca lawan — polling inkremental
        // tidak pernah mengunduh ulang pesan lama, jadi tanpa ini ceklis
        // baru berubah setelah panel dibuka ulang.
        const terbaca = Number(hasil.terbaca_sampai);
        if (hasil.data.length > 0) {
          idTerakhirRef.current = hasil.data[hasil.data.length - 1].id;
          setPesan((lama) => {
            const gabung = awal ? hasil.data : [...lama, ...hasil.data];
            return gabung.map((m) =>
              m.pengirim_id === idKu && !m.dibaca && Number(m.id) <= terbaca
                ? { ...m, dibaca: true }
                : m,
            );
          });
          void tandaiChatDibaca(kontak.id);
        } else {
          if (awal) setPesan([]);
          else if (terbaca > 0) {
            setPesan((lama) =>
              lama.map((m) =>
                m.pengirim_id === idKu && !m.dibaca && Number(m.id) <= terbaca
                  ? { ...m, dibaca: true }
                  : m,
              ),
            );
          }
        }
      } catch {
        // Polling gagal sesaat — coba lagi putaran berikutnya.
      }
    }

    void tarik(true);
    void tandaiChatDibaca(kontak.id);
    const detak = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void tarik(false);
    }, 4000);
    return () => {
      hidup = false;
      clearInterval(detak);
    };
  }, [kontak.id]);

  // Gulir ke pesan terbaru setiap ada tambahan
  useEffect(() => {
    ujungRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [pesan.length]);

  async function kirim() {
    const isi = tulisan.trim();
    if ((!isi && !gambarSiap) || sedangKirim) return;
    setSedangKirim(true);
    try {
      const hasil = await kirimPesanChat(kontak.id, isi, gambarSiap ?? undefined);
      setTulisan("");
      setGambarSiap(null);
      setEmojiBuka(false);
      // Tampilkan langsung tanpa menunggu polling
      const kini = new Date().toISOString();
      setPesan((lama) => [
        ...lama,
        {
          id: `lokal-${Date.now()}`,
          pengirim_id: idKu,
          isi,
          dibaca: false,
          dibuat_pada: kini,
          gambar_url: hasil.gambar_url || undefined,
        },
      ]);
    } catch (e) {
      toast("error", "Pesan gagal terkirim", e instanceof Error ? e.message : "");
    } finally {
      setSedangKirim(false);
    }
  }

  async function pilihGambar(file: File | null) {
    if (!file || sedangKompres) return;
    setSedangKompres(true);
    try {
      // Batas chat 100KB (spek 1.14) — kompresi otomatis di peramban.
      setGambarSiap(await kompresGambar(file, 100));
    } catch (e) {
      toast("error", "Gambar tidak bisa dipakai", e instanceof Error ? e.message : "");
    } finally {
      setSedangKompres(false);
    }
  }

  async function tarikPesan(p: ChatPesan) {
    setPesanDipilih(null);
    // Pesan lokal (belum punya id server) tidak bisa ditarik lewat API.
    if (p.id.startsWith("lokal-")) return;
    try {
      await hapusPesanChat(p.id);
      setPesan((lama) => lama.filter((x) => x.id !== p.id));
      toast("sukses", "Pesan dihapus", "Hilang dari kedua pihak.");
    } catch (e) {
      toast("error", "Gagal menghapus pesan", e instanceof Error ? e.message : "");
    }
  }

  // Long-press (sentuh) / klik kanan (desktop) memilih pesan untuk ditarik.
  function mulaiTekan(p: ChatPesan) {
    timerTekanRef.current = setTimeout(() => setPesanDipilih(p), 550);
  }
  function batalTekan() {
    if (timerTekanRef.current) clearTimeout(timerTekanRef.current);
  }

  const menungguSaya = statusKontak === "menunggu" && dimintaOleh !== idKu;
  const menungguDia = statusKontak === "menunggu" && dimintaOleh === idKu;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col lg:left-60">
      {/* Header percakapan */}
      <header className="glass-strong flex shrink-0 items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali ke daftar chat"
          className="btn-tekan flex h-9 w-9 items-center justify-center rounded-full text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {kontak.lawan_avatar ? (
          <FotoBulat src={kontak.lawan_avatar} ukuran={36} />
        ) : (
          <AvatarInisial nama={kontak.lawan_nama} ukuran={36} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-teks-utama">{kontak.lawan_nama}</p>
          <p className="text-[10px] text-teks-sekunder">
            {statusKontak === "diterima" ? "Percakapan terbuka" : "Menunggu persetujuan"}
          </p>
        </div>
      </header>

      {/* Isi percakapan */}
      <div className="scrollbar-tipis min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto flex max-w-[560px] flex-col gap-1.5">
          {pesan.map((p) => {
            const milikku = p.pengirim_id === idKu;
            return (
              <div key={p.id} className={cn("flex", milikku ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words select-none",
                    milikku
                      ? "rounded-br-md text-white"
                      : "glass rounded-bl-md text-teks-utama",
                  )}
                  style={
                    milikku
                      ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                      : undefined
                  }
                  // Long-press (HP) / klik kanan (desktop) -> tarik pesan
                  onPointerDown={() => mulaiTekan(p)}
                  onPointerUp={batalTekan}
                  onPointerLeave={batalTekan}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setPesanDipilih(p);
                  }}
                >
                  {p.gambar_url && (
                    <button
                      type="button"
                      onClick={() => setGambarPenuh(p.gambar_url ?? null)}
                      aria-label="Buka gambar ukuran penuh"
                      className="mb-1 block overflow-hidden rounded-xl"
                    >
                      <img
                        src={p.gambar_url}
                        alt="Gambar chat"
                        loading="lazy"
                        className="max-h-56 w-auto max-w-full rounded-xl object-contain"
                      />
                    </button>
                  )}
                  {p.isi}
                  <span
                    className={cn(
                      "mt-0.5 flex items-center justify-end gap-1 text-[9px]",
                      milikku ? "text-white/70" : "text-teks-sekunder/70",
                    )}
                  >
                    {jamWIB(p.dibuat_pada)}
                    {/* Ceklis ala WA (spek 1.14): dua ceklis putih pudar =
                        terkirim belum dibaca; dua ceklis BIRU = sudah dibaca. */}
                    {milikku && (
                      <CheckCheck
                        className={cn("h-3.5 w-3.5", p.dibaca && "text-sky-300")}
                        aria-label={p.dibaca ? "Sudah dibaca" : "Terkirim"}
                      />
                    )}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={ujungRef} />
        </div>
      </div>

      {/* Kaki: terima/tolak, menunggu, atau kotak tulis */}
      <div className="glass-strong shrink-0 px-4 pt-2.5" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {menungguSaya ? (
          <div className="mx-auto flex max-w-[560px] gap-2 pb-1">
            <button
              type="button"
              onClick={() => {
                void jawabChat(kontak.id, false).then(() => {
                  toast("info", "Ajakan ditolak");
                  onSegarkanDaftar();
                  onKembali();
                });
              }}
              className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gagal/40 bg-gagal/5 py-2.5 text-sm font-semibold text-gagal"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Tolak
            </button>
            <button
              type="button"
              onClick={() => {
                void jawabChat(kontak.id, true).then(() => {
                  setStatusKontak("diterima");
                  onSegarkanDaftar();
                  toast("sukses", "Percakapan dibuka");
                });
              }}
              className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Terima Chat
            </button>
          </div>
        ) : menungguDia ? (
          <p className="pb-2 text-center text-xs text-teks-sekunder">
            Menunggu {kontak.lawan_nama.split(" ")[0]} menerima ajakan chat Anda.
          </p>
        ) : (
          <div className="mx-auto max-w-[560px]">
            {emojiBuka && (
              <div className="glass mb-2 grid grid-cols-8 gap-1 rounded-xl p-2">
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setTulisan((t) => t + e)}
                    className="btn-tekan rounded-lg py-1 text-lg"
                    aria-label={`Sisipkan emoji ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            {/* Sisa karakter — muncul saat mendekati batas 300 */}
            {tulisan.length > 240 && (
              <p className="mb-1 text-right text-[10px] font-semibold text-teks-sekunder">
                {300 - tulisan.length} karakter tersisa
              </p>
            )}
            {/* Pratinjau gambar yang siap dikirim */}
            {gambarSiap && (
              <div className="glass mb-2 flex items-center gap-2 rounded-xl p-2">
                <img
                  src={gambarSiap}
                  alt="Pratinjau gambar"
                  className="h-14 w-14 rounded-lg object-cover"
                />
                <p className="min-w-0 flex-1 text-[11px] text-teks-sekunder">
                  Gambar siap dikirim (terkompresi otomatis).
                </p>
                <button
                  type="button"
                  onClick={() => setGambarSiap(null)}
                  aria-label="Batalkan gambar"
                  className="btn-tekan p-1.5 text-teks-sekunder"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2 pb-1">
              <input
                ref={inputGambarRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Pilih gambar"
                onChange={(e) => {
                  void pilihGambar(e.target.files?.[0] ?? null);
                  e.target.value = ""; // supaya file sama bisa dipilih lagi
                }}
              />
              <button
                type="button"
                onClick={() => inputGambarRef.current?.click()}
                disabled={sedangKompres}
                aria-label="Kirim gambar"
                className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-teks-sekunder disabled:opacity-60"
              >
                {sedangKompres ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setEmojiBuka((v) => !v)}
                aria-label="Emoji"
                className={cn(
                  "btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  emojiBuka ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
                )}
              >
                <Smile className="h-5 w-5" />
              </button>
              <textarea
                value={tulisan}
                onChange={(e) => setTulisan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void kirim();
                  }
                }}
                rows={1}
                maxLength={300}
                placeholder="Tulis pesan… (maks 300 karakter)"
                className="glass max-h-28 min-w-0 flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void kirim()}
                disabled={(!tulisan.trim() && !gambarSiap) || sedangKirim}
                aria-label="Kirim pesan"
                className="btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              >
                {sedangKirim ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <Send className="h-4.5 w-4.5" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Konfirmasi tarik pesan (spek 1.14: hilang dari kedua pihak) */}
      {pesanDipilih && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center px-8"
          role="dialog"
          aria-modal="true"
          aria-label="Hapus pesan"
        >
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setPesanDipilih(null)}
          />
          <div className="glass-strong relative w-full max-w-[320px] rounded-2xl p-5 text-center">
            <p className="text-sm font-bold text-teks-utama">Hapus pesan ini?</p>
            <p className="mt-1 text-[12px] leading-relaxed text-teks-sekunder">
              Pesan akan hilang dari tampilan Anda DAN lawan bicara.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPesanDipilih(null)}
                className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void tarikPesan(pesanDipilih)}
                className="btn-tekan flex-1 rounded-xl py-2.5 text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox gambar ukuran penuh */}
      {gambarPenuh && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Gambar ukuran penuh"
          onClick={() => setGambarPenuh(null)}
        >
          <button
            type="button"
            onClick={() => setGambarPenuh(null)}
            aria-label="Tutup gambar"
            className="btn-tekan absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={gambarPenuh}
            alt="Gambar chat ukuran penuh"
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Modal pengumuman (daftar + form kirim bila berwenang)
// ------------------------------------------------------------

function ModalPengumuman({ onTutup }: { onTutup: () => void }) {
  const [daftar, setDaftar] = useState<Pengumuman[] | null>(null);
  const [cakupanBoleh, setCakupanBoleh] = useState<("semua" | "jabatan" | "tim")[]>([]);
  const [jabatanPilihan, setJabatanPilihan] = useState<readonly string[]>([]);
  const [formBuka, setFormBuka] = useState(false);
  const [judul, setJudul] = useState("");
  const [isi, setIsi] = useState("");
  const [cakupan, setCakupan] = useState<"semua" | "jabatan" | "tim">("tim");
  const [jabatanTarget, setJabatanTarget] = useState("");
  const [sedangKirim, setSedangKirim] = useState(false);
  const [muatUlang, setMuatUlang] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getPengumuman();
        if (!hidup) return;
        setDaftar(hasil.data);
        setCakupanBoleh(hasil.cakupan_boleh);
        setJabatanPilihan(hasil.jabatan_pilihan);
        if (hasil.cakupan_boleh.length > 0) setCakupan(hasil.cakupan_boleh[0]);
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  async function kirim() {
    if (judul.trim().length < 3 || isi.trim().length < 3 || sedangKirim) return;
    setSedangKirim(true);
    try {
      const jumlah = await kirimPengumuman({
        judul: judul.trim(),
        isi: isi.trim(),
        cakupan,
        jabatan_target: cakupan === "jabatan" ? jabatanTarget : undefined,
      });
      toast("sukses", "Pengumuman terkirim", `${jumlah} orang menerima notifikasi.`);
      setJudul("");
      setIsi("");
      setFormBuka(false);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal mengirim pengumuman", e instanceof Error ? e.message : "");
    } finally {
      setSedangKirim(false);
    }
  }

  const LABEL_CAKUPAN: Record<string, string> = {
    semua: "Semua Anggota",
    jabatan: "Divisi Tertentu",
    tim: "Tim Saya",
  };

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Pengumuman"
        className="glass-strong relative mx-auto flex max-h-[88dvh] w-full max-w-[480px] flex-col rounded-t-[2rem]"
        initial={{ y: "102%" }}
        animate={{ y: 0 }}
        exit={{ y: "102%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-1">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="glass-soft flex h-9 w-9 items-center justify-center rounded-xl text-pri" aria-hidden="true">
              <Megaphone className="h-4.5 w-4.5" />
            </span>
            <h2 className="font-heading text-base font-bold text-teks-utama">Pengumuman</h2>
          </div>
          {cakupanBoleh.length > 0 && !formBuka && (
            <button
              type="button"
              onClick={() => setFormBuka(true)}
              className="btn-tekan flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Buat
            </button>
          )}
        </div>

        <div className="scrollbar-tipis min-h-0 flex-1 overflow-y-auto px-5 pb-8">
          {/* Form kirim — hanya bagi yang berwenang */}
          {formBuka && (
            <GlassCard className="mb-3 p-3.5">
              <input
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                maxLength={120}
                placeholder="Judul pengumuman…"
                className="glass w-full rounded-xl px-3.5 py-2.5 text-sm font-semibold text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
              />
              <textarea
                value={isi}
                onChange={(e) => setIsi(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Isi pengumuman…"
                className="glass mt-2 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
              />
              {/* Pilih cakupan sesuai wewenang */}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {cakupanBoleh.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCakupan(c)}
                    className={cn(
                      "btn-tekan rounded-full px-3 py-1.5 text-[11px] font-bold",
                      cakupan === c ? "text-white" : "glass text-teks-sekunder",
                    )}
                    style={
                      cakupan === c
                        ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                        : undefined
                    }
                  >
                    {LABEL_CAKUPAN[c]}
                  </button>
                ))}
              </div>
              {cakupan === "jabatan" && (
                <select
                  value={jabatanTarget}
                  onChange={(e) => setJabatanTarget(e.target.value)}
                  className="glass mt-2 w-full rounded-xl px-3 py-2.5 text-sm text-teks-utama focus:outline-none"
                >
                  <option value="">Pilih divisi/jabatan tujuan…</option>
                  {jabatanPilihan.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormBuka(false)}
                  className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void kirim()}
                  disabled={
                    sedangKirim ||
                    judul.trim().length < 3 ||
                    isi.trim().length < 3 ||
                    (cakupan === "jabatan" && !jabatanTarget)
                  }
                  className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                >
                  {sedangKirim ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Megaphone className="h-4 w-4" aria-hidden="true" />
                  )}
                  Umumkan
                </button>
              </div>
            </GlassCard>
          )}

          {daftar === null ? (
            <GlassSkeleton className="h-24 rounded-2xl" />
          ) : daftar.length === 0 ? (
            <EmptyState
              ikon={Megaphone}
              judul="Belum Ada Pengumuman"
              keterangan="Pengumuman dari atasan Anda akan tampil di sini."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {daftar.map((p) => (
                <GlassCard key={p.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-bold text-teks-utama">{p.judul}</p>
                    {p.dari_saya && <StatusBadge label="dari saya" warna="pri" />}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-teks-sekunder">
                    {p.isi}
                  </p>
                  <p className="mt-2 text-[10px] text-teks-sekunder/80">
                    {p.pengirim_nama} ·{" "}
                    {p.cakupan === "semua"
                      ? "semua anggota"
                      : p.cakupan === "jabatan"
                        ? `divisi ${p.jabatan_target}`
                        : "tim"}{" "}
                    · {tanggalIndonesia(p.dibuat_pada)} {jamWIB(p.dibuat_pada)}
                  </p>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// ChatScreen — daftar percakapan
// ------------------------------------------------------------

export function ChatScreen({
  user,
  onBukaNotifikasi,
}: {
  user: User;
  onBukaNotifikasi?: () => void;
}) {
  const [daftar, setDaftar] = useState<ChatKontak[] | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);
  const [kontakAktif, setKontakAktif] = useState<ChatKontak | null>(null);
  const [modalBaru, setModalBaru] = useState(false);
  const [modalPengumuman, setModalPengumuman] = useState(false);
  const [kandidat, setKandidat] = useState<KandidatChat[] | null>(null);
  const [cari, setCari] = useState("");
  // Kewenangan pengawas (super admin/master) + sakelar fitur chat
  const [pengawas, setPengawas] = useState(false);
  const [chatAktif, setChatAktif] = useState(true);
  const [modeChat, setModeChat] = useState<"terbuka" | "persetujuan">("terbuka");
  // Grup divisi (spek 4.2) — null bila belum berdivisi
  const [grup, setGrup] = useState<InfoGrupDivisi | null>(null);
  const [grupBuka, setGrupBuka] = useState(false);
  const [modalPantau, setModalPantau] = useState(false);

  // Daftar chat dimuat + disegarkan tiap 10 dtk (badge unread hidup).
  useEffect(() => {
    let hidup = true;
    async function muat() {
      try {
        const hasil = await getDaftarChat();
        if (!hidup) return;
        setDaftar(hasil.data);
        setPengawas(hasil.pengawas);
        setChatAktif(hasil.chat_aktif);
        setModeChat(hasil.chat_mode);
        // Grup divisi ikut disegarkan bersama daftar (badge unread hidup).
        setGrup(await getGrupDivisiku());
      } catch {
        if (hidup && daftar === null) setDaftar([]);
      }
    }
    void muat();
    const detak = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void muat();
    }, 10000);
    return () => {
      hidup = false;
      clearInterval(detak);
    };
     
  }, [muatUlang]);

  async function bukaModalBaru() {
    setModalBaru(true);
    if (!kandidat) {
      try {
        setKandidat(await getKandidatChat());
      } catch {
        setKandidat([]);
      }
    }
  }

  async function mulai(id: string, nama: string) {
    try {
      const hasil = await mulaiChatLengkap(id);
      toast(
        "sukses",
        hasil.status === "diterima"
          ? `Chat dengan ${nama.split(" ")[0]} terbuka`
          : `Ajakan chat terkirim ke ${nama.split(" ")[0]}`,
      );
      setModalBaru(false);
      setMuatUlang((n) => n + 1);
      setKontakAktif({
        id: hasil.kontak_id,
        lawan_id: id,
        lawan_nama: nama,
        lawan_avatar: "",
        status: hasil.status as ChatKontak["status"],
        diminta_oleh: user.id,
        cuplikan: "",
        waktu_terakhir: new Date().toISOString(),
        belum_dibaca: 0,
      });
    } catch (e) {
      toast("error", "Gagal memulai chat", e instanceof Error ? e.message : "");
    }
  }

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
            Chat
          </h1>
          <p className="mt-0.5 text-xs text-teks-sekunder">Komunikasi internal partai</p>
        </div>
        <div className="flex items-center gap-2">
          {pengawas && (
            <button
              type="button"
              onClick={() => setModalPantau(true)}
              aria-label="Panel pengawas chat"
              className="glass btn-tekan flex h-10 w-10 items-center justify-center rounded-xl text-pri"
            >
              <ShieldCheck className="h-4.5 w-4.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setModalPengumuman(true)}
            aria-label="Pengumuman"
            className="glass btn-tekan flex h-10 w-10 items-center justify-center rounded-xl text-teks-utama"
          >
            <Megaphone className="h-4.5 w-4.5" />
          </button>
          <TombolLonceng onBuka={onBukaNotifikasi} />
        <ThemeToggle />
        </div>
      </header>

      {/* Peringatan bila fitur chat sedang dimatikan */}
      {!chatAktif && (
        <div className="mt-3 rounded-2xl border border-gagal/40 bg-gagal/10 px-3.5 py-2.5">
          <p className="text-xs font-semibold text-gagal">
            Fitur chat sedang dimatikan super admin
            {pengawas ? " — Anda tetap bisa memakainya sebagai pengawas." : "."}
          </p>
        </div>
      )}

      {/* Grup divisi — tersemat di atas daftar (spek 4.2) */}
      {grup && (
        <FadeInUp>
          <button
            type="button"
            onClick={() => setGrupBuka(true)}
            className="btn-tekan mt-4 w-full text-left"
          >
            <GlassCard className="flex items-center gap-3 border border-pri/25 p-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                aria-hidden="true"
              >
                <Users className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-teks-utama">
                    Grup {grup.divisi}
                  </p>
                  {grup.waktu_terakhir && (
                    <span className="shrink-0 text-[10px] text-teks-sekunder">
                      {jamWIB(grup.waktu_terakhir)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-teks-sekunder">
                    {grup.cuplikan || `${grup.anggota} anggota — koordinasi divisi`}
                  </p>
                  {grup.belum_dibaca > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-pri px-1.5 text-[10px] font-bold text-white">
                      {grup.belum_dibaca > 99 ? "99+" : grup.belum_dibaca}
                    </span>
                  )}
                </div>
              </div>
            </GlassCard>
          </button>
        </FadeInUp>
      )}

      {/* Daftar percakapan */}
      <FadeInUp>
        <div className="mt-4 flex flex-col gap-2">
          {daftar === null ? (
            <>
              <GlassSkeleton className="h-[68px] rounded-2xl" />
              <GlassSkeleton className="h-[68px] rounded-2xl" />
            </>
          ) : daftar.length === 0 ? (
            <GlassCard className="p-1">
              <EmptyState
                ikon={MessagesSquare}
                judul="Belum Ada Percakapan"
                keterangan={
                  modeChat === "terbuka"
                    ? "Mulai chat dengan sesama anggota — percakapan langsung terbuka."
                    : "Mulai chat dengan sesama anggota. Lawan bicara harus menerima ajakan dulu sebelum percakapan terbuka."
                }
                labelAksi="Mulai Chat Baru"
                onAksi={() => void bukaModalBaru()}
                className="py-8"
              />
            </GlassCard>
          ) : (
            daftar.map((k) => {
              const ajakanUntukku = k.status === "menunggu" && k.diminta_oleh !== user.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKontakAktif(k)}
                  className="btn-tekan text-left"
                >
                  <GlassCard className="flex items-center gap-3 p-3">
                    {k.lawan_avatar ? (
                      <FotoBulat src={k.lawan_avatar} ukuran={44} />
                    ) : (
                      <AvatarInisial nama={k.lawan_nama} ukuran={44} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold text-teks-utama">
                          <span className="truncate">{k.lawan_nama}</span>
                          {/* Api streak chat (spek 4.1) */}
                          <IkonStreak hari={k.streak_hari ?? 0} />
                        </p>
                        <span className="shrink-0 text-[10px] text-teks-sekunder">
                          {jamWIB(k.waktu_terakhir)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-teks-sekunder">
                          {ajakanUntukku
                            ? "Mengajak Anda mengobrol — ketuk untuk menjawab"
                            : k.status === "menunggu"
                              ? "Menunggu persetujuan…"
                              : k.cuplikan || "Belum ada pesan"}
                        </p>
                        {ajakanUntukku ? (
                          <StatusBadge label="ajakan" warna="kuning" berkedip />
                        ) : (
                          k.belum_dibaca > 0 && (
                            <span
                              className="angka-tab flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                            >
                              {k.belum_dibaca > 99 ? "99+" : k.belum_dibaca}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </GlassCard>
                </button>
              );
            })
          )}
        </div>
      </FadeInUp>

      {/* Tombol chat baru mengambang */}
      <button
        type="button"
        onClick={() => void bukaModalBaru()}
        aria-label="Mulai chat baru"
        className="btn-tekan fixed right-5 bottom-28 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white lg:bottom-8"
        style={{
          background: "linear-gradient(135deg, #DC2626, #B91C1C)",
          boxShadow: "0 10px 26px rgba(220, 38, 38, 0.45)",
        }}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Panel percakapan penuh */}
      <AnimatePresence>
        {/* Grup divisi meluncur masuk dengan animasi yang sama */}
        {grupBuka && grup && (
          <motion.div
            key={`grup-${grup.divisi}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="fixed inset-0 z-[60]"
          >
            <div className="absolute inset-0 bg-[var(--app-bg)]" />
            <PanelGrup
              user={user}
              divisi={grup.divisi}
              anggota={grup.anggota}
              onKembali={() => {
                setGrupBuka(false);
                setMuatUlang((n) => n + 1);
              }}
              onSegarkanDaftar={() => setMuatUlang((n) => n + 1)}
            />
          </motion.div>
        )}
        {kontakAktif && (
          <motion.div
            key={`chat-${kontakAktif.id}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="fixed inset-0 z-[60]"
          >
            <div className="absolute inset-0 bg-[var(--app-bg)]" />
            <PanelPercakapan
              kontak={kontakAktif}
              idKu={user.id}
              onKembali={() => {
                setKontakAktif(null);
                setMuatUlang((n) => n + 1);
              }}
              onSegarkanDaftar={() => setMuatUlang((n) => n + 1)}
            />
          </motion.div>
        )}

        {/* Modal pilih lawan bicara */}
        {modalBaru && (
          <motion.div
            key="modal-baru"
            className="fixed inset-0 z-[80] flex flex-col justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-md"
              onClick={() => setModalBaru(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Mulai chat baru"
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
                Mulai Chat Baru
              </h2>
              <p className="mt-1 shrink-0 text-[12.5px] text-teks-sekunder">
                Percakapan terbuka setelah lawan bicara menerima ajakan Anda.
              </p>
              <input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari nama…"
                className="glass mt-3 w-full shrink-0 rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
              />
              <div className="scrollbar-tipis mt-3 flex flex-col gap-2 overflow-y-auto">
                {kandidat === null ? (
                  <GlassSkeleton className="h-16 rounded-2xl" />
                ) : kandidat.length === 0 ? (
                  <p className="py-6 text-center text-xs text-teks-sekunder">
                    Tidak ada pengguna lain yang bisa diajak.
                  </p>
                ) : (
                  kandidat
                    .filter((c) =>
                      c.nama.toLowerCase().includes(cari.trim().toLowerCase()),
                    )
                    .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void mulai(c.id, c.nama)}
                      className="glass-soft btn-tekan flex items-center gap-3 rounded-2xl p-3 text-left"
                    >
                      {c.avatar_url ? (
                        <FotoBulat src={c.avatar_url} ukuran={40} />
                      ) : (
                        <AvatarInisial nama={c.nama} ukuran={40} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-teks-utama">
                          {c.nama}
                        </span>
                        {c.jabatan && (
                          <span className="block text-[11px] text-teks-sekunder">{c.jabatan}</span>
                        )}
                        {c.nomor_wa && (
                          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-teks-sekunder">
                            <Phone className="h-3 w-3" aria-hidden="true" />
                            +{c.nomor_wa}
                          </span>
                        )}
                      </span>
                      <MessagesSquare className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />
                    </button>
                    ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {modalPengumuman && <ModalPengumuman key="pengumuman" onTutup={() => setModalPengumuman(false)} />}
        {modalPantau && (
          <ModalPengawasChat
            key="pantau"
            onTutup={() => setModalPantau(false)}
            onBerubah={() => setMuatUlang((n) => n + 1)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------
// ModalPengawasChat — kewenangan super admin / master:
// melihat semua percakapan & isinya, menghapusnya, dan
// menyalakan/mematikan fitur chat untuk seluruh anggota.
// ------------------------------------------------------------

function ModalPengawasChat({
  onTutup,
  onBerubah,
}: {
  onTutup: () => void;
  onBerubah: () => void;
}) {
  const [daftar, setDaftar] = useState<ChatPantau[] | null>(null);
  const [aktif, setAktif] = useState(true);
  const [mode, setMode] = useState<"terbuka" | "persetujuan">("terbuka");
  const [muatUlang, setMuatUlang] = useState(0);
  const [dibuka, setDibuka] = useState<ChatPantau | null>(null);
  const [isiPesan, setIsiPesan] = useState<ChatPesan[] | null>(null);
  const [sedangProses, setSedangProses] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getPantauChat();
        if (!hidup) return;
        setDaftar(hasil.data);
        setAktif(hasil.chat_aktif);
        setMode(hasil.chat_mode);
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  async function bukaIsi(k: ChatPantau) {
    setDibuka(k);
    setIsiPesan(null);
    try {
      setIsiPesan(await getPesanPantau(k.id));
    } catch {
      setIsiPesan([]);
    }
  }

  async function ubahSakelar() {
    if (sedangProses) return;
    setSedangProses(true);
    try {
      await setSakelarChat(!aktif);
      setAktif(!aktif);
      toast(
        "sukses",
        !aktif ? "Fitur chat dinyalakan" : "Fitur chat dimatikan",
        !aktif ? "Semua anggota bisa mengobrol lagi." : "Anggota tidak bisa mengirim pesan.",
      );
      onBerubah();
    } catch (e) {
      toast("error", "Gagal mengubah", e instanceof Error ? e.message : "");
    } finally {
      setSedangProses(false);
    }
  }

  async function ubahMode() {
    if (sedangProses) return;
    setSedangProses(true);
    const modeBaru = mode === "terbuka" ? "persetujuan" : "terbuka";
    try {
      await setModeChatService(modeBaru);
      setMode(modeBaru);
      toast(
        "sukses",
        modeBaru === "terbuka" ? "Chat bebas dinyalakan" : "Mode persetujuan dinyalakan",
        modeBaru === "terbuka"
          ? "Semua orang bisa chat siapa saja tanpa persetujuan."
          : "Chat baru harus diterima lawan bicara dulu.",
      );
      onBerubah();
    } catch (e) {
      toast("error", "Gagal mengubah mode", e instanceof Error ? e.message : "");
    } finally {
      setSedangProses(false);
    }
  }

  async function hapus(k: ChatPantau) {
    if (sedangProses) return;
    setSedangProses(true);
    try {
      await hapusChat(k.id);
      toast("sukses", "Percakapan dihapus");
      setDibuka(null);
      setMuatUlang((n) => n + 1);
      onBerubah();
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    } finally {
      setSedangProses(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onTutup} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Panel pengawas chat"
        className="glass-strong relative mx-auto flex max-h-[88dvh] w-full max-w-[480px] flex-col rounded-t-[2rem] px-5 pt-3 pb-8"
        initial={{ y: "102%" }}
        animate={{ y: 0 }}
        exit={{ y: "102%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
      >
        <div className="mb-3 flex shrink-0 justify-center">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>
        <h2 className="shrink-0 font-heading text-lg font-bold text-teks-utama">
          Pengawas Chat
        </h2>

        {/* Sakelar fitur chat */}
        <div className="glass mt-3 flex shrink-0 items-center gap-3 rounded-2xl px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-teks-utama">Fitur Chat</p>
            <p className="text-[11px] text-teks-sekunder">
              {aktif ? "Aktif untuk semua anggota" : "Dimatikan — anggota tidak bisa mengirim"}
            </p>
          </div>
          <button
            type="button"
            disabled={sedangProses}
            onClick={() => void ubahSakelar()}
            className="btn-tekan rounded-xl px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"
            style={{
              background: aktif
                ? "linear-gradient(135deg, #DC2626, #B91C1C)"
                : "linear-gradient(135deg, #10B981, #059669)",
            }}
          >
            {aktif ? "Matikan" : "Nyalakan"}
          </button>
        </div>

        {/* Mode chat: bebas (tanpa persetujuan) vs persetujuan lama */}
        <div className="glass mt-2 flex shrink-0 items-center gap-3 rounded-2xl px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-teks-utama">Chat Bebas</p>
            <p className="text-[11px] text-teks-sekunder">
              {mode === "terbuka"
                ? "Semua orang bisa chat siapa saja tanpa persetujuan"
                : "Chat baru harus diterima lawan bicara dulu"}
            </p>
          </div>
          <button
            type="button"
            disabled={sedangProses}
            onClick={() => void ubahMode()}
            className="btn-tekan rounded-xl px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"
            style={{
              background:
                mode === "terbuka"
                  ? "linear-gradient(135deg, #DC2626, #B91C1C)"
                  : "linear-gradient(135deg, #10B981, #059669)",
            }}
          >
            {mode === "terbuka" ? "Ke Persetujuan" : "Bebaskan"}
          </button>
        </div>

        <div className="scrollbar-tipis mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {dibuka ? (
            <>
              <button
                type="button"
                onClick={() => setDibuka(null)}
                className="glass btn-tekan flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-teks-utama"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {dibuka.nama_a} ↔ {dibuka.nama_b}
              </button>
              {isiPesan === null ? (
                <GlassSkeleton className="h-24 rounded-2xl" />
              ) : isiPesan.length === 0 ? (
                <p className="py-6 text-center text-xs text-teks-sekunder">
                  Belum ada pesan di percakapan ini.
                </p>
              ) : (
                isiPesan.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "glass-soft rounded-xl px-3 py-2",
                      m.dihapus && "border border-gagal/40",
                    )}
                  >
                    {m.gambar_url && (
                      <img
                        src={m.gambar_url}
                        alt="Gambar chat"
                        loading="lazy"
                        className="mb-1 max-h-32 rounded-lg object-contain"
                      />
                    )}
                    <p className="text-xs leading-relaxed text-teks-utama">{m.isi}</p>
                    <p className="mt-0.5 text-[10px] text-teks-sekunder">
                      {jamWIB(m.dibuat_pada)}
                      {/* Pengawas tetap melihat pesan yang ditarik pengguna
                          selama retensi 7 hari (spek 1.14). */}
                      {m.dihapus && (
                        <span className="ml-1.5 font-semibold text-gagal">
                          ditarik pengguna
                        </span>
                      )}
                    </p>
                  </div>
                ))
              )}
              <button
                type="button"
                disabled={sedangProses}
                onClick={() => void hapus(dibuka)}
                className="btn-tekan mt-1 flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-gagal/40 bg-gagal/5 py-2.5 text-xs font-semibold text-gagal disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Hapus Percakapan Ini
              </button>
            </>
          ) : daftar === null ? (
            <GlassSkeleton className="h-20 rounded-2xl" />
          ) : daftar.length === 0 ? (
            <p className="py-8 text-center text-xs text-teks-sekunder">
              Belum ada percakapan di sistem.
            </p>
          ) : (
            daftar.map((k) => (
              <GlassCard key={k.id} className="flex items-center gap-2.5 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-teks-utama">
                    {k.nama_a} ↔ {k.nama_b}
                  </p>
                  <p className="text-[10px] text-teks-sekunder">
                    {k.status === "diterima" ? "aktif" : "menunggu persetujuan"} ·{" "}
                    {tanggalIndonesia(k.dibuat_pada)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void bukaIsi(k)}
                  aria-label="Lihat isi percakapan"
                  className="btn-tekan p-1.5 text-teks-sekunder"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={sedangProses}
                  onClick={() => void hapus(k)}
                  aria-label="Hapus percakapan"
                  className="btn-tekan p-1.5 text-gagal disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </GlassCard>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
