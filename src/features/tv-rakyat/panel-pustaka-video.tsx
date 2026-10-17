"use client";

// ============================================================
// PanelPustakaVideo (17 Okt 2026) — Pustaka Video untuk PENGELOLA TV Rakyat.
//
// Tim TV Rakyat mengunggah video jadi ke sini; seluruh anggota lalu bisa
// memostingnya langsung ke sosmed pribadinya dari TV Rakyat Saya ›
// Video Internal › Pustaka — tanpa mengunduh lalu mengunggah ulang.
//
// Hanya tampil bila server menyatakan akun ini boleh mengelola (`boleh`),
// pola yang sama dengan panel Video Wajib: tombol yang muncul selalu sama
// dengan yang benar-benar diizinkan server.
// Unggah: berkas naik DULU lewat URL bertanda tangan (R2 / bucket Supabase),
// baris Pustaka menyusul — sama dengan bahan Video Wajib.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { FileVideo, Library, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { SwitchKaca } from "@/features/profil/switch-kaca";
import { toast } from "@/hooks/use-app-store";
import { unggahKeUrlTanda } from "@/lib/unggah-video-klien";
import { cn } from "@/lib/utils";
import {
  getKeywordWajib,
  getPustakaVideo,
  hapusPustakaVideo,
  kategoriBolehDipilih,
  siapkanPustakaVideo,
  simpanPustakaVideo,
  ubahPustakaVideo,
  type ItemPustakaVideo,
  type KeywordWajib,
} from "@/services";

function mb(byte: number): string {
  return `${Math.max(1, Math.round(byte / 1048576))} MB`;
}

function tanggal(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" });
}

