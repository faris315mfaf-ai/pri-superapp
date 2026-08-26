"use client";

// ============================================================
// LayarPerbaikan — layar terkunci penuh saat mode perbaikan menyala.
//
// MENGUNCI TOTAL: fixed inset-0 menutupi seluruh layar dan menghalangi
// gulir/sentuh apa pun di bawahnya. Ini menjawab bug lama — dulu
// layar perbaikan cuma menumpuk di atas aplikasi yang masih ter-render,
// sehingga masih bisa digulir dan disentuh.
//
// Menampilkan maskot Gembul yang sedih dan, bila master menyertakan
// perkiraan jam selesai, hitung mundur yang berakhir sendiri: begitu
// waktunya habis (atau server melaporkan perbaikan sudah selesai
// lewat polling), aplikasi dimuat ulang otomatis.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Maskot3D } from "@/components/maskot-3d";
import { getStatusPerbaikan } from "@/services";

/** 95000 ms → "1 menit 35 detik" (dua satuan teratas) */
function hitungMundur(msSisa: number): string {
  const total = Math.max(0, Math.floor(msSisa / 1000));
  const jam = Math.floor(total / 3600);
  const menit = Math.floor((total % 3600) / 60);
  const detik = total % 60;
  if (jam > 0) return `${jam} jam ${menit} menit`;
  if (menit > 0) return `${menit} menit ${detik} detik`;
  return `${detik} detik`;
}

export function LayarPerbaikan({
  sampai,
  pesan,
}: {
  sampai: string | null;
  pesan: string;
}) {
  // Waktu perangkat sekarang, diperbarui tiap detik untuk hitung mundur.
  const [sekarang, setSekarang] = useState(() => Date.now());
  const targetMs = sampai ? new Date(sampai).getTime() : null;

  // Kunci scroll body selama layar ini hidup — sabuk pengaman kedua
  // di samping fixed inset-0, kalau-kalau ada yang bisa lolos.
  useEffect(() => {
    const asli = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = asli;
    };
  }, []);

  // Detak hitung mundur.
  useEffect(() => {
    const id = setInterval(() => setSekarang(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Polling status: begitu server bilang perbaikan selesai (master
  // mematikan lebih cepat, atau perkiraan waktu lewat), muat ulang.
  const sudahMuatUlang = useRef(false);
  useEffect(() => {
    let hidup = true;
    async function cek() {
      const st = await getStatusPerbaikan();
      if (hidup && !st.aktif && !sudahMuatUlang.current) {
        sudahMuatUlang.current = true;
        window.location.reload();
      }
    }
    const id = setInterval(() => void cek(), 20_000);
    return () => {
      hidup = false;
      clearInterval(id);
    };
  }, []);

  // Waktu perkiraan lewat menurut jam perangkat → muat ulang segera
  // (tidak menunggu polling 20 detik berikutnya).
  useEffect(() => {
    if (targetMs && sekarang >= targetMs && !sudahMuatUlang.current) {
      sudahMuatUlang.current = true;
      window.location.reload();
    }
  }, [sekarang, targetMs]);

  const sisaMs = targetMs ? targetMs - sekarang : null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-app-bg px-8 text-center">
      <Maskot3D mood="sedih" tingkat="merah" tinggi={200} />

      <h1 className="font-heading mt-2 text-xl font-extrabold tracking-tight text-teks-utama">
        Sebentar ya, Gembul lagi benerin
      </h1>
      <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-teks-sekunder">
        {pesan ||
          "Aplikasi sedang ditingkatkan oleh pengelola. Data Anda aman — mohon tunggu sebentar."}
      </p>

      {sisaMs !== null && sisaMs > 0 && (
        <div className="glass mt-5 rounded-2xl px-5 py-3">
          <p className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
            Perkiraan selesai dalam
          </p>
          <p className="angka-tab mt-1 font-heading text-2xl font-extrabold text-pri">
            {hitungMundur(sisaMs)}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="btn-tekan mt-6 rounded-xl px-6 py-3 text-sm font-bold text-white"
        style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
      >
        Coba Lagi
      </button>
    </div>
  );
}
