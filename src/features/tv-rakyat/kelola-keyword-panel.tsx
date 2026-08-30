"use client";

// ============================================================
// KelolaKeywordPanel (fitur 1.22.x/keyword) — Pimpinan Redaksi TV Rakyat
// menetapkan keyword/tema yang WAJIB diangkat seluruh anggota di laporan
// videonya (mis. "BPJS"). Jadi acuan bersama; anggota memilih keyword ini
// saat melaporkan videonya di modul TVR Saya.
// ============================================================

import { useEffect, useState } from "react";
import { Loader2, Plus, Tag, Trash2 } from "lucide-react";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import {
  getKeywordWajib,
  hapusKeyword,
  tambahKeyword,
  toggleKeyword,
  type KeywordWajib,
} from "@/services";
import { cn } from "@/lib/utils";

export function KelolaKeywordPanel() {
  const [data, setData] = useState<KeywordWajib[] | null>(null);
  const [keyword, setKeyword] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [muatUlang, setMuatUlang] = useState(0);

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
        Tetapkan keyword/tema yang <b>wajib</b> diangkat seluruh anggota di laporan
        videonya (mis. <b>BPJS</b>). Anggota memilih keyword ini saat melaporkan videonya.
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
                "glass-soft flex items-center gap-2.5 rounded-xl px-3 py-2",
                !k.aktif && "opacity-55",
              )}
            >
              <Tag className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-teks-utama">
                {k.keyword}
              </span>
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
                onClick={() => void hapus(k.id)}
                aria-label={`Hapus ${k.keyword}`}
                className="btn-tekan p-1.5 text-teks-sekunder/70 hover:text-gagal"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