export function PanelPustakaVideo() {
  const [item, setItem] = useState<ItemPustakaVideo[] | null>(null);
  const [boleh, setBoleh] = useState(false);
  const [perluSql, setPerluSql] = useState(false);
  const [kategori, setKategori] = useState<KeywordWajib[]>([]);
  const [muat, setMuat] = useState(0);
  const [formBuka, setFormBuka] = useState(false);
  // "baru" = sedang mengunggah; id = baris yang sedang diubah/dihapus.
  const [sibuk, setSibuk] = useState<string | null>(null);

  // Isi form unggah
  const [judul, setJudul] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [kat, setKat] = useState("");
  const [berkas, setBerkas] = useState<File | null>(null);
  const [progres, setProgres] = useState<number | null>(null);
  const inputBerkas = useRef<HTMLInputElement>(null);

  // Sunting & hapus (konfirmasi di dalam kartu, tanpa window.confirm)
  const [suntingId, setSuntingId] = useState<string | null>(null);
  const [sunting, setSunting] = useState({ judul: "", keterangan: "", kategori: "" });
  const [hapusId, setHapusId] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getPustakaVideo();
        if (!hidup) return;
        setItem(d.item);
        setBoleh(d.boleh);
        setPerluSql(d.perlu_sql);
        if (d.boleh) {
          try {
            const k = await getKeywordWajib();
            if (hidup) setKategori(k.data.filter(kategoriBolehDipilih));
          } catch {
            // Kategori gagal dimuat bukan alasan panelnya ikut gagal.
          }
        }
      } catch {
        // Bukan pengelola (atau server menolak): panel cukup tidak tampil.
        if (!hidup) return;
        setItem([]);
        setBoleh(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muat]);

  function bersihkanForm() {
    setJudul("");
    setKeterangan("");
    setKat("");
    setBerkas(null);
    if (inputBerkas.current) inputBerkas.current.value = "";
  }

  async function simpan() {
    if (sibuk === "baru") return;
    if (!berkas) {
      toast("peringatan", "Pilih berkas video dulu");
      return;
    }
    if (judul.trim().length < 3) {
      toast("peringatan", "Judul minimal 3 huruf");
      return;
    }
    if (!kat) {
      toast("peringatan", "Pilih kategori dulu", "Kategori ikut terbawa saat anggota memposting video ini.");
      return;
    }
    setSibuk("baru");
    try {
      // Berkas naik DULU, barisnya menyusul: baris tanpa berkas (unggahan
      // putus di tengah) akan muncul di pemilih anggota tetapi gagal diposting.
      setProgres(0);
      const s = await siapkanPustakaVideo(berkas.name, berkas.size);
      await unggahKeUrlTanda(s.url, berkas, setProgres);
      await simpanPustakaVideo({
        judul: judul.trim(),
        keterangan: keterangan.trim(),
        kategori: kat,
        berkas_cara: s.cara,
        berkas_key: s.key,
        berkas_nama: berkas.name,
        berkas_ukuran: berkas.size,
      });
      bersihkanForm();
      setFormBuka(false);
      setMuat((n) => n + 1);
      toast("sukses", "Masuk Pustaka", "Anggota bisa memostingnya dari TV Rakyat Saya › Video Internal.");
    } catch (e) {
      toast("error", "Gagal menyimpan ke Pustaka", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
      setProgres(null);
    }
  }

  async function ubahAktif(v: ItemPustakaVideo) {
    setSibuk(v.id);
    try {
      await ubahPustakaVideo(v.id, { aktif: !v.aktif });
      setItem((l) => (l ?? []).map((x) => (x.id === v.id ? { ...x, aktif: !v.aktif } : x)));
    } catch (e) {
      toast("error", "Gagal mengubah", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
    }
  }

  function mulaiSunting(v: ItemPustakaVideo) {
    setHapusId(null);
    setSuntingId(v.id);
    setSunting({ judul: v.judul, keterangan: v.keterangan ?? "", kategori: v.kategori ?? "" });
  }

  async function simpanSunting(v: ItemPustakaVideo) {
    if (sunting.judul.trim().length < 3) {
      toast("peringatan", "Judul minimal 3 huruf");
      return;
    }
    setSibuk(v.id);
    try {
      const ubah = {
        judul: sunting.judul.trim(),
        keterangan: sunting.keterangan.trim(),
        ...(sunting.kategori ? { kategori: sunting.kategori } : {}),
      };
      await ubahPustakaVideo(v.id, ubah);
      setItem((l) => (l ?? []).map((x) => (x.id === v.id ? { ...x, ...ubah } : x)));
      setSuntingId(null);
      toast("sukses", "Perubahan tersimpan");
    } catch (e) {
      toast("error", "Gagal menyimpan perubahan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
    }
  }

  async function hapus(v: ItemPustakaVideo) {
    setSibuk(v.id);
    try {
      await hapusPustakaVideo(v.id);
      setItem((l) => (l ?? []).filter((x) => x.id !== v.id));
      setHapusId(null);
      toast("sukses", "Video dihapus dari Pustaka");
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
    }
  }

  // Bukan pengelola: panel tidak hadir sama sekali (anggota memilih video
  // Pustaka dari TV Rakyat Saya, bukan dari sini).
  if (item !== null && !boleh) return null;

  // Kategori lama yang sudah tidak aktif tetap bisa terpilih saat menyunting.
  const opsiKategori = (sekarang: string) => {
    const daftar = kategori.map((k) => k.keyword);
    return sekarang && !daftar.includes(sekarang) ? [sekarang, ...daftar] : daftar;
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #0F766E, #115E59)" }}
          aria-hidden="true"
        >
          <Library className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[15px] font-bold text-teks-utama">Pustaka Video</p>
          <p className="mt-0.5 text-[11px] text-teks-sekunder">
            Video jadi untuk diposting anggota langsung ke sosmednya (TV Rakyat Saya › Video Internal).
          </p>
        </div>
        {item !== null && (
          <button
            type="button"
            onClick={() => setFormBuka((v) => !v)}
            aria-expanded={formBuka}
            className="btn-tekan flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #0F766E, #115E59)" }}
          >
            {formBuka ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            {formBuka ? "Tutup" : "Tambah"}
          </button>
        )}
      </div>

      {perluSql && (
        <p className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[11.5px] leading-relaxed text-teks-utama" role="status">
          Tabel Pustaka Video belum ada di database — jalankan <b>sql/83_pustaka_video.sql</b> dulu.
        </p>
      )}

      {formBuka && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-glass-border p-3">
          <input
            ref={inputBerkas}
            type="file"
            accept="video/mp4,video/quicktime,video/x-m4v,video/webm,.mp4,.mov,.m4v,.webm"
            className="hidden"
            aria-label="Pilih berkas video Pustaka"
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
              {berkas ? `${berkas.name} · ${mb(berkas.size)}` : "Pilih berkas video (MP4/MOV/WebM)"}
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
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-teks-sekunder/15"
              role="progressbar"
              aria-label="Kemajuan unggah"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progres}
            >
              <div
                className="h-full rounded-full bg-pri transition-[width] duration-200 ease-out"
                style={{ width: `${progres}%` }}
              />
            </div>
          )}
          <input
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            maxLength={100}
            placeholder="Judul video (jadi judul postingan anggota)"
            aria-label="Judul video"
            disabled={sibuk === "baru"}
            className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
          />
          <textarea
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            maxLength={2200}
            rows={3}
            placeholder="Keterangan / caption usulan (opsional)"
            aria-label="Keterangan video"
            disabled={sibuk === "baru"}
            className="glass-input w-full rounded-xl px-3 py-2 text-sm text-teks-utama"
          />
          <select
            value={kat}
            onChange={(e) => setKat(e.target.value)}
            disabled={sibuk === "baru"}
            aria-label="Kategori video"
            className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
          >
            <option value="">— pilih kategori —</option>
            {kategori.map((k) => (
              <option key={k.id} value={k.keyword}>
                {k.keyword}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void simpan()}
            disabled={sibuk === "baru"}
            className="btn-tekan flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #0F766E, #115E59)" }}
          >
            {sibuk === "baru" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {sibuk === "baru" ? (progres !== null && progres < 100 ? `Mengunggah ${progres}%…` : "Menyimpan…") : "Simpan ke Pustaka"}
          </button>
        </div>
      )}

      {item === null ? (
        <div className="mt-3 flex flex-col gap-2">
          <GlassSkeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : item.length === 0 ? (
        <p className="mt-3 text-[11.5px] text-teks-sekunder">
          Pustaka masih kosong. Tekan &ldquo;Tambah&rdquo; untuk mengunggah video pertama.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {item.map((v) => {
            const menyunting = suntingId === v.id;
            const konfirmasiHapus = hapusId === v.id;
            const sibukIni = sibuk === v.id;
            return (
              <li key={v.id} className={cn("glass-soft rounded-xl p-3", !v.aktif && !menyunting && "opacity-60")}>
                {menyunting ? (
                  <div className="flex flex-col gap-2">
                    <input
                      value={sunting.judul}
                      onChange={(e) => setSunting((s) => ({ ...s, judul: e.target.value }))}
                      maxLength={100}
                      aria-label="Ubah judul"
                      disabled={sibukIni}
                      className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
                    />
                    <textarea
                      value={sunting.keterangan}
                      onChange={(e) => setSunting((s) => ({ ...s, keterangan: e.target.value }))}
                      maxLength={2200}
                      rows={3}
                      aria-label="Ubah keterangan"
                      disabled={sibukIni}
                      className="glass-input w-full rounded-xl px-3 py-2 text-sm text-teks-utama"
                    />
                    <select
                      value={sunting.kategori}
                      onChange={(e) => setSunting((s) => ({ ...s, kategori: e.target.value }))}
                      aria-label="Ubah kategori"
                      disabled={sibukIni}
                      className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
                    >
                      <option value="">— pilih kategori —</option>
                      {opsiKategori(sunting.kategori).map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSuntingId(null)}
                        disabled={sibukIni}
                        className="glass btn-tekan h-9 flex-1 rounded-xl text-[12px] font-bold text-teks-utama disabled:opacity-60"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => void simpanSunting(v)}
                        disabled={sibukIni}
                        className="btn-tekan flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-60"
                        style={{ background: "linear-gradient(135deg, #0F766E, #115E59)" }}
                      >
                        {sibukIni && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                        Simpan
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-teks-utama">{v.judul}</p>
                        {v.keterangan && (
                          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-teks-sekunder">
                            {v.keterangan}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-teks-sekunder">
                          {v.kategori && (
                            <span className="glass rounded-full px-2 py-0.5 text-[10px] font-bold text-teks-utama">
                              {v.kategori}
                            </span>
                          )}
                          {v.berkas_ukuran > 0 && <span>{mb(v.berkas_ukuran)}</span>}
                          {tanggal(v.dibuat_pada) && <span>· {tanggal(v.dibuat_pada)}</span>}
                          {!v.aktif && <span>· disembunyikan dari anggota</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <SwitchKaca
                          aktif={v.aktif}
                          onUbah={() => void ubahAktif(v)}
                          disabled={sibukIni}
                          labelAria={v.aktif ? `Sembunyikan ${v.judul} dari anggota` : `Tampilkan ${v.judul} ke anggota`}
                        />
                        <button
                          type="button"
                          onClick={() => mulaiSunting(v)}
                          disabled={sibukIni}
                          aria-label={`Ubah ${v.judul}`}
                          className="glass btn-tekan flex h-7 w-7 items-center justify-center rounded-full text-teks-utama disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSuntingId(null);
                            setHapusId(v.id);
                          }}
                          disabled={sibukIni}
                          aria-label={`Hapus ${v.judul}`}
                          className="glass btn-tekan flex h-7 w-7 items-center justify-center rounded-full text-[#DC2626] disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {konfirmasiHapus && (
                      <div
                        className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-gagal/30 bg-gagal/5 p-2"
                        role="alert"
                      >
                        <span className="min-w-0 flex-1 text-[11.5px] text-teks-utama">
                          Hapus video ini dari Pustaka? Anggota tidak bisa memilihnya lagi.
                        </span>
                        <button
                          type="button"
                          onClick={() => setHapusId(null)}
                          disabled={sibukIni}
                          className="glass btn-tekan h-8 rounded-lg px-3 text-[11.5px] font-bold text-teks-utama disabled:opacity-60"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={() => void hapus(v)}
                          disabled={sibukIni}
                          className="btn-tekan flex h-8 items-center gap-1 rounded-lg bg-[#DC2626] px-3 text-[11.5px] font-bold text-white disabled:opacity-60"
                        >
                          {sibukIni && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                          Hapus
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
