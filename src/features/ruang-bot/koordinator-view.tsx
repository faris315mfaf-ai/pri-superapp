"use client";

// ============================================================
// KoordinatorView (tahap 3, 13 Okt 2026) — tab "Koordinator" di Ruang Bot (HANYA mode nyata, master).
//
// Nara membaca permintaan Anda dan keadaan nyata agen, lalu MENGUSULKAN pembagian tugas dengan aksi dari
// daftar tertutup. Di sini Anda memberi arahan (masuk ke room Chat), melihat usulan yang menunggu, dan
// menyetujui/menolaknya. Menyetujui = langsung menjalankan lewat pagar yang berlaku; hasil video tetap
// berhenti di Antrean ACC. Tanpa API key Nara tidak bisa berpikir (diatur di TVR Saya → Otak Bot).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { getKoordinator, kirimChatBot, kirimKeputusanUsulan } from "@/services";
import { LABEL_PENYEDIA, labelHasilUji } from "@/lib/bot-otak-murni";
import type { StatusKoordinator } from "@/lib/bot-koordinator-murni";
import { KartuUsulan } from "./kartu-usulan";
import { waktuRelatif } from "./peta-nyata";

const CONTOH = ["kerjakan berita banjir dari https://youtu.be/… untuk @Raka", "jeda @Sinta", "naikkan kuota @Raka jadi 4", "cari video sekarang untuk @Sinta"];

