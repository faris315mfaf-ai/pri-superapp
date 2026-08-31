"use client";

// ============================================================
// PanelGrup — ruang obrolan grup divisi (spek 4.2).
//
// Meniru PanelPercakapan 1-lawan-1, dengan beda khas grup:
// - Nama + avatar pengirim tampil di atas bubble orang lain.
// - Tanpa alur terima/tolak — keanggotaan otomatis dari divisi.
// - Tarik pesan: pengirimnya sendiri; kepala divisi boleh menarik
//   pesan siapa pun (admin grup); dicek ulang di server.
// - Gambar terkompresi <=100KB, sama seperti chat 1-lawan-1.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Send, Smile, Users, X } from "lucide-react";
import { AvatarInisial } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { CincinJuara } from "@/features/peringkat/cincin-mythic";
import { toast } from "@/hooks/use-app-store";
import { kompresGambar } from "@/lib/gambar-kompres";
import {
  getPesanGrup,
  hapusPesanGrup,
  kirimPesanGrup,
  tandaiGrupDibaca,
  type PesanGrup,
  getAnggotaGrup,
  ubahInfoGrup,
  type AnggotaGrup,
} from "@/services";
import { jamWIB } from "@/lib/format";
import type { User } from "@/types";
import { cn } from "@/lib/utils";

const EMOJI = [
  "😀", "😂", "🥰", "😎", "🤝", "🙏", "👍", "👏",
  "💪", "🔥", "⭐", "✅", "❤️", "🎉", "🚀", "📌",
];

