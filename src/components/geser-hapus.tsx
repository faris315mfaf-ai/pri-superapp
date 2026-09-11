"use client";

// ============================================================
// GeserHapus (11 Sep 2026) — bungkus kartu supaya bisa DIGESER KE KIRI
// untuk dibuang, ala daftar pesan di ponsel.
//
// Kenapa ditulis sendiri, bukan memakai `drag` dari framer-motion:
// di kartu pengumuman beranda, `drag="x"` TIDAK PERNAH aktif —
// onDragStart tidak sekali pun terpanggil, baik dengan tetikus maupun
// sentuhan jari (diuji 11 Sep 2026). Akibatnya pengumuman yang sudah
// digeser tetap menempel di layar. Dengan peristiwa pointer biasa,
// perilakunya bisa diuji dan tidak bergantung pada versi pustaka.
//
// Aturan mainnya:
// - Arah dikunci setelah 8 piksel pertama: mendatar = menggeser kartu,
//   menurun = membiarkan halaman bergulir seperti biasa.
// - Hanya ke KIRI. Menarik ke kanan tidak melakukan apa-apa.
// - Lepas setelah melewati ambang ATAU dilempar cepat = kartu dibuang.
// - Belum sampai ambang = kartu kembali ke tempatnya.
// ============================================================

import { useRef, useState, type PointerEvent as ReaksiPointer, type ReactNode } from "react";

/** Jarak geser yang sudah dianggap "mau dibuang" (piksel). */
const AMBANG_PX = 80;
/** Lemparan cepat tetap dihitung walau jaraknya pendek (piksel per milidetik). */
const AMBANG_LAJU = 0.5;
/** Setelah sejauh ini kartu jadi berat ditarik — ada rasa batasnya. */
const BATAS_KENYAL = 170;
/** Lama animasi keluar; sesudah ini baris benar-benar dibuang. */
const LAMA_KELUAR_MS = 200;

type Arah = "belum" | "mendatar" | "menurun";

export function GeserHapus({
  onHapus,
  children,
  nonaktif = false,
}: {
  onHapus: () => void;
  children: ReactNode;
  /** true = kartu tidak bisa digeser (mis. sedang mode atur tata letak). */
  nonaktif?: boolean;
}) {
  const [geser, setGeser] = useState(0);
  const [keluar, setKeluar] = useState(false);
  const [menarik, setMenarik] = useState(false);
  const awal = useRef<{ x: number; y: number; waktu: number; arah: Arah } | null>(null);

  function turun(e: ReaksiPointer<HTMLDivElement>) {
    // Tombol kanan tetikus tidak pernah menggeser apa pun.
    if (nonaktif || keluar || (e.pointerType === "mouse" && e.button !== 0)) return;
    awal.current = { x: e.clientX, y: e.clientY, waktu: Date.now(), arah: "belum" };
  }

  function gerak(e: ReaksiPointer<HTMLDivElement>) {
    const a = awal.current;
    if (!a || keluar) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (a.arah === "belum") {
      // Delapan piksel pertama menentukan ini gerakan apa. Sebelum yakin,
      // jangan rebut apa pun dari halaman — supaya menggulir tetap enak.
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      a.arah = Math.abs(dx) > Math.abs(dy) ? "mendatar" : "menurun";
      if (a.arah === "mendatar") {
        setMenarik(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Peramban lama tanpa pointer capture: geser tetap jalan.
        }
      }
    }
    if (a.arah !== "mendatar") return;
    if (dx >= 0) {
      setGeser(0);
      return;
    }
    const jauh = -dx;
    // Melewati batas kenyal, tarikannya makin berat (akar kuadrat).
    const tampak = jauh <= BATAS_KENYAL ? jauh : BATAS_KENYAL + Math.sqrt(jauh - BATAS_KENYAL) * 6;
    setGeser(-tampak);
  }

  function naik(e: ReaksiPointer<HTMLDivElement>) {
    const a = awal.current;
    awal.current = null;
    setMenarik(false);
    if (!a || a.arah !== "mendatar" || keluar) {
      setGeser(0);
      return;
    }
    const dx = e.clientX - a.x;
    const laju = Math.abs(dx) / Math.max(1, Date.now() - a.waktu);
    const dibuang = dx < -AMBANG_PX || (dx < -24 && laju > AMBANG_LAJU);
    if (!dibuang) {
      setGeser(0);
      return;
    }
    setKeluar(true);
    // Dibuang setelah animasinya selesai, bukan seketika — kalau langsung
    // dihapus, kartunya berkedip hilang tanpa arah yang jelas.
    setTimeout(onHapus, LAMA_KELUAR_MS);
  }

  return (
    <div
      onPointerDown={turun}
      onPointerMove={gerak}
      onPointerUp={naik}
      onPointerCancel={naik}
      style={{
        // pan-y: gulir menurun tetap milik halaman, mendatar milik kartu.
        touchAction: "pan-y",
        transform: keluar ? "translateX(-110%)" : `translateX(${geser}px)`,
        opacity: keluar ? 0 : 1,
        // Saat jari masih menempel, kartu mengikuti tanpa tertinggal.
        transition: menarik
          ? "none"
          : `transform ${LAMA_KELUAR_MS}ms cubic-bezier(0.23, 1, 0.32, 1), opacity ${LAMA_KELUAR_MS}ms ease-out`,
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}
