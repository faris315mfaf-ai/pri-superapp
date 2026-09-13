"use client";

// ============================================================
// KelolaKeywordPanel (fitur 1.22.x/keyword) — Pimpinan Redaksi TV Rakyat
// menetapkan keyword/tema yang WAJIB diangkat seluruh anggota di laporan
// videonya (mis. "BPJS"). Jadi acuan bersama; anggota memilih keyword ini
// saat melaporkan videonya di modul TVR Saya.
// ============================================================

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plus, RotateCcw, Tag, Trash2 } from "lucide-react";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import {
  getKeywordWajib,
  hapusKeyword,
  selesaikanKeyword,
  tambahKeyword,
  toggleKeyword,
  type KeywordWajib,
} from "@/services";
import { cn } from "@/lib/utils";

/** "13 Sep 2026" — cukup tanggalnya; jam kapan ditandai tidak penting. */
function formatTanggalSelesai(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

export function KelolaKeywordPanel() {
  const [data, setData] = useState<KeywordWajib[] | null>(null);
  const [keyword, setKeyword] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [muatUlang, setMuatUlang] = useState(0);
  // Konfirmasi "Selesai" dua ketukan di tempat: ketukan pertama membuka
  // pilihan Ya/Batal di baris itu sendiri — tanpa dialog yang menutupi
  // layar. Salah tandai selesai memang bisa dibuka lagi, tapi selama
  // tertutup anggota tidak bisa mengunggah, jadi tetap layak ditanya.
  const [konfirmasiSelesai, setKonfirmasiSelesai] = useState<string | null>(null);
  const [sibukSelesai, setSibukSelesai] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getKeywordWajib();
        if (hidup) setData(d.data);
      } catch (e) {
        if (hidup) {
          setData([]);
          toast("error", "Gagal memuat keyword", e instanceof Error ? e.message : "");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  async function tambah() {
    if (sibuk) return;
    if (keyword.trim().length < 2) {
      toast("peringatan", "Keyword minimal 2 karakter");
      return;
    }
    setSibuk(true);
    try {
      await tambahKeyword(keyword.trim());
      toast("sukses", "Keyword ditambahkan");
      setKeyword("");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menambah", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  async function toggle(id: string) {
    try {
      await toggleKeyword(id);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal mengubah", e instanceof Error ? e.message : "");
    }
  }

  async function selesaikan(id: string, selesai: boolean) {
    if (sibukSelesai) return;
    setSibukSelesai(id);
    try {
      await selesaikanKeyword(id, selesai);
      toast(
        "sukses",
        selesai ? "Kategori ditandai selesai" : "Kategori dibuka lagi",
        selesai ? "Anggota tidak bisa memilihnya lagi. Datanya tetap tersimpan." : "",
      );
      setKonfirmasiSelesai(null);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal mengubah", e instanceof Error ? e.message : "");
    } finally {
      setSibukSelesai(null);
    }
  }

  async function hapus(id: string) {
    try {
      await hapusKeyword(id);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    }
  }

  if (!data) return <GlassSkeleton className="h-32 rounded-xl" />;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-snug text-teks-sekunder">
        Kategori video yang dipilih anggota saat mengunggah atau melaporkan
        videonya (mis. <b>BPJS</b>). <b>Video Sendiri</b> selalu ada dan tidak bisa
        dihapus — untuk video buatan anggota di luar tema mana pun.
        Acara yang sudah lewat tandai <b>Selesai</b>: anggota tidak bisa memilihnya
        lagi, tapi seluruh datanya tetap tersimpan dan tetap tampil di insight.
      </p>

      {/* Tambah keyword */}
      <div className="flex gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void tambah();
          }}
          placeholder="Keyword baru (mis. BPJS)"
          aria-label="Keyword wajib baru"
          className="glass h-10 min-w-0 flex-1 rounded-xl px-3 text-[13px] text-teks-utama outline-none placeholder:text-teks-sekunder/60 focus:ring-2 focus:ring-pri/50"
        />
        <button
          type="button"
          onClick={() => void tambah()}
          disabled={sibuk}
          className="btn-tekan flex h-10 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
        >
          {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Tambah
        </button>
      </div>

      {/* Daftar keyword */}
      {data.length === 0 ? (
        <p className="py-3 text-center text-[11.5px] text-teks-sekunder">
          Belum ada keyword. Tambahkan di atas.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.map((k) => (
            <div
              key={k.id}
              className={cn(
                "glass-soft flex flex-col gap-2 rounded-xl px-3 py-2",
                !k.aktif && !k.selesai && "opacity-55",
              )}
            >
              <div className="flex items-center gap-2.5">
                {k.selesai ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-sukses" aria-hidden="true" />
                ) : (
                  <Tag className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-teks-utama">
                  {k.keyword}
                  {k.selesai && (
                    <span className="ml-1.5 text-[10.5px] font-medium text-teks-sekunder">
                      selesai {k.selesai_pada ? formatTanggalSelesai(k.selesai_pada) : ""}
                    </span>
                  )}
                </span>
                {k.tetap ? (
                  <span className="rounded-lg bg-teks-sekunder/15 px-2.5 py-1 text-[10.5px] font-bold text-teks-sekunder">
                    tetap
                  </span>
                ) : k.selesai ? (
                  <button
                    type="button"
                    onClick={() => void selesaikan(k.id, false)}
                    disabled={sibukSelesai === k.id}
                    aria-label={`Buka lagi ${k.keyword}`}
                    className="btn-tekan flex items-center gap-1 rounded-lg bg-teks-sekunder/15 px-2.5 py-1 text-[10.5px] font-bold text-teks-sekunder disabled:opacity-60"
                  >
                    {sibukSelesai === k.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    )}
                    Buka lagi
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void toggle(k.id)}
                      aria-label={k.aktif ? `Nonaktifkan ${k.keyword}` : `Aktifkan ${k.keyword}`}
                      className={cn(
                        "btn-tekan rounded-lg px-2.5 py-1 text-[10.5px] font-bold",
                        k.aktif ? "bg-sukses/15 text-sukses" : "bg-teks-sekunder/15 text-teks-sekunder",
                      )}
                    >
                      {k.aktif ? "Aktif" : "Nonaktif"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setKonfirmasiSelesai((c) => (c === k.id ? null : k.id))}
                      aria-label={`Tandai ${k.keyword} selesai`}
                      aria-expanded={konfirmasiSelesai === k.id}
                      className="btn-tekan rounded-lg bg-pri/12 px-2.5 py-1 text-[10.5px] font-bold text-pri"
                    >
                      Selesai
                    </button>
                    <button
                      type="button"
                      onClick={() => void hapus(k.id)}
                      aria-label={`Hapus ${k.keyword}`}
                      className="btn-tekan p-1.5 text-teks-sekunder/70 hover:text-gagal"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
              {konfirmasiSelesai === k.id && !k.selesai && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-pri/8 px-2.5 py-2">
                  <p className="min-w-0 flex-1 text-[11px] leading-snug text-teks-utama">
                    Tandai <b>{k.keyword}</b> selesai? Anggota tidak bisa mengunggah untuk
                    kategori ini lagi. Datanya <b>tetap tersimpan</b>, tidak dihapus.
                  </p>
                  <button
                    type="button"
                    onClick={() => void selesaikan(k.id, true)}
                    disabled={sibukSelesai === k.id}
                    className="btn-tekan flex h-8 items-center gap-1 rounded-lg px-3 text-[11px] font-bold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                  >
                    {sibukSelesai === k.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Ya, selesai
                  </button>
                  <button
                    type="button"
                    onClick={() => setKonfirmasiSelesai(null)}
                    className="btn-tekan h-8 rounded-lg px-3 text-[11px] font-bold text-teks-sekunder"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
