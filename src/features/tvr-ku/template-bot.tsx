"use client";

// ============================================================
// TemplateBot (13 Okt 2026) — bagian TVR Saya khusus master: pustaka template
// bernama untuk bot. Alur: (1) bangun template di TVR Saya akun Anda atau akun
// bot (Edit Otomatis → Template), (2) simpan ke pustaka dengan nama, (3) pasang
// ke satu bot atau semua bot. Berkas disalin di mesin; bot memakai salinannya
// sendiri (mengubah template sumber kemudian tidak mengubah yang terpasang).
// Data: GET/POST /api/bot/template. Logika label di lib/bot-template-murni.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Download, Loader2, Package, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { getTemplateBot, kirimAksiTemplateBot } from "@/services";
import {
  NAMA_TEMPLATE_MAKS,
  formatUkuran,
  labelKeadaan,
  normalkanNamaTemplate,
  type StatusTemplateBot,
} from "@/lib/bot-template-murni";
import { cn } from "@/lib/utils";

const NADA = {
  ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  kurang: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  tak_tahu: "bg-black/10 text-teks-sekunder dark:bg-white/10",
} as const;

export function TemplateBot() {
  const versiSegar = useVersiSegar();
  const [tik, setTik] = useState(0);
  const [status, setStatus] = useState<StatusTemplateBot | null>(null);
  const [nama, setNama] = useState("");
  const [dari, setDari] = useState<number | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [hapusId, setHapusId] = useState<number | null>(null);
  const nomor = useRef(0);

  useEffect(() => {
    const ini = ++nomor.current;
    getTemplateBot()
      .then((d) => {
        if (ini !== nomor.current) return;
        setStatus(d);
        setDari((lama) => lama ?? d.akun_sumber[0]?.user_id ?? null);
      })
      .catch((e) => {
        if (ini !== nomor.current) return;
        setStatus({ tabel_ada: false, template: [], bot: [], akun_sumber: [] });
        toast("error", "Pustaka template gagal dimuat", e instanceof Error ? e.message : "");
      });
    return () => {
      nomor.current++;
    };
  }, [versiSegar, tik]);

  const jalankan = useCallback(
    async (kunci: string, kerja: () => Promise<void>) => {
      if (sibuk) return;
      setSibuk(kunci);
      try {
        await kerja();
      } finally {
        setSibuk(null);
        setTik((t) => t + 1);
      }
    },
    [sibuk],
  );

  const sumberDipilih = status?.akun_sumber.find((a) => a.user_id === dari);
  const namaSah = normalkanNamaTemplate(nama);
  const bisaSimpan = namaSah.ok && sumberDipilih?.mesin?.siap === true && !sibuk;

  return (
    <section>
      <SectionTitle judul="Template Bot" />
      <GlassCard className="mt-2.5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pri/10 text-pri">
            <Package className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-teks-sekunder">
            Bangun template di TVR Saya akun Anda (atau akun bot) lewat Edit Otomatis → Template, tetapkan,
            lalu simpan di sini dengan nama. Template yang dipasang ke bot adalah <b>salinan</b>: mengubah
            template sumber sesudahnya tidak mengubah yang sudah terpasang.
          </p>
        </div>

        {status === null ? (
          <GlassSkeleton className="mt-3 h-28 rounded-2xl" />
        ) : !status.tabel_ada ? (
          <p className="mt-3 text-center text-[11.5px] text-teks-sekunder">
            Migrasi pustaka template (sql/68) belum dijalankan.
          </p>
        ) : (
          <>
            {/* 1. Simpan ke pustaka */}
            <p className="mt-4 text-[12px] font-bold text-teks-utama">Simpan template ke pustaka</p>
            <label className="mt-1.5 block text-[10.5px] text-teks-sekunder" htmlFor="tb-dari">
              Ambil dari akun
            </label>
            <select
              id="tb-dari"
              value={dari ?? ""}
              onChange={(e) => setDari(Number(e.target.value))}
              disabled={!!sibuk}
              className="glass-input mt-1 h-10 w-full rounded-xl px-3 text-[12.5px] text-teks-utama"
            >
              {status.akun_sumber.map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {a.jenis === "master" ? `Akun saya (${a.nama || a.username})` : `${a.nama} (@${a.username})`} — {labelKeadaan(a.mesin).teks}
                </option>
              ))}
            </select>
            <input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              maxLength={NAMA_TEMPLATE_MAKS}
              placeholder="Nama template, mis. Berita Pagi"
              aria-label="Nama template"
              disabled={!!sibuk}
              className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
            />
            {nama.trim() !== "" && !namaSah.ok && <p className="mt-1 text-[10.5px] text-amber-600 dark:text-amber-400">{namaSah.pesan}</p>}
            {sumberDipilih && sumberDipilih.mesin?.siap !== true && (
              <p className="mt-1 text-[10.5px] text-amber-600 dark:text-amber-400">
                Akun ini belum punya template TVR yang siap. Buat dan tetapkan dulu di TVR Saya.
              </p>
            )}
            <button
              type="button"
              disabled={!bisaSimpan}
              onClick={() =>
                void jalankan("simpan", async () => {
                  if (!namaSah.ok || dari === null) return;
                  try {
                    await kirimAksiTemplateBot({ aksi: "simpan", nama: namaSah.nama, dari });
                    setNama("");
                    toast("sukses", "Template tersimpan di pustaka", namaSah.nama);
                  } catch (e) {
                    toast("error", "Gagal menyimpan template", e instanceof Error ? e.message : "");
                  }
                })
              }
              className="btn-tekan mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            >
              {sibuk === "simpan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Simpan ke pustaka
            </button>

            {/* 2. Pustaka */}
            <p className="mt-5 text-[12px] font-bold text-teks-utama">Pustaka ({status.template.length})</p>
            {status.template.length === 0 ? (
              <p className="mt-1 text-[11.5px] text-teks-sekunder">Belum ada template di pustaka.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {status.template.map((t) => {
                  const terpakai = status.bot.filter((b) => b.template_id === t.id).map((b) => b.nama);
                  return (
                    <li key={t.id} className="glass rounded-2xl p-3">
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-bold text-teks-utama">{t.nama}</span>
                          <span className="block text-[10.5px] text-teks-sekunder">
                            {formatUkuran(t.ukuran_byte)}
                            {t.sumber ? ` · dari ${t.sumber}` : ""}
                            {terpakai.length > 0 ? ` · terpasang di ${terpakai.join(", ")}` : ""}
                          </span>
                        </span>
                        {hapusId === t.id ? (
                          <span className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              disabled={!!sibuk}
                              onClick={() =>
                                void jalankan(`hapus:${t.id}`, async () => {
                                  try {
                                    await kirimAksiTemplateBot({ aksi: "hapus", template_id: t.id });
                                    toast("sukses", "Template dihapus dari pustaka", t.nama);
                                  } catch (e) {
                                    toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
                                  } finally {
                                    setHapusId(null);
                                  }
                                })
                              }
                              className="btn-tekan rounded-full bg-gagal/15 px-3 py-1.5 text-[11px] font-bold text-gagal"
                            >
                              {sibuk === `hapus:${t.id}` ? "…" : "Ya, hapus"}
                            </button>
                            <button type="button" onClick={() => setHapusId(null)} className="btn-tekan text-[11px] font-bold text-teks-sekunder">
                              Batal
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setHapusId(t.id)}
                            disabled={!!sibuk}
                            aria-label={`Hapus template ${t.nama}`}
                            className="btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-teks-sekunder"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {status.bot.map((b) => (
                          <button
                            key={b.bot_id}
                            type="button"
                            disabled={!!sibuk}
                            onClick={() =>
                              void jalankan(`pasang:${t.id}:${b.bot_id}`, async () => {
                                try {
                                  const r = await kirimAksiTemplateBot({ aksi: "pasang", template_id: t.id, bot_id: b.bot_id });
                                  const h = r.hasil?.[0];
                                  if (h && !h.ok) toast("error", `Gagal memasang ke ${b.nama}`, h.pesan);
                                  else toast("sukses", `Terpasang ke ${b.nama}`, t.nama);
                                } catch (e) {
                                  toast("error", "Gagal memasang", e instanceof Error ? e.message : "");
                                }
                              })
                            }
                            className="btn-tekan rounded-full bg-pri/12 px-3 py-1.5 text-[11px] font-bold text-pri disabled:opacity-50"
                          >
                            {sibuk === `pasang:${t.id}:${b.bot_id}` ? "…" : `Pasang ke ${b.nama}`}
                          </button>
                        ))}
                        {status.bot.length > 1 && (
                          <button
                            type="button"
                            disabled={!!sibuk}
                            onClick={() =>
                              void jalankan(`pasang:${t.id}:semua`, async () => {
                                try {
                                  const r = await kirimAksiTemplateBot({ aksi: "pasang", template_id: t.id, bot_id: "semua" });
                                  const gagal = (r.hasil ?? []).filter((h) => !h.ok);
                                  if (gagal.length > 0) toast("peringatan", "Sebagian gagal", gagal.map((h) => `${h.nama}: ${h.pesan}`).join(" · "));
                                  else toast("sukses", "Terpasang ke semua bot", t.nama);
                                } catch (e) {
                                  toast("error", "Gagal memasang", e instanceof Error ? e.message : "");
                                }
                              })
                            }
                            className="btn-tekan rounded-full bg-pri px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                          >
                            {sibuk === `pasang:${t.id}:semua` ? "…" : "Pasang ke semua bot"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* 3. Keadaan tiap bot */}
            <p className="mt-5 text-[12px] font-bold text-teks-utama">Template tiap bot</p>
            {status.bot.length === 0 ? (
              <p className="mt-1 text-[11.5px] text-teks-sekunder">Belum ada bot. Buat bot di Profil → Kelola Bot.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {status.bot.map((b) => {
                  const l = labelKeadaan(b.mesin);
                  return (
                    <li key={b.bot_id} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5">
                      <Bot className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold text-teks-utama">{b.nama}</span>
                        <span className="block truncate text-[10.5px] text-teks-sekunder">
                          {b.template_nama ? `terakhir dipasang: ${b.template_nama}` : "belum dipasang dari pustaka"}
                        </span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold", NADA[l.nada])}>{l.teks}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </GlassCard>
    </section>
  );
}
