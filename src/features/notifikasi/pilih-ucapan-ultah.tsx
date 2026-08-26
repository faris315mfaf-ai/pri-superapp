"use client";

// ============================================================
// PilihUcapanUltah — muncul saat notifikasi ulang tahun diklik.
//
// Menampilkan siapa saja yang berulang tahun hari ini (bisa lebih dari
// satu). Pilih orangnya → kirim ucapan otomatis ke chat orang tersebut
// (template) → chat langsung terbuka. Menutup permintaan spek: notif
// ultah bisa diklik lalu memilih orang untuk dikirimi ucapan.
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PartyPopper, X, Send, Loader2 } from "lucide-react";
import { AvatarInisial } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import { getUltahHariIni, mulaiChat, type OrangUltah } from "@/services";

/** Template ucapan; nama panggilan disisipkan. */
function ucapan(nama: string): string {
  return `Selamat ulang tahun, ${nama}! 🎉🎂 Semoga sehat selalu, panjang umur, dan makin sukses. Terus semangat berjuang bersama PRI ya! 🙏`;
}

export function PilihUcapanUltah({
  onTutup,
  onBukaChat,
}: {
  onTutup: () => void;
  /** Dipanggil setelah ucapan terkirim, membawa kontak_id chat. */
  onBukaChat: (kontakId: string) => void;
}) {
  const [orang, setOrang] = useState<OrangUltah[] | null>(null);
  const [kirimId, setKirimId] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getUltahHariIni();
        if (hidup) setOrang(hasil);
      } catch {
        if (hidup) setOrang([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function kirimUcapan(o: OrangUltah) {
    if (kirimId) return;
    setKirimId(o.id);
    try {
      const kontakId = await mulaiChat(o.id, ucapan(o.nama_panggilan || o.nama));
      toast("sukses", "Ucapan terkirim 🎉", `Selamat ulang tahun untuk ${o.nama_panggilan || o.nama}.`);
      onBukaChat(kontakId);
    } catch (e) {
      toast("error", "Gagal mengirim ucapan", e instanceof Error ? e.message : "");
      setKirimId(null);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[90] flex flex-col justify-end"
        role="dialog"
        aria-modal="true"
        aria-label="Kirim ucapan ulang tahun"
      >
        <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
        <motion.div
          initial={{ y: "102%" }}
          animate={{ y: 0 }}
          exit={{ y: "102%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="glass-strong relative mx-auto w-full max-w-[440px] rounded-t-[2rem] px-5 pt-3 pb-8"
        >
          <div className="mb-3 flex justify-center">
            <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
          </div>

          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-emas" aria-hidden="true" />
            <h2 className="font-heading text-lg font-bold text-teks-utama">
              Ulang Tahun Hari Ini
            </h2>
            <button
              type="button"
              onClick={onTutup}
              aria-label="Tutup"
              className="glass btn-tekan ml-auto flex h-9 w-9 items-center justify-center rounded-full text-teks-utama"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-teks-sekunder">
            Pilih untuk mengirim ucapan otomatis lewat chat.
          </p>

          <div className="mt-4 flex flex-col gap-2">
            {orang === null ? (
              <p className="py-6 text-center text-sm text-teks-sekunder">Memuat…</p>
            ) : orang.length === 0 ? (
              <p className="py-6 text-center text-sm text-teks-sekunder">
                Tidak ada yang berulang tahun hari ini.
              </p>
            ) : (
              orang.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={kirimId !== null}
                  onClick={() => void kirimUcapan(o)}
                  className="glass-soft btn-tekan flex items-center gap-3 rounded-2xl p-3 text-left disabled:opacity-60"
                >
                  {o.avatar_url ? (
                    <FotoBulat src={o.avatar_url} ukuran={44} />
                  ) : (
                    <AvatarInisial nama={o.nama} ukuran={44} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-teks-utama">
                      {o.nama_panggilan || o.nama}
                    </p>
                    <p className="truncate text-[11px] text-teks-sekunder">{o.nama}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}>
                    {kirimId === o.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Ucapkan
                  </span>
                </button>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
