"use client";

// ============================================================
// KelolaSumberPanel (fitur 1.22/bug 6) — kelola akun sumber berita
// yang di-scrape n8n. Tambah akun IG/TikTok, stop/aktifkan sumber
// (mis. Lambe Turah), dan atur interval auto-scrape (menit).
//
// Workflow n8n membaca baris aktif dari tabel sumber_berita, jadi
// perubahan di sini langsung memengaruhi scraping tanpa mengedit
// workflow.
// ============================================================

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { GlassSkeleton } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import {
  getSumberBerita,
  hapusSumberBerita,
  setIntervalBerita,
  tambahSumberBerita,
  toggleSumberBerita,
  type DaftarSumberBerita,
} from "@/services";
import { cn } from "@/lib/utils";

export function KelolaSumberPanel() {
  const [data, setData] = useState<DaftarSumberBerita | null>(null);
  const [nama, setNama] = useState("");
  const [username, setUsername] = useState("");
  const [platform, setPlatform] = useState<"instagram" | "tiktok">("instagram");
  const [menit, setMenit] = useState(60);
  const [sibuk, setSibuk] = useState(false);
  const [muatUlang, setMuatUlang] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getSumberBerita();
        if (!hidup) return;
        setData(d);
        setMenit(d.interval_menit);
      } catch (e) {
        if (hidup) toast("error", "Gagal memuat sumber", e instanceof Error ? e.message : "");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  async function tambah() {
    if (sibuk) return;
    if (username.trim().replace(/^@+/, "").length < 2) {
      toast("peringatan", "Username belum benar");
      return;
    }
    setSibuk(true);
    try {
      await tambahSumberBerita({ nama: nama.trim(), username: username.trim(), platform });
      toast("sukses", "Sumber ditambahkan");
      setNama("");
      setUsername("");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menambah", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  async function toggle(id: string) {
    try {
      await toggleSumberBerita(id);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal mengubah", e instanceof Error ? e.message : "");
    }
  }

  async function hapus(id: string) {
    try {
      await hapusSumberBerita(id);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    }
  }

  async function simpanInterval() {
    if (sibuk) return;
    setSibuk(true);
    try {
      const hasil = await setIntervalBerita(menit);
      setMenit(hasil);
      toast("sukses", "Interval disimpan", `Scraping tiap ${hasil} menit.`);
    } catch (e) {
      toast("error", "Gagal menyimpan interval", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  if (!data) return <GlassSkeleton className="h-40 rounded-xl" />;

  return (
    <div className="flex flex-col gap-3">
      {/* Interval auto-scrape */}
      <div className="glass-soft rounded-xl p-3">
        <p className="text-[11.5px] font-bold text-teks-utama">Interval Scraping</p>
        <p className="mt-0.5 mb-2 text-[10.5px] leading-snug text-teks-sekunder">
          Seberapa sering n8n memindai sumber (menit). Minimal {data.interval_min} menit
          untuk menghemat kuota.
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            min={data.interval_min}
            max={data.interval_maks}
            value={menit}
            onChange={(e) => setMenit(Number(e.target.value))}
            aria-label="Interval scraping (menit)"
            className="glass h-10 w-24 rounded-xl px-3 text-[13px] text-teks-utama outline-none focus:ring-2 focus:ring-pri/50"
          />
          <button
            type="button"
            onClick={() => void simpanInterval()}
            disabled={sibuk}
            className="btn-tekan flex h-10 flex-1 items-center justify-center rounded-xl text-[12.5px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            Simpan Interval
          </button>
        </div>
      </div>

      {/* Tambah sumber */}
      <div className="glass-soft rounded-xl p-3">
        <p className="mb-2 text-[11.5px] font-bold text-teks-utama">Tambah Akun Sumber</p>
        <div className="flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {(["instagram", "tiktok"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              aria-pressed={platform === p}
              className={cn(
                "btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-bold capitalize",
                platform === p ? "text-white" : "text-teks-sekunder",
              )}
              style={platform === p ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
            >
              <PlatformIcon platform={p} size={13} />
              {p === "instagram" ? "Instagram" : "TikTok"}
            </button>
          ))}
        </div>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username akun (mis. official.ntv)"
          aria-label="Username akun sumber"
          className="glass mt-2 h-10 w-full rounded-xl px-3 text-[13px] text-teks-utama outline-none placeholder:text-teks-sekunder/60 focus:ring-2 focus:ring-pri/50"
        />
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama sumber (mis. Nusantara TV) — opsional"
          aria-label="Nama sumber"
          className="glass mt-2 h-10 w-full rounded-xl px-3 text-[13px] text-teks-utama outline-none placeholder:text-teks-sekunder/60 focus:ring-2 focus:ring-pri/50"
        />
        <button
          type="button"
          onClick={() => void tambah()}
          disabled={sibuk}
          className="btn-tekan mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
        >
          {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Tambah Sumber
        </button>
      </div>

      {/* Daftar sumber */}
      <div className="flex flex-col gap-1.5">
        {data.data.length === 0 ? (
          <p className="py-3 text-center text-[11.5px] text-teks-sekunder">
            Belum ada sumber. Tambahkan akun IG/TikTok di atas.
          </p>
        ) : (
          data.data.map((s) => (
            <div
              key={s.id}
              className={cn(
                "glass-soft flex items-center gap-2.5 rounded-xl px-3 py-2",
                !s.aktif && "opacity-55",
              )}
            >
              <PlatformIcon platform={s.platform} size={16} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-teks-utama">
                  @{s.username}
                </p>
                <p className="truncate text-[10.5px] text-teks-sekunder">{s.nama}</p>
              </div>
              {/* Stop/aktifkan (mis. hentikan Lambe Turah) */}
              <button
                type="button"
                onClick={() => void toggle(s.id)}
                aria-label={s.aktif ? `Stop ${s.username}` : `Aktifkan ${s.username}`}
                className={cn(
                  "btn-tekan rounded-lg px-2.5 py-1 text-[10.5px] font-bold",
                  s.aktif
                    ? "bg-sukses/15 text-sukses"
                    : "bg-teks-sekunder/15 text-teks-sekunder",
                )}
              >
                {s.aktif ? "Aktif" : "Nonaktif"}
              </button>
              <button
                type="button"
                onClick={() => void hapus(s.id)}
                aria-label={`Hapus ${s.username}`}
                className="btn-tekan p-1.5 text-teks-sekunder/70 hover:text-gagal"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
