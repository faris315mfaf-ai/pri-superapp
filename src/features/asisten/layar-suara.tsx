"use client";

// ============================================================
// LayarSuara (fitur 1.20.1) — mode suara ala aplikasi Gemini:
// layar penuh dengan AVATAR ORB animasi yang bernapas saat
// mendengarkan dan bergelombang saat asisten berbicara, plus
// alur izin mikrofon yang menuntun (bukan gagal misterius):
//
// - izin "prompt"  → jelaskan dulu + tombol "Izinkan Mikrofon";
// - izin "denied"  → panduan mengaktifkan di setelan situs + Coba Lagi;
// - tak ada mik / dipakai aplikasi lain → pesan spesifik.
//
// Percakapan 2 arah realtime: bicara kapan saja — asisten berhenti
// sendiri saat disela (interrupt ditangani mesin suara).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, ShieldAlert, X } from "lucide-react";
import { toast } from "@/hooks/use-app-store";
import { mintaTokenSuara } from "@/services";
import { AsistenSuara, cekIzinMik, type StatusSuara } from "./suara-live";
import { cn } from "@/lib/utils";

const LABEL: Record<StatusSuara, string> = {
  siap: "Menyiapkan…",
  "meminta-mik": "Menunggu izin mikrofon…",
  menyambung: "Menyambung ke asisten…",
  mendengarkan: "Mendengarkan — silakan bicara",
  berbicara: "Asisten berbicara — sela kapan saja",
  berhenti: "Sesi berakhir",
  galat: "Terjadi gangguan",
};

type Izin = "memeriksa" | "granted" | "prompt" | "denied" | "unsupported";

