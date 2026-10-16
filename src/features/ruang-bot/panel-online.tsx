"use client";

// ============================================================
// PanelOnline (14 Okt 2026) — daftar pengguna yang SEDANG ONLINE di aplikasi.
// Master: nama, divisi, layar yang dibuka, aksi yang dikerjakan, judul video, akun sosmed.
// Pengguna umum (`ringkas`): nama + jenis kegiatan saja (server sudah membuang rinciannya).
// Klik baris = pilih karakternya di ruangan.
// ============================================================

import { GlassCard } from "@/components/glass-card";
import type { PenghuniDunia } from "@/lib/dunia-murni";
import { cn } from "@/lib/utils";
import { PotretKarakter } from "./potret-karakter";
import { WARNA_STASIUN } from "./dunia-sayap";

const LABEL_ANIM: Record<string, string> = {
  rak: "Ruang database",
  autoedit: "Ruang alat · Auto Edit",
  kompres: "Ruang alat · Kompres",
  blur: "Ruang alat · Blur Watermark",
  kotak_post: "Ruang pos",
};

export function PanelOnline({
  daftar,
  jumlah,
  diluar,
  terpotong,
  galat,
  terpilihId,
  onPilih,
  ringkas = false,
  sayaId,
  className,
  tinggiDaftar = "max-h-[420px]",
}: {
  daftar: readonly PenghuniDunia[];
  /** Jumlah online sebenarnya (bisa lebih dari yang dikirim server). */
  jumlah: number;
  /** Online yang tidak digambar (aula penuh). */
  diluar: number;
  terpotong: boolean;
  galat: string;
  terpilihId: number | null;
  onPilih: (id: number | null) => void;
  /** Tampilan pengguna umum: tanpa username, divisi, peran, judul, akun. */
  ringkas?: boolean;
  /** Akun yang membuka layar (ditandai "Anda"). */
  sayaId?: number;
  className?: string;
  tinggiDaftar?: string;
}) {

  return (
    <GlassCard className={cn("p-3.5", className)}>
      <h3 className="mb-2.5 flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-wider text-teks-sekunder">
        <span>Sedang online</span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-px text-[10.5px] text-emerald-700 dark:text-emerald-300">
          {jumlah} orang
        </span>
      </h3>
      {galat && daftar.length === 0 ? (
        <p className="text-[12px] text-amber-700 dark:text-amber-300">Daftar online gagal dimuat: {galat}</p>
      ) : daftar.length === 0 ? (
        <p className="text-[12px] text-teks-sekunder">Belum ada yang online. Orang muncul di aula begitu membuka aplikasi.</p>
      ) : (
        <ul className={cn("scrollbar-tipis flex flex-col gap-1.5 overflow-y-auto", tinggiDaftar)}>
          {daftar.map((p) => {
            const a = p.aktivitas;
            const aktif = a !== null;
            const pilih = terpilihId === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={pilih}
                  onClick={() => onPilih(pilih ? null : p.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-xl border p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emas",
                    pilih ? "border-emas bg-emas/10" : "border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/5",
                  )}
                >
                  <PotretKarakter userId={p.id} sayaId={sayaId} ukuran={30} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-1.5">
                      <b className="text-[12.5px] text-teks-utama">{p.nama || p.username}</b>
                      {sayaId === p.id && <span className="rounded-full bg-pri/12 px-1.5 text-[9.5px] font-extrabold text-pri">ANDA</span>}
                      {!ringkas && <span className="text-[10.5px] text-teks-sekunder">@{p.username}</span>}
                    </span>
                    {!ringkas && (
                      <span className="block text-[11px] text-teks-sekunder">
                        {[p.divisi, p.role].filter(Boolean).join(" · ") || "—"}
                      </span>
                    )}
                    {aktif ? (
                      <span className="mt-1 block rounded-lg px-2 py-1 text-[11.5px] leading-snug text-teks-utama" style={{ background: `${WARNA_STASIUN[a.anim === "layar" ? "rak" : a.anim]}22` }}>
                        <b>{a.label}</b>
                        {a.berjalan ? " · sedang berjalan" : " · baru selesai"}
                        {a.judul ? <span className="block">Judul: {a.judul}</span> : null}
                        {a.akun ? <span className="block">Akun: {a.akun}</span> : null}
                        {a.platform ? <span className="block">Platform: {a.platform}</span> : null}
                        <span className="block text-[10.5px] text-teks-sekunder">{LABEL_ANIM[a.anim] ?? "Aula"}</span>
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[11.5px] text-teks-sekunder">
                        {p.layar_label ? `Membuka ${p.layar_label}` : "Online"}
                      </span>
                    )}
                    {aktif && p.layar_label ? <span className="block text-[10.5px] text-teks-sekunder">Layar: {p.layar_label}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {(terpotong || diluar > 0) && (
        <p className="mt-2 text-[11px] text-teks-sekunder">
          {terpotong ? `Daftar dipotong ${daftar.length} dari ${jumlah} orang. ` : ""}
          {diluar > 0 ? `${diluar} orang tidak digambar karena aula penuh (tetap tercantum di daftar).` : ""}
        </p>
      )}
    </GlassCard>
  );
}
