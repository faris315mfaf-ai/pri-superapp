"use client";

// ============================================================
// BarisWajah (fitur 1.22/3) — daftar/hapus WAJAH untuk absen & login.
//
// Aplikasi hanya menangkap foto lewat kamera depan langsung (bukan
// galeri), mengirimnya ke penyedia untuk di-enroll, dan menyimpan
// HANYA face_id-nya. Ketika penyedia belum diaktifkan pengurus,
// barisnya menjelaskan itu, bukan menghilang diam-diam.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Loader2, ScanFace, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-app-store";
import { daftarkanWajah, getStatusWajah, hapusWajah, type StatusWajah } from "@/services";

/** Baris kaca ala menu Keamanan: ikon bulat + label + keterangan + aksi kanan. */
function Baris({
  label,
  keterangan,
  kanan,
}: {
  label: string;
  keterangan: string;
  kanan: React.ReactNode;
}) {
  return (
    <div className="glass flex min-h-[54px] w-full items-center gap-3 rounded-2xl px-4 py-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
        style={{ backgroundColor: "#0EA5E91a", borderColor: "#0EA5E938", color: "#0EA5E9" }}
        aria-hidden="true"
      >
        <ScanFace className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-teks-utama">{label}</span>
        <span className="block text-[11px] leading-snug text-teks-sekunder">{keterangan}</span>
      </span>
      {kanan}
    </div>
  );
}

