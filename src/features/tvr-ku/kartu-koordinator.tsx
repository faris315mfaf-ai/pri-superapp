"use client";

// ============================================================
// KartuKoordinator (tahap 3, 13 Okt 2026) — DI SINILAH API key otak "Nara" (agen koordinator) dipasang.
// Bagian seksi "Otak Bot" di TVR Saya master. Kunci TULIS-SAJA: setelah disimpan hanya tampil ••••abcd;
// tersimpan terenkripsi (AES-GCM) di server dan tidak pernah dikembalikan ke layar. Tanpa key, Nara tidak
// bisa berpikir (tidak bisa mengusulkan tugas). Peran/watak menentukan gaya pikirnya.
// Data: GET/POST /api/bot/koordinator.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, Network } from "lucide-react";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { getKoordinator, kirimAksiKoordinator } from "@/services";
import { LABEL_PENYEDIA, PENYEDIA_OTAK, PERAN_MAKS, PERSONA_MAKS, labelHasilUji, normalkanKepribadian, normalkanKunciApi, type PenyediaOtak } from "@/lib/bot-otak-murni";
import type { StatusKoordinator } from "@/lib/bot-koordinator-murni";
import { waktuRelatif } from "@/features/ruang-bot/peta-nyata";
import { cn } from "@/lib/utils";

const NADA = {
  ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  kurang: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  tak_tahu: "bg-black/10 text-teks-sekunder dark:bg-white/10",
} as const;

