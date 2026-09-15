"use client";

// ============================================================
// Panel Master → GERBANG POSTING ANGGOTA (15 Sep 2026)
//
// Aplikasi memakai tiga gerbang: Ayrshare untuk TV Rakyat Official,
// upload-post untuk akun pribadi anggota, dan Postiz yang berjalan di
// server sendiri. Postiz BUKAN pengganti upload-post — ia pilihan
// ketiga yang sedang diuji.
//
// Layar ini menjawab satu pertanyaan saja: siapa yang ikut mencoba
// Postiz. Sengaja per orang, bukan satu sakelar untuk semua, supaya
// kalau ada yang salah yang terkena hanya beberapa orang dan
// mengembalikannya cukup satu ketukan.
// ============================================================

import { useEffect, useState } from "react";
import { Loader2, Server, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { getPenyediaTvr, setPenyediaTvr, type PenyediaTvrData } from "@/services";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  "upload-post": "upload-post",
  postiz: "Postiz (VPS)",
};

export function SeksiPenyediaTvr() {
  const [data, setData] = useState<PenyediaTvrData | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [muat, setMuat] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getPenyediaTvr();
        if (hidup) setData(d);
      } catch (e) {
        if (!hidup) return;
        setData({
          anggota: [],
          bawaan: "upload-post",
          postiz_siap: false,
          upload_post_siap: false,
          jumlah: { semua: 0, postiz: 0 },
        });
        toast("error", "Gagal memuat daftar", e instanceof Error ? e.message : "");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muat]);

  async function pindah(id: string, nama: string, ke: string) {
    if (sibuk) return;
    setSibuk(id);
    try {
      const r = await setPenyediaTvr(id, ke);
      if (r.berubah) {
        toast("sukses", `${nama} → ${LABEL[ke] ?? ke}`, r.catatan ?? "");
        setMuat((n) => n + 1);
      } else {
        toast("info", "Tidak ada perubahan", `${nama} memang sudah memakai ${LABEL[ke] ?? ke}.`);
      }
    } catch (e) {
      toast("error", "Gagal memindahkan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
    }
  }

  if (data === null) {
    return (
      <div className="mt-6">
        <SectionTitle judul="Gerbang Posting Anggota" />
        <GlassSkeleton className="mt-2.5 h-32 rounded-2xl" />
      </div>
    );
  }

  const kata = cari.trim().toLowerCase();
  const tampil = kata
    ? data.anggota.filter(
        (a) => a.nama.toLowerCase().includes(kata) || a.username.toLowerCase().includes(kata),
      )
    : data.anggota;

  return (
    <div className="mt-6">
      <SectionTitle judul="Gerbang Posting Anggota" />
      <GlassCard className="mt-2.5 p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              data.postiz_siap
                ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/12 text-amber-600 dark:text-amber-400",
            )}
            aria-hidden="true"
          >
            <Server className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold text-teks-utama">
              Postiz sedang diuji pada {data.jumlah.postiz} dari {data.jumlah.semua} anggota
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-teks-sekunder">
              {data.postiz_siap
                ? "Postiz siap dipakai. Anggota yang dipindahkan akan mengunggah lewat server sendiri; akun sosmednya harus sudah ditautkan di dasbor Postiz dengan label yang sama dengan nama profilnya."
                : "Postiz belum diatur di server, jadi belum ada yang bisa dipindahkan. Pasang dulu di VPS dan isi alamat serta kuncinya di pengaturan server."}
            </p>
            <p className="mt-1.5 text-[11px] text-teks-sekunder">
              TV Rakyat Official tetap lewat Ayrshare dan tidak terpengaruh layar ini.
            </p>
          </div>
        </div>

        {data.anggota.length > 6 && (
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama anggota…"
            aria-label="Cari anggota"
            className="glass mt-3 w-full rounded-xl px-3 py-2 text-[12.5px] text-teks-utama outline-none placeholder:text-teks-sekunder"
          />
        )}

        <div className="mt-3 flex flex-col gap-1.5">
          {tampil.length === 0 && (
            <p className="py-3 text-center text-[11.5px] text-teks-sekunder">
              {data.anggota.length === 0
                ? "Belum ada anggota yang punya profil TV Rakyat Saya."
                : "Tidak ada yang cocok dengan pencarian."}
            </p>
          )}
          {tampil.map((a) => {
            const diPostiz = a.penyedia === "postiz";
            return (
              <div
                key={a.id}
                className="flex items-center gap-2.5 rounded-xl px-1 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-teks-utama">{a.nama}</p>
                  <p className="truncate text-[10.5px] text-teks-sekunder">
                    {a.profil || "tanpa profil"} · {a.tertaut} akun tertaut
                    {diPostiz && a.diubah_pada
                      ? ` · sejak ${new Date(a.diubah_pada).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`
                      : ""}
                  </p>
                </div>
                {/* Dua tombol berdampingan, bukan sakelar: keadaan sekarang
                    harus terbaca tanpa menafsirkan posisi tuas. */}
                <div className="glass flex shrink-0 rounded-full p-0.5" role="group" aria-label={`Gerbang posting ${a.nama}`}>
                  {(["upload-post", "postiz"] as const).map((p) => {
                    const aktif = a.penyedia === p;
                    const terkunci = p === "postiz" && !data.postiz_siap;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => void pindah(a.id, a.nama, p)}
                        disabled={aktif || terkunci || sibuk !== null}
                        aria-pressed={aktif}
                        title={terkunci ? "Postiz belum diatur di server" : `Pindahkan ${a.nama} ke ${LABEL[p]}`}
                        className={cn(
                          "btn-tekan rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition-colors",
                          aktif
                            ? "bg-emerald-500/18 text-emerald-700 dark:text-emerald-300"
                            : "text-teks-sekunder",
                          terkunci && "opacity-40",
                        )}
                      >
                        {sibuk === a.id && !aktif ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          LABEL[p]
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-teks-sekunder">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Unggahan lama tidak ikut berpindah. Tiap video menyimpan gerbang asalnya
            sendiri, jadi laporan dan KPI yang sudah ada tetap terbaca dari tempat yang benar.
          </span>
        </p>
      </GlassCard>
    </div>
  );
}