export function BarisWajah() {
  const [status, setStatus] = useState<StatusWajah | null>(null);
  const [kamera, setKamera] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  async function muat() {
    try {
      setStatus(await getStatusWajah());
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    // setTimeout(0) supaya setState tidak terjadi serentak di dalam efek
    // (aturan react-hooks/set-state-in-effect) — muat() memanggil setStatus.
    const id = setTimeout(() => void muat(), 0);
    return () => clearTimeout(id);
  }, []);

  // Sedang mengecek → jangan tampilkan apa pun dulu.
  if (status === null) return null;

  async function hapus() {
    if (sibuk) return;
    setSibuk(true);
    try {
      await hapusWajah();
      toast("sukses", "Data wajah dihapus");
      await muat();
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  async function selesaiFoto(images: string[]) {
    setKamera(false);
    setSibuk(true);
    try {
      await daftarkanWajah(images);
      toast("sukses", "Wajah terdaftar", "Kini absen & login bisa memakai wajah Anda.");
      await muat();
    } catch (e) {
      toast("error", "Gagal mendaftarkan wajah", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  // Belum diaktifkan penyedia: tampilkan info, tanpa aksi.
  if (!status.siap) {
    return (
      <Baris
        label="Verifikasi Wajah"
        keterangan="Belum diaktifkan pengurus (perlu penyedia wajah)."
        kanan={<span className="text-[11px] font-semibold text-teks-sekunder">Nonaktif</span>}
      />
    );
  }

  return (
    <>
      <Baris
        label="Verifikasi Wajah"
        keterangan={
          status.terdaftar
            ? "Wajah terdaftar — dipakai untuk absen & login."
            : "Daftarkan wajah untuk absen & login lebih aman."
        }
        kanan={
          <span className="flex items-center gap-2">
            {sibuk && <Loader2 className="h-3.5 w-3.5 animate-spin text-teks-sekunder" aria-hidden="true" />}
            {status.terdaftar ? (
              <button
                type="button"
                onClick={() => void hapus()}
                disabled={sibuk}
                aria-label="Hapus data wajah"
                className="btn-tekan flex items-center gap-1 rounded-lg border border-gagal/40 bg-gagal/5 px-2.5 py-1 text-[11px] font-semibold text-gagal disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Hapus
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setKamera(true)}
                disabled={sibuk}
                className="btn-tekan flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #0369A1)" }}
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                Daftarkan
              </button>
            )}
          </span>
        }
      />
      {status.terdaftar && (
        <button
          type="button"
          onClick={() => setKamera(true)}
          disabled={sibuk}
          className="btn-tekan -mt-1 ml-12 text-[11px] font-semibold text-pri disabled:opacity-60"
        >
          Ambil ulang foto wajah
        </button>
      )}

      <AnimatePresence>
        {kamera && (
          <KameraWajah jumlah={5} onSelesai={selesaiFoto} onTutup={() => setKamera(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ------------------------------------------------------------
// KameraWajah — ambil satu foto dari kamera DEPAN langsung.
// ------------------------------------------------------------

export function KameraWajah({
  jumlah = 1,
  onSelesai,
  onTutup,
}: {
  /** Berapa foto ditangkap sebelum selesai (5 untuk daftar, 1 untuk login) */
  jumlah?: number;
  onSelesai: (images: string[]) => void;
  onTutup: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [siap, setSiap] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [terkumpul, setTerkumpul] = useState<string[]>([]);
  const total = Math.max(1, jumlah);
  const nomor = terkumpul.length + 1; // foto yang sedang diambil

  useEffect(() => {
    let batal = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 960 } },
          audio: false,
        });
        if (batal) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setSiap(true);
      } catch {
        setGalat("Tidak bisa mengakses kamera. Izinkan kamera lalu coba lagi.");
      }
    })();
    return () => {
      batal = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function ambil() {
    const v = videoRef.current;
    if (!v || !siap) return;
    const sisi = Math.min(v.videoWidth, v.videoHeight) || 720;
    // 720px: cukup besar agar liveness (yang menuntut jarak antar-mata
    // memadai) tidak menolak dengan alasan "wajah terlalu kecil".
    const KELUAR = 720;
    const kanvas = document.createElement("canvas");
    kanvas.width = KELUAR;
    kanvas.height = KELUAR;
    const ctx = kanvas.getContext("2d");
    if (!ctx) return;
    // Potong tengah jadi bujur sangkar lalu skala ke ukuran keluar.
    const sx = (v.videoWidth - sisi) / 2;
    const sy = (v.videoHeight - sisi) / 2;
    ctx.drawImage(v, sx, sy, sisi, sisi, 0, 0, KELUAR, KELUAR);
    const dataUrl = kanvas.toDataURL("image/jpeg", 0.88);
    const kumpul = [...terkumpul, dataUrl];
    if (kumpul.length >= total) {
      // Matikan kamera lalu serahkan semua foto sekaligus.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onSelesai(kumpul);
    } else {
      setTerkumpul(kumpul);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/70 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Ambil foto wajah"
        className="glass-strong w-full max-w-[360px] rounded-2xl p-5"
        initial={{ scale: 0.92, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-base font-bold text-teks-utama">
            {total > 1 ? `Ambil ${total} Foto Wajah` : "Ambil Foto Wajah"}
          </h3>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="glass btn-tekan flex h-8 w-8 items-center justify-center rounded-full text-teks-utama"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-[11.5px] leading-relaxed text-teks-sekunder">
          {total > 1
            ? "Posisikan wajah di tengah, cahaya cukup, tanpa masker. Setiap foto, ubah sedikit sudut/ekspresi (hadap depan, sedikit ke kiri/kanan, senyum) agar makin mudah dikenali."
            : "Posisikan wajah di tengah, cahaya cukup, tanpa masker. Foto hanya dipakai untuk mengenali Anda — tidak disimpan sebagai gambar."}
        </p>

        {total > 1 && (
          <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i < terkumpul.length ? 22 : 10,
                  background: i < terkumpul.length ? "#0EA5E9" : "rgba(148,163,184,0.4)",
                }}
              />
            ))}
          </div>
        )}

        <div className="relative mx-auto mt-3 aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl bg-black/40">
          {galat ? (
            <div className="flex h-full w-full items-center justify-center p-4 text-center text-[12px] text-white/80">
              {galat}
            </div>
          ) : (
            <>
              {/* Cermin supaya terasa alami */}
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full -scale-x-100 object-cover"
              />
              <span className="pointer-events-none absolute inset-6 rounded-full border-2 border-white/60" />
            </>
          )}
        </div>

        <button
          type="button"
          onClick={ambil}
          disabled={!siap || Boolean(galat)}
          className="btn-tekan mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #0EA5E9, #0369A1)" }}
        >
          {siap ? <ShieldCheck className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
          {!siap
            ? "Menyalakan kamera…"
            : total > 1
              ? nomor >= total
                ? `Ambil Foto ${nomor} & Selesai`
                : `Ambil Foto ${nomor} dari ${total}`
              : "Ambil & Lanjut"}
        </button>
      </motion.div>
    </motion.div>
  );
}