export function LayarSuara({ onTutup }: { onTutup: () => void }) {
  const [izin, setIzin] = useState<Izin>("memeriksa");
  const [status, setStatus] = useState<StatusSuara>("siap");
  const [pesanGalat, setPesanGalat] = useState<string | null>(null);
  // Transkrip percakapan (fitur 1.20.3) — teks berjalan seperti Gemini.
  const [transkrip, setTranskrip] = useState<{ arah: "masuk" | "keluar"; teks: string }[]>([]);
  // Penanda gelembung yang sedang dibangun tiap arah (indeks di array).
  const aktifRef = useRef<{ masuk: number | null; keluar: number | null }>({
    masuk: null,
    keluar: null,
  });
  // Level audio untuk animasi orb — disimpan di ref dan dituang ke
  // CSS var langsung (tanpa setState per buffer ≈ 12x/detik).
  const orbRef = useRef<HTMLDivElement | null>(null);
  const ujungRef = useRef<HTMLDivElement | null>(null);
  const mesinRef = useRef<AsistenSuara | null>(null);
  const mulaiRef = useRef(false);

  // Gulir ke transkrip terbaru.
  useEffect(() => {
    ujungRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transkrip]);

  /** Akumulasi potongan transkrip ke gelembung yang tepat. */
  function tambahTranskrip(arah: "masuk" | "keluar", teks: string, selesai: boolean) {
    if (selesai) {
      // Akhir giliran asisten → semua gelembung ditutup.
      aktifRef.current = { masuk: null, keluar: null };
      return;
    }
    if (!teks) return;
    // Arah berganti = giliran lawan; tutup gelembung arah lain.
    const lawan = arah === "masuk" ? "keluar" : "masuk";
    aktifRef.current[lawan] = null;
    setTranskrip((lama) => {
      const idx = aktifRef.current[arah];
      if (idx !== null && lama[idx]?.arah === arah) {
        const salin = lama.slice();
        salin[idx] = { arah, teks: salin[idx].teks + teks };
        return salin;
      }
      aktifRef.current[arah] = lama.length;
      return [...lama, { arah, teks }];
    });
  }

  // Periksa keadaan izin dulu; kalau sudah granted langsung mulai.
  useEffect(() => {
    let hidup = true;
    void (async () => {
      const keadaan = await cekIzinMik();
      if (!hidup) return;
      setIzin(keadaan);
      if (keadaan === "granted") void mulai();
    })();
    return () => {
      hidup = false;
      mesinRef.current?.berhenti(false);
    };
  }, []);

  async function mulai() {
    if (mulaiRef.current) return;
    mulaiRef.current = true;
    setPesanGalat(null);
    try {
      const { token, model } = await mintaTokenSuara();
      const mesin = new AsistenSuara({
        onStatus: (s) => {
          setStatus(s);
          if (s === "meminta-mik") setIzin("prompt");
          if (s === "mendengarkan" || s === "berbicara") setIzin("granted");
        },
        onGalat: (p) => {
          setPesanGalat(p);
          // Ditolak saat prompt → tampilkan panduan setelan.
          if (p.includes("Izin mikrofon")) setIzin("denied");
          mulaiRef.current = false;
        },
        onTingkat: (arah, level) => {
          // Suara asisten menggerakkan orb lebih kuat daripada suara
          // pengguna — persis rasa "dia yang sedang bicara".
          const el = orbRef.current;
          if (!el) return;
          const kuat = arah === "keluar" ? level : level * 0.5;
          el.style.setProperty("--tingkat", String(1 + kuat * 0.35));
        },
        onTranskrip: tambahTranskrip,
      });
      mesinRef.current = mesin;
      await mesin.mulai(token, model);
    } catch (e) {
      mulaiRef.current = false;
      setPesanGalat(e instanceof Error ? e.message : "Gagal memulai mode suara.");
      setStatus("galat");
    }
  }

  function tutup() {
    mesinRef.current?.berhenti(false);
    onTutup();
  }

  const aktif = status === "mendengarkan" || status === "berbicara";
  const butuhIzin = izin === "prompt" && !aktif && status !== "menyambung";

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-between px-6 py-10"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, #1E1B4B 0%, #0F0D2A 55%, #060514 100%)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Mode suara Asisten AI"
    >
      {/* Tutup (pojok kanan atas) */}
      <div className="flex w-full max-w-[440px] items-center justify-between">
        <p className="font-heading text-sm font-bold text-white/90">Asisten PRI</p>
        <button
          type="button"
          onClick={tutup}
          aria-label="Tutup mode suara"
          className="btn-tekan flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ===== AVATAR ORB ala Gemini ===== */}
      <div className="flex flex-col items-center gap-6">
        <div
          ref={orbRef}
          className="relative flex h-52 w-52 items-center justify-center"
          style={{ ["--tingkat" as string]: 1 }}
        >
          {/* Cincin gelombang saat asisten berbicara */}
          {status === "berbicara" &&
            [0, 1, 2].map((i) => (
              <span
                key={i}
                className="orb-cincin absolute inset-0 rounded-full"
                style={{ animationDelay: `${i * 0.45}s` }}
                aria-hidden="true"
              />
            ))}
          {/* Cahaya lembut di belakang orb */}
          <span
            className="absolute inset-[-28px] rounded-full opacity-60 blur-2xl"
            style={{
              background:
                "conic-gradient(from 0deg, #8B5CF6, #3B82F6, #EC4899, #F59E0B, #8B5CF6)",
              animation: "orb-putar 9s linear infinite",
            }}
            aria-hidden="true"
          />
          {/* Orb utama: skala mengikuti level suara (CSS var --tingkat) */}
          <span
            className={cn(
              "relative block h-40 w-40 rounded-full transition-transform duration-150 ease-out",
              status === "menyambung" && "orb-denyut",
            )}
            style={{
              transform: "scale(var(--tingkat))",
              background:
                "radial-gradient(circle at 32% 28%, #C4B5FD 0%, #8B5CF6 34%, #4F46E5 68%, #312E81 100%)",
              boxShadow:
                "0 0 60px rgba(139, 92, 246, 0.55), inset -14px -18px 40px rgba(30, 27, 75, 0.55), inset 10px 12px 30px rgba(255, 255, 255, 0.25)",
            }}
            aria-hidden="true"
          />
        </div>

        <div className="text-center">
          <p className="font-heading text-lg font-bold text-white" aria-live="polite">
            {LABEL[status]}
          </p>
          {status === "mendengarkan" && transkrip.length === 0 && (
            <p className="mt-1 text-[12.5px] text-white/60">
              Contoh: “Berapa yang sudah absen hari ini?”
            </p>
          )}
        </div>

        {/* Transkrip percakapan berjalan (fitur 1.20.3) */}
        {transkrip.length > 0 && (
          <div className="scrollbar-tipis flex max-h-[26vh] w-full max-w-[440px] flex-col gap-2 overflow-y-auto px-1">
            {transkrip.map((t, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                  t.arah === "masuk"
                    ? "self-end rounded-br-md bg-white/15 text-white"
                    : "self-start rounded-bl-md bg-violet-500/25 text-white",
                )}
              >
                {t.teks}
              </div>
            ))}
            <div ref={ujungRef} />
          </div>
        )}
      </div>

      {/* ===== Panel bawah: izin / galat / tombol akhiri ===== */}
      <div className="w-full max-w-[440px]">
        {izin === "unsupported" && (
          <PanelPesan
            Ikon={MicOff}
            judul="Peramban tidak mendukung"
            isi="Perangkat/peramban ini tidak menyediakan akses mikrofon. Gunakan Chrome terbaru, atau pakai mode teks."
          />
        )}

        {izin === "denied" && (
          <PanelPesan
            Ikon={ShieldAlert}
            judul="Izin mikrofon diblokir"
            isi="Buka ikon gembok 🔒 di samping alamat situs → Izin → nyalakan Mikrofon, lalu tekan Coba Lagi. Di APK Android: Setelan → Aplikasi → PRI SuperApp → Izin → Mikrofon."
            aksi="Coba Lagi"
            onAksi={() => {
              mulaiRef.current = false;
              setIzin("memeriksa");
              void cekIzinMik().then((k) => {
                setIzin(k);
                if (k !== "denied") void mulai();
              });
            }}
          />
        )}

        {butuhIzin && (
          <PanelPesan
            Ikon={Mic}
            judul="Izinkan mikrofon untuk bicara"
            isi="Mode suara butuh mikrofon. Suaramu dikirim langsung ke asisten dan TIDAK direkam aplikasi. Setelah menekan tombol, pilih “Izinkan” pada prompt peramban."
            aksi="Izinkan Mikrofon"
            onAksi={() => void mulai()}
          />
        )}

        {pesanGalat && izin !== "denied" && (
          <p className="mb-3 rounded-xl bg-red-500/15 px-4 py-3 text-center text-[12.5px] leading-relaxed text-red-200">
            {pesanGalat}
          </p>
        )}

        {/* Tombol akhiri percakapan (gaya panggilan telepon) */}
        <button
          type="button"
          onClick={tutup}
          aria-label="Akhiri percakapan suara"
          className="btn-tekan mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white"
          style={{
            background: "linear-gradient(135deg, #EF4444, #B91C1C)",
            boxShadow: "0 10px 30px rgba(239, 68, 68, 0.4)",
          }}
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

function PanelPesan({
  Ikon,
  judul,
  isi,
  aksi,
  onAksi,
}: {
  Ikon: typeof Mic;
  judul: string;
  isi: string;
  aksi?: string;
  onAksi?: () => void;
}) {
  return (
    <div className="mb-4 rounded-2xl bg-white/[0.07] p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"
          aria-hidden="true"
        >
          <Ikon className="h-4.5 w-4.5" />
        </span>
        <p className="font-heading text-sm font-bold text-white">{judul}</p>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-white/70">{isi}</p>
      {aksi && onAksi && (
        <button
          type="button"
          onClick={onAksi}
          className="btn-tekan mt-3 h-11 w-full rounded-xl text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, #8B5CF6, #6D28D9)" }}
        >
          {aksi}
        </button>
      )}
    </div>
  );
}