export function PanelGrup({
  user,
  divisi,
  namaGrup,
  fotoGrup,
  anggota,
  onKembali,
  onSegarkanDaftar,
}: {
  user: User;
  divisi: string;
  /** Nama tampilan grup (kustom kepala divisi, atau nama divisi) */
  namaGrup: string;
  fotoGrup: string;
  anggota: number;
  onKembali: () => void;
  onSegarkanDaftar: () => void;
}) {
  const [pesan, setPesan] = useState<PesanGrup[]>([]);
  const [tulisan, setTulisan] = useState("");
  const [emojiBuka, setEmojiBuka] = useState(false);
  const [sedangKirim, setSedangKirim] = useState(false);
  const [gambarSiap, setGambarSiap] = useState<string | null>(null);
  const [sedangKompres, setSedangKompres] = useState(false);
  const [pesanDipilih, setPesanDipilih] = useState<PesanGrup | null>(null);
  const [gambarPenuh, setGambarPenuh] = useState<string | null>(null);
  const inputGambarRef = useRef<HTMLInputElement | null>(null);
  const timerTekanRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Info grup (spek 1.15): sheet anggota + kustomisasi nama/foto
  const [infoBuka, setInfoBuka] = useState(false);
  const [namaTampil, setNamaTampil] = useState(namaGrup);
  const [fotoTampil, setFotoTampil] = useState(fotoGrup);
  const ujungRef = useRef<HTMLDivElement | null>(null);
  const idTerakhirRef = useRef<string>("0");

  const kepala = user.posisi_divisi === "kepala";

  // Muat awal + polling tambahan tiap 4 detik (pola sama dgn 1-lawan-1).
  useEffect(() => {
    let hidup = true;
    async function tarik(awal: boolean) {
      try {
        const data = await getPesanGrup(awal ? undefined : idTerakhirRef.current);
        if (!hidup) return;
        if (data.length > 0) {
          idTerakhirRef.current = data[data.length - 1].id;
          setPesan((lama) => {
            // Tameng dedup (bug "pesan dobel" 1.15) — pesan yang sudah
            // dirender langsung tidak boleh ditambah lagi oleh polling.
            if (awal) return data;
            const sudahAda = new Set(lama.map((m) => m.id));
            return [...lama, ...data.filter((m) => !sudahAda.has(m.id))];
          });
          void tandaiGrupDibaca();
        } else if (awal) {
          setPesan([]);
        }
      } catch {
        // Polling gagal sesaat — coba lagi putaran berikutnya.
      }
    }
    void tarik(true);
    void tandaiGrupDibaca();
    const detak = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void tarik(false);
    }, 4000);
    return () => {
      hidup = false;
      clearInterval(detak);
    };
  }, [divisi]);

  useEffect(() => {
    ujungRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [pesan.length]);

  async function kirim() {
    const isi = tulisan.trim();
    if ((!isi && !gambarSiap) || sedangKirim) return;
    setSedangKirim(true);
    try {
      const hasil = await kirimPesanGrup(isi, gambarSiap ?? undefined);
      setTulisan("");
      setGambarSiap(null);
      setEmojiBuka(false);
      // ID ASLI server + majukan kursor polling — dulu id lokal
      // membuat polling menarik ulang pesan yang sama (pesan dobel).
      if (hasil.id && Number(hasil.id) > Number(idTerakhirRef.current)) {
        idTerakhirRef.current = hasil.id;
      }
      setPesan((lama) =>
        lama.some((m) => m.id === hasil.id)
          ? lama
          : [
              ...lama,
              {
                id: hasil.id || `lokal-${Date.now()}`,
                pengirim_id: user.id,
                pengirim_nama: user.nama,
                pengirim_avatar: user.avatar_url ?? "",
                isi,
                gambar_url: hasil.gambar_url,
                dibuat_pada: hasil.dibuat_pada,
              },
            ],
      );
      onSegarkanDaftar();
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
      setGambarSiap(await kompresGambar(file, 100));
    } catch (e) {
      toast("error", "Gambar tidak bisa dipakai", e instanceof Error ? e.message : "");
    } finally {
      setSedangKompres(false);
    }
  }

  async function tarikPesan(p: PesanGrup) {
    setPesanDipilih(null);
    if (p.id.startsWith("lokal-")) return;
    try {
      await hapusPesanGrup(p.id);
      setPesan((lama) => lama.filter((x) => x.id !== p.id));
      toast("sukses", "Pesan dihapus");
    } catch (e) {
      toast("error", "Gagal menghapus pesan", e instanceof Error ? e.message : "");
    }
  }

  // Long-press / klik kanan memilih pesan untuk ditarik — hanya pesan
  // yang memang boleh ditarik (milik sendiri, atau apa pun bila kepala).
  function bolehTarik(p: PesanGrup): boolean {
    return p.pengirim_id === user.id || kepala;
  }
  function mulaiTekan(p: PesanGrup) {
    if (!bolehTarik(p)) return;
    timerTekanRef.current = setTimeout(() => setPesanDipilih(p), 550);
  }
  function batalTekan() {
    if (timerTekanRef.current) clearTimeout(timerTekanRef.current);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col lg:left-60">
      {/* Header grup */}
      <header className="glass-strong flex shrink-0 items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali ke daftar chat"
          className="btn-tekan flex h-9 w-9 items-center justify-center rounded-full text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {/* Ketuk header -> info grup: anggota + kustomisasi (spek 1.15) */}
        <button
          type="button"
          onClick={() => setInfoBuka(true)}
          aria-label="Info grup"
          className="btn-tekan flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {fotoTampil ? (
            <FotoBulat src={fotoTampil} ukuran={36} />
          ) : (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              aria-hidden="true"
            >
              <Users className="h-4.5 w-4.5" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-teks-utama">
              {namaTampil}
            </span>
            <span className="block text-[10px] text-teks-sekunder">
              {anggota} anggota · ketuk untuk info grup
            </span>
          </span>
        </button>
      </header>

      {/* Isi grup */}
      <div className="scrollbar-tipis min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto flex max-w-[560px] flex-col gap-1.5">
          {pesan.map((p, i) => {
            const milikku = p.pengirim_id === user.id;
            // Nama pengirim ditampilkan hanya saat berganti pembicara.
            const gantiPembicara = i === 0 || pesan[i - 1].pengirim_id !== p.pengirim_id;
            return (
              <div key={p.id} className={cn("flex gap-2", milikku ? "justify-end" : "justify-start")}>
                {!milikku && (
                  <span className="w-7 shrink-0 self-end">
                    {gantiPembicara && (
                      <CincinJuara userId={p.pengirim_id} ukuran={28}>
                        {p.pengirim_avatar ? (
                          <FotoBulat src={p.pengirim_avatar} ukuran={28} />
                        ) : (
                          <AvatarInisial nama={p.pengirim_nama || "?"} ukuran={28} />
                        )}
                      </CincinJuara>
                    )}
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words select-none",
                    milikku ? "rounded-br-md text-white" : "glass rounded-bl-md text-teks-utama",
                  )}
                  style={
                    milikku
                      ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                      : undefined
                  }
                  onPointerDown={() => mulaiTekan(p)}
                  onPointerUp={batalTekan}
                  onPointerLeave={batalTekan}
                  onContextMenu={(e) => {
                    if (!bolehTarik(p)) return;
                    e.preventDefault();
                    setPesanDipilih(p);
                  }}
                >
                  {!milikku && gantiPembicara && (
                    <p className="mb-0.5 text-[10.5px] font-bold text-pri">
                      {p.pengirim_nama.split(" ").slice(0, 2).join(" ")}
                    </p>
                  )}
                  {p.gambar_url && (
                    <button
                      type="button"
                      onClick={() => setGambarPenuh(p.gambar_url || null)}
                      aria-label="Buka gambar ukuran penuh"
                      className="mb-1 block overflow-hidden rounded-xl"
                    >
                      <img
                        src={p.gambar_url}
                        alt="Gambar grup"
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
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={ujungRef} />
        </div>
      </div>

      {/* Komposer */}
      <div
        className="glass-strong shrink-0 px-4 pt-2.5"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
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
                e.target.value = "";
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
              placeholder={`Tulis ke Grup ${divisi}…`}
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
      </div>

      {/* Konfirmasi tarik pesan */}
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
              Pesan akan hilang dari tampilan seluruh anggota grup.
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

      {/* Lightbox gambar */}
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
            alt="Gambar grup ukuran penuh"
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}

      {/* Sheet info grup (spek 1.15): anggota + kustomisasi kepala */}
      {infoBuka && (
        <InfoGrupSheet
          divisi={divisi}
          namaTampil={namaTampil}
          fotoTampil={fotoTampil}
          bolehUbah={kepala}
          onTutup={() => setInfoBuka(false)}
          onBerubah={(nama, foto) => {
            setNamaTampil(nama);
            if (foto) setFotoTampil(foto);
            onSegarkanDaftar();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// InfoGrupSheet — daftar anggota grup + (kepala divisi) ganti
// nama & foto grup. Keanggotaan otomatis dari divisi, jadi tidak
// ada tombol keluar/tambah anggota di sini.
// ------------------------------------------------------------

function InfoGrupSheet({
  divisi,
  namaTampil,
  fotoTampil,
  bolehUbah,
  onTutup,
  onBerubah,
}: {
  divisi: string;
  namaTampil: string;
  fotoTampil: string;
  bolehUbah: boolean;
  onTutup: () => void;
  onBerubah: (nama: string, foto: string) => void;
}) {
  const [anggota, setAnggota] = useState<AnggotaGrup[] | null>(null);
  const [namaBaru, setNamaBaru] = useState(namaTampil);
  const [sedangSimpan, setSedangSimpan] = useState(false);
  const [sedangFoto, setSedangFoto] = useState(false);
  const inputFotoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getAnggotaGrup();
        if (hidup) setAnggota(hasil);
      } catch {
        if (hidup) setAnggota([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function simpanNama() {
    const nama = namaBaru.trim();
    if (sedangSimpan || nama === namaTampil) return;
    setSedangSimpan(true);
    try {
      const hasil = await ubahInfoGrup({ nama });
      toast("sukses", "Nama grup diganti", hasil.nama_grup);
      onBerubah(hasil.nama_grup, "");
    } catch (e) {
      toast("error", "Gagal mengganti nama", e instanceof Error ? e.message : "");
    } finally {
      setSedangSimpan(false);
    }
  }

  async function gantiFoto(file: File | null) {
    if (!file || sedangFoto) return;
    setSedangFoto(true);
    try {
      const foto = await kompresGambar(file, 100);
      const hasil = await ubahInfoGrup({ foto });
      toast("sukses", "Foto grup diganti");
      onBerubah(hasil.nama_grup, hasil.foto_grup);
    } catch (e) {
      toast("error", "Gagal mengganti foto", e instanceof Error ? e.message : "");
    } finally {
      setSedangFoto(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Info grup ${namaTampil}`}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
      <div className="glass-strong relative mx-auto flex max-h-[85dvh] w-full max-w-[440px] flex-col rounded-t-[2rem] px-5 pt-3 pb-8">
        <div className="mb-3 flex shrink-0 justify-center">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>

        {/* Identitas grup */}
        <div className="flex shrink-0 flex-col items-center">
          <div className="relative">
            {fotoTampil ? (
              <FotoBulat src={fotoTampil} ukuran={76} />
            ) : (
              <span
                className="flex h-[76px] w-[76px] items-center justify-center rounded-full text-white"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                aria-hidden="true"
              >
                <Users className="h-8 w-8" />
              </span>
            )}
            {bolehUbah && (
              <>
                <input
                  ref={inputFotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-label="Pilih foto grup"
                  onChange={(e) => {
                    void gantiFoto(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => inputFotoRef.current?.click()}
                  disabled={sedangFoto}
                  aria-label="Ganti foto grup"
                  className="btn-tekan absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                >
                  {sedangFoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                </button>
              </>
            )}
          </div>
          <p className="mt-2 font-heading text-base font-bold text-teks-utama">{namaTampil}</p>
          <p className="text-[11px] text-teks-sekunder">Grup resmi {divisi}</p>
        </div>

        {/* Kustom nama (kepala divisi) */}
        {bolehUbah && (
          <div className="mt-3 flex shrink-0 gap-2">
            <input
              value={namaBaru}
              onChange={(e) => setNamaBaru(e.target.value.slice(0, 60))}
              placeholder="Nama grup…"
              aria-label="Nama grup"
              className="glass h-10 min-w-0 flex-1 rounded-xl px-3.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void simpanNama()}
              disabled={sedangSimpan || namaBaru.trim() === namaTampil}
              className="btn-tekan rounded-xl px-3.5 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            >
              {sedangSimpan ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan"}
            </button>
          </div>
        )}

        {/* Daftar anggota */}
        <p className="mt-4 mb-1.5 shrink-0 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
          Anggota {anggota ? `(${anggota.length})` : ""}
        </p>
        <div className="scrollbar-tipis flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {anggota === null ? (
            <p className="py-4 text-center text-xs text-teks-sekunder">Memuat…</p>
          ) : anggota.length === 0 ? (
            <p className="py-4 text-center text-xs text-teks-sekunder">Belum ada anggota.</p>
          ) : (
            anggota.map((a) => (
              <div key={a.id} className="glass-soft flex items-center gap-2.5 rounded-xl px-2.5 py-2">
                {a.avatar_url ? (
                  <FotoBulat src={a.avatar_url} ukuran={32} />
                ) : (
                  <AvatarInisial nama={a.nama} ukuran={32} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-teks-utama">{a.nama}</p>
                  {a.jabatan && (
                    <p className="truncate text-[10px] text-teks-sekunder">{a.jabatan}</p>
                  )}
                </div>
                {a.kepala && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
                  >
                    Kepala Divisi
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
