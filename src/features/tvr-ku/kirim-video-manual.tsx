"use client";

// ============================================================
// KirimVideoManual — anggota mengunggah video hasil edit sendiri.
//
// Alur: pilih berkas → peramban mengunggah LANGSUNG ke Cloudinary
// (unsigned preset; server hanya memberi konfigurasinya) → server
// mencatatnya sebagai antrean "MENUNGGU ACC" → Pimpinan Redaksi
// menyetujui/menolak dari modul TV Rakyat → yang lolos masuk kolom
// siap upload.
//
// Kenapa langsung ke Cloudinary: badan permintaan fungsi Vercel
// dibatasi ±4,5 MB, sedangkan video edit puluhan MB. Media juga
// DIHAPUS PERMANEN 2 hari setelah unggah supaya penyimpanan tidak
// membengkak — ini dijelaskan terang-terangan di layarnya.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Film, UploadCloud, XCircle } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FadeInUp, GlassSkeleton, SectionTitle, StatusBadge } from "@/components/pri-ui";
import { toast, useAppStore } from "@/hooks/use-app-store";
import {
  daftarkanVideoManual,
  getKirimanManual,
  getKonfigUploadVideo,
  getTugasLink,
  type KirimanManual,
  type TugasLink,
} from "@/services";
import { jamWIB, tanggalIndonesia } from "@/lib/format";

// Cadangan bila konfigurasi server belum termuat — batas sebenarnya
// diatur Pimred (1-200 MB, fitur 1.20/6) dan dibaca saat kartu tampil.
const MAKS_UKURAN_MB_BAWAAN = 100;

// Riwayat Log ditampilkan maks 5 per layar + nomor halaman (fitur 1.22.x)
// supaya daftar panjang (puluhan video "siap ditinjau") tidak memenuhi layar.
const PER_HAL = 5;

function badgeStatus(k: KirimanManual) {
  if (k.status === "SUDAH DIPROSES") return <StatusBadge label="sudah tayang" warna="hijau" />;
  if (k.persetujuan === "ditolak") return <StatusBadge label="ditolak" warna="merah" />;
  if (k.persetujuan === "disetujui") return <StatusBadge label="siap upload" warna="biru" />;
  return <StatusBadge label="menunggu ACC" warna="kuning" />;
}