export function KoordinatorView() {
  const [status, setStatus] = useState<StatusKoordinator | null>(null);
  const [galat, setGalat] = useState("");
  const [teks, setTeks] = useState("");
  const [kirim, setKirim] = useState(false);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [cepat, setCepat] = useState(false);
  const nomor = useRef(0);
  const hidup = useRef(true);
  const sibukRef = useRef<string | null>(null);
  const batasCepat = useRef(0);

  const muat = useCallback(async () => {
    const ini = ++nomor.current;
    try {
      const d = await getKoordinator();
      if (ini !== nomor.current || !hidup.current || sibukRef.current) return;
      setStatus(d);
      setGalat("");
    } catch (e) {
      if (ini !== nomor.current || !hidup.current) return;
      setGalat(e instanceof Error ? e.message : "Gagal memuat koordinator.");
    }
  }, []);

  useEffect(() => {
    hidup.current = true;
    return () => {
      hidup.current = false;
    };
  }, []);
  useEffect(() => {
    void Promise.resolve().then(muat);
  }, [muat]);
  useSegarOtomatis(() => void muat(), 15);

  // Polling cepat sementara menunggu Nara berpikir (maks ±45 dtk).
  useEffect(() => {
    if (!cepat) return;
    const t = setInterval(() => {
      if (Date.now() > batasCepat.current) setCepat(false);
      else void muat();
    }, 3000);
    return () => clearInterval(t);
  }, [cepat, muat]);

  const kirimArahan = async () => {
    const v = teks.trim();
    if (!v || kirim) return;
    setKirim(true);
    try {
      await kirimChatBot(/@nara|@koordinator/i.test(v) ? v : `@Nara ${v}`);
      setTeks("");
      batasCepat.current = Date.now() + 45_000;
      setCepat(true);
      toast("info", "Arahan dikirim ke room Chat", "Usulan Nara muncul di sini dalam beberapa detik.");
      await muat();
    } catch (e) {
      toast("error", "Arahan gagal dikirim", e instanceof Error ? e.message : "");
    } finally {
      setKirim(false);
    }
  };

  const putuskan = useCallback(
    async (aksi: "setuju" | "tolak", id: number) => {
      if (sibukRef.current) return;
      sibukRef.current = `${aksi}:${id}`;
      setSibuk(`${aksi}:${id}`);
      try {
        const r = await kirimKeputusanUsulan(aksi, id);
        toast(r.sukses ? "sukses" : "peringatan", aksi === "setuju" ? "Usulan disetujui" : "Usulan ditolak", r.pesan);
      } catch (e) {
        toast("error", "Keputusan gagal", e instanceof Error ? e.message : "");
      } finally {
        sibukRef.current = null;
        if (hidup.current) setSibuk(null);
        void muat();
      }
    },
    [muat],
  );

  if (status === null) {
    return galat ? <GlassCard className="p-6 text-center text-sm text-teks-sekunder">Koordinator gagal dimuat: {galat}</GlassCard> : <GlassSkeleton className="h-64 rounded-2xl" />;
  }
  if (!status.tabel_ada) {
    return <GlassCard className="p-6 text-center text-sm text-teks-sekunder">Migrasi koordinator (sql/74, setelah sql/73) belum dijalankan.</GlassCard>;
  }
  const punyaKunci = status.penyedia !== null && status.kunci_samar !== "";
  const uji = labelHasilUji(status.hasil_uji);

  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-3.5">
        {!punyaKunci && (
          <p role="status" className="m-0 rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
            <b>{status.nama} belum punya API key</b>, jadi ia belum bisa berpikir atau mengusulkan apa pun. Pasang di <b>TVR Saya → Otak Bot → Koordinator</b>
            {status.induk_siap ? "." : " (server juga belum punya BOT_KUNCI_INDUK)."}
          </p>
        )}

        <GlassCard className="p-3.5">
          <h2 className="m-0 mb-2 font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-teks-sekunder">Usulan menunggu Anda</h2>
          {status.terbuka.length === 0 ? (
            <p className="m-0 text-[12.5px] text-teks-sekunder">Tidak ada usulan menunggu. Beri arahan ke {status.nama} di bawah, atau tulis <b>@Nara …</b> di room Chat.</p>
          ) : (
            <div className="grid gap-2.5">
              {status.terbuka.map((u) => (
                <KartuUsulan key={u.id} u={u} sibuk={sibuk} onKeputusan={(a, id) => void putuskan(a, id)} />
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-3.5">
          <h2 className="m-0 mb-2 font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-teks-sekunder">Riwayat usulan</h2>
          {status.riwayat.length === 0 ? (
            <p className="m-0 text-[12.5px] text-teks-sekunder">Belum ada keputusan.</p>
          ) : (
            <div className="grid gap-2">
              {status.riwayat.map((u) => (
                <KartuUsulan key={u.id} u={u} sibuk={null} onKeputusan={() => {}} />
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      <aside className="min-w-0 space-y-3.5">
        <GlassCard className="p-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fb7185]/20 font-heading text-[15px] font-bold text-[#fb7185]">N</span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14px] text-[#fb7185]">{status.nama}</b>
              <span className="block text-[11px] text-teks-sekunder">{status.peran}</span>
            </span>
          </div>
          {status.persona && <p className="m-0 mt-2 text-[11.5px] leading-relaxed text-teks-sekunder">{status.persona}</p>}
          <dl className="m-0 mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
            <dt className="text-teks-sekunder">Otak</dt>
            <dd className="m-0">
              {punyaKunci ? (
                <>
                  <span className="rounded-full bg-sukses/15 px-2 py-px text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400">aktif</span> {LABEL_PENYEDIA[status.penyedia!]} {status.kunci_samar}
                </>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-2 py-px text-[10.5px] font-bold text-amber-700 dark:text-amber-300">tanpa API key</span>
              )}
            </dd>
            {punyaKunci && (
              <>
                <dt className="text-teks-sekunder">Uji</dt>
                <dd className="m-0">
                  {uji.teks}
                  {status.teruji_pada ? ` · ${waktuRelatif(status.teruji_pada)}` : ""}
                </dd>
              </>
            )}
            <dt className="text-teks-sekunder">Mode</dt>
            <dd className="m-0">Usulan wajib disetujui</dd>
          </dl>
        </GlassCard>

        <GlassCard className="p-3.5">
          <h2 className="m-0 mb-2 font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-teks-sekunder">Beri arahan</h2>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void kirimArahan();
            }}
          >
            <label htmlFor="kv-arahan" className="sr-only">
              Arahan untuk {status.nama}
            </label>
            <textarea
              id="kv-arahan"
              value={teks}
              onChange={(e) => setTeks(e.target.value)}
              rows={3}
              maxLength={900}
              placeholder={`Tulis arahan untuk ${status.nama}…`}
              disabled={kirim || !punyaKunci}
              className="glass-input min-h-[64px] flex-1 resize-none rounded-xl px-3 py-2 text-base text-teks-utama sm:text-[13px]"
            />
            <button type="submit" disabled={kirim || !punyaKunci || teks.trim() === ""} aria-label="Kirim arahan" className="btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pri text-white disabled:opacity-50">
              {kirim ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CONTOH.map((c) => (
              <button key={c} type="button" onClick={() => setTeks(c)} className="btn-tekan rounded-full border border-glass-border px-2.5 py-1 text-[11px] text-teks-sekunder">
                {c}
              </button>
            ))}
          </div>
          {cepat && (
            <p className="m-0 mt-2 flex items-center gap-1.5 text-[11.5px] text-teks-sekunder">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {status.nama} sedang berpikir…
            </p>
          )}
          <p className="m-0 mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
            Arahan masuk ke room Chat. Nara hanya mengusulkan lima jenis aksi (kerjakan tautan, cari sekarang, ubah kuota, jeda, lanjutkan); ia tidak bisa memposting, dan agen tanpa API key tidak bisa diberi tugas.
          </p>
        </GlassCard>
      </aside>
    </div>
  );
}
