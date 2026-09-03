"use client";

// ============================================================
// AccAjuanKomen (3 Sep 2026) — meja QC Divisi PALUGODAM untuk AJUAN
// KOMENTAR dari leaderboard: anggota mengaku sudah berkomentar dengan
// username tertentu. Petugas membuka postingannya (mata), memeriksa apakah
// komentar itu memang ada, lalu Setujui (rekap dipaksa Comply) atau Tolak
// (wajib alasan). Tampil di TV Rakyat Saya untuk anggota Divisi PALUGODAM.
// ============================================================

import { useEffect, useState } from "react";
import { Check, Eye, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { getAjuanKomentar, putusAjuanKomentar, type AjuanKomentar } from "@/services";
import { jamWIB, tanggalIndonesia } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AccAjuanKomen() {
  const [data, setData] = useState<{ menunggu: AjuanKomentar[]; terakhir: AjuanKomentar[] } | null>(null);
  const [sibuk, setSibuk] = useState("");
  const [tolakUntuk, setTolakUntuk] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");

  function muat() {
    return getAjuanKomentar()
      .then(setData)
      .catch((e) => toast("error", "Gagal memuat ajuan", e instanceof Error ? e.message : ""));
  }
  useEffect(() => {
    let hidup = true;
    getAjuanKomentar()
      .then((d) => hidup && setData(d))
      .catch((e) => hidup && toast("error", "Gagal memuat ajuan", e instanceof Error ? e.message : ""));
    return () => {
      hidup = false;
    };
  }, []);

  async function putus(id: string, aksi: "setuju" | "tolak") {
    if (sibuk) return;
    if (aksi === "tolak" && !alasan.trim()) {
      toast("peringatan", "Tulis alasan penolakan dulu");
      return;
    }
    setSibuk(id);
    try {
      await putusAjuanKomentar({ id, aksi, catatan: aksi === "tolak" ? alasan.trim() : undefined });
      toast("sukses", aksi === "setuju" ? "Ajuan disetujui — komentar dihitung" : "Ajuan ditolak");
      setTolakUntuk(null);
      setAlasan("");
      await muat();
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  function Kartu({ a, aktif }: { a: AjuanKomentar; aktif: boolean }) {
    const meminta = tolakUntuk === a.id;
    return (
      <GlassCard className="p-3">
        <div className="flex items-center gap-2.5">
          {a.avatar_url ? <FotoBulat src={a.avatar_url} ukuran={32} /> : <AvatarInisial nama={a.nama_kader} ukuran={32} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-bold text-teks-utama">{a.nama_kader}</p>
            <p className="flex items-center gap-1 text-[10.5px] text-teks-sekunder">
              <PlatformIcon platform={a.platform} size={11} />
              <span className="truncate">
                {labelPlatform(a.platform)} · {a.akun_wajib} · komen sebagai <b>@{a.username_komentar}</b>
              </span>
            </p>
          </div>
          <a
            href={a.url_postingan}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Lihat postingan"
            className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-teks-utama"
          >
            <Eye className="h-4 w-4" />
          </a>
        </div>
        {a.caption ? <p className="mt-1.5 line-clamp-2 text-[11px] text-teks-sekunder">{a.caption}</p> : null}
        <p className="mt-1 text-[10px] text-teks-sekunder">
          diunggah {a.waktu_posting ? `${tanggalIndonesia(a.waktu_posting)} ${jamWIB(a.waktu_posting)}` : "-"} · diajukan{" "}
          {jamWIB(a.dibuat_pada)}
          {a.catatan ? ` · catatan: ${a.catatan}` : ""}
        </p>
        {aktif ? (
          <div className="mt-2">
            {meminta ? (
              <textarea
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                rows={2}
                maxLength={300}
                autoFocus
                placeholder="Alasan penolakan (dibaca pengajunya)…"
                className="glass-input mb-2 w-full rounded-xl px-3 py-2 text-[12px] text-teks-utama"
              />
            ) : null}
            <div className="flex gap-2">
              {!meminta ? (
                <button
                  type="button"
                  onClick={() => void putus(a.id, "setuju")}
                  disabled={Boolean(sibuk)}
                  className="btn-tekan flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[12px] font-bold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                >
                  {sibuk === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Benar, setujui
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (meminta) void putus(a.id, "tolak");
                  else {
                    setTolakUntuk(a.id);
                    setAlasan("");
                  }
                }}
                disabled={Boolean(sibuk)}
                className={cn(
                  "btn-tekan flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[12px] font-bold disabled:opacity-50",
                  meminta ? "bg-gagal text-white" : "bg-gagal/12 text-gagal",
                )}
              >
                <X className="h-3.5 w-3.5" />
                {meminta ? "Kirim penolakan" : "Tolak"}
              </button>
              {meminta ? (
                <button
                  type="button"
                  onClick={() => setTolakUntuk(null)}
                  className="glass btn-tekan rounded-xl px-3 text-[12px] font-bold text-teks-utama"
                >
                  Batal
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge label={a.status} warna={a.status === "disetujui" ? "hijau" : "merah"} />
            <span className="truncate text-[10px] text-teks-sekunder">
              oleh {a.diputus_oleh ?? "-"}
              {a.catatan_putusan ? ` · ${a.catatan_putusan}` : ""}
            </span>
          </div>
        )}
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <GlassCard className="p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-pri" />
          <p className="flex-1 text-[12.5px] font-bold text-teks-utama">
            Ajuan komentar menunggu ({data?.menunggu.length ?? 0})
          </p>
          <button type="button" onClick={() => void muat()} aria-label="Segarkan" className="btn-tekan p-1 text-teks-sekunder">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
          Anggota mengaku sudah berkomentar tetapi sistem belum mencatat. Buka postingannya (mata), cari
          komentar dari username yang disebut, lalu putuskan. Setuju = komentar langsung dihitung.
        </p>
      </GlassCard>
      {!data ? (
        <GlassSkeleton className="h-24 rounded-2xl" />
      ) : data.menunggu.length === 0 ? (
        <p className="glass rounded-2xl px-4 py-5 text-center text-[12px] text-teks-sekunder">Tidak ada ajuan menunggu.</p>
      ) : (
        data.menunggu.map((a) => <Kartu key={a.id} a={a} aktif />)
      )}
      {data && data.terakhir.length > 0 ? (
        <>
          <p className="mt-1 text-[11px] font-semibold text-teks-sekunder">Terakhir diputus</p>
          {data.terakhir.map((a) => (
            <Kartu key={a.id} a={a} aktif={false} />
          ))}
        </>
      ) : null}
    </div>
  );
}
