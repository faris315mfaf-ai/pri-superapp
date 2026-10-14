"use client";

// ============================================================
// OtakBot (13 Okt 2026) — bagian TVR Saya khusus master: API key LLM milik tiap
// bot supaya ia punya "otak" sendiri (hook kini; takarir & penilai menyusul).
// Kunci TULIS-SAJA: setelah disimpan layar hanya menampilkan ••••abcd; kolom
// isian dikosongkan dan kunci tidak pernah diminta kembali dari server.
// Data: GET/POST /api/bot/otak. Logika label di lib/bot-otak-murni.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { BrainCircuit, KeyRound, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { getOtakBot, kirimAksiOtakBot } from "@/services";
import {
  LABEL_PENYEDIA,
  PENYEDIA_OTAK,
  PERAN_MAKS,
  PERSONA_MAKS,
  labelHasilUji,
  normalkanKepribadian,
  normalkanKunciApi,
  type PenyediaOtak,
  type StatusOtakBot,
} from "@/lib/bot-otak-murni";
import { waktuRelatif } from "@/features/ruang-bot/peta-nyata";
import { cn } from "@/lib/utils";
import { KartuKoordinator } from "./kartu-koordinator";

const NADA = {
  ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  kurang: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  tak_tahu: "bg-black/10 text-teks-sekunder dark:bg-white/10",
} as const;

type Isian = { penyedia: PenyediaOtak; kunci: string };

