"use client";

// ============================================================
// PersetujuanKpiScreen (2 Sep 2026) — meja ACC Divisi HR untuk KPI video:
//   Tab 1: LAPORAN VIDEO MANUAL (link) — setuju = masuk KPI, tolak = alasan.
//   Tab 2: PERMOHONAN SOSMED TERBLOKIR — setuju = target -5/platform.
// Dibuka dari HR Center → "ACC KPI".
// ============================================================

import { useEffect, useState } from "react";
import { Ban, Check, CheckCheck, ExternalLink, Link2, Loader2, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, EmptyState, GlassSkeleton, ScreenHeader, ThemeToggle } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { getPersetujuanKpi, putusPersetujuanKpi, type PersetujuanKpi } from "@/services";
import { jamWIB, tanggalIndonesia } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "laporan" | "banned";

function Avatar({ src, nama }: { src: string; nama: string }) {
  return src ? <FotoBulat src={src} ukuran={32} /> : <AvatarInisial nama={nama} ukuran={32} />;
}

export function PersetujuanKpiScreen({ onKembali }: { onKembali: () => void }) {
  const [data, setData] = useState<PersetujuanKpi | null>(null);
  const [tab, setTab] = useState<Tab>("laporan");
  const [sibuk, setSibuk] = useState("");
  // id yang sedang diminta alasan penolakannya
  const [tolakUntuk, setTolakUntuk] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");
  // ACC sekaligus (2 Sep 2026): dua langkah — tekan, lalu konfirmasi.
  const [konfirmasiSemua, setKonfirmasiSemua] = useState(false);

  async function setujuiSemua() {
    if (sibuk || !data || data.laporan.length === 0) return;
    setSibuk("semua");
    try {
      const ids = data.laporan.map((l) => l.id);
      const r = await putusPersetujuanKpi({ jenis: "laporan", ids, aksi: "setuju" });
      toast("sukses", `${r.disetujui ?? ids.length} laporan disetujui`, "Semua sudah masuk KPI anggotanya.");
      setKonfirmasiSemua(false);
      muat();
    } catch (e) {
      toast("error", "Gagal ACC sekaligus", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  function muat() {
    getPersetujuanKpi()
      .then(setData)
      .catch((e) => toast("error", "Gagal memuat", e instanceof Error ? e.message : ""));
  }
  useEffect(() => {
    muat();
  }, []);

  async function putus(jenis: Tab, id: string, aksi: "setuju" | "tolak") {
    if (sibuk) return;
    if (aksi === "tolak" && !alasan.trim()) {
      toast("peringatan", "Tulis alasan penolakan dulu");
      return;
    }
    setSibuk(id);
    try {
      await putusPersetujuanKpi({ jenis, id, aksi, catatan: aksi === "tolak" ? alasan.trim() : undefined });
      toast("sukses", aksi === "setuju" ? "Disetujui" : "Ditolak");
      setTolakUntuk(null);
      setAlasan("");
      muat();
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  const jumlahLaporan = data?.laporan.length ?? 0;
  const jumlahBanned = data?.banned.length ?? 0;

  function tombolPutus(jenis: Tab, id: string) {
    const meminta = tolakUntuk === id;
    return (
      <div className="mt-2">
        {meminta ? (
          <textarea
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            rows={2}
            maxLength={300}
            autoFocus
            placeholder="Alasan penolakan (dibaca anggotanya)…"
            className="glass-input mb-2 w-full rounded-xl px-3 py-2 text-[12px] text-teks-utama"
          />
        ) : null}
        <div className="flex gap-2">
          {!meminta ? (
            <button
              type="button"
              onClick={() => void putus(jenis, id, "setuju")}
              disabled={Boolean(sibuk)}
              className="btn-tekan flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[12px] font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
            >
              {sibuk === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Setujui
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (meminta) void putus(jenis, id, "tolak");
              else {
                setTolakUntuk(id);
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
            {meminta ? "Kirim Penolakan" : "Tolak"}
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
    );
  }

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <ScreenHeader judul="ACC KPI Video" onKembali={onKembali} kanan={<ThemeToggle />} />

      <div className="mt-2 grid grid-cols-2 gap-2">
        {(
          [
            ["laporan", "Laporan Link", jumlahLaporan, Link2],
            ["banned", "Sosmed Terblokir", jumlahBanned, Ban],
          ] as const
        ).map(([kunci, label, n, Ikon]) => (
          <button
            key={kunci}
            type="button"
            onClick={() => setTab(kunci)}
            aria-pressed={tab === kunci}
            className={cn(
              "btn-tekan flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold",
              tab === kunci ? "text-white" : "glass text-teks-sekunder",
            )}
            style={tab === kunci ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
          >
            <Ikon className="h-3.5 w-3.5" />
            {label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px]",
                tab === kunci ? "bg-white/25" : "bg-black/8 dark:bg-white/10",
              )}
            >
              {n}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-2 px-1 text-[10.5px] leading-relaxed text-teks-sekunder">
        {tab === "laporan"
          ? "Link yang dilaporkan manual belum dihitung KPI. Buka videonya, pastikan benar milik anggota & sesuai keyword, lalu putuskan."
          : "Bila disetujui, target KPI anggota itu berkurang 5 video untuk platform yang terblokir. Periksa bukti screenshot-nya."}
      </p>

      {!data ? (
        <GlassSkeleton className="mt-3 h-40 rounded-2xl" />
      ) : tab === "laporan" ? (
        data.laporan.length === 0 ? (
          <GlassCard className="mt-3">
            <EmptyState ikon={Link2} judul="Tidak ada antrean" keterangan="Semua laporan link sudah diputus." />
          </GlassCard>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {/* ACC sekaligus seluruh antrean laporan link */}
            <GlassCard className="p-3">
              {konfirmasiSemua ? (
                <>
                  <p className="text-[12px] leading-relaxed text-teks-utama">
                    Yakin menyetujui <b>{data.laporan.length} laporan</b> sekaligus? Semuanya
                    langsung masuk KPI anggota masing-masing.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void setujuiSemua()}
                      disabled={Boolean(sibuk)}
                      className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-bold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                    >
                      {sibuk === "semua" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCheck className="h-3.5 w-3.5" />
                      )}
                      Ya, setujui semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setKonfirmasiSemua(false)}
                      disabled={Boolean(sibuk)}
                      className="glass btn-tekan rounded-xl px-3 text-[12px] font-bold text-teks-utama"
                    >
                      Batal
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setKonfirmasiSemua(true)}
                  disabled={Boolean(sibuk)}
                  className="btn-tekan flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                >
                  <CheckCheck className="h-4 w-4" />
                  Setujui Semua ({data.laporan.length})
                </button>
              )}
            </GlassCard>
            {data.laporan.map((l) => (
              <GlassCard key={l.id} className="p-3">
                <div className="flex items-center gap-2.5">
                  <Avatar src={l.avatar_url} nama={l.nama} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-teks-utama">{l.nama}</p>
                    <p className="text-[10px] text-teks-sekunder">
                      {tanggalIndonesia(`${l.tanggal_wib}T00:00:00+07:00`)} · dikirim {jamWIB(l.dibuat_pada)}
                    </p>
                  </div>
                  <PlatformIcon platform={l.platform} size={16} />
                </div>
                <a
                  href={l.url_video}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass btn-tekan mt-2 flex items-center gap-2 rounded-xl px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-teks-utama">{l.url_video}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-teks-sekunder" />
                </a>
                {l.keyword ? (
                  <span className="mt-1.5 inline-block rounded bg-pri/12 px-1.5 py-0.5 text-[9.5px] font-bold text-pri">
                    {l.keyword}
                  </span>
                ) : null}
                {tombolPutus("laporan", l.id)}
              </GlassCard>
            ))}
          </div>
        )
      ) : data.banned.length === 0 ? (
        <GlassCard className="mt-3">
          <EmptyState ikon={Ban} judul="Tidak ada permohonan" keterangan="Semua permohonan blokir sudah diputus." />
        </GlassCard>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {data.banned.map((b) => (
            <GlassCard key={b.id} className="p-3">
              <div className="flex items-center gap-2.5">
                <Avatar src={b.avatar_url} nama={b.nama} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-teks-utama">{b.nama}</p>
                  <p className="text-[10px] text-teks-sekunder">
                    {labelPlatform(b.platform)} · diajukan {jamWIB(b.dibuat_pada)}
                  </p>
                </div>
                <PlatformIcon platform={b.platform} size={16} />
              </div>
              {b.keterangan ? (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-teks-utama">"{b.keterangan}"</p>
              ) : null}
              <a href={b.bukti_url} target="_blank" rel="noopener noreferrer" className="btn-tekan mt-2 block">
                <img
                  src={b.bukti_url}
                  alt={`Bukti blokir ${b.platform} ${b.nama}`}
                  className="max-h-56 w-full rounded-xl object-contain"
                />
              </a>
              {tombolPutus("banned", b.id)}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
