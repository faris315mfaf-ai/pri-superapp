"use client";

// ============================================================
// KontrolPerbaikan — master menyalakan/mematikan mode perbaikan,
// dengan perkiraan jam selesai opsional dan pesan kustom.
//
// Saat menyala: hanya master yang bisa masuk; semua orang lain
// melihat layar terkunci (LayarPerbaikan) berisi maskot + hitung
// mundur. Master bisa mematikan lebih cepat atau memperpanjang
// kapan saja.
// ============================================================

import { useEffect, useState } from "react";
import { Wrench, Clock } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { SectionTitle } from "@/components/pri-ui";
import { SwitchKaca } from "./switch-kaca";
import { toast } from "@/hooks/use-app-store";
import { getStatusPerbaikan, setModePerbaikan } from "@/services";

/** Pilihan durasi cepat (menit). Master boleh tanpa batas juga. */
const DURASI = [
  { label: "15 mnt", menit: 15 },
  { label: "30 mnt", menit: 30 },
  { label: "1 jam", menit: 60 },
  { label: "2 jam", menit: 120 },
];

export function KontrolPerbaikan() {
  const [aktif, setAktif] = useState(false);
  const [sampai, setSampai] = useState<string | null>(null);
  const [pesan, setPesan] = useState("");
  const [durasiMenit, setDurasiMenit] = useState<number | null>(30);
  const [sibuk, setSibuk] = useState(false);
  const [siap, setSiap] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const st = await getStatusPerbaikan();
      if (!hidup) return;
      setAktif(st.aktif);
      setSampai(st.sampai);
      setSiap(true);
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function nyalakan() {
    if (sibuk) return;
    setSibuk(true);
    try {
      const sampaiIso =
        durasiMenit !== null
          ? new Date(Date.now() + durasiMenit * 60_000).toISOString()
          : undefined;
      await setModePerbaikan({ aktif: true, sampai: sampaiIso, pesan: pesan.trim() });
      setAktif(true);
      setSampai(sampaiIso ?? null);
      toast("sukses", "Mode perbaikan MENYALA", "Hanya master yang bisa masuk sekarang.");
    } catch (e) {
      toast("error", "Gagal menyalakan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  async function matikan() {
    if (sibuk) return;
    setSibuk(true);
    try {
      await setModePerbaikan({ aktif: false });
      setAktif(false);
      setSampai(null);
      toast("sukses", "Mode perbaikan DIMATIKAN", "Aplikasi terbuka lagi untuk semua.");
    } catch (e) {
      toast("error", "Gagal mematikan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  const jamSelesai = sampai
    ? new Date(sampai).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <>
      <SectionTitle judul="Mode Perbaikan" className="mt-6" />
      <GlassCard className="p-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "#F59E0B1a", color: "#F59E0B" }}
            aria-hidden="true"
          >
            <Wrench className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-teks-utama">Aplikasi dalam perbaikan</p>
            <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
              {aktif
                ? jamSelesai
                  ? `Menyala — perkiraan selesai pukul ${jamSelesai} WIB.`
                  : "Menyala tanpa batas waktu."
                : "Hanya master yang bisa masuk saat menyala."}
            </p>
          </div>
          <SwitchKaca
            aktif={aktif}
            onUbah={() => void (aktif ? matikan() : nyalakan())}
            labelAria="Mode perbaikan aplikasi"
          />
        </div>

        {/* Pengaturan hanya relevan saat MEMBUAT (belum aktif) */}
        {siap && !aktif && (
          <div className="mt-3 border-t border-glass-border pt-3">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-teks-sekunder">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Perkiraan selesai
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DURASI.map((d) => (
                <button
                  key={d.menit}
                  type="button"
                  onClick={() => setDurasiMenit(d.menit)}
                  className={
                    "btn-tekan rounded-full px-3 py-1.5 text-[11.5px] font-semibold " +
                    (durasiMenit === d.menit
                      ? "text-white"
                      : "glass-soft text-teks-sekunder")
                  }
                  style={
                    durasiMenit === d.menit
                      ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                      : undefined
                  }
                >
                  {d.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDurasiMenit(null)}
                className={
                  "btn-tekan rounded-full px-3 py-1.5 text-[11.5px] font-semibold " +
                  (durasiMenit === null ? "text-white" : "glass-soft text-teks-sekunder")
                }
                style={
                  durasiMenit === null
                    ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                    : undefined
                }
              >
                Tanpa batas
              </button>
            </div>
            <input
              value={pesan}
              onChange={(e) => setPesan(e.target.value.slice(0, 200))}
              placeholder="Pesan untuk pengguna (opsional)…"
              aria-label="Pesan perbaikan"
              className="glass-input mt-2.5 h-10 w-full rounded-lg px-3 text-sm text-teks-utama outline-none"
            />
          </div>
        )}
      </GlassCard>
    </>
  );
}