export function OtakBot() {
  const versiSegar = useVersiSegar();
  const [tik, setTik] = useState(0);
  const [status, setStatus] = useState<StatusOtakBot | null>(null);
  const [isian, setIsian] = useState<Record<number, Isian>>({});
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [hapusId, setHapusId] = useState<number | null>(null);
  /** Suntingan kepribadian per bot (belum disimpan). */
  const [kepr, setKepr] = useState<Record<number, { peran: string; persona: string }>>({});
  const nomor = useRef(0);

  useEffect(() => {
    const ini = ++nomor.current;
    getOtakBot()
      .then((d) => ini === nomor.current && setStatus(d))
      .catch((e) => {
        if (ini !== nomor.current) return;
        setStatus({ tabel_ada: false, induk_siap: false, bot: [] });
        toast("error", "Otak bot gagal dimuat", e instanceof Error ? e.message : "");
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

  const ubah = (botId: number, awal: PenyediaOtak, bagian: Partial<Isian>) =>
    setIsian((s) => ({ ...s, [botId]: { ...(s[botId] ?? { penyedia: awal, kunci: "" }), ...bagian } }));

  return (
    <section>
      <SectionTitle judul="Otak Bot (API key)" />
      <GlassCard className="mt-2.5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pri/10 text-pri">
            <BrainCircuit className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-teks-sekunder">
            Beri tiap bot API key sendiri agar ia punya otak sendiri: saat ini menulis <b>hook</b> video;
            bot tanpa key memakai otak bawaan mesin. Key disimpan terenkripsi di server, tidak bisa dilihat
            lagi setelah disimpan, dan tidak pernah dikirim ke Rumah Bot.
          </p>
        </div>

        <KartuKoordinator />

        {status === null ? (
          <GlassSkeleton className="mt-3 h-28 rounded-2xl" />
        ) : !status.tabel_ada ? (
          <p className="mt-3 text-center text-[11.5px] text-teks-sekunder">Migrasi otak bot (sql/69) belum dijalankan.</p>
        ) : (
          <>
            {!status.induk_siap && (
              <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                Server belum punya <b>BOT_KUNCI_INDUK</b>. Tanpa itu API key tidak bisa disimpan dengan aman,
                jadi tombol Simpan dinonaktifkan.
              </p>
            )}
            {status.bot.length === 0 ? (
              <p className="mt-3 text-[11.5px] text-teks-sekunder">Belum ada bot. Buat bot di Profil → Kelola Bot.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {status.bot.map((b) => {
                  const f = isian[b.bot_id] ?? { penyedia: b.penyedia ?? "deepseek", kunci: "" };
                  const sah = normalkanKunciApi(f.kunci);
                  const uji = labelHasilUji(b.hasil_uji);
                  const punya = b.penyedia !== null;
                  return (
                    <li key={b.bot_id} className="glass rounded-2xl p-3">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-bold text-teks-utama">{b.nama}</span>
                          <span className="block truncate text-[10.5px] text-teks-sekunder">
                            {punya
                              ? `${LABEL_PENYEDIA[b.penyedia as PenyediaOtak]} · ${b.kunci_samar}${b.diubah_pada ? ` · diatur ${waktuRelatif(b.diubah_pada)}` : ""}`
                              : "belum punya API key (memakai otak bawaan mesin)"}
                          </span>
                        </span>
                        {punya && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold", NADA[uji.nada])}>{uji.teks}</span>}
                      </div>

                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] font-bold text-pri">Peran &amp; cara berpikir (watak)</summary>
                        {(() => {
                          const k = kepr[b.bot_id] ?? { peran: b.peran, persona: b.persona };
                          const sahK = normalkanKepribadian(k.peran, k.persona);
                          const berubah = k.peran !== b.peran || k.persona !== b.persona;
                          return (
                            <div className="mt-2 flex flex-col gap-2">
                              <input
                                value={k.peran}
                                onChange={(e) => setKepr((s) => ({ ...s, [b.bot_id]: { ...k, peran: e.target.value } }))}
                                maxLength={PERAN_MAKS}
                                placeholder="Peran, mis. Redaktur Pencari"
                                aria-label={`Peran ${b.nama}`}
                                disabled={!!sibuk}
                                className="glass-input h-10 w-full rounded-xl px-3 text-[12.5px] text-teks-utama"
                              />
                              <textarea
                                value={k.persona}
                                onChange={(e) => setKepr((s) => ({ ...s, [b.bot_id]: { ...k, persona: e.target.value } }))}
                                maxLength={PERSONA_MAKS}
                                rows={3}
                                placeholder="Watak dan cara berpikir: apa yang ia utamakan, gaya bahasanya, kebiasaannya."
                                aria-label={`Watak ${b.nama}`}
                                disabled={!!sibuk}
                                className="glass-input w-full resize-y rounded-xl px-3 py-2 text-[12.5px] text-teks-utama"
                              />
                              <p className="m-0 text-[10.5px] text-teks-sekunder">Memengaruhi gaya hook, caption, dan jawaban chat bot ini. Aturan keselamatan dan fakta tidak berubah.</p>
                              {!sahK.ok && <p className="m-0 text-[10.5px] text-amber-600 dark:text-amber-400">{sahK.pesan}</p>}
                              <button
                                type="button"
                                disabled={!berubah || !sahK.ok || !!sibuk}
                                onClick={() =>
                                  void jalankan(`kepr:${b.bot_id}`, async () => {
                                    if (!sahK.ok) return;
                                    try {
                                      await kirimAksiOtakBot({ aksi: "kepribadian", bot_id: b.bot_id, peran: sahK.peran, persona: sahK.persona });
                                      toast("sukses", "Kepribadian tersimpan", b.nama);
                                      setKepr((s) => {
                                        const { [b.bot_id]: _hapus, ...sisa } = s;
                                        void _hapus;
                                        return sisa;
                                      });
                                    } catch (e) {
                                      toast("error", "Gagal menyimpan kepribadian", e instanceof Error ? e.message : "");
                                    }
                                  })
                                }
                                className="btn-tekan self-start rounded-full bg-pri px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                              >
                                {sibuk === `kepr:${b.bot_id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Simpan kepribadian"}
                              </button>
                            </div>
                          );
                        })()}
                      </details>

                      <div className="mt-2 flex gap-2">
                        <select
                          value={f.penyedia}
                          onChange={(e) => ubah(b.bot_id, b.penyedia ?? "deepseek", { penyedia: e.target.value as PenyediaOtak })}
                          disabled={!!sibuk}
                          aria-label={`Penyedia untuk ${b.nama}`}
                          className="glass-input h-10 shrink-0 rounded-xl px-2 text-[12px] text-teks-utama"
                        >
                          {PENYEDIA_OTAK.map((p) => (
                            <option key={p} value={p}>
                              {LABEL_PENYEDIA[p]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="password"
                          value={f.kunci}
                          onChange={(e) => ubah(b.bot_id, b.penyedia ?? "deepseek", { kunci: e.target.value })}
                          placeholder={punya ? "Tempel key baru untuk mengganti" : "Tempel API key"}
                          aria-label={`API key untuk ${b.nama}`}
                          autoComplete="off"
                          spellCheck={false}
                          disabled={!!sibuk}
                          className="glass-input h-10 min-w-0 flex-1 rounded-xl px-3 text-[12.5px] text-teks-utama"
                        />
                      </div>
                      {f.kunci !== "" && !sah.ok && <p className="mt-1 text-[10.5px] text-amber-600 dark:text-amber-400">{sah.pesan}</p>}

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!sah.ok || !status.induk_siap || !!sibuk}
                          onClick={() =>
                            void jalankan(`simpan:${b.bot_id}`, async () => {
                              if (!sah.ok) return;
                              try {
                                await kirimAksiOtakBot({ aksi: "simpan", bot_id: b.bot_id, penyedia: f.penyedia, kunci: sah.kunci });
                                toast("sukses", "API key tersimpan", `${b.nama} · tekan Uji untuk memeriksa`);
                                setIsian((s) => ({ ...s, [b.bot_id]: { penyedia: f.penyedia, kunci: "" } }));
                              } catch (e) {
                                toast("error", "Gagal menyimpan API key", e instanceof Error ? e.message : "");
                              }
                            })
                          }
                          className="btn-tekan rounded-full bg-pri px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                        >
                          {sibuk === `simpan:${b.bot_id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Simpan"}
                        </button>
                        {punya && (
                          <button
                            type="button"
                            disabled={!!sibuk}
                            onClick={() =>
                              void jalankan(`uji:${b.bot_id}`, async () => {
                                try {
                                  const r = await kirimAksiOtakBot({ aksi: "uji", bot_id: b.bot_id });
                                  if (r.sukses) toast("sukses", "API key berfungsi", b.nama);
                                  else toast("error", "API key bermasalah", r.pesan ?? "");
                                } catch (e) {
                                  toast("error", "Gagal menguji", e instanceof Error ? e.message : "");
                                }
                              })
                            }
                            className="btn-tekan rounded-full bg-pri/12 px-3 py-1.5 text-[11px] font-bold text-pri disabled:opacity-50"
                          >
                            {sibuk === `uji:${b.bot_id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Uji"}
                          </button>
                        )}
                        {punya &&
                          (hapusId === b.bot_id ? (
                            <>
                              <button
                                type="button"
                                disabled={!!sibuk}
                                onClick={() =>
                                  void jalankan(`hapus:${b.bot_id}`, async () => {
                                    try {
                                      await kirimAksiOtakBot({ aksi: "hapus", bot_id: b.bot_id });
                                      toast("sukses", "API key dihapus", b.nama);
                                    } catch (e) {
                                      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
                                    } finally {
                                      setHapusId(null);
                                    }
                                  })
                                }
                                className="btn-tekan rounded-full bg-gagal/15 px-3 py-1.5 text-[11px] font-bold text-gagal"
                              >
                                Ya, hapus key
                              </button>
                              <button type="button" onClick={() => setHapusId(null)} className="btn-tekan text-[11px] font-bold text-teks-sekunder">
                                Batal
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={!!sibuk}
                              onClick={() => setHapusId(b.bot_id)}
                              className="btn-tekan rounded-full px-3 py-1.5 text-[11px] font-bold text-teks-sekunder disabled:opacity-50"
                            >
                              Hapus
                            </button>
                          ))}
                      </div>
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
