"use client";

// ============================================================
// PencocokanSadarScreen (HR Center → Database Anggota, 14 Sep 2026).
//
// Mencocokkan akun SuperApp dengan pegawai SADAR TANPA mengubah email di
// kedua aplikasi. Bawaannya cocok lewat email; yang emailnya berbeda
// dipasangkan HR di sini (pemetaan manual — menang atas email). Setelah
// dipasang, absensi 60 hari orang itu langsung tercermin.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Link2, Loader2, Search, Unlink } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import {
  getPencocokanSadar,
  lepasPemetaanSadar,
  pasangkanSadar,
  type AnggotaPencocokan,
  type DataPencocokanSadar,
} from "@/services";
import { cn } from "@/lib/utils";

type Saring = "semua" | "belum" | "email" | "manual";

export function PencocokanSadarScreen({ onKembali }: { onKembali: () => void }) {
  const [data, setData] = useState<DataPencocokanSadar | null>(null);
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState<Saring>("belum");
  const [pilihan, setPilihan] = useState<Record<string, string>>({});
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getPencocokanSadar();
        if (hidup) setData(d);
      } catch (e) {
        if (!hidup) return;
        setData({ anggota: [], sadar_belum: [], ringkasan: { anggota: 0, cocok_email: 0, cocok_manual: 0, belum: 0, sadar_belum: 0, pegawai_sadar: 0 } });
        toast("error", "Gagal memuat pencocokan", e instanceof Error ? e.message : "");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  const tersaring = useMemo(() => {
    const kunci = cari.trim().toLowerCase();
    return (data?.anggota ?? []).filter(
      (a) =>
        (saring === "semua" || a.cara === saring) &&
        (!kunci ||
          a.nama.toLowerCase().includes(kunci) ||
          a.email.toLowerCase().includes(kunci) ||
          a.username.toLowerCase().includes(kunci) ||
          a.nama_sadar.toLowerCase().includes(kunci)),
    );
  }, [data, cari, saring]);

  // Saran otomatis: pegawai SADAR yang namanya paling mirip (kata pertama
  // sama) — HR tinggal memeriksa, bukan mencari dari nol.
  function saran(a: AnggotaPencocokan): string {
    const kata = a.nama.trim().toLowerCase().split(/\s+/)[0] ?? "";
    if (!kata || !data) return "";
    const cocok = data.sadar_belum.find((p) => p.nama.toLowerCase().split(/\s+/)[0] === kata);
    return cocok?.kode ?? "";
  }

  async function pasang(a: AnggotaPencocokan) {
    const kode = pilihan[a.id] || saran(a);
    if (!kode) {
      toast("peringatan", "Pilih pegawai SADAR dulu");
      return;
    }
    setSibuk(a.id);
    try {
      const h = await pasangkanSadar(a.id, kode);
      toast("sukses", "Dipasangkan", `${a.nama} ↔ ${h.nama_sadar} (${kode}). Absensi 60 hari langsung tercermin.`);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal memasangkan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
    }
  }

  async function lepas(a: AnggotaPencocokan) {
    setSibuk(a.id);
    try {
      await lepasPemetaanSadar(a.id);
      toast("sukses", "Pemetaan dilepas", "Pencocokan lewat email berlaku lagi untuk orang ini.");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal melepas", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
    }
  }

  const r = data?.ringkasan;

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <header className="flex items-center gap-3 pt-5">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-heading truncate text-xl font-extrabold tracking-tight text-teks-utama">
            Pencocokan SADAR
          </h1>
          <p className="text-xs text-teks-sekunder">
            {r ? `${r.cocok_email + r.cocok_manual}/${r.anggota} anggota cocok · ${r.sadar_belum} pegawai SADAR belum terpasang` : "Memuat…"}
          </p>
        </div>
      </header>

      <p className="mt-3 text-[11px] leading-snug text-teks-sekunder">
        Bawaannya akun dicocokkan lewat <b>email yang sama</b> di SuperApp dan SADAR. Yang emailnya
        berbeda, pasangkan di sini — tidak perlu mengubah email di mana pun.
      </p>

      {/* Ringkasan */}
      {r && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              ["email", "Cocok email", r.cocok_email, "text-sukses"],
              ["manual", "Cocok manual", r.cocok_manual, "text-pri"],
              ["belum", "Belum cocok", r.belum, "text-gagal"],
            ] as const
          ).map(([k, label, angka, warna]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSaring(k)}
              aria-pressed={saring === k}
              className={cn("glass btn-tekan rounded-2xl px-2 py-2.5 text-center", saring === k && "ring-2 ring-pri/50")}
            >
              <p className={cn("angka-tab text-lg font-extrabold", warna)}>{angka}</p>
              <p className="text-[10.5px] font-semibold text-teks-sekunder">{label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Cari */}
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-teks-sekunder" aria-hidden="true" />
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama / email / username…"
          aria-label="Cari anggota"
          className="glass h-11 w-full rounded-xl pr-3 pl-10 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />
        {saring !== "semua" && (
          <button
            type="button"
            onClick={() => setSaring("semua")}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-[11px] font-bold text-pri"
          >
            Tampilkan semua
          </button>
        )}
      </div>

      {/* Daftar anggota */}
      {data === null ? (
        <GlassSkeleton className="mt-3 h-40 rounded-2xl" />
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {tersaring.map((a) => {
            const kodeSaran = saran(a);
            const nilai = pilihan[a.id] ?? kodeSaran;
            return (
              <GlassCard key={a.id} className="p-2.5">
                <div className="flex items-center gap-2.5">
                  {a.avatar_url ? <FotoBulat src={a.avatar_url} ukuran={34} /> : <AvatarInisial nama={a.nama} ukuran={34} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-teks-utama">{a.nama}</p>
                    <p className="truncate text-[10.5px] text-teks-sekunder">{a.email || "tanpa email"}</p>
                    {a.cara !== "belum" && (
                      <p className="truncate text-[10.5px] text-teks-sekunder">
                        SADAR: <b className="font-semibold text-teks-utama">{a.nama_sadar || a.kode_sadar}</b> · {a.kode_sadar}
                        {a.cara === "email" ? "" : ` · ${a.email_sadar}`}
                      </p>
                    )}
                  </div>
                  <StatusBadge
                    label={a.cara === "email" ? "cocok" : a.cara === "manual" ? "manual" : "belum"}
                    warna={a.cara === "email" ? "hijau" : a.cara === "manual" ? "biru" : "merah"}
                  />
                </div>

                {a.cara === "belum" && (
                  <div className="mt-2 flex gap-2">
                    <select
                      value={nilai}
                      onChange={(e) => setPilihan((p) => ({ ...p, [a.id]: e.target.value }))}
                      aria-label={`Pegawai SADAR untuk ${a.nama}`}
                      className="glass-input h-9 min-w-0 flex-1 rounded-xl px-2.5 text-[12px] text-teks-utama outline-none"
                    >
                      <option value="">— pilih pegawai SADAR —</option>
                      {data.sadar_belum.map((p) => (
                        <option key={p.kode} value={p.kode}>
                          {p.nama} · {p.kode}{p.email ? ` · ${p.email}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void pasang(a)}
                      disabled={sibuk === a.id || !nilai}
                      className="btn-tekan flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-[11.5px] font-bold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                    >
                      {sibuk === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      Pasangkan
                    </button>
                  </div>
                )}
                {a.cara === "manual" && (
                  <button
                    type="button"
                    onClick={() => void lepas(a)}
                    disabled={sibuk === a.id}
                    className="btn-tekan mt-2 flex items-center gap-1 text-[11px] font-bold text-gagal disabled:opacity-50"
                  >
                    {sibuk === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                    Lepas pemetaan
                  </button>
                )}
              </GlassCard>
            );
          })}
          {tersaring.length === 0 && (
            <p className="py-8 text-center text-xs text-teks-sekunder">
              {saring === "belum" ? "Semua anggota sudah cocok dengan SADAR." : "Tidak ada anggota yang cocok dengan pencarian."}
            </p>
          )}
        </div>
      )}

      {/* Pegawai SADAR yang belum punya pasangan */}
      {data && data.sadar_belum.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-teks-sekunder">
            Pegawai SADAR belum terpasang ({data.sadar_belum.length})
          </p>
          <GlassCard className="p-3">
            <div className="flex flex-col gap-1">
              {data.sadar_belum.map((p) => (
                <p key={p.kode} className="truncate text-[11.5px] text-teks-utama">
                  <b className="font-semibold">{p.nama}</b>
                  <span className="text-teks-sekunder"> · {p.kode}{p.email ? ` · ${p.email}` : ""}</span>
                </p>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