export function KartuKoordinator() {
  const versiSegar = useVersiSegar();
  const [tik, setTik] = useState(0);
  const [st, setSt] = useState<StatusKoordinator | null>(null);
  const [penyedia, setPenyedia] = useState<PenyediaOtak>("deepseek");
  const [kunci, setKunci] = useState("");
  const [kepr, setKepr] = useState<{ peran: string; persona: string } | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [hapus, setHapus] = useState(false);
  const nomor = useRef(0);

  useEffect(() => {
    const ini = ++nomor.current;
    getKoordinator()
      .then((d) => {
        if (ini !== nomor.current) return;
        setSt(d);
        if (d.penyedia) setPenyedia((lama) => (lama === "deepseek" ? d.penyedia! : lama));
      })
      .catch((e) => {
        if (ini !== nomor.current) return;
        setSt(null);
        toast("error", "Koordinator gagal dimuat", e instanceof Error ? e.message : "");
      });
    return () => {
      nomor.current++;
    };
  }, [versiSegar, tik]);

  const jalankan = useCallback(
    async (kunciAksi: string, kerja: () => Promise<void>) => {
      if (sibuk) return;
      setSibuk(kunciAksi);
      try {
        await kerja();
      } finally {
        setSibuk(null);
        setTik((t) => t + 1);
      }
    },
    [sibuk],
  );

  if (!st) return null;
  if (!st.tabel_ada) {
    return <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">Migrasi koordinator (sql/74, setelah sql/73) belum dijalankan — Nara belum bisa diatur.</p>;
  }
  const punya = st.penyedia !== null && st.kunci_samar !== "";
  const sah = normalkanKunciApi(kunci);
  const uji = labelHasilUji(st.hasil_uji);
  const k = kepr ?? { peran: st.peran, persona: st.persona };
  const sahK = normalkanKepribadian(k.peran, k.persona);

  return (
    <div className="glass mt-3 rounded-2xl border border-[#fb7185]/40 p-3">
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 shrink-0 text-[#fb7185]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-bold text-teks-utama">
            {st.nama} <span className="font-normal text-teks-sekunder">· {st.peran}</span>
          </span>
          <span className="block truncate text-[10.5px] text-teks-sekunder">
            {punya ? `${LABEL_PENYEDIA[st.penyedia!]} · ${st.kunci_samar}${st.diubah_pada ? ` · diatur ${waktuRelatif(st.diubah_pada)}` : ""}` : "belum punya API key — belum bisa berpikir atau mengusulkan tugas"}
          </span>
        </span>
        {punya && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold", NADA[uji.nada])}>{uji.teks}</span>}
      </div>
      <p className="m-0 mt-1.5 text-[10.5px] leading-relaxed text-teks-sekunder">
        Agen koordinator: membaca permintaan Anda di room Chat dan mengusulkan pembagian tugas ke agen lain. Usulannya selalu menunggu persetujuan Anda; ia tidak bisa memposting.
      </p>

      {!st.induk_siap && (
        <p className="m-0 mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          Server belum punya <b>BOT_KUNCI_INDUK</b>; API key tidak bisa disimpan dengan aman, jadi tombol Simpan dinonaktifkan.
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <select
          value={penyedia}
          onChange={(e) => setPenyedia(e.target.value as PenyediaOtak)}
          disabled={!!sibuk}
          aria-label="Penyedia untuk Nara"
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
          value={kunci}
          onChange={(e) => setKunci(e.target.value)}
          placeholder={punya ? "Tempel key baru untuk mengganti" : "Tempel API key untuk Nara"}
          aria-label="API key untuk Nara"
          autoComplete="off"
          spellCheck={false}
          disabled={!!sibuk}
          className="glass-input h-10 min-w-0 flex-1 rounded-xl px-3 text-[12.5px] text-teks-utama"
        />
      </div>
      {kunci !== "" && !sah.ok && <p className="m-0 mt-1 text-[10.5px] text-amber-600 dark:text-amber-400">{sah.pesan}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!sah.ok || !st.induk_siap || !!sibuk}
          onClick={() =>
            void jalankan("simpan", async () => {
              if (!sah.ok) return;
              try {
                await kirimAksiKoordinator({ aksi: "simpan", penyedia, kunci: sah.kunci });
                toast("sukses", "API key Nara tersimpan", "Tekan Uji untuk memeriksa");
                setKunci("");
              } catch (e) {
                toast("error", "Gagal menyimpan API key Nara", e instanceof Error ? e.message : "");
              }
            })
          }
          className="btn-tekan rounded-full bg-pri px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
        >
          {sibuk === "simpan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Simpan"}
        </button>
        {punya && (
          <button
            type="button"
            disabled={!!sibuk}
            onClick={() =>
              void jalankan("uji", async () => {
                try {
                  const r = await kirimAksiKoordinator({ aksi: "uji" });
                  if (r.sukses) toast("sukses", "API key Nara berfungsi");
                  else toast("error", "API key Nara bermasalah", r.pesan ?? "");
                } catch (e) {
                  toast("error", "Gagal menguji", e instanceof Error ? e.message : "");
                }
              })
            }
            className="btn-tekan rounded-full bg-pri/12 px-3 py-1.5 text-[11px] font-bold text-pri disabled:opacity-50"
          >
            {sibuk === "uji" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Uji"}
          </button>
        )}
        {punya &&
          (hapus ? (
            <>
              <button
                type="button"
                disabled={!!sibuk}
                onClick={() =>
                  void jalankan("hapus", async () => {
                    try {
                      await kirimAksiKoordinator({ aksi: "hapus" });
                      toast("sukses", "API key Nara dihapus");
                    } catch (e) {
                      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
                    } finally {
                      setHapus(false);
                    }
                  })
                }
                className="btn-tekan rounded-full bg-gagal/15 px-3 py-1.5 text-[11px] font-bold text-gagal"
              >
                Ya, hapus key
              </button>
              <button type="button" onClick={() => setHapus(false)} className="btn-tekan text-[11px] font-bold text-teks-sekunder">
                Batal
              </button>
            </>
          ) : (
            <button type="button" disabled={!!sibuk} onClick={() => setHapus(true)} className="btn-tekan rounded-full px-3 py-1.5 text-[11px] font-bold text-teks-sekunder disabled:opacity-50">
              Hapus
            </button>
          ))}
        <KeyRound className="ml-auto h-3.5 w-3.5 text-teks-sekunder" aria-hidden="true" />
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-bold text-pri">Peran &amp; cara berpikir Nara</summary>
        <div className="mt-2 flex flex-col gap-2">
          <input value={k.peran} onChange={(e) => setKepr({ ...k, peran: e.target.value })} maxLength={PERAN_MAKS} aria-label="Peran Nara" disabled={!!sibuk} className="glass-input h-10 w-full rounded-xl px-3 text-[12.5px] text-teks-utama" />
          <textarea value={k.persona} onChange={(e) => setKepr({ ...k, persona: e.target.value })} maxLength={PERSONA_MAKS} rows={3} aria-label="Watak Nara" disabled={!!sibuk} className="glass-input w-full resize-y rounded-xl px-3 py-2 text-[12.5px] text-teks-utama" />
          {!sahK.ok && <p className="m-0 text-[10.5px] text-amber-600 dark:text-amber-400">{sahK.pesan}</p>}
          <button
            type="button"
            disabled={!sahK.ok || !!sibuk || (k.peran === st.peran && k.persona === st.persona)}
            onClick={() =>
              void jalankan("kepr", async () => {
                if (!sahK.ok) return;
                try {
                  await kirimAksiKoordinator({ aksi: "kepribadian", peran: sahK.peran, persona: sahK.persona });
                  toast("sukses", "Kepribadian Nara tersimpan");
                  setKepr(null);
                } catch (e) {
                  toast("error", "Gagal menyimpan kepribadian", e instanceof Error ? e.message : "");
                }
              })
            }
            className="btn-tekan self-start rounded-full bg-pri px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
          >
            {sibuk === "kepr" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Simpan kepribadian"}
          </button>
        </div>
      </details>
    </div>
  );
}
