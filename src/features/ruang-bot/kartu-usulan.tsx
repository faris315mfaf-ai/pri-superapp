"use client";

// Kartu satu usulan koordinator (Nara): aksi, agen sasaran, alasan, hasil pemeriksaan pagar, Setujui/Tolak.
// Dipakai di tab Koordinator dan di room Chat. Agen tidur (tanpa API key) → Setujui dinonaktifkan.
import { Loader2 } from "lucide-react";
import type { TandaPagar, UsulanApi } from "@/lib/bot-koordinator-murni";
import { cn } from "@/lib/utils";

const KELAS_TANDA: Record<TandaPagar[0], string> = {
  ok: "bg-sukses/15 text-emerald-700 dark:text-emerald-400",
  warn: "bg-emas/20 text-amber-700 dark:text-amber-300",
  bad: "bg-gagal/15 text-red-700 dark:text-red-400",
};
const LABEL_STATUS: Record<UsulanApi["status"], string> = {
  menunggu: "Menunggu Anda",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  dijalankan: "Dijalankan",
  gagal: "Gagal dijalankan",
  kedaluwarsa: "Kedaluwarsa",
};
const KELAS_STATUS: Record<UsulanApi["status"], string> = {
  menunggu: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  disetujui: "bg-sukses/15 text-emerald-700 dark:text-emerald-400",
  dijalankan: "bg-sukses/15 text-emerald-700 dark:text-emerald-400",
  ditolak: "bg-gagal/15 text-red-700 dark:text-red-400",
  gagal: "bg-gagal/15 text-red-700 dark:text-red-400",
  kedaluwarsa: "bg-black/10 text-teks-sekunder dark:bg-white/10",
};

export function KartuUsulan({ u, sibuk, onKeputusan }: { u: UsulanApi; sibuk: string | null; onKeputusan: (aksi: "setuju" | "tolak", id: number) => void }) {
  const menunggu = u.status === "menunggu";
  const pagar: TandaPagar[] = menunggu && u.bot_tidur ? [["bad", `${u.bot_nama} tertidur: belum punya API key`], ...u.pagar] : u.pagar;
  const sibukIni = sibuk?.endsWith(`:${u.id}`) ?? false;
  return (
    <div className="rounded-xl border border-glass-border border-t-[3px] border-t-[#fb7185] bg-black/[0.03] p-2.5 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-[#fb7185] px-1.5 py-px font-mono text-[10px] font-bold uppercase tracking-wide text-[#fb7185]">{u.aksi_label}</span>
        <b className="text-[12.5px] text-teks-utama">{u.bot_nama}</b>
        <span className={cn("rounded-full px-2 py-px text-[10.5px] font-bold", KELAS_STATUS[u.status])}>{LABEL_STATUS[u.status]}</span>
        <span className="ml-auto text-[10px] text-teks-sekunder">#{u.id}</span>
      </div>
      <p className="m-0 mt-1 text-[12.5px] font-semibold text-teks-utama">{u.judul}</p>
      {(u.param.url || u.param.topik || u.param.kuota !== undefined) && (
        <p className="m-0 mt-0.5 break-words text-[11.5px] text-teks-sekunder">
          {u.param.url ? `${u.param.url} ` : ""}
          {u.param.topik ? `· ${u.param.topik} ` : ""}
          {u.param.kuota !== undefined ? `· kuota ${u.param.kuota}` : ""}
        </p>
      )}
      {u.alasan && <p className="m-0 mt-1 text-[11.5px] text-teks-sekunder">Alasan Nara: {u.alasan}</p>}
      <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-1 p-0" aria-label="Hasil pemeriksaan pagar">
        {pagar.map((t, i) => (
          <li key={`${t[1]}-${i}`} className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", KELAS_TANDA[t[0]])}>
            {t[1]}
          </li>
        ))}
      </ul>
      {u.hasil && !menunggu && <p className="m-0 mt-1.5 text-[11.5px] text-teks-sekunder">Hasil: {u.hasil}</p>}
      {menunggu && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={!!sibuk || u.bot_tidur}
            title={u.bot_tidur ? "Agen tertidur: pasang API key dulu di Otak Bot" : undefined}
            onClick={() => onKeputusan("setuju", u.id)}
            className="btn-tekan min-h-10 rounded-xl border border-sukses/50 bg-sukses/10 px-3.5 text-[12.5px] font-bold text-emerald-700 disabled:opacity-50 dark:text-emerald-300"
          >
            {sibuk === `setuju:${u.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Setujui & jalankan"}
          </button>
          <button
            type="button"
            disabled={!!sibuk}
            onClick={() => onKeputusan("tolak", u.id)}
            className="btn-tekan min-h-10 rounded-xl border border-gagal/50 px-3.5 text-[12.5px] font-bold text-red-600 disabled:opacity-50 dark:text-red-400"
          >
            {sibukIni && sibuk === `tolak:${u.id}` ? "…" : "Tolak"}
          </button>
        </div>
      )}
    </div>
  );
}
