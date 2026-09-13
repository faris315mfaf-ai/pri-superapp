"use client";

// ============================================================
// PanelVideoWajib (12 Sep 2026) — perintah video untuk seluruh anggota.
//
// Dipasang PALING ATAS di modul TV Rakyat setiap anggota, di atas
// laporan dan statistik. Alasannya sederhana: ini perintah kerja, dan
// perintah kerja mendahului laporan hasil kerja. Ditaruh di bawah, ia
// akan terlewat justru oleh orang yang paling perlu membacanya.
//
// Satu panel dipakai dua pihak:
//   • Anggota biasa — membaca perintah & mengunduh bahan mentahnya.
//   • Yang berwenang — menambah, mematikan, menghapus perintah.
// Servernya yang memutuskan siapa yang mana (flag `boleh`), bukan
// tampilannya; jadi tombol yang muncul selalu sama dengan yang benar-
// benar diizinkan.
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Download,
  FileVideo,
  Loader2,
  Plus,
  Power,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import {
  getKeywordWajib,
  kategoriBolehDipilih,
  getVideoWajib,
  hapusVideoWajib,
  siapkanUnggahVideoWajib,
  tambahKeyword,
  tambahVideoWajib,
  toggleVideoWajib,
  type BerkasVideoWajib,
  type KeywordWajib,
  type VideoWajib,
} from "@/services";
import { unggahKeUrlTanda } from "@/lib/unggah-video-klien";
import { cn } from "@/lib/utils";

function mb(byte: number): string {
  return `${Math.max(1, Math.round(byte / 1048576))} MB`;
}