export function KirimVideoManual({
  hanyaBilaAdaTugas = false,
  judulSeksi = "Kirim Video Hasil Edit",
}: {
  /** true (TVR Saya): kartu hanya tampil bila anggota punya tugas link terbuka. */
  hanyaBilaAdaTugas?: boolean;
  /** Judul seksi — di TV Rakyat Official dipakai "Log" (fitur 1.22.x). */
  judulSeksi?: string;
}) {
  const [daftar, setDaftar] = useState<KirimanManual[] | null>(null);
  const [halaman, setHalaman] = useState(1);
  const [muatUlang, setMuatUlang] = useState(0);
  const [persen, setPersen] = useState<number | null>(null);
  const [judul, setJudul] = useState("");
  // Batas ukuran dari Pimred — dimuat sekali supaya label & penolakan
  // dini memakai angka yang sama dengan server.
  const [batasMb, setBatasMb] = useState(MAKS_UKURAN_MB_BAWAAN);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const idKu = useAppStore((s) => s.user?.id);

  // Tugas link terbuka MILIK SAYA — server mewajibkan unggahan
  // ditautkan ke salah satunya bila ada.
  const [tugasSaya, setTugasSaya] = useState<TugasLink[]>([]);
  const [tugasId, setTugasId] = useState("");
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const semua = await getTugasLink();
        if (!hidup) return;
        setTugasSaya(
          semua.filter(
            (t) =>
              t.untuk_user_id === idKu &&
              (t.status === "baru" || t.status === "dikerjakan"),
          ),
        );
      } catch {
        // Gagal memuat tugas: server tetap menjaga kewajibannya.
      }
    })();
    return () => {
      hidup = false;
    };
  }, [idKu, muatUlang]);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getKirimanManual();
        if (hidup) setDaftar(hasil.data);
      } catch {
        if (hidup) setDaftar([]);
      }
      // Ambil batas ukuran terkini (fitur 1.20/6) — gagal = tetap
      // pakai bawaan, server toh menegakkannya lagi.
      try {
        const konfig = await getKonfigUploadVideo();
        if (hidup && konfig.maks_upload_mb) setBatasMb(konfig.maks_upload_mb);
      } catch {
        // Konfigurasi menyusul saat tombol unggah ditekan.
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  async function unggah(berkas: File) {
    if (berkas.size > batasMb * 1024 * 1024) {
      toast(
        "peringatan",
        "Video terlalu besar",
        `Berkas ${(berkas.size / 1024 / 1024).toFixed(1)} MB — batas dari Pimred ${batasMb} MB.`,
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (tugasSaya.length > 0 && !tugasId) {
      toast(
        "peringatan",
        "Pilih tugasnya dulu",
        "Anda punya tugas link dari Pimred — tautkan video ini ke salah satunya.",
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setPersen(0);
    try {
      const konfig = await getKonfigUploadVideo();
      // Batas terbaru dari server menang atas yang tersimpan di layar.
      if (konfig.maks_upload_mb && berkas.size > konfig.maks_upload_mb * 1024 * 1024) {
        setBatasMb(konfig.maks_upload_mb);
        throw new Error(
          `Berkas melebihi batas ${konfig.maks_upload_mb} MB yang ditetapkan Pimred.`,
        );
      }

      // Unggah langsung peramban → Cloudinary dengan progres nyata.
      const hasilUpload = await new Promise<{ secure_url: string; public_id: string; bytes?: number }>(
        (selesai, gagal) => {
          const bentuk = new FormData();
          bentuk.append("file", berkas);
          bentuk.append("upload_preset", konfig.uploadPreset);
          bentuk.append("resource_type", "video");

          const xhr = new XMLHttpRequest();
          xhr.open(
            "POST",
            `https://api.cloudinary.com/v1_1/${konfig.cloudName}/video/upload`,
          );
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setPersen(Math.round((100 * ev.loaded) / ev.total));
          };
          xhr.onload = () => {
            try {
              const json = JSON.parse(xhr.responseText) as {
                secure_url?: string;
                public_id?: string;
                bytes?: number;
                error?: { message?: string };
              };
              if (xhr.status >= 200 && xhr.status < 300 && json.secure_url && json.public_id) {
                selesai({
                  secure_url: json.secure_url,
                  public_id: json.public_id,
                  bytes: json.bytes,
                });
              } else {
                gagal(new Error(json.error?.message ?? "Penyimpanan menolak video ini."));
              }
            } catch {
              gagal(new Error("Balasan penyimpanan tidak terbaca."));
            }
          };
          xhr.onerror = () => gagal(new Error("Koneksi terputus saat mengunggah."));
          xhr.send(bentuk);
        },
      );

      await daftarkanVideoManual({
        secure_url: hasilUpload.secure_url,
        public_id: hasilUpload.public_id,
        judul: judul.trim() || undefined,
        tugas_id: tugasId || undefined,
        bytes: hasilUpload.bytes ?? berkas.size,
      });

      toast(
        "sukses",
        "Video terkirim",
        "Menunggu persetujuan Pimpinan Redaksi. Anda akan diberi tahu hasilnya.",
      );
      setJudul("");
      setTugasId("");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal mengunggah", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setPersen(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Mode TVR Saya: tanpa tugas terbuka, kartu ini tidak perlu tampil.
  if (hanyaBilaAdaTugas && tugasSaya.length === 0) return null;

  // Paginasi Log: maks 5 per halaman + nomor halaman.
  const daftarAman = daftar ?? [];
  const totalHal = Math.max(1, Math.ceil(daftarAman.length / PER_HAL));
  const halAman = Math.min(halaman, totalHal);
  const tampilRiwayat = daftarAman.slice((halAman - 1) * PER_HAL, halAman * PER_HAL);

  return (
    <FadeInUp delay={0.18}>
      <SectionTitle judul={judulSeksi} className="mt-6" />
      <GlassCard className="p-4">
        <p className="text-xs leading-relaxed text-teks-sekunder">
          Unggah video yang sudah Anda edit untuk ditayangkan lewat TV Rakyat.
          Video masuk antrean <b>persetujuan Pimpinan Redaksi</b> dulu; yang
          disetujui pindah ke kolom siap upload. Berkas mentahnya dihapus
          otomatis dari penyimpanan <b>2 hari</b> setelah unggah.
        </p>

        {/* Wajib memilih tugas bila ada tugas link terbuka */}
        {tugasSaya.length > 0 && (
          <select
            value={tugasId}
            onChange={(e) => setTugasId(e.target.value)}
            aria-label="Tugas link yang dikerjakan"
            className="glass mt-3 w-full rounded-xl px-3.5 py-2.5 text-sm text-teks-utama focus:outline-none"
          >
            <option value="">— Pilih tugas dari Pimred (wajib) —</option>
            {tugasSaya.map((t) => (
              <option key={t.id} value={t.id}>
                {t.judul || t.url}
              </option>
            ))}
          </select>
        )}

        <input
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          maxLength={60}
          placeholder="Judul video (opsional)…"
          className="glass mt-3 w-full rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />

        {persen !== null ? (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs font-semibold text-teks-sekunder">
              <span>Mengunggah…</span>
              <span className="angka-tab">{persen}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${persen}%`,
                  background: "linear-gradient(90deg, #DC2626, #F59E0B)",
                }}
              />
            </div>
          </div>
        ) : (
          <label className="btn-tekan mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3 font-heading text-sm font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
            }}
          >
            <UploadCloud className="h-4.5 w-4.5" aria-hidden="true" />
            Pilih Video (maks {batasMb} MB)
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const berkas = e.target.files?.[0];
                if (berkas) void unggah(berkas);
              }}
            />
          </label>
        )}
      </GlassCard>

      {/* Riwayat kiriman — maks 5 per halaman */}
      {daftar === null ? (
        <GlassSkeleton className="mt-2 h-16 rounded-2xl" />
      ) : daftar.length > 0 ? (
        <div className="mt-2">
          <div className="flex flex-col gap-2">
          {tampilRiwayat.map((k) => (
            <GlassCard key={k.kode} className="flex items-center gap-3 p-3">
              {k.thumbnail_url ? (
                <img src={k.thumbnail_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/10 dark:bg-white/10">
                  <Film className="h-5 w-5 text-teks-sekunder" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-teks-utama">{k.judul}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-teks-sekunder">
                  {k.status === "SUDAH DIPROSES" ? (
                    <CheckCircle2 className="h-3 w-3 text-sukses" aria-hidden="true" />
                  ) : k.persetujuan === "ditolak" ? (
                    <XCircle className="h-3 w-3 text-gagal" aria-hidden="true" />
                  ) : (
                    <Clock className="h-3 w-3" aria-hidden="true" />
                  )}
                  {tanggalIndonesia(k.jam_tanggal)} · {jamWIB(k.jam_tanggal)}
                  {k.persetujuan === "disetujui" && k.persetujuan_oleh
                    ? ` · ACC ${k.persetujuan_oleh}`
                    : ""}
                  {!k.media_masih_ada && k.persetujuan !== "ditolak"
                    ? " · media sudah dihapus (lewat 2 hari)"
                    : ""}
                </p>
              </div>
              {badgeStatus(k)}
            </GlassCard>
          ))}
          </div>
          {totalHal > 1 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              {Array.from({ length: totalHal }).map((_, i) => {
                const n = i + 1;
                const aktif = n === halAman;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setHalaman(n)}
                    aria-current={aktif ? "page" : undefined}
                    className={`btn-tekan angka-tab flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[12.5px] font-bold ${
                      aktif ? "text-white" : "glass text-teks-sekunder"
                    }`}
                    style={
                      aktif
                        ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                        : undefined
                    }
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </FadeInUp>
  );
}
