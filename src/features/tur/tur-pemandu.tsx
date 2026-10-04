"use client";

// ============================================================
// TurPemandu (3 Sep 2026) — tutorial interaktif "daftar akun media
// sosial → cek Kepatuhan Komen". Tampilan & mesinnya di LapisanTur
// (dipisah 5 Okt 2026 supaya tur TVR Saya memakai mesin yang sama).
//
// Aturan kemunculan (permintaan user, 3 Sep 2026):
//   • BELUM punya akun sosmed tertaut → muncul otomatis, dan MUNCUL LAGI
//     tiap 5 menit setelah ditutup/dilewati, sampai ada akun terdaftar.
//   • SUDAH punya akun → muncul SEKALI saja (penanda localStorage per
//     pengguna), setelah itu tidak lagi.
// Bisa dimulai manual kapan saja dari Profil → "Tutorial daftar akun".
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/hooks/use-app-store";
import { getAkunSosmed, getTurAktif } from "@/services";
import { keadaanTur, LANGKAH_TUR, PERISTIWA_TUR, tandaiTurSelesai, turSudahSelesai } from "@/lib/tur";
import { LapisanTur } from "./lapisan-tur";

/** Jeda sebelum pemeriksaan pertama setelah aplikasi aktif. */
const JEDA_AWAL_MS = 1800;
/** Belum punya akun: tagih lagi selang ini setelah tur ditutup/dilewati. */
const JEDA_ULANG_MS = 5 * 60_000;

export function TurPemandu() {
  const user = useAppStore((s) => s.user);
  const [aktif, setAktif] = useState(false);
  // Kunci ulang tur: mulai lagi = langkah pertama lagi.
  const [putaran, setPutaran] = useState(0);
  // true = pengguna belum punya akun tertaut (kartu memberi tahu tur akan
  // muncul lagi tiap 5 menit).
  const [belumPunyaAkun, setBelumPunyaAkun] = useState(false);
  const aktifRef = useRef(false);
  const jadwalUlangRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = user?.id ?? "";

  const mulai = useCallback(() => {
    aktifRef.current = true;
    setPutaran((n) => n + 1);
    setAktif(true);
  }, []);

  /**
   * Periksa akun tertaut lalu putuskan: belum punya → mulai (mode "ulang"
   * mengabaikan penanda pernah-lihat); sudah punya → mulai hanya bila belum
   * pernah lihat (mode "awal"). Gagal membaca = jangan ganggu pengguna.
   */
  const periksaLaluMulai = useCallback(
    async (mode: "awal" | "ulang") => {
      // Tur lain (mis. TVR Saya) sedang tampil: jangan menumpuk.
      if (!userId || aktifRef.current || keadaanTur.aktif) return;
      // Sakelar master (4 Sep 2026): tutorial otomatis bisa dimatikan untuk
      // semua pengguna; gagal membaca sakelar = anggap nyala seperti biasa.
      try {
        if (!(await getTurAktif())) return;
      } catch {
        // abaikan — tetap lanjut
      }
      let jumlah: number | null = null;
      try {
        jumlah = (await getAkunSosmed()).length;
      } catch {
        jumlah = null;
      }
      if (jumlah == null || aktifRef.current || keadaanTur.aktif) return;
      setBelumPunyaAkun(jumlah === 0);
      if (jumlah === 0) {
        mulai();
        return;
      }
      if (mode === "awal" && !turSudahSelesai(userId)) mulai();
    },
    [userId, mulai],
  );

  const akhiri = useCallback(
    (cara: "selesai" | "lewati") => {
      if (userId) tandaiTurSelesai(userId, cara);
      aktifRef.current = false;
      setAktif(false);
      // Belum punya akun? Tagih lagi 5 menit setelah ditutup. Pemeriksaan
      // ulang membaca jumlah akun saat itu, jadi begitu akun terdaftar
      // (lewat tur atau manual) tagihan berhenti sendiri.
      if (jadwalUlangRef.current) clearTimeout(jadwalUlangRef.current);
      jadwalUlangRef.current = setTimeout(() => void periksaLaluMulai("ulang"), JEDA_ULANG_MS);
    },
    [userId, periksaLaluMulai],
  );

  // Mulai dari peristiwa global (baris "Tutorial" di Profil).
  useEffect(() => {
    const dariLuar = () => {
      if (jadwalUlangRef.current) clearTimeout(jadwalUlangRef.current);
      getAkunSosmed()
        .then((d) => setBelumPunyaAkun(d.length === 0))
        .catch(() => setBelumPunyaAkun(false));
      mulai();
    };
    window.addEventListener(PERISTIWA_TUR, dariLuar);
    return () => window.removeEventListener(PERISTIWA_TUR, dariLuar);
  }, [mulai]);

  // Pemeriksaan pertama setelah aplikasi aktif.
  useEffect(() => {
    if (!userId) return;
    let hidup = true;
    const timer = setTimeout(() => {
      if (hidup) void periksaLaluMulai("awal");
    }, JEDA_AWAL_MS);
    return () => {
      hidup = false;
      clearTimeout(timer);
      if (jadwalUlangRef.current) clearTimeout(jadwalUlangRef.current);
    };
  }, [userId, periksaLaluMulai]);

  if (!aktif) return null;
  return (
    <LapisanTur
      key={putaran}
      id="akun"
      daftar={LANGKAH_TUR}
      catatan={belumPunyaAkun ? "Tutorial ini muncul lagi tiap 5 menit sampai akun media sosial Anda terdaftar." : undefined}
      judulSelesai="Tutorial selesai!"
      isiSelesai="Anda tahu cara mendaftarkan akun dan mengecek Kepatuhan Komen. Komentar dihitung hanya bila ditulis memakai akun terdaftar dalam jendela 19.00–18.59 WIB. Tutorial ini bisa dibuka lagi dari Profil → Profil & Keamanan."
      onAkhiri={akhiri}
    />
  );
}