export function PanelVideoWajib() {
  const [data, setData] = useState<VideoWajib[] | null>(null);
  const [boleh, setBoleh] = useState(false);
  const [kategori, setKategori] = useState<KeywordWajib[]>([]);
  const [formBuka, setFormBuka] = useState(false);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [muat, setMuat] = useState(0);

  // Isi form
  const [judul, setJudul] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [link, setLink] = useState("");
  // 13 Sep 2026: bahan video DIUNGGAH di sini (pengganti Request Video).
  const [sumber, setSumber] = useState("");
  const [berkas, setBerkas] = useState<File | null>(null);
  const [progres, setProgres] = useState<number | null>(null);
  const inputBerkas = useRef<HTMLInputElement>(null);
  const [kat, setKat] = useState("");
  const [batas, setBatas] = useState("");
  // Kategori baru diketik di sini juga — tanpa harus pergi ke seksi lain
  // lalu kembali. Setelah tersimpan, langsung terpilih di dropdown.
  const [katBaru, setKatBaru] = useState("");
  const [sibukKat, setSibukKat] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getVideoWajib();
        if (!hidup) return;
        setData(d.data);
        setBoleh(d.boleh);
        if (d.boleh) {
          // Daftar kategori hanya dibutuhkan yang membuat perintah.
          try {
            const k = await getKeywordWajib();
            if (hidup) setKategori(k.data.filter(kategoriBolehDipilih));
          } catch {
            // Kategori gagal dimuat bukan alasan panelnya ikut gagal.
          }
        }
      } catch (e) {
        if (!hidup) return;
        setData([]);
        toast("error", "Gagal memuat video wajib", e instanceof Error ? e.message : "");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muat]);

  async function tambahKategori() {
    const nama = katBaru.trim();
    if (nama.length < 2) {
      toast("peringatan", "Nama kategori minimal 2 huruf");
      return;
    }
    setSibukKat(true);
    try {
      await tambahKeyword(nama);
      const k = await getKeywordWajib();
      setKategori(k.data.filter(kategoriBolehDipilih));
      setKat(nama);
      setKatBaru("");
      toast("sukses", `Kategori "${nama}" ditambahkan`);
    } catch (e) {
      toast("error", "Gagal menambah kategori", e instanceof Error ? e.message : "");
    } finally {
      setSibukKat(false);
    }
  }

  async function simpan() {
    if (judul.trim().length < 3) {
      toast("peringatan", "Judul perintah minimal 3 huruf");
      return;
    }
    setSibuk("baru");
    try {
      // Berkas naik DULU, barisnya menyusul: perintah tanpa bahannya
      // (karena unggahan putus di tengah) lebih menyesatkan daripada
      // tidak ada perintah sama sekali.
      let berkasSiap: BerkasVideoWajib | null = null;
      if (berkas) {
        setProgres(0);
        const s = await siapkanUnggahVideoWajib(berkas.name, berkas.size);
        await unggahKeUrlTanda(s.url, berkas, setProgres);
        berkasSiap = { cara: s.cara, key: s.key, nama: berkas.name, ukuran: berkas.size };
      }
      await tambahVideoWajib({
        judul: judul.trim(),
        keterangan: keterangan.trim(),
        link_doksli: link.trim(),
        sumber_video: sumber.trim(),
        kategori: kat,
        batas_waktu: batas,
        berkas: berkasSiap,
      });
      setJudul("");
      setKeterangan("");
      setLink("");
      setSumber("");
      setBerkas(null);
      if (inputBerkas.current) inputBerkas.current.value = "";
      setKat("");
      setBatas("");
      setFormBuka(false);
      setMuat((n) => n + 1);
      toast("sukses", "Video wajib ditambahkan", "Muncul di modul TV Rakyat semua anggota.");
    } catch (e) {
      toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
      setProgres(null);
    }
  }

  async function ubahAktif(v: VideoWajib) {
    setSibuk(v.id);
    try {
      await toggleVideoWajib(v.id, !v.aktif);
      setMuat((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal mengubah", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
    }
  }

  async function hapus(v: VideoWajib) {
    setSibuk(v.id);
    try {
      await hapusVideoWajib(v.id);
      setMuat((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
    }
  }

  // Anggota biasa tanpa perintah aktif: panel tidak perlu hadir sama
  // sekali. Kartu kosong bertuliskan "belum ada" hanya menambah satu
  // benda lagi yang harus dilewati setiap hari.
  if (data !== null && data.length === 0 && !boleh) return null;

  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          aria-hidden="true"
        >
          <Video className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[15px] font-bold text-teks-utama">Video Wajib</p>
          <p className="mt-0.5 text-[11px] text-teks-sekunder">
            Perintah video dari tim TV Rakyat — unduh bahannya, buat videonya.
          </p>
        </div>
        {boleh && (
          <button
            type="button"
            onClick={() => setFormBuka((v) => !v)}
            className="btn-tekan flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {formBuka ? "Tutup" : "Tambah"}
          </button>
        )}
      </div>

      {boleh && formBuka && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-glass-border p-3">
          <input
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            placeholder="Judul perintah (mis. Liputan Bansos)"
            className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
          />
          <textarea
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            placeholder="Keterangan: apa yang harus dibuat, gaya videonya, dll."
            rows={3}
            className="glass-input w-full rounded-xl px-3 py-2 text-sm text-teks-utama"
          />
          {/* Bahan video: unggah berkasnya ke SuperApp — kreator mengunduh
              dari sini, bukan dari tautan luar yang bisa mati. */}
          <input
            ref={inputBerkas}
            type="file"
            accept="video/mp4,video/quicktime,video/x-m4v,video/webm,.mp4,.mov,.m4v,.webm"
            className="hidden"
            aria-label="Pilih berkas video bahan"
            onChange={(e) => setBerkas(e.target.files?.[0] ?? null)}
          />
          <div className="glass-input flex h-10 items-center gap-2 rounded-xl px-3 text-[12.5px]">
            <FileVideo className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />
            <button
              type="button"
              onClick={() => inputBerkas.current?.click()}
              disabled={sibuk === "baru"}
              className="min-w-0 flex-1 truncate text-left text-teks-utama disabled:opacity-60"
            >
              {berkas ? `${berkas.name} · ${mb(berkas.size)}` : "Unggah video bahan (opsional)"}
            </button>
            {berkas && sibuk !== "baru" && (
              <button
                type="button"
                onClick={() => {
                  setBerkas(null);
                  if (inputBerkas.current) inputBerkas.current.value = "";
                }}
                aria-label="Batalkan berkas"
                className="btn-tekan p-1 text-teks-sekunder"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          {progres !== null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-teks-sekunder/15" aria-hidden="true">
              <div
                className="h-full rounded-full bg-pri transition-[width] duration-200 ease-out"
                style={{ width: `${progres}%` }}
              />
            </div>
          )}
          <input
            value={sumber}
            onChange={(e) => setSumber(e.target.value)}
            placeholder="Sumber video (mis. Doksli DPP, Kompas TV)"
            aria-label="Sumber video"
            className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
          />
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Link bahan tambahan (https://…) — opsional"
            inputMode="url"
            className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-teks-sekunder">
                Kategori
              </span>
              <select
                value={kat}
                onChange={(e) => setKat(e.target.value)}
                className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
              >
                <option value="">— pilih kategori —</option>
                {kategori.map((k) => (
                  <option key={k.id} value={k.keyword}>
                    {k.keyword}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-teks-sekunder">
                Batas waktu (opsional)
              </span>
              <input
                type="date"
                value={batas}
                onChange={(e) => setBatas(e.target.value)}
                className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <input
              value={katBaru}
              onChange={(e) => setKatBaru(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void tambahKategori();
                }
              }}
              placeholder="Kategori baru (mis. Bansos)"
              aria-label="Kategori baru"
              className="glass-input h-10 min-w-0 flex-1 rounded-xl px-3 text-sm text-teks-utama"
            />
            <button
              type="button"
              onClick={() => void tambahKategori()}
              disabled={sibukKat}
              className="glass btn-tekan flex h-10 shrink-0 items-center gap-1 rounded-xl px-3 text-[12px] font-bold text-teks-utama disabled:opacity-60"
            >
              {sibukKat ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Kategori
            </button>
          </div>
          <button
            type="button"
            onClick={() => void simpan()}
            disabled={sibuk === "baru"}
            className="btn-tekan flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {sibuk === "baru" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {sibuk === "baru" && progres !== null && progres < 100
              ? `Mengunggah ${progres}%…`
              : "Terbitkan Perintah"}
          </button>
        </div>
      )}

      {data === null ? (
        <div className="mt-3 flex flex-col gap-2">
          <GlassSkeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : data.length === 0 ? (
        <p className="mt-3 text-[11.5px] text-teks-sekunder">
          Belum ada perintah video. Tekan &ldquo;Tambah&rdquo; untuk membuat yang pertama.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {data.map((v) => (
            <li
              key={v.id}
              className={cn(
                "glass-soft rounded-xl p-3",
                !v.aktif && "opacity-55",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-teks-utama">{v.judul}</p>
                  {v.keterangan && (
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-teks-sekunder">
                      {v.keterangan}
                    </p>
                  )}
                  {v.sumber_video && (
                    <p className="mt-1 text-[11px] text-teks-sekunder">
                      Sumber: <b className="font-semibold text-teks-utama">{v.sumber_video}</b>
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {v.kategori && (
                      <span className="glass rounded-full px-2 py-0.5 text-[10px] font-bold text-teks-utama">
                        {v.kategori}
                      </span>
                    )}
                    {v.batas_waktu && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-teks-sekunder">
                        <CalendarDays className="h-3 w-3" aria-hidden="true" />
                        {v.batas_waktu}
                      </span>
                    )}
                    {!v.aktif && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-teks-sekunder">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        dimatikan
                      </span>
                    )}
                  </div>
                </div>
                {boleh && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void ubahAktif(v)}
                      disabled={sibuk === v.id}
                      aria-label={v.aktif ? "Matikan perintah" : "Nyalakan perintah"}
                      className="glass btn-tekan flex h-7 w-7 items-center justify-center rounded-full text-teks-utama disabled:opacity-50"
                    >
                      <Power className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void hapus(v)}
                      disabled={sibuk === v.id}
                      aria-label="Hapus perintah"
                      className="glass btn-tekan flex h-7 w-7 items-center justify-center rounded-full text-[#DC2626] disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
              {v.berkas_url && (
                <a
                  href={v.berkas_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={v.berkas_nama || undefined}
                  className="btn-tekan mt-2 flex items-center justify-center gap-2 rounded-xl py-2 text-[12.5px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Unduh Video Bahan{v.berkas_ukuran > 0 ? ` · ${mb(v.berkas_ukuran)}` : ""}
                </a>
              )}
              {v.link_doksli && (
                <a
                  href={v.link_doksli}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "btn-tekan mt-2 flex items-center justify-center gap-2 rounded-xl py-2 text-[12.5px] font-bold",
                    v.berkas_url ? "glass text-teks-utama" : "text-white",
                  )}
                  style={v.berkas_url ? undefined : { background: "linear-gradient(135deg, #10B981, #059669)" }}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {v.berkas_url ? "Link Bahan Tambahan" : "Unduh Bahan Video"}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
