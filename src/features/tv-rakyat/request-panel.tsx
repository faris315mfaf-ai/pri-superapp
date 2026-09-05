"use client";

// ============================================================
// RequestPanel — TV Rakyat Official → REQUEST VIDEO ke seluruh anggota
// (5 Sep 2026, khusus Pimpinan Redaksi / pengurus). Pimred mengunggah
// video bahan (R2) atau menempel tautan, menulis arahan, lalu semua anggota
// mendapat notifikasi & tombol "Kerjakan" di TV Rakyat Saya. Panel ini
// memantau siapa yang mengerjakan / sudah selesai, dan bisa menutup request.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Send, Upload, Users, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { getRequestVideo, requestVideoAksi, siapkanRequestVideo, type DataRequestVideo } from "@/services";
import { waktuJelasWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

const MERAH = "linear-gradient(135deg, #DC2626, #B91C1C)";

export function RequestPanel() {
  const versiSegar = useVersiSegar();
  const [data, setData] = useState<DataRequestVideo | null>(null);
  const [judul, setJudul] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [link, setLink] = useState("");
  const [berkas, setBerkas] = useState<File | null>(null);
  const [progres, setProgres] = useState<string>("");
  const [sibuk, setSibuk] = useState("");
  const [buka, setBuka] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let hidup = true;
    getRequestVideo()
      .then((d) => hidup && setData(d))
      .catch((e) => hidup && toast("error", "Request gagal dimuat", e instanceof Error ? e.message : ""));
    return () => {
      hidup = false;
    };
  }, [versiSegar]);

  async function kirim() {
    if (sibuk) return;
    if (judul.trim().length < 3) return toast("peringatan", "Judul terlalu pendek", "Minimal 3 huruf.");
    if (!link.trim() && !berkas) return toast("peringatan", "Bahan video kosong", "Tempel tautan video atau pilih berkas.");
    setSibuk("buat");
    try {
      let r2Key = "";
      if (berkas) {
        setProgres("Menyiapkan unggahan…");
        const s = await siapkanRequestVideo(berkas.name, berkas.size);
        setProgres(`Mengunggah ${Math.round(berkas.size / 1024 / 1024)} MB…`);
        const put = await fetch(s.url, { method: "PUT", body: berkas, headers: { "Content-Type": berkas.type || "video/mp4" } });
        if (!put.ok) throw new Error(`Unggah gagal (${put.status}).`);
        r2Key = s.r2_key;
      }
      setProgres("Mengirim request ke semua anggota…");
      const r = await requestVideoAksi("buat", { judul: judul.trim(), keterangan: keterangan.trim(), video_url: link.trim(), r2_key: r2Key });
      setData(r);
      setJudul("");
      setKeterangan("");
      setLink("");
      setBerkas(null);
      if (inputRef.current) inputRef.current.value = "";
      toast("sukses", "Request terkirim", "Semua anggota mendapat notifikasi dan tombol Kerjakan di TV Rakyat Saya.");
    } catch (e) {
      toast("error", "Gagal membuat request", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
      setProgres("");
    }
  }

  async function tutup(id: string) {
    if (sibuk) return;
    setSibuk(`tutup:${id}`);
    try {
      setData(await requestVideoAksi("tutup", { id }));
      toast("sukses", "Request ditutup");
    } catch (e) {
      toast("error", "Gagal menutup", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <GlassCard className="p-4">
        <p className="text-[12.5px] font-bold text-teks-utama">Buat request video</p>
        <p className="mt-0.5 text-[11px] text-teks-sekunder">Video bahan + arahan dikirim ke seluruh anggota. Yang menekan Kerjakan akan tercatat otomatis saat mengunggah.</p>
        <input value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={120} placeholder="Judul request (mis. Reaksi warga soal harga beras)" aria-label="Judul request" className="glass-input mt-3 h-11 w-full rounded-xl px-3 text-[13px] text-teks-utama" />
        <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} maxLength={1500} rows={3} placeholder="Arahan: sudut pandang, durasi, caption yang diinginkan…" aria-label="Arahan request" className="glass-input mt-2 w-full rounded-xl px-3 py-2 text-[12.5px] text-teks-utama" />
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Tautan video bahan (https://…) — opsional bila unggah berkas" aria-label="Tautan video bahan" className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-[12.5px] text-teks-utama" />
        <label className="glass mt-2 flex h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-[12px] font-bold text-teks-utama">
          <Upload className="h-4 w-4 text-pri" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{berkas ? `${berkas.name} · ${Math.round(berkas.size / 1024 / 1024)} MB` : "Atau unggah berkas video (maks 200 MB)"}</span>
          {berkas ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setBerkas(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              aria-label="Hapus berkas"
              className="text-gagal"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />
        </label>
        <button type="button" onClick={() => void kirim()} disabled={Boolean(sibuk)} className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-extrabold text-white disabled:opacity-60" style={{ background: MERAH }}>
          {sibuk === "buat" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          {sibuk === "buat" ? progres || "Mengirim…" : "Kirim request ke semua anggota"}
        </button>
      </GlassCard>

      {!data ? (
        <GlassSkeleton className="h-24 rounded-2xl" />
      ) : data.request.length === 0 ? (
        <p className="text-[11.5px] text-teks-sekunder">Belum ada request.</p>
      ) : (
        data.request.map((r) => {
          const terbuka = buka === r.id;
          return (
            <GlassCard key={r.id} className="p-3.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold leading-snug text-teks-utama">{r.judul}</p>
                  <p className="text-[10.5px] text-teks-sekunder">
                    {waktuJelasWIB(r.dibuat_pada)} · <Users className="inline h-3 w-3" aria-hidden="true" /> {r.jumlah_dikerjakan} mengerjakan · <CheckCircle2 className="inline h-3 w-3 text-emerald-600" aria-hidden="true" /> {r.jumlah_selesai} selesai
                  </p>
                </div>
                <StatusBadge label={r.aktif ? "aktif" : "ditutup"} warna={r.aktif ? "hijau" : "netral"} />
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setBuka(terbuka ? null : r.id)} className="btn-tekan glass flex h-9 flex-1 items-center justify-center gap-1 rounded-xl text-[11.5px] font-bold text-teks-utama">
                  {terbuka ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                  Siapa yang mengerjakan ({r.kerja.length})
                </button>
                {r.aktif ? (
                  <button type="button" onClick={() => void tutup(r.id)} disabled={Boolean(sibuk)} className="btn-tekan h-9 rounded-xl bg-black/5 px-3 text-[11.5px] font-bold text-gagal disabled:opacity-50 dark:bg-white/10">
                    {sibuk === `tutup:${r.id}` ? "…" : "Tutup"}
                  </button>
                ) : null}
              </div>
              {terbuka ? (
                <div className="mt-2 flex flex-col gap-1">
                  {r.kerja.length === 0 ? <p className="text-[11px] text-teks-sekunder">Belum ada yang mengambil.</p> : null}
                  {r.kerja.map((k) => (
                    <div key={k.user_id} className={cn("flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11.5px]", k.status === "selesai" ? "bg-emerald-500/10" : "bg-amber-400/10")}>
                      <span className="font-semibold text-teks-utama">{k.nama}</span>
                      <span className="text-teks-sekunder">
                        {k.status === "selesai" ? "selesai" : "mengerjakan"} · {waktuJelasWIB(k.pada)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </GlassCard>
          );
        })
      )}
    </div>
  );
}
